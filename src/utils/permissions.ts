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

  const uUid = user.uid?.toLowerCase();
  const uEmail = user.email?.toLowerCase();
  const uInitials = user.initials?.toUpperCase();
  const uFullName = user.full_name?.toLowerCase();
  const uUsername = user.username?.toLowerCase();
  const uSpCode = (user as any).salesperson_code?.toUpperCase();

  const cBy = (record.created_by || record.created_by_user_id)?.toLowerCase();
  const oUserId = record.owner_user_id?.toLowerCase();
  if (oUserId && uUid && oUserId === uUid) return true;

  const sPersonRaw = record.sales_person || record.salesperson_id;
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
  const uUid = (currentUser.uid || (currentUser as any).id || '').toLowerCase().trim();
  const uEmail = (currentUser.email || '').toLowerCase().trim();
  const uUsername = (currentUser.username || '').toLowerCase().trim();
  const uFullName = (currentUser.full_name || '').toLowerCase().trim();
  const uInitials = (
    currentUser.workspace_profiles?.[targetWsId || '']?.initials ||
    currentUser.initials ||
    (currentUser as any).salesperson_code ||
    ''
  ).toUpperCase().trim();

  // 4. Creator Check:
  // enquiry.created_by_uid === currentUser.uid OR enquiry.created_by === currentUser.email / username
  const cByUid = (enquiry.created_by_uid || (enquiry as any).createdByUid || '').toLowerCase().trim();
  const cBy = (enquiry.created_by || (enquiry as any).createdByUsername || '').toLowerCase().trim();
  const cByName = ((enquiry as any).created_by_name || '').toLowerCase().trim();

  if (uUid && cByUid && uUid === cByUid) return true;
  if (cBy && (cBy === uEmail || cBy === uUsername || (uUid && cBy === uUid))) return true;
  if (uFullName && cByName && uFullName === cByName) return true;

  // 5. Primary Salesperson Check:
  // enquiry.salesperson_id === currentUser.uid OR enquiry.salesperson === currentUser.full_name (or initials/code)
  const spId = (enquiry.salesperson_id || enquiry.sales_person_id || '').toLowerCase().trim();
  const sp = (enquiry.salesperson || enquiry.sales_person || '').trim();
  const spLower = sp.toLowerCase();
  const spUpper = sp.toUpperCase();

  if (uUid && spId && uUid === spId) return true;
  if (sp) {
    if (uFullName && (spLower === uFullName || spLower.includes(uFullName))) return true;
    if (uInitials && spUpper === uInitials) return true;
    if (uUsername && spLower === uUsername) return true;
    if (uEmail && spLower === uEmail) return true;
    if (uUid && spLower === uUid) return true;
  }

  // 6. Collaborator / Sharing Check:
  // Current user tagged in additional_team / shared_with_uids / shared_with_names (matching UID, name, or initials)
  if (enquiry.shared_with_uids && Array.isArray(enquiry.shared_with_uids)) {
    if (uUid && enquiry.shared_with_uids.some((id) => String(id).toLowerCase().trim() === uUid)) {
      return true;
    }
  }

  if (enquiry.shared_with_names && Array.isArray(enquiry.shared_with_names)) {
    const isSharedByName = enquiry.shared_with_names.some((val) => {
      if (!val) return false;
      const v = String(val).trim();
      const vLower = v.toLowerCase();
      const vUpper = v.toUpperCase();
      return (
        (uUid && vLower === uUid) ||
        (uEmail && vLower === uEmail) ||
        (uUsername && vLower === uUsername) ||
        (uFullName && (vLower === uFullName || vLower.includes(uFullName))) ||
        (uInitials && vUpper === uInitials)
      );
    });
    if (isSharedByName) return true;
  }

  const rawAdditional = enquiry.additional_team;
  if (rawAdditional) {
    const teamMembers: string[] = Array.isArray(rawAdditional)
      ? rawAdditional.map((item) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object') {
            return (item as any).uid || (item as any).id || (item as any).name || (item as any).initials || (item as any).email || '';
          }
          return String(item || '');
        })
      : typeof rawAdditional === 'string'
      ? rawAdditional.split(/[,;]+/).map((s) => s.trim())
      : [];

    const isTaggedInTeam = teamMembers.some((member) => {
      if (!member) return false;
      const m = String(member).trim();
      const mLower = m.toLowerCase();
      const mUpper = m.toUpperCase();
      return (
        (uUid && mLower === uUid) ||
        (uEmail && mLower === uEmail) ||
        (uUsername && mLower === uUsername) ||
        (uFullName && (mLower === uFullName || mLower.includes(uFullName))) ||
        (uInitials && mUpper === uInitials)
      );
    });
    if (isTaggedInTeam) return true;
  }

  // Legacy concerned_persons field
  const concernedList: string[] = Array.isArray(enquiry.concerned_persons)
    ? enquiry.concerned_persons
    : enquiry.concerned_person
    ? [enquiry.concerned_person]
    : [];

  if (concernedList.length > 0) {
    const isConcerned = concernedList.some((p) => {
      if (!p) return false;
      const pClean = String(p).trim();
      const pLower = pClean.toLowerCase();
      const pUpper = pClean.toUpperCase();
      return (
        (uUid && pLower === uUid) ||
        (uEmail && pLower === uEmail) ||
        (uUsername && pLower === uUsername) ||
        (uFullName && (pLower === uFullName || pLower.includes(uFullName))) ||
        (uInitials && pUpper === uInitials)
      );
    });
    if (isConcerned) return true;
  }

  // Fallback to record owner evaluator
  if (isRecordOwner(currentUser, enquiry, targetWsId)) {
    return true;
  }

  // 7. Edge-Case Fallback:
  // If an enquiry has no assigned salesperson or legacy creator metadata,
  // allow viewing by default so historical records do not disappear.
  const hasSalesperson = Boolean(
    (enquiry.salesperson && enquiry.salesperson.trim() !== '') ||
    (enquiry.sales_person && enquiry.sales_person.trim() !== '') ||
    (enquiry.salesperson_id && enquiry.salesperson_id.trim() !== '') ||
    (enquiry.sales_person_id && enquiry.sales_person_id.trim() !== '')
  );

  const hasCreator = Boolean(
    (enquiry.created_by && enquiry.created_by.trim() !== '') ||
    (enquiry.created_by_uid && enquiry.created_by_uid.trim() !== '') ||
    ((enquiry as any).createdByUid && String((enquiry as any).createdByUid).trim() !== '') ||
    ((enquiry as any).createdByUsername && String((enquiry as any).createdByUsername).trim() !== '') ||
    ((enquiry as any).created_by_name && String((enquiry as any).created_by_name).trim() !== '')
  );

  if (!hasSalesperson && !hasCreator) {
    return true;
  }

  // 8. Deny access otherwise for standard sales reps/members
  return false;
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

  const uUid = (currentUser.uid || (currentUser as any).id || '').toLowerCase().trim();
  const uEmail = (currentUser.email || '').toLowerCase().trim();
  const uUsername = (currentUser.username || '').toLowerCase().trim();
  const uFullName = (currentUser.full_name || '').toLowerCase().trim();
  const uInitials = (
    currentUser.workspace_profiles?.[targetWsId || '']?.initials ||
    currentUser.initials ||
    (currentUser as any).salesperson_code ||
    ''
  ).toUpperCase().trim();

  // 3. Deal Creator
  const cByUid = (enquiry.created_by_uid || (enquiry as any).createdByUid || '').toLowerCase().trim();
  const cBy = (enquiry.created_by || (enquiry as any).createdByUsername || '').toLowerCase().trim();
  const cByName = ((enquiry as any).created_by_name || '').toLowerCase().trim();

  if (uUid && cByUid && uUid === cByUid) return true;
  if (cBy && (cBy === uEmail || cBy === uUsername || (uUid && cBy === uUid))) return true;
  if (uFullName && cByName && uFullName === cByName) return true;

  // 4. Assigned Primary Salesperson
  const spId = (enquiry.salesperson_id || enquiry.sales_person_id || '').toLowerCase().trim();
  const sp = (enquiry.salesperson || enquiry.sales_person || '').trim();
  const spLower = sp.toLowerCase();
  const spUpper = sp.toUpperCase();

  if (uUid && spId && uUid === spId) return true;
  if (sp) {
    if (uFullName && (spLower === uFullName || spLower.includes(uFullName))) return true;
    if (uInitials && spUpper === uInitials) return true;
    if (uUsername && spLower === uUsername) return true;
    if (uEmail && spLower === uEmail) return true;
    if (uUid && spLower === uUid) return true;
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
  return false;
}
