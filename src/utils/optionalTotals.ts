import type {
  QuotationBlockConfig,
  QuotationLineItem,
  QuotationTaxMode
} from '../types';

export const DEFAULT_ALTERNATE_TOTAL_WITH_OPTIONALS_LABEL =
  'Alternate Total (Incl. Optional Items)';

export interface LineItemOptionBadges {
  /** Blue badge for non-optional option groups (e.g. "Option A", "Option B") when not split into separate tables */
  optionGroupBadge: string | null;
  /** Single deduplicated amber badge for optional / add-on items (e.g. "Optional / Add-On" or "Optional") */
  optionalBadge: string | null;
}

export interface OptionalTotalsResult {
  hasOptionals: boolean;
  optionalItemCount: number;
  optionalSubtotal: number;
  optionalVat: number;
  optionalTotalWithVat: number;
  grandTotalWithOptionals: number;
}

type OptionalCheckableLineItem = Partial<QuotationLineItem> & {
  option_designation?: string;
  classification?: string;
};

const DEFAULT_BASELINE_OPT_RE =
  /^(default\s*\/\s*included|baseline\s*\/\s*included|default|standard|included|baseline\s*\/\s*all|all)$/i;

const OPTIONAL_OR_ADDON_RE = /optional|add-?on/i;

function roundCurrency(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Math.sign(val || 1) * Number.EPSILON) * 100) / 100;
}

/**
 * Determines whether a quotation line item is an optional / add-on item
 * excluded from the baseline subtotal.
 */
export function isOptionalQuotationLineItem(item: OptionalCheckableLineItem): boolean {
  if (!item || item.isCompositeContinuation) return false;
  const rawOpt = String(
    item.option || item.option_group || item.option_designation || ''
  ).trim();
  if (OPTIONAL_OR_ADDON_RE.test(rawOpt)) {
    return true;
  }
  return Boolean(item.is_optional);
}

/**
 * Resolves the deduplicated option-group & optional badge pills for a line item row.
 *
 * Guarantees that an item whose Option Group is "Optional / Add-On" AND has
 * `is_optional === true` renders ONLY ONE clean amber badge instead of printing
 * both a blue "OPTIONAL / ADD-ON" pill and an amber "OPTIONAL" pill side-by-side.
 */
export function resolveLineItemOptionBadges(
  item: OptionalCheckableLineItem,
  shouldSplitByOptionTables: boolean
): LineItemOptionBadges {
  const rawOptLabel = String(
    item.option || item.option_group || item.option_designation || ''
  ).trim();
  const isDefaultBaselineOpt = !rawOptLabel || DEFAULT_BASELINE_OPT_RE.test(rawOptLabel);
  const optLabelIsOptional = !isDefaultBaselineOpt && OPTIONAL_OR_ADDON_RE.test(rawOptLabel);
  const isOptional = Boolean(item.is_optional) || optLabelIsOptional;

  // Non-optional option group badge (e.g. "Option A", "Option B") — hidden when split into its own option table
  const optionGroupBadge =
    !isDefaultBaselineOpt && !optLabelIsOptional && !shouldSplitByOptionTables
      ? rawOptLabel
      : null;

  // Single deduplicated amber optional badge.
  // When rawOptLabel already states Optional/Add-On (e.g. "Optional / Add-On"), promote that text
  // into the single amber badge so we never render two optional badges.
  const optionalBadge = isOptional
    ? optLabelIsOptional
      ? rawOptLabel
      : 'Optional'
    : null;

  return {
    optionGroupBadge,
    optionalBadge
  };
}

function resolveLineItemSignedTotal(item: OptionalCheckableLineItem): number {
  const hasCompositeSubRows =
    Array.isArray(item.sub_components) && item.sub_components.length > 0;
  const subComponentsPriceSum = hasCompositeSubRows
    ? item.sub_components!.reduce((sum, sc) => {
        if (sc.is_included_accessory) return sum;
        const scTotal =
          sc.total_price !== undefined && sc.total_price !== null
            ? Number(sc.total_price) || 0
            : (Number(sc.quantity) || 0) * (Number(sc.unit_price) || 0);
        return sum + scTotal;
      }, 0)
    : 0;

  const parentUnitPriceNum = Number(item.unit_price) || 0;
  const isItemizedSet =
    hasCompositeSubRows &&
    (item.package_pricing_mode === 'itemized' ||
      (item.package_pricing_mode !== 'lump_sum' &&
        subComponentsPriceSum > 0 &&
        (parentUnitPriceNum === 0 ||
          Math.abs(parentUnitPriceNum - subComponentsPriceSum) <= 0.05)));

  let rawLineTotal: number;
  const explicitTotal =
    item.total_price !== undefined && item.total_price !== null
      ? Number(item.total_price)
      : item.line_total !== undefined && item.line_total !== null
      ? Number(item.line_total)
      : undefined;

  if (
    isItemizedSet &&
    subComponentsPriceSum > 0 &&
    (!explicitTotal || explicitTotal === 0)
  ) {
    rawLineTotal = (Number(item.quantity) || 1) * subComponentsPriceSum;
  } else if (explicitTotal !== undefined && Number.isFinite(explicitTotal)) {
    rawLineTotal = explicitTotal;
  } else {
    rawLineTotal = (Number(item.quantity) || 0) * parentUnitPriceNum;
  }

  const isDiscount =
    item.item_type === 'discount' || item.classification === 'Discount / Rebate';
  return isDiscount ? -Math.abs(rawLineTotal) : rawLineTotal;
}

/**
 * Computes VAT-aware optional item totals and combined alternate grand total
 * across all active optional / add-on items on a quotation.
 */
export function calculateOptionalItemsTotals(params: {
  lineItems?: OptionalCheckableLineItem[] | null;
  baselineGrandTotal: number;
  taxMode?: QuotationTaxMode | 'taxes_included' | 'zero_rated' | string;
  taxRatePercent?: number;
}): OptionalTotalsResult {
  const items = Array.isArray(params.lineItems) ? params.lineItems : [];
  const baselineGrand = roundCurrency(Number(params.baselineGrandTotal) || 0);
  const taxRate = Number(params.taxRatePercent ?? 5);
  const normalizedTaxMode = String(params.taxMode || 'taxes_extra').trim().toLowerCase();

  let optionalItemCount = 0;
  let optionalSubtotalFils = 0;

  for (const item of items) {
    if (!item || item.isCompositeContinuation) continue;
    if (!isOptionalQuotationLineItem(item)) continue;
    optionalItemCount += 1;
    const signedTotal = resolveLineItemSignedTotal(item);
    const lineFils = Math.round(
      (signedTotal + Math.sign(signedTotal || 1) * Number.EPSILON) * 100
    );
    optionalSubtotalFils += lineFils;
  }

  if (optionalItemCount === 0) {
    return {
      hasOptionals: false,
      optionalItemCount: 0,
      optionalSubtotal: 0,
      optionalVat: 0,
      optionalTotalWithVat: 0,
      grandTotalWithOptionals: baselineGrand
    };
  }

  const optionalSubtotal = roundCurrency(optionalSubtotalFils / 100);
  let optionalVat = 0;
  let optionalTotalWithVat = optionalSubtotal;

  if (
    normalizedTaxMode === 'tax_exempt' ||
    normalizedTaxMode === 'zero_rated' ||
    normalizedTaxMode === 'vat_hidden' ||
    taxRate <= 0
  ) {
    optionalVat = 0;
    optionalTotalWithVat = optionalSubtotal;
  } else if (
    normalizedTaxMode === 'tax_calculated' ||
    normalizedTaxMode === 'taxes_included'
  ) {
    // Prices are already VAT-inclusive: extract embedded VAT for display, do not add extra VAT on top
    optionalVat = roundCurrency(
      optionalSubtotal - optionalSubtotal / (1 + taxRate / 100)
    );
    optionalTotalWithVat = optionalSubtotal;
  } else if (normalizedTaxMode === 'vat_excluded_extra') {
    // VAT is noted as extra and not added into numerical grand totals
    optionalVat = roundCurrency(optionalSubtotal * (taxRate / 100));
    optionalTotalWithVat = optionalSubtotal;
  } else {
    // 'taxes_extra' (standard exclusive VAT added on top)
    optionalVat = roundCurrency(optionalSubtotal * (taxRate / 100));
    optionalTotalWithVat = roundCurrency(optionalSubtotal + optionalVat);
  }

  const grandTotalWithOptionals = roundCurrency(
    Math.max(0, baselineGrand + optionalTotalWithVat)
  );

  return {
    hasOptionals: true,
    optionalItemCount,
    optionalSubtotal,
    optionalVat,
    optionalTotalWithVat,
    grandTotalWithOptionals
  };
}

/**
 * Auto-hide guard for the Alternate Total (Incl. Optionals) row:
 * only renders when explicitly enabled on the Totals block AND the quotation
 * actually contains at least one optional item.
 */
export function shouldShowAlternateTotalWithOptionals(
  blockConfig?: Pick<QuotationBlockConfig, 'showAlternateTotalWithOptionals'> | null,
  optionalTotals?: Pick<OptionalTotalsResult, 'hasOptionals'> | null
): boolean {
  return Boolean(blockConfig?.showAlternateTotalWithOptionals && optionalTotals?.hasOptionals);
}
