import React, { useState, useEffect, useMemo } from 'react';
import {
  Company,
  Enquiry,
  Product,
  Project,
  QuotationDocumentRecord,
  QuotationLineItem,
  SupplierBill,
  SupplierBillLineItem,
  UserProfile,
  Workspace
} from '../types';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import { ProcurementRepository } from '../services/repositories/ProcurementRepository';
import { processPoBatchGrn } from '../services/inventoryService';
import {
  uploadWorkspaceMediaAsset,
  deleteFromStorageBucket,
  PdfCompressionPreset,
  formatByteSize
} from '../services/attachmentStorage';
import { canManageWorkspace, isAdmin, isSuperAdmin } from '../utils/permissions';
import { PageHeader, PageBody, KpiStatCard } from './layout/UiContainer';
import SearchResultCounter from './common/SearchResultCounter';
import HoverScrollText from './common/HoverScrollText';
import { FieldLabel } from './common/FieldHelpHint';
import { formatProductVariantSelectorLabel } from '../utils/productVariantFormat';
import { QuotationStudioModal } from './quotations/QuotationStudioModal';
import {
  ShoppingBag,
  PackageCheck,
  FileText,
  DollarSign,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
  Building2,
  ArrowUpRight,
  ShieldAlert,
  Lock,
  Unlock,
  Upload,
  Trash2,
  Edit2,
  Eye,
  RotateCcw,
  Calculator,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';

export interface ProcurementLaunchContext {
  action: 'create_po' | 'receive_grn' | 'record_bill' | 'record_payment' | 'view_tab';
  targetTab?: 'pos' | 'grn' | 'bills' | 'vouchers';
  vendorCompanyId?: string;
  vendorName?: string;
  poId?: string;
  billId?: string;
}

interface ProcurementPayablesHubProps {
  key?: any;
  activeWorkspace: Workspace;
  user: UserProfile;
  companies: Company[];
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  enquiries: Enquiry[];
  projects?: Project[];
  onOpenMobileMenu?: () => void;
  onSelectEnquiry?: (enquiryId: string) => void;
  onOpenCompany360?: (companyId: string) => void;
  launchContext?: ProcurementLaunchContext | null;
  onClearLaunchContext?: () => void;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export default function ProcurementPayablesHub({
  activeWorkspace,
  user,
  companies,
  products,
  setProducts,
  enquiries,
  projects = [],
  onOpenMobileMenu,
  onSelectEnquiry,
  onOpenCompany360,
  launchContext,
  onClearLaunchContext,
  triggerToast
}: ProcurementPayablesHubProps) {
  const [activeTab, setActiveTab] = useState<'pos' | 'grn' | 'bills' | 'vouchers'>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<{
    type: 'po' | 'bill' | 'voucher';
    id: string;
    refLabel: string;
    vendorName: string;
    amountLabel?: string;
  } | null>(null);
  const [isDeletingRecord, setIsDeletingRecord] = useState<boolean>(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, vendorFilter, itemsPerPage]);

  const [quotations, setQuotations] = useState<QuotationDocumentRecord[]>([]);
  const [supplierBills, setSupplierBills] = useState<SupplierBill[]>([]);

  // Studio Modal State
  const [studioOpen, setStudioOpen] = useState(false);
  const [studioEnquiry, setStudioEnquiry] = useState<Enquiry | null>(null);
  const [studioQuotation, setStudioQuotation] = useState<QuotationDocumentRecord | null>(null);

  // Standalone / Replenishment PO Creation Modal
  const [showCreatePoModal, setShowCreatePoModal] = useState(false);
  const [newPoVendorId, setNewPoVendorId] = useState('');
  const [newPoSupplierName, setNewPoSupplierName] = useState('');
  const [newPoEnquiryId, setNewPoEnquiryId] = useState('');
  const [newPoExpectedDate, setNewPoExpectedDate] = useState('');
  const [newPoLines, setNewPoLines] = useState<
    Array<{
      product_id: string;
      item_name: string;
      part_no: string;
      qty: number;
      unit: string;
      unit_cost: number;
    }>
  >([]);

  // Batch GRN Modal State
  const [grnTargetPo, setGrnTargetPo] = useState<QuotationDocumentRecord | null>(null);
  const [grnNumber, setGrnNumber] = useState('');
  const [grnReceivedDate, setGrnReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [grnFreightCustoms, setGrnFreightCustoms] = useState<number>(0);
  const [grnAllocationMode, setGrnAllocationMode] = useState<'proportional_value' | 'manual'>('proportional_value');
  const [grnUpdateCatalogCost, setGrnUpdateCatalogCost] = useState(false);
  const [grnNotes, setGrnNotes] = useState('');
  const [grnLines, setGrnLines] = useState<
    Array<{
      line_item_id: string;
      product_id?: string;
      part_no?: string;
      item_name: string;
      qty_ordered: number;
      qty_already_received: number;
      qty_receiving_now: number;
      po_unit_cost: number;
      manual_landed_cost_addition: number;
    }>
  >([]);
  const [isSubmittingGrn, setIsSubmittingGrn] = useState(false);

  // Supplier Bill Modal State
  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<SupplierBill | null>(null);
  const [billVendorId, setBillVendorId] = useState('');
  const [billVendorName, setBillVendorName] = useState('');
  const [billVendorTrn, setBillVendorTrn] = useState('');
  const [billPoId, setBillPoId] = useState('');
  const [billVendorInvoiceNo, setBillVendorInvoiceNo] = useState('');
  const [billInvoiceDate, setBillInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billDueDate, setBillDueDate] = useState('');
  const [billCurrency, setBillCurrency] = useState(activeWorkspace?.document_profile?.default_currency || 'AED');
  const [billExchangeRate, setBillExchangeRate] = useState<number>(1);
  const [billFreightCustoms, setBillFreightCustoms] = useState<number>(0);
  const [billTaxAmount, setBillTaxAmount] = useState<number>(0);
  const [billIsOnHold, setBillIsOnHold] = useState(false);
  const [billHoldReason, setBillHoldReason] = useState('');
  const [billNotes, setBillNotes] = useState('');
  const [billLines, setBillLines] = useState<SupplierBillLineItem[]>([]);
  const [billAttachment, setBillAttachment] = useState<SupplierBill['attachment'] | undefined>(undefined);
  const [pdfPreset, setPdfPreset] = useState<PdfCompressionPreset>('standard');
  const [isUploadingBillFile, setIsUploadingBillFile] = useState(false);
  const [isSavingBill, setIsSavingBill] = useState(false);
  const [viewingBillSummary, setViewingBillSummary] = useState<SupplierBill | null>(null);
  const [viewingPoSummary, setViewingPoSummary] = useState<QuotationDocumentRecord | null>(null);

  // Issue Payment Voucher Pre-Launch Modal State
  const [showCreatePvModal, setShowCreatePvModal] = useState(false);
  const [pvSettlementType, setPvSettlementType] = useState<'single_bill' | 'multi_bill' | 'vendor_advance'>('single_bill');
  const [pvVendorId, setPvVendorId] = useState('');
  const [pvPayeeName, setPvPayeeName] = useState('');
  const [pvPoId, setPvPoId] = useState('');
  const [pvSelectedBills, setPvSelectedBills] = useState<Record<string, number>>({});
  const [pvPaymentDate, setPvPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [pvPaymentMethod, setPvPaymentMethod] = useState<
    'Bank Transfer / TT' | 'Cheque' | 'Cash' | 'Corporate Card' | 'Letter of Credit (LC)' | 'Online'
  >('Bank Transfer / TT');
  const [pvReferenceNo, setPvReferenceNo] = useState('');
  const [pvAmountPaid, setPvAmountPaid] = useState<number>(0);
  const [pvNarration, setPvNarration] = useState('');

  // Issue Material Return (MRN) / Debit Note (DN) Pre-Launch Modal State
  const [showCreateReturnModal, setShowCreateReturnModal] = useState(false);
  const [retMode, setRetMode] = useState<'material_return_note' | 'debit_note'>('material_return_note');
  const [retVendorId, setRetVendorId] = useState('');
  const [retSupplierName, setRetSupplierName] = useState('');
  const [retPoId, setRetPoId] = useState('');
  const [retBillId, setRetBillId] = useState('');
  const [retReason, setRetReason] = useState<
    | 'Defective / Damaged'
    | 'Wrong Item Supplied'
    | 'Excess Quantity'
    | 'Quality Rejection'
    | 'Commercial Price Adjustment'
    | 'Other'
  >('Defective / Damaged');
  const [retResolution, setRetResolution] = useState<
    'Replacement Required' | 'Credit / Bill Deduction' | 'Refund Requested'
  >('Credit / Bill Deduction');
  const [retLines, setRetLines] = useState<
    Array<{
      product_id?: string;
      item_name: string;
      part_no: string;
      qty: number;
      unit: string;
      unit_cost: number;
    }>
  >([]);
  const [isCreatingPo, setIsCreatingPo] = useState(false);
  const [isCreatingPv, setIsCreatingPv] = useState(false);
  const [isCreatingReturn, setIsCreatingReturn] = useState(false);

  const formatBillVarianceSummary = (bill?: Partial<SupplierBill> | null): string => {
    if (!bill) return '';
    const vs: any = bill.variance_summary;
    if (typeof vs === 'string' && vs.trim()) return vs.trim();
    if (vs && typeof vs === 'object') {
      const curr = bill.currency || 'AED';
      const totalVar = Number(vs.total_variance_amount || 0);
      const parts: string[] = [];
      if (vs.has_price_variance) parts.push('Price Variance');
      if (vs.has_qty_variance) parts.push('Qty Variance');
      if (parts.length > 0 || Math.abs(totalVar) > 0.005) {
        return `${parts.length > 0 ? parts.join(' & ') : 'Variance'}: ${curr} ${totalVar >= 0 ? '+' : ''}${totalVar.toFixed(2)}`;
      }
      return '3-Way Match Verified (PO = GRN = Bill)';
    }
    return bill.discrepancy_notes || '';
  };

  const userIsAdmin = useMemo(
    () => isAdmin(user, activeWorkspace?.id, activeWorkspace) || isSuperAdmin(user),
    [user, activeWorkspace]
  );

  const canViewConfidentialMargins = useMemo(
    () =>
      canManageWorkspace(user, activeWorkspace) ||
      isAdmin(user, activeWorkspace?.id, activeWorkspace) ||
      isSuperAdmin(user),
    [user, activeWorkspace]
  );

  useEffect(() => {
    if (!activeWorkspace?.id) return;
    const unsubQuotes = QuotationRepository.subscribeByWorkspace(activeWorkspace.id, (records) => {
      setQuotations(records.filter((r) => !r.is_deleted));
    });
    const unsubBills = ProcurementRepository.subscribeByWorkspace(activeWorkspace.id, (records) => {
      setSupplierBills(records.filter((b) => !b.is_deleted));
    });
    return () => {
      unsubQuotes();
      unsubBills();
    };
  }, [activeWorkspace?.id]);

  const supplierPOs = useMemo(
    () =>
      quotations.filter(
        (q) =>
          q.document_type === 'purchase_order' &&
          (q.purchase_order_metadata?.po_variant || 'supplier_po') === 'supplier_po'
      ),
    [quotations]
  );

  const paymentVouchersAndReturns = useMemo(
    () =>
      quotations.filter((q) => {
        const isVoucherOrReturn =
          q.document_type === 'payment_voucher' ||
          q.document_type === 'material_return_note' ||
          (q.document_type as string) === 'material_return' ||
          q.document_type === 'debit_note';
        if (!isVoucherOrReturn) return false;
        const isMrn =
          q.document_type === 'material_return_note' ||
          (q.document_type as string) === 'material_return';
        if (isMrn) return true;
        const amt =
          q.document_type === 'payment_voucher'
            ? Number(
                q.payment_voucher_metadata?.amount_paid ??
                  q.financial_totals?.grand_total ??
                  q.grand_total ??
                  0
              )
            : Number(q.financial_totals?.grand_total ?? q.grand_total ?? 0);
        const vName = (
          q.payment_voucher_metadata?.payee_name ||
          q.payment_voucher_metadata?.paid_to_vendor_name ||
          q.vendor_return_metadata?.supplier_name ||
          q.vendor_return_metadata?.vendor_name ||
          q.client_snapshot?.entity_name ||
          ''
        ).trim();
        // Auto-hide legacy zero-value dummy test records
        if (
          amt === 0 &&
          (!vName || vName === 'Vendor / Supplier' || vName === 'Vendor')
        ) {
          return false;
        }
        return true;
      }),
    [quotations]
  );

  const getCompanyName = (c?: Company | null): string =>
    (c?.display_name || c?.canonical_name || c?.name || '').trim();

  const vendors = useMemo(
    () =>
      companies
        .filter((c) => !c.is_deleted && getCompanyName(c) !== '')
        .sort((a, b) => {
          const aV = a.relationship_type === 'Vendor / Supplier' ? 0 : 1;
          const bV = b.relationship_type === 'Vendor / Supplier' ? 0 : 1;
          return aV - bV || getCompanyName(a).localeCompare(getCompanyName(b));
        }),
    [companies]
  );

  // KPI Metrics (including all active non-cancelled POs with unreceived quantities)
  const kpiStats = useMemo(() => {
    const activePos = supplierPOs.filter((po) => {
      const st = String(po.status || '').toLowerCase();
      return st !== 'cancelled' && st !== 'rejected';
    });
    const openPos = activePos.filter((po) => {
      if ((po.purchase_order_metadata?.receiving_status || 'Pending Receipt') === 'Fully Received') {
        return false;
      }
      const hasUnreceived = (po.line_items || []).some((li: any) => {
        const ordered = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
        const received = Number(li.qty_received) || 0;
        return ordered > received;
      });
      return hasUnreceived || (po.line_items || []).length === 0;
    });
    const pendingGrnCount = activePos.reduce((acc, po) => {
      if ((po.purchase_order_metadata?.receiving_status || 'Pending Receipt') === 'Fully Received') {
        return acc;
      }
      const pendingLines = (po.line_items || []).filter((li: any) => {
        const ordered = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
        const received = Number(li.qty_received) || 0;
        return ordered > received;
      });
      return acc + pendingLines.length;
    }, 0);
    const unpaidBills = supplierBills.filter(
      (b) => b.payment_status !== 'paid' && b.approval_status !== 'cancelled'
    );
    const totalPayables = unpaidBills.reduce((sum, b) => {
      const bal = Number(b.balance_due) || 0;
      const exRate = Number(b.exchange_rate) > 0 ? Number(b.exchange_rate) : 1;
      return sum + bal * exRate;
    }, 0);
    const varianceBillsCount = supplierBills.filter(
      (b) =>
        b.three_way_match_status === 'price_variance' ||
        b.three_way_match_status === 'qty_variance' ||
        b.three_way_match_status === 'both_variance'
    ).length;

    return {
      openPoCount: openPos.length,
      pendingGrnCount,
      unpaidBillCount: unpaidBills.length,
      totalPayables: QuotationRepository.roundCurrency(totalPayables),
      varianceBillsCount
    };
  }, [supplierPOs, supplierBills]);

  const defaultCurrency = activeWorkspace?.document_profile?.default_currency || 'AED';

  // Build synthetic Enquiry wrapper when opening standalone PO/PV/MRN in Studio
  const buildStudioEnquiryWrapper = (docRecord: QuotationDocumentRecord): Enquiry => {
    const linkedEnq = enquiries.find((e) => e.id === docRecord.enquiry_id);
    if (linkedEnq) return linkedEnq;
    return {
      id: docRecord.enquiry_id || `standalone_${docRecord.id}`,
      sn: docRecord.enquiry_sn || 0,
      workspace_id: activeWorkspace.id,
      enquiry_date: (docRecord.created_at || new Date().toISOString()).slice(0, 10),
      company_id:
        docRecord.purchase_order_metadata?.vendor_company_id ||
        docRecord.payment_voucher_metadata?.vendor_company_id ||
        docRecord.vendor_return_metadata?.vendor_company_id ||
        '',
      company_name:
        docRecord.purchase_order_metadata?.supplier_name ||
        docRecord.payment_voucher_metadata?.payee_name ||
        docRecord.vendor_return_metadata?.supplier_name ||
        docRecord.client_snapshot?.entity_name ||
        'Vendor / Supplier',
      contact_person_name:
        docRecord.purchase_order_metadata?.supplier_contact ||
        docRecord.client_snapshot?.attention_to ||
        '',
      country: '',
      project_location: '',
      quote_ref_no: docRecord.formatted_quote_ref || docRecord.quote_number || '',
      value_aed: 0,
      description: docRecord.quotation_subject || 'Stock Replenishment / Procurement Document',
      enquiry_source: 'Direct',
      status: 'Active',
      salesperson_id: '',
      sales_person: user.initials || 'PR',
      line_items:
        docRecord.document_type === 'payment_voucher'
          ? []
          : (docRecord.line_items || []).map((li: any) => {
              const resolvedQty = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 1;
              return {
                id: li.id,
                product_id: li.product_id,
                product_type: 'Standard',
                item_name: li.item_name || li.description,
                part_no: li.part_no || '',
                brand_make: li.brand || li.brand_make || '',
                description: li.description,
                quantity: resolvedQty,
                qty: resolvedQty,
                unit: li.unit || 'pcs',
                unit_price: Number(li.unit_price) || 0,
                cost_price: li.cost_price ?? li.unit_price,
                total_price: Number(li.total_price ?? li.line_total) || 0
              };
            })
    };
  };

  const handleOpenInStudio = (docRecord: QuotationDocumentRecord) => {
    setStudioEnquiry(buildStudioEnquiryWrapper(docRecord));
    setStudioQuotation(docRecord);
    setStudioOpen(true);
  };

  // Open GRN Modal for a PO
  const handleOpenGrnModal = (po: QuotationDocumentRecord) => {
    const baseRef = po.purchase_order_metadata?.po_ref || po.formatted_quote_ref;
    const existingGrns =
      (po.purchase_order_metadata as any)?.linked_grn_refs ||
      po.purchase_order_metadata?.linked_grn_numbers ||
      [];
    const nextGrnSeq = String(existingGrns.length + 1).padStart(2, '0');
    setGrnTargetPo(po);
    setGrnNumber(`GRN-${baseRef.replace(/^PO-/i, '')}-${nextGrnSeq}`);
    setGrnReceivedDate(new Date().toISOString().slice(0, 10));
    setGrnFreightCustoms(0);
    setGrnAllocationMode('proportional_value');
    setGrnUpdateCatalogCost(false);
    setGrnNotes('');
    setGrnLines(
      (po.line_items || []).map((li: any) => {
        const ordered = Math.max(0, Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0);
        const received = Math.max(0, Number(li.qty_received) || 0);
        const pending = Math.max(0, ordered - received);
        return {
          line_item_id: li.id,
          product_id: li.product_id,
          part_no: li.part_no,
          item_name: li.item_name || li.description || 'Item',
          qty_ordered: ordered,
          qty_already_received: received,
          qty_receiving_now: pending,
          po_unit_cost: Number(li.unit_price) || 0,
          manual_landed_cost_addition: 0
        };
      })
    );
  };

  // Live Landed Cost Preview in GRN Modal
  const grnLandedPreview = useMemo(() => {
    const totalBatchValue = grnLines.reduce(
      (s, l) => s + Math.max(0, l.qty_receiving_now) * Math.max(0, l.po_unit_cost),
      0
    );
    const totalBatchQty = grnLines.reduce((s, l) => s + Math.max(0, l.qty_receiving_now), 0);

    return grnLines.map((l) => {
      const qtyNow = Math.max(0, l.qty_receiving_now);
      const unitCost = Math.max(0, l.po_unit_cost);
      const lineVal = qtyNow * unitCost;
      let allocatedFreight = 0;
      if (qtyNow > 0) {
        if (grnAllocationMode === 'manual') {
          allocatedFreight = Math.max(0, Number(l.manual_landed_cost_addition || 0));
        } else if (grnFreightCustoms > 0) {
          if (totalBatchValue > 0) {
            allocatedFreight = grnFreightCustoms * (lineVal / totalBatchValue);
          } else if (totalBatchQty > 0) {
            allocatedFreight = grnFreightCustoms * (qtyNow / totalBatchQty);
          }
        }
      }
      const perUnitAdd = qtyNow > 0 ? allocatedFreight / qtyNow : 0;
      return {
        ...l,
        allocatedFreight: QuotationRepository.roundCurrency(allocatedFreight),
        landedUnitCost: QuotationRepository.roundCurrency(unitCost + perUnitAdd)
      };
    });
  }, [grnLines, grnFreightCustoms, grnAllocationMode]);

  const handleConfirmGrn = async () => {
    if (!grnTargetPo) return;
    setIsSubmittingGrn(true);
    try {
      const effectiveGrnNo = grnNumber.trim() || `GRN-${Date.now().toString().slice(-5)}`;
      const res = await processPoBatchGrn(
        {
          workspace_id: activeWorkspace.id,
          po_id: grnTargetPo.id || '',
          po_ref: grnTargetPo.purchase_order_metadata?.po_ref || grnTargetPo.formatted_quote_ref,
          grn_number: effectiveGrnNo,
          received_date: grnReceivedDate,
          supplier_id: grnTargetPo.purchase_order_metadata?.vendor_company_id || grnTargetPo.purchase_order_metadata?.supplier_id,
          supplier_name: grnTargetPo.purchase_order_metadata?.supplier_name || grnTargetPo.client_snapshot?.entity_name || 'Vendor',
          delivery_note_ref: effectiveGrnNo,
          freight_customs_cost: grnFreightCustoms,
          allocation_mode: grnAllocationMode === 'manual' ? 'manual_override' : 'proportional_value',
          update_base_catalog_cost: grnUpdateCatalogCost,
          notes: grnNotes,
          lines: grnLandedPreview.map((l, idx) => ({
            line_index: idx,
            product_id: l.product_id,
            sku: l.part_no,
            item_name: l.item_name,
            qty_ordered: l.qty_ordered,
            qty_previously_received: l.qty_already_received,
            qty_receiving_now: l.qty_receiving_now,
            po_unit_cost: l.po_unit_cost,
            allocated_freight_cost: l.allocatedFreight,
            manual_landed_cost_override: grnAllocationMode === 'manual' ? l.landedUnitCost : undefined,
            landed_unit_cost: l.landedUnitCost
          }))
        },
        grnTargetPo as any,
        user
      );

      if (!res.success) {
        triggerToast?.(res.error || 'Failed to record stock receipt.', 'error');
        return;
      }

      if (res.updatedProducts.length > 0) {
        setProducts((prev) =>
          prev.map((p) => {
            const match = res.updatedProducts.find((u) => u.productId === p.id);
            if (!match) return p;
            return {
              ...p,
              is_inventoried: true,
              stock_on_hand: match.newOnHand,
              last_landed_cost: match.landedUnitCost,
              last_grn_ref: effectiveGrnNo,
              ...(match.updatedBaseCost !== undefined ? { cost_price: match.updatedBaseCost } : {})
            };
          })
        );
      }

      triggerToast?.(
        `GRN ${effectiveGrnNo} recorded (${res.receivingStatus}). Stock & landed cost updated.`,
        'success'
      );
      setGrnTargetPo(null);
    } catch (err: any) {
      triggerToast?.(err?.message || 'Error processing GRN', 'error');
    } finally {
      setIsSubmittingGrn(false);
    }
  };

  // Create Standalone or Enquiry-Linked Supplier PO
  const handleCreateSupplierPo = async (openInStudio = true) => {
    if (isCreatingPo) return;
    const selectedVendor = companies.find((c) => c.id === newPoVendorId);
    const supplierName = (getCompanyName(selectedVendor) || newPoSupplierName || '').trim();
    if (!supplierName) {
      triggerToast?.('Please select or enter a Supplier / Vendor name.', 'error');
      return;
    }

    const linkedEnq = enquiries.find((e) => e.id === newPoEnquiryId);
    const poSeq = String(supplierPOs.length + 1).padStart(4, '0');
    const poRef = linkedEnq
      ? `PO-${String(linkedEnq.sn || 1).padStart(4, '0')}-${String(
          supplierPOs.filter((p) => p.enquiry_id === linkedEnq.id).length + 1
        ).padStart(2, '0')}`
      : `PO-STK-${poSeq}`;

    const primaryContact =
      (selectedVendor?.contacts || []).find((ct) => ct.is_primary) || (selectedVendor?.contacts || [])[0];

    const lineItems: QuotationLineItem[] = newPoLines
      .filter((l) => l.item_name.trim() !== '')
      .map((l, idx) => {
        const prod = products.find((p) => p.id === l.product_id);
        const qty = Math.max(1, Number(l.qty) || 1);
        const rate = Math.max(0, Number(l.unit_cost) || 0);
        const lineSub = QuotationRepository.roundCurrency(qty * rate);
        return {
          id: `poli_${Date.now()}_${idx}`,
          sr_no: idx + 1,
          product_id: l.product_id || undefined,
          part_no: l.part_no || prod?.part_no || '',
          item_name: l.item_name || prod?.name || 'Item',
          brand: prod?.brand || '',
          description: prod?.description || l.item_name,
          quantity: qty,
          qty,
          qty_ordered: qty,
          qty_received: 0,
          qty_pending: qty,
          unit: l.unit || prod?.unit || 'Nos',
          unit_price: rate,
          cost_price: rate,
          discount_Type: 'none',
          discount_value: 0,
          tax_rate: 5,
          total_price: lineSub,
          line_subtotal: lineSub,
          line_total: lineSub
        } as any;
      });

    if (lineItems.length === 0) {
      triggerToast?.('Please add at least one PO line item.', 'error');
      return;
    }

    const totals = QuotationRepository.calculateFinancialTotals(lineItems, 'taxes_extra', 0);
    const nowIso = new Date().toISOString();
    const recordId = `qdoc_po_${Date.now()}`;

    const newPoRecord: QuotationDocumentRecord = {
      id: recordId,
      workspace_id: activeWorkspace.id,
      enquiry_id: linkedEnq?.id || `standalone_${recordId}`,
      enquiry_sn: linkedEnq?.sn || 0,
      document_type: 'purchase_order',
      quote_number: poRef,
      formatted_quote_ref: poRef,
      revision_no: 0,
      status: 'issued',
      quotation_date: nowIso.slice(0, 10),
      valid_until_date: newPoExpectedDate || nowIso.slice(0, 10),
      client_reference: linkedEnq ? `ENQ #${linkedEnq.sn}` : 'Stock Replenishment',
      quotation_subject: linkedEnq
        ? `Supplier Purchase Order — ${linkedEnq.description || linkedEnq.company_name}`
        : `Warehouse Stock Replenishment PO — ${supplierName}`,
      currency: selectedVendor?.default_currency || defaultCurrency,
      tax_mode: 'taxes_extra',
      show_brand_column: true,
      show_part_no_column: true,
      show_discount_column: false,
      show_tax_column: false,
      show_item_images: false,
      company_letterhead_snapshot: {
        company_name: activeWorkspace.document_profile?.company_legal_name || activeWorkspace.name,
        company_subtitle: activeWorkspace.document_profile?.company_tagline || '',
        address_line_1: activeWorkspace.document_profile?.company_address || '',
        address_line_2: '',
        phone: activeWorkspace.document_profile?.company_phone || '',
        email: activeWorkspace.document_profile?.company_email || '',
        website: activeWorkspace.document_profile?.company_website || '',
        tax_registration_label: activeWorkspace.document_profile?.tax_registration_label || 'TRN',
        tax_registration_no: activeWorkspace.document_profile?.tax_registration_no || '',
        logo_text: activeWorkspace.name.slice(0, 10).toUpperCase(),
        accent_color: activeWorkspace.document_profile?.brand_accent_color || '#1e3a8a',
        logo_url: activeWorkspace.document_profile?.logo_url || ''
      },
      client_snapshot: {
        entity_name: supplierName,
        attention_to: primaryContact?.name || '',
        designation: primaryContact?.role || '',
        address: [selectedVendor?.address, selectedVendor?.city, selectedVendor?.country]
          .filter(Boolean)
          .join(', '),
        phone: primaryContact?.phone || selectedVendor?.phone || '',
        email: primaryContact?.email || selectedVendor?.email || '',
        tax_registration_no: selectedVendor?.tax_registration_no || ''
      },
      purchase_order_metadata: {
        po_variant: 'supplier_po',
        po_ref: poRef,
        po_date: nowIso.slice(0, 10),
        vendor_company_id: selectedVendor?.id,
        supplier_name: supplierName,
        supplier_contact: primaryContact?.name || '',
        supplier_email: primaryContact?.email || selectedVendor?.email || '',
        supplier_phone: primaryContact?.phone || selectedVendor?.phone || '',
        supplier_address: [selectedVendor?.address, selectedVendor?.city, selectedVendor?.country]
          .filter(Boolean)
          .join(', '),
        supplier_trn: selectedVendor?.tax_registration_no || '',
        shipping_destination: 'Warehouse',
        incoterms: selectedVendor?.default_incoterms || 'Ex-Works',
        expected_delivery_date: newPoExpectedDate || undefined,
        receiving_status: 'Pending Receipt',
        beneficiary_bank_details: selectedVendor?.vendor_bank_details
          ? { ...selectedVendor.vendor_bank_details }
          : undefined
      },
      line_items: lineItems,
      subtotal: totals.items_subtotal,
      tax_amount: totals.tax_amount,
      grand_total: totals.grand_total,
      financial_totals: totals,
      terms_blocks: {
        price_basis: selectedVendor?.default_incoterms || 'Ex-Works',
        delivery_schedule: newPoExpectedDate ? `Expected by ${newPoExpectedDate}` : 'As agreed',
        payment_terms: selectedVendor?.default_payment_terms || '30 Days from Invoice / GRN',
        validity_period: '30 Days',
        warranty_terms: 'Standard Manufacturer Warranty',
        packing_forwarding: 'Included in unit cost',
        general_exclusions: '',
        additional_notes: ''
      },
      signatory_block: {
        prepared_by_name: user.full_name || user.username || 'Procurement',
        prepared_by_designation: 'Procurement',
        authorized_signatory_name: '',
        authorized_signatory_designation: 'Authorized Signatory',
        show_company_stamp_placeholder: true,
        show_client_acceptance_block: true
      },
      annexes: [],
      created_at: nowIso,
      created_by: user.full_name || user.email || 'User',
      updated_at: nowIso
    };

    setIsCreatingPo(true);
    try {
      await QuotationRepository.save(newPoRecord);
      setShowCreatePoModal(false);
      triggerToast?.(`Supplier PO ${poRef} saved. Pending GRN lines ready for receipt.`, 'success');
      if (openInStudio) {
        handleOpenInStudio(newPoRecord);
      }
    } finally {
      setIsCreatingPo(false);
    }
  };

  // Open Record / Edit Supplier Bill Modal
  const handleOpenBillModal = (po?: QuotationDocumentRecord, existing?: SupplierBill) => {
    if (existing) {
      setEditingBill(existing);
      setBillVendorId(existing.vendor_company_id || '');
      setBillVendorName(existing.vendor_name);
      setBillVendorTrn(existing.vendor_trn || '');
      setBillPoId(existing.po_id || '');
      setBillVendorInvoiceNo(existing.vendor_invoice_no);
      setBillInvoiceDate(existing.invoice_date);
      setBillDueDate(existing.due_date || '');
      setBillCurrency(existing.currency || defaultCurrency);
      setBillExchangeRate(existing.exchange_rate || 1);
      setBillFreightCustoms(existing.freight_customs_amount || 0);
      setBillTaxAmount(existing.tax_amount || 0);
      setBillIsOnHold(Boolean(existing.is_on_hold));
      setBillHoldReason(existing.hold_reason || '');
      setBillNotes(existing.notes || '');
      setBillLines(existing.line_items || []);
      setBillAttachment(existing.attachment);
      setShowBillModal(true);
      return;
    }

    setEditingBill(null);
    const poMeta = po?.purchase_order_metadata;
    setBillVendorId(poMeta?.vendor_company_id || '');
    setBillVendorName(poMeta?.supplier_name || '');
    setBillVendorTrn(poMeta?.supplier_trn || '');
    setBillPoId(po?.id || '');
    setBillVendorInvoiceNo('');
    setBillInvoiceDate(new Date().toISOString().slice(0, 10));
    setBillDueDate('');
    setBillCurrency(po?.currency || defaultCurrency);
    setBillExchangeRate(1);
    setBillFreightCustoms(0);

    const mappedLines: SupplierBillLineItem[] = (po?.line_items || []).map((li: any) => {
      const poQty = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
      const grnQty = Number(li.qty_received ?? poQty) || 0;
      const billedQty = grnQty > 0 ? grnQty : poQty;
      const unitCost = Number(li.unit_price) || 0;
      return {
        id: `bline_${li.id}`,
        po_line_item_id: li.id,
        product_id: li.product_id,
        part_no: li.part_no,
        item_name: li.item_name || li.description || 'Item',
        unit: li.unit || 'Nos',
        po_qty: poQty,
        grn_qty: grnQty,
        billed_qty: billedQty,
        po_unit_cost: unitCost,
        billed_unit_cost: unitCost,
        tax_rate: Number(li.tax_rate) || 5,
        line_total: QuotationRepository.roundCurrency(billedQty * unitCost)
      };
    });

    const sub = mappedLines.reduce((s, l) => s + l.line_total, 0);
    setBillLines(mappedLines);
    setBillTaxAmount(QuotationRepository.roundCurrency(sub * 0.05));
    setBillIsOnHold(false);
    setBillHoldReason('');
    setBillNotes('');
    setBillAttachment(undefined);
    setShowBillModal(true);
  };

  // Populate Bill Lines when selecting a PO inside the Bill modal
  const handleSelectBillPo = (poId: string) => {
    setBillPoId(poId);
    const po = supplierPOs.find((p) => p.id === poId);
    if (!po) return;
    const poMeta = po.purchase_order_metadata;
    if (poMeta?.vendor_company_id) setBillVendorId(poMeta.vendor_company_id);
    if (poMeta?.supplier_name) setBillVendorName(poMeta.supplier_name);
    if (poMeta?.supplier_trn) setBillVendorTrn(poMeta.supplier_trn);
    if (po.currency) setBillCurrency(po.currency);

    const mappedLines: SupplierBillLineItem[] = (po.line_items || []).map((li: any) => {
      const poQty = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
      const grnQty = Number(li.qty_received ?? poQty) || 0;
      const billedQty = grnQty > 0 ? grnQty : poQty;
      const unitCost = Number(li.unit_price) || 0;
      return {
        id: `bline_${li.id}`,
        po_line_item_id: li.id,
        product_id: li.product_id,
        part_no: li.part_no,
        item_name: li.item_name || li.description || 'Item',
        unit: li.unit || 'Nos',
        po_qty: poQty,
        grn_qty: grnQty,
        billed_qty: billedQty,
        po_unit_cost: unitCost,
        billed_unit_cost: unitCost,
        tax_rate: Number(li.tax_rate) || 5,
        line_total: QuotationRepository.roundCurrency(billedQty * unitCost)
      };
    });
    const sub = mappedLines.reduce((s, l) => s + l.line_total, 0);
    setBillLines(mappedLines);
    setBillTaxAmount(QuotationRepository.roundCurrency(sub * 0.05));
  };

  // Live 3-Way Match Evaluation in Bill Modal
  const liveThreeWayMatch = useMemo(() => {
    const linkedPo = supplierPOs.find((p) => p.id === billPoId) || null;
    return ProcurementRepository.evaluateThreeWayMatch(
      billLines,
      linkedPo,
      Number(billExchangeRate) > 0 ? Number(billExchangeRate) : 1
    );
  }, [billLines, billPoId, supplierPOs, billExchangeRate]);

  // Duplicate Vendor Invoice Check
  const duplicateBillWarning = useMemo(() => {
    if (!billVendorInvoiceNo.trim() || !billVendorName.trim()) return null;
    return ProcurementRepository.findDuplicateVendorInvoice(
      supplierBills,
      billVendorId || undefined,
      billVendorName,
      billVendorInvoiceNo,
      editingBill?.id
    );
  }, [supplierBills, billVendorId, billVendorName, billVendorInvoiceNo, editingBill]);

  const handleUploadBillAttachment = async (file: File) => {
    setIsUploadingBillFile(true);
    try {
      const res = await uploadWorkspaceMediaAsset(
        file,
        'procurement/bills',
        activeWorkspace,
        {
          pdfCompressionPreset: pdfPreset,
          previousUrlToDelete: billAttachment?.url
        }
      );
      setBillAttachment({
        name: file.name,
        url: res.url,
        size: res.size,
        original_size_bytes: res.originalSize,
        compressed_size_bytes: res.size,
        compression_preset: pdfPreset,
        type: file.type,
        storage_provider: res.storageProvider,
        uploaded_at: new Date().toISOString()
      });
      triggerToast?.(
        res.compressionBadgeText
          ? `Uploaded (${res.compressionBadgeText})`
          : 'Vendor invoice attached.',
        'success'
      );
    } catch (err: any) {
      triggerToast?.(err?.message || 'Failed to upload invoice attachment.', 'error');
    } finally {
      setIsUploadingBillFile(false);
    }
  };

  const handleSaveSupplierBill = async () => {
    if (!billVendorName.trim() || !billVendorInvoiceNo.trim()) {
      triggerToast?.('Vendor Name and Vendor Invoice # are required.', 'error');
      return;
    }
    if (duplicateBillWarning) {
      triggerToast?.(
        `Duplicate Vendor Invoice # (${billVendorInvoiceNo}) already exists on ${duplicateBillWarning.bill_number}.`,
        'error'
      );
      return;
    }

    setIsSavingBill(true);
    try {
      const linkedPo = supplierPOs.find((p) => p.id === billPoId);
      const subtotal = QuotationRepository.roundCurrency(
        billLines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)
      );
      const grandTotal = QuotationRepository.roundCurrency(
        subtotal + (Number(billTaxAmount) || 0) + (Number(billFreightCustoms) || 0)
      );
      const prevPaid = Number(editingBill?.amount_paid) || 0;
      const credits = Number(editingBill?.credit_applied_amount) || 0;
      const balanceDue = Math.max(0, QuotationRepository.roundCurrency(grandTotal - credits - prevPaid));

      const nowIso = new Date().toISOString();
      const billSeq = String(supplierBills.length + 1).padStart(4, '0');
      const hasVariance =
        liveThreeWayMatch.status === 'price_variance' ||
        liveThreeWayMatch.status === 'qty_variance' ||
        liveThreeWayMatch.status === 'both_variance';

      const billRecord: SupplierBill = {
        id: editingBill?.id || `sbill_${Date.now()}`,
        workspace_id: activeWorkspace.id,
        bill_number: editingBill?.bill_number || `BILL-${billSeq}`,
        vendor_invoice_no: billVendorInvoiceNo.trim(),
        vendor_company_id: billVendorId || undefined,
        vendor_name: billVendorName.trim(),
        vendor_trn: billVendorTrn.trim() || undefined,
        po_id: linkedPo?.id,
        po_ref: linkedPo?.purchase_order_metadata?.po_ref || linkedPo?.formatted_quote_ref,
        enquiry_id:
          linkedPo?.enquiry_id && !linkedPo.enquiry_id.startsWith('standalone_')
            ? linkedPo.enquiry_id
            : undefined,
        grn_refs:
          (linkedPo?.purchase_order_metadata as any)?.linked_grn_refs ||
          linkedPo?.purchase_order_metadata?.linked_grn_numbers ||
          [],
        invoice_date: billInvoiceDate,
        due_date: billDueDate || undefined,
        currency: billCurrency,
        exchange_rate: Number(billExchangeRate) || 1,
        subtotal,
        tax_amount: QuotationRepository.roundCurrency(billTaxAmount),
        freight_customs_amount: QuotationRepository.roundCurrency(billFreightCustoms),
        grand_total: grandTotal,
        credit_applied_amount: credits,
        amount_paid: prevPaid,
        balance_due: balanceDue,
        approval_status: editingBill?.approval_status || (hasVariance ? 'under_review' : 'approved'),
        payment_status:
          balanceDue <= 0.005 ? 'paid' : prevPaid > 0 ? 'partially_paid' : 'unpaid',
        is_on_hold: billIsOnHold,
        hold_reason: billIsOnHold ? billHoldReason.trim() || '3-Way Match Variance Review' : undefined,
        three_way_match_status: liveThreeWayMatch.status,
        variance_summary: liveThreeWayMatch.summary,
        price_variance_amount: liveThreeWayMatch.priceVarianceAmount,
        qty_variance_count: liveThreeWayMatch.qtyVarianceCount,
        line_items: billLines,
        attachment: billAttachment,
        notes: billNotes.trim() || undefined,
        created_at: editingBill?.created_at || nowIso,
        created_by: editingBill?.created_by || user.full_name || user.email || 'User',
        updated_at: nowIso
      };

      await ProcurementRepository.save(billRecord);
      setShowBillModal(false);
      triggerToast?.(`Supplier Bill ${billRecord.bill_number} saved.`, 'success');
    } catch (err: any) {
      triggerToast?.(err?.message || 'Failed to save Supplier Bill.', 'error');
    } finally {
      setIsSavingBill(false);
    }
  };

  // Open Pre-Launch Modal for Outbound Payment Voucher (PV)
  const handleIssuePaymentVoucher = (bill?: SupplierBill, po?: QuotationDocumentRecord) => {
    setViewingBillSummary(null);
    setViewingPoSummary(null);
    const vendorId =
      bill?.vendor_company_id ||
      bill?.supplier_id ||
      (bill as any)?.vendor_id ||
      po?.purchase_order_metadata?.vendor_company_id ||
      po?.purchase_order_metadata?.supplier_id ||
      '';
    const vendor = companies.find((c) => c.id === vendorId);
    const payeeName =
      bill?.vendor_name ||
      bill?.supplier_name ||
      po?.purchase_order_metadata?.supplier_name ||
      getCompanyName(vendor) ||
      '';

    setPvVendorId(vendorId);
    setPvPayeeName(payeeName);
    setPvPoId(po?.id || bill?.po_id || '');
    setPvPaymentDate(new Date().toISOString().slice(0, 10));
    setPvPaymentMethod('Bank Transfer / TT');
    setPvReferenceNo('');

    if (bill) {
      const bal = Math.max(0, Number(bill.balance_due) || 0);
      setPvSettlementType('single_bill');
      setPvSelectedBills({ [bill.id]: bal });
      setPvAmountPaid(bal);
      setPvNarration(`Settlement of Supplier Bill ${bill.bill_number} (Inv # ${bill.vendor_invoice_no})`);
    } else if (po) {
      const poTotal = Number(po.financial_totals?.grand_total ?? po.grand_total ?? 0);
      setPvSettlementType('vendor_advance');
      setPvSelectedBills({});
      setPvAmountPaid(poTotal);
      setPvNarration(`Advance / Settlement against Purchase Order ${po.purchase_order_metadata?.po_ref || po.formatted_quote_ref}`);
    } else {
      setPvSettlementType('single_bill');
      setPvSelectedBills({});
      setPvAmountPaid(0);
      setPvNarration('');
    }
    setShowCreatePvModal(true);
  };

  const openCreatePvModal = (
    billOrOpts?: SupplierBill | { bill?: SupplierBill; po?: QuotationDocumentRecord },
    poArg?: QuotationDocumentRecord
  ) => {
    if (
      billOrOpts &&
      typeof billOrOpts === 'object' &&
      ('bill' in billOrOpts || 'po' in billOrOpts) &&
      !('bill_number' in billOrOpts)
    ) {
      handleIssuePaymentVoucher(billOrOpts.bill, billOrOpts.po);
    } else {
      handleIssuePaymentVoucher(billOrOpts as SupplierBill | undefined, poArg);
    }
  };

  const resolveVendorCompanyId = (vendorId?: string, vendorName?: string): string | undefined => {
    if (vendorId && companies.some((c) => c.id === vendorId)) return vendorId;
    const norm = (vendorName || '').trim().toLowerCase();
    if (!norm) return undefined;
    const matched = companies.find((c) => getCompanyName(c).trim().toLowerCase() === norm);
    return matched?.id;
  };

  // Handle incoming deep-link launch context from Dashboard 2.0 or Company 360°
  useEffect(() => {
    if (!launchContext) return;

    const matchedCompany = launchContext.vendorCompanyId
      ? companies.find((c) => c.id === launchContext.vendorCompanyId)
      : launchContext.vendorName
      ? companies.find(
          (c) => getCompanyName(c).trim().toLowerCase() === launchContext.vendorName!.trim().toLowerCase()
        )
      : undefined;

    const resolvedVendorId = matchedCompany?.id || launchContext.vendorCompanyId || '';
    const resolvedVendorName =
      (matchedCompany ? getCompanyName(matchedCompany) : launchContext.vendorName) || '';

    if (launchContext.action === 'view_tab') {
      if (launchContext.targetTab) setActiveTab(launchContext.targetTab);
      if (resolvedVendorName) setVendorFilter(resolvedVendorName);
      onClearLaunchContext?.();
      return;
    }

    if (launchContext.action === 'create_po') {
      setActiveTab('pos');
      setNewPoVendorId(resolvedVendorId);
      setNewPoSupplierName(resolvedVendorName);
      setNewPoEnquiryId('');
      setNewPoExpectedDate('');
      setNewPoLines([
        { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
      ]);
      setShowCreatePoModal(true);
      onClearLaunchContext?.();
      return;
    }

    if (launchContext.action === 'receive_grn') {
      setActiveTab('grn');
      if (launchContext.poId && supplierPOs.length === 0) return; // wait for PO subscription
      const targetPo = launchContext.poId
        ? supplierPOs.find((p) => p.id === launchContext.poId)
        : supplierPOs.find((p) => {
            const pVendorId = p.purchase_order_metadata?.vendor_company_id;
            const pVendorName = (
              p.purchase_order_metadata?.supplier_name ||
              p.client_snapshot?.entity_name ||
              ''
            )
              .trim()
              .toLowerCase();
            const matchesVendor =
              !resolvedVendorId && !resolvedVendorName
                ? true
                : (resolvedVendorId && pVendorId === resolvedVendorId) ||
                  (resolvedVendorName && pVendorName === resolvedVendorName.trim().toLowerCase());
            const status = p.purchase_order_metadata?.receiving_status || 'pending';
            return matchesVendor && status !== 'Completed' && status !== 'received';
          }) || supplierPOs[0];

      if (targetPo) {
        handleOpenGrnModal(targetPo);
      } else if (resolvedVendorName) {
        setVendorFilter(resolvedVendorName);
      }
      onClearLaunchContext?.();
      return;
    }

    if (launchContext.action === 'record_bill') {
      setActiveTab('bills');
      if (launchContext.poId && supplierPOs.length === 0) return;
      const targetPo = launchContext.poId
        ? supplierPOs.find((p) => p.id === launchContext.poId)
        : undefined;
      if (targetPo) {
        handleOpenBillModal(targetPo);
      } else {
        handleOpenBillModal();
        if (resolvedVendorId) setBillVendorId(resolvedVendorId);
        if (resolvedVendorName) setBillVendorName(resolvedVendorName);
      }
      onClearLaunchContext?.();
      return;
    }

    if (launchContext.action === 'record_payment') {
      setActiveTab('vouchers');
      if ((launchContext.billId && supplierBills.length === 0) || (launchContext.poId && supplierPOs.length === 0)) {
        return;
      }
      const targetBill = launchContext.billId
        ? supplierBills.find((b) => b.id === launchContext.billId)
        : supplierBills.find((b) => {
            const matchesVendor =
              (resolvedVendorId && b.vendor_company_id === resolvedVendorId) ||
              (resolvedVendorName &&
                b.vendor_name.trim().toLowerCase() === resolvedVendorName.trim().toLowerCase());
            return matchesVendor && b.status !== 'Paid' && (Number(b.balance_due) || 0) > 0.01;
          });
      const targetPo = launchContext.poId
        ? supplierPOs.find((p) => p.id === launchContext.poId)
        : undefined;

      if (targetBill || targetPo) {
        handleIssuePaymentVoucher(targetBill, targetPo);
      } else {
        handleIssuePaymentVoucher();
        if (resolvedVendorId) setPvVendorId(resolvedVendorId);
        if (resolvedVendorName) setPvPayeeName(resolvedVendorName);
      }
      onClearLaunchContext?.();
    }
  }, [launchContext, supplierPOs, supplierBills, companies]);

  // Confirm & Create Outbound Payment Voucher (PV)
  const handleConfirmCreatePv = async (openInStudio = true) => {
    if (isCreatingPv) return;
    const selectedVendor = companies.find((c) => c.id === pvVendorId);
    const payeeName = (pvPayeeName || getCompanyName(selectedVendor) || '').trim();
    if (!payeeName) {
      triggerToast?.('Please select or enter a Payee / Supplier name.', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const pvSeq = String(
      quotations.filter((q) => q.document_type === 'payment_voucher').length + 1
    ).padStart(4, '0');
    const pvRef = `PV-${pvSeq}`;
    const linkedPo = supplierPOs.find((p) => p.id === pvPoId);

    const selectedBillEntries = Object.entries(pvSelectedBills)
      .filter(([, amt]) => Number(amt) > 0)
      .map(([billId, amt]) => {
        const b = supplierBills.find((x) => x.id === billId);
        if (!b) return null;
        const bTotal = Number(b.grand_total) || 0;
        const cred = Number(b.credit_applied_amount) || 0;
        const prev = Number(b.amount_paid) || 0;
        const paidNow = QuotationRepository.roundCurrency(Number(amt) || 0);
        return {
          bill_id: b.id,
          bill_ref: b.bill_number,
          vendor_invoice_no: b.vendor_invoice_no,
          po_ref: b.po_ref,
          bill_total: bTotal,
          credit_applied: cred,
          previously_paid: prev,
          paid_this_voucher: paidNow,
          remaining_balance: Math.max(0, QuotationRepository.roundCurrency(bTotal - cred - prev - paidNow))
        };
      })
      .filter(Boolean) as NonNullable<
      QuotationDocumentRecord['payment_voucher_metadata']
    >['allocated_bills'];

    const allocatedSum = (selectedBillEntries || []).reduce((s, a) => s + a.paid_this_voucher, 0);
    const amountNow = QuotationRepository.roundCurrency(
      (selectedBillEntries && selectedBillEntries.length > 0 ? allocatedSum : Number(pvAmountPaid)) || 0
    );
    const totalPayable =
      selectedBillEntries && selectedBillEntries.length > 0
        ? selectedBillEntries.reduce((s, a) => s + a.bill_total, 0)
        : Number(linkedPo?.financial_totals?.grand_total ?? linkedPo?.grand_total ?? amountNow) || amountNow;
    const totalCredits =
      selectedBillEntries && selectedBillEntries.length > 0
        ? selectedBillEntries.reduce((s, a) => s + (a.credit_applied || 0), 0)
        : 0;
    const totalPrevPaid =
      selectedBillEntries && selectedBillEntries.length > 0
        ? selectedBillEntries.reduce((s, a) => s + a.previously_paid, 0)
        : 0;
    const balanceRemaining = Math.max(
      0,
      QuotationRepository.roundCurrency(totalPayable - totalCredits - totalPrevPaid - amountNow)
    );

    const vendorInvString =
      selectedBillEntries && selectedBillEntries.length > 0
        ? selectedBillEntries.map((b) => b.vendor_invoice_no).join(', ')
        : '';

    const recordId = `qdoc_pv_${Date.now()}`;
    const pvCurrency =
      linkedPo?.currency || selectedVendor?.default_currency || defaultCurrency;

    const pvRecord: QuotationDocumentRecord = {
      id: recordId,
      workspace_id: activeWorkspace.id,
      enquiry_id: linkedPo?.enquiry_id || `standalone_${recordId}`,
      enquiry_sn: linkedPo?.enquiry_sn || 0,
      document_type: 'payment_voucher',
      quote_number: pvRef,
      formatted_quote_ref: pvRef,
      revision_no: 0,
      status: 'issued',
      quotation_date: pvPaymentDate || nowIso.slice(0, 10),
      valid_until_date: pvPaymentDate || nowIso.slice(0, 10),
      client_reference: vendorInvString || linkedPo?.formatted_quote_ref || '',
      subject:
        pvNarration.trim() ||
        (vendorInvString
          ? `Settlement of Vendor Invoice(s): ${vendorInvString}`
          : linkedPo
          ? `Supplier Advance / Settlement against ${linkedPo.formatted_quote_ref}`
          : `Outbound Vendor Payment Voucher — ${payeeName}`),
      quotation_subject:
        pvNarration.trim() ||
        (vendorInvString
          ? `Settlement of Vendor Invoice(s): ${vendorInvString}`
          : linkedPo
          ? `Supplier Advance / Settlement against ${linkedPo.formatted_quote_ref}`
          : `Outbound Vendor Payment Voucher — ${payeeName}`),
      currency: pvCurrency,
      tax_mode: 'taxes_extra',
      show_brand_column: false,
      show_part_no_column: true,
      show_discount_column: false,
      show_tax_column: false,
      show_item_images: false,
      company_letterhead_snapshot: {
        company_name: activeWorkspace.document_profile?.company_legal_name || activeWorkspace.name,
        company_subtitle: activeWorkspace.document_profile?.company_tagline || '',
        address_line_1: activeWorkspace.document_profile?.company_address || '',
        address_line_2: '',
        phone: activeWorkspace.document_profile?.company_phone || '',
        email: activeWorkspace.document_profile?.company_email || '',
        website: activeWorkspace.document_profile?.company_website || '',
        tax_registration_label: activeWorkspace.document_profile?.tax_registration_label || 'TRN',
        tax_registration_no: activeWorkspace.document_profile?.tax_registration_no || '',
        logo_text: activeWorkspace.name.slice(0, 10).toUpperCase(),
        accent_color: activeWorkspace.document_profile?.brand_accent_color || '#1e3a8a',
        logo_url: activeWorkspace.document_profile?.logo_url || ''
      },
      client_snapshot: {
        entity_name: payeeName,
        attention_to: linkedPo?.purchase_order_metadata?.supplier_contact || '',
        designation: '',
        address:
          linkedPo?.purchase_order_metadata?.supplier_address ||
          [selectedVendor?.address, selectedVendor?.city, selectedVendor?.country]
            .filter(Boolean)
            .join(', '),
        phone: linkedPo?.purchase_order_metadata?.supplier_phone || selectedVendor?.phone || '',
        email: linkedPo?.purchase_order_metadata?.supplier_email || selectedVendor?.email || '',
        tax_registration_no:
          linkedPo?.purchase_order_metadata?.supplier_trn ||
          selectedVendor?.tax_registration_no ||
          ''
      },
      payment_voucher_metadata: {
        voucher_ref: pvRef,
        pv_ref: pvRef,
        payment_date: pvPaymentDate || nowIso.slice(0, 10),
        pv_date: pvPaymentDate || nowIso.slice(0, 10),
        settlement_type: pvSettlementType,
        vendor_company_id: pvVendorId || undefined,
        vendor_id: pvVendorId || undefined,
        payee_name: payeeName,
        paid_to_vendor_name: payeeName,
        payee_trn:
          linkedPo?.purchase_order_metadata?.supplier_trn ||
          selectedVendor?.tax_registration_no ||
          '',
        vendor_trn:
          linkedPo?.purchase_order_metadata?.supplier_trn ||
          selectedVendor?.tax_registration_no ||
          '',
        payment_method: pvPaymentMethod,
        reference_no: pvReferenceNo.trim() || undefined,
        utr_or_cheque_no: pvReferenceNo.trim() || undefined,
        disbursing_bank_name: activeWorkspace.document_profile?.bank_details?.bank_name || '',
        disbursing_account_no: activeWorkspace.document_profile?.bank_details?.iban || '',
        beneficiary_bank_details:
          linkedPo?.purchase_order_metadata?.beneficiary_bank_details ||
          selectedVendor?.vendor_bank_details,
        linked_po_id: linkedPo?.id,
        linked_po_ref: linkedPo?.purchase_order_metadata?.po_ref || linkedPo?.formatted_quote_ref,
        vendor_invoice_no: vendorInvString,
        allocated_bills: selectedBillEntries || [],
        total_payable_amount: totalPayable,
        credits_applied_amount: totalCredits,
        previously_paid_amount: totalPrevPaid,
        previously_paid: totalPrevPaid,
        amount_paid: amountNow,
        balance_remaining: balanceRemaining,
        narration:
          pvNarration.trim() ||
          (vendorInvString
            ? `Payment against Vendor Invoice(s) ${vendorInvString}`
            : linkedPo
            ? `Payment against Purchase Order ${linkedPo.formatted_quote_ref}`
            : 'Vendor Settlement'),
        prepared_by_name: user.full_name || user.username || 'Accounts'
      },
      line_items: [],
      subtotal: amountNow,
      tax_amount: 0,
      grand_total: amountNow,
      financial_totals: {
        items_subtotal: amountNow,
        total_line_discounts: 0,
        overall_discount_amount: 0,
        taxable_subtotal: amountNow,
        tax_amount: 0,
        freight_amount: 0,
        grand_total: amountNow
      },
      terms_blocks: {
        price_basis: '',
        delivery_schedule: '',
        payment_terms: 'Settled via Payment Voucher',
        validity_period: '',
        warranty_terms: '',
        packing_forwarding: '',
        general_exclusions: '',
        additional_notes: ''
      },
      signatory_block: {
        prepared_by_name: user.full_name || user.username || 'Accounts',
        prepared_by_designation: 'Accounts / Finance',
        authorized_signatory_name: '',
        authorized_signatory_designation: 'Authorized Signatory',
        show_company_stamp_placeholder: true,
        show_client_acceptance_block: true
      },
      annexes: [],
      created_at: nowIso,
      created_by: user.full_name || user.email || 'User',
      updated_at: nowIso
    };

    setIsCreatingPv(true);
    try {
      await QuotationRepository.save(pvRecord);
      await ProcurementRepository.recalculateWorkspaceSupplierBillBalances(activeWorkspace.id);

      setShowCreatePvModal(false);
      triggerToast?.(`Payment Voucher ${pvRef} saved and Supplier Bill balances updated.`, 'success');
      if (openInStudio) {
        handleOpenInStudio(pvRecord);
      }
    } finally {
      setIsCreatingPv(false);
    }
  };

  // Open Pre-Launch Modal for Material Return Note (MRN) or Vendor Debit Note (DN)
  const handleIssueVendorReturn = (
    mode: 'material_return_note' | 'debit_note',
    po?: QuotationDocumentRecord,
    bill?: SupplierBill
  ) => {
    const vId = po?.purchase_order_metadata?.vendor_company_id || bill?.vendor_company_id || '';
    const vObj = companies.find((c) => c.id === vId);
    const sName =
      po?.purchase_order_metadata?.supplier_name ||
      bill?.vendor_name ||
      getCompanyName(vObj) ||
      '';

    setRetMode(mode);
    setRetVendorId(vId);
    setRetSupplierName(sName);
    setRetPoId(po?.id || bill?.po_id || '');
    setRetBillId(bill?.id || '');
    setRetReason('Defective / Damaged');
    setRetResolution(
      mode === 'debit_note' ? 'Credit / Bill Deduction' : 'Replacement Required'
    );

    if (po && po.line_items && po.line_items.length > 0) {
      setRetLines(
        po.line_items.map((li: any) => ({
          product_id: li.product_id,
          item_name: li.item_name || li.description || '',
          part_no: li.part_no || '',
          qty: Number(li.qty_received || li.qty_ordered || li.quantity || li.qty) || 1,
          unit: li.unit || 'Nos',
          unit_cost: Number(li.unit_price ?? li.cost_price ?? 0)
        }))
      );
    } else if (bill && bill.line_items && bill.line_items.length > 0) {
      setRetLines(
        bill.line_items.map((bl) => ({
          product_id: bl.product_id,
          item_name: bl.item_name || '',
          part_no: bl.part_no || '',
          qty: Number(bl.billed_qty) || 1,
          unit: bl.unit || 'Nos',
          unit_cost: Number(bl.billed_unit_cost) || 0
        }))
      );
    } else {
      setRetLines([
        { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
      ]);
    }

    setShowCreateReturnModal(true);
  };

  // Confirm & Create Material Return Note (MRN) or Vendor Debit Note (DN)
  const handleConfirmCreateReturn = async (openInStudio = true) => {
    if (isCreatingReturn) return;
    const selectedVendor = companies.find((c) => c.id === retVendorId);
    const supplierName = (retSupplierName || getCompanyName(selectedVendor) || '').trim();
    if (!supplierName) {
      triggerToast?.('Please select or enter a Supplier / Vendor name.', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const prefix = retMode === 'material_return_note' ? 'MRN' : 'DN';
    const seq = String(
      quotations.filter(
        (q) =>
          q.document_type === 'material_return_note' ||
          (q.document_type as string) === 'material_return' ||
          q.document_type === 'debit_note'
      ).length + 1
    ).padStart(4, '0');
    const refNo = `${prefix}-${seq}`;
    const recordId = `qdoc_${prefix.toLowerCase()}_${Date.now()}`;

    const linkedPo = supplierPOs.find((p) => p.id === retPoId);
    const linkedBill = supplierBills.find((b) => b.id === retBillId);

    const sourceLines: QuotationLineItem[] = retLines
      .filter((l) => l.item_name.trim() !== '')
      .map((l, idx) => {
        const qty = Math.max(1, Number(l.qty) || 1);
        const rate = Math.max(0, Number(l.unit_cost) || 0);
        return {
          id: `retli_${Date.now()}_${idx}`,
          sr_no: idx + 1,
          product_id: l.product_id || undefined,
          part_no: l.part_no || '',
          item_name: l.item_name,
          description: l.item_name,
          quantity: qty,
          qty,
          qty_ordered: qty,
          return_qty: qty,
          return_reason: retReason,
          unit: l.unit || 'Nos',
          unit_price: rate,
          cost_price: rate,
          total_price: QuotationRepository.roundCurrency(qty * rate),
          discount_Type: 'none',
          discount_value: 0,
          tax_rate: 5,
          line_subtotal: QuotationRepository.roundCurrency(qty * rate),
          line_total: QuotationRepository.roundCurrency(qty * rate)
        } as any;
      });

    const totals = QuotationRepository.calculateFinancialTotals(sourceLines, 'taxes_extra', 0);

    const returnDoc: QuotationDocumentRecord = {
      id: recordId,
      workspace_id: activeWorkspace.id,
      enquiry_id: linkedPo?.enquiry_id || linkedBill?.enquiry_id || `standalone_${recordId}`,
      enquiry_sn: linkedPo?.enquiry_sn || 0,
      document_type: retMode,
      quote_number: refNo,
      formatted_quote_ref: refNo,
      revision_no: 0,
      status: 'issued',
      quotation_date: nowIso.slice(0, 10),
      valid_until_date: nowIso.slice(0, 10),
      client_reference: linkedPo?.formatted_quote_ref || linkedBill?.vendor_invoice_no || '',
      subject:
        retMode === 'material_return_note'
          ? `Material Return Dispatch Note — ${supplierName}`
          : `Vendor Debit Note / Credit Claim — ${supplierName}`,
      quotation_subject:
        retMode === 'material_return_note'
          ? `Material Return Dispatch Note — ${supplierName}`
          : `Vendor Debit Note / Credit Claim — ${supplierName}`,
      currency:
        linkedPo?.currency || linkedBill?.currency || selectedVendor?.default_currency || defaultCurrency,
      tax_mode: 'taxes_extra',
      show_brand_column: true,
      show_part_no_column: true,
      show_discount_column: false,
      show_tax_column: retMode === 'debit_note',
      show_item_images: false,
      company_letterhead_snapshot: {
        company_name: activeWorkspace.document_profile?.company_legal_name || activeWorkspace.name,
        company_subtitle: activeWorkspace.document_profile?.company_tagline || '',
        address_line_1: activeWorkspace.document_profile?.company_address || '',
        address_line_2: '',
        phone: activeWorkspace.document_profile?.company_phone || '',
        email: activeWorkspace.document_profile?.company_email || '',
        website: activeWorkspace.document_profile?.company_website || '',
        tax_registration_label: activeWorkspace.document_profile?.tax_registration_label || 'TRN',
        tax_registration_no: activeWorkspace.document_profile?.tax_registration_no || '',
        logo_text: activeWorkspace.name.slice(0, 10).toUpperCase(),
        accent_color: activeWorkspace.document_profile?.brand_accent_color || '#1e3a8a',
        logo_url: activeWorkspace.document_profile?.logo_url || ''
      },
      client_snapshot: {
        entity_name: supplierName,
        attention_to: linkedPo?.purchase_order_metadata?.supplier_contact || '',
        designation: '',
        address:
          linkedPo?.purchase_order_metadata?.supplier_address ||
          [selectedVendor?.address, selectedVendor?.city, selectedVendor?.country]
            .filter(Boolean)
            .join(', '),
        phone: linkedPo?.purchase_order_metadata?.supplier_phone || selectedVendor?.phone || '',
        email: linkedPo?.purchase_order_metadata?.supplier_email || selectedVendor?.email || '',
        tax_registration_no:
          linkedPo?.purchase_order_metadata?.supplier_trn ||
          linkedBill?.vendor_trn ||
          selectedVendor?.tax_registration_no ||
          ''
      },
      vendor_return_metadata: {
        return_mode: retMode,
        return_ref: refNo,
        return_date: nowIso.slice(0, 10),
        vendor_company_id: retVendorId || undefined,
        vendor_id: retVendorId || undefined,
        supplier_name: supplierName,
        vendor_name: supplierName,
        supplier_contact: linkedPo?.purchase_order_metadata?.supplier_contact || '',
        vendor_contact: linkedPo?.purchase_order_metadata?.supplier_contact || '',
        supplier_address:
          linkedPo?.purchase_order_metadata?.supplier_address ||
          [selectedVendor?.address, selectedVendor?.city, selectedVendor?.country]
            .filter(Boolean)
            .join(', '),
        supplier_trn:
          linkedPo?.purchase_order_metadata?.supplier_trn ||
          linkedBill?.vendor_trn ||
          selectedVendor?.tax_registration_no ||
          '',
        vendor_trn:
          linkedPo?.purchase_order_metadata?.supplier_trn ||
          linkedBill?.vendor_trn ||
          selectedVendor?.tax_registration_no ||
          '',
        original_po_id: linkedPo?.id,
        original_po_ref: linkedPo?.purchase_order_metadata?.po_ref || linkedPo?.formatted_quote_ref,
        linked_bill_id: linkedBill?.id,
        vendor_invoice_no: linkedBill?.vendor_invoice_no,
        return_reason: retReason,
        resolution_type: retResolution,
        dispatched_by_name: user.full_name || user.username || 'Storekeeper',
        returned_by_name: user.full_name || user.username || 'Storekeeper',
        credit_applied_to_bill: Boolean(retMode === 'debit_note' && linkedBill?.id)
      },
      line_items: sourceLines,
      subtotal: totals.items_subtotal,
      tax_amount: totals.tax_amount,
      grand_total: totals.grand_total,
      financial_totals: totals,
      terms_blocks: {
        price_basis: '',
        delivery_schedule: '',
        payment_terms: retResolution,
        validity_period: '',
        warranty_terms: '',
        packing_forwarding: '',
        general_exclusions: '',
        additional_notes: ''
      },
      signatory_block: {
        prepared_by_name: user.full_name || user.username || 'Storekeeper',
        prepared_by_designation: 'Warehouse / Procurement',
        authorized_signatory_name: '',
        authorized_signatory_designation: 'Authorized Signatory',
        show_company_stamp_placeholder: true,
        show_client_acceptance_block: true
      },
      annexes: [],
      created_at: nowIso,
      created_by: user.full_name || user.email || 'User',
      updated_at: nowIso
    };

    setIsCreatingReturn(true);
    try {
      await QuotationRepository.save(returnDoc);
      if (retMode === 'debit_note' && linkedBill) {
        await ProcurementRepository.recalculateWorkspaceSupplierBillBalances(activeWorkspace.id);
      }

      setShowCreateReturnModal(false);
      triggerToast?.(`${refNo} saved.`, 'success');
      if (openInStudio) {
        handleOpenInStudio(returnDoc);
      }
    } finally {
      setIsCreatingReturn(false);
    }
  };

  const formatProcurementDate = (raw?: string | null): string => {
    if (!raw || raw === '—') return '—';
    const clean = String(raw).trim().slice(0, 10);
    if (!clean) return '—';
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]) - 1;
      const d = Number(parts[2]);
      const dt = new Date(y, m, d);
      if (!isNaN(dt.getTime())) {
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    }
    const parsed = new Date(raw);
    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return clean;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-slate-50/50 dark:bg-slate-950">
      <PageHeader
        title="Procurement & Payables"
        subtitle="Manage Outbound Supplier POs, Warehouse GRN Landed Cost Allocation, 3-Way Bill Matching, and Outbound Payment Vouchers"
        icon={ShoppingBag}
        badge={{ text: `${kpiStats.openPoCount} Open POs`, variant: 'indigo' }}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
        primaryAction={{
          label: 'New Supplier PO',
          icon: Plus,
          onClick: () => {
            setNewPoVendorId('');
            setNewPoSupplierName('');
            setNewPoEnquiryId('');
            setNewPoExpectedDate('');
            setNewPoLines([
              { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
            ]);
            setShowCreatePoModal(true);
          }
        }}
        secondaryActions={[
          {
            label: 'Record Supplier Bill',
            icon: FileText,
            onClick: () => handleOpenBillModal()
          },
          {
            label: 'Issue Payment Voucher',
            icon: DollarSign,
            onClick: () => handleIssuePaymentVoucher()
          }
        ]}
      />
      <PageBody>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <KpiStatCard
          label="Open Supplier POs"
          value={kpiStats.openPoCount}
          subtext={`${supplierPOs.length} Total Issued POs`}
          icon={<ShoppingBag className="w-5 h-5" />}
          tone="indigo"
        />
        <KpiStatCard
          label="Pending GRN Lines"
          value={kpiStats.pendingGrnCount}
          subtext="Awaiting Warehouse Receipt"
          icon={<PackageCheck className="w-5 h-5" />}
          tone="blue"
        />
        <KpiStatCard
          label="Unpaid Supplier Bills"
          value={kpiStats.unpaidBillCount}
          subtext={
            kpiStats.varianceBillsCount > 0
              ? `${kpiStats.varianceBillsCount} with 3-Way Match Variance`
              : 'All matched bills verified'
          }
          icon={<FileText className="w-5 h-5" />}
          tone={kpiStats.varianceBillsCount > 0 ? 'amber' : 'emerald'}
        />
        <KpiStatCard
          label="Total Payables Balance"
          value={
            canViewConfidentialMargins
              ? `${defaultCurrency} ${kpiStats.totalPayables.toLocaleString('en-US', {
                  minimumFractionDigits: 2
                })}`
              : 'Restricted'
          }
          subtext={canViewConfidentialMargins ? 'Net of Debit Notes & PVs' : 'Admin / Manager Only'}
          icon={<DollarSign className="w-5 h-5" />}
          tone="rose"
        />
      </div>

      {!canViewConfidentialMargins ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center max-w-xl mx-auto my-6 shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Confidential Supplier Cost &amp; Payables Ledger
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Access to supplier purchase order unit costs, landed GRN cost allocations, vendor bills, and payment vouchers is restricted to Workspace Admins and Commercial Managers.
          </p>
        </div>
      ) : (
        <>

      {/* Navigation Tabs + Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'pos' as const, label: `Supplier POs (${supplierPOs.length})`, icon: ShoppingBag },
            {
              id: 'grn' as const,
              label: `Pending Stock Receipts (${kpiStats.pendingGrnCount})`,
              icon: PackageCheck
            },
            {
              id: 'bills' as const,
              label: `Supplier Bills & 3-Way Match (${supplierBills.length})`,
              icon: FileText
            },
            {
              id: 'vouchers' as const,
              label: `Payment Vouchers & Returns (${paymentVouchersAndReturns.length})`,
              icon: DollarSign
            }
          ].map((t) => {
            const Icon = t.icon;
            const isSel = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isSel
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end flex-wrap">
          {(vendorFilter !== 'ALL' || searchQuery.trim() !== '') && (
            <button
              type="button"
              onClick={() => {
                setVendorFilter('ALL');
                setSearchQuery('');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-bold transition cursor-pointer"
              title="Reset vendor filter and search query"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 text-slate-800 dark:text-slate-100 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="ALL">All Vendors / Suppliers</option>
            {vendors.map((v) => {
              const vName = getCompanyName(v);
              return (
                <option key={v.id} value={vName}>
                  {vName}
                </option>
              );
            })}
          </select>
          <div className="relative w-full sm:w-auto sm:min-w-[260px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PO, Bill, Inv #, Vendor..."
              className="w-full h-9 pl-8 pr-7 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* TAB 1: SUPPLIER PURCHASE ORDERS */}
      {activeTab === 'pos' && (() => {
        const filteredPos = supplierPOs.filter((po) => {
          const vName =
            po.purchase_order_metadata?.supplier_name || po.client_snapshot?.entity_name || '';
          if (vendorFilter !== 'ALL' && vName !== vendorFilter) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            (po.formatted_quote_ref || '').toLowerCase().includes(q) ||
            (po.purchase_order_metadata?.po_ref || '').toLowerCase().includes(q) ||
            vName.toLowerCase().includes(q) ||
            (po.quotation_subject || '').toLowerCase().includes(q)
          );
        });
        const hasActiveFilter = vendorFilter !== 'ALL' || searchQuery.trim() !== '';
        const totalPages = Math.max(1, Math.ceil(filteredPos.length / itemsPerPage));
        const safePage = Math.min(currentPage, totalPages);
        const paginatedPos = filteredPos.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

        return (
          <div className="space-y-3">
            <SearchResultCounter
              totalCount={supplierPOs.length}
              filteredCount={filteredPos.length}
              searchQuery={searchQuery}
              entityLabel="Supplier POs"
              singularEntityLabel="Supplier PO"
              activeFiltersCount={vendorFilter !== 'ALL' ? 1 : 0}
              activeFilterLabels={vendorFilter !== 'ALL' ? [`Vendor: ${vendorFilter}`] : []}
              onClear={() => {
                setSearchQuery('');
                setVendorFilter('ALL');
              }}
            />
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-clip">
              <div className="w-full overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] sm:min-w-[820px] text-left border-collapse text-xs font-sans">
                  <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                    <tr>
                      <th className="py-3 px-3.5 w-[15%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">PO Ref</th>
                      <th className="py-3 px-3.5 w-[22%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Vendor / Supplier</th>
                      <th className="py-3 px-3 w-[12%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Date</th>
                      <th className="py-3 px-3 w-[16%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Status / Receiving</th>
                      <th className="py-3 pl-2 pr-5 w-[14%] text-right whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Amount</th>
                      <th className="py-3 px-3.5 w-[215px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {paginatedPos.map((po) => {
                      const meta = po.purchase_order_metadata;
                      const recStatus = meta?.receiving_status || 'Pending Receipt';
                      const linkedEnq = enquiries.find((e) => e.id === po.enquiry_id);
                      const poRefText = meta?.po_ref || po.formatted_quote_ref || 'PO-DRAFT';
                      const poDateStr = formatProcurementDate(meta?.po_date || po.quotation_date);
                      const expDateStr = meta?.expected_delivery_date ? formatProcurementDate(meta.expected_delivery_date) : '';
                      const vName = meta?.supplier_name || po.client_snapshot?.entity_name || 'Vendor';
                      const vCompId = resolveVendorCompanyId(meta?.vendor_company_id, vName);
                      const lineItems = po.line_items || [];
                      const receivedLinesCount = lineItems.filter((li: any) => {
                        const ord = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
                        const rcv = Number(li.qty_received) || 0;
                        return ord > 0 && rcv >= ord;
                      }).length;
                      const totalAmount = Number(po.financial_totals?.grand_total ?? po.grand_total ?? 0);

                      return (
                        <tr
                          key={po.id}
                          onClick={() => setViewingPoSummary(po)}
                          className="cursor-pointer border-l-2 border-l-transparent hover:border-l-indigo-500 hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors group"
                        >
                          {/* 1. PO REF & LINKED ENQUIRY (Max 2 Lines) */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate" title={poRefText}>
                              {poRefText}
                            </div>
                            <div className="mt-0.5 truncate" onClick={(e) => e.stopPropagation()}>
                              {linkedEnq ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectEnquiry?.(linkedEnq.id)}
                                  className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1 max-w-full truncate cursor-pointer"
                                  title={`ENQ #${linkedEnq.sn} — ${linkedEnq.company_name}`}
                                >
                                  <span className="truncate">ENQ #{linkedEnq.sn} · {linkedEnq.company_name}</span>
                                </button>
                              ) : (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                                  Stock Replenishment
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 2. VENDOR / SUPPLIER (Max 2 Lines) */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0">
                              {vCompId && onOpenCompany360 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCompany360(vCompId);
                                  }}
                                  className="text-left group/v inline-flex items-center gap-1 max-w-full truncate cursor-pointer"
                                  title={vName}
                                >
                                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover/v:text-indigo-600 group-hover/v:underline truncate">
                                    {vName}
                                  </span>
                                  <ArrowUpRight className="w-3 h-3 text-slate-400 group-hover/v:text-indigo-600 shrink-0" />
                                </button>
                              ) : (
                                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate" title={vName}>
                                  {vName}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                              {meta?.supplier_trn
                                ? `TRN: ${meta.supplier_trn}`
                                : `${lineItems.length} ${lineItems.length === 1 ? 'line item' : 'line items'}`}
                            </div>
                          </td>

                          {/* 3. DATE (Max 2 Lines) */}
                          <td className="py-2.5 px-3 align-middle overflow-hidden">
                            <div className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap truncate">
                              {poDateStr}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap truncate mt-0.5">
                              {expDateStr ? `Exp: ${expDateStr}` : 'Standard Lead'}
                            </div>
                          </td>

                          {/* 4. STATUS / RECEIVING (Max 2 Lines) */}
                          <td className="py-2.5 px-3 align-middle overflow-hidden">
                            <div className="flex flex-col items-start gap-1 min-w-0">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold border truncate max-w-full leading-tight ${
                                  recStatus === 'Fully Received'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                                    : recStatus === 'Partially Received'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                }`}
                              >
                                {recStatus}
                              </span>
                              <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    recStatus === 'Fully Received'
                                      ? 'bg-emerald-500'
                                      : recStatus === 'Partially Received'
                                      ? 'bg-amber-500'
                                      : 'bg-slate-400'
                                  }`}
                                />
                                <span className="truncate font-mono">
                                  {lineItems.length > 0
                                    ? `${receivedLinesCount}/${lineItems.length} Lines Rcvd`
                                    : 'Pending GRN'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 5. AMOUNT (Max 2 Lines, Right-Aligned with pr-5) */}
                          <td className="py-2.5 pl-2 pr-5 text-right align-middle overflow-hidden">
                            <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap truncate">
                              {canViewConfidentialMargins
                                ? `${po.currency} ${totalAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}`
                                : 'Restricted'}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                              {meta?.payment_terms || 'Incl. VAT'}
                            </div>
                          </td>

                          {/* 6. ACTIONS (Fixed Width, Compact Studio + Icon Buttons) */}
                          <td
                            className="py-2.5 px-3.5 w-[215px] text-right whitespace-nowrap align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenInStudio(po)}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold shadow-2xs transition cursor-pointer"
                                title="Open Supplier PO in A4 Studio"
                              >
                                Studio
                              </button>
                              {recStatus !== 'Fully Received' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenGrnModal(po)}
                                  className="w-7 h-7 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition inline-flex items-center justify-center cursor-pointer"
                                  title="Receive Stock (GRN)"
                                >
                                  <PackageCheck className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenBillModal(po)}
                                className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Record Supplier Bill"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openCreatePvModal(undefined, po)}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Issue Outbound Payment Voucher (PV)"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const totalVal = totalAmount.toLocaleString('en-US', {
                                    minimumFractionDigits: 2
                                  });
                                  setDeleteConfirmTarget({
                                    type: 'po',
                                    id: po.id,
                                    refLabel: poRefText,
                                    vendorName: vName,
                                    amountLabel: `${po.currency} ${totalVal}`
                                  });
                                }}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Move Supplier PO to Recycle Bin"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 px-4 text-center">
                          {hasActiveFilter ? (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                                <Search className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-800">
                                No Supplier POs Match Your Filter
                              </div>
                              <p className="text-xs text-slate-500">
                                No purchase orders matched{' '}
                                {searchQuery.trim() ? (
                                  <span className="font-semibold text-slate-700">&ldquo;{searchQuery}&rdquo;</span>
                                ) : (
                                  <span className="font-semibold text-slate-700">{vendorFilter}</span>
                                )}
                                . Clear the active filter to view all {supplierPOs.length} Supplier POs.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery('');
                                  setVendorFilter('ALL');
                                }}
                                className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Clear Search / Reset Filters</span>
                              </button>
                            </div>
                          ) : (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                                <ShoppingBag className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-900">
                                No Outbound Supplier Purchase Orders Yet
                              </div>
                              <p className="text-xs text-slate-500">
                                Issue a formal Supplier PO for client enquiry fulfillment or warehouse stock replenishment to track GRN receipts and 3-Way Match bills.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPoVendorId('');
                                  setNewPoSupplierName('');
                                  setNewPoEnquiryId('');
                                  setNewPoExpectedDate('');
                                  setNewPoLines([
                                    { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
                                  ]);
                                  setShowCreatePoModal(true);
                                }}
                                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Create First Supplier PO</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredPos.length > 0 && (
                <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Showing <span className="font-bold text-slate-900 dark:text-slate-100">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{Math.min(safePage * itemsPerPage, filteredPos.length)}</span> of{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{filteredPos.length}</span> Supplier POs
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Rows per page:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <span className="text-xs font-mono tabular-nums px-2.5 text-slate-600 dark:text-slate-400">
                        Page <span className="font-bold text-slate-900 dark:text-slate-100">{safePage}</span> of{' '}
                        <span className="font-bold text-slate-900 dark:text-slate-100">{totalPages}</span>
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Next Page"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 2: PENDING STOCK RECEIPTS (GRN) */}
      {activeTab === 'grn' && (() => {
        const allPendingGrnRows = supplierPOs
          .filter((po) => {
            const st = String(po.status || '').toLowerCase();
            return st !== 'cancelled' && st !== 'rejected';
          })
          .flatMap((po) =>
            (po.line_items || [])
              .filter((li: any) => {
                const ordered = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
                const received = Number(li.qty_received) || 0;
                return ordered > received;
              })
              .map((li: any) => ({ po, li }))
          );

        const filteredGrnRows = allPendingGrnRows.filter(({ po, li }) => {
          const vName =
            po.purchase_order_metadata?.supplier_name || po.client_snapshot?.entity_name || '';
          if (vendorFilter !== 'ALL' && vName !== vendorFilter) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          const poRef = po.purchase_order_metadata?.po_ref || po.formatted_quote_ref || '';
          const itemName = li.item_name || li.description || '';
          const partNo = li.part_no || '';
          return (
            poRef.toLowerCase().includes(q) ||
            vName.toLowerCase().includes(q) ||
            itemName.toLowerCase().includes(q) ||
            partNo.toLowerCase().includes(q)
          );
        });
        const hasActiveFilter = vendorFilter !== 'ALL' || searchQuery.trim() !== '';
        const totalPages = Math.max(1, Math.ceil(filteredGrnRows.length / itemsPerPage));
        const safePage = Math.min(currentPage, totalPages);
        const paginatedGrnRows = filteredGrnRows.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

        return (
          <div className="space-y-3">
            <SearchResultCounter
              totalCount={allPendingGrnRows.length}
              filteredCount={filteredGrnRows.length}
              searchQuery={searchQuery}
              entityLabel="Pending GRN Lines"
              singularEntityLabel="Pending GRN Line"
              activeFiltersCount={vendorFilter !== 'ALL' ? 1 : 0}
              activeFilterLabels={vendorFilter !== 'ALL' ? [`Vendor: ${vendorFilter}`] : []}
              onClear={() => {
                setSearchQuery('');
                setVendorFilter('ALL');
              }}
            />
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-clip">
              <div className="w-full overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] sm:min-w-[820px] text-left border-collapse text-xs font-sans">
                  <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                    <tr>
                      <th className="py-3 px-3.5 w-[15%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">PO Ref &amp; Date</th>
                      <th className="py-3 px-3.5 w-[22%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Vendor / Supplier</th>
                      <th className="py-3 px-3.5 w-[25%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Item &amp; Part No</th>
                      <th className="py-3 px-3 w-[13%] text-right whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Ordered / Rcvd</th>
                      <th className="py-3 pl-2 pr-5 w-[13%] text-right whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Pending &amp; Cost</th>
                      <th className="py-3 px-3.5 w-[155px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {paginatedGrnRows.map(({ po, li }) => {
                      const ordered = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
                      const received = Number(li.qty_received) || 0;
                      const pending = Math.max(0, ordered - received);
                      const poRefText = po.purchase_order_metadata?.po_ref || po.formatted_quote_ref || 'PO';
                      const poDateStr = formatProcurementDate(po.purchase_order_metadata?.po_date || po.quotation_date);
                      const vName =
                        po.purchase_order_metadata?.supplier_name ||
                        po.client_snapshot?.entity_name ||
                        'Vendor';
                      const vCompId = resolveVendorCompanyId(
                        po.purchase_order_metadata?.vendor_company_id,
                        vName
                      );
                      const unitCost = Number(li.landed_unit_cost ?? li.unit_price ?? 0);

                      return (
                        <tr
                          key={`${po.id}_${li.id}`}
                          onClick={() => handleOpenGrnModal(po)}
                          className="cursor-pointer border-l-2 border-l-transparent hover:border-l-emerald-500 hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* 1. PO REF & DATE */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate" title={poRefText}>
                              {poRefText}
                            </div>
                            <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                              {poDateStr}
                            </div>
                          </td>

                          {/* 2. VENDOR / SUPPLIER */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0">
                              {vCompId && onOpenCompany360 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCompany360(vCompId);
                                  }}
                                  className="text-left hover:text-indigo-600 hover:underline inline-flex items-center gap-1 max-w-full truncate cursor-pointer"
                                  title={vName}
                                >
                                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">{vName}</span>
                                  <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
                                </button>
                              ) : (
                                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate" title={vName}>
                                  {vName}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                              {po.purchase_order_metadata?.supplier_trn
                                ? `TRN: ${po.purchase_order_metadata.supplier_trn}`
                                : 'Warehouse Intake'}
                            </div>
                          </td>

                          {/* 3. ITEM & PART NO */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate" title={li.item_name || li.description}>
                              {li.item_name || li.description}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {li.part_no ? `PN: ${li.part_no}` : '—'}
                            </div>
                          </td>

                          {/* 4. ORDERED / RECEIVED */}
                          <td className="py-2.5 px-3 text-right align-middle overflow-hidden">
                            <div className="font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap truncate">
                              Ord: {ordered} {li.unit || 'Nos'}
                            </div>
                            <div className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 whitespace-nowrap truncate mt-0.5">
                              Rcvd: {received} {li.unit || 'Nos'}
                            </div>
                          </td>

                          {/* 5. PENDING & COST (pr-5) */}
                          <td className="py-2.5 pl-2 pr-5 text-right align-middle overflow-hidden">
                            <div className="font-mono font-bold text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap truncate">
                              Pend: {pending} {li.unit || 'Nos'}
                            </div>
                            <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap truncate mt-0.5">
                              {canViewConfidentialMargins ? `${po.currency} ${unitCost.toFixed(2)}` : 'Restricted'}
                            </div>
                          </td>

                          {/* 6. ACTIONS */}
                          <td
                            className="py-2.5 px-3.5 w-[155px] text-right whitespace-nowrap align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenGrnModal(po)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs transition cursor-pointer"
                              >
                                Receive GRN
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenBillModal(po)}
                                className="w-7 h-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Record Supplier Bill"
                              >
                                <FileText className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredGrnRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 px-4 text-center">
                          {hasActiveFilter && allPendingGrnRows.length > 0 ? (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                                <Search className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-800">
                                No Pending GRN Lines Match Your Filter
                              </div>
                              <p className="text-xs text-slate-500">
                                Clear the active search or vendor filter to view all {allPendingGrnRows.length} pending stock receipt lines.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery('');
                                  setVendorFilter('ALL');
                                }}
                                className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Clear Search / Reset Filters</span>
                              </button>
                            </div>
                          ) : (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center">
                                <PackageCheck className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-900">
                                All Active Supplier POs Received into Stock
                              </div>
                              <p className="text-xs text-slate-500">
                                There are no pending Goods Receipt Note (GRN) deliveries awaiting warehouse intake. Issue a new Supplier PO to schedule incoming stock.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPoVendorId('');
                                  setNewPoSupplierName('');
                                  setNewPoEnquiryId('');
                                  setNewPoExpectedDate('');
                                  setNewPoLines([
                                    { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
                                  ]);
                                  setShowCreatePoModal(true);
                                }}
                                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Create Supplier PO</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredGrnRows.length > 0 && (
                <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Showing <span className="font-bold text-slate-900 dark:text-slate-100">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{Math.min(safePage * itemsPerPage, filteredGrnRows.length)}</span> of{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{filteredGrnRows.length}</span> Pending GRN Lines
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Rows per page:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <span className="text-xs font-mono tabular-nums px-2.5 text-slate-600 dark:text-slate-400">
                        Page <span className="font-bold text-slate-900 dark:text-slate-100">{safePage}</span> of{' '}
                        <span className="font-bold text-slate-900 dark:text-slate-100">{totalPages}</span>
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Next Page"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 3: SUPPLIER BILLS & 3-WAY MATCH */}
      {activeTab === 'bills' && (() => {
        const filteredBills = supplierBills.filter((b) => {
          if (vendorFilter !== 'ALL' && b.vendor_name !== vendorFilter) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            b.bill_number.toLowerCase().includes(q) ||
            b.vendor_invoice_no.toLowerCase().includes(q) ||
            b.vendor_name.toLowerCase().includes(q) ||
            (b.po_ref || '').toLowerCase().includes(q)
          );
        });
        const hasActiveFilter = vendorFilter !== 'ALL' || searchQuery.trim() !== '';
        const totalPages = Math.max(1, Math.ceil(filteredBills.length / itemsPerPage));
        const safePage = Math.min(currentPage, totalPages);
        const paginatedBills = filteredBills.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

        return (
          <div className="space-y-3">
            <SearchResultCounter
              totalCount={supplierBills.length}
              filteredCount={filteredBills.length}
              searchQuery={searchQuery}
              entityLabel="Supplier Bills"
              singularEntityLabel="Supplier Bill"
              activeFiltersCount={vendorFilter !== 'ALL' ? 1 : 0}
              activeFilterLabels={vendorFilter !== 'ALL' ? [`Vendor: ${vendorFilter}`] : []}
              onClear={() => {
                setSearchQuery('');
                setVendorFilter('ALL');
              }}
            />
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-clip">
              <div className="w-full overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] sm:min-w-[820px] text-left border-collapse text-xs font-sans">
                  <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                    <tr>
                      <th className="py-3 px-3.5 w-[15%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Bill / Inv #</th>
                      <th className="py-3 px-3.5 w-[21%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Vendor &amp; Linked PO</th>
                      <th className="py-3 px-3 w-[13%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Bill / Due Date</th>
                      <th className="py-3 px-3 w-[15%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Settlement Status</th>
                      <th className="py-3 pl-2 pr-5 w-[14%] text-right whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Total &amp; Balance</th>
                      <th className="py-3 px-3.5 w-[225px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {paginatedBills.map((bill) => {
                      const hasVariance =
                        bill.three_way_match_status === 'price_variance' ||
                        bill.three_way_match_status === 'qty_variance' ||
                        bill.three_way_match_status === 'both_variance';
                      const vCompId = resolveVendorCompanyId(bill.vendor_company_id, bill.vendor_name);
                      const rawDueDateIso = (bill.due_date || '').slice(0, 10);
                      const billDateStr = formatProcurementDate(bill.bill_date);
                      const dueDateStr = bill.due_date ? formatProcurementDate(bill.due_date) : '';
                      const isOverdue = Boolean(
                        rawDueDateIso &&
                          Number(bill.balance_due || 0) > 0 &&
                          new Date(rawDueDateIso).getTime() < Date.now()
                      );
                      const matchText =
                        bill.three_way_match_status === 'matched'
                          ? '3-Way Matched'
                          : bill.three_way_match_status === 'price_variance'
                          ? 'Price Variance'
                          : bill.three_way_match_status === 'qty_variance'
                          ? 'Qty Variance'
                          : bill.three_way_match_status === 'both_variance'
                          ? 'Price & Qty Var'
                          : 'Direct Bill';

                      const pillLabel = bill.is_on_hold
                        ? 'ON HOLD'
                        : Number(bill.balance_due || 0) <= 0
                        ? 'Paid'
                        : Number(bill.amount_paid || 0) > 0
                        ? 'Partially Paid'
                        : bill.approval_status === 'approved'
                        ? 'Approved'
                        : 'Pending Approval';

                      const pillTone = bill.is_on_hold
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : Number(bill.balance_due || 0) <= 0
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : bill.approval_status === 'approved'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200';

                      return (
                        <tr
                          key={bill.id}
                          onClick={() => setViewingBillSummary(bill)}
                          className="cursor-pointer border-l-2 border-l-transparent hover:border-l-amber-500 hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* 1. BILL / INV # (Max 2 Lines) */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={bill.bill_number}>
                                {bill.bill_number}
                              </span>
                              {bill.attachment?.url && (
                                <a
                                  href={bill.attachment.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9.5px] font-semibold hover:bg-blue-100 shrink-0"
                                  title="View Supplier Invoice Scan"
                                >
                                  PDF
                                </a>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5" title={`Inv: ${bill.vendor_invoice_no}`}>
                              Inv: {bill.vendor_invoice_no || '—'}
                            </div>
                          </td>

                          {/* 2. VENDOR & LINKED PO (Max 2 Lines) */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0">
                              {vCompId && onOpenCompany360 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCompany360(vCompId);
                                  }}
                                  className="text-left hover:text-indigo-600 hover:underline inline-flex items-center gap-1 max-w-full truncate cursor-pointer"
                                  title={bill.vendor_name}
                                >
                                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">
                                    {bill.vendor_name}
                                  </span>
                                  <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
                                </button>
                              ) : (
                                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate" title={bill.vendor_name}>
                                  {bill.vendor_name}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-indigo-700 dark:text-indigo-400 truncate mt-0.5">
                              {bill.po_ref ? `PO: ${bill.po_ref}` : 'Direct Bill (No PO)'}
                            </div>
                          </td>

                          {/* 3. BILL / DUE DATE (Max 2 Lines) */}
                          <td className="py-2.5 px-3 align-middle overflow-hidden">
                            <div className="font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap truncate">
                              {billDateStr}
                            </div>
                            <div
                              className={`text-[11px] font-mono whitespace-nowrap truncate mt-0.5 ${
                                isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {dueDateStr ? `Due: ${dueDateStr}` : 'Immediate'}
                            </div>
                          </td>

                          {/* 4. SETTLEMENT STATUS & 3-WAY MATCH (Max 2 Lines) */}
                          <td className="py-2.5 px-3 align-middle overflow-hidden">
                            <div className="flex flex-col items-start gap-1 min-w-0">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border truncate max-w-full leading-tight ${pillTone}`}
                                title={bill.hold_reason || ''}
                              >
                                {pillLabel}
                              </span>
                              <div
                                className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full"
                                title={formatBillVarianceSummary(bill)}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    bill.three_way_match_status === 'matched'
                                      ? 'bg-emerald-500'
                                      : hasVariance
                                      ? 'bg-amber-500'
                                      : 'bg-slate-400'
                                  }`}
                                />
                                <span className={`truncate ${hasVariance ? 'text-amber-700 dark:text-amber-400 font-medium' : ''}`}>
                                  {matchText}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 5. TOTAL & BALANCE (Max 2 Lines, pr-5) */}
                          <td className="py-2.5 pl-2 pr-5 text-right align-middle overflow-hidden">
                            <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap truncate">
                              {bill.currency}{' '}
                              {Number(bill.grand_total || 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </div>
                            <div
                              className={`font-mono text-[11px] tabular-nums whitespace-nowrap truncate mt-0.5 ${
                                Number(bill.balance_due || 0) > 0
                                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              Bal: {bill.currency}{' '}
                              {Number(bill.balance_due || 0).toLocaleString('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </div>
                          </td>

                          {/* 6. ACTIONS */}
                          <td
                            className="py-2.5 px-3.5 w-[225px] text-right whitespace-nowrap align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              {bill.approval_status !== 'approved' && (!hasVariance || userIsAdmin) ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await ProcurementRepository.save({
                                      ...bill,
                                      approval_status: 'approved',
                                      is_on_hold: false,
                                      variance_approved_by: user.full_name || user.email || 'Admin',
                                      variance_approved_at: new Date().toISOString(),
                                      updated_at: new Date().toISOString()
                                    });
                                    triggerToast?.(`Approved Supplier Bill ${bill.bill_number}.`, 'success');
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs cursor-pointer"
                                  title="Approve Supplier Bill for Settlement"
                                >
                                  Approve
                                </button>
                              ) : !bill.is_on_hold && bill.balance_due > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => openCreatePvModal(bill)}
                                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-2xs cursor-pointer"
                                  title="Settle Bill via Outbound Payment Voucher (PV)"
                                >
                                  Pay
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setViewingBillSummary(bill)}
                                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
                                >
                                  Summary
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setViewingBillSummary(bill)}
                                className="w-7 h-7 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="View / Print 3-Way Match Bill Summary"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextHold = !bill.is_on_hold;
                                  await ProcurementRepository.save({
                                    ...bill,
                                    is_on_hold: nextHold,
                                    hold_reason: nextHold ? 'Disputed / On Hold for Verification' : undefined,
                                    updated_at: new Date().toISOString()
                                  });
                                  triggerToast?.(
                                    nextHold
                                      ? `${bill.bill_number} placed on payment hold.`
                                      : `${bill.bill_number} released from hold.`,
                                    'info'
                                  );
                                }}
                                className={`w-7 h-7 rounded-lg border transition inline-flex items-center justify-center cursor-pointer ${
                                  bill.is_on_hold
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                }`}
                                title={bill.is_on_hold ? 'Release Payment Hold' : 'Place Bill on Payment Hold'}
                              >
                                {bill.is_on_hold ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenBillModal(undefined, bill)}
                                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Edit Supplier Bill"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmTarget({
                                    type: 'bill',
                                    id: bill.id,
                                    refLabel: `${bill.bill_number} (Inv: ${bill.vendor_invoice_no})`,
                                    vendorName: bill.vendor_name,
                                    amountLabel: `${bill.currency} ${Number(bill.grand_total || 0).toFixed(2)}`
                                  });
                                }}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Move Supplier Bill to Recycle Bin"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredBills.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 px-4 text-center">
                          {hasActiveFilter ? (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                                <Search className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-800">
                                No Supplier Bills Match Your Filter
                              </div>
                              <p className="text-xs text-slate-500">
                                No bills matched{' '}
                                {searchQuery.trim() ? (
                                  <span className="font-semibold text-slate-700">&ldquo;{searchQuery}&rdquo;</span>
                                ) : (
                                  <span className="font-semibold text-slate-700">{vendorFilter}</span>
                                )}
                                . Clear the active filter to view all {supplierBills.length} Supplier Bills.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery('');
                                  setVendorFilter('ALL');
                                }}
                                className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Clear Search / Reset Filters</span>
                              </button>
                            </div>
                          ) : (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                                <FileText className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-900">
                                No Supplier Bills Recorded Yet
                              </div>
                              <p className="text-xs text-slate-500">
                                Record incoming supplier tax invoices to run automated 3-Way Match verification against Purchase Orders and GRN receipts.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleOpenBillModal()}
                                className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Record First Supplier Bill</span>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredBills.length > 0 && (
                <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Showing <span className="font-bold text-slate-900 dark:text-slate-100">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{Math.min(safePage * itemsPerPage, filteredBills.length)}</span> of{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{filteredBills.length}</span> Supplier Bills
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Rows per page:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <span className="text-xs font-mono tabular-nums px-2.5 text-slate-600 dark:text-slate-400">
                        Page <span className="font-bold text-slate-900 dark:text-slate-100">{safePage}</span> of{' '}
                        <span className="font-bold text-slate-900 dark:text-slate-100">{totalPages}</span>
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Next Page"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* TAB 4: PAYMENT VOUCHERS & VENDOR RETURNS */}
      {activeTab === 'vouchers' && (() => {
        const filteredVouchers = paymentVouchersAndReturns.filter((doc) => {
          const vName =
            doc.payment_voucher_metadata?.payee_name ||
            doc.payment_voucher_metadata?.paid_to_vendor_name ||
            doc.vendor_return_metadata?.supplier_name ||
            doc.vendor_return_metadata?.vendor_name ||
            doc.client_snapshot?.entity_name ||
            '';
          if (vendorFilter !== 'ALL' && vName !== vendorFilter) return false;
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            (doc.formatted_quote_ref || '').toLowerCase().includes(q) ||
            vName.toLowerCase().includes(q) ||
            (doc.quotation_subject || '').toLowerCase().includes(q)
          );
        });
        const hasActiveFilter = vendorFilter !== 'ALL' || searchQuery.trim() !== '';
        const totalPages = Math.max(1, Math.ceil(filteredVouchers.length / itemsPerPage));
        const safePage = Math.min(currentPage, totalPages);
        const paginatedVouchers = filteredVouchers.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

        return (
          <div className="space-y-3">
            <SearchResultCounter
              totalCount={paymentVouchersAndReturns.length}
              filteredCount={filteredVouchers.length}
              searchQuery={searchQuery}
              entityLabel="Vouchers & Returns"
              singularEntityLabel="Voucher / Return"
              activeFiltersCount={vendorFilter !== 'ALL' ? 1 : 0}
              activeFilterLabels={vendorFilter !== 'ALL' ? [`Vendor: ${vendorFilter}`] : []}
              onClear={() => {
                setSearchQuery('');
                setVendorFilter('ALL');
              }}
            />
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-clip">
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Outbound Payment Vouchers (PV), Material Return Notes (MRN) &amp; Vendor Debit Notes (DN)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleIssueVendorReturn('material_return_note')}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
                  >
                    + Material Return (MRN)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleIssueVendorReturn('debit_note')}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                  >
                    + Vendor Debit Note (DN)
                  </button>
                </div>
              </div>
              <div className="w-full overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[760px] sm:min-w-[820px] text-left border-collapse text-xs font-sans">
                  <thead className="sticky top-[76px] z-20 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-[0_1px_0_0_rgba(226,232,240,1)] dark:shadow-[0_1px_0_0_rgba(30,41,59,1)] text-[11px] font-mono font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 select-none">
                    <tr>
                      <th className="py-3 px-3.5 w-[16%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Voucher / Doc Ref</th>
                      <th className="py-3 px-3.5 w-[25%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Payee / Vendor</th>
                      <th className="py-3 px-3 w-[14%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Date &amp; Mode</th>
                      <th className="py-3 px-3 w-[15%] whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Status</th>
                      <th className="py-3 pl-2 pr-5 w-[14%] text-right whitespace-nowrap truncate bg-slate-50 dark:bg-slate-900">Amount</th>
                      <th className="py-3 px-3.5 w-[120px] text-right whitespace-nowrap bg-slate-50 dark:bg-slate-900">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {paginatedVouchers.map((doc) => {
                      const isPv = doc.document_type === 'payment_voucher';
                      const isMrn =
                        doc.document_type === 'material_return_note' ||
                        (doc.document_type as string) === 'material_return';
                      const amt = isPv
                        ? Number(
                            doc.payment_voucher_metadata?.amount_paid ??
                              doc.financial_totals?.grand_total ??
                              doc.grand_total ??
                              0
                          )
                        : Number(doc.financial_totals?.grand_total ?? doc.grand_total ?? 0);
                      const vName =
                        doc.payment_voucher_metadata?.payee_name ||
                        doc.payment_voucher_metadata?.paid_to_vendor_name ||
                        doc.vendor_return_metadata?.supplier_name ||
                        doc.vendor_return_metadata?.vendor_name ||
                        doc.client_snapshot?.entity_name ||
                        'Vendor';
                      const vCompId = resolveVendorCompanyId(
                        doc.payment_voucher_metadata?.vendor_company_id ||
                          doc.vendor_return_metadata?.vendor_company_id,
                        vName
                      );
                      const docDateStr = formatProcurementDate(doc.quotation_date);
                      const modeOrReason = isPv
                        ? doc.payment_voucher_metadata?.payment_mode ||
                          doc.payment_voucher_metadata?.payment_method ||
                          'Bank Transfer'
                        : doc.vendor_return_metadata?.return_reason || 'Vendor Return';
                      const refSubText = isPv
                        ? doc.payment_voucher_metadata?.transaction_reference ||
                          doc.payment_voucher_metadata?.cheque_or_utr_no ||
                          'Treasury Disbursed'
                        : doc.vendor_return_metadata?.original_po_ref || 'Stock Adjusted';

                      return (
                        <tr
                          key={doc.id}
                          onClick={() => handleOpenInStudio(doc)}
                          className="cursor-pointer border-l-2 border-l-transparent hover:border-l-indigo-500 hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          {/* 1. VOUCHER / DOC REF (Max 2 Lines) */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 truncate" title={doc.formatted_quote_ref}>
                              {doc.formatted_quote_ref}
                            </div>
                            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {isPv
                                ? 'Payment Voucher (PV)'
                                : isMrn
                                ? 'Material Return (MRN)'
                                : 'Debit Note (DN)'}
                            </div>
                          </td>

                          {/* 2. PAYEE / VENDOR (Max 2 Lines) */}
                          <td className="py-2.5 px-3.5 align-middle overflow-hidden">
                            <div className="flex items-center gap-1 min-w-0">
                              {vCompId && onOpenCompany360 ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenCompany360(vCompId);
                                  }}
                                  className="text-left hover:text-indigo-600 hover:underline inline-flex items-center gap-1 max-w-full truncate cursor-pointer"
                                  title={vName}
                                >
                                  <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate">{vName}</span>
                                  <ArrowUpRight className="w-3 h-3 text-slate-400 shrink-0" />
                                </button>
                              ) : (
                                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate" title={vName}>
                                  {vName}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5" title={doc.quotation_subject || ''}>
                              {doc.quotation_subject || '—'}
                            </div>
                          </td>

                          {/* 3. DATE & MODE (Max 2 Lines) */}
                          <td className="py-2.5 px-3 align-middle overflow-hidden">
                            <div className="font-mono text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap truncate">
                              {docDateStr}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5" title={modeOrReason}>
                              {modeOrReason}
                            </div>
                          </td>

                          {/* 4. STATUS (Max 2 Lines) */}
                          <td className="py-2.5 px-3 align-middle overflow-hidden">
                            <div className="flex flex-col items-start gap-1 min-w-0">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold border truncate max-w-full leading-tight ${
                                  isPv
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : isMrn
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {isPv ? 'Settled' : isMrn ? 'Returned' : 'Credit Issued'}
                              </span>
                              <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                                <span
                                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    isPv ? 'bg-emerald-500' : isMrn ? 'bg-blue-500' : 'bg-rose-500'
                                  }`}
                                />
                                <span className="truncate font-mono">{refSubText}</span>
                              </div>
                            </div>
                          </td>

                          {/* 5. AMOUNT (Max 2 Lines, pr-5) */}
                          <td className="py-2.5 pl-2 pr-5 text-right align-middle overflow-hidden">
                            <div className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100 tabular-nums whitespace-nowrap truncate">
                              {isMrn
                                ? 'Unpriced'
                                : `${doc.currency} ${amt.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}`}
                            </div>
                            <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                              {isPv ? 'AP Disbursed' : isMrn ? 'Physical Return' : 'AP Deduction'}
                            </div>
                          </td>

                          {/* 6. ACTIONS */}
                          <td
                            className="py-2.5 px-3.5 w-[120px] text-right whitespace-nowrap align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenInStudio(doc)}
                                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold shadow-2xs transition cursor-pointer"
                                title="Open in A4 Studio"
                              >
                                Studio
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteConfirmTarget({
                                    type: 'voucher',
                                    id: doc.id,
                                    refLabel: doc.formatted_quote_ref || 'Voucher / Return',
                                    vendorName: vName,
                                    amountLabel: isMrn ? 'Unpriced' : `${doc.currency} ${amt.toFixed(2)}`
                                  });
                                }}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition inline-flex items-center justify-center cursor-pointer"
                                title="Move Document to Recycle Bin"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredVouchers.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-12 px-4 text-center">
                          {hasActiveFilter ? (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                                <Search className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-800">
                                No Payment Vouchers or Returns Match Your Filter
                              </div>
                              <p className="text-xs text-slate-500">
                                Clear the active search or vendor filter to view all {paymentVouchersAndReturns.length} vouchers and returns.
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery('');
                                  setVendorFilter('ALL');
                                }}
                                className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Clear Search / Reset Filters</span>
                              </button>
                            </div>
                          ) : (
                            <div className="max-w-md mx-auto flex flex-col items-center gap-2.5">
                              <div className="w-11 h-11 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center">
                                <DollarSign className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-bold text-slate-900">
                                No Payment Vouchers or Vendor Returns Issued Yet
                              </div>
                              <p className="text-xs text-slate-500">
                                Settle approved supplier bills with an Outbound Payment Voucher (PV), or issue a Material Return Note (MRN) / Debit Note (DN).
                              </p>
                              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleIssuePaymentVoucher()}
                                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Issue First Payment Voucher</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleIssueVendorReturn('material_return_note')}
                                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition cursor-pointer"
                                >
                                  <span>Issue Material Return (MRN)</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {filteredVouchers.length > 0 && (
                <div className="px-4 py-3 bg-slate-50/60 dark:bg-slate-900/60 border-t border-slate-200/80 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Showing <span className="font-bold text-slate-900 dark:text-slate-100">{(safePage - 1) * itemsPerPage + 1}</span> to{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{Math.min(safePage * itemsPerPage, filteredVouchers.length)}</span> of{' '}
                    <span className="font-bold text-slate-900 dark:text-slate-100">{filteredVouchers.length}</span> Vouchers &amp; Returns
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-sans">Rows per page:</span>
                      <select
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                      >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        disabled={safePage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        <span>Prev</span>
                      </button>
                      <span className="text-xs font-mono tabular-nums px-2.5 text-slate-600 dark:text-slate-400">
                        Page <span className="font-bold text-slate-900 dark:text-slate-100">{safePage}</span> of{' '}
                        <span className="font-bold text-slate-900 dark:text-slate-100">{totalPages}</span>
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer text-xs font-semibold inline-flex items-center gap-1"
                        title="Next Page"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
        </>
      )}

      {/* MODAL 1: CREATE NEW SUPPLIER PO */}
      {showCreatePoModal && (() => {
        const poNetSubtotal = QuotationRepository.roundCurrency(
          newPoLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)
        );
        const poEstVat = QuotationRepository.roundCurrency(poNetSubtotal * 0.05);
        const poGrandTotal = QuotationRepository.roundCurrency(poNetSubtotal + poEstVat);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Create Outbound Supplier Purchase Order (PO)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Link to a registered Vendor &amp; optionally to a Client Enquiry, or issue as a Warehouse Stock Replenishment PO
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreatePoModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs bg-slate-50/80 dark:bg-slate-950/70 flex-1">
                {/* Chapter 1: Vendor & Document Metadata */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Vendor &amp; Document Metadata
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Select registered supplier, link client enquiry, and set expected delivery schedule
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                    <div>
                      <FieldLabel label="Select Vendor from Directory" />
                      <select
                        value={newPoVendorId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setNewPoVendorId(id);
                          const v = companies.find((c) => c.id === id);
                          if (v) setNewPoSupplierName(getCompanyName(v));
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-xs text-slate-800 dark:text-slate-100 leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="">-- Select Registered Vendor (or type name) --</option>
                        {vendors.map((v) => {
                          const vName = getCompanyName(v);
                          return (
                            <option key={v.id} value={v.id}>
                              {vName} {v.relationship_type ? `(${v.relationship_type})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Supplier / Vendor Legal Name" required />
                      <input
                        type="text"
                        value={newPoSupplierName}
                        onChange={(e) => setNewPoSupplierName(e.target.value)}
                        placeholder="Supplier Name"
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-xs text-slate-800 dark:text-slate-100 leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <FieldLabel
                        label="Link to Enquiry"
                        hint="Optional — Leave blank to issue a standalone Warehouse Stock Replenishment PO, or select an active Client Enquiry to automatically import its line items."
                      />
                      <select
                        value={newPoEnquiryId}
                        onChange={(e) => {
                          const enqId = e.target.value;
                          setNewPoEnquiryId(enqId);
                          const enq = enquiries.find((x) => x.id === enqId);
                          if (enq && enq.line_items && enq.line_items.length > 0) {
                            setNewPoLines(
                              enq.line_items.map((li) => {
                                const prod = products.find((p) => p.id === li.product_id);
                                return {
                                  product_id: li.product_id || '',
                                  item_name: li.item_name || li.description || '',
                                  part_no: li.part_no || prod?.part_no || '',
                                  qty: Number(li.quantity ?? li.qty) || 1,
                                  unit: li.unit || prod?.unit || 'Nos',
                                  unit_cost: Number(li.cost_price ?? prod?.cost_price ?? 0) || 0
                                };
                              })
                            );
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-xs text-slate-800 dark:text-slate-100 leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      >
                        <option value="">Warehouse Stock Replenishment (Standalone PO)</option>
                        {enquiries.map((enq) => (
                          <option key={enq.id} value={enq.id}>
                            ENQ #{enq.sn} — {enq.company_name} ({enq.description?.slice(0, 40)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Expected Delivery Date" />
                      <input
                        type="date"
                        value={newPoExpectedDate}
                        onChange={(e) => setNewPoExpectedDate(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 font-mono text-xs text-slate-800 dark:text-slate-100 dark:[color-scheme:dark] leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Chapter 2: Line Items & Cost Allocation */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Line Items &amp; Cost Allocation
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Select catalog items or specify custom description, quantity, and unit cost
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNewPoLines((prev) => [
                          ...prev,
                          { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 font-bold text-[11px] cursor-pointer transition"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <div className="col-span-4">Catalog Item</div>
                    <div className="col-span-3">Item Description *</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-2 text-right whitespace-nowrap">Unit Cost ({defaultCurrency})</div>
                    <div className="col-span-2 text-right">Line Total</div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {newPoLines.map((line, idx) => {
                      const lineTotal = QuotationRepository.roundCurrency(
                        (Number(line.qty) || 0) * (Number(line.unit_cost) || 0)
                      );
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center py-2 px-1">
                          <div className="col-span-4">
                            <select
                              value={line.product_id}
                              onChange={(e) => {
                                const pid = e.target.value;
                                const prod = products.find((p) => p.id === pid);
                                setNewPoLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? {
                                          ...l,
                                          product_id: pid,
                                          item_name: prod?.name || prod?.description || l.item_name,
                                          part_no: prod?.part_no || prod?.sku || l.part_no,
                                          unit: prod?.unit || l.unit || 'Nos',
                                          unit_cost: Number(
                                            prod?.cost_price ||
                                              prod?.last_landed_cost ||
                                              (prod as any)?.selling_price ||
                                              (prod as any)?.unit_price ||
                                              l.unit_cost ||
                                              0
                                          )
                                        }
                                      : l
                                  )
                                );
                              }}
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 bg-white dark:bg-slate-800/90 text-[11px] text-slate-800 dark:text-slate-100 leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            >
                              <option value="">-- Pick Catalog Item or Type --</option>
                              {products.filter((p) => !p.is_deleted).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {formatProductVariantSelectorLabel(p, products)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <input
                              type="text"
                              value={line.item_name}
                              onChange={(e) =>
                                setNewPoLines((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, item_name: e.target.value } : l))
                                )
                              }
                              placeholder="Item Description *"
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 bg-white dark:bg-slate-800/90 text-[11px] text-slate-800 dark:text-slate-100 leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                          <div className="col-span-1">
                            <input
                              type="number"
                              min="1"
                              value={line.qty === 0 ? '' : line.qty}
                              onChange={(e) =>
                                setNewPoLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, qty: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) } : l
                                  )
                                )
                              }
                              placeholder="1"
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-800/90 font-mono text-[11px] text-slate-800 dark:text-slate-100 text-right leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              step="0.01"
                              value={line.unit_cost === 0 ? '' : line.unit_cost}
                              onChange={(e) =>
                                setNewPoLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, unit_cost: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) } : l
                                  )
                                )
                              }
                              placeholder="0.00"
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 bg-white dark:bg-slate-800/90 font-mono text-[11px] text-slate-800 dark:text-slate-100 text-right leading-normal focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                          <div className="col-span-2 flex items-center justify-end gap-1.5">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">
                              {lineTotal.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setNewPoLines((prev) =>
                                  prev.length <= 1
                                    ? [{ product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }]
                                    : prev.filter((_, i) => i !== idx)
                                )
                              }
                              title={newPoLines.length <= 1 ? 'Clear line item' : 'Remove line item'}
                              className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded cursor-pointer transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Executive Sticky Summary Footer Bar */}
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Net: <strong className="text-slate-900 dark:text-slate-100">{defaultCurrency} {poNetSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    VAT (5%): <strong className="text-slate-700 dark:text-slate-300">{defaultCurrency} {poEstVat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-indigo-700 dark:text-indigo-300 font-bold whitespace-nowrap">
                    Grand Total: {defaultCurrency} {poGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowCreatePoModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingPo}
                    onClick={() => handleCreateSupplierPo(false)}
                    className="h-9 px-4 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 disabled:opacity-50 text-indigo-800 dark:text-indigo-300 text-xs font-semibold cursor-pointer"
                  >
                    {isCreatingPo ? 'Saving...' : 'Save PO'}
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingPo}
                    onClick={() => handleCreateSupplierPo(true)}
                    className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    {isCreatingPo ? 'Saving...' : 'Save & Open in Studio'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 2: RECEIVE STOCK (GRN) & LANDED COST ALLOCATION */}
      {grnTargetPo && (() => {
        const totalReceivingNow = grnLandedPreview.reduce((s, l) => s + (Number(l.qty_receiving_now) || 0), 0);
        const totalBatchLandedVal = QuotationRepository.roundCurrency(
          grnLandedPreview.reduce((s, l) => s + (Number(l.qty_receiving_now) || 0) * (Number(l.landedUnitCost) || 0), 0)
        );
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Receive Stock (GRN) — {grnTargetPo.purchase_order_metadata?.po_ref || grnTargetPo.formatted_quote_ref}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Supplier: {grnTargetPo.purchase_order_metadata?.supplier_name} · Proportional Landed Cost Calculation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGrnTargetPo(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs bg-slate-50/80 dark:bg-slate-950/70 flex-1">
                {/* Chapter 1: GRN Receipt & Landed Cost Metadata */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        GRN Receipt &amp; Landed Cost Parameters
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Record warehouse receipt number, date, and inbound freight/duty allocation mode
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                    <div>
                      <FieldLabel label="GRN Number" />
                      <input
                        type="text"
                        value={grnNumber}
                        onChange={(e) => setGrnNumber(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel label="Receipt Date" />
                      <input
                        type="date"
                        value={grnReceivedDate}
                        onChange={(e) => setGrnReceivedDate(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 dark:[color-scheme:dark] text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel
                        label={`Freight / Duty (${grnTargetPo.currency})`}
                        hint="Total inbound freight, customs duty, and clearing charges to allocate across received items."
                      />
                      <input
                        type="number"
                        step="0.01"
                        value={grnFreightCustoms === 0 ? '' : grnFreightCustoms}
                        placeholder="0.00"
                        onChange={(e) => setGrnFreightCustoms(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel
                        label="Landed Cost Mode"
                        hint="Choose Proportional by Line Value to automatically distribute Freight/Duty across items, or Manual Per-Line Override."
                        hintAlign="right"
                      />
                      <select
                        value={grnAllocationMode}
                        onChange={(e) => setGrnAllocationMode(e.target.value as any)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="proportional_value">Proportional by Line Value</option>
                        <option value="manual">Manual Per-Line Override</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Chapter 2: Line-by-Line Receipt & Landed Cost Preview */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Line Items &amp; Landed Cost Allocation
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Enter quantities received in this batch and verify landed unit cost
                      </p>
                    </div>
                  </div>

                  <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                          <th className="py-2.5 px-3">Item</th>
                          <th className="py-2.5 px-2 text-right whitespace-nowrap">Ordered</th>
                          <th className="py-2.5 px-2 text-right whitespace-nowrap">Prev Recv</th>
                          <th className="py-2.5 px-2 text-right whitespace-nowrap">Receive Now</th>
                          <th className="py-2.5 px-2 text-right whitespace-nowrap">PO Unit Cost</th>
                          <th className="py-2.5 px-2 text-right whitespace-nowrap">Allocated Freight</th>
                          <th className="py-2.5 px-3 text-right whitespace-nowrap">Landed Unit Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {grnLandedPreview.map((line, idx) => (
                          <tr key={line.line_item_id}>
                            <td className="py-2 px-3">
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{line.item_name}</div>
                              {line.part_no && (
                                <div className="text-[10px] font-mono text-slate-400">PN: {line.part_no}</div>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">{line.qty_ordered}</td>
                            <td className="py-2 px-2 text-right font-mono text-slate-500">
                              {line.qty_already_received}
                            </td>
                            <td className="py-2 px-2 text-right">
                              <input
                                type="number"
                                min="0"
                                value={line.qty_receiving_now}
                                onChange={(e) => {
                                  const val = Math.max(0, Number(e.target.value) || 0);
                                  setGrnLines((prev) =>
                                    prev.map((l, i) => (i === idx ? { ...l, qty_receiving_now: val } : l))
                                  );
                                }}
                                className="w-20 rounded-lg border border-emerald-400 dark:border-emerald-700 px-2 py-1 text-right font-mono font-bold bg-emerald-50/40 dark:bg-emerald-950/40 text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                              {line.po_unit_cost.toFixed(2)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono text-slate-700 dark:text-slate-300">
                              {grnAllocationMode === 'manual' ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  value={line.manual_landed_cost_addition}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setGrnLines((prev) =>
                                      prev.map((l, i) =>
                                        i === idx ? { ...l, manual_landed_cost_addition: val } : l
                                      )
                                    );
                                  }}
                                  className="w-24 rounded border border-slate-300 dark:border-slate-700 px-1.5 py-0.5 text-right font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                />
                              ) : (
                                <span>{line.allocatedFreight.toFixed(2)}</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-indigo-800 dark:text-indigo-300">
                              {line.landedUnitCost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3">
                    <input
                      type="checkbox"
                      checked={grnUpdateCatalogCost}
                      onChange={(e) => setGrnUpdateCatalogCost(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600"
                    />
                    <span>
                      Also overwrite base catalog <strong>Cost Price</strong> with new Landed Unit Cost (by default, only <code className="font-mono">last_landed_cost</code> is updated so catalog baseline prices stay protected)
                    </span>
                  </label>
                </div>
              </div>

              {/* Executive Sticky Summary Footer Bar */}
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Receiving Now: <strong className="text-slate-900 dark:text-slate-100">{totalReceivingNow} Units</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Freight/Duty: <strong className="text-slate-700 dark:text-slate-300">{grnTargetPo.currency} {Number(grnFreightCustoms || 0).toFixed(2)}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                    Batch Landed Value: {grnTargetPo.currency} {totalBatchLandedVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setGrnTargetPo(null)}
                    className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSubmittingGrn}
                    onClick={handleConfirmGrn}
                    className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isSubmittingGrn ? 'Posting GRN...' : 'Confirm GRN & Add to Stock'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 3: RECORD / EDIT SUPPLIER BILL & 3-WAY MATCH */}
      {showBillModal && (() => {
        const itemsSub = QuotationRepository.roundCurrency(
          billLines.reduce((s, r) => s + (Number(r.line_total) || 0), 0)
        );
        const taxVal = QuotationRepository.roundCurrency(Number(billTaxAmount) || 0);
        const freightVal = QuotationRepository.roundCurrency(Number(billFreightCustoms) || 0);
        const grandVal = QuotationRepository.roundCurrency(itemsSub + taxVal + freightVal);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {editingBill ? `Edit Supplier Bill (${editingBill.bill_number})` : 'Record Supplier Bill & 3-Way Match'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Compare Vendor Invoice against PO &amp; GRN quantities/rates and attach compressed PDF scan
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBillModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs bg-slate-50/80 dark:bg-slate-950/70 flex-1">
                {/* 3-Way Match Live Banner */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    liveThreeWayMatch.status === 'matched'
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : liveThreeWayMatch.status === 'no_po'
                      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {liveThreeWayMatch.status === 'matched' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    )}
                    <div>
                      <div className="font-bold">3-Way Match Check: {liveThreeWayMatch.summary}</div>
                      {duplicateBillWarning && (
                        <div className="text-rose-700 dark:text-rose-400 font-bold mt-0.5">
                          Duplicate Warning: Vendor Invoice #{billVendorInvoiceNo} is already recorded on {duplicateBillWarning.bill_number}!
                        </div>
                      )}
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 font-bold cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={billIsOnHold}
                      onChange={(e) => setBillIsOnHold(e.target.checked)}
                      className="rounded border-slate-300 text-rose-600"
                    />
                    <span>Place Payment Hold</span>
                  </label>
                </div>

                {/* Chapter 1: Vendor & Document Metadata */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Vendor &amp; Document Metadata
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Link an issued Supplier PO, choose vendor, and enter invoice reference and dates
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
                    <div>
                      <FieldLabel
                        label="Link to Supplier PO"
                        hint="Link an issued Supplier PO to automatically load ordered & received GRN quantities for 3-Way Match verification."
                      />
                      <select
                        value={billPoId}
                        onChange={(e) => handleSelectBillPo(e.target.value)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- Direct Bill (No Linked PO) --</option>
                        {supplierPOs.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.purchase_order_metadata?.po_ref || po.formatted_quote_ref} — {po.purchase_order_metadata?.supplier_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Select Vendor from Directory" />
                      <select
                        value={billVendorId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setBillVendorId(id);
                          const v = companies.find((c) => c.id === id);
                          if (v) {
                            setBillVendorName(getCompanyName(v));
                            if (v.tax_registration_no) setBillVendorTrn(v.tax_registration_no);
                            if (v.default_currency) setBillCurrency(v.default_currency);
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- Pick from Vendor Directory --</option>
                        {vendors.map((v) => {
                          const vName = getCompanyName(v);
                          return (
                            <option key={v.id} value={v.id}>
                              {vName} {v.relationship_type ? `(${v.relationship_type})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Vendor / Supplier Legal Name" required />
                      <input
                        type="text"
                        value={billVendorName}
                        onChange={(e) => setBillVendorName(e.target.value)}
                        placeholder="Supplier Legal Name"
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel label="Vendor Invoice #" required />
                      <input
                        type="text"
                        value={billVendorInvoiceNo}
                        onChange={(e) => setBillVendorInvoiceNo(e.target.value)}
                        placeholder="e.g. INV-2026-9921"
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel label="Invoice & Due Dates" />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={billInvoiceDate}
                          onChange={(e) => setBillInvoiceDate(e.target.value)}
                          title="Invoice Date"
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 dark:[color-scheme:dark] text-[11px] leading-normal"
                        />
                        <input
                          type="date"
                          value={billDueDate}
                          onChange={(e) => setBillDueDate(e.target.value)}
                          title="Payment Due Date"
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 dark:[color-scheme:dark] text-[11px] leading-normal"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <div>
                        <FieldLabel label="Currency" />
                        <input
                          type="text"
                          value={billCurrency}
                          onChange={(e) => setBillCurrency(e.target.value.toUpperCase())}
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                        />
                      </div>
                      <div>
                        <FieldLabel label="Exch. Rate" />
                        <input
                          type="number"
                          step="0.0001"
                          value={billExchangeRate}
                          onChange={(e) => setBillExchangeRate(Number(e.target.value) || 1)}
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chapter 2: Line Items & Bill Allocation */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Line Items &amp; Bill Allocation
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Verify billed quantities and unit rates against PO and Warehouse GRN
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setBillLines((prev) => [
                          ...prev,
                          {
                            id: `bline_${Date.now()}`,
                            item_name: '',
                            unit: 'Nos',
                            po_qty: 0,
                            grn_qty: 0,
                            billed_qty: 1,
                            po_unit_cost: 0,
                            billed_unit_cost: 0,
                            tax_rate: 5,
                            line_total: 0
                          }
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 font-bold text-[11px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl overflow-x-auto scrollbar-thin">
                    <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400">
                          <th className="py-2 px-3">Item</th>
                          <th className="py-2 px-2 text-right whitespace-nowrap">PO Qty</th>
                          <th className="py-2 px-2 text-right whitespace-nowrap">GRN Qty</th>
                          <th className="py-2 px-2 text-right whitespace-nowrap">Billed Qty</th>
                          <th className="py-2 px-2 text-right whitespace-nowrap">PO Rate</th>
                          <th className="py-2 px-2 text-right whitespace-nowrap">Billed Rate</th>
                          <th className="py-2 px-3 text-right whitespace-nowrap">Line Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {billLines.map((l, idx) => (
                          <tr key={l.id}>
                            <td className="py-1.5 px-3">
                              <input
                                type="text"
                                value={l.item_name}
                                onChange={(e) =>
                                  setBillLines((prev) =>
                                    prev.map((row, i) =>
                                      i === idx ? { ...row, item_name: e.target.value } : row
                                    )
                                  )
                                }
                                placeholder="Description"
                                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-500">{l.po_qty ?? 0}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-500">{l.grn_qty ?? 0}</td>
                            <td className="py-1.5 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={l.billed_qty === 0 ? '' : l.billed_qty}
                                placeholder="0"
                                onChange={(e) => {
                                  const q = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                                  setBillLines((prev) =>
                                    prev.map((row, i) =>
                                      i === idx
                                        ? {
                                            ...row,
                                            billed_qty: q,
                                            line_total: QuotationRepository.roundCurrency(q * row.billed_unit_cost)
                                          }
                                        : row
                                    )
                                  );
                                }}
                                className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-right font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                              {Number(l.po_unit_cost || 0).toFixed(2)}
                            </td>
                            <td className="py-1.5 px-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={l.billed_unit_cost === 0 ? '' : l.billed_unit_cost}
                                placeholder="0.00"
                                onChange={(e) => {
                                  const r = e.target.value === '' ? 0 : Math.max(0, Number(e.target.value));
                                  setBillLines((prev) =>
                                    prev.map((row, i) =>
                                      i === idx
                                        ? {
                                            ...row,
                                            billed_unit_cost: r,
                                            line_total: QuotationRepository.roundCurrency(row.billed_qty * r)
                                          }
                                        : row
                                    )
                                  );
                                }}
                                className="w-24 rounded-lg border border-slate-300 dark:border-slate-700 px-1.5 py-1 text-right font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {l.line_total.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Chapter 3: Financial Summary, Taxes & Attachments */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Financial Summary, Taxes &amp; Attachments
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Configure VAT, freight/duty, and attach compressed vendor invoice scan
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 dark:text-slate-300">
                          Attach Vendor Invoice Scan (PDF / Image)
                        </label>
                        <select
                          value={pdfPreset}
                          onChange={(e) => setPdfPreset(e.target.value as PdfCompressionPreset)}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-[10.5px] bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          <option value="standard">Standard Compress (~150 DPI)</option>
                          <option value="extreme">Extreme Compress (~110 DPI)</option>
                          <option value="original">Keep Original</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer">
                          <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>{isUploadingBillFile ? 'Compressing & Uploading...' : 'Upload Invoice PDF / Image'}</span>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            disabled={isUploadingBillFile}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadBillAttachment(f);
                            }}
                          />
                        </label>
                        {billAttachment && (
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400 truncate max-w-[160px]">
                              {billAttachment.name}
                            </span>
                            {billAttachment.original_size_bytes &&
                              billAttachment.compressed_size_bytes && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-mono text-[10px]">
                                  {formatByteSize(billAttachment.original_size_bytes)} →{' '}
                                  {formatByteSize(billAttachment.compressed_size_bytes)}
                                </span>
                              )}
                            <button
                              type="button"
                              onClick={async () => {
                                if (billAttachment.url) {
                                  await deleteFromStorageBucket(billAttachment.url);
                                }
                                setBillAttachment(undefined);
                              }}
                              className="text-rose-600 hover:underline text-[10px] cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FieldLabel label={`Tax / VAT (${billCurrency})`} />
                        <input
                          type="number"
                          step="0.01"
                          value={billTaxAmount === 0 ? '' : billTaxAmount}
                          placeholder="0.00"
                          onChange={(e) => setBillTaxAmount(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <FieldLabel label={`Freight / Duty (${billCurrency})`} />
                        <input
                          type="number"
                          step="0.01"
                          value={billFreightCustoms === 0 ? '' : billFreightCustoms}
                          placeholder="0.00"
                          onChange={(e) => setBillFreightCustoms(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Executive Sticky Summary Footer Bar */}
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Net: <strong className="text-slate-900 dark:text-slate-100">{billCurrency} {itemsSub.toFixed(2)}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    VAT: <strong className="text-slate-700 dark:text-slate-300">{billCurrency} {taxVal.toFixed(2)}</strong>
                  </span>
                  {freightVal > 0 && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        Freight: <strong className="text-slate-700 dark:text-slate-300">{billCurrency} {freightVal.toFixed(2)}</strong>
                      </span>
                    </>
                  )}
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap">
                    Grand Total: {billCurrency} {grandVal.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowBillModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSavingBill}
                    onClick={handleSaveSupplierBill}
                    className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 shadow-xs"
                  >
                    {isSavingBill ? 'Saving Bill...' : 'Save Supplier Bill'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: ISSUE OUTBOUND PAYMENT VOUCHER (PV) */}
      {showCreatePvModal && (() => {
        const allocatedBillsCount = Object.values(pvSelectedBills).filter((v) => Number(v) > 0).length;
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Issue Outbound Payment Voucher (PV)
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Select Payee / Vendor, allocate against open Supplier Bills or POs, and save or open in A4 Studio
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreatePvModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs bg-slate-50/80 dark:bg-slate-950/70 flex-1">
                {/* Chapter 1: Vendor & Document Metadata */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Vendor &amp; Document Metadata
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Select beneficiary vendor, linked PO, payment method, and UTR/cheque reference
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                    <div>
                      <FieldLabel label="Select Vendor from Directory" />
                      <select
                        value={pvVendorId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setPvVendorId(id);
                          const v = companies.find((c) => c.id === id);
                          if (v) {
                            const vName = getCompanyName(v);
                            setPvPayeeName(vName);
                            const matchingBills = supplierBills.filter(
                              (b) =>
                                (b.vendor_company_id === id ||
                                  b.supplier_id === id ||
                                  (b as any).vendor_id === id ||
                                  b.vendor_name === vName ||
                                  b.supplier_name === vName) &&
                                b.balance_due > 0 &&
                                !b.is_on_hold
                            );
                            if (matchingBills.length > 0 && Object.keys(pvSelectedBills).length === 0) {
                              const first = matchingBills[0];
                              setPvSelectedBills({ [first.id]: first.balance_due });
                              setPvAmountPaid(first.balance_due);
                              setPvNarration(`Settlement of Supplier Invoice #${first.vendor_invoice_no} (${first.bill_number})`);
                            }
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- Select Registered Vendor (or type Payee name) --</option>
                        {vendors.map((v) => {
                          const vName = getCompanyName(v);
                          return (
                            <option key={v.id} value={v.id}>
                              {vName} {v.relationship_type ? `(${v.relationship_type})` : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Payee / Vendor Legal Name" required />
                      <input
                        type="text"
                        value={pvPayeeName}
                        onChange={(e) => setPvPayeeName(e.target.value)}
                        placeholder="e.g. Atlas Industrial Supply LLC"
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel
                        label="Link to Supplier PO"
                        hint="Optional — Link an issued Supplier PO when recording an advance payment or direct PO settlement."
                      />
                      <select
                        value={pvPoId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setPvPoId(id);
                          const po = supplierPOs.find((p) => p.id === id);
                          if (po) {
                            const sName = po.purchase_order_metadata?.supplier_name || po.client_snapshot?.entity_name || '';
                            if (sName && !pvPayeeName) setPvPayeeName(sName);
                            const poTotal = Number(po.financial_totals?.grand_total ?? po.grand_total ?? 0);
                            if (pvAmountPaid === 0 && poTotal > 0) setPvAmountPaid(poTotal);
                            if (!pvNarration) {
                              setPvNarration(`Advance / Payment against PO ${po.purchase_order_metadata?.po_ref || po.formatted_quote_ref}`);
                            }
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- Direct / Bill Settlement (No Specific PO) --</option>
                        {supplierPOs.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.purchase_order_metadata?.po_ref || po.formatted_quote_ref} — {po.purchase_order_metadata?.supplier_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2 items-end">
                      <div>
                        <FieldLabel label="Payment Mode" />
                        <select
                          value={pvPaymentMethod}
                          onChange={(e) => setPvPaymentMethod(e.target.value as any)}
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                        >
                          <option value="Bank Transfer / TT">Bank Transfer / TT</option>
                          <option value="Cheque">Cheque</option>
                          <option value="Cash">Cash</option>
                          <option value="Corporate Card">Corporate Card</option>
                          <option value="Letter of Credit (LC)">Letter of Credit (LC)</option>
                          <option value="Online">Online</option>
                        </select>
                      </div>
                      <div>
                        <FieldLabel label="UTR / Cheque #" />
                        <input
                          type="text"
                          value={pvReferenceNo}
                          onChange={(e) => setPvReferenceNo(e.target.value)}
                          placeholder="e.g. UTR-994120"
                          className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 font-mono bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chapter 2: Line Items & Bill Allocation */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Line Items &amp; Bill Allocation
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Select open supplier bills to automatically settle their balance due
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-xl">
                    {supplierBills
                      .filter((b) => {
                        if (b.balance_due <= 0) return false;
                        if (!pvPayeeName.trim() && !pvVendorId) return true;
                        const bName = (b.vendor_name || b.supplier_name || '').toLowerCase();
                        return (
                          (Boolean(pvPayeeName.trim()) &&
                            bName.includes(pvPayeeName.trim().toLowerCase())) ||
                          Boolean(
                            pvVendorId &&
                              (b.vendor_company_id === pvVendorId ||
                                b.supplier_id === pvVendorId ||
                                (b as any).vendor_id === pvVendorId)
                          )
                        );
                      })
                      .map((bill) => {
                        const allocAmount = pvSelectedBills[bill.id];
                        const isChecked = allocAmount !== undefined && allocAmount > 0;
                        return (
                          <div key={bill.id} className="px-3 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={bill.is_on_hold}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const next = {
                                      ...pvSelectedBills,
                                      [bill.id]: bill.balance_due
                                    };
                                    setPvSelectedBills(next);
                                    setPvAmountPaid(
                                      QuotationRepository.roundCurrency(
                                        (Object.values(next) as any[]).reduce((s: number, v: any) => s + Number(v || 0), 0)
                                      )
                                    );
                                    if (!pvPayeeName) setPvPayeeName(bill.vendor_name);
                                  } else {
                                    const next = { ...pvSelectedBills };
                                    delete next[bill.id];
                                    setPvSelectedBills(next);
                                    setPvAmountPaid(
                                      QuotationRepository.roundCurrency(
                                        (Object.values(next) as any[]).reduce((s: number, v: any) => s + Number(v || 0), 0)
                                      )
                                    );
                                  }
                                }}
                                className="rounded border-slate-300 text-amber-600"
                              />
                              <div>
                                <div className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {bill.bill_number} · Inv #{bill.vendor_invoice_no}{' '}
                                  <span className="font-sans font-semibold text-slate-600 dark:text-slate-400">({bill.vendor_name})</span>
                                </div>
                                <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                                  Total: {bill.currency} {bill.grand_total.toFixed(2)} · Balance Due: {bill.currency}{' '}
                                  {bill.balance_due.toFixed(2)}
                                </div>
                              </div>
                            </label>
                            {isChecked && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10.5px] text-slate-500 dark:text-slate-400">Allocate:</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={allocAmount}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    const next = {
                                      ...pvSelectedBills,
                                      [bill.id]: val
                                    };
                                    setPvSelectedBills(next);
                                    setPvAmountPaid(
                                      QuotationRepository.roundCurrency(
                                        (Object.values(next) as any[]).reduce((s: number, v: any) => s + Number(v || 0), 0)
                                      )
                                    );
                                  }}
                                  className="w-28 rounded-lg border border-amber-400 dark:border-amber-700 px-2 py-1 text-right font-mono font-bold bg-amber-50/40 dark:bg-amber-950/40 text-slate-900 dark:text-slate-100"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    {supplierBills.filter((b) => b.balance_due > 0).length === 0 && (
                      <div className="p-3 text-center text-slate-400 text-[11px]">
                        No open unpaid Supplier Bills found. You can still issue an Advance / Direct Payment Voucher below.
                      </div>
                    )}
                  </div>
                </div>

                {/* Chapter 3: Financial Summary & Narration */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Financial Summary &amp; Narration
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Confirm total disbursed amount and treasury payment narration
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 items-end">
                    <div>
                      <FieldLabel label={`Amount Paid (${defaultCurrency})`} required />
                      <input
                        type="number"
                        step="0.01"
                        value={pvAmountPaid === 0 ? '' : pvAmountPaid}
                        placeholder="0.00"
                        onChange={(e) => setPvAmountPaid(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
                        className="w-full h-9 rounded-xl border border-amber-400 dark:border-amber-700 px-3 py-1.5 font-mono font-bold bg-amber-50/30 dark:bg-amber-950/30 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <FieldLabel label="Payment Narration / Purpose" />
                      <input
                        type="text"
                        value={pvNarration}
                        onChange={(e) => setPvNarration(e.target.value)}
                        placeholder="e.g. Settlement of Supplier Invoice / Advance against PO"
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Executive Sticky Summary Footer Bar */}
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Bills Allocated: <strong className="text-slate-900 dark:text-slate-100">{allocatedBillsCount}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-amber-700 dark:text-amber-400 font-bold whitespace-nowrap">
                    Disbursed Total: {defaultCurrency} {Number(pvAmountPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowCreatePvModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingPv}
                    onClick={() => handleConfirmCreatePv(false)}
                    className="h-9 px-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 disabled:opacity-50 text-amber-900 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    {isCreatingPv ? 'Saving...' : 'Save PV'}
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingPv}
                    onClick={() => handleConfirmCreatePv(true)}
                    className="h-9 px-4 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    {isCreatingPv ? 'Saving...' : 'Save & Open in Studio'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 5: ISSUE MATERIAL RETURN NOTE (MRN) OR VENDOR DEBIT NOTE (DN) */}
      {showCreateReturnModal && (() => {
        const retNetSubtotal = QuotationRepository.roundCurrency(
          retLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0)
        );
        const retVat = retMode === 'debit_note' ? QuotationRepository.roundCurrency(retNetSubtotal * 0.05) : 0;
        const retGrandTotal = QuotationRepository.roundCurrency(retNetSubtotal + retVat);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {retMode === 'material_return_note'
                      ? 'Issue Material Return Note (MRN — Unpriced Gate-Pass)'
                      : 'Issue Vendor Debit Note (DN — Commercial Claim)'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Select Supplier, linked PO or Bill, return reason, and items to return
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateReturnModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-4 text-xs bg-slate-50/80 dark:bg-slate-950/70 flex-1">
                <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl w-fit">
                  <button
                    type="button"
                    onClick={() => setRetMode('material_return_note')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      retMode === 'material_return_note'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Material Return Note (MRN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRetMode('debit_note')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      retMode === 'debit_note'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Vendor Debit Note (DN)
                  </button>
                </div>

                {/* Chapter 1: Vendor & Return Metadata */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3.5">
                  <div className="flex items-center gap-2.5 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Vendor &amp; Document Metadata
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Link original Supplier PO or Bill and specify return reason and resolution
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                    <div>
                      <FieldLabel label="Select Vendor from Directory" />
                      <select
                        value={retVendorId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setRetVendorId(id);
                          const v = companies.find((c) => c.id === id);
                          if (v) setRetSupplierName(getCompanyName(v));
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- Select Registered Vendor --</option>
                        {vendors.map((v) => {
                          const vName = getCompanyName(v);
                          return (
                            <option key={v.id} value={v.id}>
                              {vName}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Supplier / Vendor Legal Name" required />
                      <input
                        type="text"
                        value={retSupplierName}
                        onChange={(e) => setRetSupplierName(e.target.value)}
                        placeholder="Supplier Name"
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      />
                    </div>
                    <div>
                      <FieldLabel
                        label="Link to Supplier PO"
                        hint="Optional — Select an issued Supplier PO to import its line items into this Material Return or Debit Note."
                      />
                      <select
                        value={retPoId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setRetPoId(id);
                          const po = supplierPOs.find((p) => p.id === id);
                          if (po) {
                            setRetSupplierName(
                              po.purchase_order_metadata?.supplier_name || po.client_snapshot?.entity_name || retSupplierName
                            );
                            if (po.line_items && po.line_items.length > 0) {
                              setRetLines(
                                po.line_items.map((li) => ({
                                  product_id: li.product_id || '',
                                  item_name: li.item_name || li.description || '',
                                  part_no: li.part_no || '',
                                  qty: Number(li.qty_ordered ?? li.quantity ?? li.qty) || 1,
                                  unit: li.unit || 'Nos',
                                  unit_cost: Number(li.unit_price ?? li.cost_price ?? 0) || 0
                                }))
                              );
                            }
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- No Linked PO --</option>
                        {supplierPOs.map((po) => (
                          <option key={po.id} value={po.id}>
                            {po.purchase_order_metadata?.po_ref || po.formatted_quote_ref} — {po.purchase_order_metadata?.supplier_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel
                        label="Link to Supplier Bill"
                        hint="Optional — When issuing a Vendor Debit Note (DN), linking a Supplier Bill automatically deducts the claim value from that bill's Balance Due."
                        hintAlign="right"
                      />
                      <select
                        value={retBillId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setRetBillId(id);
                          const bill = supplierBills.find((b) => b.id === id);
                          if (bill) {
                            setRetSupplierName(bill.vendor_name);
                            if (bill.line_items && bill.line_items.length > 0) {
                              setRetLines(
                                bill.line_items.map((li) => ({
                                  product_id: li.product_id || '',
                                  item_name: li.item_name || '',
                                  part_no: li.part_no || '',
                                  qty: Number(li.billed_qty) || 1,
                                  unit: li.unit || 'Nos',
                                  unit_cost: Number(li.billed_unit_cost) || 0
                                }))
                              );
                            }
                          }
                        }}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="">-- No Linked Supplier Bill --</option>
                        {supplierBills.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bill_number} (Inv #{b.vendor_invoice_no}) — {b.vendor_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Return / Claim Reason" />
                      <select
                        value={retReason}
                        onChange={(e) => setRetReason(e.target.value as any)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="Defective / Damaged">Defective / Damaged</option>
                        <option value="Wrong Item Supplied">Wrong Item Supplied</option>
                        <option value="Excess Quantity">Excess Quantity</option>
                        <option value="Quality Rejection">Quality Rejection</option>
                        <option value="Commercial Price Adjustment">Commercial Price Adjustment</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <FieldLabel label="Resolution Requested" />
                      <select
                        value={retResolution}
                        onChange={(e) => setRetResolution(e.target.value as any)}
                        className="w-full h-9 rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-1.5 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-xs leading-normal"
                      >
                        <option value="Credit / Bill Deduction">Credit / Bill Deduction</option>
                        <option value="Replacement Required">Replacement Required</option>
                        <option value="Refund Requested">Refund Requested</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Chapter 2: Line Items & Claim Allocation */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
                        2
                      </span>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          Line Items &amp; Claim Allocation
                        </h4>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Specify returned quantities and unit rates for claim calculation
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRetLines((prev) => [
                          ...prev,
                          { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
                        ])
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/80 dark:border-rose-800 font-bold text-[11px] cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Line</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <div className="col-span-4">Catalog / Item</div>
                    <div className="col-span-3">Description</div>
                    <div className="col-span-1 text-right">Qty</div>
                    <div className="col-span-2 text-right whitespace-nowrap">Unit Rate ({defaultCurrency})</div>
                    <div className="col-span-2 text-right">Line Total</div>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {retLines.map((line, idx) => {
                      const lineTotal = QuotationRepository.roundCurrency(
                        (Number(line.qty) || 0) * (Number(line.unit_cost) || 0)
                      );
                      return (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center py-2 px-1">
                          <div className="col-span-4">
                            <select
                              value={line.product_id || ''}
                              onChange={(e) => {
                                const pid = e.target.value;
                                const prod = products.find((p) => p.id === pid);
                                setRetLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? {
                                          ...l,
                                          product_id: pid,
                                          item_name: prod?.name || prod?.description || l.item_name,
                                          part_no: prod?.part_no || prod?.sku || l.part_no,
                                          unit: prod?.unit || l.unit || 'Nos',
                                          unit_cost: Number(
                                            prod?.cost_price ||
                                              prod?.last_landed_cost ||
                                              (prod as any)?.selling_price ||
                                              (prod as any)?.unit_price ||
                                              l.unit_cost ||
                                              0
                                          )
                                        }
                                      : l
                                  )
                                );
                              }}
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-[11px]"
                            >
                              <option value="">-- Pick Catalog Item or Type --</option>
                              {products.filter((p) => !p.is_deleted).map((p) => (
                                <option key={p.id} value={p.id}>
                                  {formatProductVariantSelectorLabel(p, products)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-3">
                            <input
                              type="text"
                              value={line.item_name}
                              onChange={(e) =>
                                setRetLines((prev) =>
                                  prev.map((l, i) => (i === idx ? { ...l, item_name: e.target.value } : l))
                                )
                              }
                              placeholder="Item Description"
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 text-[11px]"
                            />
                          </div>
                          <div className="col-span-1">
                            <input
                              type="number"
                              min="1"
                              value={line.qty === 0 ? '' : line.qty}
                              onChange={(e) =>
                                setRetLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, qty: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) } : l
                                  )
                                )
                              }
                              placeholder="1"
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 font-mono text-[11px] text-right"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              step="0.01"
                              value={line.unit_cost === 0 ? '' : line.unit_cost}
                              onChange={(e) =>
                                setRetLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx ? { ...l, unit_cost: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)) } : l
                                  )
                                )
                              }
                              placeholder="0.00"
                              className="w-full h-8 rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 bg-white dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 font-mono text-[11px] text-right"
                            />
                          </div>
                          <div className="col-span-2 flex items-center justify-end gap-1.5">
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-[11px] whitespace-nowrap">
                              {lineTotal.toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setRetLines((prev) => prev.filter((_, i) => i !== idx))}
                              className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Executive Sticky Summary Footer Bar */}
              <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Net: <strong className="text-slate-900 dark:text-slate-100">{defaultCurrency} {retNetSubtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  </span>
                  {retMode === 'debit_note' && (
                    <>
                      <span className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        VAT (5%): <strong className="text-slate-700 dark:text-slate-300">{defaultCurrency} {retVat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                      </span>
                    </>
                  )}
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="text-rose-700 dark:text-rose-400 font-bold whitespace-nowrap">
                    {retMode === 'material_return_note' ? 'Return Value' : 'Total Claim'}: {defaultCurrency} {retGrandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowCreateReturnModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingReturn}
                    onClick={() => handleConfirmCreateReturn(false)}
                    className="h-9 px-4 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 disabled:opacity-50 text-rose-900 dark:text-rose-300 text-xs font-semibold cursor-pointer"
                  >
                    {isCreatingReturn
                      ? 'Saving...'
                      : retMode === 'material_return_note'
                      ? 'Save MRN'
                      : 'Save Debit Note'}
                  </button>
                  <button
                    type="button"
                    disabled={isCreatingReturn}
                    onClick={() => handleConfirmCreateReturn(true)}
                    className="h-9 px-4 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer shadow-xs"
                  >
                    {isCreatingReturn
                      ? 'Saving...'
                      : retMode === 'material_return_note'
                      ? 'Save & Open MRN in Studio'
                      : 'Save & Open DN in Studio'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 6: PRINTABLE 3-WAY MATCH BILL SUMMARY & VOUCHER SHEET */}
      {viewingBillSummary && (
        <div className="printable-modal-root fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:static print:p-0 print:bg-white">
          <div className="printable-modal-sheet bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:max-w-none print:shadow-none print:border-0 print:rounded-none">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white print:bg-white print:text-slate-900 print:px-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 print:bg-emerald-50 print:text-emerald-800 print:border print:border-emerald-200 text-[10px] font-black uppercase tracking-wider">
                    3-Way Match Voucher Sheet
                  </span>
                  <span className="font-mono text-xs text-slate-300 print:text-slate-700 font-bold">
                    {viewingBillSummary.bill_number}
                  </span>
                  <span className="hidden print:inline text-[11px] text-slate-500 font-medium">
                    • {activeWorkspace.name}
                  </span>
                </div>
                <h3 className="text-base font-black mt-0.5">
                  Supplier Bill Summary — {viewingBillSummary.vendor_name}
                </h3>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                {viewingBillSummary.balance_due > 0 && !viewingBillSummary.is_on_hold && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingBillSummary;
                      setViewingBillSummary(null);
                      openCreatePvModal({ bill: target });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold cursor-pointer"
                  >
                    + Pay Bill (PV)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
                >
                  Print Summary
                </button>
                <button
                  type="button"
                  onClick={() => setViewingBillSummary(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto print:overflow-visible print:px-0 space-y-5 text-xs">
              {/* 3-Way Match Verification Banner */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between break-inside-avoid ${
                  viewingBillSummary.three_way_match_status === 'matched' || viewingBillSummary.match_status === 'matched'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : viewingBillSummary.match_status === 'discrepancy'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {viewingBillSummary.three_way_match_status === 'matched' || viewingBillSummary.match_status === 'matched' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-black text-xs uppercase tracking-wider">
                      3-Way Match Status:{' '}
                      {(
                        viewingBillSummary.three_way_match_status ||
                        viewingBillSummary.match_status ||
                        'pending'
                      )
                        .replace(/_/g, ' ')
                        .toUpperCase()}
                    </div>
                    <div className="text-[11px] opacity-85">
                      {formatBillVarianceSummary(viewingBillSummary) ||
                        'All billed quantities and unit rates verified against Purchase Order and Warehouse GRN records.'}
                    </div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase bg-white/80 border border-current/20">
                  Status:{' '}
                  {viewingBillSummary.is_on_hold
                    ? 'ON HOLD'
                    : viewingBillSummary.approval_status === 'approved'
                    ? 'APPROVED'
                    : 'UNDER REVIEW'}
                </span>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 break-inside-avoid">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Vendor / Supplier</div>
                  <div className="font-bold text-slate-900 mt-0.5">{viewingBillSummary.vendor_name}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Vendor Invoice #</div>
                  <div className="font-mono font-bold text-slate-900 mt-0.5">
                    {viewingBillSummary.vendor_invoice_no}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Linked PO Ref</div>
                  <div className="font-mono font-bold text-indigo-700 mt-0.5">
                    {viewingBillSummary.po_ref || 'Direct / Standalone Bill'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Invoice / Due Date</div>
                  <div className="font-semibold text-slate-800 mt-0.5">
                    {viewingBillSummary.invoice_date} {viewingBillSummary.due_date ? `→ ${viewingBillSummary.due_date}` : ''}
                  </div>
                </div>
              </div>

              {/* Line-by-Line 3-Way Match Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-black uppercase text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3 text-right">PO Qty</th>
                      <th className="py-2.5 px-3 text-right">GRN Qty</th>
                      <th className="py-2.5 px-3 text-right">Billed Qty</th>
                      <th className="py-2.5 px-3 text-right">PO Rate</th>
                      <th className="py-2.5 px-3 text-right">Billed Rate</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {(viewingBillSummary.line_items || []).map((li, idx) => {
                      const qtyDiff = li.po_qty > 0 && li.billed_qty > (li.grn_qty || li.po_qty);
                      const rateDiff = li.po_unit_cost > 0 && Math.abs(li.billed_unit_cost - li.po_unit_cost) > 0.01;
                      const displayDesc =
                        (li.item_name && li.item_name.trim()) ||
                        'General Bill / Freight & Tax Settlement';
                      return (
                        <tr key={idx} className="hover:bg-slate-50 break-inside-avoid">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {displayDesc}
                            {li.part_no && (
                              <span className="ml-1.5 font-mono text-[10.5px] text-slate-500">
                                ({li.part_no})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">{li.po_qty}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">{li.grn_qty}</td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              qtyDiff ? 'text-rose-600' : 'text-slate-900'
                            }`}
                          >
                            {li.billed_qty}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                            {Number(li.po_unit_cost || 0).toFixed(2)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold ${
                              rateDiff ? 'text-rose-600' : 'text-slate-900'
                            }`}
                          >
                            {Number(li.billed_unit_cost || 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {Number(li.line_total || 0).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Financial Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start break-inside-avoid">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5">
                  <div className="text-[10px] font-black uppercase text-slate-400">
                    Audit &amp; Verification Notes
                  </div>
                  <div className="text-xs text-slate-700">
                    {viewingBillSummary.notes || 'Recorded in Workspace Payables Ledger.'}
                  </div>
                  {viewingBillSummary.approved_by_name && (
                    <div className="text-[11px] text-emerald-700 font-semibold pt-1">
                      Approved by {viewingBillSummary.approved_by_name}
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Items Subtotal:</span>
                    <span className="font-bold">
                      {viewingBillSummary.currency} {Number(viewingBillSummary.subtotal || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Freight / Customs:</span>
                    <span>
                      {viewingBillSummary.currency}{' '}
                      {Number(viewingBillSummary.freight_customs_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-sans text-slate-600">Tax / VAT:</span>
                    <span>
                      {viewingBillSummary.currency} {Number(viewingBillSummary.tax_amount || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-1.5 text-slate-900 font-black">
                    <span className="font-sans">Grand Total:</span>
                    <span>
                      {viewingBillSummary.currency} {Number(viewingBillSummary.grand_total || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span className="font-sans">Amount Paid (PVs) + Debit Notes:</span>
                    <span>
                      - {viewingBillSummary.currency}{' '}
                      {(
                        Number(viewingBillSummary.amount_paid || 0) +
                        Number(
                          viewingBillSummary.credit_applied_amount ??
                            (viewingBillSummary as any).credit_applied ??
                            0
                        )
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-black text-rose-700">
                    <span className="font-sans">Balance Due:</span>
                    <span>
                      {viewingBillSummary.currency} {Number(viewingBillSummary.balance_due || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Formal Print Signatory Block (visible on A4 print) */}
              <div className="hidden print:grid grid-cols-3 gap-6 pt-8 mt-6 border-t border-slate-300 text-xs break-inside-avoid">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Prepared &amp; Verified By</div>
                  <div className="font-bold text-slate-900 mt-6 pt-2 border-t border-slate-300">
                    {viewingBillSummary.created_by || user.full_name || 'Procurement Officer'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">3-Way Match Audit</div>
                  <div className="font-bold text-slate-900 mt-6 pt-2 border-t border-slate-300">
                    {viewingBillSummary.variance_approved_by || viewingBillSummary.approved_by_name || 'Storekeeper / Finance'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-500">Authorized Signatory</div>
                  <div className="font-bold text-slate-900 mt-6 pt-2 border-t border-slate-300">
                    Finance &amp; Payables Approval
                  </div>
                </div>
              </div>

              {/* Embedded Vendor Invoice Scan / PDF Preview */}
              {viewingBillSummary.attachment?.url && (
                <div className="space-y-2 print:hidden">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Attached Vendor Invoice Scan ({viewingBillSummary.attachment.name})
                    </span>
                    <a
                      href={viewingBillSummary.attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      Open Full Attachment ↗
                    </a>
                  </div>
                  {viewingBillSummary.attachment.mimeType?.includes('pdf') ? (
                    <iframe
                      src={viewingBillSummary.attachment.url}
                      title="Vendor Invoice PDF"
                      className="w-full h-80 rounded-xl border border-slate-200 bg-slate-100"
                    />
                  ) : (
                    <img
                      src={viewingBillSummary.attachment.url}
                      alt={viewingBillSummary.attachment.name}
                      className="max-h-96 rounded-xl border border-slate-200 object-contain mx-auto"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: SUPPLIER PO SUMMARY & GRN STATUS MODAL */}
      {viewingPoSummary && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider">
                    Outbound Supplier Purchase Order
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    {viewingPoSummary.purchase_order_metadata?.po_ref || viewingPoSummary.formatted_quote_ref}
                  </span>
                </div>
                <h3 className="text-base font-black mt-0.5">
                  {viewingPoSummary.purchase_order_metadata?.supplier_name ||
                    viewingPoSummary.client_snapshot?.entity_name ||
                    'Supplier PO Summary'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingPoSummary(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">PO Reference #</div>
                  <div className="font-mono font-bold text-indigo-700 mt-0.5">
                    {viewingPoSummary.purchase_order_metadata?.po_ref || viewingPoSummary.formatted_quote_ref}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">PO Date</div>
                  <div className="font-mono font-semibold text-slate-800 mt-0.5">
                    {(viewingPoSummary.purchase_order_metadata?.po_date || viewingPoSummary.quotation_date || '').slice(0, 10)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Receiving Status</div>
                  <div className="font-bold text-slate-900 mt-0.5">
                    {viewingPoSummary.purchase_order_metadata?.receiving_status || 'Pending Receipt'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">PO Grand Total</div>
                  <div className="font-mono font-black text-slate-900 mt-0.5">
                    {viewingPoSummary.currency}{' '}
                    {Number(
                      viewingPoSummary.financial_totals?.grand_total ?? viewingPoSummary.grand_total ?? 0
                    ).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto scrollbar-thin">
                <table className="w-full min-w-[680px] text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-[10px] font-black uppercase text-slate-600 border-b border-slate-200">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Item Description</th>
                      <th className="py-2.5 px-3 text-right">Ordered</th>
                      <th className="py-2.5 px-3 text-right">Received</th>
                      <th className="py-2.5 px-3 text-right">Pending</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-xs">
                    {(viewingPoSummary.line_items || []).map((li: any, idx: number) => {
                      const ordered = Number(li.qty_ordered ?? li.quantity ?? li.qty) || 0;
                      const received = Number(li.qty_received) || 0;
                      const pending = Math.max(0, ordered - received);
                      const rate = Number(li.unit_price ?? li.cost_price ?? 0);
                      const total = Number(li.total_price ?? li.line_total ?? ordered * rate);
                      return (
                        <tr key={li.id || idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            {li.item_name || li.description || 'Standard Line Item'}
                            {li.part_no && (
                              <span className="ml-1.5 font-mono text-[10.5px] text-slate-500">
                                ({li.part_no})
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{ordered} {li.unit || 'Nos'}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{received}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">{pending}</td>
                          <td className="py-2.5 px-3 text-right font-mono">{rate.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">{total.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                    {(viewingPoSummary.line_items || []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                          No line items recorded on this Purchase Order yet. Open in A4 Studio to add items.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {(viewingPoSummary.purchase_order_metadata?.receiving_status || 'Pending Receipt') !==
                  'Fully Received' && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = viewingPoSummary;
                      setViewingPoSummary(null);
                      handleOpenGrnModal(target);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Receive Stock (GRN)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingPoSummary;
                    setViewingPoSummary(null);
                    handleOpenBillModal(target);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-bold cursor-pointer"
                >
                  Record Supplier Bill
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingPoSummary;
                    setViewingPoSummary(null);
                    openCreatePvModal(undefined, target);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  + Issue PV
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingPoSummary;
                    setViewingPoSummary(null);
                    handleIssueVendorReturn('material_return_note', target);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold cursor-pointer"
                >
                  Return / Debit Note
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = viewingPoSummary;
                    setViewingPoSummary(null);
                    handleOpenInStudio(target);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
                >
                  Open in A4 Studio
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* A4 QUOTATION / COMMERCIAL DOCUMENT STUDIO MODAL */}
      {studioOpen && studioEnquiry && (
        <QuotationStudioModal
          isOpen={studioOpen}
          onClose={() => {
            setStudioOpen(false);
            setStudioQuotation(null);
          }}
          enquiry={studioEnquiry}
          activeWorkspace={activeWorkspace}
          activeWorkspaceId={activeWorkspace.id}
          salespersonName={user.full_name || user.username || user.email || 'Procurement'}
          user={user}
          editingQuotation={studioQuotation as any}
          existingQuotation={studioQuotation as any}
          products={products}
          setProducts={setProducts}
          companies={companies}
          supplierBills={supplierBills}
          triggerToast={triggerToast}
          onQuotationCreated={(savedDoc) => {
            setStudioQuotation(savedDoc as any);
            triggerToast?.(`${savedDoc.formatted_quote_ref} saved.`, 'success');
          }}
          onSaved={(savedDoc) => {
            setStudioQuotation(savedDoc as any);
            triggerToast?.(`${savedDoc.formatted_quote_ref} saved.`, 'success');
          }}
          onStockUpdated={async () => {}}
        />
      )}
      {/* UX-H5: Custom Delete Confirmation Modal for Supplier POs, Bills, and Vouchers */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Move {deleteConfirmTarget.type === 'po' ? 'Supplier PO' : deleteConfirmTarget.type === 'bill' ? 'Supplier Bill' : 'Voucher / Return'} to Recycle Bin?
                  </h3>
                  <p className="text-xs text-slate-500">
                    This record can be restored from the Recycle Bin if needed.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Reference:</span>
                <span className="font-mono font-bold text-slate-900">{deleteConfirmTarget.refLabel}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Vendor / Payee:</span>
                <span className="font-semibold text-slate-800">{deleteConfirmTarget.vendorName}</span>
              </div>
              {deleteConfirmTarget.amountLabel && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Total Amount:</span>
                  <span className="font-mono font-bold text-rose-700">{deleteConfirmTarget.amountLabel}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingRecord}
                onClick={async () => {
                  setIsDeletingRecord(true);
                  try {
                    if (deleteConfirmTarget.type === 'po') {
                      await QuotationRepository.softDeleteQuotation(deleteConfirmTarget.id, {
                        id: user.uid || user.id || 'user',
                        name: user.full_name || user.email || 'User'
                      });
                      triggerToast?.(`${deleteConfirmTarget.refLabel} moved to Recycle Bin.`, 'info');
                    } else if (deleteConfirmTarget.type === 'bill') {
                      await ProcurementRepository.delete(deleteConfirmTarget.id, activeWorkspace.id);
                      triggerToast?.(`${deleteConfirmTarget.refLabel} moved to Recycle Bin.`, 'info');
                    } else {
                      await QuotationRepository.softDeleteQuotation(deleteConfirmTarget.id, {
                        id: user.uid || user.id || 'user',
                        name: user.full_name || user.email || 'User'
                      });
                      await ProcurementRepository.recalculateWorkspaceSupplierBillBalances(activeWorkspace.id);
                      triggerToast?.(
                        `${deleteConfirmTarget.refLabel} moved to Recycle Bin and Bill balances updated.`,
                        'info'
                      );
                    }
                    setDeleteConfirmTarget(null);
                  } finally {
                    setIsDeletingRecord(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingRecord ? 'Moving...' : 'Move to Recycle Bin'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </PageBody>
    </div>
  );
}
