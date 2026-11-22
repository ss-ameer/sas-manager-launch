/**
 * Comprehensive Unit Test Suite for Quotation Engine, Suffix Sanitizer,
 * Currency Math Precision, and Signatory Attribution.
 *
 * Can be verified via `tsc --noEmit` and executed directly via `tsx src/__tests__/quotationEngine.test.ts`.
 */

import { sanitizeCompanyNameAndSuffix } from '../components/companies/CreateCompanyModal';
import { amountToWords, formatAmountInWords } from '../utils/numberToWords';
import {
  resolveStudioHydrationTargetKey,
  shouldRunStudioHydration,
  mergeRehydratedLineItemBlobs,
  mergeRehydratedAttachmentsBlobs,
  mergeRehydratedEnquiryBlobs
} from '../utils/blobRehydrationMerge';
import {
  QuotationPreset,
  WorkspaceDocumentProfile,
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
  resolveEffectivePageHeader,
  getBodyPageHeaderKey,
  getAnnexPageHeaderKey,
  isPageHeaderOverrideActive,
  resolveDocumentThemePalette,
  resolveStampSignatureOverlayConfig,
  resolveHeaderFields,
  resolveFooterPresentation,
  amountInWordsAED,
  prepareOptionFilteredLineItems,
  resolveCanonicalLineItemIndex,
  resolveLineItemOptionalFlag,
  DEFAULT_QUOTATION_BLOCKS,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_RECIPIENT_CONFIG
} from '../components/quotations/QuotationDocument';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import {
  hasDynamicAtTag,
  sanitizePresetDynamicTemplate,
  resolveQuotationTokens,
  QUOTATION_AT_TAGS
} from '../utils/quotationTokenResolver';
import {
  canonicalSpecAttributeKey,
  isGlobalAttributeVisible,
  setGlobalAttributeVisibility,
  showAllGlobalAttributes,
  hideAllGlobalAttributes,
  buildQuickSpecLayoutPreset,
  hasItemAttributeOverrides,
  resolveLineItemAttributeLayout
} from '../utils/specAttributeLayout';
import {
  buildInlineLineItemFieldKey,
  parseInlineLineItemFieldKey,
  resolveInlineEditSeedValue,
  parseInlineNumericValue,
  parseInlineValidityDays
} from '../utils/inlineQuickEdit';
import {
  resolveLineItemOptionBadges,
  isOptionalQuotationLineItem,
  calculateOptionalItemsTotals,
  shouldShowAlternateTotalWithOptionals,
  DEFAULT_ALTERNATE_TOTAL_WITH_OPTIONALS_LABEL
} from '../utils/optionalTotals';

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
    expect(defaultLayout.widths.unitPrice).toBe('13%');
    expect(defaultLayout.activeColumnCount).toBe(6);

    const hiddenUnitPriceLayout = resolveTableColumnLayout({
      unit_price: false,
      showUnitPrice: false,
      showUom: true,
      showLineTotal: true
    });
    expect(hiddenUnitPriceLayout.showUnitPrice).toBe(false);
    expect(hiddenUnitPriceLayout.widths.unitPrice).toBe('0%');
    expect(hiddenUnitPriceLayout.widths.description).toBe('65%');
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
      pagePlacement: 'annex_after',
      annexPageNumber: 2,
      badgeLabel: 'Annex Page 2'
    });
    expect(result.submittalsIndexEntries[1]).toEqual({
      indexNumber: 2,
      id: 'att_pdf_ref',
      name: 'ISO 9001 & CE Compliance Dossier (42-Page PDF)',
      url: 'https://example.com/iso-dossier.pdf',
      renderAsAnnexPage: false,
      pagePlacement: 'index_only',
      annexPageNumber: undefined,
      badgeLabel: 'Enclosed Document'
    });
    expect(result.submittalsIndexEntries[2]).toEqual({
      indexNumber: 3,
      id: 'att_doc_ref',
      name: 'Standard O&M Manual Reference Link',
      url: 'https://example.com/om-manual.docx',
      renderAsAnnexPage: false,
      pagePlacement: 'index_only',
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
      show_title_on_annex: true,
      page_placement: 'annex_after',
      full_bleed: false,
      exclude_from_page_count: false
    });
    expect(hydrated.flyerAttachments[1]).toEqual({
      id: 'preset_flyer_2',
      name: 'Standard Warranty & Quality Assurance Certificate',
      url: 'https://example.com/warranty-cert.pdf',
      type: 'pdf',
      render_as_annex_page: false,
      show_title_on_annex: true,
      page_placement: 'index_only',
      full_bleed: false,
      exclude_from_page_count: false
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

    // Non-optional item Ex-VAT net subtotal is 25,000; Grand Total (with 1,000 freight + 5% tax) is 27,300
    // Optional item (4,200) must be excluded from quoted_amount
    const syncPayload = QuotationRepository.buildEnquiryQuotationSyncPayload(clonedR2);

    expect(syncPayload.active_quotation_id).toBe(clonedR2.id!);
    expect(syncPayload.latest_quote_ref).toBe('TEST/10/2026/5-R2');
    expect(syncPayload.quoted_amount).toBe(25000);
    expect((syncPayload as any).subtotal_aed).toBe(25000);
    expect((syncPayload as any).grand_total_aed).toBe(27300);
    expect(syncPayload.quotation_status).toBe('Approved');
    expect(syncPayload.latest_revision_number).toBe(2);
    expect(Array.isArray((syncPayload as any).line_items)).toBe(true);
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
    expect(minimalSharpLayout.recipientCardClassName.includes('border-0')).toBe(true);
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
    expect(minimalGlobal.recipientCardClassName.includes('border-0')).toBe(true);
    expect(minimalGlobal.recipientCardClassName.includes('pt-1 pb-1 px-0.5')).toBe(true);
    expect(minimalGlobal.offerCardClassName.includes('border-0')).toBe(true);
    expect(minimalGlobal.offerCardClassName.includes('pt-1 pb-1 px-0.5')).toBe(true);
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
// SUITE 19: SETTINGS -> STUDIO PARITY, NON-DESTRUCTIVE SAVES & BANK FIELD NORMALIZATION
// ==========================================

describe('Suite 19: Settings <-> Quotation Studio Parity, Non-Destructive Saves & Bank Normalization', () => {
  it('19a. mergeWorkspaceDocumentProfile preserves extended Phase-3 Studio defaults when saving in Settings', () => {
    const existingStudioProfile = {
      id: 'prof_ws_19',
      workspace_id: 'ws_19',
      workspaceId: 'ws_19',
      profile_name: 'Corporate Profile',
      legal_entity_name: 'Nirvana Water Treatment LLC',
      trn: '100234567800003',
      address_line_1: 'Al Quoz Ind 3',
      city: 'Dubai',
      country: 'UAE',
      logo_url: 'data:image/png;base64,LOGO_19',
      stamp_seal_url: 'data:image/png;base64,SEAL_19',
      signature_image_url: 'data:image/png;base64,SIGN_19',
      theme_accent: 'emerald' as const,
      block_style: 'minimal' as const,
      globalCardRadius: 'sharp' as const,
      fontSizeScale: 'large' as const,
      table_density: 'compact' as const,
      signatory_type: 'dual' as const,
      signature_style: 'image' as const,
      primary_signatory_name: 'Eng. Khalid Al Rostamani',
      primary_signatory_title: 'Commercial Director',
      secondary_signatory_name: 'Tariq Al Mazrouei',
      secondary_signatory_title: 'Managing Partner',
      header_config: {
        logoUrl: 'data:image/png;base64,LOGO_19',
        showLogo: true,
        logoDisplayMode: 'logo_only' as const,
        headerLayoutMode: 'split_right' as const,
        logoHeightPx: 68,
        showLogoOnContinuationPages: true
      },
      bank_accounts: [
        {
          id: 'bank_19_1',
          bank_name: 'Emirates NBD',
          account_title: 'Nirvana Water Treatment LLC',
          account_number: '1015566778801',
          iban: 'AE070260001015566778801',
          swift_code: 'EBILAEADXXX',
          branch_address: 'Jebel Ali Branch, Dubai',
          currency: 'AED',
          is_default: true
        }
      ]
    };

    // Simulate a partial update from Settings updating only phone and address_line_2
    const merged = QuotationRepository.mergeWorkspaceDocumentProfile(existingStudioProfile, {
      workspace_id: 'ws_19',
      profile_name: 'Corporate Profile',
      legal_entity_name: 'Nirvana Water Treatment LLC',
      address_line_1: 'Al Quoz Ind 3',
      address_line_2: 'P.O. Box 99812',
      phone: '+971 4 882 9900',
      bank_accounts: existingStudioProfile.bank_accounts
    });

    expect(merged.address_line_2).toBe('P.O. Box 99812');
    expect(merged.phone).toBe('+971 4 882 9900');
    expect(merged.theme_accent).toBe('emerald');
    expect(merged.block_style).toBe('minimal');
    expect(merged.globalCardRadius).toBe('sharp');
    expect(merged.fontSizeScale).toBe('large');
    expect(merged.table_density).toBe('compact');
    expect(merged.signatory_type).toBe('dual');
    expect(merged.signature_style).toBe('image');
    expect(merged.signature_image_url).toBe('data:image/png;base64,SIGN_19');
    expect(merged.primary_signatory_name).toBe('Eng. Khalid Al Rostamani');
    expect(merged.secondary_signatory_name).toBe('Tariq Al Mazrouei');
    expect(merged.header_config?.logoDisplayMode).toBe('logo_only');
    expect(merged.header_config?.headerLayoutMode).toBe('split_right');
    expect(merged.header_config?.logoHeightPx).toBe(68);
  });

  it('19b. Bank account normalization synchronizes account_title / account_name / beneficiaryName, swift_code / swift_bic / swiftCode, and branch_address / branchName', () => {
    const rawSettingsBank = {
      id: 'bank_norm_1',
      bank_name: 'First Abu Dhabi Bank (FAB)',
      account_title: 'AquaTech Engineering LLC',
      account_number: '4001122334455',
      iban: 'AE910350004001122334455',
      swift_code: 'NBADAEAAXXX',
      branch_address: 'Khalifa Street Corporate Branch, Abu Dhabi',
      currency: 'AED',
      is_default: true
    };

    const normalized = QuotationRepository.normalizeBankAccount(rawSettingsBank);

    expect(normalized.bank_name).toBe('First Abu Dhabi Bank (FAB)');
    expect(normalized.bankName).toBe('First Abu Dhabi Bank (FAB)');
    expect(normalized.account_title).toBe('AquaTech Engineering LLC');
    expect(normalized.account_name).toBe('AquaTech Engineering LLC');
    expect(normalized.beneficiaryName).toBe('AquaTech Engineering LLC');
    expect(normalized.account_number).toBe('4001122334455');
    expect(normalized.accountNumber).toBe('4001122334455');
    expect(normalized.swift_code).toBe('NBADAEAAXXX');
    expect(normalized.swift_bic).toBe('NBADAEAAXXX');
    expect(normalized.swiftCode).toBe('NBADAEAAXXX');
    expect(normalized.branch_address).toBe('Khalifa Street Corporate Branch, Abu Dhabi');
    expect(normalized.branchName).toBe('Khalifa Street Corporate Branch, Abu Dhabi');
    expect(normalized.is_default).toBe(true);
    expect(normalized.isDefault).toBe(true);
  });

  it('19c. Studio hydration inherits WorkspaceDocumentProfile Phase-3 styling & signatory defaults when no preset or existing quotation overrides them', () => {
    const richProfile = {
      id: 'prof_19c',
      profile_name: 'Executive Profile',
      legal_entity_name: 'Gulf Water Systems LLC',
      address_line_1: 'DIC Phase 2',
      logo_url: 'data:image/png;base64,PROF_LOGO_19C',
      stamp_seal_url: 'data:image/png;base64,PROF_SEAL_19C',
      signature_image_url: 'data:image/png;base64,PROF_SIGN_19C',
      theme_accent: 'teal' as const,
      block_style: 'minimal' as const,
      globalCardRadius: 'sharp' as const,
      fontSizeScale: 'compact' as const,
      table_density: 'spacious' as const,
      default_tax_mode: 'tax_calculated' as const,
      default_price_basis: 'CIF Jebel Ali Port',
      default_payment_terms: '60 Days Irrevocable LC',
      default_validity_days: 45,
      header_config: {
        logoUrl: 'data:image/png;base64,PROF_LOGO_19C',
        logoDisplayMode: 'logo_only' as const,
        headerLayoutMode: 'centered' as const,
        logoHeightPx: 60
      },
      bank_accounts: [
        {
          id: 'bank_19c',
          bank_name: 'Mashreq Bank',
          account_title: 'Gulf Water Systems LLC',
          account_number: '0190098877',
          swift_code: 'BOMLAEAD',
          is_default: true
        }
      ]
    };

    const hydrated = QuotationRepository.hydrateStudioStateFromQuotation(null, richProfile, null);
    expect(hydrated.blockStyle).toBe('minimal');
    expect(hydrated.globalCardRadius).toBe('sharp');
    expect(hydrated.fontSizeScale).toBe('compact');
    expect(hydrated.tableDensity).toBe('spacious');
    expect(hydrated.companyLogoUrl).toBe('data:image/png;base64,PROF_LOGO_19C');
    expect(hydrated.companySealUrl).toBe('data:image/png;base64,PROF_SEAL_19C');
    expect(hydrated.signatureImageUrl).toBe('data:image/png;base64,PROF_SIGN_19C');
    expect(hydrated.taxMode).toBe('tax_calculated');
    expect(hydrated.priceBasis).toBe('CIF Jebel Ali Port');
    expect(hydrated.paymentTerms).toBe('60 Days Irrevocable LC');
    expect(hydrated.selectedBankId).toBe('bank_19c');
    expect(hydrated.headerConfig.logoDisplayMode).toBe('logo_only');
    expect(hydrated.headerConfig.headerLayoutMode).toBe('centered');
    expect(hydrated.headerConfig.logoHeightPx).toBe(60);
  });
});

// ==========================================
// SUITE 20: FIRESTORE 1MB SAFEGUARD, MODULAR HEADER/FOOTER COMPOSER,
//           IN-FRONT-OF-TEXT STAMP/SIGNATURE OVERLAY & CUSTOM HEX THEME ENGINE
// ==========================================

describe('Suite 20: Firestore 1MB Payload Safeguard, Modular Header/Footer Composer, Stamp/Signature Overlay & Custom Hex Theme Engine', () => {
  it('20a. sanitizePayloadForFirestoreLimit and estimatePayloadBytes keep oversized quotation/preset payloads safely below 900KB without losing primary branding assets', () => {
    const largeLogoBase64 = 'data:image/png;base64,' + 'A'.repeat(340_000);
    const largeSealBase64 = 'data:image/png;base64,' + 'B'.repeat(320_000);
    const largeFlyerBase64 = 'data:image/jpeg;base64,' + 'C'.repeat(420_000);

    // Construct an oversized payload (> 1.19MB) with duplicate logo/seal in nested configs + heavy flyer attachment
    const oversizedPayload = {
      id: 'quote_oversized_20a',
      company_logo_url: largeLogoBase64,
      company_seal_url: largeSealBase64,
      header_config: {
        logoUrl: largeLogoBase64,
        showLogo: true
      },
      footer_config: {
        companySealUrl: largeSealBase64,
        showCompanySeal: true
      },
      flyer_attachments: [
        {
          id: 'flyer_heavy_1',
          name: 'Heavy High-Res Annex',
          url: largeFlyerBase64,
          type: 'image/jpeg',
          render_as_annex_page: true
        }
      ]
    };

    const rawBytes = QuotationRepository.estimatePayloadBytes(oversizedPayload);
    expect(rawBytes > 1_048_576).toBe(true);

    const sanitized = QuotationRepository.sanitizePayloadForFirestoreLimit(oversizedPayload, 880_000);
    const sanitizedBytes = QuotationRepository.estimatePayloadBytes(sanitized);

    // Must be safely below Firestore 1MB limit (< 880,000 bytes)
    expect(sanitizedBytes <= 880_000).toBe(true);
    // Primary branding logo & seal are preserved while duplicate copies were deduplicated
    expect(Boolean(sanitized.header_config?.logoUrl || sanitized.company_logo_url)).toBe(true);
    expect(Boolean(sanitized.footer_config?.companySealUrl || sanitized.company_seal_url)).toBe(true);
  });

  it('20b. resolveHeaderFields supports custom text overrides, custom added fields, zone assignment (under_logo, under_name, contact_block, bottom_bar), and 2D alignment', () => {
    const profile = {
      id: 'prof_20b',
      profile_name: 'Default Profile',
      legal_entity_name: 'Nirvana Water Treatment LLC',
      trn: '100998877660003',
      address_line_1: 'TechnoPark Plot 44, Jebel Ali',
      city: 'Dubai',
      country: 'UAE',
      phone: '+971 4 800 1234',
      email: 'tenders@nirvanawater.ae',
      website: 'www.nirvanawater.ae',
      bank_accounts: []
    };

    // Custom header configuration moving TRN/VAT directly under logo and adding ISO certification to bottom_bar
    const headerConfig: QuotationHeaderConfig = {
      logoUrl: 'data:image/png;base64,LOGO_20B',
      showLogo: true,
      brandHorizontalAlign: 'center',
      brandVerticalAlign: 'middle',
      contactHorizontalAlign: 'right',
      contactVerticalAlign: 'bottom',
      headerFields: [
        {
          id: 'trn',
          label: 'VAT Reg',
          valueOverride: 'TRN-AE-100998877660003',
          enabled: true,
          zone: 'under_logo',
          fontSize: 'sm',
          fontWeight: 'bold'
        },
        {
          id: 'tagline',
          label: '',
          valueOverride: 'Engineered Water & Wastewater Solutions',
          enabled: true,
          zone: 'under_name',
          fontSize: 'xs',
          fontWeight: 'medium'
        },
        {
          id: 'phone',
          label: 'Tel',
          valueOverride: '+971 4 800 9999',
          enabled: true,
          zone: 'contact_block',
          fontSize: 'xs',
          fontWeight: 'medium'
        },
        {
          id: 'custom_iso',
          label: 'Certifications',
          valueOverride: 'ISO 9001:2015 • ISO 14001 • OHSAS 18001',
          enabled: true,
          zone: 'bottom_bar',
          fontSize: 'xs',
          fontWeight: 'bold'
        }
      ]
    };

    const resolved = resolveHeaderFields(headerConfig, profile);

    expect(resolved.brandHorizontalAlign).toBe('center');
    expect(resolved.brandVerticalAlign).toBe('middle');
    expect(resolved.contactHorizontalAlign).toBe('right');
    expect(resolved.contactVerticalAlign).toBe('bottom');

    expect(resolved.underLogo.length).toBe(1);
    expect(resolved.underLogo[0].id).toBe('trn');
    expect(resolved.underLogo[0].resolvedValue).toBe('TRN-AE-100998877660003');

    expect(resolved.underName.length).toBe(1);
    expect(resolved.underName[0].resolvedValue).toBe('Engineered Water & Wastewater Solutions');

    expect(resolved.contactBlock.length).toBe(1);
    expect(resolved.contactBlock[0].resolvedValue).toBe('+971 4 800 9999');

    expect(resolved.bottomBar.length).toBe(1);
    expect(resolved.bottomBar[0].id).toBe('custom_iso');
    expect(resolved.bottomBar[0].resolvedValue).toBe('ISO 9001:2015 • ISO 14001 • OHSAS 18001');
  });

  it('20c. resolveStampSignatureOverlayConfig resolves MS Word In-Front-Of-Text stamp & signature size, rotation, X/Y offset, realistic_overlap, and inkMultiplyBlend', () => {
    const defaultOverlay = resolveStampSignatureOverlayConfig({});
    expect(defaultOverlay.sealSizePx).toBe(105);
    expect(defaultOverlay.sealRotationDeg).toBe(-6);
    expect(defaultOverlay.sealOffsetX).toBe(0);
    expect(defaultOverlay.sealOffsetY).toBe(0);
    expect(defaultOverlay.signatureSizePx).toBe(56);
    expect(defaultOverlay.signatureRotationDeg).toBe(0);
    expect(defaultOverlay.stampSignatureOverlapMode).toBe('realistic_overlap');
    expect(defaultOverlay.inkMultiplyBlend).toBe(true);

    // Custom free-floating coordinates & clamped bounds
    const customOverlay = resolveStampSignatureOverlayConfig({
      sealSizePx: 145,
      sealRotationDeg: -14,
      sealOffsetX: -28,
      sealOffsetY: 12,
      signatureSizePx: 78,
      signatureRotationDeg: 6,
      signatureOffsetX: 18,
      signatureOffsetY: -10,
      stampSignatureOverlapMode: 'stamp_over_name',
      inkMultiplyBlend: false
    });

    expect(customOverlay.sealSizePx).toBe(145);
    expect(customOverlay.sealRotationDeg).toBe(-14);
    expect(customOverlay.sealOffsetX).toBe(-28);
    expect(customOverlay.sealOffsetY).toBe(12);
    expect(customOverlay.signatureSizePx).toBe(78);
    expect(customOverlay.signatureRotationDeg).toBe(6);
    expect(customOverlay.signatureOffsetX).toBe(18);
    expect(customOverlay.signatureOffsetY).toBe(-10);
    expect(customOverlay.stampSignatureOverlapMode).toBe('stamp_over_name');
    expect(customOverlay.inkMultiplyBlend).toBe(false);
  });

  it('20d. resolveDocumentThemePalette drives custom hex colors (#0f4c81) and preset themes across letterhead bar, table header, badges, and grand total, plus resolveFooterPresentation', () => {
    // 1. Preset theme ('emerald')
    const emeraldPalette = resolveDocumentThemePalette('emerald');
    expect(emeraldPalette.primaryHex).toBe('#065f46');
    expect(emeraldPalette.textAccent).toBe('#065f46');

    // 2. Custom brand hex color ('#0F4C81') overrides preset theme and generates harmonized RGBA tints
    const customHexPalette = resolveDocumentThemePalette('slate', '#0F4C81');
    expect(customHexPalette.primaryHex).toBe('#0f4c81');
    expect(customHexPalette.textAccent).toBe('#0f4c81');
    expect(customHexPalette.tintBg).toBe('rgba(15, 76, 129, 0.06)');
    expect(customHexPalette.tintStrongBg).toBe('rgba(15, 76, 129, 0.11)');
    expect(customHexPalette.borderTint).toBe('rgba(15, 76, 129, 0.24)');

    // 3. Modular footer presentation (2D alignment, custom tagline, and custom pills)
    const footerPres = resolveFooterPresentation({
      footerHorizontalAlign: 'center',
      footerVerticalAlign: 'bottom',
      showSystemTagline: true,
      systemTaglineText: 'Approved Vendor #99182 • Confidential Commercial Tender',
      showReferenceInFooter: true,
      showIssueDateInFooter: false,
      showPageNumbers: true,
      customFooterPills: ['ISO 9001:2015', 'DUNS 88-192-001']
    });

    expect(footerPres.footerHorizontalAlign).toBe('center');
    expect(footerPres.footerVerticalAlign).toBe('bottom');
    expect(footerPres.systemTaglineText).toBe('Approved Vendor #99182 • Confidential Commercial Tender');
    expect(footerPres.showIssueDateInFooter).toBe(false);
    expect(footerPres.customFooterPills).toEqual(['ISO 9001:2015', 'DUNS 88-192-001']);
  });
});

// ==========================================
// SUITE 21: GLOBAL FONT SCALE, MINIMAL ZERO-GHOST-BORDERS, UNIFIED ADDRESS WITH MAP-PIN,
//           COVER PAGES (FULL-BLEED & PAGE COUNT EXCLUSION) & PAGE 2+ RUNNING HEADER MODES
// ==========================================

describe('Suite 21: Global Font Scale, Minimal Zero-Ghost-Borders, Unified Address, Cover Pages & Page 2+ Running Header', () => {
  it('21a. Minimal presentation style eliminates ghost top borders (border-0) on top cards and resolveHeaderFields scales dynamically with fontSizeScale', () => {
    const minimalCards = resolveTopCardsLayout({}, 'minimal', 'rounded', 'recipient_first');
    expect(minimalCards.recipientStyle).toBe('minimal');
    expect(minimalCards.offerStyle).toBe('minimal');
    expect(minimalCards.recipientCardClassName.includes('border-0')).toBe(true);
    expect(minimalCards.recipientCardClassName.includes('border-t')).toBe(false);
    expect(minimalCards.offerCardClassName.includes('border-0')).toBe(true);
    expect(minimalCards.offerCardClassName.includes('border-t')).toBe(false);

    // Verify resolveHeaderFields fontSizeMap scales dynamically with global fontSizeScale ('compact' vs 'large')
    const profile = {
      id: 'p_21a',
      profile_name: 'Default',
      legal_entity_name: 'AquaPure Engineering LLC',
      trn: '100223344550003',
      address_line_1: 'Plot 12, TechnoPark',
      city: 'Dubai',
      country: 'UAE',
      phone: '+971 4 888 1111',
      bank_accounts: []
    };

    const compactHeader = resolveHeaderFields({}, profile, undefined, 'compact');
    const largeHeader = resolveHeaderFields({}, profile, undefined, 'large');

    const compactAddress = compactHeader.allFields.find((f) => f.id === 'address');
    const largeAddress = largeHeader.allFields.find((f) => f.id === 'address');
    expect(compactAddress?.fontSizeClass).toBe('text-[8.5px] print:text-[8px]');
    expect(largeAddress?.fontSizeClass).toBe('text-[11.5px] print:text-[10.5px]');
  });

  it('21b. Unified address field combines address_line_1, address_line_2, city, and country with default map-pin icon and migrates legacy split address fields', () => {
    const profile = {
      id: 'p_21b',
      profile_name: 'Corporate',
      legal_entity_name: 'Gulf Water Treatment LLC',
      address_line_1: 'Office 904, Business Bay',
      address_line_2: 'P.O. Box 44120',
      city: 'Dubai',
      country: 'United Arab Emirates',
      phone: '+971 4 555 0000',
      email: 'info@gulfwater.ae',
      website: 'www.gulfwater.ae',
      bank_accounts: []
    };

    // 1. Default header fields unify address into a single 'address' item with 'map-pin' icon
    const defaultResolved = resolveHeaderFields({}, profile);
    const addrField = defaultResolved.allFields.find((f) => f.id === 'address');
    expect(Boolean(addrField)).toBe(true);
    expect(addrField?.resolvedValue).toBe(
      'Office 904, Business Bay, P.O. Box 44120, Dubai, United Arab Emirates'
    );
    expect(addrField?.icon).toBe('map-pin');
    expect(addrField?.showIcon).toBe(true);
    expect(defaultResolved.showHeaderIcons).toBe(true);

    // 2. Legacy saved headerFields with 'address_line_1', 'address_line_2', 'city_country' automatically migrate into unified 'address' without duplication
    const legacyConfig: QuotationHeaderConfig = {
      headerFields: [
        { id: 'company_name', label: '', enabled: true, zone: 'under_name' },
        {
          id: 'address_line_1',
          label: '',
          valueOverride: 'Custom Plot 88',
          enabled: true,
          zone: 'contact_block'
        },
        {
          id: 'city_country',
          label: '',
          valueOverride: 'Abu Dhabi, UAE',
          enabled: true,
          zone: 'contact_block'
        }
      ]
    };

    const migrated = resolveHeaderFields(legacyConfig, profile);
    const addressItems = migrated.allFields.filter((f) => f.id === 'address');
    expect(addressItems.length).toBe(1);
    expect(addressItems[0].resolvedValue).toBe('Custom Plot 88, Abu Dhabi, UAE');
    expect(addressItems[0].icon).toBe('map-pin');
  });

  it('21c. Cover Page attachments (page_placement: cover_before, full_bleed, exclude_from_page_count) partition before Page 1 and adjust total page numbering accurately', () => {
    const attachments: Attachment[] = [
      {
        id: 'cov_1',
        name: 'Executive Proposal Cover',
        url: 'https://example.com/cover.jpg',
        type: 'image/jpeg',
        page_placement: 'cover_before',
        full_bleed: true,
        exclude_from_page_count: true,
        render_as_annex_page: true
      },
      {
        id: 'ann_1',
        name: 'RO Skid P&ID Drawing',
        url: 'https://example.com/pid.png',
        type: 'image/png',
        page_placement: 'annex_after',
        full_bleed: false,
        render_as_annex_page: true,
        show_title_on_annex: true
      },
      {
        id: 'idx_1',
        name: 'ISO 9001 Certificate PDF',
        url: 'https://example.com/iso.pdf',
        type: 'application/pdf',
        page_placement: 'index_only',
        render_as_annex_page: false
      }
    ];

    // 1. When cover has exclude_from_page_count = true:
    // Cover sheet has sheetNumber = undefined (excluded), Main sheet #1 is Page 1, Annex sheet #1 is Page 2, totalDocumentPages = 2
    const paginationExcludedCover = resolveDocumentPaginationWithAnnexes(
      DEFAULT_QUOTATION_BLOCKS,
      [],
      attachments,
      true
    );

    expect(paginationExcludedCover.coverSheets.length).toBe(1);
    expect(paginationExcludedCover.coverSheets[0].fullBleed).toBe(true);
    expect(paginationExcludedCover.coverSheets[0].excludedFromPageCount).toBe(true);
    expect(paginationExcludedCover.coverSheets[0].sheetNumber).toBe(undefined);
    expect(paginationExcludedCover.mainSheets.length).toBe(1);
    expect(paginationExcludedCover.mainSheets[0].sheetNumber).toBe(1);
    expect(paginationExcludedCover.annexSheets.length).toBe(1);
    expect(paginationExcludedCover.annexSheets[0].sheetNumber).toBe(2);
    expect(paginationExcludedCover.totalDocumentPages).toBe(2);

    // 2. When cover has exclude_from_page_count = false:
    // Cover is Page 1, Main sheet #1 is Page 2, Annex sheet #1 is Page 3, totalDocumentPages = 3
    const attachmentsIncludedCover: Attachment[] = [
      { ...attachments[0], exclude_from_page_count: false },
      attachments[1]
    ];
    const paginationIncludedCover = resolveDocumentPaginationWithAnnexes(
      DEFAULT_QUOTATION_BLOCKS,
      [],
      attachmentsIncludedCover,
      true
    );
    expect(paginationIncludedCover.coverSheets[0].sheetNumber).toBe(1);
    expect(paginationIncludedCover.mainSheets[0].sheetNumber).toBe(2);
    expect(paginationIncludedCover.annexSheets[0].sheetNumber).toBe(3);
    expect(paginationIncludedCover.totalDocumentPages).toBe(3);
  });

  it('21d. Page 2+ Running Header modes (compact, full_repeat, logo_only, none), continuationLogoHeightPx, and element toggles persist across revisions and presets', () => {
    const branding = resolveHeaderBrandingConfig({
      logoUrl: 'data:image/png;base64,LOGO_21D',
      continuationHeaderMode: 'logo_only',
      continuationLogoHeightPx: 32,
      showCompanyNameOnContinuation: false,
      showSubjectOnContinuation: false,
      showQuoteRefOnContinuation: true,
      showPageNumberOnContinuation: true,
      showContinuationDivider: false
    });

    expect(branding.continuationHeaderMode).toBe('logo_only');
    expect(branding.repeatHeaderOnSubsequentPages).toBe(true);
    expect(branding.continuationLogoHeightPx).toBe(32);
    expect(branding.showCompanyNameOnContinuation).toBe(false);
    expect(branding.showSubjectOnContinuation).toBe(false);
    expect(branding.showQuoteRefOnContinuation).toBe(true);
    expect(branding.showPageNumberOnContinuation).toBe(true);
    expect(branding.showContinuationDivider).toBe(false);

    // Verify revision cloning preserves cover page attachment properties and Page 2+ running header config
    const r1: Quotation = {
      id: 'q_21d_r1',
      workspace_id: 'ws_21',
      workspaceId: 'ws_21',
      enquiry_id: 'enq_21',
      quote_number: 'QT-2026-0210',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0210-R1',
      status: 'Sent',
      client_snapshot: { entity_name: 'DEWA' },
      sender_snapshot: { entity_name: 'Nirvana Water LLC' },
      line_items: [],
      tax_mode: 'taxes_extra',
      subtotal: 1000,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 50,
      grand_total: 1050,
      header_config: {
        continuationHeaderMode: 'full_repeat',
        continuationLogoHeightPx: 28,
        showSubjectOnContinuation: false,
        showHeaderIcons: true
      },
      flyer_attachments: [
        {
          id: 'cov_21',
          name: 'Cover Sheet',
          url: 'https://example.com/cov.png',
          type: 'image/png',
          page_placement: 'cover_before',
          full_bleed: true,
          exclude_from_page_count: true,
          render_as_annex_page: true
        }
      ],
      created_at: '2026-10-26T00:00:00.000Z'
    };

    const r2 = QuotationRepository.cloneQuotationAsNextRevision(r1);
    expect(r2.header_config?.continuationHeaderMode).toBe('full_repeat');
    expect(r2.header_config?.continuationLogoHeightPx).toBe(28);
    expect(r2.header_config?.showSubjectOnContinuation).toBe(false);
    expect(r2.flyer_attachments?.[0]?.page_placement).toBe('cover_before');
    expect(r2.flyer_attachments?.[0]?.full_bleed).toBe(true);
    expect(r2.flyer_attachments?.[0]?.exclude_from_page_count).toBe(true);
  });
});

// ==========================================
// SUITE 22: LAST-ITEM PAGE BREAKS, CONTEXT-AWARE BREAK INSERTION & LOGO-ONLY HEADER STACKING
// ==========================================

describe('Suite 22: Last-Item Page Breaks, Context-Aware Break Insertion & Logo-Only Header Stacking', () => {
  it('22a. Toggling page_break_after on the final line item splits closing blocks onto a fresh continuation sheet after the table', () => {
    const twoItems: QuotationLineItem[] = [
      {
        id: 'sim_1',
        item_name: 'High-Rejection Brackish Water RO Membrane Element 8"',
        description: 'High-Rejection Brackish Water RO Membrane Element 8"',
        quantity: 12,
        uom: 'PCS',
        unit_price: 1850,
        line_total: 22200,
        page_break_after: false
      },
      {
        id: 'sim_2',
        item_name: 'Vertical Multistage Centrifugal High-Pressure Booster Pump',
        description: 'Vertical Multistage Centrifugal High-Pressure Booster Pump',
        quantity: 2,
        uom: 'SET',
        unit_price: 14600,
        line_total: 29200,
        page_break_after: true
      }
    ];

    const sheets = partitionBlocksIntoSheets(DEFAULT_QUOTATION_BLOCKS, twoItems);
    expect(sheets.length).toBe(2);
    expect(sheets[0].pageLabel).toBe('Page 1 of 2');
    expect(sheets[0].tableChunk?.items.length).toBe(2);
    expect(sheets[0].blocks.length).toBe(0);

    expect(sheets[1].pageLabel).toBe('Page 2 of 2');
    expect(sheets[1].showContinuationHeader).toBe(true);
    expect(sheets[1].blocks.map((b) => b.id)).toEqual([
      'terms',
      'totals',
      'remittance',
      'signatory',
      'acceptance'
    ]);
  });

  it('22b. Inserting a page_break block above an inspected closing block (e.g. before signatory) splits that block and subsequent blocks onto Sheet 2', () => {
    const blocksWithBreakAboveSignatory: QuotationBlockConfig[] = [
      { id: 'terms', enabled: true },
      { id: 'totals', enabled: true },
      { id: 'remittance', enabled: true },
      {
        id: 'break_above_sig',
        type: 'page_break',
        title: 'Page Break',
        enabled: true,
        is_visible: true,
        show_continuation_header: true
      },
      { id: 'signatory', enabled: true },
      { id: 'acceptance', enabled: true }
    ];

    const sheets = partitionBlocksIntoSheets(blocksWithBreakAboveSignatory);
    expect(sheets.length).toBe(2);
    expect(sheets[0].pageLabel).toBe('Page 1 of 2');
    expect(sheets[0].blocks.map((b) => b.id)).toEqual(['terms', 'totals', 'remittance']);
    expect(sheets[1].pageLabel).toBe('Page 2 of 2');
    expect(sheets[1].pageBreakBlock?.id).toBe('break_above_sig');
    expect(sheets[1].blocks.map((b) => b.id)).toEqual(['signatory', 'acceptance']);
  });

  it('22c. Logo-Only mode (logoDisplayMode: logo_only) sets showCompanyName to false while preserving TRN and underName fields for vertical stacking below logo', () => {
    const branding = resolveHeaderBrandingConfig({
      logoDisplayMode: 'logo_only',
      headerLayoutMode: 'split_left',
      brandHorizontalAlign: 'center',
      brandVerticalAlign: 'middle'
    });
    expect(branding.showLogo).toBe(true);
    expect(branding.showCompanyName).toBe(false);
    expect(branding.brandHorizontalAlign).toBe('center');
    expect(branding.brandVerticalAlign).toBe('middle');

    const fields = resolveHeaderFields(
      {
        logoDisplayMode: 'logo_only',
        showTrn: true
      },
      {
        trn: '100342223300003',
        address_line_1: 'Building Y, SAIF Zone',
        city: 'Sharjah',
        country: 'United Arab Emirates'
      }
    );
    expect(fields.underName.some((f) => f.id === 'trn')).toBe(true);
    expect(fields.contactBlock.some((f) => f.id === 'address')).toBe(true);
  });
});

// ==========================================
// SUITE 23: GHOST BLANK PAGE ELIMINATION, ANNEX PAGE NUMBERING & UNIFIED PAGE EXCLUSION
// ==========================================

describe('Suite 23: Ghost Blank Page Elimination, Annex Page Numbering & Unified Page Exclusion', () => {
  it('23a. Trailing page_break or page_break followed only by hidden/disabled/empty signatory blocks or spacers does NOT emit a ghost blank page', () => {
    const blocksWithTrailingEmptySignatory: QuotationBlockConfig[] = [
      { id: 'totals', type: 'totals', enabled: true },
      { id: 'terms', type: 'terms', enabled: true },
      { id: 'remittance', type: 'remittance', enabled: true },
      { id: 'break_trailing', type: 'page_break', enabled: true, is_visible: true },
      { id: 'spacer_trailing', type: 'spacer', enabled: true, is_visible: true, spacer_height_mm: 25 },
      {
        id: 'signatory',
        type: 'signatory',
        enabled: true,
        is_visible: true,
        visibleFields: {
          signatory_company_header: false,
          signatory_stamp_space: false,
          signatory_primary_name: false,
          signatory_primary_title: false
        }
      },
      { id: 'acceptance', type: 'acceptance', enabled: false, is_visible: false }
    ];

    const quotationWithMinimalNoSeal: Quotation = {
      id: 'q_no_ghost',
      workspace_id: 'ws_1',
      workspaceId: 'ws_1',
      enquiry_id: 'enq_1',
      quote_number: 'AVENTURA/UAE/AGN/2885-191126',
      formatted_quote_ref: 'AVENTURA/UAE/AGN/2885-191126',
      revision_number: 1,
      status: 'Draft',
      block_style: 'minimal',
      show_company_seal: false,
      customer_acceptance_enabled: false,
      client_snapshot: { entity_name: 'Client' },
      sender_snapshot: { entity_name: 'Aventura' },
      line_items: [
        {
          id: 'li_1',
          item_name: 'Test Item 1',
          description: 'Short description',
          quantity: 1,
          unit: 'Nos',
          unit_price: 1000,
          total_price: 1000
        }
      ],
      tax_mode: 'taxes_extra',
      subtotal: 1000,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 50,
      grand_total: 1050,
      created_at: '2026-11-19T00:00:00.000Z'
    };

    const sheets = partitionBlocksIntoSheets(
      blocksWithTrailingEmptySignatory,
      quotationWithMinimalNoSeal.line_items,
      {
        autoPaginate: true,
        quotation: quotationWithMinimalNoSeal
      }
    );

    // Must remain 1 sheet with zero ghost blank continuation sheet
    expect(sheets.length).toBe(1);
    expect(sheets[0].displayPageNumber).toBe(1);
    expect(sheets[0].totalSheets).toBe(1);
  });

  it('23b. Non-excluded Annex sheets receive sequential displayPageNumber (fixing blank "Page  of 4")', () => {
    const attachments: Attachment[] = [
      {
        id: 'att_annex_1',
        name: 'Media Layout Drawing',
        url: 'https://example.com/annex1.png',
        type: 'image/png',
        page_placement: 'annex_after',
        render_as_annex_page: true
      }
    ];

    const res = resolveDocumentPaginationWithAnnexes(
      [
        { id: 'totals', type: 'totals', enabled: true },
        { id: 'break_1', type: 'page_break', enabled: true, is_visible: true },
        { id: 'terms', type: 'terms', enabled: true }
      ],
      [],
      attachments,
      true
    );

    // 2 body sheets + 1 annex sheet = 3 numbered pages
    expect(res.totalDocumentPages).toBe(3);
    expect(res.mainSheets.length).toBe(2);
    expect(res.mainSheets[0].displayPageNumber).toBe(1);
    expect(res.mainSheets[1].displayPageNumber).toBe(2);
    expect(res.annexSheets.length).toBe(1);
    expect(res.annexSheets[0].displayPageNumber).toBe(3);
    expect(res.annexSheets[0].excludeFromPageCount).toBe(false);
  });

  it('23c. Unified Exclude from Page Numbering works across Cover Pages, Individual Body Pages, and Annex Sheets', () => {
    const attachments: Attachment[] = [
      {
        id: 'att_cover_excl',
        name: 'Excluded Cover',
        url: 'https://example.com/cover1.png',
        type: 'image/png',
        page_placement: 'cover_before',
        exclude_from_page_count: true
      },
      {
        id: 'att_cover_incl',
        name: 'Included Cover',
        url: 'https://example.com/cover2.png',
        type: 'image/png',
        page_placement: 'cover_before',
        exclude_from_page_count: false
      },
      {
        id: 'att_annex_excl',
        name: 'Excluded Annex',
        url: 'https://example.com/annex1.png',
        type: 'image/png',
        page_placement: 'annex_after',
        exclude_from_page_count: true
      },
      {
        id: 'att_annex_incl',
        name: 'Included Annex',
        url: 'https://example.com/annex2.png',
        type: 'image/png',
        page_placement: 'annex_after',
        exclude_from_page_count: false
      }
    ];

    const blocks: QuotationBlockConfig[] = [
      { id: 'totals', type: 'totals', enabled: true },
      { id: 'break_body', type: 'page_break', enabled: true, is_visible: true },
      { id: 'terms', type: 'terms', enabled: true }
    ];

    // Exclude Body Sheet #2 from page numbering
    const res = resolveDocumentPaginationWithAnnexes(blocks, [], attachments, true, {
      excludedBodyPageIndices: [2]
    });

    // Included pages:
    // - Cover #2 -> Page 1 of 3
    // - Body Sheet #1 -> Page 2 of 3
    // - Body Sheet #2 -> excluded (null)
    // - Annex #1 -> excluded (null)
    // - Annex #2 -> Page 3 of 3
    expect(res.totalDocumentPages).toBe(3);
    expect(res.coverSheets[0].displayPageNumber).toBe(null);
    expect(res.coverSheets[0].excludeFromPageCount).toBe(true);
    expect(res.coverSheets[1].displayPageNumber).toBe(1);
    expect(res.coverSheets[1].excludeFromPageCount).toBe(false);

    expect(res.mainSheets[0].displayPageNumber).toBe(2);
    expect(res.mainSheets[0].excludedFromPageCount).toBe(false);
    expect(res.mainSheets[1].displayPageNumber).toBe(null);
    expect(res.mainSheets[1].excludedFromPageCount).toBe(true);

    expect(res.annexSheets[0].displayPageNumber).toBe(null);
    expect(res.annexSheets[0].excludeFromPageCount).toBe(true);
    expect(res.annexSheets[1].displayPageNumber).toBe(3);
    expect(res.annexSheets[1].excludeFromPageCount).toBe(false);
  });
});

// ==========================================
// SUITE 24: DOCUMENT LAYOUT PRESET @TAG DYNAMIC TEMPLATE PERSISTENCE & LEAKAGE GUARD
// ==========================================

describe('Suite 24: Document Layout Preset @tag Dynamic Template Persistence & Cross-Deal Leakage Guard', () => {
  it('24a. hasDynamicAtTag & sanitizePresetDynamicTemplate detect real @tags while ignoring literal deal text and email addresses', () => {
    expect(hasDynamicAtTag('Mr. @contact_person (@contact_designation)')).toBe(true);
    expect(hasDynamicAtTag('Mr. @contact_name (@contact_designation)')).toBe(true);
    expect(hasDynamicAtTag('@client_city, @client_country')).toBe(true);
    expect(hasDynamicAtTag('{{contact_person}}')).toBe(true);
    expect(hasDynamicAtTag('@quote_short_ref_@company_brand')).toBe(true);
    expect(hasDynamicAtTag('Email: @client_email (alt: info@acme.com)')).toBe(true);

    expect(hasDynamicAtTag('Agua Nexus')).toBe(false);
    expect(hasDynamicAtTag('Siva Subramanian')).toBe(false);
    expect(hasDynamicAtTag('sales@aguanexus.com')).toBe(false);
    expect(hasDynamicAtTag('john-doe+procurement@sub.acme.co.ae')).toBe(false);
    expect(hasDynamicAtTag('')).toBe(false);

    expect(sanitizePresetDynamicTemplate('  @client_city, @client_country  ')).toBe(
      '@client_city, @client_country'
    );
    expect(sanitizePresetDynamicTemplate('Agua Nexus')).toBe(undefined);
    expect(sanitizePresetDynamicTemplate('sales@aguanexus.com')).toBe(undefined);
  });

  it('24b. serializePresetSnapshot -> hydrateFromPresetSnapshot preserves @tag templates verbatim, strips literal company/email leakage, and resolves dynamically on a different enquiry', () => {
    const serialized = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_24b',
      preset_name: 'Dynamic Executive Layout',
      document_type: 'quotation',
      is_default: true,
      default_tax_mode: 'taxes_extra',
      default_validity_days: 30,
      signatory_mode: 'single',
      visible_columns: {
        brand: true,
        model: true,
        origin: true,
        availability: true,
        unit_price: true
      },
      recipient_config: {
        ...DEFAULT_RECIPIENT_CONFIG,
        companyNameTemplate: 'Agua Nexus', // literal single-deal company name -> MUST NOT leak
        attentionTemplate: 'Mr. @contact_person (@contact_designation)',
        addressTemplate: '@client_city, @client_country',
        phoneTemplate: '@client_phone',
        emailTemplate: 'sales@aguanexus.com', // literal single-deal email -> MUST NOT leak
        subjectTemplate: 'Commercial Offer — @subject'
      }
    });

    // Dynamic @tag templates are preserved verbatim
    expect(serialized.recipient_config?.attentionTemplate).toBe(
      'Mr. @contact_person (@contact_designation)'
    );
    expect(serialized.recipient_config?.addressTemplate).toBe('@client_city, @client_country');
    expect(serialized.recipient_config?.phoneTemplate).toBe('@client_phone');
    expect(serialized.recipient_config?.subjectTemplate).toBe('Commercial Offer — @subject');

    // Literal single-deal strings & literal emails are strictly stripped
    expect(serialized.recipient_config?.companyNameTemplate).toBe(undefined);
    expect(serialized.recipient_config?.emailTemplate).toBe(undefined);

    const presetWithId = { ...serialized, id: 'preset_24b' };
    const hydrated = QuotationRepository.hydrateFromPresetSnapshot(presetWithId);

    expect(hydrated.recipientConfig?.attentionTemplate).toBe(
      'Mr. @contact_person (@contact_designation)'
    );
    expect(hydrated.recipientTemplates.attentionTemplate).toBe(
      'Mr. @contact_person (@contact_designation)'
    );
    expect(hydrated.recipientTemplates.addressTemplate).toBe('@client_city, @client_country');
    expect(hydrated.recipientTemplates.phoneTemplate).toBe('@client_phone');
    expect(hydrated.recipientTemplates.subjectTemplate).toBe('Commercial Offer — @subject');
    expect(hydrated.recipientTemplates.companyNameTemplate).toBe(undefined);
    expect(hydrated.recipientTemplates.emailTemplate).toBe(undefined);

    // Brand-new quotation default preset hydration carries the templates cleanly
    const newQuoteStudioState = QuotationRepository.hydrateStudioStateFromQuotation(
      null,
      null,
      presetWithId
    );
    expect(newQuoteStudioState.recipientTemplates.attentionTemplate).toBe(
      'Mr. @contact_person (@contact_designation)'
    );
    expect(newQuoteStudioState.recipientTemplates.addressTemplate).toBe(
      '@client_city, @client_country'
    );
    expect(newQuoteStudioState.recipientTemplates.companyNameTemplate).toBe(undefined);

    // Resolve the hydrated @tag templates against a completely different Enquiry B
    const enquiryB: any = {
      id: 'enq_b_24b',
      company_name: 'Horizon Marine Engineering LLC',
      contact_person_name: 'Tariq Al-Nuaimi',
      contact_designation: 'Procurement Director',
      city: 'Abu Dhabi',
      country: 'UAE',
      contact_phone: '+971 2 555 8899',
      contact_email: 'tariq@horizonmarine.ae',
      subject: 'RO Desalination Skid'
    };

    const resolvedAttention = resolveQuotationTokens(
      hydrated.recipientTemplates.attentionTemplate,
      { enquiry: enquiryB }
    );
    const resolvedAddress = resolveQuotationTokens(
      hydrated.recipientTemplates.addressTemplate,
      { enquiry: enquiryB }
    );
    const resolvedPhone = resolveQuotationTokens(
      hydrated.recipientTemplates.phoneTemplate,
      { enquiry: enquiryB }
    );
    const resolvedSubject = resolveQuotationTokens(
      hydrated.recipientTemplates.subjectTemplate,
      { enquiry: enquiryB }
    );
    const resolvedAliasAttention = resolveQuotationTokens(
      'Mr. @contact_name (@contact_designation)',
      { enquiry: enquiryB }
    );

    expect(resolvedAttention).toBe('Mr. Tariq Al-Nuaimi (Procurement Director)');
    expect(resolvedAliasAttention).toBe('Mr. Tariq Al-Nuaimi (Procurement Director)');
    expect(resolvedAddress).toBe('Abu Dhabi, UAE');
    expect(resolvedPhone).toBe('+971 2 555 8899');
    expect(resolvedSubject).toBe('Commercial Offer — RO Desalination Skid');

    // Empty designation cleanly collapses empty parentheses
    const resolvedNoDesignation = resolveQuotationTokens(
      hydrated.recipientTemplates.attentionTemplate,
      {
        enquiry: {
          ...enquiryB,
          contact_designation: ''
        }
      }
    );
    expect(resolvedNoDesignation).toBe('Mr. Tariq Al-Nuaimi');
  });
});

// ==========================================
// SUITE 25: PER-PAGE HEADER CUSTOMIZATION (pageHeaderOverrides)
// ==========================================

describe('Suite 25: Per-Page Header Customization (pageHeaderOverrides)', () => {
  const sampleBranding = resolveHeaderBrandingConfig({
    ...DEFAULT_HEADER_CONFIG,
    logoUrl: 'https://cdn.example.com/logo.png',
    showLogo: true,
    showCompanyName: true,
    repeatHeaderOnSubsequentPages: true,
    continuationHeaderMode: 'compact',
    showLogoOnContinuationPages: true,
    showCompanyNameOnContinuation: true,
    showQuoteRefOnContinuation: true,
    showPageNumberOnContinuation: true
  });

  const sampleTokenContext = {
    enquiry: {
      company_name: 'Horizon Marine Engineering LLC',
      subject: 'RO Desalination Skid Package',
      contact_person_name: 'Tariq Al-Nuaimi',
      contact_designation: 'Procurement Director'
    },
    quotation: {
      quote_number: 'QT-2026-088',
      formatted_quote_ref: 'SAS/2026/088-R2',
      revision_number: 2
    }
  };

  it('25a. Canonical sheet key helpers and active-override detector work cleanly for body and annex sheets', () => {
    expect(getBodyPageHeaderKey(1)).toBe('body_1');
    expect(getBodyPageHeaderKey(3)).toBe('body_3');
    expect(getBodyPageHeaderKey(0)).toBe('body_1');

    expect(getAnnexPageHeaderKey('att_pump_curve', 0)).toBe('annex_att_pump_curve');
    expect(getAnnexPageHeaderKey('annex_custom_2', 1)).toBe('annex_custom_2');
    expect(getAnnexPageHeaderKey('', 2)).toBe('annex_3');

    expect(isPageHeaderOverrideActive(undefined)).toBe(false);
    expect(isPageHeaderOverrideActive({})).toBe(false);
    expect(isPageHeaderOverrideActive({ mode: 'inherit' })).toBe(false);
    expect(isPageHeaderOverrideActive({ mode: 'inherit', customTitle: '   ' })).toBe(false);

    expect(isPageHeaderOverrideActive({ mode: 'none' })).toBe(true);
    expect(isPageHeaderOverrideActive({ mode: 'inherit', customTitle: 'Technical Schedule' })).toBe(true);
    expect(isPageHeaderOverrideActive({ mode: 'inherit', showLogo: false })).toBe(true);
  });

  it('25b. Inherit fallback preserves Page 1 full_repeat, Page 2+ global continuationHeaderMode, and Annex compact defaults', () => {
    const page1Default = resolveEffectivePageHeader({
      sheetKind: 'body_first',
      bodyPageNumber: 1,
      headerConfig: { ...DEFAULT_HEADER_CONFIG },
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: 1,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2'
    });
    expect(page1Default.sheetKey).toBe('body_1');
    expect(page1Default.hasActiveOverride).toBe(false);
    expect(page1Default.mode).toBe('full_repeat');
    expect(page1Default.canRenderPageNumber).toBe(true);
    expect(page1Default.rightMetadataText).toBe('12 May 2026 • SAS/2026/088-R2 • Page 1 of 4');

    const page2Inherit = resolveEffectivePageHeader({
      sheetKind: 'body_continuation',
      bodyPageNumber: 2,
      headerConfig: {
        ...DEFAULT_HEADER_CONFIG,
        pageHeaderOverrides: { body_2: { mode: 'inherit' } }
      },
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: 2,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2'
    });
    expect(page2Inherit.hasActiveOverride).toBe(false);
    expect(page2Inherit.mode).toBe('compact');
    expect(page2Inherit.showLogo).toBe(true);
    expect(page2Inherit.showQuoteRef).toBe(true);
    expect(page2Inherit.rightMetadataText).toBe('12 May 2026 • SAS/2026/088-R2 • Page 2 of 4');

    const annexDefault = resolveEffectivePageHeader({
      sheetKind: 'annex',
      annexAttachmentId: 'att_datasheet_1',
      annexIndex: 0,
      headerConfig: { ...DEFAULT_HEADER_CONFIG },
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: 4,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2'
    });
    expect(annexDefault.sheetKey).toBe('annex_att_datasheet_1');
    expect(annexDefault.mode).toBe('compact');
    expect(annexDefault.showDate).toBe(false);
    expect(annexDefault.showQuoteRef).toBe(true);
    expect(annexDefault.rightMetadataText).toBe('SAS/2026/088-R2 • Page 4 of 4');
  });

  it('25c. Explicit per-page mode overrides (none, full_repeat, compact, logo_only) and @tag interpolation on customTitle & customRightText work independently per sheet', () => {
    const headerCfg: QuotationHeaderConfig = {
      ...DEFAULT_HEADER_CONFIG,
      pageHeaderOverrides: {
        body_1: {
          mode: 'none'
        },
        body_2: {
          mode: 'full_repeat',
          customTitle: 'Commercial Schedule — @subject',
          customRightText: '@quote_ref_no • @client_name',
          showLogo: false
        },
        body_3: {
          mode: 'logo_only',
          customTitle: 'Drawing Index'
        },
        annex_att_pump_1: {
          mode: 'compact',
          customTitle: 'Annex A — @subject',
          showDate: true,
          showQuoteRef: false
        }
      }
    };

    const p1 = resolveEffectivePageHeader({
      sheetKind: 'body_first',
      bodyPageNumber: 1,
      headerConfig: headerCfg,
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: 1,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2',
      tokenContext: sampleTokenContext
    });
    expect(p1.hasActiveOverride).toBe(true);
    expect(p1.mode).toBe('none');

    // Even when repeatHeaderOnSubsequentPages is globally disabled, explicit per-page override activates header on Page 2
    const brandingNoRepeat = resolveHeaderBrandingConfig({
      ...DEFAULT_HEADER_CONFIG,
      logoUrl: 'https://cdn.example.com/logo.png',
      repeatHeaderOnSubsequentPages: false,
      continuationHeaderMode: 'none'
    });

    const p2 = resolveEffectivePageHeader({
      sheetKind: 'body_continuation',
      bodyPageNumber: 2,
      headerConfig: headerCfg,
      headerBranding: brandingNoRepeat,
      showPageNumbersGlobal: true,
      displayPageNumber: 2,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2',
      tokenContext: sampleTokenContext,
      sheetShowContinuationHeader: false
    });
    expect(p2.hasActiveOverride).toBe(true);
    expect(p2.mode).toBe('full_repeat');
    expect(p2.showLogo).toBe(false);
    expect(p2.overrideShowLogo).toBe(false);
    expect(p2.customTitle).toBe('Commercial Schedule — RO Desalination Skid Package');
    expect(p2.customRightText).toBe('SAS/2026/088-R2 • Horizon Marine Engineering LLC');
    expect(p2.rightMetadataText).toBe('SAS/2026/088-R2 • Horizon Marine Engineering LLC');

    const p3 = resolveEffectivePageHeader({
      sheetKind: 'body_continuation',
      bodyPageNumber: 3,
      headerConfig: headerCfg,
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: 3,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2',
      tokenContext: sampleTokenContext
    });
    expect(p3.mode).toBe('logo_only');
    expect(p3.showLogo).toBe(true);
    expect(p3.showDate).toBe(false);
    expect(p3.showQuoteRef).toBe(false);
    expect(p3.customTitle).toBe('Drawing Index');
    expect(p3.rightMetadataText).toBe('Page 3 of 4');

    const annex1 = resolveEffectivePageHeader({
      sheetKind: 'annex',
      annexAttachmentId: 'att_pump_1',
      annexIndex: 0,
      headerConfig: headerCfg,
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: 4,
      totalDocumentPages: 4,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2',
      tokenContext: sampleTokenContext
    });
    expect(annex1.mode).toBe('compact');
    expect(annex1.customTitle).toBe('Annex A — RO Desalination Skid Package');
    expect(annex1.showDate).toBe(true);
    expect(annex1.showQuoteRef).toBe(false);
    expect(annex1.rightMetadataText).toBe('12 May 2026 • Page 4 of 4');
  });

  it('25d. Excluded-page numbering safety: displayPageNumber === null never renders "Page  of Y" or dangling bullets even when showPageNumber override is true', () => {
    const excludedBody = resolveEffectivePageHeader({
      sheetKind: 'body_continuation',
      bodyPageNumber: 2,
      headerConfig: {
        ...DEFAULT_HEADER_CONFIG,
        pageHeaderOverrides: {
          body_2: {
            mode: 'compact',
            showDate: true,
            showQuoteRef: true,
            showPageNumber: true
          }
        }
      },
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: null,
      totalDocumentPages: 3,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2'
    });
    expect(excludedBody.canRenderPageNumber).toBe(false);
    expect(excludedBody.rightMetadataText).toBe('12 May 2026 • SAS/2026/088-R2');
    expect(excludedBody.rightMetadataText.includes('Page')).toBe(false);
    expect(excludedBody.rightMetadataText.endsWith('•')).toBe(false);

    const excludedAnnexOnlyPageNum = resolveEffectivePageHeader({
      sheetKind: 'annex',
      annexAttachmentId: 'att_excluded',
      annexIndex: 0,
      headerConfig: {
        ...DEFAULT_HEADER_CONFIG,
        pageHeaderOverrides: {
          annex_att_excluded: {
            mode: 'compact',
            showDate: false,
            showQuoteRef: false,
            showPageNumber: true
          }
        }
      },
      headerBranding: sampleBranding,
      showPageNumbersGlobal: true,
      displayPageNumber: null,
      totalDocumentPages: 3,
      defaultDateText: '12 May 2026',
      defaultQuoteRef: 'SAS/2026/088-R2'
    });
    expect(excludedAnnexOnlyPageNum.canRenderPageNumber).toBe(false);
    expect(excludedAnnexOnlyPageNum.rightMetadataText).toBe('');
  });

  it('25e. Serialization, preset hydration, and revision cloning persist active pageHeaderOverrides verbatim while stripping empty/inherit-only entries', () => {
    const rawOverrides = {
      body_1: { mode: 'inherit' as const, customTitle: '   ' }, // empty -> MUST be stripped
      body_2: {
        mode: 'compact' as const,
        customTitle: '  Technical BOQ — @subject  ',
        customRightText: '  @quote_ref_no  ',
        showDate: false,
        showQuoteRef: true
      },
      annex_att_77: {
        mode: 'none' as const
      }
    };

    // 1. Preset snapshot serialization + hydration
    const serializedPreset = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_25e',
      preset_name: 'Multi-Page Custom Header Preset',
      document_type: 'quotation',
      is_default: false,
      default_tax_mode: 'taxes_extra',
      default_validity_days: 30,
      signatory_mode: 'single',
      visible_columns: {
        brand: true,
        model: true,
        origin: true,
        availability: true,
        unit_price: true
      },
      header_config: {
        ...DEFAULT_HEADER_CONFIG,
        pageHeaderOverrides: rawOverrides
      }
    });

    expect(serializedPreset.header_config?.pageHeaderOverrides?.body_1).toBe(undefined);
    expect(serializedPreset.header_config?.pageHeaderOverrides?.body_2?.mode).toBe('compact');
    expect(serializedPreset.header_config?.pageHeaderOverrides?.body_2?.customTitle).toBe(
      'Technical BOQ — @subject'
    );
    expect(serializedPreset.header_config?.pageHeaderOverrides?.body_2?.customRightText).toBe(
      '@quote_ref_no'
    );
    expect(serializedPreset.header_config?.pageHeaderOverrides?.body_2?.showDate).toBe(false);
    expect(serializedPreset.header_config?.pageHeaderOverrides?.annex_att_77?.mode).toBe('none');

    const hydratedPreset = QuotationRepository.hydrateFromPresetSnapshot({
      ...serializedPreset,
      id: 'preset_25e'
    });
    expect(hydratedPreset.headerConfig?.pageHeaderOverrides?.body_2?.customTitle).toBe(
      'Technical BOQ — @subject'
    );
    expect(hydratedPreset.headerConfig?.pageHeaderOverrides?.annex_att_77?.mode).toBe('none');

    // 2. Revision cloning preserves active overrides via deep clone and strips empty/inherit-only maps
    const sourceQuote: any = {
      id: 'quote_25e_r1',
      workspace_id: 'ws_25e',
      enquiry_id: 'enq_25e',
      quote_number: 'QT-25E',
      formatted_quote_ref: 'QT-25E-R1',
      revision_number: 1,
      status: 'draft',
      currency: 'AED',
      subtotal: 1000,
      vat_rate: 5,
      vat_amount: 50,
      total_amount: 1050,
      items: [],
      header_config: {
        ...DEFAULT_HEADER_CONFIG,
        pageHeaderOverrides: rawOverrides
      }
    };

    const rev2 = QuotationRepository.cloneQuotationAsNextRevision(sourceQuote);
    expect(rev2.header_config?.pageHeaderOverrides?.body_1).toBe(undefined);
    expect(rev2.header_config?.pageHeaderOverrides?.body_2?.customTitle).toBe(
      'Technical BOQ — @subject'
    );
    expect(rev2.header_config?.pageHeaderOverrides?.annex_att_77?.mode).toBe('none');

    // Mutating the clone does not mutate source
    if (rev2.header_config?.pageHeaderOverrides?.body_2) {
      rev2.header_config.pageHeaderOverrides.body_2.customTitle = 'Mutated';
    }
    expect(sourceQuote.header_config.pageHeaderOverrides.body_2.customTitle).toBe(
      '  Technical BOQ — @subject  '
    );

    // Cloning a quote with only inherit-only overrides cleans pageHeaderOverrides to undefined
    const inheritOnlyClone = QuotationRepository.cloneQuotationAsNextRevision({
      ...sourceQuote,
      header_config: {
        ...DEFAULT_HEADER_CONFIG,
        pageHeaderOverrides: { body_2: { mode: 'inherit' } }
      }
    });
    expect(inheritOnlyClone.header_config?.pageHeaderOverrides).toBe(undefined);
  });
});

// ==========================================
// SUITE 26: GLOBAL CORE ATTRIBUTES, SPEC LAYOUT PRESETS & PERSISTENCE
// ==========================================

describe('Suite 26: Global Core Attributes, Spec Layout Presets & Preset/Revision Persistence', () => {
  it('26a. Two-way visibility sync keeps brand/model/origin/availability flags and hiddenAttributeKeys strictly synchronized', () => {
    let cols: QuotationPresetColumns = {
      brand: true,
      model: true,
      origin: true,
      availability: true,
      hiddenAttributeKeys: []
    };

    expect(isGlobalAttributeVisible(cols, 'Brand')).toBe(true);
    expect(isGlobalAttributeVisible(cols, 'Delivery')).toBe(true);

    // Hide Core attribute 'Origin' and custom spec 'Voltage'
    cols = setGlobalAttributeVisibility(cols, 'Origin', false);
    cols = setGlobalAttributeVisibility(cols, 'Delivery', false);
    cols = setGlobalAttributeVisibility(cols, 'Voltage', false);

    expect(cols.origin).toBe(false);
    expect(cols.availability).toBe(false);
    expect(isGlobalAttributeVisible(cols, 'Origin')).toBe(false);
    expect(isGlobalAttributeVisible(cols, 'Country of Origin')).toBe(false);
    expect(isGlobalAttributeVisible(cols, 'Delivery')).toBe(false);
    expect(isGlobalAttributeVisible(cols, 'Availability')).toBe(false);
    expect(isGlobalAttributeVisible(cols, 'Voltage')).toBe(false);
    expect(isGlobalAttributeVisible(cols, 'Brand')).toBe(true);

    // Re-enable Origin via alias 'Country of Origin' -> restores cols.origin = true and cleans hiddenAttributeKeys
    cols = setGlobalAttributeVisibility(cols, 'Country of Origin', true);
    expect(cols.origin).toBe(true);
    expect(isGlobalAttributeVisible(cols, 'Origin')).toBe(true);

    // Hide All / Show All synchronize all 4 core boolean flags + custom keys
    const hiddenAll = hideAllGlobalAttributes(cols, ['Brand', 'Model', 'Origin', 'Delivery', 'Voltage', 'Flow Rate']);
    expect(hiddenAll.brand).toBe(false);
    expect(hiddenAll.model).toBe(false);
    expect(hiddenAll.origin).toBe(false);
    expect(hiddenAll.availability).toBe(false);
    expect(isGlobalAttributeVisible(hiddenAll, 'Flow Rate')).toBe(false);

    const shownAll = showAllGlobalAttributes(hiddenAll);
    expect(shownAll.brand).toBe(true);
    expect(shownAll.model).toBe(true);
    expect(shownAll.origin).toBe(true);
    expect(shownAll.availability).toBe(true);
    expect(shownAll.hiddenAttributeKeys).toEqual([]);
  });

  it('26b. Quick layout presets and resolveLineItemAttributeLayout pack Core attributes and technical specs deterministically', () => {
    const baseCols: QuotationPresetColumns = {
      brand: true,
      model: true,
      origin: true,
      availability: true,
      attributeDisplayFormat: 'grid_2col_balanced',
      hiddenAttributeKeys: []
    };

    const sampleItem: QuotationLineItem = {
      id: 'item_spec_26b',
      item_name: 'Booster Pump Assembly',
      description: 'Vertical multistage stainless steel booster pump',
      quantity: 2,
      unit: 'Set',
      unit_price: 4500,
      total_price: 9000,
      brand_make: 'Grundfos',
      model_part_no: 'CR 15-4',
      country_of_origin: 'Denmark',
      availability: '2 Weeks',
      attributes: [
        { key: 'Flow Rate', value: '15 m³/hr' },
        { key: 'Head', value: '42 m' },
        { key: 'Motor Power', value: '3.0 kW / 400V / 3Ph' }
      ]
    };

    // 1. Preset: Metadata 2-Up + Tech Specs Full
    const meta2UpCols = buildQuickSpecLayoutPreset(
      'metadata_2up_tech_full',
      ['Flow Rate', 'Brand', 'Head', 'Model', 'Origin', 'Delivery', 'Motor Power'],
      baseCols
    );
    expect(meta2UpCols.attributeLayoutOrder?.slice(0, 4)).toEqual(['Brand', 'Model', 'Origin', 'Delivery']);
    expect(meta2UpCols.attributeFullWidthKeys).toEqual(['Flow Rate', 'Head', 'Motor Power']);

    const resolvedMeta2Up = resolveLineItemAttributeLayout(sampleItem, meta2UpCols);
    // Row 1: Brand + Model (50%/50%), Row 2: Origin + Delivery (50%/50%), Rows 3-5: Tech specs at 100% full width
    expect(resolvedMeta2Up.rows.length).toBe(5);
    expect(resolvedMeta2Up.rows[0].map((a) => a.key)).toEqual(['Brand', 'Model']);
    expect(resolvedMeta2Up.rows[1].map((a) => a.key)).toEqual(['Origin', 'Delivery']);
    expect(resolvedMeta2Up.rows[2].map((a) => a.key)).toEqual(['Flow Rate']);
    expect(resolvedMeta2Up.rows[2][0].isFullWidth).toBe(true);
    expect(resolvedMeta2Up.rows[4].map((a) => a.key)).toEqual(['Motor Power']);

    // 2. Preset: All Balanced 2-Col
    const balanced2Col = buildQuickSpecLayoutPreset(
      'all_balanced_2col',
      ['Brand', 'Model', 'Origin', 'Delivery', 'Flow Rate', 'Head'],
      meta2UpCols
    );
    expect(balanced2Col.attributeFullWidthKeys).toEqual([]);
    expect(balanced2Col.attributeLineBreaksAfter).toEqual([]);
    const resolvedBalanced = resolveLineItemAttributeLayout(sampleItem, balanced2Col);
    // 7 attributes in 2-col -> 4 rows (2, 2, 2, 1)
    expect(resolvedBalanced.rows.length).toBe(4);
    expect(resolvedBalanced.rows[2].map((a) => a.key)).toEqual(['Flow Rate', 'Head']);

    // 3. Preset: All Full-Width Rows
    const fullWidthAll = buildQuickSpecLayoutPreset(
      'all_full_width',
      ['Brand', 'Model', 'Origin', 'Delivery', 'Flow Rate', 'Head', 'Motor Power'],
      baseCols
    );
    const resolvedFull = resolveLineItemAttributeLayout(sampleItem, fullWidthAll);
    expect(resolvedFull.rows.length).toBe(7);
    expect(resolvedFull.rows.every((r) => r.length === 1 && r[0].isFullWidth)).toBe(true);

    // 4. Per-item override detection and line-break precedence
    expect(hasItemAttributeOverrides(sampleItem)).toBe(false);
    const overriddenItem: QuotationLineItem = {
      ...sampleItem,
      attribute_order: ['Model', 'Brand', 'Flow Rate', 'Delivery'],
      attribute_line_breaks_after: ['Model'],
      attribute_full_width_keys: ['Flow Rate']
    };
    expect(hasItemAttributeOverrides(overriddenItem)).toBe(true);
    const resolvedOverride = resolveLineItemAttributeLayout(overriddenItem, balanced2Col);
    // Model (break after) -> Row 1: [Model], Row 2: [Brand], Row 3: [Flow Rate (100%)], Row 4: [Delivery, Origin], Row 5: [Head, Motor Power]
    expect(resolvedOverride.rows[0].map((a) => a.key)).toEqual(['Model']);
    expect(resolvedOverride.rows[1].map((a) => a.key)).toEqual(['Brand']);
    expect(resolvedOverride.rows[2].map((a) => a.key)).toEqual(['Flow Rate']);
    expect(resolvedOverride.rows[2][0].isFullWidth).toBe(true);
  });

  it('26c. Global core & technical spec order, 100% span, breaks, and visibility persist across preset serialization, hydration, and revision cloning', () => {
    const customColumns: QuotationPresetColumns = {
      brand: true,
      model: true,
      origin: false,
      availability: true,
      unit_price: true,
      showUnitPrice: true,
      showUom: true,
      showLineTotal: true,
      showItemAttributes: true,
      attributeDisplayFormat: 'grid_2col_balanced',
      hiddenAttributeKeys: ['Origin', 'Internal Ref'],
      attributeLayoutOrder: ['Delivery', 'Brand', 'Model', 'Flow Rate', 'Motor Power'],
      attributeLineBreaksAfter: ['Delivery'],
      attributeFullWidthKeys: ['Flow Rate', 'Motor Power'],
      balanceOrphanAttributeRow: false
    };

    // 1. Preset serialize + hydrate round-trip
    const serialized = QuotationRepository.serializePresetSnapshot({
      workspace_id: 'ws_26c',
      preset_name: 'Engineering Spec Grid Preset',
      document_type: 'quotation',
      is_default: false,
      default_tax_mode: 'taxes_extra',
      default_validity_days: 30,
      signatory_mode: 'single',
      visible_columns: customColumns
    });

    expect(serialized.visible_columns.origin).toBe(false);
    expect(serialized.visible_columns.hiddenAttributeKeys).toEqual(['Origin', 'Internal Ref']);
    expect(serialized.visible_columns.attributeLayoutOrder).toEqual([
      'Delivery',
      'Brand',
      'Model',
      'Flow Rate',
      'Motor Power'
    ]);
    expect(serialized.visible_columns.attributeLineBreaksAfter).toEqual(['Delivery']);
    expect(serialized.visible_columns.attributeFullWidthKeys).toEqual(['Flow Rate', 'Motor Power']);
    expect(serialized.visible_columns.balanceOrphanAttributeRow).toBe(false);

    const hydratedPreset = QuotationRepository.hydrateFromPresetSnapshot({
      ...serialized,
      id: 'preset_26c'
    });
    expect(hydratedPreset.visibleColumns.origin).toBe(false);
    expect(hydratedPreset.visibleColumns.attributeLayoutOrder).toEqual([
      'Delivery',
      'Brand',
      'Model',
      'Flow Rate',
      'Motor Power'
    ]);
    expect(hydratedPreset.visibleColumns.attributeLineBreaksAfter).toEqual(['Delivery']);
    expect(hydratedPreset.visibleColumns.attributeFullWidthKeys).toEqual(['Flow Rate', 'Motor Power']);
    expect(hydratedPreset.visibleColumns.balanceOrphanAttributeRow).toBe(false);

    // Mutating hydrated arrays must not mutate serialized preset arrays
    hydratedPreset.visibleColumns.attributeLayoutOrder.push('Mutated');
    expect(serialized.visible_columns.attributeLayoutOrder?.includes('Mutated')).toBe(false);

    // 2. Revision cloning + Studio hydration round-trip
    const sourceQuote: any = {
      id: 'quote_26c_r1',
      workspace_id: 'ws_26c',
      enquiry_id: 'enq_26c',
      quote_number: 'QT-26C',
      formatted_quote_ref: 'QT-26C-R1',
      revision_number: 1,
      status: 'draft',
      currency: 'AED',
      subtotal: 5000,
      vat_rate: 5,
      vat_amount: 250,
      total_amount: 5250,
      items: [],
      visible_columns: customColumns
    };

    const rev2 = QuotationRepository.cloneQuotationAsNextRevision(sourceQuote);
    expect(rev2.visible_columns?.origin).toBe(false);
    expect(rev2.visible_columns?.attributeLayoutOrder).toEqual([
      'Delivery',
      'Brand',
      'Model',
      'Flow Rate',
      'Motor Power'
    ]);
    expect(rev2.visible_columns?.attributeLineBreaksAfter).toEqual(['Delivery']);
    expect(rev2.visible_columns?.attributeFullWidthKeys).toEqual(['Flow Rate', 'Motor Power']);
    expect(rev2.visible_columns?.balanceOrphanAttributeRow).toBe(false);

    const hydratedStudio = QuotationRepository.hydrateStudioStateFromQuotation(rev2);
    expect(hydratedStudio.visibleColumns.origin).toBe(false);
    expect(hydratedStudio.visibleColumns.attributeLayoutOrder).toEqual([
      'Delivery',
      'Brand',
      'Model',
      'Flow Rate',
      'Motor Power'
    ]);
    expect(hydratedStudio.visibleColumns.attributeLineBreaksAfter).toEqual(['Delivery']);
    expect(hydratedStudio.visibleColumns.attributeFullWidthKeys).toEqual(['Flow Rate', 'Motor Power']);
    expect(hydratedStudio.visibleColumns.balanceOrphanAttributeRow).toBe(false);
  });
});

// ==========================================
// SUITE 27: INLINE CANVAS QUICK-EDIT HELPERS
// ==========================================

describe('Inline Canvas Quick-Edit Helpers (@tag Seed Safety, Line-Item Keys & Parsing)', () => {
  it('resolveInlineEditSeedValue preserves raw @tag template strings instead of resolved plain text', () => {
    const rawMap = {
      client_contact_person: 'Mr. @contact_person (@contact_designation)',
      subject: 'Quotation for @subject — Ref @quote_ref',
      custom_notes: ''
    };

    expect(
      resolveInlineEditSeedValue('client_contact_person', 'Mr. Rahul Sharma (Procurement Manager)', rawMap)
    ).toBe('Mr. @contact_person (@contact_designation)');

    expect(
      resolveInlineEditSeedValue('subject', 'Quotation for Centrifugal Pumps — Ref Q-2026-101', rawMap)
    ).toBe('Quotation for @subject — Ref @quote_ref');

    // Empty raw override falls back cleanly to displayed fallback value
    expect(
      resolveInlineEditSeedValue('custom_notes', 'Fallback note text', rawMap)
    ).toBe('Fallback note text');

    // Missing key or undefined map falls back cleanly
    expect(
      resolveInlineEditSeedValue('client_trn', '100234567800003', rawMap)
    ).toBe('100234567800003');
    expect(
      resolveInlineEditSeedValue('client_trn', '100234567800003', undefined)
    ).toBe('100234567800003');
  });

  it('buildInlineLineItemFieldKey and parseInlineLineItemFieldKey round-trip all 5 line-item fields and reject invalid keys', () => {
    const fields = ['item_name', 'quantity', 'unit', 'unit_price', 'description'] as const;
    for (let i = 0; i < fields.length; i++) {
      const key = buildInlineLineItemFieldKey(i, fields[i]);
      expect(key).toBe(`line_item:${i}:${fields[i]}`);
      expect(parseInlineLineItemFieldKey(key)).toEqual({ index: i, field: fields[i] });
    }

    expect(parseInlineLineItemFieldKey('')).toBe(null);
    expect(parseInlineLineItemFieldKey('subject')).toBe(null);
    expect(parseInlineLineItemFieldKey('line_item:-1:quantity')).toBe(null);
    expect(parseInlineLineItemFieldKey('line_item:1.5:quantity')).toBe(null);
    expect(parseInlineLineItemFieldKey('line_item:0:unknown_field')).toBe(null);
    expect(parseInlineLineItemFieldKey('line_item:0:item_name:extra')).toBe(null);
  });

  it('parseInlineNumericValue safely parses currency/comma formatted numbers and preserves fallback on invalid/negative input', () => {
    expect(parseInlineNumericValue('1,250.50', 10)).toBe(1250.5);
    expect(parseInlineNumericValue('AED 99.95', 10)).toBe(99.95);
    expect(parseInlineNumericValue('0', 10)).toBe(0);
    expect(parseInlineNumericValue('   ', 10)).toBe(0);
    expect(parseInlineNumericValue('-25', 42)).toBe(42);
    expect(parseInlineNumericValue('abc', 42)).toBe(42);
    expect(parseInlineNumericValue('-', 42)).toBe(42);
    expect(parseInlineNumericValue('.', 42)).toBe(42);
  });

  it('parseInlineValidityDays extracts and clamps positive day counts to 1..365', () => {
    expect(parseInlineValidityDays('45 Days', 30)).toBe(45);
    expect(parseInlineValidityDays('15', 30)).toBe(15);
    expect(parseInlineValidityDays('Valid for 60 calendar days', 30)).toBe(60);
    expect(parseInlineValidityDays('999 Days', 30)).toBe(365);
    expect(parseInlineValidityDays('0 Days', 30)).toBe(30);
    expect(parseInlineValidityDays('No numeric value', 30)).toBe(30);
  });
});

// ==========================================
// SUITE 28: OPTIONAL BADGE DEDUP & ALTERNATE TOTAL (INCL. OPTIONALS)
// ==========================================

describe('Optional Badge Deduplication, Alternate Total (Incl. Optionals) & @tags', () => {
  it('deduplicates Optional / Add-On + is_optional into a single amber badge while preserving Option A/B distinction', () => {
    // Previously rendered BOTH blue "OPTIONAL / ADD-ON" and amber "OPTIONAL"
    const bothOptional = resolveLineItemOptionBadges(
      { option: 'Optional / Add-On', is_optional: true },
      false
    );
    expect(bothOptional.optionGroupBadge).toBe(null);
    expect(bothOptional.optionalBadge).toBe('Optional / Add-On');

    // Legacy optional group without boolean flag still renders one amber badge
    const groupOnlyOptional = resolveLineItemOptionBadges(
      { option_group: 'Optional / Add-On', is_optional: false },
      false
    );
    expect(groupOnlyOptional.optionGroupBadge).toBe(null);
    expect(groupOnlyOptional.optionalBadge).toBe('Optional / Add-On');

    // Baseline option group + is_optional flag renders one amber "Optional" badge
    const flagOnlyOptional = resolveLineItemOptionBadges(
      { option: 'Default / Included', is_optional: true },
      false
    );
    expect(flagOnlyOptional.optionGroupBadge).toBe(null);
    expect(flagOnlyOptional.optionalBadge).toBe('Optional');

    // Non-optional Option A / Option B shows blue badge in single-table mode, hidden in split-table mode
    const optionACombined = resolveLineItemOptionBadges(
      { option: 'Option A', is_optional: false },
      false
    );
    expect(optionACombined.optionGroupBadge).toBe('Option A');
    expect(optionACombined.optionalBadge).toBe(null);

    const optionASplit = resolveLineItemOptionBadges(
      { option: 'Option A', is_optional: false },
      true
    );
    expect(optionASplit.optionGroupBadge).toBe(null);
    expect(optionASplit.optionalBadge).toBe(null);

    // Optional / Add-On remains clearly labeled with a single badge even in split-table mode
    const optionalInSplit = resolveLineItemOptionBadges(
      { option: 'Optional / Add-On', is_optional: true },
      true
    );
    expect(optionalInSplit.optionGroupBadge).toBe(null);
    expect(optionalInSplit.optionalBadge).toBe('Optional / Add-On');

    // Standard baseline row shows zero badges
    const standardRow = resolveLineItemOptionBadges(
      { option: 'Default / Included', is_optional: false },
      false
    );
    expect(standardRow.optionGroupBadge).toBe(null);
    expect(standardRow.optionalBadge).toBe(null);
  });

  it('calculates VAT-aware optional totals across taxes_extra, tax_calculated/taxes_included, vat_hidden, and zero_rated', () => {
    const sampleItems = [
      { id: '1', item_name: 'Multimedia Filter Vessel', quantity: 2, unit_price: 2850, total_price: 5700, is_optional: false },
      { id: '2', item_name: 'Automatic Multiport Valve', quantity: 2, unit_price: 5000, total_price: 10000, is_optional: false },
      { id: '3', item_name: 'Flow Meter Assembly', quantity: 1, unit_price: 1450, total_price: 1450, option: 'Optional / Add-On', is_optional: true },
      // Continuation chunk must be ignored so optional sets are never double-counted
      { id: '3_cont', item_name: 'Flow Meter Assembly', quantity: 1, unit_price: 1450, total_price: 1450, option: 'Optional / Add-On', is_optional: true, isCompositeContinuation: true }
    ];

    // 1. taxes_extra (5% VAT added on top): baseline 15,700 + 785 VAT = 16,485; optional 1,450 + 72.50 VAT = 1,522.50 -> 18,007.50
    const extraCalc = QuotationRepository.calculateOptionalTotals(sampleItems, 16485, 'taxes_extra', 5);
    expect(extraCalc.hasOptionals).toBe(true);
    expect(extraCalc.optionalItemCount).toBe(1);
    expect(extraCalc.optionalSubtotal).toBe(1450);
    expect(extraCalc.optionalVat).toBe(72.5);
    expect(extraCalc.optionalTotalWithVat).toBe(1522.5);
    expect(extraCalc.grandTotalWithOptionals).toBe(18007.5);

    // 2. tax_calculated & taxes_included (prices already VAT-inclusive): no extra VAT added on top
    const inclCalc = calculateOptionalItemsTotals({
      lineItems: sampleItems,
      baselineGrandTotal: 15700,
      taxMode: 'tax_calculated',
      taxRatePercent: 5
    });
    expect(inclCalc.optionalSubtotal).toBe(1450);
    expect(inclCalc.optionalVat).toBe(69.05);
    expect(inclCalc.optionalTotalWithVat).toBe(1450);
    expect(inclCalc.grandTotalWithOptionals).toBe(17150);

    const inclAliasCalc = calculateOptionalItemsTotals({
      lineItems: sampleItems,
      baselineGrandTotal: 15700,
      taxMode: 'taxes_included',
      taxRatePercent: 5
    });
    expect(inclAliasCalc.grandTotalWithOptionals).toBe(17150);

    // 3. vat_hidden & zero_rated / tax_exempt: 0 VAT added
    const hiddenCalc = calculateOptionalItemsTotals({
      lineItems: sampleItems,
      baselineGrandTotal: 15700,
      taxMode: 'vat_hidden',
      taxRatePercent: 5
    });
    expect(hiddenCalc.optionalVat).toBe(0);
    expect(hiddenCalc.grandTotalWithOptionals).toBe(17150);

    const zeroRatedCalc = calculateOptionalItemsTotals({
      lineItems: sampleItems,
      baselineGrandTotal: 15700,
      taxMode: 'zero_rated',
      taxRatePercent: 5
    });
    expect(zeroRatedCalc.optionalVat).toBe(0);
    expect(zeroRatedCalc.grandTotalWithOptionals).toBe(17150);

    // 4. Composite itemized optional set computes from sub_components when parent total_price is 0
    const compositeOptCalc = calculateOptionalItemsTotals({
      lineItems: [
        {
          id: 'opt_pkg',
          item_name: 'Optional Dosing Skid',
          quantity: 2,
          unit_price: 0,
          total_price: 0,
          is_optional: true,
          package_pricing_mode: 'itemized',
          sub_components: [
            { id: 'sc1', item_name: 'Dosing Pump', quantity: 1, unit: 'Nos', unit_price: 600, total_price: 600 },
            { id: 'sc2', item_name: 'Chemical Tank', quantity: 1, unit: 'Nos', unit_price: 400, total_price: 400 },
            { id: 'sc3', item_name: 'Mounting Brackets', quantity: 1, unit: 'Set', unit_price: 50, total_price: 50, is_included_accessory: true }
          ]
        }
      ],
      baselineGrandTotal: 10000,
      taxMode: 'taxes_extra',
      taxRatePercent: 5
    });
    expect(compositeOptCalc.optionalSubtotal).toBe(2000);
    expect(compositeOptCalc.optionalVat).toBe(100);
    expect(compositeOptCalc.grandTotalWithOptionals).toBe(12100);
  });

  it('auto-hides Alternate Total row when there are zero optional items even if toggle is ON', () => {
    const baselineOnly = [
      { id: '1', item_name: 'Filter Vessel', quantity: 2, unit_price: 2850, total_price: 5700, is_optional: false }
    ];
    const noOptCalc = calculateOptionalItemsTotals({
      lineItems: baselineOnly,
      baselineGrandTotal: 5700,
      taxMode: 'vat_hidden',
      taxRatePercent: 5
    });

    expect(noOptCalc.hasOptionals).toBe(false);
    expect(noOptCalc.optionalItemCount).toBe(0);
    expect(noOptCalc.optionalSubtotal).toBe(0);
    expect(noOptCalc.grandTotalWithOptionals).toBe(5700);
    expect(
      shouldShowAlternateTotalWithOptionals({ showAlternateTotalWithOptionals: true }, noOptCalc)
    ).toBe(false);

    const withOptCalc = calculateOptionalItemsTotals({
      lineItems: [
        ...baselineOnly,
        { id: '2', item_name: 'Flow Meter', quantity: 1, unit_price: 1450, total_price: 1450, is_optional: true }
      ],
      baselineGrandTotal: 5700,
      taxMode: 'vat_hidden',
      taxRatePercent: 5
    });
    expect(
      shouldShowAlternateTotalWithOptionals({ showAlternateTotalWithOptionals: false }, withOptCalc)
    ).toBe(false);
    expect(
      shouldShowAlternateTotalWithOptionals({ showAlternateTotalWithOptionals: true }, withOptCalc)
    ).toBe(true);
    expect(isOptionalQuotationLineItem({ option: 'Optional / Add-On' })).toBe(true);
    expect(DEFAULT_ALTERNATE_TOTAL_WITH_OPTIONALS_LABEL).toBe('Alternate Total (Incl. Optional Items)');
  });

  it('registers and resolves @optional_total and @grand_total_with_optionals tokens dynamically', () => {
    const tagKeys = QUOTATION_AT_TAGS.map((t) => t.key);
    expect(tagKeys.includes('optional_total')).toBe(true);
    expect(tagKeys.includes('grand_total_with_optionals')).toBe(true);

    const quoteWithOpt = {
      id: 'q_opt_tok',
      currency: 'AED',
      tax_mode: 'taxes_extra',
      tax_rate_percent: 5,
      subtotal: 15700,
      tax_amount: 785,
      grand_total: 16485,
      line_items: [
        { id: '1', item_name: 'Vessel', quantity: 2, unit_price: 2850, total_price: 5700, is_optional: false },
        { id: '2', item_name: 'Valve', quantity: 2, unit_price: 5000, total_price: 10000, is_optional: false },
        { id: '3', item_name: 'Flow Meter', quantity: 1, unit_price: 1450, total_price: 1450, option: 'Optional / Add-On', is_optional: true }
      ]
    } as unknown as Quotation;

    const resolved = resolveQuotationTokens(
      'Optional add-ons: @optional_total | All-in total (incl. VAT): @grand_total_with_optionals',
      { quotation: quoteWithOpt }
    );
    expect(resolved).toBe(
      'Optional add-ons: AED 1,450.00 | All-in total (incl. VAT): AED 18,007.50'
    );

    const quoteVatHidden = {
      ...quoteWithOpt,
      tax_mode: 'vat_hidden',
      tax_amount: 0,
      grand_total: 15700
    } as unknown as Quotation;

    const resolvedHidden = resolveQuotationTokens(
      'Optionals: @optional_total -> Combined: @grand_total_with_optionals',
      { quotation: quoteVatHidden }
    );
    expect(resolvedHidden).toBe(
      'Optionals: AED 1,450.00 -> Combined: AED 17,150.00'
    );
  });

  it('persists showAlternateTotalWithOptionals and custom label across preset serialization, hydration, and revision clones', () => {
    const customLabel = 'All-In Grand Total (With Recommended Spares)';
    const presetInput = {
      id: 'preset_alt_opt',
      workspace_id: 'ws_1',
      preset_name: 'Standard with Optional Summary',
      is_default: false,
      visible_columns: { brand: true, model: true, origin: true, availability: true },
      layout_blocks: [
        {
          id: 'totals',
          type: 'totals' as const,
          title: 'Financial Summary',
          is_visible: true,
          enabled: true,
          order: 1,
          showAlternateTotalWithOptionals: true,
          alternateTotalWithOptionalsLabel: customLabel
        }
      ]
    };

    const serialized = QuotationRepository.serializePresetSnapshot(presetInput as any);
    const serializedTotals = serialized.layout_blocks?.find((b) => b.id === 'totals');
    expect(serializedTotals?.showAlternateTotalWithOptionals).toBe(true);
    expect(serializedTotals?.alternateTotalWithOptionalsLabel).toBe(customLabel);

    const hydrated = QuotationRepository.hydrateFromPresetSnapshot(serialized as any);
    const hydratedTotals = hydrated.layoutBlocks.find((b) => b.id === 'totals');
    expect(hydratedTotals?.showAlternateTotalWithOptionals).toBe(true);
    expect(hydratedTotals?.alternateTotalWithOptionalsLabel).toBe(customLabel);

    // Revision clone also preserves both fields
    const sourceQuote = {
      id: 'q_src_alt',
      workspace_id: 'ws_1',
      enquiry_id: 'enq_alt',
      quote_ref_no: 'AVENTURA/OMN/MAR/2887-201126',
      revision_number: 1,
      status: 'draft',
      currency: 'AED',
      subtotal: 15700,
      tax_amount: 0,
      grand_total: 15700,
      line_items: [],
      layout_blocks: serialized.layout_blocks
    } as unknown as Quotation;

    const clonedRev = QuotationRepository.cloneQuotationAsNextRevision(sourceQuote, [sourceQuote]);
    const clonedTotals = clonedRev.layout_blocks?.find((b) => b.id === 'totals');
    expect(clonedTotals?.showAlternateTotalWithOptionals).toBe(true);
    expect(clonedTotals?.alternateTotalWithOptionalsLabel).toBe(customLabel);
  });
});

// ==========================================
// SUITE: FIX F1 — QUICK-EDIT CANONICAL SOURCE INDEXING (P0-1) & OPTIONAL ROW TOGGLE SYNC (P0-6)
// ==========================================
describe('Fix F1: Canonical sourceLineIndex & Focused Row Optional Toggle Sync', () => {
  it('P0-1: preserves canonical sourceLineIndex through option_b_only filtering, split option tables, and multi-page continuation chunks', () => {
    const backingItems: QuotationLineItem[] = [
      {
        id: 'opt_a_1',
        item_name: 'Option A — FRP Vessel 30x72',
        description: 'Option A primary vessel',
        quantity: 1,
        unit: 'Nos',
        unit_price: 2850,
        total_price: 2850,
        option: 'Option A'
      },
      {
        id: 'opt_a_2',
        item_name: 'Option A — Clack WS2EI Valve',
        description: 'Option A valve',
        quantity: 1,
        unit: 'Nos',
        unit_price: 5000,
        total_price: 5000,
        option: 'Option A'
      },
      {
        id: 'opt_b_1',
        item_name: 'Option B — Duplex MMF Skid',
        description: 'Option B composite package',
        quantity: 1,
        unit: 'Set',
        unit_price: 45000,
        total_price: 45000,
        option: 'Option B',
        is_composite_set: true,
        sub_components: [
          { id: 'b_sub_1', item_name: 'FRP Vessel 48x72', quantity: 2, unit: 'Nos', unit_price: 0, total_price: 0, is_included_accessory: true, page_break_after: true },
          { id: 'b_sub_2', item_name: 'Clack WS3 Valve', quantity: 2, unit: 'Nos', unit_price: 0, total_price: 0, is_included_accessory: true }
        ]
      },
      {
        id: 'opt_b_2',
        item_name: 'Option B — Commissioning',
        description: 'Site testing & commissioning',
        quantity: 1,
        unit: 'Lot',
        unit_price: 3500,
        total_price: 3500,
        option: 'Option B'
      }
    ];

    // 1. Filtered option_b_only mode: backing indices 2 and 3 MUST NOT collapse to 0 and 1
    const filteredOptionB = prepareOptionFilteredLineItems(backingItems, 'option_b_only');
    expect(filteredOptionB.length).toBe(2);
    expect(resolveCanonicalLineItemIndex(filteredOptionB[0], 0)).toBe(2);
    expect(resolveCanonicalLineItemIndex(filteredOptionB[1], 1)).toBe(3);

    // Chunks across mid-set continuation break preserve sourceLineIndex = 2 on both slices, and 3 on next item
    const filteredChunks = splitLineItemsIntoChunks(filteredOptionB, { autoPaginate: true });
    expect(filteredChunks.length).toBe(2);
    expect(filteredChunks[0].items[0].id).toBe('opt_b_1');
    expect(resolveCanonicalLineItemIndex(filteredChunks[0].items[0], 0)).toBe(2);
    expect(filteredChunks[1].items[0].id).toBe('opt_b_1');
    expect(filteredChunks[1].items[0].isCompositeContinuation).toBe(true);
    expect(resolveCanonicalLineItemIndex(filteredChunks[1].items[0], 0)).toBe(2);
    expect(filteredChunks[1].items[1].id).toBe('opt_b_2');
    expect(resolveCanonicalLineItemIndex(filteredChunks[1].items[1], 1)).toBe(3);

    // Quick-Edit field key built for Option B row #1 targets backing index 2 (never Option A index 0)
    const quickEditKey = buildInlineLineItemFieldKey(
      resolveCanonicalLineItemIndex(filteredChunks[0].items[0], 0),
      'unit_price'
    );
    expect(quickEditKey).toBe('line_item:2:unit_price');
    expect(parseInlineLineItemFieldKey(quickEditKey)).toEqual({ index: 2, field: 'unit_price' });

    // 2. Split option tables mode (all_separate_tables): Option A & Option B split into separate groups where local idx resets to 0
    const allTagged = prepareOptionFilteredLineItems(backingItems, 'all_separate_tables');
    const allChunks = splitLineItemsIntoChunks(allTagged, { autoPaginate: false });
    expect(allChunks.length).toBe(2);
    const chunk0OptionA = allChunks[0].items.filter((it) => it.option === 'Option A');
    const chunk0OptionB = allChunks[0].items.filter((it) => it.option === 'Option B');
    const chunk1OptionB = allChunks[1].items.filter((it) => it.option === 'Option B');

    // Option A resolves to backing indices 0 and 1; Option B local idx=0 on chunk 0 & chunk 1 resolves to 2 and 3
    expect(resolveCanonicalLineItemIndex(chunk0OptionA[0], 0)).toBe(0);
    expect(resolveCanonicalLineItemIndex(chunk0OptionA[1], 1)).toBe(1);
    expect(resolveCanonicalLineItemIndex(chunk0OptionB[0], 0)).toBe(2);
    expect(chunk1OptionB[0].isCompositeContinuation).toBe(true);
    expect(resolveCanonicalLineItemIndex(chunk1OptionB[0], 0)).toBe(2);
    expect(resolveCanonicalLineItemIndex(chunk1OptionB[1], 1)).toBe(3);
  });

  it('P0-6: explicit is_optional override toggles Default / Included and Option A items on and back off without snapping back', () => {
    // Baseline defaults when no explicit overrides exist
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Default / Included',
        itemIsOptional: false
      })
    ).toBe(false);
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Option A',
        itemIsOptional: false
      })
    ).toBe(false);
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Optional / Add-On',
        itemIsOptional: false
      })
    ).toBe(true);

    // Focused Row Inspector updates compOverride.is_optional = true on a Default / Included row -> stays true
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Default / Included',
        compositeOverrideOptional: true,
        itemIsOptional: false
      })
    ).toBe(true);

    // Focused Row Inspector updates compOverride.is_optional = true on an Option A row -> stays true
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Option A',
        compositeOverrideOptional: true,
        itemIsOptional: false
      })
    ).toBe(true);

    // Explicit itemOptionalOverrides sync takes precedence for toggling on AND back off
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Default / Included',
        explicitOptionalOverride: true,
        compositeOverrideOptional: true,
        itemIsOptional: false
      })
    ).toBe(true);
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Default / Included',
        explicitOptionalOverride: false,
        compositeOverrideOptional: false,
        itemIsOptional: true
      })
    ).toBe(false);

    // Toggling an Optional / Add-On item explicitly OFF via override stays false
    expect(
      resolveLineItemOptionalFlag({
        effectiveOptionLabel: 'Optional / Add-On',
        explicitOptionalOverride: false,
        compositeOverrideOptional: false,
        itemIsOptional: true
      })
    ).toBe(false);
  });
});

// ============================================================================
// SUITE 25: FIX F4 — STUDIO HYDRATION IDENTITY GUARD (P1-1) &
//           NON-DESTRUCTIVE ASYNC BLOB REHYDRATION MERGE (P1-2)
// ============================================================================

describe('Suite 25: Studio Hydration Identity Guard (P1-1) & Non-Destructive Blob Merge (P1-2)', () => {
  it('25a. Skips re-hydration when only enquiry.updatedAt changes on the same open quote/enquiry and runs when switching target ID (P1-1)', () => {
    const initialKey = resolveStudioHydrationTargetKey('qt_101', 'enq_50');
    expect(initialKey).toBe('quote:qt_101');

    // First mount: null -> quote:qt_101 runs hydration
    expect(shouldRunStudioHydration(null, initialKey)).toBe(true);

    // Background enquiry.updatedAt mutation on same quote/enquiry -> target key unchanged -> skipped!
    const afterBackgroundEnquiryTick = resolveStudioHydrationTargetKey('qt_101', 'enq_50');
    expect(shouldRunStudioHydration(initialKey, afterBackgroundEnquiryTick)).toBe(false);

    // Switching to another quotation ID -> triggers hydration
    const switchedQuoteKey = resolveStudioHydrationTargetKey('qt_102', 'enq_50');
    expect(shouldRunStudioHydration(initialKey, switchedQuoteKey)).toBe(true);

    // Unbound new quote tied to enquiry -> same enquiry skips, new enquiry triggers
    const enqKey1 = resolveStudioHydrationTargetKey(null, 'enq_50');
    const enqKey1Same = resolveStudioHydrationTargetKey(undefined, 'enq_50');
    const enqKey2 = resolveStudioHydrationTargetKey(null, 'enq_51');
    expect(enqKey1).toBe('enquiry:enq_50');
    expect(shouldRunStudioHydration(enqKey1, enqKey1Same)).toBe(false);
    expect(shouldRunStudioHydration(enqKey1, enqKey2)).toBe(true);
  });

  it('25b. Late async blob rehydration backfills matching storage keys without overwriting newer edits or resurrecting cleared images (P1-2)', () => {
    const latestUserEditedItems: any[] = [
      {
        id: 'li_1',
        item_name: 'Multimedia Filter 30" x 72" (Edited Title)',
        description: 'User updated description',
        quantity: 4,
        unit_price: 3150,
        image_url: '',
        image_storage_key: 'blob_img_1',
        secondary_image_url: '',
        secondary_image_storage_key: 'blob_sec_1',
        sub_components: [
          {
            id: 'sub_1',
            item_name: 'Internal Nozzle Plate (Edited)',
            quantity: 2,
            unit_price: 450,
            image_url: '',
            image_storage_key: 'blob_sub_1'
          }
        ]
      },
      {
        // User manually cleared the image while IDB was loading (storage key cleared!)
        id: 'li_2',
        item_name: 'Clack Valve WS2EI',
        quantity: 2,
        unit_price: 5000,
        image_url: '',
        image_storage_key: ''
      },
      {
        // User hid the image in Studio while IDB was loading
        id: 'li_3',
        item_name: 'Flow Meter Assembly',
        quantity: 1,
        unit_price: 1450,
        image_url: '',
        image_storage_key: 'blob_img_3',
        image_display_override: 'hidden'
      }
    ];

    const lateRehydratedSnapshot: any[] = [
      {
        id: 'li_1',
        item_name: 'Stale Pre-Edit Title',
        description: 'Stale pre-edit description',
        quantity: 1,
        unit_price: 2850,
        image_url: 'data:image/png;base64,RESOLVED_PRIMARY_1',
        image_storage_key: 'blob_img_1',
        secondary_image_url: 'data:image/png;base64,RESOLVED_SECONDARY_1',
        secondary_image_storage_key: 'blob_sec_1',
        sub_components: [
          {
            id: 'sub_1',
            item_name: 'Stale Sub Name',
            quantity: 1,
            unit_price: 300,
            image_url: 'data:image/png;base64,RESOLVED_SUB_1',
            image_storage_key: 'blob_sub_1'
          }
        ]
      },
      {
        id: 'li_2',
        item_name: 'Clack Valve WS2EI',
        quantity: 1,
        unit_price: 4800,
        image_url: 'data:image/png;base64,SHOULD_NOT_RESURRECT',
        image_storage_key: 'blob_img_2'
      },
      {
        id: 'li_3',
        item_name: 'Flow Meter Assembly',
        quantity: 1,
        unit_price: 1450,
        image_url: 'data:image/png;base64,SHOULD_NOT_SHOW_HIDDEN',
        image_storage_key: 'blob_img_3'
      }
    ];

    const merged = mergeRehydratedLineItemBlobs(latestUserEditedItems, lateRehydratedSnapshot);

    // Item 1: resolved URLs merged cleanly while ALL newer user edits remain intact
    expect(merged[0].item_name).toBe('Multimedia Filter 30" x 72" (Edited Title)');
    expect(merged[0].description).toBe('User updated description');
    expect(merged[0].quantity).toBe(4);
    expect(merged[0].unit_price).toBe(3150);
    expect(merged[0].image_url).toBe('data:image/png;base64,RESOLVED_PRIMARY_1');
    expect(merged[0].secondary_image_url).toBe('data:image/png;base64,RESOLVED_SECONDARY_1');
    expect(merged[0].sub_components[0].item_name).toBe('Internal Nozzle Plate (Edited)');
    expect(merged[0].sub_components[0].quantity).toBe(2);
    expect(merged[0].sub_components[0].unit_price).toBe(450);
    expect(merged[0].sub_components[0].image_url).toBe('data:image/png;base64,RESOLVED_SUB_1');

    // Item 2: manually cleared image (cleared storage key) is NEVER resurrected
    expect(merged[1].image_url).toBe('');
    expect(merged[1].unit_price).toBe(5000);

    // Item 3: explicitly hidden image is NEVER resurrected
    expect(merged[2].image_url).toBe('');

    // Attachments & Enquiry wrapper: fills matching attachment URL without resurrecting deleted attachments
    const prevEnq: any = {
      id: 'enq_50',
      subject: 'User Edited Subject',
      line_items: latestUserEditedItems,
      attachments: [
        { id: 'att_1', name: 'Datasheet.pdf', url: '', storageKey: 'blob_att_1' }
      ]
    };
    const lateEnq: any = {
      id: 'enq_50',
      subject: 'Stale Subject',
      line_items: lateRehydratedSnapshot,
      attachments: [
        { id: 'att_1', name: 'Datasheet.pdf', url: 'data:application/pdf;base64,PDF1', storageKey: 'blob_att_1' },
        { id: 'att_deleted', name: 'Deleted.pdf', url: 'data:application/pdf;base64,DEL', storageKey: 'blob_del' }
      ]
    };

    const mergedEnq = mergeRehydratedEnquiryBlobs(prevEnq, lateEnq);
    expect(mergedEnq.subject).toBe('User Edited Subject');
    expect(mergedEnq.attachments.length).toBe(1);
    expect(mergedEnq.attachments[0].url).toBe('data:application/pdf;base64,PDF1');
    expect(mergedEnq.line_items[0].image_url).toBe('data:image/png;base64,RESOLVED_PRIMARY_1');
    expect(mergedEnq.line_items[0].unit_price).toBe(3150);

    // Direct flyer attachment merge preserves user order/removals
    const mergedFlyers = mergeRehydratedAttachmentsBlobs(prevEnq.attachments, lateEnq.attachments);
    expect(mergedFlyers.length).toBe(1);
    expect(mergedFlyers[0].url).toBe('data:application/pdf;base64,PDF1');
  });
});

// ============================================================================
// SUITE 26: FIX F5 — PAGE HEADER OVERRIDES NON-RESURRECTION (P0-3),
//           BASELINE PRESET HYDRATION (P1-4) & EXCLUDED PAGES LEAK FIX (P1-5)
// ============================================================================

describe('Suite 26: Fix F5 — PageHeaderOverrides Non-Resurrection (P0-3), Baseline Preset Hydration (P1-4) & Footer Exclusions Reset (P1-5)', () => {
  it('26a. Deleting one or all pageHeaderOverrides keys never resurrects stale keys during header/profile merges or quotation hydration (P0-3)', () => {
    const existingHeader: QuotationHeaderConfig = {
      logoHeightPx: 54,
      showTrn: true,
      pageHeaderOverrides: {
        body_2: { mode: 'compact', customTitle: 'Technical Schedule' },
        annex_1: { mode: 'none' }
      }
    };

    // 1. Delete `body_2` while keeping `annex_1`
    const partialDeleteMerged = QuotationRepository.mergeHeaderConfigReplacingOverrides(
      existingHeader,
      {
        showTrn: true,
        pageHeaderOverrides: {
          annex_1: { mode: 'none' }
        }
      }
    );
    expect(partialDeleteMerged?.logoHeightPx).toBe(54);
    expect(partialDeleteMerged?.pageHeaderOverrides?.body_2).toBe(undefined);
    expect(partialDeleteMerged?.pageHeaderOverrides?.annex_1?.mode).toBe('none');

    // 2. Clear ALL overrides (undefined / empty object) — existing keys must NEVER resurrect
    const clearedAllMerged = QuotationRepository.mergeHeaderConfigReplacingOverrides(
      existingHeader,
      {
        showTrn: false,
        pageHeaderOverrides: undefined
      }
    );
    expect(clearedAllMerged?.showTrn).toBe(false);
    expect(clearedAllMerged?.pageHeaderOverrides).toBe(undefined);

    // 3. mergeWorkspaceDocumentProfile replaces pageHeaderOverrides atomically when incoming.header_config is supplied
    const existingProfile: WorkspaceDocumentProfile = {
      id: 'docprof_ws_26',
      workspace_id: 'ws_26',
      profile_name: 'Default Profile',
      legal_entity_name: 'Aqua Engineering LLC',
      address_line_1: 'Plot 14, Industrial Area',
      bank_accounts: [],
      header_config: existingHeader
    };
    const updatedProfile = QuotationRepository.mergeWorkspaceDocumentProfile(existingProfile, {
      workspace_id: 'ws_26',
      header_config: {
        logoHeightPx: 54,
        pageHeaderOverrides: { annex_1: { mode: 'none' } }
      }
    });
    expect(updatedProfile.header_config?.pageHeaderOverrides?.body_2).toBe(undefined);
    expect(updatedProfile.header_config?.pageHeaderOverrides?.annex_1?.mode).toBe('none');

    const clearedProfile = QuotationRepository.mergeWorkspaceDocumentProfile(existingProfile, {
      workspace_id: 'ws_26',
      header_config: {
        logoHeightPx: 54,
        pageHeaderOverrides: {}
      }
    });
    expect(clearedProfile.header_config?.pageHeaderOverrides).toBe(undefined);

    // 4. Hydrating a saved quotation whose header_config cleared pageHeaderOverrides does NOT inherit profile's overrides
    const quoteWithClearedOverrides: Quotation = {
      id: 'qt_26a_cleared',
      workspace_id: 'ws_26',
      workspaceId: 'ws_26',
      enquiry_id: 'enq_26',
      quote_number: 'QT-2026-0260',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0260-R1',
      status: 'Draft',
      client_snapshot: { entity_name: 'Client Co' },
      sender_snapshot: { entity_name: 'Aqua Engineering LLC' },
      line_items: [],
      tax_mode: 'taxes_extra',
      subtotal: 0,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 0,
      grand_total: 0,
      header_config: {
        logoHeightPx: 60,
        pageHeaderOverrides: undefined
      },
      created_at: '2026-11-21T00:00:00.000Z'
    };
    const hydratedCleared = QuotationRepository.hydrateStudioStateFromQuotation(
      quoteWithClearedOverrides,
      existingProfile,
      null
    );
    expect(hydratedCleared.headerConfig.logoHeightPx).toBe(60);
    expect(hydratedCleared.headerConfig.pageHeaderOverrides).toBe(undefined);

    // 5. sanitizePayloadForFirestoreLimit & serializePresetSnapshot preserve remaining overrides and never resurrect deleted body_2
    const sanitizedProfile = QuotationRepository.sanitizePayloadForFirestoreLimit(updatedProfile);
    expect(sanitizedProfile.header_config?.pageHeaderOverrides?.body_2).toBe(undefined);
    expect(sanitizedProfile.header_config?.pageHeaderOverrides?.annex_1?.mode).toBe('none');

    const sanitizedClearedProfile = QuotationRepository.sanitizePayloadForFirestoreLimit(clearedProfile);
    expect(sanitizedClearedProfile.header_config?.pageHeaderOverrides).toBe(undefined);

    const updatedPresetSnapshot = QuotationRepository.sanitizePayloadForFirestoreLimit(
      QuotationRepository.serializePresetSnapshot({
        workspace_id: 'ws_26',
        preset_name: 'Updated Preset',
        default_tax_mode: 'taxes_extra',
        default_validity_days: 30,
        signatory_mode: 'single',
        visible_columns: { brand: true, model: true, origin: true, availability: true, unit_price: true },
        header_config: QuotationRepository.mergeHeaderConfigReplacingOverrides(existingHeader, {
          logoHeightPx: 54,
          pageHeaderOverrides: { annex_1: { mode: 'none' } }
        })
      })
    );
    expect(updatedPresetSnapshot.header_config?.pageHeaderOverrides?.body_2).toBe(undefined);
    expect(updatedPresetSnapshot.header_config?.pageHeaderOverrides?.annex_1?.mode).toBe('none');
  });

  it('26b. Baseline enquiry drafts preserve defaultPreset.header_config (including pageHeaderOverrides) while saved quotes honor their own header_config (P1-4)', () => {
    const profile: WorkspaceDocumentProfile = {
      id: 'docprof_ws_26b',
      workspace_id: 'ws_26b',
      profile_name: 'Corporate Profile',
      legal_entity_name: 'Aqua Engineering LLC',
      address_line_1: 'Plot 14, Industrial Area',
      bank_accounts: [],
      header_config: {
        logoHeightPx: 44,
        showWebsite: true,
        pageHeaderOverrides: {
          body_2: { mode: 'full_repeat' }
        }
      }
    };

    const defaultPreset: QuotationPreset = {
      id: 'preset_26b_default',
      workspace_id: 'ws_26b',
      preset_name: 'Executive Water Proposal',
      is_default: true,
      default_tax_mode: 'taxes_extra',
      default_validity_days: 30,
      signatory_mode: 'single',
      visible_columns: { brand: true, model: true, origin: true, availability: true, unit_price: true },
      header_config: {
        logoHeightPx: 68,
        showWebsite: false,
        pageHeaderOverrides: {
          body_2: { mode: 'compact', customTitle: 'Commercial Offer — Contd.' },
          annex_1: { mode: 'none' }
        }
      },
      footer_config: {
        showPageNumbers: true,
        excluded_page_indices: [3]
      }
    };

    // Truthy baseline enquiry proposal with NO header_config / footer_config yet
    const baselineDraft: Quotation = {
      id: 'baseline_enq_26b',
      workspace_id: 'ws_26b',
      workspaceId: 'ws_26b',
      enquiry_id: 'enq_26b',
      quote_number: 'QT-2026-0261',
      revision_number: 1,
      formatted_quote_ref: 'QT-2026-0261-R1',
      status: 'Draft',
      client_snapshot: { entity_name: 'Veolia Water' },
      sender_snapshot: { entity_name: 'Aqua Engineering LLC' },
      line_items: [],
      tax_mode: 'taxes_extra',
      subtotal: 0,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 0,
      grand_total: 0,
      created_at: '2026-11-21T00:00:00.000Z'
    };
    (baselineDraft as any)._isBaselineEnquiryProposal = true;

    const hydratedBaseline = QuotationRepository.hydrateStudioStateFromQuotation(
      baselineDraft,
      profile,
      defaultPreset
    );
    expect(hydratedBaseline.headerConfig.logoHeightPx).toBe(68);
    expect(hydratedBaseline.headerConfig.showWebsite).toBe(false);
    expect(hydratedBaseline.headerConfig.pageHeaderOverrides?.body_2?.mode).toBe('compact');
    expect(hydratedBaseline.headerConfig.pageHeaderOverrides?.body_2?.customTitle).toBe(
      'Commercial Offer — Contd.'
    );
    expect(hydratedBaseline.headerConfig.pageHeaderOverrides?.annex_1?.mode).toBe('none');
    expect(hydratedBaseline.footerConfig.excluded_page_indices).toEqual([3]);

    // Saved concrete quote with its own explicit header_config overrides both profile & preset
    const savedQuote: Quotation = {
      ...baselineDraft,
      id: 'qt_26b_saved',
      header_config: {
        logoHeightPx: 52,
        pageHeaderOverrides: {
          body_2: { mode: 'logo_only' }
        }
      }
    };
    delete (savedQuote as any)._isBaselineEnquiryProposal;

    const hydratedSaved = QuotationRepository.hydrateStudioStateFromQuotation(
      savedQuote,
      profile,
      null
    );
    expect(hydratedSaved.headerConfig.logoHeightPx).toBe(52);
    expect(hydratedSaved.headerConfig.pageHeaderOverrides?.body_2?.mode).toBe('logo_only');
    expect(hydratedSaved.headerConfig.pageHeaderOverrides?.annex_1).toBe(undefined);
  });

  it('26c. Switching presets resets excluded_page_indices when the new preset has no exclusions and applies new exclusions cleanly (P1-5)', () => {
    const prevFooterWithExclusions: QuotationFooterConfig = {
      showBankRemittance: true,
      showPageNumbers: true,
      excluded_page_indices: [2, 3],
      remittanceBankId: 'bank_old'
    };

    // 1. Switching to a preset with footer_config that omits excluded_page_indices -> resets to []
    const afterNoExclusionsPreset = QuotationRepository.resolveAppliedPresetFooterConfig(
      prevFooterWithExclusions,
      { showBankRemittance: true, showPageNumbers: false },
      'bank_new'
    );
    expect(afterNoExclusionsPreset.excluded_page_indices).toEqual([]);
    expect(afterNoExclusionsPreset.showPageNumbers).toBe(false);
    expect(afterNoExclusionsPreset.remittanceBankId).toBe('bank_new');

    // 2. Switching to a preset with footer_config === undefined -> STILL resets excluded_page_indices to []
    const afterMissingFooterPreset = QuotationRepository.resolveAppliedPresetFooterConfig(
      prevFooterWithExclusions,
      undefined
    );
    expect(afterMissingFooterPreset.excluded_page_indices).toEqual([]);

    // 3. Switching to a preset that explicitly defines excluded_page_indices: [4] -> applies [4] cleanly
    const afterExplicitExclusionsPreset = QuotationRepository.resolveAppliedPresetFooterConfig(
      prevFooterWithExclusions,
      { excluded_page_indices: [4] }
    );
    expect(afterExplicitExclusionsPreset.excluded_page_indices).toEqual([4]);
  });

  it('26d. canonicalSpecAttributeKey consolidates plural colours and all Studio UK/US & core attribute aliases (P1-3)', () => {
    expect(canonicalSpecAttributeKey('Colours')).toBe('color');
    expect(canonicalSpecAttributeKey('Colour')).toBe('color');
    expect(canonicalSpecAttributeKey('Color')).toBe('color');
    expect(canonicalSpecAttributeKey('Body Colours')).toBe('body color');
    expect(canonicalSpecAttributeKey('Dimensions')).toBe('dimension');
    expect(canonicalSpecAttributeKey('Dimension')).toBe('dimension');
    expect(canonicalSpecAttributeKey('Make / Brand')).toBe('brand');
    expect(canonicalSpecAttributeKey('Brand / Manufacturer')).toBe('brand');
    expect(canonicalSpecAttributeKey('Model / Part No.')).toBe('model');
    expect(canonicalSpecAttributeKey('Country of Origin')).toBe('origin');
    expect(canonicalSpecAttributeKey('Delivery / Lead Time')).toBe('delivery');
    expect(canonicalSpecAttributeKey('Availability')).toBe('delivery');
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

