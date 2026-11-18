import { Product, Salesperson, Workspace, DropdownOption, AuditLog } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { safeGetDocs, safeSetDoc } from '../../firebase';
import { where } from 'firebase/firestore';
import {
  hasInlineBase64Payload,
  sanitizeFirestorePayload,
  rehydrateDocumentBlobsSync,
  rehydrateDocumentBlobsFromLocal
} from '../attachmentStorage';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class MetadataRepository {
  private static PRODUCT_STORE = 'products';
  private static PRODUCT_LS_KEY = 'omni_products';
  private static productsCache = new Map<string, { data: Product[]; fetchedAt: number }>();

  private static normalizeProduct(raw: any): Product {
    return rehydrateDocumentBlobsSync(raw) as Product;
  }

  private static filterProductsForWorkspace(list: Product[], workspaceId?: string): Product[] {
    if (!workspaceId) return list;
    return list.filter(
      (p: any) => !p.workspace_id || p.workspace_id === workspaceId || p.workspaceId === workspaceId
    );
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

  private static async loadExistingFullProductList(): Promise<Product[]> {
    const cachedAll = this.productsCache.get('__all__');
    if (cachedAll && Array.isArray(cachedAll.data) && cachedAll.data.length > 0) {
      return cachedAll.data;
    }
    try {
      const local = await getFromLocalStore<Product>(this.PRODUCT_STORE);
      if (local && local.length > 0) {
        return local.map((p) => this.normalizeProduct(p));
      }
    } catch (_) {}
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage?.getItem(this.PRODUCT_LS_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((p) => this.normalizeProduct(p));
      }
    } catch (_) {}
    return [];
  }

  private static rebuildCachesFromFullList(fullList: Product[]): void {
    const now = Date.now();
    this.productsCache.set('__all__', { data: fullList, fetchedAt: now });
    const wsIds = new Set<string>();
    for (const p of fullList) {
      const ws = (p as any).workspace_id || (p as any).workspaceId;
      if (ws) wsIds.add(ws);
    }
    wsIds.forEach((ws) => {
      this.productsCache.set(ws, {
        data: this.filterProductsForWorkspace(fullList, ws),
        fetchedAt: now
      });
    });
  }

  public static invalidateCache(workspaceId?: string): void {
    if (workspaceId) {
      this.productsCache.delete(workspaceId);
      this.productsCache.delete('__all__');
    } else {
      this.productsCache.clear();
    }
  }

  public static InvalidateCache(workspaceId?: string): void {
    this.invalidateCache(workspaceId);
  }

  public static async syncProductListToStores(
    products: Product[],
    replaceWorkspaceId?: string,
    replaceAll = false
  ): Promise<Product[]> {
    const incomingDocs = (products || []).map((p) => this.normalizeProduct(p));
    let mergedAll: Product[];

    if (replaceAll) {
      mergedAll = incomingDocs;
    } else {
      const existingAll = await this.loadExistingFullProductList();
      const targetReplaceWs = replaceWorkspaceId?.trim();
      const incomingIds = new Set(incomingDocs.map((ip) => ip?.id).filter(Boolean));
      const mapById = new Map<string, Product>();
      for (const ep of existingAll) {
        if (!ep?.id) continue;
        if (targetReplaceWs) {
          const epWs = (ep as any).workspace_id || (ep as any).workspaceId;
          // Prune records belonging to the refreshed workspace that are no longer in Firestore
          if (epWs === targetReplaceWs && !incomingIds.has(ep.id)) {
            continue;
          }
        }
        mapById.set(ep.id, ep);
      }
      for (const ip of incomingDocs) {
        if (ip?.id) {
          const prev = mapById.get(ip.id);
          mapById.set(ip.id, prev ? { ...prev, ...ip } : ip);
        }
      }
      mergedAll = Array.from(mapById.values());
    }

    await saveToLocalStore(this.PRODUCT_STORE, mergedAll);
    this.syncProductsToLocalStorage(mergedAll);
    this.rebuildCachesFromFullList(mergedAll);
    if (replaceWorkspaceId) {
      this.productsCache.set(replaceWorkspaceId, {
        data: this.filterProductsForWorkspace(mergedAll, replaceWorkspaceId),
        fetchedAt: Date.now()
      });
    }
    return mergedAll;
  }

  public static async upsertLocalProduct(
    productOrPatch: Partial<Product> & { id?: string }
  ): Promise<Product | null> {
    if (!productOrPatch?.id) return null;
    const existingAll = await this.loadExistingFullProductList();
    const existing = existingAll.find((p) => p.id === productOrPatch.id);
    const merged: Product = this.normalizeProduct({
      ...(existing || {}),
      ...productOrPatch
    });
    await this.syncProductListToStores([merged]);
    return merged;
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
          const normalizedLocal = await Promise.all(
            local.map((p) => rehydrateDocumentBlobsFromLocal(this.normalizeProduct(p)))
          );
          this.rebuildCachesFromFullList(normalizedLocal);
          const filtered = this.filterProductsForWorkspace(normalizedLocal, workspaceId);
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
      if (!snap || (!workspaceId && snap.empty)) {
        const existingAll = await this.loadExistingFullProductList();
        return this.filterProductsForWorkspace(existingAll, workspaceId);
      }

      const compactionFlagKey = `sas_enterprise_4kib_compacted_products_v1_${workspaceId || 'all'}`;
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

      // Rehydrate any IndexedDB-backed product blobs before persisting to cache and returning
      const rehydratedDocs = await Promise.all(
        docs.map((p) => rehydrateDocumentBlobsFromLocal(p))
      );

      const mergedAll = await this.syncProductListToStores(rehydratedDocs, workspaceId, !workspaceId);
      const result = this.filterProductsForWorkspace(mergedAll, workspaceId);
      this.productsCache.set(cacheKey, { data: result, fetchedAt: Date.now() });
      return result;
    } catch (e) {
      const existingAll = await this.loadExistingFullProductList();
      return this.filterProductsForWorkspace(existingAll, workspaceId);
    }
  }

  public static async saveProduct(product: Product): Promise<void> {
    const sanitizedForCloud = sanitizeFirestorePayload(product);
    const hydratedProduct = this.normalizeProduct({
      ...product,
      ...sanitizedForCloud,
      image_url: product.image_url || sanitizedForCloud.image_url,
      secondary_image_url: product.secondary_image_url || sanitizedForCloud.secondary_image_url,
      datasheet_attachment: product.datasheet_attachment || sanitizedForCloud.datasheet_attachment,
      datasheet_url: (product as any).datasheet_url || (sanitizedForCloud as any).datasheet_url,
      sub_components: product.sub_components || sanitizedForCloud.sub_components,
      spec_variants: product.spec_variants || sanitizedForCloud.spec_variants,
      variants: (product as any).variants || (sanitizedForCloud as any).variants
    });
    await this.syncProductListToStores([hydratedProduct]);
    if (hydratedProduct.id) {
      await syncEngine.enqueue('products', 'set', hydratedProduct.id, sanitizedForCloud);
    }
  }

  public static async softDeleteProduct(id: string, user?: { uid: string; name: string }): Promise<void> {
    const current = await this.loadExistingFullProductList();
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
    const current = await this.loadExistingFullProductList();
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
    const current = await this.loadExistingFullProductList();
    const updated = current.filter((p) => p.id !== id);
    await this.syncProductListToStores(updated, undefined, true);
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
