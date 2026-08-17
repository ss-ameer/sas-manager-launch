import { db, auth } from '../firebase';
import { collection, getDocs, doc, query, where, writeBatch } from 'firebase/firestore';
import { deleteUser, signOut } from 'firebase/auth';
import { UserProfile, Workspace } from '../types';
import { getUserWorkspaceRole } from '../utils/permissions';
import { Category2WorkspaceInfo, HandoverResolution } from '../components/WorkspaceHandoverWizardModal';

export interface DeletionCategorizationResult {
  soleAdminNukeIds: string[];
  adminMultiMemberList: Category2WorkspaceInfo[];
  nonAdminExits: Workspace[];
  requiresHandover: boolean;
}

/**
 * Categorize user's workspaces strictly using per-workspace role logic.
 */
export async function categorizeUserWorkspacesForDeletion(
  currentUser: UserProfile
): Promise<DeletionCategorizationResult> {
  const currentUserAuth = auth.currentUser;
  const userEmail = (currentUser.email || currentUserAuth?.email || '').toLowerCase().trim();
  const userUid = currentUser.uid || currentUserAuth?.uid || '';

  // 1. Fetch all workspaces
  const wsSnap = await getDocs(collection(db, 'workspaces'));
  const allWorkspaces: Workspace[] = wsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace));

  // 2. Fetch all workspace_members
  const wmSnap = await getDocs(collection(db, 'workspace_members'));
  const allMembersDocs = wmSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const soleAdminNukeIds: string[] = [];
  const adminMultiMemberList: Category2WorkspaceInfo[] = [];
  const nonAdminExits: Workspace[] = [];

  for (const ws of allWorkspaces) {
    const wsMembersDocs = allMembersDocs.filter(
      (m: any) => (m.workspace_id === ws.id || m.workspaceId === ws.id) && m.status !== 'inactive'
    );

    const memberMap = new Map<string, { uid?: string; email: string; name?: string; role?: string }>();

    wsMembersDocs.forEach((m: any) => {
      const mEmail = (m.email || '').toLowerCase().trim();
      const mUid = m.user_id || m.uid;
      const key = mUid || mEmail;
      if (key) {
        memberMap.set(key, { uid: mUid, email: mEmail, name: m.name || m.full_name, role: m.role });
      }
    });

    if (Array.isArray(ws.members)) {
      ws.members.forEach((m: any) => {
        const mEmail = (m.email || '').toLowerCase().trim();
        const mUid = m.uid;
        const key = mUid || mEmail;
        if (key && !memberMap.has(key)) {
          memberMap.set(key, { uid: mUid, email: mEmail, name: m.name, role: m.role });
        }
      });
    }

    if (Array.isArray(ws.member_emails)) {
      ws.member_emails.forEach((e: string) => {
        const mEmail = (e || '').toLowerCase().trim();
        if (mEmail && !memberMap.has(mEmail)) {
          memberMap.set(mEmail, { email: mEmail, name: mEmail, role: 'Member' });
        }
      });
    }

    const isUserInWs =
      memberMap.has(userUid) ||
      (userEmail && memberMap.has(userEmail)) ||
      ws.created_by === currentUser.full_name ||
      ws.created_by === userEmail ||
      ws.created_by === userUid ||
      (ws as any).created_by_uid === userUid;

    if (isUserInWs) {
      const userWsRole = getUserWorkspaceRole(currentUser, ws.id, ws);
      const isUserAdminInWs = userWsRole === 'Admin';

      const otherMembers = Array.from(memberMap.values()).filter((m) => {
        if (m.uid && m.uid === userUid) return false;
        if (m.email && m.email.toLowerCase().trim() === userEmail) return false;
        return true;
      });

      if (!isUserAdminInWs) {
        nonAdminExits.push(ws);
      } else if (otherMembers.length === 0) {
        soleAdminNukeIds.push(ws.id);
      } else {
        adminMultiMemberList.push({
          workspace: ws,
          otherMembers
        });
      }
    }
  }

  return {
    soleAdminNukeIds,
    adminMultiMemberList,
    nonAdminExits,
    requiresHandover: adminMultiMemberList.length > 0
  };
}

/**
 * Execute final cascade delete and account scrub.
 */
export async function executeFinalCascadeDeleteAndScrub(
  currentUser: UserProfile,
  cat1WsIds: string[],
  resolutions: Record<string, HandoverResolution> = {},
  cat2WsListOverride: Category2WorkspaceInfo[] = [],
  nonAdminExitWsOverride: Workspace[] = []
) {
  const currentUserAuth = auth.currentUser;
  const userEmail = (currentUser.email || currentUserAuth?.email || '').toLowerCase().trim();
  const userUid = currentUser.uid || currentUserAuth?.uid;

  if (!userUid || userUid.startsWith('local_')) {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/';
    return;
  }

  let currentBatch = writeBatch(db);
  let opCount = 0;

  const safeAddBatchOp = async (type: 'delete' | 'update' | 'set', docRef: any, data?: any) => {
    if (type === 'delete') currentBatch.delete(docRef);
    else if (type === 'update') currentBatch.update(docRef, data);
    else if (type === 'set') currentBatch.set(docRef, data);

    opCount++;
    if (opCount >= 350) {
      await currentBatch.commit();
      currentBatch = writeBatch(db);
      opCount = 0;
    }
  };

  // 1. Non-Admin Member Exits in ANY Workspace
  for (const ws of nonAdminExitWsOverride) {
    const wsRef = doc(db, 'workspaces', ws.id);
    let updatedMembers = Array.isArray(ws.members) ? [...ws.members] : [];
    let updatedMemberEmails = Array.isArray(ws.member_emails) ? [...ws.member_emails] : [];

    updatedMembers = updatedMembers.filter(
      (m) => m.uid !== userUid && (!m.email || m.email.toLowerCase().trim() !== userEmail)
    );
    if (userEmail) {
      updatedMemberEmails = updatedMemberEmails.filter(
        (e) => typeof e === 'string' && e.toLowerCase().trim() !== userEmail
      );
    }

    await safeAddBatchOp('update', wsRef, {
      members: updatedMembers,
      member_emails: updatedMemberEmails
    });

    if (userEmail) {
      const wmSnap = await getDocs(
        query(collection(db, 'workspace_members'), where('workspace_id', '==', ws.id), where('email', '==', userEmail))
      );
      wmSnap.forEach((d) => safeAddBatchOp('delete', d.ref));
    }
    if (userUid) {
      const wmSnap = await getDocs(
        query(collection(db, 'workspace_members'), where('workspace_id', '==', ws.id), where('user_id', '==', userUid))
      );
      wmSnap.forEach((d) => safeAddBatchOp('delete', d.ref));
    }

    if (userEmail) {
      const spSnap = await getDocs(
        query(collection(db, 'salespersons'), where('workspace_id', '==', ws.id), where('email', '==', userEmail))
      );
      spSnap.forEach((d) => safeAddBatchOp('delete', d.ref));
    }
    if (userUid) {
      const spSnap = await getDocs(
        query(collection(db, 'salespersons'), where('workspace_id', '==', ws.id), where('uid', '==', userUid))
      );
      spSnap.forEach((d) => safeAddBatchOp('delete', d.ref));
    }
  }

  // 2. Single-Member & Nuked Multi-Member Workspaces Cascade Wipe
  const cat2NukeIds: string[] = [];
  const cat2TransferEntries: Array<{ ws: Workspace; res: HandoverResolution }> = [];

  cat2WsListOverride.forEach((item) => {
    const res = resolutions[item.workspace.id];
    if (res) {
      if (res.action === 'delete') {
        cat2NukeIds.push(item.workspace.id);
      } else if (res.action === 'transfer') {
        cat2TransferEntries.push({ ws: item.workspace, res });
      }
    }
  });

  const allNukeWsIds = Array.from(new Set([...cat1WsIds, ...cat2NukeIds]));

  const targetCollections = [
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

  for (const wsId of allNukeWsIds) {
    await safeAddBatchOp('delete', doc(db, 'workspaces', wsId));

    for (const colName of targetCollections) {
      const snap1 = await getDocs(query(collection(db, colName), where('workspace_id', '==', wsId)));
      snap1.forEach((d) => safeAddBatchOp('delete', d.ref));

      const snap2 = await getDocs(query(collection(db, colName), where('workspaceId', '==', wsId)));
      snap2.forEach((d) => safeAddBatchOp('delete', d.ref));
    }
  }

  // 3. Transferred Workspaces
  for (const { ws, res } of cat2TransferEntries) {
    const targetOwner = res.newOwnerUidOrEmail || '';
    const wsRef = doc(db, 'workspaces', ws.id);

    let updatedMembers = Array.isArray(ws.members) ? [...ws.members] : [];
    let updatedMemberEmails = Array.isArray(ws.member_emails) ? [...ws.member_emails] : [];

    updatedMembers = updatedMembers.map((m) => {
      if ((m.uid && m.uid === targetOwner) || (m.email && m.email.toLowerCase().trim() === targetOwner.toLowerCase().trim())) {
        return { ...m, role: 'Admin' };
      }
      return m;
    });

    updatedMembers = updatedMembers.filter(
      (m) => m.uid !== userUid && (!m.email || m.email.toLowerCase().trim() !== userEmail)
    );
    if (userEmail) {
      updatedMemberEmails = updatedMemberEmails.filter(
        (e) => typeof e === 'string' && e.toLowerCase().trim() !== userEmail
      );
    }

    await safeAddBatchOp('update', wsRef, {
      members: updatedMembers,
      member_emails: updatedMemberEmails,
      created_by: targetOwner,
      created_by_email: targetOwner,
      created_by_uid: targetOwner
    });

    if (targetOwner) {
      const wmTargetSnap = await getDocs(
        query(collection(db, 'workspace_members'), where('workspace_id', '==', ws.id))
      );
      wmTargetSnap.forEach((d) => {
        const dData = d.data();
        if (
          dData.user_id === targetOwner ||
          dData.uid === targetOwner ||
          dData.email?.toLowerCase().trim() === targetOwner.toLowerCase().trim()
        ) {
          safeAddBatchOp('update', d.ref, { role: 'Admin', status: 'active' });
        }
        if (
          dData.user_id === userUid ||
          dData.uid === userUid ||
          dData.email?.toLowerCase().trim() === userEmail
        ) {
          safeAddBatchOp('delete', d.ref);
        }
      });
    }
  }

  // 4. Global Identity & Membership Scrub
  if (userEmail) {
    const wmSnap1 = await getDocs(query(collection(db, 'workspace_members'), where('email', '==', userEmail)));
    wmSnap1.forEach((d) => safeAddBatchOp('delete', d.ref));

    const spSnap1 = await getDocs(query(collection(db, 'salespersons'), where('email', '==', userEmail)));
    spSnap1.forEach((d) => safeAddBatchOp('delete', d.ref));
  }
  if (userUid) {
    const wmSnap2 = await getDocs(query(collection(db, 'workspace_members'), where('user_id', '==', userUid)));
    wmSnap2.forEach((d) => safeAddBatchOp('delete', d.ref));

    const spSnap2 = await getDocs(query(collection(db, 'salespersons'), where('uid', '==', userUid)));
    spSnap2.forEach((d) => safeAddBatchOp('delete', d.ref));

    await safeAddBatchOp('delete', doc(db, 'users', userUid));
  }

  if (opCount > 0) {
    await currentBatch.commit();
  }

  if (currentUserAuth) {
    await deleteUser(currentUserAuth);
  }

  localStorage.clear();
  sessionStorage.clear();
  await signOut(auth).catch(() => {});
  window.location.href = '/';
}
