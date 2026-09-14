import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
import { where, limit } from 'firebase/firestore';
import { safeGetDoc, safeGetDocs, safeSetDoc } from '../firebase';
import { Shield, AlertCircle, Loader2, Lock } from 'lucide-react';
import { UserProfile } from '../types';
import { BRAND_CONFIG } from '../config';

interface LoginProps {
  onLoginSuccess: (profile: UserProfile) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Catch OAuth redirect login result on mount (for browsers blocking popups)
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
        // User closed the popup/cancelled the prompt - do not display loud error banner
        if (
          err.code === 'auth/popup-closed-by-user' ||
          err.code === 'auth/cancelled-popup-request' ||
          err.message?.includes('closed-by-user')
        ) {
          return;
        }
        console.warn('Redirect auth notification:', err);
        setError(err.message || 'Google sign-in was not completed.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Checks and persists user profile in Firestore following successful Google OAuth
  const handleUserSession = async (firebaseUser: any) => {
    try {
      const uid = firebaseUser.uid;
      const email = (firebaseUser.email || '').trim().toLowerCase();
      const displayName = firebaseUser.displayName || '';
      const photoURL = firebaseUser.photoURL || '';

      // 1. Direct check by immutable UID
      const userSnap = await safeGetDoc('users', uid);
      if (userSnap && userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        if (profile.blocked) {
          setError('Your account has been deactivated by an Administrator.');
          await signOut(auth);
          setLoading(false);
          return;
        }
        // Update avatar / display name if present
        const updatedProfile: UserProfile = {
          ...profile,
          email: email || profile.email,
          full_name: profile.full_name || displayName,
          displayName: profile.displayName || displayName,
          photoURL: photoURL || profile.photoURL,
          avatarUrl: photoURL || profile.avatarUrl
        };
        await safeSetDoc('users', uid, updatedProfile, { merge: true });
        onLoginSuccess(updatedProfile);
        return;
      }

      // 2. Prevent Duplication: Check if an account already exists with the same verified email
      let matchedProfile: UserProfile | null = null;
      if (email) {
        try {
          const usersSnap = await safeGetDocs('users', where('email', '==', email), limit(1));
          if (usersSnap && !usersSnap.empty) {
            const firstDoc = usersSnap.docs[0];
            matchedProfile = { ...(firstDoc.data() as UserProfile), uid: firstDoc.id };
          }
        } catch (e) {
          console.warn('Could not query user records by email:', e);
        }
      }

      if (matchedProfile) {
        if (matchedProfile.blocked) {
          setError('Your account has been deactivated by an Administrator.');
          await signOut(auth);
          setLoading(false);
          return;
        }
        const updatedProfile: UserProfile = {
          ...matchedProfile,
          uid: uid,
          email: email || matchedProfile.email,
          full_name: matchedProfile.full_name || displayName,
          displayName: matchedProfile.displayName || displayName,
          photoURL: photoURL || matchedProfile.photoURL,
          avatarUrl: photoURL || matchedProfile.avatarUrl
        };
        await safeSetDoc('users', uid, updatedProfile);
        onLoginSuccess(updatedProfile);
        return;
      }

      // 3. New User Registration
      let isFirstUser = false;
      try {
        const anyUserSnap = await safeGetDocs('users', limit(1));
        isFirstUser = !anyUserSnap || anyUserSnap.empty;
      } catch (e) {
        console.warn('Could not query user collection count:', e);
      }

      const assignedName = displayName || (email ? email.split('@')[0] : 'Team Member');
      const newProfile: UserProfile = {
        uid: uid,
        email: email,
        username: assignedName,
        full_name: assignedName,
        displayName: assignedName,
        photoURL: photoURL,
        avatarUrl: photoURL,
        role: isFirstUser ? 'Admin' : 'Member',
        workspaceIds: ['ws_default'],
        defaultWorkspaceId: 'ws_default',
        createdAt: new Date().toISOString()
      };
      await safeSetDoc('users', uid, newProfile);
      onLoginSuccess(newProfile);
    } catch (err: any) {
      console.error('Session handling error:', err);
      setError('Session initialization failed: ' + (err.message || 'Unknown error'));
      setLoading(false);
    }
  };

  // Primary Google Sign-In Trigger
  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      if (result && result.user) {
        await handleUserSession(result.user);
      }
    } catch (err: any) {
      // 1. Standard user cancellation: ignore gracefully without red error alerts
      if (
        err.code === 'auth/popup-closed-by-user' ||
        err.code === 'auth/cancelled-popup-request' ||
        err.message?.includes('closed-by-user')
      ) {
        setLoading(false);
        return;
      }

      console.warn('Google Sign-In caught error:', err);

      // 2. Popup blocked or COOP environment: fallback to redirect flow
      if (
        err.code === 'auth/popup-blocked' ||
        err.message?.includes('Cross-Origin-Opener-Policy')
      ) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr: any) {
          console.error('Redirect trigger failed:', redirectErr);
          setError('Browser popup was blocked. Please enable popups or try again.');
          setLoading(false);
          return;
        }
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(
          'This domain is not authorized in Firebase Authentication. Please register this domain in Firebase Console under Authorized Domains.'
        );
      } else {
        setError(err.message || 'Google authentication could not be completed. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div
      id="login-screen"
      className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
    >
      {/* Subtle architectural ambient background */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-600/5 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-2xl p-8 sm:p-10 shadow-2xl relative z-10">
        {/* SAS Manager Logo & Branding Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-900 text-white rounded-2xl shadow-sm mb-4 border border-slate-800">
            <Shield className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-sans">
            SAS Manager
          </h1>
          <p className="text-xs text-slate-500 font-sans mt-1.5 leading-relaxed">
            Enquiry & Sales Operations Management
          </p>
        </div>

        {/* Error Alert Banner */}
        {error && (
          <div
            id="login-error-banner"
            className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start space-x-3 text-red-800"
          >
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div className="text-xs sm:text-sm font-sans leading-relaxed flex-1">
              {error}
            </div>
          </div>
        )}

        {/* Sole Authentication Action: Sign in with Google */}
        <div className="space-y-4">
          <button
            id="google-login-btn"
            type="button"
            onClick={loginWithGoogle}
            disabled={loading}
            className="w-full py-3.5 px-5 bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 hover:border-slate-400 text-slate-800 font-semibold text-sm rounded-xl shadow-sm transition-all duration-150 flex items-center justify-center space-x-3 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                <span>Connecting to Google...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
              </>
            )}
          </button>

          {/* Security & Authentication Protocol Note */}
          <div className="pt-2 flex items-center justify-center space-x-1.5 text-slate-400 text-xs font-sans">
            <Lock className="w-3.5 h-3.5" />
            <span>Secured via Google Identity OAuth 2.0</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-[11px] text-slate-400 font-sans">
          © {new Date().getFullYear()} {BRAND_CONFIG.appName}. All rights reserved.
        </div>
      </div>
    </div>
  );
}
