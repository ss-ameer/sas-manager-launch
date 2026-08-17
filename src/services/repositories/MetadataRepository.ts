import { Product, Salesperson, Workspace, DropdownOption, AuditLog } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { safeGetDocs } from '../../firebase';

export class MetadataRepository {
  private static PRODUCT_STORE = 'products';

  // Static Metadata - fetched once on boot, cached in IndexedDB
  public static async fetchProductsOnce(): Promise<Product[]> {
    try {
      const snap = await safeGetDocs('products');
      if (!snap || snap.empty) return getFromLocalStore<Product>(this.PRODUCT_STORE);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
      await saveToLocalStore(this.PRODUCT_STORE, docs);
      return docs;
    } catch (e) {
      return getFromLocalStore<Product>(this.PRODUCT_STORE);
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
    await saveToLocalStore(this.PRODUCT_STORE, updated);
    await syncEngine.enqueue('products', 'set', product.id, product);
  }

  public static async softDeleteProduct(id: string, user?: { uid: string; name: string }): Promise<void> {
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const idx = current.findIndex((p) => p.id === id);
    if (idx === -1) return;

    const updated: Product = {
      ...current[idx],
      is_deleted: true,
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
      deleted_at: undefined,
      deleted_by_uid: undefined,
      deleted_by_name: undefined
    };

    await this.saveProduct(restored);
  }

  public static async purgeProductPermanent(id: string): Promise<void> {
    const current = await getFromLocalStore<Product>(this.PRODUCT_STORE);
    const updated = current.filter((p) => p.id !== id);
    await saveToLocalStore(this.PRODUCT_STORE, updated);
    await syncEngine.enqueue('products', 'delete', id);
  }

  public static async deleteProduct(id: string, user?: { uid: string; name: string }): Promise<void> {
    return this.softDeleteProduct(id, user);
  }

  // Audit Logs - Write-only + On-Demand Query (Zero Real-Time Sockets)
  public static async fetchAuditLogsOnce(): Promise<AuditLog[]> {
    try {
      const snap = await safeGetDocs('audit_logs');
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
