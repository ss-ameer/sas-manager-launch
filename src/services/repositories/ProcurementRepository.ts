import {
  SupplierBill,
  SupplierBillLineItem,
  SupplierBillMatchStatus,
  SupplierBillVarianceSummary,
  Quotation,
  PaymentVoucherAllocationRow
} from '../../types';
import { db, safeSetDoc, safeUpdateDoc, safeDeleteDoc } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { QuotationRepository } from './QuotationRepository';
import { deleteFromStorageBucket, WorkspaceStorageSettings } from '../attachmentStorage';

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
  /**
   * Computes 3-Way Match status and line-level variances comparing a Supplier Bill against its linked PO and GRN quantities.
   */
  static computeThreeWayMatch(
    lines: SupplierBillLineItem[],
    hasLinkedPo: boolean
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

      // Price variance if billed unit rate differs from PO unit rate by more than 0.01
      const priceDiff = Math.abs(billedRate - poRate);
      const linePriceVar = poRate > 0 && priceDiff > 0.01;

      // Qty variance if billed qty exceeds GRN received qty (when GRN > 0) or exceeds PO ordered qty
      const referenceQty = grnQty > 0 ? grnQty : poQty;
      const lineQtyVar = referenceQty > 0 && billedQty > referenceQty + 0.0001;

      if (linePriceVar) hasPriceVariance = true;
      if (lineQtyVar) hasQtyVariance = true;

      if (linePriceVar || lineQtyVar) {
        const expectedLineVal = QuotationRepository.roundCurrency(Math.min(billedQty, referenceQty || billedQty) * poRate);
        totalVarianceAmount = QuotationRepository.roundCurrency(totalVarianceAmount + (lineTotal - expectedLineVal));
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
    const mergedMap = new Map<string, SupplierBill>();

    readLocalBills()
      .filter((b) => !b.is_deleted && (b.workspace_id === wsId || (!b.workspace_id && wsId === 'ws_default')))
      .forEach((b) => {
        if (b.id) mergedMap.set(b.id, b);
      });

    try {
      const q = query(collection(db, SUPPLIER_BILLS_COLLECTION), where('workspace_id', '==', wsId));
      const snap = await getDocs(q);
      snap.docs.forEach((d) => {
        const data = { id: d.id, ...d.data() } as SupplierBill;
        if (!data.is_deleted) {
          mergedMap.set(d.id, data);
        } else {
          mergedMap.delete(d.id);
        }
      });
    } catch (err) {
      console.warn('[ProcurementRepository] Firestore query fallback to local:', err);
    }

    return Array.from(mergedMap.values()).sort((a, b) =>
      (b.invoice_date || b.created_at || '').localeCompare(a.invoice_date || a.created_at || '')
    );
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

    const { evaluatedLines, matchStatus, varianceSummary } = this.computeThreeWayMatch(
      billInput.line_items || [],
      hasLinkedPo
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
    return fullBill;
  }

  /**
   * Soft-deletes a Supplier Bill and optionally deletes its cloud attachment if purged.
   */
  static async deleteSupplierBill(
    billId: string,
    workspaceSettings?: WorkspaceStorageSettings | null,
    permanent: boolean = false
  ): Promise<void> {
    const localList = readLocalBills();
    const target = localList.find((b) => b.id === billId);

    if (permanent) {
      if (target?.attachment?.url) {
        await deleteFromStorageBucket(target.attachment.url, workspaceSettings, target.attachment.storageKey);
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
  }

  /**
   * Synchronizes Supplier Bill paid amounts when an Outbound Payment Voucher (`PV`) is saved/issued.
   */
  static async applyPaymentVoucherAllocationsToBills(
    workspaceId: string,
    allocations: PaymentVoucherAllocationRow[]
  ): Promise<void> {
    if (!Array.isArray(allocations) || allocations.length === 0) return;

    const bills = await this.getWorkspaceSupplierBills(workspaceId);
    const billsById = new Map<string, SupplierBill>();
    bills.forEach((b) => {
      if (b.id) billsById.set(b.id, b);
    });

    for (const row of allocations) {
      if (!row.bill_id) continue;
      const bill = billsById.get(row.bill_id);
      if (!bill) continue;

      const paidThisVoucher = Math.max(0, Number(row.paid_this_voucher) || 0);
      if (paidThisVoucher <= 0) continue;

      const nextAmountPaid = QuotationRepository.roundCurrency(
        Math.min(
          bill.grand_total - (bill.credit_applied_amount || 0),
          (Number(row.previously_paid) || 0) + paidThisVoucher
        )
      );
      await this.saveSupplierBill({
        ...bill,
        amount_paid: nextAmountPaid
      });
    }
  }

  /**
   * Synchronizes a Vendor Debit Note (`DN`) credit claim against a linked Supplier Bill.
   */
  static async applyDebitNoteCreditToBill(
    workspaceId: string,
    billId: string,
    creditClaimAmount: number
  ): Promise<SupplierBill | null> {
    if (!billId || creditClaimAmount <= 0) return null;
    const bills = await this.getWorkspaceSupplierBills(workspaceId);
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return null;

    const nextCredit = QuotationRepository.roundCurrency(
      Math.min(bill.grand_total, (Number(bill.credit_applied_amount) || 0) + creditClaimAmount)
    );
    return this.saveSupplierBill({
      ...bill,
      credit_applied_amount: nextCredit
    });
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
   * Subscribes to workspace Supplier Bills with immediate hydration
   */
  static subscribe(
    workspaceId: string,
    callback: (bills: SupplierBill[]) => void
  ): () => void {
    let active = true;
    const load = () => {
      this.getAllByWorkspace(workspaceId)
        .then((list) => {
          if (active) callback(list);
        })
        .catch(() => {});
    };
    load();
    const timer = typeof window !== 'undefined' ? window.setInterval(load, 4000) : null;
    return () => {
      active = false;
      if (timer !== null && typeof window !== 'undefined') {
        window.clearInterval(timer);
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
    linkedPo?: Quotation | null
  ): {
    status: SupplierBillMatchStatus;
    summary: string;
    priceVarianceAmount: number;
    qtyVarianceCount: number;
    evaluatedLines: SupplierBillLineItem[];
  } {
    const res = this.computeThreeWayMatch(billLines, Boolean(linkedPo));
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
}

