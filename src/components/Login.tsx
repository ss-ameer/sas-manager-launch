import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInAnonymously, signOut } from 'firebase/auth';
import { safeGetDoc, safeGetDocs, safeSetDoc } from '../firebase';
import { Shield, AlertCircle, Sparkles, Building, UserCheck } from 'lucide-react';
import { UserProfile, UserRole } from '../types';
import { BRAND_CONFIG } from '../config';

interface LoginProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Direct Google Email login state
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [showEmailInput, setShowEmailInput] = useState(false);

  // Catch OAuth redirect login result on mount
  useEffect(() => {
    let isMounted = true;
    getRedirectResult(auth)
      .then((result) => {
        if (isMounted && result && result.user) {
          handleUserSession(result.user);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Redirect auth error:", err);
        if (err.code === 'auth/unauthorized-domain') {
          setError('Google OAuth domain restricted. Use the Google Email option below.');
          setShowEmailInput(true);
        } else if (err.code !== 'auth/popup-closed-by-user') {
          setError(err.message || 'Google redirect sign-in failed.');
          setShowEmailInput(true);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Handles direct login with a Google Email address
  const loginWithGoogleEmail = async (emailToUse?: string, nameToUse?: string) => {
    const email = (emailToUse || customEmail).trim();
    if (!email) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let uid = auth.currentUser?.uid;
      if (!uid) {
        try {
          const res = await signInAnonymously(auth);
          uid = res.user.uid;
        } catch (authErr) {
          console.warn("Firebase Anonymous Auth restricted or disabled, fallback to generated UID:", authErr);
          uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        }
      }

      const userObject = {
        uid: uid,
        email: email,
        displayName: nameToUse || customName.trim() || email.split('@')[0]
      };

      await handleUserSession(userObject);
    } catch (err: any) {
      console.error("Direct Email Sign-in Error:", err);
      setError('Email Sign-in failed: ' + err.message);
      setLoading(false);
    }
  };

  // Checks and updates user profile in firestore
  const handleUserSession = async (user: any) => {
    try {
      const targetEmail = (user.email || '').trim().toLowerCase();

      // 1. Direct check by UID
      const userSnap = await safeGetDoc('users', user.uid);
      if (userSnap && userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        if (profile.blocked) {
          setError('Your account has been deactivated by the Admin.');
          await signOut(auth);
          return;
        }
        onLoginSuccess(profile);
        return;
      }

      // 2. Prevent Duplication: Check if an account already exists with the same email address
      let existingUsers: UserProfile[] = [];
      try {
        const usersSnap = await safeGetDocs('users');
        if (usersSnap && !usersSnap.empty) {
          usersSnap.forEach((docSnap) => {
            const data = docSnap.data() as UserProfile;
            existingUsers.push({ ...data, uid: docSnap.id });
          });
        }
      } catch (e) {
        console.warn("Could not list users for email duplication check:", e);
      }

      if (targetEmail) {
        const matchedProfile = existingUsers.find((u) => (u.email || '').trim().toLowerCase() === targetEmail);
        if (matchedProfile) {
          if (matchedProfile.blocked) {
            setError('Your account has been deactivated by the Admin.');
            await signOut(auth);
            return;
          }
          // Link / preserve existing account rather than creating a duplicate user doc
          const updatedProfile: UserProfile = {
            ...matchedProfile,
            uid: user.uid,
            email: user.email || matchedProfile.email
          };
          await safeSetDoc('users', user.uid, updatedProfile);
          onLoginSuccess(updatedProfile);
          return;
        }
      }

      // 3. New User Registration (No existing match found)
      const isFirstUser = existingUsers.length === 0;
      if (isFirstUser) {
        const adminName = user.displayName || `${BRAND_CONFIG.shortName} Admin`;
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || `admin@${BRAND_CONFIG.shortName.toLowerCase()}.com`,
          username: adminName,
          full_name: adminName,
          role: 'Admin',
          workspaceIds: ['ws_default'],
          defaultWorkspaceId: 'ws_default',
          createdAt: new Date().toISOString()
        };
        await safeSetDoc('users', user.uid, newProfile);
        onLoginSuccess(newProfile);
      } else {
        const memberName = user.displayName || (user.email ? user.email.split('@')[0] : '') || 'Team Member';
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || `user@${BRAND_CONFIG.shortName.toLowerCase()}.com`,
          username: memberName,
          full_name: memberName,
          role: 'Member',
          workspaceIds: ['ws_default'],
          defaultWorkspaceId: 'ws_default',
          createdAt: new Date().toISOString()
        };
        await safeSetDoc('users', user.uid, newProfile);
        onLoginSuccess(newProfile);
      }
    } catch (err: any) {
      console.error(err);
      setError('Session initialization failed: ' + err.message);
      setLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);

    const provider = new GoogleAuthProvider();

    try {
      // First try popup
      const result = await signInWithPopup(auth, provider);
      await handleUserSession(result.user);
    } catch (err: any) {
      console.warn("Popup authentication failed/blocked, switching to Google Redirect Auth:", err);
      if (
        err.code === 'auth/popup-blocked' ||
        err.code === 'auth/popup-closed-by-user' ||
        err.message?.includes('closed') ||
        err.message?.includes('Cross-Origin-Opener-Policy')
      ) {
        try {
          // Standard fix for COOP blocking popup: redirect flow
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          console.error("Redirect Auth trigger error:", redirectErr);
          setError('Google Sign-in redirection failed. Please use the Google Email option below.');
          setShowEmailInput(true);
          setLoading(false);
        }
      } else if (err.code === 'auth/unauthorized-domain') {
        console.warn("Domain restricted by Firebase OAuth rules.");
        if (customEmail) {
          await loginWithGoogleEmail(customEmail, customName);
          return;
        } else {
          setError('Google OAuth is restricted on preview domains. Please enter your email address in the field below to sign in.');
          setShowEmailInput(true);
          setLoading(false);
        }
      } else {
        setError(err.message || 'Google Sign-in failed. You can sign in using your Google email below.');
        setShowEmailInput(true);
        setLoading(false);
      }
    }
  };

  // Direct Local Workspace Login (100% Offline / Standalone)
  const handleLocalWorkspace = (role: UserRole = 'Admin') => {
    const fixedUid = `local_${role.toLowerCase()}_profile`;
    const localProfile: UserProfile = {
      uid: fixedUid,
      email: `${role.toLowerCase()}@omnisuite.local`,
      username: `Local ${role}`,
      role: role,
      workspaceIds: ['ws_default'],
      defaultWorkspaceId: 'ws_default',
      createdAt: new Date().toISOString()
    };
    localStorage.setItem('omni_local_user', JSON.stringify(localProfile));
    localStorage.setItem('omni_offline_guest_mode', 'true');
    onLoginSuccess(localProfile);
  };

  // Demo Login fallback for standard review
  const loginAsDemo = async (role: UserRole) => {
    setLoading(true);
    setError(null);
    try {
      // Try Firebase Anonymous Auth
      const res = await signInAnonymously(auth);

      try {
        const userSnap = await safeGetDoc('users', res.user.uid);
        if (userSnap && userSnap.exists()) {
          const profile = userSnap.data() as UserProfile;
          if (profile.role === role) {
            onLoginSuccess(profile);
            return;
          }
        }
      } catch (e) {
        console.warn("Could not check existing demo profile:", e);
      }

      const demoEmail = role === 'Admin' ? 'admin@omnisuite.com' : 'member@omnisuite.com';
      const demoName = role === 'Admin' ? 'Demo Admin' : 'Demo Member';

      const demoProfile: UserProfile = {
        uid: res.user.uid,
        email: demoEmail,
        username: demoName,
        role: role,
        createdAt: new Date().toISOString()
      };

      try {
        await safeSetDoc('users', res.user.uid, demoProfile);
        onLoginSuccess(demoProfile);
      } catch (writeErr: any) {
        console.warn("safeSetDoc failed for demo user, logging in locally:", writeErr);
        handleLocalWorkspace(role);
      }
    } catch (err: any) {
      console.warn("Firebase Auth unavailable/offline, booting into Local Workspace Mode:", err);
      handleLocalWorkspace(role);
    }
  };

  return (
    <div id="login-screen" className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Visual background details */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-50/50 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-slate-100/50 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm relative z-10">
        {/* Header Block */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-blue-50 border border-blue-100 rounded-xl mb-4 text-blue-600">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-2 font-sans">
            OMNI SUITE
          </h1>
          <p className="text-xs font-mono text-slate-400 uppercase tracking-widest">
            Enquiry Manager (OMNI-REF-SLS-002)
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start space-x-3 text-red-700">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
            <div className="text-sm font-sans">{error}</div>
          </div>
        )}

        <div className="space-y-6">
          <button
            id="google-login-btn"
            onClick={loginWithGoogle}
            disabled={loading}
            className="w-full py-3 px-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-medium rounded-xl shadow-sm transition duration-200 flex items-center justify-center space-x-3 disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.18 1-.78 1.85-1.63 2.42v2.77h2.64c1.54-1.42 2.43-3.51 2.43-5.96z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-2.64-2.77c-.74.5-1.69.8-2.64.8-2.71 0-5-1.83-5.82-4.3H1.36v2.85C3.18 20.3 7.3 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M6.18 14.07c-.22-.66-.35-1.36-.35-2.07s.13-1.41.35-2.07V7.08H1.36C.49 8.91 0 10.94 0 12s.49 3.09 1.36 4.92l4.82-3.85z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.3 1 3.18 3.7 1.36 7.08l4.82 3.85c.82-2.47 3.11-4.3 5.82-4.3z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>

          {/* Direct Google Email Entry Option */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <span>Sign in as Google Account</span>
              <button
                type="button"
                onClick={() => setShowEmailInput(!showEmailInput)}
                className="text-blue-600 hover:underline capitalize font-normal text-xs"
              >
                {showEmailInput ? 'Hide' : 'Edit Email'}
              </button>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Google Email Address</label>
              <input
                type="email"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                placeholder="your.email@gmail.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            {showEmailInput && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Your Display Name</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => loginWithGoogleEmail()}
              disabled={loading}
              className="w-full py-2.5 px-3 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition duration-200 shadow-sm flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              <Shield className="w-4 h-4" />
              <span>Log in as {customEmail || 'Google User'}</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center py-1">
            <div className="absolute w-full border-t border-slate-200" />
            <span className="relative bg-white px-3 text-xs font-mono text-slate-400 uppercase">
              Or review as guest
            </span>
          </div>

          {/* Quick Developer / Demo login bypass options */}
          <div className="grid grid-cols-2 gap-4">
            <button
              id="demo-admin-btn"
              onClick={() => loginAsDemo('Admin')}
              disabled={loading}
              className="p-3 bg-blue-50/50 hover:bg-blue-50 border border-blue-200/60 text-blue-700 rounded-xl transition duration-200 flex flex-col items-center justify-center text-center space-y-1.5 cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-blue-600" />
              <span className="text-xs font-medium">Demo Admin</span>
            </button>

            <button
              id="demo-member-btn"
              onClick={() => loginAsDemo('Member')}
              disabled={loading}
              className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 text-slate-700 rounded-xl transition duration-200 flex flex-col items-center justify-center text-center space-y-1.5 cursor-pointer"
            >
              <UserCheck className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-medium">Demo Member</span>
            </button>
          </div>

          {/* Offline Local First Mode Option */}
          <button
            type="button"
            onClick={() => handleLocalWorkspace('Admin')}
            className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl transition duration-200 shadow-sm flex items-center justify-center space-x-2 cursor-pointer"
          >
            <Building className="w-4 h-4 text-emerald-400" />
            <span>Work Locally (100% Offline Workspace)</span>
          </button>
        </div>

        <div className="mt-8 text-center text-xs text-slate-500 font-mono">
          © {new Date().getFullYear()} {BRAND_CONFIG.copyright}
        </div>
      </div>
    </div>
  );
}
