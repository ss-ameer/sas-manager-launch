import { Enquiry } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { safeGetDocs, safeGetDoc, safeSetDoc } from '../../firebase';

export class EnquiryRepository {
  private static STORE_NAME = 'enquiries';

  public static async getAllLocal(): Promise<Enquiry[]> {
    return getFromLocalStore<Enquiry>(this.STORE_NAME);
  }

  public static async saveLocalCache(items: Enquiry[]): Promise<void> {
    await saveToLocalStore(this.STORE_NAME, items);
  }

  /**
   * Hardened Single-Document Read Guard:
   * Fetches document by ID and verifies workspace boundary before returning data.
   */
  public static async getEnquiryById(id: string, currentActiveWorkspaceId: string): Promise<Enquiry | null> {
    let enquiry: Enquiry | null = null;
    const docSnap = await safeGetDoc('enquiries', id);
    if (docSnap && docSnap.exists()) {
      enquiry = { id: docSnap.id, ...docSnap.data() } as Enquiry;
    } else {
      const localEnquiries = await this.getAllLocal();
      enquiry = localEnquiries.find((e) => e.id === id) || null;
    }

    if (!enquiry) return null;

    // Hardened Single-Document Read Guard: Explicitly verify workspace ownership
    const docWsId = enquiry.workspace_id || (enquiry as any).workspaceId || 'ws_default';
    if (currentActiveWorkspaceId && docWsId !== currentActiveWorkspaceId && currentActiveWorkspaceId !== 'ws_default') {
      throw new Error('Access Denied: Cross-Workspace Boundary Violation');
    }

    return enquiry;
  }

  public static async fetchWorkspaceEnquiriesFromCloud(workspaceId: string): Promise<Enquiry[]> {
    try {
      const snap = await safeGetDocs('enquiries');
      if (!snap || snap.empty) return this.getAllLocal();
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry));
      const filtered = docs.filter((e) => {
        const docWsId = e.workspace_id || (e as any).workspaceId || 'ws_default';
        if (workspaceId === 'ws_default') return docWsId === 'ws_default' || !docWsId;
        return docWsId === workspaceId;
      });
      await this.saveLocalCache(filtered);
      return filtered;
    } catch (e) {
      console.warn('[EnquiryRepository] Cloud fetch failed, using local cache:', e);
      return this.getAllLocal();
    }
  }

  public static async save(enquiry: Enquiry, currentActiveWorkspaceId?: string): Promise<void> {
    if (currentActiveWorkspaceId) {
      // Forcefully override and append workspace_id to mutation payload right before saving
      enquiry.workspace_id = currentActiveWorkspaceId;
    }
    // 1. Optimistic write to local storage cache
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === enquiry.id);
    let updated: Enquiry[];

    if (idx >= 0) {
      updated = [...current];
      updated[idx] = enquiry;
    } else {
      updated = [enquiry, ...current];
    }
    await this.saveLocalCache(updated);

    // 2. Enqueue mutation for background Firestore batch flush
    await syncEngine.enqueue('enquiries', 'set', enquiry.id, enquiry);
  }

  public static async saveEnquiry(enquiry: Enquiry): Promise<void> {
    return this.save(enquiry);
  }

  public static async softDelete(id: string, user?: { uid: string; name: string }): Promise<void> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const updatedEnquiry: Enquiry = {
      ...current[idx],
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_uid: user?.uid,
      deleted_by_name: user?.name
    };

    await this.save(updatedEnquiry);
  }

  public static async restore(id: string): Promise<void> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const restoredEnquiry: Enquiry = {
      ...current[idx],
      is_deleted: false,
      deleted_at: undefined,
      deleted_by_uid: undefined,
      deleted_by_name: undefined
    };

    await this.save(restoredEnquiry);
  }

  public static async purgePermanent(id: string): Promise<void> {
    // 1. Hard purge from local cache
    const current = await this.getAllLocal();
    const updated = current.filter((item) => item.id !== id);
    await this.saveLocalCache(updated);

    // 2. Enqueue hard delete mutation to Firestore
    await syncEngine.enqueue('enquiries', 'delete', id);
  }

  public static async delete(id: string, user?: { uid: string; name: string }): Promise<void> {
    return this.softDelete(id, user);
  }

  /**
   * Atomic Collaborator Sharing Mutation:
   * Syncs additional_team (names/initials) and shared_with_uids (UID array)
   * to guarantee instant RBAC permission matching in canAccessEnquiry.
   */
  public static async updateCollaborators(
    id: string,
    additional_team: (string | Record<string, any>)[],
    shared_with_uids: (string | Record<string, any>)[],
    shared_with_names?: (string | Record<string, any>)[]
  ): Promise<Enquiry | null> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === id);
    if (idx === -1) return null;

    // Plain string UID arrays (shared_with_uids: string[])
    const cleanUids: string[] = Array.from(
      new Set(
        (shared_with_uids || [])
          .map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String((item as any).uid || (item as any).id || '').trim();
            return String(item).trim();
          })
          .filter(Boolean)
      )
    );

    // Name/display string arrays (additional_team: string[])
    const cleanTeam: string[] = Array.from(
      new Set(
        (additional_team || [])
          .map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String((item as any).name || (item as any).full_name || (item as any).initials || '').trim();
            return String(item).trim();
          })
          .filter(Boolean)
      )
    );

    // Name/display string arrays (shared_with_names: string[])
    const cleanNames: string[] = Array.from(
      new Set(
        (shared_with_names && shared_with_names.length > 0 ? shared_with_names : cleanTeam)
          .map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String((item as any).name || (item as any).full_name || '').trim();
            return String(item).trim();
          })
          .filter(Boolean)
      )
    );

    const updatedEnquiry: Enquiry = {
      ...current[idx],
      additional_team: cleanTeam,
      shared_with_uids: cleanUids,
      shared_with_names: cleanNames,
      updatedAt: new Date().toISOString()
    };

    // 1. Optimistic write to local cache and enqueue to syncEngine
    await this.save(updatedEnquiry);

    // 2. Direct atomic cloud update in Firestore
    try {
      await safeSetDoc(
        'enquiries',
        id,
        {
          additional_team: cleanTeam,
          shared_with_uids: cleanUids,
          shared_with_names: cleanNames,
          updatedAt: updatedEnquiry.updatedAt
        },
        { merge: true }
      );
    } catch (cloudErr) {
      console.warn('[EnquiryRepository] Direct Firestore update of collaborators queued via syncEngine:', cloudErr);
    }

    return updatedEnquiry;
  }
}
