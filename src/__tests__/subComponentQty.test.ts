/**
 * Unit Test Suite for Sub-Component Auto-Scaling Quantity Helper (`src/utils/subComponentQty.ts`)
 * and Composite Itemized Recalculation (`src/utils/compositeBomUtils.ts`).
 *
 * Execute directly via `npx tsx src/__tests__/subComponentQty.test.ts`.
 */

import {
  resolveSubComponentDisplayQty,
  formatSubComponentQty,
  resolveSubComponentDeliveryQuantities,
  resolveSubComponentStockQty,
} from '../utils/subComponentQty';
import { recalculateCompositeItemTotals } from '../utils/compositeBomUtils';
import { LineItemComponent } from '../types';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (err: any) {
    results.push({ name, passed: false, error: err?.message || String(err) });
  }
}

function assertEqual<T>(actual: T, expected: T, label?: string) {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

// 1. Legacy / disabled mode (undefined or false)
it('preserves stored sub.quantity literally when scaleWithParent is undefined or false', () => {
  const resUndefined = resolveSubComponentDisplayQty({ quantity: 2 }, 5, undefined);
  assertEqual(resUndefined.effectiveQty, 2, 'effectiveQty (undefined)');
  assertEqual(resUndefined.perUnitQty, 2, 'perUnitQty (undefined)');
  assertEqual(resUndefined.isScaled, false, 'isScaled (undefined)');
  assertEqual(resUndefined.isFixed, false, 'isFixed (undefined)');

  const resFalse = resolveSubComponentDisplayQty({ quantity: 3, qty_mode: 'per_unit' }, 4, false);
  assertEqual(resFalse.effectiveQty, 3, 'effectiveQty (false)');
  assertEqual(resFalse.perUnitQty, 3, 'perUnitQty (false)');
  assertEqual(resFalse.isScaled, false, 'isScaled (false)');
  assertEqual(resFalse.isFixed, false, 'isFixed (false)');

  const resFixedDisabled = resolveSubComponentDisplayQty({ quantity: 1, qty_mode: 'fixed' }, 4, false);
  assertEqual(resFixedDisabled.effectiveQty, 1, 'effectiveQty (fixed + disabled)');
  assertEqual(resFixedDisabled.isScaled, false, 'isScaled (fixed + disabled)');
  assertEqual(resFixedDisabled.isFixed, true, 'isFixed (fixed + disabled)');
});

// 2. Scaled integer & decimal cases
it('scales per-unit quantities cleanly when scaleWithParent is true', () => {
  const oneByTwo = resolveSubComponentDisplayQty({ quantity: 1 }, 2, true);
  assertEqual(oneByTwo.effectiveQty, 2, '1 x 2');
  assertEqual(oneByTwo.perUnitQty, 1, 'perUnitQty');
  assertEqual(oneByTwo.isScaled, true, 'isScaled 1x2');
  assertEqual(oneByTwo.isFixed, false, 'isFixed 1x2');

  const twoByThree = resolveSubComponentDisplayQty({ quantity: 2, qty_mode: 'per_unit' }, 3, true);
  assertEqual(twoByThree.effectiveQty, 6, '2 x 3');
  assertEqual(twoByThree.perUnitQty, 2, 'perUnitQty 2x3');
  assertEqual(twoByThree.isScaled, true, 'isScaled 2x3');

  // Floating-point decimal precision: 0.1 * 3 === 0.3 (not 0.30000000000000004)
  const decimalCase = resolveSubComponentDisplayQty({ quantity: 0.1 }, 3, true);
  assertEqual(decimalCase.effectiveQty, 0.3, '0.1 x 3 clean decimal');
  assertEqual(decimalCase.perUnitQty, 0.1, 'perUnitQty 0.1');
  assertEqual(decimalCase.isScaled, true, 'isScaled 0.1x3');

  const quarterCase = resolveSubComponentDisplayQty({ quantity: 1.25 }, 3, true);
  assertEqual(quarterCase.effectiveQty, 3.75, '1.25 x 3');
  assertEqual(quarterCase.isScaled, true, 'isScaled 1.25x3');
});

// 3. Fixed override stays constant regardless of parent quantity
it('keeps fixed rows unscaled when scaleWithParent is true and qty_mode is fixed', () => {
  const fixedRow = resolveSubComponentDisplayQty({ quantity: 1, qty_mode: 'fixed' }, 4, true);
  assertEqual(fixedRow.effectiveQty, 1, 'fixed stays 1 at parentQty=4');
  assertEqual(fixedRow.perUnitQty, 1, 'perUnitQty stays 1');
  assertEqual(fixedRow.isScaled, false, 'fixed isScaled=false');
  assertEqual(fixedRow.isFixed, true, 'fixed isFixed=true');

  const fixedLot = resolveSubComponentDisplayQty({ quantity: 2, qty_mode: 'fixed' }, 10, true);
  assertEqual(fixedLot.effectiveQty, 2, 'fixed lot stays 2 at parentQty=10');
  assertEqual(fixedLot.isScaled, false, 'fixed lot isScaled=false');
  assertEqual(fixedLot.isFixed, true, 'fixed lot isFixed=true');
});

// 4. parentQty === 1 marks isScaled: false (no redundant "1/unit" label)
it('marks isScaled false when parentQty is 1 even if scaleWithParent is true', () => {
  const singleParent = resolveSubComponentDisplayQty({ quantity: 2 }, 1, true);
  assertEqual(singleParent.effectiveQty, 2, 'effectiveQty at parentQty=1');
  assertEqual(singleParent.perUnitQty, 2, 'perUnitQty at parentQty=1');
  assertEqual(singleParent.isScaled, false, 'isScaled should be false at parentQty=1');
  assertEqual(singleParent.isFixed, false, 'isFixed should be false');
});

// 5. Edge cases: 0, missing, negative, or NaN quantities
it('handles 0, missing, negative, and NaN quantities safely without producing NaN', () => {
  const zeroSub = resolveSubComponentDisplayQty({ quantity: 0 }, 5, true);
  assertEqual(zeroSub.effectiveQty, 0, 'zero sub qty');
  assertEqual(zeroSub.perUnitQty, 0, 'zero perUnitQty');

  const missingSub = resolveSubComponentDisplayQty({ quantity: undefined as any }, 3, true);
  assertEqual(missingSub.effectiveQty, 0, 'undefined sub qty');

  const nanSub = resolveSubComponentDisplayQty({ quantity: Number.NaN }, 3, true);
  assertEqual(nanSub.effectiveQty, 0, 'NaN sub qty');

  const negativeSub = resolveSubComponentDisplayQty({ quantity: -2 }, 3, true);
  assertEqual(negativeSub.effectiveQty, 0, 'negative sub qty clamped to 0');

  const zeroParent = resolveSubComponentDisplayQty({ quantity: 2 }, 0, true);
  assertEqual(zeroParent.effectiveQty, 0, 'zero parent qty produces 0');
  assertEqual(zeroParent.isScaled, true, 'zero parent differs from 1');

  const nanParent = resolveSubComponentDisplayQty({ quantity: 2 }, Number.NaN, true);
  assertEqual(nanParent.effectiveQty, 2, 'NaN parent defaults to 1');
  assertEqual(nanParent.isScaled, false, 'NaN parent defaults to 1 -> not scaled');
});

// 6. Clean formatting helper
it('formats integer and decimal quantities cleanly', () => {
  assertEqual(formatSubComponentQty(2), '2', 'integer');
  assertEqual(formatSubComponentQty(1200), '1,200', 'thousands integer');
  assertEqual(formatSubComponentQty(0.30000000000000004), '0.3', 'float noise cleaned');
  assertEqual(formatSubComponentQty(3.75), '3.75', 'decimal preserved');
});

// 7. Itemized composite total recalculation consistency with mixed Per Unit + Fixed rows
it('recalculates itemized composite totals consistently for both legacy and auto-scaled mixed rows', () => {
  const components: LineItemComponent[] = [
    {
      id: 'c1',
      item_name: 'Pressure Valve',
      quantity: 2,
      unit: 'Nos',
      unit_price: 100,
      total_price: 200,
      qty_mode: 'per_unit',
    },
    {
      id: 'c2',
      item_name: 'Site Commissioning Lot',
      quantity: 1,
      unit: 'Lot',
      unit_price: 300,
      total_price: 300,
      qty_mode: 'fixed',
    },
  ];

  // Legacy (scaleWithParent = false): parent unit = 2*100 + 1*300 = 500; for 2 sets -> total = 1000
  const legacy = recalculateCompositeItemTotals(components, 2, undefined, undefined, false);
  assertEqual(legacy.unit_price, 500, 'legacy unit_price');
  assertEqual(legacy.total_price, 1000, 'legacy total_price');

  // Auto-scaled (scaleWithParent = true, parentQty = 2):
  // c1 effective = 4 * 100 = 400; c2 fixed = 1 * 300 = 300; total = 700; parent unit = 350
  const scaled = recalculateCompositeItemTotals(components, 2, undefined, undefined, true);
  assertEqual(scaled.total_price, 700, 'scaled total_price (4*100 + 1*300)');
  assertEqual(scaled.unit_price, 350, 'scaled parent unit_price (700 / 2)');
  assertEqual(scaled.normalizedComponents[0].total_price, 400, 'scaled per-unit sub total_price');
  assertEqual(scaled.normalizedComponents[1].total_price, 300, 'scaled fixed sub total_price');
});

// 8. Delivery Note (DO) quantity resolution: fixed rows stay constant, scaled/legacy per-set rows multiply
it('resolves Delivery Note sub-component quantities without multiplying fixed rows while preserving legacy per-set BOM scaling', () => {
  // Full delivery of 3 sets: per_unit (2/set) -> 6 ordered, 6 delivered, 0 balance
  const perUnitFull = resolveSubComponentDeliveryQuantities(
    { quantity: 2, qty_mode: 'per_unit' },
    3,
    3
  );
  assertEqual(perUnitFull.qty_ordered, 6, 'per_unit full ordered');
  assertEqual(perUnitFull.qty_delivered, 6, 'per_unit full delivered');
  assertEqual(perUnitFull.qty_balance, 0, 'per_unit full balance');
  assertEqual(perUnitFull.isFixed, false, 'per_unit isFixed');

  // Partial delivery (1 of 3 sets): per_unit (2/set) -> 6 ordered, 2 delivered, 4 balance
  const perUnitPartial = resolveSubComponentDeliveryQuantities(
    { quantity: 2, qty_mode: 'per_unit' },
    3,
    1
  );
  assertEqual(perUnitPartial.qty_ordered, 6, 'per_unit partial ordered');
  assertEqual(perUnitPartial.qty_delivered, 2, 'per_unit partial delivered');
  assertEqual(perUnitPartial.qty_balance, 4, 'per_unit partial balance');

  // Legacy composite row (qty_mode undefined): preserves pre-Q1 per-set multiplication
  const legacyPartial = resolveSubComponentDeliveryQuantities({ quantity: 2 }, 3, 2);
  assertEqual(legacyPartial.qty_ordered, 6, 'legacy ordered');
  assertEqual(legacyPartial.qty_delivered, 4, 'legacy delivered');
  assertEqual(legacyPartial.qty_balance, 2, 'legacy balance');

  // Fixed row (qty_mode === 'fixed'): NEVER multiplied by orderedQty or deliverNow
  const fixedFull = resolveSubComponentDeliveryQuantities(
    { quantity: 1, qty_mode: 'fixed' },
    4,
    4
  );
  assertEqual(fixedFull.qty_ordered, 1, 'fixed full ordered stays 1');
  assertEqual(fixedFull.qty_delivered, 1, 'fixed full delivered stays 1');
  assertEqual(fixedFull.qty_balance, 0, 'fixed full balance');
  assertEqual(fixedFull.isFixed, true, 'fixed isFixed');

  const fixedZeroDel = resolveSubComponentDeliveryQuantities(
    { quantity: 2, qty_mode: 'fixed' },
    5,
    0
  );
  assertEqual(fixedZeroDel.qty_ordered, 2, 'fixed zero-delivery ordered stays 2');
  assertEqual(fixedZeroDel.qty_delivered, 0, 'fixed zero-delivery delivered is 0');
  assertEqual(fixedZeroDel.qty_balance, 2, 'fixed zero-delivery balance is 2');
});

// 9. Inventory stock requirement resolution: fixed rows never over-reserve; legacy/per-unit scale cleanly
it('resolves stock reservation quantities for fixed vs per-unit vs legacy BOM sub-components', () => {
  assertEqual(
    resolveSubComponentStockQty({ quantity: 2, qty_mode: 'per_unit' }, 3),
    6,
    'per-unit scales 2x3=6'
  );
  assertEqual(
    resolveSubComponentStockQty({ quantity: 2 }, 3),
    6,
    'legacy undefined qty_mode preserves 2x3=6'
  );
  assertEqual(
    resolveSubComponentStockQty({ quantity: 1, qty_mode: 'fixed' }, 5),
    1,
    'fixed row stays 1 regardless of parentQty=5'
  );
  assertEqual(
    resolveSubComponentStockQty({ quantity: 1, qty_mode: 'fixed' }, 0),
    0,
    'zero parentQty reserves 0 even for fixed rows'
  );
  assertEqual(
    resolveSubComponentStockQty({ quantity: 0.1, qty_mode: 'per_unit' }, 3),
    0.3,
    'clean decimal rounding 0.1x3=0.3'
  );
});

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log(`\nSub-Component Quantity Scaling Test Suite: ${passed} passed, ${failed} failed`);
results.forEach((r) => {
  if (r.passed) {
    console.log(`  PASS: ${r.name}`);
  } else {
    console.error(`  FAIL: ${r.name} -> ${r.error}`);
  }
});

if (failed > 0) {
  process.exit(1);
}
