import React, { useState } from 'react';
import { Workspace, UserProfile } from '../types';
import { AlertTriangle, Download, ArrowRight, Shield, Trash2, Users, Check, X, Building, Loader2 } from 'lucide-react';
import { exportWorkspaceData } from '../services/SyncEngine';
import { downloadJsonFile } from '../utils/download';

export interface Category2WorkspaceInfo {
  workspace: Workspace;
  otherMembers: Array<{
    uid?: string;
    email: string;
    name?: string;
    role?: string;
  }>;
}

export interface HandoverResolution {
  action: 'transfer' | 'delete';
  newOwnerUidOrEmail?: string;
}

interface WorkspaceHandoverWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  category2Workspaces: Category2WorkspaceInfo[];
  category1WorkspaceIds: string[];
  onConfirmHandoverAndDelete: (
    resolutions: Record<string, HandoverResolution>
  ) => Promise<void>;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function WorkspaceHandoverWizardModal({
  isOpen,
  onClose,
  currentUser,
  category2Workspaces,
  category1WorkspaceIds,
  onConfirmHandoverAndDelete,
  triggerToast
}: WorkspaceHandoverWizardModalProps) {
  const [resolutions, setResolutions] = useState<Record<string, HandoverResolution>>({});
  const [downloadingWsId, setDownloadingWsId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleActionChange = (wsId: string, action: 'transfer' | 'delete') => {
    setResolutions((prev) => {
      const existing = prev[wsId] || {};
      if (action === 'transfer') {
        // Default to first available member if not set
        const wsInfo = category2Workspaces.find((w) => w.workspace.id === wsId);
        const defaultTarget = wsInfo?.otherMembers[0]?.uid || wsInfo?.otherMembers[0]?.email || '';
        return {
          ...prev,
          [wsId]: {
            action: 'transfer',
            newOwnerUidOrEmail: existing.newOwnerUidOrEmail || defaultTarget
          }
        };
      } else {
        return {
          ...prev,
          [wsId]: {
            action: 'delete'
          }
        };
      }
    });
  };

  const handleTargetOwnerChange = (wsId: string, newOwner: string) => {
    setResolutions((prev) => ({
      ...prev,
      [wsId]: {
        action: 'transfer',
        newOwnerUidOrEmail: newOwner
      }
    }));
  };

  const handleDownloadBackup = async (ws: Workspace) => {
    setDownloadingWsId(ws.id);
    try {
      const data = await exportWorkspaceData(ws.id, ws.name);
      const filename = `${ws.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_backup_${new Date().toISOString().split('T')[0]}.json`;
      downloadJsonFile(filename, data);
      if (triggerToast) triggerToast(`Backup for "${ws.name}" downloaded!`, 'success');
    } catch (err: any) {
      console.error('Failed to export workspace backup:', err);
      if (triggerToast) triggerToast(`Backup failed: ${err.message}`, 'error');
    } finally {
      setDownloadingWsId(null);
    }
  };

  // Validate if all Category 2 workspaces have a valid resolution selected
  const allResolved = category2Workspaces.every((item) => {
    const res = resolutions[item.workspace.id];
    if (!res) return false;
    if (res.action === 'transfer') {
      return Boolean(res.newOwnerUidOrEmail && res.newOwnerUidOrEmail.trim().length > 0);
    }
    if (res.action === 'delete') {
      return true;
    }
    return false;
  });

  const handleSubmit = async () => {
    if (!allResolved) {
      setErrorMessage('Please resolve ownership transfer or workspace wipe for all listed multi-member workspaces.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await onConfirmHandoverAndDelete(resolutions);
    } catch (err: any) {
      console.error('Handover & Account Deletion failed:', err);
      setErrorMessage(err?.message || 'Failed to complete workspace handover and account deletion.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100">
                Workspace Ownership & Account Deletion Wizard
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-Member Workspace Handover Required Before Account Termination
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Top Notice */}
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-xs leading-relaxed flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Action Required: </span>
              Your account is an active member or admin in {category2Workspaces.length} multi-member workspace(s). Before terminating your account, you must either <span className="text-slate-100 font-semibold">Transfer Ownership</span> to an active team member or <span className="text-rose-300 font-semibold">Delete the Workspace & All Contents</span>.
            </div>
          </div>

          {category1WorkspaceIds.length > 0 && (
            <div className="px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-md text-slate-300 text-xs flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-400">
                <Building className="w-4 h-4 text-slate-400" />
                Sole-Member Workspaces (Auto Cascade Wipe):
              </span>
              <span className="font-mono text-slate-200 font-medium">
                {category1WorkspaceIds.length} workspace(s)
              </span>
            </div>
          )}

          {/* List of Category 2 Workspaces */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider text-xs">
              Multi-Member Workspaces ({category2Workspaces.length})
            </h3>

            {category2Workspaces.map((item) => {
              const ws = item.workspace;
              const currentRes = resolutions[ws.id] || {};
              const isTransfer = currentRes.action === 'transfer';
              const isDelete = currentRes.action === 'delete';

              return (
                <div
                  key={ws.id}
                  className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-4"
                >
                  {/* Workspace Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-blue-400" />
                        <h4 className="text-base font-semibold text-slate-100">{ws.name}</h4>
                        <span className="px-2 py-0.5 text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                          {ws.id}
                        </span>
                      </div>
                      {ws.description && (
                        <p className="text-xs text-slate-400 mt-1">{ws.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800/80 rounded-full text-[11px] text-slate-300 border border-slate-700/50">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.otherMembers.length} active member(s)</span>
                    </div>
                  </div>

                  {/* Resolution Selector Options */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Option A: Transfer Ownership */}
                    <button
                      type="button"
                      onClick={() => handleActionChange(ws.id, 'transfer')}
                      className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                        isTransfer
                          ? 'bg-blue-500/10 border-blue-500/50 text-slate-100 ring-1 ring-blue-500/30'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-blue-400" />
                          Option A: Transfer Ownership
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isTransfer
                              ? 'border-blue-400 bg-blue-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {isTransfer && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        Promote an active team member to Admin/Owner and retain workspace data for the remaining team.
                      </p>
                    </button>

                    {/* Option B: Delete Workspace & All Contents */}
                    <button
                      type="button"
                      onClick={() => handleActionChange(ws.id, 'delete')}
                      className={`p-3 rounded-lg border text-left transition-all flex flex-col justify-between ${
                        isDelete
                          ? 'bg-rose-500/10 border-rose-500/50 text-slate-100 ring-1 ring-rose-500/30'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          Option B: Delete Workspace & Contents
                        </span>
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isDelete
                              ? 'border-rose-400 bg-rose-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {isDelete && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        Permanently nuke the workspace and all enquiries, companies, contacts, and call logs.
                      </p>
                    </button>
                  </div>

                  {/* Transfer Controls */}
                  {isTransfer && (
                    <div className="p-3 bg-blue-950/20 border border-blue-500/20 rounded-lg space-y-2">
                      <label className="block text-xs font-medium text-slate-300">
                        Select Active Member to Promote to Admin/Owner:
                      </label>
                      <select
                        value={currentRes.newOwnerUidOrEmail || ''}
                        onChange={(e) => handleTargetOwnerChange(ws.id, e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-md px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      >
                        {item.otherMembers.map((m) => {
                          const val = m.uid || m.email;
                          const label = `${m.name || 'Member'} (${m.email})${m.role ? ` — ${m.role}` : ''}`;
                          return (
                            <option key={val} value={val}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}

                  {/* Delete Controls & Backup Download */}
                  {isDelete && (
                    <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-semibold text-rose-300 block">
                            Full Workspace Cascade Wipe
                          </span>
                          <span className="text-[11px] text-slate-400">
                            Download a full JSON backup before proceeding with deletion.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDownloadBackup(ws)}
                          disabled={downloadingWsId === ws.id}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-md border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                        >
                          {downloadingWsId === ws.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                          ) : (
                            <Download className="w-3.5 h-3.5 text-blue-400" />
                          )}
                          <span>Download Backup JSON</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Error display */}
          {errorMessage && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 bg-slate-900 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!allResolved || isSubmitting}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Executing Account & Workspace Handover...</span>
              </>
            ) : (
              <>
                <span>Confirm & Execute Account Deletion</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
