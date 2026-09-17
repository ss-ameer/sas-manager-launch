import { doc, writeBatch } from 'firebase/firestore';
import { db, cleanUndefined, safeSetDoc } from '../firebase';
import { ActivityLogEntry, CallLogEntry, Company } from '../types';
import { CompanyRepository } from './repositories/CompanyRepository';
import { getFromLocalStore, saveToLocalStore } from './db';
import { syncEngine } from './SyncEngine';

const STORE_NAME = 'activity_logs';

/**
 * Checks whether an activity/call log entry is an active pending task.
 * Returns false if deleted, completed, cancelled, or superseded.
 */
export function isTaskPending(entry: Partial<ActivityLogEntry> | null | undefined): boolean {
  if (!entry || entry.is_deleted) return false;
  const s = (entry.status || '').toLowerCase().trim();
  if (
    s === 'superseded' ||
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'completed' ||
    s === 'completed log' ||
    s.startsWith('completed')
  ) {
    return false;
  }
  return (
    s === 'pending' ||
    s === 'scheduled' ||
    s === 'scheduled / planned' ||
    s === 'scheduled / draft' ||
    s.startsWith('scheduled')
  );
}

export interface SyncCompanyMasterParams {
  companyId: string;
  interactionChannel?: string;
  userIdOrInitials?: string;
  nextFollowUpDate?: string | null;
}

export class TaskService {
  /**
   * Retrieves all local activity logs.
   */
  public static async getAllLocalTasks(): Promise<ActivityLogEntry[]> {
    return getFromLocalStore<ActivityLogEntry>(STORE_NAME);
  }

  /**
   * Finds any active pending tasks for a given workspace and company,
   * excluding any specified task IDs (e.g. the task currently being completed or newly created).
   */
  public static async findActivePendingTasksForCompany(
    workspaceId: string,
    companyId: string,
    excludingTaskIds: string[] = []
  ): Promise<ActivityLogEntry[]> {
    if (!companyId) return [];
    const all = await this.getAllLocalTasks();
    const excludeSet = new Set(excludingTaskIds.filter(Boolean));

    return all.filter((item) => {
      if (excludeSet.has(item.id || '')) return false;
      if (item.company_id !== companyId) return false;
      if (workspaceId && item.workspace_id && item.workspace_id !== workspaceId && workspaceId !== 'ws_default') {
        return false;
      }
      return isTaskPending(item);
    });
  }

  /**
   * Enforces the "Single Active Pending Task" invariant for a company.
   * When scheduling or saving a new follow-up task, any prior pending tasks
   * for that company in the workspace are marked as 'superseded'.
   * 
   * Returns the list of superseded tasks so the caller can update state/caches.
   */
  public static async supersedePriorPendingTasks(
    workspaceId: string,
    companyId: string,
    excludingTaskIds: string[] = [],
    newFollowUpTaskId?: string
  ): Promise<ActivityLogEntry[]> {
    if (!companyId) return [];
    const priorPending = await this.findActivePendingTasksForCompany(workspaceId, companyId, excludingTaskIds);
    if (priorPending.length === 0) return [];

    const nowIso = new Date().toISOString();
    const supersededTasks: ActivityLogEntry[] = priorPending.map((task) => {
      const existingNotes = task.requirement_notes || '';
      const noteAppend = newFollowUpTaskId
        ? `[Superseded by follow-up task ${newFollowUpTaskId}]`
        : '[Superseded by newly scheduled task]';
      return {
        ...task,
        status: 'superseded',
        outcome: 'Superseded by new follow-up',
        requirement_notes: existingNotes.trim() ? `${existingNotes}\n${noteAppend}` : noteAppend,
        updatedAt: nowIso
      };
    });

    // Write to Firestore in batch if available
    try {
      const batch = writeBatch(db);
      for (const t of supersededTasks) {
        if (!t.id) continue;
        const actRef = doc(db, 'activity_logs', t.id);
        const callRef = doc(db, 'call_logs', t.id);
        batch.set(actRef, cleanUndefined(t), { merge: true });
        batch.set(callRef, cleanUndefined(t), { merge: true });
      }
      await batch.commit();
    } catch (err) {
      console.warn('[TaskService] Batch commit for superseded tasks failed, falling back to safeSetDoc:', err);
      for (const t of supersededTasks) {
        if (!t.id) continue;
        await safeSetDoc('activity_logs', t.id, t, { merge: true });
        await safeSetDoc('call_logs', t.id, t, { merge: true });
      }
    }

    // Update local cache
    const current = await this.getAllLocalTasks();
    const supersededMap = new Map(supersededTasks.map((t) => [t.id, t]));
    const updated = current.map((item) => (supersededMap.has(item.id) ? supersededMap.get(item.id)! : item));
    await saveToLocalStore(STORE_NAME, updated);

    // Enqueue in sync engine
    for (const t of supersededTasks) {
      if (t.id) {
        await syncEngine.enqueue('activity_logs', 'set', t.id, t);
        await syncEngine.enqueue('call_logs', 'set', t.id, t);
      }
    }

    return supersededTasks;
  }

  /**
   * Synchronizes the Company Master document fields upon interaction completion or follow-up scheduling:
   * - lastContactedAt: timestamp
   * - lastContactedChannel: interaction channel
   * - lastContactedBy: current user ID or initials/name
   * - nextFollowUpAt: next follow-up date string, or null if completed without next date or cancelled
   * - updatedAt: timestamp
   */
  public static async syncCompanyMasterOnInteraction(params: SyncCompanyMasterParams): Promise<Company | null> {
    const { companyId, interactionChannel, userIdOrInitials, nextFollowUpDate } = params;
    if (!companyId) return null;

    const nowIso = new Date().toISOString();
    const finalNextFollowUpAt = nextFollowUpDate && nextFollowUpDate.trim() !== '' ? nextFollowUpDate.trim() : null;

    const companyUpdates: Partial<Company> = {
      lastContactedAt: nowIso,
      lastContactedChannel: interactionChannel || 'Phone Call',
      lastContactedBy: userIdOrInitials || 'User',
      nextFollowUpAt: finalNextFollowUpAt,
      last_contacted_at: nowIso,
      next_followup_at: finalNextFollowUpAt,
      updatedAt: nowIso
    };

    // Update Company in repository (handles IndexedDB, localStorage cache, syncEngine, Firestore)
    await CompanyRepository.updateCompany(companyId, companyUpdates);

    // Direct atomic write to Firestore 'companies' doc
    try {
      const compRef = doc(db, 'companies', companyId);
      const batch = writeBatch(db);
      batch.set(compRef, cleanUndefined(companyUpdates), { merge: true });
      await batch.commit();
    } catch (err) {
      console.warn('[TaskService] Firestore company master sync failed, using safeSetDoc fallback:', err);
      try {
        await safeSetDoc('companies', companyId, companyUpdates, { merge: true });
      } catch (safeErr) {
        console.warn('[TaskService] safeSetDoc failed for company update:', safeErr);
      }
    }

    // Return the updated company from local cache
    const companies = await CompanyRepository.getCompaniesLocal();
    return companies.find((c) => c.id === companyId) || null;
  }

  /**
   * Synchronizes the Company Master document when a follow-up task is cancelled
   * or when a company has no further upcoming follow-ups.
   */
  public static async clearCompanyNextFollowUp(companyId: string): Promise<void> {
    if (!companyId) return;
    const nowIso = new Date().toISOString();
    const companyUpdates: Partial<Company> = {
      nextFollowUpAt: null,
      next_followup_at: null,
      updatedAt: nowIso
    };

    await CompanyRepository.updateCompany(companyId, companyUpdates);
    try {
      const compRef = doc(db, 'companies', companyId);
      const batch = writeBatch(db);
      batch.set(compRef, cleanUndefined(companyUpdates), { merge: true });
      await batch.commit();
    } catch (err) {
      try {
        await safeSetDoc('companies', companyId, companyUpdates, { merge: true });
      } catch (e) {
        console.warn('[TaskService] Failed to clear company nextFollowUpAt:', e);
      }
    }
  }
}
