import React, { useState, useEffect } from 'react';
import { Invite, UserRole, Workspace } from '../types';
import { db } from '../firebase';
import { collection, addDoc, doc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { TicketPlus, Key, Trash2, Clipboard, CheckCircle, Clock, Layers } from 'lucide-react';
import { safeAddDoc, safeDeleteDoc } from '../firebase';

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

  // Real-Time Read-Only Listener for invites collection
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'invites'),
      (snap) => {
        const list: Invite[] = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as Invite);
        });
        if (setInvites) {
          setInvites(list);
        }
      },
      (err) => {
        console.warn('Error in InviteManager snapshot listener:', err);
      }
    );
    return () => unsub();
  }, [setInvites]);

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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-mono text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Target Workspace</th>
                  <th className="py-3 px-4">Access Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Redeemed By</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {displayedInvites.map((invite) => {
                  const isClaimed = Boolean(invite.used || invite.is_used);
                  const claimedUser = invite.claimed_by_email || invite.usedBy || (invite.claimed_by_uid ? `User (${invite.claimed_by_uid.slice(0, 6)})` : '');

                  return (
                    <tr key={invite.id || invite.code} className="hover:bg-slate-50/50 transition duration-100">
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800 tracking-wider flex items-center space-x-2">
                        <span>{invite.code}</span>
                        <button
                          onClick={() => invite.id && copyToClipboard(invite.code, invite.id)}
                          className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded transition"
                          title="Copy Code"
                        >
                          {copiedId === invite.id ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <Clipboard className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700">
                        <span className="inline-flex items-center space-x-1 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px]">
                          <Layers className="w-3 h-3 text-blue-600" />
                          <span>{invite.workspaceName || 'Main Workspace'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs bg-slate-50 text-slate-600 px-2.5 py-0.5 rounded-full border border-slate-200 font-semibold">
                          {invite.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {isClaimed ? (
                          <span className="inline-flex items-center space-x-1.5 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                            <span>Claimed{claimedUser ? ` by ${claimedUser}` : ''}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1.5 text-xs text-blue-600 font-semibold bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 animate-pulse">
                            <Clock className="w-3.5 h-3.5 text-blue-500" />
                            <span>Active / Unused</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-slate-500 truncate max-w-[150px]">
                        {claimedUser || '—'}
                      </td>
                      <td className="py-3 px-4">
                        {invite.id && (
                          <button
                            onClick={() => deleteInvite(invite.id!)}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition"
                            title="Revoke Token"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
