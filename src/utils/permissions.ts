import { UserProfile, UserRole, Enquiry } from '../types';

export function getUserWorkspaceRole(
  user: UserProfile | undefined | null,
  workspaceId?: string | null,
  activeWorkspace?: any | null
): UserRole | string {
  if (!user) return 'Member';

  const targetWsId = workspaceId || user.defaultWorkspaceId || 'ws_default';

  // 1. Workspace Creator ALWAYS gets Admin privileges
  if (
    activeWorkspace &&
    (activeWorkspace.created_by === user.uid ||
      activeWorkspace.created_by === user.email ||
      activeWorkspace.created_by === user.username ||
      activeWorkspace.created_by_uid === user.uid)
  ) {
    return 'Admin';
  }

  // 2. Explicit workspace_roles mapping for target workspace
  if (user.workspace_roles && user.workspace_roles[targetWsId]) {
    const raw = user.workspace_roles[targetWsId];
    if (raw === 'admin' || raw === 'Admin') return 'Admin';
    if (raw === 'owner' || raw === 'Owner') return 'Owner';
    if (raw === 'superadmin' || raw === 'SuperAdmin') return 'Admin';
    if (raw === 'sales_rep' || raw === 'member' || raw === 'Member') return 'Member';
    if (raw === 'viewer' || raw === 'Viewer') return 'Viewer';
    return raw as UserRole;
  }

  // 3. Explicit workspace_profiles mapping
  if (user.workspace_profiles && user.workspace_profiles[targetWsId]?.role) {
    const raw = user.workspace_profiles[targetWsId].role;
    if (raw === 'admin' || raw === 'Admin') return 'Admin';
    if (raw === 'owner' || raw === 'Owner') return 'Owner';
    if (raw === 'superadmin' || raw === 'SuperAdmin') return 'Admin';
    if (raw === 'sales_rep' || raw === 'member' || raw === 'Member') return 'Member';
    if (raw === 'viewer' || raw === 'Viewer') return 'Viewer';
    return raw as UserRole;
  }

  // 4. Default strictly to 'Member'
  return 'Member';
}

export const getUserRoleInWorkspace = getUserWorkspaceRole;

export function isAdmin(
  user: UserProfile | undefined | null, 
  workspaceId?: string | null,
  activeWorkspace?: any | null
): boolean {
  if (!user) return false;
  if (isSuperAdmin(user)) return true;
  const role = getUserWorkspaceRole(user, workspaceId, activeWorkspace);
  return role === 'Admin' || role === 'admin' || role === 'Owner' || role === 'owner';
}

export const isWorkspaceAdmin = (
  user: UserProfile | undefined | null, 
  workspaceId?: string | null,
  activeWorkspace?: any | null
): boolean => {
  return isAdmin(user, workspaceId, activeWorkspace);
};

export function canManageWorkspace(
  user: UserProfile | undefined | null,
  workspaceId?: string | null,
  activeWorkspace?: any | null
): boolean {
  return isAdmin(user, workspaceId, activeWorkspace);
}

export function canDeleteRecords(
  user: UserProfile | undefined | null,
  workspaceId?: string | null,
  activeWorkspace?: any | null
): boolean {
  const role = getUserWorkspaceRole(user, workspaceId, activeWorkspace);
  if (role === 'Viewer') return false;
  return isAdmin(user, workspaceId, activeWorkspace);
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
  enquiry: Enquiry | undefined | null
): boolean {
  if (!enquiry) return false;
  if (!currentUser) return false;

  // 1. SuperAdmin universal access
  if (isSuperAdmin(currentUser)) return true;

  // 2. Owner or Admin role check (workspace-level or global profile role)
  const targetWsId = enquiry.workspace_id || currentUser.defaultWorkspaceId;
  const wsRole = String(getUserWorkspaceRole(currentUser, targetWsId) || '').toLowerCase();
  const globalRole = String(currentUser.role || '').toLowerCase();

  if (
    wsRole === 'admin' ||
    wsRole === 'owner' ||
    wsRole === 'superadmin' ||
    globalRole === 'admin' ||
    globalRole === 'owner' ||
    globalRole === 'superadmin' ||
    isAdmin(currentUser, targetWsId)
  ) {
    return true;
  }

  // 3. Current user normalized tokens
  const userIdentifiers = normalizeUserIdentifiers(currentUser, targetWsId);
  const { uids: userUids, email: userEmail, names: userNames, initials: userInitials } = userIdentifiers;

  // 4. Creator Match:
  // User ID matches enquiry.created_by_uid, enquiry.createdByUid, enquiry.created_by, or enquiry.creator_id.
  // Or email matches enquiry.created_by. Also check username / created_by_name.
  const creatorUids = [
    enquiry.created_by_uid,
    (enquiry as any).createdByUid,
    enquiry.created_by,
    (enquiry as any).creator_id
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const isCreatorIdMatch = userUids.length > 0 && userUids.some((u) => creatorUids.includes(u));

  const creatorTokens = [
    enquiry.created_by,
    (enquiry as any).createdByUsername,
    (enquiry as any).created_by_name
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const isCreatorEmailOrNameMatch = Boolean(
    (userEmail && creatorTokens.includes(userEmail)) ||
    userNames.some((n) => creatorTokens.includes(n))
  );

  const isCreator = isCreatorIdMatch || isCreatorEmailOrNameMatch;

  // 5. Primary Salesperson Check:
  // User ID matches enquiry.salesperson_id, enquiry.sales_rep_id, or enquiry.salesRepresentativeId (or sales_person_id).
  // User Name matches enquiry.salesperson, enquiry.sales_representative, or enquiry.salesRep (case-insensitive trim, or sales_person).
  const salesRepIds = [
    enquiry.salesperson_id,
    enquiry.sales_rep_id,
    (enquiry as any).salesRepresentativeId,
    enquiry.sales_person_id
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  const isSalesRepIdMatch = userUids.length > 0 && userUids.some((u) => salesRepIds.includes(u));

  const salesRepNames = [
    enquiry.salesperson,
    enquiry.sales_representative,
    (enquiry as any).salesRep,
    enquiry.sales_person
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const isSalesRepNameMatch = salesRepNames.some((rep) => {
    const repLower = rep.toLowerCase();
    const repUpper = rep.toUpperCase();
    if (userNames.some((n) => n === repLower || repLower.includes(n) || n.includes(repLower))) return true;
    if (userInitials.some((init) => init === repUpper)) return true;
    if (userEmail && userEmail === repLower) return true;
    if (userUids.some((u) => u === repLower)) return true;
    return false;
  });

  const isSalesRep = isSalesRepIdMatch || isSalesRepNameMatch;

  // 6. Collaborator / Sharing Check:
  // Check enquiry.shared_with_uids (supporting both string arrays and object arrays with .uid or .id)
  let isSharedUidMatch = false;
  if (Array.isArray(enquiry.shared_with_uids)) {
    const sharedUids = enquiry.shared_with_uids
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item.toLowerCase().trim();
        if (typeof item === 'object') {
          return String((item as any).uid || (item as any).id || '').toLowerCase().trim();
        }
        return String(item).toLowerCase().trim();
      })
      .filter(Boolean);

    if (userUids.some((u) => sharedUids.includes(u))) {
      isSharedUidMatch = true;
    }
  }

  // Check enquiry.additional_team (supporting string arrays of names/initials/UIDs OR array of objects containing uid, id, name, or initials)
  let isAdditionalTeamMatch = false;
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
          const oUid = String((item as any).uid || (item as any).id || '').toLowerCase().trim();
          const oName = String((item as any).name || (item as any).full_name || '').toLowerCase().trim();
          const oInit = String((item as any).initials || '').toUpperCase().trim();
          teamItems.push({ uid: oUid, name: oName, initials: oInit });
        }
      }
    } else if (typeof rawAdditional === 'string') {
      const parts = rawAdditional.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean);
      for (const p of parts) {
        teamItems.push({ uid: p.toLowerCase(), name: p.toLowerCase(), initials: p.toUpperCase() });
      }
    }

    isAdditionalTeamMatch = teamItems.some((item) => {
      if (item.uid && userUids.some((u) => u === item.uid)) return true;
      if (item.name && userNames.some((n) => n === item.name || item.name!.includes(n) || n.includes(item.name!))) return true;
      if (item.initials && userInitials.some((i) => i === item.initials)) return true;
      if (item.name && userEmail && item.name === userEmail) return true;
      return false;
    });
  }

  // Check enquiry.shared_with_names
  let isSharedNameMatch = false;
  if (Array.isArray(enquiry.shared_with_names)) {
    const sharedNames = enquiry.shared_with_names
      .map((item) => {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        if (typeof item === 'object') {
          return String((item as any).name || (item as any).full_name || (item as any).initials || '').trim();
        }
        return String(item).trim();
      })
      .filter(Boolean);

    isSharedNameMatch = sharedNames.some((sn) => {
      const snLower = sn.toLowerCase();
      const snUpper = sn.toUpperCase();
      if (userNames.some((n) => n === snLower || snLower.includes(n) || n.includes(snLower))) return true;
      if (userInitials.some((init) => init === snUpper)) return true;
      if (userEmail && userEmail === snLower) return true;
      if (userUids.some((u) => u === snLower)) return true;
      return false;
    });
  }

  const isCollaborator = isSharedUidMatch || isAdditionalTeamMatch || isSharedNameMatch;

  // Legacy concerned_persons field
  const concernedList: string[] = Array.isArray(enquiry.concerned_persons)
    ? enquiry.concerned_persons
    : enquiry.concerned_person
    ? [enquiry.concerned_person]
    : [];

  const isConcerned = concernedList.some((p) => {
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
    isConcerned ||
    isOwnerFallback ||
    isEdgeCaseFallback
  );

  // 4. Temporary Dev Diagnostic Log:
  // If an enquiry is evaluated for a non-admin user, output a single concise debug log in development mode.
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
  const roleLower = String(role || currentUser.role || '').toLowerCase();
  if (
    roleLower === 'admin' ||
    roleLower === 'owner' ||
    roleLower === 'superadmin' ||
    isAdmin(currentUser, targetWsId, activeWorkspace)
  ) {
    return true;
  }

  const { uids: userUids, email: userEmail, names: userNames, initials: userInitials } = normalizeUserIdentifiers(currentUser, targetWsId);

  // 3. Deal Creator
  const creatorUids = [
    enquiry.created_by_uid,
    (enquiry as any).createdByUid,
    enquiry.created_by,
    (enquiry as any).creator_id
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (userUids.some((u) => creatorUids.includes(u))) return true;

  const creatorTokens = [
    enquiry.created_by,
    (enquiry as any).createdByUsername,
    (enquiry as any).created_by_name
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (userEmail && creatorTokens.includes(userEmail)) return true;
  if (userNames.some((n) => creatorTokens.includes(n))) return true;

  // 4. Assigned Primary Salesperson
  const salesRepIds = [
    enquiry.salesperson_id,
    enquiry.sales_rep_id,
    (enquiry as any).salesRepresentativeId,
    enquiry.sales_person_id
  ]
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);

  if (userUids.some((u) => salesRepIds.includes(u))) return true;

  const salesRepNames = [
    enquiry.salesperson,
    enquiry.sales_representative,
    (enquiry as any).salesRep,
    enquiry.sales_person
  ]
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const matchedRep = salesRepNames.some((rep) => {
    const repLower = rep.toLowerCase();
    const repUpper = rep.toUpperCase();
    if (userNames.some((n) => n === repLower || repLower.includes(n) || n.includes(repLower))) return true;
    if (userInitials.some((init) => init === repUpper)) return true;
    if (userEmail && userEmail === repLower) return true;
    if (userUids.some((u) => u === repLower)) return true;
    return false;
  });

  if (matchedRep) return true;

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
  return false;
}
