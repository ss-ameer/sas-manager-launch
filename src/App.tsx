import React, { useState, useEffect, useMemo } from 'react';
import { auth, db, safeDeleteDoc, safeAddDoc, safeUpdateDoc, safeSetDoc } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, onSnapshot, query, orderBy, doc, writeBatch, updateDoc, where, or, documentId } from 'firebase/firestore';
import { Company, Contact, Enquiry, Invite, AuditLog, Salesperson, UserProfile, Product, DropdownOption, Workspace, CallLogEntry, CallStatus } from './types';
import { INITIAL_COMPANIES, INITIAL_CONTACTS, INITIAL_ENQUIRIES, INITIAL_SALESPERSONS } from './seed';
import Login from './components/Login';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import EnquiryList from './components/EnquiryList';
import CompanyModal from './components/CompanyModal';
import SalespersonProfiles from './components/SalespersonProfiles';
import InviteManager from './components/InviteManager';
import EnquiryForm from './components/EnquiryForm';
import EnquiryDetail from './components/EnquiryDetail';
import ProductManager from './components/ProductManager';
import SettingsHub from './components/SettingsHub';
import CloudSyncHub from './components/CloudSyncHub';
import WorkspaceManagerModal from './components/WorkspaceManagerModal';
import CallLogManager from './components/CallLogManager';
import UserProfileModal from './components/UserProfileModal';
import TrashBinModal from './components/TrashBinModal';
import Company360Modal from './components/Company360Modal';
import FreshAccountOnboardingModal from './components/FreshAccountOnboardingModal';
import { SuperAdminConsoleModal } from './components/SuperAdminConsoleModal';
import { QuickActivityDrawer } from './components/QuickActivityDrawer';
import { EnquiryRepository } from './services/repositories/EnquiryRepository';
import { CompanyRepository } from './services/repositories/CompanyRepository';
import { CallLogRepository } from './services/repositories/CallLogRepository';
import { MetadataRepository } from './services/repositories/MetadataRepository';
import { ShieldCheck, HelpCircle, CheckCircle2, AlertCircle, Info, X, User, Clock, Menu } from 'lucide-react';
import { BRAND_CONFIG } from './config';
import { motion, AnimatePresence } from 'motion/react';
import { seedStandardProductsIfNeeded, migrateExistingData, backfillMissingWorkspaceIds } from './utils/migration';
import { recordAuditLog } from './utils/auditLogger';
import { isAdmin } from './utils/permissions';
import { SYSTEM_CALL_STATUSES, SYSTEM_CALL_OUTCOMES, SYSTEM_COMPANY_RELATIONSHIPS, SYSTEM_COMPANY_TEMPERATURES, SYSTEM_RELATIONSHIP_COLORS, SYSTEM_TEMPERATURE_COLORS, normalizeOptionName, healDropdownOptions, normalizeCompany, normalizeContact, normalizeEnquiry, normalizeCallLog } from './utils/defaults';
import { deduplicateList } from './utils/deduplicator';

function getLocalCache<T>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn(`Error reading localStorage key ${key}:`, e);
  }
  return defaultValue;
}

function setLocalCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e: any) {
    if (e?.name === 'QuotaExceededError' || e?.code === 22 || String(e).includes('exceeded the quota')) {
      try {
        // Free up space by purging large non-essential cached arrays like audit logs
        if (key !== 'omni_audit_logs') {
          localStorage.removeItem('omni_audit_logs');
          localStorage.setItem(key, JSON.stringify(value));
        }
      } catch (_) {
        // Quota remains saturated; cloud database (Firestore) remains primary & safe
      }
    } else {
      console.warn(`Error writing localStorage key ${key}:`, e);
    }
  }
}

const FALLBACK_SALESPERSONS: Salesperson[] = [];

const FALLBACK_SOURCES = ['Email', 'Phone', 'WhatsApp', 'Meeting', 'Verbal'];
const FALLBACK_CATEGORIES = [
  'FRP Tanks',
  'FRP Vessels',
  'Pressure Vessels',
  'RO Membranes',
  'RO Housing',
  'Cartridge Filters',
  'Dosing Pumps',
  'MBBR Media',
  'Filter Media',
  'Tube Settler Media',
  'Chemicals',
  'Valves',
  'Frames/Fabrication',
  'Various',
  'Other'
];
const FALLBACK_UNITS = ['Nos', 'M3', 'MT', 'Set', 'LS', 'Kg'];
const FALLBACK_CALL_STATUSES = SYSTEM_CALL_STATUSES;
const FALLBACK_CALL_OUTCOMES = SYSTEM_CALL_OUTCOMES;

const WORKSPACE_BADGE_COLORS = [
  { dot: 'bg-blue-500', bg: 'bg-blue-50 border-blue-200 text-blue-700' },
  { dot: 'bg-indigo-500', bg: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { dot: 'bg-emerald-500', bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { dot: 'bg-amber-500', bg: 'bg-amber-50 border-amber-200 text-amber-800' },
  { dot: 'bg-purple-500', bg: 'bg-purple-50 border-purple-200 text-purple-700' },
  { dot: 'bg-rose-500', bg: 'bg-rose-50 border-rose-200 text-rose-700' },
  { dot: 'bg-cyan-500', bg: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  { dot: 'bg-teal-500', bg: 'bg-teal-50 border-teal-200 text-teal-700' }
];

function getWorkspaceBadgeStyle(id: string | undefined, name: string | undefined) {
  const key = (id || '') + (name || '');
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % WORKSPACE_BADGE_COLORS.length;
  return WORKSPACE_BADGE_COLORS[index];
}

const DEFAULT_WORKSPACE: Workspace = {
  id: 'ws_default',
  name: 'Main Workspace',
  description: 'Primary workspace for technical sales, enquiries, and call logs',
  created_by: 'System',
  createdAt: '2026-01-01T00:00:00.000Z',
  modules: {
    enquiriesEnabled: true,
    callLogEnabled: true
  },
  geography_options: [
    'Dubai, UAE',
    'Abu Dhabi, UAE',
    'Northern Emirates, UAE',
    'Saudi Arabia (KSA)',
    'Qatar',
    'Oman',
    'Kuwait',
    'Bahrain',
    'International / Other'
  ]
};

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Tab State
  const [currentTab, setCurrentTab] = useState('call_log');

  // Workspaces State
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
    getLocalCache('omni_workspaces', [DEFAULT_WORKSPACE])
  );
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string>(() => {
    const lastActive = localStorage.getItem('last_active_workspace_id');
    if (lastActive && lastActive.trim() !== '') return lastActive;
    return getLocalCache('omni_active_workspace_id', 'ws_default');
  });

  const setActiveWorkspaceId = (id: string) => {
    setActiveWorkspaceIdState(id);
    localStorage.setItem('last_active_workspace_id', id);
    setLocalCache('omni_active_workspace_id', id);
  };

  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [isSuperAdminConsoleOpen, setIsSuperAdminConsoleOpen] = useState(false);

  useEffect(() => {
    const handleOpenSuperAdmin = () => setIsSuperAdminConsoleOpen(true);
    window.addEventListener('open-super-admin-console', handleOpenSuperAdmin);
    return () => window.removeEventListener('open-super-admin-console', handleOpenSuperAdmin);
  }, []);

  // Firestore & Local Workspace Collections State
  const [companies, setCompanies] = useState<Company[]>(() =>
    getLocalCache<Company[]>('omni_companies', []).map((c) => normalizeCompany(c, activeWorkspaceId))
  );

  // Call Logs State
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>(() => {
    const cachedComp = getLocalCache<Company[]>('omni_companies', []);
    return getLocalCache<CallLogEntry[]>('omni_call_logs', []).map((l) => normalizeCallLog(l, activeWorkspaceId, cachedComp));
  });
  const [contacts, setContacts] = useState<Contact[]>(() =>
    getLocalCache<Contact[]>('omni_contacts', []).map((c) => normalizeContact(c, activeWorkspaceId))
  );
  const [enquiries, setEnquiries] = useState<Enquiry[]>(() =>
    getLocalCache<Enquiry[]>('omni_enquiries', []).map((e) => normalizeEnquiry(e, activeWorkspaceId))
  );
  const [invites, setInvites] = useState<Invite[]>(() => getLocalCache('omni_invites', []));
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => getLocalCache('omni_audit_logs', []));
  const [salespersons, setSalespersons] = useState<Salesperson[]>(() => getLocalCache('omni_salespersons', []));
  const [products, setProducts] = useState<Product[]>(() => getLocalCache('omni_products', []));
  const [enquirySources, setEnquirySources] = useState<DropdownOption[]>(() => getLocalCache('omni_sources', FALLBACK_SOURCES.map((s, i) => ({ id: 'src_' + i, name: s }))));
  const [productCategories, setProductCategories] = useState<DropdownOption[]>(() => getLocalCache('omni_categories', FALLBACK_CATEGORIES.map((c, i) => ({ id: 'cat_' + i, name: c }))));
  const [units, setUnits] = useState<DropdownOption[]>(() => getLocalCache('omni_units', FALLBACK_UNITS.map((u, i) => ({ id: 'u_' + i, name: u }))));
  const [callStatuses, setCallStatuses] = useState<DropdownOption[]>(() => {
    const cached = getLocalCache<DropdownOption[]>('omni_call_statuses', []);
    const healed = healDropdownOptions(cached, FALLBACK_CALL_STATUSES, 'cs');
    return healed.mergedList;
  });
  const [callOutcomes, setCallOutcomes] = useState<DropdownOption[]>(() => {
    const cached = getLocalCache<DropdownOption[]>('omni_call_outcomes', []);
    const healed = healDropdownOptions(cached, FALLBACK_CALL_OUTCOMES, 'co');
    return healed.mergedList;
  });
  const [companyRelationships, setCompanyRelationships] = useState<DropdownOption[]>(() => {
    const cached = getLocalCache<DropdownOption[]>('omni_company_relationships', []);
    const healed = healDropdownOptions(cached, SYSTEM_COMPANY_RELATIONSHIPS, 'cr', SYSTEM_RELATIONSHIP_COLORS);
    return healed.mergedList;
  });
  const [companyTemperatures, setCompanyTemperatures] = useState<DropdownOption[]>(() => {
    const cached = getLocalCache<DropdownOption[]>('omni_company_temperatures', []);
    const healed = healDropdownOptions(cached, SYSTEM_COMPANY_TEMPERATURES, 'ct', SYSTEM_TEMPERATURE_COLORS);
    return healed.mergedList;
  });

  // Sync Mode Control State
  const [realtimeSyncEnabled, setRealtimeSyncEnabled] = useState<boolean>(() => {
    return localStorage.getItem('omni_realtime_sync') !== 'false';
  });

  // Admin Data Visibility & Salesperson Selection Permissions State
  const [dataVisibilityScope, setDataVisibilityScope] = useState<'ALL_DATA' | 'OWN_DATA_ONLY'>(() => {
    return (localStorage.getItem('omni_data_visibility_scope') as 'ALL_DATA' | 'OWN_DATA_ONLY') || 'ALL_DATA';
  });

  const [allowUserSalespersonSelection, setAllowUserSalespersonSelection] = useState<boolean>(() => {
    return localStorage.getItem('omni_allow_user_salesperson_selection') !== 'false';
  });

  useEffect(() => {
    localStorage.setItem('omni_data_visibility_scope', dataVisibilityScope);
  }, [dataVisibilityScope]);

  useEffect(() => {
    localStorage.setItem('omni_allow_user_salesperson_selection', String(allowUserSalespersonSelection));
  }, [allowUserSalespersonSelection]);

  // Drawer & Form Overlay states
  const [selectedEnquiryId, setSelectedEnquiryId] = useState<string | null>(null);
  const [selected360CompanyId, setSelected360CompanyId] = useState<string | null>(null);
  const [showEnquiryForm, setShowEnquiryForm] = useState(false);
  const [enquiryToEdit, setEnquiryToEdit] = useState<Enquiry | null>(null);
  const [showTrashBinModal, setShowTrashBinModal] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Global mobile menu open trigger listener
  useEffect(() => {
    const handleOpenMobileSidebar = () => setIsMobileMenuOpen(true);
    window.addEventListener('open-mobile-sidebar', handleOpenMobileSidebar);
    return () => window.removeEventListener('open-mobile-sidebar', handleOpenMobileSidebar);
  }, []);

  // Strict Zero-Trust Audit: Block "Lingering State" Context Leaks on Workspace Switch
  useEffect(() => {
    setSelectedEnquiryId(null);
    setEnquiryToEdit(null);
    setShowEnquiryForm(false);
    setSelected360CompanyId(null);
    setIsActivityDrawerOpen(false);
    setIsMobileMenuOpen(false);
  }, [activeWorkspaceId]);

  // Quick Activity Drawer State
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [companyEditContext, setCompanyEditContext] = useState<{ id: string; openEdit: boolean; timestamp?: number } | null>(null);

  const handleEditCompanyFrom360 = (company: Company) => {
    setSelected360CompanyId(null);
    setCompanyEditContext({ id: company.id, openEdit: true, timestamp: Date.now() });
    setCurrentTab('companies');
  };
  const [activityDrawerContext, setActivityDrawerContext] = useState<{
    companyId?: string;
    companyName?: string;
    contactId?: string;
    contactName?: string;
    contactPhone?: string;
    enquiryId?: string;
    channel?: 'Call' | 'WhatsApp' | 'Email' | 'Meeting' | 'Site Visit';
    initialStatus?: CallStatus;
    existingLog?: CallLogEntry | null;
    logToEdit?: CallLogEntry | null;
  }>({});

  // Global toast notifications
  const [toast, setToast] = useState<{ id: string; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [dismissedCheckInWsId, setDismissedCheckInWsId] = useState<string | null>(null);

  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ id: Date.now().toString(), message, type });
  };

  useEffect(() => {
    try {
      const isInitialized = localStorage.getItem('initialized') === 'true' || localStorage.getItem('omni_pristine_initialized') === 'true';
      if (!isInitialized) {
        // Pristine State Check: Clear local storage to purge any stale test data or legacy developer credentials
        localStorage.clear();
        localStorage.setItem('initialized', 'true');
        localStorage.setItem('omni_pristine_initialized', 'true');
        localStorage.setItem('omni_cache_version', 'v3_pristine');
      } else if (localStorage.getItem('omni_cache_version') !== 'v3_pristine') {
        localStorage.removeItem('omni_companies');
        localStorage.removeItem('omni_contacts');
        localStorage.removeItem('omni_enquiries');
        localStorage.removeItem('omni_salespersons');
        localStorage.removeItem('omni_invites');
        localStorage.removeItem('omni_audit_logs');
        localStorage.removeItem('omni_products');
        localStorage.setItem('omni_cache_version', 'v3_pristine');
      }
    } catch (e) {
      console.warn("Could not execute pristine state initialization:", e);
    }
  }, []);

  // Workspace Members State
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>(() =>
    getLocalCache('omni_workspace_members', [])
  );

  // Compute valid user-accessible workspaces, strictly ignoring orphaned records
  const userWorkspaces = useMemo(() => {
    if (!user) return [];
    const userEmail = (user.email || '').toLowerCase().trim();
    const userUid = user.uid;

    return (workspaces || []).filter((w) => {
      if (!w || !w.id) return false;

      // Check workspace_members collection first if available
      if (workspaceMembers && workspaceMembers.length > 0) {
        const activeMemberDocs = workspaceMembers.filter(
          (m: any) =>
            (m.workspace_id === w.id || m.workspaceId === w.id) &&
            m.status !== 'inactive'
        );

        const hasMemberDoc = activeMemberDocs.some((m: any) => {
          const mUid = m.user_id || m.uid;
          const mEmail = (m.email || '').toLowerCase().trim();
          return (
            (mUid && mUid === userUid) ||
            (mEmail && userEmail && mEmail === userEmail)
          );
        });

        if (hasMemberDoc) return true;
      }

      // Fallback checks (for offline mode or freshly created local workspaces)
      if (isAdmin(user, w.id, w)) return true;

      if (Array.isArray(w.members)) {
        const isMember = w.members.some(
          (m: any) =>
            (m.uid && m.uid === userUid) ||
            (m.email && m.email.toLowerCase().trim() === userEmail)
        );
        if (isMember) return true;
      }

      if (Array.isArray(w.member_emails)) {
        const isEmailMember = w.member_emails.some(
          (e: string) => typeof e === 'string' && e.toLowerCase().trim() === userEmail
        );
        if (isEmailMember) return true;
      }

      return false;
    });
  }, [workspaces, user, workspaceMembers]);

  // Filter & deduplicate visible workspaces
  const visibleWorkspaces = useMemo(() => {
    const baseList = userWorkspaces;

    // Map-based deduplication by workspace ID
    const seenIds = new Set<string>();
    const deduplicated = baseList.filter((w) => {
      if (!w || !w.id || seenIds.has(w.id)) return false;
      seenIds.add(w.id);
      return true;
    });

    return deduplicated.length > 0 ? deduplicated : [DEFAULT_WORKSPACE];
  }, [userWorkspaces]);

  // Auto-sync workspace collections to local storage cache whenever updated
  const activeWorkspace = useMemo(() => {
    return (
      visibleWorkspaces.find((w) => w.id === activeWorkspaceId) ||
      visibleWorkspaces[0] ||
      DEFAULT_WORKSPACE
    );
  }, [visibleWorkspaces, activeWorkspaceId]);

  const isDefaultWorkspace = useMemo(() => {
    return (
      activeWorkspace.id === 'ws_default' ||
      activeWorkspace.id === user?.defaultWorkspaceId ||
      activeWorkspace.id === visibleWorkspaces[0]?.id
    );
  }, [activeWorkspace.id, user?.defaultWorkspaceId, visibleWorkspaces]);

  // Workspace-filtered views
  const workspaceCompanies = useMemo(() => {
    return companies.filter((c) => {
      const wId = c.workspace_id || (c as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [companies, activeWorkspace.id, isDefaultWorkspace]);

  const visibleCompanies = useMemo(() => workspaceCompanies, [workspaceCompanies]);

  const workspaceContacts = useMemo(() => {
    return contacts.filter((c) => {
      const wId = c.workspace_id || (c as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [contacts, activeWorkspace.id, isDefaultWorkspace]);

  const workspaceEnquiries = useMemo(() => {
    return enquiries.filter((e) => {
      const wId = e.workspace_id || (e as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [enquiries, activeWorkspace.id, isDefaultWorkspace]);

  const workspaceSalespersons = useMemo(() => {
    return salespersons.filter((s) => {
      const wId = s.workspace_id || (s as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [salespersons, activeWorkspace.id, isDefaultWorkspace]);

  const workspaceProducts = useMemo(() => {
    return products.filter((p) => {
      const wId = p.workspace_id || (p as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [products, activeWorkspace.id, isDefaultWorkspace]);

  const workspaceCallLogs = useMemo(() => {
    return callLogs.filter((l) => {
      const wId = l.workspace_id || (l as any).workspaceId;
      return wId === activeWorkspace.id || (!wId && isDefaultWorkspace);
    });
  }, [callLogs, activeWorkspace.id, isDefaultWorkspace]);

  const currentUserInitials = useMemo(() => {
    return user?.initials || (user?.full_name ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase() : '') || user?.username || '';
  }, [user]);

  const currentSalespersonId = useMemo(() => {
    if (!user) return '';
    const userEmail = (user.email || '').toLowerCase().trim();
    const userName = (user.full_name || user.username || '').toLowerCase().trim();
    const matched = salespersons.find(
      (s) =>
        (s.linked_user_id && user.uid && s.linked_user_id === user.uid) ||
        (s.email && userEmail && s.email.toLowerCase() === userEmail) ||
        (s.full_name && userName && s.full_name.toLowerCase() === userName)
    );
    return matched?.id || '';
  }, [user, salespersons]);

  // Apply Role & Data Visibility Scope Filters (Admin sees everything; Non-Admin sees filtered if OWN_DATA_ONLY is active)
  const visibleEnquiries = useMemo(() => {
    const userScope = user?.dataVisibilityScope || dataVisibilityScope || 'ALL_DATA';
    if (!user || isAdmin(user, activeWorkspace?.id, activeWorkspace) || userScope !== 'OWN_DATA_ONLY') {
      return workspaceEnquiries;
    }
    const userEmail = (user.email || '').toLowerCase().trim();
    const userName = (user.full_name || user.username || '').toLowerCase().trim();
    const currentUserInitials = (user.initials || '').toLowerCase().trim();

    const matchedSalesperson = salespersons.find(
      (s) =>
        (s.linked_user_id && user.uid && s.linked_user_id === user.uid) ||
        (s.email && userEmail && s.email.toLowerCase() === userEmail) ||
        (s.full_name && userName && s.full_name.toLowerCase() === userName)
    );
    const currentSalespersonId = matchedSalesperson?.id;

    return workspaceEnquiries.filter((e) => {
      const spId = e.sales_person_id || (e as any).salesperson_id;
      const sp = (e.sales_person || e.salesperson || '').toLowerCase().trim();
      const cb = (e.createdBy || e.created_by || '').toLowerCase().trim();
      const as = (e.assignedTo || '').toLowerCase().trim();

      const matchesSpId = currentSalespersonId && spId && spId === currentSalespersonId;
      const matchesSpInitials = currentUserInitials && sp === currentUserInitials;
      const matchesSpNameOrEmail = sp && (sp === userName || sp === userEmail);

      return (
        matchesSpId ||
        matchesSpInitials ||
        matchesSpNameOrEmail ||
        (cb && (cb === userEmail || cb === userName || (currentUserInitials && cb === currentUserInitials))) ||
        (as && (as === userName || as === userEmail || (currentUserInitials && as === currentUserInitials)))
      );
    });
  }, [workspaceEnquiries, user, dataVisibilityScope, salespersons]);

  const visibleCallLogs = useMemo(() => {
    const userScope = user?.dataVisibilityScope || dataVisibilityScope || 'ALL_DATA';
    if (!user || isAdmin(user, activeWorkspace?.id, activeWorkspace) || userScope !== 'OWN_DATA_ONLY') {
      return workspaceCallLogs;
    }
    const userEmail = (user.email || '').toLowerCase().trim();
    const userName = (user.full_name || user.username || '').toLowerCase().trim();
    const currentUserInitials = (user.initials || '').toLowerCase().trim();

    const matchedSalesperson = salespersons.find(
      (s) =>
        (s.linked_user_id && user.uid && s.linked_user_id === user.uid) ||
        (s.email && userEmail && s.email.toLowerCase() === userEmail) ||
        (s.full_name && userName && s.full_name.toLowerCase() === userName)
    );
    const currentSalespersonId = matchedSalesperson?.id;

    return workspaceCallLogs.filter((l) => {
      const spId = l.sales_person_id || l.handled_by_salesperson_id || (l as any).salesperson_id;
      const sp = (l.sales_person || l.handled_by_team_member_name || l.salesperson || '').toLowerCase().trim();
      const lb = (l.logged_by || l.createdBy || l.created_by || '').toLowerCase().trim();

      const matchesSpId = currentSalespersonId && spId && spId === currentSalespersonId;
      const matchesSpInitials = currentUserInitials && sp === currentUserInitials;
      const matchesSpNameOrEmail = sp && (sp === userName || sp === userEmail);

      return (
        matchesSpId ||
        matchesSpInitials ||
        matchesSpNameOrEmail ||
        (lb && (lb === userEmail || lb === userName || (currentUserInitials && lb === currentUserInitials)))
      );
    });
  }, [workspaceCallLogs, user, dataVisibilityScope, salespersons]);

  useEffect(() => { setLocalCache('omni_workspaces', workspaces); }, [workspaces]);
  useEffect(() => { 
    setLocalCache('omni_active_workspace_id', activeWorkspaceId); 
    if (activeWorkspaceId) {
      localStorage.setItem('last_active_workspace_id', activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (user) {
      backfillMissingWorkspaceIds();
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user?.uid) {
      const email = (user.email || '').toLowerCase().trim();
      if (email === 'sibuma.syedameer@gmail.com' && user.is_super_admin !== true) {
        updateDoc(doc(db, 'users', user.uid), { is_super_admin: true })
          .catch((err) => console.warn('Auto-promote master account effect error:', err));
        setUser((prev) => (prev ? { ...prev, is_super_admin: true } : prev));
      }
    }
  }, [user?.uid, user?.email, user?.is_super_admin]);
  useEffect(() => {
    const savedWs = localStorage.getItem('last_active_workspace_id') || localStorage.getItem('omni_active_workspace_id');
    if (savedWs && savedWs !== activeWorkspaceId) {
      setActiveWorkspaceId(savedWs);
    } else if (user?.defaultWorkspaceId && user.defaultWorkspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(user.defaultWorkspaceId);
    }
  }, [user?.defaultWorkspaceId]);
  useEffect(() => { setLocalCache('omni_call_logs', callLogs); }, [callLogs]);
  useEffect(() => { setLocalCache('omni_companies', companies); }, [companies]);
  useEffect(() => { setLocalCache('omni_contacts', contacts); }, [contacts]);
  useEffect(() => { setLocalCache('omni_enquiries', enquiries); }, [enquiries]);
  useEffect(() => { setLocalCache('omni_invites', invites); }, [invites]);
  useEffect(() => { setLocalCache('omni_audit_logs', auditLogs); }, [auditLogs]);
  useEffect(() => { setLocalCache('omni_salespersons', salespersons); }, [salespersons]);
  useEffect(() => { setLocalCache('omni_products', products); }, [products]);
  useEffect(() => { setLocalCache('omni_sources', enquirySources); }, [enquirySources]);
  useEffect(() => { setLocalCache('omni_categories', productCategories); }, [productCategories]);
  useEffect(() => { setLocalCache('omni_units', units); }, [units]);
  useEffect(() => { setLocalCache('omni_call_statuses', callStatuses); }, [callStatuses]);
  useEffect(() => { setLocalCache('omni_call_outcomes', callOutcomes); }, [callOutcomes]);
  useEffect(() => { setLocalCache('omni_company_relationships', companyRelationships); }, [companyRelationships]);
  useEffect(() => { setLocalCache('omni_company_temperatures', companyTemperatures); }, [companyTemperatures]);

  // Silent Auto-Provisioning: Automatically create salespersons record for active workspace if missing
  const autoProvisionedKeysRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !activeWorkspace?.id) return;

    const wsId = activeWorkspace.id;
    const userUid = user.uid;
    const userEmail = (user.email || '').toLowerCase().trim();
    if (!userUid) return;

    const key = `${wsId}_${userUid}`;
    if (autoProvisionedKeysRef.current.has(key)) return;

    // Check if matching salesperson record exists in this workspace
    const hasSalesperson = salespersons.some((s) => {
      const sWsId = s.workspace_id || (s as any).workspaceId;
      if (sWsId !== wsId) return false;

      const matchesUid = (s.linked_user_id && s.linked_user_id === userUid) || (s.user_id && s.user_id === userUid) || s.uid === userUid;
      const matchesEmail = s.email && userEmail && s.email.toLowerCase().trim() === userEmail;

      return Boolean(matchesUid || matchesEmail);
    });

    if (!hasSalesperson) {
      autoProvisionedKeysRef.current.add(key);

      const displayName = user.full_name || (user as any).displayName || user.username || (userEmail ? userEmail.split('@')[0] : 'User');
      const nameParts = displayName.trim().split(/\s+/);
      let autoInitials = '';
      if (nameParts.length >= 2) {
        autoInitials = (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
      } else if (nameParts.length === 1 && nameParts[0].length >= 2) {
        autoInitials = nameParts[0].substring(0, 2).toUpperCase();
      } else {
        autoInitials = (displayName.substring(0, 2) || 'RM').toUpperCase();
      }

      const spDocId = `sp_${wsId}_${userUid}`;
      const newSalespersonDoc = {
        id: spDocId,
        workspace_id: wsId,
        full_name: displayName,
        email: user.email || '',
        initials: autoInitials,
        linked_user_id: userUid,
        user_id: userUid,
        uid: userUid,
        status: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      safeSetDoc('salespersons', spDocId, newSalespersonDoc, { merge: true }).catch((err) => {
        console.warn('Silent auto-provisioning salesperson error:', err);
      });
    }
  }, [user, activeWorkspace?.id, salespersons]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Keep refs of all active subscription unsubscribers
  const activeUnsubscribersRef = React.useRef<{
    userProfile: (() => void) | null;
    workspaces: (() => void) | null;
    callLogs: (() => void) | null;
    companies: (() => void) | null;
    contacts: (() => void) | null;
    enquiries: (() => void) | null;
    invites: (() => void) | null;
    auditLogs: (() => void) | null;
    salespersons: (() => void) | null;
    products: (() => void) | null;
    enquirySources: (() => void) | null;
    productCategories: (() => void) | null;
    units: (() => void) | null;
    callStatuses: (() => void) | null;
    callOutcomes: (() => void) | null;
  }>({
    userProfile: null,
    workspaces: null,
    callLogs: null,
    companies: null,
    contacts: null,
    enquiries: null,
    invites: null,
    auditLogs: null,
    salespersons: null,
    products: null,
    enquirySources: null,
    productCategories: null,
    units: null,
    callStatuses: null,
    callOutcomes: null
  });

  const cleanupAllListeners = () => {
    const refs = activeUnsubscribersRef.current;
    if (refs.userProfile) { refs.userProfile(); refs.userProfile = null; }
    if (refs.workspaces) { refs.workspaces(); refs.workspaces = null; }
    if (refs.callLogs) { refs.callLogs(); refs.callLogs = null; }
    if (refs.companies) { refs.companies(); refs.companies = null; }
    if (refs.contacts) { refs.contacts(); refs.contacts = null; }
    if (refs.enquiries) { refs.enquiries(); refs.enquiries = null; }
    if (refs.invites) { refs.invites(); refs.invites = null; }
    if (refs.auditLogs) { refs.auditLogs(); refs.auditLogs = null; }
    if (refs.salespersons) { refs.salespersons(); refs.salespersons = null; }
    if (refs.products) { refs.products(); refs.products = null; }
    if (refs.enquirySources) { refs.enquirySources(); refs.enquirySources = null; }
    if (refs.productCategories) { refs.productCategories(); refs.productCategories = null; }
    if (refs.units) { refs.units(); refs.units = null; }
    if (refs.callStatuses) { refs.callStatuses(); refs.callStatuses = null; }
    if (refs.callOutcomes) { refs.callOutcomes(); refs.callOutcomes = null; }
  };

  // Auth monitoring listener
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Synchronously clear all active subscriptions immediately on auth change
      cleanupAllListeners();

      if (!firebaseUser) {
        const localUserRaw = localStorage.getItem('omni_local_user');
        if (localUserRaw) {
          try {
            const localProfile = JSON.parse(localUserRaw);
            setUser(localProfile);
            setAuthLoading(false);
            return;
          } catch (e) {
            console.warn("Could not parse local user profile:", e);
          }
        }
        setUser(null);
        setAuthLoading(false);
        // Clear collections state only if no local session exists
        setCompanies([]);
        setContacts([]);
        setEnquiries([]);
        setInvites([]);
        setAuditLogs([]);
        setSalespersons([]);
      } else {
        // Subscribe to user profile document
        activeUnsubscribersRef.current.userProfile = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (docSnap) => {
            if (docSnap.exists()) {
              const uData = docSnap.data() as UserProfile;
              const rawLocal = localStorage.getItem('omni_local_user');
              let parsedLocal: UserProfile | null = null;
              if (rawLocal) {
                try { parsedLocal = JSON.parse(rawLocal); } catch (e) {}
              }
              const hasCompleted = uData.profileCompleted || (parsedLocal?.uid === uData.uid ? parsedLocal?.profileCompleted : false) || Boolean(uData.full_name);
              const mergedUser: UserProfile = {
                ...uData,
                profileCompleted: hasCompleted,
                full_name: uData.full_name || (parsedLocal?.uid === uData.uid ? parsedLocal?.full_name : undefined) || uData.username
              };

              // Auto-Promote Master Account in Firestore
              const userEmailClean = (mergedUser.email || firebaseUser.email || '').toLowerCase().trim();
              if (userEmailClean === 'sibuma.syedameer@gmail.com') {
                mergedUser.is_super_admin = true;
                if (uData.is_super_admin !== true) {
                  updateDoc(doc(db, 'users', firebaseUser.uid), { is_super_admin: true })
                    .catch((err) => console.warn('Auto-promote master account error:', err));
                }
              }

              setUser(mergedUser);
              setLocalCache(`omni_user_${firebaseUser.uid}`, mergedUser);
              localStorage.setItem('omni_local_user', JSON.stringify(mergedUser));
            } else {
              // Try local cache first before constructing a default
              const cachedLocal = getLocalCache<UserProfile | null>(`omni_user_${firebaseUser.uid}`, null);
              const rawLocal = localStorage.getItem('omni_local_user');
              let parsedLocal: UserProfile | null = null;
              if (rawLocal) {
                try { parsedLocal = JSON.parse(rawLocal); } catch (e) {}
              }
              const validCache = cachedLocal || (parsedLocal && parsedLocal.uid === firebaseUser.uid ? parsedLocal : null);

              if (validCache) {
                const emailClean = (validCache.email || firebaseUser.email || '').toLowerCase().trim();
                if (emailClean === 'sibuma.syedameer@gmail.com') {
                  validCache.is_super_admin = true;
                  updateDoc(doc(db, 'users', firebaseUser.uid), { is_super_admin: true })
                    .catch((err) => console.warn('Auto-promote master account error:', err));
                }
                setUser(validCache);
              } else {
                const isEmailAdmin = firebaseUser.email?.toLowerCase().startsWith('admin@');
                const isMasterAccount = (firebaseUser.email || '').toLowerCase().trim() === 'sibuma.syedameer@gmail.com';
                const defaultProf: UserProfile = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email || 'user@omnisuite.com',
                  username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Member',
                  full_name: firebaseUser.displayName || undefined,
                  role: isEmailAdmin || isMasterAccount ? 'Admin' : 'Member',
                  is_super_admin: isMasterAccount ? true : undefined,
                  workspaceIds: ['ws_default'],
                  defaultWorkspaceId: 'ws_default',
                  createdAt: new Date().toISOString()
                };
                if (isMasterAccount) {
                  updateDoc(doc(db, 'users', firebaseUser.uid), { is_super_admin: true })
                    .catch((err) => console.warn('Auto-promote master account error:', err));
                }
                setUser(defaultProf);
                setLocalCache(`omni_user_${firebaseUser.uid}`, defaultProf);
                localStorage.setItem('omni_local_user', JSON.stringify(defaultProf));
              }
            }
            setAuthLoading(false);
          },
          (error) => {
            console.warn("User profile subscription error (Quota or Network):", error);
            const cachedUser = getLocalCache<UserProfile | null>(`omni_user_${firebaseUser.uid}`, null);
            if (cachedUser) {
              setUser(cachedUser);
            } else {
              const fallbackProf: UserProfile = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || 'user@omnisuite.com',
                username: firebaseUser.displayName || 'Member',
                role: 'Member',
                workspaceIds: ['ws_default'],
                defaultWorkspaceId: 'ws_default',
                createdAt: new Date().toISOString()
              };
              setUser(fallbackProf);
              setLocalCache(`omni_user_${firebaseUser.uid}`, fallbackProf);
            }
            setAuthLoading(false);
          }
        );
      }
    });

    return () => {
      unsubAuth();
      cleanupAllListeners();
    };
  }, []);

  // Real-time Firestore Sync listeners (Only active when fully logged in and profile is available)
  useEffect(() => {
    // If user is null or realtimeSync is disabled, ensure all listeners are cleaned up
    if (!user || !realtimeSyncEnabled) {
      cleanupAllListeners();
      return;
    }

    const refs = activeUnsubscribersRef.current;

    // Strict Single-User Workspace Querying (Step 1 -> Step 2 -> Step 3)
    if (!refs.workspaceMembers) {
      const userEmail = (user.email || '').toLowerCase().trim();
      const userUid = user.uid;

      // Step 1: Subscribe ONLY to workspace_members for current user
      const wmQuery = query(
        collection(db, 'workspace_members'),
        or(
          where('user_id', '==', userUid),
          where('uid', '==', userUid),
          where('email', '==', userEmail),
          where('email', '==', user.email || '')
        )
      );

      refs.workspaceMembers = onSnapshot(
        wmQuery,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setWorkspaceMembers(list);
          setLocalCache('omni_workspace_members', list);

          // Step 2: Extract array of workspace_id strings from user member docs
          const allowedWsIds = new Set<string>();
          list.forEach((m: any) => {
            const wsId = m.workspace_id || m.workspaceId;
            if (wsId && m.status !== 'inactive') {
              allowedWsIds.add(wsId);
            }
          });

          if (Array.isArray(user.workspaceIds)) {
            user.workspaceIds.forEach((id) => { if (id) allowedWsIds.add(id); });
          }
          if (user.defaultWorkspaceId) {
            allowedWsIds.add(user.defaultWorkspaceId);
          }
          if (allowedWsIds.size === 0) {
            allowedWsIds.add('ws_default');
          }

          const allowedWsArray = Array.from(allowedWsIds);

          // Step 3: Fetch/filter workspaces ONLY where workspace.id is explicitly included
          if (allowedWsArray.length > 0) {
            if (refs.workspaces) {
              refs.workspaces();
              refs.workspaces = null;
            }

            const wsQuery = query(
              collection(db, 'workspaces'),
              where(documentId(), 'in', allowedWsArray.slice(0, 30))
            );

            refs.workspaces = onSnapshot(
              wsQuery,
              (wsSnap) => {
                const fetchedList = wsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace));
                if (allowedWsIds.has('ws_default') && !fetchedList.some((w) => w.id === 'ws_default')) {
                  fetchedList.unshift(DEFAULT_WORKSPACE);
                }
                const finalWorkspaces = fetchedList.length > 0 ? fetchedList : [DEFAULT_WORKSPACE];
                setWorkspaces(finalWorkspaces);
                setLocalCache('omni_workspaces', finalWorkspaces);
              },
              (error) => {
                console.warn("Workspaces listener error (Quota/Offline):", error);
                setWorkspaces(getLocalCache('omni_workspaces', [DEFAULT_WORKSPACE]));
              }
            );
          } else {
            setWorkspaces([DEFAULT_WORKSPACE]);
          }
        },
        (error) => {
          console.warn("Workspace members listener error (Quota/Offline):", error);
          setWorkspaceMembers(getLocalCache('omni_workspace_members', []));
          setWorkspaces(getLocalCache('omni_workspaces', [DEFAULT_WORKSPACE]));
        }
      );
    }

    // Call Logs
    if (!refs.callLogs) {
      refs.callLogs = onSnapshot(collection(db, 'call_logs'), (snap) => {
        const cachedComp = getLocalCache<Company[]>('omni_companies', []);
        const list = snap.docs.map((d) => normalizeCallLog({ id: d.id, ...d.data() }, activeWorkspaceId, cachedComp));
        setCallLogs((prev) => {
          const clean = deduplicateList(list, prev);
          setLocalCache('omni_call_logs', clean);
          return clean;
        });
      }, (error) => {
        console.warn("Call logs listener error (Quota/Offline):", error);
        const cachedComp = getLocalCache<Company[]>('omni_companies', []);
        setCallLogs(getLocalCache<CallLogEntry[]>('omni_call_logs', []).map((l) => normalizeCallLog(l, activeWorkspaceId, cachedComp)));
      });
    }

    // Companies
    if (!refs.companies) {
      refs.companies = onSnapshot(collection(db, 'companies'), (snap) => {
        const list = snap.docs.map((d) => normalizeCompany({ id: d.id, ...d.data() }, activeWorkspaceId));
        setCompanies((prev) => {
          const clean = deduplicateList(list, prev);
          setLocalCache('omni_companies', clean);
          return clean;
        });
      }, (error) => {
        console.warn("Companies snapshot listener error (Quota/Offline):", error);
        setCompanies(getLocalCache<Company[]>('omni_companies', []).map((c) => normalizeCompany(c, activeWorkspaceId)));
      });
    }

    // Contacts
    if (!refs.contacts) {
      refs.contacts = onSnapshot(collection(db, 'contacts'), (snap) => {
        const list = snap.docs.map((d) => normalizeContact({ id: d.id, ...d.data() }, activeWorkspaceId));
        setContacts((prev) => {
          const clean = deduplicateList(list, prev);
          setLocalCache('omni_contacts', clean);
          return clean;
        });
      }, (error) => {
        console.warn("Contacts snapshot listener error (Quota/Offline):", error);
        setContacts(getLocalCache<Contact[]>('omni_contacts', []).map((c) => normalizeContact(c, activeWorkspaceId)));
      });
    }

    // Enquiries
    if (!refs.enquiries) {
      refs.enquiries = onSnapshot(query(collection(db, 'enquiries'), orderBy('sn', 'asc')), (snap) => {
        const list = snap.docs.map((d) => normalizeEnquiry({ id: d.id, ...d.data() }, activeWorkspaceId));
        setEnquiries((prev) => {
          const clean = deduplicateList(list, prev);
          setLocalCache('omni_enquiries', clean);
          return clean;
        });
      }, (error) => {
        console.warn("Enquiries snapshot listener error (Quota/Offline):", error);
        setEnquiries(getLocalCache<Enquiry[]>('omni_enquiries', INITIAL_ENQUIRIES).map((e) => normalizeEnquiry(e, activeWorkspaceId)));
      });
    }

    // Invites
    if (!refs.invites) {
      refs.invites = onSnapshot(collection(db, 'invites'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invite));
        setInvites(list);
        setLocalCache('omni_invites', list);
      }, (error) => {
        console.warn("Invites snapshot listener error (Quota/Offline):", error);
        setInvites(getLocalCache('omni_invites', []));
      });
    }

    // Salespersons
    if (!refs.salespersons) {
      refs.salespersons = onSnapshot(collection(db, 'salespersons'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Salesperson));
        setSalespersons(list);
        setLocalCache('omni_salespersons', list);
      }, (error) => {
        console.warn("Salespersons snapshot listener error (Quota/Offline):", error);
        setSalespersons(getLocalCache('omni_salespersons', INITIAL_SALESPERSONS));
      });
    }

    // Products
    if (!refs.products) {
      refs.products = onSnapshot(collection(db, 'products'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
        setProducts(list);
        setLocalCache('omni_products', list);
      }, (error) => {
        console.warn("Products snapshot listener error (Quota/Offline):", error);
        setProducts(getLocalCache('omni_products', []));
      });
    }

    // Enquiry Sources
    if (!refs.enquirySources) {
      refs.enquirySources = onSnapshot(collection(db, 'dropdown_enquiry_sources'), (snap) => {
        const list = snap.empty
          ? FALLBACK_SOURCES.map((s, i) => ({ id: 'src_' + i, name: s }))
          : snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color } as DropdownOption));
        setEnquirySources(list);
        setLocalCache('omni_sources', list);
      }, (error) => {
        console.warn("Enquiry sources listener error (Quota/Offline):", error);
        setEnquirySources(getLocalCache('omni_sources', FALLBACK_SOURCES.map((s, i) => ({ id: 'src_' + i, name: s }))));
      });
    }

    // Product Categories
    if (!refs.productCategories) {
      refs.productCategories = onSnapshot(collection(db, 'dropdown_product_categories'), (snap) => {
        const list = snap.empty
          ? FALLBACK_CATEGORIES.map((c, i) => ({ id: 'cat_' + i, name: c }))
          : snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color } as DropdownOption));
        setProductCategories(list);
        setLocalCache('omni_categories', list);
      }, (error) => {
        console.warn("Product categories listener error (Quota/Offline):", error);
        setProductCategories(getLocalCache('omni_categories', FALLBACK_CATEGORIES.map((c, i) => ({ id: 'cat_' + i, name: c }))));
      });
    }

    // Units
    if (!refs.units) {
      refs.units = onSnapshot(collection(db, 'dropdown_units'), (snap) => {
        const list = snap.empty
          ? FALLBACK_UNITS.map((u, i) => ({ id: 'u_' + i, name: u }))
          : snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color } as DropdownOption));
        setUnits(list);
        setLocalCache('omni_units', list);
      }, (error) => {
        console.warn("Units listener error (Quota/Offline):", error);
        setUnits(getLocalCache('omni_units', FALLBACK_UNITS.map((u, i) => ({ id: 'u_' + i, name: u }))));
      });
    }

    // Call Statuses
    if (!refs.callStatuses) {
      refs.callStatuses = onSnapshot(collection(db, 'dropdown_call_statuses'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color } as DropdownOption));
        const healed = healDropdownOptions(list, FALLBACK_CALL_STATUSES, 'cs');
        setCallStatuses(healed.mergedList);
        setLocalCache('omni_call_statuses', healed.mergedList);
      }, (error) => {
        console.warn("Call statuses listener error (Quota/Offline):", error);
        const cached = getLocalCache<DropdownOption[]>('omni_call_statuses', []);
        const healed = healDropdownOptions(cached, FALLBACK_CALL_STATUSES, 'cs');
        setCallStatuses(healed.mergedList);
      });
    }

    // Call Outcomes
    if (!refs.callOutcomes) {
      refs.callOutcomes = onSnapshot(collection(db, 'dropdown_call_outcomes'), (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color } as DropdownOption));
        const healed = healDropdownOptions(list, FALLBACK_CALL_OUTCOMES, 'co');
        setCallOutcomes(healed.mergedList);
        setLocalCache('omni_call_outcomes', healed.mergedList);
      }, (error) => {
        console.warn("Call outcomes listener error (Quota/Offline):", error);
        const cached = getLocalCache<DropdownOption[]>('omni_call_outcomes', []);
        const healed = healDropdownOptions(cached, FALLBACK_CALL_OUTCOMES, 'co');
        setCallOutcomes(healed.mergedList);
      });
    }

    return () => {
      // Normal React dependency change cleanup for collection listeners
      if (refs.workspaces) { refs.workspaces(); refs.workspaces = null; }
      if (refs.callLogs) { refs.callLogs(); refs.callLogs = null; }
      if (refs.companies) { refs.companies(); refs.companies = null; }
      if (refs.contacts) { refs.contacts(); refs.contacts = null; }
      if (refs.enquiries) { refs.enquiries(); refs.enquiries = null; }
      if (refs.invites) { refs.invites(); refs.invites = null; }
      if (refs.auditLogs) { refs.auditLogs(); refs.auditLogs = null; }
      if (refs.salespersons) { refs.salespersons(); refs.salespersons = null; }
      if (refs.products) { refs.products(); refs.products = null; }
      if (refs.enquirySources) { refs.enquirySources(); refs.enquirySources = null; }
      if (refs.productCategories) { refs.productCategories(); refs.productCategories = null; }
      if (refs.units) { refs.units(); refs.units = null; }
      if (refs.callStatuses) { refs.callStatuses(); refs.callStatuses = null; }
      if (refs.callOutcomes) { refs.callOutcomes(); refs.callOutcomes = null; }
    };
  }, [user, realtimeSyncEnabled]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
          Synchronizing {BRAND_CONFIG.shortName} Cloud Node...
        </span>
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={(profile) => setUser(profile)} />;
  }

  // Calculate next S/N for registration
  const nextSn = workspaceEnquiries.length > 0 ? Math.max(...workspaceEnquiries.map((e) => e.sn)) + 1 : 1001;

  const selectedEnquiry = enquiries.find((e) => e.id === selectedEnquiryId);

  // Individual deletion
  const handleDeleteEnquiry = async (id: string) => {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      console.warn('[handleDeleteEnquiry] Invalid or empty enquiry ID provided for deletion:', id);
      return;
    }
    const cleanId = id.trim();
    const enqToDelete = enquiries.find((e) => e.id === cleanId);
    console.log(`[handleDeleteEnquiry] Deleting enquiry ID ${cleanId} (#${enqToDelete?.sn || 'unknown'})`);

    try {
      // 1. Immediately update local state and local cache for instant UI feedback
      setEnquiries((prev) => {
        const next = prev.filter((e) => e.id !== cleanId);
        setLocalCache('omni_enquiries', next);
        return next;
      });

      if (selectedEnquiryId === cleanId) {
        setSelectedEnquiryId(null);
      }

      // 2. Perform Firestore document deletion
      const success = await safeDeleteDoc('enquiries', cleanId);
      if (!success) {
        console.warn(`[handleDeleteEnquiry] Firestore delete returned false for enquiry ${cleanId}. Local state already purged.`);
      }

      // 3. Record Audit Log
      if (user && enqToDelete) {
        try {
          await recordAuditLog({
            document_id: cleanId,
            entity_type: 'enquiry',
            entity_title: `Enquiry #${enqToDelete.sn}`,
            action: 'delete',
            user: user,
            before: enqToDelete,
            details: `Deleted Enquiry #${enqToDelete.sn} (${enqToDelete.quote_ref_no || 'No Ref'})`
          });
        } catch (auditErr) {
          console.warn('[handleDeleteEnquiry] Audit log error on deletion:', auditErr);
        }
      }

      // 4. Automatically re-sequence remaining quote S/N numbers sequentially
      const remainingEnquiries = enquiries.filter((e) => e.id !== cleanId);
      try {
        const resequenced = await syncSNNumbersInFirestore(remainingEnquiries);
        if (resequenced && resequenced.length > 0) {
          setEnquiries(resequenced);
          setLocalCache('omni_enquiries', resequenced);
        }
      } catch (snErr) {
        console.warn('[handleDeleteEnquiry] Error re-sequencing S/N numbers:', snErr);
      }

      setToast({ message: `Enquiry #${enqToDelete?.sn || ''} successfully deleted`, type: 'info' });
    } catch (error) {
      console.error('[handleDeleteEnquiry] Error during enquiry deletion:', error);
    }
  };

  // Bulk deletion
  const handleBulkDeleteEnquiries = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const validIds = ids.filter((i) => i && typeof i === 'string' && i.trim() !== '').map((i) => i.trim());
    if (validIds.length === 0) return;

    console.log(`[handleBulkDeleteEnquiries] Bulk deleting ${validIds.length} enquiries`);

    try {
      // 1. Immediately update local state & local cache
      setEnquiries((prev) => {
        const next = prev.filter((e) => e.id && !validIds.includes(e.id));
        setLocalCache('omni_enquiries', next);
        return next;
      });
      setSelectedEnquiryId(null);

      // 2. Perform Firestore deletes
      try {
        const batch = writeBatch(db);
        validIds.forEach((id) => {
          if (!id.startsWith('local_') && !id.startsWith('temp_')) {
            batch.delete(doc(db, 'enquiries', id));
          }
        });
        await batch.commit();
        console.log(`[handleBulkDeleteEnquiries] Successfully committed batch delete for ${validIds.length} enquiries`);
      } catch (batchErr) {
        console.warn('[handleBulkDeleteEnquiries] Batch delete failed, falling back to safeDeleteDoc loop:', batchErr);
        for (const id of validIds) {
          await safeDeleteDoc('enquiries', id);
        }
      }

      // 3. Automatically re-sequence remaining quote S/N numbers sequentially
      const remainingEnquiries = enquiries.filter((e) => e.id && !validIds.includes(e.id));
      try {
        const resequenced = await syncSNNumbersInFirestore(remainingEnquiries);
        if (resequenced && resequenced.length > 0) {
          setEnquiries(resequenced);
          setLocalCache('omni_enquiries', resequenced);
        }
      } catch (snErr) {
        console.warn('[handleBulkDeleteEnquiries] Error re-sequencing S/N numbers:', snErr);
      }

      setToast({ message: `Successfully deleted ${validIds.length} enquiries`, type: 'info' });
    } catch (error) {
      console.error('[handleBulkDeleteEnquiries] Error bulk deleting enquiries:', error);
    }
  };

  return (
    <div className="flex bg-slate-50 text-slate-900 h-screen overflow-hidden">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        user={user}
        workspaces={visibleWorkspaces}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspaceId}
        onOpenWorkspaceManager={() => setShowWorkspaceModal(true)}
        onOpenTrashBin={() => setShowTrashBinModal(true)}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* Main Panel Area */}
      <main className="flex-1 h-screen overflow-y-auto flex flex-col">
        {/* Top Header Bar with Cloud Sync Hub */}
        <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs shrink-0">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              title="Open Navigation Menu"
              aria-label="Open Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono flex items-center gap-1.5 flex-wrap">
              <span>Workspace</span>
              <span>/</span>
              {(() => {
                const style = getWorkspaceBadgeStyle(activeWorkspace?.id, activeWorkspace?.name);
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold font-sans tracking-normal shadow-2xs ${style.bg}`}
                    title={`Active Workspace: ${activeWorkspace?.name || 'Workspace'}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${style.dot} shrink-0`} />
                    <span className="truncate max-w-[180px] font-bold">{activeWorkspace?.name || 'Main Workspace'}</span>
                  </span>
                );
              })()}
              <span>/</span>
              <span className="text-slate-900 capitalize font-sans">{currentTab === 'salespersons' ? 'Team Roster' : currentTab === 'call_log' ? 'Call Center & Logs' : currentTab.replace('_', ' ')}</span>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                setActivityDrawerContext({});
                setIsActivityDrawerOpen(true);
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
              title="Log Quick Activity (Call, WhatsApp, Meeting, Site Visit)"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Log Activity</span>
            </button>

            <button
              onClick={() => setShowUserProfileModal(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
              title="Edit Profile & Initials"
            >
              <div className="w-5 h-5 rounded-lg bg-blue-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                {user?.initials || (user?.username || user?.full_name || user?.email || 'OU').substring(0, 2).toUpperCase()}
              </div>
              <span className="hidden sm:inline font-sans">{user?.full_name || user?.username || user?.email || 'User'}</span>
            </button>

            <CloudSyncHub
              companies={companies}
              contacts={contacts}
              enquiries={enquiries}
              callLogs={callLogs}
              products={products}
              salespersons={salespersons}
              enquirySources={enquirySources}
              productCategories={productCategories}
              units={units}
              user={user}
              activeWorkspace={activeWorkspace}
              setCompanies={setCompanies}
              setContacts={setContacts}
              setEnquiries={setEnquiries}
              setCallLogs={setCallLogs}
              setProducts={setProducts}
              setSalespersons={setSalespersons}
              setEnquirySources={setEnquirySources}
              setProductCategories={setProductCategories}
              setUnits={setUnits}
              realtimeSyncEnabled={realtimeSyncEnabled}
              setRealtimeSyncEnabled={setRealtimeSyncEnabled}
              showToast={triggerToast}
            />
          </div>
        </header>

        <div className="flex-1">
          {currentTab === 'call_log' && (
            <CallLogManager
              activeWorkspace={activeWorkspace}
              callLogs={visibleCallLogs}
              companies={workspaceCompanies}
              contacts={workspaceContacts}
              enquiries={visibleEnquiries}
              salespersons={workspaceSalespersons}
              user={user}
              triggerToast={triggerToast}
              initialSubTab="queue"
              setCallLogs={setCallLogs}
              setCompanies={setCompanies}
              setContacts={setContacts}
              callStatuses={callStatuses}
              callOutcomes={callOutcomes}
              setCallStatuses={setCallStatuses}
              setCallOutcomes={setCallOutcomes}
              setEnquiries={setEnquiries}
              companyRelationships={companyRelationships}
              companyTemperatures={companyTemperatures}
              onEditCompany={handleEditCompanyFrom360}
              onOpenActivityDrawer={(ctx) => {
                setActivityDrawerContext(ctx || {});
                setIsActivityDrawerOpen(true);
              }}
              onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
            />
          )}

          {currentTab === 'dashboard' && (
          <Dashboard
            enquiries={visibleEnquiries}
            companies={workspaceCompanies}
            salespersons={workspaceSalespersons}
            onSelectEnquiry={setSelectedEnquiryId}
            user={user}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        )}

        {currentTab === 'enquiries' && (
          <EnquiryList
            enquiries={visibleEnquiries}
            companies={workspaceCompanies}
            salespersons={workspaceSalespersons}
            onSelectEnquiry={setSelectedEnquiryId}
            onAddEnquiry={() => {
              setEnquiryToEdit(null);
              setShowEnquiryForm(true);
            }}
            onEditEnquiry={(enq) => {
              setEnquiryToEdit(enq);
              setShowEnquiryForm(true);
            }}
            onDeleteEnquiry={handleDeleteEnquiry}
            onBulkDeleteEnquiries={handleBulkDeleteEnquiries}
            user={user}
            onOpenActivityDrawer={(context) => {
              setActivityDrawerContext(context);
              setIsActivityDrawerOpen(true);
            }}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        )}

        {currentTab === 'companies' && (
          <CompanyModal
            companies={workspaceCompanies}
            contacts={workspaceContacts}
            enquiries={visibleEnquiries}
            callLogs={workspaceCallLogs}
            salespersons={workspaceSalespersons}
            onSelectEnquiry={setSelectedEnquiryId}
            user={user}
            setCompanies={setCompanies}
            setContacts={setContacts}
            setEnquiries={setEnquiries}
            setSalespersons={setSalespersons}
            setCallLogs={setCallLogs}
            activeWorkspace={activeWorkspace}
            companyRelationships={companyRelationships}
            companyTemperatures={companyTemperatures}
            onOpenCompany360={(companyId) => setSelected360CompanyId(companyId)}
            initialSelectedCompanyId={companyEditContext?.id}
            initialOpenEdit={companyEditContext?.openEdit}
            companyEditTrigger={companyEditContext?.timestamp}
            onOpenActivityDrawer={(context) => {
              setActivityDrawerContext(context);
              setIsActivityDrawerOpen(true);
            }}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        )}

        {currentTab === 'salespersons' && (
          <SalespersonProfiles
            salespersons={workspaceSalespersons}
            enquiries={visibleEnquiries}
            companies={workspaceCompanies}
            onSelectEnquiry={setSelectedEnquiryId}
            setSalespersons={setSalespersons}
            setEnquiries={setEnquiries}
            callLogs={workspaceCallLogs}
            setCallLogs={setCallLogs}
            activeWorkspace={activeWorkspace}
            currentUser={user}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        )}

        {currentTab === 'products' && (
          <ProductManager 
            products={workspaceProducts} 
            productCategories={productCategories.map(c => c.name)}
            units={units.map(u => u.name)}
            user={user} 
            setProducts={setProducts}
            activeWorkspace={activeWorkspace}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        )}

        {(currentTab === 'settings' || currentTab === 'invites' || currentTab === 'docs-hub') && (
          <SettingsHub
            user={user}
            activeWorkspace={activeWorkspace}
            enquirySources={enquirySources}
            productCategories={productCategories}
            units={units}
            callStatuses={callStatuses}
            callOutcomes={callOutcomes}
            companyRelationships={companyRelationships}
            companyTemperatures={companyTemperatures}
            enquiries={workspaceEnquiries}
            products={workspaceProducts}
            companies={workspaceCompanies}
            contacts={workspaceContacts}
            salespersons={workspaceSalespersons}
            invites={invites}
            callLogs={callLogs}
            auditLogs={auditLogs}
            setEnquirySources={setEnquirySources}
            setProductCategories={setProductCategories}
            setUnits={setUnits}
            setCallStatuses={setCallStatuses}
            setCallOutcomes={setCallOutcomes}
            setCompanyRelationships={setCompanyRelationships}
            setCompanyTemperatures={setCompanyTemperatures}
            setEnquiries={setEnquiries}
            setProducts={setProducts}
            setCompanies={setCompanies}
            setContacts={setContacts}
            setSalespersons={setSalespersons}
            setInvites={setInvites}
            setCallLogs={setCallLogs}
            setAuditLogs={setAuditLogs}
            realtimeSyncEnabled={realtimeSyncEnabled}
            setRealtimeSyncEnabled={setRealtimeSyncEnabled}
            dataVisibilityScope={dataVisibilityScope}
            setDataVisibilityScope={setDataVisibilityScope}
            allowUserSalespersonSelection={allowUserSalespersonSelection}
            setAllowUserSalespersonSelection={setAllowUserSalespersonSelection}
            triggerToast={triggerToast}
            workspaces={visibleWorkspaces}
            onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          />
        )}
        </div>
      </main>

      {/* Slide-over Enquiry Details Inspection */}
      {selectedEnquiry && (
        <EnquiryDetail
          enquiry={selectedEnquiry}
          activeWorkspace={activeWorkspace}
          activeWorkspaceId={activeWorkspace?.id}
          companies={workspaceCompanies}
          contacts={workspaceContacts}
          salespersons={workspaceSalespersons}
          auditLogs={auditLogs}
          user={user}
          enquiries={visibleEnquiries} // Pass enquiries list to EnquiryDetail so it can show linked revisions!
          onClose={() => setSelectedEnquiryId(null)}
          onDeleteEnquiry={handleDeleteEnquiry}
          onEditEnquiry={(enq) => {
            setEnquiryToEdit(enq);
            setShowEnquiryForm(true);
          }}
          onOpenActivityDrawer={(context) => {
            setActivityDrawerContext(context);
            setIsActivityDrawerOpen(true);
          }}
        />
      )}

      {/* 360° Company View Modal */}
      {selected360CompanyId && (
        <Company360Modal
          companyId={selected360CompanyId}
          companies={workspaceCompanies}
          contacts={workspaceContacts}
          enquiries={workspaceEnquiries}
          callLogs={workspaceCallLogs}
          user={user}
          activeWorkspace={activeWorkspace}
          onClose={() => setSelected360CompanyId(null)}
          onOpenActivityDrawer={(context) => {
            setActivityDrawerContext(context);
            setIsActivityDrawerOpen(true);
          }}
          onOpenEnquiry={(enquiryId) => setSelectedEnquiryId(enquiryId)}
          onEditCompany={handleEditCompanyFrom360}
        />
      )}

      {/* Full form entry for Add/Edit Enquiry */}
      {showEnquiryForm && (
        <EnquiryForm
          companies={workspaceCompanies}
          contacts={workspaceContacts}
          salespersons={workspaceSalespersons}
          products={workspaceProducts}
          enquirySources={enquirySources.map(s => s.name)}
          productCategories={productCategories.map(c => c.name)}
          units={units.map(u => u.name)}
          enquiryToEdit={enquiryToEdit}
          onClose={() => setShowEnquiryForm(false)}
          user={user}
          nextSn={nextSn}
          triggerToast={triggerToast}
          setEnquiries={setEnquiries}
          setCompanies={setCompanies}
          setContacts={setContacts}
          setAuditLogs={setAuditLogs}
          setProductCategories={setProductCategories}
          setSalespersons={setSalespersons}
          activeWorkspace={activeWorkspace}
          allowUserSalespersonSelection={allowUserSalespersonSelection}
        />
      )}

      {/* Workspace Manager Modal */}
      <WorkspaceManagerModal
        isOpen={showWorkspaceModal}
        onClose={() => setShowWorkspaceModal(false)}
        workspaces={visibleWorkspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={(id) => {
          setActiveWorkspaceId(id);
          setShowWorkspaceModal(false);
        }}
        onWorkspacesChange={setWorkspaces}
        currentUser={user}
        onProfileUpdated={(updated) => setUser(updated)}
        triggerToast={triggerToast}
      />

      {/* Toast Notification Container */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed bottom-6 right-6 z-50 flex items-center p-4 rounded-xl shadow-lg border bg-white border-slate-100 max-w-sm w-full font-sans"
          >
            <div className="flex items-start space-x-3 w-full">
              {toast.type === 'success' && (
                <div className="flex-shrink-0 p-1 bg-emerald-50 text-emerald-600 rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              )}
              {toast.type === 'error' && (
                <div className="flex-shrink-0 p-1 bg-red-50 text-red-600 rounded-lg">
                  <AlertCircle className="w-5 h-5" />
                </div>
              )}
              {toast.type === 'info' && (
                <div className="flex-shrink-0 p-1 bg-blue-50 text-blue-600 rounded-lg">
                  <Info className="w-5 h-5" />
                </div>
              )}
              
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-semibold text-slate-800">
                  {toast.type === 'success' ? 'Success' : toast.type === 'error' ? 'Error' : 'Notice'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">
                  {toast.message}
                </p>
              </div>

              <button
                onClick={() => setToast(null)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Profile & Onboarding Modal */}
      {user && (
        <UserProfileModal
          isOpen={showUserProfileModal || (!user.profileCompleted && !user.full_name)}
          onClose={() => setShowUserProfileModal(false)}
          currentUser={user}
          onProfileUpdated={(updated) => {
            setUser(updated);
            setLocalCache(`omni_user_${updated.uid}`, updated);
            localStorage.setItem('omni_local_user', JSON.stringify(updated));
          }}
          isMandatoryOnboarding={!user.profileCompleted && !user.full_name}
          salespersons={salespersons}
          setSalespersons={setSalespersons}
          activeWorkspaceId={activeWorkspace.id}
        />
      )}

      {/* Recycle Bin & Data Recovery Modal */}
      <TrashBinModal
        isOpen={showTrashBinModal}
        onClose={() => setShowTrashBinModal(false)}
        currentUser={user}
        enquiries={enquiries}
        companies={companies}
        contacts={contacts}
        products={products}
        callLogs={callLogs}
        onRefreshData={async () => {
          // Re-sync local cache repositories
          try {
            const [localEnqs, localComps, localCts, localProds, localLogs] = await Promise.all([
              EnquiryRepository.getAllLocal(),
              CompanyRepository.getCompaniesLocal(),
              CompanyRepository.getContactsLocal(),
              MetadataRepository.fetchProductsOnce(),
              CallLogRepository.getAllLocal()
            ]);
            setEnquiries(localEnqs);
            setCompanies(localComps);
            setContacts(localCts);
            setProducts(localProds);
            setCallLogs(localLogs);
          } catch (e) {
            console.warn('Refresh data failed:', e);
          }
        }}
      />

      {/* Quick Activity Drawer */}
      <QuickActivityDrawer
        isOpen={isActivityDrawerOpen}
        onClose={() => setIsActivityDrawerOpen(false)}
        existingLog={activityDrawerContext.existingLog}
        logToEdit={activityDrawerContext.logToEdit}
        companyId={activityDrawerContext.companyId}
        companyName={activityDrawerContext.companyName}
        contactId={activityDrawerContext.contactId}
        contactName={activityDrawerContext.contactName}
        contactPhone={activityDrawerContext.contactPhone}
        enquiryId={activityDrawerContext.enquiryId}
        initialChannel={activityDrawerContext.channel}
        initialStatus={activityDrawerContext.initialStatus}
        activeWorkspaceId={activeWorkspace.id}
        currentSalespersonId={currentSalespersonId}
        currentUserInitials={currentUserInitials}
        user={user}
        currentUserUid={user?.uid}
        currentUserName={user?.full_name || user?.username || user?.email}
        companies={visibleCompanies}
        contacts={contacts}
        enquiries={visibleEnquiries}
        setCompanies={setCompanies}
        setContacts={setContacts}
        setCallLogs={setCallLogs}
        onOpen360={(companyId) => setSelected360CompanyId(companyId)}
        onInspectCompany={(companyId) => setSelected360CompanyId(companyId)}
        onSaveSuccess={() => {
          setIsActivityDrawerOpen(false);
          triggerToast('Activity logged successfully!', 'success');
        }}
      />

      {/* Fresh Account Onboarding Wizard */}
      {user && (
        <FreshAccountOnboardingModal
          isOpen={userWorkspaces.length === 0}
          currentUser={user}
          onWorkspaceCreated={(newWs) => {
            setWorkspaces((prev) => [newWs, ...prev.filter((w) => w.id !== newWs.id)]);
            setActiveWorkspaceId(newWs.id);

            // Update local user state with the newly provisioned workspace
            const updatedUser: UserProfile = {
              ...user,
              workspaceIds: Array.from(new Set([...(user.workspaceIds || []), newWs.id])),
              defaultWorkspaceId: newWs.id,
              workspace_roles: {
                ...(user.workspace_roles || {}),
                [newWs.id]: 'Admin'
              }
            };
            setUser(updatedUser);
            setLocalCache(`omni_user_${user.uid}`, updatedUser);
            localStorage.setItem('omni_local_user', JSON.stringify(updatedUser));
          }}
          triggerToast={triggerToast}
        />
      )}

      {/* Super Admin God Mode Database Studio Console */}
      <SuperAdminConsoleModal
        isOpen={isSuperAdminConsoleOpen}
        onClose={() => setIsSuperAdminConsoleOpen(false)}
        workspaces={workspaces}
      />
    </div>
  );
}

async function syncSNNumbersInFirestore(enquiriesList: Enquiry[]) {
  if (enquiriesList.length === 0) return enquiriesList;
  const sorted = [...enquiriesList].sort((a, b) => {
    const dateA = a.createdAt || a.enquiry_date || '';
    const dateB = b.createdAt || b.enquiry_date || '';
    const dateComp = dateA.localeCompare(dateB);
    if (dateComp !== 0) return dateComp;
    return (a.sn || 0) - (b.sn || 0);
  });

  const baseSn = sorted[0]?.sn ? Math.min(sorted[0].sn, 1001) : 1001;
  const batch = writeBatch(db);
  let changed = false;

  const resequenced = sorted.map((item, index) => {
    const expectedSn = baseSn + index;
    if (item.sn !== expectedSn) {
      if (item.id && !item.id.startsWith('local_') && !item.id.startsWith('temp_')) {
        const ref = doc(db, 'enquiries', item.id);
        batch.update(ref, { sn: expectedSn, updatedAt: new Date().toISOString() });
        changed = true;
      }
      return { ...item, sn: expectedSn };
    }
    return item;
  });

  if (changed) {
    try {
      await batch.commit();
    } catch (e) {
      console.error("Error auto-syncing S/N numbers:", e);
    }
  }

  return resequenced;
}

