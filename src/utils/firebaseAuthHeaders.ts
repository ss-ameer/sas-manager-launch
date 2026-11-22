import { auth } from '../firebase';

/**
 * Returns an `Authorization: Bearer <idToken>` header for the currently signed-in
 * Firebase user, or an empty object when no user is signed in.
 */
export async function getFirebaseAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const currentUser = auth?.currentUser;
    if (!currentUser) return {};
    const idToken = await currentUser.getIdToken(forceRefresh);
    if (!idToken) return {};
    return { Authorization: `Bearer ${idToken}` };
  } catch (err) {
    console.warn('[firebaseAuthHeaders] Failed to obtain Firebase ID token:', err);
    return {};
  }
}
