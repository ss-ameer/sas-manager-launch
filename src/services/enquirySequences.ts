import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
import { WorkspaceSequenceCounters, SequenceFormatTokens, ClaimedSequenceResult } from '../types';

/**
 * Format string patterns using tokens:
 * {SEQ}: Sequence counter number
 * {PREFIX}: Workspace prefix (e.g. ANRW)
 * {DD}: 2-digit day (01-31)
 * {MM}: 2-digit month (01-12)
 * {YY}: 2-digit year (e.g. 26)
 * {YYYY}: 4-digit year (e.g. 2026)
 * {REP}: Sales representative initials
 *
 * Also sanitizes accidental double slashes or orphan hyphens when prefix is empty.
 */
export function formatPattern(pattern: string, tokens: SequenceFormatTokens): string {
  const now = tokens.date || new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fullYear = String(now.getFullYear());
  const shortYear = fullYear.slice(-2);
  const rep = (tokens.rep || '').trim();
  const prefix = (tokens.prefix || '').trim();
  const seqStr = String(tokens.seq);

  let formatted = pattern
    .replace(/\{SEQ\}/g, seqStr)
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{DD\}/g, day)
    .replace(/\{MM\}/g, month)
    .replace(/\{YYYY\}/g, fullYear)
    .replace(/\{YY\}/g, shortYear)
    .replace(/\{REP\}/g, rep);

  // Clean up orphan separators if prefix was blank or missing
  // 1. Remove double or multiple consecutive slashes: // -> /
  formatted = formatted.replace(/\/+/g, '/');
  // 2. Remove leading slash: /09/2026/... -> 09/2026/...
  formatted = formatted.replace(/^\/+/, '');
  // 3. Remove trailing slash
  formatted = formatted.replace(/\/+$/, '');
  // 4. Remove leading hyphen if prefix was removed: -150926 -> 150926
  formatted = formatted.replace(/^-+/, '');
  // 5. Remove consecutive hyphens: -- -> -
  formatted = formatted.replace(/-+/g, '-');

  return formatted.trim();
}

/**
 * Calculates period key based on cadence:
 * - 'never': 'global'
 * - 'monthly': 'YYYY-MM' (e.g. '2026-09')
 * - 'yearly': 'YYYY' (e.g. '2026')
 */
export function getSequencePeriodKey(cadence: 'never' | 'monthly' | 'yearly', date = new Date()): string {
  const fullYear = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');

  switch (cadence) {
    case 'monthly':
      return `${fullYear}-${month}`;
    case 'yearly':
      return fullYear;
    case 'never':
    default:
      return 'global';
  }
}

/**
 * Firestore Document path helper:
 * workspaces/{workspaceId}/system/counters
 */
export function getWorkspaceCountersDocRef(workspaceId: string) {
  return doc(db, 'workspaces', workspaceId, 'system', 'counters');
}

/**
 * Fetch existing counters configuration or return default structure.
 */
export async function getWorkspaceSequenceCounters(workspaceId: string): Promise<WorkspaceSequenceCounters> {
  const docRef = getWorkspaceCountersDocRef(workspaceId);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        prefix: data.prefix !== undefined ? data.prefix : '',
        pattern: data.pattern || '{PREFIX}/{MM}/{YYYY}/{SEQ}',
        resetCadence: data.resetCadence || 'monthly',
        lastSnNumber: typeof data.lastSnNumber === 'number' ? data.lastSnNumber : 0,
        sequences: data.sequences || {},
        updatedAt: data.updatedAt || new Date().toISOString(),
        updatedBy: data.updatedBy || 'system'
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `workspaces/${workspaceId}/system/counters`);
  }

  // Fallback defaults
  return {
    prefix: '',
    pattern: '{PREFIX}/{MM}/{YYYY}/{SEQ}',
    resetCadence: 'monthly',
    lastSnNumber: 0,
    sequences: {},
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  };
}

/**
 * Save or seed the workspace sequence settings (Admin action).
 */
export async function updateWorkspaceSequenceSettings(
  workspaceId: string,
  settings: {
    prefix: string;
    pattern: string;
    resetCadence: 'never' | 'monthly' | 'yearly';
    nextSnBaseline?: number;
    nextSeqBaseline?: number;
  },
  userId = 'admin'
): Promise<void> {
  const docRef = getWorkspaceCountersDocRef(workspaceId);
  const now = new Date();
  const periodKey = getSequencePeriodKey(settings.resetCadence, now);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      let currentData: WorkspaceSequenceCounters;

      if (snap.exists()) {
        currentData = snap.data() as WorkspaceSequenceCounters;
      } else {
        currentData = {
          prefix: '',
          pattern: '{PREFIX}/{MM}/{YYYY}/{SEQ}',
          resetCadence: 'monthly',
          lastSnNumber: 0,
          sequences: {},
          updatedAt: now.toISOString(),
          updatedBy: userId
        };
      }

      const updatedSequences = { ...(currentData.sequences || {}) };

      // If a custom next sequence baseline was provided, seed it into the current period key
      if (typeof settings.nextSeqBaseline === 'number' && !isNaN(settings.nextSeqBaseline)) {
        // baseline is the NEXT number to be assigned, so the current counter is nextSeqBaseline - 1
        updatedSequences[periodKey] = Math.max(0, settings.nextSeqBaseline - 1);
      }

      let updatedLastSn = currentData.lastSnNumber || 0;
      if (typeof settings.nextSnBaseline === 'number' && !isNaN(settings.nextSnBaseline)) {
        // next S/N to be assigned means current lastSnNumber is baseline - 1
        updatedLastSn = Math.max(0, settings.nextSnBaseline - 1);
      }

      const updatePayload: WorkspaceSequenceCounters = {
        prefix: settings.prefix.trim(),
        pattern: settings.pattern.trim() || '{PREFIX}/{MM}/{YYYY}/{SEQ}',
        resetCadence: settings.resetCadence,
        lastSnNumber: updatedLastSn,
        sequences: updatedSequences,
        updatedAt: now.toISOString(),
        updatedBy: userId
      };

      transaction.set(docRef, updatePayload, { merge: true });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/system/counters`);
    throw err;
  }
}

/**
 * Atomically claims the next sequential enquiry S/N and parsed Quote Ref No for a workspace.
 */
export async function claimNextEnquirySequence(
  workspaceId: string,
  repInitials: string = '',
  userId: string = 'system'
): Promise<ClaimedSequenceResult> {
  const docRef = getWorkspaceCountersDocRef(workspaceId);
  const now = new Date();

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      let counters: WorkspaceSequenceCounters;

      if (snap.exists()) {
        const data = snap.data();
        counters = {
          prefix: data.prefix !== undefined ? data.prefix : '',
          pattern: data.pattern || '{PREFIX}/{MM}/{YYYY}/{SEQ}',
          resetCadence: data.resetCadence || 'monthly',
          lastSnNumber: typeof data.lastSnNumber === 'number' ? data.lastSnNumber : 0,
          sequences: data.sequences || {},
          updatedAt: data.updatedAt || now.toISOString(),
          updatedBy: data.updatedBy || userId
        };
      } else {
        counters = {
          prefix: '',
          pattern: '{PREFIX}/{MM}/{YYYY}/{SEQ}',
          resetCadence: 'monthly',
          lastSnNumber: 0,
          sequences: {},
          updatedAt: now.toISOString(),
          updatedBy: userId
        };
      }

      const periodKey = getSequencePeriodKey(counters.resetCadence, now);
      const currentSeq = counters.sequences?.[periodKey] || 0;
      const nextSeq = currentSeq + 1;
      const nextSn = (counters.lastSnNumber || 0) + 1;

      const quoteRef = formatPattern(counters.pattern, {
        seq: nextSeq,
        prefix: counters.prefix,
        date: now,
        rep: repInitials
      });

      const updatedSequences = {
        ...(counters.sequences || {}),
        [periodKey]: nextSeq
      };

      transaction.set(docRef, {
        prefix: counters.prefix,
        pattern: counters.pattern,
        resetCadence: counters.resetCadence,
        lastSnNumber: nextSn,
        sequences: updatedSequences,
        updatedAt: now.toISOString(),
        updatedBy: userId
      }, { merge: true });

      return {
        sn: nextSn,
        quoteRef,
        sequence: nextSeq
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/system/counters`);
    throw err;
  }
}

/**
 * Protects legacy high-water marks (e.g. from imported CSV records or legacy enquiries).
 * Atomically updates lastSnNumber = Math.max(lastSnNumber, importedSn).
 */
export async function syncSequenceHighWaterMark(
  workspaceId: string,
  importedSn: number,
  userId: string = 'system'
): Promise<number> {
  if (!importedSn || isNaN(importedSn) || importedSn <= 0) {
    return 0;
  }

  const docRef = getWorkspaceCountersDocRef(workspaceId);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      let currentLastSn = 0;
      let existingData: any = {};

      if (snap.exists()) {
        existingData = snap.data();
        currentLastSn = typeof existingData.lastSnNumber === 'number' ? existingData.lastSnNumber : 0;
      }

      const newLastSn = Math.max(currentLastSn, importedSn);

      if (newLastSn !== currentLastSn || !snap.exists()) {
        transaction.set(docRef, {
          ...existingData,
          lastSnNumber: newLastSn,
          updatedAt: new Date().toISOString(),
          updatedBy: userId
        }, { merge: true });
      }

      return newLastSn;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/system/counters`);
    throw err;
  }
}
