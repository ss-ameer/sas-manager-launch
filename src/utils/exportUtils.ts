import { Company, Contact } from '../types';
import { getReferenceId } from './refId';
import { getParentIndustry } from './taxonomy';

/**
 * Escapes a cell value for standard CSV formatting.
 * Encapsulates in double quotes and doubles any internal quotes.
 */
export function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = String(val).trim();
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Finds the primary contact or first contact associated with a company.
 */
export function getPrimaryContactForCompany(
  companyId?: string,
  contacts: Contact[] = []
): Contact | undefined {
  if (!companyId) return undefined;
  const companyContacts = contacts.filter((ct) => !ct.is_deleted && !(ct as any).deleted && ct.company_id === companyId);
  return companyContacts.find((ct) => ct.is_primary) || companyContacts[0];
}

/**
 * Exports an array of companies and their associated contacts to a UTF-8 CSV with BOM.
 * Filename format: Company_Directory_[Sector/Filter]_[YYYY-MM-DD].csv
 */
export function exportCompaniesToCSV({
  companies,
  contacts = [],
  filterLabel = 'All'
}: {
  companies: Company[];
  contacts?: Contact[];
  filterLabel?: string;
}): void {
  if (!companies || companies.length === 0) return;

  const headers = [
    'Ref ID',
    'Company Name',
    'Parent Sector',
    'Child Sub-Type',
    'Status',
    'Temperature',
    'City',
    'Address',
    'Phone',
    'Website',
    'Primary Contact Name',
    'Primary Contact Designation',
    'Primary Contact Phone'
  ];

  const rows = companies.map((c) => {
    const refId = getReferenceId('CMP', c, companies);
    const parentObj = getParentIndustry(c.industry_parent);
    const parentLabel = parentObj ? `${parentObj.icon} ${parentObj.label}` : (c.industry_parent || 'Unspecified');
    const childSubType = c.business_type_raw || c.industry || c.industry_type || 'Unspecified';
    const status = c.relationship || 'Prospect';
    const temperature = c.temperature || 'Warm';
    const city = c.city || '';
    const address = [c.city, c.country].filter(Boolean).join(', ');
    
    // Primary phone resolution
    let phone = c.general_phone || '';
    if (!phone && Array.isArray(c.phones) && c.phones.length > 0) {
      phone = c.phones[0]?.number || c.phones[0]?.phone || '';
    }

    const website = c.website || '';
    const primaryContact = getPrimaryContactForCompany(c.id, contacts);
    const contactName = primaryContact?.full_name || '';
    const contactDesignation = primaryContact?.designation || '';
    const contactPhone = primaryContact?.mobile || primaryContact?.landline || '';

    return [
      escapeCsvCell(refId),
      escapeCsvCell(c.display_name || c.canonical_name),
      escapeCsvCell(parentLabel),
      escapeCsvCell(childSubType),
      escapeCsvCell(status),
      escapeCsvCell(temperature),
      escapeCsvCell(city),
      escapeCsvCell(address),
      escapeCsvCell(phone),
      escapeCsvCell(website),
      escapeCsvCell(contactName),
      escapeCsvCell(contactDesignation),
      escapeCsvCell(contactPhone)
    ].join(',');
  });

  const csvBody = [headers.map(escapeCsvCell).join(','), ...rows].join('\r\n');
  // CRITICAL: Prepend UTF-8 BOM (\uFEFF) so Excel correctly renders emojis and international characters
  const csvWithBom = '\uFEFF' + csvBody;

  // Sanitize filename
  const cleanFilter = filterLabel
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_') || 'All';
  const today = new Date().toISOString().split('T')[0];
  const filename = `Company_Directory_${cleanFilter}_${today}.csv`;

  const blob = new Blob([csvWithBom], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
