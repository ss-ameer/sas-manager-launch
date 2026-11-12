import React from 'react';
import {
  Enquiry,
  Quotation,
  WorkspaceDocumentProfile,
  BankAccountProfile,
  DocumentProfileBankAccount,
  Company,
  Contact
} from '../types';
import { amountToWords } from './numberToWords';

/**
 * Detects whether a reference string is a raw internal database or synthetic standalone ID
 * (e.g., "standalone_qdoc_po_1793524721119", "qdoc_pv_...", "quote_...", "enq_...", "fyuDzXjAk6POwdcZHGIb_gap_60", or UUID)
 * that must never be printed on official A4 customer/vendor documents.
 */
export function isSyntheticInternalId(val?: string | null): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (/_gap_\d+$/i.test(trimmed)) return true;
  if (/^[a-zA-Z0-9]{15,}(_[a-zA-Z0-9_]+)?$/.test(trimmed) && !/[-/\s]/.test(trimmed)) return true;
  return /^(standalone_|qdoc_|quote_|enq_|poli_|retli_|bline_|bill_|comp_|prod_|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(
    trimmed
  );
}

/**
 * Formats an enquiry or settlement reference for display on official A4 documents,
 * replacing synthetic internal IDs with clean business labels.
 */
export function formatCleanDocumentEnquiryRef(
  rawRef?: string | null,
  docType?: string | null,
  fallbackCleanRef?: string | null
): string {
  const candidate = (rawRef || '').trim();
  if (candidate && !isSyntheticInternalId(candidate)) {
    return candidate;
  }
  const fallback = (fallbackCleanRef || '').trim();
  if (fallback && !isSyntheticInternalId(fallback)) {
    return fallback;
  }
  // If rawRef or fallback is a synthetic gap ID like "fyuDzXjAk6POwdcZHGIb_gap_60", extract the clean serial number "ENQ #60"
  const gapMatch = (candidate || fallback).match(/_gap_(\d+)$/i);
  if (gapMatch && gapMatch[1]) {
    return `ENQ #${gapMatch[1]}`;
  }
  switch (docType) {
    case 'purchase_order':
      return 'Stock Replenishment';
    case 'payment_voucher':
      return 'Direct Vendor Settlement';
    case 'receipt':
      return 'Direct Account Settlement';
    case 'material_return_note':
    case 'debit_note':
      return 'Vendor Return';
    case 'delivery_note':
      return 'Direct Dispatch';
    default:
      return 'Direct Commercial Offer';
  }
}

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
    key: 'issue_date',
    tag: '@issue_date',
    label: 'Issue Date (Alias)',
    category: 'Dates'
  },
  {
    key: 'valid_until',
    tag: '@valid_until',
    label: 'Valid Until Date',
    category: 'Dates',
    structuralSyncTarget: 'offer.valid_until'
  },
  {
    key: 'validity_days',
    tag: '@validity_days',
    label: 'Validity Days (e.g. 30 Days)',
    category: 'Dates'
  },
  {
    key: 'enquiry_date',
    tag: '@enquiry_date',
    label: 'Enquiry Received Date',
    category: 'Dates'
  },
  {
    key: 'received_date',
    tag: '@received_date',
    label: 'Received Date (Alias)',
    category: 'Dates'
  },
  {
    key: 'logged_date',
    tag: '@logged_date',
    label: 'Enquiry Logged Date',
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
  {
    key: 'next_followup',
    tag: '@next_followup',
    label: 'Next Follow-Up (Alias)',
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
    key: 'contact_designation',
    tag: '@contact_designation',
    label: 'Contact Designation / Role',
    category: 'Client & Project'
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
    key: 'client_city',
    tag: '@client_city',
    label: 'Customer City',
    category: 'Client & Project'
  },
  {
    key: 'client_country',
    tag: '@client_country',
    label: 'Customer Country',
    category: 'Client & Project'
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
    key: 'quote_short_ref',
    tag: '@quote_short_ref',
    label: 'Short Quote Ref (e.g. 2853-201026)',
    category: 'Our Company & Quote'
  },
  {
    key: 'quote_ref_no',
    tag: '@quote_ref_no',
    label: 'Quote Reference No.',
    category: 'Our Company & Quote'
  },
  {
    key: 'company_brand',
    tag: '@company_brand',
    label: 'Company Brand Name (e.g. AVENTURA)',
    category: 'Our Company & Quote'
  },
  {
    key: 'client_code',
    tag: '@client_code',
    label: 'Client Short Code (e.g. VWS / GISCO)',
    category: 'Client & Project'
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
    key: 'delivery_period',
    tag: '@delivery_period',
    label: 'Delivery Period',
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
    key: 'vat_mode',
    tag: '@vat_mode',
    label: 'VAT / Tax Mode',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'remarks',
    tag: '@remarks',
    label: 'Commercial Remarks / Notes',
    category: 'Commercial, Bank & Totals'
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
  {
    key: 'subject',
    tag: '@subject',
    label: 'Subject (Alias)',
    category: 'Our Company & Quote'
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
  },
  {
    key: 'tax_rate',
    tag: '@tax_rate',
    label: 'Tax / VAT Rate (%)',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'branch',
    tag: '@branch',
    label: 'Bank Branch Name / Address',
    category: 'Commercial, Bank & Totals'
  },
  {
    key: 'project_name',
    tag: '@project_name',
    label: 'Project Name / Title',
    category: 'Client & Project'
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
  entity_name: 'client_name',
  attention: 'contact_person',
  attn: 'contact_person',
  contact_person_name: 'contact_person',
  contact_name: 'contact_person',
  concerned_person: 'contact_person',
  contact_designation: 'contact_designation',
  designation: 'contact_designation',
  contact_role: 'contact_designation',
  contact_title: 'contact_designation',
  customer_trn: 'client_trn',
  trn: 'client_trn',
  tax_registration_no: 'client_trn',
  vat_no: 'client_trn',
  customer_phone: 'client_phone',
  contact_phone: 'client_phone',
  phone: 'client_phone',
  mobile: 'client_phone',
  customer_email: 'client_email',
  contact_email: 'client_email',
  email: 'client_email',
  customer_address: 'client_address',
  address: 'client_address',
  registered_address: 'client_address',
  city: 'client_city',
  client_city: 'client_city',
  country: 'client_country',
  client_country: 'client_country',
  customer_reference_code: 'customer_ref',
  rfq_ref: 'customer_ref',
  rfq_no: 'customer_ref',
  quote_ref_no: 'quote_ref',
  formatted_quote_ref: 'quote_ref',
  quote_number: 'quote_ref',
  quote_short_ref: 'quote_short_ref',
  short_ref: 'quote_short_ref',
  quote_short: 'quote_short_ref',
  company_brand: 'company_brand',
  brand: 'company_brand',
  brand_name: 'company_brand',
  client_code: 'client_code',
  company_code: 'client_code',
  client_short_code: 'client_code',
  customer_code: 'client_code',
  revision_number: 'revision_no',
  validity_days: 'quote_validity',
  validity: 'quote_validity',
  offer_validity: 'quote_validity',
  created_at: 'quote_date',
  issue_date: 'quote_date',
  date_issued: 'quote_date',
  received_date: 'enquiry_date',
  date_received: 'enquiry_date',
  rfq_date: 'enquiry_date',
  logged_date: 'logged_date',
  next_followup: 'followup_date',
  next_followup_date: 'followup_date',
  follow_up_date: 'followup_date',
  prepared_by: 'sales_person',
  sales_rep: 'sales_person',
  sales_representative: 'sales_person',
  salesperson: 'sales_person',
  assigned_to: 'sales_person',
  primary_signatory_name: 'signatory_name',
  primary_signatory_title: 'signatory_role',
  signatory_title: 'signatory_role',
  tax_amount: 'vat_amount',
  vat: 'vat_amount',
  vat_rate: 'tax_rate',
  vat_mode: 'vat_mode',
  tax_mode: 'vat_mode',
  remarks: 'remarks',
  custom_notes: 'remarks',
  commercial_remarks: 'remarks',
  notes: 'remarks',
  lead_time: 'delivery_lead_time',
  delivery_period: 'delivery_lead_time',
  delivery_time: 'delivery_lead_time',
  delivery: 'delivery_lead_time',
  freight: 'freight_amount',
  bank_iban: 'iban',
  branch_name: 'branch',
  branch_address: 'branch',
  project_title: 'project_name',
  total: 'grand_total',
  beneficiary: 'account_name',
  account_number: 'account_no',
  swift_code: 'swift',
  subject: 'scope_summary',
  quote_subject: 'scope_summary',
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

const SORTED_WHITELISTED_KEYS = Array.from(WHITELISTED_TOKEN_KEYS).sort(
  (a, b) => b.length - a.length
);

export function normalizeCanonicalTagKey(rawKey: string): string {
  const lower = String(rawKey || '').trim().toLowerCase();
  return TOKEN_ALIAS_MAP[lower] || lower;
}

export function isWhitelistedAtTag(rawKey: string): boolean {
  const lower = String(rawKey || '').trim().toLowerCase();
  return WHITELISTED_TOKEN_KEYS.has(lower);
}

/**
 * Splits a greedy identifier matched after `@` (e.g. `quote_short_ref_` in `@quote_short_ref_@company_brand`
 * or `quote_short_ref_Proposal`) into `{ matchedKey, remainder }` if it matches or starts with a valid @tag.
 */
export function splitKnownAtToken(
  rawIdent: string
): { matchedKey: string; remainder: string } | null {
  if (!rawIdent) return null;
  const lower = rawIdent.toLowerCase();
  if (WHITELISTED_TOKEN_KEYS.has(lower)) {
    return { matchedKey: rawIdent, remainder: '' };
  }
  // 1. Strip trailing underscores (e.g. "quote_short_ref_" right before "@company_brand" or whitespace)
  const strippedTrailing = rawIdent.replace(/_+$/, '');
  if (strippedTrailing && strippedTrailing.length < rawIdent.length) {
    if (WHITELISTED_TOKEN_KEYS.has(strippedTrailing.toLowerCase())) {
      return {
        matchedKey: strippedTrailing,
        remainder: rawIdent.slice(strippedTrailing.length)
      };
    }
  }
  // 2. Match longest whitelisted token followed by '_' (e.g. "@quote_short_ref_Proposal")
  for (const key of SORTED_WHITELISTED_KEYS) {
    if (lower.startsWith(`${key}_`)) {
      return {
        matchedKey: rawIdent.slice(0, key.length),
        remainder: rawIdent.slice(key.length)
      };
    }
  }
  return null;
}

export interface QuotationTokenContext {
  quotation?: Partial<Quotation> | null;
  enquiry?: Partial<Enquiry> | null;
  profile?: Partial<WorkspaceDocumentProfile> | null;
  company?: Partial<Company> | null;
  contact?: Partial<Contact> | null;
  workspaceName?: string | null;
  omittedFields?: Record<string, boolean> | null;
  activeBank?: Partial<BankAccountProfile & DocumentProfileBankAccount> | null;
  amountInWordsText?: string;
  _cachedTokenMap?: Record<string, string>;
}

function formatReadableDate(isoOrDateStr?: string | null): string {
  if (!isoOrDateStr) return '';
  const trimmed = String(isoOrDateStr).trim();
  if (!trimmed || trimmed.startsWith('@') || trimmed.startsWith('{{')) return '';
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
 * Returns a clean string only if `val` does NOT contain unresolved `@tag` or `{{tag}}` tokens,
 * preventing self-referential loops when a field override itself is set to e.g. `@client_phone`.
 * Real email addresses like `info@aventura.ae` (where `@` is preceded by alphanumeric) are preserved.
 */
function nonTagValue(val?: any): string {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str || str === '—' || str.toLowerCase() === 'not registered') return '';
  if (str.startsWith('@') || str.startsWith('{{')) return '';
  if (/(?:^|[\s(\[{"'‘“_\-/.,:;])@[a-zA-Z_][a-zA-Z0-9_]*/.test(str)) return '';
  if (/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/.test(str)) return '';
  return str;
}

/**
 * Combines City and Country cleanly without dangling commas or redundant duplicates like "Dubai, Dubai".
 */
export function combineCityCountry(city?: string | null, country?: string | null): string {
  const cCity = nonTagValue(city).replace(/^[,•\s]+|[,•\s]+$/g, '');
  const cCountry = nonTagValue(country).replace(/^[,•\s]+|[,•\s]+$/g, '');
  if (cCity && cCountry) {
    if (cCity.toLowerCase() === cCountry.toLowerCase()) return cCity;
    if (cCity.toLowerCase().includes(cCountry.toLowerCase())) return cCity;
    if (cCountry.toLowerCase().includes(cCity.toLowerCase())) return cCountry;
    return `${cCity}, ${cCountry}`;
  }
  return cCity || cCountry || '';
}

/**
 * Strips dangling commas, bullet points, and em-dash artifacts from unresolved template text.
 */
export function cleanDanglingSeparators(text: string): string {
  if (!text) return '';
  return text
    .replace(/\s*[,•]\s*—/g, '')
    .replace(/—\s*[,•]\s*/g, '')
    .replace(/,\s*,+/g, ', ')
    .replace(/^[,\s•-]+|[,\s•-]+$/gm, '')
    .trim();
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
 * Builds the complete dictionary of canonical @tag keys -> raw resolved string values.
 *
 * Snapshot-First Resolution Rule:
 * - Always reads non-tag values from `quotation.client_snapshot`, `quotation.sender_snapshot`, `quotation.applied_bank_account`,
 *   and `quotation.*` fields first.
 * - Falls back to live `enquiry`, `company`, `contact`, and `profile` when the quotation is in 'Draft' (not frozen).
 */
export function buildQuotationTokenMap(ctx?: QuotationTokenContext | null): Record<string, string> {
  const safeCtx = (ctx || {}) as QuotationTokenContext;
  if (safeCtx._cachedTokenMap) {
    return safeCtx._cachedTokenMap;
  }

  const q = safeCtx.quotation || ({} as Partial<Quotation>);
  const frozen = isQuotationSnapshotFrozen(q);
  const enq = frozen ? ({} as Partial<Enquiry>) : safeCtx.enquiry || {};
  const prof = frozen ? ({} as Partial<WorkspaceDocumentProfile>) : safeCtx.profile || {};
  const comp = frozen ? ({} as Partial<Company>) : safeCtx.company || {};
  const cont = frozen ? ({} as Partial<Contact>) : safeCtx.contact || {};

  const clientSnap = q.client_snapshot || ({} as any);
  const senderSnap = q.sender_snapshot || ({} as any);

  // Dates
  const rawIssueDate =
    nonTagValue(q.issue_date) ||
    nonTagValue(q.created_at) ||
    nonTagValue((enq as any)?.created_at) ||
    '';
  const quoteDateStr = formatReadableDate(rawIssueDate);

  const vDays = Number(q.validity_days ?? enq.validity_days ?? prof.default_validity_days ?? 30);
  let validUntilStr = formatReadableDate(nonTagValue(q.valid_until));
  if (
    (!validUntilStr || (quoteDateStr && validUntilStr === quoteDateStr && vDays > 0)) &&
    (rawIssueDate || nonTagValue(q.valid_until))
  ) {
    const base = new Date(rawIssueDate || nonTagValue(q.valid_until) || Date.now());
    if (!isNaN(base.getTime()) && Number.isFinite(vDays) && vDays > 0) {
      base.setDate(base.getDate() + vDays);
      validUntilStr = formatReadableDate(base.toISOString());
    }
  }

  const enquiryDateStr = formatReadableDate(
    nonTagValue((clientSnap as any)?.enquiry_date) ||
      nonTagValue((enq as any)?.received_date) ||
      nonTagValue((enq as any)?.date_received) ||
      nonTagValue(enq.enquiry_date) ||
      nonTagValue(enq.logged_date) ||
      nonTagValue((enq as any)?.created_at) ||
      ''
  );
  const loggedDateStr = formatReadableDate(
    nonTagValue(enq.logged_date) ||
      nonTagValue(enq.enquiry_date) ||
      nonTagValue((enq as any)?.received_date) ||
      nonTagValue((enq as any)?.created_at) ||
      ''
  );
  const projectedOrderDateStr = formatReadableDate(
    nonTagValue((clientSnap as any)?.projected_order_date) ||
      nonTagValue(enq.projected_order_date) ||
      ''
  );
  const followupDateStr = formatReadableDate(
    nonTagValue((clientSnap as any)?.next_followup_date) ||
      nonTagValue(enq.next_followup_date) ||
      nonTagValue((enq as any)?.followup_date) ||
      nonTagValue((enq as any)?.nextFollowUpAt) ||
      nonTagValue(comp.next_followup_at) ||
      nonTagValue(comp.nextFollowUpAt) ||
      ''
  );

  // Client & Project
  const clientName =
    nonTagValue(clientSnap.entity_name) ||
    (!frozen
      ? nonTagValue(enq.company_name) ||
        nonTagValue(enq.client_company) ||
        nonTagValue(comp.display_name) ||
        nonTagValue(comp.canonical_name) ||
        nonTagValue(comp.name) ||
        ''
      : '') ||
    '';

  const contactPerson =
    nonTagValue(q.client_contact_person) ||
    nonTagValue(clientSnap.client_contact_person) ||
    nonTagValue(clientSnap.contact_person) ||
    (!frozen
      ? nonTagValue(enq.contact_person_name) ||
        nonTagValue((enq as any)?.contact_name) ||
        nonTagValue(enq.concerned_person) ||
        nonTagValue(cont.full_name) ||
        nonTagValue(cont.name) ||
        ''
      : '') ||
    '';

  const contactDesignation =
    nonTagValue((clientSnap as any)?.contact_designation) ||
    (!frozen
      ? nonTagValue((enq as any)?.contact_designation) ||
        nonTagValue((enq as any)?.designation) ||
        nonTagValue(cont.designation) ||
        nonTagValue(cont.role) ||
        ''
      : '') ||
    '';

  const clientTrn =
    nonTagValue(q.client_trn) ||
    nonTagValue(clientSnap.client_trn) ||
    nonTagValue(clientSnap.trn) ||
    (!frozen
      ? nonTagValue((enq as any)?.client_trn) ||
        nonTagValue((enq as any)?.trn) ||
        nonTagValue((enq as any)?.tax_registration_no) ||
        nonTagValue(comp.trn) ||
        nonTagValue(comp.tax_registration_no) ||
        ''
      : '') ||
    '';

  const firstCompPhone =
    Array.isArray(comp.general_phones) && comp.general_phones.length > 0
      ? comp.general_phones[0]?.value
      : Array.isArray(comp.phones) && comp.phones.length > 0
      ? (comp.phones[0] as any)?.value || (comp.phones[0] as any)?.number
      : '';
  const firstContPhone =
    Array.isArray(cont.phones) && cont.phones.length > 0
      ? (cont.phones[0] as any)?.value || (cont.phones[0] as any)?.number
      : '';

  const clientPhone =
    nonTagValue(q.client_phone) ||
    nonTagValue(clientSnap.client_phone) ||
    nonTagValue(clientSnap.phone) ||
    (!frozen
      ? nonTagValue((enq as any)?.contact_phone) ||
        nonTagValue((enq as any)?.phone) ||
        nonTagValue((enq as any)?.client_phone) ||
        nonTagValue(cont.mobile) ||
        nonTagValue(cont.phone) ||
        nonTagValue(cont.landline) ||
        nonTagValue(firstContPhone) ||
        nonTagValue(comp.phone) ||
        nonTagValue(comp.general_phone) ||
        nonTagValue(firstCompPhone) ||
        ''
      : '') ||
    '';

  const firstCompEmail =
    Array.isArray(comp.general_emails) && comp.general_emails.length > 0
      ? comp.general_emails[0]?.value
      : Array.isArray(comp.emails) && comp.emails.length > 0
      ? (comp.emails[0] as any)?.value || (comp.emails[0] as any)?.email
      : '';
  const firstContEmail =
    Array.isArray(cont.emails) && cont.emails.length > 0
      ? (cont.emails[0] as any)?.value || (cont.emails[0] as any)?.email
      : '';

  const clientEmail =
    nonTagValue(q.client_email) ||
    nonTagValue(clientSnap.client_email) ||
    nonTagValue(clientSnap.email) ||
    (!frozen
      ? nonTagValue((enq as any)?.contact_email) ||
        nonTagValue((enq as any)?.email) ||
        nonTagValue((enq as any)?.client_email) ||
        nonTagValue(cont.email) ||
        nonTagValue(firstContEmail) ||
        nonTagValue(comp.email) ||
        nonTagValue(comp.general_email) ||
        nonTagValue(firstCompEmail) ||
        ''
      : '') ||
    '';

  const rawCity =
    nonTagValue((clientSnap as any)?.city) ||
    (!frozen ? nonTagValue((enq as any)?.city) || nonTagValue(comp.city) : '') ||
    '';
  const rawCountry =
    nonTagValue((clientSnap as any)?.country) ||
    (!frozen ? nonTagValue((enq as any)?.country) || nonTagValue(comp.country) : '') ||
    '';
  const combinedCityCountry = combineCityCountry(rawCity, rawCountry);

  const cleanAddressCandidate =
    nonTagValue(q.client_address) ||
    nonTagValue(clientSnap.client_address) ||
    nonTagValue(clientSnap.address) ||
    (!frozen
      ? nonTagValue((enq as any)?.client_address) ||
        nonTagValue((enq as any)?.address) ||
        nonTagValue(comp.address) ||
        nonTagValue(enq.project_location)
      : '') ||
    '';

  const clientAddress = cleanAddressCandidate || combinedCityCountry || '';

  const projectLocation =
    nonTagValue((clientSnap as any)?.project_location) ||
    (!frozen ? nonTagValue(enq.project_location) : '') ||
    clientAddress ||
    '';

  const projectNumber =
    nonTagValue((clientSnap as any)?.project_number) ||
    (!frozen ? nonTagValue(enq.project_number) : '') ||
    '';

  const projectName =
    nonTagValue((clientSnap as any)?.project_name) ||
    (!frozen
      ? nonTagValue((enq as any)?.project_name) || nonTagValue((enq as any)?.project_title)
      : '') ||
    nonTagValue(q.subject) ||
    (!frozen ? nonTagValue(enq.subject) : '') ||
    '';

  const customerRef =
    nonTagValue((clientSnap as any)?.customer_reference_code) ||
    (!frozen ? nonTagValue(enq.customer_reference_code) : '') ||
    '';

  const rawEnquiryRef =
    nonTagValue((clientSnap as any)?.enquiry_ref) ||
    (!frozen
      ? nonTagValue(enq.quote_ref_no) ||
        nonTagValue(enq.customer_reference_code) ||
        (enq.sn ? `ENQ-${String(enq.sn).padStart(4, '0')}` : '') ||
        nonTagValue(enq.id) ||
        ''
      : '') ||
    nonTagValue(q.quote_number) ||
    '';
  const enquiryRef = formatCleanDocumentEnquiryRef(
    rawEnquiryRef,
    q.document_type,
    q.purchase_order_metadata?.requisition_ref ||
      q.payment_voucher_metadata?.vendor_invoice_no ||
      q.vendor_return_metadata?.original_po_ref ||
      q.receipt_metadata?.settlement_for_ref ||
      q.formatted_quote_ref
  );

  // Our Company & Quote
  const quoteRef = nonTagValue(q.formatted_quote_ref) || nonTagValue(q.quote_number) || '';
  const revisionNo =
    typeof q.revision_number === 'number' ? `R${q.revision_number}` : 'R1';

  let quoteShortRef = quoteRef;
  if (quoteShortRef.includes('/')) {
    quoteShortRef = quoteShortRef.split('/').pop() || quoteShortRef;
  }
  quoteShortRef = quoteShortRef.trim();

  const ourCompany =
    nonTagValue(q.companyNameOverride) ||
    nonTagValue(q.header_config?.companyNameOverride) ||
    (nonTagValue(senderSnap.entity_name) !== 'Commercial Entity LLC'
      ? nonTagValue(senderSnap.entity_name)
      : '') ||
    (!frozen
      ? nonTagValue(prof.legal_entity_name) || nonTagValue((prof as any)?.company_name) || ''
      : '') ||
    nonTagValue(senderSnap.entity_name) ||
    '';

  const quotePrefixBrand =
    quoteRef.includes('/') && !/^(?:QT|DO|PO|REC|PV|MRN|DN)-/i.test(quoteRef.split('/')[0] || '')
      ? quoteRef.split('/')[0].trim()
      : '';

  const rawBrandCandidate =
    nonTagValue(q.companyNameOverride) ||
    nonTagValue(q.header_config?.companyNameOverride) ||
    nonTagValue(prof.profile_name) ||
    nonTagValue(prof.legal_entity_name) ||
    nonTagValue((prof as any)?.company_name) ||
    (nonTagValue(senderSnap.entity_name) &&
    nonTagValue(senderSnap.entity_name) !== 'Commercial Entity LLC'
      ? nonTagValue(senderSnap.entity_name)
      : '') ||
    quotePrefixBrand ||
    nonTagValue(safeCtx.workspaceName) ||
    'AVENTURA';

  const companyBrand =
    rawBrandCandidate
      .replace(
        /\s*\(?(?:FZE|FZC|LLC|L\.L\.C\.?|PJSC|W\.L\.L\.?|EST\.?|COMPONENTS|GENERAL\s+TRADING|TRADING|CO\.?)\)?.*$/i,
        ''
      )
      .trim() ||
    rawBrandCandidate.split(' ')[0] ||
    'AVENTURA';

  let clientCode =
    nonTagValue((enq as any)?.client_code) ||
    nonTagValue((enq as any)?.company_code) ||
    nonTagValue((enq as any)?.client_short_code) ||
    (!frozen ? nonTagValue(comp.company_code) : '') ||
    '';
  if (!clientCode && quoteRef.includes('/')) {
    const parts = quoteRef.split('/').filter(Boolean);
    if (parts.length >= 4) {
      clientCode = parts[2].trim();
    }
  }
  if (!clientCode && clientName) {
    const parenMatch = clientName.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1] && parenMatch[1].length <= 8) {
      clientCode = parenMatch[1].trim();
    } else {
      clientCode = clientName.split(/[\s,.-]+/)[0] || '';
    }
  }

  const ourTrn =
    nonTagValue(senderSnap.trn) ||
    (!frozen ? nonTagValue(prof.trn) || '' : '') ||
    '';

  const ourPhone =
    nonTagValue(senderSnap.phone) ||
    (!frozen ? nonTagValue(prof.phone) || '' : '') ||
    '';

  const ourEmail =
    nonTagValue(senderSnap.email) ||
    (!frozen ? nonTagValue(prof.email) || '' : '') ||
    '';

  const ourAddress =
    nonTagValue(senderSnap.address) ||
    (!frozen
      ? [prof.address_line_1, prof.address_line_2, prof.city, prof.country]
          .map((p) => nonTagValue(p))
          .filter(Boolean)
          .join(', ')
      : '') ||
    '';

  const salesPerson =
    nonTagValue(q.prepared_by) ||
    nonTagValue(senderSnap.contact_person) ||
    (!frozen
      ? nonTagValue(enq.sales_representative) ||
        nonTagValue(enq.sales_person) ||
        nonTagValue(enq.salesperson) ||
        nonTagValue(enq.assigned_to) ||
        ''
      : '') ||
    '';

  const signatoryName =
    nonTagValue(q.primary_signatory_name) ||
    nonTagValue(q.signatories?.[0]?.name) ||
    salesPerson ||
    '';

  const signatoryRole =
    nonTagValue(q.primary_signatory_title) ||
    nonTagValue(q.signatories?.[0]?.designation) ||
    '';

  // Commercial, Bank & Totals
  const priceBasis =
    nonTagValue(q.price_basis) ||
    (!frozen ? nonTagValue(enq.price_basis) || nonTagValue(prof.default_price_basis) || '' : '') ||
    '';

  const paymentTerms =
    nonTagValue(q.payment_terms) ||
    (!frozen ? nonTagValue(enq.payment_terms) || '' : '') ||
    nonTagValue(q.applied_terms) ||
    (!frozen ? nonTagValue(prof.default_payment_terms) || '' : '') ||
    '';

  const lineItems = Array.isArray(q.line_items) ? q.line_items : [];
  const firstLeadTime =
    nonTagValue(q.delivery_period) ||
    (!frozen ? nonTagValue(enq.delivery_period) || '' : '') ||
    lineItems
      .map((it) => nonTagValue(it?.availability || (it as any)?.delivery_lead_time))
      .find(Boolean) ||
    '';

  const validityDaysNum =
    q.validity_days ?? (!frozen ? enq.validity_days ?? prof.default_validity_days : undefined);
  const quoteValidity =
    validityDaysNum !== undefined && validityDaysNum !== null
      ? `${validityDaysNum} Days`
      : '';

  const effectiveTaxMode = q.tax_mode || (!frozen ? enq.tax_mode : undefined) || 'taxes_extra';
  const taxRateNum = Number(q.tax_rate_percent ?? (!frozen ? prof.default_tax_rate : 5) ?? 5);
  const vatModeStr =
    effectiveTaxMode === 'tax_exempt'
      ? 'Zero-Rated / Tax Exempt (0%)'
      : effectiveTaxMode === 'vat_excluded_extra'
      ? `VAT Excluded (${taxRateNum}% Extra as Applicable)`
      : effectiveTaxMode === 'vat_hidden'
      ? 'VAT Hidden'
      : effectiveTaxMode === 'tax_calculated'
      ? `VAT Inclusive (${taxRateNum}%)`
      : `${taxRateNum}% Standard VAT`;

  const remarksVal =
    nonTagValue(q.custom_notes) ||
    (!frozen
      ? nonTagValue((enq as any)?.commercial_remarks) ||
        nonTagValue((enq as any)?.custom_notes) ||
        nonTagValue(enq.remarks) ||
        ''
      : '') ||
    '';

  const termsBlock = Array.isArray(q.layout_blocks)
    ? q.layout_blocks.find((b) => b.id === 'terms' || b.type === 'terms')
    : undefined;
  const warrantyCustomRow = termsBlock?.customRows?.find((r) =>
    /warranty/i.test(String(r.label || ''))
  );
  const warrantyPeriod =
    nonTagValue(warrantyCustomRow?.value) || '12 Months Standard Manufacturer Warranty';

  const currency =
    q.receipt_metadata?.currency || q.currency || (!frozen ? enq.currency : '') || 'AED';
  const rawSubtotal = (q as any).financial_totals?.subtotal ?? q.subtotal ?? 0;
  const rawTaxAmount = (q as any).financial_totals?.tax_amount ?? q.tax_amount ?? 0;
  const rawGrandTotal = (q as any).financial_totals?.grand_total ?? q.grand_total ?? 0;
  const subtotal = `${currency} ${formatAmount(rawSubtotal)}`;
  const freightAmount = `${currency} ${formatAmount(q.freight_amount)}`;
  const vatAmount = `${currency} ${formatAmount(rawTaxAmount)}`;
  const grandTotal = `${currency} ${formatAmount(rawGrandTotal)}`;
  const taxRateStr = effectiveTaxMode === 'tax_exempt' ? '0%' : `${taxRateNum}%`;

  const docType = q.document_type || 'quotation';
  const delMeta = q.delivery_metadata || {};
  const poMeta = q.purchase_order_metadata || {};
  const recMeta = q.receipt_metadata || {};
  const pvMeta = q.payment_voucher_metadata || {};
  const retMeta = q.vendor_return_metadata || {};

  const pvAllocSum = Array.isArray(pvMeta.allocated_bills)
    ? pvMeta.allocated_bills.reduce((s, a) => s + (Number(a.paid_this_voucher) || 0), 0)
    : Array.isArray(pvMeta.allocations)
    ? pvMeta.allocations.reduce((s, a) => s + (Number(a.paid_this_voucher) || 0), 0)
    : 0;

  const effectiveAmountForWords =
    docType === 'receipt' && recMeta.amount_received !== undefined
      ? Number(recMeta.amount_received) || 0
      : docType === 'payment_voucher'
      ? Number(pvMeta.amount_paid ?? (pvAllocSum > 0 ? pvAllocSum : rawGrandTotal)) || 0
      : Number(rawGrandTotal) || 0;

  const amountInWords =
    safeCtx.amountInWordsText ||
    amountToWords(effectiveAmountForWords, currency) ||
    '';

  // Bank resolution (snapshot-first)
  const bankSnap: any =
    safeCtx.activeBank ||
    q.selectedBank ||
    q.selected_bank ||
    q.applied_bank_account ||
    (!frozen
      ? prof.bank_accounts?.find((b) => b.is_default) || prof.bank_accounts?.[0]
      : null) ||
    {};

  const bankName = nonTagValue(bankSnap.bankName) || nonTagValue(bankSnap.bank_name) || '';
  const accountName =
    nonTagValue(bankSnap.beneficiaryName) ||
    nonTagValue(bankSnap.beneficiary_name) ||
    nonTagValue(bankSnap.account_name) ||
    ourCompany ||
    '';
  const accountNo = nonTagValue(bankSnap.accountNumber) || nonTagValue(bankSnap.account_number) || '';
  const iban = nonTagValue(bankSnap.iban) || '';
  const swift =
    nonTagValue(bankSnap.swiftCode) ||
    nonTagValue(bankSnap.swift_code) ||
    nonTagValue(bankSnap.swift) ||
    '';
  const branchVal =
    nonTagValue(bankSnap.branchName) ||
    nonTagValue(bankSnap.branch_address) ||
    nonTagValue(bankSnap.branch) ||
    '';

  const itemCount = String(
    lineItems.filter((it) => !(it as any)?.is_section_header).length
  );
  const scopeSummary =
    nonTagValue(q.subject) || (!frozen ? nonTagValue(enq.subject) || '' : '') || '';

  // Delivery Note tokens
  const deliveryRef =
    nonTagValue(delMeta.delivery_ref) || (docType === 'delivery_note' ? quoteRef : '');
  const deliveryDate = formatReadableDate(nonTagValue(delMeta.delivery_date) || rawIssueDate);
  const vehicleNo = nonTagValue(delMeta.vehicle_plate_no) || '';
  const driverName = nonTagValue(delMeta.driver_name) || '';
  const siteAddress =
    nonTagValue(delMeta.delivery_address) ||
    nonTagValue(poMeta.shipping_address) ||
    projectLocation ||
    clientAddress ||
    '';
  const customerPo =
    nonTagValue(delMeta.customer_po_no) ||
    customerRef ||
    '';

  // Purchase Order tokens
  const poRef =
    nonTagValue(poMeta.po_ref) ||
    nonTagValue(pvMeta.linked_po_ref) ||
    nonTagValue(retMeta.original_po_ref) ||
    (docType === 'purchase_order' ? quoteRef : '');
  const poDate = formatReadableDate(nonTagValue(poMeta.po_date) || rawIssueDate);
  const supplierName =
    nonTagValue(poMeta.supplier_name) ||
    nonTagValue(pvMeta.paid_to_vendor_name) ||
    nonTagValue(retMeta.vendor_name) ||
    (docType === 'purchase_order' ||
    docType === 'payment_voucher' ||
    docType === 'material_return_note' ||
    docType === 'debit_note'
      ? clientName
      : '');
  const supplierTaxId =
    nonTagValue(poMeta.supplier_tax_id) ||
    nonTagValue(poMeta.supplier_trn) ||
    nonTagValue(pvMeta.vendor_trn) ||
    nonTagValue(retMeta.vendor_trn) ||
    (docType === 'purchase_order' ? clientTrn : '');
  const incotermsVal = nonTagValue(poMeta.incoterms) || priceBasis || '';

  // Receipt Voucher & Outbound Payment Voucher tokens
  const receiptRef =
    nonTagValue(recMeta.receipt_ref) || (docType === 'receipt' ? quoteRef : '');
  const paymentModeVal =
    nonTagValue(docType === 'payment_voucher' ? pvMeta.payment_method : recMeta.payment_method) || '';
  const bankRefVal =
    nonTagValue(
      docType === 'payment_voucher'
        ? pvMeta.bank_txn_ref || pvMeta.cheque_no
        : recMeta.bank_txn_ref || recMeta.cheque_no
    ) || '';
  const amountPaidRaw =
    docType === 'payment_voucher'
      ? pvMeta.amount_paid ?? (pvAllocSum > 0 ? pvAllocSum : q.grand_total)
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
              (Number(pvMeta.amount_paid ?? pvAllocSum) || 0)
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
  const pvRefVal =
    nonTagValue(pvMeta.pv_ref) || (docType === 'payment_voucher' ? quoteRef : '');
  const pvDateVal = formatReadableDate(nonTagValue(pvMeta.pv_date) || rawIssueDate);
  const benBankSnap =
    pvMeta.beneficiary_bank_details ||
    poMeta.beneficiary_bank_details ||
    {};
  const beneficiaryNameVal =
    nonTagValue(benBankSnap.beneficiary_name) ||
    nonTagValue(pvMeta.paid_to_vendor_name) ||
    nonTagValue(poMeta.supplier_name) ||
    accountName ||
    '';
  const beneficiaryBankVal = nonTagValue(benBankSnap.bank_name) || bankName || '';
  const beneficiaryIbanVal = nonTagValue(benBankSnap.iban) || iban || '';
  const beneficiarySwiftVal = nonTagValue(benBankSnap.swift_code) || swift || '';
  const vendorInvoiceNoVal =
    nonTagValue(pvMeta.vendor_invoice_no) ||
    nonTagValue(retMeta.vendor_invoice_no) ||
    (Array.isArray(pvMeta.allocations) && pvMeta.allocations.length > 0
      ? pvMeta.allocations.map((a) => nonTagValue(a.vendor_invoice_no)).filter(Boolean).join(', ')
      : '');
  const mrnRefVal =
    nonTagValue(retMeta.return_ref) || (docType === 'material_return_note' ? quoteRef : '');
  const dnRefVal =
    nonTagValue(retMeta.return_ref) || (docType === 'debit_note' ? quoteRef : '');
  const returnReasonVal = nonTagValue(retMeta.return_reason) || '';
  const originalPoRefVal =
    nonTagValue(retMeta.original_po_ref) || nonTagValue(pvMeta.linked_po_ref) || poRef || '';

  const builtMap: Record<string, string> = {
    quote_date: String(quoteDateStr || '').trim(),
    issue_date: String(quoteDateStr || '').trim(),
    valid_until: String(validUntilStr || '').trim(),
    validity_days: String(quoteValidity || '').trim(),
    enquiry_date: String(enquiryDateStr || '').trim(),
    received_date: String(enquiryDateStr || '').trim(),
    logged_date: String(loggedDateStr || enquiryDateStr || '').trim(),
    projected_order_date: String(projectedOrderDateStr || '').trim(),
    followup_date: String(followupDateStr || '').trim(),
    next_followup: String(followupDateStr || '').trim(),

    client_name: String(clientName || '').trim(),
    contact_person: String(contactPerson || '').trim(),
    contact_designation: String(contactDesignation || '').trim(),
    client_trn: String(clientTrn || '').trim(),
    client_phone: String(clientPhone || '').trim(),
    client_email: String(clientEmail || '').trim(),
    client_address: String(clientAddress || '').trim(),
    client_city: String(rawCity || '').trim(),
    client_country: String(rawCountry || '').trim(),
    client_code: String(clientCode || '').trim(),
    project_location: String(projectLocation || '').trim(),
    project_number: String(projectNumber || '').trim(),
    project_name: String(projectName || '').trim(),
    customer_ref: String(customerRef || '').trim(),
    enquiry_ref: String(enquiryRef || '').trim(),

    quote_ref: String(quoteRef || '').trim(),
    quote_ref_no: String(quoteRef || '').trim(),
    quote_short_ref: String(quoteShortRef || '').trim(),
    company_brand: String(companyBrand || '').trim(),
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
    delivery_period: String(firstLeadTime || '').trim(),
    quote_validity: String(quoteValidity || '').trim(),
    vat_mode: String(vatModeStr || '').trim(),
    remarks: String(remarksVal || '').trim(),
    warranty_period: String(warrantyPeriod || '').trim(),
    currency: String(currency || '').trim(),
    subtotal: String(subtotal || '').trim(),
    freight_amount: String(freightAmount || '').trim(),
    vat_amount: String(vatAmount || '').trim(),
    tax_rate: String(taxRateStr || '').trim(),
    grand_total: String(grandTotal || '').trim(),
    amount_in_words: String(amountInWords || '').trim(),
    bank_name: String(bankName || '').trim(),
    account_name: String(accountName || '').trim(),
    account_no: String(accountNo || '').trim(),
    iban: String(iban || '').trim(),
    swift: String(swift || '').trim(),
    branch: String(branchVal || '').trim(),
    item_count: String(itemCount || '').trim(),
    scope_summary: String(scopeSummary || '').trim(),
    subject: String(scopeSummary || '').trim(),

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

  if (ctx && typeof ctx === 'object') {
    try {
      ctx._cachedTokenMap = builtMap;
    } catch {
      // Ignore if context object is frozen
    }
  }
  return builtMap;
}

/**
 * Resolves a single canonical tag key.
 */
export function resolveSingleTagValue(
  rawKey: string,
  ctx?: QuotationTokenContext | null,
  precomputedMap?: Record<string, string>
): string {
  const safeCtx = (ctx || {}) as QuotationTokenContext;
  const canonical = normalizeCanonicalTagKey(rawKey);
  if (isFieldOmitted(canonical, safeCtx.omittedFields ?? safeCtx.quotation?.omitted_fields)) {
    return '—';
  }
  const map = precomputedMap || safeCtx._cachedTokenMap || buildQuotationTokenMap(safeCtx);
  const val = map[canonical];
  if (val === undefined || val === null || String(val).trim() === '') {
    return '—';
  }
  return String(val).trim();
}

/**
 * Direct `@identifier` candidate matcher (no consuming prefix group!),
 * allowing chained tokens like `@quote_short_ref_@company_brand` to be matched consecutively.
 * Inside callbacks, we inspect `prevChar = fullStr[offset - 1]` to ensure we never touch email addresses.
 */
const RAW_AT_CANDIDATE_REGEX = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
const MUSTACHE_TOKEN_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/**
 * Resolves all whitelisted `@tag` and `{{tag}}` tokens in `text`.
 * - Supports chained and underscore-delimited tokens like `@quote_short_ref_@company_brand`.
 * - Empty or omitted whitelisted tags resolve to `options?.emptyFallback ?? ''` (default `''`),
 *   so empty tags never leave literal `@tag` text or spurious `'—'` placeholders on the document.
 * - Email addresses (`sales@aventura.ae`, `info@client_name.com`) are never touched.
 * - Unknown `@typos` are left intact so they can be highlighted in preview and flagged before print.
 */
export function resolveQuotationTokens(
  text: string | undefined | null,
  ctx?: QuotationTokenContext | null,
  options?: { emptyFallback?: string }
): string {
  if (!text) return '';
  const raw = String(text);
  if (!raw.includes('@') && !raw.includes('{{')) return raw;

  const emptyFallback = options?.emptyFallback ?? '';
  const safeCtx = (ctx || {}) as QuotationTokenContext;
  const map = safeCtx._cachedTokenMap || buildQuotationTokenMap(safeCtx);
  const omitted = safeCtx.omittedFields ?? safeCtx.quotation?.omitted_fields;

  // 1. Resolve {{tag_name}} aliases
  let output = raw.replace(MUSTACHE_TOKEN_REGEX, (fullMatch, tokenName: string) => {
    const split = splitKnownAtToken(tokenName);
    if (!split) return fullMatch;
    const canonical = normalizeCanonicalTagKey(split.matchedKey);
    if (isFieldOmitted(canonical, omitted)) return `${emptyFallback}${split.remainder}`;
    const val = map[canonical];
    const resolved = val && String(val).trim() !== '' ? String(val).trim() : emptyFallback;
    return `${resolved}${split.remainder}`;
  });

  // 2. Resolve @tag_name tokens (email-safe + chained underscore support)
  output = output.replace(
    RAW_AT_CANDIDATE_REGEX,
    (fullMatch, rawIdent: string, offset: number, fullStr: string) => {
      const prevChar = offset > 0 ? fullStr[offset - 1] : '';
      // Never match when preceded by alphanumeric (protects email addresses like sales@aventura.ae)
      if (prevChar && /[a-zA-Z0-9]/.test(prevChar)) {
        return fullMatch;
      }

      const split = splitKnownAtToken(rawIdent);
      if (!split) {
        return fullMatch; // Leave unknown @typo intact
      }

      const canonical = normalizeCanonicalTagKey(split.matchedKey);
      if (isFieldOmitted(canonical, omitted)) {
        return canonical === 'client_address'
          ? split.remainder
          : `${emptyFallback}${split.remainder}`;
      }

      const val = map[canonical];
      if (
        canonical === 'client_address' &&
        (!val || String(val).trim() === '' || String(val).trim().startsWith('@'))
      ) {
        return split.remainder;
      }

      const resolved = val && String(val).trim() !== '' ? String(val).trim() : emptyFallback;
      return `${resolved}${split.remainder}`;
    }
  );

  return cleanDanglingSeparators(output);
}

/**
 * Resolves a customizable PDF filename pattern (e.g. "@quote_short_ref_@company_brand Proposal for @subject. @client_code")
 * into a safe, valid, and clean filename without illegal filesystem characters.
 */
export function resolvePdfFilename(
  pattern: string | undefined | null,
  ctx?: QuotationTokenContext | null
): string {
  const safeCtx = (ctx || {}) as QuotationTokenContext;
  const map = safeCtx._cachedTokenMap || buildQuotationTokenMap(safeCtx);
  const rawPattern =
    (pattern || '').trim() ||
    '@quote_short_ref_@company_brand Proposal for @subject. @client_code';

  // 1. Resolve @tags (including underscore-chained tags like @quote_short_ref_@company_brand)
  let resolved = rawPattern.replace(
    RAW_AT_CANDIDATE_REGEX,
    (fullMatch, rawIdent: string, offset: number, fullStr: string) => {
      const prevChar = offset > 0 ? fullStr[offset - 1] : '';
      if (prevChar && /[a-zA-Z0-9]/.test(prevChar)) {
        return fullMatch;
      }
      const split = splitKnownAtToken(rawIdent);
      if (!split) {
        return '';
      }
      const canonical = normalizeCanonicalTagKey(split.matchedKey);
      const val = map[canonical];
      if (
        val !== undefined &&
        val !== null &&
        String(val).trim() !== '' &&
        String(val).trim() !== '—'
      ) {
        return `${String(val).trim()}${split.remainder}`;
      }
      return split.remainder;
    }
  );

  // 2. Resolve {{tags}}
  resolved = resolved.replace(
    MUSTACHE_TOKEN_REGEX,
    (_fullMatch, tokenName: string) => {
      const split = splitKnownAtToken(tokenName);
      const canonical = normalizeCanonicalTagKey(split ? split.matchedKey : tokenName);
      const remainder = split ? split.remainder : '';
      const val = map[canonical];
      if (
        val !== undefined &&
        val !== null &&
        String(val).trim() !== '' &&
        String(val).trim() !== '—'
      ) {
        return `${String(val).trim()}${remainder}`;
      }
      return remainder;
    }
  );

  // 3. Strip illegal filename characters: [/\\:*?"<>|]
  resolved = resolved
    .replace(/[/\\:*?"<>|]/g, '-')
    // Collapse multiple underscores or spaces or hyphens
    .replace(/\s+/g, ' ')
    .replace(/_{2,}/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/\s*([._-])\s*/g, '$1')
    .trim();

  // Strip leading and trailing punctuation
  resolved = resolved.replace(/^[._\-\s]+|[._\-\s]+$/g, '');

  return resolved || 'Quotation_Proposal';
}

/**
 * Finds all unrecognized `@tokens` in a single string (ignoring valid whitelisted tags, chained tags, and emails).
 */
export function findUnknownAtTokens(text: string | undefined | null): string[] {
  if (!text) return [];
  const raw = String(text);
  if (!raw.includes('@')) return [];

  const found: string[] = [];
  const regex = new RegExp(RAW_AT_CANDIDATE_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(raw)) !== null) {
    const rawIdent = match[1];
    const offset = match.index;
    const prevChar = offset > 0 ? raw[offset - 1] : '';
    const afterStr = raw.slice(offset + match[0].length);

    // Skip if preceded by alphanumeric (email local part like sales@aventura.ae)
    if (prevChar && /[a-zA-Z0-9]/.test(prevChar)) {
      continue;
    }
    // Skip if followed immediately by domain TLD like .com / .ae when preceded by email punctuation
    if (prevChar && /[._+-]/.test(prevChar) && /^\.[a-zA-Z]{2,}\b/.test(afterStr)) {
      continue;
    }

    if (rawIdent && !splitKnownAtToken(rawIdent)) {
      const cleanUnknown = rawIdent.replace(/_+$/, '') || rawIdent;
      const tagWithAt = `@${cleanUnknown}`;
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

  addFromText(quotation.pdf_filename_pattern, 'PDF Export Filename Preset');
  addFromText(quotation.subject, 'Quotation Subject');
  addFromText(quotation.client_snapshot?.entity_name, 'Client Name');
  addFromText(quotation.client_contact_person, 'Attention To (Contact Person)');
  addFromText(quotation.client_address, 'Client Registered Address');
  addFromText(quotation.client_trn, 'Client TRN');
  addFromText(quotation.client_phone, 'Client Phone');
  addFromText(quotation.client_email, 'Client Email');
  addFromText(quotation.price_basis, 'Price Basis');
  addFromText(quotation.delivery_period, 'Delivery Period');
  addFromText(quotation.payment_terms, 'Payment Terms');
  addFromText(quotation.custom_notes, 'Terms & Clauses / Cover Note');
  addFromText(quotation.footer_config?.forAndOnBehalfText, 'Signatory Header');
  addFromText(quotation.footer_config?.customDisclaimer, 'Footer Disclaimer');

  if (Array.isArray(quotation.recipient_config?.recipientFieldRows)) {
    quotation.recipient_config!.recipientFieldRows!.forEach((row) => {
      if (row.enabled !== false) {
        addFromText(row.label, 'Recipient Card Custom Row');
        addFromText(row.value, 'Recipient Card Custom Row');
      }
    });
  }

  if (Array.isArray(quotation.recipient_config?.offerFieldRows)) {
    quotation.recipient_config!.offerFieldRows!.forEach((row) => {
      if (row.enabled !== false) {
        addFromText(row.label, 'Offer Card Custom Row');
        addFromText(row.value, 'Offer Card Custom Row');
      }
    });
  }

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
  ctx: QuotationTokenContext,
  options?: { emptyFallback?: string }
): React.ReactNode {
  if (!text) return '';
  const resolved = resolveQuotationTokens(text, ctx, options);
  const unknowns = findUnknownAtTokens(resolved);
  if (unknowns.length === 0) {
    return resolved;
  }

  // Split resolved text around unknown @tokens
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(RAW_AT_CANDIDATE_REGEX.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyCounter = 0;

  while ((match = regex.exec(resolved)) !== null) {
    const fullMatch = match[0];
    const rawIdent = match[1];
    const matchStart = match.index;
    const prevChar = matchStart > 0 ? resolved[matchStart - 1] : '';

    if (prevChar && /[a-zA-Z0-9]/.test(prevChar)) {
      continue;
    }

    if (!splitKnownAtToken(rawIdent)) {
      const beforeText = resolved.slice(lastIndex, matchStart);
      if (beforeText) {
        parts.push(beforeText);
      }
      parts.push(
        React.createElement(
          'span',
          {
            key: `unknown_at_${keyCounter++}`,
            title: `Unknown @tag "@${rawIdent}". Click to fix or pick a valid @tag.`,
            className:
              'inline-flex items-center px-1 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-300 font-mono text-[0.92em] font-semibold print:bg-transparent print:border-none print:text-inherit print:p-0'
          },
          `@${rawIdent}`
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

