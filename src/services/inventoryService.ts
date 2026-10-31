import {
  Enquiry,
  LineItem,
  Product,
  StockMovement,
  UserProfile,
  Project,
  GrnReceiptData,
  StockAdjustmentData,
  PoGrnBatchReceiptInput,
  Quotation,
  PurchaseOrderReceivingStatus
} from '../types';
import { safeAddDoc, safeUpdateDoc, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { MetadataRepository } from './repositories/MetadataRepository';
import { QuotationRepository } from './repositories/QuotationRepository';
import { saveToLocalStore, getFromLocalStore } from './db';
import { isOptionActiveForInventoryAndBaseline } from '../utils/compositeBomUtils';

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
export function extractEffectiveStockRequirements(
  lineItems: LineItem[],
  designatedWinningOption?: string,
  includeAllConfirmedOptions: boolean = false
): Array<{ product_id: string; quantity: number; description: string }> {
  const aggregated = new Map<string, { quantity: number; description: string }>();

  for (const item of lineItems || []) {
    const itemOpt = item.option || item.item_option || item.option_designation;
    if (includeAllConfirmedOptions) {
      const optLower = (itemOpt || '').trim().toLowerCase();
      if ((item as any).is_optional || optLower.includes('optional')) {
        continue;
      }
    } else if (!isOptionActiveForInventoryAndBaseline(itemOpt, designatedWinningOption)) {
      continue;
    }

    const parentQty = Math.max(0, Number(item.quantity) || 0);
    if (parentQty <= 0) continue;

    const hasLinkedSubComponents =
      Array.isArray(item.sub_components) &&
      item.sub_components.some((sub) => Boolean(sub.product_id));

    if (hasLinkedSubComponents && item.sub_components) {
      for (const sub of item.sub_components) {
        if (!sub.product_id) continue;
        const subQty = Math.max(0, Number(sub.quantity) || 0);
        const totalSubQty = parentQty * subQty;
        if (totalSubQty <= 0) continue;
        const existing = aggregated.get(sub.product_id);
        aggregated.set(sub.product_id, {
          quantity: (existing?.quantity || 0) + totalSubQty,
          description: existing?.description || sub.item_name || item.item_name || item.description || 'BOM Sub-Component',
        });
      }
    } else if (item.product_id) {
      const existing = aggregated.get(item.product_id);
      aggregated.set(item.product_id, {
        quantity: (existing?.quantity || 0) + parentQty,
        description: existing?.description || item.item_name || item.description || 'Product',
      });
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
      const prodRef = doc(db, 'products', reqItem.product_id);
      const prodSnap = await getDoc(prodRef);

      if (!prodSnap.exists()) {
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

      try {
        const cachedProducts = await MetadataRepository.fetchProductsOnce(wsId);
        if (cachedProducts && cachedProducts.length > 0) {
          const updatedCached = cachedProducts.map((p) =>
            p.id === reqItem.product_id ? { ...p, stock_reserved: newReserved } : p
          );
          await saveToLocalStore('products', updatedCached);
        }
      } catch (cacheErr) {
        // Non-critical local cache update
      }

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
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string }
): Promise<ReleaseResult> {
  const lineItems: LineItem[] = enquiry.line_items || [];
  const requirements = extractEffectiveStockRequirements(lineItems, enquiry.proposal_option);
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
      const prodRef = doc(db, 'products', reqItem.product_id);
      const prodSnap = await getDoc(prodRef);

      if (!prodSnap.exists()) {
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

  for (const reqItem of requirements) {
    if (!reqItem.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      const prodRef = doc(db, 'products', reqItem.product_id);
      const prodSnap = await getDoc(prodRef);

      if (!prodSnap.exists()) {
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
      const newReserved = Math.max(0, currentReserved - qty);

      await safeUpdateDoc('products', reqItem.product_id, {
        stock_on_hand: newOnHand,
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

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
    const prodRef = doc(db, 'products', data.product_id);
    const prodSnap = await getDoc(prodRef);

    let previousOnHand = 0;
    let prodData: Product | null = null;

    if (prodSnap.exists()) {
      prodData = prodSnap.data() as Product;
      previousOnHand = Number(prodData.stock_on_hand) || 0;
    }

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
      updatedAt: nowIso
    };

    if (data.storage_location && data.storage_location.trim()) {
      updatePayload.storage_location = data.storage_location.trim();
    }

    if (data.update_cost_price && unitCost > 0) {
      updatePayload.cost_price = unitCost;
    }

    await safeUpdateDoc('products', data.product_id, updatePayload);

    // Build immutable STOCK_IN audit record
    const movement: StockMovement = {
      workspace_id: wsId,
      product_id: data.product_id,
      product_name: data.product_name || prodData?.name || 'Product',
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
    const prodRef = doc(db, 'products', data.product_id);
    const prodSnap = await getDoc(prodRef);

    let previousOnHand = 0;
    let prodData: Partial<Product> = {};

    if (prodSnap.exists()) {
      prodData = prodSnap.data() as Product;
      previousOnHand = Number(prodData.stock_on_hand) || 0;
    }

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
    const coll = collection(db, 'stock_movements');
    const q = query(coll, where('workspace_id', '==', workspaceId));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockMovement));
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  } catch (err) {
    console.warn('[fetchStockMovements] Failed fetching movements:', err);
    return [];
  }
}

/**
 * Subscribes to realtime updates of stock movements for the given workspace.
 */
export function subscribeStockMovements(
  workspaceId: string,
  callback: (movements: StockMovement[]) => void
): () => void {
  try {
    const coll = collection(db, 'stock_movements');
    const q = query(coll, where('workspace_id', '==', workspaceId));
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StockMovement));
        list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        callback(list);
      },
      (err) => {
        console.warn('[subscribeStockMovements] listener error:', err);
      }
    );
  } catch (err) {
    console.warn('[subscribeStockMovements] setup error:', err);
    return () => {};
  }
}

async function getProductLiveOrLocal(productId: string): Promise<Product | null> {
  if (!productId) return null;
  try {
    const prodRef = doc(db, 'products', productId);
    const prodSnap = await getDoc(prodRef);
    if (prodSnap.exists()) {
      return { id: prodSnap.id, ...(prodSnap.data() as Product) };
    }
  } catch (_) {}
  try {
    const localList = (await getFromLocalStore<Product>('products')) || [];
    return localList.find((p) => p.id === productId) || null;
  } catch (_) {}
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

      if (line.product_id) {
        let prodData = await getProductLiveOrLocal(line.product_id);
        const prevOnHand = Number(prodData?.stock_on_hand) || 0;
        const newOnHand = prevOnHand + qtyReceivedNow;

        const productUpdate: Partial<Product> & { updatedAt: string } = {
          is_inventoried: true,
          stock_on_hand: newOnHand,
          last_landed_cost: computedLandedUnit,
          last_grn_ref: input.grn_number,
          updatedAt: nowIso
        };

        if (line.storage_location?.trim()) {
          productUpdate.storage_location = line.storage_location.trim();
        }

        // Strict Base Catalog Cost Protection: never overwrite base cost_price unless explicitly requested
        if (input.update_base_catalog_cost && poUnitCost > 0) {
          productUpdate.cost_price = poUnitCost;
        }

        await safeUpdateDoc('products', line.product_id, productUpdate);
        updatedProducts.push({
          productId: line.product_id,
          newOnHand,
          landedUnitCost: computedLandedUnit,
          updatedBaseCost: input.update_base_catalog_cost && poUnitCost > 0 ? poUnitCost : undefined
        });

        const movement: StockMovement = {
          workspace_id: wsId,
          product_id: line.product_id,
          product_name: line.item_name || prodData?.name || prodData?.description || 'PO Item',
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
      }
    }

    // Update PO line items and receiving status
    const receiptByLineIdx = new Map<number, typeof activeLinesToReceive[number]>();
    activeLinesToReceive.forEach((l) => receiptByLineIdx.set(l.line_index, l));

    let totalOrderedAll = 0;
    let totalReceivedAll = 0;

    const updatedPoLineItems = (poDoc.line_items || []).map((item, idx) => {
      const ordered = Math.max(0, Number(item.qty_ordered ?? item.quantity) || 0);
      const prevReceived = Math.max(0, Number(item.qty_received) || 0);
      const matchedInput = receiptByLineIdx.get(idx);
      const addReceived = matchedInput ? Math.max(0, Number(matchedInput.qty_receiving_now) || 0) : 0;
      const nextReceived = prevReceived + addReceived;
      const nextPending = Math.max(0, ordered - nextReceived);

      totalOrderedAll += ordered;
      totalReceivedAll += nextReceived;

      if (!matchedInput) {
        return {
          ...item,
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

    const updatedPo: Quotation = {
      ...poDoc,
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
  const mrnRef = vMeta.mrn_ref || returnDoc.formatted_quote_ref || returnDoc.quote_number || 'MRN';

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

    for (const item of returnDoc.line_items || []) {
      const returnQty = Math.max(0, Number(item.qty_returned ?? item.quantity) || 0);
      if (!item.product_id || returnQty <= 0) continue;

      const prodData = await getProductLiveOrLocal(item.product_id);
      if (!prodData) continue;

      const prevOnHand = Math.max(0, Number(prodData.stock_on_hand) || 0);
      const newOnHand = Math.max(0, prevOnHand - returnQty);

      // Update ONLY stock_on_hand (never alter stock_reserved for client orders)
      await safeUpdateDoc('products', item.product_id, {
        stock_on_hand: newOnHand,
        updatedAt: nowIso
      });

      updatedProducts.push({ productId: item.product_id, newOnHand });

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: item.product_id,
        product_name: item.item_name || prodData.name || prodData.description || 'Returned Item',
        movement_type: 'RETURN_TO_VENDOR',
        quantity: -returnQty,
        previous_on_hand: prevOnHand,
        new_on_hand: newOnHand,
        reference_type: 'MRN',
        reference_id: returnDoc.id,
        reference_number: mrnRef,
        po_id: vMeta.linked_po_id,
        po_ref: vMeta.linked_po_ref,
        supplier_id: vMeta.supplier_id,
        supplier_name: vMeta.supplier_name || returnDoc.client_snapshot?.entity_name,
        unit_cost: Number(item.unit_price) || 0,
        reason_notes: `Material Return to Vendor (${mrnRef})${
          vMeta.return_reason ? ` • Reason: ${vMeta.return_reason}` : ''
        }${vMeta.linked_po_ref ? ` • Linked PO: ${vMeta.linked_po_ref}` : ''}`,
        created_at: nowIso,
        created_by_uid: userUid,
        created_by_name: userName
      };

      await safeAddDoc('stock_movements', movement);
      deductedCount++;
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


