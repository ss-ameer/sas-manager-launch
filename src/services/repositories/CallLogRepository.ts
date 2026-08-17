import { writeBatch, doc, deleteField } from 'firebase/firestore';
import { db, cleanUndefined, safeGetDocs, safeSetDoc, safeUpdateDoc } from '../../firebase';
import { ActivityLogEntry, Company, Contact } from '../../types';
import { syncEngine } from '../SyncEngine';
import { getFromLocalStore, saveToLocalStore } from '../db';
import { CompanyRepository } from './CompanyRepository';

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

export class ActivityLogRepository {
  private static STORE_NAME = 'activity_logs';

  public static async getAllLocal(): Promise<ActivityLogEntry[]> {
    return getFromLocalStore<ActivityLogEntry>(this.STORE_NAME);
  }

  public static async saveLocalCache(items: ActivityLogEntry[]): Promise<void> {
    await saveToLocalStore(this.STORE_NAME, items);
  }

  public static async fetchWorkspaceCallLogsFromCloud(workspaceId: string): Promise<ActivityLogEntry[]> {
    try {
      let snap = await safeGetDocs('activity_logs');
      if (!snap || snap.empty) {
        snap = await safeGetDocs('call_logs');
      }
      if (!snap || snap.empty) return this.getAllLocal();
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLogEntry));
      const filtered = docs.filter((log) =>
        log.workspace_id === workspaceId || (!log.workspace_id && workspaceId === 'ws_default')
      );
      await this.saveLocalCache(filtered);
      return filtered;
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

  public static async softDelete(id: string, user?: { uid: string; name: string }): Promise<void> {
    const current = await this.getAllLocal();
    const idx = current.findIndex((item) => item.id === id);
    if (idx === -1) return;

    const updated: ActivityLogEntry = {
      ...current[idx],
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by_uid: user?.uid,
      deleted_by_name: user?.name
    };

    await this.save(updated);
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

  public static async delete(id: string, user?: { uid: string; name: string }): Promise<void> {
    return this.softDelete(id, user);
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
