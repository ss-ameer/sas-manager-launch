/**
 * Reference ID generator and formatter utility for system entities.
 * Standardizes IDs across Call Logs, Companies, Contacts, Enquiries, etc.
 * Example formats:
 *   Call Log: CL-0004
 *   Company: CMP-0012
 *   Contact: CT-0008
 *   Enquiry: EQ-0003
 */

/**
 * Extracts sequence integer from a code string matching TYPE-XXXX or containing numeric digits
 */
export function extractRefNumber(type: string, code?: string | null): number | null {
  if (!code || typeof code !== 'string') return null;
  const regex = new RegExp(`${type}-(?:\\d{4}-)?(\\d+)`, 'i');
  const match = code.match(regex);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Parses existing items in allItems, finds the maximum integer sequence for the prefix,
 * and generates the next +1 reference ID (e.g. CL-0005).
 */
export function generateNextRefId(
  type: 'CL' | 'CMP' | 'CT' | 'EQ',
  allItems: any[] = []
): string {
  let maxNum = 0;

  for (const item of allItems) {
    if (!item) continue;
    const candidates = [item.ref_code, item.ref_id, item.quote_ref_no, item.id];
    for (const c of candidates) {
      const num = extractRefNumber(type, c);
      if (num !== null && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const nextNum = maxNum + 1;
  return `${type}-${String(nextNum).padStart(4, '0')}`;
}

export function getReferenceId(
  type: 'CL' | 'CMP' | 'CT' | 'EQ',
  item: {
    id?: string;
    ref_id?: string;
    ref_code?: string;
    quote_ref_no?: string;
    createdAt?: string;
    created_at?: string;
    date?: string;
    _pending?: boolean;
    is_offline?: boolean;
    is_pending?: boolean;
  } | null | undefined,
  allItems: any[] = []
): string {
  if (!item) return '';

  if (item.ref_code) return item.ref_code;
  if (item.ref_id) return item.ref_id;
  if (type === 'EQ' && item.quote_ref_no) return item.quote_ref_no;

  const rawId = item.id || '';

  // Check if rawId itself is formatted like TYPE-XXXX
  if (rawId.startsWith(`${type}-`) && /^\w+-\d+$/.test(rawId)) {
    return rawId;
  }

  // Unsynced/local items show PENDING placeholder until confirmed synced to server
  if (
    !rawId ||
    item._pending ||
    item.is_pending ||
    item.is_offline ||
    rawId.startsWith('local_') ||
    rawId.startsWith('temp_') ||
    rawId.startsWith('offline_')
  ) {
    return `${type}-PENDING`;
  }

  // Filter synced items
  const syncedItems = (allItems || []).filter(
    (x) =>
      x &&
      x.id &&
      !x.id.startsWith('local_') &&
      !x.id.startsWith('temp_') &&
      !x.id.startsWith('offline_') &&
      !x._pending &&
      !x.is_pending &&
      !x.is_offline
  );

  // Search if item has explicit number or find its max sequence position
  const selfNum = extractRefNumber(type, rawId);
  if (selfNum !== null) {
    return `${type}-${String(selfNum).padStart(4, '0')}`;
  }

  // Find maximum sequence number across all items
  let maxExplicitNum = 0;
  for (const x of syncedItems) {
    const candidates = [x.ref_code, x.ref_id, x.quote_ref_no, x.id];
    for (const c of candidates) {
      const num = extractRefNumber(type, c);
      if (num !== null && num > maxExplicitNum) {
        maxExplicitNum = num;
      }
    }
  }

  if (syncedItems.length > 0) {
    const sorted = [...syncedItems].sort((a, b) => {
      const dateA = a.createdAt || a.created_at || a.date || '';
      const dateB = b.createdAt || b.created_at || b.date || '';
      if (dateA && dateB && dateA !== dateB) {
        return dateA.localeCompare(dateB);
      }
      return (a.id || '').localeCompare(b.id || '');
    });

    const index = sorted.findIndex((x) => x.id === rawId);
    if (index !== -1) {
      // Offset by maxExplicitNum if items exist with higher IDs, ensuring uniqueness
      const seq = index + 1;
      const finalNum = Math.max(seq, maxExplicitNum ? seq : index + 1);
      return `${type}-${String(finalNum).padStart(4, '0')}`;
    }
  }

  // Fallback if not matched in array
  const sanitized = rawId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const shortHash = sanitized.slice(-4).padStart(4, '0');

  return `${type}-${shortHash}`;
}

