/**
 * Unit Test Suite for Industry-Aware Company & Contact Fuzzy Matching (Track S1):
 * - Distinctive-Token Guard against generic water-treatment & legal stop-words
 * - Strict Contact Pairing (no false defaults or mismatched names)
 * - Sender-vs-Recipient Guard (own workspace companies & signatories)
 *
 * Execute directly via `npx tsx src/__tests__/fuzzyMatch.test.ts`.
 */

import type { Company, Contact } from '../types';
import {
  extractCompanyTokens,
  findBestCompanyMatch,
  findBestContactMatch,
  isOwnWorkspaceCompanyName,
  isOwnSignatoryContact
} from '../utils/fuzzyMatch';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];
let currentSuite = 'Fuzzy Match';

function describe(name: string, fn: () => void) {
  currentSuite = name;
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    testResults.push({ suite: currentSuite, name, passed: true });
  } catch (err: any) {
    testResults.push({
      suite: currentSuite,
      name,
      passed: false,
      error: err?.message || String(err)
    });
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected deep equal ${b}, received ${a}`);
      }
    }
  };
}

const makeCompany = (id: string, display_name: string, aliases: string[] = []): Company =>
  ({
    id,
    display_name,
    canonical_name: display_name.toLowerCase(),
    aliases,
    city: 'Dubai',
    country: 'UAE'
  }) as unknown as Company;

const makeContact = (
  id: string,
  company_id: string,
  full_name: string,
  email?: string,
  mobile?: string,
  designation?: string
): Contact =>
  ({
    id,
    company_id,
    full_name,
    email,
    mobile,
    designation
  }) as unknown as Contact;

// ==========================================
// SUITE 1: INDUSTRY-AWARE COMPANY MATCHING
// ==========================================

describe('Industry-Aware Company Matching (Distinctive-Token Guard)', () => {
  const existingUnrelatedWaterCompanies: Company[] = [
    makeCompany('c_wmt', 'Water Matrix Technologies FZE'),
    makeCompany('c_gwt', 'Gulf Water Treatment Co. LTD'),
    makeCompany('c_swe', 'Sustainable Water and Energy'),
    makeCompany('c_mar', 'Manba Al Rayyan Trading & Services'),
    makeCompany('c_avc', 'Aventura Components FZE')
  ];

  it('extractCompanyTokens separates distinctive core brand tokens from generic industry & legal words', () => {
    expect(extractCompanyTokens('VEOLIA WATER TECHNOLOGIES').coreTokens).toEqual(['veolia']);
    expect(extractCompanyTokens('Water Matrix Technologies FZE').coreTokens).toEqual(['matrix']);
    expect(extractCompanyTokens('Gulf Water Treatment Co. LTD').coreTokens).toEqual([]);
    expect(extractCompanyTokens('Manba Al Rayyan Trading and Services LLC').coreTokens).toEqual([
      'manba',
      'rayyan'
    ]);
  });

  it('Veolia Water Technologies does NOT match Water Matrix Technologies FZE, Gulf Water Treatment Co. LTD, or Sustainable Water and Energy', () => {
    const res = findBestCompanyMatch('VEOLIA WATER TECHNOLOGIES', existingUnrelatedWaterCompanies);
    expect(res.match).toBe(null);
    expect(res.confidence).toBe('none');
    expect(res.score).toBe(0);
  });

  it('Manba Al Rayyan Trading and Services LLC DOES match Manba Al Rayyan Trading & Services with high/exact confidence', () => {
    const res = findBestCompanyMatch(
      'Manba Al Rayyan Trading and Services LLC',
      existingUnrelatedWaterCompanies
    );
    expect(res.match?.id).toBe('c_mar');
    expect(res.confidence === 'exact' || res.confidence === 'high').toBe(true);
  });

  it('Veolia Water Technologies DOES match Veolia Water Solutions & Technologies', () => {
    const registryWithVeolia: Company[] = [
      ...existingUnrelatedWaterCompanies,
      makeCompany('c_veolia', 'Veolia Water Solutions & Technologies')
    ];
    const res = findBestCompanyMatch('VEOLIA WATER TECHNOLOGIES', registryWithVeolia);
    expect(res.match?.id).toBe('c_veolia');
    expect(res.confidence === 'exact' || res.confidence === 'high').toBe(true);
  });

  it('tolerates minor typo on a distinctive core token (>=4 chars) without allowing unrelated core brands', () => {
    const registryWithVeolia: Company[] = [
      ...existingUnrelatedWaterCompanies,
      makeCompany('c_veolia', 'Veolia Water Solutions & Technologies')
    ];
    const typoRes = findBestCompanyMatch('Veola Water Technologies', registryWithVeolia);
    expect(typoRes.match?.id).toBe('c_veolia');
    expect(typoRes.confidence === 'high' || typoRes.confidence === 'exact').toBe(true);

    const unrelatedRes = findBestCompanyMatch('AquaPure Water Technologies', registryWithVeolia);
    expect(unrelatedRes.match).toBe(null);
    expect(unrelatedRes.confidence).toBe('none');
  });

  it('rejects partial conflicting multi-brand names (e.g. Alpha Beta Water vs Alpha Gamma Water)', () => {
    const res = findBestCompanyMatch('Alpha Beta Water Systems LLC', [
      makeCompany('c_ag', 'Alpha Gamma Water Technologies FZE')
    ]);
    expect(res.match).toBe(null);
    expect(res.confidence).toBe('none');
  });
});

// ==========================================
// SUITE 2: CONTACT INTEGRITY & MATCHING
// ==========================================

describe('Strict Contact Matching (Contact Integrity Rule)', () => {
  const companyContacts: Contact[] = [
    makeContact(
      'ct_rajesh',
      'c_wmt',
      'Rajesh Pillai',
      'rajesh@watermatrix.ae',
      '+971 50 111 2222',
      'General Manager – Sales & Projects'
    ),
    makeContact(
      'ct_nihad',
      'c_veolia',
      'Nihad Saleem',
      'nihad.saleem@veolia.com',
      '+971 55 333 4444',
      'Sales Engineer - Techno Products & Services'
    )
  ];

  it('rejects Rajesh Pillai when extracted contact is Mr. Nihad Saleem', () => {
    const res = findBestContactMatch(
      { name: 'Mr. Nihad Saleem (Sales Engineer - Techno Products & Services)' },
      [companyContacts[0]]
    );
    expect(res.match).toBe(null);
    expect(res.confidence).toBe('none');
  });

  it('matches Mr. Nihad Saleem to Nihad Saleem after stripping honorifics and designation', () => {
    const res = findBestContactMatch(
      { name: 'Mr. Nihad Saleem (Sales Engineer - Techno Products & Services)' },
      companyContacts
    );
    expect(res.match?.id).toBe('ct_nihad');
    expect(res.confidence).toBe('exact');
  });

  it('matches by exact email even when name formatting differs', () => {
    const res = findBestContactMatch(
      { name: 'N. Saleem', email: 'NIHAD.SALEEM@VEOLIA.COM' },
      companyContacts
    );
    expect(res.match?.id).toBe('ct_nihad');
    expect(res.confidence).toBe('exact');
  });

  it('does not auto-pair a different person sharing the same office landline when names conflict', () => {
    const res = findBestContactMatch(
      { name: 'Mr. Nihad Saleem', phone: '+971 50 111 2222' },
      [companyContacts[0]]
    );
    expect(res.match).toBe(null);
    expect(res.confidence).toBe('none');
  });
});

// ==========================================
// SUITE 3: SENDER-VS-RECIPIENT GUARD
// ==========================================

describe('Sender-vs-Recipient Guard (Own Workspace & Signatories)', () => {
  const ownCompanies = ['Aventura Components FZE', 'Advanced Nirvana Water Treatment'];
  const ownSignatories = ['Nitin Srivastava', 'Pawan Verma'];
  const ownEmails = ['nitin@aventuracomponents.com'];

  it('blocks own workspace companies (Aventura Components / Advanced Nirvana Water) from matching as client', () => {
    expect(isOwnWorkspaceCompanyName('Aventura Components (FZE)', ownCompanies)).toBe(true);
    expect(isOwnWorkspaceCompanyName('Advanced Nirvana Water', ownCompanies)).toBe(true);
    expect(isOwnWorkspaceCompanyName('Veolia Water Technologies', ownCompanies)).toBe(false);

    const blockedRes = findBestCompanyMatch(
      'Aventura Components FZE',
      [makeCompany('c_avc', 'Aventura Components FZE')],
      { ownCompanyNames: ownCompanies }
    );
    expect(blockedRes.match).toBe(null);
    expect(blockedRes.confidence).toBe('none');
    expect(blockedRes.blockedAsOwnCompany).toBe(true);
  });

  it('blocks own signatories (Nitin Srivastava / Pawan Verma) from matching as client contact', () => {
    expect(
      isOwnSignatoryContact({ name: 'Mr. Nitin Srivastava' }, ownSignatories, ownEmails)
    ).toBe(true);
    expect(isOwnSignatoryContact({ name: 'Pawan Verma' }, ownSignatories, ownEmails)).toBe(true);
    expect(
      isOwnSignatoryContact({ name: 'Mr. Nihad Saleem' }, ownSignatories, ownEmails)
    ).toBe(false);

    const blockedContact = findBestContactMatch(
      { name: 'Nitin Srivastava' },
      [makeContact('ct_nitin', 'c_any', 'Nitin Srivastava')],
      { ownSignatoryNames: ownSignatories, ownSignatoryEmails: ownEmails }
    );
    expect(blockedContact.match).toBe(null);
    expect(blockedContact.confidence).toBe('none');
    expect(blockedContact.blockedAsOwnSignatory).toBe(true);
  });
});

// ==========================================
// TEST REPORT SUMMARY
// ==========================================

const passedCount = testResults.filter((r) => r.passed).length;
const failedCount = testResults.filter((r) => !r.passed).length;

console.log('----------------------------------------------------');
console.log(`[FUZZY MATCH TEST SUITE] Results: ${passedCount} Passed, ${failedCount} Failed`);
console.log('----------------------------------------------------');

if (failedCount > 0) {
  testResults
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.error(`FAIL: [${r.suite}] ${r.name} -> ${r.error}`);
    });
  throw new Error(`${failedCount} fuzzy match unit tests failed!`);
}

if (typeof process !== 'undefined' && process.exit) {
  process.exit(0);
}
