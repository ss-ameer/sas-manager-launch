/**
 * Canonical 3-Tier Workspace Roles:
 * - 'Admin': Workspace Owner/Admin (Full configuration, workspace management, exports, destructive actions)
 * - 'Member': Sales Representative / Engineer (Standard operational access, create, edit attributed records & collaborations)
 * - 'Viewer': Read-only Guest / Auditor (Auditing & inspection of assigned/accessible records only, no edits/creates)
 */
export type WorkspaceRole = 'Admin' | 'Member' | 'Viewer';
export type CanonicalRole = WorkspaceRole;

export type UserRole = WorkspaceRole | 'admin' | 'sales_rep' | 'viewer' | 'Owner' | 'owner' | 'SuperAdmin';

export interface WorkspaceProfile {
  initials: string;
  job_title?: string;
  phone?: string;
  role?: UserRole | string;
}

export interface UserProfile {
  uid: string;
  id?: string;
  email: string;
  username: string;
  full_name?: string;
  displayName?: string;
  name?: string;
  initials?: string;
  role?: UserRole | string;
  workspace_roles?: Record<string, UserRole | string>;
  workspace_profiles?: Record<string, WorkspaceProfile>;
  profileCompleted?: boolean;
  workspaceIds?: string[];
  defaultWorkspaceId?: string;
  blocked?: boolean;
  createdAt?: string;
  dataVisibilityScope?: 'ALL_DATA' | 'OWN_DATA_ONLY';
  dataVisibilityTier?: 'ADVANCED' | 'BASIC';
  allowSalespersonSelection?: boolean;
  is_super_admin?: boolean;
  photoURL?: string;
  avatarUrl?: string;
  display_name?: string;
  photo_url?: string;
  updated_at?: string;
}

export type User = UserProfile;

export interface WorkspaceMember {
  uid: string;
  email: string;
  name?: string;
  full_name?: string;
  role?: UserRole | string;
  workspace_roles?: Record<string, UserRole | string>;
  joined_at?: string;
  salesperson_id?: string;
}

export interface WorkspaceSettings {
  quote_prefix?: string;
  quote_sequence_pattern?: string;
  quote_reset_cadence?: 'never' | 'monthly' | 'yearly';
  next_sn_baseline?: number;
  next_seq_baseline?: number;
  nextSnBaseline?: number;
  nextSeqBaseline?: number;
  storage?: {
    enabled?: boolean;
    provider?: 'supabase';
    bucket?: string;
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
  [key: string]: any;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_by: string;
  owner_uid?: string;
  created_by_uid?: string;
  createdAt: string;
  modules: {
    enquiriesEnabled: boolean;
    callLogEnabled: boolean;
  };
  is_default?: boolean;
  geography_options?: string[];
  members?: WorkspaceMember[] | Record<string, WorkspaceMember | { role?: WorkspaceRole | UserRole | string; [key: string]: any }>;
  member_emails?: string[];
  join_code?: string;
  data_visibility_scope?: 'ALL_DATA' | 'OWN_DATA_ONLY' | 'ASSIGNED_ONLY' | string;
  dataVisibilityScope?: 'ALL_DATA' | 'OWN_DATA_ONLY' | 'ASSIGNED_ONLY' | string;
  settings?: WorkspaceSettings;
}

export type LegalSuffix = 'None / To Be Added Later' | 'None' | 'LLC' | 'FZE' | 'FZC' | 'Co. LLC' | 'Ltd' | 'W.L.L.' | 'Est.' | 'PJSC' | 'PrJSC' | 'None / Other';

export type PhoneCategory =
  | 'Mobile'
  | 'Work'
  | 'Main'
  | 'Direct'
  | 'WhatsApp'
  | 'Telephone'
  | 'Landline'
  | 'Fax'
  | 'Other'
  | string;

export interface LabeledPhone {
  number: string;
  label: PhoneCategory | string;
}

export interface LabeledEmail {
  email: string;
  label?: string;
}

export interface LabeledHandle {
  platform: 'WhatsApp' | 'Telegram' | 'LinkedIn' | 'WeChat' | 'Skype' | 'Signal' | string;
  handle: string;
}

export type CompanyRelationship =
  | 'Prospect'
  | 'Active Customer'
  | 'Former Customer'
  | 'Partner / Reseller'
  | 'Vendor / Supplier'
  | 'Competitor'
  | string;

export type CompanyTemperature = 'Hot' | 'Warm' | 'Cold' | 'DNC' | string;

export interface SoftDeleteFields {
  is_deleted?: boolean;
  deleted_at?: string;
  deleted_by_uid?: string;
  deleted_by_name?: string;
  created_by_uid?: string;
  created_by_name?: string;
  last_modified_by_uid?: string;
  last_modified_by_name?: string;
  search_terms?: string[];
}

export type ContactMethod = {
  id: string;
  label: string;
  value: string;
};

export interface Company extends SoftDeleteFields {
  id?: string;
  workspace_id?: string | 'unassigned';
  workspaceId?: string | 'unassigned';
  canonical_name: string;
  legal_suffix?: LegalSuffix | string | null;
  display_name: string;
  aliases: string[];
  industry_type?: string;
  industry?: string;
  industry_parent?: string;
  business_type_raw?: string;
  country: string;
  city: string;
  website?: string;
  phone?: string;
  email?: string;
  general_phone?: string;
  general_email?: string;
  general_phones?: ContactMethod[];
  general_emails?: ContactMethod[];
  phones?: ContactMethod[] | LabeledPhone[] | any[];
  emails?: ContactMethod[] | LabeledEmail[] | any[];
  links?: { id: string; label: string; url: string }[];
  relationship?: CompanyRelationship;
  temperature?: CompanyTemperature;
  notes?: string;
  is_dnc?: boolean;
  dnc?: boolean;
  dnc_reason?: string;
  restricted_lines?: Record<string, 'DNC' | 'Invalid'>;
  search_terms?: string[];
  isInternalCompany?: boolean;
  linkedWorkspaceId?: string;
  lastContactedAt?: string | null;
  lastContactedChannel?: string | null;
  lastContactedBy?: string | null;
  nextFollowUpAt?: string | null;
  last_contacted_at?: string | null;
  next_followup_at?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Contact extends SoftDeleteFields {
  id?: string;
  workspace_id?: string | 'unassigned';
  company_id: string;
  full_name: string;
  designation?: string;
  mobile?: string;
  landline?: string;
  phone?: string;
  email?: string;
  phones?: ContactMethod[] | LabeledPhone[] | any[];
  emails?: ContactMethod[] | LabeledEmail[] | any[];
  handles?: LabeledHandle[];
  is_primary?: boolean;
  is_dnc?: boolean;
  dnc?: boolean;
  dnc_reason?: string;
  restricted_lines?: Record<string, 'DNC' | 'Invalid'>;
  createdAt?: string;
  updatedAt?: string;
}

export function normalizePhoneNumber(phone?: any): string {
  if (!phone) return '';
  const str = typeof phone === 'string' ? phone : (typeof phone === 'object' ? (phone.number || phone.value || '') : String(phone));
  return str.replace(/\D/g, '');
}

export function isSamePhoneNumber(phoneA?: string, phoneB?: string): boolean {
  if (!phoneA || !phoneB) return false;
  const numA = normalizePhoneNumber(phoneA);
  const numB = normalizePhoneNumber(phoneB);
  if (!numA || !numB) return false;
  if (numA === numB) return true;
  if (numA.length >= 7 && numB.length >= 7) {
    return numA.endsWith(numB) || numB.endsWith(numA);
  }
  return false;
}

export function getContactPhones(contact?: Partial<Contact> | null): Array<LabeledPhone & { value: string; id?: string }> {
  if (!contact) return [];
  if (contact.phones && contact.phones.length > 0) {
    return (contact.phones as any[])
      .map((p: any) => ({
        id: p.id,
        number: p.number || p.value || '',
        value: p.value || p.number || '',
        label: p.label || 'Mobile'
      }))
      .filter((p) => p.value && p.value.trim() !== '');
  }
  const result: Array<LabeledPhone & { value: string; id?: string }> = [];
  if (contact.mobile) result.push({ number: contact.mobile, value: contact.mobile, label: 'Mobile' });
  if (contact.landline) result.push({ number: contact.landline, value: contact.landline, label: 'Landline' });
  if (contact.phone) result.push({ number: contact.phone, value: contact.phone, label: 'Direct Line' });
  return result;
}

export function getContactEmails(contact?: Partial<Contact> | null): Array<LabeledEmail & { value: string; id?: string }> {
  if (!contact) return [];
  if (contact.emails && contact.emails.length > 0) {
    return (contact.emails as any[])
      .map((e: any) => ({
        id: e.id,
        email: e.email || e.value || '',
        value: e.value || e.email || '',
        label: e.label || 'Work'
      }))
      .filter((e) => e.value && e.value.trim() !== '');
  }
  if (contact.email) return [{ email: contact.email, value: contact.email, label: 'Work' }];
  return [];
}

export function getContactHandles(contact?: Partial<Contact> | null): LabeledHandle[] {
  if (!contact) return [];
  if (contact.handles && contact.handles.length > 0) {
    return contact.handles.filter((h) => h.handle && h.handle.trim() !== '');
  }
  return [];
}

export function getCompanyPhones(company?: Partial<Company> | null): Array<LabeledPhone & { value: string; id?: string }> {
  if (!company) return [];
  if (company.general_phones && company.general_phones.length > 0) {
    return company.general_phones
      .map((p) => ({
        id: p.id,
        number: p.value,
        value: p.value,
        label: p.label || 'Landline'
      }))
      .filter((p) => p.value && p.value.trim() !== '');
  }
  if (company.phones && company.phones.length > 0) {
    return (company.phones as any[])
      .map((p: any) => ({
        id: p.id,
        number: p.number || p.value || '',
        value: p.value || p.number || '',
        label: p.label || 'Landline'
      }))
      .filter((p) => p.value && p.value.trim() !== '');
  }
  const ph = company.general_phone || company.phone;
  if (ph) return [{ number: ph, value: ph, label: 'Landline' }];
  return [];
}

export function getCompanyEmails(company?: Partial<Company> | null): Array<LabeledEmail & { value: string; id?: string }> {
  if (!company) return [];
  if (company.general_emails && company.general_emails.length > 0) {
    return company.general_emails
      .map((e) => ({
        id: e.id,
        email: e.value,
        value: e.value,
        label: e.label || 'Work'
      }))
      .filter((e) => e.value && e.value.trim() !== '');
  }
  if (company.emails && company.emails.length > 0) {
    return (company.emails as any[])
      .map((e: any) => ({
        id: e.id,
        email: e.email || e.value || '',
        value: e.value || e.email || '',
        label: e.label || 'Work'
      }))
      .filter((e) => e.value && e.value.trim() !== '');
  }
  const em = company.general_email || company.email;
  if (em) return [{ email: em, value: em, label: 'Work' }];
  return [];
}

export type ItemType = 'product' | 'charge' | 'discount';

export type ProductType = string;

export type UnitType = string;

export interface ProductAttribute {
  key: string;
  value: string;
}

export interface LineItem {
  id?: string;
  product_id?: string;
  item_name?: string;
  item_type?: ItemType;
  charge_type?: string;
  product_type: ProductType;
  description: string;
  quantity: number;
  unit: UnitType;
  unit_price: number;
  total_price: number;
  lead_time_note?: string;
  attributes?: ProductAttribute[];
  option?: string; // e.g. Option A, Option B, etc.
  page_break_after?: boolean;
  row_spacer_after_mm?: number;
}

export type StockMovementType = 'STOCK_IN' | 'STOCK_RESERVE' | 'STOCK_RELEASE' | 'STOCK_OUT' | 'ADJUSTMENT';

export interface StockMovement {
  id?: string;
  workspace_id: string;
  product_id: string;
  product_name: string;
  movement_type: StockMovementType;
  quantity: number;
  previous_on_hand: number;
  new_on_hand: number;
  reference_type?: 'ENQUIRY' | 'PROJECT' | 'PO' | 'MANUAL';
  reference_id?: string;
  reference_number?: string;
  reason_notes?: string;
  created_at: string;
  created_by_uid?: string;
  created_by_name?: string;
  // Inbound GRN metadata
  unit_cost?: number;
  total_cost?: number;
  supplier_id?: string;
  supplier_name?: string;
  delivery_note_ref?: string;
  grn_number?: string;
  received_date?: string;
}

export interface GrnReceiptData {
  workspace_id: string;
  grn_number: string;
  received_date: string;
  supplier_id?: string;
  supplier_name: string;
  delivery_note_ref: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  storage_location?: string;
  update_cost_price: boolean;
  notes?: string;
}

export interface ProjectMilestone {
  id: string;
  title: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  target_date?: string;
  completed_at?: string;
  notes?: string;
}

export interface Project {
  id?: string;
  project_number: string; // e.g. PRJ-2026-XXXX
  workspace_id: string;
  enquiry_id: string;
  client_name: string;
  client_contact_id?: string;
  title: string;
  status: 'Draft' | 'In Progress' | 'Delivered' | 'Completed' | 'Cancelled';
  project_type: 'Supply Only' | 'Turnkey / Installation';
  contract_value: number;
  currency?: string;
  line_items: LineItem[];
  operational_notes?: string;
  assigned_engineer_name?: string;
  assigned_engineer_id?: string;
  target_delivery_date?: string;
  site_location?: string;
  milestones?: ProjectMilestone[];
  stock_deducted?: boolean;
  dispatched_at?: string;
  dispatched_items_count?: number;
  fulfillment_type?: 'WAREHOUSE_DISPATCH' | 'SERVICE_FULFILLMENT';
  created_at: string;
  updated_at: string;
}

export interface Attachment {
  id?: string;
  name: string;
  size?: number;
  type?: string;
  url: string;
  fileUrl?: string;
  downloadURL?: string;
  storageKey?: string;
  uploadedAt?: string;
  isLocal?: boolean;
  uploadedByUserName?: string;
  storageProvider?: 'supabase' | 'local';
  render_as_annex_page?: boolean;
  show_title_on_annex?: boolean;
  page_placement?: 'cover_before' | 'annex_after' | 'index_only';
  full_bleed?: boolean;
  exclude_from_page_count?: boolean;
}

export type QuotationAnnexAttachment = Attachment;

export type EnquirySource = string;

/**
 * Normalizes enquiry source to clean Title-Case standard casing
 * (e.g., 'EMAIL' -> 'Email', 'DIRECT' -> 'Direct', 'WHATSAPP' -> 'WhatsApp').
 */
export function normalizeEnquirySource(source?: string | null): string {
  if (!source) return 'Direct';
  const trimmed = source.trim();
  if (!trimmed) return 'Direct';
  const upper = trimmed.toUpperCase();
  if (upper === 'EMAIL') return 'Email';
  if (upper === 'DIRECT') return 'Direct';
  if (upper === 'WHATSAPP') return 'WhatsApp';
  if (upper === 'PHONE' || upper === 'CALL') return 'Phone';
  if (upper === 'WEBSITE' || upper === 'WEB') return 'Website';
  if (upper === 'REFERRAL') return 'Referral';
  if (upper === 'WALK-IN' || upper === 'WALKIN') return 'Walk-in';
  if (upper === 'EXHIBITION' || upper === 'EXPO') return 'Exhibition';
  if (upper === 'LINKEDIN') return 'LinkedIn';

  return trimmed
    .toLowerCase()
    .split(/([\s/-]+)/)
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join('');
}

/**
 * Canonical array of all recognized enquiry stages and statuses across all views.
 */
export const ENQUIRY_STATUS_OPTIONS = [
  'Draft',
  'Active',
  'Sent / Pending Client',
  'Revision Requested',
  'Order Received',
  'Won / Approved',
  'Lost',
  'Lost / Cancelled',
  'Delayed',
  'Hold',
  'Dead',
  'Cancelled PO',
  'Gap / Reserved'
] as const;

export type CanonicalEnquiryStatus = (typeof ENQUIRY_STATUS_OPTIONS)[number];

export interface PipelineStatusGroup {
  label: string;
  options: readonly CanonicalEnquiryStatus[];
}

export const PIPELINE_STATUS_GROUPS: readonly PipelineStatusGroup[] = [
  {
    label: 'Active Pipeline',
    options: ['Draft', 'Active', 'Sent / Pending Client', 'Revision Requested'],
  },
  {
    label: 'Closed Won',
    options: ['Won / Approved', 'Order Received'],
  },
  {
    label: 'On Hold & Delayed',
    options: ['Delayed', 'Hold', 'Gap / Reserved'],
  },
  {
    label: 'Closed Lost / Inactive',
    options: ['Lost', 'Lost / Cancelled', 'Dead', 'Cancelled PO'],
  },
] as const;

export type EnquiryStatus =
  | CanonicalEnquiryStatus
  | 'Won'
  | 'GAP / RESERVED'
  | string;

/**
 * Safely resolves case variations (e.g. legacy 'GAP / RESERVED') to canonical options.
 */
export function normalizeEnquiryStatus(status?: string | null): string {
  if (!status) return 'Active';
  const trimmed = status.trim();
  const matched = ENQUIRY_STATUS_OPTIONS.find(
    (opt) => opt.toLowerCase() === trimmed.toLowerCase()
  );
  return matched || trimmed;
}

export interface EnquiryStatusHistoryEntry {
  from: string;
  to: string;
  timestamp: string;
  updatedBy?: string;
}

export interface Enquiry extends SoftDeleteFields {
  id?: string;
  workspace_id?: string | 'unassigned';
  workspaceId?: string;
  sn: number;
  enquiry_date: string;
  logged_date?: string;
  raw_source_text?: string;
  sales_person_id?: string;
  sales_person?: string; // initials (e.g. PV, NS) or display name
  salesperson_id?: string;
  salesperson?: string;
  assignedSalesperson?: string;
  assigned_salesperson?: string;
  sales_rep_id?: string;
  salesRepresentativeId?: string;
  sales_representative?: string;
  salesRep?: string;
  contact_person_name?: string;
  additional_team?: (string | Record<string, any>)[] | string;
  shared_with?: string[];
  shared_with_uids?: (string | Record<string, any>)[];
  shared_with_names?: (string | Record<string, any>)[];
  created_by?: string;
  createdBy?: string;
  created_by_uid?: string;
  creator_id?: string;
  created_by_name?: string;
  assigned_to_id?: string;
  assigned_to?: string;
  company_id: string;
  company_name?: string;
  client_company?: string;
  contact_id?: string;
  country: string;
  project_location: string;
  enquiry_source: EnquirySource;
  status: EnquiryStatus;
  quote_ref_no: string;
  subject?: string; // Optional Subject for the proposal
  customer_reference_code?: string; // Optional Customer Reference Code
  proposal_option?: string; // e.g. Option A, Option B for alternative versions
  projected_order_date?: string;
  next_followup_date?: string;
  value_aed: number;
  currency?: 'AED' | 'USD';
  is_lump_sum?: boolean;
  remarks?: string;
  invoice_po_no?: string;
  payment_status?: string;
  project_id?: string;
  project_number?: string;
  stock_reserved?: boolean;
  stock_reserved_at?: string | null;
  custom_project_details?: ProductAttribute[];
  is_gap_placeholder?: boolean;
  line_items: LineItem[];
  attachments?: Attachment[];
  concerned_persons?: string[];
  concerned_person?: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  createdByUid?: string;
  createdByUsername?: string;
  updatedByUid?: string;
  updatedByUsername?: string;
  parent_id?: string | null; // Real link to original enquiry for revision tracking
  revision_number?: number; // Revision number: 0 for original, 1 for Rev-1, 2 for Rev-2, etc.
  statusUpdatedAt?: string;
  statusUpdatedBy?: string;
  sentAt?: string;
  wonAt?: string;
  lostAt?: string;
  lost_reason?: string;
  lost_notes?: string;
  statusHistory?: EnquiryStatusHistoryEntry[];
}

export interface DropdownOption {
  id: string;
  name: string;
  color?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  workspace_id?: string;
}

export interface Invite {
  id?: string;
  code: string;
  role: UserRole;
  workspaceId?: string;
  workspace_id?: string;
  workspaceName?: string;
  used: boolean;
  is_used?: boolean;
  claimed_by_uid?: string;
  claimed_by_email?: string;
  claimed_at?: string;
  usedBy?: string;
  usedAt?: string;
  usedByList?: { uid: string; email: string; name?: string; at: string }[];
  createdBy: string;
  createdByEmail?: string;
  createdAt: string;
  notes?: string;
}

export interface AuditDiff {
  field: string;
  old_value: any;
  new_value: any;
}

export interface AuditLog {
  id?: string;
  document_id: string;
  entity_type: 'company' | 'contact' | 'enquiry' | 'call_log' | 'product' | 'salesperson' | 'workspace' | 'user';
  entity_title?: string;
  action: 'create' | 'update' | 'delete';
  changed_by_uid: string;
  changed_by_name: string;
  changed_by_email?: string;
  timestamp: string;
  before: any;
  after: any;
  changes?: AuditDiff[];
  details?: string;
}

export interface Salesperson {
  id?: string;
  uid?: string;
  userId?: string;
  workspace_id?: string;
  initials?: string;
  full_name: string;
  name?: string;
  displayName?: string;
  role: string;
  email?: string;
  phone?: string;
  mobile?: string;
  title?: string;
  designation?: string;
  linked_user_id?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product extends SoftDeleteFields {
  id?: string;
  workspace_id?: string | 'unassigned';
  name?: string;
  product_type: ProductType;
  description: string;
  unit: UnitType;
  unit_price?: number;
  sku?: string;
  createdAt?: string;
  attributes?: ProductAttribute[];
  is_inventoried?: boolean;
  stock_on_hand?: number;
  stock_reserved?: number;
  reorder_level?: number;
  hs_code?: string;
  country_of_origin?: string;
  gross_weight_kg?: number;
  storage_location?: string;
  cost_price?: number;
  search_terms?: string[];
}

export const getInitials = (name?: string | null): string => {
  if (!name || typeof name !== 'string') return '??';
  const trimmed = name.trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && parts[0][0] && parts[parts.length - 1][0]) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (trimmed || '??').substring(0, Math.min(2, trimmed.length)).toUpperCase();
};

/**
 * Resolves the primary salesperson identifier/ID across legacy and standard keys.
 */
export function resolveSalespersonIdentifier(enquiry: Partial<Enquiry> | null | undefined): string {
  if (!enquiry) return '';
  return (
    enquiry.sales_person_id ||
    enquiry.salesperson_id ||
    enquiry.sales_person ||
    enquiry.salesperson ||
    enquiry.assigned_to_id ||
    enquiry.assigned_to ||
    ''
  );
}

/**
 * Resolves the salesperson display name or initials across assignment keys.
 */
export function resolveSalespersonName(enquiry: Partial<Enquiry> | null | undefined): string {
  if (!enquiry) return '';
  return (
    enquiry.assigned_salesperson ||
    enquiry.assignedSalesperson ||
    enquiry.sales_representative ||
    enquiry.sales_person ||
    enquiry.salesperson ||
    enquiry.assigned_to ||
    ''
  );
}

export function resolveEnquiryContactPerson(enquiry: Partial<Enquiry> | null | undefined): string {
  if (!enquiry) return '';
  return (
    enquiry.contact_person_name ||
    (enquiry as any).contact_person ||
    (enquiry as any).contact_name ||
    enquiry.concerned_person ||
    (Array.isArray(enquiry.concerned_persons) && enquiry.concerned_persons[0]) ||
    ''
  );
}

export function normalizeAttributes(attributes: any): ProductAttribute[] {
  if (!attributes) return [];
  if (Array.isArray(attributes)) {
    return attributes.map(a => ({
      key: (a && typeof a === 'object' && a.key !== undefined && a.key !== null) ? String(a.key) : '',
      value: (a && typeof a === 'object' && a.value !== undefined && a.value !== null) ? String(a.value) : ''
    })).filter(a => a.key !== '' || a.value !== '');
  }
  if (typeof attributes === 'object') {
    return Object.entries(attributes).map(([key, value]) => ({
      key,
      value: String(value || '')
    }));
  }
  return [];
}

export type ActivityChannel = 'Call' | 'WhatsApp' | 'Email' | 'Meeting' | 'Site Visit';

export type CallStatus = 'Scheduled' | 'Completed' | 'Cancelled' | 'Follow-Up Required' | 'No Answer / Voicemail' | 'Invalid Number' | 'Received' | 'Sent' | string;

export type CallOutcome =
  | 'Connected'
  | 'Reached - Interested'
  | 'Reached - Not Interested'
  | 'No Answer / Voicemail'
  | 'Follow-Up Required'
  | 'Wrong Number'
  | 'Call Dropped / Disconnected'
  | 'Dead / Invalid Number'
  | 'Cannot Be Reached / Unreachable'
  | 'DNC Request'
  | 'Closed - Deal Made'
  | 'General Inquiry / Support'
  | 'Enquiry Received'
  | string;

export type InternalOpsCategory =
  | 'Development'
  | 'Design / Document Prep'
  | 'Social Media / Marketing'
  | 'Executive / Ad-hoc Request'
  | 'Operations / Coordination';

export type InternalOpsRequester =
  | 'Self'
  | 'Assigned'
  | 'Management / Team'
  | 'Management / Boss'
  | 'Team Member'
  | 'Self-Directed'
  | string;

export interface ActivityLogEntry extends SoftDeleteFields {
  id?: string;
  workspace_id?: string | 'unassigned';
  date: string; // ISO or YYYY-MM-DD
  status: CallStatus;
  outcome?: CallOutcome | string;
  channel?: string;
  requirement_notes?: string;
  notes?: string;
  ai_summary?: string;
  whatsapp_draft?: string;
  next_followup_date?: string;
  company_id?: string;
  company_name?: string;
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  unlinked_name?: string;
  unlinked_contact_info?: string;
  enquiry_id?: string; // Optional link to Enquiry
  enquiry_quote_ref?: string;
  logged_by: string;
  sales_person_id?: string;
  sales_person?: string;
  handled_by_salesperson_id?: string;
  handled_by_team_member_name?: string;
  interaction_type?: 'call' | 'email' | 'message';
  category?: string;
  department?: string;
  interaction_purpose?: string;
  email_subject?: string;
  email_address?: string;
  message_platform?: string;
  geography?: string; // Configurable geography/region field
  purpose?: string; // Call purpose / reason (e.g. Prospecting, Quote Follow-Up, Technical Support, Payment Collection)
  location_or_link?: string;
  followup_intent?: string;
  concerned_persons?: string[];
  concerned_person?: string;
  // Internal Ops fields
  isInternalOps?: boolean;
  internalCategory?: InternalOpsCategory;
  requester?: InternalOpsRequester;
  durationMinutes?: number;
  deliverableUrl?: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CallLogEntry = ActivityLogEntry;

export interface IndustryTaxonomySector {
  id: string;
  label: string;
  name?: string;
  icon: string;
  subtypes: string[];
  order?: number;
}

export const CATEGORY_SUGGESTED_ATTRIBUTES: Record<string, string[]> = {
  'FRP Tanks': ['Brand / Make', 'Diameter', 'Height', 'Volume', 'Design Pressure'],
  'FRP Vessels': ['Brand / Make', 'Model', 'Top/Bottom Opening', 'Volume'],
  'Pressure Vessels': ['Brand / Make', 'Shell Material', 'Design Temp', 'Volume'],
  'RO Membranes': ['Brand / Make', 'Membrane Type', 'Active Area', 'Flow Rate', 'Salt Rejection'],
  'RO Housing': ['Brand / Make', 'Ports', 'Element Capacity', 'Max Pressure'],
  'Cartridge Filters': ['Brand / Make', 'Micron Rating', 'Length', 'Material', 'Core Material'],
  'Dosing Pumps': ['Brand / Make', 'Flow Rate', 'Pressure', 'Voltage', 'Control Type'],
  'MBBR Media': ['Brand / Make', 'Specific Surface Area', 'Void Ratio', 'Density', 'Material'],
  'Filter Media': ['Brand / Make', 'Media Type', 'Effective Size', 'Uniformity Coefficient', 'Specific Gravity'],
  'Tube Settler Media': ['Brand / Make', 'Chamber Length', 'Slope Angle', 'Material'],
  'Chemicals': ['Brand / Make', 'Form', 'Concentration', 'Packaging Type'],
  'Valves': ['Brand / Make', 'Size', 'Body Material', 'Actuator Type', 'Connection Type'],
  'Frames/Fabrication': ['Brand / Make', 'Material Grade', 'Surface Finish', 'Dimensions'],
  'Various': ['Brand / Make', 'Model/Specification'],
  'Other': ['Brand / Make', 'Specification']
};

/**
 * Workspace Quote Numbering & Dynamic Sequence Types
 * Document path: workspaces/{workspaceId}/system/counters
 */
export type SequenceResetCadence = 'never' | 'monthly' | 'yearly';

export interface WorkspaceSequenceCounters {
  prefix: string; // e.g. "ANRW" or ""
  pattern: string; // e.g. "{PREFIX}/{MM}/{YYYY}/{SEQ}" or "{SEQ}-{DD}{MM}{YY}"
  resetCadence: SequenceResetCadence; // 'never' | 'monthly' | 'yearly'
  lastSnNumber: number; // Global sequential counter (S/N)
  sequences: {
    [periodKey: string]: number; // e.g. "2026-09": 1222 or "global": 142
  };
  updatedAt: string;
  updatedBy: string;
}

export interface SequenceFormatTokens {
  seq: number;
  prefix?: string;
  date?: Date;
  rep?: string;
}

export interface ClaimedSequenceResult {
  sn: number;
  quoteRef: string;
  sequence: number;
}

export const WORKSPACE_STORAGE_KEY = 'sas_active_workspace_id';

// ==========================================
// QUOTATION ENGINE & PRESET ARCHITECTURE TYPES
// ==========================================

export type QuotationTaxMode = 'tax_calculated' | 'taxes_extra' | 'tax_exempt';

export type QuotationSignatoryMode = 'single' | 'dual' | 'stamp_only' | 'none';

export type QuotationThemeAccent = 'navy' | 'emerald' | 'blue' | 'crimson' | 'slate' | 'amber' | 'teal';
export type QuotationSignatureStyle = 'script' | 'line' | 'line_only' | 'image';
export type QuotationLogoPosition = 'left' | 'center' | 'right';
export type QuotationHeaderLayout = 'split' | 'centered_banner' | 'modern_compact' | 'centered' | 'minimal';
export type QuotationTableDensity = 'compact' | 'comfortable' | 'standard' | 'spacious';
export type QuotationTableFontScale = 'compact' | 'standard' | 'prominent';
export type QuotationFontSizeScale = 'compact' | 'standard' | 'comfortable' | 'large';
export type QuotationPageMode = 'auto' | '1-page' | '2-page';

export type QuotationDocumentFontFamily = 'sans' | 'serif' | 'technical';
export type QuotationTopAccentBarStyle = 'thick' | 'double' | 'side_accent' | 'none';
export type QuotationSectionHeaderStyle = 'solid' | 'tinted' | 'underline' | 'minimal';
export type QuotationSignatoryBlockAlign = 'left' | 'center' | 'right' | 'space_between';
export type QuotationSignatoryTextAlign = 'left' | 'center' | 'right';
export type QuotationStampPlacement = 'left' | 'center' | 'right' | 'overlay';
export type QuotationSignatureVerticalSpacing = 'compact' | 'standard' | 'spacious';
export type QuotationSignatureLineWidth = 'narrow' | 'standard' | 'wide' | 'none';

export interface QuotationSignatoryCustomLine {
  id: string;
  label: string;
  value: string;
  target?: 'primary' | 'secondary' | 'both';
}

export type QuotationStatus = 'Draft' | 'Sent' | 'Approved' | 'Rejected' | 'Declined' | 'Superseded' | string;

export interface QuotationItemAttribute {
  key: string;   // e.g. "Size", "Material", "Pressure", "Flow", "Color"
  value: string; // e.g. "9 Inch", "SS316", "10 bar", "15 LPH", "RAL 7035"
}

export interface QuotationLineItem {
  id?: string;
  item_name: string;
  description: string;
  quantity: number;
  unit?: string;
  uom?: string;
  unit_price: number;
  total_price?: number;
  line_total?: number;
  brand_make?: string;
  brand?: string;
  model_part_no?: string;
  model?: string;
  country_of_origin?: string;
  origin?: string;
  availability?: string;
  is_optional?: boolean;
  attributes?: QuotationItemAttribute[];
  technical_attributes?: QuotationItemAttribute[] | Record<string, string>;
  visible_attributes?: string[];
  hidden_attributes?: string[];
  page_break_after?: boolean;
  row_spacer_after_mm?: number;
}

export type QuotationItem = QuotationLineItem;

export interface BankAccountProfile {
  id: string;
  bankName: string;
  beneficiaryName: string;
  accountNumber: string;
  iban: string;
  swiftCode?: string;
  branchName?: string;
  currency: string;
  isDefault?: boolean;
  // Aliases for compatibility
  bank_name?: string;
  account_name?: string;
  account_title?: string;
  account_number?: string;
  swift_bic?: string;
  swift_code?: string;
  branch_address?: string;
  is_default?: boolean;
}

export interface DocumentProfileBankAccount {
  id?: string;
  bank_name: string;
  account_name?: string;
  account_title?: string;
  account_number: string;
  iban?: string;
  swift_bic?: string;
  swift_code?: string;
  branch_address?: string;
  currency?: string;
  is_default?: boolean;
  // Aliases for camelCase compatibility
  bankName?: string;
  beneficiaryName?: string;
  accountNumber?: string;
  swiftCode?: string;
  branchName?: string;
  isDefault?: boolean;
}

export interface WorkspaceDocumentProfile extends SoftDeleteFields {
  id?: string;
  workspace_id?: string;
  workspaceId?: string;
  profile_name: string;
  legal_entity_name: string;
  trn?: string; // Tax Registration Number
  address_line_1: string;
  address_line_2?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  logo_url?: string;
  stamp_seal_url?: string;
  company_seal_url?: string;
  signature_image_url?: string;
  accent_color?: string; // Hex color code
  theme_accent?: QuotationThemeAccent;
  customThemeColor?: string;
  block_style?: 'framed' | 'minimal';
  amount_in_words_enabled?: boolean;
  customer_acceptance_enabled?: boolean;
  signatory_type?: QuotationSignatoryMode;
  primary_signatory_name?: string;
  primary_signatory_title?: string;
  secondary_signatory_name?: string;
  secondary_signatory_title?: string;
  signature_style?: QuotationSignatureStyle;
  logo_position?: QuotationLogoPosition;
  header_layout?: QuotationHeaderLayout;
  table_density?: QuotationTableDensity;
  table_font_scale?: QuotationTableFontScale;
  fontSizeScale?: QuotationFontSizeScale;
  font_size_scale?: QuotationFontSizeScale;
  show_bank_details?: boolean;
  show_commercial_terms?: boolean;
  show_company_seal?: boolean;
  showAmountInWords?: boolean;
  show_amount_in_words?: boolean;
  repeatHeaderOnSubsequentPages?: boolean;
  showBankRemittance?: boolean;
  showCustomerAcceptance?: boolean;
  showSignatories?: boolean;
  footerLayoutMode?: 'split' | 'stacked' | 'seller_only';
  header_config?: QuotationHeaderConfig;
  recipient_config?: QuotationRecipientConfig;
  footer_config?: QuotationFooterConfig;
  visible_columns?: QuotationPresetColumns;
  default_tax_mode?: QuotationTaxMode;
  default_price_basis?: string;
  default_payment_terms?: string;
  default_validity_days?: number;
  default_notes?: string;
  subject?: string;
  globalCardRadius?: 'rounded' | 'sharp';
  cardsOrder?: 'recipient_first' | 'offer_first';
  subjectPlacement?: 'above_cards' | 'below_cards';
  pageMode?: QuotationPageMode;
  bank_accounts: DocumentProfileBankAccount[];
  is_default?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type QuotationDocumentProfile = WorkspaceDocumentProfile;

export interface QuotationPresetColumns {
  brand?: boolean;
  model?: boolean;
  origin?: boolean;
  availability?: boolean;
  unit_price?: boolean;
  showUnitPrice?: boolean;
  showUom?: boolean;
  showLineTotal?: boolean;
  showItemAttributes?: boolean;
  attributeDisplayFormat?: 'pills' | 'inline_text';
  hiddenAttributeKeys?: string[];
  showAmountInWords?: boolean;
}

export type QuotationColumnConfig = QuotationPresetColumns;

export type QuotationBlockType =
  | 'terms'
  | 'totals'
  | 'remittance'
  | 'signatory'
  | 'signatories'
  | 'acceptance'
  | 'page_break'
  | 'spacer';

export type QuotationBlockId = QuotationBlockType | string;

export type StudioSelectedSection =
  | QuotationBlockId
  | 'items_table'
  | 'header'
  | 'recipient_info'
  | 'quote_meta'
  | 'recipient_meta'
  | 'subject'
  | 'footer'
  | 'signatories'
  | 'style'
  | string
  | null;

export interface QuotationHeaderFieldItem {
  id: string; // e.g., 'address', 'phone', 'email', 'website', 'trn', or 'custom_1'
  label?: string; // e.g., 'Tel:', 'VAT / TRN:', 'Mob:'
  valueOverride?: string; // Custom text override or custom field value
  enabled: boolean;
  zone: 'under_logo' | 'under_name' | 'contact_block' | 'bottom_bar';
  fontSize?: 'xs' | 'sm' | 'base' | 'lg';
  fontWeight?: 'normal' | 'medium' | 'bold';
  icon?: 'map-pin' | 'phone' | 'smartphone' | 'mail' | 'globe' | 'building' | 'hash' | 'user' | 'shield' | 'none';
  showIcon?: boolean;
}

export interface QuotationHeaderConfig {
  alignment?: 'centered' | 'split'; // Centered stack vs Logo Left / Address Right
  showPhone?: boolean;
  showEmail?: boolean;
  showWebsite?: boolean;
  showTrn?: boolean;
  logoUrl?: string; // Custom uploaded data-URI or image URL override for this quotation/preset
  showLogo?: boolean; // default: true; when false, hides logo mark/placeholder completely
  logoDisplayMode?: 'logo_and_name' | 'logo_only' | 'full_banner' | 'no_logo'; // default: 'logo_and_name'
  headerLayoutMode?: 'split_left' | 'split_right' | 'centered' | 'banner'; // Unified header layout & alignment
  logoHeightPx?: number; // range 28 to 110, default 48
  logoMaxWidthPx?: number; // default 260, or 700 in 'full_banner' mode
  showCompanyName?: boolean; // default: true
  logoSpacing?: 'none' | 'tight' | 'normal' | 'spacious'; // default: 'normal'
  repeatHeaderOnSubsequentPages?: boolean; // default: true (Repeats compact corporate running header on Page 2+)
  showLogoOnContinuationPages?: boolean; // default: true (Renders compact mini-logo in Page 2+ and Annex headers when logo is present)
  headerFields?: QuotationHeaderFieldItem[];
  brandHorizontalAlign?: 'left' | 'center' | 'right';
  brandVerticalAlign?: 'top' | 'middle' | 'bottom';
  contactHorizontalAlign?: 'left' | 'center' | 'right';
  contactVerticalAlign?: 'top' | 'middle' | 'bottom';
  showHeaderIcons?: boolean; // default: true (Master toggle for header contact/TRN icons)
  continuationHeaderMode?: 'compact' | 'full_repeat' | 'logo_only' | 'none';
  continuationLogoHeightPx?: number; // range 16 to 48, default 22
  showCompanyNameOnContinuation?: boolean; // default: true
  showSubjectOnContinuation?: boolean; // default: true
  showQuoteRefOnContinuation?: boolean; // default: true
  showPageNumberOnContinuation?: boolean; // default: true
  showContinuationDivider?: boolean; // default: true
  companyNameOverride?: string; // Per-preset or per-quote sister-company trading name override
  documentFontFamily?: QuotationDocumentFontFamily;
  topAccentBarStyle?: QuotationTopAccentBarStyle;
  tableHeaderStyle?: QuotationSectionHeaderStyle;
  blockHeaderStyle?: QuotationSectionHeaderStyle;
}

export interface QuotationFooterConfig {
  showPageNumbers?: boolean; // default: true
  showDisclaimer?: boolean; // default: true
  showSystemGeneratedNotice?: boolean;
  customDisclaimer?: string;
  showBankRemittance?: boolean; // default: true
  showCustomerAcceptance?: boolean; // default: true
  showSignatories?: boolean; // default: true
  footerLayoutMode?: 'split' | 'stacked' | 'seller_only'; // default: 'split'
  fontSizeScale?: QuotationFontSizeScale;
  remittanceBankId?: string;
  selectedBank?: BankAccountProfile;
  pageMode?: QuotationPageMode;
  companySealUrl?: string;
  signatureImageUrl?: string;
  sealSizePx?: number; // range 60 to 180, default 105
  sealRotationDeg?: number; // range -35 to 35, default -6
  sealOffsetX?: number; // range -120 to 120, default 0
  sealOffsetY?: number; // range -80 to 80, default 0
  signatureSizePx?: number; // range 32 to 130, default 56
  signatureRotationDeg?: number; // range -25 to 25, default 0
  signatureOffsetX?: number; // range -120 to 120, default 0
  signatureOffsetY?: number; // range -80 to 80, default 0
  stampSignatureOverlapMode?: 'side_by_side' | 'realistic_overlap' | 'stamp_over_name'; // default 'realistic_overlap'
  inkMultiplyBlend?: boolean; // default true
  footerHorizontalAlign?: 'split' | 'left' | 'center' | 'right'; // default 'split'
  footerVerticalAlign?: 'top' | 'middle' | 'bottom'; // default 'middle'
  systemTaglineText?: string; // default 'GENERATED VIA MARabi WORKSPACE STUDIO'
  showSystemTagline?: boolean; // default true
  showReferenceInFooter?: boolean; // default true
  showIssueDateInFooter?: boolean; // default true
  customFooterPills?: string[]; // e.g., ['ISO 9001:2015 Certified', 'Confidential']
  // Enhanced Signature & Stamp Alignment and Custom Details
  signatoryBlockAlign?: QuotationSignatoryBlockAlign; // default 'space_between'
  signatoryTextAlign?: QuotationSignatoryTextAlign; // default 'center'
  stampPlacement?: QuotationStampPlacement; // default 'left'
  signatureVerticalSpacing?: QuotationSignatureVerticalSpacing; // default 'standard'
  signatureLineWidth?: QuotationSignatureLineWidth; // default 'standard'
  showForAndOnBehalf?: boolean; // default false
  forAndOnBehalfText?: string;
  showDateSignedLine?: boolean; // default false
  showSignatoryPhone?: boolean; // default false
  signatoryPhone?: string;
  secondarySignatoryPhone?: string;
  showSignatoryEmail?: boolean; // default false
  signatoryEmail?: string;
  secondarySignatoryEmail?: string;
  signatoryCustomLines?: QuotationSignatoryCustomLine[];
  signatoryContactFormat?: 'icon' | 'label' | 'plain'; // default 'icon'
  signatoryLineOrder?: Array<'name' | 'title' | 'phone' | 'email' | 'custom' | 'date'>;
  signatoryLineStyles?: Record<
    string,
    {
      weight?: 'normal' | 'medium' | 'bold';
      color?: 'default' | 'muted' | 'accent';
    }
  >;
  visibleSignatoryLines?: Record<string, boolean>;
}

export interface QuotationRecipientConfig {
  style?: 'framed' | 'minimal'; // Bordered box vs clean text divider
  layout?: 'split' | 'stacked' | 'side_by_side'; // 50/50 side-by-side vs full-width stacked
  showSubmittedTo?: boolean;
  showCustomerTrn?: boolean;
  showOfferMeta?: boolean;
  showAttention?: boolean;
  showSalesRep?: boolean;
  showValidity?: boolean;
  showEnquiryRef?: boolean;
  showSubject?: boolean;
  recipientPlacement?: 'left' | 'full' | 'right';
  recipientCardStyle?: 'framed' | 'minimal';
  recipientCardWidth?: '50' | '100';
  recipientCardRadius?: 'rounded' | 'sharp';
  offerPlacement?: 'left' | 'full' | 'right';
  offerCardStyle?: 'framed' | 'minimal';
  offerCardWidth?: '50' | '100';
  offerCardRadius?: 'rounded' | 'sharp';
  cardsOrder?: 'recipient_first' | 'offer_first';
  subjectPlacement?: 'above_cards' | 'below_cards';
  globalCardRadius?: 'rounded' | 'sharp';
}

export interface QuotationBlockCustomRow {
  id: string;
  label: string;
  value: string;
  enabled?: boolean;
}

export interface QuotationBlockConfig {
  id: string;
  type?: QuotationBlockType;
  title?: string;
  is_visible?: boolean;
  enabled?: boolean;
  placement?: 'left' | 'right' | 'full'; // 'left' = col-start-1 col-span-1, 'right' = col-start-2 col-span-1, 'full' = col-span-2
  width?: '50' | '100' | 'full' | 'left' | 'right' | string;
  style?: 'framed' | 'minimal';
  fontScale?: 'compact' | 'standard' | 'prominent'; // compact = 9px base, standard = 10px base, prominent = 11px base
  padding?: 'compact' | 'standard'; // compact = p-2, standard = p-3
  spacer_height_mm?: number; // default: 20, range: 5 to 100
  spacer_fill_remaining?: boolean; // default: false
  show_continuation_header?: boolean; // for page_break blocks, default: true
  order?: number;
  // Standardized Block Customization & Formatting
  titleOverride?: string;
  subtitleOverride?: string;
  showHeaderIcon?: boolean; // default true
  headerStyleOverride?: 'inherit' | 'solid' | 'tinted' | 'underline' | 'minimal' | 'none';
  fieldLayoutMode?: 'split' | 'inline' | 'grid_2col'; // default 'split'
  showRowDividers?: boolean; // default false
  valueAlign?: 'left' | 'right'; // default 'right' in split mode, 'left' in inline/grid
  visibleFields?: Record<string, boolean>;
  fieldLabels?: Record<string, string>;
  fieldOrder?: string[];
  customRows?: QuotationBlockCustomRow[];
  customNote?: string;
  acceptanceLayout?: 'row_4col' | 'grid_2x2' | 'compact';
  acceptanceStatementOverride?: string;
}

export interface QuotationLayoutSettings {
  blocks: QuotationBlockConfig[];
}

export interface QuotationPreset extends SoftDeleteFields {
  id?: string;
  workspace_id?: string;
  workspaceId?: string;
  preset_name: string;
  header_profile_id?: string;
  visible_columns: QuotationPresetColumns;
  layout_blocks?: QuotationBlockConfig[];
  default_tax_mode: QuotationTaxMode;
  default_price_basis?: string; // e.g., 'Ex-Works', 'FOB', 'CIF', 'DDP'
  default_payment_terms?: string; // e.g., '100% Advance', '30 Days Net'
  default_validity_days: number; // e.g., 30
  signatory_mode: QuotationSignatoryMode;
  flyer_attachments?: Attachment[];
  show_submittals_index?: boolean;
  notes_template?: string;
  header_layout?: QuotationHeaderLayout;
  table_density?: QuotationTableDensity;
  table_font_scale?: QuotationTableFontScale;
  fontSizeScale?: QuotationFontSizeScale;
  font_size_scale?: QuotationFontSizeScale;
  show_bank_details?: boolean;
  show_commercial_terms?: boolean;
  show_company_seal?: boolean;
  theme_accent?: QuotationThemeAccent;
  customThemeColor?: string;
  documentFontFamily?: QuotationDocumentFontFamily;
  topAccentBarStyle?: QuotationTopAccentBarStyle;
  tableHeaderStyle?: QuotationSectionHeaderStyle;
  blockHeaderStyle?: QuotationSectionHeaderStyle;
  companyNameOverride?: string;
  header_config?: QuotationHeaderConfig;
  recipient_config?: QuotationRecipientConfig;
  footer_config?: QuotationFooterConfig;
  remittanceBankId?: string;
  remittance_bank_id?: string;
  selectedBank?: BankAccountProfile;
  selected_bank?: BankAccountProfile;
  subject?: string;
  amount_in_words_enabled?: boolean;
  customer_acceptance_enabled?: boolean;
  showBankRemittance?: boolean;
  showCustomerAcceptance?: boolean;
  showSignatories?: boolean;
  footerLayoutMode?: 'split' | 'stacked' | 'seller_only';
  signatory_type?: QuotationSignatoryMode;
  primary_signatory_name?: string;
  primary_signatory_title?: string;
  secondary_signatory_name?: string;
  secondary_signatory_title?: string;
  signature_style?: QuotationSignatureStyle;
  company_logo_url?: string;
  company_seal_url?: string;
  signature_image_url?: string;
  logo_position?: QuotationLogoPosition;
  block_style?: 'framed' | 'minimal';
  globalCardRadius?: 'rounded' | 'sharp';
  cardsOrder?: 'recipient_first' | 'offer_first';
  subjectPlacement?: 'above_cards' | 'below_cards';
  pageMode?: QuotationPageMode;
  custom_notes?: string;
  is_default?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuotationPartySnapshot {
  entity_name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  trn?: string;
  logo_url?: string;
  stamp_seal_url?: string;
  client_contact_person?: string;
  client_trn?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
}

export interface QuotationSignatory {
  name: string;
  designation?: string;
  signature_url?: string;
  date?: string;
}

export interface Quotation extends SoftDeleteFields {
  id?: string;
  workspace_id: string;
  workspaceId: string;
  enquiry_id: string;
  quote_number: string; // e.g., 'QT-2026-0042'
  revision_number: number; // 0 for R0, 1 for R1, etc.
  formatted_quote_ref: string; // e.g., 'QT-2026-0042-R0'
  status: QuotationStatus;
  client_snapshot: QuotationPartySnapshot;
  sender_snapshot: QuotationPartySnapshot;
  line_items: QuotationLineItem[];
  tax_mode: QuotationTaxMode;
  subtotal: number;
  freight_amount: number;
  tax_rate_percent: number;
  tax_amount: number;
  grand_total: number;
  applied_terms?: string;
  applied_bank_account?: DocumentProfileBankAccount;
  remittanceBankId?: string;
  remittance_bank_id?: string;
  selectedBank?: BankAccountProfile;
  selected_bank?: BankAccountProfile;
  signatories?: QuotationSignatory[];
  theme_accent?: QuotationThemeAccent;
  customThemeColor?: string;
  documentFontFamily?: QuotationDocumentFontFamily;
  topAccentBarStyle?: QuotationTopAccentBarStyle;
  tableHeaderStyle?: QuotationSectionHeaderStyle;
  blockHeaderStyle?: QuotationSectionHeaderStyle;
  companyNameOverride?: string;
  amount_in_words_enabled?: boolean;
  customer_acceptance_enabled?: boolean;
  signatory_mode?: QuotationSignatoryMode;
  signatory_type?: QuotationSignatoryMode;
  validity_days?: number;
  primary_signatory_name?: string;
  primary_signatory_title?: string;
  secondary_signatory_name?: string;
  secondary_signatory_title?: string;
  signature_style?: QuotationSignatureStyle;
  company_logo_url?: string;
  company_seal_url?: string;
  signature_image_url?: string;
  logo_position?: QuotationLogoPosition;
  header_layout?: QuotationHeaderLayout;
  table_density?: QuotationTableDensity;
  table_font_scale?: QuotationTableFontScale;
  fontSizeScale?: QuotationFontSizeScale;
  font_size_scale?: QuotationFontSizeScale;
  show_bank_details?: boolean;
  show_commercial_terms?: boolean;
  show_company_seal?: boolean;
  showAmountInWords?: boolean;
  show_amount_in_words?: boolean;
  repeatHeaderOnSubsequentPages?: boolean;
  showBankRemittance?: boolean;
  showCustomerAcceptance?: boolean;
  showSignatories?: boolean;
  footerLayoutMode?: 'split' | 'stacked' | 'seller_only';
  header_config?: QuotationHeaderConfig;
  recipient_config?: QuotationRecipientConfig;
  footer_config?: QuotationFooterConfig;
  visible_columns?: QuotationPresetColumns;
  client_contact_person?: string;
  client_trn?: string;
  client_phone?: string;
  client_email?: string;
  client_address?: string;
  subject?: string;
  prepared_by?: string;
  price_basis?: string;
  payment_terms?: string;
  custom_notes?: string;
  block_style?: 'framed' | 'minimal';
  globalCardRadius?: 'rounded' | 'sharp';
  cardsOrder?: 'recipient_first' | 'offer_first';
  subjectPlacement?: 'above_cards' | 'below_cards';
  pageMode?: QuotationPageMode;
  layout_blocks?: QuotationBlockConfig[];
  flyer_attachments?: Attachment[];
  show_submittals_index?: boolean;
  pdf_storage_path?: string;
  pdf_download_url?: string;
  created_at: string;
  updatedAt?: string;
  updated_at?: string;
  valid_until?: string;
  parent_quote_id?: string; // Link to parent quote when revisioned
  parent_quotation_id?: string; // ID of the previous revision this was cloned from
  superseded_by_id?: string; // ID of the newer revision that superseded this quotation
  currency?: string;
  decline_reason?: string;
  decline_notes?: string;
  declined_at?: string;
  is_deleted?: boolean;
  deleted_at?: any;
  deleted_by_id?: string | null;
  deleted_by_name?: string | null;
}

export interface EnquiryQuotationSyncPayload {
  active_quotation_id: string;
  latest_quote_ref: string;
  quoted_amount: number;
  quotation_status: QuotationStatus;
  latest_revision_number: number;
}


