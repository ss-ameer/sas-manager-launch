import {
  SupplierBill,
  SupplierBillLineItem,
  SupplierBillMatchStatus,
  SupplierBillVarianceSummary,
  Quotation,
  PaymentVoucherAllocationRow
} from '../../types';
import { db, safeGetDocs, safeGetDoc, safeSetDoc, safeUpdateDoc, safeDeleteDoc } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { QuotationRepository } from './QuotationRepository';
import {
  deleteFromStorageBucket,
  WorkspaceStorageSettings,
  rehydrateDocumentBlobsSync,
  sanitizeFirestorePayload
} from '../attachmentStorage';

const SUPPLIER_BILLS_COLLECTION = 'supplier_bills';
const LOCAL_BILLS_KEY = 'sas_local_supplier_bills_v1';

function readLocalBills(): SupplierBill[] {
  try {
    const raw = localStorage.getItem(LOCAL_BILLS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalBills(bills: SupplierBill[]) {
  try {
    localStorage.setItem(LOCAL_BILLS_KEY, JSON.stringify(bills));
  } catch {}
}

function upsertLocalBill(bill: SupplierBill) {
  const list = readLocalBills();
  const idx = list.findIndex((b) => b.id === bill.id);
  if (idx >= 0) {
    list[idx] = bill;
  } else {
    list.unshift(bill);
  }
  writeLocalBills(list);
}

export class ProcurementRepository {
  private static workspaceListeners = new Map<string, Set<() => void>>();
  private static workspaceSubscribers = new Map<string, Set<(bills: SupplierBill[]) => void>>();
  private static activeSnapshotUnsubs = new Map<string, () => void>();
  private static workspaceCache = new Map<string, { data: SupplierBill[]; fetchedAt: number }>();

  private static normalizeBill(b: SupplierBill): SupplierBill {
    return rehydrateDocumentBlobsSync({
      ...b,
      vendor_company_id: b.vendor_company_id || b.supplier_id,
      vendor_name: b.vendor_name || b.supplier_name || 'Vendor',
      vendor_trn: b.vendor_trn || b.supplier_trn,
      three_way_match_status: b.three_way_match_status || b.match_status || 'no_po'
    });
  }

  private static readNormalizedLocalWorkspaceBills(wsId: string): SupplierBill[] {
    return readLocalBills()
      .filter((b) => !b.is_deleted && (b.workspace_id === wsId || (!b.workspace_id && wsId === 'ws_default')))
      .map((b) => this.normalizeBill(b))
      .sort((a, b) => (b.invoice_date || b.created_at || '').localeCompare(a.invoice_date || a.created_at || ''));
  }

  public static notifyWorkspaceSubscribers(workspaceId?: string): void {
    const wsId = workspaceId || 'ws_default';
    if (wsId === '*') {
      this.workspaceCache.clear();
    } else {
      this.workspaceCache.delete(wsId);
    }

    const listeners = this.workspaceListeners.get(wsId);
    if (listeners) {
      listeners.forEach((fn) => {
        try {
          fn();
        } catch (_) {}
      });
    }
    const wildcard = this.workspaceListeners.get('*');
    if (wildcard) {
      wildcard.forEach((fn) => {
        try {
          fn();
        } catch (_) {}
      });
    }

    const targetWsIds = wsId === '*' ? Array.from(this.workspaceSubscribers.keys()) : [wsId];
    for (const targetWsId of targetWsIds) {
      const subs = this.workspaceSubscribers.get(targetWsId);
      if (subs && subs.size > 0) {
        const localBills = this.readNormalizedLocalWorkspaceBills(targetWsId);
        this.workspaceCache.set(targetWsId, { data: localBills, fetchedAt: Date.now() });
        subs.forEach((cb) => {
          try {
            cb(localBills);
          } catch (_) {}
        });
      }
    }
  }
  /**
   * Computes 3-Way Match status and line-level variances comparing a Supplier Bill against its linked PO and GRN quantities.
   */
  static computeThreeWayMatch(
    lines: SupplierBillLineItem[],
    hasLinkedPo: boolean,
    exchangeRate: number = 1
  ): {
    evaluatedLines: SupplierBillLineItem[];
    matchStatus: SupplierBillMatchStatus;
    varianceSummary: SupplierBillVarianceSummary;
  } {
    if (!hasLinkedPo) {
      return {
        evaluatedLines: lines.map((l) => ({
          ...l,
          line_total: QuotationRepository.roundCurrency((Number(l.billed_qty) || 0) * (Number(l.billed_unit_cost) || 0)),
          has_price_variance: false,
          has_qty_variance: false
        })),
        matchStatus: 'no_po',
        varianceSummary: {
          has_price_variance: false,
          has_qty_variance: false,
          total_variance_amount: 0,
          line_variances: []
        }
      };
    }

    const effectiveExRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
    let hasPriceVariance = false;
    let hasQtyVariance = false;
    let totalVarianceAmount = 0;
    const lineVariances: SupplierBillVarianceSummary['line_variances'] = [];

    const evaluatedLines = (lines || []).map((line) => {
      const poQty = Math.max(0, Number(line.po_ordered_qty ?? line.po_qty) || 0);
      const grnQty = Math.max(0, Number(line.grn_received_qty ?? line.grn_qty) || 0);
      const billedQty = Math.max(0, Number(line.billed_qty) || 0);
      const poRate = QuotationRepository.roundCurrency(Number(line.po_unit_cost) || 0);
      const billedRate = QuotationRepository.roundCurrency(Number(line.billed_unit_cost) || 0);
      const lineTotal = QuotationRepository.roundCurrency(billedQty * billedRate);

      // Multi-currency normalization: if exchangeRate !== 1, check whether PO rate is in base currency (billedRate * exchangeRate) or same foreign currency
      const directDiff = Math.abs(billedRate - poRate);
      const convertedBilledRate = QuotationRepository.roundCurrency(billedRate * effectiveExRate);
      const convertedDiff = Math.abs(convertedBilledRate - poRate);
      const useConvertedComparison =
        Math.abs(effectiveExRate - 1) > 0.0001 && convertedDiff < directDiff;
      const effectivePoRateInBillCurrency =
        useConvertedComparison && effectiveExRate > 0
          ? QuotationRepository.roundCurrency(poRate / effectiveExRate)
          : poRate;
      const priceDiff = Math.min(directDiff, convertedDiff);

      // Price variance if billed unit rate differs from PO unit rate by more than 0.01
      const linePriceVar = poRate > 0 && priceDiff > 0.01;

      // Qty variance if billed qty exceeds GRN received qty (when GRN > 0) or exceeds PO ordered qty
      const referenceQty = grnQty > 0 ? grnQty : poQty;
      const lineQtyVar = referenceQty > 0 && billedQty > referenceQty + 0.0001;

      if (linePriceVar) hasPriceVariance = true;
      if (lineQtyVar) hasQtyVariance = true;

      if (linePriceVar || lineQtyVar) {
        const expectedLineVal = QuotationRepository.roundCurrency(
          Math.min(billedQty, referenceQty || billedQty) * effectivePoRateInBillCurrency
        );
        totalVarianceAmount = QuotationRepository.roundCurrency(
          totalVarianceAmount + (lineTotal - expectedLineVal)
        );
        lineVariances.push({
          item_name: line.item_name || 'Item',
          po_rate: poRate,
          billed_rate: billedRate,
          po_qty: poQty,
          grn_qty: grnQty,
          billed_qty: billedQty
        });
      }

      return {
        ...line,
        po_ordered_qty: poQty,
        po_qty: poQty,
        grn_received_qty: grnQty,
        grn_qty: grnQty,
        line_total: lineTotal,
        has_price_variance: linePriceVar,
        has_qty_variance: lineQtyVar
      };
    });

    const matchStatus: SupplierBillMatchStatus =
      hasPriceVariance && hasQtyVariance
        ? 'both_variance'
        : hasPriceVariance
        ? 'price_variance'
        : hasQtyVariance
        ? 'qty_variance'
        : 'matched';

    return {
      evaluatedLines,
      matchStatus,
      varianceSummary: {
        has_price_variance: hasPriceVariance,
        has_qty_variance: hasQtyVariance,
        total_variance_amount: totalVarianceAmount,
        line_variances: lineVariances
      }
    };
  }

  /**
   * Fetches all active (non-deleted) Supplier Bills for a workspace.
   */
  static async getWorkspaceSupplierBills(workspaceId: string): Promise<SupplierBill[]> {
    const wsId = workspaceId || 'ws_default';
    const cached = this.workspaceCache.get(wsId);
    if (cached && Date.now() - cached.fetchedAt < 10_000) {
      return [...cached.data];
    }

    const mergedMap = new Map<string, SupplierBill>();

    readLocalBills()
      .filter((b) => !b.is_deleted && (b.workspace_id === wsId || (!b.workspace_id && wsId === 'ws_default')))
      .forEach((b) => {
        if (b.id) mergedMap.set(b.id, this.normalizeBill(b));
      });

    try {
      const snap = await safeGetDocs(SUPPLIER_BILLS_COLLECTION, where('workspace_id', '==', wsId));
      if (snap && !snap.empty) {
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() } as SupplierBill;
          if (!data.is_deleted) {
            mergedMap.set(d.id, this.normalizeBill(data));
          } else {
            mergedMap.delete(d.id);
          }
        });
      }
    } catch (err) {
      console.warn('[ProcurementRepository] Firestore query fallback to local:', err);
    }

    const sorted = Array.from(mergedMap.values()).sort((a, b) =>
      (b.invoice_date || b.created_at || '').localeCompare(a.invoice_date || a.created_at || '')
    );
    this.workspaceCache.set(wsId, { data: sorted, fetchedAt: Date.now() });
    return sorted;
  }

  /**
   * Checks if a vendor_invoice_no is already recorded for the same supplier in the workspace.
   */
  static async checkDuplicateVendorInvoice(
    workspaceId: string,
    supplierNameOrId: string,
    vendorInvoiceNo: string,
    excludeBillId?: string
  ): Promise<SupplierBill | null> {
    const cleanInv = (vendorInvoiceNo || '').trim().toLowerCase();
    const cleanSup = (supplierNameOrId || '').trim().toLowerCase();
    if (!cleanInv || !cleanSup) return null;

    const bills = await this.getWorkspaceSupplierBills(workspaceId);
    return (
      bills.find((b) => {
        if (excludeBillId && b.id === excludeBillId) return false;
        const sameInv = (b.vendor_invoice_no || '').trim().toLowerCase() === cleanInv;
        const sameSup =
          (b.supplier_id && b.supplier_id.toLowerCase() === cleanSup) ||
          (b.supplier_name || '').trim().toLowerCase() === cleanSup;
        return sameInv && sameSup;
      }) || null
    );
  }

  /**
   * Saves or updates a Supplier Bill with automatic 3-Way Match & balance recalculation.
   */
  static async saveSupplierBill(billInput: Partial<SupplierBill> & { workspace_id: string }): Promise<SupplierBill> {
    const nowIso = new Date().toISOString();
    const id = billInput.id || `bill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const hasLinkedPo = Boolean(billInput.po_id || billInput.po_ref);

    const billExRate = Number(billInput.exchange_rate) > 0 ? Number(billInput.exchange_rate) : 1.0;
    const { evaluatedLines, matchStatus, varianceSummary } = this.computeThreeWayMatch(
      billInput.line_items || [],
      hasLinkedPo,
      billExRate
    );

    const subtotal = QuotationRepository.roundCurrency(
      evaluatedLines.reduce((sum, l) => sum + (Number(l.line_total) || 0), 0)
    );
    const freight = QuotationRepository.roundCurrency(Number(billInput.freight_customs_amount) || 0);
    const taxRate = Number(billInput.tax_rate_percent ?? 5);
    const taxAmount = QuotationRepository.roundCurrency(((subtotal + freight) * taxRate) / 100);
    const grandTotal = QuotationRepository.roundCurrency(subtotal + freight + taxAmount);

    const creditApplied = QuotationRepository.roundCurrency(Number(billInput.credit_applied_amount) || 0);
    const amountPaid = QuotationRepository.roundCurrency(Number(billInput.amount_paid) || 0);
    const balanceDue = Math.max(0, QuotationRepository.roundCurrency(grandTotal - creditApplied - amountPaid));

    const paymentStatus: SupplierBill['payment_status'] =
      balanceDue <= 0.009 && grandTotal > 0
        ? 'paid'
        : amountPaid > 0 || creditApplied > 0
        ? 'partially_paid'
        : 'unpaid';

    const year = new Date().getFullYear();
    const defaultBillNo = `BILL-${year}-${String(Math.floor(1000 + Math.random() * 9000))}`;

    const resolvedSupplierId = billInput.supplier_id || billInput.vendor_company_id || '';
    const resolvedSupplierName = (billInput.supplier_name || billInput.vendor_name || 'Vendor').trim();
    const resolvedSupplierTrn = billInput.supplier_trn || billInput.vendor_trn || '';
    const resolvedTaxAmount =
      billInput.tax_amount !== undefined
        ? QuotationRepository.roundCurrency(Number(billInput.tax_amount) || 0)
        : taxAmount;
    const resolvedGrandTotal =
      billInput.grand_total !== undefined
        ? QuotationRepository.roundCurrency(Number(billInput.grand_total) || 0)
        : grandTotal;
    const resolvedBalanceDue = Math.max(
      0,
      QuotationRepository.roundCurrency(resolvedGrandTotal - creditApplied - amountPaid)
    );
    const resolvedPaymentStatus: SupplierBill['payment_status'] =
      resolvedBalanceDue <= 0.009 && resolvedGrandTotal > 0
        ? 'paid'
        : amountPaid > 0 || creditApplied > 0
        ? 'partially_paid'
        : 'unpaid';

    const fullBill: SupplierBill = {
      id,
      workspace_id: billInput.workspace_id || 'ws_default',
      bill_number: billInput.bill_number || defaultBillNo,
      vendor_invoice_no: (billInput.vendor_invoice_no || '').trim(),
      invoice_date: billInput.invoice_date || nowIso.split('T')[0],
      due_date: billInput.due_date || '',
      supplier_id: resolvedSupplierId,
      vendor_company_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      vendor_name: resolvedSupplierName,
      supplier_trn: resolvedSupplierTrn,
      vendor_trn: resolvedSupplierTrn,
      po_id: billInput.po_id || '',
      po_ref: billInput.po_ref || '',
      enquiry_id: billInput.enquiry_id || '',
      project_id: billInput.project_id || '',
      project_number: billInput.project_number || '',
      grn_refs: billInput.grn_refs || [],
      currency: billInput.currency || 'AED',
      exchange_rate: Number(billInput.exchange_rate) > 0 ? Number(billInput.exchange_rate) : 1.0,
      line_items: evaluatedLines,
      subtotal,
      freight_customs_amount: freight,
      tax_rate_percent: taxRate,
      tax_amount: resolvedTaxAmount,
      grand_total: resolvedGrandTotal,
      credit_applied_amount: creditApplied,
      amount_paid: amountPaid,
      balance_due: resolvedBalanceDue,
      approval_status: billInput.approval_status || 'under_review',
      payment_status: resolvedPaymentStatus,
      is_on_hold: Boolean(billInput.is_on_hold),
      hold_reason: billInput.hold_reason || '',
      approved_by_name: billInput.approved_by_name,
      approved_at: billInput.approved_at,
      variance_override_approved: billInput.variance_override_approved,
      match_status: billInput.three_way_match_status || billInput.match_status || matchStatus,
      three_way_match_status: billInput.three_way_match_status || billInput.match_status || matchStatus,
      variance_summary: billInput.variance_summary || varianceSummary,
      price_variance_amount:
        billInput.price_variance_amount ?? varianceSummary.total_variance_amount,
      qty_variance_count:
        billInput.qty_variance_count ?? varianceSummary.line_variances.filter((v) => v.billed_qty !== v.po_qty).length,
      attachment: billInput.attachment,
      notes: billInput.notes || '',
      is_deleted: false,
      created_at: billInput.created_at || nowIso,
      created_by: billInput.created_by,
      updated_at: nowIso
    };

    upsertLocalBill(fullBill);
    await safeSetDoc(SUPPLIER_BILLS_COLLECTION, id, fullBill);
    this.notifyWorkspaceSubscribers(fullBill.workspace_id);
    return fullBill;
  }

  /**
   * Fetches all soft-deleted Supplier Bills for a workspace (for Recycle Bin & Orphan Scanner).
   */
  static async getDeletedSupplierBills(workspaceId?: string): Promise<SupplierBill[]> {
    const wsId = workspaceId || 'ws_default';
    const mergedMap = new Map<string, SupplierBill>();

    readLocalBills()
      .filter(
        (b) =>
          Boolean(b.is_deleted) &&
          (!workspaceId || b.workspace_id === wsId || (!b.workspace_id && wsId === 'ws_default'))
      )
      .forEach((b) => {
        if (b.id) mergedMap.set(b.id, b);
      });

    try {
      const snap = workspaceId
        ? await safeGetDocs(SUPPLIER_BILLS_COLLECTION, where('workspace_id', '==', wsId))
        : await safeGetDocs(SUPPLIER_BILLS_COLLECTION);
      if (snap && !snap.empty) {
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() } as SupplierBill;
          if (data.is_deleted && (!workspaceId || data.workspace_id === wsId)) {
            mergedMap.set(d.id, this.normalizeBill(data));
          } else if (!data.is_deleted) {
            mergedMap.delete(d.id);
          }
        });
      }
    } catch (_) {}

    return Array.from(mergedMap.values()).sort((a, b) =>
      (b.deleted_at || b.updated_at || '').localeCompare(a.deleted_at || a.updated_at || '')
    );
  }

  /**
   * Restores a soft-deleted Supplier Bill from the Recycle Bin and recalculates its paid/credit balances.
   */
  static async restoreSupplierBill(billId: string): Promise<SupplierBill | null> {
    if (!billId) return null;
    const nowIso = new Date().toISOString();
    const localList = readLocalBills();
    let target = localList.find((b) => b.id === billId) || null;

    if (!target) {
      try {
        const snap = await safeGetDoc(SUPPLIER_BILLS_COLLECTION, billId);
        if (snap && snap.exists()) {
          target = { id: snap.id, ...snap.data() } as SupplierBill;
        }
      } catch (_) {}
    }

    if (target) {
      const restored: SupplierBill = {
        ...target,
        is_deleted: false,
        deleted_at: undefined,
        updated_at: nowIso
      };
      upsertLocalBill(restored);
      await safeUpdateDoc(SUPPLIER_BILLS_COLLECTION, billId, {
        is_deleted: false,
        deleted_at: null,
        updated_at: nowIso
      });
      await this.recalculateWorkspaceSupplierBillBalances(restored.workspace_id || 'ws_default');
      this.notifyWorkspaceSubscribers(restored.workspace_id || 'ws_default');
      return restored;
    }

    await safeUpdateDoc(SUPPLIER_BILLS_COLLECTION, billId, {
      is_deleted: false,
      deleted_at: null,
      updated_at: nowIso
    });
    this.notifyWorkspaceSubscribers('*');
    return null;
  }

  /**
   * Soft-deletes a Supplier Bill and optionally deletes its cloud attachment if permanently purged.
   */
  static async deleteSupplierBill(
    billId: string,
    workspaceSettings?: WorkspaceStorageSettings | null,
    permanent: boolean = false
  ): Promise<void> {
    const localList = readLocalBills();
    let target = localList.find((b) => b.id === billId);
    if (!target && permanent) {
      try {
        const snap = await safeGetDoc(SUPPLIER_BILLS_COLLECTION, billId);
        if (snap && snap.exists()) {
          target = { id: snap.id, ...snap.data() } as SupplierBill;
        }
      } catch (_) {}
    }

    const wsId = target?.workspace_id || 'ws_default';

    if (permanent) {
      const attUrl = target?.attachment?.url || target?.attachment_url;
      if (attUrl) {
        await deleteFromStorageBucket(attUrl, workspaceSettings, target?.attachment?.storageKey);
      }
      writeLocalBills(localList.filter((b) => b.id !== billId));
      await safeDeleteDoc(SUPPLIER_BILLS_COLLECTION, billId);
    } else {
      const nowIso = new Date().toISOString();
      if (target) {
        upsertLocalBill({ ...target, is_deleted: true, deleted_at: nowIso });
      }
      await safeUpdateDoc(SUPPLIER_BILLS_COLLECTION, billId, {
        is_deleted: true,
        deleted_at: nowIso,
        updated_at: nowIso
      });
    }
    this.notifyWorkspaceSubscribers(wsId);
  }

  /**
   * Deterministically recalculates `amount_paid`, `credit_applied_amount`, `balance_due`, and `payment_status`
   * for all active Supplier Bills in a workspace from all active (non-deleted) Payment Vouchers (`PV`)
   * and Vendor Debit Notes (`DN`). Prevents double-counting when saving a PV/DN multiple times and
   * automatically reverses balances when a PV/DN is edited or moved to the Recycle Bin.
   */
  static async recalculateWorkspaceSupplierBillBalances(workspaceId: string): Promise<SupplierBill[]> {
    const wsId = workspaceId || 'ws_default';
    const [bills, procurementDocs] = await Promise.all([
      this.getWorkspaceSupplierBills(wsId),
      this.getWorkspaceProcurementDocuments(wsId)
    ]);

    if (bills.length === 0) return [];

    const activePvs = procurementDocs.filter(
      (d) => !d.is_deleted && d.document_type === 'payment_voucher'
    );
    const activeDns = procurementDocs.filter(
      (d) =>
        !d.is_deleted &&
        (d.document_type === 'debit_note' ||
          d.vendor_return_metadata?.return_mode === 'debit_note')
    );

    // Pre-aggregate PV allocations and DN credits in O(V * A) Map pass instead of nested O(B * V * A) loops
    const paidByBillId = new Map<string, number>();
    const paidByBillRef = new Map<string, number>();
    const directPvByInvNo = new Map<
      string,
      Array<{ vendorIdLower: string; vendorNameLower: string; amount: number; exRate: number; currency: string }>
    >();

    for (const pv of activePvs) {
      const meta = pv.payment_voucher_metadata;
      if (!meta) continue;
      const pvExRate = Number(meta.exchange_rate) > 0 ? Number(meta.exchange_rate) : 1;
      const pvCurr = (meta.currency || pv.currency || 'AED').toUpperCase();
      const allocations = meta.allocated_bills || meta.allocations || [];
      if (Array.isArray(allocations) && allocations.length > 0) {
        for (const row of allocations) {
          const amt = Math.max(0, Number(row.paid_this_voucher) || 0);
          if (amt <= 0) continue;
          if (row.bill_id) {
            paidByBillId.set(row.bill_id, (paidByBillId.get(row.bill_id) || 0) + amt);
          } else {
            const refKey = (row.bill_ref || row.bill_number || '').trim().toLowerCase();
            if (refKey) {
              paidByBillRef.set(refKey, (paidByBillRef.get(refKey) || 0) + amt);
            }
          }
        }
      } else {
        const invKey = (meta.vendor_invoice_no || '').trim().toLowerCase();
        const amt = Math.max(0, Number(meta.amount_paid ?? pv.grand_total) || 0);
        if (invKey && amt > 0) {
          const list = directPvByInvNo.get(invKey) || [];
          list.push({
            vendorIdLower: (meta.vendor_company_id || meta.vendor_id || '').trim().toLowerCase(),
            vendorNameLower: (meta.payee_name || meta.paid_to_vendor_name || '').trim().toLowerCase(),
            amount: amt,
            exRate: pvExRate,
            currency: pvCurr
          });
          directPvByInvNo.set(invKey, list);
        }
      }
    }

    const creditByBillId = new Map<string, number>();
    const creditByInvNo = new Map<string, number>();

    for (const dn of activeDns) {
      const rMeta = dn.vendor_return_metadata;
      if (!rMeta) continue;
      const claimVal = Math.max(
        0,
        Number(rMeta.total_claim_amount) ||
          Number(rMeta.credit_claim_amount) ||
          Number(dn.grand_total) ||
          0
      );
      if (claimVal <= 0) continue;
      if (rMeta.linked_bill_id) {
        creditByBillId.set(
          rMeta.linked_bill_id,
          (creditByBillId.get(rMeta.linked_bill_id) || 0) + claimVal
        );
      } else {
        const invKey = (rMeta.vendor_invoice_no || '').trim().toLowerCase();
        if (invKey) {
          creditByInvNo.set(invKey, (creditByInvNo.get(invKey) || 0) + claimVal);
        }
      }
    }

    const updatedBills: SupplierBill[] = [];

    for (const bill of bills) {
      const billId = bill.id;
      const billRefLower = (bill.bill_number || '').trim().toLowerCase();
      const invNoLower = (bill.vendor_invoice_no || '').trim().toLowerCase();
      const vendorIdLower = (bill.vendor_company_id || bill.supplier_id || '').trim().toLowerCase();
      const vendorNameLower = (bill.vendor_name || bill.supplier_name || '').trim().toLowerCase();
      const billCurr = (bill.currency || 'AED').toUpperCase();
      const billExRate = Number(bill.exchange_rate) > 0 ? Number(bill.exchange_rate) : 1;

      // 1. Sum payments from O(1) lookup maps
      let computedPaid =
        (paidByBillId.get(billId) || 0) +
        (billRefLower ? paidByBillRef.get(billRefLower) || 0 : 0);

      if (invNoLower && directPvByInvNo.has(invNoLower)) {
        for (const entry of directPvByInvNo.get(invNoLower)!) {
          const matchesVendor =
            (vendorIdLower && entry.vendorIdLower === vendorIdLower) ||
            !vendorNameLower ||
            entry.vendorNameLower === vendorNameLower;
          if (matchesVendor) {
            // Normalize if PV is in base currency (AED) and Bill is in foreign currency
            const normalizedAmt =
              entry.currency !== billCurr && billExRate > 0 && Math.abs(billExRate - 1) > 0.0001
                ? QuotationRepository.roundCurrency((entry.amount * entry.exRate) / billExRate)
                : entry.amount;
            computedPaid += normalizedAmt;
          }
        }
      }

      // 2. Sum credits from O(1) lookup maps
      const computedCredit =
        (creditByBillId.get(billId) || 0) +
        (invNoLower ? creditByInvNo.get(invNoLower) || 0 : 0);

      const grandTotal = QuotationRepository.roundCurrency(Number(bill.grand_total) || 0);
      const nextCredit = QuotationRepository.roundCurrency(Math.min(grandTotal, computedCredit));
      const nextPaid = QuotationRepository.roundCurrency(
        Math.min(Math.max(0, grandTotal - nextCredit), computedPaid)
      );
      const nextBalance = Math.max(
        0,
        QuotationRepository.roundCurrency(grandTotal - nextCredit - nextPaid)
      );
      const nextStatus: SupplierBill['payment_status'] =
        nextBalance <= 0.009 && grandTotal > 0
          ? 'paid'
          : nextPaid > 0 || nextCredit > 0
          ? 'partially_paid'
          : 'unpaid';

      const hasChanged =
        Math.abs((Number(bill.amount_paid) || 0) - nextPaid) > 0.005 ||
        Math.abs((Number(bill.credit_applied_amount) || 0) - nextCredit) > 0.005 ||
        Math.abs((Number(bill.balance_due) || 0) - nextBalance) > 0.005 ||
        bill.payment_status !== nextStatus;

      if (hasChanged) {
        const saved = await this.saveSupplierBill({
          ...bill,
          credit_applied_amount: nextCredit,
          amount_paid: nextPaid,
          balance_due: nextBalance,
          payment_status: nextStatus
        });
        updatedBills.push(saved);
      } else {
        updatedBills.push(bill);
      }
    }

    this.notifyWorkspaceSubscribers(wsId);
    return updatedBills;
  }

  /**
   * Synchronizes Supplier Bill paid amounts when an Outbound Payment Voucher (`PV`) is saved/issued.
   * Uses deterministic recalculation from all active PVs so saving a PV multiple times never double-counts.
   */
  static async applyPaymentVoucherAllocationsToBills(
    workspaceId: string,
    _allocations?: PaymentVoucherAllocationRow[]
  ): Promise<void> {
    await this.recalculateWorkspaceSupplierBillBalances(workspaceId);
  }

  /**
   * Synchronizes a Vendor Debit Note (`DN`) credit claim against a linked Supplier Bill.
   * Uses deterministic recalculation from all active DNs so saving a DN multiple times never double-counts.
   */
  static async applyDebitNoteCreditToBill(
    workspaceId: string,
    billId: string,
    _creditClaimAmount?: number
  ): Promise<SupplierBill | null> {
    const updated = await this.recalculateWorkspaceSupplierBillBalances(workspaceId);
    return updated.find((b) => b.id === billId) || null;
  }

  /**
   * Fetches all workspace commercial documents of outbound procurement types
   * ('purchase_order' | 'payment_voucher' | 'material_return_note' | 'debit_note').
   */
  static async getWorkspaceProcurementDocuments(workspaceId: string): Promise<Quotation[]> {
    const wsId = workspaceId || 'ws_default';
    const allDocs = await QuotationRepository.getQuotationsForWorkspace(wsId);
    return allDocs.filter(
      (q) =>
        !q.is_deleted &&
        (q.document_type === 'purchase_order' ||
          q.document_type === 'payment_voucher' ||
          q.document_type === 'material_return_note' ||
          q.document_type === 'debit_note')
    );
  }

  /**
   * Computes actual procurement cost rollup & realized net margin for an Enquiry or Project
   * without ever mutating the client quotation or enquiry deal value.
   */
  static computeProcurementRollup(params: {
    enquiryId?: string | null;
    projectId?: string | null;
    clientContractValueAed: number;
    estimatedCatalogCostAed: number;
    procurementDocs: Quotation[];
    supplierBills: SupplierBill[];
  }): {
    linkedPos: Quotation[];
    linkedBills: SupplierBill[];
    linkedPaymentVouchers: Quotation[];
    linkedVendorReturns: Quotation[];
    poCommittedTotalAed: number;
    landedOrBilledActualAed: number;
    debitNoteCreditsAed: number;
    netActualProcurementCostAed: number;
    totalPaidOutAed: number;
    realizedNetMarginAed: number;
    realizedNetMarginPct: number;
  } {
    const {
      enquiryId,
      projectId,
      clientContractValueAed,
      estimatedCatalogCostAed,
      procurementDocs,
      supplierBills
    } = params;

    const matchesScope = (docOrBill: { enquiry_id?: string; project_id?: string; purchase_order_metadata?: any; payment_voucher_metadata?: any; vendor_return_metadata?: any }) => {
      if (enquiryId && docOrBill.enquiry_id === enquiryId) return true;
      if (projectId) {
        if (docOrBill.project_id === projectId) return true;
        if (docOrBill.purchase_order_metadata?.project_id === projectId) return true;
        if (docOrBill.payment_voucher_metadata?.project_id === projectId) return true;
        if (docOrBill.vendor_return_metadata?.project_id === projectId) return true;
      }
      return false;
    };

    const linkedPos = procurementDocs.filter(
      (d) =>
        d.document_type === 'purchase_order' &&
        d.purchase_order_metadata?.po_variant !== 'order_acknowledgment' &&
        matchesScope(d)
    );
    const linkedPaymentVouchers = procurementDocs.filter(
      (d) => d.document_type === 'payment_voucher' && matchesScope(d)
    );
    const linkedVendorReturns = procurementDocs.filter(
      (d) =>
        (d.document_type === 'material_return_note' || d.document_type === 'debit_note') &&
        matchesScope(d)
    );

    const poIds = new Set(linkedPos.map((p) => p.id).filter(Boolean));
    const linkedBills = supplierBills.filter(
      (b) => matchesScope(b) || (b.po_id && poIds.has(b.po_id))
    );

    const toAed = (amt: number, currency?: string, exchangeRate?: number) => {
      if (exchangeRate && exchangeRate > 0 && exchangeRate !== 1) {
        return QuotationRepository.roundCurrency(amt * exchangeRate);
      }
      if ((currency || 'AED').toUpperCase() === 'USD') {
        return QuotationRepository.roundCurrency(amt * 3.6725);
      }
      return QuotationRepository.roundCurrency(amt);
    };

    const poCommittedTotalAed = QuotationRepository.roundCurrency(
      linkedPos.reduce((sum, po) => {
        const baseVal = Number(po.grand_total) || 0;
        const extraFreight = Number(po.purchase_order_metadata?.freight_customs_cost) || 0;
        return sum + toAed(baseVal + extraFreight, po.currency);
      }, 0)
    );

    const billedTotalAed = QuotationRepository.roundCurrency(
      linkedBills
        .filter((b) => b.approval_status !== 'cancelled')
        .reduce((sum, b) => sum + toAed(Number(b.grand_total) || 0, b.currency, b.exchange_rate), 0)
    );

    const debitNoteCreditsAed = QuotationRepository.roundCurrency(
      linkedVendorReturns
        .filter(
          (r) =>
            r.document_type === 'debit_note' ||
            r.vendor_return_metadata?.return_mode === 'debit_note'
        )
        .reduce((sum, r) => sum + toAed(Number(r.grand_total) || 0, r.currency), 0)
    );

    // Use billed total if supplier bills exist, else PO committed + landed freight, else fallback to estimated catalog cost
    const landedOrBilledActualAed =
      billedTotalAed > 0
        ? billedTotalAed
        : poCommittedTotalAed > 0
        ? poCommittedTotalAed
        : estimatedCatalogCostAed;

    const netActualProcurementCostAed = Math.max(
      0,
      QuotationRepository.roundCurrency(landedOrBilledActualAed - debitNoteCreditsAed)
    );

    const totalPaidOutAed = QuotationRepository.roundCurrency(
      linkedPaymentVouchers.reduce(
        (sum, pv) =>
          sum +
          toAed(
            Number(pv.payment_voucher_metadata?.amount_paid ?? pv.grand_total) || 0,
            pv.payment_voucher_metadata?.currency || pv.currency,
            pv.payment_voucher_metadata?.exchange_rate
          ),
        0
      )
    );

    const realizedNetMarginAed = QuotationRepository.roundCurrency(
      clientContractValueAed - netActualProcurementCostAed
    );
    const realizedNetMarginPct =
      clientContractValueAed > 0
        ? QuotationRepository.roundCurrency((realizedNetMarginAed / clientContractValueAed) * 100)
        : 0;

    return {
      linkedPos,
      linkedBills,
      linkedPaymentVouchers,
      linkedVendorReturns,
      poCommittedTotalAed,
      landedOrBilledActualAed,
      debitNoteCreditsAed,
      netActualProcurementCostAed,
      totalPaidOutAed,
      realizedNetMarginAed,
      realizedNetMarginPct
    };
  }

  /**
   * Convenience alias for getWorkspaceSupplierBills
   */
  static async getAllByWorkspace(workspaceId: string): Promise<SupplierBill[]> {
    const bills = await this.getWorkspaceSupplierBills(workspaceId);
    return bills.map((b) => ({
      ...b,
      vendor_company_id: b.vendor_company_id || b.supplier_id,
      vendor_name: b.vendor_name || b.supplier_name || 'Vendor',
      vendor_trn: b.vendor_trn || b.supplier_trn,
      three_way_match_status: b.three_way_match_status || b.match_status || 'no_po'
    }));
  }

  /**
   * Convenience alias for saveSupplierBill
   */
  static async save(bill: SupplierBill): Promise<SupplierBill> {
    return this.saveSupplierBill(bill);
  }

  /**
   * Convenience alias for deleteSupplierBill
   */
  static async delete(billId: string, _workspaceId?: string): Promise<void> {
    await this.deleteSupplierBill(billId, null, false);
  }

  /**
   * Subscribes to workspace Supplier Bills using a single shared Firestore onSnapshot per workspaceId
   * that maps snap.docs directly without calling getAllByWorkspace (zero redundant getDocs).
   */
  static subscribe(
    workspaceId: string,
    callback: (bills: SupplierBill[]) => void
  ): () => void {
    const wsId = workspaceId || 'ws_default';
    let active = true;

    if (!this.workspaceSubscribers.has(wsId)) {
      this.workspaceSubscribers.set(wsId, new Set());
    }
    const subs = this.workspaceSubscribers.get(wsId)!;
    subs.add(callback);

    const isQuotaSaver =
      typeof window !== 'undefined' &&
      window.localStorage?.getItem('sas_quota_saver_mode') === 'true';

    const cached = this.workspaceCache.get(wsId);
    if (cached) {
      callback([...cached.data]);
    } else if (!isQuotaSaver && db) {
      const localBills = this.readNormalizedLocalWorkspaceBills(wsId);
      if (localBills.length > 0) {
        callback(localBills);
      }
    } else {
      this.getAllByWorkspace(wsId)
        .then((list) => {
          if (active) callback(list);
        })
        .catch(() => {});
    }

    // Tear down any listener belonging to a previous/different workspaceId when switching workspaces
    for (const [otherWsId, otherUnsub] of this.activeSnapshotUnsubs.entries()) {
      if (otherWsId !== wsId) {
        this.activeSnapshotUnsubs.delete(otherWsId);
        try {
          otherUnsub();
        } catch (_) {}
      }
    }

    if (!isQuotaSaver && db && !this.activeSnapshotUnsubs.has(wsId)) {
      try {
        const q = query(
          collection(db, SUPPLIER_BILLS_COLLECTION),
          where('workspace_id', '==', wsId)
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const mergedMap = new Map<string, SupplierBill>();
            const allLocal = readLocalBills();
            const deletedIds = new Set<string>();
            const oversizedBillsToCompact: Array<{ id: string; rawData: any }> = [];
            const compactionFlagKey = `sas_enterprise_4kib_compacted_bills_v1_${wsId}`;
            const hasCompacted =
              typeof window !== 'undefined' &&
              window.localStorage?.getItem(compactionFlagKey) === 'true';

            snap.docs.forEach((d) => {
              const rawData = d.data();
              if (!hasCompacted && rawData && !rawData.is_deleted) {
                try {
                  if (JSON.stringify(rawData).length > 60000) {
                    oversizedBillsToCompact.push({ id: d.id, rawData });
                  }
                } catch (_) {}
              }
              const data = { id: d.id, ...rawData } as SupplierBill;
              if (!data.is_deleted) {
                mergedMap.set(d.id, this.normalizeBill(data));
              } else {
                deletedIds.add(d.id);
              }
            });

            if (!hasCompacted && typeof window !== 'undefined') {
              try {
                window.localStorage?.setItem(compactionFlagKey, 'true');
              } catch (_) {}
              if (oversizedBillsToCompact.length > 0) {
                Promise.resolve().then(async () => {
                  for (const { id: docId, rawData } of oversizedBillsToCompact) {
                    try {
                      const compacted = sanitizeFirestorePayload({ ...rawData, id: docId });
                      await safeSetDoc(SUPPLIER_BILLS_COLLECTION, docId, compacted);
                    } catch (_) {}
                  }
                });
              }
            }

            for (const lb of allLocal) {
              if (
                lb?.id &&
                !lb.is_deleted &&
                (lb.workspace_id === wsId || (!lb.workspace_id && wsId === 'ws_default')) &&
                !mergedMap.has(lb.id) &&
                !deletedIds.has(lb.id)
              ) {
                mergedMap.set(lb.id, this.normalizeBill(lb));
              }
            }

            // Persist merged state to local storage
            const otherWsLocal = allLocal.filter(
              (lb) => lb.workspace_id && lb.workspace_id !== wsId
            );
            const sorted = Array.from(mergedMap.values()).sort((a, b) =>
              (b.invoice_date || b.created_at || '').localeCompare(a.invoice_date || a.created_at || '')
            );
            writeLocalBills([...sorted, ...otherWsLocal]);
            this.workspaceCache.set(wsId, { data: sorted, fetchedAt: Date.now() });

            const currentSubs = this.workspaceSubscribers.get(wsId);
            if (currentSubs) {
              currentSubs.forEach((cb) => {
                try {
                  cb([...sorted]);
                } catch (_) {}
              });
            }
          },
          () => {}
        );
        this.activeSnapshotUnsubs.set(wsId, unsub);
      } catch (_) {}
    }

    return () => {
      active = false;
      const currentSubs = this.workspaceSubscribers.get(wsId);
      if (currentSubs) {
        currentSubs.delete(callback);
        // Keep the workspace singleton onSnapshot alive across tab switches & modal unmounts
      }
    };
  }

  static subscribeByWorkspace(
    workspaceId: string,
    callback: (bills: SupplierBill[]) => void
  ): () => void {
    return this.subscribe(workspaceId, callback);
  }

  /**
   * Synchronous 3-way match evaluator used inside live Bill editor modal
   */
  static evaluateThreeWayMatch(
    billLines: SupplierBillLineItem[],
    linkedPo?: Quotation | null,
    exchangeRate: number = 1
  ): {
    status: SupplierBillMatchStatus;
    summary: string;
    priceVarianceAmount: number;
    qtyVarianceCount: number;
    evaluatedLines: SupplierBillLineItem[];
  } {
    const res = this.computeThreeWayMatch(billLines, Boolean(linkedPo), exchangeRate);
    const qtyVarianceCount = res.evaluatedLines.filter((l) => l.has_qty_variance).length;
    const priceVarCount = res.evaluatedLines.filter((l) => l.has_price_variance).length;
    let summary = '3-Way Match Verified (PO = GRN = Bill)';
    if (res.matchStatus === 'no_po') {
      summary = 'Standalone Bill (No linked PO)';
    } else if (res.matchStatus === 'both_variance') {
      summary = `${priceVarCount} Price Variance(s) (${res.varianceSummary.total_variance_amount >= 0 ? '+' : ''}${res.varianceSummary.total_variance_amount.toFixed(2)}) & ${qtyVarianceCount} Qty Variance(s)`;
    } else if (res.matchStatus === 'price_variance') {
      summary = `${priceVarCount} Price Variance(s) (${res.varianceSummary.total_variance_amount >= 0 ? '+' : ''}${res.varianceSummary.total_variance_amount.toFixed(2)})`;
    } else if (res.matchStatus === 'qty_variance') {
      summary = `${qtyVarianceCount} Quantity Variance(s) vs GRN/PO`;
    }
    return {
      status: res.matchStatus,
      summary,
      priceVarianceAmount: res.varianceSummary.total_variance_amount,
      qtyVarianceCount,
      evaluatedLines: res.evaluatedLines
    };
  }

  /**
   * Synchronous duplicate vendor invoice detector across loaded bills
   */
  static findDuplicateVendorInvoice(
    bills: SupplierBill[],
    vendorId?: string,
    vendorName?: string,
    vendorInvoiceNo?: string,
    excludeBillId?: string
  ): SupplierBill | null {
    const cleanInv = (vendorInvoiceNo || '').trim().toLowerCase();
    const cleanName = (vendorName || '').trim().toLowerCase();
    const cleanId = (vendorId || '').trim().toLowerCase();
    if (!cleanInv || (!cleanName && !cleanId)) return null;

    return (
      (bills || []).find((b) => {
        if (b.is_deleted) return false;
        if (excludeBillId && b.id === excludeBillId) return false;
        const sameInv = (b.vendor_invoice_no || '').trim().toLowerCase() === cleanInv;
        if (!sameInv) return false;
        const bId = (b.vendor_company_id || b.supplier_id || '').trim().toLowerCase();
        const bName = (b.vendor_name || b.supplier_name || '').trim().toLowerCase();
        if (cleanId && bId && cleanId === bId) return true;
        if (cleanName && bName && cleanName === bName) return true;
        return false;
      }) || null
    );
  }

  static async listByWorkspace(workspaceId: string): Promise<SupplierBill[]> {
    return this.getWorkspaceSupplierBills(workspaceId);
  }

  static async recalculateBillSettlement(
    billIdOrWorkspaceId: string,
    workspaceId?: string
  ): Promise<SupplierBill[]> {
    const resolvedWsId = workspaceId || billIdOrWorkspaceId || 'ws_default';
    return this.recalculateWorkspaceSupplierBillBalances(resolvedWsId);
  }
}

// Register lifecycle hook so deleting or restoring a PV/DN in QuotationRepository automatically recalculates Supplier Bill balances
QuotationRepository.onProcurementDocLifecycleChange = async (workspaceId: string) => {
  await ProcurementRepository.recalculateWorkspaceSupplierBillBalances(workspaceId);
};


