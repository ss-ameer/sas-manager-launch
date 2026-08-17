import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, Salesperson, Workspace } from '../types';
import { safeUpdateDoc, safeSetDoc, safeAddDoc, db, auth } from '../firebase';
import { writeBatch, collection, query, where, getDocs, doc, arrayRemove } from 'firebase/firestore';
import { deleteUser, signOut } from 'firebase/auth';
import { recordAuditLog } from '../utils/auditLogger';
import { getUserWorkspaceRole, isAdmin } from '../utils/permissions';
import {
  categorizeUserWorkspacesForDeletion,
  executeFinalCascadeDeleteAndScrub
} from '../services/AccountDeletionService';
import { User, Check, X, Shield, Users2, AlertCircle, Trash2 } from 'lucide-react';
import WorkspaceHandoverWizardModal, {
  Category2WorkspaceInfo,
  HandoverResolution
} from './WorkspaceHandoverWizardModal';

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  targetUser?: UserProfile | null; // If editing someone else (Admin feature)
  onProfileUpdated?: (updated: UserProfile) => void;
  isMandatoryOnboarding?: boolean;
  salespersons?: Salesperson[];
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  activeWorkspaceId?: string;
}

export default function UserProfileModal({
  isOpen,
  onClose,
  currentUser,
  targetUser,
  onProfileUpdated,
  isMandatoryOnboarding = false,
  salespersons = [],
  setSalespersons,
  activeWorkspaceId
}: UserProfileModalProps) {
  const effectiveUser = targetUser || currentUser;
  const isAdmin = currentUser.role === 'Admin';

  const [fullName, setFullName] = useState(effectiveUser.full_name || '');
  const [email, setEmail] = useState(effectiveUser.email || '');
  const [role, setRole] = useState<UserRole>(effectiveUser.role || 'Member');
  const [initials, setInitials] = useState(effectiveUser.initials || '');
  const [addToTeamRoster, setAddToTeamRoster] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Handover Wizard States
  const [isHandoverWizardOpen, setIsHandoverWizardOpen] = useState(false);
  const [category1WsIds, setCategory1WsIds] = useState<string[]>([]);
  const [category2WsList, setCategory2WsList] = useState<Category2WorkspaceInfo[]>([]);
  const [nonAdminExitWsList, setNonAdminExitWsList] = useState<Workspace[]>([]);

  const handleDeleteAccount = async () => {
    const currentUserAuth = auth.currentUser;
    if (!currentUserAuth && !currentUser.uid) {
      setErrorMsg('No active authenticated user found.');
      return;
    }

    setIsDeletingAccount(true);
    setErrorMsg('');

    try {
      const userUid = currentUser.uid || currentUserAuth?.uid;

      if (!userUid || userUid.startsWith('local_')) {
        localStorage.clear();
        window.location.href = '/';
        return;
      }

      const { soleAdminNukeIds, adminMultiMemberList, nonAdminExits } =
        await categorizeUserWorkspacesForDeletion(currentUser);

      setNonAdminExitWsList(nonAdminExits);
      setCategory1WsIds(soleAdminNukeIds);
      setCategory2WsList(adminMultiMemberList);

      if (adminMultiMemberList.length > 0) {
        setIsHandoverWizardOpen(true);
        setShowDeleteConfirm(false);
        setIsDeletingAccount(false);
      } else {
        await executeFinalCascadeDeleteAndScrub(
          currentUser,
          soleAdminNukeIds,
          {},
          adminMultiMemberList,
          nonAdminExits
        );
      }
    } catch (err: any) {
      console.error('Failed to categorize workspaces for deletion:', err);
      setErrorMsg('Failed to process account deletion: ' + (err.message || String(err)));
      setIsDeletingAccount(false);
    }
  };

  const handleConfirmHandoverAndDelete = async (
    resolutions: Record<string, HandoverResolution>
  ) => {
    setIsDeletingAccount(true);
    setErrorMsg('');

    try {
      await executeFinalCascadeDeleteAndScrub(
        currentUser,
        category1WsIds,
        resolutions,
        category2WsList,
        nonAdminExitWsList
      );
    } catch (err: any) {
      console.error('Failed to complete cascade deletion & scrub:', err);
      if (err.code === 'auth/requires-recent-login') {
        setErrorMsg('Security Lock: Firebase requires a fresh login to delete an account. Please sign out, sign back in, and click delete again.');
      } else {
        setErrorMsg('Failed to complete account deletion: ' + (err.message || String(err)));
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  useEffect(() => {
    const userToEdit = targetUser || currentUser;
    setFullName(userToEdit.full_name || '');
    setEmail(userToEdit.email || '');
    setRole(userToEdit.role || 'Member');
    setInitials(userToEdit.initials || deriveInitials(userToEdit.full_name || userToEdit.username));
  }, [targetUser, currentUser, isOpen]);

  const deriveInitials = (nameStr?: string | null) => {
    if (!nameStr || typeof nameStr !== 'string') return 'OU';
    const trimmed = nameStr.trim();
    if (!trimmed) return 'OU';
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[0][0] && parts[parts.length - 1][0]) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (trimmed || 'OU').substring(0, 2).toUpperCase();
  };

  const handleNameChange = (val: string) => {
    setFullName(val);
    if (!initials || initials === deriveInitials(fullName)) {
      setInitials(deriveInitials(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }
    if (!email.trim()) {
      setErrorMsg('Email Address is required.');
      return;
    }
    if (!initials.trim()) {
      setErrorMsg('Initials are required.');
      return;
    }

    setIsSaving(true);
    setErrorMsg('');

    try {
      const updatedProfile: Partial<UserProfile> = {
        full_name: fullName.trim(),
        email: email.trim(),
        initials: initials.trim().toUpperCase(),
        role: (isAdmin && targetUser && targetUser.uid !== currentUser.uid) ? role : (effectiveUser.role || 'Member'),
        profileCompleted: true,
      };

      const docId = effectiveUser.uid || effectiveUser.username;
      
      try {
        await safeUpdateDoc('users', docId, updatedProfile);
      } catch (err) {
        // Fallback setDoc
        await safeSetDoc('users', docId, {
          ...effectiveUser,
          ...updatedProfile
        });
      }

      await recordAuditLog({
        document_id: docId,
        entity_type: 'user',
        entity_title: fullName,
        action: 'update',
        user: currentUser,
        details: `${isMandatoryOnboarding ? 'Completed onboarding profile' : 'Updated profile'} for ${fullName} (${initials})`
      });

      const fullUpdated: UserProfile = {
        ...effectiveUser,
        ...updatedProfile
      };

      // Instantly persist updated profile in local storage & cache to avoid onboarding loop on refresh
      try {
        localStorage.setItem('omni_local_user', JSON.stringify(fullUpdated));
        if (fullUpdated.uid) {
          localStorage.setItem(`omni_user_${fullUpdated.uid}`, JSON.stringify(fullUpdated));
        }
      } catch (cacheErr) {
        console.warn("Could not cache updated profile:", cacheErr);
      }

      // Synchronize with Team Roster (salespersons collection) if requested
      if (addToTeamRoster && setSalespersons) {
        if (!activeWorkspaceId) {
          throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
        }
        const cleanInitials = initials.trim().toUpperCase();
        const cleanName = fullName.trim();
        const cleanEmail = email.trim();

        const existingSp = salespersons.find(
          (s) =>
            s.initials?.toUpperCase() === cleanInitials ||
            (s.email && s.email.toLowerCase() === cleanEmail.toLowerCase()) ||
            s.full_name.toLowerCase() === cleanName.toLowerCase()
        );

        const spData: Omit<Salesperson, 'id'> = {
          workspace_id: activeWorkspaceId,
          initials: cleanInitials,
          full_name: cleanName,
          role: 'Sales Representative',
          email: cleanEmail,
        };

        if (existingSp && existingSp.id) {
          await safeUpdateDoc('salespersons', existingSp.id, spData);
          setSalespersons((prev) =>
            prev.map((s) => (s.id === existingSp.id ? { ...existingSp, ...spData } : s))
          );
        } else {
          const res = await safeAddDoc('salespersons', spData);
          const newSpId = res?.id || ('sp_' + Date.now());
          const newSpObj: Salesperson = { id: newSpId, ...spData };
          setSalespersons((prev) => [newSpObj, ...prev.filter((s) => s.id !== newSpId)]);
        }
      }

      if (onProfileUpdated) {
        onProfileUpdated(fullUpdated);
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150 font-sans">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {isMandatoryOnboarding ? 'Welcome! Complete Your Required Profile' : 'Edit User Profile'}
              </h2>
              <p className="text-xs text-slate-500">
                {isMandatoryOnboarding
                  ? 'Please confirm your details to set up your team workspace initials'
                  : `Managing profile for ${effectiveUser.username}`}
              </p>
            </div>
          </div>
          {!isMandatoryOnboarding && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="py-4 space-y-4">
          {/* Full Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-blue-500 font-semibold"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Email Address <span className="text-rose-500">*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. john@company.com"
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-blue-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Initials */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Workspace Initials <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                maxLength={4}
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                placeholder="e.g. JD"
                className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-blue-500 font-mono font-bold uppercase"
              />
              <p className="text-[10px] text-slate-400 mt-1">Used on call logs & assignment tags</p>
            </div>

            {/* Role */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Workspace Role
              </label>
              {isAdmin && !isMandatoryOnboarding && targetUser ? (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-blue-500 font-semibold bg-white"
                >
                  <option value="Admin">Admin (Full Access)</option>
                  <option value="Member">Member (Standard Operator)</option>
                  <option value="Viewer">Viewer (Read Only)</option>
                </select>
              ) : (
                <div className="px-3.5 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 flex items-center space-x-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  <span>{effectiveUser.role || 'Member'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sync to Team Roster Checkbox */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start space-x-3 mt-2">
            <input
              type="checkbox"
              id="addToTeamRosterCheckbox"
              checked={addToTeamRoster}
              onChange={(e) => setAddToTeamRoster(e.target.checked)}
              className="mt-0.5 w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
            />
            <label htmlFor="addToTeamRosterCheckbox" className="text-xs text-slate-700 cursor-pointer select-none">
              <span className="font-bold text-slate-900 block flex items-center space-x-1">
                <Users2 className="w-3.5 h-3.5 text-blue-600" />
                <span>Sync to Team Member Roster</span>
              </span>
              Automatically list yourself on the sales team roster so enquiries, quotes, and call logs can be assigned to you ({initials || 'Initials'}).
            </label>
          </div>

          {/* Delete Account Confirmation Dialog */}
          {showDeleteConfirm && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 mt-2">
              <div className="flex items-start space-x-2 text-rose-900">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold">Permanently Delete Account</h4>
                  <p className="text-[11px] text-rose-700 mt-0.5">
                    This will permanently scrub your profile, workspace memberships, and team roster listings. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingAccount ? 'Scrubbing...' : 'Confirm Account Deletion'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
            {!isMandatoryOnboarding && (!targetUser || targetUser.uid === currentUser.uid) ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
                disabled={isSaving || isDeletingAccount}
                className="px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center space-x-3">
              {!isMandatoryOnboarding && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={isSaving || isDeletingAccount}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>{isSaving ? 'Saving Profile...' : 'Save Profile'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Workspace Ownership & Account Deletion Wizard */}
      <WorkspaceHandoverWizardModal
        isOpen={isHandoverWizardOpen}
        onClose={() => setIsHandoverWizardOpen(false)}
        currentUser={currentUser}
        category2Workspaces={category2WsList}
        category1WorkspaceIds={category1WsIds}
        onConfirmHandoverAndDelete={async (resolutions) => {
          await handleConfirmHandoverAndDelete(resolutions);
        }}
      />
    </div>
  );
}
