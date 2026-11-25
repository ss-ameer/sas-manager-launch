/**
 * Unit Test Suite for Shared Inventory Metrics Utility (`src/utils/inventoryMetrics.ts`)
 * Verifies exact stock KPI parity between Dashboard and Products Catalog.
 *
 * Execute directly via `npx tsx src/__tests__/inventoryMetrics.test.ts`.
 */

import {
  isCatalogProductActive,
  filterActiveCatalogProducts,
  getProductStockOnHand,
  getProductAvailableStock,
  getProductReorderLevel,
  isProductLowStock,
  InventoryProductLike
} from '../utils/inventoryMetrics';
import {
  buildCatalogVariantAnalysisMap,
  countCatalogVariantFamilies
} from '../utils/productVariantFormat';
import { Product } from '../types';

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

it('filters out both is_deleted and legacy deleted products canonically', () => {
  const sample: InventoryProductLike[] = [
    { id: 'p1', name: 'Active Valve', stock_on_hand: 10 },
    { id: 'p2', name: 'Soft Deleted (is_deleted)', is_deleted: true, stock_on_hand: 5 },
    { id: 'p3', name: 'Legacy Soft Deleted (deleted)', deleted: true, stock_on_hand: 8 },
    { id: 'p4', name: 'Explicit Active', is_deleted: false, deleted: false, stock_on_hand: 2 }
  ];
  assertEqual(isCatalogProductActive(sample[0]), true, 'p1 active');
  assertEqual(isCatalogProductActive(sample[1]), false, 'p2 inactive (is_deleted)');
  assertEqual(isCatalogProductActive(sample[2]), false, 'p3 inactive (legacy deleted)');
  assertEqual(isCatalogProductActive(sample[3]), true, 'p4 active');

  const active = filterActiveCatalogProducts(sample);
  assertEqual(active.length, 2, 'only 2 active products remain');
  assertEqual(active[0].id, 'p1', 'first active id');
  assertEqual(active[1].id, 'p4', 'second active id');
});

it('matches variant family count 1:1 between countCatalogVariantFamilies and buildCatalogVariantAnalysisMap', () => {
  const catalog = [
    // Family 1: two siblings sharing explicit product_family
    { id: 'fam1-a', name: 'Disk Diffuser 9in', product_family: 'Disk Diffuser', product_type: 'Diffuser' },
    { id: 'fam1-b', name: 'Disk Diffuser 12in', product_family: 'Disk Diffuser', product_type: 'Diffuser' },
    // Family 2: parent + linked child via variant_parent_id
    { id: 'fam2-parent', name: 'Sand Filter Base', product_type: 'Filter' },
    { id: 'fam2-child', name: 'Sand Filter FRP 24in', variant_parent_id: 'fam2-parent', product_type: 'Filter' },
    // Singleton (should NOT count as a variant family)
    { id: 'solo-1', name: 'Standalone Pressure Gauge', product_type: 'Instrument' },
    // Family whose second sibling is legacy soft-deleted (only 1 active sibling left -> NOT a variant family)
    { id: 'fam3-a', name: 'Dosing Pump', product_type: 'Pump' },
    { id: 'fam3-b', name: 'Dosing Pump', product_type: 'Pump', deleted: true } as any,
    // Family whose second sibling is is_deleted (only 1 active sibling left -> NOT a variant family)
    { id: 'fam4-a', name: 'Cartridge Filter', product_type: 'Filter' },
    { id: 'fam4-b', name: 'Cartridge Filter', product_type: 'Filter', is_deleted: true }
  ] as Product[];

  const dashboardCount = countCatalogVariantFamilies(catalog);
  const analysisMap = buildCatalogVariantAnalysisMap(catalog);
  const productManagerFamilies = new Set<string>();
  analysisMap.forEach((info) => {
    if (info.isVariant) productManagerFamilies.add(info.familyKey);
  });

  assertEqual(dashboardCount, 2, 'countCatalogVariantFamilies returns 2 active families');
  assertEqual(productManagerFamilies.size, 2, 'ProductManager variantFamilyCount returns 2 active families');
  assertEqual(dashboardCount, productManagerFamilies.size, '100% Dashboard <-> Catalog parity');
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
