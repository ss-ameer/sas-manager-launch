import React, { useState } from 'react';
import { Invite, UserRole, Workspace } from '../types';
import { TicketPlus, Key, Trash2, Clipboard, CheckCircle, Clock, Layers } from 'lucide-react';
import { safeAddDoc, safeDeleteDoc } from '../firebase';
import HoverScrollText from './common/HoverScrollText';

interface InviteManagerProps {
  invites: Invite[];
  currentUserId: string;
  activeWorkspace?: Workspace;
  setInvites?: React.Dispatch<React.SetStateAction<Invite[]>>;
}

export default function InviteManager({ invites = [], currentUserId, activeWorkspace, setInvites }: InviteManagerProps) {
  const [role, setRole] = useState<UserRole>('Member');
  const [generating, setGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter invites matching current active workspace context
  const activeWsId = activeWorkspace?.id || 'ws_default';
  const displayedInvites = invites.filter((inv) => {
    const invWsId = inv.workspace_id || inv.workspaceId || 'ws_default';
    return invWsId === activeWsId || activeWsId === 'ws_default';
  });

  // Custom confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const generateInvite = async () => {
    setGenerating(true);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codeSegment = '';
    for (let i = 0; i < 6; i++) {
      codeSegment += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const fullCode = `OMNI-INV-${codeSegment}`;

    try {
      const wsId = activeWorkspace?.id || 'ws_default';
      const wsName = activeWorkspace?.name || 'Main Workspace';

      const newInviteData: Omit<Invite, 'id'> = {
        code: fullCode,
        role: role,
        workspaceId: wsId,
        workspace_id: wsId,
        workspaceName: wsName,
        used: false,
        createdBy: currentUserId,
        createdAt: new Date().toISOString()
      };
      const res = await safeAddDoc('invites', newInviteData);
      const newId = res?.id || ('inv_' + Date.now());
      const newInvite: Invite = { id: newId, ...newInviteData };

      if (setInvites) {
        setInvites((prev) => [newInvite, ...prev.filter((i) => i.id !== newId)]);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to generate invite code.');
    } finally {
      setGenerating(false);
    }
  };

  const deleteInvite = async (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Revoke Invite Code',
      message: 'Are you sure you want to revoke this invite code?',
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await safeDeleteDoc('invites', id);
          if (setInvites) {
            setInvites((prev) => prev.filter((inv) => inv.id !== id));
          }
        } catch (err) {
          console.error(err);
          alert('Failed to revoke code.');
        }
      }
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      }
    } catch (err) {
      console.warn('Clipboard write restricted:', err);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div id="invites-tab" className="flex flex-col lg:flex-row gap-8">
      {/* Left pane: Generate form */}
      <div className="w-full lg:w-1/3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm h-fit">
        <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-100">
          <TicketPlus className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-900 font-sans">Invite Codes</h2>
        </div>

        <div className="space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed font-sans">
            Generate secure, single-use onboarding tokens for team members.
            Invited users will enter this token during sign-up to instantiate their user profile.
          </p>

          <div>
            <label className="block text-xs font-mono text-slate-400 uppercase tracking-widest mb-1.5">
              Assigned Access Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setRole('Member')}
                className={`py-2 px-3 border rounded-xl text-xs font-semibold font-sans transition ${
                  role === 'Member'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500'
                }`}
              >
                Member (Edit logs)
              </button>
              <button
                onClick={() => setRole('Viewer')}
                className={`py-2 px-3 border rounded-xl text-xs font-semibold font-sans transition ${
                  role === 'Viewer'
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-500'
                }`}
              >
                Viewer (Read-only)
              </button>
            </div>
          </div>

          <button
            onClick={generateInvite}
            disabled={generating}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-300 text-white font-semibold rounded-xl text-sm transition duration-150 shadow-sm flex items-center justify-center space-x-2"
          >
            <span>Generate Onboarding Code</span>
          </button>
        </div>
      </div>

      {/* Right pane: list of active codes */}
      <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h3 className="text-lg font-bold text-slate-900 font-sans flex items-center space-x-2">
            <Key className="w-5 h-5 text-slate-400" />
            <span>Active Invite Codes Registry</span>
          </h3>
          <span className="text-[10px] bg-slate-50 border border-slate-200 text-slate-500 px-2.5 py-1 rounded-full font-mono uppercase font-bold">
            Total Tokens: {displayedInvites.length}
          </span>
        </div>

        {displayedInvites.length > 0 ? (
          <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
            <table className="w-full lg:table-fixed text-left border-collapse">
              <colgroup>
                <col className="w-[184px]" />
                <col className="w-auto" />
                <col className="w-[108px]" />
                <col className="w-[152px]" />
                <col className="w-[168px]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead className="bg-slate-50/90 border-b border-slate-200/80">
                <tr className="text-[11px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 pl-4 pr-3 whitespace-nowrap">Code</th>
                  <th className="py-3 px-3 whitespace-nowrap">Target Workspace</th>
                  <th className="py-3 px-3 whitespace-nowrap">Access Role</th>
                  <th className="py-3 px-3 whitespace-nowrap">Status</th>
                  <th className="py-3 px-3 whitespace-nowrap">Redeemed By</th>
                  <th className="py-3 pl-3 pr-4 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {displayedInvites.map((invite) => {
                  const isClaimed = Boolean(invite.used || invite.is_used);
                  const claimedUser = invite.claimed_by_email || invite.usedBy || (invite.claimed_by_uid ? `User (${invite.claimed_by_uid.slice(0, 6)})` : '');

                  return (
                    <tr key={invite.id || invite.code} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 pl-4 pr-3 align-middle">
                        <div className="flex items-center gap-1.5 min-w-0 font-mono text-xs font-semibold text-slate-800 tracking-wider">
                          <HoverScrollText text={invite.code} containerClassName="flex-1 min-w-0" />
                          <button
                            type="button"
                            onClick={() => invite.id && copyToClipboard(invite.code, invite.id)}
                            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition shrink-0 cursor-pointer"
                            title="Copy Code"
                          >
                            {copiedId === invite.id ? (
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Clipboard className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs font-medium text-slate-700 align-middle overflow-hidden">
                        <div className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] max-w-full">
                          <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                          <HoverScrollText text={invite.workspaceName || 'Main Workspace'} containerClassName="min-w-0 flex-1" />
                        </div>
                      </td>
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <span className="inline-block text-xs bg-slate-50 text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200 font-semibold">
                          {invite.role}
                        </span>
                      </td>
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        {isClaimed ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span>Claimed</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 font-semibold bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                            <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span>Active / Unused</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs font-mono text-slate-500 align-middle overflow-hidden">
                        <HoverScrollText text={claimedUser || '—'} />
                      </td>
                      <td className="py-3 pl-3 pr-4 text-right align-middle whitespace-nowrap">
                        <div className="inline-flex items-center justify-end">
                          {invite.id && (
                            <button
                              type="button"
                              onClick={() => deleteInvite(invite.id!)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                              title="Revoke Token"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 font-sans text-sm">
            No invite codes found in your database. Click on the left pane button to generate a new registration invite code!
          </div>
        )}
      </div>

      {/* Custom Confirmation Dialog Overlay */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 font-sans mb-2">{confirmDialog.title}</h3>
            <p className="text-sm text-slate-500 font-sans mb-6">{confirmDialog.message}</p>
            <div className="flex items-center justify-end space-x-3 font-sans">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer"
              >
                {confirmDialog.cancelText || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                }}
                className={`py-2 px-4 rounded-xl text-xs font-bold text-white transition cursor-pointer ${
                  confirmDialog.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-slate-900 hover:bg-slate-800'
                }`}
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
