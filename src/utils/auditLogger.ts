import { safeAddDoc } from '../firebase';
import { AuditLog, UserProfile, AuditDiff } from '../types';
import { sanitizeAuditPayload } from '../utils/sanitizeAuditLog';

export async function recordAuditLog({
  document_id,
  entity_type,
  entity_title,
  action,
  user,
  before = null,
  after = null,
  changes = [],
  details
}: {
  document_id: string;
  entity_type: 'company' | 'contact' | 'enquiry' | 'call_log' | 'product' | 'salesperson' | 'workspace' | 'user';
  entity_title: string;
  action: 'create' | 'update' | 'delete';
  user: UserProfile;
  before?: any;
  after?: any;
  changes?: AuditDiff[];
  details?: string;
}) {
  try {
    const log: AuditLog = {
      document_id,
      entity_type,
      entity_title,
      action,
      changed_by_uid: user?.uid || 'system',
      changed_by_name: user?.username || user?.email || 'Unknown User',
      changed_by_email: user?.email || '',
      timestamp: new Date().toISOString(),
      before: sanitizeAuditPayload(before),
      after: sanitizeAuditPayload(after),
      changes: sanitizeAuditPayload(changes),
      details: details || `${action.toUpperCase()} ${entity_type}: "${entity_title}"`
    };
    await safeAddDoc('audit_logs', log);
  } catch (err) {
    console.warn('Failed to record audit log entry:', err);
  }
}
