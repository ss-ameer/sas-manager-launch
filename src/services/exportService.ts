import { Enquiry, Company, Contact, Salesperson } from '../types';
import { BRAND_CONFIG } from '../config';

/**
 * Escapes a cell value for RFC 4180 compliant CSV output.
 * Encapsulates in double quotes, doubles any internal quotes,
 * and neutralizes spreadsheet formula injection (=, +, -, @).
 */
export function sanitizeCsvValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  
  let str = String(val);
  
  // Guard against CSV formula injection in spreadsheet software (Excel, Calc)
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // Replace double quotes with doubled double quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
}

export interface EnquiryExportOptions {
  enquiries: Enquiry[];
  totalAvailableCount?: number;
  companies: Company[];
  contacts?: Contact[];
  salespersons?: Salesperson[];
  scope?: 'filtered' | 'all';
  mode?: 'flattened' | 'summary';
  filterLabels?: string[];
  searchQuery?: string;
  customFilename?: string;
}

export interface EnquiryExportResult {
  success: boolean;
  filename: string;
  enquiriesCount: number;
  lineItemsCount: number;
  totalValueAed: number;
}

/**
 * Exports enquiries to a standardized, clean CSV file with UTF-8 BOM encoding.
 */
export function exportEnquiriesToCSV({
  enquiries,
  totalAvailableCount,
  companies,
  contacts = [],
  salespersons = [],
  scope = 'filtered',
  mode = 'flattened',
  filterLabels = [],
  searchQuery,
  customFilename
}: EnquiryExportOptions): EnquiryExportResult {
  if (!enquiries || enquiries.length === 0) {
    throw new Error('No enquiry records available to export.');
  }

  // Pre-index companies for O(1) lookup
  const companyMap = new Map<string, Company>();
  companies.forEach((c) => {
    if (c.id) companyMap.set(c.id, c);
  });

  // Pre-index salespersons for clean name resolution
  const salespersonMap = new Map<string, string>();
  salespersons.forEach((sp) => {
    if (sp.id) salespersonMap.set(sp.id, sp.full_name);
    if (sp.initials) salespersonMap.set(sp.initials, sp.full_name);
  });

  // Pre-index primary contacts per company
  const primaryContactMap = new Map<string, Contact>();
  contacts.forEach((ct) => {
    if (ct.is_deleted || (ct as any).deleted || !ct.company_id) return;
    const existing = primaryContactMap.get(ct.company_id);
    if (!existing || ct.is_primary) {
      primaryContactMap.set(ct.company_id, ct);
    }
  });

  const isFlattened = mode === 'flattened';

  // Define comprehensive CSV Headers
  const headers = isFlattened
    ? [
        'S/N',
        'Quote Ref No',
        'Revision No',
        'Enquiry Date',
        'Target Order Date',
        'Next Followup Date',
        'Client Company',
        'Company Phone',
        'Primary Contact Name',
        'Primary Contact Email',
        'Primary Contact Phone',
        'Country',
        'Project Location',
        'Sales Person',
        'Status',
        'Enquiry Source',
        'Subject / Title',
        'Client Ref Code',
        'Item #',
        'Product Type',
        'Item Description',
        'Qty',
        'Unit',
        'Unit Price (AED)',
        'Item Total (AED)',
        'Lead Time Note',
        'Total Quoted Value (AED)',
        'Currency',
        'Lump Sum Quote',
        'Invoice / PO No',
        'Payment Status',
        'Scope Notes & Remarks',
        'Attachments Count'
      ]
    : [
        'S/N',
        'Quote Ref No',
        'Revision No',
        'Enquiry Date',
        'Target Order Date',
        'Next Followup Date',
        'Client Company',
        'Company Phone',
        'Primary Contact Name',
        'Primary Contact Email',
        'Primary Contact Phone',
        'Country',
        'Project Location',
        'Sales Person',
        'Status',
        'Enquiry Source',
        'Subject / Title',
        'Client Ref Code',
        'Line Items Count',
        'Scope & Products Summary',
        'Total Quoted Value (AED)',
        'Currency',
        'Lump Sum Quote',
        'Invoice / PO No',
        'Payment Status',
        'Remarks & Scope Notes',
        'Attachments Count'
      ];

  const rows: string[] = [];
  let totalValueAed = 0;
  let totalLineItemsCount = 0;

  enquiries.forEach((e) => {
    totalValueAed += Number(e.value_aed) || 0;
    const company = e.company_id ? companyMap.get(e.company_id) : undefined;
    const compName = company?.display_name || company?.canonical_name || 'Unknown Account';
    
    // Resolve contact details
    const contact = e.company_id ? primaryContactMap.get(e.company_id) : undefined;
    const contactName = contact?.full_name || e.concerned_person || '';
    const contactEmail = contact?.email || company?.general_email || '';
    let contactPhone = contact?.mobile || contact?.landline || '';
    if (!contactPhone && company) {
      contactPhone = company.general_phone || (Array.isArray(company.phones) && company.phones[0]?.number) || '';
    }

    const companyPhone = company?.general_phone || (Array.isArray(company?.phones) && company?.phones[0]?.number) || '';
    const salesPersonName = salespersonMap.get(e.sales_person) || e.sales_person || 'Unassigned';
    const revisionText = e.revision_number ? `Rev-${e.revision_number}` : 'Original (Rev-0)';
    const attachmentsCount = Array.isArray(e.attachments) ? e.attachments.length : 0;
    const isLumpSum = e.is_lump_sum ? 'Yes' : 'No';

    const lineItems = Array.isArray(e.line_items) ? e.line_items : [];
    totalLineItemsCount += lineItems.length;

    if (isFlattened) {
      if (lineItems.length > 0) {
        lineItems.forEach((item, itemIdx) => {
          const rowData = [
            sanitizeCsvValue(e.sn ?? ''),
            sanitizeCsvValue(e.quote_ref_no || ''),
            sanitizeCsvValue(revisionText),
            sanitizeCsvValue(e.enquiry_date || ''),
            sanitizeCsvValue(e.projected_order_date || '—'),
            sanitizeCsvValue(e.next_followup_date || '—'),
            sanitizeCsvValue(compName),
            sanitizeCsvValue(companyPhone),
            sanitizeCsvValue(contactName),
            sanitizeCsvValue(contactEmail),
            sanitizeCsvValue(contactPhone),
            sanitizeCsvValue(e.country || ''),
            sanitizeCsvValue(e.project_location || ''),
            sanitizeCsvValue(salesPersonName),
            sanitizeCsvValue(e.status || ''),
            sanitizeCsvValue(e.enquiry_source || ''),
            sanitizeCsvValue(e.subject || ''),
            sanitizeCsvValue(e.customer_reference_code || ''),
            sanitizeCsvValue(itemIdx + 1),
            sanitizeCsvValue(item.product_type || ''),
            sanitizeCsvValue(item.description || ''),
            sanitizeCsvValue(item.quantity ?? 0),
            sanitizeCsvValue(item.unit || 'Nos'),
            sanitizeCsvValue(item.unit_price ?? 0),
            sanitizeCsvValue(item.total_price ?? 0),
            sanitizeCsvValue(item.lead_time_note || '—'),
            sanitizeCsvValue(e.value_aed ?? 0),
            sanitizeCsvValue(e.currency || 'AED'),
            sanitizeCsvValue(isLumpSum),
            sanitizeCsvValue(e.invoice_po_no || '—'),
            sanitizeCsvValue(e.payment_status || '—'),
            sanitizeCsvValue(e.remarks || ''),
            sanitizeCsvValue(attachmentsCount)
          ];
          rows.push(rowData.join(','));
        });
      } else {
        const rowData = [
          sanitizeCsvValue(e.sn ?? ''),
          sanitizeCsvValue(e.quote_ref_no || ''),
          sanitizeCsvValue(revisionText),
          sanitizeCsvValue(e.enquiry_date || ''),
          sanitizeCsvValue(e.projected_order_date || '—'),
          sanitizeCsvValue(e.next_followup_date || '—'),
          sanitizeCsvValue(compName),
          sanitizeCsvValue(companyPhone),
          sanitizeCsvValue(contactName),
          sanitizeCsvValue(contactEmail),
          sanitizeCsvValue(contactPhone),
          sanitizeCsvValue(e.country || ''),
          sanitizeCsvValue(e.project_location || ''),
          sanitizeCsvValue(salesPersonName),
          sanitizeCsvValue(e.status || ''),
          sanitizeCsvValue(e.enquiry_source || ''),
          sanitizeCsvValue(e.subject || ''),
          sanitizeCsvValue(e.customer_reference_code || ''),
          sanitizeCsvValue(1),
          sanitizeCsvValue('General Package'),
          sanitizeCsvValue(e.subject || 'Package Scope'),
          sanitizeCsvValue(1),
          sanitizeCsvValue('Lot'),
          sanitizeCsvValue(e.value_aed ?? 0),
          sanitizeCsvValue(e.value_aed ?? 0),
          sanitizeCsvValue('—'),
          sanitizeCsvValue(e.value_aed ?? 0),
          sanitizeCsvValue(e.currency || 'AED'),
          sanitizeCsvValue(isLumpSum),
          sanitizeCsvValue(e.invoice_po_no || '—'),
          sanitizeCsvValue(e.payment_status || '—'),
          sanitizeCsvValue(e.remarks || ''),
          sanitizeCsvValue(attachmentsCount)
        ];
        rows.push(rowData.join(','));
      }
    } else {
      // Summary mode (one line per enquiry)
      const productsSummary = lineItems.length > 0
        ? lineItems.map((li) => `${li.quantity}x ${li.description || li.product_type}`).join('; ')
        : (e.subject || 'Lump sum proposal');

      const rowData = [
        sanitizeCsvValue(e.sn ?? ''),
        sanitizeCsvValue(e.quote_ref_no || ''),
        sanitizeCsvValue(revisionText),
        sanitizeCsvValue(e.enquiry_date || ''),
        sanitizeCsvValue(e.projected_order_date || '—'),
        sanitizeCsvValue(e.next_followup_date || '—'),
        sanitizeCsvValue(compName),
        sanitizeCsvValue(companyPhone),
        sanitizeCsvValue(contactName),
        sanitizeCsvValue(contactEmail),
        sanitizeCsvValue(contactPhone),
        sanitizeCsvValue(e.country || ''),
        sanitizeCsvValue(e.project_location || ''),
        sanitizeCsvValue(salesPersonName),
        sanitizeCsvValue(e.status || ''),
        sanitizeCsvValue(e.enquiry_source || ''),
        sanitizeCsvValue(e.subject || ''),
        sanitizeCsvValue(e.customer_reference_code || ''),
        sanitizeCsvValue(lineItems.length),
        sanitizeCsvValue(productsSummary),
        sanitizeCsvValue(e.value_aed ?? 0),
        sanitizeCsvValue(e.currency || 'AED'),
        sanitizeCsvValue(isLumpSum),
        sanitizeCsvValue(e.invoice_po_no || '—'),
        sanitizeCsvValue(e.payment_status || '—'),
        sanitizeCsvValue(e.remarks || ''),
        sanitizeCsvValue(attachmentsCount)
      ];
      rows.push(rowData.join(','));
    }
  });

  // Construct final CSV with UTF-8 BOM (\uFEFF)
  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');

  // Generate clean filename
  const today = new Date().toISOString().split('T')[0];
  const brand = BRAND_CONFIG.shortName.replace(/[^a-zA-Z0-9]/g, '');
  const scopeSuffix = scope === 'filtered' ? 'Filtered' : 'All';
  const modeSuffix = isFlattened ? 'LineItems' : 'Summary';
  const filename = customFilename || `${brand}_Enquiries_${scopeSuffix}_${modeSuffix}_${today}.csv`;

  // Trigger browser download via Blob
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 300);

  return {
    success: true,
    filename,
    enquiriesCount: enquiries.length,
    lineItemsCount: totalLineItemsCount,
    totalValueAed
  };
}
