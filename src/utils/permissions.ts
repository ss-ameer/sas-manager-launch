import { UserProfile, UserRole } from '../types';

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
    if (raw === 'sales_rep' || raw === 'member' || raw === 'Member') return 'Member';
    if (raw === 'viewer' || raw === 'Viewer') return 'Viewer';
    return raw as UserRole;
  }

  // 3. Explicit workspace_profiles mapping
  if (user.workspace_profiles && user.workspace_profiles[targetWsId]?.role) {
    const raw = user.workspace_profiles[targetWsId].role;
    if (raw === 'admin' || raw === 'Admin') return 'Admin';
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
  const role = getUserWorkspaceRole(user, workspaceId, activeWorkspace);
  return role === 'Admin' || role === 'admin';
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

export function isSuperAdmin(user: UserProfile | undefined | null): boolean {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  if (email === 'sibuma.syedameer@gmail.com') return true;
  if (user.is_super_admin === true) return true;
  return false;
}
