import React, { useState } from 'react';
import { UserProfile, Workspace } from '../types';
import { safeAddDoc, safeSetDoc } from '../firebase';
import { DEFAULT_GEOGRAPHIES } from './WorkspaceManagerModal';
import { Rocket, Sparkles, Sliders, Check, Building, Globe, Layers } from 'lucide-react';
import { motion } from 'motion/react';

interface FreshAccountOnboardingModalProps {
  isOpen: boolean;
  currentUser: UserProfile;
  onWorkspaceCreated: (newWorkspace: Workspace) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function FreshAccountOnboardingModal({
  isOpen,
  currentUser,
  onWorkspaceCreated,
  triggerToast
}: FreshAccountOnboardingModalProps) {
  const [pathway, setPathway] = useState<'quick' | 'custom' | null>(null);

  // Custom Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enquiriesEnabled, setEnquiriesEnabled] = useState(true);
  const [callLogEnabled, setCallLogEnabled] = useState(true);
  const [geographyText, setGeographyText] = useState(DEFAULT_GEOGRAPHIES.join('\n'));
  const [creating, setCreating] = useState(false);

  if (!isOpen) return null;

  const handleQuickStart = async () => {
    setCreating(true);
    try {
      const wsId = `ws_${Date.now()}`;
      const quickWorkspace: Workspace = {
        id: wsId,
        name: 'OmniSuite Workspace',
        description: 'Default primary workspace for commercial sales, enquiries, and call logs',
        created_by: currentUser.full_name || currentUser.username || currentUser.email,
        createdAt: new Date().toISOString(),
        modules: {
          enquiriesEnabled: true,
          callLogEnabled: true
        },
        geography_options: DEFAULT_GEOGRAPHIES,
        members: [
          {
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.full_name || currentUser.username,
            role: 'Admin',
            joined_at: new Date().toISOString()
          }
        ],
        member_emails: currentUser.email ? [currentUser.email] : []
      };

      await safeSetDoc('workspaces', wsId, quickWorkspace);

      // Create workspace_members document for currentUser
      const wmDocId = `wm_${wsId}_${currentUser.uid}`;
      const wmDoc = {
        id: wmDocId,
        workspace_id: wsId,
        workspaceId: wsId,
        user_id: currentUser.uid,
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.full_name || currentUser.username || currentUser.email,
        role: 'Admin',
        status: 'active',
        created_at: new Date().toISOString()
      };
      await safeSetDoc('workspace_members', wmDocId, wmDoc);

      if (triggerToast) triggerToast('Default workspace provisioned successfully!', 'success');
      onWorkspaceCreated(quickWorkspace);
    } catch (err: any) {
      console.error('Quick start workspace creation failed:', err);
      if (triggerToast) triggerToast(`Quick start error: ${err.message}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      if (triggerToast) triggerToast('Please enter a workspace name', 'error');
      return;
    }

    setCreating(true);
    try {
      const wsId = `ws_${Date.now()}`;
      const geogList = geographyText
        .split('\n')
        .map((g) => g.trim())
        .filter((g) => g.length > 0);

      const customWorkspace: Workspace = {
        id: wsId,
        name: name.trim(),
        description: description.trim() || undefined,
        created_by: currentUser.full_name || currentUser.username || currentUser.email,
        createdAt: new Date().toISOString(),
        modules: {
          enquiriesEnabled,
          callLogEnabled
        },
        geography_options: geogList.length > 0 ? geogList : DEFAULT_GEOGRAPHIES,
        members: [
          {
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.full_name || currentUser.username,
            role: 'Admin',
            joined_at: new Date().toISOString()
          }
        ],
        member_emails: currentUser.email ? [currentUser.email] : []
      };

      await safeSetDoc('workspaces', wsId, customWorkspace);

      // Create workspace_members document for currentUser
      const wmDocId = `wm_${wsId}_${currentUser.uid}`;
      const wmDoc = {
        id: wmDocId,
        workspace_id: wsId,
        workspaceId: wsId,
        user_id: currentUser.uid,
        uid: currentUser.uid,
        email: currentUser.email || '',
        name: currentUser.full_name || currentUser.username || currentUser.email,
        role: 'Admin',
        status: 'active',
        created_at: new Date().toISOString()
      };
      await safeSetDoc('workspace_members', wmDocId, wmDoc);

      if (triggerToast) triggerToast(`Workspace "${customWorkspace.name}" created!`, 'success');
      onWorkspaceCreated(customWorkspace);
    } catch (err: any) {
      console.error('Custom workspace creation failed:', err);
      if (triggerToast) triggerToast(`Creation error: ${err.message}`, 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-950/60 text-center">
          <div className="inline-flex p-3 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20 mb-3">
            <Rocket className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Welcome to OmniSuite</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Get started by initializing your first workspace environment. Choose 1-click setup or configure custom modules.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Option Selector */}
          {!pathway && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A: Quick Start */}
              <button
                onClick={handleQuickStart}
                disabled={creating}
                className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 text-left transition-all group flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Recommended
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-4 group-hover:text-blue-300 transition-colors">
                    1-Click Quick Start
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Instantly provisions an "OmniSuite Workspace" pre-configured with Enquiry Register, Call Logs, and standard GCC geography dropdowns.
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-800/80 flex items-center text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition-transform">
                  <span>Launch Quick Workspace &rarr;</span>
                </div>
              </button>

              {/* Option B: Custom Workspace */}
              <button
                onClick={() => setPathway('custom')}
                disabled={creating}
                className="p-5 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-blue-500/50 hover:bg-blue-500/5 text-left transition-all group flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 w-max">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-white mt-4 group-hover:text-blue-300 transition-colors">
                    Custom Workspace
                  </h3>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Configure your workspace name, active operational modules, and custom geographical regions line by line.
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-800/80 flex items-center text-xs font-semibold text-blue-400 group-hover:translate-x-1 transition-transform">
                  <span>Configure Settings &rarr;</span>
                </div>
              </button>
            </div>
          )}

          {/* Custom Form */}
          {pathway === 'custom' && (
            <form onSubmit={handleCustomSubmit} className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-blue-400" />
                  <span>Configure Workspace Details</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setPathway(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  &larr; Back to choices
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Workspace Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. GCC Commercial Division"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Primary territory management"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Module Toggles */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enquiriesEnabled}
                    onChange={(e) => setEnquiriesEnabled(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs font-semibold text-slate-200">Enquiry Register</span>
                </label>

                <label className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={callLogEnabled}
                    onChange={(e) => setCallLogEnabled(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500 bg-slate-900 border-slate-700"
                  />
                  <span className="text-xs font-semibold text-slate-200">Call Log Manager</span>
                </label>
              </div>

              {/* Geography Options */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  <span>Geographical Regions (One per line)</span>
                </label>
                <textarea
                  rows={4}
                  value={geographyText}
                  onChange={(e) => setGeographyText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end space-x-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors flex items-center space-x-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{creating ? 'Creating Workspace...' : 'Create & Proceed'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
}
