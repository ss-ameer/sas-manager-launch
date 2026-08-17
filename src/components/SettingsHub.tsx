import React, { useState } from 'react';
import {
  Settings,
  Sliders,
  TicketPlus,
  BookOpen,
  Cloud,
  Layers,
  Shield,
  Activity,
  HardDrive,
  User,
  Users,
  Trash2,
  AlertTriangle,
  LogOut,
  RefreshCw,
  KeyRound,
  Database,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Lock,
  Eye,
  Cpu,
  FileText,
  Download,
  Printer,
  Search,
  Filter
} from 'lucide-react';
import UserManagementHub from './UserManagementHub';
import GeminiKeyModal from './GeminiKeyModal';
import { signOut, deleteUser } from 'firebase/auth';
import { writeBatch, collection, query, where, getDocs, doc, arrayRemove } from 'firebase/firestore';
import { auth, db, safeDeleteDoc, safeGetDocs, safeUpdateDoc } from '../firebase';
import { isWorkspaceAdmin, getUserRoleInWorkspace } from '../utils/permissions';
import { clearAllLocalStores } from '../services/db';
import {
  UserProfile,
  Company,
  Contact,
  Enquiry,
  Product,
  Salesperson,
  DropdownOption,
  Invite,
  CallLogEntry,
  Workspace,
  AuditLog
} from '../types';
import DropdownSettingsManager from './DropdownSettingsManager';
import InviteManager from './InviteManager';
import SystemSimulator from './SystemSimulator';
import CloudSyncHub from './CloudSyncHub';
import DocsSystemHub from './DocsSystemHub';
import WorkspaceHandoverWizardModal, {
  Category2WorkspaceInfo,
  HandoverResolution
} from './WorkspaceHandoverWizardModal';
import {
  categorizeUserWorkspacesForDeletion,
  executeFinalCascadeDeleteAndScrub
} from '../services/AccountDeletionService';
import { PageHeader, PageBody, CardPanel } from './layout/UiContainer';
import { EnquiryRepository } from '../services/repositories/EnquiryRepository';

interface SettingsHubProps {
  user: UserProfile;
  activeWorkspace?: Workspace;
  enquirySources: DropdownOption[];
  productCategories: DropdownOption[];
  units: DropdownOption[];
  callStatuses?: DropdownOption[];
  callOutcomes?: DropdownOption[];
  companyRelationships?: DropdownOption[];
  companyTemperatures?: DropdownOption[];
  enquiries: Enquiry[];
  products: Product[];
  companies: Company[];
  contacts: Contact[];
  salespersons: Salesperson[];
  invites: Invite[];
  callLogs?: CallLogEntry[];
  auditLogs?: AuditLog[];
  setEnquirySources?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setUnits?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCallStatuses?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCallOutcomes?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCompanyRelationships?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setCompanyTemperatures?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  setInvites?: React.Dispatch<React.SetStateAction<Invite[]>>;
  setCallLogs?: React.Dispatch<React.SetStateAction<CallLogEntry[]>>;
  setAuditLogs?: React.Dispatch<React.SetStateAction<AuditLog[]>>;
  realtimeSyncEnabled: boolean;
  setRealtimeSyncEnabled: (enabled: boolean) => void;
  dataVisibilityScope?: 'ALL_DATA' | 'OWN_DATA_ONLY';
  setDataVisibilityScope?: (scope: 'ALL_DATA' | 'OWN_DATA_ONLY') => void;
  allowUserSalespersonSelection?: boolean;
  setAllowUserSalespersonSelection?: (allow: boolean) => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  workspaces?: Workspace[];
  onOpenMobileMenu?: () => void;
}

export default function SettingsHub({
  user,
  activeWorkspace,
  enquirySources,
  productCategories,
  units,
  callStatuses = [],
  callOutcomes = [],
  companyRelationships = [],
  companyTemperatures = [],
  enquiries,
  products,
  companies,
  contacts,
  salespersons,
  invites,
  callLogs = [],
  auditLogs = [],
  setEnquirySources,
  setProductCategories,
  setUnits,
  setCallStatuses,
  setCallOutcomes,
  setCompanyRelationships,
  setCompanyTemperatures,
  setEnquiries,
  setProducts,
  setCompanies,
  setContacts,
  setSalespersons,
  setInvites,
  setCallLogs,
  setAuditLogs,
  realtimeSyncEnabled,
  setRealtimeSyncEnabled,
  dataVisibilityScope = 'ALL_DATA',
  setDataVisibilityScope,
  allowUserSalespersonSelection = false,
  setAllowUserSalespersonSelection,
  triggerToast,
  workspaces = [],
  onOpenMobileMenu
}: SettingsHubProps) {
  const [activeSubTab, setActiveSubTab] = useState<'dropdowns' | 'users' | 'api_db' | 'simulator' | 'invites' | 'cloud' | 'account' | 'docs'>('dropdowns');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Handover Wizard States
  const [isHandoverWizardOpen, setIsHandoverWizardOpen] = useState(false);
  const [category1WsIds, setCategory1WsIds] = useState<string[]>([]);
  const [category2WsList, setCategory2WsList] = useState<Category2WorkspaceInfo[]>([]);
  const [nonAdminExitWsList, setNonAdminExitWsList] = useState<Workspace[]>([]);

  // API Key Ping Test state
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [apiKeyTestResult, setApiKeyTestResult] = useState<{
    status: 'active' | 'error';
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Audit Trail State & Export Handlers
  const [auditSearchQuery, setAuditSearchQuery] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState<'all' | 'create' | 'update' | 'delete'>('all');

  const filteredAuditLogs = (auditLogs || []).filter((log) => {
    const matchesAction = auditActionFilter === 'all' || log.action === auditActionFilter;
    const q = auditSearchQuery.trim().toLowerCase();
    const matchesQuery =
      !q ||
      (log.entity_title || '').toLowerCase().includes(q) ||
      (log.entity_type || '').toLowerCase().includes(q) ||
      (log.changed_by_name || '').toLowerCase().includes(q) ||
      (log.changed_by_email || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q) ||
      (log.document_id || '').toLowerCase().includes(q);
    return matchesAction && matchesQuery;
  });

  const handleExportAuditCsv = () => {
    const headers = ['Timestamp', 'User Name', 'User Email', 'Action', 'Entity Type', 'Entity Title / Doc ID', 'Details'];
    const rows = filteredAuditLogs.map((log) => [
      `"${log.timestamp ? new Date(log.timestamp).toLocaleString().replace(/"/g, '""') : ''}"`,
      `"${(log.changed_by_name || '').replace(/"/g, '""')}"`,
      `"${(log.changed_by_email || '').replace(/"/g, '""')}"`,
      `"${(log.action || '').toUpperCase()}"`,
      `"${(log.entity_type || '').toUpperCase()}"`,
      `"${(log.entity_title || log.document_id || '').replace(/"/g, '""')}"`,
      `"${(log.details || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `System_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (triggerToast) triggerToast('Audit trail CSV exported successfully', 'success');
  };

  const handleExportAuditPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to generate the printable PDF report.');
      return;
    }

    const rowsHtml = filteredAuditLogs
      .slice(0, 500)
      .map(
        (log) => `
      <tr>
        <td style="font-family: monospace; font-size: 10px; white-space: nowrap;">${log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}</td>
        <td><strong>${log.changed_by_name || 'System'}</strong><br/><span style="color: #64748b; font-size: 10px;">${log.changed_by_email || ''}</span></td>
        <td>
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 800; text-transform: uppercase; background: ${
            log.action === 'create' ? '#dcfce7; color: #15803d;' : log.action === 'delete' ? '#ffe4e6; color: #be123c;' : '#e0f2fe; color: #0369a1;'
          }">
            ${log.action}
          </span>
        </td>
        <td style="font-family: monospace; font-size: 10px;">${(log.entity_type || '').toUpperCase()}</td>
        <td><strong>${log.entity_title || log.document_id || ''}</strong></td>
        <td style="color: #475569; font-size: 11px;">${log.details || ''}</td>
      </tr>
    `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>System Audit Log Report - ${activeWorkspace?.name || 'OmniSuite'}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 24px; margin: 0; }
            .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
            .title { font-size: 20px; font-weight: 800; color: #0f172a; margin: 0; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 11px; }
            th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-weight: 700; font-size: 11px; }
            td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; color: #1e293b; vertical-align: top; }
            tr:nth-child(even) { background: #f8fafc; }
            .footer { margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">System Audit Log & Activity Trail</h1>
              <div class="subtitle">
                Workspace: <strong>${activeWorkspace?.name || 'Default Workspace'}</strong> | Generated on ${new Date().toLocaleString()}
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 11px; color: #475569; font-weight: 700;">Total Records: ${filteredAuditLogs.length}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Document / Title</th>
                <th>Details & Description</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #94a3b8;">No audit logs captured.</td></tr>'}
            </tbody>
          </table>

          <div class="footer">
            OmniSuite Security & Audit Log System Report • Confidential
          </div>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    if (triggerToast) triggerToast('Audit log PDF printable report opened', 'info');
  };

  const isAdmin = isWorkspaceAdmin(user, activeWorkspace?.id);
  const effectiveRole = getUserRoleInWorkspace(user, activeWorkspace?.id);

  const handleTestApiKey = async () => {
    setTestingApiKey(true);
    setApiKeyTestResult(null);
    const startTime = Date.now();
    try {
      const userApiKey = localStorage.getItem('omni_user_gemini_api_key') || '';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (userApiKey) {
        headers['x-user-gemini-api-key'] = userApiKey;
      }
      const response = await fetch('/api/gemini/extract-enquiry', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          text: 'PING_API_KEY_HEALTH_TEST',
          mimeType: 'text/plain'
        })
      });
      const latencyMs = Date.now() - startTime;
      const data = await response.json().catch(() => ({}));

      if (response.ok && (data?.extractedData || data?.notice)) {
        setApiKeyTestResult({
          status: 'active',
          message: `Gemini API key is valid and connected! Response time: ${latencyMs}ms.`,
          latencyMs
        });
        if (triggerToast) triggerToast(`API Key active (${latencyMs}ms)`, 'success');
      } else {
        const errText = data?.error || response.statusText || 'Response returned quota error or failed header check.';
        setApiKeyTestResult({
          status: 'error',
          message: errText,
          latencyMs
        });
        if (triggerToast) triggerToast(`API Key Ping: ${errText}`, 'error');
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      setApiKeyTestResult({
        status: 'error',
        message: err.message || 'Connection error while communicating with API endpoint.',
        latencyMs
      });
      if (triggerToast) triggerToast('API Key ping failed: ' + err.message, 'error');
    } finally {
      setTestingApiKey(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      if (!user) return;
      const { soleAdminNukeIds, adminMultiMemberList, nonAdminExits } =
        await categorizeUserWorkspacesForDeletion(user);

      setNonAdminExitWsList(nonAdminExits);
      setCategory1WsIds(soleAdminNukeIds);
      setCategory2WsList(adminMultiMemberList);

      if (adminMultiMemberList.length > 0) {
        setIsHandoverWizardOpen(true);
        setShowDeleteModal(false);
        setDeleting(false);
      } else {
        await executeFinalCascadeDeleteAndScrub(
          user,
          soleAdminNukeIds,
          {},
          adminMultiMemberList,
          nonAdminExits
        );
      }
    } catch (err: any) {
      console.error('Failed to process account deletion:', err);
      if (err.code === 'auth/requires-recent-login') {
        if (triggerToast) triggerToast('Security Lock: Fresh login required to delete account.', 'error');
        alert("Security Lock: Firebase requires a fresh login to delete an account. Please sign out, sign back in, and click delete again.");
      } else {
        if (triggerToast) triggerToast('Failed to delete account profile: ' + err.message, 'error');
      }
      setDeleting(false);
    }
  };

  const subTabs = [
    {
      id: 'dropdowns' as const,
      label: 'Dropdown Settings',
      icon: Layers,
      description: 'Manage sources, categories, and units',
      adminOnly: false
    },
    {
      id: 'users' as const,
      label: 'User Roster & Access Control',
      icon: Users,
      description: 'Manage platform users, roles, statuses and workspace permissions',
      adminOnly: true
    },
    {
      id: 'api_db' as const,
      label: 'API & Database Health',
      icon: Cpu,
      description: 'Check Gemini API Key status and database usage/limits',
      adminOnly: false
    },
    {
      id: 'simulator' as const,
      label: 'Diagnostic Mode & Outage Simulator',
      icon: Activity,
      description: 'Admin diagnostic mode: simulate API rate limits, Firestore outages, forced offline & latency',
      adminOnly: true
    },
    {
      id: 'invites' as const,
      label: 'Invite Codes',
      icon: TicketPlus,
      description: 'Generate & revoke user invitation codes',
      adminOnly: true
    },
    {
      id: 'cloud' as const,
      label: 'Cloud Sync & Repository',
      icon: HardDrive,
      description: 'Push, pull & export local workspace data',
      adminOnly: false
    },
    {
      id: 'account' as const,
      label: 'User Account & Reset',
      icon: User,
      description: 'Profile options, session reset and account deletion',
      adminOnly: false
    },
    {
      id: 'docs' as const,
      label: 'Docs & System Hub',
      icon: BookOpen,
      description: 'Architecture specs, ledger & release history',
      adminOnly: false
    }
  ];

  return (
    <>
      <PageHeader
        title="System Settings & Administration"
        subtitle="Centralized hub for dropdown option registries, user invite access control, environment fault simulation, and database persistence."
        icon={Settings}
        badge={{ text: `Role: ${effectiveRole}`, variant: isAdmin ? 'blue' : 'amber' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
      />

      <PageBody maxWidth="max-w-7xl">

      {/* Navigation Sub-Tab Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 border-b border-slate-200/80">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isDisabled = tab.adminOnly && !isAdmin;

          if (isDisabled) return null; // Hide admin tabs for non-admins

          const isActive = activeSubTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-semibold font-sans transition shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-slate-200/80'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.adminOnly && (
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  isActive ? 'bg-blue-500/30 text-blue-200' : 'bg-slate-100 text-slate-500 border border-slate-200'
                }`}>
                  ADMIN
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Tab View Rendering */}
      <div className="mt-4">
        {activeSubTab === 'dropdowns' && (
          <DropdownSettingsManager
            enquirySources={enquirySources}
            productCategories={productCategories}
            units={units}
            callStatuses={callStatuses}
            callOutcomes={callOutcomes}
            companyRelationships={companyRelationships}
            companyTemperatures={companyTemperatures}
            enquiries={enquiries}
            products={products}
            companies={companies}
            callLogs={callLogs}
            user={user}
            activeWorkspaceId={activeWorkspace?.id}
            activeWorkspace={activeWorkspace}
            setEnquirySources={setEnquirySources}
            setProductCategories={setProductCategories}
            setUnits={setUnits}
            setCallStatuses={setCallStatuses}
            setCallOutcomes={setCallOutcomes}
            setCompanyRelationships={setCompanyRelationships}
            setCompanyTemperatures={setCompanyTemperatures}
            setEnquiries={setEnquiries}
            setProducts={setProducts}
            setCallLogs={setCallLogs}
          />
        )}

        {activeSubTab === 'users' && (
          <div className="space-y-6">
            <UserManagementHub
              currentUser={user}
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              enquiries={enquiries}
              salespersons={salespersons}
              callLogs={callLogs}
              setEnquiries={setEnquiries}
              setCallLogs={setCallLogs}
              triggerToast={triggerToast}
            />

            {/* Admin Data Visibility Scope & Salesperson Assignment Permissions Panel */}
            {isAdmin && (
              <CardPanel padding="spacious" className="space-y-5">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-600" />
                      Team Data Access & Reassignment Governance
                    </h3>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">
                      Configure what non-admin team members can view across inquiries, logs, and stats, and whether they can assign entries to other salespersons.
                    </p>
                  </div>
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-mono font-bold text-[10px] rounded-lg border border-blue-200">
                    ADMIN OVERRIDE
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Option 1: Data Visibility Scope */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2 text-slate-800 dark:text-slate-200 font-bold text-xs">
                      <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span>Data Visibility Scope for Non-Admins</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-sans leading-relaxed">
                      Control whether regular team members see all workspace data or strictly entries created by or attributed to them.
                    </p>

                    <div className="space-y-2 pt-1">
                      <label className={`flex items-start space-x-3 p-2.5 rounded-lg border transition cursor-pointer ${
                        dataVisibilityScope === 'ALL_DATA'
                          ? 'bg-blue-50/80 dark:bg-blue-950/80 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}>
                        <input
                          type="radio"
                          name="dataVisibilityScope"
                          value="ALL_DATA"
                          checked={dataVisibilityScope === 'ALL_DATA'}
                          onChange={() => {
                            if (setDataVisibilityScope) setDataVisibilityScope('ALL_DATA');
                            if (triggerToast) triggerToast('Updated: Non-admins can view all workspace data', 'info');
                          }}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-xs font-bold block">All Workspace Data</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Members can view all inquiries, call logs, and customer profiles in active workspace.</span>
                        </div>
                      </label>

                      <label className={`flex items-start space-x-3 p-2.5 rounded-lg border transition cursor-pointer ${
                        dataVisibilityScope === 'OWN_DATA_ONLY'
                          ? 'bg-blue-50/80 dark:bg-blue-950/80 border-blue-300 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}>
                        <input
                          type="radio"
                          name="dataVisibilityScope"
                          value="OWN_DATA_ONLY"
                          checked={dataVisibilityScope === 'OWN_DATA_ONLY'}
                          onChange={() => {
                            if (setDataVisibilityScope) setDataVisibilityScope('OWN_DATA_ONLY');
                            if (triggerToast) triggerToast('Updated: Non-admins restricted to their own entries', 'info');
                          }}
                          className="mt-0.5 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <span className="text-xs font-bold block">Attributed Entries Only</span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Members see only inquiries & call logs assigned to or created by their user account.</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Option 2: Salesperson Choice Permission */}
                  <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/60 rounded-xl space-y-3">
                    <div className="flex items-center space-x-2 text-slate-800 font-bold text-xs">
                      <Lock className="w-4 h-4 text-amber-600" />
                      <span>Salesperson Assignment Rights</span>
                    </div>
                    <p className="text-xs text-slate-600 font-sans leading-relaxed">
                      Control whether non-admin operators can manually select which salesperson to register an inquiry or call log under.
                    </p>

                    <div className="space-y-2 pt-1">
                      <label className={`flex items-start space-x-3 p-2.5 rounded-lg border transition cursor-pointer ${
                        !allowUserSalespersonSelection
                          ? 'bg-amber-50/80 border-amber-300 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}>
                        <input
                          type="radio"
                          name="allowUserSalespersonSelection"
                          value="false"
                          checked={!allowUserSalespersonSelection}
                          onChange={() => {
                            if (setAllowUserSalespersonSelection) setAllowUserSalespersonSelection(false);
                            if (triggerToast) triggerToast('Updated: Non-admins automatically locked to their own name', 'info');
                          }}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500"
                        />
                        <div>
                          <span className="text-xs font-bold block">Locked (Auto-Register Under Logged-In Account)</span>
                          <span className="text-[11px] text-slate-500 block">Non-admins can only log entries under their own name. Admin holds sole right to choose team member.</span>
                        </div>
                      </label>

                      <label className={`flex items-start space-x-3 p-2.5 rounded-lg border transition cursor-pointer ${
                        allowUserSalespersonSelection
                          ? 'bg-amber-50/80 border-amber-300 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}>
                        <input
                          type="radio"
                          name="allowUserSalespersonSelection"
                          value="true"
                          checked={allowUserSalespersonSelection}
                          onChange={() => {
                            if (setAllowUserSalespersonSelection) setAllowUserSalespersonSelection(true);
                            if (triggerToast) triggerToast('Updated: Non-admins granted rights to select salesperson', 'info');
                          }}
                          className="mt-0.5 text-amber-600 focus:ring-amber-500"
                        />
                        <div>
                          <span className="text-xs font-bold block">Open Selection (Allow Team Member Choice)</span>
                          <span className="text-[11px] text-slate-500 block">Non-admins can select any active salesperson from the roster when registering new inquiries or call logs.</span>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </CardPanel>
            )}
          </div>
        )}

        {activeSubTab === 'api_db' && (
          <div className="space-y-6">
            {/* Live API Key Verification Card */}
            <CardPanel padding="spacious" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                    <Cpu className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans">Gemini API Key Status & Health Diagnostics</h3>
                    <p className="text-xs text-slate-500 font-sans">Verify personal or proxy API key connection, endpoint status, and live response latency.</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => setShowGeminiKeyModal(true)}
                    className="px-3.5 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 font-semibold text-xs rounded-xl transition flex items-center space-x-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                    <span>Manage Personal Key</span>
                  </button>
                  <button
                    onClick={handleTestApiKey}
                    disabled={testingApiKey}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingApiKey ? 'animate-spin' : ''}`} />
                    <span>{testingApiKey ? 'Testing Ping...' : 'Run API Ping Test'}</span>
                  </button>
                </div>
              </div>

              {/* Status Badge & Diagnostic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Active Key Source</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 font-sans">
                      {localStorage.getItem('omni_user_gemini_api_key') ? 'Personal Google AI Key (BYOK)' : 'System Proxy Default Key'}
                    </span>
                    <span className="text-[11px] font-mono font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      x-user-gemini-api-key
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-sans">
                    {localStorage.getItem('omni_user_gemini_api_key')
                      ? 'Your custom personal Gemini API key is configured and injected into server proxy headers.'
                      : 'Using shared fallback system key. Configure your personal key in settings to unlock dedicated account limits.'}
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Google AI Studio Project & Billing</span>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 font-sans">AI Studio Tier Link</span>
                    <a
                      href="https://ai.studio/projects"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-blue-600 hover:underline inline-flex items-center space-x-1"
                    >
                      <span>Get / Manage Key</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <p className="text-[11px] text-slate-500 font-sans">
                    If you see limit errors, check your project billing or rate tiers at Google AI Studio.
                  </p>
                </div>
              </div>

              {/* Ping Test Result Banner */}
              {apiKeyTestResult && (
                <div className={`p-4 rounded-xl border flex items-start space-x-3 transition animate-fade-in ${
                  apiKeyTestResult.status === 'active'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  {apiKeyTestResult.status === 'active' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold font-sans">
                      {apiKeyTestResult.status === 'active' ? 'API Key Health: OK' : 'API Key Health: Issue Detected'}
                    </h4>
                    <p className="text-xs leading-relaxed font-sans">{apiKeyTestResult.message}</p>
                    {apiKeyTestResult.latencyMs && (
                      <span className="text-[10px] font-mono text-slate-500 block">
                        Server Roundtrip Latency: {apiKeyTestResult.latencyMs}ms
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardPanel>

            {/* Database Usage & Spark Tier Quotas Card */}
            <CardPanel padding="spacious" className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans">Firestore Database Live Usage & Spark Quotas</h3>
                    <p className="text-xs text-slate-500 font-mono">Project ID: ai-studio-df73c2e7-4647-433d-846e-0f45d9bc3673</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 shrink-0">
                  <a
                    href="https://console.firebase.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <span>Firebase Console</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://console.cloud.google.com/iam-admin/quotas"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-semibold rounded-lg transition inline-flex items-center space-x-1"
                  >
                    <span>GCP Quotas</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Record Counts Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Enquiries</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{enquiries.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Companies</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{companies.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Contacts</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{contacts.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Products</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{products.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Call Logs</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{callLogs.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Workspaces</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{workspaces.length}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Roster</span>
                  <span className="text-base font-extrabold text-slate-900 font-sans">{salespersons.length}</span>
                </div>
              </div>

              {/* Firebase Spark Tier Free Plan Limits Reference */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-xs font-bold text-slate-900 font-sans block">Daily Free Document Reads</span>
                  <span className="text-xs font-mono text-emerald-700 block">50,000 reads / day</span>
                  <p className="text-[11px] text-slate-500 font-sans">Covers realtime listener queries and background pulls across active devices.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-xs font-bold text-slate-900 font-sans block">Daily Free Document Writes</span>
                  <span className="text-xs font-mono text-emerald-700 block">20,000 writes / day</span>
                  <p className="text-[11px] text-slate-500 font-sans">Covers record inserts, updates, and delete operations.</p>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-xs font-bold text-slate-900 font-sans block">Storage & Active Connections</span>
                  <span className="text-xs font-mono text-emerald-700 block">1 GiB Storage | 100 Listeners</span>
                  <p className="text-[11px] text-slate-500 font-sans">Capacity for database storage and active concurrent realtime user sessions.</p>
                </div>
              </div>
            </CardPanel>

            {/* System Maintenance & On-Demand Actions Card */}
            <CardPanel padding="spacious" className="space-y-4">
              <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-xl border border-purple-100">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-sans">On-Demand System Maintenance</h3>
                  <p className="text-xs text-slate-500 font-sans">Run explicit batch maintenance procedures without listener overhead.</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 font-sans">Re-index Serial Numbers (S/N)</h4>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5">
                    Sorts all enquiries chronologically and re-indexes sequential S/N values starting from 1001.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (enquiries.length === 0) {
                      triggerToast('No enquiries available to re-index', 'info');
                      return;
                    }
                    const sorted = [...enquiries].sort((a, b) => {
                      const dateA = a.createdAt || a.enquiry_date;
                      const dateB = b.createdAt || b.enquiry_date;
                      return dateA.localeCompare(dateB);
                    });
                    let count = 0;
                    for (let i = 0; i < sorted.length; i++) {
                      const targetSn = 1001 + i;
                      if (sorted[i].sn !== targetSn && sorted[i].id) {
                        await EnquiryRepository.saveEnquiry({ ...sorted[i], sn: targetSn });
                        count++;
                      }
                    }
                    triggerToast(`Re-indexed S/N for ${count} enquiry records`, 'success');
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl transition shrink-0"
                >
                  Run S/N Re-index Batch
                </button>
              </div>
            </CardPanel>

            {/* Security Audit Trail & Activity Log Card */}
            <CardPanel padding="spacious" className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 font-sans">Security Audit Trail & Activity Log</h3>
                    <p className="text-xs text-slate-500 font-sans">
                      Inspect system actions, user mutations, and record deletions with clean CSV and printable PDF exports.
                    </p>
                  </div>
                </div>

                {/* Export Action Controls */}
                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleExportAuditCsv}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl border border-slate-300 transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportAuditPdf}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print PDF Report</span>
                  </button>
                </div>
              </div>

              {/* Filters & Search Toolbar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative flex-1 w-full sm:w-auto">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by user, entity title, ID or details..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none font-sans"
                  />
                </div>

                <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-sans"
                  >
                    <option value="all">All Actions</option>
                    <option value="create">CREATE Only</option>
                    <option value="update">UPDATE Only</option>
                    <option value="delete">DELETE Only</option>
                  </select>
                </div>
              </div>

              {/* Audit Logs Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs font-sans">
                    <thead className="bg-slate-900 text-white sticky top-0 font-mono text-[11px]">
                      <tr>
                        <th className="p-2.5 font-bold">Timestamp</th>
                        <th className="p-2.5 font-bold">User</th>
                        <th className="p-2.5 font-bold">Action</th>
                        <th className="p-2.5 font-bold">Entity</th>
                        <th className="p-2.5 font-bold">Title / Ref ID</th>
                        <th className="p-2.5 font-bold">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-slate-400 font-sans">
                            No audit log records match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredAuditLogs.map((log, idx) => (
                          <tr key={(log.document_id || 'log') + '_' + idx} className="hover:bg-slate-50/80 transition">
                            <td className="p-2.5 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                              {log.timestamp ? new Date(log.timestamp).toLocaleString() : '-'}
                            </td>
                            <td className="p-2.5">
                              <span className="font-bold text-slate-800 block">{log.changed_by_name || 'System'}</span>
                              <span className="text-[10px] text-slate-400 font-mono block">{log.changed_by_email || ''}</span>
                            </td>
                            <td className="p-2.5">
                              <span
                                className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wider ${
                                  log.action === 'create'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : log.action === 'delete'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-[10px] text-slate-600 uppercase font-semibold">
                              {log.entity_type}
                            </td>
                            <td className="p-2.5 font-semibold text-slate-900 max-w-[160px] truncate">
                              {log.entity_title || log.document_id || '-'}
                            </td>
                            <td className="p-2.5 text-slate-600 max-w-[240px] truncate">
                              {log.details || '-'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardPanel>
          </div>
        )}

        {activeSubTab === 'simulator' && (
          <SystemSimulator
            user={user}
            triggerToast={triggerToast}
          />
        )}

        {activeSubTab === 'invites' && (
          <InviteManager
            invites={invites}
            currentUserId={user.uid}
            activeWorkspace={activeWorkspace}
            setInvites={setInvites}
          />
        )}

        {activeSubTab === 'account' && (
          <CardPanel padding="spacious" className="space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="text-base font-bold text-slate-800 font-sans flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                User Account & Testing Profile Controls
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">
                Manage your user session, inspect role assignments, and reset account state for testing onboarding flows.
              </p>
            </div>

            {/* Profile Overview Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Username / ID</span>
                <span className="text-sm font-bold text-slate-800 font-sans">{user.username}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Email Address</span>
                <span className="text-sm font-semibold text-slate-700 font-mono truncate block">{user.email}</span>
              </div>
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Access Role</span>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded border border-blue-200 inline-block mt-0.5">
                  {user.role}
                </span>
              </div>
            </div>

            {/* Testing & Reset Actions */}
            <div className="space-y-4 pt-2">
              <h4 className="text-xs font-mono text-slate-400 uppercase tracking-widest">
                AI Configuration & Session Management
              </h4>

              {/* Personal Gemini API Key Card */}
              <div className="p-4 bg-blue-50/70 border border-blue-200/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-blue-950 font-sans flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    <span>Personal Gemini API Key (Bring Your Own Key)</span>
                  </div>
                  <p className="text-xs text-blue-800/80 font-sans">
                    Configure your personal Google AI Studio API key for document extraction, quote parsing, and AI autofill features.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGeminiKeyModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center space-x-1.5 shrink-0"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Configure API Key</span>
                </button>
              </div>

              <div className="p-4 bg-amber-50/50 border border-amber-200/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-amber-900 font-sans flex items-center gap-1.5">
                    <RefreshCw className="w-4 h-4 text-amber-600" />
                    <span>Clear Local Storage Caches</span>
                  </div>
                  <p className="text-xs text-amber-700/80 font-sans">
                    Purges temporary offline cache keys without deleting your user profile or Firestore database records.
                  </p>
                </div>
                <button
                  onClick={() => {
                    localStorage.clear();
                    if (triggerToast) triggerToast('Local storage caches cleared.', 'info');
                    setTimeout(() => window.location.reload(), 500);
                  }}
                  className="px-3.5 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 font-semibold text-xs rounded-lg shadow-sm transition shrink-0"
                >
                  Clear Caches
                </button>
              </div>

              <div className="p-4 bg-rose-50/50 border border-rose-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs font-bold text-rose-900 font-sans flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Delete Account Profile & Test Fresh Onboarding</span>
                  </div>
                  <p className="text-xs text-rose-700/80 font-sans">
                    Permanently deletes your user document from Firestore and resets your session so you can test onboarding with another email or redeem a new invite code.
                  </p>
                </div>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center space-x-1.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account Profile</span>
                </button>
              </div>
            </div>

            {/* Account Deletion Confirmation Modal */}
            {showDeleteModal && (
              <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
                <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center space-x-3 text-rose-600">
                    <div className="p-3 bg-rose-100 rounded-xl">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 font-sans">Delete User Account Profile</h3>
                      <p className="text-xs text-slate-500 font-mono">Irreversible Testing Reset Action</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed font-sans">
                    Are you sure you want to delete the user account profile for <strong className="text-slate-900 font-mono">{user.email}</strong>?
                  </p>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1 font-sans">
                    <p>• Your user profile document will be removed from Firestore <code className="text-slate-800">users</code> collection.</p>
                    <p>• All local session caches will be purged.</p>
                    <p>• You will be redirected to the sign-in screen to test clean onboarding or invite code redemption.</p>
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                    <button
                      onClick={() => setShowDeleteModal(false)}
                      disabled={deleting}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold text-xs rounded-xl shadow transition flex items-center space-x-1.5"
                    >
                      {deleting ? (
                        <span>Deleting...</span>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Confirm Delete Profile</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </CardPanel>
        )}

        {activeSubTab === 'cloud' && (
          <CardPanel padding="spacious">
            <div className="border-b border-slate-100 pb-4 mb-6">
              <h3 className="text-base font-bold text-slate-800 font-sans flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-600" />
                Cloud Repository & Local Persistence Controls
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manage high-speed local storage caches, run manual cloud pushes and pulls, and export full .json database backups.
              </p>
            </div>

            <CloudSyncHub
              companies={companies}
              contacts={contacts}
              enquiries={enquiries}
              callLogs={callLogs}
              auditLogs={auditLogs}
              products={products}
              salespersons={salespersons}
              enquirySources={enquirySources}
              productCategories={productCategories}
              units={units}
              user={user}
              setCompanies={setCompanies || (() => {})}
              setContacts={setContacts || (() => {})}
              setEnquiries={setEnquiries || (() => {})}
              setCallLogs={setCallLogs || (() => {})}
              setAuditLogs={setAuditLogs || (() => {})}
              setProducts={setProducts || (() => {})}
              setSalespersons={setSalespersons || (() => {})}
              setEnquirySources={setEnquirySources || (() => {})}
              setProductCategories={setProductCategories || (() => {})}
              setUnits={setUnits || (() => {})}
              realtimeSyncEnabled={realtimeSyncEnabled}
              setRealtimeSyncEnabled={setRealtimeSyncEnabled}
              showToast={(msg, type) => triggerToast && triggerToast(msg, type || 'info')}
            />
          </CardPanel>
        )}

        {activeSubTab === 'docs' && (
          <DocsSystemHub />
        )}
      </div>

      {/* Gemini API Key Configuration Modal */}
      <GeminiKeyModal
        isOpen={showGeminiKeyModal}
        onClose={() => setShowGeminiKeyModal(false)}
        triggerToast={triggerToast}
      />

      {/* Workspace Ownership & Account Deletion Wizard */}
      <WorkspaceHandoverWizardModal
        isOpen={isHandoverWizardOpen}
        onClose={() => setIsHandoverWizardOpen(false)}
        currentUser={user}
        category2Workspaces={category2WsList}
        category1WorkspaceIds={category1WsIds}
        onConfirmHandoverAndDelete={async (resolutions) => {
          setDeleting(true);
          try {
            await executeFinalCascadeDeleteAndScrub(
              user,
              category1WsIds,
              resolutions,
              category2WsList,
              nonAdminExitWsList
            );
          } catch (err: any) {
            console.error('Failed to execute handover and deletion:', err);
            if (triggerToast) triggerToast('Failed to delete account profile: ' + err.message, 'error');
            setDeleting(false);
          }
        }}
      />
    </PageBody>
  </>
);
}

