/**
 * Unit Test Suite for Shared Inventory Metrics Utility (`src/utils/inventoryMetrics.ts`)
 * Verifies exact stock KPI parity between Dashboard and Products Catalog.
 *
 * Execute directly via `npx tsx src/__tests__/inventoryMetrics.test.ts`.
 */

import {
  getProductStockOnHand,
  getProductAvailableStock,
  getProductReorderLevel,
  isProductLowStock,
  InventoryProductLike
} from '../utils/inventoryMetrics';

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
    throw new Error(`${label ? label + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

it('returns 0 and never flags low stock when reorder_level is 0 or unset', () => {
  const zeroThreshold: InventoryProductLike = {
    is_inventoried: true,
    stock_on_hand: 0,
    reorder_level: 0
  };
  assertEqual(getProductStockOnHand(zeroThreshold), 0, 'stock_on_hand');
  assertEqual(getProductReorderLevel(zeroThreshold), 0, 'reorder_level');
  assertEqual(isProductLowStock(zeroThreshold), false, 'isProductLowStock with reorder_level 0');

  const unsetThreshold: InventoryProductLike = {
    is_inventoried: true,
    stock_on_hand: 0
  };
  assertEqual(isProductLowStock(unsetThreshold), false, 'isProductLowStock with unset reorder_level');
});

it('flags low stock when stock_on_hand - stock_reserved <= reorder_level', () => {
  const exactBoundary: InventoryProductLike = {
    is_inventoried: true,
    stock_on_hand: 10,
    stock_reserved: 5,
    reorder_level: 5
  };
  assertEqual(getProductAvailableStock(exactBoundary), 5, 'available stock at boundary');
  assertEqual(isProductLowStock(exactBoundary), true, 'low stock at boundary');

  const belowBoundary: InventoryProductLike = {
    is_inventoried: true,
    stock_on_hand: 10,
    stock_reserved: 7,
    reorder_level: 5
  };
  assertEqual(getProductAvailableStock(belowBoundary), 3, 'available stock below boundary');
  assertEqual(isProductLowStock(belowBoundary), true, 'low stock below boundary');

  const healthyStock: InventoryProductLike = {
    is_inventoried: true,
    stock_on_hand: 10,
    stock_reserved: 4,
    reorder_level: 5
  };
  assertEqual(getProductAvailableStock(healthyStock), 6, 'available stock healthy');
  assertEqual(isProductLowStock(healthyStock), false, 'healthy stock not flagged');
});

it('respects explicit is_inventoried === false even if reorder_level > 0', () => {
  const nonInventoried: InventoryProductLike = {
    is_inventoried: false,
    stock_on_hand: 0,
    reorder_level: 10
  };
  assertEqual(isProductLowStock(nonInventoried), false, 'non-inventoried item should not flag low stock');
});

it('supports legacy stock_quantity, current_stock, and min_stock_level fallbacks', () => {
  const legacyQtyItem: InventoryProductLike = {
    stock_quantity: 4,
    min_stock_level: 5
  };
  assertEqual(getProductStockOnHand(legacyQtyItem), 4, 'legacy stock_quantity');
  assertEqual(getProductReorderLevel(legacyQtyItem), 5, 'legacy min_stock_level');
  assertEqual(isProductLowStock(legacyQtyItem), true, 'legacy item low stock');

  const legacyCurrentStockItem: InventoryProductLike = {
    current_stock: 12,
    min_stock_level: 5
  };
  assertEqual(getProductStockOnHand(legacyCurrentStockItem), 12, 'legacy current_stock');
  assertEqual(isProductLowStock(legacyCurrentStockItem), false, 'legacy current_stock healthy');

  const primaryOverridesLegacy: InventoryProductLike = {
    is_inventoried: true,
    stock_on_hand: 20,
    stock_quantity: 1,
    reorder_level: 5,
    min_stock_level: 50
  };
  assertEqual(getProductStockOnHand(primaryOverridesLegacy), 20, 'stock_on_hand takes precedence');
  assertEqual(getProductReorderLevel(primaryOverridesLegacy), 5, 'reorder_level takes precedence');
  assertEqual(isProductLowStock(primaryOverridesLegacy), false, 'primary fields determine healthy status');
});

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;

console.log(`\nInventory Metrics Test Suite: ${passed} passed, ${failed} failed`);
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
