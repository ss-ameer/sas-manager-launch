import { Workspace, WorkspaceMember, UserProfile } from '../../types';
import { db, safeGetDoc, safeGetDocs, safeSetDoc } from '../../firebase';
import { collection, query, getDocs } from 'firebase/firestore';

function getLocalCache<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn(`Error reading localStorage key ${key}:`, e);
  }
  return defaultValue;
}

function setLocalCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error writing localStorage key ${key}:`, e);
  }
}

export class WorkspaceRepository {
  private static WORKSPACE_STORE = 'omni_workspaces';

  /**
   * Helper to check if a user possesses project-wide Admin / Super Admin privileges
   */
  public static isUserAdmin(user?: UserProfile | null): boolean {
    if (!user) return false;
    const role = (user.role || '').toString().toLowerCase().trim();
    return (
      role === 'admin' ||
      role === 'super admin' ||
      role === 'superadmin' ||
      Boolean(user.is_super_admin)
    );
  }

  /**
   * Fetch all active workspaces in the project (used for Admins and global sync)
   */
  public static async fetchAllWorkspaces(): Promise<Workspace[]> {
    try {
      const snap = await safeGetDocs('workspaces');
      if (!snap || snap.empty) {
        return getLocalCache<Workspace[]>(this.WORKSPACE_STORE, []);
      }
      const workspaces = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace));
      setLocalCache(this.WORKSPACE_STORE, workspaces);
      return workspaces;
    } catch (e) {
      console.warn('WorkspaceRepository: Could not fetch all workspaces, fallback to cache:', e);
      return getLocalCache<Workspace[]>(this.WORKSPACE_STORE, []);
    }
  }

  /**
   * Auto-Heal Workspace Membership:
   * When an Admin selects or switches into a workspace, verify if their current user.uid
   * is in workspace.members or workspace.member_ids. If missing, silently append their UID
   * and email via a background merge update so sub-collection security checks succeed.
   */
  public static async autoHealWorkspaceMembership(
    workspaceId: string,
    user: UserProfile,
    currentWorkspace?: Workspace | null
  ): Promise<void> {
    if (!workspaceId || !user?.uid || !this.isUserAdmin(user)) {
      return;
    }

    try {
      const userUid = user.uid;
      const userEmail = (user.email || '').toLowerCase().trim();
      const userName = user.full_name || user.displayName || user.username || 'Admin';

      let wsData: Workspace | null = currentWorkspace || null;
      if (!wsData || wsData.id !== workspaceId) {
        const wsDocSnap = await safeGetDoc('workspaces', workspaceId);
        if (wsDocSnap && wsDocSnap.exists()) {
          wsData = { id: wsDocSnap.id, ...wsDocSnap.data() } as Workspace;
        }
      }

      if (!wsData) return;

      // Check if user is already a member
      let isAlreadyMember = false;
      const existingMembersRaw = wsData.members;

      if (Array.isArray(existingMembersRaw)) {
        isAlreadyMember = existingMembersRaw.some((m: any) => {
          const mUid = m?.uid || m?.user_id;
          const mEmail = (m?.email || '').toLowerCase().trim();
          return (mUid && mUid === userUid) || (mEmail && userEmail && mEmail === userEmail);
        });
      } else if (existingMembersRaw && typeof existingMembersRaw === 'object') {
        isAlreadyMember = Boolean((existingMembersRaw as any)[userUid]);
      }

      // Check member_ids and member_emails
      const memberIds = Array.isArray((wsData as any).member_ids)
        ? [...(wsData as any).member_ids]
        : [];
      const memberEmails = Array.isArray(wsData.member_emails)
        ? [...wsData.member_emails]
        : [];

      if (memberIds.includes(userUid) || (userEmail && memberEmails.some((e) => e.toLowerCase() === userEmail))) {
        isAlreadyMember = true;
      }

      // If already membership is verified, verify workspace_members document exists in background
      const wmDocId = `wm_${workspaceId}_${userUid}`;
      const nowIso = new Date().toISOString();

      if (!isAlreadyMember) {
        // Append user to workspace members array
        const newMemberObj: WorkspaceMember = {
          uid: userUid,
          email: user.email,
          name: userName,
          full_name: userName,
          role: 'Admin',
          joined_at: nowIso
        };

        let updatedMembers: any;
        if (Array.isArray(existingMembersRaw)) {
          updatedMembers = [...existingMembersRaw, newMemberObj];
        } else if (existingMembersRaw && typeof existingMembersRaw === 'object') {
          updatedMembers = {
            ...existingMembersRaw,
            [userUid]: newMemberObj
          };
        } else {
          updatedMembers = [newMemberObj];
        }

        if (!memberIds.includes(userUid)) {
          memberIds.push(userUid);
        }
        if (userEmail && !memberEmails.some((e) => e.toLowerCase() === userEmail)) {
          memberEmails.push(user.email);
        }

        // Silent background merge to workspace document
        await safeSetDoc(
          'workspaces',
          workspaceId,
          {
            members: updatedMembers,
            member_ids: memberIds,
            member_emails: memberEmails
          },
          { merge: true }
        );
      }

      // Auto-heal workspace_members collection entry for subcollection rules
      const wmPayload = {
        id: wmDocId,
        workspace_id: workspaceId,
        workspaceId: workspaceId,
        user_id: userUid,
        uid: userUid,
        email: user.email,
        name: userName,
        role: 'Admin',
        status: 'active',
        joined_at: nowIso
      };
      await safeSetDoc('workspace_members', wmDocId, wmPayload, { merge: true });

      // Auto-heal user workspaceIds array if missing
      if (Array.isArray(user.workspaceIds) && !user.workspaceIds.includes(workspaceId)) {
        const updatedWorkspaceIds = [...user.workspaceIds, workspaceId];
        await safeSetDoc('users', userUid, { workspaceIds: updatedWorkspaceIds }, { merge: true });
      }
    } catch (err) {
      // Auto-heal is background, silent, non-blocking
      console.warn('WorkspaceRepository: Background auto-heal notice:', err);
    }
  }
}
