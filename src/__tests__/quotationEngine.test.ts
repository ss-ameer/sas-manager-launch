/**
 * Comprehensive Unit Test Suite for Quotation Engine, Suffix Sanitizer,
 * Currency Math Precision, and Signatory Attribution.
 *
 * Can be verified via `tsc --noEmit` and executed directly via `tsx src/__tests__/quotationEngine.test.ts`.
 */

import { sanitizeCompanyNameAndSuffix } from '../components/companies/CreateCompanyModal';
import { amountToWords, formatAmountInWords } from '../utils/numberToWords';
import { QuotationPresetColumns } from '../types';

// ==========================================
// TEST UTILITY & ASSERTION HARNESS
// ==========================================

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];

function describe(suiteName: string, fn: () => void) {
  currentSuite = suiteName;
  fn();
}

let currentSuite = 'Default Suite';

function it(testName: string, fn: () => void) {
  try {
    fn();
    testResults.push({ suite: currentSuite, name: testName, passed: true });
  } catch (err: any) {
    testResults.push({
      suite: currentSuite,
      name: testName,
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
    toEqual(expected: any) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
      }
    },
    toBeCloseTo(expected: number, delta: number = 0.0001) {
      if (typeof actual !== 'number' || Math.abs(actual - expected) > delta) {
        throw new Error(`Expected ${actual} to be close to ${expected} within delta ${delta}`);
      }
    },
    toBeLessThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual > expected) {
        throw new Error(`Expected ${actual} to be <= ${expected}`);
      }
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (typeof actual !== 'number' || actual < expected) {
        throw new Error(`Expected ${actual} to be >= ${expected}`);
      }
    },
    toContain(expectedSubstr: string) {
      if (typeof actual !== 'string' || !actual.includes(expectedSubstr)) {
        throw new Error(`Expected "${actual}" to contain "${expectedSubstr}"`);
      }
    },
    notToContain(unexpectedSubstr: string) {
      if (typeof actual === 'string' && actual.includes(unexpectedSubstr)) {
        throw new Error(`Expected "${actual}" NOT to contain "${unexpectedSubstr}"`);
      }
    }
  };
}

// ==========================================
// 1. DYNAMIC 100% TABLE MATH EVALUATOR
// Matches QuotationDocument.tsx colWidths math
// ==========================================

export function computeQuotationColumnMath(visibleColumns: QuotationPresetColumns = {}) {
  const showBrand = visibleColumns.brand ?? true;
  const showModel = visibleColumns.model ?? true;
  const showOrigin = visibleColumns.origin ?? true;
  const showAvailability = visibleColumns.availability ?? true;
  const showUnitPrice = visibleColumns.unit_price ?? true;

  const slPct = 4;
  const qtyPct = 6;
  const uomPct = 5;
  const totalPct = 12;
  const unitPricePct = showUnitPrice ? 11 : 0;
  const brandPct = showBrand ? 7.5 : 0;
  const modelPct = showModel ? 7.5 : 0;
  const originPct = showOrigin ? 7.5 : 0;
  const deliveryPct = showAvailability ? 7.5 : 0;

  const otherColumnsSum =
    slPct +
    qtyPct +
    uomPct +
    totalPct +
    unitPricePct +
    brandPct +
    modelPct +
    originPct +
    deliveryPct;

  // Item & Description dynamically absorbs the exact remainder to lock the sum to 100%
  const descPct = Math.round((100 - otherColumnsSum) * 10) / 10;

  // Minimum pixel widths for A4 horizontal budget calculation
  const slMinPx = 24;
  const qtyMinPx = 34;
  const uomMinPx = 32;
  const totalMinPx = 70;
  const unitPriceMinPx = showUnitPrice ? 65 : 0;
  const brandMinPx = showBrand ? 55 : 0;
  const modelMinPx = showModel ? 55 : 0;
  const originMinPx = showOrigin ? 55 : 0;
  const deliveryMinPx = showAvailability ? 55 : 0;
  const descMinPx = 150; // Description minimum floor

  const totalMinPixelWidth =
    slMinPx +
    qtyMinPx +
    uomMinPx +
    totalMinPx +
    unitPriceMinPx +
    brandMinPx +
    modelMinPx +
    originMinPx +
    deliveryMinPx +
    descMinPx;

  const allColumns = [
    { key: 'sl', pct: slPct },
    { key: 'desc', pct: descPct },
    { key: 'qty', pct: qtyPct },
    { key: 'uom', pct: uomPct },
    { key: 'unitPrice', pct: unitPricePct },
    { key: 'brand', pct: brandPct },
    { key: 'model', pct: modelPct },
    { key: 'origin', pct: originPct },
    { key: 'delivery', pct: deliveryPct },
    { key: 'total', pct: totalPct }
  ];

  const activeColumns = allColumns.filter((col) => col.pct > 0);
  const totalPercentage = Math.round(activeColumns.reduce((sum, col) => sum + col.pct, 0) * 10) / 10;

  return {
    descPct,
    activeColumns,
    totalPercentage,
    totalMinPixelWidth,
    descMinPx
  };
}

// ==========================================
// 2. SIGNATORY ATTRIBUTION REGEX
// Matches QuotationStudioModal.tsx regex
// ==========================================

export const isInitialsOnly = (name?: string | null): boolean => {
  if (!name) return false;
  const trimmed = name.trim();
  return /^[A-Z]{2,3}$/.test(trimmed);
};

// ==========================================
// TEST SUITES EXECUTION
// ==========================================

describe('Dynamic 100% Table Math & A4 Canvas Budget', () => {
  // Generate all 32 combinations (2^5) of optional columns
  const options = ['brand', 'model', 'origin', 'availability', 'unit_price'] as const;

  for (let i = 0; i < 32; i++) {
    const config: QuotationPresetColumns = {
      brand: Boolean(i & 1),
      model: Boolean(i & 2),
      origin: Boolean(i & 4),
      availability: Boolean(i & 8),
      unit_price: Boolean(i & 16)
    };

    const label = `Combination #${i + 1} [brand:${config.brand ? 1 : 0}, model:${config.model ? 1 : 0}, origin:${config.origin ? 1 : 0}, delivery:${config.availability ? 1 : 0}, unitPrice:${config.unit_price ? 1 : 0}]`;

    it(`should sum to exactly 100.0% for ${label}`, () => {
      const math = computeQuotationColumnMath(config);
      expect(math.totalPercentage).toBe(100.0);
    });

    it(`should guarantee description percentage >= 32.0% (min 225px on A4 canvas > 150px floor) for ${label}`, () => {
      const math = computeQuotationColumnMath(config);
      // Remainder description percentage is at least 32.0% (even with all 5 optional columns on)
      expect(math.descPct).toBeGreaterThanOrEqual(32.0);
      expect(math.descMinPx).toBe(150);

      // Verify that description pixel width on standard A4 printable canvas (703px) exceeds 150px floor
      const descCalculatedPx = (math.descPct / 100) * 703;
      expect(descCalculatedPx).toBeGreaterThanOrEqual(150);
    });

    it(`should stay well within 186mm A4 printable canvas (703px) for ${label}`, () => {
      const math = computeQuotationColumnMath(config);
      // A4 printable canvas width at 96 DPI is 186mm = 703px.
      // Total minimum widths must never exceed 703px.
      expect(math.totalMinPixelWidth).toBeLessThanOrEqual(703);
    });
  }
});

describe('Company Legal Suffix Sanitization', () => {
  it('should clean "None" and return clean company name', () => {
    const res = sanitizeCompanyNameAndSuffix('Celar Water Equipment', 'None');
    expect(res.cleanName).toBe('Celar Water Equipment');
    expect(res.legalSuffix).toBe(undefined);
    expect(res.displayName).toBe('Celar Water Equipment');
  });

  it('should clean "None / To Be Added Later" without trailing text', () => {
    const res = sanitizeCompanyNameAndSuffix('Rafael Hotel', 'None / To Be Added Later');
    expect(res.cleanName).toBe('Rafael Hotel');
    expect(res.legalSuffix).toBe(undefined);
    expect(res.displayName).toBe('Rafael Hotel');
  });

  it('should handle empty string and undefined suffixes gracefully', () => {
    const resEmpty = sanitizeCompanyNameAndSuffix('Alpha Trading', '');
    expect(resEmpty.displayName).toBe('Alpha Trading');
    expect(resEmpty.legalSuffix).toBe(undefined);

    const resUndef = sanitizeCompanyNameAndSuffix('Beta Solutions', undefined);
    expect(resUndef.displayName).toBe('Beta Solutions');
    expect(resUndef.legalSuffix).toBe(undefined);
  });

  it('should concatenate valid legal suffixes with clean single spacing', () => {
    const resLLC = sanitizeCompanyNameAndSuffix('Celar Water Equipment', 'LLC');
    expect(resLLC.cleanName).toBe('Celar Water Equipment');
    expect(resLLC.legalSuffix).toBe('LLC');
    expect(resLLC.displayName).toBe('Celar Water Equipment LLC');

    const resFZE = sanitizeCompanyNameAndSuffix('Aventura Components', 'FZE');
    expect(resFZE.cleanName).toBe('Aventura Components');
    expect(resFZE.legalSuffix).toBe('FZE');
    expect(resFZE.displayName).toBe('Aventura Components FZE');

    const resPJSC = sanitizeCompanyNameAndSuffix('Emaar Properties', 'PJSC');
    expect(resPJSC.cleanName).toBe('Emaar Properties');
    expect(resPJSC.legalSuffix).toBe('PJSC');
    expect(resPJSC.displayName).toBe('Emaar Properties PJSC');
  });

  it('should prevent double-suffixing if company name already ends with the suffix', () => {
    const res = sanitizeCompanyNameAndSuffix('Celar Water Equipment LLC', 'LLC');
    expect(res.displayName).toBe('Celar Water Equipment LLC');

    const resFze = sanitizeCompanyNameAndSuffix('Aventura Components FZE', 'FZE');
    expect(resFze.displayName).toBe('Aventura Components FZE');
  });
});

describe('Number-to-Words Dynamic Currency & Spelled-Out Subunits', () => {
  it('should format whole dirhams without "Say" or currency prefixes', () => {
    const words300 = amountToWords(300.0, 'AED');
    expect(words300).toBe('Three Hundred Only');
    expect(words300).notToContain('Say');
    expect(words300).notToContain('AED');
    expect(words300).notToContain('Zero Fils');

    const words1000 = amountToWords(1000, 'AED');
    expect(words1000).toBe('One Thousand Only');

    const words1200 = amountToWords(1200, 'AED');
    expect(words1200).toBe('One Thousand Two Hundred Only');

    const words45k = amountToWords(45000, 'AED');
    expect(words45k).toBe('Forty-Five Thousand Only');
  });

  it('should format fractional subunits spelled out in words (AED -> Fils)', () => {
    const words1176 = amountToWords(1176.24, 'AED');
    expect(words1176).toBe('One Thousand One Hundred Seventy-Six and Twenty-Four Fils Only');

    const words105 = amountToWords(105.5, 'AED');
    expect(words105).toBe('One Hundred Five and Fifty Fils Only');

    const words12 = amountToWords(12.75, 'AED');
    expect(words12).toBe('Twelve and Seventy-Five Fils Only');
  });

  it('should format foreign currency subunits correctly (USD -> Cents)', () => {
    const wordsUSD = amountToWords(5462.5, 'USD');
    expect(wordsUSD).toBe('Five Thousand Four Hundred Sixty-Two and Fifty Cents Only');
  });

  it('should handle IEEE-754 precision boundary cases cleanly', () => {
    const wordsPoint05 = amountToWords(100.05, 'AED');
    expect(wordsPoint05).toBe('One Hundred and Five Fils Only');

    const wordsPoint10 = amountToWords(1000.1, 'AED');
    expect(wordsPoint10).toBe('One Thousand and Ten Fils Only');

    const wordsZero = amountToWords(0, 'AED');
    expect(wordsZero).toBe('Zero Only');
  });
});

describe('Signatory Attribution & Legal Name Safeguards', () => {
  it('should NOT treat valid 3-letter legal names as initials', () => {
    const legalNames = ['Ali', 'Dan', 'Tom', 'Roy', 'Joy', 'Guy', 'Amy', 'Ben', 'Sam'];
    for (const name of legalNames) {
      expect(isInitialsOnly(name)).toBe(false);
    }
  });

  it('should recognize 2-3 uppercase abbreviations as initials', () => {
    const initials = ['SS', 'JD', 'MK', 'ANR', 'PV', 'ABC'];
    for (const init of initials) {
      expect(isInitialsOnly(init)).toBe(true);
    }
  });

  it('should return false for multi-word or longer names', () => {
    expect(isInitialsOnly('Syed Ameer')).toBe(false);
    expect(isInitialsOnly('John Doe')).toBe(false);
    expect(isInitialsOnly('ABCD')).toBe(false); // > 3 characters
    expect(isInitialsOnly('A')).toBe(false);    // < 2 characters
    expect(isInitialsOnly(null)).toBe(false);
    expect(isInitialsOnly('')).toBe(false);
  });
});

// ==========================================
// TEST REPORT SUMMARY
// ==========================================

const passedCount = testResults.filter((r) => r.passed).length;
const failedCount = testResults.filter((r) => !r.passed).length;

console.log('----------------------------------------------------');
console.log(`[QUOTATION ENGINE TEST SUITE] Results: ${passedCount} Passed, ${failedCount} Failed`);
console.log('----------------------------------------------------');

if (failedCount > 0) {
  testResults
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.error(`FAIL: [${r.suite}] ${r.name} -> ${r.error}`);
    });
  throw new Error(`${failedCount} unit tests failed!`);
}

if (typeof process !== 'undefined' && process.exit) {
  process.exit(0);
}
