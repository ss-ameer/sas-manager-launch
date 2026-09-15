import { UserProfile, UserRole, WorkspaceRole, Workspace, Enquiry, CallLogEntry, Salesperson } from '../types';

/**
 * Normalizes an arbitrary role string to the canonical 3-tier WorkspaceRole:
 * 'Admin' | 'Member' | 'Viewer'
 */
export function normalizeWorkspaceRole(rawRole: any): WorkspaceRole | null {
  if (!rawRole) return null;
  const r = String(rawRole).toLowerCase().trim();
  if (r === 'admin' || r === 'owner' || r === 'superadmin') return 'Admin';
  if (r === 'member' || r === 'sales_rep' || r === 'salesperson' || r === 'engineer') return 'Member';
  if (r === 'viewer' || r === 'guest' || r === 'auditor' || r === 'readonly') return 'Viewer';
  if (rawRole === 'Admin' || rawRole === 'Member' || rawRole === 'Viewer') return rawRole;
  return 'Member';
}

/**
 * Evaluates whether a user is an active member or owner of a given workspace.
 * Used to cleanly partition workspaces into "My Workspaces" vs "System Workspaces".
 */
export function isUserInWorkspace(
  user: UserProfile | undefined | null,
  workspace: Workspace | undefined | null
): boolean {
  if (!user || !workspace) return false;
  const uid = (user.uid || (user as any).id || '').trim();
  const email = (user.email || '').toLowerCase().trim();

  // 1. Owner or Creator
  const ownerUid = (
    (workspace as any).owner_id ||
    workspace.owner_uid ||
    (workspace as any).ownerUid ||
    (workspace as any).created_by_uid ||
    (workspace as any).creator_id ||
    ''
  ).trim();
  if (ownerUid && uid && ownerUid === uid) return true;

  const createdBy = (workspace.created_by || '').trim();
  if (
    createdBy &&
    ((uid && createdBy === uid) || (email && createdBy.toLowerCase() === email))
  ) {
    return true;
  }

  // 2. Explicit member_ids array
  const memberIds = (workspace as any).member_ids;
  if (Array.isArray(memberIds) && uid && memberIds.includes(uid)) {
    return true;
  }

  // 3. Workspace members collection/roster (array or record)
  if (workspace.members) {
    if (Array.isArray(workspace.members)) {
      const isListed = workspace.members.some((m: any) => {
        if (!m) return false;
        if (typeof m === 'string') return m === uid;
        if (typeof m === 'object') {
          const mUid = (m.uid || m.user_id || m.id || '').trim();
          const mEmail = (m.email || '').toLowerCase().trim();
          return (mUid && uid && mUid === uid) || (mEmail && email && mEmail === email);
        }
        return false;
      });
      if (isListed) return true;
    } else if (typeof workspace.members === 'object') {
      const membersMap = workspace.members as Record<string, any>;
      if (uid && membersMap[uid]) return true;
      if (user.id && membersMap[user.id]) return true;
      if (email && membersMap[email]) return true;
    }
  }

  // 4. member_emails list
  if (email && Array.isArray(workspace.member_emails)) {
    if (workspace.member_emails.some((e: string) => typeof e === 'string' && e.toLowerCase().trim() === email)) {
      return true;
    }
  }

  // 5. User Profile assigned workspaces list
  if (uid && Array.isArray(user.workspaceIds) && user.workspaceIds.includes(workspace.id)) {
    return true;
  }

  // 6. User default workspace assignment
  if (user.defaultWorkspaceId && user.defaultWorkspaceId === workspace.id) {
    return true;
  }

  // 7. System default workspace fallback
  if (workspace.id === 'ws_default') {
    return true;
  }

  return false;
}

/**
 * Single Source of Truth for Active Workspace Role:
 * Resolves the user's role in the active workspace strictly using the 3-tier model:
 * 'Admin' | 'Member' | 'Viewer'.
 *
 * Priority Resolution:
 * 1. Super Admin: full global Admin privileges across all workspaces.
 * 2. If user is workspace owner/creator -> 'Admin'.
 * 3. Derived strictly from the selected workspace's roster/member data (activeWorkspace.members[uid].role).
 * 4. Fallback: Default to 'Member' for legacy members, or 'Viewer' if unlisted.
 */
export function getUserWorkspaceRole(
  user: UserProfile | undefined | null,
  workspaceOrId?: Workspace | string | null,
  activeWorkspace?: Workspace | any | null
): WorkspaceRole {
  if (!user) return 'Viewer';
  // Super Admin: override all permission checks to granting full read/write/admin rights in every workspace
  if (isSuperAdmin(user)) return 'Admin';

  // Defensive resolution of Workspace object & Target Workspace ID
  let workspace: Workspace | null = null;
  if (workspaceOrId && typeof workspaceOrId === 'object') {
    workspace = workspaceOrId as Workspace;
  } else if (activeWorkspace && typeof activeWorkspace === 'object') {
    if (!workspaceOrId || typeof workspaceOrId !== 'string' || workspaceOrId === activeWorkspace.id) {
      workspace = activeWorkspace as Workspace;
    }
  }

  const targetWsId =
    (typeof workspaceOrId === 'string' && workspaceOrId) ||
    workspace?.id ||
    user.defaultWorkspaceId ||
    'ws_default';

  const userUid = (user.uid || (user as any).id || '').trim();
  const userEmail = (user.email || '').toLowerCase().trim();
  const userUsername = (user.username || '').toLowerCase().trim();

  // 1. If user is workspace owner_uid (or creator) -> 'Admin'
  if (workspace) {
    const ownerUid = (
      (workspace as any).owner_id ||
      workspace.owner_uid ||
      (workspace as any).ownerUid ||
      ''
    ).trim();
    if (ownerUid && userUid && ownerUid === userUid) {
      return 'Admin';
    }

    const createdByUid = (
      (workspace as any).created_by_uid ||
      (workspace as any).createdByUid ||
      (workspace as any).creator_id ||
      ''
    ).trim();
    if (createdByUid && userUid && createdByUid === userUid) {
      return 'Admin';
    }

    const createdBy = (workspace.created_by || '').trim();
    if (
      createdBy &&
      ((userUid && createdBy === userUid) ||
        (userEmail && createdBy.toLowerCase() === userEmail) ||
        (userUsername && createdBy.toLowerCase() === userUsername))
    ) {
      return 'Admin';
    }
  }

  // 2. Derive active user's role strictly from the selected workspace's roster/member data (activeWorkspace.members[uid].role)
  if (workspace && workspace.members) {
    // 2A. Key-value dictionary / record: workspace.members[user.uid]?.role
    if (!Array.isArray(workspace.members) && typeof workspace.members === 'object') {
      const membersMap = workspace.members as Record<string, any>;
      const memberEntry =
        (userUid && membersMap[userUid]) ||
        (user.id && membersMap[user.id]) ||
        (userEmail && membersMap[userEmail]);
      if (memberEntry) {
        const rawRole =
          typeof memberEntry === 'string'
            ? memberEntry
            : memberEntry.role || memberEntry.workspace_roles?.[targetWsId];
        const normalized = normalizeWorkspaceRole(rawRole);
        if (normalized) return normalized;
        return 'Member';
      }
    }

    // 2B. Array roster: workspace.members.find(...)
    if (Array.isArray(workspace.members)) {
      const memberItem = workspace.members.find((m: any) => {
        if (!m) return false;
        if (typeof m === 'string') {
          return userUid && m === userUid;
        }
        const mUid = (m.uid || m.id || m.userId || m.user_id || '').trim();
        const mEmail = (m.email || '').toLowerCase().trim();
        if (userUid && mUid && mUid === userUid) return true;
        if (userEmail && mEmail && mEmail === userEmail) return true;
        return false;
      });

      if (memberItem) {
        if (typeof memberItem === 'string') {
          return 'Member';
        }
        const rawRole = memberItem.role || memberItem.workspace_roles?.[targetWsId];
        const normalized = normalizeWorkspaceRole(rawRole);
        if (normalized) return normalized;
        return 'Member';
      }
    }
  }

  // 2C. Explicit member_ids array check
  if (workspace && Array.isArray((workspace as any).member_ids)) {
    if (userUid && (workspace as any).member_ids.includes(userUid)) {
      if (user.workspace_roles && user.workspace_roles[targetWsId]) {
        const normalized = normalizeWorkspaceRole(user.workspace_roles[targetWsId]);
        if (normalized) return normalized;
      }
      return 'Member';
    }
  }

  // Check user profile's explicit workspace-specific mapping
  if (user.workspace_roles && user.workspace_roles[targetWsId]) {
    const normalized = normalizeWorkspaceRole(user.workspace_roles[targetWsId]);
    if (normalized) return normalized;
  }

  if (user.workspace_profiles && user.workspace_profiles[targetWsId]?.role) {
    const normalized = normalizeWorkspaceRole(user.workspace_profiles[targetWsId].role);
    if (normalized) return normalized;
  }

  // 3. Fallback: Default to 'Member' for legacy members, or 'Viewer' if unlisted
  if (workspace?.member_emails && Array.isArray(workspace.member_emails)) {
    const hasEmail = workspace.member_emails.some(
      (e) => typeof e === 'string' && userEmail && e.toLowerCase().trim() === userEmail
    );
    if (hasEmail) return 'Member';
  }

  if (user.workspaceIds && Array.isArray(user.workspaceIds)) {
    if (user.workspaceIds.includes(targetWsId)) {
      return 'Member';
    }
  }

  if (user.defaultWorkspaceId && user.defaultWorkspaceId === targetWsId) {
    if (user.role) {
      const normalized = normalizeWorkspaceRole(user.role);
      if (normalized) return normalized;
    }
    return 'Member';
  }

  if (targetWsId === 'ws_default') {
    if (user.role) {
      const normalized = normalizeWorkspaceRole(user.role);
      if (normalized) return normalized;
    }
    return 'Member';
  }

  if (!workspace && user.role) {
    const normalized = normalizeWorkspaceRole(user.role);
    if (normalized) return normalized;
  }

  return 'Viewer';
}

export const getUserRoleInWorkspace = getUserWorkspaceRole;

export function isAdmin(
  user: UserProfile | undefined | null, 
  workspaceId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const role = getUserWorkspaceRole(user, workspaceId, activeWorkspace);
  return role === 'Admin';
}

export const isWorkspaceAdmin = (
  user: UserProfile | undefined | null, 
  workspaceId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean => {
  return isAdmin(user, workspaceId, activeWorkspace);
};

export function canManageWorkspace(
  user: UserProfile | undefined | null,
  workspaceOrId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return getUserWorkspaceRole(user, workspaceOrId, activeWorkspace) === 'Admin';
}

export function canExportData(
  user: UserProfile | undefined | null,
  workspaceOrId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return getUserWorkspaceRole(user, workspaceOrId, activeWorkspace) === 'Admin';
}

export function canModifyRegistrySettings(
  user: UserProfile | undefined | null,
  workspaceOrId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  return getUserWorkspaceRole(user, workspaceOrId, activeWorkspace) === 'Admin';
}

export function canCreateEnquiry(
  user: UserProfile | undefined | null,
  workspaceOrId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const role = getUserWorkspaceRole(user, workspaceOrId, activeWorkspace);
  if (role === 'Viewer') return false;
  return role === 'Admin' || role === 'Member';
}

export function canDeleteRecords(
  user: UserProfile | undefined | null,
  workspaceId?: Workspace | string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const role = getUserWorkspaceRole(user, workspaceId, activeWorkspace);
  if (role === 'Viewer') return false;
  return role === 'Admin';
}

export function isRecordOwner(
  user: UserProfile | undefined | null,
  record:
    | {
        created_by?: string;
        sales_person?: string;
        salesperson_id?: string;
        handled_by?: string;
        logged_by?: string;
        assigned_to?: string;
        owner_user_id?: string;
        created_by_user_id?: string;
        email?: string;
        initials?: string;
        full_name?: string;
        workspaceId?: string;
        workspace_id?: string;
      }
    | undefined
    | null,
  workspaceId?: string | null
): boolean {
  if (!user || !record) return false;
  const targetWsId = workspaceId || (record as any)?.workspaceId || (record as any)?.workspace_id;
  if (isAdmin(user, targetWsId)) return true;

  const uUid = (user.uid || (user as any).id)?.toLowerCase()?.trim();
  const uEmail = user.email?.toLowerCase()?.trim();
  const uInitials = user.initials?.toUpperCase()?.trim();
  const uFullName = (user.full_name || (user as any).displayName || (user as any).name)?.toLowerCase()?.trim();
  const uUsername = user.username?.toLowerCase()?.trim();
  const uSpCode = (user as any).salesperson_code?.toUpperCase()?.trim();

  const cBy = (
    record.created_by ||
    record.created_by_user_id ||
    (record as any).created_by_uid ||
    (record as any).createdByUid ||
    (record as any).creator_id
  )?.toLowerCase()?.trim();
  const oUserId = record.owner_user_id?.toLowerCase()?.trim();
  if (oUserId && uUid && oUserId === uUid) return true;

  const sPersonRaw =
    record.sales_person ||
    (record as any).salesperson ||
    (record as any).sales_representative ||
    (record as any).salesRep ||
    record.salesperson_id ||
    (record as any).sales_person_id ||
    (record as any).sales_rep_id ||
    (record as any).salesRepresentativeId;
  const sPerson = sPersonRaw ? String(sPersonRaw).toUpperCase() : undefined;
  const hBy = (record.handled_by || record.logged_by || record.assigned_to)?.toLowerCase();
  const rEmail = record.email?.toLowerCase();
  const rInitials = record.initials?.toUpperCase();
  const rFullName = record.full_name?.toLowerCase();

  if (cBy && ((uUid && cBy === uUid) || (uEmail && cBy === uEmail) || (uUsername && cBy === uUsername))) {
    return true;
  }

  if (sPerson) {
    const sPersonLower = sPerson.toLowerCase().trim();
    if (uInitials && sPerson === uInitials) return true;
    if (uSpCode && sPerson === uSpCode) return true;
    if (uUid && sPersonLower === uUid) return true;
    if (uFullName && sPersonLower === uFullName) return true;
    if (uUsername && sPersonLower === uUsername) return true;
  }

  if (
    hBy &&
    ((uUid && hBy === uUid) ||
      (uEmail && hBy === uEmail) ||
      (uFullName && hBy === uFullName) ||
      (uInitials && hBy === uInitials.toLowerCase()) ||
      (uUsername && hBy === uUsername))
  ) {
    return true;
  }
  if (rEmail && uEmail && rEmail === uEmail) {
    return true;
  }
  if (rInitials && uInitials && rInitials === uInitials) {
    return true;
  }
  if (rFullName && uFullName && rFullName === uFullName) {
    return true;
  }

  const cPersons: string[] = Array.isArray((record as any).concerned_persons)
    ? (record as any).concerned_persons
    : (record as any).concerned_person
    ? [(record as any).concerned_person]
    : [];

  if (cPersons.length > 0) {
    const isConcerned = cPersons.some((p: string) => {
      if (!p) return false;
      const pLower = p.toLowerCase();
      const pUpper = p.toUpperCase();
      return (
        (uUid && pLower === uUid) ||
        (uEmail && pLower === uEmail) ||
        (uInitials && pUpper === uInitials) ||
        (uFullName && pLower.includes(uFullName)) ||
        (uUsername && pLower === uUsername)
      );
    });
    if (isConcerned) return true;
  }

  return false;
}

export function canEditOrDeleteRecord(
  user: UserProfile | undefined | null,
  record: any,
  workspaceId?: string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user || !record) return false;
  const targetWsId = workspaceId || record?.workspaceId || record?.workspace_id;
  const role = getUserWorkspaceRole(user, targetWsId, activeWorkspace);
  if (role === 'Viewer') return false;
  if (isAdmin(user, targetWsId, activeWorkspace)) return true;
  return isRecordOwner(user, record, targetWsId);
}

/**
 * Normalizes all possible identifiers for the current user (UIDs, emails, names, initials)
 * to defensively evaluate RBAC permissions against arbitrary schema variations.
 */
export function normalizeUserIdentifiers(
  currentUser: UserProfile | undefined | null,
  targetWsId?: string | null
) {
  if (!currentUser) {
    return {
      uids: [] as string[],
      email: '',
      names: [] as string[],
      initials: [] as string[]
    };
  }

  const uids: string[] = Array.from(
    new Set(
      [currentUser.uid, (currentUser as any).id]
        .map((id) => String(id || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );

  const email = (currentUser.email || '').toLowerCase().trim();

  const names: string[] = Array.from(
    new Set(
      [
        currentUser.full_name,
        (currentUser as any).displayName,
        (currentUser as any).name,
        currentUser.username
      ]
        .map((name) => String(name || '').toLowerCase().trim())
        .filter(Boolean)
    )
  );

  const initials: string[] = Array.from(
    new Set(
      [
        currentUser.initials,
        targetWsId ? currentUser.workspace_profiles?.[targetWsId]?.initials : undefined,
        (currentUser as any).salesperson_code
      ]
        .map((init) => String(init || '').toUpperCase().trim())
        .filter(Boolean)
    )
  );

  return { uids, email, names, initials };
}

/**
 * Evaluates whether the user is the original creator of the enquiry.
 */
export function isEnquiryCreator(
  user: UserProfile | undefined | null,
  enquiry: any,
  targetWsId?: string | null
): boolean {
  if (!user || !enquiry) return false;
  const { uids: userUids, email: userEmail, names: userNames } = normalizeUserIdentifiers(user, targetWsId);

  const creatorUids = [
    enquiry.created_by_uid,
    enquiry.createdByUid,
    enquiry.created_by,
    enquiry.creator_id
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (userUids.length > 0 && userUids.some((u) => creatorUids.includes(u))) return true;

  const creatorTokens = [
    enquiry.created_by,
    enquiry.createdByUsername,
    enquiry.created_by_name
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (userEmail && creatorTokens.includes(userEmail)) return true;
  if (userNames.some((n) => creatorTokens.includes(n))) return true;

  return false;
}

/**
 * Evaluates whether the user is the assigned salesperson for the enquiry.
 */
export function isEnquirySalesperson(
  user: UserProfile | undefined | null,
  enquiry: any,
  targetWsId?: string | null
): boolean {
  if (!user || !enquiry) return false;
  const { uids: userUids, email: userEmail, names: userNames, initials: userInitials } = normalizeUserIdentifiers(user, targetWsId);

  const salesRepIds = [
    enquiry.salesperson_id,
    enquiry.sales_rep_id,
    enquiry.salesRepresentativeId,
    enquiry.sales_person_id
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (userUids.length > 0 && userUids.some((u) => salesRepIds.includes(u))) return true;

  const salesRepNames = [
    enquiry.salesperson,
    enquiry.sales_representative,
    enquiry.salesRep,
    enquiry.sales_person
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  return salesRepNames.some((rep) => {
    const repLower = rep.toLowerCase().trim();
    const repUpper = rep.toUpperCase().trim();
    if (userNames.some((n) => n === repLower)) return true;
    if (userInitials.some((init) => init === repUpper)) return true;
    if (userEmail && userEmail === repLower) return true;
    if (userUids.some((u) => u === repLower)) return true;
    return false;
  });
}

/**
 * Evaluates whether the user is a tagged collaborator or concerned party for the enquiry.
 */
export function isEnquiryCollaborator(
  user: UserProfile | undefined | null,
  enquiry: any,
  targetWsId?: string | null
): boolean {
  if (!user || !enquiry) return false;
  const { uids: userUids, email: userEmail, names: userNames, initials: userInitials } = normalizeUserIdentifiers(user, targetWsId);

  // 1. shared_with (unified array)
  if (Array.isArray(enquiry.shared_with)) {
    const sharedWith = enquiry.shared_with
      .map((item: any) => {
        if (!item) return '';
        if (typeof item === 'string') return item.toLowerCase().trim();
        if (typeof item === 'object') return String(item.uid || item.id || '').toLowerCase().trim();
        return String(item).toLowerCase().trim();
      })
      .filter(Boolean);

    if (userUids.some((u) => sharedWith.includes(u))) {
      return true;
    }
  }

  // 2. shared_with_uids
  if (Array.isArray(enquiry.shared_with_uids)) {
    const sharedUids = enquiry.shared_with_uids
      .map((item: any) => {
        if (!item) return '';
        if (typeof item === 'string') return item.toLowerCase().trim();
        if (typeof item === 'object') return String(item.uid || item.id || '').toLowerCase().trim();
        return String(item).toLowerCase().trim();
      })
      .filter(Boolean);

    if (userUids.some((u) => sharedUids.includes(u))) {
      return true;
    }
  }

  // 3. additional_team
  const rawAdditional = enquiry.additional_team;
  if (rawAdditional) {
    const teamItems: { uid?: string; name?: string; initials?: string }[] = [];
    if (Array.isArray(rawAdditional)) {
      for (const item of rawAdditional) {
        if (!item) continue;
        if (typeof item === 'string') {
          const str = item.trim();
          teamItems.push({ uid: str.toLowerCase(), name: str.toLowerCase(), initials: str.toUpperCase() });
        } else if (typeof item === 'object') {
          const oUid = String(item.uid || item.id || '').toLowerCase().trim();
          const oName = String(item.name || item.full_name || '').toLowerCase().trim();
          const oInit = String(item.initials || '').toUpperCase().trim();
          teamItems.push({ uid: oUid, name: oName, initials: oInit });
        }
      }
    } else if (typeof rawAdditional === 'string') {
      const parts = rawAdditional.split(/[,;|]+/).map((s: string) => s.trim()).filter(Boolean);
      for (const p of parts) {
        teamItems.push({ uid: p.toLowerCase(), name: p.toLowerCase(), initials: p.toUpperCase() });
      }
    }

    const isMatch = teamItems.some((item) => {
      if (item.uid && userUids.some((u) => u === item.uid)) return true;
      if (item.name && userNames.some((n) => n === item.name || item.name!.includes(n) || n.includes(item.name!))) return true;
      if (item.initials && userInitials.some((i) => i === item.initials)) return true;
      if (item.name && userEmail && item.name === userEmail) return true;
      return false;
    });
    if (isMatch) return true;
  }

  // 3. shared_with_names
  if (Array.isArray(enquiry.shared_with_names)) {
    const sharedNames = enquiry.shared_with_names
      .map((item: any) => {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object') return String(item.name || item.full_name || item.initials || '').trim();
        return String(item).trim();
      })
      .filter(Boolean);

    const isMatch = sharedNames.some((sn: string) => {
      const snLower = sn.toLowerCase();
      const snUpper = sn.toUpperCase();
      if (userNames.some((n) => n === snLower || snLower.includes(n) || n.includes(snLower))) return true;
      if (userInitials.some((init) => init === snUpper)) return true;
      if (userEmail && userEmail === snLower) return true;
      if (userUids.some((u) => u === snLower)) return true;
      return false;
    });
    if (isMatch) return true;
  }

  // 4. concerned_persons
  const concernedList: string[] = Array.isArray(enquiry.concerned_persons)
    ? enquiry.concerned_persons
    : enquiry.concerned_person
    ? [enquiry.concerned_person]
    : [];

  if (concernedList.length > 0) {
    const isMatch = concernedList.some((p: string) => {
      if (!p) return false;
      const pClean = String(p).trim();
      const pLower = pClean.toLowerCase();
      const pUpper = pClean.toUpperCase();
      return (
        userUids.some((u) => u === pLower) ||
        (userEmail && pLower === userEmail) ||
        userNames.some((n) => n === pLower || pLower.includes(n)) ||
        userInitials.some((init) => init === pUpper)
      );
    });
    if (isMatch) return true;
  }

  return false;
}

/**
 * Centralized Capability Evaluator: canEditEnquiry
 * - True for 'Admin' or 'Super Admin'
 * - True for 'Member' if primary rep, owner/creator, or authorized shared collaborator
 * - False for 'Viewer' and unauthorized members
 */
export function canEditEnquiry(
  user: UserProfile | undefined | null,
  workspaceOrEnquiry?: Workspace | Enquiry | string | null,
  enquiryOrWs?: Enquiry | Workspace | any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  let workspace: Workspace | null = null;
  let enquiry: Enquiry | any | null = null;

  if (workspaceOrEnquiry && typeof workspaceOrEnquiry === 'object') {
    if (
      'sn' in workspaceOrEnquiry ||
      'enquiry_date' in workspaceOrEnquiry ||
      'company_id' in workspaceOrEnquiry ||
      'sales_person' in workspaceOrEnquiry ||
      'salesperson' in workspaceOrEnquiry ||
      'assigned_to_id' in workspaceOrEnquiry
    ) {
      enquiry = workspaceOrEnquiry;
      workspace = enquiryOrWs && !('sn' in enquiryOrWs) ? (enquiryOrWs as Workspace) : null;
    } else {
      workspace = workspaceOrEnquiry as Workspace;
      enquiry = enquiryOrWs;
    }
  } else if (typeof workspaceOrEnquiry === 'string') {
    if (enquiryOrWs && typeof enquiryOrWs === 'object' && ('sn' in enquiryOrWs || 'enquiry_date' in enquiryOrWs || 'company_id' in enquiryOrWs)) {
      enquiry = enquiryOrWs;
    }
  }

  const targetWsId = enquiry?.workspace_id || workspace?.id || user.defaultWorkspaceId;
  const role = getUserWorkspaceRole(user, targetWsId, workspace);

  // False for 'Viewer'
  if (role === 'Viewer') return false;

  // True for 'Admin' or 'Super Admin'
  if (role === 'Admin' || isAdmin(user, targetWsId, workspace)) return true;

  // 'Member' role: True ONLY if user is primary rep, owner/creator, or shared editor
  if (!enquiry) return false;

  const currentUid = (user.uid || (user as any).id || '').toLowerCase().trim();
  const currentInitials = (user.initials || (user as any).workspace_profiles?.[targetWsId]?.initials || (user as any).salesperson_code || '').toUpperCase().trim();
  const currentFullName = (user.full_name || (user as any).displayName || (user as any).name || '').toLowerCase().trim();
  const currentEmail = (user.email || '').toLowerCase().trim();
  const currentUsername = (user.username || '').toLowerCase().trim();

  // a) currentUser.uid === enquiry.assigned_to_id OR currentUser.uid === enquiry.creator_id
  const assignedToIds = [
    enquiry.assigned_to_id,
    (enquiry as any).assignedToId,
    enquiry.salesperson_id,
    enquiry.sales_person_id,
    enquiry.sales_rep_id,
    (enquiry as any).salesRepresentativeId
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const creatorIds = [
    enquiry.creator_id,
    (enquiry as any).creatorId,
    enquiry.created_by_uid,
    (enquiry as any).createdByUid,
    enquiry.created_by
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (currentUid && (assignedToIds.includes(currentUid) || creatorIds.includes(currentUid))) {
    return true;
  }

  // b) enquiry.rep === currentUser.initials (exact match e.g. 'SN' vs 'SS')
  const repTokens = [
    (enquiry as any).rep,
    enquiry.sales_person,
    enquiry.salesperson,
    (enquiry as any).salesRep,
    enquiry.sales_representative
  ]
    .map((s) => String(s || '').toUpperCase().trim())
    .filter(Boolean);

  if (currentInitials && repTokens.some((r) => r === currentInitials)) {
    return true;
  }

  // c) enquiry.salesperson === currentUser.full_name (exact match)
  const salespersonNames = [
    enquiry.salesperson,
    enquiry.sales_person,
    enquiry.sales_representative,
    (enquiry as any).salesRep,
    enquiry.assigned_to,
    (enquiry as any).assignedTo
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (
    (currentFullName && salespersonNames.some((n) => n === currentFullName)) ||
    (currentEmail && salespersonNames.some((n) => n === currentEmail)) ||
    (currentUsername && salespersonNames.some((n) => n === currentUsername))
  ) {
    return true;
  }

  // d) enquiry.shared_with?.includes(currentUser.uid)
  const sharedUids = [
    ...(Array.isArray(enquiry.shared_with) ? enquiry.shared_with : []),
    ...(Array.isArray(enquiry.shared_with_uids) ? enquiry.shared_with_uids : [])
  ]
    .map((item: any) => {
      if (!item) return '';
      if (typeof item === 'string') return item.toLowerCase().trim();
      return String(item?.uid || item?.id || '').toLowerCase().trim();
    })
    .filter(Boolean);

  if (currentUid && sharedUids.includes(currentUid)) {
    return true;
  }

  // Check additional_team for exact collaborator match
  if (Array.isArray(enquiry.additional_team)) {
    for (const item of enquiry.additional_team) {
      if (!item) continue;
      if (typeof item === 'string') {
        const str = item.trim();
        if (currentUid && str.toLowerCase() === currentUid) return true;
        if (currentEmail && str.toLowerCase() === currentEmail) return true;
        if (currentInitials && str.toUpperCase() === currentInitials) return true;
      } else if (typeof item === 'object') {
        const oUid = String(item.uid || item.id || '').toLowerCase().trim();
        const oEmail = String(item.email || '').toLowerCase().trim();
        const oName = String(item.name || item.full_name || '').toLowerCase().trim();
        const oInit = String(item.initials || '').toUpperCase().trim();
        if (currentUid && oUid === currentUid) return true;
        if (currentEmail && (oEmail === currentEmail || oName === currentEmail)) return true;
        if (currentFullName && oName === currentFullName) return true;
        if (currentInitials && oInit === currentInitials) return true;
      }
    }
  }

  return false;
}

/**
 * Centralized Capability Evaluator: canDeleteEnquiry
 * - True for 'Admin'
 * - True for 'Member' if original creator
 * - False for standard collaborators and 'Viewer'
 */
export function canDeleteEnquiry(
  user: UserProfile | undefined | null,
  workspaceOrEnquiry?: Workspace | Enquiry | string | null,
  enquiryOrWs?: Enquiry | Workspace | any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;

  let workspace: Workspace | null = null;
  let enquiry: Enquiry | any | null = null;

  if (workspaceOrEnquiry && typeof workspaceOrEnquiry === 'object') {
    if ('sn' in workspaceOrEnquiry || 'enquiry_date' in workspaceOrEnquiry || 'company_id' in workspaceOrEnquiry) {
      enquiry = workspaceOrEnquiry;
      workspace = enquiryOrWs && !('sn' in enquiryOrWs) ? (enquiryOrWs as Workspace) : null;
    } else {
      workspace = workspaceOrEnquiry as Workspace;
      enquiry = enquiryOrWs;
    }
  } else if (typeof workspaceOrEnquiry === 'string') {
    if (enquiryOrWs && typeof enquiryOrWs === 'object' && ('sn' in enquiryOrWs || 'enquiry_date' in enquiryOrWs)) {
      enquiry = enquiryOrWs;
    }
  }

  const targetWsId = enquiry?.workspace_id || workspace?.id || user.defaultWorkspaceId;
  const role = getUserWorkspaceRole(user, workspace || targetWsId);

  // False for 'Viewer' and standard collaborators
  if (role === 'Viewer') return false;

  // True for 'Admin'
  if (role === 'Admin') return true;

  // 'Member' role: True ONLY for original creator
  if (!enquiry) return false;

  return isEnquiryCreator(user, enquiry, targetWsId);
}

/**
 * Canonical Permission Evaluator: Scoped Enquiry Access Control (RBAC).
 * Enforces role-based visibility:
 * - Owners, Admins, and SuperAdmins retain universal workspace access.
 * - Non-Admins (Members and Viewers, or when workspace scope is 'Attributed Entries Only'):
 *   A user has access ONLY IF:
 *     a) currentUser.uid === enquiry.assigned_to_id OR currentUser.uid === enquiry.creator_id
 *     b) enquiry.rep === currentUser.initials (exact match, e.g. 'SN' vs 'SS')
 *     c) enquiry.salesperson === currentUser.full_name (exact match)
 *     d) enquiry.shared_with?.includes(currentUser.uid)
 *   Broad fallbacks that exposed records when IDs were missing have been removed.
 */
export function canAccessEnquiry(
  currentUser: UserProfile | undefined | null,
  enquiry: Enquiry | undefined | null,
  activeWorkspace?: Workspace | any | null
): boolean {
  if (!enquiry) return false;
  if (!currentUser) return false;

  // 1. SuperAdmin universal access
  if (isSuperAdmin(currentUser)) return true;

  // 2. Owner or Admin role check via centralized Single Source of Truth
  const targetWsId = enquiry.workspace_id || currentUser.defaultWorkspaceId || activeWorkspace?.id;
  const role = getUserWorkspaceRole(currentUser, targetWsId, activeWorkspace);

  // Check workspace data visibility scope setting
  const wsScope = (activeWorkspace as any)?.data_visibility_scope || (activeWorkspace as any)?.dataVisibilityScope;
  const userScope = currentUser.dataVisibilityScope || (currentUser as any).data_visibility_scope;
  const isAttributedScope =
    wsScope === 'OWN_DATA_ONLY' ||
    wsScope === 'ASSIGNED_ONLY' ||
    wsScope === 'Attributed Entries Only' ||
    userScope === 'OWN_DATA_ONLY' ||
    userScope === 'ASSIGNED_ONLY';

  // Admin access (when workspace is not explicitly configured for Attributed Entries Only for everyone)
  if (role === 'Admin' && !isAttributedScope) {
    return true;
  }

  // 3. User normalized tokens & UID
  const currentUid = (currentUser.uid || (currentUser as any).id || '').toLowerCase().trim();
  const currentInitials = (currentUser.initials || (currentUser as any).workspace_profiles?.[targetWsId]?.initials || (currentUser as any).salesperson_code || '').toUpperCase().trim();
  const currentFullName = (currentUser.full_name || (currentUser as any).displayName || (currentUser as any).name || '').toLowerCase().trim();
  const currentEmail = (currentUser.email || '').toLowerCase().trim();
  const currentUsername = (currentUser.username || '').toLowerCase().trim();

  // Condition a: currentUser.uid === enquiry.assigned_to_id OR currentUser.uid === enquiry.creator_id
  const assignedToIds = [
    enquiry.assigned_to_id,
    (enquiry as any).assignedToId,
    enquiry.salesperson_id,
    enquiry.sales_person_id,
    enquiry.sales_rep_id,
    (enquiry as any).salesRepresentativeId
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const creatorIds = [
    enquiry.creator_id,
    (enquiry as any).creatorId,
    enquiry.created_by_uid,
    (enquiry as any).createdByUid,
    enquiry.created_by
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const isAssignedOrCreatorUidMatch = Boolean(
    currentUid && (assignedToIds.includes(currentUid) || creatorIds.includes(currentUid))
  );

  // Condition b: enquiry.rep === currentUser.initials (e.g., 'SN' vs 'SS')
  // Strictly exact, case-insensitive comparison
  const repTokens = [
    (enquiry as any).rep,
    enquiry.sales_person,
    enquiry.salesperson,
    (enquiry as any).salesRep,
    enquiry.sales_representative
  ]
    .map((s) => String(s || '').toUpperCase().trim())
    .filter(Boolean);

  const isRepInitialsMatch = Boolean(
    currentInitials && repTokens.some((r) => r === currentInitials)
  );

  // Condition c: enquiry.salesperson === currentUser.full_name (or email/username)
  // Strictly exact, case-insensitive comparison
  const salespersonNames = [
    enquiry.salesperson,
    enquiry.sales_person,
    enquiry.sales_representative,
    (enquiry as any).salesRep,
    enquiry.assigned_to,
    (enquiry as any).assignedTo
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const isSalespersonNameMatch = Boolean(
    (currentFullName && salespersonNames.some((n) => n === currentFullName)) ||
    (currentEmail && salespersonNames.some((n) => n === currentEmail)) ||
    (currentUsername && salespersonNames.some((n) => n === currentUsername))
  );

  // Condition d: enquiry.shared_with?.includes(currentUser.uid)
  const sharedUids = [
    ...(Array.isArray(enquiry.shared_with) ? enquiry.shared_with : []),
    ...(Array.isArray(enquiry.shared_with_uids) ? enquiry.shared_with_uids : [])
  ]
    .map((item: any) => {
      if (!item) return '';
      if (typeof item === 'string') return item.toLowerCase().trim();
      return String(item?.uid || item?.id || '').toLowerCase().trim();
    })
    .filter(Boolean);

  // Also check additional_team for exact collaborator match
  let isSharedInTeam = false;
  if (Array.isArray(enquiry.additional_team)) {
    for (const item of enquiry.additional_team) {
      if (!item) continue;
      if (typeof item === 'string') {
        const str = item.trim();
        if (currentUid && str.toLowerCase() === currentUid) isSharedInTeam = true;
        if (currentEmail && str.toLowerCase() === currentEmail) isSharedInTeam = true;
        if (currentInitials && str.toUpperCase() === currentInitials) isSharedInTeam = true;
      } else if (typeof item === 'object') {
        const oUid = String(item.uid || item.id || '').toLowerCase().trim();
        const oEmail = String(item.email || '').toLowerCase().trim();
        const oName = String(item.name || item.full_name || '').toLowerCase().trim();
        const oInit = String(item.initials || '').toUpperCase().trim();
        if (currentUid && oUid === currentUid) isSharedInTeam = true;
        if (currentEmail && (oEmail === currentEmail || oName === currentEmail)) isSharedInTeam = true;
        if (currentFullName && oName === currentFullName) isSharedInTeam = true;
        if (currentInitials && oInit === currentInitials) isSharedInTeam = true;
      }
    }
  }

  const isSharedMatch = Boolean(
    (currentUid && sharedUids.includes(currentUid)) || isSharedInTeam
  );

  // Strict Evaluation: A user has access ONLY IF (a), (b), (c), or (d) matches
  // Zero broad fallback to ensure non-owners never see records of other reps.
  return Boolean(
    isAssignedOrCreatorUidMatch ||
    isRepInitialsMatch ||
    isSalespersonNameMatch ||
    isSharedMatch
  );
}

/**
 * Checks whether an enquiry has restricted access for the current user.
 * Restricted teammates can see reference numbers and statuses for collision prevention,
 * but sensitive financials and deep inspection are locked.
 */
export function isEnquiryRestricted(
  currentUser: UserProfile | undefined | null,
  enquiry: Enquiry | undefined | null,
  activeWorkspace?: Workspace | any | null
): boolean {
  return !canAccessEnquiry(currentUser, enquiry, activeWorkspace);
}

/**
 * Formats enquiry value display respecting access permissions.
 * Authorized: "AED 150,000"
 * Restricted: "AED ••••••"
 */
export function formatEnquiryValueSecure(
  currentUser: UserProfile | undefined | null,
  enquiry: Enquiry | undefined | null,
  activeWorkspace?: Workspace | any | null
): { display: string; isRestricted: boolean } {
  if (!enquiry) return { display: 'AED 0', isRestricted: false };
  const hasAccess = canAccessEnquiry(currentUser, enquiry, activeWorkspace);
  if (!hasAccess) {
    return { display: 'AED ••••••', isRestricted: true };
  }
  const val = Number(enquiry.value_aed) || 0;
  return { display: `${enquiry.currency || 'AED'} ${val.toLocaleString()}`, isRestricted: false };
}

/**
 * Evaluates whether the current user is authorized to manage enquiry sharing & collaborators.
 * Permitted roles:
 * - Deal Creator
 * - Assigned Primary Salesperson
 * - Workspace Admins / Owners / SuperAdmins
 * Standard collaborators or unauthorized viewers are restricted to read-only access.
 */
export function canManageEnquirySharing(
  currentUser: UserProfile | undefined | null,
  enquiry: Enquiry | undefined | null,
  workspaceId?: string | null,
  activeWorkspace?: any | null
): boolean {
  if (!currentUser || !enquiry) return false;

  // 1. SuperAdmin universal access
  if (isSuperAdmin(currentUser)) return true;

  // 2. Workspace Admin or Owner
  const targetWsId = workspaceId || enquiry.workspace_id || currentUser.defaultWorkspaceId;
  const role = getUserWorkspaceRole(currentUser, targetWsId, activeWorkspace);
  if (role === 'Admin') {
    return true;
  }

  // 3. Deal Creator
  if (isEnquiryCreator(currentUser, enquiry, targetWsId)) {
    return true;
  }

  // 4. Assigned Primary Salesperson
  if (isEnquirySalesperson(currentUser, enquiry, targetWsId)) {
    return true;
  }

  return false;
}

export function getUserVisibilityTier(
  user: UserProfile | undefined | null,
  workspaceId?: string | null
): 'ADVANCED' | 'BASIC' {
  if (!user) return 'BASIC';
  if (isAdmin(user, workspaceId)) return 'ADVANCED';
  return user.dataVisibilityTier === 'BASIC' ? 'BASIC' : 'ADVANCED';
}

export function canUserClickRecord(
  user: UserProfile | undefined | null,
  record: any,
  salespersons: any[] = [],
  workspaceId?: string | null
): boolean {
  if (!user || !record) return false;
  const targetWsId = workspaceId || record?.workspaceId || record?.workspace_id;
  if (isAdmin(user, targetWsId)) return true;

  let isAttributed = isRecordOwner(user, record, targetWsId);

  if (!isAttributed && salespersons && salespersons.length > 0) {
    const uUid = (user.uid || (user as any).id || '').toLowerCase();
    const uInitials = ((user as any).salesperson_code || user.initials || '').toLowerCase();
    const uFullName = (user.full_name || '').toLowerCase();

    const userSp = salespersons.find(
      (s) =>
        (s.id && uUid && s.id.toLowerCase() === uUid) ||
        (s.full_name && uFullName && s.full_name.toLowerCase() === uFullName) ||
        (s.initials && uInitials && s.initials.toLowerCase() === uInitials)
    );

    if (userSp) {
      const recSp = String(record.sales_person || record.salesperson_id || record.logged_by || '').toLowerCase();
      if (
        recSp &&
        ((userSp.id && recSp === userSp.id.toLowerCase()) ||
          (userSp.initials && recSp === userSp.initials.toLowerCase()) ||
          (userSp.full_name && recSp === userSp.full_name.toLowerCase()))
      ) {
        isAttributed = true;
      }
    }
  }

  // AIRTIGHT BASIC TIER RULE: Non-admin users with BASIC tier who are not attributed CANNOT click/view records
  if (user.dataVisibilityTier === 'BASIC') {
    return isAttributed;
  }

  // ADVANCED Tier users
  if (user.dataVisibilityScope === 'ALL_DATA') return true;
  return isAttributed;
}

export function getSalespersonFullName(spVal: string | undefined | null, salespersons: any[] = []): string {
  if (!spVal) return 'Unassigned';
  const clean = spVal.trim();
  const found = salespersons.find(s => 
    s.id === clean || 
    (s.initials && s.initials.toLowerCase() === clean.toLowerCase()) || 
    (s.full_name && s.full_name.toLowerCase() === clean.toLowerCase())
  );
  return found?.full_name || clean;
}

export function getWorkspaceInitials(
  rawVal?: string | null,
  salespersonsList: any[] = [],
  currentUser?: UserProfile | null,
  activeWs?: any | null
): string {
  if (!rawVal || !rawVal.trim()) {
    const fallback =
      currentUser?.workspace_profiles?.[activeWs?.id || '']?.initials ||
      currentUser?.initials ||
      (currentUser as any)?.salesperson_code;
    return fallback ? fallback.toUpperCase() : '—';
  }

  const clean = rawVal.trim();
  const cleanLower = clean.toLowerCase();

  // 1. Match against salespersons list (by ID, initials, full name, email, or linked user ID)
  const foundSp = salespersonsList.find(
    (s) =>
      (s.id && s.id.toLowerCase() === cleanLower) ||
      (s.initials && s.initials.toLowerCase() === cleanLower) ||
      (s.full_name && s.full_name.toLowerCase() === cleanLower) ||
      (s.email && s.email.toLowerCase() === cleanLower) ||
      (s.linked_user_id && s.linked_user_id.toLowerCase() === cleanLower)
  );
  if (foundSp?.initials) {
    return foundSp.initials.toUpperCase();
  }

  // 2. Match against current logged-in user
  if (currentUser) {
    const isCurrentUser =
      (currentUser.uid && currentUser.uid.toLowerCase() === cleanLower) ||
      (currentUser.email && currentUser.email.toLowerCase() === cleanLower) ||
      (currentUser.username && currentUser.username.toLowerCase() === cleanLower) ||
      (currentUser.full_name && currentUser.full_name.toLowerCase() === cleanLower);

    if (isCurrentUser) {
      const userWsInitials =
        currentUser.workspace_profiles?.[activeWs?.id || '']?.initials ||
        currentUser.initials ||
        (currentUser as any)?.salesperson_code;
      if (userWsInitials) return userWsInitials.toUpperCase();
    }
  }

  // 3. Match against workspace members
  if (activeWs?.members && activeWs.members.length > 0) {
    const member = activeWs.members.find(
      (m: any) =>
        (m.uid && m.uid.toLowerCase() === cleanLower) ||
        (m.email && m.email.toLowerCase() === cleanLower) ||
        (m.name && m.name.toLowerCase() === cleanLower) ||
        (m.full_name && m.full_name.toLowerCase() === cleanLower)
    );
    if (member) {
      const spForMember = salespersonsList.find(
        (s) =>
          (s.linked_user_id && s.linked_user_id === member.uid) ||
          (s.email && s.email.toLowerCase() === member.email?.toLowerCase()) ||
          (s.full_name && s.full_name.toLowerCase() === (member.full_name || member.name || '').toLowerCase())
      );
      if (spForMember?.initials) return spForMember.initials.toUpperCase();
    }
  }

  // 4. If already an initials string (<= 4 chars without spaces and alphanumeric), return uppercase
  if (/^[A-Za-z0-9]{1,4}$/.test(clean)) {
    return clean.toUpperCase();
  }

  // 5. If it's a full name like "Syed Ameer Sibuma", extract clean initials
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    if (words.length === 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }

  return clean.toUpperCase();
}

export function isSuperAdmin(user: UserProfile | undefined | null): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'sibuma.syedameer@gmail.com') return true;
  if (user.is_super_admin === true) return true;
  const role = (user.role || '').toString().toLowerCase().trim();
  if (role === 'super admin' || role === 'superadmin' || role === 'super_admin') return true;
  return false;
}

/**
 * Activity Authorization Helper (RBAC & Privacy Masking):
 * Returns true if:
 * 1. User is Admin or Super Admin
 * 2. User logged the activity (currentUser.uid === activity.user_id or creator_id)
 * 3. Activity rep matches user initials (activity.rep === currentUser.initials) or name
 * 4. Activity is linked to an enquiry the user has full access to (canAccessEnquiry(currentUser, linkedEnquiry))
 * Returns false otherwise.
 */
export function canAccessActivityDetail(
  currentUser: UserProfile | undefined | null,
  activity: CallLogEntry | any | undefined | null,
  enquiries?: Enquiry[] | null,
  activeWorkspace?: Workspace | any | null,
  salespersons?: Salesperson[] | any[] | null
): boolean {
  if (!currentUser || !activity) return false;

  // 1. SuperAdmin universal access
  if (isSuperAdmin(currentUser)) return true;

  // 2. Admin role check
  const targetWsId = activity.workspace_id || currentUser.defaultWorkspaceId || activeWorkspace?.id;
  const role = getUserWorkspaceRole(currentUser, targetWsId, activeWorkspace);
  if (role === 'Admin' || isAdmin(currentUser, targetWsId, activeWorkspace)) {
    return true;
  }

  // 3. User normalized tokens & UID
  const currentUid = (currentUser.uid || (currentUser as any).id || '').toLowerCase().trim();
  const currentInitials = (
    currentUser.initials ||
    (currentUser as any).workspace_profiles?.[targetWsId || '']?.initials ||
    (currentUser as any).salesperson_code ||
    ''
  ).toUpperCase().trim();
  const currentFullName = (currentUser.full_name || (currentUser as any).displayName || (currentUser as any).name || '').toLowerCase().trim();
  const currentEmail = (currentUser.email || '').toLowerCase().trim();
  const currentUsername = (currentUser.username || '').toLowerCase().trim();

  // Find linked salesperson match
  let spIds: string[] = [];
  let spInitials: string[] = [];
  let spNames: string[] = [];
  if (salespersons && salespersons.length > 0) {
    const matchedSp = salespersons.filter((s) => {
      const sUid = String(s.linked_user_id || s.user_id || s.uid || '').toLowerCase().trim();
      const sEmail = String(s.email || '').toLowerCase().trim();
      const sFullName = String(s.full_name || s.name || '').toLowerCase().trim();
      const sInitials = String(s.initials || '').toUpperCase().trim();
      return (
        (currentUid && sUid === currentUid) ||
        (currentEmail && sEmail === currentEmail) ||
        (currentFullName && sFullName === currentFullName) ||
        (currentInitials && sInitials === currentInitials)
      );
    });
    spIds = matchedSp.map((s) => String(s.id || '').toLowerCase().trim()).filter(Boolean);
    spInitials = matchedSp.map((s) => String(s.initials || '').toUpperCase().trim()).filter(Boolean);
    spNames = matchedSp.map((s) => String(s.full_name || s.name || '').toLowerCase().trim()).filter(Boolean);
  }

  // 4. User logged the activity (currentUser.uid === activity.user_id or creator_id)
  const candidateUids = [
    activity.user_id,
    (activity as any).userId,
    activity.creator_id,
    (activity as any).creatorId,
    activity.created_by_uid,
    (activity as any).createdByUid,
    activity.created_by_id,
    (activity as any).createdById,
    activity.logged_by_user_id,
    (activity as any).loggedByUserId,
    activity.sales_person_id,
    activity.handled_by_salesperson_id,
    activity.assigned_to_id,
    (activity as any).assignedToId,
    (activity as any).salesperson_id
  ].map((s) => String(s || '').toLowerCase().trim()).filter(Boolean);

  if (currentUid && candidateUids.includes(currentUid)) {
    return true;
  }
  if (candidateUids.some((id) => spIds.includes(id))) {
    return true;
  }

  // 5. Activity rep matches user initials (activity.rep === currentUser.initials)
  const repTokens = [
    activity.rep,
    (activity as any).sales_rep,
    (activity as any).rep_initials
  ].map((s) => String(s || '').toUpperCase().trim()).filter(Boolean);

  if (currentInitials && repTokens.some((r) => r === currentInitials)) {
    return true;
  }
  if (repTokens.some((r) => spInitials.includes(r))) {
    return true;
  }

  // 6. Activity matches user name or email
  const nameTokens = [
    activity.sales_person,
    (activity as any).salesperson,
    activity.logged_by,
    (activity as any).createdBy,
    (activity as any).created_by,
    activity.handled_by_team_member_name
  ].map((s) => String(s || '').trim()).filter(Boolean);

  for (const token of nameTokens) {
    const tokenLower = token.toLowerCase();
    const tokenUpper = token.toUpperCase();
    if (currentFullName && tokenLower === currentFullName) return true;
    if (currentEmail && tokenLower === currentEmail) return true;
    if (currentUsername && tokenLower === currentUsername) return true;
    if (currentInitials && tokenUpper === currentInitials) return true;
    if (spNames.includes(tokenLower)) return true;
    if (spInitials.includes(tokenUpper)) return true;
  }

  // 7. Activity is linked to an enquiry the user has full access to (canAccessEnquiry(currentUser, linkedEnquiry))
  const enqId = String(activity.enquiry_id || (activity as any).enquiryId || '').trim();
  const quoteRef = String(activity.enquiry_quote_ref || (activity as any).quote_ref_no || '').trim().toLowerCase();

  if ((enqId || quoteRef) && enquiries && enquiries.length > 0) {
    const linkedEnquiry = enquiries.find((e) => {
      if (enqId && (e.id === enqId || String((e as any).sn) === enqId)) return true;
      if (quoteRef && (e.quote_ref_no || '').trim().toLowerCase() === quoteRef) return true;
      return false;
    });

    if (linkedEnquiry && canAccessEnquiry(currentUser, linkedEnquiry, activeWorkspace)) {
      return true;
    }
  }

  return false;
}

/**
 * Convenience helper to determine if an activity is restricted to the current user.
 */
export function isActivityRestricted(
  currentUser: UserProfile | undefined | null,
  activity: CallLogEntry | any | undefined | null,
  enquiries?: Enquiry[] | null,
  activeWorkspace?: Workspace | any | null,
  salespersons?: Salesperson[] | any[] | null
): boolean {
  return !canAccessActivityDetail(currentUser, activity, enquiries, activeWorkspace, salespersons);
}

/**
 * Checks whether an activity or scheduled task is attributed to (assigned to or logged by) the current user.
 * Used for Call Center isolation between sales reps.
 */
export function isActivityAttributedToUser(
  currentUser: UserProfile | undefined | null,
  activity: CallLogEntry | any | undefined | null,
  salespersons: any[] = []
): boolean {
  if (!currentUser || !activity) return false;

  const currentUid = (currentUser.uid || (currentUser as any).id || '').toLowerCase().trim();
  const targetWsId = activity.workspace_id || currentUser.defaultWorkspaceId;
  const currentInitials = (
    currentUser.initials ||
    (currentUser as any).workspace_profiles?.[targetWsId || '']?.initials ||
    (currentUser as any).salesperson_code ||
    ''
  ).toUpperCase().trim();
  const currentFullName = (currentUser.full_name || (currentUser as any).displayName || (currentUser as any).name || '').toLowerCase().trim();
  const currentEmail = (currentUser.email || '').toLowerCase().trim();
  const currentUsername = (currentUser.username || '').toLowerCase().trim();

  let spIds: string[] = [];
  let spInitials: string[] = [];
  let spNames: string[] = [];
  if (salespersons && salespersons.length > 0) {
    const matchedSp = salespersons.filter((s) => {
      const sUid = String(s.linked_user_id || s.user_id || s.uid || '').toLowerCase().trim();
      const sEmail = String(s.email || '').toLowerCase().trim();
      const sFullName = String(s.full_name || s.name || '').toLowerCase().trim();
      const sInitials = String(s.initials || '').toUpperCase().trim();
      return (
        (currentUid && sUid === currentUid) ||
        (currentEmail && sEmail === currentEmail) ||
        (currentFullName && sFullName === currentFullName) ||
        (currentInitials && sInitials === currentInitials)
      );
    });
    spIds = matchedSp.map((s) => String(s.id || '').toLowerCase().trim()).filter(Boolean);
    spInitials = matchedSp.map((s) => String(s.initials || '').toUpperCase().trim()).filter(Boolean);
    spNames = matchedSp.map((s) => String(s.full_name || s.name || '').toLowerCase().trim()).filter(Boolean);
  }

  // 1. UID match
  const candidateUids = [
    activity.user_id,
    (activity as any).userId,
    activity.creator_id,
    (activity as any).creatorId,
    activity.created_by_uid,
    (activity as any).createdByUid,
    activity.created_by_id,
    (activity as any).createdById,
    activity.logged_by_user_id,
    (activity as any).loggedByUserId,
    activity.sales_person_id,
    activity.handled_by_salesperson_id,
    activity.assigned_to_id,
    (activity as any).assignedToId,
    (activity as any).salesperson_id
  ].map((s) => String(s || '').toLowerCase().trim()).filter(Boolean);

  if (currentUid && candidateUids.includes(currentUid)) return true;
  if (candidateUids.some((id) => spIds.includes(id))) return true;

  // 2. Rep / Initials match
  const candidateReps = [
    activity.rep,
    (activity as any).sales_rep,
    (activity as any).rep_initials
  ].map((s) => String(s || '').toUpperCase().trim()).filter(Boolean);

  if (currentInitials && candidateReps.includes(currentInitials)) return true;
  if (candidateReps.some((r) => spInitials.includes(r))) return true;

  // 3. Name or logged_by match
  const candidateNames = [
    activity.sales_person,
    (activity as any).salesperson,
    activity.logged_by,
    (activity as any).createdBy,
    (activity as any).created_by,
    activity.handled_by_team_member_name
  ].map((s) => String(s || '').trim()).filter(Boolean);

  for (const raw of candidateNames) {
    const lower = raw.toLowerCase();
    const upper = raw.toUpperCase();
    if (currentFullName && lower === currentFullName) return true;
    if (currentEmail && lower === currentEmail) return true;
    if (currentUsername && lower === currentUsername) return true;
    if (currentInitials && upper === currentInitials) return true;
    if (spNames.includes(lower)) return true;
    if (spInitials.includes(upper)) return true;
  }

  return false;
}

