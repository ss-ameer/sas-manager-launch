import { safeGetDocs, db, handleFirestoreError, OperationType } from '../firebase';
import { where, doc, runTransaction, getDoc, setDoc } from 'firebase/firestore';
import { WorkspaceSequenceCounters, SequenceFormatTokens, ClaimedSequenceResult, Enquiry } from '../types';
import { getFromLocalStore } from './db';

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
        prefix: (settings.prefix || '').trim(),
        pattern: (settings.pattern || '').trim() || '{PREFIX}/{MM}/{YYYY}/{SEQ}',
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
 * Read-only preview of the next sequential enquiry S/N and Quote Ref No for a workspace.
 * Does NOT increment or mutate Firestore counters.
 */
export async function previewNextEnquirySequence(
  workspaceId: string,
  repInitials: string = '',
  date: Date = new Date(),
  activeEnquiries?: Array<{ sn?: number; is_deleted?: boolean }>
): Promise<ClaimedSequenceResult> {
  const counters = await getWorkspaceSequenceCounters(workspaceId);
  const periodKey = getSequencePeriodKey(counters.resetCadence, date);
  const currentSeq = counters.sequences?.[periodKey] || 0;
  const nextSeq = currentSeq + 1;

  let nextSn = (counters.lastSnNumber || 0) + 1;
  if (activeEnquiries && activeEnquiries.length > 0) {
    const maxSn = activeEnquiries
      .filter((e) => !e.is_deleted)
      .reduce((max, e) => Math.max(max, Number(e.sn) || 0), 0);
    if (maxSn > 0) {
      nextSn = maxSn + 1;
    }
  }

  const quoteRef = formatPattern(counters.pattern, {
    seq: nextSeq,
    prefix: counters.prefix,
    date,
    rep: repInitials
  });

  return {
    sn: nextSn,
    quoteRef,
    sequence: nextSeq
  };
}

/**
 * Parse sequence number from a generated or manual quote reference string.
 */
export function parseSequenceFromQuoteRef(quoteRef: string, pattern?: string): number | null {
  if (!quoteRef || typeof quoteRef !== 'string') return null;
  const trimmed = quoteRef.trim();

  // 1. Pattern-Guided Regex Extraction
  // If pattern is provided and contains {SEQ}
  if (pattern && pattern.includes('{SEQ}')) {
    try {
      // Escape regex special characters in the pattern except the curly brace tokens
      let regexStr = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\{SEQ\\\}/g, '(\\d+)')
        .replace(/\\\{PREFIX\\\}/g, '[A-Za-z0-9_-]*')
        .replace(/\\\{REP\\\}/g, '[A-Za-z0-9_-]*')
        .replace(/\\\{DD\\\}/g, '\\d{1,2}')
        .replace(/\\\{MM\\\}/g, '\\d{1,2}')
        .replace(/\\\{YY\\\}/g, '\\d{2}')
        .replace(/\\\{YYYY\\\}/g, '\\d{4}');

      const regex = new RegExp(`^${regexStr}$`, 'i');
      const match = trimmed.match(regex);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        // Exclude legacy date contamination (> 100000)
        if (!isNaN(parsed) && parsed > 0 && parsed <= 100000) {
          return parsed;
        }
      }
    } catch {
      // ignore regex error and fall through to universal safeguard
    }
  }

  // 2. Universal Safeguard / Fallback:
  // If pattern match fails or no pattern is provided:
  // Split by standard delimiters: [/\\-_.]
  const parts = trimmed.split(/[/\\-_.]/).filter(Boolean);
  if (parts.length > 0) {
    const candidates: number[] = [];
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        // Exclude 6-digit dates (e.g. 310826, 051026) and 8-digit dates (e.g. 20261005)
        if (part.length === 6 || part.length === 8) {
          continue;
        }
        const num = parseInt(part, 10);
        // Exclude 4-digit calendar years (2020-2099)
        if (num >= 2020 && num <= 2099 && part.length === 4) {
          continue;
        }
        // Exclude invalid date contamination > 100000
        if (num > 100000) {
          continue;
        }
        if (num > 0) {
          candidates.push(num);
        }
      }
    }

    if (candidates.length > 0) {
      if (candidates.length === 1) {
        return candidates[0];
      }
      // If the string starts with digits (e.g. 2801-310826), prefer the first candidate
      if (/^\d+/.test(trimmed)) {
        return candidates[0];
      }
      // Otherwise (e.g. ANRW/10/2026/044), prefer the last candidate
      return candidates[candidates.length - 1];
    }
  }

  // 3. Fallback: match trailing digits with safeguards
  const trailing = trimmed.match(/(\d+)$/);
  if (trailing) {
    const part = trailing[1];
    if (part.length !== 6 && part.length !== 8) {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num > 0 && !(num >= 2020 && num <= 2099 && part.length === 4) && num <= 100000) {
        return num;
      }
    }
  }

  return null;
}

/**
 * Dynamic ceiling calculator from active, non-deleted proposals in the active workspace.
 */
export function getWorkspaceActiveCeilings(
  enquiries: Enquiry[],
  workspaceId: string,
  pattern?: string
): { maxSn: number; maxSeq: number } {
  if (!enquiries || enquiries.length === 0) {
    return { maxSn: 0, maxSeq: 0 };
  }

  const active = enquiries.filter((e) => {
    if (e.is_deleted) return false;
    const wId = e.workspace_id || (e as any).workspaceId;
    return wId === workspaceId || (!wId && (workspaceId === 'ws_default' || workspaceId === 'default'));
  });

  const maxSn = active.reduce((max, e) => Math.max(max, Number(e.sn) || 0), 0);

  const maxSeq = active.reduce((max, e) => {
    const qRef = e.quote_ref_no || (e as any).quote_ref || '';
    const parsed = parseSequenceFromQuoteRef(qRef, pattern);
    // If parsed > 100000, disregard it as an invalid legacy date contamination
    if (parsed && parsed > 0 && parsed <= 100000) {
      return Math.max(max, parsed);
    }
    return max;
  }, 0);

  return { maxSn, maxSeq };
}

/**
 * Self-healing counter routine: Reconciles workspace counters down to actual active ceilings.
 * Heals both lastSnNumber and sequences[periodKey] without ratcheting or phantom bloat.
 */
export async function healWorkspaceCounters(
  workspaceId: string,
  enquiries: Enquiry[],
  pattern?: string,
  date: Date = new Date()
): Promise<{ healedSn: number; healedSeq: number }> {
  if (!workspaceId) {
    return { healedSn: 0, healedSeq: 0 };
  }

  const { maxSn, maxSeq } = getWorkspaceActiveCeilings(enquiries, workspaceId, pattern);
  const docRef = getWorkspaceCountersDocRef(workspaceId);

  try {
    let currentData: any = {};
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      currentData = snap.data();
    }

    const cadence = currentData.resetCadence || 'monthly';
    const periodKey = getSequencePeriodKey(cadence, date);
    const existingSequences = currentData.sequences ? { ...currentData.sequences } : {};
    existingSequences[periodKey] = maxSeq;

    const payload: Partial<WorkspaceSequenceCounters> = {
      lastSnNumber: maxSn,
      sequences: existingSequences,
      updatedAt: new Date().toISOString(),
      updatedBy: 'system-heal'
    };

    await setDoc(docRef, payload, { merge: true });
    console.log(`[healWorkspaceCounters] Workspace ${workspaceId} counters healed: lastSn=${maxSn}, seq[${periodKey}]=${maxSeq}`);
    return { healedSn: maxSn, healedSeq: maxSeq };
  } catch (err) {
    console.warn(`[healWorkspaceCounters] Failed healing counters for workspace ${workspaceId}:`, err);
    return { healedSn: maxSn, healedSeq: maxSeq };
  }
}

export interface ClaimSequenceOptions {
  targetSn?: number;
  targetSeq?: number;
  customQuoteRef?: string;
  date?: Date;
  companyAccount?: string;
  salesPerson?: string;
  assignedSalesperson?: string;
  repInitials?: string;
  enquiries?: Enquiry[];
}

/**
 * Atomically claims the next sequential enquiry S/N and Quote Ref No for a workspace.
 * Commits an atomic increment to BOTH lastSnNumber and sequences[periodKey].
 */
export async function claimNextEnquirySequence(
  workspaceId: string,
  repInitialsOrUser: any = '',
  userIdOrOptions?: any,
  dateOrOptions?: any,
  explicitOptions?: ClaimSequenceOptions
): Promise<ClaimedSequenceResult> {
  const docRef = getWorkspaceCountersDocRef(workspaceId);

  // Normalize polymorphic argument calling signatures:
  // Form A: (workspaceId, repInitials, userId, date, options)
  // Form B: (workspaceId, user, options)
  let repInitials = '';
  let userId = 'system';
  let date = new Date();
  let options: ClaimSequenceOptions = {};

  if (typeof repInitialsOrUser === 'string') {
    repInitials = repInitialsOrUser;
    if (typeof userIdOrOptions === 'string') {
      userId = userIdOrOptions;
    } else if (userIdOrOptions && typeof userIdOrOptions === 'object') {
      options = userIdOrOptions;
    }
    if (dateOrOptions instanceof Date) {
      date = dateOrOptions;
      if (explicitOptions) options = { ...options, ...explicitOptions };
    } else if (dateOrOptions && typeof dateOrOptions === 'object') {
      options = { ...options, ...dateOrOptions };
    }
  } else if (repInitialsOrUser && typeof repInitialsOrUser === 'object') {
    // repInitialsOrUser is user object
    userId = repInitialsOrUser.uid || repInitialsOrUser.id || 'system';
    if (userIdOrOptions && typeof userIdOrOptions === 'object') {
      options = userIdOrOptions;
    }
    if (options.repInitials) {
      repInitials = options.repInitials;
    } else if (options.salesPerson) {
      repInitials = options.salesPerson.slice(0, 2).toUpperCase();
    }
    if (dateOrOptions instanceof Date) {
      date = dateOrOptions;
    }
  }

  const now = options.date || date || new Date();

  // Dynamic active ceilings calculation
  let maxSn = 0;
  let maxSeq = 0;
  let isTargetSnTaken = false;

  try {
    let candidateEnquiries: Enquiry[] = options?.enquiries || [];
    if (!candidateEnquiries || candidateEnquiries.length === 0) {
      const local = await getFromLocalStore<Enquiry>('enquiries');
      if (local && local.length > 0) candidateEnquiries = local;
    }
    if (!candidateEnquiries || candidateEnquiries.length === 0) {
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('omni_enquiries') : null;
        if (saved) candidateEnquiries = JSON.parse(saved);
      } catch (e) {}
    }

    if (candidateEnquiries && candidateEnquiries.length > 0) {
      const ceilings = getWorkspaceActiveCeilings(candidateEnquiries, workspaceId);
      maxSn = ceilings.maxSn;
      maxSeq = ceilings.maxSeq;

      if (options?.targetSn && options.targetSn > 0) {
        const target = Number(options.targetSn);
        const match = candidateEnquiries.find(e => {
          if (e.is_deleted) return false;
          const eWs = e.workspace_id || (e as any).workspaceId;
          if (eWs && eWs !== workspaceId && !(workspaceId === 'ws_default' && !eWs)) return false;
          return Number(e.sn) === target;
        });
        if (match) isTargetSnTaken = true;
      }
    }
  } catch (err) {
    console.warn('[claimNextEnquirySequence] Could not calculate active ceilings:', err);
  }

  // Pre-query highest existing S/N and check targetSn collision from Firestore enquiries if not found locally
  try {
    if (options?.targetSn && options.targetSn > 0 && !isTargetSnTaken) {
      const numTarget = Number(options.targetSn);
      const strTarget = String(options.targetSn);

      // Query both workspace_id and workspaceId for both numeric and string representations of sn
      const [snap1, snap2, snap3, snap4] = await Promise.all([
        safeGetDocs('enquiries', where('workspace_id', '==', workspaceId), where('sn', '==', numTarget)),
        safeGetDocs('enquiries', where('workspace_id', '==', workspaceId), where('sn', '==', strTarget)),
        safeGetDocs('enquiries', where('workspaceId', '==', workspaceId), where('sn', '==', numTarget)),
        safeGetDocs('enquiries', where('workspaceId', '==', workspaceId), where('sn', '==', strTarget))
      ]);

      const allDocs = [
        ...(snap1?.docs || []),
        ...(snap2?.docs || []),
        ...(snap3?.docs || []),
        ...(snap4?.docs || [])
      ];

      const activeMatches = allDocs.filter((d: any) => {
        const data = d.data();
        if (data?.is_deleted) return false;
        return Number(data?.sn) === numTarget;
      });

      if (activeMatches.length > 0) {
        isTargetSnTaken = true;
      }
    }
  } catch (err) {
    console.warn('[claimNextEnquirySequence] Could not check targetSn collision from Firestore:', err);
  }

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
      const baseSeq = counters.sequences?.[periodKey] || 0;

      // Clamped dynamic ceilings:
      // If counters are ratcheted higher than actual active proposals, clamp them down to active ceilings
      const currentMaxSn = maxSn > 0
        ? Math.min(counters.lastSnNumber || 0, maxSn)
        : (counters.lastSnNumber || 0);
      const currentMaxSeq = maxSeq > 0
        ? Math.min(baseSeq, maxSeq)
        : baseSeq;

      let nextSn: number;
      if (options?.targetSn && options.targetSn > 0) {
        if (!isTargetSnTaken) {
          nextSn = options.targetSn;
        } else {
          nextSn = currentMaxSn + 1;
        }
      } else {
        nextSn = currentMaxSn + 1;
      }

      let nextSeq: number;
      if (options?.targetSeq && options.targetSeq > 0) {
        nextSeq = options.targetSeq;
      } else {
        nextSeq = currentMaxSeq + 1;
      }

      let quoteRef: string;
      if (options?.customQuoteRef && typeof options.customQuoteRef === 'string' && options.customQuoteRef.trim()) {
        quoteRef = options.customQuoteRef.trim();
        const parsed = parseSequenceFromQuoteRef(quoteRef, counters.pattern);
        if (parsed && parsed >= nextSeq) {
          nextSeq = parsed;
        }
      } else {
        quoteRef = formatPattern(counters.pattern, {
          seq: nextSeq,
          prefix: counters.prefix,
          date: now,
          rep: repInitials
        });
      }

      const updatedSequences = {
        ...(counters.sequences || {}),
        [periodKey]: nextSeq
      };

      // Commit the new lastSnNumber and sequences[periodKey]
      const committedLastSn = Math.max(currentMaxSn, nextSn);

      transaction.set(
        docRef,
        {
          prefix: counters.prefix,
          pattern: counters.pattern,
          resetCadence: counters.resetCadence,
          lastSnNumber: committedLastSn,
          sequences: updatedSequences,
          updatedAt: now.toISOString(),
          updatedBy: userId
        },
        { merge: true }
      );

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
 * Protects legacy high-water marks and manual sequence inputs.
 * Atomically updates BOTH lastSnNumber and sequences[periodKey] to prevent sequence collisions.
 */
export async function syncSequenceHighWaterMark(
  workspaceId: string,
  importedSn: number,
  userId: string = 'system',
  quoteRef?: string,
  date: Date = new Date()
): Promise<{ lastSnNumber: number; periodKey?: string; sequence?: number }> {
  if (!workspaceId) {
    return { lastSnNumber: importedSn || 0 };
  }

  const docRef = getWorkspaceCountersDocRef(workspaceId);

  try {
    return await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(docRef);
      let existingData: any = {};
      let currentLastSn = 0;
      let pattern = '{PREFIX}/{MM}/{YYYY}/{SEQ}';
      let cadence: 'never' | 'monthly' | 'yearly' = 'monthly';
      let prefix = '';
      let sequences: Record<string, number> = {};

      if (snap.exists()) {
        existingData = snap.data();
        currentLastSn = typeof existingData.lastSnNumber === 'number' ? existingData.lastSnNumber : 0;
        pattern = existingData.pattern || pattern;
        cadence = existingData.resetCadence || cadence;
        prefix = existingData.prefix !== undefined ? existingData.prefix : '';
        sequences = existingData.sequences ? { ...existingData.sequences } : {};
      }

      const newLastSn = Math.max(currentLastSn, importedSn || 0);
      let hasChanges = newLastSn !== currentLastSn || !snap.exists();

      const periodKey = getSequencePeriodKey(cadence, date);
      let updatedSeq = sequences[periodKey] || 0;

      if (quoteRef) {
        const parsedSeq = parseSequenceFromQuoteRef(quoteRef, pattern);
        if (parsedSeq && parsedSeq > updatedSeq) {
          updatedSeq = parsedSeq;
          sequences[periodKey] = updatedSeq;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        transaction.set(
          docRef,
          {
            ...existingData,
            prefix,
            pattern,
            resetCadence: cadence,
            lastSnNumber: newLastSn,
            sequences,
            updatedAt: new Date().toISOString(),
            updatedBy: userId
          },
          { merge: true }
        );
      }

      return {
        lastSnNumber: newLastSn,
        periodKey,
        sequence: updatedSeq
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `workspaces/${workspaceId}/system/counters`);
    throw err;
  }
}
