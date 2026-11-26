import { LineItemComponent } from '../types';

export interface SubComponentQtyResolution {
  /** Final quantity displayed and billed for this sub-component row */
  effectiveQty: number;
  /** Stored base quantity (per parent unit when scaled, or literal quantity when fixed/unscaled) */
  perUnitQty: number;
  /** True when the effective quantity was scaled by parentQty (scaleWithParent=true, not fixed, and parentQty !== 1) */
  isScaled: boolean;
  /** True when the row explicitly opts out of scaling via qty_mode === 'fixed' */
  isFixed: boolean;
}

/**
 * Cleanly rounds numbers to at most 4 decimal places to avoid IEEE-754 floating-point noise
 * (e.g., 0.1 * 3 -> 0.3 instead of 0.30000000000000004).
 */
const roundQtyClean = (value: number): number => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
};

/**
 * Pure canonical helper resolving the displayed/effective quantity of a composite sub-component.
 *
 * Backward-compatibility guarantee:
 * - When `scaleWithParent` is `false` or `undefined`, returns `sub.quantity` literally with `isScaled: false`.
 * - When `scaleWithParent` is `true` and `sub.qty_mode === 'fixed'`, returns `sub.quantity` literally with `isFixed: true, isScaled: false`.
 * - When `scaleWithParent` is `true` and `sub.qty_mode !== 'fixed'`, multiplies by `parentQty` and marks `isScaled: parentQty !== 1`.
 */
export function resolveSubComponentDisplayQty(
  sub: Pick<LineItemComponent, 'quantity' | 'qty_mode'>,
  parentQty: number,
  scaleWithParent?: boolean
): SubComponentQtyResolution {
  const rawBase = Number(sub?.quantity);
  const perUnitQty = Number.isFinite(rawBase) && rawBase > 0 ? roundQtyClean(rawBase) : 0;
  const isFixed = sub?.qty_mode === 'fixed';

  if (!scaleWithParent) {
    return {
      effectiveQty: perUnitQty,
      perUnitQty,
      isScaled: false,
      isFixed,
    };
  }

  if (isFixed) {
    return {
      effectiveQty: perUnitQty,
      perUnitQty,
      isScaled: false,
      isFixed: true,
    };
  }

  const rawParent = Number(parentQty);
  const safeParentQty = Number.isFinite(rawParent) && rawParent >= 0 ? rawParent : 1;
  const effectiveQty = roundQtyClean(perUnitQty * safeParentQty);

  return {
    effectiveQty,
    perUnitQty,
    isScaled: safeParentQty !== 1,
    isFixed: false,
  };
}

/**
 * Formats a sub-component quantity for clean document & UI display
 * (integers show no decimals; decimals preserve up to 4 significant fractional digits without trailing zeros).
 */
export function formatSubComponentQty(qty: number): string {
  const clean = roundQtyClean(Number(qty));
  if (clean % 1 === 0) {
    return clean.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return clean.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

export interface SubComponentDeliveryResolution {
  qty_ordered: number;
  qty_delivered: number;
  qty_balance: number;
  isFixed: boolean;
}

/**
 * Resolves ordered, delivered, and balance quantities for a composite sub-component on a Delivery Note (DO).
 *
 * Backward-compatibility & Fixed-row guarantee:
 * - When `sub.qty_mode === 'fixed'`, the row NEVER multiplies by parent ordered/delivered sets
 *   (`qty_ordered = sub.quantity`, `qty_delivered = deliverNow > 0 ? sub.quantity : 0`).
 * - When `sub.qty_mode !== 'fixed'`, multiplies by `orderedParentQty` / `deliverNowParentQty`
 *   (preserving legacy per-set BOM Delivery Note behavior AND Q1 auto-scaled per-unit rows).
 */
export function resolveSubComponentDeliveryQuantities(
  sub: Pick<LineItemComponent, 'quantity' | 'qty_mode'>,
  orderedParentQty: number,
  deliverNowParentQty: number
): SubComponentDeliveryResolution {
  const safeOrdParent = Math.max(1, Number(orderedParentQty) || 1);
  const safeDelParent = Math.max(0, Number(deliverNowParentQty) || 0);
  const isFixed = sub?.qty_mode === 'fixed';

  if (isFixed) {
    const fixedQty = resolveSubComponentDisplayQty(sub, safeOrdParent, true).effectiveQty;
    const deliveredQty = safeDelParent > 0 ? fixedQty : 0;
    const balanceQty = Math.max(0, roundQtyClean(fixedQty - deliveredQty));
    return {
      qty_ordered: fixedQty,
      qty_delivered: deliveredQty,
      qty_balance: balanceQty,
      isFixed: true,
    };
  }

  const totalSubOrd = resolveSubComponentDisplayQty(sub, safeOrdParent, true).effectiveQty;
  const totalSubDel = resolveSubComponentDisplayQty(sub, safeDelParent, true).effectiveQty;
  const totalSubBal = Math.max(0, roundQtyClean(totalSubOrd - totalSubDel));

  return {
    qty_ordered: totalSubOrd,
    qty_delivered: totalSubDel,
    qty_balance: totalSubBal,
    isFixed: false,
  };
}

/**
 * Resolves the effective stock quantity required/reserved for a linked BOM sub-component.
 *
 * - `sub.qty_mode === 'fixed'` stays fixed at `sub.quantity` (never multiplied by `parentQty`).
 * - `sub.qty_mode !== 'fixed'` scales by `parentQty` (preserving legacy pre-Q1 per-set BOM
 *   stock reservations as well as Q1 auto-scaled per-unit rows).
 */
export function resolveSubComponentStockQty(
  sub: Pick<LineItemComponent, 'quantity' | 'qty_mode'>,
  parentQty: number
): number {
  const safeParent = Math.max(0, Number(parentQty) || 0);
  if (safeParent <= 0) return 0;
  return resolveSubComponentDisplayQty(sub, safeParent, true).effectiveQty;
}

