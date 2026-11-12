import { safeGetDoc, safeSetDoc, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { WorkspaceSequenceCounters, SequenceFormatTokens, ClaimedSequenceResult, Enquiry, SequenceResetCadence, resolveCountryCode, sanitizeCompanyCode } from '../types';
import { getFromLocalStore } from './db';

const COUNTERS_CACHE_TTL_MS = 30 * 60 * 1000;
const countersCache = new Map<string, { data: WorkspaceSequenceCounters; fetchedAt: number }>();
const inFlightCounterPromises = new Map<string, Promise<WorkspaceSequenceCounters>>();

function cloneCounters(c: WorkspaceSequenceCounters): WorkspaceSequenceCounters {
  return {
    ...c,
    sequences: { ...(c.sequences || {}) }
  };
}

function getCachedCounters(workspaceId: string): WorkspaceSequenceCounters | null {
  if (!workspaceId) return null;
  const mem = countersCache.get(workspaceId);
  if (mem) return cloneCounters(mem.data);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(`sas_seq_counters_${workspaceId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          countersCache.set(workspaceId, { data: cloneCounters(parsed), fetchedAt: Date.now() });
          return cloneCounters(parsed);
        }
      }
    }
  } catch (_) {}
  return null;
}

function setCachedCounters(workspaceId: string, data: WorkspaceSequenceCounters): void {
  if (!workspaceId) return;
  const cloned = cloneCounters(data);
  countersCache.set(workspaceId, {
    data: cloned,
    fetchedAt: Date.now()
  });
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(`sas_seq_counters_${workspaceId}`, JSON.stringify(cloned));
    }
  } catch (_) {}
}

export function patternRequiresCompanyCode(pattern?: string | null): boolean {
  if (!pattern) return false;
  return /\{(?:COMPANY_CODE|COMPANY|CLIENT_CODE)\}/i.test(pattern);
}

export function patternRequiresCountryCode(pattern?: string | null): boolean {
  if (!pattern) return false;
  return /\{(?:COUNTRY|COUNTRY_CODE)\}/i.test(pattern);
}

/**
 * Format string patterns using tokens:
 * {SEQ} / {REF_SEQ}: Sequence counter number
 * {PREFIX}: Workspace prefix (e.g. ANRW, AVENTURA)
 * {COUNTRY} / {COUNTRY_CODE}: 3-letter country code (e.g. UAE, KSA, OMN)
 * {COMPANY_CODE} / {COMPANY} / {CLIENT_CODE}: Registered client company code (e.g. CWE, BME, VWT)
 * {DD}: 2-digit day (01-31)
 * {MM}: 2-digit month (01-12)
 * {YY}: 2-digit year (e.g. 26)
 * {YYYY}: 4-digit year (e.g. 2026)
 * {REP}: Sales representative initials
 *
 * Never guesses a company code. Renders [COMPANY_CODE] (or [COUNTRY]) placeholder when required by the pattern
 * and not yet provided, unless preserveUnresolvedPlaceholders is explicitly false.
 */
export function formatPattern(pattern: string, tokens: SequenceFormatTokens): string {
  const now = tokens.date && !isNaN(tokens.date.getTime()) ? tokens.date : new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const fullYear = String(now.getFullYear());
  const shortYear = fullYear.slice(-2);
  const rep = (tokens.rep || '').trim();
  const prefix = (tokens.prefix || '').trim();
  const seqStr = String(tokens.seq);

  const preservePlaceholders = tokens.preserveUnresolvedPlaceholders !== false;
  const resolvedCountry = resolveCountryCode(tokens.country, tokens.countryCode);
  const resolvedCompanyCode = sanitizeCompanyCode(tokens.companyCode);

  const countryReplacement = resolvedCountry || (preservePlaceholders ? '[COUNTRY]' : '');
  const companyCodeReplacement = resolvedCompanyCode || (preservePlaceholders ? '[COMPANY_CODE]' : '');

  let formatted = pattern
    .replace(/\{(?:SEQ|REF_SEQ)\}/gi, seqStr)
    .replace(/\{PREFIX\}/gi, prefix)
    .replace(/\{(?:COUNTRY|COUNTRY_CODE)\}/gi, countryReplacement)
    .replace(/\{(?:COMPANY_CODE|COMPANY|CLIENT_CODE)\}/gi, companyCodeReplacement)
    .replace(/\{DD\}/gi, day)
    .replace(/\{MM\}/gi, month)
    .replace(/\{YYYY\}/gi, fullYear)
    .replace(/\{YY\}/gi, shortYear)
    .replace(/\{REP\}/gi, rep);

  // Clean up orphan separators if prefix or optional tokens were blank
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
  const defaultCounters: WorkspaceSequenceCounters = {
    prefix: '',
    pattern: '{PREFIX}/{MM}/{YYYY}/{SEQ}',
    resetCadence: 'monthly',
    lastSnNumber: 0,
    sequences: {},
    updatedAt: new Date().toISOString(),
    updatedBy: 'system'
  };

  if (!workspaceId) return defaultCounters;

  const cached = countersCache.get(workspaceId);
  if (cached && Date.now() - cached.fetchedAt < COUNTERS_CACHE_TTL_MS) {
    return cloneCounters(cached.data);
  }

  const existingPromise = inFlightCounterPromises.get(workspaceId);
  if (existingPromise) {
    return existingPromise.then(cloneCounters);
  }

  const fetchPromise = (async (): Promise<WorkspaceSequenceCounters> => {
    try {
      const snap = await safeGetDoc('workspaces', workspaceId, 'system', 'counters');
      if (snap && snap.exists()) {
        const data = snap.data();
        const resolved: WorkspaceSequenceCounters = {
          prefix: data.prefix !== undefined ? data.prefix : '',
          pattern: data.pattern || '{PREFIX}/{MM}/{YYYY}/{SEQ}',
          resetCadence: data.resetCadence || 'monthly',
          lastSnNumber: typeof data.lastSnNumber === 'number' ? data.lastSnNumber : 0,
          sequences: data.sequences || {},
          updatedAt: data.updatedAt || new Date().toISOString(),
          updatedBy: data.updatedBy || 'system'
        };
        setCachedCounters(workspaceId, resolved);
        return resolved;
      }
      if (cached) {
        return cloneCounters(cached.data);
      }
      setCachedCounters(workspaceId, defaultCounters);
      return defaultCounters;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `workspaces/${workspaceId}/system/counters`);
      return cached ? cloneCounters(cached.data) : defaultCounters;
    } finally {
      inFlightCounterPromises.delete(workspaceId);
    }
  })();

  inFlightCounterPromises.set(workspaceId, fetchPromise);
  return fetchPromise.then(cloneCounters);
}

/**
 * Save or seed the workspace sequence settings (Admin action).
 * Uses direct merge write (0 BatchGetDocuments read transactions) so saving settings never fails under read quota pressure.
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
  const now = new Date();
  const periodKey = getSequencePeriodKey(settings.resetCadence, now);
  const currentData: WorkspaceSequenceCounters = getCachedCounters(workspaceId) || {
    prefix: '',
    pattern: '{PREFIX}/{MM}/{YYYY}/{SEQ}',
    resetCadence: 'monthly',
    lastSnNumber: 0,
    sequences: {},
    updatedAt: now.toISOString(),
    updatedBy: userId
  };

  const updatedSequences = { ...(currentData.sequences || {}) };

  // If a custom next sequence baseline was provided, seed it into the current period key
  if (typeof settings.nextSeqBaseline === 'number' && !isNaN(settings.nextSeqBaseline)) {
    updatedSequences[periodKey] = Math.max(0, settings.nextSeqBaseline - 1);
  }

  let updatedLastSn = currentData.lastSnNumber || 0;
  if (typeof settings.nextSnBaseline === 'number' && !isNaN(settings.nextSnBaseline)) {
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

  setCachedCounters(workspaceId, updatePayload);

  try {
    await safeSetDoc(`workspaces/${workspaceId}/system`, 'counters', updatePayload, { merge: true });
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
  activeEnquiries?: Array<{ sn?: number; is_deleted?: boolean }>,
  extraTokens?: {
    country?: string;
    countryCode?: string;
    companyCode?: string;
    preserveUnresolvedPlaceholders?: boolean;
  }
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
    rep: repInitials,
    country: extraTokens?.country,
    countryCode: extraTokens?.countryCode,
    companyCode: extraTokens?.companyCode,
    preserveUnresolvedPlaceholders: extraTokens?.preserveUnresolvedPlaceholders
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
  // Strip any leading auxiliary document prefix (DO-, PO-, REC-, PV-, MRN-, DN-, PI-, INV-)
  // and any trailing revision suffix (-R1, /Rev.1, (Rev 1)) before extracting the core sequence
  const trimmed = quoteRef
    .trim()
    .replace(/^(?:(?:DO|REC|PO|PV|MRN|DN|PI|INV)-)+/i, '')
    .replace(/(?:-R\d+|\/Rev\.\d+|\s*\(Rev\s*\d+\))$/i, '')
    .trim();

  // 1. Pattern-Guided Regex Extraction
  // If pattern is provided and contains {SEQ} or {REF_SEQ}
  if (pattern && /\{(?:SEQ|REF_SEQ)\}/i.test(pattern)) {
    try {
      // Escape regex special characters in the pattern except the curly brace tokens
      let regexStr = pattern
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\\\{(?:SEQ|REF_SEQ)\\\}/gi, '(\\d+)')
        .replace(/\\\{PREFIX\\\}/gi, '[\\[\\]A-Za-z0-9_.-]*')
        .replace(/\\\{(?:COUNTRY|COUNTRY_CODE)\\\}/gi, '[\\[\\]A-Za-z0-9_.-]*')
        .replace(/\\\{(?:COMPANY_CODE|COMPANY|CLIENT_CODE)\\\}/gi, '[\\[\\]A-Za-z0-9_.-]*')
        .replace(/\\\{REP\\\}/gi, '[\\[\\]A-Za-z0-9_.-]*')
        .replace(/\\\{DD\\\}/gi, '\\d{1,2}')
        .replace(/\\\{MM\\\}/gi, '\\d{1,2}')
        .replace(/\\\{YY\\\}/gi, '\\d{2}')
        .replace(/\\\{YYYY\\\}/gi, '\\d{4}');

      // Allow optional trailing custom letter suffixes like "AA" (e.g. 2851-191026AA)
      const regex = new RegExp(`^${regexStr}[A-Za-z]*$`, 'i');
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
  pattern?: string,
  periodKey?: string,
  resetCadence?: SequenceResetCadence
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
    if (periodKey && resetCadence && resetCadence !== 'never') {
      const rawDate = e.enquiry_date || e.createdAt || (e as any).created_at;
      if (rawDate) {
        const parsedDate = new Date(rawDate);
        if (!isNaN(parsedDate.getTime())) {
          const itemPeriodKey = getSequencePeriodKey(resetCadence, parsedDate);
          if (itemPeriodKey !== periodKey) {
            return max;
          }
        }
      }
    }
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

  const docRef = getWorkspaceCountersDocRef(workspaceId);

  try {
    let currentData: any = countersCache.get(workspaceId)?.data || {};
    const snap = await safeGetDoc('workspaces', workspaceId, 'system', 'counters');
    if (snap && snap.exists()) {
      currentData = snap.data();
    }

    const cadence: SequenceResetCadence = currentData.resetCadence || 'monthly';
    const periodKey = getSequencePeriodKey(cadence, date);
    const { maxSn, maxSeq } = getWorkspaceActiveCeilings(
      enquiries,
      workspaceId,
      pattern || currentData.pattern,
      periodKey,
      cadence
    );
    const existingSequences = currentData.sequences ? { ...currentData.sequences } : {};
    existingSequences[periodKey] = maxSeq;

    const nowIso = new Date().toISOString();
    const payload: Partial<WorkspaceSequenceCounters> = {
      lastSnNumber: maxSn,
      sequences: existingSequences,
      updatedAt: nowIso,
      updatedBy: 'system-heal'
    };

    await setDoc(docRef, payload, { merge: true });
    setCachedCounters(workspaceId, {
      prefix: currentData.prefix !== undefined ? currentData.prefix : '',
      pattern: currentData.pattern || pattern || '{PREFIX}/{MM}/{YYYY}/{SEQ}',
      resetCadence: cadence,
      lastSnNumber: maxSn,
      sequences: existingSequences,
      updatedAt: nowIso,
      updatedBy: 'system-heal'
    });
    console.log(`[healWorkspaceCounters] Workspace ${workspaceId} counters healed: lastSn=${maxSn}, seq[${periodKey}]=${maxSeq}`);
    return { healedSn: maxSn, healedSeq: maxSeq };
  } catch (err) {
    const fallback = getWorkspaceActiveCeilings(enquiries, workspaceId, pattern);
    console.warn(`[healWorkspaceCounters] Failed healing counters for workspace ${workspaceId}:`, err);
    return { healedSn: fallback.maxSn, healedSeq: fallback.maxSeq };
  }
}

export interface ClaimSequenceOptions {
  targetSn?: number;
  targetSeq?: number;
  customQuoteRef?: string;
  date?: Date;
  companyAccount?: string;
  companyCode?: string;
  country?: string;
  countryCode?: string;
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

  let candidateEnquiries: Enquiry[] = options?.enquiries || [];
  try {
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
      const defaultPeriodKey = getSequencePeriodKey('monthly', now);
      const ceilings = getWorkspaceActiveCeilings(
        candidateEnquiries,
        workspaceId,
        '{PREFIX}/{MM}/{YYYY}/{SEQ}',
        defaultPeriodKey,
        'monthly'
      );
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

  // Cache-first atomic merge without BatchGetDocuments transaction
  const counters = await getWorkspaceSequenceCounters(workspaceId);

  const currentPeriodKey = getSequencePeriodKey(counters.resetCadence, now);
  if (candidateEnquiries && candidateEnquiries.length > 0) {
    const scopedCeilings = getWorkspaceActiveCeilings(
      candidateEnquiries,
      workspaceId,
      counters.pattern,
      currentPeriodKey,
      counters.resetCadence
    );
    maxSn = scopedCeilings.maxSn;
    maxSeq = scopedCeilings.maxSeq;
  }

  const periodKey = currentPeriodKey;
  const baseSeq = counters.sequences?.[periodKey] || 0;

  // Respect the higher of configured counter baselines and active records ceiling
  const currentMaxSn = Math.max(counters.lastSnNumber || 0, maxSn);
  const currentMaxSeq = Math.max(baseSeq, maxSeq);

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
      rep: repInitials,
      country: options?.country,
      countryCode: options?.countryCode,
      companyCode: options?.companyCode
    });
  }

  const updatedSequences = {
    ...(counters.sequences || {}),
    [periodKey]: nextSeq
  };

  const committedLastSn = Math.max(currentMaxSn, nextSn);
  const updatedCounters: WorkspaceSequenceCounters = {
    prefix: counters.prefix,
    pattern: counters.pattern,
    resetCadence: counters.resetCadence,
    lastSnNumber: committedLastSn,
    sequences: updatedSequences,
    updatedAt: now.toISOString(),
    updatedBy: userId
  };

  setCachedCounters(workspaceId, updatedCounters);

  try {
    await safeSetDoc(`workspaces/${workspaceId}/system`, 'counters', updatedCounters, { merge: true });
  } catch (err) {
    console.warn('[claimNextEnquirySequence] Non-blocking counter sync warning (Quota/Offline):', err);
  }

  return {
    sn: nextSn,
    quoteRef,
    sequence: nextSeq
  };
}

/**
 * Protects legacy high-water marks and manual sequence inputs.
 * Short-circuits with 0 reads and 0 writes when existing counters already cover the S/N and sequence.
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

  const existingData = getCachedCounters(workspaceId) || {
    prefix: '',
    pattern: '{PREFIX}/{MM}/{YYYY}/{SEQ}',
    resetCadence: 'monthly' as const,
    lastSnNumber: 0,
    sequences: {},
    updatedAt: new Date().toISOString(),
    updatedBy: userId
  };

  const currentLastSn = typeof existingData.lastSnNumber === 'number' ? existingData.lastSnNumber : 0;
  const pattern = existingData.pattern || '{PREFIX}/{MM}/{YYYY}/{SEQ}';
  const cadence: 'never' | 'monthly' | 'yearly' = existingData.resetCadence || 'monthly';
  const prefix = existingData.prefix !== undefined ? existingData.prefix : '';
  const sequences: Record<string, number> = existingData.sequences ? { ...existingData.sequences } : {};

  const newLastSn = Math.max(currentLastSn, importedSn || 0);
  let hasChanges = newLastSn > currentLastSn;

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

  // CRITICAL SHORT-CIRCUIT: 0 Firestore reads and 0 Firestore writes when high-water mark did not increase
  if (!hasChanges) {
    return {
      lastSnNumber: newLastSn,
      periodKey,
      sequence: updatedSeq
    };
  }

  const nowIso = new Date().toISOString();
  const updatedPayload: WorkspaceSequenceCounters = {
    prefix,
    pattern,
    resetCadence: cadence,
    lastSnNumber: newLastSn,
    sequences,
    updatedAt: nowIso,
    updatedBy: userId
  };

  setCachedCounters(workspaceId, updatedPayload);

  try {
    await safeSetDoc(`workspaces/${workspaceId}/system`, 'counters', updatedPayload, { merge: true });
  } catch (err) {
    console.warn('[syncSequenceHighWaterMark] Non-blocking counter sync warning (Quota/Offline):', err);
  }

  return {
    lastSnNumber: newLastSn,
    periodKey,
    sequence: updatedSeq
  };
}
