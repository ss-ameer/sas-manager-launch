// Local IndexedDB & Storage helper for Omni Suite

const DB_NAME = 'omni_suite_db';
const DB_VERSION = 2;

export interface MutationItem {
  id: string;
  entity: string;
  action: 'create' | 'update' | 'delete' | 'set';
  docId: string;
  payload?: any;
  timestamp: number;
  retryCount: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryBlobMap = new Map<string, string>();

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      const stores = ['enquiries', 'companies', 'contacts', 'call_logs', 'activity_logs', 'products', 'metadata', 'mutation_queue', 'attachment_blobs'];
      stores.forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          if (storeName === 'attachment_blobs') {
            db.createObjectStore(storeName, { keyPath: 'key' });
          } else {
            db.createObjectStore(storeName, { keyPath: 'id' });
          }
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('IndexedDB failed to open, falling back to localStorage / memory');
      reject(request.error);
    };
  });

  return dbPromise;
}

export async function saveToLocalStore(storeName: string, items: any[]): Promise<void> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(storeName)) {
      localStorage.setItem(`omni_idb_fallback_${storeName}`, JSON.stringify(items));
      return;
    }
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) {
      if (item && item.id) {
        store.put(item);
      }
    }
  } catch (e) {
    // Fallback to localStorage
    try {
      localStorage.setItem(`omni_idb_fallback_${storeName}`, JSON.stringify(items));
    } catch (_) {}
  }
}

export async function getFromLocalStore<T>(storeName: string): Promise<T[]> {
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains(storeName)) {
      const saved = localStorage.getItem(`omni_idb_fallback_${storeName}`);
      return saved ? JSON.parse(saved) : [];
    }
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => resolve([]);
    });
  } catch (e) {
    try {
      const saved = localStorage.getItem(`omni_idb_fallback_${storeName}`);
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  }
}

// Queue Storage Operations
export async function enqueueLocalMutation(mutation: MutationItem): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('mutation_queue', 'readwrite');
    const store = tx.objectStore('mutation_queue');
    store.put(mutation);
  } catch (e) {
    const queue = getFallbackQueue();
    queue.push(mutation);
    saveFallbackQueue(queue);
  }
}

export async function getPendingMutations(): Promise<MutationItem[]> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('mutation_queue', 'readonly');
      const store = tx.objectStore('mutation_queue');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as MutationItem[]);
      req.onerror = () => resolve(getFallbackQueue());
    });
  } catch (e) {
    return getFallbackQueue();
  }
}

export async function removeLocalMutation(id: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('mutation_queue', 'readwrite');
    const store = tx.objectStore('mutation_queue');
    store.delete(id);
  } catch (e) {
    let queue = getFallbackQueue();
    queue = queue.filter((m) => m.id !== id);
    saveFallbackQueue(queue);
  }
}

function getFallbackQueue(): MutationItem[] {
  try {
    const saved = localStorage.getItem('omni_mutation_queue');
    return saved ? JSON.parse(saved) : [];
  } catch (_) {
    return [];
  }
}

function saveFallbackQueue(queue: MutationItem[]) {
  try {
    localStorage.setItem('omni_mutation_queue', JSON.stringify(queue));
  } catch (_) {}
}

export async function clearAllLocalStores(): Promise<void> {
  try {
    const db = await getDB();
    const stores = ['enquiries', 'companies', 'contacts', 'call_logs', 'activity_logs', 'products', 'metadata', 'mutation_queue'];
    for (const storeName of stores) {
      if (db.objectStoreNames.contains(storeName)) {
        try {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('Failed clearing IndexedDB stores:', e);
  }
  try {
    localStorage.clear();
  } catch (_) {}
}

// Blob & File Attachment Local Storage (Unlimited local size, persistent across reloads)
export async function saveAttachmentBlob(key: string, dataUrl: string): Promise<void> {
  if (!key || !dataUrl) return;
  memoryBlobMap.set(key, dataUrl);
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('attachment_blobs')) return;
    const tx = db.transaction('attachment_blobs', 'readwrite');
    const store = tx.objectStore('attachment_blobs');
    store.put({ key, dataUrl, updatedAt: Date.now() });
  } catch (e) {
    console.warn('[saveAttachmentBlob] Storing in memory fallback:', e);
  }
}

export async function getAttachmentBlob(key: string): Promise<string | null> {
  if (!key) return null;
  if (memoryBlobMap.has(key)) {
    return memoryBlobMap.get(key) || null;
  }
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('attachment_blobs')) return null;
    return new Promise((resolve) => {
      const tx = db.transaction('attachment_blobs', 'readonly');
      const store = tx.objectStore('attachment_blobs');
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.dataUrl) {
          memoryBlobMap.set(key, req.result.dataUrl);
          resolve(req.result.dataUrl);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return memoryBlobMap.get(key) || null;
  }
}

export async function deleteAttachmentBlob(key: string): Promise<void> {
  if (!key) return;
  memoryBlobMap.delete(key);
  try {
    const db = await getDB();
    if (!db.objectStoreNames.contains('attachment_blobs')) return;
    const tx = db.transaction('attachment_blobs', 'readwrite');
    const store = tx.objectStore('attachment_blobs');
    store.delete(key);
  } catch (e) {
    console.warn('[deleteAttachmentBlob] Failed to delete from IndexedDB:', e);
  }
}
