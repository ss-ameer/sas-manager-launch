import { UserProfile, UserRole, WorkspaceRole, Workspace, Enquiry } from '../types';

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
    const sPersonLower = sPerson.toLowerCase();
    if (uInitials && sPerson === uInitials) return true;
    if (uSpCode && sPerson === uSpCode) return true;
    if (uUid && sPersonLower === uUid) return true;
    if (uFullName && sPersonLower.includes(uFullName)) return true;
    if (uUsername && sPersonLower === uUsername) return true;
  }

  if (
    hBy &&
    ((uUid && hBy === uUid) ||
      (uEmail && hBy === uEmail) ||
      (uFullName && hBy.includes(uFullName)) ||
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
    const repLower = rep.toLowerCase();
    const repUpper = rep.toUpperCase();
    if (userNames.some((n) => n === repLower || repLower.includes(n) || n.includes(repLower))) return true;
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

  // 1. shared_with_uids
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

  // 2. additional_team
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
 * - True for 'Admin'
 * - True for 'Member' if creator, assigned salesperson, or tagged collaborator
 * - False for 'Viewer'
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

  // False for 'Viewer'
  if (role === 'Viewer') return false;

  // True for 'Admin'
  if (role === 'Admin') return true;

  // 'Member' role: True if creator, assigned salesperson, or tagged collaborator
  if (!enquiry) return true;

  return (
    isEnquiryCreator(user, enquiry, targetWsId) ||
    isEnquirySalesperson(user, enquiry, targetWsId) ||
    isEnquiryCollaborator(user, enquiry, targetWsId) ||
    isRecordOwner(user, enquiry, targetWsId)
  );
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
 * - Standard sales reps only see enquiries they created, are assigned to as primary salesperson,
 *   or collaborate on (tagged in additional_team / shared_with_uids / shared_with_names).
 * - Edge-Case Fallback: If an enquiry has no assigned salesperson and no legacy creator metadata,
 *   allow viewing by default to prevent historical records from disappearing.
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
  const targetWsId = enquiry.workspace_id || currentUser.defaultWorkspaceId;
  const role = getUserWorkspaceRole(currentUser, targetWsId, activeWorkspace);

  if (role === 'Admin') {
    return true;
  }

  // 3. User normalized tokens
  const userIdentifiers = normalizeUserIdentifiers(currentUser, targetWsId);

  // 4. Creator Match
  const isCreator = isEnquiryCreator(currentUser, enquiry, targetWsId);

  // 5. Primary Salesperson Check
  const isSalesRep = isEnquirySalesperson(currentUser, enquiry, targetWsId);

  // 6. Collaborator / Sharing Check
  const isCollaborator = isEnquiryCollaborator(currentUser, enquiry, targetWsId);

  // Fallback to record owner evaluator
  const isOwnerFallback = isRecordOwner(currentUser, enquiry, targetWsId);

  // 7. Edge-Case Fallback:
  // If an enquiry has no assigned salesperson and no legacy creator metadata,
  // allow viewing by default so historical records do not disappear.
  const hasSalesperson = Boolean(
    (enquiry.salesperson && enquiry.salesperson.trim() !== '') ||
    (enquiry.sales_person && enquiry.sales_person.trim() !== '') ||
    (enquiry.sales_representative && enquiry.sales_representative.trim() !== '') ||
    ((enquiry as any).salesRep && String((enquiry as any).salesRep).trim() !== '') ||
    (enquiry.salesperson_id && enquiry.salesperson_id.trim() !== '') ||
    (enquiry.sales_person_id && enquiry.sales_person_id.trim() !== '') ||
    (enquiry.sales_rep_id && enquiry.sales_rep_id.trim() !== '') ||
    ((enquiry as any).salesRepresentativeId && String((enquiry as any).salesRepresentativeId).trim() !== '')
  );

  const hasCreator = Boolean(
    (enquiry.created_by && enquiry.created_by.trim() !== '') ||
    (enquiry.created_by_uid && enquiry.created_by_uid.trim() !== '') ||
    ((enquiry as any).createdByUid && String((enquiry as any).createdByUid).trim() !== '') ||
    ((enquiry as any).creator_id && String((enquiry as any).creator_id).trim() !== '') ||
    ((enquiry as any).createdByUsername && String((enquiry as any).createdByUsername).trim() !== '') ||
    ((enquiry as any).created_by_name && String((enquiry as any).created_by_name).trim() !== '')
  );

  const isEdgeCaseFallback = !hasSalesperson && !hasCreator;

  const result = Boolean(
    isCreator ||
    isSalesRep ||
    isCollaborator ||
    isOwnerFallback ||
    isEdgeCaseFallback
  );

  // Dev Diagnostic Log
  if (
    (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV)
  ) {
    console.debug('[RBAC Check]', { enquiryId: enquiry.id, user: userIdentifiers, allowed: result });
  }

  return result;
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
