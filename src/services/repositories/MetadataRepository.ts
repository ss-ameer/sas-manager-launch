import { Product, Salesperson, Workspace, DropdownOption, AuditLog } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { safeGetDocs } from '../../firebase';
import { where } from 'firebase/firestore';

export class MetadataRepository {
  private static PRODUCT_STORE = 'products';
  private static PRODUCT_LS_KEY = 'omni_products';

  private static syncProductsToLocalStorage(products: Product[]): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(this.PRODUCT_LS_KEY, JSON.stringify(products));
      }
    } catch (_) {}
  }

  public static async syncProductListToStores(products: Product[]): Promise<void> {
    await saveToLocalStore(this.PRODUCT_STORE, products);
    this.syncProductsToLocalStorage(products);
  }

  // Static Metadata - fetched once on boot, cached in IndexedDB + localStorage
  public static async fetchProductsOnce(workspaceId?: string): Promise<Product[]> {
    try {
      const snap = workspaceId
        ? await safeGetDocs('products', where('workspace_id', '==', workspaceId))
        : await safeGetDocs('products');
      if (!snap || snap.empty) {
        const local = await getFromLocalStore<Product>(this.PRODUCT_STORE);
        if (local && local.length > 0) return local;
        try {
          const raw = typeof window !== 'undefined' ? window.localStorage.getItem(this.PRODUCT_LS_KEY) : null;
          return raw ? JSON.parse(raw) : [];
        } catch (_) {
          return [];
        }
      }
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      await this.syncProductListToStores(docs);
      return docs;
    } catch (e) {
      const local = await getFromLocalStore<Product>(this.PRODUCT_STORE);
      if (local && local.length > 0) return local;
      try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(this.PRODUCT_LS_KEY) : null;
        return raw ? JSON.parse(raw) : [];
      } catch (_) {
        return [];
      }
    }
  }

  public static async saveProduct(product: Product): Promise<void> {
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const idx = current.findIndex((p) => p.id === product.id);
    let updated: Product[];
    if (idx >= 0) {
      updated = [...current];
      updated[idx] = product;
    } else {
      updated = [product, ...current];
    }
    await this.syncProductListToStores(updated);
    if (product.id) {
      await syncEngine.enqueue('products', 'set', product.id, product);
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
