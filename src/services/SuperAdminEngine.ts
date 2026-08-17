import {
  collection,
  getDocs,
  doc,
  writeBatch,
  query,
  where,
  DocumentReference,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { downloadJsonFile } from '../utils/download';

export interface StagingOrphanedDocsResult {
  companies: any[];
  contacts: any[];
  enquiries: any[];
  call_logs: any[];
  products: any[];
  salespersons: any[];
  dropdown_configs: any[];
  dropdown_enquiry_sources: any[];
  allFlat: Array<{ _collection: string; id: string; [key: string]: any }>;
}

export const TARGET_COLLECTIONS = [
  'companies',
  'contacts',
  'enquiries',
  'call_logs',
  'products',
  'salespersons',
  'dropdown_configs',
  'dropdown_enquiry_sources'
] as const;

export const ALL_BROWSER_COLLECTIONS = [
  'users',
  'workspaces',
  'workspace_members',
  'companies',
  'contacts',
  'enquiries',
  'call_logs',
  'products',
  'salespersons',
  'dropdown_configs',
  'dropdown_enquiry_sources'
] as const;

export type TargetCollectionName = (typeof ALL_BROWSER_COLLECTIONS)[number];

// Chunked batch executor (Max 350 ops per batch)
export async function commitInBatches(
  ops: Array<{ type: 'set' | 'update' | 'delete'; ref: DocumentReference; data?: any }>
) {
  const BATCH_SIZE = 350;
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.type === 'set') {
        batch.set(op.ref, op.data, { merge: true });
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(op.ref);
      }
    }
    await batch.commit();
  }
}

/**
  * 1. getUnassignedDocs: Queries all records where workspace_id == 'unassigned'
  */
export async function getUnassignedDocs(): Promise<StagingOrphanedDocsResult> {
  const result: StagingOrphanedDocsResult = {
    companies: [],
    contacts: [],
    enquiries: [],
    call_logs: [],
    products: [],
    salespersons: [],
    dropdown_configs: [],
    dropdown_enquiry_sources: [],
    allFlat: []
  };

  for (const colName of TARGET_COLLECTIONS) {
    try {
      const q = query(collection(db, colName), where('workspace_id', '==', 'unassigned'));
      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, _collection: colName, ...d.data() }));
      (result as any)[colName] = docs;
      result.allFlat.push(...docs);
    } catch (err) {
      console.warn(`Error querying unassigned docs for ${colName}:`, err);
    }
  }

  return result;
}

/**
  * 2. getOrphanedDocs: Queries all records where workspace_id is missing or does not match an active workspace document
  */
export async function getOrphanedDocs(): Promise<StagingOrphanedDocsResult> {
  const result: StagingOrphanedDocsResult = {
    companies: [],
    contacts: [],
    enquiries: [],
    call_logs: [],
    products: [],
    salespersons: [],
    dropdown_configs: [],
    dropdown_enquiry_sources: [],
    allFlat: []
  };

  // Get all active workspaces
  const wsSnap = await getDocs(collection(db, 'workspaces'));
  const activeWsIds = new Set(wsSnap.docs.map((d) => d.id));

  for (const colName of TARGET_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      snap.docs.forEach((d) => {
        const data = d.data();
        const wsId = data.workspace_id;
        const isMissing = !wsId || String(wsId).trim() === '';
        const isNotUnassigned = wsId !== 'unassigned';
        const isUnknownWs = isNotUnassigned && !activeWsIds.has(wsId);

        if (isMissing || isUnknownWs) {
          const docObj = { id: d.id, _collection: colName, ...data };
          (result as any)[colName].push(docObj);
          result.allFlat.push(docObj);
        }
      });
    } catch (err) {
      console.warn(`Error querying orphaned docs for ${colName}:`, err);
    }
  }

  return result;
}

/**
  * 3. exportTargetedJson: Downloads granular JSON backups for workspace, orphaned, or unassigned scopes
  */
export async function exportTargetedJson(scope: {
  type: 'workspace' | 'orphaned' | 'unassigned';
  workspaceId?: string;
  collectionName?: string;
}) {
  let exportData: Record<string, any> = {
    exported_at: new Date().toISOString(),
    export_scope: scope
  };

  if (scope.type === 'unassigned') {
    const unassigned = await getUnassignedDocs();
    if (scope.collectionName && TARGET_COLLECTIONS.includes(scope.collectionName as any)) {
      exportData[scope.collectionName] = (unassigned as any)[scope.collectionName];
    } else {
      TARGET_COLLECTIONS.forEach((col) => {
        exportData[col] = (unassigned as any)[col];
      });
    }
  } else if (scope.type === 'orphaned') {
    const orphaned = await getOrphanedDocs();
    if (scope.collectionName && TARGET_COLLECTIONS.includes(scope.collectionName as any)) {
      exportData[scope.collectionName] = (orphaned as any)[scope.collectionName];
    } else {
      TARGET_COLLECTIONS.forEach((col) => {
        exportData[col] = (orphaned as any)[col];
      });
    }
  } else if (scope.type === 'workspace' && scope.workspaceId) {
    exportData.workspace_id = scope.workspaceId;
    const colsToFetch = scope.collectionName
      ? [scope.collectionName]
      : [...TARGET_COLLECTIONS];

    for (const colName of colsToFetch) {
      try {
        const q = query(collection(db, colName), where('workspace_id', '==', scope.workspaceId));
        const snap = await getDocs(q);
        exportData[colName] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn(`Error fetching ${colName} for workspace ${scope.workspaceId}:`, err);
        exportData[colName] = [];
      }
    }
  }

  const filename = `superadmin_export_${scope.type}_${scope.workspaceId || scope.collectionName || 'all'}_${Date.now()}.json`;
  downloadJsonFile(filename, exportData);
}

/**
  * 4. importToStagingBuffer: Writes incoming JSON records into Firestore with workspace_id = 'unassigned' in chunked batches
  */
export async function importToStagingBuffer(jsonPayload: any): Promise<{ success: boolean; count: number }> {
  const ops: Array<{ type: 'set'; ref: DocumentReference; data: any }> = [];
  let count = 0;

  const processRecord = (colName: string, item: any) => {
    if (!item || typeof item !== 'object') return;
    const docId = item.id || doc(collection(db, colName)).id;
    const cleanItem = { ...item };
    delete cleanItem.id;
    delete cleanItem._collection;

    cleanItem.workspace_id = 'unassigned';
    cleanItem.updatedAt = new Date().toISOString();
    if (!cleanItem.createdAt) cleanItem.createdAt = new Date().toISOString();

    ops.push({
      type: 'set',
      ref: doc(db, colName, docId),
      data: cleanItem
    });
    count++;
  };

  if (Array.isArray(jsonPayload)) {
    // Array of documents - attempt to place in 'companies' or fallback
    jsonPayload.forEach((item) => {
      const col = item._collection || 'companies';
      processRecord(col, item);
    });
  } else if (jsonPayload && typeof jsonPayload === 'object') {
    // Keyed by collection name
    TARGET_COLLECTIONS.forEach((colName) => {
      if (Array.isArray(jsonPayload[colName])) {
        jsonPayload[colName].forEach((item: any) => processRecord(colName, item));
      }
    });

    // If single object
    if (jsonPayload._collection && jsonPayload.id) {
      processRecord(jsonPayload._collection, jsonPayload);
    }
  }

  if (ops.length > 0) {
    await commitInBatches(ops);
  }

  return { success: true, count };
}

/**
  * Helper: Validates salesperson ID/initials against target workspace
  */
async function getTargetWorkspaceSalespersons(targetWorkspaceId: string): Promise<Set<string>> {
  const validSpSet = new Set<string>();
  if (targetWorkspaceId === 'unassigned') return validSpSet;

  try {
    const q = query(collection(db, 'salespersons'), where('workspace_id', '==', targetWorkspaceId));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data();
      validSpSet.add(d.id);
      if (data.initials) validSpSet.add(String(data.initials).toUpperCase());
      if (data.full_name) validSpSet.add(String(data.full_name).toLowerCase());
    });
  } catch (err) {
    console.warn(`Error getting salespersons for workspace ${targetWorkspaceId}:`, err);
  }

  return validSpSet;
}

/**
  * 5. reassignDoc: Reassigns document workspace_id (shallow or cascade)
  */
export async function reassignDoc(
  collectionName: string,
  docId: string,
  targetWorkspaceId: string,
  mode: 'shallow' | 'cascade' = 'shallow'
) {
  const ops: Array<{ type: 'update'; ref: DocumentReference; data: any }> = [];
  const targetSpSet = await getTargetWorkspaceSalespersons(targetWorkspaceId);

  const cleanSalespersonField = (data: any): Record<string, any> => {
    const updatePayload: Record<string, any> = { workspace_id: targetWorkspaceId };

    const spId = data.salesperson_id || data.sales_person_id || data.sales_person;
    if (spId && targetWorkspaceId !== 'unassigned') {
      const spStr = String(spId);
      const isValid =
        targetSpSet.has(spStr) ||
        targetSpSet.has(spStr.toUpperCase()) ||
        targetSpSet.has(spStr.toLowerCase());

      if (!isValid) {
        updatePayload.salesperson_id = 'unassigned';
        if (data.sales_person_id) updatePayload.sales_person_id = 'unassigned';
        if (data.sales_person) updatePayload.sales_person = 'Unassigned';
      }
    }
    return updatePayload;
  };

  const parentRef = doc(db, collectionName, docId);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) {
    throw new Error(`Document ${docId} in ${collectionName} does not exist.`);
  }

  const parentData = parentSnap.data();
  ops.push({
    type: 'update',
    ref: parentRef,
    data: cleanSalespersonField(parentData)
  });

  if (mode === 'cascade') {
    if (collectionName === 'companies') {
      // Cascade to Contacts, Enquiries, Call Logs
      const contactsSnap = await getDocs(
        query(collection(db, 'contacts'), where('company_id', '==', docId))
      );
      contactsSnap.forEach((d) => {
        ops.push({
          type: 'update',
          ref: d.ref,
          data: cleanSalespersonField(d.data())
        });
      });

      const enquiriesSnap = await getDocs(
        query(collection(db, 'enquiries'), where('company_id', '==', docId))
      );
      enquiriesSnap.forEach((d) => {
        ops.push({
          type: 'update',
          ref: d.ref,
          data: cleanSalespersonField(d.data())
        });
      });

      const callLogsSnap = await getDocs(
        query(collection(db, 'call_logs'), where('company_id', '==', docId))
      );
      callLogsSnap.forEach((d) => {
        ops.push({
          type: 'update',
          ref: d.ref,
          data: cleanSalespersonField(d.data())
        });
      });
    } else if (collectionName === 'enquiries') {
      // Cascade to Call Logs linked to this enquiry
      const callLogsSnap = await getDocs(
        query(collection(db, 'call_logs'), where('enquiry_id', '==', docId))
      );
      callLogsSnap.forEach((d) => {
        ops.push({
          type: 'update',
          ref: d.ref,
          data: cleanSalespersonField(d.data())
        });
      });
    }
  }

  await commitInBatches(ops);
}

/**
  * 6. purgeOrphanedData: Executes chunked batch deletion across all orphaned documents
  */
export async function purgeOrphanedData(): Promise<{ success: boolean; deletedCount: number }> {
  const orphaned = await getOrphanedDocs();
  const ops: Array<{ type: 'delete'; ref: DocumentReference }> = [];

  orphaned.allFlat.forEach((item) => {
    if (item._collection && item.id) {
      ops.push({
        type: 'delete',
        ref: doc(db, item._collection, item.id)
      });
    }
  });

  if (ops.length > 0) {
    await commitInBatches(ops);
  }

  return { success: true, deletedCount: ops.length };
}

/**
  * Bulk actions for SuperAdminConsole
  */
export async function bulkReassignDocs(
  items: Array<{ _collection: string; id: string }>,
  targetWorkspaceId: string,
  mode: 'shallow' | 'cascade' = 'shallow'
) {
  for (const item of items) {
    await reassignDoc(item._collection, item.id, targetWorkspaceId, mode);
  }
}

export async function bulkDeleteDocs(items: Array<{ _collection: string; id: string }>) {
  const ops: Array<{ type: 'delete'; ref: DocumentReference }> = items.map((item) => ({
    type: 'delete',
    ref: doc(db, item._collection, item.id)
  }));
  await commitInBatches(ops);
}

export async function duplicateDoc(collectionName: string, docId: string): Promise<string> {
  const srcRef = doc(db, collectionName, docId);
  const snap = await getDoc(srcRef);
  if (!snap.exists()) throw new Error('Document does not exist');

  const data = snap.data();
  const newId = doc(collection(db, collectionName)).id;
  const newData = {
    ...data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    display_name: data.display_name ? `${data.display_name} (Copy)` : undefined,
    canonical_name: data.canonical_name ? `${data.canonical_name}_copy` : undefined,
    full_name: data.full_name ? `${data.full_name} (Copy)` : undefined,
    quote_ref_no: data.quote_ref_no ? `${data.quote_ref_no}-COPY` : undefined
  };

  await commitInBatches([{ type: 'set', ref: doc(db, collectionName, newId), data: newData }]);
  return newId;
}

/**
 * Direct Workspace Lifecycle Management
 */
export async function renameWorkspace(wsId: string, newName: string) {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Workspace name cannot be empty');
  const wsRef = doc(db, 'workspaces', wsId);
  await commitInBatches([
    {
      type: 'update',
      ref: wsRef,
      data: { name: trimmed, updatedAt: new Date().toISOString() }
    }
  ]);
}

export async function changeWorkspaceOwner(
  wsId: string,
  newOwner: { uid: string; email: string; full_name?: string }
) {
  const wsRef = doc(db, 'workspaces', wsId);
  const ownerName = newOwner.full_name || newOwner.email || newOwner.uid;
  await commitInBatches([
    {
      type: 'update',
      ref: wsRef,
      data: {
        created_by: ownerName,
        created_by_email: newOwner.email,
        created_by_uid: newOwner.uid,
        updatedAt: new Date().toISOString()
      }
    }
  ]);
}

export async function cascadeDeleteWorkspace(wsId: string): Promise<{ success: boolean; deletedCount: number }> {
  const ops: Array<{ type: 'delete'; ref: DocumentReference }> = [];

  // 1. Delete workspace document itself
  ops.push({ type: 'delete', ref: doc(db, 'workspaces', wsId) });

  // 2. Cascade erase associated records across domain collections
  const collectionsToWipe = [
    'companies',
    'contacts',
    'enquiries',
    'call_logs',
    'products',
    'salespersons',
    'dropdown_configs',
    'dropdown_enquiry_sources',
    'workspace_members'
  ];

  for (const colName of collectionsToWipe) {
    try {
      const q = query(collection(db, colName), where('workspace_id', '==', wsId));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        ops.push({ type: 'delete', ref: d.ref });
      });
    } catch (err) {
      console.warn(`Error querying ${colName} for workspace cascade delete ${wsId}:`, err);
    }
  }

  if (ops.length > 0) {
    await commitInBatches(ops);
  }

  return { success: true, deletedCount: ops.length };
}

/**
 * God Mode Workspaces Management
 */
export async function getAllGodModeWorkspaces(): Promise<Array<{ id: string; [key: string]: any }>> {
  const snap = await getDocs(collection(db, 'workspaces'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Global Users Management
 */
export async function getAllGlobalUsers(): Promise<Array<{ id: string; [key: string]: any }>> {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function toggleUserSuperAdmin(userId: string, currentStatus: boolean) {
  const userRef = doc(db, 'users', userId);
  await commitInBatches([
    {
      type: 'update',
      ref: userRef,
      data: {
        is_super_admin: !currentStatus,
        updatedAt: new Date().toISOString()
      }
    }
  ]);
}

export async function deleteUserAndScrub(
  userId: string,
  userEmail?: string
): Promise<{ success: boolean; deletedCount: number }> {
  const ops: Array<{ type: 'delete'; ref: DocumentReference }> = [];

  // 1. Delete user profile document
  ops.push({ type: 'delete', ref: doc(db, 'users', userId) });

  // 2. Scrub matching workspace_members entries
  try {
    const wmSnap = await getDocs(collection(db, 'workspace_members'));
    wmSnap.docs.forEach((d) => {
      const data = d.data();
      const matchId = data.user_id === userId || data.uid === userId || d.id === userId;
      const matchEmail =
        userEmail &&
        data.email &&
        data.email.toLowerCase().trim() === userEmail.toLowerCase().trim();
      if (matchId || matchEmail) {
        ops.push({ type: 'delete', ref: d.ref });
      }
    });
  } catch (err) {
    console.warn('Error scrubbing workspace_members for user:', userId, err);
  }

  // 3. Scrub matching salespersons entries
  try {
    const spSnap = await getDocs(collection(db, 'salespersons'));
    spSnap.docs.forEach((d) => {
      const data = d.data();
      const matchId = data.user_id === userId || data.user_uid === userId || d.id === userId;
      const matchEmail =
        userEmail &&
        data.email &&
        data.email.toLowerCase().trim() === userEmail.toLowerCase().trim();
      if (matchId || matchEmail) {
        ops.push({ type: 'delete', ref: d.ref });
      }
    });
  } catch (err) {
    console.warn('Error scrubbing salespersons for user:', userId, err);
  }

  if (ops.length > 0) {
    await commitInBatches(ops);
  }

  return { success: true, deletedCount: ops.length };
}
