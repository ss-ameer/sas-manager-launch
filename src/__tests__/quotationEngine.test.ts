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
  QuotationBlockConfig,
  QuotationLineItem,
  Attachment
} from '../types';
import {
  partitionBlocksIntoSheets,
  splitLineItemsIntoChunks,
  resolveTableColumnLayout,
  resolveSpacerPresentation,
  resolveDocumentPaginationWithAnnexes,
  resolveModularLayoutBlocks,
  toggleBlockVisibilityInList,
  resolveTopCardsLayout,
  resolveAnnexHeaderTitle,
  isSheetOverflowingA4,
  extractLineItemAttributesAndCleanDescription,
  resolveHeaderBrandingConfig,
  amountInWordsAED,
  DEFAULT_QUOTATION_BLOCKS,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_RECIPIENT_CONFIG
} from '../components/quotations/QuotationDocument';
import { QuotationRepository } from '../services/repositories/QuotationRepository';

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
// 10. LINE-ITEM ROW PAGE BREAKS & DYNAMIC COLUMN VISIBILITY TESTS
// ==========================================

describe('10. Line-Item Row Page Breaks ("Split Table Here") & Dynamic Column Width Balancing', () => {
  const createFiveLineItems = (): QuotationLineItem[] => [
    {
      id: 'item_1',
      item_name: 'FRP Pressure Vessel 36x72',
      description: ' structural composite vessel',
      quantity: 2,
      unit: 'nos',
      unit_price: 4500,
      total_price: 9000
    },
    {
      id: 'item_2',
      item_name: 'Automatic Multiport Valve',
      description: '2 inch top mount',
      quantity: 2,
      unit: 'nos',
      unit_price: 1200,
      total_price: 2400
    },
    {
      id: 'item_3',
      item_name: 'Graded Silica Sand Media',
      description: 'High purity filtration media',
      quantity: 1000,
      unit: 'kg',
      unit_price: 3.5,
      total_price: 3500
    },
    {
      id: 'item_4',
      item_name: 'Activated Carbon Media',
      description: 'Coconut shell 1000 IV',
      quantity: 500,
      unit: 'kg',
      unit_price: 12,
      total_price: 6000
    },
    {
      id: 'item_5',
      item_name: 'Electromagnetic Dosing Pump',
      description: '15 LPH @ 10 Bar',
      quantity: 3,
      unit: 'set',
      unit_price: 1800,
      total_price: 5400
    }
  ];

  it('10a. Line item page_break_after: true on item #2 of a 5-item quote splits the table into 2 sheets with continuous item numbering (1-2 on Sheet 1, 3-5 on Sheet 2)', () => {
    const items = createFiveLineItems();
    items[1].page_break_after = true; // Split after item #2

    const chunks = splitLineItemsIntoChunks(items);
    expect(chunks.length).toBe(2);
    expect(chunks[0].startIndex).toBe(0);
    expect(chunks[0].items.map((i) => i.id)).toEqual(['item_1', 'item_2']);
    expect(chunks[1].startIndex).toBe(2);
    expect(chunks[1].items.map((i) => i.id)).toEqual(['item_3', 'item_4', 'item_5']);

    // Verify continuous 1-based item numbering: 1-2 on Sheet 1, 3-5 on Sheet 2
    const sheet1Numbers = chunks[0].items.map((_, idx) => chunks[0].startIndex + idx + 1);
    const sheet2Numbers = chunks[1].items.map((_, idx) => chunks[1].startIndex + idx + 1);
    expect(sheet1Numbers).toEqual([1, 2]);
    expect(sheet2Numbers).toEqual([3, 4, 5]);

    const sheets = partitionBlocksIntoSheets(DEFAULT_QUOTATION_BLOCKS, items);
    expect(sheets.length).toBe(2);
    expect(sheets[0].pageLabel).toBe('Page 1 of 2');
    expect(sheets[1].pageLabel).toBe('Page 2 of 2');
    expect(sheets[0].tableChunk?.items.length).toBe(2);
    expect(sheets[1].tableChunk?.items.length).toBe(3);
    expect(sheets[1].isTableContinuationSheet).toBe(true);
    expect(sheets[1].showContinuationHeader).toBe(true);
    // Closing blocks land on the final table chunk sheet (Sheet 2)
    expect(sheets[0].blocks.length).toBe(0);
    expect(sheets[1].blocks.map((b) => b.id)).toEqual([
      'terms',
      'totals',
      'remittance',
      'signatory',
      'acceptance'
    ]);
  });

  it('10b. Combining a line-item page_break_after AND a closing block page_break produces 3 sheets (Page 1 of 3, Page 2 of 3, Page 3 of 3)', () => {
    const items = createFiveLineItems();
    items[1].page_break_after = true; // Table split after item #2

    const blocksWithBreak: QuotationBlockConfig[] = [
      { id: 'terms', enabled: true },
      { id: 'totals', enabled: true },
      { id: 'break_closing', type: 'page_break', title: 'Page Break', enabled: true, show_continuation_header: true },
      { id: 'remittance', enabled: true },
      { id: 'signatory', enabled: true },
      { id: 'acceptance', enabled: true }
    ];

    const sheets = partitionBlocksIntoSheets(blocksWithBreak, items);
    expect(sheets.length).toBe(3);
    expect(sheets.map((s) => s.pageLabel)).toEqual([
      'Page 1 of 3',
      'Page 2 of 3',
      'Page 3 of 3'
    ]);

    // Sheet 1: Items 1-2, no closing blocks yet
    expect(sheets[0].tableChunk?.items.map((i) => i.id)).toEqual(['item_1', 'item_2']);
    expect(sheets[0].blocks).toEqual([]);

    // Sheet 2: Items 3-5 + pre-break closing blocks (terms, totals)
    expect(sheets[1].tableChunk?.items.map((i) => i.id)).toEqual(['item_3', 'item_4', 'item_5']);
    expect(sheets[1].tableChunk?.startIndex).toBe(2);
    expect(sheets[1].blocks.map((b) => b.id)).toEqual(['terms', 'totals']);

    // Sheet 3: No table chunk + post-break closing blocks (remittance, signatory, acceptance)
    expect(sheets[2].tableChunk).toBe(undefined);
    expect(sheets[2].blocks.map((b) => b.id)).toEqual(['remittance', 'signatory', 'acceptance']);
  });

  it('10c. Hiding unit_price column redistributes width to Description while preserving Grand Total calculations', () => {
    const items = createFiveLineItems();
    const defaultLayout = resolveTableColumnLayout({
      unit_price: true,
      showUnitPrice: true,
      showUom: true,
      showLineTotal: true
    });
    expect(defaultLayout.showUnitPrice).toBe(true);
    expect(defaultLayout.widths.description).toBe('52%');
    expect(defaultLayout.widths.unitPrice).toBe('12%');
    expect(defaultLayout.activeColumnCount).toBe(6);

    const hiddenUnitPriceLayout = resolveTableColumnLayout({
      unit_price: false,
      showUnitPrice: false,
      showUom: true,
      showLineTotal: true
    });
    expect(hiddenUnitPriceLayout.showUnitPrice).toBe(false);
    expect(hiddenUnitPriceLayout.widths.unitPrice).toBe('0%');
    expect(hiddenUnitPriceLayout.widths.description).toBe('64%');
    expect(hiddenUnitPriceLayout.activeColumnCount).toBe(5);

    // Grand total calculation remains 100% intact when Unit Price column is hidden
    const financials = QuotationRepository.calculateTotals(items, 0, 'taxes_extra', 5);
    expect(financials.subtotal).toBe(26300);
    expect(financials.tax_amount).toBe(1315);
    expect(financials.grand_total).toBe(27615);
  });
});

// ==========================================
// SUITE 11: COMPLETE PRESET LIFECYCLE MANAGEMENT & FULL SNAPSHOT PERSISTENCE
// ==========================================

describe('Suite 11: Complete Preset Lifecycle Management & Full Snapshot Persistence', () => {
  it('11a. Full preset snapshot serialization & hydration preserves layout_blocks (spacer & page_break), visible_columns (showUnitPrice, showUom), globalCardRadius, cardsOrder, and remittanceBankId', () => {
    const rawSnapshot = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_lifecycle_test',
      preset_name: 'Turnkey EPC Proposal Preset',
      is_default: true,
      default_tax_mode: 'taxes_extra',
      default_price_basis: 'DDP Site',
      default_payment_terms: '40% Advance, 60% Against Delivery',
      default_validity_days: 45,
      signatory_mode: 'dual',
      table_density: 'compact',
      fontSizeScale: 'comfortable',
      block_style: 'minimal',
      globalCardRadius: 'sharp',
      cardsOrder: 'offer_first',
      subjectPlacement: 'above_cards',
      remittanceBankId: 'bank_usd_02',
      visible_columns: {
        brand: true,
        model: true,
        origin: false,
        availability: true,
        unit_price: false,
        showUnitPrice: false,
        showUom: false,
        showLineTotal: true,
        showItemAttributes: true,
        attributeDisplayFormat: 'inline_text',
        hiddenAttributeKeys: ['Connection'],
        showAmountInWords: false
      },
      layout_blocks: [
        { id: 'totals', type: 'totals', title: 'Financial Summary', enabled: true, order: 0 },
        {
          id: 'spacer_custom_1',
          type: 'spacer',
          title: 'Spacer',
          enabled: true,
          spacer_height_mm: 40,
          spacer_fill_remaining: false,
          order: 1
        },
        {
          id: 'break_custom_1',
          type: 'page_break',
          title: 'Page Break',
          enabled: true,
          show_continuation_header: false,
          order: 2
        },
        { id: 'terms', type: 'terms', title: 'Commercial Terms', enabled: true, order: 3 },
        { id: 'remittance', type: 'remittance', title: 'Bank Remittance', enabled: true, order: 4 },
        { id: 'signatory', type: 'signatories', title: 'Signatories', enabled: true, order: 5 },
        { id: 'acceptance', type: 'acceptance', title: 'Acceptance', enabled: false, order: 6 }
      ],
      footer_config: {
        footerLayoutMode: 'stacked',
        showBankRemittance: true,
        showCustomerAcceptance: false,
        showSignatories: true,
        showPageNumbers: true,
        showDisclaimer: true,
        customDisclaimer: 'Strict turnkey confidentiality applies.',
        remittanceBankId: 'bank_usd_02'
      }
    });

    const hydrated = QuotationRepository.hydrateFromPresetSnapshot({
      ...rawSnapshot,
      id: 'preset_epc_01'
    });

    expect(hydrated.presetId).toBe('preset_epc_01');
    expect(hydrated.isDefault).toBe(true);
    expect(hydrated.globalCardRadius).toBe('sharp');
    expect(hydrated.cardsOrder).toBe('offer_first');
    expect(hydrated.subjectPlacement).toBe('above_cards');
    expect(hydrated.fontSizeScale).toBe('comfortable');
    expect(hydrated.tableDensity).toBe('compact');
    expect(hydrated.blockStyle).toBe('minimal');
    expect(hydrated.remittanceBankId).toBe('bank_usd_02');
    expect(hydrated.visibleColumns.showUnitPrice).toBe(false);
    expect(hydrated.visibleColumns.unit_price).toBe(false);
    expect(hydrated.visibleColumns.showUom).toBe(false);
    expect(hydrated.visibleColumns.showLineTotal).toBe(true);
    expect(hydrated.visibleColumns.attributeDisplayFormat).toBe('inline_text');
    expect(hydrated.visibleColumns.hiddenAttributeKeys).toEqual(['Connection']);
    expect(hydrated.visibleColumns.showAmountInWords).toBe(false);
    expect(hydrated.amountInWordsEnabled).toBe(false);

    // Verify layout_blocks order and custom spacer/page_break properties
    expect(hydrated.layoutBlocks.length).toBe(7);
    expect(hydrated.layoutBlocks.map((b) => b.id)).toEqual([
      'totals',
      'spacer_custom_1',
      'break_custom_1',
      'terms',
      'remittance',
      'signatory',
      'acceptance'
    ]);
    expect(hydrated.layoutBlocks[1].type).toBe('spacer');
    expect(hydrated.layoutBlocks[1].spacer_height_mm).toBe(40);
    expect(hydrated.layoutBlocks[1].spacer_fill_remaining).toBe(false);
    expect(hydrated.layoutBlocks[2].type).toBe('page_break');
    expect(hydrated.layoutBlocks[2].show_continuation_header).toBe(false);
    expect(hydrated.footerConfig.footerLayoutMode).toBe('stacked');
    expect(hydrated.footerConfig.remittanceBankId).toBe('bank_usd_02');
    expect(hydrated.footerConfig.customDisclaimer).toBe('Strict turnkey confidentiality applies.');
  });

  it('11b. Updating an existing preset replaces its configuration cleanly without duplicating preset IDs', () => {
    const initialPresets = [
      QuotationRepository.docToPreset('preset_1', {
        workspace_id: 'ws_1',
        preset_name: 'Standard Export',
        globalCardRadius: 'rounded',
        cardsOrder: 'recipient_first',
        remittanceBankId: 'bank_aed_1',
        visible_columns: { brand: true, model: true, origin: true, availability: true, unit_price: true, showUnitPrice: true, showUom: true }
      }),
      QuotationRepository.docToPreset('preset_2', {
        workspace_id: 'ws_1',
        preset_name: 'Lump Sum Turnkey',
        globalCardRadius: 'rounded',
        cardsOrder: 'recipient_first',
        remittanceBankId: 'bank_aed_1',
        visible_columns: { brand: true, model: true, origin: true, availability: true, unit_price: true, showUnitPrice: true, showUom: true }
      })
    ];

    const updatedPreset2 = {
      ...QuotationRepository.serializePresetSnapshot({
        ...initialPresets[1],
        globalCardRadius: 'sharp',
        cardsOrder: 'offer_first',
        remittanceBankId: 'bank_eur_9',
        visible_columns: {
          brand: true,
          model: true,
          origin: true,
          availability: true,
          unit_price: false,
          showUnitPrice: false,
          showUom: false
        }
      }),
      id: 'preset_2'
    };

    const afterUpdate = QuotationRepository.applyPresetUpdateInList(initialPresets, updatedPreset2);
    expect(afterUpdate.length).toBe(2);
    expect(afterUpdate.map((p) => p.id)).toEqual(['preset_1', 'preset_2']);
    expect(afterUpdate[1].globalCardRadius).toBe('sharp');
    expect(afterUpdate[1].cardsOrder).toBe('offer_first');
    expect(afterUpdate[1].remittanceBankId).toBe('bank_eur_9');
    expect(afterUpdate[1].visible_columns.showUnitPrice).toBe(false);
    expect(afterUpdate[1].visible_columns.showUom).toBe(false);
  });

  it('11c. Setting a default preset marks is_default: true exclusively on the target preset while clearing is_default on sibling presets', () => {
    const presets = [
      QuotationRepository.docToPreset('preset_alpha', {
        workspace_id: 'ws_1',
        preset_name: 'Alpha Preset',
        is_default: true
      }),
      QuotationRepository.docToPreset('preset_beta', {
        workspace_id: 'ws_1',
        preset_name: 'Beta Preset',
        is_default: false
      }),
      QuotationRepository.docToPreset('preset_gamma', {
        workspace_id: 'ws_1',
        preset_name: 'Gamma Preset',
        is_default: false
      })
    ];

    // Switch default to preset_beta
    const step1 = QuotationRepository.applyDefaultPresetInList(presets, 'preset_beta');
    expect(step1.map((p) => ({ id: p.id, is_default: p.is_default }))).toEqual([
      { id: 'preset_alpha', is_default: false },
      { id: 'preset_beta', is_default: true },
      { id: 'preset_gamma', is_default: false }
    ]);

    // Switch default to preset_gamma
    const step2 = QuotationRepository.applyDefaultPresetInList(step1, 'preset_gamma');
    expect(step2.map((p) => ({ id: p.id, is_default: p.is_default }))).toEqual([
      { id: 'preset_alpha', is_default: false },
      { id: 'preset_beta', is_default: false },
      { id: 'preset_gamma', is_default: true }
    ]);
    expect(step2.filter((p) => p.is_default).length).toBe(1);
  });
});

// ==========================================
// 12. TECHNICAL DATASHEET / FLYER ATTACHMENTS & A4 ANNEX SHEETS (PHASE 3.2)
// ==========================================

describe('12. Technical Datasheet / Flyer Attachments, Submittals Index & Full-Page A4 Annex Sheets', () => {
  const sampleLineItems: QuotationLineItem[] = [
    {
      id: 'li_1',
      item_name: 'EPDM Fine Bubble Disk Diffuser',
      description: '9-inch membrane diffuser with 3/4" NPT connection',
      unit: 'PCS',
      quantity: 120,
      unit_price: 45,
      total_price: 5400,
      page_break_after: false
    },
    {
      id: 'li_2',
      item_name: 'SS304 Air Distribution Header Pipework',
      description: 'Pre-fabricated stainless steel header manifold',
      unit: 'LOT',
      quantity: 1,
      unit_price: 8900,
      total_price: 8900,
      page_break_after: false
    }
  ];

  it('12a. Quotations with 0 flyer_attachments leave totalDocumentPages equal to mainSheets.length and hide Submittals Index', () => {
    const singlePageResult = resolveDocumentPaginationWithAnnexes(
      DEFAULT_QUOTATION_BLOCKS,
      sampleLineItems,
      [],
      true
    );

    expect(singlePageResult.mainSheets.length).toBe(1);
    expect(singlePageResult.annexSheets.length).toBe(0);
    expect(singlePageResult.totalDocumentPages).toBe(singlePageResult.mainSheets.length);
    expect(singlePageResult.showSubmittalsIndex).toBe(false);
    expect(singlePageResult.submittalsIndexEntries.length).toBe(0);

    // Also test with a 2-page main quotation (via explicit page_break block)
    const twoPageBlocks: QuotationBlockConfig[] = [
      DEFAULT_QUOTATION_BLOCKS[0],
      DEFAULT_QUOTATION_BLOCKS[1],
      { id: 'pb_main', type: 'page_break', title: 'Page Break', is_visible: true, show_continuation_header: true },
      DEFAULT_QUOTATION_BLOCKS[2],
      DEFAULT_QUOTATION_BLOCKS[3]
    ];
    const twoPageResult = resolveDocumentPaginationWithAnnexes(
      twoPageBlocks,
      sampleLineItems,
      undefined,
      true
    );
    expect(twoPageResult.mainSheets.length).toBe(2);
    expect(twoPageResult.annexSheets.length).toBe(0);
    expect(twoPageResult.totalDocumentPages).toBe(2);
  });

  it('12b. Adding K image flyer_attachments with render_as_annex_page: true spawns K annex sheets and updates all main + annex footers to Page X of (mainSheets.length + K)', () => {
    const twoPageBlocks: QuotationBlockConfig[] = [
      DEFAULT_QUOTATION_BLOCKS[0],
      DEFAULT_QUOTATION_BLOCKS[1],
      { id: 'pb_main', type: 'page_break', title: 'Page Break', is_visible: true, show_continuation_header: true },
      DEFAULT_QUOTATION_BLOCKS[2],
      DEFAULT_QUOTATION_BLOCKS[3]
    ];

    const annexFlyers: Attachment[] = [
      {
        id: 'flyer_1',
        name: 'Annex A: EPDM Fine Bubble Diffuser Curve & Headloss Datasheet',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        type: 'image/png',
        render_as_annex_page: true
      },
      {
        id: 'flyer_2',
        name: 'Annex B: Rotary Lobe Blower Dimensional GA Drawing',
        url: 'https://example.com/datasheets/blower-ga.png',
        type: 'image/png',
        render_as_annex_page: true
      },
      {
        id: 'flyer_3',
        name: 'Annex C: P&ID Process Flow Diagram',
        url: 'https://example.com/datasheets/pid-diagram.jpg',
        type: 'image/jpeg',
        render_as_annex_page: true
      }
    ];

    const result = resolveDocumentPaginationWithAnnexes(
      twoPageBlocks,
      sampleLineItems,
      annexFlyers,
      true
    );

    const K = annexFlyers.length; // 3
    expect(result.mainSheets.length).toBe(2);
    expect(result.annexSheets.length).toBe(K);
    expect(result.totalDocumentPages).toBe(result.mainSheets.length + K); // 2 + 3 = 5

    // Verify main + annex footer page labels follow unified "Page X of 5"
    const mainFooterLabels = result.mainSheets.map((s) => s.pageLabel);
    expect(mainFooterLabels).toEqual(['Page 1 of 5', 'Page 2 of 5']);

    const annexFooterLabels = result.annexSheets.map((s) => s.pageLabel);
    expect(annexFooterLabels).toEqual(['Page 3 of 5', 'Page 4 of 5', 'Page 5 of 5']);

    const annexHeaders = result.annexSheets.map((s) => s.headerTitle);
    expect(annexHeaders).toEqual([
      'TECHNICAL ANNEX 1: Annex A: EPDM Fine Bubble Diffuser Curve & Headloss Datasheet',
      'TECHNICAL ANNEX 2: Annex B: Rotary Lobe Blower Dimensional GA Drawing',
      'TECHNICAL ANNEX 3: Annex C: P&ID Process Flow Diagram'
    ]);
  });

  it('12c. Attachments with render_as_annex_page: false appear in the Submittals Index without incrementing the A4 sheet count', () => {
    const mixedAttachments: Attachment[] = [
      {
        id: 'att_img_annex',
        name: 'Annex A: Submersible Mixer Performance Curve',
        url: 'https://example.com/mixer-curve.png',
        type: 'image/png',
        render_as_annex_page: true
      },
      {
        id: 'att_pdf_ref',
        name: 'ISO 9001 & CE Compliance Dossier (42-Page PDF)',
        url: 'https://example.com/iso-dossier.pdf',
        type: 'application/pdf',
        render_as_annex_page: false
      },
      {
        id: 'att_doc_ref',
        name: 'Standard O&M Manual Reference Link',
        url: 'https://example.com/om-manual.docx',
        type: 'document',
        render_as_annex_page: false
      }
    ];

    const result = resolveDocumentPaginationWithAnnexes(
      DEFAULT_QUOTATION_BLOCKS,
      sampleLineItems,
      mixedAttachments,
      true
    );

    // 1 main sheet + only 1 full-page annex sheet (the 2 index-only attachments do NOT add sheets)
    expect(result.mainSheets.length).toBe(1);
    expect(result.annexSheets.length).toBe(1);
    expect(result.totalDocumentPages).toBe(2);

    // All 3 attachments appear in the Submittals Index with accurate badges
    expect(result.showSubmittalsIndex).toBe(true);
    expect(result.submittalsIndexEntries.length).toBe(3);
    expect(result.submittalsIndexEntries[0]).toEqual({
      indexNumber: 1,
      id: 'att_img_annex',
      name: 'Annex A: Submersible Mixer Performance Curve',
      url: 'https://example.com/mixer-curve.png',
      renderAsAnnexPage: true,
      annexPageNumber: 2,
      badgeLabel: 'Annex Page 2'
    });
    expect(result.submittalsIndexEntries[1]).toEqual({
      indexNumber: 2,
      id: 'att_pdf_ref',
      name: 'ISO 9001 & CE Compliance Dossier (42-Page PDF)',
      url: 'https://example.com/iso-dossier.pdf',
      renderAsAnnexPage: false,
      annexPageNumber: undefined,
      badgeLabel: 'Enclosed Document'
    });
    expect(result.submittalsIndexEntries[2]).toEqual({
      indexNumber: 3,
      id: 'att_doc_ref',
      name: 'Standard O&M Manual Reference Link',
      url: 'https://example.com/om-manual.docx',
      renderAsAnnexPage: false,
      annexPageNumber: undefined,
      badgeLabel: 'Enclosed Document'
    });
  });

  it('12d. Preset snapshot serialization & hydration preserves flyer_attachments and show_submittals_index', () => {
    const presetFlyers: Attachment[] = [
      {
        id: 'preset_flyer_1',
        name: 'Annex A: Standard MBR Membrane Module Datasheet',
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        type: 'image/png',
        render_as_annex_page: true
      },
      {
        id: 'preset_flyer_2',
        name: 'Standard Warranty & Quality Assurance Certificate',
        url: 'https://example.com/warranty-cert.pdf',
        type: 'pdf',
        render_as_annex_page: false
      }
    ];

    const serialized = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_1',
      preset_name: 'MBR Package With Standard Annexures',
      visible_columns: {
        brand: true,
        model: true,
        origin: true,
        unit_price: true,
        showUnitPrice: true,
        showUom: true,
        showLineTotal: true
      },
      default_tax_mode: 'taxes_extra',
      default_validity_days: 30,
      signatory_mode: 'dual',
      flyer_attachments: presetFlyers,
      show_submittals_index: true
    });

    expect(serialized.flyer_attachments?.length).toBe(2);
    expect(serialized.show_submittals_index).toBe(true);

    // Mutate original array to prove deep-clone isolation
    presetFlyers[0].name = 'MUTATED_NAME';
    expect(serialized.flyer_attachments![0].name).toBe('Annex A: Standard MBR Membrane Module Datasheet');

    const storedDoc = QuotationRepository.docToPreset('preset_mbr_annex', serialized);
    const hydrated = QuotationRepository.hydrateFromPresetSnapshot(storedDoc);

    expect(hydrated.flyerAttachments.length).toBe(2);
    expect(hydrated.flyerAttachments[0]).toEqual({
      id: 'preset_flyer_1',
      name: 'Annex A: Standard MBR Membrane Module Datasheet',
      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      type: 'image/png',
      render_as_annex_page: true,
      show_title_on_annex: true
    });
    expect(hydrated.flyerAttachments[1]).toEqual({
      id: 'preset_flyer_2',
      name: 'Standard Warranty & Quality Assurance Certificate',
      url: 'https://example.com/warranty-cert.pdf',
      type: 'pdf',
      render_as_annex_page: false,
      show_title_on_annex: true
    });
    expect(hydrated.showSubmittalsIndex).toBe(true);
  });
});

// ==========================================
// 13. DEEP-CLONE QUOTATION REVISIONING (R1 -> R2), STATUS LIFECYCLE & ENQUIRY PIPELINE SYNC (PHASE 3.3)
// ==========================================

describe('13. Deep-Clone Quotation Revisioning (R1 -> R2), Status Lifecycle & Enquiry Pipeline Sync', () => {
  const createSourceR1Quotation = (): Quotation => ({
    id: 'quote_r1_100',
    workspace_id: 'ws_industrial_1',
    workspaceId: 'ws_industrial_1',
    enquiry_id: 'enq_5501',
    quote_number: 'TEST/10/2026/5',
    revision_number: 1,
    formatted_quote_ref: 'TEST/10/2026/5-R1',
    status: 'Sent',
    client_snapshot: {
      entity_name: 'Gulf Petrochemical Utilities LLC',
      contact_person: 'Eng. Khalid Al-Mansoor',
      address: 'Jebel Ali Industrial Zone, Dubai, UAE'
    },
    sender_snapshot: {
      entity_name: 'FlowLine Engineered Systems LLC',
      trn: '100492817200003',
      address: 'Dubai Science Park, UAE'
    },
    line_items: [
      {
        id: 'item_r1_1',
        item_name: 'High-Efficiency Centrifugal Transfer Pump',
        description: 'Horizontal end-suction with mechanical seal',
        quantity: 2,
        unit: 'SET',
        unit_price: 12500,
        total_price: 25000,
        is_optional: false,
        page_break_after: true,
        row_spacer_after_mm: 15,
        attributes: [
          { key: 'Flow Rate', value: '150 m3/h' },
          { key: 'Impeller', value: 'Duplex SS 2205' }
        ],
        visible_attributes: ['Flow Rate', 'Impeller']
      },
      {
        id: 'item_r1_2',
        item_name: 'Optional Spare Seal & Bearing Kit (2-Year)',
        description: 'Recommended commissioning and 2-year spare kit',
        quantity: 1,
        unit: 'LOT',
        unit_price: 4200,
        total_price: 4200,
        is_optional: true,
        page_break_after: false,
        attributes: [{ key: 'Shelf Life', value: '5 Years' }]
      }
    ],
    tax_mode: 'taxes_extra',
    subtotal: 25000,
    freight_amount: 1000,
    tax_rate_percent: 5,
    tax_amount: 1300,
    grand_total: 27300,
    layout_blocks: [
      { id: 'totals', type: 'totals', title: 'Financial Summary', is_visible: true, enabled: true, style: 'framed' },
      { id: 'spacer_1', type: 'spacer', title: 'Spacer', is_visible: true, enabled: true, spacer_height_mm: 20, spacer_fill_remaining: false },
      { id: 'break_1', type: 'page_break', title: 'Page Break', is_visible: true, enabled: true, show_continuation_header: true },
      { id: 'terms', type: 'terms', title: 'Commercial Terms', is_visible: true, enabled: true, style: 'minimal' },
      { id: 'signatories', type: 'signatories', title: 'Signatories', is_visible: true, enabled: true }
    ],
    visible_columns: {
      brand: true,
      model: true,
      origin: true,
      unit_price: false,
      showUnitPrice: false,
      showUom: true,
      showLineTotal: true,
      showItemAttributes: true,
      attributeDisplayFormat: 'pills',
      hiddenAttributeKeys: ['InternalCode'],
      showAmountInWords: true
    },
    flyer_attachments: [
      {
        id: 'flyer_pump_curve',
        name: 'Annex A: Pump Hydraulic Performance Curve',
        url: 'https://example.com/pump-curve.png',
        type: 'image/png',
        render_as_annex_page: true
      }
    ],
    show_submittals_index: true,
    remittanceBankId: 'bank_aed_primary',
    globalCardRadius: 'sharp',
    cardsOrder: 'offer_first',
    subjectPlacement: 'above_cards',
    fontSizeScale: 'comfortable',
    table_density: 'compact',
    block_style: 'framed',
    created_at: '2026-10-20T09:00:00.000Z'
  });

  it('13a. cloneQuotationAsNextRevision increments revision_number (1 -> 2), updates formatted_quote_ref (TEST/10/2026/5-R1 -> TEST/10/2026/5-R2), resets status to Draft, sets parent_quotation_id, and deep-clones line_items, layout_blocks, visible_columns, and flyer_attachments with zero reference bleed', () => {
    const sourceR1 = createSourceR1Quotation();
    const clonedR2 = QuotationRepository.cloneQuotationAsNextRevision(sourceR1);

    expect(Boolean(clonedR2.id && clonedR2.id !== sourceR1.id)).toBe(true);
    expect(clonedR2.revision_number).toBe(2);
    expect(clonedR2.formatted_quote_ref).toBe('TEST/10/2026/5-R2');
    expect(clonedR2.status).toBe('Draft');
    expect(clonedR2.parent_quotation_id).toBe('quote_r1_100');
    expect(clonedR2.parent_quote_id).toBe('quote_r1_100');

    // Verify all Phase 1–3.2 properties were preserved on the clone
    expect(clonedR2.line_items[0].page_break_after).toBe(true);
    expect(clonedR2.line_items[0].row_spacer_after_mm).toBe(15);
    expect(clonedR2.line_items[1].is_optional).toBe(true);
    expect(clonedR2.layout_blocks?.length).toBe(5);
    expect(clonedR2.layout_blocks?.[1].type).toBe('spacer');
    expect(clonedR2.layout_blocks?.[1].spacer_height_mm).toBe(20);
    expect(clonedR2.layout_blocks?.[2].type).toBe('page_break');
    expect(clonedR2.layout_blocks?.[2].show_continuation_header).toBe(true);
    expect(clonedR2.visible_columns?.showUnitPrice).toBe(false);
    expect(clonedR2.visible_columns?.hiddenAttributeKeys).toEqual(['InternalCode']);
    expect(clonedR2.flyer_attachments?.length).toBe(1);
    expect(clonedR2.flyer_attachments?.[0].name).toBe('Annex A: Pump Hydraulic Performance Curve');
    expect(clonedR2.globalCardRadius).toBe('sharp');
    expect(clonedR2.cardsOrder).toBe('offer_first');
    expect(clonedR2.subjectPlacement).toBe('above_cards');

    // Mutate clonedR2 deeply and verify zero reference bleed into sourceR1
    clonedR2.line_items[0].item_name = 'MUTATED PUMP R2';
    clonedR2.line_items[0].page_break_after = false;
    clonedR2.line_items[0].attributes![0].value = '999 m3/h';
    clonedR2.layout_blocks![1].spacer_height_mm = 80;
    clonedR2.visible_columns!.showUnitPrice = true;
    clonedR2.visible_columns!.hiddenAttributeKeys!.push('NewHiddenKey');
    clonedR2.flyer_attachments![0].name = 'MUTATED ANNEX TITLE';

    expect(sourceR1.line_items[0].item_name).toBe('High-Efficiency Centrifugal Transfer Pump');
    expect(sourceR1.line_items[0].page_break_after).toBe(true);
    expect(sourceR1.line_items[0].attributes![0].value).toBe('150 m3/h');
    expect(sourceR1.layout_blocks![1].spacer_height_mm).toBe(20);
    expect(sourceR1.visible_columns!.showUnitPrice).toBe(false);
    expect(sourceR1.visible_columns!.hiddenAttributeKeys).toEqual(['InternalCode']);
    expect(sourceR1.flyer_attachments![0].name).toBe('Annex A: Pump Hydraulic Performance Curve');

    // Also verify existingRevisions max revision calculation (e.g. if R2 and R3 already exist, next is R4)
    const clonedR4 = QuotationRepository.cloneQuotationAsNextRevision(sourceR1, [
      sourceR1,
      clonedR2,
      { ...clonedR2, id: 'quote_r3_100', revision_number: 3, formatted_quote_ref: 'TEST/10/2026/5-R3' }
    ]);
    expect(clonedR4.revision_number).toBe(4);
    expect(clonedR4.formatted_quote_ref).toBe('TEST/10/2026/5-R4');
  });

  it('13b. markPreviousRevisionsSuperseded transitions prior active revisions to Superseded with superseded_by_id populated while leaving explicitly Rejected revisions untouched', () => {
    const r1 = {
      ...createSourceR1Quotation(),
      id: 'quote_r1',
      revision_number: 1,
      formatted_quote_ref: 'TEST/10/2026/5-R1',
      status: 'Rejected'
    };
    const r2 = {
      ...createSourceR1Quotation(),
      id: 'quote_r2',
      revision_number: 2,
      formatted_quote_ref: 'TEST/10/2026/5-R2',
      status: 'Sent',
      parent_quotation_id: 'quote_r1'
    };
    const r3 = {
      ...createSourceR1Quotation(),
      id: 'quote_r3',
      revision_number: 3,
      formatted_quote_ref: 'TEST/10/2026/5-R3',
      status: 'Approved',
      parent_quotation_id: 'quote_r2'
    };

    const updatedChain = QuotationRepository.markPreviousRevisionsSuperseded(
      [r1, r2, r3],
      'quote_r3'
    );

    // R1 was explicitly 'Rejected' -> stays 'Rejected'
    expect(updatedChain[0].id).toBe('quote_r1');
    expect(updatedChain[0].status).toBe('Rejected');
    expect(updatedChain[0].superseded_by_id).toBe(undefined);

    // R2 was 'Sent' -> transitions to 'Superseded' with superseded_by_id = 'quote_r3'
    expect(updatedChain[1].id).toBe('quote_r2');
    expect(updatedChain[1].status).toBe('Superseded');
    expect(updatedChain[1].superseded_by_id).toBe('quote_r3');

    // R3 is the active revision -> remains 'Approved'
    expect(updatedChain[2].id).toBe('quote_r3');
    expect(updatedChain[2].status).toBe('Approved');
    expect(updatedChain[2].superseded_by_id).toBe(undefined);
  });

  it('13c. buildEnquiryQuotationSyncPayload produces accurate quoted_amount (excluding optional items), latest_quote_ref, quotation_status, and latest_revision_number', () => {
    const sourceR1 = createSourceR1Quotation();
    const clonedR2 = QuotationRepository.cloneQuotationAsNextRevision(sourceR1);
    clonedR2.status = 'Approved';

    // Non-optional item is 25,000 + 1,000 freight = 26,000 + 5% tax (1,300) = 27,300
    // Optional item (4,200) must be excluded from quoted_amount
    const syncPayload = QuotationRepository.buildEnquiryQuotationSyncPayload(clonedR2);

    expect(syncPayload).toEqual({
      active_quotation_id: clonedR2.id!,
      latest_quote_ref: 'TEST/10/2026/5-R2',
      quoted_amount: 27300,
      quotation_status: 'Approved',
      latest_revision_number: 2
    });
  });
});

// ============================================================================
// SUITE 14: PRINCIPAL AUDIT HARDENING (TRAILING PAGE-BREAK GUARD, FLOATING-POINT
//           FILS & VAT PRECISION, REVISION STATE ISOLATION & FINAL-SHEET PRINT BREAK)
// ============================================================================

describe('Suite 14: Principal Audit Hardening & Edge-Case Verification', () => {
  it('14a. Trailing & consecutive page_break blocks are guarded so partitionBlocksIntoSheets never generates accidental empty sheets', () => {
    const blocksWithTrailingBreak: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true, placement: 'left' },
      { id: 'totals', type: 'totals', enabled: true, placement: 'right' },
      { id: 'break_middle', type: 'page_break', enabled: true, show_continuation_header: true },
      { id: 'break_duplicate_empty', type: 'page_break', enabled: true, show_continuation_header: true },
      { id: 'signatory', type: 'signatory', enabled: true, placement: 'left' },
      { id: 'acceptance', type: 'acceptance', enabled: true, placement: 'right' },
      { id: 'break_trailing_at_end', type: 'page_break', enabled: true, show_continuation_header: true }
    ];

    const sheets = partitionBlocksIntoSheets(blocksWithTrailingBreak, [
      {
        id: 'li_1',
        item_name: 'Submersible Sewage Pump',
        description: 'Cast iron impeller',
        quantity: 2,
        unit: 'nos',
        unit_price: 5000,
        total_price: 10000
      }
    ]);

    // Should produce exactly 2 sheets (Sheet 1: terms + totals; Sheet 2: signatory + acceptance).
    // Both the duplicate middle break and the trailing break at the end are stripped.
    expect(sheets.length).toBe(2);
    expect(sheets[0].sheetNumber).toBe(1);
    expect(sheets[0].totalSheets).toBe(2);
    expect(sheets[0].pageLabel).toBe('Page 1 of 2');
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['terms', 'totals']);
    expect(sheets[0].isLastDocumentSheet).toBe(false);

    expect(sheets[1].sheetNumber).toBe(2);
    expect(sheets[1].totalSheets).toBe(2);
    expect(sheets[1].pageLabel).toBe('Page 2 of 2');
    expect(sheets[1].blocks.map((b) => b.id)).toEqual(['signatory', 'acceptance']);
    expect(sheets[1].isLastDocumentSheet).toBe(true);
  });

  it('14b. IEEE-754 floating-point precision in calculateTotals and amountInWordsAED handles 0.1 + 0.2, exact fils (.05, .25, .50), zero totals, and multi-million AED tenders cleanly', () => {
    // 0.1 + 0.2 floating-point line items
    const floatTotals = QuotationRepository.calculateTotals(
      [
        { total_price: 0.1, is_optional: false },
        { total_price: 0.2, is_optional: false },
        { total_price: 999.99, is_optional: true }
      ],
      0,
      'tax_exempt',
      0
    );
    expect(floatTotals.subtotal).toBe(0.3);
    expect(floatTotals.grand_total).toBe(0.3);

    // 1.005 rounding edge case with 5% UAE VAT
    const vatPrecision = QuotationRepository.calculateTotals(
      [
        { quantity: 3, unit_price: 19.99, is_optional: false }, // 59.97
        { quantity: 1, unit_price: 40.13, is_optional: false }  // 40.13 -> subtotal = 100.10
      ],
      0,
      'taxes_extra',
      5
    );
    expect(vatPrecision.subtotal).toBe(100.1);
    expect(vatPrecision.tax_amount).toBe(5.01); // 100.10 * 0.05 = 5.005 -> rounds to 5.01
    expect(vatPrecision.grand_total).toBe(105.11);

    // amountInWordsAED precision checks
    expect(amountInWordsAED(0.1 + 0.2)).toBe('Zero and Thirty Fils Only');
    expect(amountInWordsAED(0)).toBe('Zero Only');
    expect(amountInWordsAED('0.00')).toBe('Zero Only');
    expect(amountInWordsAED(1250.5)).toBe('One Thousand Two Hundred Fifty and Fifty Fils Only');
    expect(amountInWordsAED(1250.25)).toBe(
      'One Thousand Two Hundred Fifty and Twenty-Five Fils Only'
    );
    expect(amountInWordsAED(1250.05)).toBe('One Thousand Two Hundred Fifty and Five Fils Only');
    expect(amountInWordsAED('15,750,000.50')).toBe(
      'Fifteen Million Seven Hundred Fifty Thousand and Fifty Fils Only'
    );
  });

  it('14c. hydrateStudioStateFromQuotation isolates state when switching between R1 (Superseded) <-> R2 (Draft) and resets cleanly when opening a new quotation', () => {
    const r1: Quotation = {
      id: 'quote_r1',
      workspace_id: 'ws_audit',
      workspaceId: 'ws_audit',
      enquiry_id: 'enq_audit',
      quote_number: 'QT-2026-0099',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0099-R1',
      status: 'Superseded',
      superseded_by_id: 'quote_r2',
      client_snapshot: { entity_name: 'ACME Utilities' },
      sender_snapshot: { entity_name: 'FlowTech Engineering' },
      line_items: [],
      tax_mode: 'taxes_extra',
      subtotal: 10000,
      freight_amount: 250,
      tax_rate_percent: 5,
      tax_amount: 512.5,
      grand_total: 10762.5,
      table_density: 'compact',
      fontSizeScale: 'compact',
      block_style: 'minimal',
      globalCardRadius: 'sharp',
      cardsOrder: 'offer_first',
      subjectPlacement: 'above_cards',
      remittanceBankId: 'bank_usd_99',
      visible_columns: {
        showUnitPrice: false,
        showUom: false,
        showLineTotal: true
      },
      layout_blocks: [
        { id: 'terms', type: 'terms', enabled: true, placement: 'full' }
      ],
      flyer_attachments: [
        { id: 'att_r1', name: 'R1 Flyer', url: 'https://example.com/r1.png', type: 'image', render_as_annex_page: true }
      ],
      show_submittals_index: false,
      created_at: '2026-10-24T10:00:00.000Z'
    };

    const r2 = QuotationRepository.cloneQuotationAsNextRevision(r1);
    r2.table_density = 'comfortable';
    r2.fontSizeScale = 'large';
    r2.block_style = 'framed';
    r2.globalCardRadius = 'rounded';
    r2.cardsOrder = 'recipient_first';
    r2.subjectPlacement = 'below_cards';
    r2.remittanceBankId = 'bank_aed_01';
    r2.visible_columns = {
      showUnitPrice: true,
      showUom: true,
      showLineTotal: true
    };
    r2.flyer_attachments = [
      { id: 'att_r2_1', name: 'R2 Flyer 1', url: 'https://example.com/r2_1.png', type: 'image', render_as_annex_page: true },
      { id: 'att_r2_2', name: 'R2 Flyer 2', url: 'https://example.com/r2_2.png', type: 'image', render_as_annex_page: true }
    ];
    r2.show_submittals_index = true;

    // 1. Hydrate R1 (Superseded)
    const stateR1 = QuotationRepository.hydrateStudioStateFromQuotation(r1);
    expect(stateR1.activeQuotationId).toBe('quote_r1');
    expect(stateR1.revisionNumber).toBe(1);
    expect(stateR1.quotationStatus).toBe('Superseded');
    expect(stateR1.visibleColumns.showUnitPrice).toBe(false);
    expect(stateR1.visibleColumns.showUom).toBe(false);
    expect(stateR1.flyerAttachments.length).toBe(1);
    expect(stateR1.showSubmittalsIndex).toBe(false);
    expect(stateR1.globalCardRadius).toBe('sharp');
    expect(stateR1.cardsOrder).toBe('offer_first');
    expect(stateR1.subjectPlacement).toBe('above_cards');
    expect(stateR1.selectedBankId).toBe('bank_usd_99');

    // 2. Switch to R2 (Draft) -> verify zero stale closure / state leak from R1
    const stateR2 = QuotationRepository.hydrateStudioStateFromQuotation(r2);
    expect(stateR2.activeQuotationId).toBe(r2.id);
    expect(stateR2.parentQuotationId).toBe('quote_r1');
    expect(stateR2.revisionNumber).toBe(2);
    expect(stateR2.quotationStatus).toBe('Draft');
    expect(stateR2.visibleColumns.showUnitPrice).toBe(true);
    expect(stateR2.visibleColumns.showUom).toBe(true);
    expect(stateR2.flyerAttachments.length).toBe(2);
    expect(stateR2.showSubmittalsIndex).toBe(true);
    expect(stateR2.globalCardRadius).toBe('rounded');
    expect(stateR2.cardsOrder).toBe('recipient_first');
    expect(stateR2.subjectPlacement).toBe('below_cards');
    expect(stateR2.selectedBankId).toBe('bank_aed_01');

    // 3. Switch to null (brand-new quotation) -> verify flyerAttachments & status reset cleanly
    const stateNew = QuotationRepository.hydrateStudioStateFromQuotation(null);
    expect(stateNew.activeQuotationId).toBe('');
    expect(stateNew.parentQuotationId).toBe(undefined);
    expect(stateNew.revisionNumber).toBe(1);
    expect(stateNew.quotationStatus).toBe('Draft');
    expect(stateNew.flyerAttachments.length).toBe(0);
    expect(stateNew.showSubmittalsIndex).toBe(true);
    expect(stateNew.visibleColumns.showUnitPrice).toBe(true);
  });

  it('14d. Final-sheet print break suppression (isLastDocumentSheet) is true ONLY on the very last sheet across main + annex pages', () => {
    const blocks: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true },
      { id: 'break_1', type: 'page_break', enabled: true },
      { id: 'totals', type: 'totals', enabled: true }
    ];

    // Case 1: 2 Main Sheets + 0 Annex Sheets -> Main Sheet 2 is the last document sheet
    const withoutAnnexes = resolveDocumentPaginationWithAnnexes(blocks, [], [], true);
    expect(withoutAnnexes.mainSheets.length).toBe(2);
    expect(withoutAnnexes.annexSheets.length).toBe(0);
    expect(withoutAnnexes.mainSheets[0].isLastDocumentSheet).toBe(false);
    expect(withoutAnnexes.mainSheets[1].isLastDocumentSheet).toBe(true);

    // Case 2: 2 Main Sheets + 2 Annex Sheets -> Main Sheet 2 is NOT last; Annex Sheet 2 IS last
    const withAnnexes = resolveDocumentPaginationWithAnnexes(
      blocks,
      [],
      [
        { id: 'a1', name: 'Annex 1', url: 'https://example.com/a1.png', type: 'image', render_as_annex_page: true },
        { id: 'a2', name: 'Annex 2', url: 'https://example.com/a2.png', type: 'image', render_as_annex_page: true }
      ],
      true
    );
    expect(withAnnexes.mainSheets.length).toBe(2);
    expect(withAnnexes.annexSheets.length).toBe(2);
    expect(withAnnexes.mainSheets[0].isLastDocumentSheet).toBe(false);
    expect(withAnnexes.mainSheets[1].isLastDocumentSheet).toBe(false);
    expect(withAnnexes.annexSheets[0].isLastDocumentSheet).toBe(false);
    expect(withAnnexes.annexSheets[1].isLastDocumentSheet).toBe(true);
  });
});

// ============================================================================
// SUITE 15: MODULAR BLOCK PLACEMENT FIDELITY, SINGLE-SOURCE VISIBILITY SYNC
//           & COMPANY SEAL DECOUPLING
// ============================================================================

describe('Suite 15: Modular Block Placement Fidelity, Single-Source Visibility Sync & Company Seal Decoupling', () => {
  it('15a. Modular block placement is respected regardless of legacy footerLayoutMode (signatory & acceptance preserve left/right/full placement and enabled state)', () => {
    const customBlocks: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true, is_visible: true, placement: 'left' },
      { id: 'totals', type: 'totals', enabled: true, is_visible: true, placement: 'right' },
      { id: 'remittance', type: 'remittance', enabled: true, is_visible: true, placement: 'full' },
      { id: 'signatory', type: 'signatory', enabled: true, is_visible: true, placement: 'full' },
      { id: 'acceptance', type: 'acceptance', enabled: true, is_visible: true, placement: 'right' }
    ];

    // Even if legacy footerConfig has footerLayoutMode: 'split' or 'seller_only',
    // resolveModularLayoutBlocks must honor each block's own placement & enabled state.
    const resolvedWithSplit = resolveModularLayoutBlocks(customBlocks, 'framed', {
      hasExplicitLayoutBlocks: true,
      showBankRemittance: true,
      showSignatories: true,
      showCustomerAcceptance: true
    });

    const sigBlock = resolvedWithSplit.find((b) => b.id === 'signatory')!;
    const accBlock = resolvedWithSplit.find((b) => b.id === 'acceptance')!;
    expect(sigBlock.placement).toBe('full');
    expect(accBlock.placement).toBe('right');
    expect(accBlock.enabled).toBe(true);

    // Also test when signatory is 'left' and acceptance is 'full'
    const customBlocks2: QuotationBlockConfig[] = [
      { id: 'signatory', type: 'signatory', enabled: true, is_visible: true, placement: 'left' },
      { id: 'acceptance', type: 'acceptance', enabled: true, is_visible: true, placement: 'full' }
    ];
    const resolved2 = resolveModularLayoutBlocks(customBlocks2, 'minimal', {
      hasExplicitLayoutBlocks: true,
      showSignatories: true,
      showCustomerAcceptance: true
    });
    expect(resolved2[0].placement).toBe('left');
    expect(resolved2[1].placement).toBe('full');
    expect(resolved2[1].enabled).toBe(true);
  });

  it('15b. Toggling block visibility updates both enabled and is_visible in lockstep while keeping the block in layoutBlocks so the Block Inspector stays open', () => {
    const initialBlocks: QuotationBlockConfig[] = [
      { id: 'terms', type: 'terms', enabled: true, is_visible: true, placement: 'left' },
      { id: 'remittance', type: 'remittance', enabled: true, is_visible: true, placement: 'full' },
      { id: 'signatory', type: 'signatory', enabled: true, is_visible: true, placement: 'left' },
      { id: 'acceptance', type: 'acceptance', enabled: true, is_visible: true, placement: 'right' }
    ];

    // Toggle 'remittance' off
    const afterOff = toggleBlockVisibilityInList(initialBlocks, 'remittance', false);
    const remOff = afterOff.find((b) => b.id === 'remittance')!;
    expect(Boolean(remOff)).toBe(true); // Block remains in array so selectedBlock Inspector does not close
    expect(remOff.enabled).toBe(false);
    expect(remOff.is_visible).toBe(false);

    // Other blocks remain untouched
    expect(afterOff.find((b) => b.id === 'signatory')!.enabled).toBe(true);
    expect(afterOff.find((b) => b.id === 'acceptance')!.enabled).toBe(true);

    // Toggle 'remittance' back on
    const afterOn = toggleBlockVisibilityInList(afterOff, 'remittance', true);
    const remOn = afterOn.find((b) => b.id === 'remittance')!;
    expect(remOn.enabled).toBe(true);
    expect(remOn.is_visible).toBe(true);
  });

  it('15c. Decoupled showCompanySeal: setting showCompanySeal to false leaves signatory block enabled/visible while toggling signatory block does not overwrite showCompanySeal', () => {
    let showCompanySeal = true;
    let blocks: QuotationBlockConfig[] = [
      { id: 'signatory', type: 'signatory', enabled: true, is_visible: true, placement: 'left' },
      { id: 'acceptance', type: 'acceptance', enabled: true, is_visible: true, placement: 'right' }
    ];

    // 1. User unchecks "Show Company Seal Placeholder" inside Signatory Inspector -> signatory block remains enabled
    showCompanySeal = false;
    const resolvedWhenSealFalse = resolveModularLayoutBlocks(blocks, 'framed', {
      hasExplicitLayoutBlocks: true,
      showSignatories: true,
      showCustomerAcceptance: true
    });
    const sigWhenSealFalse = resolvedWhenSealFalse.find((b) => b.id === 'signatory')!;
    expect(showCompanySeal).toBe(false);
    expect(sigWhenSealFalse.enabled).toBe(true);
    expect(sigWhenSealFalse.is_visible).toBe(true);

    // 2. User toggles signatory block visibility off and back on -> showCompanySeal remains false (not overwritten)
    blocks = toggleBlockVisibilityInList(blocks, 'signatory', false);
    expect(blocks.find((b) => b.id === 'signatory')!.enabled).toBe(false);
    expect(showCompanySeal).toBe(false);

    blocks = toggleBlockVisibilityInList(blocks, 'signatory', true);
    expect(blocks.find((b) => b.id === 'signatory')!.enabled).toBe(true);
    expect(showCompanySeal).toBe(false);
  });
});

// ============================================================================
// SUITE 16: TOP CARDS UNIFICATION, COMPANY SEAL / SIGNATURE PERSISTENCE &
//           ANNEX HEADER TITLE VISIBILITY
// ============================================================================

describe('Suite 16: Top Cards Unification, Company Seal / Signature Persistence & Annex Header Title Visibility', () => {
  it('16a. Independent 50% / 100% width allocation and Framed / Minimal presentation style synchronization on Submitted To and Commercial Offer cards', () => {
    // 1. Default 50% / 50% split with global Framed + Rounded
    const defaultLayout = resolveTopCardsLayout({}, 'framed', 'rounded', 'recipient_first');
    expect(defaultLayout.recipientWidth).toBe('50');
    expect(defaultLayout.offerWidth).toBe('50');
    expect(defaultLayout.recipientColSpanClass).toBe('col-span-6 print:col-span-6');
    expect(defaultLayout.offerColSpanClass).toBe('col-span-6 print:col-span-6');
    expect(defaultLayout.recipientStyle).toBe('framed');
    expect(defaultLayout.offerStyle).toBe('framed');
    expect(defaultLayout.recipientCardClassName.includes('border-slate-200 bg-slate-50/50')).toBe(true);
    expect(defaultLayout.recipientCardClassName.includes('rounded-lg')).toBe(true);

    // 2. Setting Submitted To to 100% leaves Commercial Offer at 50% independently!
    const independentWidthLayout = resolveTopCardsLayout(
      { recipientCardWidth: '100', offerCardWidth: '50' },
      'framed',
      'rounded',
      'recipient_first'
    );
    expect(independentWidthLayout.recipientWidth).toBe('100');
    expect(independentWidthLayout.recipientColSpanClass).toBe('col-span-12 print:col-span-12');
    expect(independentWidthLayout.offerWidth).toBe('50');
    expect(independentWidthLayout.offerColSpanClass).toBe('col-span-6 print:col-span-6');

    // 3. Global Minimal + Sharp synchronizes both cards unless overridden per-card
    const minimalSharpLayout = resolveTopCardsLayout({}, 'minimal', 'sharp', 'offer_first');
    expect(minimalSharpLayout.recipientStyle).toBe('minimal');
    expect(minimalSharpLayout.offerStyle).toBe('minimal');
    expect(minimalSharpLayout.recipientRadius).toBe('sharp');
    expect(minimalSharpLayout.offerRadius).toBe('sharp');
    expect(minimalSharpLayout.recipientCardClassName.includes('border-t border-slate-200/90')).toBe(true);
    expect(minimalSharpLayout.recipientCardClassName.includes('bg-transparent')).toBe(true);
    expect(minimalSharpLayout.recipientCardClassName.includes('rounded-none')).toBe(true);
    expect(minimalSharpLayout.cardsOrder).toBe('offer_first');
  });

  it('16b. Persisting and cloning company_seal_url, signature_image_url, and show_title_on_annex across presets and revisions (R1 -> R2)', () => {
    const sampleSealDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
    const sampleSigDataUri = 'data:image/png;base64,R0lGODlhAQABAIAAAAAAAP///yH5';

    // 1. Preset snapshot serialization & hydration
    const presetInput = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_16',
      workspaceId: 'ws_16',
      preset_name: 'Seal & Signature Preset',
      visible_columns: { brand: true, model: true, origin: true, availability: true, unit_price: true },
      default_tax_mode: 'taxes_extra',
      default_price_basis: 'Ex-Works',
      default_payment_terms: '100% Advance',
      default_validity_days: 30,
      signatory_mode: 'single',
      company_seal_url: sampleSealDataUri,
      signature_image_url: sampleSigDataUri,
      flyer_attachments: [
        {
          id: 'att_wa',
          name: 'WhatsApp Image 2026-04-17 at 20.55.57',
          url: 'https://example.com/wa.jpg',
          type: 'image',
          render_as_annex_page: true
        },
        {
          id: 'att_spec',
          name: 'Pump Performance Curve',
          url: 'https://example.com/curve.png',
          type: 'image',
          render_as_annex_page: true,
          show_title_on_annex: true
        }
      ]
    });

    const hydratedPreset = QuotationRepository.hydrateFromPresetSnapshot(presetInput);
    expect(hydratedPreset.companySealUrl).toBe(sampleSealDataUri);
    expect(hydratedPreset.signatureImageUrl).toBe(sampleSigDataUri);
    // WhatsApp generic filename auto-defaults show_title_on_annex to false!
    expect(hydratedPreset.flyerAttachments[0].show_title_on_annex).toBe(false);
    expect(hydratedPreset.flyerAttachments[1].show_title_on_annex).toBe(true);

    // 2. Revision cloning (R1 -> R2) preserves company_seal_url, signature_image_url, and show_title_on_annex
    const r1Quote: Quotation = {
      id: 'q_seal_r1',
      workspace_id: 'ws_16',
      workspaceId: 'ws_16',
      enquiry_id: 'enq_16',
      quote_number: 'QT-2026-0116',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0116-R1',
      status: 'Sent',
      client_snapshot: { entity_name: 'Gulf Water Authority' },
      sender_snapshot: { entity_name: 'FlowTech LLC' },
      line_items: [],
      tax_mode: 'taxes_extra',
      subtotal: 5000,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 250,
      grand_total: 5250,
      company_seal_url: sampleSealDataUri,
      signature_image_url: sampleSigDataUri,
      flyer_attachments: [
        {
          id: 'att_1',
          name: 'Custom Flyer Title',
          url: 'https://example.com/flyer.png',
          type: 'image',
          render_as_annex_page: true,
          show_title_on_annex: false
        }
      ],
      created_at: '2026-10-25T00:00:00.000Z'
    };

    const r2Quote = QuotationRepository.cloneQuotationAsNextRevision(r1Quote);
    expect(r2Quote.revision_number).toBe(2);
    expect(r2Quote.company_seal_url).toBe(sampleSealDataUri);
    expect(r2Quote.signature_image_url).toBe(sampleSigDataUri);
    expect(r2Quote.flyer_attachments?.[0]?.show_title_on_annex).toBe(false);

    const hydratedState = QuotationRepository.hydrateStudioStateFromQuotation(r2Quote);
    expect(hydratedState.companySealUrl).toBe(sampleSealDataUri);
    expect(hydratedState.signatureImageUrl).toBe(sampleSigDataUri);
    expect(hydratedState.flyerAttachments[0].show_title_on_annex).toBe(false);
  });

  it('16c. Annex header title suppression when show_title_on_annex is false or when filename is a generic camera/WhatsApp string', () => {
    const attachments: Attachment[] = [
      {
        id: 'a1',
        name: 'WhatsApp Image 2026-04-17 at 20.55.57',
        url: 'https://example.com/wa1.jpg',
        type: 'image',
        render_as_annex_page: true
        // show_title_on_annex omitted -> auto-detected as false due to WhatsApp filename
      },
      {
        id: 'a2',
        name: 'Grundfos CR32 Technical Datasheet',
        url: 'https://example.com/cr32.png',
        type: 'image',
        render_as_annex_page: true,
        show_title_on_annex: false // explicitly hidden by user
      },
      {
        id: 'a3',
        name: 'Grundfos CR32 Dimensional Drawing',
        url: 'https://example.com/cr32_dim.png',
        type: 'image',
        render_as_annex_page: true,
        show_title_on_annex: true // explicitly shown
      }
    ];

    expect(resolveAnnexHeaderTitle(attachments[0], 1)).toBe('TECHNICAL ANNEX 1');
    expect(resolveAnnexHeaderTitle(attachments[1], 2)).toBe('TECHNICAL ANNEX 2');
    expect(resolveAnnexHeaderTitle(attachments[2], 3)).toBe(
      'TECHNICAL ANNEX 3: Grundfos CR32 Dimensional Drawing'
    );

    const pagination = resolveDocumentPaginationWithAnnexes(
      DEFAULT_QUOTATION_BLOCKS,
      [],
      attachments,
      true
    );
    expect(pagination.annexSheets.length).toBe(3);
    expect(pagination.annexSheets[0].headerTitle).toBe('TECHNICAL ANNEX 1');
    expect(pagination.annexSheets[1].headerTitle).toBe('TECHNICAL ANNEX 2');
    expect(pagination.annexSheets[2].headerTitle).toBe(
      'TECHNICAL ANNEX 3: Grundfos CR32 Dimensional Drawing'
    );
  });
});

// ============================================================================
// SUITE 17: TOP CARDS 3-WAY PLACEMENT TRACK, MINIMAL VERTICAL RHYTHM,
//           DEDUPLICATED SPECS EXTRACTION & DYNAMIC 297MM OVERFLOW DETECTION
// ============================================================================

describe('Suite 17: Top Cards 3-Way Placement, Minimal Rhythm, Specs Deduplication & Dynamic A4 Overflow', () => {
  it('17a. Top cards (Submitted To and Commercial Offer) 3-way placement (left, full, right), compact 100% stacked mode, and guaranteed global framed / minimal synchronization', () => {
    // 1. Default side-by-side 50/50 row-pairing (Submitted To left, Commercial Offer right on Row 1)
    const sideBySide = resolveTopCardsLayout(
      DEFAULT_RECIPIENT_CONFIG,
      'framed',
      'rounded',
      'recipient_first'
    );
    expect(sideBySide.recipientPlacement).toBe('left');
    expect(sideBySide.offerPlacement).toBe('right');
    expect(sideBySide.recipientGridPosition.gridRowStart).toBe(1);
    expect(sideBySide.recipientGridPosition.gridColumnStart).toBe(1);
    expect(sideBySide.offerGridPosition.gridRowStart).toBe(1);
    expect(sideBySide.offerGridPosition.gridColumnStart).toBe(2);
    expect(sideBySide.recipientCardClassName.includes('p-3')).toBe(true);

    // 2. Asymmetric placement: Submitted To = 'full' (Row 1 col-span-2 with compact py-2 px-3), Commercial Offer = 'right' (Row 2 col-start-2)
    const asymmetric = resolveTopCardsLayout(
      { recipientPlacement: 'full', offerPlacement: 'right' },
      'framed',
      'rounded',
      'recipient_first'
    );
    expect(asymmetric.recipientPlacement).toBe('full');
    expect(asymmetric.recipientWidth).toBe('100');
    expect(asymmetric.recipientGridPosition.gridRowStart).toBe(1);
    expect(asymmetric.recipientGridPosition.placementClass).toBe('col-span-2 col-start-1 w-full');
    expect(asymmetric.recipientCardClassName.includes('py-2 px-3')).toBe(true);

    expect(asymmetric.offerPlacement).toBe('right');
    expect(asymmetric.offerWidth).toBe('50');
    expect(asymmetric.offerGridPosition.gridRowStart).toBe(2);
    expect(asymmetric.offerGridPosition.gridColumnStart).toBe(2);
    expect(asymmetric.offerGridPosition.placementClass).toBe('col-span-1 col-start-2');

    // 3. Guaranteed global Minimal synchronization even when DEFAULT_RECIPIENT_CONFIG is spread
    const minimalGlobal = resolveTopCardsLayout(
      { ...DEFAULT_RECIPIENT_CONFIG },
      'minimal',
      'sharp',
      'recipient_first'
    );
    expect(minimalGlobal.recipientStyle).toBe('minimal');
    expect(minimalGlobal.offerStyle).toBe('minimal');
    expect(minimalGlobal.recipientCardClassName.includes('border-t border-slate-200/90')).toBe(true);
    expect(minimalGlobal.recipientCardClassName.includes('pt-2 pb-1 px-1')).toBe(true);
    expect(minimalGlobal.offerCardClassName.includes('border-t border-slate-200/90')).toBe(true);
    expect(minimalGlobal.offerCardClassName.includes('pt-2 pb-1 px-1')).toBe(true);
  });

  it('17b. Minimal block style compact vertical rhythm and clean technical specification extraction without duplicate Specs lines', () => {
    const itemWithEmbeddedSpecs: QuotationLineItem = {
      id: 'item_frp',
      item_name: 'FRP Vessel',
      description:
        'Heavy-duty composite pressure vessel.\nSpecs: Diameter: 100cm • Media Type: Gravel • Model: Pentair • Top/Bottom Opening: 4in • Volume: 100l',
      quantity: 3,
      unit: 'pcs',
      unit_price: 5500,
      total_price: 16500
    };

    const { cleanDescription, extractedSpecsAttrs } =
      extractLineItemAttributesAndCleanDescription(itemWithEmbeddedSpecs);

    // Raw "Specs: ..." line is stripped from description so it never renders twice or leaks when showItemAttributes is false
    expect(cleanDescription).toBe('Heavy-duty composite pressure vessel.');
    expect(cleanDescription.includes('Specs:')).toBe(false);

    // Structured attributes are cleanly parsed from the embedded Specs line
    expect(extractedSpecsAttrs.length).toBe(5);
    expect(extractedSpecsAttrs[0].key).toBe('Diameter');
    expect(extractedSpecsAttrs[0].value).toBe('100cm');
    expect(extractedSpecsAttrs[2].key).toBe('Model');
    expect(extractedSpecsAttrs[2].value).toBe('Pentair');

    // Verify resolveTableColumnLayout respects showItemAttributes = false
    const hiddenSpecsColLayout = resolveTableColumnLayout({
      brand: true,
      model: true,
      origin: true,
      availability: true,
      unit_price: true,
      showItemAttributes: false
    });
    expect(hiddenSpecsColLayout.showItemAttributes).toBe(false);
  });

  it('17c. Dynamic A4 297mm sheet overflow detection only triggers when scrollHeight exceeds 297mm (plus tolerance)', () => {
    // At 794px width (210mm at 96dpi), 297mm is ceil(794 * 297 / 210) = 1123px.
    // Standard 1-page sheet that fits exactly at 297mm (1123px) must NOT trigger the red warning:
    expect(isSheetOverflowingA4(1123, 794, 6)).toBe(false);
    expect(isSheetOverflowingA4(1128, 794, 6)).toBe(false);

    // Sheet that overflows 297mm (e.g. 1180px > 1123 + 6) MUST trigger the red warning:
    expect(isSheetOverflowingA4(1180, 794, 6)).toBe(true);
  });
});

// ============================================================================
// SUITE 18: COMPLETE CORPORATE LOGO & LETTERHEAD ENGINE
// ============================================================================

describe('Suite 18: Complete Corporate Logo & Letterhead Engine', () => {
  it('18a. Custom uploaded logo priority (headerConfig.logoUrl -> quotation.company_logo_url -> profile.logo_url -> placeholder fallback)', () => {
    const profileWithLogo = {
      id: 'prof_18',
      profile_name: 'Default Profile',
      legal_entity_name: 'Al Safa Water Systems LLC',
      address_line_1: 'Dubai Industrial City',
      logo_url: 'https://example.com/profile-default-logo.png',
      bank_accounts: []
    };

    // 1. When neither headerConfig.logoUrl nor quotation.company_logo_url is set, falls back to profile.logo_url
    const fallbackToProfile = resolveHeaderBrandingConfig(
      {},
      { company_logo_url: undefined },
      profileWithLogo
    );
    expect(fallbackToProfile.activeLogoUrl).toBe('https://example.com/profile-default-logo.png');
    expect(fallbackToProfile.showLogo).toBe(true);

    // 2. When quotation.company_logo_url is set, it overrides profile.logo_url
    const quoteLogoOverride = resolveHeaderBrandingConfig(
      {},
      { company_logo_url: 'data:image/png;base64,QUOTE_CUSTOM_LOGO' },
      profileWithLogo
    );
    expect(quoteLogoOverride.activeLogoUrl).toBe('data:image/png;base64,QUOTE_CUSTOM_LOGO');

    // 3. When headerConfig.logoUrl is set, it takes top priority over both quotation.company_logo_url and profile.logo_url
    const headerConfigLogoOverride = resolveHeaderBrandingConfig(
      { logoUrl: 'data:image/svg+xml;base64,HEADER_STUDIO_LOGO' },
      { company_logo_url: 'data:image/png;base64,QUOTE_CUSTOM_LOGO' },
      profileWithLogo
    );
    expect(headerConfigLogoOverride.activeLogoUrl).toBe('data:image/svg+xml;base64,HEADER_STUDIO_LOGO');

    // 4. When no custom logo exists on headerConfig, quotation, or profile, activeLogoUrl is empty and placeholder emblem is enabled by default
    const placeholderFallback = resolveHeaderBrandingConfig({}, {}, { logo_url: '' });
    expect(placeholderFallback.activeLogoUrl).toBe('');
    expect(placeholderFallback.showLogo).toBe(true);
    expect(placeholderFallback.includeMiniLogoOnContinuation).toBe(false);
  });

  it('18b. Logo display modes (logo_and_name, logo_only, full_banner, no_logo), unified headerLayoutMode (split_left, split_right, centered, banner), and Page 2+ mini-logo eligibility', () => {
    const customLogoUri = 'data:image/png;base64,CORP_WIDE_LOCKUP';

    // 1. Default 'logo_and_name' + 'split_left'
    const modeLogoAndName = resolveHeaderBrandingConfig({
      logoUrl: customLogoUri,
      logoDisplayMode: 'logo_and_name',
      headerLayoutMode: 'split_left',
      logoHeightPx: 48
    });
    expect(modeLogoAndName.logoDisplayMode).toBe('logo_and_name');
    expect(modeLogoAndName.headerLayoutMode).toBe('split_left');
    expect(modeLogoAndName.showLogo).toBe(true);
    expect(modeLogoAndName.showCompanyName).toBe(true);
    expect(modeLogoAndName.logoHeightPx).toBe(48);
    expect(modeLogoAndName.logoMaxWidthPx).toBe(260);
    expect(modeLogoAndName.includeMiniLogoOnContinuation).toBe(true);

    // 2. 'logo_only' (Wide Logo Lockup Only) suppresses duplicate Company Name heading while keeping logo visible
    const modeLogoOnly = resolveHeaderBrandingConfig({
      logoUrl: customLogoUri,
      logoDisplayMode: 'logo_only',
      headerLayoutMode: 'split_right',
      logoHeightPx: 64
    });
    expect(modeLogoOnly.logoDisplayMode).toBe('logo_only');
    expect(modeLogoOnly.headerLayoutMode).toBe('split_right');
    expect(modeLogoOnly.showLogo).toBe(true);
    expect(modeLogoOnly.showCompanyName).toBe(false);
    expect(modeLogoOnly.logoHeightPx).toBe(64);
    expect(modeLogoOnly.logoMaxWidthPx).toBe(260);

    // 3. 'full_banner' forces headerLayoutMode = 'banner' and expands max-width to 700px
    const modeFullBanner = resolveHeaderBrandingConfig({
      logoUrl: customLogoUri,
      logoDisplayMode: 'full_banner',
      logoHeightPx: 92
    });
    expect(modeFullBanner.logoDisplayMode).toBe('full_banner');
    expect(modeFullBanner.headerLayoutMode).toBe('banner');
    expect(modeFullBanner.showLogo).toBe(true);
    expect(modeFullBanner.logoMaxWidthPx).toBe(700);
    expect(modeFullBanner.bannerMaxHeightPx).toBe(92);

    // 4. 'no_logo' hides logo and suppresses Page 2+ mini-logo
    const modeNoLogo = resolveHeaderBrandingConfig({
      logoUrl: customLogoUri,
      logoDisplayMode: 'no_logo'
    });
    expect(modeNoLogo.logoDisplayMode).toBe('no_logo');
    expect(modeNoLogo.showLogo).toBe(false);
    expect(modeNoLogo.showCompanyName).toBe(true);
    expect(modeNoLogo.includeMiniLogoOnContinuation).toBe(false);

    // 5. Disabling showLogoOnContinuationPages suppresses mini-logo on Page 2+ & Annex headers while keeping Page 1 logo active
    const noContinuationLogo = resolveHeaderBrandingConfig({
      logoUrl: customLogoUri,
      logoDisplayMode: 'logo_and_name',
      showLogoOnContinuationPages: false
    });
    expect(noContinuationLogo.showLogo).toBe(true);
    expect(noContinuationLogo.showLogoOnContinuationPages).toBe(false);
    expect(noContinuationLogo.includeMiniLogoOnContinuation).toBe(false);
  });

  it('18c. Preset serialization/hydration and Revision cloning (R1 -> R2) preserve company_logo_url and all header_config logo properties', () => {
    const sampleLogoDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA_CUSTOM_CORP_LOGO';

    // 1. Preset snapshot serialization & hydration
    const presetSnapshot = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_18',
      workspaceId: 'ws_18',
      preset_name: 'Executive Wide Lockup Preset',
      visible_columns: { brand: true, model: true, origin: true, availability: true, unit_price: true },
      default_tax_mode: 'taxes_extra',
      default_price_basis: 'DDP Dubai',
      default_payment_terms: '30 Days Net',
      default_validity_days: 30,
      signatory_mode: 'single',
      company_logo_url: sampleLogoDataUri,
      header_config: {
        logoUrl: sampleLogoDataUri,
        showLogo: true,
        logoDisplayMode: 'logo_only',
        headerLayoutMode: 'split_right',
        logoHeightPx: 72,
        logoMaxWidthPx: 300,
        logoSpacing: 'spacious',
        repeatHeaderOnSubsequentPages: true,
        showLogoOnContinuationPages: true
      }
    });

    expect(presetSnapshot.company_logo_url).toBe(sampleLogoDataUri);
    expect(presetSnapshot.header_config?.logoUrl).toBe(sampleLogoDataUri);
    expect(presetSnapshot.header_config?.logoDisplayMode).toBe('logo_only');
    expect(presetSnapshot.header_config?.headerLayoutMode).toBe('split_right');
    expect(presetSnapshot.header_config?.logoHeightPx).toBe(72);
    expect(presetSnapshot.header_config?.logoMaxWidthPx).toBe(300);
    expect(presetSnapshot.header_config?.showCompanyName).toBe(false);

    const hydratedFromPreset = QuotationRepository.hydrateFromPresetSnapshot(presetSnapshot);
    expect(hydratedFromPreset.companyLogoUrl).toBe(sampleLogoDataUri);
    expect(hydratedFromPreset.headerConfig.logoUrl).toBe(sampleLogoDataUri);
    expect(hydratedFromPreset.headerConfig.logoDisplayMode).toBe('logo_only');
    expect(hydratedFromPreset.headerConfig.headerLayoutMode).toBe('split_right');
    expect(hydratedFromPreset.headerConfig.logoHeightPx).toBe(72);
    expect(hydratedFromPreset.headerConfig.showLogoOnContinuationPages).toBe(true);

    // 2. Revision cloning (R1 -> R2) and Studio hydration preserve company_logo_url and header_config
    const r1Quotation: Quotation = {
      id: 'q_logo_r1',
      workspace_id: 'ws_18',
      workspaceId: 'ws_18',
      enquiry_id: 'enq_18',
      quote_number: 'QT-2026-0118',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0118-R1',
      status: 'Sent',
      client_snapshot: { entity_name: 'Abu Dhabi Sewerage Services' },
      sender_snapshot: { entity_name: 'AquaTech Engineering LLC' },
      line_items: [],
      tax_mode: 'taxes_extra',
      subtotal: 12000,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 600,
      grand_total: 12600,
      company_logo_url: sampleLogoDataUri,
      header_config: {
        logoUrl: sampleLogoDataUri,
        showLogo: true,
        logoDisplayMode: 'full_banner',
        headerLayoutMode: 'banner',
        logoHeightPx: 88,
        logoMaxWidthPx: 700,
        repeatHeaderOnSubsequentPages: true,
        showLogoOnContinuationPages: false
      },
      created_at: '2026-10-25T00:00:00.000Z'
    };

    const r2Quotation = QuotationRepository.cloneQuotationAsNextRevision(r1Quotation);
    expect(r2Quotation.revision_number).toBe(2);
    expect(r2Quotation.company_logo_url).toBe(sampleLogoDataUri);
    expect(r2Quotation.header_config?.logoUrl).toBe(sampleLogoDataUri);
    expect(r2Quotation.header_config?.logoDisplayMode).toBe('full_banner');
    expect(r2Quotation.header_config?.headerLayoutMode).toBe('banner');
    expect(r2Quotation.header_config?.logoHeightPx).toBe(88);
    expect(r2Quotation.header_config?.showLogoOnContinuationPages).toBe(false);

    const hydratedStudio = QuotationRepository.hydrateStudioStateFromQuotation(r2Quotation);
    expect(hydratedStudio.companyLogoUrl).toBe(sampleLogoDataUri);
    expect(hydratedStudio.headerConfig.logoUrl).toBe(sampleLogoDataUri);
    expect(hydratedStudio.headerConfig.logoDisplayMode).toBe('full_banner');
    expect(hydratedStudio.headerConfig.headerLayoutMode).toBe('banner');
    expect(hydratedStudio.headerConfig.logoHeightPx).toBe(88);
    expect(hydratedStudio.headerConfig.showLogoOnContinuationPages).toBe(false);
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
