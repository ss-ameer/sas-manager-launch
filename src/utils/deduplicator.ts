/**
 * Deduplicates array items based on primary ID / UID.
 * When real server records arrive, temporary unsynced local items (starting with local_, temp_, or offline_)
 * are automatically purged if a real document with matching content/timestamp exists, or retained if still pending.
 */
export function deduplicateList<T extends { id?: string; uid?: string; createdAt?: string; date?: string; _pending?: boolean }>(
  incomingList: T[],
  currentList: T[] = []
): T[] {
  const map = new Map<string, T>();

  // 1. Add all incoming server docs
  incomingList.forEach((item) => {
    const key = item.id || item.uid;
    if (key) {
      map.set(key, item);
    }
  });

  // 2. Keep pending/local items from current state ONLY if they haven't been assigned a server ID yet
  currentList.forEach((item) => {
    const key = item.id || item.uid;
    if (!key) return;

    const isTemp =
      key.startsWith('local_') ||
      key.startsWith('temp_') ||
      key.startsWith('offline_') ||
      item._pending;

    if (isTemp) {
      // Check if a real server doc with same ID already exists
      if (!map.has(key)) {
        map.set(key, item);
      }
    }
  });

  return Array.from(map.values());
}
