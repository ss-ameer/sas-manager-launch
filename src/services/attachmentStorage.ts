import { Attachment } from '../types';
import { saveAttachmentBlob, getAttachmentBlob, deleteAttachmentBlob } from './db';

export { deleteAttachmentBlob };

/**
 * Storage configuration parameters for Supabase Storage
 */
export interface StorageConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  bucket?: string;
  enabled?: boolean;
  provider?: 'supabase' | string;
  [key: string]: any;
}

/**
 * Workspace settings containing optional storage configuration
 */
export interface WorkspaceStorageSettings {
  storage?: StorageConfig;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  bucket?: string;
  [key: string]: any;
}

/**
 * Converts a base64 data URL to a File object.
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Deletes an object from Supabase Storage given its public HTTPS URL or filePath.
 * Returns true if successful, or if the item was already deleted (404/204 idempotency).
 */
export async function deleteFromSupabaseStorage(
  fileUrl: string,
  storageConfig?: StorageConfig | null
): Promise<boolean> {
  if (!fileUrl || !storageConfig?.supabaseUrl || !storageConfig?.supabaseAnonKey || !storageConfig?.bucket) {
    return false;
  }

  try {
    const baseUrl = storageConfig.supabaseUrl.trim().replace(/\/+$/, '');
    const bucket = storageConfig.bucket.trim();

    // Extract filePath from public URL
    // e.g. ${baseUrl}/storage/v1/object/public/${bucket}/${filePath}
    let filePath = '';
    const prefix = `/storage/v1/object/public/${bucket}/`;
    const prefixIdx = fileUrl.indexOf(prefix);
    if (prefixIdx !== -1) {
      filePath = fileUrl.substring(prefixIdx + prefix.length);
    } else if (
      fileUrl.startsWith('enquiries/') ||
      fileUrl.startsWith('products/') ||
      fileUrl.startsWith('branding/') ||
      fileUrl.startsWith('quotations/')
    ) {
      filePath = fileUrl;
    } else {
      // Check if URL contains bucket name followed by slash
      const bucketIdx = fileUrl.indexOf(`/${bucket}/`);
      if (bucketIdx !== -1) {
        filePath = fileUrl.substring(bucketIdx + bucket.length + 2);
      }
    }

    // Strip query parameters or hashes if present
    filePath = filePath.split('?')[0].split('#')[0];
    if (!filePath) {
      console.warn('[deleteFromSupabaseStorage] Could not parse filePath from URL:', fileUrl);
      return false;
    }

    const deleteUrl = `${baseUrl}/storage/v1/object/${bucket}/${filePath}`;
    const res = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        apikey: storageConfig.supabaseAnonKey.trim(),
        Authorization: `Bearer ${storageConfig.supabaseAnonKey.trim()}`
      }
    });

    if (res.ok || res.status === 200 || res.status === 204 || res.status === 404) {
      console.log(`[deleteFromSupabaseStorage] Successfully removed ${filePath} from bucket ${bucket}`);
      return true;
    } else {
      console.warn(`[deleteFromSupabaseStorage] Delete returned status ${res.status}: ${res.statusText}`);
      return false;
    }
  } catch (err) {
    console.warn('[deleteFromSupabaseStorage] Network error deleting file from Supabase:', err);
    return false;
  }
}

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
 * Compresses an image File client-side to a clean Data URL (preserving PNG transparency for logos/stamps/signatures, or WebP/JPEG for product photos).
 */
export function compressImageToDataUrl(
  file: File,
  maxDimension: number = 700,
  quality: number = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      if (!rawDataUrl) return reject(new Error('Failed to read image file'));
      // SVG files do not need raster canvas re-encoding
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        return resolve(rawDataUrl);
      }
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width || 400;
          let height = img.height || 400;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(rawDataUrl);
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          // Preserve transparency for PNG/WebP/GIF; use JPEG for opaque photos
          const isTransparentFormat =
            file.type === 'image/png' ||
            file.type === 'image/webp' ||
            file.type === 'image/gif';
          const outMime = isTransparentFormat ? 'image/webp' : 'image/jpeg';
          let compressed = canvas.toDataURL(outMime, quality);
          // Fallback to PNG if browser doesn't encode WebP smaller
          if (isTransparentFormat && (!compressed.startsWith('data:image/webp') || compressed.length > rawDataUrl.length)) {
            const pngUrl = canvas.toDataURL('image/png');
            if (pngUrl.length <= rawDataUrl.length || width < img.width) {
              compressed = pngUrl;
            }
          }
          resolve(compressed);
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.onerror = () => resolve(rawDataUrl);
      img.src = rawDataUrl;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an image File client-side and returns both the compressed File and its Data URL.
 */
export async function compressImageFile(
  file: File,
  maxDimension: number = 700,
  quality: number = 0.82
): Promise<{ file: File; dataUrl: string }> {
  const dataUrl = await compressImageToDataUrl(file, maxDimension, quality);
  const ext = dataUrl.startsWith('data:image/webp')
    ? '.webp'
    : dataUrl.startsWith('data:image/png')
    ? '.png'
    : dataUrl.startsWith('data:image/svg')
    ? '.svg'
    : '.jpg';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const compressedFile = dataUrlToFile(dataUrl, `${baseName}${ext}`);
  return { file: compressedFile, dataUrl };
}

/**
 * Resolves active Supabase Storage config from a workspace or settings object.
 */
export function resolveWorkspaceStorageConfig(
  workspaceOrSettings?: WorkspaceStorageSettings | null
): StorageConfig | null {
  if (!workspaceOrSettings) return null;
  const candidate: StorageConfig | undefined =
    workspaceOrSettings.storage ||
    ((workspaceOrSettings as any).settings?.storage) ||
    (workspaceOrSettings.supabaseUrl ? (workspaceOrSettings as StorageConfig) : undefined) ||
    ((workspaceOrSettings as any).settings?.supabaseUrl ? ((workspaceOrSettings as any).settings as StorageConfig) : undefined);

  if (
    candidate &&
    candidate.enabled !== false &&
    candidate.supabaseUrl?.trim() &&
    candidate.supabaseAnonKey?.trim() &&
    candidate.bucket?.trim()
  ) {
    return {
      supabaseUrl: candidate.supabaseUrl.trim(),
      supabaseAnonKey: candidate.supabaseAnonKey.trim(),
      bucket: candidate.bucket.trim(),
      enabled: true,
      provider: 'supabase'
    };
  }
  return null;
}

/**
 * Uploads a file directly to Supabase Storage via REST API and returns a persistent public HTTPS URL.
 */
export function uploadToSupabaseStorage(
  file: File,
  storageConfig?: StorageConfig | null,
  onProgress?: (percent: number) => void,
  folder: string = 'enquiries'
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!storageConfig?.supabaseUrl || !storageConfig?.supabaseAnonKey || !storageConfig?.bucket) {
      return reject(new Error('Incomplete Supabase storage configuration. Check Project URL, Key, and Bucket.'));
    }

    const cleanFolder = (folder || 'enquiries').replace(/^\/+|\/+$/g, '');
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${cleanFolder}/${Date.now()}_${cleanFileName}`;
    const baseUrl = storageConfig.supabaseUrl.trim().replace(/\/+$/, '');
    const bucket = storageConfig.bucket.trim();
    const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${filePath}`;

    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl, true);

    xhr.setRequestHeader('apikey', storageConfig.supabaseAnonKey.trim());
    xhr.setRequestHeader('Authorization', `Bearer ${storageConfig.supabaseAnonKey.trim()}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.round((evt.loaded / evt.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
        if (onProgress) onProgress(100);
        resolve(publicUrl);
      } else {
        let errMsg = `Upload failed with HTTP ${xhr.status}`;
        try {
          const resp = JSON.parse(xhr.responseText);
          if (resp?.message || resp?.error) {
            errMsg = resp.message || resp.error;
          }
        } catch (_) {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during Supabase upload. Please verify Supabase URL, bucket name, and CORS policy.'));
    };

    xhr.send(file);
  });
}

/**
 * Unified helper to upload Product Catalog Images, Product Datasheets, and Quotation Studio Branding Assets
 * to the workspace's Custom Supabase Storage Bucket, with client-side image compression and automatic fallback
 * when offline or unconfigured.
 */
export async function uploadWorkspaceMediaAsset(
  file: File,
  folder: string,
  workspaceOrSettings?: WorkspaceStorageSettings | null,
  options?: {
    compressImage?: boolean;
    maxDimension?: number;
    maxWidth?: number;
    maxHeight?: number;
    preserveTransparency?: boolean;
    quality?: number;
    onProgress?: (percent: number) => void;
  }
): Promise<{
  url: string;
  isLocal: boolean;
  storageProvider: 'supabase' | 'local';
  size: number;
  type: string;
  name: string;
  storageKey?: string;
  storagePath?: string;
}> {
  const isImage = file.type.startsWith('image/');
  let targetFile = file;
  let fallbackDataUrl = '';

  if (isImage && options?.compressImage !== false) {
    const compressed = await compressImageFile(
      file,
      options?.maxDimension ?? options?.maxWidth ?? 700,
      options?.quality ?? 0.82
    );
    targetFile = compressed.file;
    fallbackDataUrl = compressed.dataUrl;
  }

  const storageConfig = resolveWorkspaceStorageConfig(workspaceOrSettings);
  if (storageConfig) {
    try {
      const cloudUrl = await uploadToSupabaseStorage(
        targetFile,
        storageConfig,
        options?.onProgress,
        folder
      );
      return {
        url: cloudUrl,
        isLocal: false,
        storageProvider: 'supabase',
        size: targetFile.size,
        type: targetFile.type || file.type,
        name: file.name
      };
    } catch (err) {
      console.warn(`[uploadWorkspaceMediaAsset] Cloud bucket upload failed for ${folder}, falling back to local storage:`, err);
    }
  }

  // Fallback when bucket is unconfigured or unreachable
  if (!fallbackDataUrl) {
    fallbackDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string) || '');
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(targetFile);
    });
  }

  const storageKey = `blob_${folder.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  try {
    await saveAttachmentBlob(storageKey, fallbackDataUrl);
  } catch (_) {}

  if (options?.onProgress) options.onProgress(100);

  return {
    url: fallbackDataUrl,
    isLocal: true,
    storageProvider: 'local',
    size: targetFile.size,
    type: targetFile.type || file.type,
    name: file.name,
    storageKey
  };
}

/**
 * Tests connectivity to a Supabase Storage bucket.
 */
export async function testSupabaseStorageConnection(storageConfig: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  bucket: string;
}): Promise<{ success: boolean; message: string }> {
  try {
    const baseUrl = (storageConfig.supabaseUrl || '').trim().replace(/\/+$/, '');
    const bucket = (storageConfig.bucket || '').trim();
    const key = (storageConfig.supabaseAnonKey || '').trim();

    if (!baseUrl || !bucket || !key) {
      return { success: false, message: 'Please provide Supabase URL, Anon Key, and Bucket name.' };
    }

    const testUrl = `${baseUrl}/storage/v1/bucket/${bucket}`;
    const res = await fetch(testUrl, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });

    if (res.ok) {
      const data = await res.json();
      const isPublic = data?.public !== false;
      return {
        success: true,
        message: `Bucket "${bucket}" is reachable and active (${isPublic ? 'Public bucket' : 'Private bucket'}).`
      };
    } else {
      let errText = `HTTP ${res.status} ${res.statusText}`;
      try {
        const json = await res.json();
        if (json?.message || json?.error) errText = json.message || json.error;
      } catch (_) {}
      return { success: false, message: `Unable to reach bucket: ${errText}` };
    }
  } catch (err: any) {
    return { success: false, message: `Connection test failed: ${err.message || 'Network error'}` };
  }
}

/**
 * Process attachments before saving an Enquiry to Firestore.
 * - Stores large binary data (data URLs) into IndexedDB.
 * - Leaves persistent HTTPS cloud URLs intact without bloating or stripping.
 * - Returns a lightweight version for Firestore (strips data URLs > 25KB).
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

    // Check if cloud URL (HTTPS / HTTP)
    const isCloudUrl = typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'));

    if (isCloudUrl) {
      // Keep cloud URL intact, mark isLocal: false, and do NOT write or strip
      const memoryAtt: Attachment = {
        ...att,
        id: att.id || key,
        storageKey: key,
        url: rawUrl,
        isLocal: false
      };
      memoryAttachments.push(memoryAtt);

      firestoreAttachments.push({
        name: att.name,
        size: att.size,
        type: att.type || 'application/pdf',
        uploadedAt: att.uploadedAt || new Date().toISOString(),
        url: rawUrl,
        id: att.id || key,
        storageKey: key,
        isLocal: false,
        storageProvider: att.storageProvider || 'supabase',
        include_in_quote_annex: att.include_in_quote_annex,
        render_as_annex_page: att.render_as_annex_page,
        uploadedByUserName: att.uploadedByUserName
      });
      continue;
    }

    // Local mode (base64 data: or empty string)
    const memoryAtt: Attachment = {
      ...att,
      id: att.id || key,
      storageKey: key,
      url: rawUrl,
      isLocal: true
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
      storageKey: key,
      isLocal: true,
      storageProvider: att.storageProvider || 'local',
      include_in_quote_annex: att.include_in_quote_annex,
      render_as_annex_page: att.render_as_annex_page,
      uploadedByUserName: att.uploadedByUserName
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
      // If it's a cloud URL, leave untouched
      if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
        return {
          ...att,
          isLocal: false
        };
      }
      if (typeof url === 'string' && url.startsWith('data:') && url.length > 25000) {
        const key = att.storageKey || att.id || `blob_${att.name || 'file'}_${i}`;
        // Async save to IndexedDB as safety net
        saveAttachmentBlob(key, url).catch(() => {});
        return {
          ...att,
          storageKey: key,
          url: '',
          isLocal: true
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

/**
 * Permanently deletes an enquiry's attachments from both Supabase cloud storage and IndexedDB.
 * Handles missing/null arrays gracefully, catches and settles all child deletion promises,
 * and strictly isolates storage credentials to the provided workspace settings.
 */
export async function purgeEnquiryAttachments(
  attachments?: Attachment[] | null,
  workspaceSettings?: WorkspaceStorageSettings | null
): Promise<void> {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return;
  }

  // Resolve storage config safely and strictly from the provided workspaceSettings
  const storageConfig: StorageConfig | undefined =
    workspaceSettings?.storage || (workspaceSettings?.supabaseUrl ? workspaceSettings : undefined);

  const supabaseUrl = storageConfig?.supabaseUrl?.trim();
  const supabaseAnonKey = storageConfig?.supabaseAnonKey?.trim();
  const bucket = storageConfig?.bucket?.trim();

  const hasCloud = Boolean(supabaseUrl && supabaseAnonKey && bucket);

  const purgePromises = attachments.map(async (att) => {
    if (!att || typeof att !== 'object') return;
    const rawUrl = (att as any).url || (att as any).fileUrl || (att as any).downloadURL || (att as any).downloadUrl || '';

    // 1. Cloud storage deletion if hosted on Supabase and workspace has valid credentials
    if (typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && hasCloud && supabaseUrl && supabaseAnonKey && bucket) {
      try {
        await deleteFromSupabaseStorage(rawUrl, {
          supabaseUrl,
          supabaseAnonKey,
          bucket
        });
      } catch (err) {
        console.warn(`[purgeEnquiryAttachments] Failed removing cloud attachment ${att.name}:`, err);
      }
    }

    // 2. IndexedDB blob cleanup
    const key = att.storageKey || (att.id ? `blob_${att.id}` : '') || getAttachmentStorageKey(att);
    if (key) {
      try {
        await deleteAttachmentBlob(key);
      } catch (err) {
        console.warn(`[purgeEnquiryAttachments] Failed removing local blob ${key}:`, err);
      }
    }
  });

  await Promise.allSettled(purgePromises);
}
