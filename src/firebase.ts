import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import {
  initializeFirestore,
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  QueryConstraint
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { syncEngine } from './services/SyncEngine';

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true
}, firebaseConfig.firestoreDatabaseId || '(default)'); /* CRITICAL: The app will break without this line */
export const auth = getAuth();
export const storage = getStorage(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isQuotaError = errMsg.includes('Quota limit exceeded') || errMsg.includes('quota') || errMsg.includes('resource-exhausted') || (error as any)?.code === 'resource-exhausted';
  const isUnavailable = errMsg.includes('unavailable') || errMsg.includes('Could not reach Cloud Firestore backend') || errMsg.includes('Connection failed') || (error as any)?.code === 'unavailable';

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };

  if (isQuotaError) {
    console.warn(`[Firestore Quota Exceeded - Operating in High-Speed Local Storage Mode] Operation: ${operationType}, Path: ${path}`);
  } else if (isUnavailable) {
    console.warn(`[Firestore Network Offline / Reconnecting - Operating in High-Speed Local Storage Mode] Operation: ${operationType}, Path: ${path}`);
  } else {
    console.warn('Firestore Operation Warning: ', JSON.stringify(errInfo));
  }

  return errInfo;
}

function applySimulations() {
  const isQuota = typeof window !== 'undefined' && localStorage.getItem('omni_sim_firebase_quota') === 'true';
  const isOffline = typeof window !== 'undefined' && localStorage.getItem('omni_sim_offline_mode') === 'true';
  const latency = typeof window !== 'undefined' ? parseInt(localStorage.getItem('omni_sim_latency_ms') || '0', 10) : 0;
  return { isQuota, isOffline, latency };
}

// Wrapped safe helper methods to easily ensure error reporting
export async function safeGetDoc(collectionPath: string, docId: string) {
  const path = `${collectionPath}/${docId}`;
  const { isQuota, isOffline, latency } = applySimulations();
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  if (isQuota || isOffline) {
    handleFirestoreError(new Error(`[SIMULATION] Firestore ${isQuota ? 'Quota Limit Exceeded' : 'Forced Offline'}`), OperationType.GET, path);
    return null;
  }

  try {
    const docRef = doc(db, collectionPath, docId);
    return await getDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function safeGetDocs(collectionPath: string, ...constraints: QueryConstraint[]) {
  const { isQuota, isOffline, latency } = applySimulations();
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  if (isQuota || isOffline) {
    handleFirestoreError(new Error(`[SIMULATION] Firestore ${isQuota ? 'Quota Limit Exceeded' : 'Forced Offline'}`), OperationType.LIST, collectionPath);
    return null;
  }

  try {
    const colRef = collection(db, collectionPath);
    const q = query(colRef, ...constraints);
    return await getDocs(q);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
    return null;
  }
}

export function cleanUndefined(obj: any): any {
  if (obj === undefined) {
    return null;
  }
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    result[key] = cleanUndefined(obj[key]);
  }
  return result;
}

export async function safeAddDoc(collectionPath: string, data: any) {
  const { isQuota, isOffline, latency } = applySimulations();
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  const localId = 'local_' + Date.now();
  const cleanedData = cleanUndefined(data);

  if (isQuota || isOffline) {
    handleFirestoreError(new Error(`[SIMULATION] Firestore ${isQuota ? 'Quota Limit Exceeded' : 'Forced Offline'}`), OperationType.CREATE, collectionPath);
    await syncEngine.enqueue(collectionPath, 'set', localId, cleanedData);
    return { id: localId } as any;
  }

  try {
    const colRef = collection(db, collectionPath);
    return await addDoc(colRef, cleanedData);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, collectionPath);
    await syncEngine.enqueue(collectionPath, 'set', localId, cleanedData);
    return { id: localId } as any;
  }
}

export async function safeSetDoc(collectionPath: string, docId: string, data: any, options: { merge?: boolean } = { merge: true }) {
  if (!docId || docId === 'undefined' || typeof docId !== 'string' || docId.trim() === '') {
    console.warn(`[safeSetDoc] Aborted write: invalid or undefined docId provided for collection '${collectionPath}'.`);
    return null;
  }
  const cleanId = docId.trim();
  const path = `${collectionPath}/${cleanId}`;
  const { isQuota, isOffline, latency } = applySimulations();
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  const cleanedData = cleanUndefined(data);

  if (isQuota || isOffline) {
    handleFirestoreError(new Error(`[SIMULATION] Firestore ${isQuota ? 'Quota Limit Exceeded' : 'Forced Offline'}`), OperationType.WRITE, path);
    await syncEngine.enqueue(collectionPath, 'set', docId, cleanedData);
    return null;
  }

  try {
    const docRef = doc(db, collectionPath, docId);
    return await setDoc(docRef, cleanedData, options);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    await syncEngine.enqueue(collectionPath, 'set', docId, cleanedData);
    return null;
  }
}

export async function safeUpdateDoc(collectionPath: string, docId: string, data: any) {
  if (!docId || docId === 'undefined' || typeof docId !== 'string' || docId.trim() === '') {
    console.warn(`[safeUpdateDoc] Aborted update: invalid or undefined docId provided for collection '${collectionPath}'.`);
    return null;
  }
  const cleanId = docId.trim();
  const path = `${collectionPath}/${cleanId}`;
  const { isQuota, isOffline, latency } = applySimulations();
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  const cleanedData = cleanUndefined(data);

  if (isQuota || isOffline) {
    handleFirestoreError(new Error(`[SIMULATION] Firestore ${isQuota ? 'Quota Limit Exceeded' : 'Forced Offline'}`), OperationType.UPDATE, path);
    await syncEngine.enqueue(collectionPath, 'update', docId, cleanedData);
    return null;
  }

  try {
    const docRef = doc(db, collectionPath, docId);
    return await updateDoc(docRef, cleanedData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    try {
      const docRef = doc(db, collectionPath, docId);
      return await setDoc(docRef, cleanedData, { merge: true });
    } catch (fallbackErr) {
      await syncEngine.enqueue(collectionPath, 'update', docId, cleanedData);
      return null;
    }
  }
}

export async function safeDeleteDoc(collectionPath: string, docId: string): Promise<boolean> {
  if (!docId || typeof docId !== 'string' || docId.trim() === '') {
    console.error(`[safeDeleteDoc Error] Missing or invalid docId for collection '${collectionPath}':`, docId);
    return false;
  }
  const cleanId = docId.trim();
  const path = `${collectionPath}/${cleanId}`;
  console.log(`[safeDeleteDoc] Initiating delete for document: ${path}`);

  const { isQuota, isOffline, latency } = applySimulations();
  if (latency > 0) await new Promise((r) => setTimeout(r, latency));

  if (isQuota || isOffline) {
    handleFirestoreError(new Error(`[SIMULATION] Firestore ${isQuota ? 'Quota Limit Exceeded' : 'Forced Offline'}`), OperationType.DELETE, path);
    console.warn(`[safeDeleteDoc] Operating in offline/quota simulation mode for ${path}. Enqueued local delete.`);
    await syncEngine.enqueue(collectionPath, 'delete', cleanId);
    return true;
  }

  try {
    const docRef = doc(db, collectionPath, cleanId);
    await deleteDoc(docRef);
    console.log(`[safeDeleteDoc Success] Successfully deleted document: ${path}`);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    console.error(`[safeDeleteDoc Failure] Failed to delete document ${path}. Enqueuing to syncEngine.`);
    await syncEngine.enqueue(collectionPath, 'delete', cleanId);
    return false;
  }
}

export async function uploadAttachment(file: File, path: string): Promise<string> {
  return uploadAttachmentWithProgress(file, path, () => {});
}

export function uploadAttachmentWithProgress(
  file: File,
  path: string,
  onProgress: (percent: number) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    let completed = false;
    
    // Fallback helper
    const fallbackLocal = () => {
      if (completed) return;
      completed = true;
      console.warn("Using local FileReader fallback for attachment upload...");
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          onProgress(100);
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert file to data URL"));
        }
      };
      reader.onerror = (err) => reject(err || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    };

    // INTENTIONAL OPTIMIZATION: Since the app is in the "Starter Tier" where Firebase Cloud Storage
    // is disabled/unprovisioned by Google (resulting in 404/CORS block), we directly trigger
    // the local FileReader fallback. This saves the user from waiting for a 4-second timeout,
    // avoids network/CORS error logs in the console, and provides instant, 100% free offline file attachment capability.
    const BYPASS_STORAGE = true;
    if (BYPASS_STORAGE) {
      fallbackLocal();
      return;
    }

    // Set a timeout of 4 seconds (4000ms). If Firebase storage takes longer or hangs, trigger fallback immediately!
    const timer = setTimeout(() => {
      if (!completed) {
        console.warn("Firebase Storage upload timed out after 4s, falling back to local storage sync...");
        fallbackLocal();
      }
    }, 4000);

    try {
      const fileRef = ref(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          if (completed) return;
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          onProgress(Math.round(progress));
        },
        (error) => {
          clearTimeout(timer);
          if (completed) return;
          console.warn("Firebase Storage upload failed:", error);
          fallbackLocal();
        },
        async () => {
          clearTimeout(timer);
          if (completed) return;
          completed = true;
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadUrl);
          } catch (urlErr) {
            console.warn("Failed to get download URL, falling back:", urlErr);
            fallbackLocal();
          }
        }
      );
    } catch (error) {
      clearTimeout(timer);
      fallbackLocal();
    }
  });
}
