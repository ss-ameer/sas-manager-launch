import { Product, Salesperson, Workspace, DropdownOption, AuditLog } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { safeGetDocs, safeSetDoc } from '../../firebase';
import { where } from 'firebase/firestore';
import {
  hasInlineBase64Payload,
  sanitizeFirestorePayload,
  rehydrateDocumentBlobsSync
} from '../attachmentStorage';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class MetadataRepository {
  private static PRODUCT_STORE = 'products';
  private static PRODUCT_LS_KEY = 'omni_products';
  private static productsCache = new Map<string, { data: Product[]; fetchedAt: number }>();

  private static normalizeProduct(raw: any): Product {
    return rehydrateDocumentBlobsSync(raw) as Product;
  }

  private static syncProductsToLocalStorage(products: Product[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const serialized = JSON.stringify(products);
        if (serialized.length <= 200_000) {
          window.localStorage.setItem(this.PRODUCT_LS_KEY, serialized);
        } else {
          window.localStorage.removeItem(this.PRODUCT_LS_KEY);
        }
      }
    } catch (_) {}
  }

  public static async syncProductListToStores(products: Product[]): Promise<void> {
    const cleanDocs = (products || []).map((p) => this.normalizeProduct(p));
    await saveToLocalStore(this.PRODUCT_STORE, cleanDocs);
    this.syncProductsToLocalStorage(cleanDocs);
    this.productsCache.set('__all__', { data: cleanDocs, fetchedAt: Date.now() });
    const byWs = new Map<string, Product[]>();
    for (const p of cleanDocs) {
      const ws = (p as any).workspace_id || (p as any).workspaceId;
      if (ws) {
        if (!byWs.has(ws)) byWs.set(ws, []);
        byWs.get(ws)!.push(p);
      }
    }
    byWs.forEach((list, ws) => {
      this.productsCache.set(ws, { data: list, fetchedAt: Date.now() });
    });
  }

  // Static Metadata - fetched once on boot, cached in memory (24h TTL) + IndexedDB
  public static async fetchProductsOnce(workspaceId?: string, force = false): Promise<Product[]> {
    const cacheKey = workspaceId || '__all__';
    if (!force) {
      const cached = this.productsCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS && cached.data.length > 0) {
        return [...cached.data];
      }

      // Check IndexedDB cache before hitting Firestore
      try {
        const local = await getFromLocalStore<Product>(this.PRODUCT_STORE);
        if (local && local.length > 0) {
          const normalizedLocal = local.map((p) => this.normalizeProduct(p));
          const filtered = workspaceId
            ? normalizedLocal.filter(
                (p: any) => !p.workspace_id || p.workspace_id === workspaceId || p.workspaceId === workspaceId
              )
            : normalizedLocal;
          if (filtered.length > 0) {
            this.productsCache.set(cacheKey, { data: filtered, fetchedAt: Date.now() });
            return filtered;
          }
        }
      } catch (_) {}
    }

    try {
      const snap = workspaceId
        ? await safeGetDocs('products', where('workspace_id', '==', workspaceId))
        : await safeGetDocs('products');
      if (!snap || snap.empty) {
        const local = await getFromLocalStore<Product>(this.PRODUCT_STORE);
        if (local && local.length > 0) return local.map((p) => this.normalizeProduct(p));
        try {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(this.PRODUCT_LS_KEY) : null;
          return raw ? JSON.parse(raw) : [];
        } catch (_) {
          return [];
        }
      }

      const compactionFlagKey = 'sas_enterprise_4kib_compacted_products_v1';
      const hasCompacted =
        typeof window !== 'undefined' &&
        window.localStorage?.getItem(compactionFlagKey) === 'true';
      const oversizedProductsToCompact: Array<{ id: string; rawData: any }> = [];

      const docs = snap.docs.map((d) => {
        const rawData = d.data();
        if (!hasCompacted && rawData && !rawData.is_deleted && hasInlineBase64Payload(rawData)) {
          oversizedProductsToCompact.push({ id: d.id, rawData });
        }
        return this.normalizeProduct({ id: d.id, ...rawData });
      });

      if (!hasCompacted && typeof window !== 'undefined') {
        try {
          window.localStorage?.setItem(compactionFlagKey, 'true');
        } catch (_) {}
        if (oversizedProductsToCompact.length > 0) {
          let compIdx = 0;
          const scheduleNext = () => {
            if (compIdx >= oversizedProductsToCompact.length) return;
            const { id: docId, rawData } = oversizedProductsToCompact[compIdx++];
            try {
              const compacted = sanitizeFirestorePayload({ ...rawData, id: docId });
              safeSetDoc('products', docId, compacted).catch(() => {});
            } catch (_) {}
            setTimeout(scheduleNext, 500);
          };
          setTimeout(scheduleNext, 500);
        }
      }

      await this.syncProductListToStores(docs);
      this.productsCache.set(cacheKey, { data: docs, fetchedAt: Date.now() });
      return docs;
    } catch (e) {
      const local = await getFromLocalStore<Product>(this.PRODUCT_STORE);
      if (local && local.length > 0) return local.map((p) => this.normalizeProduct(p));
      try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(this.PRODUCT_LS_KEY) : null;
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    }
  }

  public static async saveProduct(product: Product): Promise<void> {
    const sanitizedForCloud = sanitizeFirestorePayload(product);
    const hydratedProduct = this.normalizeProduct(sanitizedForCloud);
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const idx = current.findIndex((p) => p.id === hydratedProduct.id);
    let updated: Product[];
    if (idx >= 0) {
      updated = [...current];
      updated[idx] = hydratedProduct;
    } else {
      updated = [hydratedProduct, ...current];
    }
    await this.syncProductListToStores(updated);
    if (hydratedProduct.id) {
      await syncEngine.enqueue('products', 'set', hydratedProduct.id, sanitizedForCloud);
    }
  }

  public static async softDeleteProduct(id: string, user?: { uid: string; name: string }): Promise<void> {
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const idx = current.findIndex((p) => p.id === id);
    if (idx === -1) return;

    const updated: Product = {
      ...current[idx],
      is_deleted: true,
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_uid: user?.uid,
      deleted_by_name: user?.name
    };

    await this.saveProduct(updated);
  }

  public static async restoreProduct(id: string): Promise<void> {
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const idx = current.findIndex((p) => p.id === id);
    if (idx === -1) return;

    const restored: Product = {
      ...current[idx],
      is_deleted: false,
      deleted: false,
      deleted_at: undefined,
      deleted_by_uid: undefined,
      deleted_by_name: undefined
    };

    await this.saveProduct(restored);
  }

  public static async purgeProductPermanent(id: string): Promise<void> {
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const updated = current.filter((p) => p.id !== id);
    await this.syncProductListToStores(updated);
    await syncEngine.enqueue('products', 'delete', id);
  }

  public static async deleteProduct(id: string, user?: { uid: string; name: string }): Promise<void> {
    return this.softDeleteProduct(id, user);
  }

  // Audit Logs - Write-only + On-Demand Query (Zero Real-Time Sockets)
  public static async fetchAuditLogsOnce(workspaceId?: string): Promise<AuditLog[]> {
    try {
      const snap = workspaceId
        ? await safeGetDocs('audit_logs', where('workspace_id', '==', workspaceId))
        : await safeGetDocs('audit_logs');
      if (!snap || snap.empty) return [];
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog));
    } catch (e) {
      return [];
    }
  }

  public static async saveAuditLog(log: AuditLog): Promise<void> {
    await syncEngine.enqueue('audit_logs', 'set', log.id, log);
  }

  // Generic Dropdown & System Config Operations
  public static async saveDropdownCollection(collectionName: string, items: DropdownOption[]): Promise<void> {
    for (const item of items) {
      await syncEngine.enqueue(collectionName, 'set', item.id, item);
    }
  }
}
