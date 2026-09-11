import { Attachment } from '../types';
import { saveAttachmentBlob, getAttachmentBlob } from './db';

/**
 * Generate a consistent storage key for an attachment
 */
export function getAttachmentStorageKey(att: Partial<Attachment>, index: number = 0, enquiryId?: string): string {
  if (att.storageKey && att.storageKey.trim()) return att.storageKey.trim();
  if (att.id && att.id.trim()) return `blob_${att.id.trim()}`;
  const safeName = (att.name || 'file').replace(/[^a-zA-Z0-9_-]/g, '_');
  const parentPrefix = enquiryId ? `enq_${enquiryId}_` : '';
  return `blob_${parentPrefix}${safeName}_${att.size || 0}_${index}`;
}

/**
 * Process attachments before saving an Enquiry to Firestore.
 * - Stores large binary data (data URLs) into IndexedDB.
 * - Returns a lightweight version for Firestore (strips data URLs > 30KB).
 * - Returns a full-resolution version for immediate in-memory state.
 */
export async function prepareAttachmentsForSave(
  attachments: Attachment[] | undefined,
  enquiryId?: string
): Promise<{
  firestoreAttachments: Attachment[] | undefined;
  memoryAttachments: Attachment[];
}> {
  if (!attachments || attachments.length === 0) {
    return { firestoreAttachments: undefined, memoryAttachments: [] };
  }

  const memoryAttachments: Attachment[] = [];
  const firestoreAttachments: Attachment[] = [];

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const key = getAttachmentStorageKey(att, i, enquiryId);
    const rawUrl = (att as any).url || (att as any).fileUrl || (att as any).downloadURL || (att as any).downloadUrl || '';

    // In memory version keeps the actual previewable URL
    const memoryAtt: Attachment = {
      ...att,
      id: att.id || key,
      storageKey: key,
      url: rawUrl
    };
    memoryAttachments.push(memoryAtt);

    // If it's a base64 data URL, persist to IndexedDB
    if (rawUrl.startsWith('data:')) {
      await saveAttachmentBlob(key, rawUrl);
    }

    // For Firestore document: prevent exceeding the 1 MiB (1,048,576 byte) document limit!
    // If the data URL is larger than 25,000 characters, do NOT store it in the Firestore document.
    const isLargeDataUrl = rawUrl.startsWith('data:') && rawUrl.length > 25000;
    const firestoreUrl = isLargeDataUrl ? '' : rawUrl;

    firestoreAttachments.push({
      name: att.name,
      size: att.size,
      type: att.type || 'application/pdf',
      uploadedAt: att.uploadedAt || new Date().toISOString(),
      url: firestoreUrl,
      id: att.id || key,
      storageKey: key
    });
  }

  return { firestoreAttachments, memoryAttachments };
}

/**
 * Resolves an attachment's viewable URL from IndexedDB if not directly in the object.
 */
export async function resolveAttachmentUrl(att: Attachment | null | undefined): Promise<string> {
  if (!att) return '';
  const rawUrl = (att as any).url || (att as any).fileUrl || (att as any).downloadURL || (att as any).downloadUrl || '';
  if (rawUrl && typeof rawUrl === 'string' && rawUrl.trim() !== '') {
    return rawUrl.trim();
  }

  const key = att.storageKey || (att.id ? `blob_${att.id}` : '') || getAttachmentStorageKey(att);
  if (key) {
    const localData = await getAttachmentBlob(key);
    if (localData) return localData;
  }

  return '';
}

/**
 * Sanitizes any Firestore payload to ensure it never exceeds the 1MB document limit
 */
export function sanitizeFirestorePayload(payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;

  const copy = { ...payload };

  // Sanitize attachments if present
  if (Array.isArray(copy.attachments)) {
    copy.attachments = copy.attachments.map((att: any, i: number) => {
      const url = att?.url || '';
      if (typeof url === 'string' && url.startsWith('data:') && url.length > 25000) {
        const key = att.storageKey || att.id || `blob_${att.name || 'file'}_${i}`;
        // Async save to IndexedDB as safety net
        saveAttachmentBlob(key, url).catch(() => {});
        return {
          ...att,
          storageKey: key,
          url: ''
        };
      }
      return att;
    });
  }

  // Truncate massive raw text if present
  if (typeof copy.raw_source_text === 'string' && copy.raw_source_text.length > 500000) {
    copy.raw_source_text = copy.raw_source_text.substring(0, 500000) + '\n\n[TRUNCATED TO PREVENT FIRESTORE 1MB LIMIT]';
  }

  return copy;
}
