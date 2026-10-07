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

export type LegalSuffix = 'None / To Be Added Later' | 'LLC' | 'FZE' | 'FZC' | 'Co. LLC' | 'Ltd' | 'W.L.L.' | 'Est.' | 'None / Other';

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
  canonical_name: string;
  legal_suffix: LegalSuffix;
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
  size: number;
  type: string;
  url: string;
  fileUrl?: string;
  downloadURL?: string;
  storageKey?: string;
  uploadedAt: string;
  isLocal?: boolean;
  uploadedByUserName?: string;
  storageProvider?: 'supabase' | 'local';
}

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
  sales_rep_id?: string;
  salesRepresentativeId?: string;
  sales_representative?: string;
  salesRep?: string;
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
    enquiry.assignedSalesperson ||
    enquiry.sales_person ||
    enquiry.salesperson ||
    enquiry.assigned_to ||
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

