import { safeAddDoc, safeUpdateDoc, safeDeleteDoc, safeSetDoc, safeGetDocs } from '../firebase';
import { where } from 'firebase/firestore';
import { enqueueLocalMutation, getPendingMutations, removeLocalMutation, MutationItem } from './db';

type SyncListener = (status: {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
  error: string | null;
}) => void;

class SyncEngine {
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSyncing: boolean = false;
  private lastSyncedAt: Date | null = null;
  private lastError: string | null = null;
  private listeners: Set<SyncListener> = new Set();
  private timer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        this.notify();
        this.processQueue();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
        this.notify();
      });

      // Periodic queue check every 5 seconds
      this.timer = setInterval(() => {
        if (this.isOnline && !this.isSyncing) {
          this.processQueue();
        }
      }, 5000);
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    // Initial emission
    this.getPendingCount().then((pendingCount) => {
      listener({
        isOnline: this.isOnline,
        isSyncing: this.isSyncing,
        pendingCount,
        lastSyncedAt: this.lastSyncedAt,
        error: this.lastError
      });
    });

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify() {
    const pendingCount = await this.getPendingCount();
    const state = {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError
    };

    this.listeners.forEach((listener) => listener(state));
  }

  public async getPendingCount(): Promise<number> {
    const mutations = await getPendingMutations();
    return mutations.length;
  }

  /**
   * Enqueue a mutation for optimistic execution
   */
  public async enqueue(entity: string, action: 'create' | 'update' | 'delete' | 'set', docId: string, payload?: any): Promise<void> {
    const mutation: MutationItem = {
      id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      entity,
      action,
      docId,
      payload: payload ? JSON.parse(JSON.stringify(payload)) : undefined,
      timestamp: Date.now(),
      retryCount: 0
    };

    await enqueueLocalMutation(mutation);
    this.notify();

    // Trigger immediate background sync attempt if online
    if (this.isOnline && !this.isSyncing) {
      this.processQueue();
    }
  }

  /**
   * Background process queue worker
   */
  public async processQueue(): Promise<void> {
    if (!this.isOnline || this.isSyncing) return;

    const queue = await getPendingMutations();
    if (queue.length === 0) return;

    this.isSyncing = true;
    this.notify();

    try {
      // Process items sequentially to guarantee order per entity
      for (const item of queue) {
        if (!this.isOnline) break;

        try {
          if (item.action === 'create' || item.action === 'set') {
            await safeSetDoc(item.entity, item.docId, item.payload);
          } else if (item.action === 'update') {
            await safeUpdateDoc(item.entity, item.docId, item.payload);
          } else if (item.action === 'delete') {
            await safeDeleteDoc(item.entity, item.docId);
          }

          // Successfully synchronized to Firestore
          await removeLocalMutation(item.id);
          this.lastSyncedAt = new Date();
          this.lastError = null;
        } catch (err: any) {
          console.warn(`[SyncEngine] Failed to sync item ${item.id} (${item.entity}:${item.action}):`, err);
          
          item.retryCount += 1;
          this.lastError = err?.message || 'Sync error occurred';

          // If item fails repeatedly with non-retryable error, drop or pause
          if (item.retryCount > 10) {
            console.error(`[SyncEngine] Dropping un-syncable mutation ${item.id} after 10 attempts.`);
            await removeLocalMutation(item.id);
          }
          break; // Stop loop and retry in next cycle
        }
      }
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }
}

export const syncEngine = new SyncEngine();

/**
 * Fetch and compile full JSON export data for a workspace, including call_logs
 */
export async function exportWorkspaceData(wsId: string, wsName?: string): Promise<any> {
  const collections = ['companies', 'contacts', 'enquiries', 'call_logs', 'products', 'salespersons'];
  const recordsMap: Record<string, any[]> = {};
  const counts: Record<string, number> = {};

  for (const col of collections) {
    const docMap = new Map<string, any>();
    const snap1 = await safeGetDocs(col, where('workspace_id', '==', wsId));
    const snap2 = await safeGetDocs(col, where('workspaceId', '==', wsId));

    if (snap1 && !snap1.empty) {
      for (const docSnap of snap1.docs) {
        docMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      }
    }
    if (snap2 && !snap2.empty) {
      for (const docSnap of snap2.docs) {
        if (!docMap.has(docSnap.id)) {
          docMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
        }
      }
    }

    const items = Array.from(docMap.values());
    recordsMap[col] = items;
    counts[col] = items.length;
  }

  return {
    workspace_id: wsId,
    workspace_name: wsName || wsId,
    exported_at: new Date().toISOString(),
    data: recordsMap,
    counts
  };
}

/**
 * Import workspace data from a JSON object and write all records (including call_logs) to Firestore under targetWsId
 */
export async function importWorkspaceData(
  targetWsId: string,
  jsonPayload: any,
  mode: 'merge' | 'replace' = 'merge',
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; importedCounts: Record<string, number> }> {
  const importedCounts: Record<string, number> = {
    companies: 0,
    contacts: 0,
    enquiries: 0,
    call_logs: 0,
    products: 0,
    salespersons: 0
  };

  const collections = [
    { key: 'companies', altKey: 'companies', colName: 'companies' },
    { key: 'contacts', altKey: 'contacts', colName: 'contacts' },
    { key: 'enquiries', altKey: 'enquiries', colName: 'enquiries' },
    { key: 'call_logs', altKey: 'callLogs', colName: 'call_logs' },
    { key: 'products', altKey: 'products', colName: 'products' },
    { key: 'salespersons', altKey: 'salespersons', colName: 'salespersons' }
  ];

  // If replace mode is requested, wipe all existing workspace records first
  if (mode === 'replace') {
    onProgress?.('Wiping existing workspace records...');
    for (const col of collections) {
      const docIdsToDelete = new Set<string>();
      const snap1 = await safeGetDocs(col.colName, where('workspace_id', '==', targetWsId));
      const snap2 = await safeGetDocs(col.colName, where('workspaceId', '==', targetWsId));

      if (snap1 && !snap1.empty) {
        for (const docSnap of snap1.docs) {
          docIdsToDelete.add(docSnap.id);
        }
      }
      if (snap2 && !snap2.empty) {
        for (const docSnap of snap2.docs) {
          docIdsToDelete.add(docSnap.id);
        }
      }

      for (const id of docIdsToDelete) {
        await safeDeleteDoc(col.colName, id);
      }
    }
  }

  const dataMap = jsonPayload.data || jsonPayload;

  // Calculate total records to restore
  let totalRecords = 0;
  for (const col of collections) {
    const rawItems = dataMap[col.key] || dataMap[col.altKey] || [];
    if (Array.isArray(rawItems)) {
      totalRecords += rawItems.length;
    }
  }

  onProgress?.(`Restoring ${totalRecords} records...`);

  for (const col of collections) {
    const rawItems = dataMap[col.key] || dataMap[col.altKey] || [];
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      for (const rawItem of rawItems) {
        const itemToSave = {
          ...rawItem,
          workspace_id: targetWsId,
          workspaceId: targetWsId
        };
        if (itemToSave.id) {
          await safeSetDoc(col.colName, itemToSave.id, itemToSave);
        } else {
          await safeAddDoc(col.colName, itemToSave);
        }
        importedCounts[col.key] = (importedCounts[col.key] || 0) + 1;
      }
    }
  }

  return { success: true, importedCounts };
}
