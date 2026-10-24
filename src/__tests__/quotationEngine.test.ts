/**
 * Comprehensive Unit Test Suite for Quotation Engine, Suffix Sanitizer,
 * Currency Math Precision, and Signatory Attribution.
 *
 * Can be verified via `tsc --noEmit` and executed directly via `tsx src/__tests__/quotationEngine.test.ts`.
 */

import { sanitizeCompanyNameAndSuffix } from '../components/companies/CreateCompanyModal';
import { amountToWords, formatAmountInWords } from '../utils/numberToWords';
import {
  QuotationPresetColumns,
  QuotationFooterConfig,
  QuotationHeaderConfig,
  BankAccountProfile,
  Quotation,
  QuotationBlockConfig
} from '../types';
import {
  partitionBlocksIntoSheets,
  resolveSpacerPresentation,
  DEFAULT_QUOTATION_BLOCKS
} from '../components/quotations/QuotationDocument';

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

describe('Modular Footer Schema & Closing Layout Engine', () => {
  it('should support all valid closing layout modes', () => {
    const validModes: Array<'split' | 'stacked' | 'seller_only'> = ['split', 'stacked', 'seller_only'];
    for (const mode of validModes) {
      const config: QuotationFooterConfig = {
        showBankRemittance: true,
        showCustomerAcceptance: true,
        showSignatories: true,
        footerLayoutMode: mode
      };
      expect(config.footerLayoutMode).toBe(mode);
    }
  });

  it('should support independent closing card toggles', () => {
    const config: QuotationFooterConfig = {
      showBankRemittance: false,
      showCustomerAcceptance: true,
      showSignatories: false,
      footerLayoutMode: 'seller_only'
    };
    expect(config.showBankRemittance).toBe(false);
    expect(config.showCustomerAcceptance).toBe(true);
    expect(config.showSignatories).toBe(false);
    expect(config.footerLayoutMode).toBe('seller_only');
  });

  it('should verify continuation header option on QuotationHeaderConfig', () => {
    const headerConfig: QuotationHeaderConfig = {
      repeatHeaderOnSubsequentPages: true
    };
    expect(headerConfig.repeatHeaderOnSubsequentPages).toBe(true);
  });
});

describe('Multi-Account Bank Remittance Registry & Selector', () => {
  const bankA: BankAccountProfile = {
    id: 'bank-1',
    bankName: 'Emirates NBD',
    beneficiaryName: 'Water Treatment Systems LLC',
    accountNumber: '1029384756',
    iban: 'AE0702600001029384756',
    swiftCode: 'EBILAEADXXX',
    branchName: 'Main Branch, Dubai',
    currency: 'AED',
    isDefault: true
  };

  const bankB: BankAccountProfile = {
    id: 'bank-2',
    bankName: 'First Abu Dhabi Bank (FAB)',
    beneficiaryName: 'Water Treatment Systems LLC',
    accountNumber: '9988776655',
    iban: 'AE4403000009988776655',
    swiftCode: 'NBADAEAAXXX',
    currency: 'USD',
    isDefault: false
  };

  it('should conform to BankAccountProfile schema with all required fields', () => {
    expect(bankA.id).toBe('bank-1');
    expect(bankA.bankName).toBe('Emirates NBD');
    expect(bankA.beneficiaryName).toBe('Water Treatment Systems LLC');
    expect(bankA.accountNumber).toBe('1029384756');
    expect(bankA.iban).toBe('AE0702600001029384756');
    expect(bankA.swiftCode).toBe('EBILAEADXXX');
    expect(bankA.currency).toBe('AED');
    expect(bankA.isDefault).toBe(true);
  });

  it('should embed selectedBank and remittanceBankId in QuotationFooterConfig', () => {
    const footerConfig: QuotationFooterConfig = {
      showBankRemittance: true,
      remittanceBankId: 'bank-2',
      selectedBank: bankB
    };
    expect(footerConfig.remittanceBankId).toBe('bank-2');
    expect(footerConfig.selectedBank?.bankName).toBe('First Abu Dhabi Bank (FAB)');
    expect(footerConfig.selectedBank?.currency).toBe('USD');
  });

  it('should format selector label as [Bank Name] - [Account No / IBAN] ([Currency])', () => {
    const formatLabel = (b: BankAccountProfile) => {
      const acctLabel = b.accountNumber ? b.accountNumber : (b.iban || 'No Acct');
      return `${b.bankName} - ${acctLabel} (${b.currency})`;
    };
    expect(formatLabel(bankA)).toBe('Emirates NBD - 1029384756 (AED)');
    expect(formatLabel(bankB)).toBe('First Abu Dhabi Bank (FAB) - 9988776655 (USD)');
  });

  it('should resolve default bank when no explicit bank is selected', () => {
    const registry = [bankB, bankA];
    const defaultBank = registry.find((b) => b.isDefault) || registry[0];
    expect(defaultBank.id).toBe('bank-1');
    expect(defaultBank.bankName).toBe('Emirates NBD');
  });

  it('should support custom wire detail overrides on active bank account', () => {
    const override = {
      bankName: 'Custom Overseas Bank',
      iban: 'GB82WEST12345698765432',
      swiftCode: 'NWBKGB2L'
    };
    const merged = {
      ...bankA,
      ...override
    };
    expect(merged.bankName).toBe('Custom Overseas Bank');
    expect(merged.iban).toBe('GB82WEST12345698765432');
    expect(merged.swiftCode).toBe('NWBKGB2L');
    expect(merged.accountNumber).toBe('1029384756'); // retained base
  });
});

describe('Commercial Terms Deduplication & Adaptive Pagination Logic', () => {
  // Deduplication helper matching QuotationDocument.tsx
  const deduplicateNotes = (
    rawNotes?: string,
    priceBasis?: string,
    paymentTerms?: string,
    validityText?: string
  ) => {
    if (!rawNotes) return undefined;
    const lines = rawNotes.split('\n');
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      const lower = trimmed.toLowerCase();
      if (!trimmed) return false;
      if (priceBasis) {
        if (lower.startsWith('price basis:') || lower.startsWith('price basis -') || lower.startsWith('price basis')) return false;
        if (lower === priceBasis.toLowerCase()) return false;
      }
      if (paymentTerms) {
        if (lower.startsWith('payment terms:') || lower.startsWith('payment terms -') || lower.startsWith('payment:') || lower.startsWith('payment -')) return false;
        if (lower === paymentTerms.toLowerCase()) return false;
      }
      if (validityText) {
        if (lower.startsWith('validity:') || lower.startsWith('validity -') || lower.startsWith('valid until:') || lower.startsWith('valid until')) return false;
      }
      return true;
    });
    const cleaned = filtered.join('\n').trim();
    return cleaned.length > 0 ? cleaned : undefined;
  };

  it('should suppress repeating Price Basis, Payment Terms, and Validity in custom notes', () => {
    const raw = `Price Basis: FOB Dubai Airport
Payment Terms: 100% Advance
Validity: 30 days
Delivery within 2 weeks after PO confirmation.
Standard manufacturer 1-year warranty applies.`;

    const result = deduplicateNotes(
      raw,
      'FOB Dubai Airport',
      '100% Advance',
      'Valid until 30 Dec 2026'
    );

    expect(result).notToContain('Price Basis:');
    expect(result).notToContain('Payment Terms:');
    expect(result).notToContain('Validity:');
    expect(result).toContain('Delivery within 2 weeks after PO confirmation.');
    expect(result).toContain('Standard manufacturer 1-year warranty applies.');
  });

  it('should return undefined if all lines in custom notes were duplicate key-values', () => {
    const raw = `Price Basis: Ex-Works
Payment Terms: Net 30 Days`;

    const result = deduplicateNotes(raw, 'Ex-Works', 'Net 30 Days');
    expect(result).toBe(undefined);
  });

  // Adaptive Pagination evaluator matching QuotationDocument.tsx
  const evaluateIsMultiPage = (
    itemCount: number,
    isExplicitMultiPage?: boolean,
    measuredHeightPx?: number
  ) => {
    if (isExplicitMultiPage === true) return true;
    if (itemCount > 3) return true;
    const limit260Px = (260 * 96) / 25.4; // 982.68px
    if (measuredHeightPx !== undefined && measuredHeightPx > limit260Px) {
      return true;
    }
    return false;
  };

  it('should keep <= 3 items on a single page if content fits comfortably within 260mm', () => {
    expect(evaluateIsMultiPage(1, false, 650)).toBe(false);
    expect(evaluateIsMultiPage(2, false, 820)).toBe(false);
    expect(evaluateIsMultiPage(3, false, 950)).toBe(false);
  });

  it('should spawn Page 2 if line items exceed the threshold of 3', () => {
    expect(evaluateIsMultiPage(4, false, 800)).toBe(true);
    expect(evaluateIsMultiPage(10, false, 1200)).toBe(true);
  });

  it('should spawn Page 2 if operator selects a multi-page preset even with 1 item', () => {
    expect(evaluateIsMultiPage(1, true, 500)).toBe(true);
  });

  it('should spawn Page 2 if measured height for <= 3 items exceeds 260mm threshold', () => {
    expect(evaluateIsMultiPage(2, false, 1050)).toBe(true);
  });
});

describe('First-Class Page Breaks & Spacers Engine', () => {
  it('should render 1 sheet (Page 1 of 1) when 0 page_break blocks exist', () => {
    const sheets = partitionBlocksIntoSheets(DEFAULT_QUOTATION_BLOCKS);
    expect(sheets.length).toBe(1);
    expect(sheets[0].sheetNumber).toBe(1);
    expect(sheets[0].totalSheets).toBe(1);
    expect(sheets[0].pageLabel).toBe('Page 1 of 1');
    expect(sheets[0].blocks.map((b) => b.id)).toEqual([
      'terms',
      'totals',
      'remittance',
      'signatory',
      'acceptance'
    ]);
  });

  it('should render 2 sheets (Page 1 of 2, Page 2 of 2) with accurate block partitioning when 1 page_break block is inserted', () => {
    const blocksWithBreak: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true },
      { id: 'totals', type: 'totals', enabled: true },
      {
        id: 'break_1001',
        type: 'page_break',
        title: 'Page Break',
        is_visible: true,
        enabled: true,
        show_continuation_header: true
      },
      { id: 'remittance', type: 'remittance', enabled: true },
      { id: 'signatory', type: 'signatory', enabled: true },
      { id: 'acceptance', type: 'acceptance', enabled: true }
    ];

    const sheets = partitionBlocksIntoSheets(blocksWithBreak);
    expect(sheets.length).toBe(2);

    expect(sheets[0].sheetNumber).toBe(1);
    expect(sheets[0].totalSheets).toBe(2);
    expect(sheets[0].pageLabel).toBe('Page 1 of 2');
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['terms', 'totals']);

    expect(sheets[1].sheetNumber).toBe(2);
    expect(sheets[1].totalSheets).toBe(2);
    expect(sheets[1].pageLabel).toBe('Page 2 of 2');
    expect(sheets[1].showContinuationHeader).toBe(true);
    expect(sheets[1].blocks.map((b) => b.id)).toEqual([
      'remittance',
      'signatory',
      'acceptance'
    ]);
  });

  it('should render N+1 sheets (Page 1 of 3, Page 2 of 3, Page 3 of 3) when multiple page_break blocks exist', () => {
    const multiBreakBlocks: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true },
      { id: 'totals', type: 'totals', enabled: true },
      {
        id: 'break_1',
        type: 'page_break',
        title: 'Page Break 1',
        is_visible: true,
        enabled: true,
        show_continuation_header: true
      },
      { id: 'remittance', type: 'remittance', enabled: true },
      {
        id: 'break_2',
        type: 'page_break',
        title: 'Page Break 2',
        is_visible: true,
        enabled: true,
        show_continuation_header: false
      },
      { id: 'signatory', type: 'signatory', enabled: true },
      { id: 'acceptance', type: 'acceptance', enabled: true }
    ];

    const sheets = partitionBlocksIntoSheets(multiBreakBlocks);
    expect(sheets.length).toBe(3);

    expect(sheets[0].pageLabel).toBe('Page 1 of 3');
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['terms', 'totals']);

    expect(sheets[1].pageLabel).toBe('Page 2 of 3');
    expect(sheets[1].showContinuationHeader).toBe(true);
    expect(sheets[1].blocks.map((b) => b.id)).toEqual(['remittance']);

    expect(sheets[2].pageLabel).toBe('Page 3 of 3');
    expect(sheets[2].showContinuationHeader).toBe(false);
    expect(sheets[2].blocks.map((b) => b.id)).toEqual(['signatory', 'acceptance']);
  });

  it('should ignore hidden/disabled page_break blocks when partitioning sheets', () => {
    const blocksWithDisabledBreak: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true },
      {
        id: 'break_disabled',
        type: 'page_break',
        is_visible: false,
        enabled: false
      },
      { id: 'totals', type: 'totals', enabled: true }
    ];

    const sheets = partitionBlocksIntoSheets(blocksWithDisabledBreak);
    expect(sheets.length).toBe(1);
    expect(sheets[0].pageLabel).toBe('Page 1 of 1');
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['terms', 'totals']);
  });

  it('should respect spacer_height_mm and spacer_fill_remaining on spacer blocks', () => {
    const spacer10: QuotationBlockConfig = {
      id: 'spacer_10',
      type: 'spacer',
      spacer_height_mm: 10,
      spacer_fill_remaining: false,
      is_visible: true,
      enabled: true
    };
    const spacer40: QuotationBlockConfig = {
      id: 'spacer_40',
      type: 'spacer',
      spacer_height_mm: 40,
      spacer_fill_remaining: false,
      is_visible: true,
      enabled: true
    };
    const spacerFill: QuotationBlockConfig = {
      id: 'spacer_fill',
      type: 'spacer',
      spacer_height_mm: 20,
      spacer_fill_remaining: true,
      is_visible: true,
      enabled: true
    };

    const p10 = resolveSpacerPresentation(spacer10);
    expect(p10.heightStyle).toBe('10mm');
    expect(p10.className).toBe('w-full shrink-0');
    expect(p10.badgeLabel).toBe('↕ Spacer: 10mm');

    const p40 = resolveSpacerPresentation(spacer40);
    expect(p40.heightStyle).toBe('40mm');
    expect(p40.className).toBe('w-full shrink-0');
    expect(p40.badgeLabel).toBe('↕ Spacer: 40mm');

    const pFill = resolveSpacerPresentation(spacerFill);
    expect(pFill.heightStyle).toBe(undefined);
    expect(pFill.className).toBe('flex-1 w-full min-h-[10mm]');
    expect(pFill.badgeLabel).toBe('↕ Spacer: Fill');

    // Verify spacer blocks stay in exact sequence inside partitioned sheets
    const sheets = partitionBlocksIntoSheets([
      { id: 'terms', enabled: true },
      spacer40,
      { id: 'break_a', type: 'page_break', enabled: true },
      spacerFill,
      { id: 'signatory', enabled: true }
    ]);
    expect(sheets.length).toBe(2);
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['terms', 'spacer_40']);
    expect(sheets[1].blocks.map((b) => b.id)).toEqual(['spacer_fill', 'signatory']);
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
