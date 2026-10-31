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
import { isAdmin, isSuperAdmin } from '../utils/permissions';
import { PageHeader, KpiStatCard } from './layout/UiContainer';
import HoverScrollText from './common/HoverScrollText';
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
  Eye,
  RotateCcw,
  Calculator,
  X
} from 'lucide-react';

interface ProcurementPayablesHubProps {
  activeWorkspace: Workspace;
  user: UserProfile;
  companies: Company[];
  products: Product[];
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  enquiries: Enquiry[];
  projects?: Project[];
  onOpenMobileMenu?: () => void;
  onSelectEnquiry?: (enquiryId: string) => void;
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
  triggerToast
}: ProcurementPayablesHubProps) {
  const [activeTab, setActiveTab] = useState<'pos' | 'grn' | 'bills' | 'vouchers'>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');

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

  const userIsAdmin = useMemo(
    () => isAdmin(user, activeWorkspace.id) || isSuperAdmin(user),
    [user, activeWorkspace.id]
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
      quotations.filter(
        (q) =>
          q.document_type === 'payment_voucher' ||
          q.document_type === 'material_return_note' ||
          q.document_type === 'debit_note'
      ),
    [quotations]
  );

  const vendors = useMemo(
    () =>
      companies
        .filter((c) => !c.is_deleted)
        .sort((a, b) => {
          const aV = a.relationship_type === 'Vendor / Supplier' ? 0 : 1;
          const bV = b.relationship_type === 'Vendor / Supplier' ? 0 : 1;
          return aV - bV || (a.name || '').localeCompare(b.name || '');
        }),
    [companies]
  );

  // KPI Metrics
  const kpiStats = useMemo(() => {
    const openPos = supplierPOs.filter(
      (po) => (po.purchase_order_metadata?.receiving_status || 'Pending Receipt') !== 'Fully Received'
    );
    const pendingGrnCount = openPos.reduce((acc, po) => {
      const pendingLines = (po.line_items || []).filter((li) => {
        const ordered = Number(li.qty_ordered ?? li.qty) || 0;
        const received = Number(li.qty_received) || 0;
        return ordered > received;
      });
      return acc + pendingLines.length;
    }, 0);
    const unpaidBills = supplierBills.filter(
      (b) => b.payment_status !== 'paid' && b.approval_status !== 'cancelled'
    );
    const totalPayables = unpaidBills.reduce((sum, b) => sum + (Number(b.balance_due) || 0), 0);
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
      line_items: (docRecord.line_items || []).map((li) => ({
        id: li.id,
        product_id: li.product_id,
        product_type: 'Standard',
        item_name: li.item_name || li.description,
        part_no: li.part_no || '',
        brand_make: li.brand || li.brand_make || '',
        description: li.description,
        quantity: Number(li.quantity ?? li.qty) || 1,
        qty: Number(li.quantity ?? li.qty) || 1,
        unit: li.unit || 'pcs',
        unit_price: Number(li.unit_price) || 0,
        cost_price: li.cost_price ?? li.unit_price,
        total_price: Number(li.total_price ?? li.line_total) || 0
      }))
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
    const existingGrns = po.purchase_order_metadata?.linked_grn_numbers || [];
    const nextGrnSeq = String(existingGrns.length + 1).padStart(2, '0');
    setGrnTargetPo(po);
    setGrnNumber(`GRN-${baseRef.replace(/^PO-/i, '')}-${nextGrnSeq}`);
    setGrnReceivedDate(new Date().toISOString().slice(0, 10));
    setGrnFreightCustoms(0);
    setGrnAllocationMode('proportional_value');
    setGrnUpdateCatalogCost(false);
    setGrnNotes('');
    setGrnLines(
      (po.line_items || []).map((li) => {
        const ordered = Math.max(0, Number(li.qty_ordered ?? li.qty) || 0);
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
      if (qtyNow > 0 && grnFreightCustoms > 0) {
        if (grnAllocationMode === 'manual') {
          allocatedFreight = Math.max(0, l.manual_landed_cost_addition || 0);
        } else if (totalBatchValue > 0) {
          allocatedFreight = grnFreightCustoms * (lineVal / totalBatchValue);
        } else if (totalBatchQty > 0) {
          allocatedFreight = grnFreightCustoms * (qtyNow / totalBatchQty);
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
        grnTargetPo,
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
  const handleCreateSupplierPo = async () => {
    const selectedVendor = companies.find((c) => c.id === newPoVendorId);
    const supplierName = (selectedVendor?.name || newPoSupplierName || '').trim();
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
        return {
          id: `poli_${Date.now()}_${idx}`,
          sr_no: idx + 1,
          product_id: l.product_id || undefined,
          part_no: l.part_no || prod?.part_no || '',
          item_name: l.item_name || prod?.name || 'Item',
          brand: prod?.brand || '',
          description: prod?.description || l.item_name,
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
          line_subtotal: QuotationRepository.roundCurrency(qty * rate),
          line_total: QuotationRepository.roundCurrency(qty * rate)
        };
      });

    const totals = QuotationRepository.calculateFinancialTotals(lineItems, 'taxes_extra', 0);
    const nowIso = new Date().toISOString();
    const recordId = `qdoc_po_${Date.now()}`;

    const newPoRecord: QuotationDocumentRecord = {
      id: recordId,
      workspace_id: activeWorkspace.id,
      enquiry_id: linkedEnq?.id || `standalone_${recordId}`,
      enquiry_sn: linkedEnq?.sn || 0,
      document_type: 'purchase_order',
      formatted_quote_ref: poRef,
      revision_no: 0,
      status: 'draft',
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

    await QuotationRepository.save(newPoRecord);
    setShowCreatePoModal(false);
    handleOpenInStudio(newPoRecord);
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

    const mappedLines: SupplierBillLineItem[] = (po?.line_items || []).map((li) => {
      const poQty = Number(li.qty_ordered ?? li.qty) || 0;
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

    const mappedLines: SupplierBillLineItem[] = (po.line_items || []).map((li) => {
      const poQty = Number(li.qty_ordered ?? li.qty) || 0;
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
    return ProcurementRepository.evaluateThreeWayMatch(billLines, linkedPo);
  }, [billLines, billPoId, supplierPOs]);

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
        grn_refs: linkedPo?.purchase_order_metadata?.linked_grn_numbers || [],
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

  // Issue Outbound Payment Voucher (PV) from a Bill or PO
  const handleIssuePaymentVoucher = async (bill?: SupplierBill, po?: QuotationDocumentRecord) => {
    const nowIso = new Date().toISOString();
    const pvSeq = String(
      quotations.filter((q) => q.document_type === 'payment_voucher').length + 1
    ).padStart(4, '0');
    const pvRef = `PV-${pvSeq}`;

    const vendorId = bill?.vendor_company_id || po?.purchase_order_metadata?.vendor_company_id;
    const vendor = companies.find((c) => c.id === vendorId);
    const payeeName =
      bill?.vendor_name ||
      po?.purchase_order_metadata?.supplier_name ||
      vendor?.name ||
      'Vendor / Supplier';

    const payableTotal = bill
      ? Number(bill.grand_total) || 0
      : Number(po?.financial_totals?.grand_total) || 0;
    const creditsApplied = bill ? Number(bill.credit_applied_amount) || 0 : 0;
    const prevPaid = bill ? Number(bill.amount_paid) || 0 : 0;
    const amountNow = bill ? Number(bill.balance_due) || 0 : payableTotal;

    const recordId = `qdoc_pv_${Date.now()}`;
    const pvRecord: QuotationDocumentRecord = {
      id: recordId,
      workspace_id: activeWorkspace.id,
      enquiry_id: bill?.enquiry_id || po?.enquiry_id || `standalone_${recordId}`,
      enquiry_sn: po?.enquiry_sn || 0,
      document_type: 'payment_voucher',
      formatted_quote_ref: pvRef,
      revision_no: 0,
      status: 'issued',
      quotation_date: nowIso.slice(0, 10),
      valid_until_date: nowIso.slice(0, 10),
      client_reference: bill?.vendor_invoice_no || po?.formatted_quote_ref || '',
      quotation_subject: bill
        ? `Settlement of Supplier Bill ${bill.bill_number} (Inv # ${bill.vendor_invoice_no})`
        : po
        ? `Supplier Advance / Settlement against ${po.formatted_quote_ref}`
        : `Outbound Vendor Payment Voucher`,
      currency: bill?.currency || po?.currency || vendor?.default_currency || defaultCurrency,
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
        attention_to: po?.purchase_order_metadata?.supplier_contact || '',
        designation: '',
        address: po?.purchase_order_metadata?.supplier_address || vendor?.address || '',
        phone: po?.purchase_order_metadata?.supplier_phone || vendor?.phone || '',
        email: po?.purchase_order_metadata?.supplier_email || vendor?.email || '',
        tax_registration_no: bill?.vendor_trn || po?.purchase_order_metadata?.supplier_trn || vendor?.tax_registration_no || ''
      },
      payment_voucher_metadata: {
        voucher_ref: pvRef,
        payment_date: nowIso.slice(0, 10),
        settlement_type: bill ? 'single_bill' : 'vendor_advance',
        vendor_company_id: vendorId,
        payee_name: payeeName,
        payee_trn: bill?.vendor_trn || po?.purchase_order_metadata?.supplier_trn || vendor?.tax_registration_no || '',
        payment_method: 'Bank Transfer / TT',
        disbursing_bank_name: activeWorkspace.document_profile?.bank_details?.bank_name || '',
        disbursing_account_no: activeWorkspace.document_profile?.bank_details?.iban || '',
        beneficiary_bank_details:
          po?.purchase_order_metadata?.beneficiary_bank_details || vendor?.vendor_bank_details,
        linked_po_id: po?.id || bill?.po_id,
        linked_po_ref: po?.formatted_quote_ref || bill?.po_ref,
        vendor_invoice_no: bill?.vendor_invoice_no || '',
        allocated_bills: bill
          ? [
              {
                bill_id: bill.id,
                bill_ref: bill.bill_number,
                vendor_invoice_no: bill.vendor_invoice_no,
                po_ref: bill.po_ref,
                bill_total: payableTotal,
                credit_applied: creditsApplied,
                previously_paid: prevPaid,
                paid_this_voucher: amountNow,
                remaining_balance: 0
              }
            ]
          : [],
        total_payable_amount: payableTotal,
        credits_applied_amount: creditsApplied,
        previously_paid_amount: prevPaid,
        amount_paid: amountNow,
        balance_remaining: 0,
        narration: bill
          ? `Payment against Vendor Invoice ${bill.vendor_invoice_no}`
          : po
          ? `Payment against Purchase Order ${po.formatted_quote_ref}`
          : 'Vendor Settlement',
        prepared_by_name: user.full_name || user.username || 'Accounts'
      },
      line_items: po?.line_items || [],
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

    await QuotationRepository.save(pvRecord);
    handleOpenInStudio(pvRecord);
  };

  // Issue Material Return Note (MRN) or Vendor Debit Note (DN)
  const handleIssueVendorReturn = async (
    mode: 'material_return_note' | 'debit_note',
    po?: QuotationDocumentRecord,
    bill?: SupplierBill
  ) => {
    const nowIso = new Date().toISOString();
    const prefix = mode === 'material_return_note' ? 'MRN' : 'DN';
    const seq = String(
      quotations.filter(
        (q) => q.document_type === 'material_return_note' || q.document_type === 'debit_note'
      ).length + 1
    ).padStart(4, '0');
    const refNo = `${prefix}-${seq}`;

    const supplierName =
      po?.purchase_order_metadata?.supplier_name || bill?.vendor_name || 'Vendor / Supplier';
    const recordId = `qdoc_${prefix.toLowerCase()}_${Date.now()}`;

    const sourceLines: QuotationLineItem[] = (po?.line_items || []).map((li, idx) => ({
      ...li,
      id: `retli_${Date.now()}_${idx}`,
      return_qty: li.qty,
      return_reason: 'Defective / Damaged'
    }));

    const totals = QuotationRepository.calculateFinancialTotals(sourceLines, 'taxes_extra', 0);

    const returnDoc: QuotationDocumentRecord = {
      id: recordId,
      workspace_id: activeWorkspace.id,
      enquiry_id: po?.enquiry_id || bill?.enquiry_id || `standalone_${recordId}`,
      enquiry_sn: po?.enquiry_sn || 0,
      document_type: mode,
      formatted_quote_ref: refNo,
      revision_no: 0,
      status: 'draft',
      quotation_date: nowIso.slice(0, 10),
      valid_until_date: nowIso.slice(0, 10),
      client_reference: po?.formatted_quote_ref || bill?.vendor_invoice_no || '',
      quotation_subject:
        mode === 'material_return_note'
          ? `Material Return Dispatch Note — ${supplierName}`
          : `Vendor Debit Note / Credit Claim — ${supplierName}`,
      currency: po?.currency || bill?.currency || defaultCurrency,
      tax_mode: 'taxes_extra',
      show_brand_column: true,
      show_part_no_column: true,
      show_discount_column: false,
      show_tax_column: mode === 'debit_note',
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
        attention_to: po?.purchase_order_metadata?.supplier_contact || '',
        designation: '',
        address: po?.purchase_order_metadata?.supplier_address || '',
        phone: po?.purchase_order_metadata?.supplier_phone || '',
        email: po?.purchase_order_metadata?.supplier_email || '',
        tax_registration_no: po?.purchase_order_metadata?.supplier_trn || bill?.vendor_trn || ''
      },
      vendor_return_metadata: {
        return_mode: mode,
        return_ref: refNo,
        return_date: nowIso.slice(0, 10),
        vendor_company_id: po?.purchase_order_metadata?.vendor_company_id || bill?.vendor_company_id,
        supplier_name: supplierName,
        supplier_contact: po?.purchase_order_metadata?.supplier_contact || '',
        supplier_address: po?.purchase_order_metadata?.supplier_address || '',
        supplier_trn: po?.purchase_order_metadata?.supplier_trn || bill?.vendor_trn || '',
        original_po_id: po?.id || bill?.po_id,
        original_po_ref: po?.formatted_quote_ref || bill?.po_ref,
        linked_bill_id: bill?.id,
        vendor_invoice_no: bill?.vendor_invoice_no,
        return_reason: 'Defective / Damaged',
        resolution_type: 'Credit / Bill Deduction',
        dispatched_by_name: user.full_name || user.username || 'Storekeeper'
      },
      line_items: sourceLines,
      financial_totals: totals,
      terms_blocks: {
        price_basis: '',
        delivery_schedule: '',
        payment_terms: 'Credit / Bill Deduction',
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

    await QuotationRepository.save(returnDoc);
    handleOpenInStudio(returnDoc);
  };

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5 space-y-5">
      <PageHeader
        title="Procurement, Stock Receiving (GRN) & Vendor Payables"
        subtitle="Manage Outbound Supplier POs, Warehouse GRN Landed Cost Allocation, 3-Way Bill Matching, and Outbound Payment Vouchers"
        icon={ShoppingBag}
        currentUser={user}
        onOpenSidebar={onOpenMobileMenu}
      >
        <div className="flex flex-wrap items-center gap-2">
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Supplier PO</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenBillModal()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-amber-600" />
            <span>Record Supplier Bill</span>
          </button>
          <button
            type="button"
            onClick={() => handleIssuePaymentVoucher()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>Issue Payment Voucher</span>
          </button>
        </div>
      </PageHeader>

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
          value={`${defaultCurrency} ${kpiStats.totalPayables.toLocaleString('en-US', {
            minimumFractionDigits: 2
          })}`}
          subtext="Net of Debit Notes & PVs"
          icon={<DollarSign className="w-5 h-5" />}
          tone="rose"
        />
      </div>

      {/* Navigation Tabs + Filters */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3">
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
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-slate-50 text-slate-800"
          >
            <option value="ALL">All Vendors / Suppliers</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search PO, Bill, Inv #, Vendor..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {/* TAB 1: SUPPLIER PURCHASE ORDERS */}
      {activeTab === 'pos' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">PO Ref #</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Vendor / Supplier</th>
                  <th className="py-3 px-3">Linked Enquiry / Scope</th>
                  <th className="py-3 px-3 text-right">PO Total</th>
                  <th className="py-3 px-3 text-center">GRN Status</th>
                  <th className="py-3 px-4 text-right">Procurement Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierPOs
                  .filter((po) => {
                    const vName =
                      po.purchase_order_metadata?.supplier_name || po.client_snapshot?.entity_name || '';
                    if (vendorFilter !== 'ALL' && vName !== vendorFilter) return false;
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      (po.formatted_quote_ref || '').toLowerCase().includes(q) ||
                      vName.toLowerCase().includes(q) ||
                      (po.quotation_subject || '').toLowerCase().includes(q)
                    );
                  })
                  .map((po) => {
                    const meta = po.purchase_order_metadata;
                    const recStatus = meta?.receiving_status || 'Pending Receipt';
                    const linkedEnq = enquiries.find((e) => e.id === po.enquiry_id);
                    return (
                      <tr key={po.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono font-bold text-indigo-700 whitespace-nowrap">
                          {meta?.po_ref || po.formatted_quote_ref}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                          {(meta?.po_date || po.quotation_date || '').slice(0, 10)}
                        </td>
                        <td className="py-3 px-3 max-w-[220px]">
                          <div className="font-bold text-slate-900 truncate">
                            {meta?.supplier_name || po.client_snapshot?.entity_name || 'Vendor'}
                          </div>
                          {meta?.supplier_trn && (
                            <div className="text-[10px] font-mono text-slate-400">
                              TRN: {meta.supplier_trn}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-[240px]">
                          {linkedEnq ? (
                            <button
                              type="button"
                              onClick={() => onSelectEnquiry?.(linkedEnq.id)}
                              className="text-left text-blue-600 hover:underline font-semibold flex items-center gap-1 truncate cursor-pointer"
                            >
                              <span>ENQ #{linkedEnq.sn} — {linkedEnq.company_name}</span>
                              <ArrowUpRight className="w-3 h-3 shrink-0" />
                            </button>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              Stock Replenishment
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {po.currency}{' '}
                          {Number(po.financial_totals?.grand_total || 0).toLocaleString('en-US', {
                            minimumFractionDigits: 2
                          })}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              recStatus === 'Fully Received'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : recStatus === 'Partially Received'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {recStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {recStatus !== 'Fully Received' && (
                              <button
                                type="button"
                                onClick={() => handleOpenGrnModal(po)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold transition cursor-pointer"
                              >
                                Receive Stock (GRN)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenBillModal(po)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[10.5px] font-bold transition cursor-pointer"
                            >
                              + Bill
                            </button>
                            <button
                              type="button"
                              onClick={() => handleIssuePaymentVoucher(undefined, po)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-semibold transition cursor-pointer"
                              title="Issue Outbound Payment Voucher"
                            >
                              + PV
                            </button>
                            <button
                              type="button"
                              onClick={() => handleIssueVendorReturn('material_return_note', po)}
                              className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10.5px] font-semibold transition cursor-pointer"
                              title="Issue Material Return Note / Debit Note"
                            >
                              Return / DN
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenInStudio(po)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10.5px] font-bold transition cursor-pointer"
                            >
                              Studio
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {supplierPOs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                      No Outbound Supplier Purchase Orders found. Click &ldquo;New Supplier PO&rdquo; above or create one inside an Enquiry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PENDING STOCK RECEIPTS (GRN) */}
      {activeTab === 'grn' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">PO Ref #</th>
                  <th className="py-3 px-3">Vendor</th>
                  <th className="py-3 px-3">Item / Part No</th>
                  <th className="py-3 px-3 text-right">Ordered</th>
                  <th className="py-3 px-3 text-right">Received</th>
                  <th className="py-3 px-3 text-right">Pending</th>
                  <th className="py-3 px-3 text-right">Last Landed Cost</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierPOs.flatMap((po) =>
                  (po.line_items || [])
                    .filter((li) => {
                      const ordered = Number(li.qty_ordered ?? li.qty) || 0;
                      const received = Number(li.qty_received) || 0;
                      return ordered > received;
                    })
                    .map((li) => {
                      const ordered = Number(li.qty_ordered ?? li.qty) || 0;
                      const received = Number(li.qty_received) || 0;
                      const pending = Math.max(0, ordered - received);
                      return (
                        <tr key={`${po.id}_${li.id}`} className="hover:bg-slate-50/80">
                          <td className="py-2.5 px-4 font-mono font-bold text-indigo-700">
                            {po.purchase_order_metadata?.po_ref || po.formatted_quote_ref}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {po.purchase_order_metadata?.supplier_name || po.client_snapshot?.entity_name}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-900">{li.item_name || li.description}</div>
                            {li.part_no && <div className="text-[10px] font-mono text-slate-500">PN: {li.part_no}</div>}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{ordered} {li.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700">{received} {li.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-700">{pending} {li.unit}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                            {po.currency} {Number(li.landed_unit_cost ?? li.unit_price ?? 0).toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleOpenGrnModal(po)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-bold cursor-pointer"
                            >
                              Receive Stock (GRN)
                            </button>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: SUPPLIER BILLS & 3-WAY MATCH */}
      {activeTab === 'bills' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Bill # / Inv #</th>
                  <th className="py-3 px-3">Vendor</th>
                  <th className="py-3 px-3">PO Ref</th>
                  <th className="py-3 px-3">3-Way Match</th>
                  <th className="py-3 px-3">Approval / Hold</th>
                  <th className="py-3 px-3 text-right">Bill Total</th>
                  <th className="py-3 px-3 text-right">Balance Due</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supplierBills
                  .filter((b) => {
                    if (vendorFilter !== 'ALL' && b.vendor_name !== vendorFilter) return false;
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      b.bill_number.toLowerCase().includes(q) ||
                      b.vendor_invoice_no.toLowerCase().includes(q) ||
                      b.vendor_name.toLowerCase().includes(q) ||
                      (b.po_ref || '').toLowerCase().includes(q)
                    );
                  })
                  .map((bill) => {
                    const hasVariance =
                      bill.three_way_match_status === 'price_variance' ||
                      bill.three_way_match_status === 'qty_variance' ||
                      bill.three_way_match_status === 'both_variance';
                    return (
                      <tr key={bill.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900">{bill.bill_number}</div>
                          <div className="text-[10.5px] font-mono text-slate-500">
                            Inv: {bill.vendor_invoice_no}
                          </div>
                          {bill.attachment?.url && (
                            <a
                              href={bill.attachment.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline mt-0.5"
                            >
                              <span>View Scan</span>
                              {bill.attachment.original_size_bytes &&
                                bill.attachment.compressed_size_bytes &&
                                bill.attachment.compressed_size_bytes < bill.attachment.original_size_bytes && (
                                  <span className="px-1 rounded bg-emerald-50 text-emerald-700 font-mono text-[9px]">
                                    {formatByteSize(bill.attachment.compressed_size_bytes)}
                                  </span>
                                )}
                            </a>
                          )}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-800">{bill.vendor_name}</td>
                        <td className="py-3 px-3 font-mono text-indigo-700">{bill.po_ref || 'Direct Bill'}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              bill.three_way_match_status === 'matched'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : hasVariance
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                            title={bill.variance_summary}
                          >
                            {hasVariance && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                            <span>
                              {bill.three_way_match_status === 'matched'
                                ? '3-Way Matched'
                                : bill.three_way_match_status === 'price_variance'
                                ? 'Price Variance'
                                : bill.three_way_match_status === 'qty_variance'
                                ? 'Qty Variance'
                                : bill.three_way_match_status === 'both_variance'
                                ? 'Price & Qty Variance'
                                : 'No PO'}
                            </span>
                          </span>
                        </td>
                        <td className="py-3 px-3 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                bill.approval_status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {bill.approval_status.toUpperCase()}
                            </span>
                            {bill.is_on_hold && (
                              <span
                                className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold"
                                title={bill.hold_reason}
                              >
                                ON HOLD
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800">
                          {bill.currency} {Number(bill.grand_total || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-rose-700">
                          {bill.currency} {Number(bill.balance_due || 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {hasVariance && bill.approval_status !== 'approved' && userIsAdmin && (
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
                                  triggerToast?.(`Admin override approved ${bill.bill_number}.`, 'success');
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold cursor-pointer"
                                title="Admin Override Approve Variance"
                              >
                                Admin Approve
                              </button>
                            )}
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
                              className={`px-2 py-1 rounded-lg border text-[10px] font-bold cursor-pointer ${
                                bill.is_on_hold
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {bill.is_on_hold ? 'Release Hold' : 'Hold'}
                            </button>
                            {!bill.is_on_hold && bill.balance_due > 0 && (
                              <button
                                type="button"
                                onClick={() => handleIssuePaymentVoucher(bill)}
                                className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold cursor-pointer"
                              >
                                Pay (PV)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleIssueVendorReturn('debit_note', undefined, bill)}
                              className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[10px] font-semibold cursor-pointer"
                            >
                              + DN
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenBillModal(undefined, bill)}
                              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold cursor-pointer"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                {supplierBills.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                      No Supplier Bills recorded yet. Click &ldquo;Record Supplier Bill&rdquo; to log a vendor invoice and run 3-Way Match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAYMENT VOUCHERS & VENDOR RETURNS */}
      {activeTab === 'vouchers' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Ref #</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Vendor / Payee</th>
                  <th className="py-3 px-3">Subject / Narration</th>
                  <th className="py-3 px-3 text-right">Amount</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentVouchersAndReturns.map((doc) => {
                  const isPv = doc.document_type === 'payment_voucher';
                  const isMrn = doc.document_type === 'material_return_note';
                  const amt = isPv
                    ? Number(doc.payment_voucher_metadata?.amount_paid ?? doc.financial_totals?.grand_total ?? 0)
                    : Number(doc.financial_totals?.grand_total ?? 0);
                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {doc.formatted_quote_ref}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isPv
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : isMrn
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {isPv
                            ? 'PAYMENT VOUCHER (PV)'
                            : isMrn
                            ? 'MATERIAL RETURN (MRN)'
                            : 'DEBIT NOTE (DN)'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{doc.quotation_date}</td>
                      <td className="py-3 px-3 font-semibold text-slate-800">
                        {doc.payment_voucher_metadata?.payee_name ||
                          doc.vendor_return_metadata?.supplier_name ||
                          doc.client_snapshot?.entity_name}
                      </td>
                      <td className="py-3 px-3 text-slate-600 max-w-xs truncate">
                        {doc.quotation_subject}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                        {isMrn ? 'Unpriced' : `${doc.currency} ${amt.toFixed(2)}`}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenInStudio(doc)}
                          className="px-3 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10.5px] font-bold cursor-pointer"
                        >
                          Open in A4 Studio
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {paymentVouchersAndReturns.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 text-xs">
                      No Outbound Payment Vouchers or Vendor Returns issued yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE NEW SUPPLIER PO */}
      {showCreatePoModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Create Outbound Supplier Purchase Order (PO)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Link to a registered Vendor &amp; optionally to a Client Enquiry, or issue as a Warehouse Stock Replenishment PO
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreatePoModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Select Vendor from Directory
                  </label>
                  <select
                    value={newPoVendorId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setNewPoVendorId(id);
                      const v = companies.find((c) => c.id === id);
                      if (v) setNewPoSupplierName(v.name);
                    }}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  >
                    <option value="">-- Select Registered Vendor (or type name) --</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.relationship_type ? `(${v.relationship_type})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Supplier / Vendor Legal Name *
                  </label>
                  <input
                    type="text"
                    value={newPoSupplierName}
                    onChange={(e) => setNewPoSupplierName(e.target.value)}
                    placeholder="Supplier Name"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Link to Enquiry (Optional — Leave blank for Stock Replenishment)
                  </label>
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
                              qty: Number(li.qty) || 1,
                              unit: li.unit || prod?.unit || 'Nos',
                              unit_cost: Number(li.cost_price ?? prod?.cost_price ?? 0) || 0
                            };
                          })
                        );
                      }
                    }}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
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
                  <label className="block font-bold text-slate-700 mb-1">
                    Expected Delivery Date
                  </label>
                  <input
                    type="date"
                    value={newPoExpectedDate}
                    onChange={(e) => setNewPoExpectedDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">PO Line Items</span>
                  <button
                    type="button"
                    onClick={() =>
                      setNewPoLines((prev) => [
                        ...prev,
                        { product_id: '', item_name: '', part_no: '', qty: 1, unit: 'Nos', unit_cost: 0 }
                      ])
                    }
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-bold text-[11px] cursor-pointer"
                  >
                    + Add Line
                  </button>
                </div>

                {newPoLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-xl border border-slate-200">
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
                                    item_name: prod?.name || l.item_name,
                                    part_no: prod?.part_no || l.part_no,
                                    unit: prod?.unit || l.unit,
                                    unit_cost: Number(prod?.cost_price ?? prod?.last_landed_cost ?? 0)
                                  }
                                : l
                            )
                          );
                        }}
                        className="w-full rounded-lg border border-slate-300 p-1.5 bg-white text-[11px]"
                      >
                        <option value="">-- Pick Catalog Item or Type --</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.part_no ? `(${p.part_no})` : ''} — Stock: {p.stock_quantity ?? 0}
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
                        placeholder="Item Description"
                        className="w-full rounded-lg border border-slate-300 p-1.5 bg-white text-[11px]"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        min="1"
                        value={line.qty}
                        onChange={(e) =>
                          setNewPoLines((prev) =>
                            prev.map((l, i) => (i === idx ? { ...l, qty: Number(e.target.value) || 1 } : l))
                          )
                        }
                        placeholder="Qty"
                        className="w-full rounded-lg border border-slate-300 p-1.5 bg-white font-mono text-[11px]"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        value={line.unit_cost}
                        onChange={(e) =>
                          setNewPoLines((prev) =>
                            prev.map((l, i) =>
                              i === idx ? { ...l, unit_cost: Number(e.target.value) || 0 } : l
                            )
                          )
                        }
                        placeholder="Cost Rate"
                        className="w-full rounded-lg border border-slate-300 p-1.5 bg-white font-mono text-[11px]"
                      />
                    </div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => setNewPoLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreatePoModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSupplierPo}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold cursor-pointer"
              >
                Create PO &amp; Open in Studio
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: RECEIVE STOCK (GRN) & LANDED COST ALLOCATION */}
      {grnTargetPo && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/70">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Receive Stock (GRN) — {grnTargetPo.purchase_order_metadata?.po_ref || grnTargetPo.formatted_quote_ref}
                </h3>
                <p className="text-[11px] text-slate-600">
                  Supplier: {grnTargetPo.purchase_order_metadata?.supplier_name} • Proportional Landed Cost Calculation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGrnTargetPo(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">GRN Number</label>
                  <input
                    type="text"
                    value={grnNumber}
                    onChange={(e) => setGrnNumber(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Receipt Date</label>
                  <input
                    type="date"
                    value={grnReceivedDate}
                    onChange={(e) => setGrnReceivedDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Freight / Customs / Duty ({grnTargetPo.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={grnFreightCustoms}
                    onChange={(e) => setGrnFreightCustoms(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Landed Cost Distribution
                  </label>
                  <select
                    value={grnAllocationMode}
                    onChange={(e) => setGrnAllocationMode(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  >
                    <option value="proportional_value">Proportional by Line Value</option>
                    <option value="manual">Manual Per-Line Override</option>
                  </select>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2.5 px-3">Item</th>
                      <th className="py-2.5 px-2 text-right">Ordered</th>
                      <th className="py-2.5 px-2 text-right">Prev Recv</th>
                      <th className="py-2.5 px-2 text-right">Receive Now</th>
                      <th className="py-2.5 px-2 text-right">PO Unit Cost</th>
                      <th className="py-2.5 px-2 text-right">Allocated Freight</th>
                      <th className="py-2.5 px-3 text-right">Landed Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grnLandedPreview.map((line, idx) => (
                      <tr key={line.line_item_id}>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-900">{line.item_name}</div>
                          {line.part_no && (
                            <div className="text-[10px] font-mono text-slate-400">PN: {line.part_no}</div>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{line.qty_ordered}</td>
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
                            className="w-20 rounded-lg border border-emerald-400 px-2 py-1 text-right font-mono font-bold bg-emerald-50/40"
                          />
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {line.po_unit_cost.toFixed(2)}
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
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
                              className="w-24 rounded border border-slate-300 px-1.5 py-0.5 text-right font-mono"
                            />
                          ) : (
                            <span>{line.allocatedFreight.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-indigo-800">
                          {line.landedUnitCost.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer bg-amber-50/60 border border-amber-200 rounded-xl p-3">
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

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setGrnTargetPo(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingGrn}
                onClick={handleConfirmGrn}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isSubmittingGrn ? 'Posting GRN...' : 'Confirm GRN & Add to Warehouse Stock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: RECORD / EDIT SUPPLIER BILL & 3-WAY MATCH */}
      {showBillModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  {editingBill ? `Edit Supplier Bill (${editingBill.bill_number})` : 'Record Supplier Bill & 3-Way Match'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  Compare Vendor Invoice against PO &amp; GRN quantities/rates and attach compressed PDF scan
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBillModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* 3-Way Match Live Banner */}
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                  liveThreeWayMatch.status === 'matched'
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                    : liveThreeWayMatch.status === 'no_po'
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-2">
                  {liveThreeWayMatch.status === 'matched' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">3-Way Match Check: {liveThreeWayMatch.summary}</div>
                    {duplicateBillWarning && (
                      <div className="text-rose-700 font-bold mt-0.5">
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

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Link to Supplier PO</label>
                  <select
                    value={billPoId}
                    onChange={(e) => handleSelectBillPo(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
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
                  <label className="block font-bold text-slate-700 mb-1">Vendor / Supplier Name *</label>
                  <input
                    type="text"
                    value={billVendorName}
                    onChange={(e) => setBillVendorName(e.target.value)}
                    placeholder="Supplier Legal Name"
                    className="w-full rounded-xl border border-slate-300 p-2 bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Vendor Invoice # *</label>
                  <input
                    type="text"
                    value={billVendorInvoiceNo}
                    onChange={(e) => setBillVendorInvoiceNo(e.target.value)}
                    placeholder="e.g. INV-2026-9921"
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={billInvoiceDate}
                    onChange={(e) => setBillInvoiceDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Currency</label>
                    <input
                      type="text"
                      value={billCurrency}
                      onChange={(e) => setBillCurrency(e.target.value.toUpperCase())}
                      className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Exch. Rate</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={billExchangeRate}
                      onChange={(e) => setBillExchangeRate(Number(e.target.value) || 1)}
                      className="w-full rounded-xl border border-slate-300 p-2 font-mono bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Line Items Table for 3-Way Match */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                  <span className="font-bold text-slate-700">Bill Line Items (PO vs GRN vs Billed)</span>
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
                    className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 font-bold text-[10.5px] cursor-pointer"
                  >
                    + Add Line
                  </button>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/60 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500">
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-2 text-right">PO Qty</th>
                      <th className="py-2 px-2 text-right">GRN Qty</th>
                      <th className="py-2 px-2 text-right">Billed Qty</th>
                      <th className="py-2 px-2 text-right">PO Rate</th>
                      <th className="py-2 px-2 text-right">Billed Rate</th>
                      <th className="py-2 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
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
                            className="w-full rounded border border-slate-200 px-2 py-1"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-500">{l.po_qty ?? 0}</td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-500">{l.grn_qty ?? 0}</td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.billed_qty}
                            onChange={(e) => {
                              const q = Number(e.target.value) || 0;
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
                            className="w-20 rounded border border-slate-300 px-1.5 py-1 text-right font-mono"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-right font-mono text-slate-500">
                          {Number(l.po_unit_cost || 0).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={l.billed_unit_cost}
                            onChange={(e) => {
                              const r = Number(e.target.value) || 0;
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
                            className="w-24 rounded border border-slate-300 px-1.5 py-1 text-right font-mono"
                          />
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold">
                          {l.line_total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* PDF Compression & Scan Upload Row */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">
                      Attach Vendor Invoice Scan (PDF / Image)
                    </label>
                    <select
                      value={pdfPreset}
                      onChange={(e) => setPdfPreset(e.target.value as PdfCompressionPreset)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-[10.5px] bg-white"
                    >
                      <option value="standard">Standard Compress (~150 DPI)</option>
                      <option value="extreme">Extreme Compress (~110 DPI)</option>
                      <option value="original">Keep Original</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
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
                        <span className="font-semibold text-emerald-700 truncate max-w-[160px]">
                          {billAttachment.name}
                        </span>
                        {billAttachment.original_size_bytes &&
                          billAttachment.compressed_size_bytes && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px]">
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
                          className="text-rose-600 hover:underline text-[10px]"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tax / VAT Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={billTaxAmount}
                      onChange={(e) => setBillTaxAmount(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-slate-300 p-1.5 font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Freight / Duty</label>
                    <input
                      type="number"
                      step="0.01"
                      value={billFreightCustoms}
                      onChange={(e) => setBillFreightCustoms(Number(e.target.value) || 0)}
                      className="w-full rounded-lg border border-slate-300 p-1.5 font-mono bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBillModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingBill}
                onClick={handleSaveSupplierBill}
                className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {isSavingBill ? 'Saving Bill...' : 'Save Supplier Bill'}
              </button>
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
          user={user}
          existingQuotation={studioQuotation}
          products={products}
          onSaved={(savedDoc) => {
            setStudioQuotation(savedDoc);
            triggerToast?.(`${savedDoc.formatted_quote_ref} saved.`, 'success');
          }}
          onStockUpdated={async () => {}}
        />
      )}
    </div>
  );
}
