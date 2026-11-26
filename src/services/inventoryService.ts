import {
  Enquiry,
  LineItem,
  Product,
  StockMovement,
  UserProfile,
  User,
  Project,
  GrnReceiptData,
  StockAdjustmentData,
  PoGrnBatchReceiptInput,
  Quotation,
  PurchaseOrderReceivingStatus
} from '../types';
import { safeAddDoc, safeUpdateDoc, safeGetDoc, safeGetDocs, db, auth, isQuotaCircuitBroken } from '../firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { MetadataRepository } from './repositories/MetadataRepository';
import { QuotationRepository } from './repositories/QuotationRepository';
import { getFromLocalStore } from './db';
import { isOptionActiveForInventoryAndBaseline } from '../utils/compositeBomUtils';
import { resolveSubComponentStockQty } from '../utils/subComponentQty';

export { isOptionActiveForInventoryAndBaseline };

export interface ReservationResult {
  success: boolean;
  reservedCount: number;
  skippedCount: number;
  details: { productId: string; quantity: number; newReserved: number }[];
  shortages?: { productId: string; productName: string; required: number; available: number }[];
}

export interface ReleaseResult {
  success: boolean;
  releasedCount: number;
  skippedCount: number;
  details: { productId: string; quantity: number; newReserved: number }[];
}

/**
 * Resolves effective stock requirements across both top-level catalog products
 * and Composite Package / Kit (BOM) sub-components that link to a catalog `product_id`.
 * Respects multi-option rules: only `Default / Included` and `Option A` (or the explicitly
 * designated `winningOption`) are included so mutually exclusive options don't double-reserve stock.
 * When `includeAllConfirmedOptions` is true (e.g. for already-filtered Project line items),
 * all non-optional confirmed items are processed regardless of whether their option label is Option A/B/C.
 */
function resolveCatalogProductIdSync(ref?: {
  product_id?: string;
  variant_id?: string;
  sku?: string;
  part_no?: string;
  model_part_no?: string;
} | null): string {
  if (!ref) return '';
  const directPid = (ref.product_id || '').trim();
  const variantId = (ref.variant_id || '').trim();
  const rawSku = (ref.sku || ref.part_no || ref.model_part_no || '').trim().toLowerCase();

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('omni_products');
      if (raw) {
        const list: Product[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          if (variantId) {
            const byVarId = list.find((p) => !p.is_deleted && p.id === variantId);
            if (byVarId) return byVarId.id;
          }
          if (rawSku) {
            // Prefer a child variant matching the parent product_id + SKU if product_id is set
            if (directPid) {
              const childMatch = list.find(
                (p) =>
                  !p.is_deleted &&
                  ((p as any).variant_of === directPid || (p as any).parent_product_id === directPid) &&
                  ((p.sku || '').trim().toLowerCase() === rawSku ||
                    (p.part_no || '').trim().toLowerCase() === rawSku)
              );
              if (childMatch) return childMatch.id;
            }
            const skuMatch = list.find(
              (p) =>
                !p.is_deleted &&
                ((p.sku || '').trim().toLowerCase() === rawSku ||
                  (p.part_no || '').trim().toLowerCase() === rawSku)
            );
            if (skuMatch) return skuMatch.id;
          }
        }
      }
    }
  } catch (_) {}

  return directPid;
}

export function extractEffectiveStockRequirements(
  lineItems: LineItem[],
  designatedWinningOption?: string,
  includeAllConfirmedOptions: boolean = false
): Array<{ product_id: string; quantity: number; description: string }> {
  const aggregated = new Map<string, { quantity: number; description: string }>();

  for (const item of lineItems || []) {
    if ((item as any).is_optional) {
      continue;
    }
    const itemOpt = item.option || item.item_option || item.option_designation;
    if (includeAllConfirmedOptions) {
      const optLower = (itemOpt || '').trim().toLowerCase();
      if (optLower.includes('optional')) {
        continue;
      }
    } else if (!isOptionActiveForInventoryAndBaseline(itemOpt, designatedWinningOption)) {
      continue;
    }

    const parentQty = Math.max(0, Number(item.quantity) || 0);
    if (parentQty <= 0) continue;

    const hasLinkedSubComponents =
      Array.isArray(item.sub_components) &&
      item.sub_components.some((sub) => Boolean(resolveCatalogProductIdSync(sub as any)));

    if (hasLinkedSubComponents && item.sub_components) {
      for (const sub of item.sub_components) {
        const resolvedSubPid = resolveCatalogProductIdSync(sub as any);
        if (!resolvedSubPid) continue;
        const totalSubQty = resolveSubComponentStockQty(sub, parentQty);
        if (totalSubQty <= 0) continue;
        const existing = aggregated.get(resolvedSubPid);
        aggregated.set(resolvedSubPid, {
          quantity: (existing?.quantity || 0) + totalSubQty,
          description: existing?.description || sub.item_name || item.item_name || item.description || 'BOM Sub-Component',
        });
      }
    } else {
      const resolvedItemPid = resolveCatalogProductIdSync(item as any);
      if (resolvedItemPid) {
        const existing = aggregated.get(resolvedItemPid);
        aggregated.set(resolvedItemPid, {
          quantity: (existing?.quantity || 0) + parentQty,
          description: existing?.description || item.item_name || item.description || 'Product',
        });
      }
    }
  }

  return Array.from(aggregated.entries()).map(([product_id, data]) => ({
    product_id,
    quantity: data.quantity,
    description: data.description,
  }));
}

export function isWonStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s === 'won' ||
    s === 'order received' ||
    s === 'won / approved' ||
    s.includes('won') ||
    s.includes('approved') ||
    s.includes('order received')
  );
}

export function isLostOrCancelledStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return (
    s === 'lost' ||
    s === 'lost / cancelled' ||
    s === 'cancelled po' ||
    s === 'dead' ||
    s.includes('lost') ||
    s.includes('cancelled')
  );
}

/**
 * Reads all active line items (and linked BOM sub-components) in the enquiry having a product_id.
 * For each matching product where is_inventoried === true:
 * increments stock_reserved by required quantity and records a STOCK_RESERVE movement.
 */
export async function reserveEnquiryStock(
  enquiry: Enquiry,
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string },
  forceOptionChange: boolean = false
): Promise<ReservationResult> {
  if (enquiry.stock_reserved && !forceOptionChange) {
    return {
      success: true,
      reservedCount: 0,
      skippedCount: 0,
      details: [],
      shortages: []
    };
  }

  const lineItems: LineItem[] = enquiry.line_items || [];
  const requirements = extractEffectiveStockRequirements(lineItems, enquiry.proposal_option);
  const result: ReservationResult = {
    success: true,
    reservedCount: 0,
    skippedCount: 0,
    details: [],
    shortages: []
  };

  const wsId = enquiry.workspace_id || (enquiry as any).workspaceId || 'default';
  const nowIso = new Date().toISOString();
  const userName =
    user?.full_name ||
    (user as any)?.username ||
    (user as any)?.name ||
    (user as any)?.email ||
    'System';
  const userUid = user?.uid;

  const runningReservedMap = new Map<string, number>();

  for (const reqItem of requirements) {
    if (!reqItem.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      const prodSnap = await safeGetDoc('products', reqItem.product_id);

      if (!prodSnap || !prodSnap.exists()) {
        result.skippedCount++;
        continue;
      }

      const prodData = prodSnap.data() as Product;

      if (!prodData.is_inventoried) {
        result.skippedCount++;
        continue;
      }

      const qty = Number(reqItem.quantity) || 0;
      if (qty <= 0) {
        result.skippedCount++;
        continue;
      }

      const currentReserved = runningReservedMap.has(reqItem.product_id)
        ? runningReservedMap.get(reqItem.product_id)!
        : Number(prodData.stock_reserved) || 0;
      const currentOnHand = Number(prodData.stock_on_hand) || 0;
      const newReserved = currentReserved + qty;
      runningReservedMap.set(reqItem.product_id, newReserved);

      await safeUpdateDoc('products', reqItem.product_id, {
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

      await MetadataRepository.upsertLocalProduct({
        ...prodData,
        id: reqItem.product_id,
        stock_reserved: newReserved,
        updatedAt: nowIso
      }).catch(() => {});

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: reqItem.product_id,
        product_name: prodData.name || reqItem.description || 'Product',
        movement_type: 'STOCK_RESERVE',
        quantity: qty,
        previous_on_hand: currentOnHand,
        new_on_hand: currentOnHand,
        reference_type: 'ENQUIRY',
        reference_id: enquiry.id,
        reference_number: enquiry.quote_ref_no || (enquiry as any).enquiry_number || enquiry.id,
        reason_notes: `Stock reserved for won enquiry: ${enquiry.quote_ref_no || enquiry.id}`,
        created_at: nowIso,
        created_by_uid: userUid,
        created_by_name: userName
      };
      await safeAddDoc('stock_movements', movement);

      result.reservedCount++;
      result.details.push({
        productId: reqItem.product_id,
        quantity: qty,
        newReserved
      });
    } catch (err) {
      console.warn(`[reserveEnquiryStock] Failed reserving product ${reqItem.product_id}:`, err);
    }
  }

  if (enquiry.id && result.reservedCount > 0) {
    await safeUpdateDoc('enquiries', enquiry.id, {
      stock_reserved: true,
      stock_reserved_at: nowIso,
      updatedAt: nowIso
    }).catch(() => {});
  }

  return result;
}

/**
 * Reverses stock reservation: decrements stock_reserved and records STOCK_RELEASE movements.
 */
export async function releaseEnquiryStock(
  enquiry: Enquiry,
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string },
  includeAllConfirmedOptions: boolean = false
): Promise<ReleaseResult> {
  const lineItems: LineItem[] = enquiry.line_items || [];
  const requirements = extractEffectiveStockRequirements(
    lineItems,
    enquiry.proposal_option,
    includeAllConfirmedOptions
  );
  const result: ReleaseResult = {
    success: true,
    releasedCount: 0,
    skippedCount: 0,
    details: []
  };

  const wsId = enquiry.workspace_id || (enquiry as any).workspaceId || 'default';
  const nowIso = new Date().toISOString();
  const userName =
    user?.full_name ||
    (user as any)?.username ||
    (user as any)?.name ||
    (user as any)?.email ||
    'System';
  const userUid = user?.uid;

  for (const reqItem of requirements) {
    if (!reqItem.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      const prodSnap = await safeGetDoc('products', reqItem.product_id);

      if (!prodSnap || !prodSnap.exists()) {
        result.skippedCount++;
        continue;
      }

      const prodData = prodSnap.data() as Product;
      if (!prodData.is_inventoried) {
        result.skippedCount++;
        continue;
      }

      const qty = Number(reqItem.quantity) || 0;
      if (qty <= 0) {
        result.skippedCount++;
        continue;
      }

      const currentReserved = Number(prodData.stock_reserved) || 0;
      const currentOnHand = Number(prodData.stock_on_hand) || 0;
      const newReserved = Math.max(0, currentReserved - qty);

      await safeUpdateDoc('products', reqItem.product_id, {
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

      await MetadataRepository.upsertLocalProduct({
        ...prodData,
        id: reqItem.product_id,
        stock_reserved: newReserved,
        updatedAt: nowIso
      }).catch(() => {});

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: reqItem.product_id,
        product_name: prodData.name || reqItem.description || 'Product',
        movement_type: 'STOCK_RELEASE',
        quantity: qty,
        previous_on_hand: currentOnHand,
        new_on_hand: currentOnHand,
        reference_type: 'ENQUIRY',
        reference_id: enquiry.id,
        reference_number: enquiry.quote_ref_no || (enquiry as any).enquiry_number || enquiry.id,
        reason_notes: `Stock released (enquiry status transition): ${enquiry.quote_ref_no || enquiry.id}`,
        created_at: nowIso,
        created_by_uid: userUid,
        created_by_name: userName
      };
      await safeAddDoc('stock_movements', movement);

      result.releasedCount++;
      result.details.push({
        productId: reqItem.product_id,
        quantity: qty,
        newReserved
      });
    } catch (err) {
      console.warn(`[releaseEnquiryStock] Failed releasing product ${reqItem.product_id}:`, err);
    }
  }

  if (enquiry.id && result.releasedCount > 0) {
    await safeUpdateDoc('enquiries', enquiry.id, {
      stock_reserved: false,
      stock_reserved_at: null,
      updatedAt: nowIso
    }).catch(() => {});
  }

  return result;
}

export interface DispatchResult {
  success: boolean;
  dispatchedCount: number;
  skippedCount: number;
  details: {
    productId: string;
    productName: string;
    quantity: number;
    newOnHand: number;
    newReserved: number;
  }[];
}

/**
 * Dispatches a project's stock:
 * Decrements both stock_on_hand and stock_reserved for inventoried line items (including linked BOM sub-components),
 * and appends immutable STOCK_OUT audit records in stock_movements.
 */
export async function dispatchProjectStock(
  project: Project,
  user?: any
): Promise<DispatchResult> {
  if ((project as any).stock_deducted) {
    return {
      success: true,
      dispatchedCount: 0,
      skippedCount: 0,
      details: []
    };
  }
  const lineItems: LineItem[] = project.line_items || [];
  const requirements = extractEffectiveStockRequirements(lineItems, undefined, true);
  const result: DispatchResult = {
    success: true,
    dispatchedCount: 0,
    skippedCount: 0,
    details: []
  };

  const wsId = project.workspace_id || (project as any).workspaceId || 'default';
  const nowIso = new Date().toISOString();
  const userName =
    user?.displayName ||
    user?.full_name ||
    user?.name ||
    user?.username ||
    user?.email ||
    'System';
  const userUid = user?.uid;

  // Determine if this project or its source enquiry actually holds an active stock reservation
  // so dispatching an unreserved project never subtracts from other enquiries' stock_reserved!
  let hasActiveReservation = Boolean((project as any).stock_reserved);
  const enqReservedQtyByProduct = new Map<string, number>();

  if (project.enquiry_id) {
    try {
      const enqSnap = await safeGetDoc('enquiries', project.enquiry_id);
      if (enqSnap && enqSnap.exists()) {
        const enqData = enqSnap.data() as Enquiry;
        if (enqData.stock_reserved) {
          hasActiveReservation = true;
          const enqReqs = extractEffectiveStockRequirements(
            enqData.line_items || [],
            enqData.proposal_option
          );
          for (const er of enqReqs) {
            if (er.product_id) {
              enqReservedQtyByProduct.set(
                er.product_id,
                (enqReservedQtyByProduct.get(er.product_id) || 0) + (Number(er.quantity) || 0)
              );
            }
          }
        }
      }
    } catch (_) {}
  }

  for (const reqItem of requirements) {
    if (!reqItem.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      const prodSnap = await safeGetDoc('products', reqItem.product_id);

      if (!prodSnap || !prodSnap.exists()) {
        result.skippedCount++;
        continue;
      }

      const prodData = prodSnap.data() as Product;
      if (!prodData.is_inventoried) {
        result.skippedCount++;
        continue;
      }

      const qty = Number(reqItem.quantity) || 0;
      if (qty <= 0) {
        result.skippedCount++;
        continue;
      }

      const currentOnHand = Number(prodData.stock_on_hand) || 0;
      const currentReserved = Number(prodData.stock_reserved) || 0;

      const newOnHand = Math.max(0, currentOnHand - qty);
      const maxReservedToRelease = hasActiveReservation
        ? enqReservedQtyByProduct.has(reqItem.product_id)
          ? Math.min(qty, enqReservedQtyByProduct.get(reqItem.product_id)!)
          : !project.enquiry_id && Boolean((project as any).stock_reserved)
          ? qty
          : 0
        : 0;
      const newReserved = Math.max(0, currentReserved - maxReservedToRelease);

      await safeUpdateDoc('products', reqItem.product_id, {
        stock_on_hand: newOnHand,
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

      await MetadataRepository.upsertLocalProduct({
        ...prodData,
        id: reqItem.product_id,
        stock_on_hand: newOnHand,
        stock_reserved: newReserved,
        updatedAt: nowIso
      }).catch(() => {});

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: reqItem.product_id,
        product_name: prodData.name || reqItem.description || 'Product',
        movement_type: 'STOCK_OUT',
        quantity: qty,
        previous_on_hand: currentOnHand,
        new_on_hand: newOnHand,
        reference_type: 'PROJECT',
        reference_id: project.id,
        reference_number: project.project_number,
        reason_notes: `Stock dispatched and delivered for project: ${project.project_number}`,
        created_at: nowIso,
        created_by_uid: userUid,
        created_by_name: userName
      };
      await safeAddDoc('stock_movements', movement);

      result.dispatchedCount++;
      result.details.push({
        productId: reqItem.product_id,
        productName: prodData.name || reqItem.description || 'Product',
        quantity: qty,
        newOnHand,
        newReserved
      });
    } catch (err) {
      console.warn(`[dispatchProjectStock] Failed dispatching product ${reqItem.product_id}:`, err);
    }
  }

  const hasDeductedPhysicalStock = result.dispatchedCount > 0;
  if (hasDeductedPhysicalStock && hasActiveReservation && project.enquiry_id) {
    await safeUpdateDoc('enquiries', project.enquiry_id, {
      stock_reserved: false,
      updatedAt: nowIso
    }).catch(() => {});
  }
  if (project.id) {
    await safeUpdateDoc('projects', project.id, {
      status: 'Delivered',
      dispatched_at: nowIso,
      stock_deducted: hasDeductedPhysicalStock,
      dispatched_items_count: result.dispatchedCount,
      fulfillment_type: hasDeductedPhysicalStock ? 'WAREHOUSE_DISPATCH' : 'SERVICE_FULFILLMENT',
      updated_at: nowIso
    }).catch((err) => {
      console.warn('Failed to update project dispatch status:', err);
    });
  }

  return result;
}

export interface GrnResult {
  success: boolean;
  movementId?: string;
  previousOnHand: number;
  newOnHand: number;
  movement?: StockMovement;
  error?: string;
}

/**
 * Stage 4: Process Inbound Goods Receipt Note (GRN)
 * Increments stock_on_hand, optionally updates storage_location and cost_price on the product,
 * and records an immutable STOCK_IN movement in stock_movements.
 */
export async function processStockGrn(
  data: GrnReceiptData,
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string }
): Promise<GrnResult> {
  const wsId = data.workspace_id || 'default';
  const nowIso = new Date().toISOString();
  const userName =
    user?.full_name ||
    (user as any)?.username ||
    (user as any)?.name ||
    (user as any)?.email ||
    'System';
  const userUid = user?.uid;

  try {
    if (!data.product_id) {
      throw new Error('Product ID is required to receive stock.');
    }
    const prodSnap = await safeGetDoc('products', data.product_id);
    let prodData: Product | null = null;

    if (prodSnap && prodSnap.exists()) {
      prodData = { id: prodSnap.id, ...(prodSnap.data() as Product) };
    } else {
      prodData = await getProductLiveOrLocal(data.product_id);
    }

    if (!prodData || !(prodData.name || prodData.description || prodData.sku)) {
      throw new Error(`Catalog product (${data.product_id}) was not found. Cannot process GRN on a non-existent product.`);
    }

    const previousOnHand = Number(prodData.stock_on_hand) || 0;

    const qty = Number(data.quantity) || 0;
    if (qty <= 0) {
      throw new Error('Received quantity must be greater than zero.');
    }

    const newOnHand = previousOnHand + qty;
    const unitCost = Number(data.unit_cost) || 0;
    const totalCost = unitCost * qty;

    // Build update payload for the product document (auto-enable stock tracking on GRN)
    const updatePayload: Partial<Product> & { updatedAt: string } = {
      is_inventoried: true,
      stock_on_hand: newOnHand,
      last_grn_ref: data.grn_number,
      updatedAt: nowIso
    };

    if (unitCost > 0) {
      updatePayload.last_landed_cost = unitCost;
    }

    if (data.storage_location && data.storage_location.trim()) {
      updatePayload.storage_location = data.storage_location.trim();
    }

    if (data.update_cost_price && unitCost > 0) {
      updatePayload.cost_price = unitCost;
    }

    await safeUpdateDoc('products', data.product_id, updatePayload);
    await MetadataRepository.upsertLocalProduct({
      ...prodData,
      ...updatePayload,
      id: data.product_id
    }).catch(() => {});

    // Build immutable STOCK_IN audit record
    const movement: StockMovement = {
      workspace_id: wsId,
      product_id: data.product_id,
      product_name: data.product_name || prodData?.name || prodData?.description || 'Product',
      movement_type: 'STOCK_IN',
      quantity: qty,
      previous_on_hand: previousOnHand,
      new_on_hand: newOnHand,
      reference_type: 'PO',
      reference_number: data.grn_number,
      reason_notes: data.notes || `Inbound GRN: ${data.grn_number} from ${data.supplier_name || 'Supplier'}`,
      created_at: nowIso,
      created_by_uid: userUid,
      created_by_name: userName,
      unit_cost: unitCost,
      total_cost: totalCost,
      supplier_id: data.supplier_id,
      supplier_name: data.supplier_name,
      delivery_note_ref: data.delivery_note_ref,
      grn_number: data.grn_number,
      received_date: data.received_date || nowIso.split('T')[0]
    };

    const docRef = await safeAddDoc('stock_movements', movement);
    const movementId = docRef?.id;

    return {
      success: true,
      movementId,
      previousOnHand,
      newOnHand,
      movement
    };
  } catch (err: any) {
    console.error('[processStockGrn] Failed receiving stock:', err);
    return {
      success: false,
      previousOnHand: 0,
      newOnHand: 0,
      error: err?.message || 'Failed to process stock receipt'
    };
  }
}

/**
 * Processes a manual Stock Adjustment (Opening Stock, Physical Recount, Write-Off / Damage, or Manual Addition).
 * Automatically enables `is_inventoried: true` on the product and logs an immutable `ADJUSTMENT` record.
 */
export async function processStockAdjustment(
  data: StockAdjustmentData,
  user?: UserProfile | any
): Promise<GrnResult> {
  const wsId = data.workspace_id || 'default';
  const userUid = user?.uid || user?.id || 'system';
  const userName = user?.username || user?.full_name || user?.email || 'System';
  const nowIso = new Date().toISOString();

  try {
    if (!data.product_id) {
      throw new Error('Product ID is required to adjust stock.');
    }
    const prodSnap = await safeGetDoc('products', data.product_id);
    let prodData: Product | null = null;

    if (prodSnap && prodSnap.exists()) {
      prodData = { id: prodSnap.id, ...(prodSnap.data() as Product) };
    } else {
      prodData = await getProductLiveOrLocal(data.product_id);
    }

    if (!prodData || !(prodData.name || prodData.description || prodData.sku)) {
      throw new Error(`Catalog product (${data.product_id}) was not found. Cannot adjust stock on a non-existent product.`);
    }

    const previousOnHand = Number(prodData.stock_on_hand) || 0;

    const inputQty = Number(data.target_or_delta_qty);
    if (isNaN(inputQty) || inputQty < 0) {
      throw new Error('Please enter a valid non-negative quantity.');
    }

    let newOnHand = previousOnHand;
    let deltaQty = 0;

    if (data.adjustment_mode === 'OPENING_STOCK' || data.adjustment_mode === 'RECOUNT') {
      newOnHand = inputQty;
      deltaQty = newOnHand - previousOnHand;
    } else if (data.adjustment_mode === 'WRITE_OFF') {
      if (inputQty <= 0) throw new Error('Write-off quantity must be greater than zero.');
      newOnHand = Math.max(0, previousOnHand - inputQty);
      deltaQty = newOnHand - previousOnHand;
    } else if (data.adjustment_mode === 'ADDITION') {
      if (inputQty <= 0) throw new Error('Addition quantity must be greater than zero.');
      newOnHand = previousOnHand + inputQty;
      deltaQty = inputQty;
    }

    const updatePayload: Partial<Product> & { updatedAt: string } = {
      is_inventoried: true,
      stock_on_hand: newOnHand,
      updatedAt: nowIso
    };

    if (data.storage_location && data.storage_location.trim()) {
      updatePayload.storage_location = data.storage_location.trim();
    }

    if (typeof data.unit_cost === 'number' && data.unit_cost > 0) {
      updatePayload.cost_price = data.unit_cost;
    }

    await safeUpdateDoc('products', data.product_id, updatePayload);
    await MetadataRepository.upsertLocalProduct({
      ...prodData,
      ...updatePayload,
      id: data.product_id
    }).catch(() => {});

    const modeLabels: Record<string, string> = {
      OPENING_STOCK: 'Opening Stock Balance',
      RECOUNT: 'Physical Cycle Recount',
      WRITE_OFF: 'Damage / Write-Off Deduction',
      ADDITION: 'Manual Stock Addition'
    };

    const refNum = data.reference_number?.trim() || `ADJ-${nowIso.slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const reasonText = data.reason_notes?.trim()
      ? `${modeLabels[data.adjustment_mode] || 'Stock Adjustment'}: ${data.reason_notes.trim()}`
      : `${modeLabels[data.adjustment_mode] || 'Stock Adjustment'} (${previousOnHand} → ${newOnHand})`;

    const movement: StockMovement = {
      workspace_id: wsId,
      product_id: data.product_id,
      product_name: data.product_name || prodData?.name || prodData?.description || 'Product',
      movement_type: 'ADJUSTMENT',
      quantity: deltaQty,
      previous_on_hand: previousOnHand,
      new_on_hand: newOnHand,
      reference_type: 'MANUAL',
      reference_number: refNum,
      reason_notes: reasonText,
      created_at: nowIso,
      created_by_uid: userUid,
      created_by_name: userName,
      unit_cost: data.unit_cost
    };

    const docRef = await safeAddDoc('stock_movements', movement);

    return {
      success: true,
      movementId: docRef?.id,
      previousOnHand,
      newOnHand,
      movement
    };
  } catch (err: any) {
    console.error('[processStockAdjustment] Failed adjusting stock:', err);
    return {
      success: false,
      previousOnHand: 0,
      newOnHand: 0,
      error: err?.message || 'Failed to process stock adjustment'
    };
  }
}

/**
 * Fetches recent stock movements for the given workspace, sorted newest first.
 */
export async function fetchStockMovements(workspaceId: string): Promise<StockMovement[]> {
  try {
    const snap = await safeGetDocs('stock_movements', where('workspace_id', '==', workspaceId), limit(500));
    if (!snap || snap.empty) return [];
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockMovement));
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } catch (err) {
    console.warn('[fetchStockMovements] Failed fetching movements:', err);
    return [];
  }
}

const stockMovementsCache = new Map<string, StockMovement[]>();
const stockMovementsSubscribers = new Map<string, Set<(movements: StockMovement[]) => void>>();
const stockMovementsUnsubs = new Map<string, () => void>();
let isStockMovementsPaused =
  typeof window !== 'undefined' &&
  (window.localStorage?.getItem('omni_realtime_sync') === 'false' ||
    window.localStorage?.getItem('sas_quota_saver_mode') === 'true' ||
    (window.self !== window.top &&
      window.sessionStorage?.getItem('omni_iframe_explicit_live_sync') !== 'true'));

export function pauseStockMovementsSubscriptions(): void {
  isStockMovementsPaused = true;
  for (const [, unsub] of stockMovementsUnsubs.entries()) {
    try {
      unsub();
    } catch (_) {}
  }
  stockMovementsUnsubs.clear();
}

export function resumeStockMovementsSubscriptions(workspaceId: string): void {
  isStockMovementsPaused = false;
  const wsId = workspaceId || 'ws_default';
  const subs = stockMovementsSubscribers.get(wsId);
  if (!subs || subs.size === 0) return;
  if (stockMovementsUnsubs.has(wsId)) return;

  const cached = stockMovementsCache.get(wsId);
  if (cached) {
    subs.forEach((cb) => {
      try {
        cb([...cached]);
      } catch (_) {}
    });
  }

  const unsubHolder = subscribeStockMovements(wsId, () => {});
  unsubHolder();
}

/**
 * Subscribes to realtime updates of stock movements for the given workspace,
 * respecting quota-saver mode, idle pause state, and sharing a sticky singleton listener per workspaceId.
 */
export function subscribeStockMovements(
  workspaceId: string,
  callback: (movements: StockMovement[]) => void
): () => void {
  const wsId = workspaceId || 'ws_default';
  if (!stockMovementsSubscribers.has(wsId)) {
    stockMovementsSubscribers.set(wsId, new Set());
  }
  const subs = stockMovementsSubscribers.get(wsId)!;
  subs.add(callback);

  const cached = stockMovementsCache.get(wsId);
  if (cached) {
    callback([...cached]);
  }

  const isQuotaSaver =
    typeof window !== 'undefined' &&
    (window.localStorage?.getItem('sas_quota_saver_mode') === 'true' ||
      window.localStorage?.getItem('omni_realtime_sync') === 'false');

  if (isQuotaSaver || isStockMovementsPaused || isQuotaCircuitBroken() || !auth.currentUser) {
    if (!cached && !isStockMovementsPaused && !isQuotaCircuitBroken() && auth.currentUser) {
      fetchStockMovements(wsId)
        .then((list) => {
          stockMovementsCache.set(wsId, list);
          callback(list);
        })
        .catch(() => {});
    }
    return () => {
      subs.delete(callback);
    };
  }

  if (!stockMovementsUnsubs.has(wsId)) {
    try {
      const coll = collection(db, 'stock_movements');
      const q = query(coll, where('workspace_id', '==', wsId), limit(500));
      const unsub = onSnapshot(
        q,
        (snap) => {
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockMovement));
          list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
          stockMovementsCache.set(wsId, list);
          const currentSubs = stockMovementsSubscribers.get(wsId);
          if (currentSubs) {
            currentSubs.forEach((cb) => {
              try {
                cb([...list]);
              } catch (_) {}
            });
          }
        },
        (err) => {
          console.warn('[subscribeStockMovements] listener error:', err);
        }
      );
      stockMovementsUnsubs.set(wsId, unsub);
    } catch (err) {
      console.warn('[subscribeStockMovements] setup error:', err);
    }
  }

  return () => {
    subs.delete(callback);
  };
}

async function getProductLiveOrLocal(productId: string): Promise<Product | null> {
  if (!productId) return null;
  try {
    const prodSnap = await safeGetDoc('products', productId);
    if (prodSnap && prodSnap.exists()) {
      return { id: prodSnap.id, ...(prodSnap.data() as Product) };
    }
  } catch (_) {}
  try {
    const localList = (await getFromLocalStore<Product>('products')) || [];
    const foundIdb = localList.find((p) => p.id === productId);
    if (foundIdb) return foundIdb;
  } catch (_) {}
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('omni_products');
      if (raw) {
        const parsed: Product[] = JSON.parse(raw);
        const foundLs = Array.isArray(parsed) ? parsed.find((p) => p.id === productId) : null;
        if (foundLs) return foundLs;
      }
    }
  } catch (_) {}
  return null;
}

async function resolveProductLiveOrLocal(ref?: {
  product_id?: string;
  variant_id?: string;
  sku?: string;
  part_no?: string;
  model_part_no?: string;
} | null): Promise<Product | null> {
  if (!ref) return null;
  const directPid = (ref.product_id || '').trim();
  const variantId = (ref.variant_id || '').trim();
  const rawSku = (ref.sku || ref.part_no || ref.model_part_no || '').trim().toLowerCase();

  if (variantId) {
    const byVariant = await getProductLiveOrLocal(variantId);
    if (byVariant && !byVariant.is_deleted) return byVariant;
  }

  let catalogList: Product[] = [];
  try {
    catalogList = (await getFromLocalStore<Product>('products')) || [];
  } catch (_) {}
  if (catalogList.length === 0) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem('omni_products');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) catalogList = parsed;
        }
      }
    } catch (_) {}
  }

  if (rawSku && catalogList.length > 0) {
    if (directPid) {
      const childVariant = catalogList.find(
        (p) =>
          !p.is_deleted &&
          ((p as any).variant_of === directPid || (p as any).parent_product_id === directPid) &&
          ((p.sku || '').trim().toLowerCase() === rawSku ||
            (p.part_no || '').trim().toLowerCase() === rawSku)
      );
      if (childVariant) {
        return (await getProductLiveOrLocal(childVariant.id)) || childVariant;
      }
    }
    const bySku = catalogList.find(
      (p) =>
        !p.is_deleted &&
        ((p.sku || '').trim().toLowerCase() === rawSku ||
          (p.part_no || '').trim().toLowerCase() === rawSku)
    );
    if (bySku) {
      return (await getProductLiveOrLocal(bySku.id)) || bySku;
    }
  }

  if (directPid) {
    return await getProductLiveOrLocal(directPid);
  }
  return null;
}

/**
 * Processes a PO-linked Goods Receipt Note (GRN) across multiple PO line items with Landed Cost allocation.
 * - Updates each catalog product's stock_on_hand and last_landed_cost WITHOUT overwriting base catalog cost_price
 *   (unless update_base_catalog_cost is explicitly checked).
 * - Creates STOCK_IN movements linked to po_id, po_ref, and grn_number.
 * - Updates the PO document's line items (qty_received, qty_pending, allocated_freight_cost, landed_unit_cost)
 *   and purchase_order_metadata (receiving_status: Pending Receipt -> Partially Received -> Fully Received).
 */
export async function processPoBatchGrn(
  input: PoGrnBatchReceiptInput,
  poDoc: Quotation,
  user?: UserProfile | null
): Promise<{
  success: boolean;
  updatedPo?: Quotation;
  receivingStatus?: PurchaseOrderReceivingStatus;
  movementsCreated: number;
  updatedProducts: Array<{ productId: string; newOnHand: number; landedUnitCost: number; updatedBaseCost?: number }>;
  error?: string;
}> {
  const nowIso = new Date().toISOString();
  const userName = user?.full_name || (user as any)?.username || user?.email || 'Warehouse Operator';
  const userUid = user?.uid || 'system';
  const wsId = input.workspace_id || poDoc.workspace_id || poDoc.workspaceId || 'ws_default';

  try {
    const activeLinesToReceive = (input.lines || []).filter((l) => Number(l.qty_receiving_now) > 0);
    if (activeLinesToReceive.length === 0) {
      return {
        success: false,
        movementsCreated: 0,
        updatedProducts: [],
        error: 'Please enter a received quantity greater than 0 for at least one PO line item.'
      };
    }

    let movementsCreated = 0;
    const updatedProducts: Array<{ productId: string; newOnHand: number; landedUnitCost: number; updatedBaseCost?: number }> = [];

    const recordCatalogProductStockIn = async (
      prodData: Product,
      qtyReceivedNow: number,
      poUnitCost: number,
      allocatedFreight: number,
      computedLandedUnit: number,
      itemName?: string,
      storageLocation?: string
    ) => {
      const targetProdId = prodData.id;
      const prevOnHand = Number(prodData?.stock_on_hand) || 0;
      const newOnHand = prevOnHand + qtyReceivedNow;

      const productUpdate: Partial<Product> & { updatedAt: string } = {
        is_inventoried: true,
        stock_on_hand: newOnHand,
        last_landed_cost: computedLandedUnit,
        last_grn_ref: input.grn_number,
        updatedAt: nowIso
      };

      if (storageLocation?.trim()) {
        productUpdate.storage_location = storageLocation.trim();
      }

      if (input.update_base_catalog_cost && poUnitCost > 0) {
        productUpdate.cost_price = poUnitCost;
      }

      await safeUpdateDoc('products', targetProdId, productUpdate);
      await MetadataRepository.upsertLocalProduct({
        ...(prodData || {}),
        ...productUpdate,
        id: targetProdId
      }).catch(() => {});
      updatedProducts.push({
        productId: targetProdId,
        newOnHand,
        landedUnitCost: computedLandedUnit,
        updatedBaseCost: input.update_base_catalog_cost && poUnitCost > 0 ? poUnitCost : undefined
      });

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: targetProdId,
        product_name: itemName || prodData?.name || prodData?.description || 'PO Item',
        movement_type: 'STOCK_IN',
        quantity: qtyReceivedNow,
        previous_on_hand: prevOnHand,
        new_on_hand: newOnHand,
        reference_type: 'PO',
        reference_id: input.po_id,
        reference_number: input.grn_number,
        po_id: input.po_id,
        po_ref: input.po_ref,
        grn_number: input.grn_number,
        received_date: input.received_date,
        supplier_id: input.supplier_id,
        supplier_name: input.supplier_name,
        delivery_note_ref: input.delivery_note_ref,
        unit_cost: poUnitCost,
        allocated_freight_cost: allocatedFreight,
        landed_unit_cost: computedLandedUnit,
        total_cost: QuotationRepository.roundCurrency(computedLandedUnit * qtyReceivedNow),
        reason_notes: `PO GRN Receipt (${input.grn_number}) against ${input.po_ref}${
          allocatedFreight > 0 ? ` • Landed Unit Cost: ${computedLandedUnit.toFixed(2)}` : ''
        }${input.notes ? ` • ${input.notes}` : ''}`,
        created_at: nowIso,
        created_by_uid: userUid,
        created_by_name: userName
      };

      await safeAddDoc('stock_movements', movement);
      movementsCreated++;
    };

    for (const line of activeLinesToReceive) {
      const qtyReceivedNow = Number(line.qty_receiving_now) || 0;
      const poUnitCost = QuotationRepository.roundCurrency(Number(line.po_unit_cost) || 0);
      const allocatedFreight = QuotationRepository.roundCurrency(Number(line.allocated_freight_cost) || 0);
      const computedLandedUnit =
        line.manual_landed_cost_override !== undefined && line.manual_landed_cost_override >= 0
          ? QuotationRepository.roundCurrency(Number(line.manual_landed_cost_override))
          : qtyReceivedNow > 0
          ? QuotationRepository.roundCurrency(poUnitCost + allocatedFreight / qtyReceivedNow)
          : poUnitCost;

      const parentPoIdx = (line as any).po_line_index !== undefined ? Number((line as any).po_line_index) : line.line_index;
      const subCompIdx = (line as any).sub_component_index;
      const poLine = (poDoc.line_items || [])[parentPoIdx];

      // Case 1: unexpanded BOM parent PO line received directly -> expand its sub_components
      if (
        subCompIdx === undefined &&
        poLine &&
        Array.isArray(poLine.sub_components) &&
        poLine.sub_components.length > 0
      ) {
        let handledAnySub = false;
        for (const sub of poLine.sub_components) {
          const subProd = await resolveProductLiveOrLocal({
            product_id: sub.product_id,
            variant_id: (sub as any).variant_id,
            sku: sub.sku || (sub as any).part_no || sub.model_part_no
          });
          if (!subProd) continue;
          const subMult = Math.max(1, Number(sub.quantity) || 1);
          const subQtyReceived = qtyReceivedNow * subMult;
          const subUnitCost = QuotationRepository.roundCurrency(
            Number(sub.cost_price ?? sub.unit_price) || poUnitCost / Math.max(1, poLine.sub_components.length)
          );
          await recordCatalogProductStockIn(
            subProd,
            subQtyReceived,
            subUnitCost,
            0,
            subUnitCost,
            sub.item_name || subProd.name,
            line.storage_location
          );
          handledAnySub = true;
        }
        if (handledAnySub) {
          continue;
        }
      }

      // Case 2: standard line or expanded BOM sub-component line
      const resolvedProd = await resolveProductLiveOrLocal({
        product_id: line.product_id,
        variant_id: (line as any).variant_id || (subCompIdx === undefined ? (poLine as any)?.variant_id : undefined),
        sku: line.sku || (line as any).part_no || (subCompIdx === undefined ? (poLine as any)?.part_no || (poLine as any)?.sku : undefined)
      });

      if (resolvedProd) {
        await recordCatalogProductStockIn(
          resolvedProd,
          qtyReceivedNow,
          poUnitCost,
          allocatedFreight,
          computedLandedUnit,
          line.item_name,
          line.storage_location
        );
      } else {
        // Custom / non-catalog PO line item: record traceable STOCK_IN receipt log without altering catalog product doc
        const movement: StockMovement = {
          workspace_id: wsId,
          product_id: 'custom_po_item',
          product_name: line.item_name || 'Custom PO Item',
          movement_type: 'STOCK_IN',
          quantity: qtyReceivedNow,
          previous_on_hand: 0,
          new_on_hand: qtyReceivedNow,
          reference_type: 'PO',
          reference_id: input.po_id,
          reference_number: input.grn_number,
          po_id: input.po_id,
          po_ref: input.po_ref,
          grn_number: input.grn_number,
          received_date: input.received_date,
          supplier_id: input.supplier_id,
          supplier_name: input.supplier_name,
          delivery_note_ref: input.delivery_note_ref,
          unit_cost: poUnitCost,
          allocated_freight_cost: allocatedFreight,
          landed_unit_cost: computedLandedUnit,
          total_cost: QuotationRepository.roundCurrency(computedLandedUnit * qtyReceivedNow),
          reason_notes: `PO GRN Receipt (${input.grn_number}) against ${input.po_ref} (Custom Line)${
            allocatedFreight > 0 ? ` • Landed Unit Cost: ${computedLandedUnit.toFixed(2)}` : ''
          }${input.notes ? ` • ${input.notes}` : ''}`,
          created_at: nowIso,
          created_by_uid: userUid,
          created_by_name: userName
        };
        await safeAddDoc('stock_movements', movement);
        movementsCreated++;
      }
    }

    // Update PO line items and receiving status
    const receiptByLineIdx = new Map<number, typeof activeLinesToReceive[number]>();
    const subReceiptsByParentIdx = new Map<number, Map<number, typeof activeLinesToReceive[number]>>();
    activeLinesToReceive.forEach((l) => {
      const parentIdx = (l as any).po_line_index !== undefined ? Number((l as any).po_line_index) : l.line_index;
      const subIdx = (l as any).sub_component_index;
      if (subIdx !== undefined && subIdx !== null) {
        const subMap = subReceiptsByParentIdx.get(parentIdx) || new Map<number, typeof activeLinesToReceive[number]>();
        subMap.set(Number(subIdx), l);
        subReceiptsByParentIdx.set(parentIdx, subMap);
      } else {
        receiptByLineIdx.set(parentIdx, l);
      }
    });

    let totalOrderedAll = 0;
    let totalReceivedAll = 0;

    const updatedPoLineItems = (poDoc.line_items || []).map((item, idx) => {
      const ordered = Math.max(0, Number(item.qty_ordered ?? item.quantity ?? (item as any).qty) || 0);
      const prevReceived = Math.max(0, Number(item.qty_received) || 0);
      const matchedInput = receiptByLineIdx.get(idx);
      const matchedSubMap = subReceiptsByParentIdx.get(idx);

      if (matchedSubMap && Array.isArray(item.sub_components) && item.sub_components.length > 0) {
        let addedFreightForParent = 0;
        const nextSubs = item.sub_components.map((sub, sIdx) => {
          const subPerSet = Math.max(1, Number(sub.quantity) || 1);
          const subOrderedTotal = ordered * subPerSet;
          const prevSubRec = Math.max(
            0,
            Number((sub as any).qty_received ?? prevReceived * subPerSet) || 0
          );
          const subInput = matchedSubMap.get(sIdx);
          const addSubRec = subInput ? Math.max(0, Number(subInput.qty_receiving_now) || 0) : 0;
          if (subInput) {
            addedFreightForParent += Number(subInput.allocated_freight_cost) || 0;
          }
          const nextSubRec = prevSubRec + addSubRec;
          return {
            ...sub,
            qty_ordered: subOrderedTotal,
            qty_received: nextSubRec,
            qty_pending: Math.max(0, subOrderedTotal - nextSubRec)
          };
        });

        const subOrderedSum = nextSubs.reduce((s, sub) => s + (Number((sub as any).qty_ordered) || 0), 0);
        const subReceivedSum = nextSubs.reduce((s, sub) => s + (Number((sub as any).qty_received) || 0), 0);
        totalOrderedAll += subOrderedSum;
        totalReceivedAll += subReceivedSum;

        const completedSets = nextSubs.reduce((minSets, sub) => {
          const subPerSet = Math.max(1, Number(sub.quantity) || 1);
          const setsForSub = Math.floor((Number((sub as any).qty_received) || 0) / subPerSet);
          return Math.min(minSets, setsForSub);
        }, ordered);
        const nextReceived = Math.max(prevReceived, completedSets);
        const nextPending = Math.max(0, ordered - nextReceived);
        const prevFreight = Number(item.allocated_freight_cost) || 0;
        const newFreight = QuotationRepository.roundCurrency(prevFreight + addedFreightForParent);

        return {
          ...item,
          sub_components: nextSubs,
          quantity: ordered,
          qty_ordered: ordered,
          qty_received: nextReceived,
          qty_pending: nextPending,
          allocated_freight_cost: newFreight
        };
      }

      const addReceived = matchedInput ? Math.max(0, Number(matchedInput.qty_receiving_now) || 0) : 0;
      const nextReceived = prevReceived + addReceived;
      const nextPending = Math.max(0, ordered - nextReceived);

      totalOrderedAll += ordered;
      totalReceivedAll += nextReceived;

      if (!matchedInput) {
        return {
          ...item,
          quantity: ordered,
          qty_ordered: ordered,
          qty_received: prevReceived,
          qty_pending: nextPending
        };
      }

      const prevFreight = Number(item.allocated_freight_cost) || 0;
      const newFreight = QuotationRepository.roundCurrency(prevFreight + (Number(matchedInput.allocated_freight_cost) || 0));
      const poUnit = Number(item.unit_price) || 0;
      const landedUnit =
        matchedInput.manual_landed_cost_override !== undefined
          ? QuotationRepository.roundCurrency(Number(matchedInput.manual_landed_cost_override))
          : nextReceived > 0
          ? QuotationRepository.roundCurrency(poUnit + newFreight / nextReceived)
          : poUnit;

      return {
        ...item,
        quantity: ordered,
        qty_ordered: ordered,
        qty_received: nextReceived,
        qty_pending: nextPending,
        allocated_freight_cost: newFreight,
        manual_landed_cost_override: matchedInput.manual_landed_cost_override,
        landed_unit_cost: landedUnit
      };
    });

    const receivingStatus: PurchaseOrderReceivingStatus =
      totalReceivedAll <= 0
        ? 'Pending Receipt'
        : totalReceivedAll >= totalOrderedAll && totalOrderedAll > 0
        ? 'Fully Received'
        : 'Partially Received';

    const existingGrnRefs = poDoc.purchase_order_metadata?.linked_grn_refs || [];
    const nextGrnRefs = Array.from(new Set([...existingGrnRefs, input.grn_number].filter(Boolean)));
    const prevPoFreight = Number(poDoc.purchase_order_metadata?.freight_customs_cost) || 0;
    const nextPoFreight = QuotationRepository.roundCurrency(prevPoFreight + (Number(input.freight_customs_cost) || 0));

    const updatedPoMeta = {
      ...(poDoc.purchase_order_metadata || {}),
      receiving_status: receivingStatus,
      freight_customs_cost: nextPoFreight,
      landed_cost_allocation_mode: input.allocation_mode,
      linked_grn_refs: nextGrnRefs,
      last_grn_date: input.received_date
    };

    // Promote Draft PO status to Approved when stock receipt is confirmed
    const currentStatusLower = String(poDoc.status || '').toLowerCase();
    const nextPoStatus =
      currentStatusLower === 'draft' || !poDoc.status ? 'Approved' : poDoc.status;

    const updatedPo: Quotation = {
      ...poDoc,
      status: nextPoStatus,
      line_items: updatedPoLineItems,
      purchase_order_metadata: updatedPoMeta,
      updated_at: nowIso,
      updatedAt: nowIso
    };

    if (poDoc.id) {
      await QuotationRepository.saveQuotation(updatedPo);
    }

    return {
      success: true,
      updatedPo,
      receivingStatus,
      movementsCreated,
      updatedProducts
    };
  } catch (err: any) {
    console.error('[processPoBatchGrn] Error processing PO GRN:', err);
    return {
      success: false,
      movementsCreated: 0,
      updatedProducts: [],
      error: err?.message || 'Failed to process PO Goods Receipt'
    };
  }
}

/**
 * Deducts returned stock from warehouse (`RETURN_TO_VENDOR`) when a Material Return Note (`MRN`) is dispatched.
 * Strictly isolated from `stock_reserved` and client project delivery metrics so client numbers are never skewed.
 */
export async function processVendorReturnStockDeduction(
  returnDoc: Quotation,
  user?: UserProfile | null
): Promise<{
  success: boolean;
  deductedCount: number;
  updatedProducts: Array<{ productId: string; newOnHand: number }>;
  error?: string;
}> {
  const nowIso = new Date().toISOString();
  const userName = user?.full_name || (user as any)?.username || user?.email || 'Warehouse Operator';
  const userUid = user?.uid || 'system';
  const wsId = returnDoc.workspace_id || returnDoc.workspaceId || 'ws_default';
  const vMeta = returnDoc.vendor_return_metadata || {};
  const mrnRef =
    (vMeta as any).return_ref ||
    vMeta.mrn_ref ||
    returnDoc.formatted_quote_ref ||
    returnDoc.quote_number ||
    'MRN';
  const linkedPoId = (vMeta as any).original_po_id || vMeta.linked_po_id;
  const linkedPoRef = (vMeta as any).original_po_ref || vMeta.linked_po_ref;
  const supplierId = (vMeta as any).vendor_id || vMeta.supplier_id;
  const supplierName =
    (vMeta as any).vendor_name || vMeta.supplier_name || returnDoc.client_snapshot?.entity_name;

  if (vMeta.stock_deducted) {
    return {
      success: false,
      deductedCount: 0,
      updatedProducts: [],
      error: 'Returned stock has already been deducted for this Material Return Note.'
    };
  }

  try {
    let deductedCount = 0;
    const updatedProducts: Array<{ productId: string; newOnHand: number }> = [];

    const deductSingleResolvedProduct = async (
      prodData: Product,
      returnQty: number,
      itemName: string,
      unitCost: number
    ) => {
      if (returnQty <= 0) return;
      const targetProdId = prodData.id;
      const prevOnHand = Math.max(0, Number(prodData.stock_on_hand) || 0);
      const newOnHand = Math.max(0, prevOnHand - returnQty);

      // Update ONLY stock_on_hand (never alter stock_reserved for client orders)
      await safeUpdateDoc('products', targetProdId, {
        stock_on_hand: newOnHand,
        updatedAt: nowIso
      });
      await MetadataRepository.upsertLocalProduct({
        ...prodData,
        id: targetProdId,
        stock_on_hand: newOnHand,
        updatedAt: nowIso
      }).catch(() => {});

      updatedProducts.push({ productId: targetProdId, newOnHand });

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: targetProdId,
        product_name: itemName || prodData.name || prodData.description || 'Returned Item',
        movement_type: 'RETURN_TO_VENDOR',
        quantity: -returnQty,
        previous_on_hand: prevOnHand,
        new_on_hand: newOnHand,
        reference_type: 'MRN',
        reference_id: returnDoc.id,
        reference_number: mrnRef,
        po_id: linkedPoId,
        po_ref: linkedPoRef,
        supplier_id: supplierId,
        supplier_name: supplierName,
        unit_cost: unitCost,
        reason_notes: `Material Return to Vendor (${mrnRef})${
          vMeta.return_reason ? ` • Reason: ${vMeta.return_reason}` : ''
        }${linkedPoRef ? ` • Linked PO: ${linkedPoRef}` : ''}`,
        created_at: nowIso,
        created_by_uid: userUid,
        created_by_name: userName
      };

      await safeAddDoc('stock_movements', movement);
      deductedCount++;
    };

    for (const item of returnDoc.line_items || []) {
      const returnQty = Math.max(
        0,
        Number((item as any).return_qty ?? item.qty_returned ?? item.quantity ?? (item as any).qty) || 0
      );
      if (returnQty <= 0) continue;

      if (Array.isArray(item.sub_components) && item.sub_components.length > 0) {
        let deductedAnySub = false;
        for (const sub of item.sub_components) {
          const subProd = await resolveProductLiveOrLocal({
            product_id: sub.product_id,
            variant_id: (sub as any).variant_id,
            sku: sub.sku || (sub as any).part_no || sub.model_part_no
          });
          if (!subProd) continue;
          const subQty = Math.max(1, Number(sub.quantity) || 1) * returnQty;
          await deductSingleResolvedProduct(
            subProd,
            subQty,
            sub.item_name || subProd.name || 'Returned Sub-Component',
            Number(sub.cost_price ?? sub.unit_price) || 0
          );
          deductedAnySub = true;
        }
        if (deductedAnySub) continue;
      }

      const prodData = await resolveProductLiveOrLocal({
        product_id: item.product_id,
        variant_id: (item as any).variant_id,
        sku: (item as any).sku || item.part_no || (item as any).model_part_no
      });
      if (!prodData) continue;

      await deductSingleResolvedProduct(
        prodData,
        returnQty,
        item.item_name || prodData.name || prodData.description || 'Returned Item',
        Number(item.unit_price) || 0
      );
    }

    return {
      success: true,
      deductedCount,
      updatedProducts
    };
  } catch (err: any) {
    console.error('[processVendorReturnStockDeduction] Failed deducting vendor return stock:', err);
    return {
      success: false,
      deductedCount: 0,
      updatedProducts: [],
      error: err?.message || 'Failed to deduct returned stock'
    };
  }
}

/**
 * Reconciles physical stock_on_hand when a Purchase Order (with received quantities)
 * or Material Return Note (with deducted stock) is soft-deleted or restored.
 */
export async function reconcileProcurementDocumentStockOnLifecycleChange(
  doc: Quotation,
  action: 'soft_delete' | 'restore',
  user?: User | null
): Promise<{ adjustedCount: number; updatedProducts: Product[] }> {
  const updatedProducts: Product[] = [];
  let adjustedCount = 0;

  if (!doc || !Array.isArray(doc.line_items) || doc.line_items.length === 0) {
    return { adjustedCount: 0, updatedProducts: [] };
  }

  const isPO = doc.document_type === 'purchase_order';
  const isMRN = doc.document_type === 'material_return_note';

  if (!isPO && !isMRN) {
    return { adjustedCount: 0, updatedProducts: [] };
  }

  if (isMRN && !doc.vendor_return_metadata?.stock_deducted) {
    return { adjustedCount: 0, updatedProducts: [] };
  }

  const nowIso = new Date().toISOString();
  const userUid = user?.uid || user?.id || 'system';
  const userName = user?.displayName || user?.name || user?.email || 'System';
  const docRef = doc.formatted_quote_ref || doc.id;

  const reconcileSingleResolvedProduct = async (
    product: Product,
    targetQty: number,
    unitCost: number
  ) => {
    if (targetQty <= 0) return;
    const delta = isPO
      ? action === 'soft_delete'
        ? -targetQty
        : targetQty
      : action === 'soft_delete'
      ? targetQty
      : -targetQty;

    const prevOnHand = Number(product.stock_on_hand) || 0;
    const prevReserved = Number(product.stock_reserved) || 0;
    const newOnHand = Math.max(0, prevOnHand + delta);
    const actualDelta = newOnHand - prevOnHand;

    const updatedProduct: Product = {
      ...product,
      stock_on_hand: newOnHand,
      updated_at: nowIso
    };

    await safeUpdateDoc('products', product.id, {
      stock_on_hand: newOnHand,
      updated_at: nowIso
    });
    await MetadataRepository.upsertLocalProduct(updatedProduct).catch(() => {});
    updatedProducts.push(updatedProduct);

    const movement: Omit<StockMovement, 'id'> = {
      workspace_id: doc.workspace_id || product.workspace_id || 'default',
      product_id: product.id,
      product_code: product.product_code || product.sku || '',
      product_name: product.name || 'Catalog Item',
      movement_type: 'ADJUSTMENT',
      quantity: Math.abs(actualDelta),
      quantity_delta: actualDelta,
      previous_on_hand: prevOnHand,
      new_on_hand: newOnHand,
      previous_reserved: prevReserved,
      new_reserved: prevReserved,
      reference_type: isPO ? 'PO' : 'MRN',
      reference_id: doc.id,
      reference_number: docRef,
      unit_cost: unitCost,
      reason_notes: `${action === 'soft_delete' ? 'Soft-Delete Rollback' : 'Restore Re-Application'} for ${
        isPO ? 'Purchase Order' : 'Material Return Note'
      } (${docRef})`,
      created_at: nowIso,
      created_by_uid: userUid,
      created_by_name: userName
    };

    await safeAddDoc('stock_movements', movement);
    adjustedCount++;
  };

  for (const item of doc.line_items) {
    if (item.item_type === 'charge' || item.item_type === 'discount') continue;

    const parentTargetQty = isPO
      ? Number(item.qty_received) || 0
      : Number((item as any).return_qty ?? item.qty_returned ?? item.quantity ?? (item as any).qty) || 0;

    if (Array.isArray(item.sub_components) && item.sub_components.length > 0) {
      let reconciledAnySub = false;
      for (const sub of item.sub_components) {
        const subProd = await resolveProductLiveOrLocal({
          product_id: sub.product_id,
          variant_id: (sub as any).variant_id,
          sku: sub.sku || (sub as any).part_no || sub.model_part_no
        });
        if (!subProd) continue;
        const subMult = Math.max(1, Number(sub.quantity) || 1);
        const subTargetQty = isPO
          ? Number((sub as any).qty_received ?? parentTargetQty * subMult) || 0
          : parentTargetQty * subMult;
        if (subTargetQty <= 0) continue;
        await reconcileSingleResolvedProduct(
          subProd,
          subTargetQty,
          Number(sub.cost_price ?? sub.unit_price) || 0
        );
        reconciledAnySub = true;
      }
      if (reconciledAnySub) continue;
    }

    if (parentTargetQty <= 0) continue;

    const product = await resolveProductLiveOrLocal({
      product_id: item.product_id,
      variant_id: (item as any).variant_id,
      sku: (item as any).sku || item.part_no || (item as any).model_part_no
    });
    if (!product) continue;

    await reconcileSingleResolvedProduct(product, parentTargetQty, Number(item.unit_price) || 0);
  }

  return { adjustedCount, updatedProducts };
}
