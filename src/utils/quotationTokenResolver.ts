import React from 'react';
import {
  Enquiry,
  Quotation,
  WorkspaceDocumentProfile,
  BankAccountProfile,
  DocumentProfileBankAccount
} from '../types';
import { amountToWords } from './numberToWords';

export type QuotationAtTagCategory =
  | 'Dates'
  | 'Client & Project'
  | 'Our Company & Quote'
  | 'Commercial, Bank & Totals'
  | 'Delivery, PO & Receipt';

export interface QuotationAtTagDefinition {
  key: string; // e.g. 'client_name'
  tag: string; // e.g. '@client_name'
  label: string; // e.g. 'Client / Company Name'
  category: QuotationAtTagCategory;
  description?: string;
  /** Optional structural target for 2-way sync with Document Cards */
  structuralSyncTarget?:
    | 'recipient.entity_name'
    | 'recipient.contact_person'
    | 'recipient.trn'
    | 'recipient.phone'
    | 'recipient.email'
    | 'recipient.address'
    | 'offer.quote_ref'
    | 'offer.quote_date'
    | 'offer.valid_until'
    | 'offer.enquiry_ref'
    | 'offer.sales_person'
    | 'subject.banner'
    | 'header.company_name'
    | 'header.trn'
    | 'header.phone'
    | 'header.email'
    | 'header.address'
    | 'terms.price_basis'
    | 'terms.payment_terms'
    | 'terms.validity'
    | 'remittance.bank_name'
    | 'remittance.beneficiary'
    | 'remittance.account_number'
    | 'remittance.iban'
    | 'remittance.swift'
    | 'signatory.primary_name'
    | 'signatory.primary_title';
}

export const QUOTATION_AT_TAGS: QuotationAtTagDefinition[] = [
  // 1. Dates
  {
    key: 'quote_date',
    tag: '@quote_date',
    label: 'Quote Issue Date',
    category: 'Dates',
    structuralSyncTarget: 'offer.quote_date'
  },
  {
    key: 'valid_until',
    tag: '@valid_until',
    label: 'Valid Until Date',
    category: 'Dates',
    structuralSyncTarget: 'offer.valid_until'
  },
  {
    key: 'enquiry_date',
    tag: '@enquiry_date',
    label: 'Enquiry Date',
    category: 'Dates'
  },
  {
    key: 'projected_order_date',
    tag: '@projected_order_date',
    label: 'Projected Order Date',
    category: 'Dates'
  },
  {
    key: 'followup_date',
    tag: '@followup_date',
    label: 'Next Follow-Up Date',
    category: 'Dates'
  },

  // 2. Client & Project
  {
    key: 'client_name',
    tag: '@client_name',
    label: 'Client / Company Name',
    category: 'Client & Project',
    structuralSyncTarget: 'recipient.entity_name'
  },
  {
    key: 'contact_person',
    tag: '@contact_person',
    label: 'Attention / Contact Person',
    category: 'Client & Project',
    structuralSyncTarget: 'recipient.contact_person'
  },
  {
    key: 'client_trn',
    tag: '@client_trn',
    label: 'Customer TRN / Tax ID',
    category: 'Client & Project',
    structuralSyncTarget: 'recipient.trn'
  },
  {
    key: 'client_phone',
    tag: '@client_phone',
    label: 'Customer Phone',
    category: 'Client & Project',
    structuralSyncTarget: 'recipient.phone'
  },
  {
    key: 'client_email',
    tag: '@client_email',
    label: 'Customer Email',
    category: 'Client & Project',
    structuralSyncTarget: 'recipient.email'
  },
  {
    key: 'client_address',
    tag: '@client_address',
    label: 'Customer Address',
    category: 'Client & Project',
    structuralSyncTarget: 'recipient.address'
  },
  {
    key: 'project_location',
    tag: '@project_location',
    label: 'Project Location / Site',
    category: 'Client & Project'
  },
  {
    key: 'project_number',
    tag: '@project_number',
    label: 'Project Number / Job ID',
    category: 'Client & Project'
  },
  {
    key: 'customer_ref',
    tag: '@customer_ref',
    label: 'Customer Reference / RFQ #',
    category: 'Client & Project'
  },
  {
    key: 'enquiry_ref',
    tag: '@enquiry_ref',
    label: 'Enquiry Reference No.',
    category: 'Client & Project',
    structuralSyncTarget: 'offer.enquiry_ref'
  },

  // 3. Our Company & Quote
  {
    key: 'quote_ref',
    tag: '@quote_ref',
    label: 'Quotation Reference',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'offer.quote_ref'
  },
  {
    key: 'revision_no',
    tag: '@revision_no',
    label: 'Revision Number (e.g. R1)',
    category: 'Our Company & Quote'
  },
  {
    key: 'our_company',
    tag: '@our_company',
    label: 'Our Company Legal Name',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'header.company_name'
  },
  {
    key: 'our_trn',
    tag: '@our_trn',
    label: 'Our Corporate TRN',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'header.trn'
  },
  {
    key: 'our_phone',
    tag: '@our_phone',
    label: 'Our Official Phone',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'header.phone'
  },
  {
    key: 'our_email',
    tag: '@our_email',
    label: 'Our Official Email',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'header.email'
  },
  {
    key: 'our_address',
    tag: '@our_address',
    label: 'Our Registered Address',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'header.address'
  },
  {
    key: 'sales_person',
    tag: '@sales_person',
    label: 'Assigned Sales Representative',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'offer.sales_person'
  },
  {
    key: 'signatory_name',
    tag: '@signatory_name',
    label: 'Authorized Signatory Name',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'signatory.primary_name'
  },
  {
    key: 'signatory_role',
    tag: '@signatory_role',
    label: 'Authorized Signatory Title',
    category: 'Our Company & Quote',
    structuralSyncTarget: 'signatory.primary_title'
  },

  // 4. Commercial, Bank & Totals
  {
    key: 'price_basis',
    tag: '@price_basis',
    label: 'Price Basis / Incoterms',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'terms.price_basis'
  },
  {
    key: 'payment_terms',
    tag: '@payment_terms',
    label: 'Payment Terms',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'terms.payment_terms'
  },
  {
    key: 'delivery_lead_time',
    tag: '@delivery_lead_time',
    label: 'Delivery / Lead Time',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'quote_validity',
    tag: '@quote_validity',
    label: 'Offer Validity Period',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'terms.validity'
  },
  {
    key: 'warranty_period',
    tag: '@warranty_period',
    label: 'Warranty Period',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'currency',
    tag: '@currency',
    label: 'Quotation Currency',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'subtotal',
    tag: '@subtotal',
    label: 'Subtotal (Excl. Tax)',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'freight_amount',
    tag: '@freight_amount',
    label: 'Freight / Logistics Charges',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'vat_amount',
    tag: '@vat_amount',
    label: 'VAT / Tax Amount',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'grand_total',
    tag: '@grand_total',
    label: 'Grand Total (Formatted)',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'amount_in_words',
    tag: '@amount_in_words',
    label: 'Grand Total in Words',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'bank_name',
    tag: '@bank_name',
    label: 'Remittance Bank Name',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'remittance.bank_name'
  },
  {
    key: 'account_name',
    tag: '@account_name',
    label: 'Beneficiary Account Name',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'remittance.beneficiary'
  },
  {
    key: 'account_no',
    tag: '@account_no',
    label: 'Bank Account Number',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'remittance.account_number'
  },
  {
    key: 'iban',
    tag: '@iban',
    label: 'IBAN',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'remittance.iban'
  },
  {
    key: 'swift',
    tag: '@swift',
    label: 'SWIFT / BIC Code',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'remittance.swift'
  },
  {
    key: 'item_count',
    tag: '@item_count',
    label: 'Total Line Items Count',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'scope_summary',
    tag: '@scope_summary',
    label: 'Quotation Subject / Scope Summary',
    category: 'Commercial, Bank & Totals',
    structuralSyncTarget: 'subject.banner'
  },

  // 5. Delivery Note, Purchase Order & Payment Receipt Tags
  {
    key: 'delivery_ref',
    tag: '@delivery_ref',
    label: 'Delivery Note Reference',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'delivery_date',
    tag: '@delivery_date',
    label: 'Delivery / Dispatch Date',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'vehicle_no',
    tag: '@vehicle_no',
    label: 'Vehicle Plate / Carrier Ref',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'driver_name',
    tag: '@driver_name',
    label: 'Driver / Courier Name',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'site_address',
    tag: '@site_address',
    label: 'Delivery / Site Address',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'customer_po',
    tag: '@customer_po',
    label: 'Customer PO Number',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'po_ref',
    tag: '@po_ref',
    label: 'Purchase Order Reference',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'po_date',
    tag: '@po_date',
    label: 'Purchase Order Date',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'supplier_name',
    tag: '@supplier_name',
    label: 'Supplier / Vendor Name',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'supplier_tax_id',
    tag: '@supplier_tax_id',
    label: 'Supplier Tax ID / TRN',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'incoterms',
    tag: '@incoterms',
    label: 'Delivery Incoterms',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'receipt_ref',
    tag: '@receipt_ref',
    label: 'Receipt Voucher Reference',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'payment_mode',
    tag: '@payment_mode',
    label: 'Payment Mode / Method',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'bank_ref',
    tag: '@bank_ref',
    label: 'Bank Transaction / Cheque Ref',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'amount_paid',
    tag: '@amount_paid',
    label: 'Current Amount Paid / Received',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'previously_paid',
    tag: '@previously_paid',
    label: 'Previously Received Amount',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'balance_due',
    tag: '@balance_due',
    label: 'Balance Outstanding',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'pv_ref',
    tag: '@pv_ref',
    label: 'Payment Voucher Reference',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'pv_date',
    tag: '@pv_date',
    label: 'Payment Voucher Date',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'beneficiary_name',
    tag: '@beneficiary_name',
    label: 'Vendor / Beneficiary Account Name',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'beneficiary_bank',
    tag: '@beneficiary_bank',
    label: 'Vendor Beneficiary Bank Name',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'beneficiary_iban',
    tag: '@beneficiary_iban',
    label: 'Vendor Beneficiary IBAN',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'beneficiary_swift',
    tag: '@beneficiary_swift',
    label: 'Vendor Beneficiary SWIFT / BIC',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'vendor_invoice_no',
    tag: '@vendor_invoice_no',
    label: 'Supplier Bill / Invoice Number',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'mrn_ref',
    tag: '@mrn_ref',
    label: 'Material Return Note Reference',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'dn_ref',
    tag: '@dn_ref',
    label: 'Vendor Debit Note Reference',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'return_reason',
    tag: '@return_reason',
    label: 'Material Return / Claim Reason',
    category: 'Delivery, PO & Receipt'
  },
  {
    key: 'original_po_ref',
    tag: '@original_po_ref',
    label: 'Original Linked Supplier PO Ref',
    category: 'Delivery, PO & Receipt'
  }
];

/**
 * Alias map supporting common shorthand or legacy {{token}} names
 * mapped to canonical QUOTATION_AT_TAGS keys.
 */
const TOKEN_ALIAS_MAP: Record<string, string> = {
  company_name: 'client_name',
  client_company: 'client_name',
  customer_name: 'client_name',
  attention: 'contact_person',
  contact_person_name: 'contact_person',
  customer_trn: 'client_trn',
  customer_phone: 'client_phone',
  customer_email: 'client_email',
  customer_address: 'client_address',
  customer_reference_code: 'customer_ref',
  quote_ref_no: 'quote_ref',
  formatted_quote_ref: 'quote_ref',
  revision_number: 'revision_no',
  validity_days: 'quote_validity',
  validity: 'quote_validity',
  created_at: 'quote_date',
  issue_date: 'quote_date',
  logged_date: 'enquiry_date',
  next_followup_date: 'followup_date',
  prepared_by: 'sales_person',
  sales_rep: 'sales_person',
  assigned_to: 'sales_person',
  primary_signatory_name: 'signatory_name',
  primary_signatory_title: 'signatory_role',
  signatory_title: 'signatory_role',
  tax_amount: 'vat_amount',
  vat: 'vat_amount',
  total: 'grand_total',
  beneficiary: 'account_name',
  account_number: 'account_no',
  swift_code: 'swift',
  subject: 'scope_summary',
  do_ref: 'delivery_ref',
  vehicle_plate_no: 'vehicle_no',
  delivery_address: 'site_address',
  customer_po_no: 'customer_po',
  vendor_name: 'supplier_name',
  vendor_trn: 'supplier_tax_id',
  payment_method: 'payment_mode',
  bank_txn_ref: 'bank_ref',
  amount_received: 'amount_paid',
  previously_received: 'previously_paid',
  balance_outstanding: 'balance_due'
};

const WHITELISTED_TOKEN_KEYS = new Set<string>([
  ...QUOTATION_AT_TAGS.map((t) => t.key),
  ...Object.keys(TOKEN_ALIAS_MAP)
]);

export function normalizeCanonicalTagKey(rawKey: string): string {
  const lower = String(rawKey || '').trim().toLowerCase();
  return TOKEN_ALIAS_MAP[lower] || lower;
}

export function isWhitelistedAtTag(rawKey: string): boolean {
  const lower = String(rawKey || '').trim().toLowerCase();
  return WHITELISTED_TOKEN_KEYS.has(lower);
}

export interface QuotationTokenContext {
  quotation?: Partial<Quotation> | null;
  enquiry?: Partial<Enquiry> | null;
  profile?: Partial<WorkspaceDocumentProfile> | null;
  omittedFields?: Record<string, boolean> | null;
  activeBank?: Partial<BankAccountProfile & DocumentProfileBankAccount> | null;
  amountInWordsText?: string;
}

function formatReadableDate(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) return '';
  const trimmed = String(isoOrDateStr).trim();
  if (!trimmed) return '';
  const d = new Date(trimmed);
  if (isNaN(d.getTime())) return trimmed;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function formatAmount(num?: number | string | null): string {
  if (num === undefined || num === null || num === '') return '0.00';
  const n = Number(num);
  if (!Number.isFinite(n)) return '0.00';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Determines whether a quotation is in a locked/issued state where
 * snapshot values must be frozen and never fall back to mutable live enquiry data.
 */
export function isQuotationSnapshotFrozen(quotation?: Partial<Quotation> | null): boolean {
  const st = quotation?.status;
  if (!st || st === 'Draft') return false;
  return (
    st === 'Sent' ||
    st === 'Approved' ||
    st === 'Accepted' ||
    st === 'Superseded' ||
    st === 'Declined' ||
    st === 'Rejected'
  );
}

export function isFieldOmitted(
  rawKey: string,
  omittedFields?: Record<string, boolean> | null
): boolean {
  if (!omittedFields) return false;
  const canonical = normalizeCanonicalTagKey(rawKey);
  return Boolean(omittedFields[canonical] || omittedFields[rawKey]);
}

/**
 * Builds the complete dictionary of canonical @tag keys -> raw resolved string values
 * (before applying omission or '—' fallback).
 *
 * Snapshot-First Resolution Rule:
 * - Always reads from `quotation.client_snapshot`, `quotation.sender_snapshot`, `quotation.applied_bank_account`,
 *   and `quotation.*` fields first.
 * - Falls back to live `enquiry` / `profile` ONLY when the quotation is in 'Draft' (not frozen).
 */
export function buildQuotationTokenMap(ctx: QuotationTokenContext): Record<string, string> {
  const q = ctx.quotation || {};
  const frozen = isQuotationSnapshotFrozen(q);
  const enq = frozen ? ({} as Partial<Enquiry>) : ctx.enquiry || {};
  const prof = frozen ? ({} as Partial<WorkspaceDocumentProfile>) : ctx.profile || {};

  const clientSnap = q.client_snapshot || ({} as any);
  const senderSnap = q.sender_snapshot || ({} as any);

  // Dates
  const rawIssueDate = q.created_at || (enq as any)?.created_at || '';
  const quoteDateStr = formatReadableDate(rawIssueDate);

  let validUntilStr = formatReadableDate(q.valid_until);
  if (!validUntilStr && rawIssueDate) {
    const base = new Date(rawIssueDate);
    const vDays = Number(q.validity_days ?? prof.default_validity_days ?? 30);
    if (!isNaN(base.getTime()) && Number.isFinite(vDays)) {
      base.setDate(base.getDate() + vDays);
      validUntilStr = formatReadableDate(base.toISOString());
    }
  }

  const enquiryDateStr = formatReadableDate(
    (clientSnap as any)?.enquiry_date || enq.enquiry_date || enq.logged_date || ''
  );
  const projectedOrderDateStr = formatReadableDate(
    (clientSnap as any)?.projected_order_date || enq.projected_order_date || ''
  );
  const followupDateStr = formatReadableDate(
    (clientSnap as any)?.next_followup_date || enq.next_followup_date || ''
  );

  // Client & Project
  const clientName =
    clientSnap.entity_name ||
    (!frozen ? enq.company_name || enq.client_company || '' : '') ||
    '';

  const contactPerson =
    q.client_contact_person ||
    clientSnap.client_contact_person ||
    clientSnap.contact_person ||
    (!frozen ? enq.contact_person_name || '' : '') ||
    '';

  const clientTrn =
    q.client_trn ||
    clientSnap.client_trn ||
    clientSnap.trn ||
    (!frozen ? (enq as any)?.client_trn || (enq as any)?.trn || '' : '') ||
    '';

  const clientPhone =
    q.client_phone ||
    clientSnap.client_phone ||
    clientSnap.phone ||
    (!frozen ? (enq as any)?.contact_phone || (enq as any)?.phone || '' : '') ||
    '';

  const clientEmail =
    q.client_email ||
    clientSnap.client_email ||
    clientSnap.email ||
    (!frozen ? (enq as any)?.contact_email || (enq as any)?.email || '' : '') ||
    '';

  const clientAddress =
    q.client_address ||
    clientSnap.client_address ||
    clientSnap.address ||
    (!frozen ? enq.project_location || (enq as any)?.address || '' : '') ||
    '';

  const projectLocation =
    (clientSnap as any)?.project_location ||
    (!frozen ? enq.project_location || '' : '') ||
    clientAddress ||
    '';

  const projectNumber =
    (clientSnap as any)?.project_number ||
    (!frozen ? enq.project_number || '' : '') ||
    '';

  const customerRef =
    (clientSnap as any)?.customer_reference_code ||
    (!frozen ? enq.customer_reference_code || '' : '') ||
    '';

  const enquiryRef =
    (clientSnap as any)?.enquiry_ref ||
    (!frozen ? enq.quote_ref_no || enq.customer_reference_code || enq.id || '' : '') ||
    q.quote_number ||
    '';

  // Our Company & Quote
  const quoteRef = q.formatted_quote_ref || q.quote_number || '';
  const revisionNo =
    typeof q.revision_number === 'number' ? `R${q.revision_number}` : 'R1';

  const ourCompany =
    q.companyNameOverride ||
    q.header_config?.companyNameOverride ||
    senderSnap.entity_name ||
    (!frozen ? prof.legal_entity_name || '' : '') ||
    '';

  const ourTrn =
    senderSnap.trn ||
    (!frozen ? prof.trn || '' : '') ||
    '';

  const ourPhone =
    senderSnap.phone ||
    (!frozen ? prof.phone || '' : '') ||
    '';

  const ourEmail =
    senderSnap.email ||
    (!frozen ? prof.email || '' : '') ||
    '';

  const ourAddress =
    senderSnap.address ||
    (!frozen
      ? [prof.address_line_1, prof.address_line_2, prof.city, prof.country]
          .filter(Boolean)
          .join(', ')
      : '') ||
    '';

  const salesPerson =
    q.prepared_by ||
    senderSnap.contact_person ||
    (!frozen ? enq.sales_person || enq.assigned_to || '' : '') ||
    '';

  const signatoryName =
    q.primary_signatory_name ||
    q.signatories?.[0]?.name ||
    salesPerson ||
    '';

  const signatoryRole =
    q.primary_signatory_title ||
    q.signatories?.[0]?.designation ||
    '';

  // Commercial, Bank & Totals
  const priceBasis =
    q.price_basis ||
    (!frozen ? prof.default_price_basis || '' : '') ||
    '';

  const paymentTerms =
    q.payment_terms ||
    q.applied_terms ||
    (!frozen ? prof.default_payment_terms || '' : '') ||
    '';

  const lineItems = Array.isArray(q.line_items) ? q.line_items : [];
  const firstLeadTime =
    lineItems
      .map((it) => String(it?.availability || (it as any)?.delivery_lead_time || '').trim())
      .find(Boolean) || '';

  const validityDaysNum = q.validity_days ?? (!frozen ? prof.default_validity_days : undefined);
  const quoteValidity =
    validityDaysNum !== undefined && validityDaysNum !== null
      ? `${validityDaysNum} Days`
      : '';

  const termsBlock = Array.isArray(q.layout_blocks)
    ? q.layout_blocks.find((b) => b.id === 'terms' || b.type === 'terms')
    : undefined;
  const warrantyCustomRow = termsBlock?.customRows?.find((r) =>
    /warranty/i.test(String(r.label || ''))
  );
  const warrantyPeriod =
    warrantyCustomRow?.value || '12 Months Standard Manufacturer Warranty';

  const currency =
    q.receipt_metadata?.currency || q.currency || (!frozen ? enq.currency : '') || 'AED';
  const subtotal = `${currency} ${formatAmount(q.subtotal)}`;
  const freightAmount = `${currency} ${formatAmount(q.freight_amount)}`;
  const vatAmount = `${currency} ${formatAmount(q.tax_amount)}`;
  const grandTotal = `${currency} ${formatAmount(q.grand_total)}`;

  const docType = q.document_type || 'quotation';
  const delMeta = q.delivery_metadata || {};
  const poMeta = q.purchase_order_metadata || {};
  const recMeta = q.receipt_metadata || {};
  const pvMeta = q.payment_voucher_metadata || {};
  const retMeta = q.vendor_return_metadata || {};

  const effectiveAmountForWords =
    docType === 'receipt' && recMeta.amount_received !== undefined
      ? Number(recMeta.amount_received) || 0
      : docType === 'payment_voucher' && pvMeta.amount_paid !== undefined
      ? Number(pvMeta.amount_paid) || 0
      : Number(q.grand_total) || 0;

  const amountInWords =
    ctx.amountInWordsText ||
    amountToWords(effectiveAmountForWords, currency) ||
    '';

  // Bank resolution (snapshot-first)
  const bankSnap: any =
    ctx.activeBank ||
    q.selectedBank ||
    q.selected_bank ||
    q.applied_bank_account ||
    (!frozen
      ? prof.bank_accounts?.find((b) => b.is_default) || prof.bank_accounts?.[0]
      : null) ||
    {};

  const bankName = bankSnap.bankName || bankSnap.bank_name || '';
  const accountName =
    bankSnap.beneficiaryName ||
    bankSnap.beneficiary_name ||
    bankSnap.account_name ||
    ourCompany ||
    '';
  const accountNo = bankSnap.accountNumber || bankSnap.account_number || '';
  const iban = bankSnap.iban || '';
  const swift = bankSnap.swiftCode || bankSnap.swift_code || bankSnap.swift || '';

  const itemCount = String(
    lineItems.filter((it) => !(it as any)?.is_section_header).length
  );
  const scopeSummary =
    q.subject || (!frozen ? enq.subject || '' : '') || '';

  // Delivery Note tokens
  const deliveryRef = delMeta.delivery_ref || (docType === 'delivery_note' ? quoteRef : '');
  const deliveryDate = formatReadableDate(delMeta.delivery_date || rawIssueDate);
  const vehicleNo = delMeta.vehicle_plate_no || '';
  const driverName = delMeta.driver_name || '';
  const siteAddress =
    delMeta.delivery_address ||
    poMeta.shipping_address ||
    projectLocation ||
    clientAddress ||
    '';
  const customerPo =
    delMeta.customer_po_no ||
    customerRef ||
    '';

  // Purchase Order tokens
  const poRef =
    poMeta.po_ref ||
    pvMeta.linked_po_ref ||
    retMeta.original_po_ref ||
    (docType === 'purchase_order' ? quoteRef : '');
  const poDate = formatReadableDate(poMeta.po_date || rawIssueDate);
  const supplierName =
    poMeta.supplier_name ||
    pvMeta.paid_to_vendor_name ||
    retMeta.vendor_name ||
    (docType === 'purchase_order' ||
    docType === 'payment_voucher' ||
    docType === 'material_return_note' ||
    docType === 'debit_note'
      ? clientName
      : '');
  const supplierTaxId =
    poMeta.supplier_tax_id ||
    poMeta.supplier_trn ||
    pvMeta.vendor_trn ||
    retMeta.vendor_trn ||
    (docType === 'purchase_order' ? clientTrn : '');
  const incotermsVal = poMeta.incoterms || priceBasis || '';

  // Receipt Voucher & Outbound Payment Voucher tokens
  const receiptRef = recMeta.receipt_ref || (docType === 'receipt' ? quoteRef : '');
  const paymentModeVal =
    (docType === 'payment_voucher' ? pvMeta.payment_method : recMeta.payment_method) || '';
  const bankRefVal =
    (docType === 'payment_voucher'
      ? pvMeta.bank_txn_ref || pvMeta.cheque_no
      : recMeta.bank_txn_ref || recMeta.cheque_no) || '';
  const amountPaidRaw =
    docType === 'payment_voucher'
      ? pvMeta.amount_paid ?? q.grand_total
      : recMeta.amount_received ?? q.grand_total;
  const amountPaidVal = `${currency} ${formatAmount(amountPaidRaw)}`;
  const previouslyPaidRaw =
    docType === 'payment_voucher'
      ? pvMeta.previously_paid ?? 0
      : recMeta.previously_received ?? 0;
  const previouslyPaidVal = `${currency} ${formatAmount(previouslyPaidRaw)}`;
  const computedBalance =
    docType === 'payment_voucher'
      ? pvMeta.balance_remaining !== undefined
        ? Number(pvMeta.balance_remaining)
        : Math.max(
            0,
            (Number(pvMeta.total_payable_amount ?? q.grand_total) || 0) -
              (Number(pvMeta.previously_paid) || 0) -
              (Number(pvMeta.amount_paid) || 0)
          )
      : recMeta.balance_outstanding !== undefined
      ? Number(recMeta.balance_outstanding)
      : Math.max(
          0,
          (Number(recMeta.total_order_value ?? q.grand_total) || 0) -
            (Number(recMeta.previously_received) || 0) -
            (Number(recMeta.amount_received) || 0)
        );
  const balanceDueVal = `${currency} ${formatAmount(computedBalance)}`;

  // Payment Voucher, Beneficiary Bank & Vendor Return tokens
  const pvRefVal = pvMeta.pv_ref || (docType === 'payment_voucher' ? quoteRef : '');
  const pvDateVal = formatReadableDate(pvMeta.pv_date || rawIssueDate);
  const benBankSnap =
    pvMeta.beneficiary_bank_details ||
    poMeta.beneficiary_bank_details ||
    {};
  const beneficiaryNameVal =
    benBankSnap.beneficiary_name ||
    pvMeta.paid_to_vendor_name ||
    poMeta.supplier_name ||
    accountName ||
    '';
  const beneficiaryBankVal = benBankSnap.bank_name || bankName || '';
  const beneficiaryIbanVal = benBankSnap.iban || iban || '';
  const beneficiarySwiftVal = benBankSnap.swift_code || swift || '';
  const vendorInvoiceNoVal =
    pvMeta.vendor_invoice_no ||
    retMeta.vendor_invoice_no ||
    (Array.isArray(pvMeta.allocations) && pvMeta.allocations.length > 0
      ? pvMeta.allocations.map((a) => a.vendor_invoice_no).filter(Boolean).join(', ')
      : '');
  const mrnRefVal = retMeta.return_ref || (docType === 'material_return_note' ? quoteRef : '');
  const dnRefVal = retMeta.return_ref || (docType === 'debit_note' ? quoteRef : '');
  const returnReasonVal = retMeta.return_reason || '';
  const originalPoRefVal = retMeta.original_po_ref || pvMeta.linked_po_ref || poRef || '';

  return {
    quote_date: String(quoteDateStr || '').trim(),
    valid_until: String(validUntilStr || '').trim(),
    enquiry_date: String(enquiryDateStr || '').trim(),
    projected_order_date: String(projectedOrderDateStr || '').trim(),
    followup_date: String(followupDateStr || '').trim(),

    client_name: String(clientName || '').trim(),
    contact_person: String(contactPerson || '').trim(),
    client_trn: String(clientTrn || '').trim(),
    client_phone: String(clientPhone || '').trim(),
    client_email: String(clientEmail || '').trim(),
    client_address: String(clientAddress || '').trim(),
    project_location: String(projectLocation || '').trim(),
    project_number: String(projectNumber || '').trim(),
    customer_ref: String(customerRef || '').trim(),
    enquiry_ref: String(enquiryRef || '').trim(),

    quote_ref: String(quoteRef || '').trim(),
    revision_no: String(revisionNo || '').trim(),
    our_company: String(ourCompany || '').trim(),
    our_trn: String(ourTrn || '').trim(),
    our_phone: String(ourPhone || '').trim(),
    our_email: String(ourEmail || '').trim(),
    our_address: String(ourAddress || '').trim(),
    sales_person: String(salesPerson || '').trim(),
    signatory_name: String(signatoryName || '').trim(),
    signatory_role: String(signatoryRole || '').trim(),

    price_basis: String(priceBasis || '').trim(),
    payment_terms: String(paymentTerms || '').trim(),
    delivery_lead_time: String(firstLeadTime || '').trim(),
    quote_validity: String(quoteValidity || '').trim(),
    warranty_period: String(warrantyPeriod || '').trim(),
    currency: String(currency || '').trim(),
    subtotal: String(subtotal || '').trim(),
    freight_amount: String(freightAmount || '').trim(),
    vat_amount: String(vatAmount || '').trim(),
    grand_total: String(grandTotal || '').trim(),
    amount_in_words: String(amountInWords || '').trim(),
    bank_name: String(bankName || '').trim(),
    account_name: String(accountName || '').trim(),
    account_no: String(accountNo || '').trim(),
    iban: String(iban || '').trim(),
    swift: String(swift || '').trim(),
    item_count: String(itemCount || '').trim(),
    scope_summary: String(scopeSummary || '').trim(),

    delivery_ref: String(deliveryRef || '').trim(),
    delivery_date: String(deliveryDate || '').trim(),
    vehicle_no: String(vehicleNo || '').trim(),
    driver_name: String(driverName || '').trim(),
    site_address: String(siteAddress || '').trim(),
    customer_po: String(customerPo || '').trim(),

    po_ref: String(poRef || '').trim(),
    po_date: String(poDate || '').trim(),
    supplier_name: String(supplierName || '').trim(),
    supplier_tax_id: String(supplierTaxId || '').trim(),
    incoterms: String(incotermsVal || '').trim(),

    receipt_ref: String(receiptRef || '').trim(),
    payment_mode: String(paymentModeVal || '').trim(),
    bank_ref: String(bankRefVal || '').trim(),
    amount_paid: String(amountPaidVal || '').trim(),
    previously_paid: String(previouslyPaidVal || '').trim(),
    balance_due: String(balanceDueVal || '').trim(),

    pv_ref: String(pvRefVal || '').trim(),
    pv_date: String(pvDateVal || '').trim(),
    beneficiary_name: String(beneficiaryNameVal || '').trim(),
    beneficiary_bank: String(beneficiaryBankVal || '').trim(),
    beneficiary_iban: String(beneficiaryIbanVal || '').trim(),
    beneficiary_swift: String(beneficiarySwiftVal || '').trim(),
    vendor_invoice_no: String(vendorInvoiceNoVal || '').trim(),
    mrn_ref: String(mrnRefVal || '').trim(),
    dn_ref: String(dnRefVal || '').trim(),
    return_reason: String(returnReasonVal || '').trim(),
    original_po_ref: String(originalPoRefVal || '').trim()
  };
}

/**
 * Resolves a single canonical tag key with Choice A2 ('—' fallback when empty or omitted).
 */
export function resolveSingleTagValue(
  rawKey: string,
  ctx: QuotationTokenContext,
  precomputedMap?: Record<string, string>
): string {
  const canonical = normalizeCanonicalTagKey(rawKey);
  if (isFieldOmitted(canonical, ctx.omittedFields ?? ctx.quotation?.omitted_fields)) {
    return '—';
  }
  const map = precomputedMap || buildQuotationTokenMap(ctx);
  const val = map[canonical];
  if (val === undefined || val === null || String(val).trim() === '') {
    return '—';
  }
  return String(val).trim();
}

/**
 * Email-safe regex for @token matching:
 * Matches `(prefix)@([a-zA-Z_][a-zA-Z0-9_]*)` where `prefix` is start of string,
 * whitespace, or opening punctuation `([{"'`.
 * Never matches when preceded by alphanumeric, `.`, `_`, or `-` (protecting emails like sales@aventura.ae).
 * Also avoids matching if immediately followed by `@` or domain-like `.com`/`.ae` if someone typed `@aventura.ae`?
 * Note: `@client_name.` at the end of a sentence SHOULD match `@client_name` followed by a period!
 */
const AT_TOKEN_REGEX = /(^|[\s(\[{"'‘“])@([a-zA-Z_][a-zA-Z0-9_]*)/g;
const MUSTACHE_TOKEN_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Resolves all whitelisted `@tag` and `{{tag}}` tokens in `text`.
 * - Empty or omitted whitelisted tags resolve to `'—'` (Choice A2).
 * - Email addresses (`sales@aventura.ae`, `info@client_name.com`) are never touched.
 * - Unknown `@typos` are left intact so they can be highlighted in preview and flagged before print.
 */
export function resolveQuotationTokens(
  text: string | undefined | null,
  ctx: QuotationTokenContext
): string {
  if (!text) return '';
  const raw = String(text);
  if (!raw.includes('@') && !raw.includes('{{')) return raw;

  const map = buildQuotationTokenMap(ctx);
  const omitted = ctx.omittedFields ?? ctx.quotation?.omitted_fields;

  // 1. Resolve {{tag_name}} aliases
  let output = raw.replace(MUSTACHE_TOKEN_REGEX, (fullMatch, tokenName: string) => {
    if (!isWhitelistedAtTag(tokenName)) return fullMatch;
    const canonical = normalizeCanonicalTagKey(tokenName);
    if (isFieldOmitted(canonical, omitted)) return '—';
    const val = map[canonical];
    return val && String(val).trim() !== '' ? String(val).trim() : '—';
  });

  // 2. Resolve @tag_name tokens (email-safe)
  output = output.replace(
    AT_TOKEN_REGEX,
    (fullMatch, prefix: string, tokenName: string) => {
      if (!isWhitelistedAtTag(tokenName)) {
        return fullMatch; // Leave unknown @typo intact
      }
      const canonical = normalizeCanonicalTagKey(tokenName);
      if (isFieldOmitted(canonical, omitted)) {
        return `${prefix}—`;
      }
      const val = map[canonical];
      const resolved = val && String(val).trim() !== '' ? String(val).trim() : '—';
      return `${prefix}${resolved}`;
    }
  );

  return output;
}

/**
 * Finds all unrecognized `@tokens` in a single string (ignoring valid whitelisted tags and emails).
 */
export function findUnknownAtTokens(text: string | undefined | null): string[] {
  if (!text) return [];
  const raw = String(text);
  if (!raw.includes('@')) return [];

  const found: string[] = [];
  const regex = new RegExp(AT_TOKEN_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const tokenName = match[2];
    if (tokenName && !isWhitelistedAtTag(tokenName)) {
      const tagWithAt = `@${tokenName}`;
      if (!found.includes(tagWithAt)) {
        found.push(tagWithAt);
      }
    }
  }
  return found;
}

/**
 * Scans an entire Quotation object for any unrecognized `@typos` across all document text surfaces.
 */
export function findUnknownAtTokensInQuotation(
  quotation: Partial<Quotation> | null | undefined
): Array<{ token: string; location: string }> {
  if (!quotation) return [];
  const warnings: Array<{ token: string; location: string }> = [];
  const addFromText = (txt: string | undefined | null, location: string) => {
    const unknowns = findUnknownAtTokens(txt);
    for (const token of unknowns) {
      if (!warnings.some((w) => w.token === token && w.location === location)) {
        warnings.push({ token, location });
      }
    }
  };

  addFromText(quotation.subject, 'Quotation Subject');
  addFromText(quotation.price_basis, 'Price Basis');
  addFromText(quotation.payment_terms, 'Payment Terms');
  addFromText(quotation.custom_notes, 'Terms & Clauses / Cover Note');
  addFromText(quotation.footer_config?.forAndOnBehalfText, 'Signatory Header');
  addFromText(quotation.footer_config?.customDisclaimer, 'Footer Disclaimer');

  if (Array.isArray(quotation.footer_config?.customFooterPills)) {
    quotation.footer_config!.customFooterPills!.forEach((pill) =>
      addFromText(pill, 'Footer Badge')
    );
  }

  if (Array.isArray(quotation.footer_config?.signatoryCustomLines)) {
    quotation.footer_config!.signatoryCustomLines!.forEach((line) => {
      addFromText(line.label, 'Signatory Custom Line');
      addFromText(line.value, 'Signatory Custom Line');
    });
  }

  if (Array.isArray(quotation.layout_blocks)) {
    quotation.layout_blocks.forEach((block) => {
      const bTitle = block.titleOverride || block.title || block.id || 'Block';
      addFromText(block.titleOverride, `${bTitle} Title`);
      addFromText(block.subtitleOverride, `${bTitle} Subtitle`);
      addFromText(block.customNote, `${bTitle} Note`);
      addFromText(block.acceptanceStatementOverride, 'Acceptance Statement');
      if (Array.isArray(block.customRows)) {
        block.customRows.forEach((row) => {
          if (row.enabled !== false) {
            addFromText(row.label, `${bTitle} Custom Row`);
            addFromText(row.value, `${bTitle} Custom Row`);
          }
        });
      }
    });
  }

  if (Array.isArray(quotation.line_items)) {
    quotation.line_items.forEach((item, idx) => {
      addFromText(item.description, `Line Item #${idx + 1} Description`);
      addFromText(item.row_note, `Line Item #${idx + 1} Row Note`);
      addFromText(item.option_scope_notes, `Line Item #${idx + 1} Scope Note`);
      if (Array.isArray(item.sub_components)) {
        item.sub_components.forEach((sub, sIdx) => {
          addFromText(sub.row_note, `Sub-Component #${idx + 1}.${sIdx + 1} Row Note`);
          addFromText(sub.remark, `Sub-Component #${idx + 1}.${sIdx + 1} Remark`);
        });
      }
    });
  }

  return warnings;
}

/**
 * Renders resolved text as React nodes, highlighting any unrecognized `@typos`
 * in a soft red warning badge on the live Studio preview canvas while keeping print clean.
 */
export function renderResolvedQuotationText(
  text: string | undefined | null,
  ctx: QuotationTokenContext
): React.ReactNode {
  if (!text) return '';
  const resolved = resolveQuotationTokens(text, ctx);
  const unknowns = findUnknownAtTokens(resolved);
  if (unknowns.length === 0) {
    return resolved;
  }

  // Split resolved text around unknown @tokens while preserving prefixes
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(AT_TOKEN_REGEX.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(resolved)) !== null) {
    const fullMatch = match[0];
    const prefix = match[1] || '';
    const tokenName = match[2];
    const matchStart = match.index;

    if (!isWhitelistedAtTag(tokenName)) {
      const beforeText = resolved.slice(lastIndex, matchStart) + prefix;
      if (beforeText) {
        parts.push(beforeText);
      }
      parts.push(
        React.createElement(
          'span',
          {
            key: `unknown_at_${keyCounter++}`,
            title: `Unknown @tag "@${tokenName}". Click to fix or pick a valid @tag.`,
            className:
              'inline-flex items-center px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-300 font-mono text-[0.92em] font-semibold print:bg-transparent print:border-none print:text-inherit print:p-0'
          },
          `@${tokenName}`
        )
      );
      lastIndex = matchStart + fullMatch.length;
    }
  }

  if (lastIndex < resolved.length) {
    parts.push(resolved.slice(lastIndex));
  }

  return parts.length > 0 ? React.createElement(React.Fragment, null, ...parts) : resolved;
}

/**
 * Determines whether a custom row in Terms, Financials, Remittance, or Acceptance
 * should be hidden on the document.
 * By default (Choice A2), empty or omitted tags render '—' and the row stays visible.
 * If `row.hideIfEmpty === true` and the resolved value is empty or '—', the row hides cleanly.
 */
export function shouldHideCustomRow(
  row: { value?: string; enabled?: boolean; hideIfEmpty?: boolean },
  ctx: QuotationTokenContext
): boolean {
  if (row.enabled === false) return true;
  if (!row.hideIfEmpty) return false;
  const resolved = resolveQuotationTokens(row.value, ctx).trim();
  return resolved === '' || resolved === '—';
}
