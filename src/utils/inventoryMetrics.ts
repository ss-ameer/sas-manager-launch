import { Product } from '../types';

export type InventoryProductLike = Partial<Product> & {
  stock_on_hand?: number | null;
  stock_quantity?: number | null;
  current_stock?: number | null;
  stock_reserved?: number | null;
  reorder_level?: number | null;
  min_stock_level?: number | null;
  is_inventoried?: boolean | null;
};

/**
 * Canonical stock-on-hand resolution across Products Catalog & Dashboard.
 * Reads primary `stock_on_hand` first, with safe fallbacks to legacy `stock_quantity` and `current_stock`.
 */
export function getProductStockOnHand(p: InventoryProductLike): number {
  return Number(p.stock_on_hand ?? p.stock_quantity ?? p.current_stock ?? 0) || 0;
}

/**
 * Canonical available stock after subtracting reserved inventory.
 */
export function getProductAvailableStock(p: InventoryProductLike): number {
  return getProductStockOnHand(p) - (Number(p.stock_reserved ?? 0) || 0);
}

/**
 * Canonical reorder threshold resolution (`reorder_level` primary, legacy `min_stock_level` fallback).
 */
export function getProductReorderLevel(p: InventoryProductLike): number {
  return Number(p.reorder_level ?? p.min_stock_level ?? 0) || 0;
}

/**
 * Canonical Low Stock predicate shared by Dashboard & Products Catalog.
 * Returns `true` ONLY when:
 * 1. Product is not explicitly marked non-inventoried (`is_inventoried !== false`),
 * 2. An explicit positive reorder threshold (`> 0`) is configured, AND
 * 3. Available stock (`stock_on_hand - stock_reserved`) is at or below the reorder threshold.
 */
export function isProductLowStock(p: InventoryProductLike): boolean {
  if (p.is_inventoried === false) return false;
  const threshold = getProductReorderLevel(p);
  if (threshold <= 0) return false;
  return getProductAvailableStock(p) <= threshold;
}
