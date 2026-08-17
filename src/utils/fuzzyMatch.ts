import { Company, Contact } from '../types';

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
      if (a[i - 1] === b[i - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Returns a normalized similarity score between 0 and 1.
 * 1 means exact match, 0 means completely different.
 */
export function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const strA = a.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  const strB = b.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (strA === strB) return 1;
  if (!strA || !strB) return 0;

  // Check substring containment
  if (strA.includes(strB) || strB.includes(strA)) {
    const minLen = Math.min(strA.length, strB.length);
    const maxLen = Math.max(strA.length, strB.length);
    if (minLen / maxLen >= 0.6) {
      return 0.88;
    }
  }

  const distance = levenshteinDistance(strA, strB);
  const maxLen = Math.max(strA.length, strB.length);
  return Math.max(0, 1 - distance / maxLen);
}

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

/**
 * Searches for a potential duplicate company in existing records.
 */
export function findDuplicateCompany(
  searchName: string,
  companies: Company[],
  excludeCompanyId?: string
): CompanyMatchResult | null {
  if (!searchName || searchName.trim().length < 2) return null;

  const targetName = searchName.trim();

  let bestMatch: Company | null = null;
  let highestSimilarity = 0;
  let matchReason = '';

  for (const comp of companies) {
    if (excludeCompanyId && comp.id === excludeCompanyId) continue;

    // Direct name similarity
    const compName = comp.display_name || comp.canonical_name || '';
    const sim = stringSimilarity(targetName, compName);
    if (sim > highestSimilarity) {
      highestSimilarity = sim;
      bestMatch = comp;
      matchReason = `Similar company name (${Math.round(sim * 100)}% match with "${compName}")`;
    }

    // Check aliases
    if (comp.aliases && Array.isArray(comp.aliases)) {
      for (const alias of comp.aliases) {
        if (!alias) continue;
        const aliasSim = stringSimilarity(targetName, alias);
        if (aliasSim > highestSimilarity) {
          highestSimilarity = aliasSim;
          bestMatch = comp;
          matchReason = `Similar company alias (${Math.round(aliasSim * 100)}% match with "${alias}")`;
        }
      }
    }
  }

  // Consider match if similarity is 70% or higher
  if (bestMatch && highestSimilarity >= 0.70) {
    return {
      match: bestMatch,
      similarity: highestSimilarity,
      reason: matchReason,
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

  const normEmail = email?.trim().toLowerCase();
  const normPhone = phone?.replace(/\D/g, '');

  let bestMatch: Contact | null = null;
  let highestSimilarity = 0;
  let matchReason = '';

  for (const contact of contacts) {
    if (excludeContactId && contact.id === excludeContactId) continue;

    const contactFullName = contact.full_name || '';
    const contactPhoneNum = contact.mobile || contact.landline || '';

    // Exact email match
    if (normEmail && contact.email?.trim().toLowerCase() === normEmail) {
      return {
        match: contact,
        similarity: 1.0,
        reason: `Exact email match (${contact.email})`,
      };
    }

    // Exact phone match
    if (normPhone && normPhone.length >= 7) {
      const existingDigits = contactPhoneNum.replace(/\D/g, '');
      if (existingDigits.length >= 7 && (existingDigits === normPhone || existingDigits.includes(normPhone) || normPhone.includes(existingDigits))) {
        return {
          match: contact,
          similarity: 0.95,
          reason: `Matching phone number (${contactPhoneNum})`,
        };
      }
    }

    // Fuzzy name match
    if (name && name.trim().length >= 2 && contactFullName.length >= 2) {
      const sim = stringSimilarity(name, contactFullName);
      if (sim > highestSimilarity) {
        highestSimilarity = sim;
        bestMatch = contact;
        matchReason = `Similar contact name (${Math.round(sim * 100)}% match with "${contactFullName}")`;
      }
    }
  }

  if (bestMatch && highestSimilarity >= 0.72) {
    return {
      match: bestMatch,
      similarity: highestSimilarity,
      reason: matchReason,
    };
  }

  return null;
}
