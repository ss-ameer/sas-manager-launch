import { Enquiry } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { safeGetDocs, safeGetDoc, safeSetDoc, safeUpdateDoc, db } from '../../firebase';
import { doc, updateDoc, setDoc, where } from 'firebase/firestore';
import { canAccessEnquiry, isAdmin, isSuperAdmin, getUserWorkspaceRole } from '../../utils/permissions';

export class EnquiryRepository {
  private static STORE_NAME = 'enquiries';

  /**
   * Explicit Deserialization Mapping:
   * Maps raw snapshot/local object into typed Enquiry, explicitly preserving
   * shared_with, shared_with_uids, additional_team, and shared_with_names so collaborator
   * state is never lost on refresh.
   */
  public static docToEnquiry(id: string, data: any): Enquiry {
    if (!data) return { id } as Enquiry;

    const cleanUids: string[] = Array.isArray(data.shared_with)
      ? data.shared_with.map((u: any) => (typeof u === 'string' ? u.trim() : String(u?.uid || u?.id || '').trim())).filter(Boolean)
      : Array.isArray(data.shared_with_uids)
      ? data.shared_with_uids.map((u: any) => (typeof u === 'string' ? u.trim() : String(u?.uid || u?.id || '').trim())).filter(Boolean)
      : [];

    const cleanTeam: string[] = Array.isArray(data.additional_team)
      ? data.additional_team.map((t: any) => (typeof t === 'string' ? t.trim() : String(t?.name || t?.full_name || t?.initials || '').trim())).filter(Boolean)
      : typeof data.additional_team === 'string' && data.additional_team.trim()
      ? data.additional_team.split(/[,;|]/).map((s: string) => s.trim()).filter(Boolean)
      : [];

    const cleanNames: string[] = Array.isArray(data.shared_with_names)
      ? data.shared_with_names.map((n: any) => (typeof n === 'string' ? n.trim() : String(n?.name || n?.full_name || '').trim())).filter(Boolean)
      : [];

    const assignedToId = data.assigned_to_id || data.assignedToId || data.sales_person_id || data.salesperson_id || data.created_by_uid || data.createdByUid || undefined;
    const assignedTo = data.assigned_to || data.assignedTo || data.sales_person || data.salesperson || data.assignedSalesperson || undefined;
    const assignedSalesperson = data.assignedSalesperson || data.sales_person || data.salesperson || data.sales_representative || undefined;
    const workspaceId = data.workspace_id || data.workspaceId || 'ws_default';

    return {
      ...data,
      id: id || data.id,
      workspace_id: workspaceId,
      workspaceId: workspaceId,
      assigned_to_id: assignedToId,
      assigned_to: assignedTo,
      assignedSalesperson: assignedSalesperson,
      sales_person: data.sales_person || data.salesperson || assignedSalesperson,
      salesperson: data.salesperson || data.sales_person || assignedSalesperson,
      shared_with: cleanUids,
      shared_with_uids: cleanUids,
      additional_team: cleanTeam,
      shared_with_names: cleanNames,
    } as Enquiry;
  }

  public static async getAllLocal(): Promise<Enquiry[]> {
    const raw = await getFromLocalStore<Enquiry>(this.STORE_NAME);
    return (raw || []).map((item) => this.docToEnquiry(item.id, item));
  }

  public static async getAll(): Promise<Enquiry[]> {
    return this.getAllLocal();
  }

  public static async saveLocalCache(items: Enquiry[]): Promise<void> {
    await saveToLocalStore(this.STORE_NAME, items);
  }

  /**
   * Hardened Single-Document Read Guard:
   * Fetches document by ID and verifies workspace boundary before returning data.
   */
  public static async getEnquiryById(id: string, currentActiveWorkspaceId?: string): Promise<Enquiry | null> {
    let enquiry: Enquiry | null = null;
    const docSnap = await safeGetDoc('enquiries', id);
    if (docSnap && docSnap.exists()) {
      enquiry = this.docToEnquiry(docSnap.id, docSnap.data());
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
      const [snap1, snap2] = await Promise.all([
        safeGetDocs('enquiries', where('workspace_id', '==', workspaceId)),
        safeGetDocs('enquiries', where('workspaceId', '==', workspaceId))
      ]);
      const map = new Map<string, Enquiry>();
      if (snap1 && !snap1.empty) {
        snap1.docs.forEach((d) => map.set(d.id, this.docToEnquiry(d.id, d.data())));
      }
      if (snap2 && !snap2.empty) {
        snap2.docs.forEach((d) => map.set(d.id, this.docToEnquiry(d.id, d.data())));
      }
      if (workspaceId === 'ws_default' && map.size === 0) {
        const legacySnap = await safeGetDocs('enquiries', where('workspaceId', '==', 'ws_default'));
        if (legacySnap && !legacySnap.empty) {
          legacySnap.docs.forEach((d) => map.set(d.id, this.docToEnquiry(d.id, d.data())));
        }
      }
      const docs = Array.from(map.values());
      if (docs.length === 0) return this.getAllLocal();
      await this.saveLocalCache(docs);
      return docs;
    } catch (e) {
      console.warn('[EnquiryRepository] Cloud fetch failed, using local cache:', e);
      return this.getAllLocal();
    }
  }

  public static async save(enquiry: Enquiry, currentActiveWorkspaceId?: string): Promise<void> {
    if (currentActiveWorkspaceId) {
      // Forcefully override and append workspace_id & workspaceId to mutation payload right before saving
      enquiry.workspace_id = currentActiveWorkspaceId;
      (enquiry as any).workspaceId = currentActiveWorkspaceId;
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
   *
   * Supports both signatures:
   * - updateCollaborators(workspaceId, enquiryId, uids, names)
   * - updateCollaborators(enquiryId, additional_team, shared_with_uids, shared_with_names, workspaceId)
   */
  public static async updateCollaborators(
    param1: string,
    param2: string | (string | Record<string, any>)[],
    param3?: (string | Record<string, any>)[],
    param4?: (string | Record<string, any>)[],
    param5?: string | null
  ): Promise<Enquiry | null> {
    let workspaceId: string | null = null;
    let targetId: string = '';
    let rawTeam: (string | Record<string, any>)[] = [];
    let rawUids: (string | Record<string, any>)[] = [];
    let rawNames: (string | Record<string, any>)[] = [];

    if (typeof param2 === 'string') {
      // Called as: updateCollaborators(workspaceId, enquiryId, uids, names)
      workspaceId = param1;
      targetId = param2;
      rawUids = param3 || [];
      rawNames = param4 || [];
      rawTeam = param4 && param4.length > 0 ? param4 : param3 || [];
    } else {
      // Called as: updateCollaborators(enquiryId, additional_team, shared_with_uids, shared_with_names, workspaceId)
      targetId = param1;
      rawTeam = param2 || [];
      rawUids = param3 || [];
      rawNames = param4 || [];
      workspaceId = param5 || null;
    }

    if (!targetId) {
      throw new Error('[EnquiryRepository] Cannot update collaborators: missing enquiry ID.');
    }

    // Plain string UID arrays (shared_with_uids: string[])
    const cleanUids: string[] = Array.from(
      new Set(
        (rawUids || [])
          .map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String((item as any).uid || (item as any).id || (item as any).userId || '').trim();
            return String(item).trim();
          })
          .filter(Boolean)
      )
    );

    // Name/display string arrays (additional_team: string[])
    const cleanTeam: string[] = Array.from(
      new Set(
        (rawTeam || [])
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
        (rawNames && rawNames.length > 0 ? rawNames : cleanTeam)
          .map((item) => {
            if (!item) return '';
            if (typeof item === 'string') return item.trim();
            if (typeof item === 'object') return String((item as any).name || (item as any).full_name || '').trim();
            return String(item).trim();
          })
          .filter(Boolean)
      )
    );

    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === targetId);
    const existing = idx !== -1 ? current[idx] : ({ id: targetId } as Enquiry);
    const targetWsId = workspaceId || existing.workspace_id || (existing as any).workspaceId || 'ws_default';

    const updatedEnquiry: Enquiry = {
      ...existing,
      id: targetId,
      workspace_id: targetWsId,
      additional_team: cleanTeam,
      shared_with: cleanUids,
      shared_with_uids: cleanUids,
      shared_with_names: cleanNames,
      updatedAt: new Date().toISOString()
    };

    // 1. Optimistic write to local cache and enqueue to syncEngine
    await this.save(updatedEnquiry);

    // Also update localStorage 'omni_enquiries' cache if present
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const rawCached = window.localStorage.getItem('omni_enquiries');
        if (rawCached) {
          const parsed = JSON.parse(rawCached);
          if (Array.isArray(parsed)) {
            const pIdx = parsed.findIndex((e: any) => e.id === targetId);
            if (pIdx !== -1) {
              parsed[pIdx] = {
                ...parsed[pIdx],
                additional_team: cleanTeam,
                shared_with: cleanUids,
                shared_with_uids: cleanUids,
                shared_with_names: cleanNames,
                updatedAt: updatedEnquiry.updatedAt
              };
            }
            window.localStorage.setItem('omni_enquiries', JSON.stringify(parsed));
          }
        }
      }
    } catch (lsErr) {
      console.warn('[EnquiryRepository] Failed to update omni_enquiries cache:', lsErr);
    }

    // 2. Direct atomic cloud update in Firestore
    const cloudPayload = {
      additional_team: cleanTeam,
      shared_with: cleanUids,
      shared_with_uids: cleanUids,
      shared_with_names: cleanNames,
      updatedAt: updatedEnquiry.updatedAt
    };

    try {
      // Primary atomic write to 'enquiries/{id}'
      const docRef = doc(db, 'enquiries', targetId);
      await updateDoc(docRef, cloudPayload);
    } catch (directErr: any) {
      console.warn('[EnquiryRepository] Direct atomic updateDoc failed, attempting safeSetDoc fallback:', directErr);
      try {
        // Fallback: safeSetDoc with merge
        await safeSetDoc('enquiries', targetId, cloudPayload, { merge: true });
      } catch (fallbackErr: any) {
        console.error('[EnquiryRepository] Cloud collaborator update failed on enquiries:', fallbackErr);
        throw fallbackErr;
      }

      // If it failed because of permission-denied, propagate to caller
      if (directErr && (directErr.code === 'permission-denied' || directErr.message?.includes('permission-denied'))) {
        throw new Error('Permission denied: You do not have permission to update collaborators on this enquiry in Firestore.');
      }
    }

    // If workspace-scoped subcollection is also used
    if (targetWsId && targetWsId !== 'ws_default') {
      try {
        const wsDocRef = doc(db, `workspaces/${targetWsId}/enquiries`, targetId);
        await setDoc(wsDocRef, cloudPayload, { merge: true });
      } catch (wsErr) {
        // Optional workspace subcollection path
      }
    }

    return updatedEnquiry;
  }

  /**
   * Filter enquiries according to user access role & data isolation rules:
   * - Admins and Super Admins retain full, unrestricted access to all workspace records.
   * - Members and Viewers only see records where they are the assigned owner (currentUser.uid === enquiry.assigned_to_id)
   *   OR listed in the shared array (enquiry.shared_with / shared_with_uids).
   */
  public static filterVisibleEnquiries(
    enquiries: Enquiry[],
    currentUser: any,
    activeWorkspace?: any
  ): Enquiry[] {
    if (!currentUser) return [];
    const activeWorkspaceRole = getUserWorkspaceRole(currentUser, activeWorkspace?.id, activeWorkspace);
    const role = (currentUser?.role || '').trim().toLowerCase();
    const wsRole = (activeWorkspaceRole || '').trim().toLowerCase();
    const currentUserId = currentUser?.uid || currentUser?.id || '';
    const isWsOwner = Boolean(
      (activeWorkspace?.ownerId && activeWorkspace.ownerId === currentUserId) ||
      (activeWorkspace?.owner_id && activeWorkspace.owner_id === currentUserId) ||
      (activeWorkspace?.createdByUid && activeWorkspace.createdByUid === currentUserId) ||
      (activeWorkspace?.created_by_uid && activeWorkspace.created_by_uid === currentUserId)
    );

    const isWsAdmin =
      role === 'admin' ||
      role === 'superadmin' ||
      wsRole === 'admin' ||
      wsRole === 'owner' ||
      isWsOwner ||
      isSuperAdmin(currentUser) ||
      isAdmin(currentUser, activeWorkspace?.id, activeWorkspace);

    if (isWsAdmin) {
      // Fetch and display ALL enquiries where workspaceId === activeWorkspace.id (or default workspace)
      // Do NOT filter by assignedSalesperson
      return enquiries.filter((e) => {
        if (e.is_deleted) return false;
        if (!activeWorkspace?.id) return true;
        const eWsId = e.workspace_id || (e as any).workspaceId;
        return eWsId === activeWorkspace.id || (!eWsId && activeWorkspace.is_default);
      });
    }

    // If isWsAdmin is false (standard restricted member): Filter strictly by assignedSalesperson === currentUser.id or shared enquiries
    return enquiries.filter((e) => !e.is_deleted && canAccessEnquiry(currentUser, e, activeWorkspace));
  }
}
