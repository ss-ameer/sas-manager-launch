import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Terminal, 
  ShieldCheck, 
  Cpu, 
  History, 
  Save, 
  Sparkles, 
  Info,
  CheckCircle,
  Undo
} from 'lucide-react';
import { BRAND_CONFIG } from '../config';
import { CardPanel } from './layout/UiContainer';

interface ChangelogEntry {
  version: string;
  date: string;
  type: 'MAJOR' | 'MINOR' | 'PATCH';
  changes: string[];
}

export default function DocsSystemHub() {
  const [activeTab, setActiveTab] = useState<'sandbox' | 'specs' | 'security' | 'changelog'>('sandbox');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Default Prompt template matching system instructions
  const DEFAULT_PROMPT = `Extract:
1. Client/Company Name (canonical name and legal suffix)
2. Contact person details (name, email, phone)
3. Project Location or Country
4. Detailed Line Items (matching: 'FRP Tanks', 'FRP Vessels', 'Pressure Vessels', 'RO Membranes', 'RO Housing', 'Cartridge Filters', 'Dosing Pumps', 'MBBR Media', 'Filter Media', 'Tube Settler Media', 'Chemicals', 'Valves', 'Frames/Fabrication', 'Various', 'Other')
5. Engineering parameters & dimensions mapped to flat attributes.`;

  useEffect(() => {
    const saved = localStorage.getItem('omni_ai_custom_instructions');
    if (saved) {
      setCustomPrompt(saved);
    } else {
      setCustomPrompt(DEFAULT_PROMPT);
    }
  }, []);

  const handleSavePrompt = () => {
    localStorage.setItem('omni_ai_custom_instructions', customPrompt);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetPrompt = () => {
    setCustomPrompt(DEFAULT_PROMPT);
    localStorage.setItem('omni_ai_custom_instructions', DEFAULT_PROMPT);
    setShowResetConfirm(false);
  };

  const changelog: ChangelogEntry[] = [
    {
      version: '0.40.2',
      date: '2026-08-08',
      type: 'PATCH',
      changes: [
        'Uncaught TypeError .substring Crash Fix: Added defensive string fallbacks (ws?.name || "WS").substring(0, 2) in WorkspaceManagerModal.tsx mapping loops to prevent white screen of death crashes when workspace names are undefined.',
        'Safe Optional Chaining & String Fallbacks: Applied optional chaining and fallback initial generators to user.username, user.full_name, user.initials, and user.role across Sidebar.tsx, App.tsx, UserManagementHub.tsx, and UserProfileModal.tsx.',
        'Sanitized User/Member Data Model Initialization: Guaranteed non-empty string defaults for full_name, username, email, and role during UserProfile and WorkspaceMember payload creation in WorkspaceManagerModal.tsx and Login.tsx.',
        'Hardened Initials Generators: Updated getInitials (src/types.ts) and deriveInitials (UserProfileModal.tsx) to handle undefined, null, or non-string inputs cleanly without throwing exceptions.'
      ]
    },
    {
      version: '0.40.1',
      date: '2026-08-08',
      type: 'PATCH',
      changes: [
        'Atomic Invite Code Consumption & Multi-Record Write Chain: Re-architected handleRedeemJoinCode in WorkspaceManagerModal to execute atomic writeBatch (with sequential safeSetDoc/safeUpdateDoc fallback) across invites, users, and workspaces collections.',
        'Workspace Member Roster Registration: Automatically appends claiming user profile (uid, email, name, role, joined_at) to workspace members list and updates users.workspaceIds array.',
        'Immediate Workspace UI Refresh & Switching: Re-fetched and updated user profile and accessible workspaces state in App.tsx, automatically switching active workspace context instantly without requiring page refresh.',
        'Settings Team Members Roster Alignment: Resolved issue preventing newly joined users from displaying under the Admin Workspace Team Members list in SettingsHub.'
      ]
    },
    {
      version: '0.40.0',
      date: '2026-08-08',
      type: 'MINOR',
      changes: [
        'Standardized Modal Geometry & Viewport Clamping: Enforced strict max-h-[85vh] and max-h-[90vh] flex containers across ContactDetailModal, CallLogDetailModal, and Company360Modal.',
        'Clamped Company History Sidebar Width (CompanyModal.tsx): Fixed outreach history side panel to w-80 / w-96 on xl/2xl desktops, restoring dominant fluid flex width to the Companies Registry table.',
        'Audit Log Storage & Backup Verification: Wired auditLogs local storage, IndexedDB persistence, and workspace JSON backup/restoration in CloudSyncHub.',
        'Security Audit Trail & Activity Log UI (SettingsHub.tsx): Built searchable, filterable Security Audit Trail card with CSV export and printable PDF report generation.'
      ]
    },
    {
      version: '0.36.0',
      date: '2026-08-08',
      type: 'MINOR',
      changes: [
        'Local-First Repository Architecture & Write-Ahead Mutation Queue: Replaced monolithic onSnapshot write loops with IndexedDB-backed db.ts local caching and SyncEngine background worker.',
        'Firestore Credit & Quota Protection: Eliminated infinite real-time snapshot write loops (removed automatic syncSNNumbersInFirestore and dropdown auto-seeding from listeners; disconnected audit_logs socket).',
        'Repository Data Layer: Built typed EnquiryRepository, CompanyRepository, CallLogRepository, and MetadataRepository services for optimistic local state management and queued background synchronization.',
        'System Health & Connectivity Hub: Transformed CloudSyncHub into a live network monitor, queue depth inspector, and JSON backup/restore tool.',
        'On-Demand Serial Number Re-indexing: Added manual batch S/N re-indexing in SettingsHub under On-Demand System Maintenance.'
      ]
    },
    {
      version: '0.35.0',
      date: '2026-08-08',
      type: 'MINOR',
      changes: [
        'Comprehensive Codebase & Full-Stack Audit: verified zero lint/type error baseline (tsc --noEmit) and production bundle compilation (npm run build).',
        'Updated version badges across Cloud Sync & Repository Hub and Docs & System Hub to align with current application versioning.'
      ]
    },
    {
      version: '0.34.0',
      date: '2026-08-07',
      type: 'MINOR',
      changes: [
        'Full Row Width Companies Registry Layout (CompanyModal.tsx): Replaced split side-by-side flex layout with a vertical full-width row stack layout.',
        'Extendable & Retractable Registry Banner: Introduced isRegistryCollapsed state with Retract Registry and Expand Registry Table controls.'
      ]
    },
    {
      version: '0.33.0',
      date: '2026-08-07',
      type: 'MINOR',
      changes: [
        'Direct Contact Creation in Add Enquiry (EnquiryForm.tsx): Placed inline + Add Contact button right next to Account Contact Personnel header.',
        'Wired Call Log Deletion from Company 360 inspector and cleaned up redundant text emojis across UI controls.'
      ]
    },
    {
      version: '0.32.0',
      date: '2026-08-07',
      type: 'MINOR',
      changes: [
        'Concerned Person Multi-Select Team Tagging: Added team member tagging for enquiries with granular permissions for tagged users.',
        'Side Panel Outreach & Proposal History in Companies & Contacts: Replaced standard history block with retractable side panel.'
      ]
    },
    {
      version: '0.30.0',
      date: '2026-08-07',
      type: 'MINOR',
      changes: [
        'Security Hardening: Prevented self/peer Admin privilege escalation and enforced workspace-scoped invite codes.',
        'Per-User Data Visibility Tier System: Added ADVANCED and BASIC data visibility tiers with contact handle & financial figure masking.'
      ]
    },
    {
      version: '0.29.0',
      date: '2026-08-06',
      type: 'MINOR',
      changes: [
        'Workspace Deletion Capability: Implemented workspace deletion with state-based confirmation banner in WorkspaceManagerModal.',
        'API & Database Health Diagnostics: Added live Gemini API connection ping tests and Firestore database metric cards in SettingsHub.'
      ]
    },
    {
      version: '0.28.0',
      date: '2026-08-06',
      type: 'MINOR',
      changes: [
        'Personal Gemini API Key (BYOK) Integration: Built user API key manager modal enabling operators to configure personal Google AI Studio keys.'
      ]
    },
    {
      version: '0.27.0',
      date: '2026-08-06',
      type: 'MINOR',
      changes: [
        'Centralized Delete Safety & Error Handling: Upgraded safeDeleteDoc in firebase.ts with strict ID validation and diagnostic logging.'
      ]
    },
    {
      version: '0.22.0',
      date: '2026-08-05',
      type: 'MINOR',
      changes: [
        'Global Stateful Overlay Confirmations: Replaced native window.confirm popups with custom promise-wrapped modal overlays.'
      ]
    },
    {
      version: '0.20.0',
      date: '2026-08-05',
      type: 'MINOR',
      changes: [
        'Unified Sidebar Call Navigation: Consolidated Today Call Queue and Call Log & History into a single unified Call Center & Logs menu.'
      ]
    },
    {
      version: '0.18.0',
      date: '2026-07-29',
      type: 'MINOR',
      changes: [
        'Unified Layout Primitives: Created reusable UiContainer primitives to enforce consistent padding, margins, and border styles.'
      ]
    },
    {
      version: '0.15.0',
      date: '2026-07-27',
      type: 'MINOR',
      changes: [
        'Sync Status Dashboard & Diagnostic Error Logs: Built real-time status dashboard and surfaced sync logs in Cloud Sync Hub.'
      ]
    },
    {
      version: '0.14.0',
      date: '2026-07-27',
      type: 'MINOR',
      changes: [
        'Levenshtein Fuzzy Match Duplicate Prevention Engine: Similarity analysis algorithms for company & contact duplicate prevention.'
      ]
    },
    {
      version: '0.10.0',
      date: '2026-07-23',
      type: 'MINOR',
      changes: [
        'Smart Field Auto-Scroll & Token Highlighting: Interactive field token chips highlighting target form controls with pulsing emerald rings.'
      ]
    },
    {
      version: '0.9.0',
      date: '2026-07-20',
      type: 'MINOR',
      changes: [
        'Implemented global inline account and contact personnel editing ("✎ Edit Details") right within the active form viewport.',
        'Added independent sort toggles (Default, A-Z, Z-A) next to labels for four critical select dropdown lists.',
        'Increased client-side network abort timeout from 90 seconds to 120 seconds to allow stable processing of large files across model retries.',
        'Coupled the AI Document Autofill routine with the global toast notification engine to render rich performance, matched-company, and items-count success or failure visual feedback.'
      ]
    },
    {
      version: '0.8.7',
      date: '2026-07-20',
      type: 'PATCH',
      changes: [
        'Upgraded server-side retry handler to use an automated rotating pool of primary and fallback Gemini models.',
        'Rotates between gemini-3.5-flash, gemini-3.1-flash-lite, and gemini-flash-latest to bypass localized traffic spikes.',
        'Ensured highest extraction pipeline resilience and uptime under concurrent user demand load.'
      ]
    },
    {
      version: '0.8.6',
      date: '2026-07-20',
      type: 'PATCH',
      changes: [
        'Increased client-side network abort timeout from 40 seconds to 90 seconds.',
        'Ensured sufficient margin for server-side exponential backoff retries and model failovers under heavy API load.',
        'Resolved client-side "signal is aborted without reason" errors during peak demand periods.'
      ]
    },
    {
      version: '0.8.5',
      date: '2026-07-16',
      type: 'PATCH',
      changes: [
        'Updated automatic model failover system to reference highly resilient and active gemini-3.1-flash-lite model.',
        'Eliminated 404 Model Not Found exceptions occurring on backoff failovers due to deprecated/deactivated gemini-2.5-flash.',
        'Guaranteed uninterrupted, high-uptime processing of automated AI document extractions.'
      ]
    },
    {
      version: '0.8.4',
      date: '2026-07-16',
      type: 'MINOR',
      changes: [
        'Implemented dynamic, high-performance canvas-based PDF.js document viewer to replace legacy sandboxed iframes.',
        'Supports instant rendering of both local Base64 storage payloads and cloud-synchronized file buckets.',
        'Equipped viewer with operator-focused controls including dynamic paging and real-time canvas-scale zoom.'
      ]
    },
    {
      version: '0.5.0',
      date: '2026-07-14',
      type: 'MINOR',
      changes: [
        'Introduced full-stack Express server architecture with Vite server middleware integration.',
        'Implemented real-time AI Enquiry Extraction utilizing Gemini 3.5 Flash model on PDF/Image/Text uploads.',
        'Enabled real-time Firebase Storage file upload integration with automatic base64 fallback.',
        'Completely decoupled application from Aventura branding to generic Omni Suite dynamic brand system.'
      ]
    },
    {
      version: '0.4.0',
      date: '2026-06-25',
      type: 'MINOR',
      changes: [
        'Migrated product and line-item attributes structure from {key, value} arrays to flat Record<string, string> maps.',
        'Configured standard category suggested attributes schema with dynamic options in Product Manager UI.',
        'Enhanced Enquiry Detail view with full historic revision tracking and audit logs pipeline.'
      ]
    },
    {
      version: '0.3.0',
      date: '2026-05-18',
      type: 'PATCH',
      changes: [
        'Optimized client-side fuzzy searching on companies and contacts indices.',
        'Enforced strict legal suffix validators to prevent double data entries.',
        'Replaced loading freeze bugs with graceful error-boundary snapshots.'
      ]
    }
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight font-sans">
            Docs & System Hub
          </h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl font-sans">
            Review specifications, adjust intelligent extraction directives, and trace the evolution of the {BRAND_CONFIG.appName} workspace.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center bg-blue-50 border border-blue-100 px-4 py-2 rounded-xl text-xs font-mono text-blue-700">
          <Cpu className="w-4 h-4 mr-2 text-blue-500" />
          <span>v{changelog[0].version}-stable</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 space-x-1 p-1 bg-slate-100 rounded-xl max-w-md">
        <button
          onClick={() => setActiveTab('sandbox')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition font-sans flex items-center justify-center space-x-1.5 ${
            activeTab === 'sandbox'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-950'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
          <span>AI Sandbox</span>
        </button>
        <button
          onClick={() => setActiveTab('specs')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition font-sans flex items-center justify-center space-x-1.5 ${
            activeTab === 'specs'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-950'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Specs</span>
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition font-sans flex items-center justify-center space-x-1.5 ${
            activeTab === 'security'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-950'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Security</span>
        </button>
        <button
          onClick={() => setActiveTab('changelog')}
          className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition font-sans flex items-center justify-center space-x-1.5 ${
            activeTab === 'changelog'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-950'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Timeline</span>
        </button>
      </div>

      {/* Tab Panels */}
      <CardPanel padding="spacious" className="min-h-[400px]">
        
        {/* Panel 1: AI Behavior Sandbox */}
        {activeTab === 'sandbox' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-start space-x-3 bg-blue-50/50 border border-blue-100 rounded-2xl p-4">
              <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-600 leading-relaxed font-sans">
                <strong className="text-slate-800 block mb-1">AI Behavior Custom Sandbox</strong>
                This custom instructions playground allows operators to adjust how the Gemini API extracts details from uploaded RFQs, quote sheets, and specification documents. These rules are saved in your browser's persistent store.
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest">
                Active Extraction Directives
              </label>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="w-full h-64 bg-slate-50 text-slate-800 font-mono text-xs p-4 rounded-2xl border border-slate-200 focus:outline-none focus:border-blue-500 focus:bg-white leading-relaxed"
                placeholder="Enter system prompts and guidelines for product attributes..."
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleResetPrompt}
                className="flex items-center space-x-1.5 px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <Undo className="w-3.5 h-3.5" />
                <span>Reset to System Default</span>
              </button>

              <div className="flex items-center space-x-3">
                {saveSuccess && (
                  <span className="text-emerald-600 text-xs font-semibold font-sans flex items-center space-x-1">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span>Saved to local workspace!</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSavePrompt}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Instructions</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Panel 2: Technical Specs */}
        {activeTab === 'specs' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-base font-bold text-slate-800 font-sans border-b pb-2">
              Technical Architecture Specifications
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Data Model Migration</span>
                <p className="text-xs text-slate-700 leading-relaxed font-sans">
                  The system migrated attributes from flat <code>ProductAttribute[]</code> key-value array structures to a streamlined <code>Record&lt;string, string&gt;</code> dictionary map format. This guarantees O(1) attribute lookup and resolves schema drift on dynamic category options.
                </p>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Proxy Architecture</span>
                <p className="text-xs text-slate-700 leading-relaxed font-sans">
                  Requests to the Gemini LLM pipeline flow exclusively through a secure backend proxy server (<code>/api/gemini/extract-enquiry</code>). The server-side environment is decoupled from browser runtime spaces to guarantee complete protection of sensitive keys.
                </p>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Firebase Storage Bindings</span>
                <p className="text-xs text-slate-700 leading-relaxed font-sans">
                  Document uploads map to dedicated Firebase Storage paths under the <code>proposals/</code> bucket. Secure read/write tokens are cached on-demand, enabling complete reliability on media files.
                </p>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-2">
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest block">Local Offline Fallback</span>
                <p className="text-xs text-slate-700 leading-relaxed font-sans">
                  In environments where cloud credentials are temporarily unavailable, the system automatically redirects file streams to client-side <code>FileReader</code> memory slots as secure Base64 local strings.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Panel 3: Cryptography & Security */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-base font-bold text-slate-800 font-sans border-b pb-2">
              Cryptography & Integrity Protection
            </h3>

            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-800 font-sans leading-relaxed">
                  <strong>Zero API Key Disclosure Principle</strong>
                  <p className="mt-1">
                    No third-party SDK tokens or proprietary parameters are embedded into client bundles. Active validation of incoming payloads ensures only authenticated workspace operators can initiate API processing calls.
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs text-slate-700 leading-relaxed font-sans">
                <p>
                  <strong>Secure File Handshakes:</strong>
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Metadata scrubbing occurs during client-side uploads to strip location or author details.</li>
                  <li>Temporary object download tokens are strictly scoped to prevent unauthorized public exposure of proposals.</li>
                  <li>Audit trails monitor all modifications to Enquiry entities, tracking timestamp, active operator details, and old/new values in full compliance with compliance policies.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Panel 4: Release Timeline */}
        {activeTab === 'changelog' && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-base font-bold text-slate-800 font-sans border-b pb-2">
              Release Timeline History
            </h3>

            <div className="space-y-6 relative before:absolute before:inset-y-0 before:left-3.5 before:w-0.5 before:bg-slate-100 pl-8">
              {changelog.map((entry, idx) => (
                <div key={idx} className="relative space-y-2">
                  {/* Bullet */}
                  <span className={`absolute -left-8 top-1.5 w-3 h-3 rounded-full border-2 border-white ring-4 ring-white ${
                    entry.type === 'MAJOR' ? 'bg-red-500 ring-red-100' :
                    entry.type === 'MINOR' ? 'bg-blue-500 ring-blue-100' : 'bg-slate-500 ring-slate-100'
                  }`} />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-slate-900 font-mono">v{entry.version}</span>
                      <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                        entry.type === 'MAJOR' ? 'bg-red-50 border-red-200 text-red-600' :
                        entry.type === 'MINOR' ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}>
                        {entry.type}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-slate-400">{entry.date}</span>
                  </div>

                  <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 leading-relaxed font-sans">
                    {entry.changes.map((change, cIdx) => (
                      <li key={cIdx}>{change}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

      </CardPanel>
    </div>
  );
}
