import { Company, Contact } from '../types';

/**
 * Common legal, geographic, and B2B / water-treatment industry stop-words
 * stripped when isolating a company's distinctive core brand tokens.
 */
export const COMPANY_GENERIC_STOP_WORDS = new Set<string>([
  // Legal / corporate entity suffixes
  'llc',
  'fze',
  'fzc',
  'fzco',
  'fz',
  'ltd',
  'limited',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'est',
  'establishment',
  'wll',
  'pjsc',
  'jsc',
  'dmcc',
  'pvt',
  'private',
  'plc',
  'gmbh',
  'sa',
  'ag',
  'bv',
  'nv',
  'sdn',
  'bhd',

  // Water treatment & generic B2B / engineering industry terms
  'water',
  'treatment',
  'technologies',
  'technology',
  'tech',
  'solutions',
  'solution',
  'systems',
  'system',
  'components',
  'component',
  'equipment',
  'equipments',
  'trading',
  'trade',
  'traders',
  'services',
  'service',
  'engineering',
  'engineer',
  'engineers',
  'contracting',
  'contractors',
  'contractor',
  'general',
  'technical',
  'environmental',
  'environment',
  'facility',
  'facilities',
  'management',
  'maintenance',
  'industrial',
  'industries',
  'industry',
  'international',
  'intl',
  'global',
  'group',
  'holding',
  'holdings',
  'projects',
  'project',
  'products',
  'product',
  'supplies',
  'supply',
  'materials',
  'material',
  'energy',
  'power',
  'pools',
  'pool',
  'cleaning',
  'waste',
  'wastewater',
  'desalination',
  'filtration',
  'electromechanical',
  'mechanical',
  'mep',
  'enterprises',
  'enterprise',
  'ventures',
  'distribution',
  'distributors',
  'manufacturing',
  'mfg',
  'factory',
  'works',
  'consultancy',
  'consulting',
  'consultants',

  // Regions & grammatical connectors
  'middle',
  'east',
  'gulf',
  'me',
  'mena',
  'uae',
  'dubai',
  'sharjah',
  'ajman',
  'abu',
  'dhabi',
  'oman',
  'muscat',
  'qatar',
  'doha',
  'saudi',
  'arabia',
  'ksa',
  'kuwait',
  'bahrain',
  'and',
  'of',
  'the',
  'for',
  'in',
  'at',
  'by',
  'al',
  'el',
  'bin'
]);

/**
 * Legacy array export kept for backwards compatibility with callers importing B2B_STOP_WORDS.
 */
export const B2B_STOP_WORDS: string[] = Array.from(COMPANY_GENERIC_STOP_WORDS);

const CONTACT_HONORIFICS = new Set<string>([
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'eng',
  'engr',
  'prof',
  'sir',
  'shk',
  'sheikh',
  'm',
  'mister'
]);

export type MatchConfidence = 'exact' | 'high' | 'medium' | 'none';

export interface CompanyMatchResult {
  match: Company;
  similarity: number;
  reason: string;
}

export interface ContactMatchResult {
  match: Contact;
  similarity: number;
  reason: string;
}

export interface BestCompanyMatchResult {
  match: Company | null;
  confidence: MatchConfidence;
  score: number;
  reason: string;
  blockedAsOwnCompany?: boolean;
}

export interface FindBestCompanyMatchOptions {
  excludeCompanyId?: string;
  ownCompanyNames?: string[];
}

export interface ExtractedContactInput {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface BestContactMatchResult {
  match: Contact | null;
  confidence: MatchConfidence;
  score: number;
  reason: string;
  blockedAsOwnSignatory?: boolean;
}

export interface FindBestContactMatchOptions {
  excludeContactId?: string;
  ownSignatoryNames?: string[];
  ownSignatoryEmails?: string[];
}

/**
 * Calculates the Levenshtein distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Collapses dotted legal abbreviations (e.g. "L.L.C." -> "llc", "W.L.L." -> "wll")
 * and splits text into clean lowercase alphanumeric tokens.
 */
function tokenizeNormalized(raw: string): string[] {
  if (!raw) return [];
  const collapsedDotted = raw
    .toLowerCase()
    .replace(/\b([a-z])\.([a-z])\.([a-z])\.?\b/g, '$1$2$3')
    .replace(/\b([a-z])\.([a-z])\.?\b/g, '$1$2')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ');

  return collapsedDotted
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/**
 * Splits a company name into its distinctive core brand tokens vs. generic legal/industry tokens.
 */
export function extractCompanyTokens(name: string): {
  allTokens: string[];
  coreTokens: string[];
  genericTokens: string[];
} {
  const allTokens = tokenizeNormalized(name);
  const coreTokens: string[] = [];
  const genericTokens: string[] = [];

  for (const tok of allTokens) {
    if (COMPANY_GENERIC_STOP_WORDS.has(tok) || (tok.length === 1 && !/\d/.test(tok))) {
      genericTokens.push(tok);
    } else {
      coreTokens.push(tok);
    }
  }

  return { allTokens, coreTokens, genericTokens };
}

/**
 * Sanitizes a company name by removing punctuation and generic legal/B2B stop words.
 */
export function sanitizeCompanyName(name: string): string {
  if (!name) return '';
  return extractCompanyTokens(name).coreTokens.join(' ').trim();
}

/**
 * Scores a pair of distinctive core tokens strictly.
 * Returns 0 unless tokens are an exact match, strong prefix match (len >= 4),
 * or tight edit distance (1 edit for len >= 4, 2 edits for len >= 7).
 */
function scoreCoreTokenPair(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);

  if (minLen < 4) {
    return 0;
  }

  // Tight edit distance check
  const dist = levenshteinDistance(a, b);
  if (dist === 1) {
    return 0.90;
  }
  if (minLen >= 7 && dist === 2) {
    return 0.84;
  }

  // Strong prefix match (e.g. "veolia" vs "veolias" or "metic" vs "meticchem" when close in length)
  if ((a.startsWith(b) || b.startsWith(a)) && minLen / maxLen >= 0.72) {
    return 0.86;
  }

  return 0;
}

/**
 * Checks whether a 3–5 character distinctive acronym token (e.g. "vwt") matches
 * the initials of the other company's non-legal words (e.g. "Veolia Water Technologies").
 */
function isAcronymOfCompany(shortToken: string, otherName: string): boolean {
  if (!shortToken || shortToken.length < 3 || shortToken.length > 5) return false;
  if (!/^[a-z]+$/.test(shortToken)) return false;

  const legalOnly = new Set([
    'llc', 'fze', 'fzc', 'fzco', 'ltd', 'limited', 'inc', 'corp', 'co', 'est', 'wll', 'pjsc', 'dmcc', 'and', 'of', 'the'
  ]);
  const words = tokenizeNormalized(otherName).filter((w) => !legalOnly.has(w));
  if (words.length < 2) return false;

  const initials = words.map((w) => w[0]).join('');
  return initials === shortToken;
}

/**
 * Evaluates similarity between two company names using the Industry-Aware
 * Distinctive-Token Guard. Overlapping generic terms (e.g. "water" + "technologies")
 * alone ALWAYS return 0.
 */
export function evaluateCompanyPairScore(nameA: string, nameB: string): {
  score: number;
  confidence: MatchConfidence;
  reason: string;
} {
  if (!nameA || !nameB) {
    return { score: 0, confidence: 'none', reason: 'Empty name' };
  }

  const rawCompactA = nameA.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawCompactB = nameB.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!rawCompactA || !rawCompactB) {
    return { score: 0, confidence: 'none', reason: 'Empty normalized name' };
  }
  if (rawCompactA === rawCompactB) {
    return { score: 1.0, confidence: 'exact', reason: 'Exact company name match' };
  }

  const tokA = extractCompanyTokens(nameA);
  const tokB = extractCompanyTokens(nameB);

  // Case 1: Extracted name has distinctive core brand tokens (e.g. "veolia", "manba", "rayyan")
  if (tokA.coreTokens.length > 0) {
    // Check exact acronym shortcut (e.g. "VWT" <-> "Veolia Water Technologies")
    if (
      (tokA.coreTokens.length === 1 && isAcronymOfCompany(tokA.coreTokens[0], nameB)) ||
      (tokB.coreTokens.length === 1 && isAcronymOfCompany(tokB.coreTokens[0], nameA))
    ) {
      return {
        score: 0.86,
        confidence: 'high',
        reason: 'Acronym match on company initials'
      };
    }

    // Hard Match Rule: candidate MUST also have distinctive core tokens that match
    if (tokB.coreTokens.length === 0) {
      return {
        score: 0,
        confidence: 'none',
        reason: 'Candidate has no distinctive core tokens'
      };
    }

    // Check exact equality of distinctive core token sequences (e.g. "Manba Al Rayyan Trading and Services LLC" vs "Manba Al Rayyan Trading & Services")
    if (tokA.coreTokens.join(' ') === tokB.coreTokens.join(' ')) {
      const genericSetB = new Set(tokB.genericTokens);
      const sharedGeneric = tokA.genericTokens.filter((g) => genericSetB.has(g)).length;
      const bonus = sharedGeneric > 0 ? 0.02 : 0;
      const score = Math.min(0.99, 0.96 + bonus);
      return {
        score,
        confidence: score >= 0.98 ? 'exact' : 'high',
        reason: `Exact distinctive core match (${tokA.coreTokens.join(' ')})`
      };
    }

    // Evaluate best core token match from A -> B and B -> A
    const matchedFromA: number[] = [];
    const matchedCoreWords: string[] = [];
    for (const a of tokA.coreTokens) {
      let best = 0;
      for (const b of tokB.coreTokens) {
        const s = scoreCoreTokenPair(a, b);
        if (s > best) best = s;
      }
      if (best >= 0.84) {
        matchedFromA.push(best);
        matchedCoreWords.push(a);
      }
    }

    // HARD GUARD: Zero distinctive core token matches => NEVER match!
    if (matchedFromA.length === 0) {
      return {
        score: 0,
        confidence: 'none',
        reason: 'No matching distinctive core token'
      };
    }

    let matchedFromBCount = 0;
    for (const b of tokB.coreTokens) {
      let best = 0;
      for (const a of tokA.coreTokens) {
        const s = scoreCoreTokenPair(b, a);
        if (s > best) best = s;
      }
      if (best >= 0.84) matchedFromBCount += 1;
    }

    const recallA = matchedFromA.length / tokA.coreTokens.length;
    const recallB = matchedFromBCount / tokB.coreTokens.length;
    const harmonicCoverage =
      recallA + recallB > 0 ? (2 * recallA * recallB) / (recallA + recallB) : 0;
    const avgStrength =
      matchedFromA.reduce((sum, v) => sum + v, 0) / matchedFromA.length;

    // Combine core coverage & strength (generic tokens can only provide a tiny tie-breaker <= 0.03)
    const genericSetB = new Set(tokB.genericTokens);
    const sharedGeneric = tokA.genericTokens.filter((g) => genericSetB.has(g)).length;
    const genericTieBreaker = sharedGeneric > 0 ? Math.min(0.03, sharedGeneric * 0.015) : 0;

    // Require strong coverage across distinctive core tokens so e.g. "Alpha Beta" doesn't auto-pair "Alpha Gamma"
    const score = Math.min(0.99, harmonicCoverage * avgStrength + genericTieBreaker);

    if (score >= 0.98) {
      return {
        score,
        confidence: 'exact',
        reason: `Exact core match (${matchedCoreWords.join(', ')})`
      };
    }
    if (score >= 0.84) {
      return {
        score,
        confidence: 'high',
        reason: `Strong distinctive core match (${matchedCoreWords.join(', ')})`
      };
    }
    if (score >= 0.72) {
      return {
        score,
        confidence: 'medium',
        reason: `Partial core match (${matchedCoreWords.join(', ')})`
      };
    }

    return {
      score,
      confidence: 'none',
      reason: 'Insufficient core token agreement'
    };
  }

  // Case 2: Rare fallback when extracted name has NO distinctive core tokens (e.g. literally "Gulf Water Treatment")
  // Require very tight agreement on full non-legal token list
  if (tokB.coreTokens.length > 0) {
    return {
      score: 0,
      confidence: 'none',
      reason: 'Extracted name is generic-only while candidate has distinctive brand tokens'
    };
  }

  const legalOnly = new Set(['llc', 'fze', 'fzc', 'fzco', 'ltd', 'limited', 'inc', 'corp', 'co', 'est', 'wll', 'pjsc', 'dmcc']);
  const sigA = tokA.allTokens.filter((t) => !legalOnly.has(t));
  const sigB = tokB.allTokens.filter((t) => !legalOnly.has(t));
  if (sigA.length === 0 || sigB.length === 0) {
    return { score: 0, confidence: 'none', reason: 'Only legal suffixes present' };
  }
  const strA = sigA.join(' ');
  const strB = sigB.join(' ');
  if (strA === strB) {
    return { score: 0.95, confidence: 'high', reason: 'Exact generic company name match' };
  }
  const dist = levenshteinDistance(strA.replace(/\s+/g, ''), strB.replace(/\s+/g, ''));
  const maxLen = Math.max(strA.replace(/\s+/g, '').length, strB.replace(/\s+/g, '').length);
  const sim = maxLen > 0 ? Math.max(0, 1 - dist / maxLen) : 0;
  if (sim >= 0.90) {
    return { score: sim, confidence: 'high', reason: 'Very tight generic name match' };
  }
  return { score: 0, confidence: 'none', reason: 'Generic names do not match tightly' };
}

/**
 * Generic corporate modifiers that frequently prefix unrelated client names
 * (e.g., "Advanced Engineering LLC", "Advanced Water Solutions FZE") and must NEVER alone
 * trigger own-company blocking against own workspace names like "Advanced Nirvana Water".
 */
const OWN_COMPANY_NON_ANCHOR_MODIFIERS = new Set([
  'advanced', 'modern', 'united', 'national', 'emirates', 'gulf', 'arabian',
  'prime', 'smart', 'pro', 'first', 'elite', 'royal', 'apex', 'alpha',
  'star', 'new', 'best', 'global', 'international', 'arab', 'middle', 'east',
  'al', 'future', 'dynamic', 'universal', 'superior', 'premier', 'total',
  'integrated', 'innovative', 'green', 'eco', 'pure', 'clean', 'blue'
]);

const OWN_COMPANY_LEGAL_SUFFIXES = new Set([
  'llc', 'fze', 'fzc', 'fzco', 'ltd', 'limited', 'inc', 'corp', 'co', 'est', 'wll', 'pjsc', 'dmcc'
]);

/**
 * Checks whether a candidate or extracted company name matches our own workspace company
 * (Sender-vs-Recipient Guard).
 */
export function isOwnWorkspaceCompanyName(
  candidateName: string | null | undefined,
  ownCompanyNames: string[] = []
): boolean {
  if (!candidateName || !candidateName.trim()) return false;
  const cleanOwnNames = ownCompanyNames.map((n) => String(n || '').trim()).filter(Boolean);
  if (cleanOwnNames.length === 0) return false;

  const candTok = extractCompanyTokens(candidateName);
  const candCore = candTok.coreTokens;
  const candAnchorTokens = candCore.filter((t) => !OWN_COMPANY_NON_ANCHOR_MODIFIERS.has(t));

  for (const own of cleanOwnNames) {
    const ownTok = extractCompanyTokens(own);
    const ownCore = ownTok.coreTokens;
    const ownAnchorTokens = ownCore.filter((t) => !OWN_COMPANY_NON_ANCHOR_MODIFIERS.has(t));

    if (ownAnchorTokens.length > 0) {
      // Own workspace name has distinctive brand anchor token(s) (e.g. "nirvana", "aventura").
      // Require ALL distinctive anchor tokens to match so generic modifiers like "Advanced"
      // never falsely block legitimate clients such as "Advanced Engineering LLC".
      const matchesAllOwnAnchors = ownAnchorTokens.every((o) =>
        candCore.some((c) => scoreCoreTokenPair(c, o) >= 0.90)
      );
      if (!matchesAllOwnAnchors) {
        continue;
      }

      const res = evaluateCompanyPairScore(candidateName, own);
      if (res.confidence === 'exact' || res.confidence === 'high') {
        return true;
      }

      // Also catch short brand references like "Aventura", "Nirvana Water", or "Advanced Nirvana"
      // when every core token in the candidate belongs to the own company and at least one
      // distinctive brand anchor token is present.
      if (
        candAnchorTokens.length > 0 &&
        candCore.length > 0 &&
        candCore.every((c) => ownCore.some((o) => scoreCoreTokenPair(c, o) >= 0.90))
      ) {
        return true;
      }
      continue;
    }

    // Fallback when an own-company name contains only generic/modifier words (no unique brand anchor):
    // require tight full non-legal name agreement so generic modifiers never block unrelated clients.
    const sigCand = candTok.allTokens.filter((t) => !OWN_COMPANY_LEGAL_SUFFIXES.has(t)).join(' ');
    const sigOwn = ownTok.allTokens.filter((t) => !OWN_COMPANY_LEGAL_SUFFIXES.has(t)).join(' ');
    if (sigCand && sigOwn) {
      if (sigCand === sigOwn) {
        return true;
      }
      const compactCand = sigCand.replace(/\s+/g, '');
      const compactOwn = sigOwn.replace(/\s+/g, '');
      const dist = levenshteinDistance(compactCand, compactOwn);
      const maxLen = Math.max(compactCand.length, compactOwn.length);
      if (maxLen > 0 && 1 - dist / maxLen >= 0.90) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Dedicated industry-aware company matcher with Distinctive-Token Guard
 * and Sender-vs-Recipient protection.
 */
export function findBestCompanyMatch(
  extractedName: string | null | undefined,
  companies: Company[],
  options: FindBestCompanyMatchOptions = {}
): BestCompanyMatchResult {
  const targetName = String(extractedName || '').trim();
  if (targetName.length < 2) {
    return { match: null, confidence: 'none', score: 0, reason: 'No company name provided' };
  }

  const ownNames = options.ownCompanyNames || [];
  if (isOwnWorkspaceCompanyName(targetName, ownNames)) {
    return {
      match: null,
      confidence: 'none',
      score: 0,
      reason: `Blocked "${targetName}" because it matches own workspace company`,
      blockedAsOwnCompany: true
    };
  }

  let bestCompany: Company | null = null;
  let bestScore = 0;
  let bestConfidence: MatchConfidence = 'none';
  let bestReason = 'No matching company in registry';

  for (const comp of companies || []) {
    if (!comp || (comp as any).is_deleted) continue;
    if (options.excludeCompanyId && comp.id === options.excludeCompanyId) continue;

    const candidateNames = [
      comp.display_name,
      comp.canonical_name,
      ...(Array.isArray(comp.aliases) ? comp.aliases : [])
    ]
      .map((n) => String(n || '').trim())
      .filter(Boolean);

    // Skip any registry company that is actually our own workspace company
    if (candidateNames.some((n) => isOwnWorkspaceCompanyName(n, ownNames))) {
      continue;
    }

    for (const candName of candidateNames) {
      const evaluated = evaluateCompanyPairScore(targetName, candName);
      if (evaluated.score > bestScore) {
        bestScore = evaluated.score;
        bestCompany = comp;
        bestConfidence = evaluated.confidence;
        bestReason = `${evaluated.reason} ("${candName}")`;
      }
    }
  }

  if (bestCompany && bestConfidence !== 'none') {
    return {
      match: bestCompany,
      confidence: bestConfidence,
      score: bestScore,
      reason: bestReason
    };
  }

  return {
    match: null,
    confidence: 'none',
    score: 0,
    reason: bestReason
  };
}

/**
 * Strips honorific titles (Mr., Mrs., Dr., Eng., etc.) and tokenizes a person's name.
 */
export function normalizeContactPersonTokens(rawName?: string | null): string[] {
  if (!rawName) return [];
  // Strip parenthetical designation suffixes if embedded (e.g. "Mr. Nihad Saleem (Sales Engineer)")
  const withoutParens = rawName.replace(/\([^)]*\)/g, ' ');
  return tokenizeNormalized(withoutParens).filter(
    (tok) => !CONTACT_HONORIFICS.has(tok) && tok.length > 0
  );
}

function scorePersonNamePair(nameA?: string | null, nameB?: string | null): {
  score: number;
  confidence: MatchConfidence;
} {
  const tokensA = normalizeContactPersonTokens(nameA);
  const tokensB = normalizeContactPersonTokens(nameB);
  if (tokensA.length === 0 || tokensB.length === 0) {
    return { score: 0, confidence: 'none' };
  }

  if (tokensA.join(' ') === tokensB.join(' ')) {
    return { score: 1.0, confidence: 'exact' };
  }

  const tokenMatches = (x: string, y: string): number => {
    if (x === y) return 1.0;
    const minLen = Math.min(x.length, y.length);
    if (minLen >= 4 && levenshteinDistance(x, y) === 1) return 0.90;
    if (minLen >= 7 && levenshteinDistance(x, y) === 2) return 0.84;
    return 0;
  };

  let matchedA = 0;
  let strengthSum = 0;
  for (const a of tokensA) {
    let best = 0;
    for (const b of tokensB) {
      const s = tokenMatches(a, b);
      if (s > best) best = s;
    }
    if (best >= 0.84) {
      matchedA += 1;
      strengthSum += best;
    }
  }

  if (matchedA === 0) {
    return { score: 0, confidence: 'none' };
  }

  let matchedB = 0;
  for (const b of tokensB) {
    let best = 0;
    for (const a of tokensA) {
      const s = tokenMatches(b, a);
      if (s > best) best = s;
    }
    if (best >= 0.84) matchedB += 1;
  }

  const avgStrength = strengthSum / matchedA;
  const minTokens = Math.min(tokensA.length, tokensB.length);
  const maxTokens = Math.max(tokensA.length, tokensB.length);

  // Full containment of all tokens of a 2+ word name (e.g. "Nihad Saleem" vs "Nihad M Saleem")
  if (minTokens >= 2 && (matchedA === tokensA.length || matchedB === tokensB.length)) {
    const score = Math.min(0.97, avgStrength * 0.96);
    return { score, confidence: 'high' };
  }

  // Single-word extracted name matching one full token (e.g. "Nihad" vs "Nihad Saleem")
  if (minTokens === 1 && matchedA === 1 && tokensA.length === 1 && tokensA[0].length >= 3) {
    return { score: 0.78, confidence: 'medium' };
  }

  // Multi-word names where only 1 of 2 words matches (e.g. "Nihad Saleem" vs "Nihad Khan"):
  // Treat as medium only if first/last token overlap is >= 50% and maxTokens <= 2, else none
  const coverage = (2 * matchedA) / (tokensA.length + tokensB.length);
  const score = coverage * avgStrength;
  if (score >= 0.84) {
    return { score, confidence: 'high' };
  }
  if (score >= 0.72 && maxTokens <= 2) {
    return { score, confidence: 'medium' };
  }

  return { score: 0, confidence: 'none' };
}

/**
 * Checks whether an extracted contact matches one of our own workspace signatories / salespersons.
 */
export function isOwnSignatoryContact(
  extracted: ExtractedContactInput | null | undefined,
  ownSignatoryNames: string[] = [],
  ownSignatoryEmails: string[] = []
): boolean {
  if (!extracted) return false;

  const normEmail = String(extracted.email || '').trim().toLowerCase();
  if (normEmail) {
    const ownEmailSet = new Set(
      ownSignatoryEmails.map((e) => String(e || '').trim().toLowerCase()).filter(Boolean)
    );
    if (ownEmailSet.has(normEmail)) return true;
  }

  const rawName = String(extracted.name || '').trim();
  if (rawName) {
    for (const ownName of ownSignatoryNames) {
      if (!ownName || !ownName.trim()) continue;
      const res = scorePersonNamePair(rawName, ownName);
      if (res.confidence === 'exact' || res.confidence === 'high') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Dedicated contact matcher that strictly requires an actual email, phone, or person-name match.
 * NEVER auto-defaults to an unrelated contact on the company.
 */
export function findBestContactMatch(
  extracted: ExtractedContactInput | null | undefined,
  contacts: Contact[] = [],
  options: FindBestContactMatchOptions = {}
): BestContactMatchResult {
  if (!extracted) {
    return { match: null, confidence: 'none', score: 0, reason: 'No extracted contact provided' };
  }

  const normEmail = String(extracted.email || '').trim().toLowerCase();
  const normPhone = String(extracted.phone || '').replace(/\D/g, '');
  const rawName = String(extracted.name || '').trim();

  if (!normEmail && normPhone.length < 7 && rawName.length < 2) {
    return { match: null, confidence: 'none', score: 0, reason: 'No contact identifiers provided' };
  }

  if (
    isOwnSignatoryContact(
      extracted,
      options.ownSignatoryNames || [],
      options.ownSignatoryEmails || []
    )
  ) {
    return {
      match: null,
      confidence: 'none',
      score: 0,
      reason: `Blocked "${rawName || normEmail}" because it matches own workspace signatory`,
      blockedAsOwnSignatory: true
    };
  }

  let bestContact: Contact | null = null;
  let bestScore = 0;
  let bestConfidence: MatchConfidence = 'none';
  let bestReason = 'No matching contact found';

  for (const contact of contacts || []) {
    if (!contact) continue;
    if (options.excludeContactId && contact.id === options.excludeContactId) continue;

    // Never pair our own signatory even if present in contacts list
    if (
      isOwnSignatoryContact(
        { name: contact.full_name, email: contact.email },
        options.ownSignatoryNames || [],
        options.ownSignatoryEmails || []
      )
    ) {
      continue;
    }

    // 1. Exact email match
    const candEmail = String(contact.email || '').trim().toLowerCase();
    if (normEmail && candEmail && candEmail === normEmail) {
      return {
        match: contact,
        confidence: 'exact',
        score: 1.0,
        reason: `Exact email match (${contact.email})`
      };
    }

    // 2. Person name match
    const nameEval = rawName ? scorePersonNamePair(rawName, contact.full_name) : { score: 0, confidence: 'none' as MatchConfidence };
    if (nameEval.score > bestScore && nameEval.confidence !== 'none') {
      bestScore = nameEval.score;
      bestContact = contact;
      bestConfidence = nameEval.confidence;
      bestReason = `Contact name match (${Math.round(nameEval.score * 100)}% with "${contact.full_name}")`;
    }

    // 3. Exact phone match — ONLY if extracted name is blank OR does not explicitly belong to a different person
    const candDigits = String(contact.mobile || contact.landline || '').replace(/\D/g, '');
    if (
      normPhone.length >= 7 &&
      candDigits.length >= 7 &&
      (candDigits === normPhone || candDigits.includes(normPhone) || normPhone.includes(candDigits))
    ) {
      const hasConflictingPersonName =
        rawName.length >= 3 &&
        normalizeContactPersonTokens(contact.full_name).length > 0 &&
        nameEval.confidence === 'none';

      if (!hasConflictingPersonName && 0.92 > bestScore) {
        bestScore = 0.92;
        bestContact = contact;
        bestConfidence = 'high';
        bestReason = `Matching phone number (${contact.mobile || contact.landline})`;
      }
    }
  }

  if (bestContact && bestConfidence !== 'none') {
    return {
      match: bestContact,
      confidence: bestConfidence,
      score: bestScore,
      reason: bestReason
    };
  }

  return {
    match: null,
    confidence: 'none',
    score: 0,
    reason: bestReason
  };
}

/**
 * Returns a normalized similarity score between 0 and 1 using the
 * industry-aware distinctive-token company comparator.
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return evaluateCompanyPairScore(a, b).score;
}

/**
 * Searches for a potential duplicate company in existing records.
 */
export function findDuplicateCompany(
  searchName: string,
  companies: Company[],
  excludeCompanyId?: string
): CompanyMatchResult | null {
  if (!searchName || searchName.trim().length < 2) return null;

  const res = findBestCompanyMatch(searchName, companies, { excludeCompanyId });
  if (res.match && res.score > 0.85) {
    return {
      match: res.match,
      similarity: res.score,
      reason: res.reason
    };
  }

  return null;
}

/**
 * Searches for a potential duplicate contact in existing records.
 */
export function findDuplicateContact(
  name?: string,
  email?: string,
  phone?: string,
  contacts: Contact[] = [],
  excludeContactId?: string
): ContactMatchResult | null {
  if (!contacts || contacts.length === 0) return null;

  const res = findBestContactMatch({ name, email, phone }, contacts, { excludeContactId });
  if (res.match && res.score > 0.85) {
    return {
      match: res.match,
      similarity: res.score,
      reason: res.reason
    };
  }

  return null;
}
