import { writeBatch, doc, deleteField, where } from 'firebase/firestore';
import { db, cleanUndefined, safeGetDocs, safeSetDoc, safeUpdateDoc } from '../../firebase';
import { ActivityLogEntry, CallStatus, Company, Contact } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { CompanyRepository } from './CompanyRepository';
import { isTaskPending } from '../taskService';

export interface ConvertLeadParams {
  entry: ActivityLogEntry;
  companyName: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  workspaceId: string;
  user?: { uid?: string; name?: string };
}

export interface ConvertLeadResult {
  newCompany: Company;
  newContact: Contact;
  updatedEntry: ActivityLogEntry;
}

export interface LogInteractionWithTaskParams {
  interaction: ActivityLogEntry;
  followupTask?: ActivityLogEntry | null;
  mode?: 'create' | 'update' | 'execute';
}

export interface LogInteractionWithTaskResult {
  interaction: ActivityLogEntry;
  followupTask: ActivityLogEntry | null;
}

export class ActivityLogRepository {
  private static STORE_NAME = 'activity_logs';

  public static async getAllLocal(): Promise<ActivityLogEntry[]> {
    return getFromLocalStore<ActivityLogEntry>(this.STORE_NAME);
  }

  public static async saveLocalCache(items: ActivityLogEntry[]): Promise<void> {
    await saveToLocalStore(this.STORE_NAME, items);
  }

  public static async saveLocalOnly(entry: ActivityLogEntry): Promise<void> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === entry.id);
    let updated: ActivityLogEntry[];

    if (idx >= 0) {
      updated = [...current];
      updated[idx] = entry;
    } else {
      updated = [entry, ...current];
    }
    await this.saveLocalCache(updated);
  }

  /**
   * Consolidate task creation and interaction logging into a single atomic write path.
   * Performs an atomic writeBatch to Firestore ('call_logs' and 'activity_logs') for the
   * interaction and any linked followup task document, ensuring exactly ONE database write.
   */
  public static async logInteractionWithTask(
    paramsOrInteraction: LogInteractionWithTaskParams | ActivityLogEntry,
    maybeFollowup?: ActivityLogEntry | null,
    maybeMode?: 'create' | 'update' | 'execute'
  ): Promise<LogInteractionWithTaskResult> {
    let interaction: ActivityLogEntry;
    let followupTask: ActivityLogEntry | null = null;
    let mode: 'create' | 'update' | 'execute' = 'create';

    if (paramsOrInteraction && 'interaction' in paramsOrInteraction) {
      interaction = paramsOrInteraction.interaction;
      followupTask = paramsOrInteraction.followupTask || null;
      mode = paramsOrInteraction.mode || 'create';
    } else {
      interaction = paramsOrInteraction as ActivityLogEntry;
      followupTask = maybeFollowup || null;
      mode = maybeMode || 'create';
    }

    if (!interaction || !interaction.id) {
      throw new Error('[CallLogRepository] Missing interaction or interaction.id');
    }

    const current = await this.getAllLocal();
    const nowIso = new Date().toISOString();

    const targetCompanyId = (followupTask && followupTask.company_id) || interaction.company_id;
    const targetWorkspaceId =
      (followupTask && (followupTask.workspace_id || (followupTask as any).workspaceId)) ||
      interaction.workspace_id ||
      (interaction as any).workspaceId ||
      'ws_default';

    // 1. Enforce "Single Active Pending Task" Invariant per company in workspace
    const supersededTasks: ActivityLogEntry[] = [];
    if (targetCompanyId) {
      const isSchedulingNewFollowup = Boolean(followupTask && followupTask.id && isTaskPending(followupTask));
      const isCreatingNewPendingTask = mode === 'create' && isTaskPending(interaction);

      if (isSchedulingNewFollowup || isCreatingNewPendingTask) {
        const activeTaskId = isSchedulingNewFollowup ? followupTask!.id : interaction.id;
        const priorPending = (current || []).filter((item) => {
          if (!item.id || item.id === interaction.id || (followupTask && item.id === followupTask.id)) {
            return false;
          }
          if (item.company_id !== targetCompanyId) return false;
          if (
            targetWorkspaceId &&
            item.workspace_id &&
            item.workspace_id !== targetWorkspaceId &&
            targetWorkspaceId !== 'ws_default'
          ) {
            return false;
          }
          return isTaskPending(item);
        });

        for (const pt of priorPending) {
          const noteAppend = activeTaskId
            ? `[Superseded by follow-up task ${activeTaskId}]`
            : '[Superseded by newly scheduled task]';
          const existingNotes = pt.requirement_notes || '';
          supersededTasks.push({
            ...pt,
            status: 'superseded' as CallStatus,
            outcome: 'Superseded by new follow-up',
            requirement_notes: existingNotes.trim() ? `${existingNotes}\n${noteAppend}` : noteAppend,
            updatedAt: nowIso
          });
        }
      }
    }

    // 2. Compute Company Master document synchronization payload
    let companyUpdates: Partial<Company> | null = null;
    if (targetCompanyId) {
      const nextDate =
        followupTask && (followupTask.next_followup_date || followupTask.date)
          ? followupTask.next_followup_date || followupTask.date
          : isTaskPending(interaction)
          ? interaction.next_followup_date || interaction.date
          : null;

      const finalNextFollowUpAt = nextDate && nextDate.trim() !== '' ? nextDate.trim() : null;

      companyUpdates = {
        lastContactedAt: nowIso,
        lastContactedChannel: interaction.channel || interaction.interaction_type || 'Phone Call',
        lastContactedBy: interaction.sales_person || interaction.logged_by || interaction.last_modified_by_name || 'User',
        nextFollowUpAt: finalNextFollowUpAt,
        last_contacted_at: nowIso,
        next_followup_at: finalNextFollowUpAt,
        updatedAt: nowIso
      };
    }

    // Atomic writeBatch to Firestore
    let batchCommitted = false;
    try {
      const batch = writeBatch(db);

      // A. Interaction Document
      const actRef = doc(db, 'activity_logs', interaction.id);
      const callRef = doc(db, 'call_logs', interaction.id);
      const cleanedInteraction = cleanUndefined(interaction);

      if (mode === 'update' || mode === 'execute') {
        batch.set(actRef, cleanedInteraction, { merge: true });
        batch.set(callRef, cleanedInteraction, { merge: true });
      } else {
        batch.set(actRef, cleanedInteraction);
        batch.set(callRef, cleanedInteraction);
      }

      // B. Follow-Up Task Document (Atomic write in same batch - exactly ONE write execution)
      if (followupTask && followupTask.id) {
        const fupActRef = doc(db, 'activity_logs', followupTask.id);
        const fupCallRef = doc(db, 'call_logs', followupTask.id);
        const cleanedFollowup = cleanUndefined(followupTask);

        batch.set(fupActRef, cleanedFollowup);
        batch.set(fupCallRef, cleanedFollowup);
      }

      // C. Prior Pending Tasks marked as superseded
      for (const st of supersededTasks) {
        if (!st.id) continue;
        const supActRef = doc(db, 'activity_logs', st.id);
        const supCallRef = doc(db, 'call_logs', st.id);
        const cleanedSup = cleanUndefined(st);
        batch.set(supActRef, cleanedSup, { merge: true });
        batch.set(supCallRef, cleanedSup, { merge: true });
      }

      // D. Company Master Document Update
      if (targetCompanyId && companyUpdates) {
        const compRef = doc(db, 'companies', targetCompanyId);
        batch.set(compRef, cleanUndefined(companyUpdates), { merge: true });
      }

      await batch.commit();
      batchCommitted = true;
    } catch (err) {
      console.warn('[CallLogRepository] Firestore batch failed or offline, falling back to safe operations:', err);
    }

    // Fallback if batch commit failed (e.g. offline simulation or network failure)
    if (!batchCommitted) {
      if (mode === 'update' || mode === 'execute') {
        await safeSetDoc('activity_logs', interaction.id, interaction, { merge: true });
        await safeSetDoc('call_logs', interaction.id, interaction, { merge: true });
      } else {
        await safeSetDoc('activity_logs', interaction.id, interaction);
        await safeSetDoc('call_logs', interaction.id, interaction);
      }

      if (followupTask && followupTask.id) {
        await safeSetDoc('activity_logs', followupTask.id, followupTask);
        await safeSetDoc('call_logs', followupTask.id, followupTask);
      }

      for (const st of supersededTasks) {
        if (!st.id) continue;
        await safeSetDoc('activity_logs', st.id, st, { merge: true });
        await safeSetDoc('call_logs', st.id, st, { merge: true });
      }

      if (targetCompanyId && companyUpdates) {
        try {
          await safeSetDoc('companies', targetCompanyId, companyUpdates, { merge: true });
        } catch (e) {
          console.warn('[CallLogRepository] safeSetDoc failed for company update:', e);
        }
      }
    }

    // Update Local Cache atomically
    let updated = [...current];

    // Upsert interaction
    const intIdx = updated.findIndex((i) => i.id === interaction.id);
    if (intIdx >= 0) {
      updated[intIdx] = interaction;
    } else {
      updated = [interaction, ...updated];
    }

    // Upsert follow-up task if present
    if (followupTask && followupTask.id) {
      const fupIdx = updated.findIndex((i) => i.id === followupTask!.id);
      if (fupIdx >= 0) {
        updated[fupIdx] = followupTask;
      } else {
        updated = [followupTask, ...updated];
      }
    }

    // Update superseded tasks in local cache and enqueue in sync engine
    if (supersededTasks.length > 0) {
      const supMap = new Map(supersededTasks.map((s) => [s.id, s]));
      updated = updated.map((item) => (supMap.has(item.id) ? supMap.get(item.id)! : item));

      for (const st of supersededTasks) {
        if (st.id) {
          await syncEngine.enqueue('activity_logs', 'set', st.id, st);
          await syncEngine.enqueue('call_logs', 'set', st.id, st);
        }
      }
    }

    await this.saveLocalCache(updated);

    // Synchronize local Company repository cache
    if (targetCompanyId && companyUpdates) {
      await CompanyRepository.updateCompany(targetCompanyId, companyUpdates);
    }

    return { interaction, followupTask };
  }

  public static async createTask(task: ActivityLogEntry): Promise<ActivityLogEntry> {
    const res = await this.logInteractionWithTask({
      interaction: task,
      followupTask: null,
      mode: 'create'
    });
    return res.interaction;
  }

  public static async logInteraction(interaction: ActivityLogEntry): Promise<ActivityLogEntry> {
    const res = await this.logInteractionWithTask({
      interaction,
      followupTask: null,
      mode: 'create'
    });
    return res.interaction;
  }

  public static async logActivity(activity: ActivityLogEntry): Promise<ActivityLogEntry> {
    return this.logInteraction(activity);
  }

  public static async fetchWorkspaceCallLogsFromCloud(workspaceId: string): Promise<ActivityLogEntry[]> {
    try {
      let snap = await safeGetDocs('activity_logs', where('workspace_id', '==', workspaceId));
      if (!snap || snap.empty) {
        snap = await safeGetDocs('call_logs', where('workspace_id', '==', workspaceId));
      }
      if ((!snap || snap.empty) && workspaceId === 'ws_default') {
        snap = await safeGetDocs('call_logs', where('workspaceId', '==', 'ws_default'));
      }
      if (!snap || snap.empty) return this.getAllLocal();
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLogEntry));
      await this.saveLocalCache(docs);
      return docs;
    } catch (e) {
      console.warn('[ActivityLogRepository] Cloud fetch failed, using local cache:', e);
      return this.getAllLocal();
    }
  }

  public static async save(entry: ActivityLogEntry): Promise<void> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === entry.id);
    let updated: ActivityLogEntry[];

    if (idx >= 0) {
      updated = [...current];
      updated[idx] = entry;
    } else {
      updated = [entry, ...current];
    }
    await this.saveLocalCache(updated);
    await syncEngine.enqueue('activity_logs', 'set', entry.id, entry);
  }

  /**
   * Dedicated in-place update for an activity / call log entry.
   * Targets both `activity_logs/${entry.id}` and `call_logs/${entry.id}`.
   */
  public static async updateLog(entry: ActivityLogEntry): Promise<ActivityLogEntry> {
    if (!entry || !entry.id) {
      throw new Error('[CallLogRepository] Cannot update log without valid ID');
    }
    const res = await this.logInteractionWithTask({
      interaction: entry,
      followupTask: null,
      mode: 'update'
    });
    return res.interaction;
  }

  /**
   * Dedicated delete method for activity / call logs.
   * Soft-deletes across Firestore (`activity_logs` and `call_logs`),
   * updates local cache and sync engine.
   */
  public static async deleteLog(id: string, user?: { uid?: string; name?: string }): Promise<void> {
    if (!id) return;
    const nowIso = new Date().toISOString();
    const deletePayload = {
      is_deleted: true,
      deleted_at: nowIso,
      deleted_by_uid: user?.uid || null,
      deleted_by_name: user?.name || 'User',
      updatedAt: nowIso
    };

    // 1. Direct atomic Firestore update
    let committed = false;
    try {
      const batch = writeBatch(db);
      const actRef = doc(db, 'activity_logs', id);
      const callRef = doc(db, 'call_logs', id);
      batch.set(actRef, deletePayload, { merge: true });
      batch.set(callRef, deletePayload, { merge: true });
      await batch.commit();
      committed = true;
    } catch (err) {
      console.warn('[CallLogRepository] Batch delete update failed, trying fallback safeSetDoc:', err);
    }

    if (!committed) {
      await Promise.allSettled([
        safeSetDoc('activity_logs', id, deletePayload, { merge: true }),
        safeSetDoc('call_logs', id, deletePayload, { merge: true })
      ]);
    }

    // 2. Update local cache
    const current = await this.getAllLocal();
    const updated = current.map((item) => (item.id === id ? { ...item, ...deletePayload } : item));
    await this.saveLocalCache(updated);

    // 3. Sync engine queue
    await syncEngine.enqueue('activity_logs', 'set', id, { id, ...deletePayload });
    await syncEngine.enqueue('call_logs', 'set', id, { id, ...deletePayload });
  }

  public static async deleteInteraction(id: string, user?: { uid?: string; name?: string }): Promise<void> {
    return this.deleteLog(id, user);
  }

  public static async softDelete(id: string, user?: { uid?: string; name?: string }): Promise<void> {
    return this.deleteLog(id, user);
  }

  public static async delete(id: string, user?: { uid?: string; name?: string }): Promise<void> {
    return this.deleteLog(id, user);
  }

  public static async restore(id: string): Promise<void> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const restored: ActivityLogEntry = {
      ...current[idx],
      is_deleted: false,
      deleted_at: undefined,
      deleted_by_uid: undefined,
      deleted_by_name: undefined
    };

    await this.save(restored);
  }

  public static async purgePermanent(id: string): Promise<void> {
    const current = await this.getAllLocal();
    const updated = current.filter((item) => item.id !== id);
    await this.saveLocalCache(updated);
    await syncEngine.enqueue('activity_logs', 'delete', id);
  }

  public static async convertUnsavedLeadToClient(params: ConvertLeadParams): Promise<ConvertLeadResult> {
    const { entry, companyName, contactName, contactPhone, contactEmail, workspaceId, user } = params;

    if (!workspaceId || workspaceId.trim() === '') {
      throw new Error('Active workspace ID is required for lead conversion.');
    }

    const now = new Date().toISOString();
    const companyId = `comp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const contactId = `cont_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const cleanCompanyName = companyName.trim() || 'Unknown Company';
    const cleanContactName = contactName.trim() || cleanCompanyName;
    const phoneVal = contactPhone?.trim() || undefined;
    const emailVal = contactEmail?.trim() || undefined;

    // Strict query against existing companies to prevent duplicate registration
    const normalizedInputName = cleanCompanyName.toLowerCase();
    let existingCompanies = await CompanyRepository.getCompaniesLocal();
    if (!existingCompanies || existingCompanies.length === 0) {
      existingCompanies = await CompanyRepository.fetchWorkspaceCompaniesFromCloud(workspaceId);
    }
    const duplicateCompany = (existingCompanies || []).find((c) => {
      if (c.is_deleted) return false;
      const canonical = (c.canonical_name || '').trim().toLowerCase();
      const display = (c.display_name || '').trim().toLowerCase();
      return (canonical === normalizedInputName || display === normalizedInputName) && 
        (!c.workspace_id || c.workspace_id === workspaceId || workspaceId === 'ws_default');
    });

    if (duplicateCompany) {
      throw new Error(`Duplicate Company Record: A company named "${duplicateCompany.display_name || duplicateCompany.canonical_name}" already exists in this workspace.`);
    }

    const newCompany: Company = {
      id: companyId,
      workspace_id: workspaceId,
      canonical_name: cleanCompanyName,
      legal_suffix: 'None / To Be Added Later',
      display_name: cleanCompanyName,
      aliases: [],
      country: 'United Arab Emirates',
      city: 'Dubai',
      general_phone: phoneVal,
      general_email: emailVal,
      relationship: 'Prospect',
      createdAt: now,
      updatedAt: now,
      created_by_uid: user?.uid,
      created_by_name: user?.name || 'System'
    };

    const newContact: Contact = {
      id: contactId,
      company_id: companyId,
      workspace_id: workspaceId,
      full_name: cleanContactName,
      mobile: phoneVal,
      email: emailVal,
      is_primary: true,
      createdAt: now,
      updatedAt: now,
      created_by_uid: user?.uid,
      created_by_name: user?.name || 'System'
    };

    const updatedEntry: ActivityLogEntry = {
      ...entry,
      company_id: companyId,
      company_name: cleanCompanyName,
      contact_id: contactId,
      contact_name: cleanContactName,
      contact_phone: phoneVal || entry.contact_phone,
      unlinked_name: undefined,
      unlinked_contact_info: undefined,
      updatedAt: now,
      last_modified_by_name: user?.name || 'System'
    };

    // Execute chunked writeBatch if Firestore is active
    let batchCommitted = false;
    try {
      const batch = writeBatch(db);

      // 1. Create Company
      const companyRef = doc(db, 'companies', companyId);
      batch.set(companyRef, cleanUndefined(newCompany));

      // 2. Create Contact
      const contactRef = doc(db, 'contacts', contactId);
      batch.set(contactRef, cleanUndefined(newContact));

      // 3. Update Activity Log
      if (entry.id) {
        const activityRef = doc(db, 'activity_logs', entry.id);
        const activityPayload: any = {
          company_id: companyId,
          company_name: cleanCompanyName,
          contact_id: contactId,
          contact_name: cleanContactName,
          contact_phone: phoneVal || entry.contact_phone || null,
          unlinked_name: deleteField(),
          unlinked_contact_info: deleteField(),
          updatedAt: now,
          last_modified_by_name: user?.name || 'System'
        };
        batch.update(activityRef, activityPayload);

        const callLogRef = doc(db, 'call_logs', entry.id);
        batch.set(callLogRef, activityPayload, { merge: true });
      }

      await batch.commit();
      batchCommitted = true;
    } catch (err) {
      console.warn('[ActivityLogRepository] Firestore writeBatch error/offline, fallback to safe functions:', err);
    }

    if (!batchCommitted) {
      await safeSetDoc('companies', companyId, newCompany);
      await safeSetDoc('contacts', contactId, newContact);

      if (entry.id) {
        const fallbackPayload = {
          company_id: companyId,
          company_name: cleanCompanyName,
          contact_id: contactId,
          contact_name: cleanContactName,
          contact_phone: phoneVal || entry.contact_phone || null,
          unlinked_name: null,
          unlinked_contact_info: null,
          updatedAt: now,
          last_modified_by_name: user?.name || 'System'
        };
        await safeUpdateDoc('activity_logs', entry.id, fallbackPayload);
        await safeUpdateDoc('call_logs', entry.id, fallbackPayload);
      }
    }

    // Persist to local stores and Sync Engine
    await CompanyRepository.saveCompany(newCompany);
    await CompanyRepository.saveContact(newContact);
    await ActivityLogRepository.save(updatedEntry);

    return { newCompany, newContact, updatedEntry };
  }
}

export const CallLogRepository = ActivityLogRepository;
