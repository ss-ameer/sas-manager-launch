import { Enquiry, LineItem, Product, StockMovement, UserProfile, Project, GrnReceiptData } from '../types';
import { safeAddDoc, safeUpdateDoc, db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { MetadataRepository } from './repositories/MetadataRepository';
import { saveToLocalStore } from './db';

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
 * Reads all line items in the enquiry having a product_id.
 * For each matching product where is_inventoried === true:
 * increments stock_reserved by item quantity and records a STOCK_RESERVE movement.
 */
export async function reserveEnquiryStock(
  enquiry: Enquiry,
  user?: UserProfile | { uid?: string; name?: string; full_name?: string; username?: string; email?: string }
): Promise<ReservationResult> {
  const lineItems: LineItem[] = enquiry.line_items || [];
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

  for (const item of lineItems) {
    if (!item.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      // Fetch product document
      const prodRef = doc(db, 'products', item.product_id);
      const prodSnap = await getDoc(prodRef);

      if (!prodSnap.exists()) {
        result.skippedCount++;
        continue;
      }

      const prodData = prodSnap.data() as Product;

      // Safe constraint: Only lines with is_inventoried === true trigger reservation
      if (!prodData.is_inventoried) {
        result.skippedCount++;
        continue;
      }

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        result.skippedCount++;
        continue;
      }

      const currentReserved = runningReservedMap.has(item.product_id)
        ? runningReservedMap.get(item.product_id)!
        : Number(prodData.stock_reserved) || 0;
      const currentOnHand = Number(prodData.stock_on_hand) || 0;
      const newReserved = currentReserved + qty;
      runningReservedMap.set(item.product_id, newReserved);

      // Update product document in Firestore
      await safeUpdateDoc('products', item.product_id, {
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

      // Update local storage in IndexedDB as well
      try {
        const cachedProducts = await MetadataRepository.fetchProductsOnce();
        if (cachedProducts && cachedProducts.length > 0) {
          const updatedCached = cachedProducts.map((p) =>
            p.id === item.product_id ? { ...p, stock_reserved: newReserved } : p
          );
          await saveToLocalStore('products', updatedCached);
        }
      } catch (cacheErr) {
        // Non-critical local cache update
      }

      // Append audit record to stock_movements
      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: item.product_id,
        product_name: prodData.name || item.description || 'Product',
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
        productId: item.product_id,
        quantity: qty,
        newReserved
      });
    } catch (err) {
      console.warn(`[reserveEnquiryStock] Failed reserving product ${item.product_id}:`, err);
    }
  }

  // Tag enquiry as stock_reserved
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

  for (const item of lineItems) {
    if (!item.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      const prodRef = doc(db, 'products', item.product_id);
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

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        result.skippedCount++;
        continue;
      }

      const currentReserved = Number(prodData.stock_reserved) || 0;
      const currentOnHand = Number(prodData.stock_on_hand) || 0;
      const newReserved = Math.max(0, currentReserved - qty);

      await safeUpdateDoc('products', item.product_id, {
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: item.product_id,
        product_name: prodData.name || item.description || 'Product',
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
        productId: item.product_id,
        quantity: qty,
        newReserved
      });
    } catch (err) {
      console.warn(`[releaseEnquiryStock] Failed releasing product ${item.product_id}:`, err);
    }
  }

  // Untag enquiry stock_reserved
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
 * Decrements both stock_on_hand and stock_reserved for inventoried line items,
 * and appends immutable STOCK_OUT audit records in stock_movements.
 */
export async function dispatchProjectStock(
  project: Project,
  user?: any
): Promise<DispatchResult> {
  const lineItems: LineItem[] = project.line_items || [];
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

  for (const item of lineItems) {
    if (!item.product_id) {
      result.skippedCount++;
      continue;
    }

    try {
      const prodRef = doc(db, 'products', item.product_id);
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

      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        result.skippedCount++;
        continue;
      }

      const currentOnHand = Number(prodData.stock_on_hand) || 0;
      const currentReserved = Number(prodData.stock_reserved) || 0;

      // Safe Inventory Deduction: decrement both stock_on_hand and stock_reserved
      const newOnHand = Math.max(0, currentOnHand - qty);
      const newReserved = Math.max(0, currentReserved - qty);

      // Update Firestore product document
      await safeUpdateDoc('products', item.product_id, {
        stock_on_hand: newOnHand,
        stock_reserved: newReserved,
        updatedAt: nowIso
      });

      // Immutable audit record in stock_movements
      const movement: StockMovement = {
        workspace_id: wsId,
        product_id: item.product_id,
        product_name: prodData.name || item.description || 'Product',
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
        productId: item.product_id,
        productName: prodData.name || item.description || 'Product',
        quantity: qty,
        newOnHand,
        newReserved
      });
    } catch (err) {
      console.warn(`[dispatchProjectStock] Failed dispatching product ${item.product_id}:`, err);
    }
  }

  // Update project in Firestore
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

    // Build update payload for the product document
    const updatePayload: Partial<Product> & { updatedAt: string } = {
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

