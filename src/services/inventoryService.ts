import { Enquiry, LineItem, Product, StockMovement, UserProfile, Project, GrnReceiptData, StockAdjustmentData } from '../types';
import { safeAddDoc, safeUpdateDoc, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { MetadataRepository } from './repositories/MetadataRepository';
import { saveToLocalStore } from './db';
import { isOptionActiveForInventoryAndBaseline } from '../utils/compositeBomUtils';

export { isOptionActiveForInventoryAndBaseline };

export interface ReservationResult {
  success: boolean;
  reservedCount: number;
  skippedCount: number;
  details: { productId: string; quantity: number; newReserved: number }[];
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
 */
export function extractEffectiveStockRequirements(
  lineItems: LineItem[],
  designatedWinningOption?: string
): Array<{ product_id: string; quantity: number; description: string }> {
  const aggregated = new Map<string, { quantity: number; description: string }>();

  for (const item of lineItems || []) {
    const itemOpt = item.option || item.item_option || item.option_designation;
    if (!isOptionActiveForInventoryAndBaseline(itemOpt, designatedWinningOption)) {
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
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string }
): Promise<ReservationResult> {
  const lineItems: LineItem[] = enquiry.line_items || [];
  const requirements = extractEffectiveStockRequirements(lineItems, enquiry.proposal_option);
  const result: ReservationResult = {
    success: true,
    reservedCount: 0,
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
        const cachedProducts = await MetadataRepository.fetchProductsOnce();
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
  const requirements = extractEffectiveStockRequirements(lineItems);
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

