import { Attachment } from '../types';
import { saveAttachmentBlob, getAttachmentBlob, deleteAttachmentBlob } from './db';
import { jsPDF } from 'jspdf';

export { deleteAttachmentBlob };

export type PdfCompressionPreset = 'standard' | 'extreme' | 'original';

export interface PdfCompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  compressionRatioPct: number;
  presetUsed: PdfCompressionPreset;
  wasCompressed: boolean;
  badgeText: string;
}

/**
 * Formats byte sizes cleanly (e.g., "5.1 MB", "240 KB")
 */
export function formatByteSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Storage configuration parameters for Supabase Storage
 */
export interface StorageConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  bucket?: string;
  enabled?: boolean;
  provider?: 'supabase' | string;
  pdfCompressionPreset?: PdfCompressionPreset;
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
 * Extracts the bucket-relative object path from a public URL or path string.
 */
export function extractBucketObjectPath(fileUrlOrPath: string, bucket: string): string {
  if (!fileUrlOrPath) return '';
  const trimmed = fileUrlOrPath.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';

  let filePath = '';
  const prefix = `/storage/v1/object/public/${bucket}/`;
  const authPrefix = `/storage/v1/object/${bucket}/`;
  const prefixIdx = trimmed.indexOf(prefix);
  const authIdx = trimmed.indexOf(authPrefix);

  if (prefixIdx !== -1) {
    filePath = trimmed.substring(prefixIdx + prefix.length);
  } else if (authIdx !== -1) {
    filePath = trimmed.substring(authIdx + authPrefix.length);
  } else if (
    trimmed.startsWith('enquiries/') ||
    trimmed.startsWith('products/') ||
    trimmed.startsWith('branding/') ||
    trimmed.startsWith('quotations/') ||
    trimmed.startsWith('procurement/')
  ) {
    filePath = trimmed;
  } else {
    const bucketIdx = trimmed.indexOf(`/${bucket}/`);
    if (bucketIdx !== -1) {
      filePath = trimmed.substring(bucketIdx + bucket.length + 2);
    }
  }

  return decodeURIComponent(filePath.split('?')[0].split('#')[0]).replace(/^\/+/, '');
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
    const filePath = extractBucketObjectPath(fileUrl, bucket);

    if (!filePath) {
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
 * Unified helper to delete an object from the configured Cloud Storage Bucket AND local IndexedDB.
 * Safe to call whenever an attachment, product photo, line item image, brand asset, or supplier bill scan is removed or replaced.
 */
export async function deleteFromStorageBucket(
  fileUrlOrPath?: string | null,
  workspaceOrSettings?: WorkspaceStorageSettings | null,
  localStorageKey?: string | null
): Promise<boolean> {
  let deletedCloud = false;

  if (fileUrlOrPath && typeof fileUrlOrPath === 'string') {
    const trimmed = fileUrlOrPath.trim();
    const storageConfig = resolveWorkspaceStorageConfig(workspaceOrSettings);
    if (
      storageConfig &&
      (trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.startsWith('enquiries/') ||
        trimmed.startsWith('products/') ||
        trimmed.startsWith('branding/') ||
        trimmed.startsWith('quotations/') ||
        trimmed.startsWith('procurement/'))
    ) {
      deletedCloud = await deleteFromSupabaseStorage(trimmed, storageConfig);
    }
  }

  if (localStorageKey) {
    try {
      await deleteAttachmentBlob(localStorageKey);
    } catch (_) {}
  }

  return deletedCloud;
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
 * Compresses an image File client-side to a clean Data URL.
 * Optimized defaults: maxDimension 800px (or 1200px for wide diagrams) and quality 0.78
 * so product/line-item images stay between 20KB and 65KB for 1GB bucket protection.
 */
export function compressImageToDataUrl(
  file: File,
  maxDimension: number = 800,
  quality: number = 0.78
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      if (!rawDataUrl) return reject(new Error('Failed to read image file'));
      if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
        return resolve(rawDataUrl);
      }
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width || 400;
          let height = img.height || 400;
          const aspectRatio = width / Math.max(1, height);
          const effectiveMaxDim =
            maxDimension === 800 && (aspectRatio >= 1.85 || aspectRatio <= 0.55)
              ? 1200
              : maxDimension;

          if (width > effectiveMaxDim || height > effectiveMaxDim) {
            if (width > height) {
              height = Math.round((height * effectiveMaxDim) / width);
              width = effectiveMaxDim;
            } else {
              width = Math.round((width * effectiveMaxDim) / height);
              height = effectiveMaxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(rawDataUrl);
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const isTransparentFormat =
            file.type === 'image/png' ||
            file.type === 'image/webp' ||
            file.type === 'image/gif';
          const outMime = isTransparentFormat ? 'image/webp' : 'image/jpeg';
          let compressed = canvas.toDataURL(outMime, quality);

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
  maxDimension: number = 800,
  quality: number = 0.78
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

let sharedPdfJsPromise: Promise<any> | null = null;

function ensurePdfJsLoaded(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).pdfjsLib) {
    return Promise.resolve((window as any).pdfjsLib);
  }
  if (sharedPdfJsPromise) return sharedPdfJsPromise;

  sharedPdfJsPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Window is not available for PDF compression'));
    }
    if ((window as any).pdfjsLib) {
      return resolve((window as any).pdfjsLib);
    }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.async = true;
    script.onload = () => {
      const lib = (window as any).pdfjsLib;
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        resolve(lib);
      } else {
        sharedPdfJsPromise = null;
        reject(new Error('PDF.js loaded without window.pdfjsLib'));
      }
    };
    script.onerror = () => {
      sharedPdfJsPromise = null;
      reject(new Error('Failed to load PDF.js engine'));
    };
    document.body.appendChild(script);
  });

  return sharedPdfJsPromise;
}

/**
 * In-App Acrobat-Style PDF Compression (5 MB -> ~200 KB)
 * Uses PDF.js canvas rendering + jsPDF JPEG page assembly when a PDF exceeds 300 KB.
 * Presets:
 * - 'standard': ~150 DPI (scale 1.50), JPEG quality 0.74
 * - 'extreme': ~110 DPI (scale 1.12), JPEG quality 0.58
 * - 'original': skips compression and preserves original file
 */
export async function compressPdfFile(
  file: File,
  preset: PdfCompressionPreset = 'standard',
  onProgress?: (percent: number) => void
): Promise<PdfCompressionResult> {
  const originalSize = file.size;
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  // Skip compression if not a PDF, preset is 'original', or file is already <= 300 KB
  if (!isPdf || preset === 'original' || originalSize <= 300 * 1024) {
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      compressionRatioPct: 0,
      presetUsed: preset,
      wasCompressed: false,
      badgeText: `${formatByteSize(originalSize)} (Original)`
    };
  }

  try {
    const pdfjs = await ensurePdfJsLoaded();
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages || 1;

    // Limit client-side raster re-encoding to documents up to 60 pages for responsiveness
    if (numPages > 60) {
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        savedBytes: 0,
        compressionRatioPct: 0,
        presetUsed: 'original',
        wasCompressed: false,
        badgeText: `${formatByteSize(originalSize)} (${numPages} pages • Kept Original)`
      };
    }

    const scale = preset === 'extreme' ? 1.12 : 1.52;
    const jpegQuality = preset === 'extreme' ? 0.58 : 0.74;

    let doc: jsPDF | null = null;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const baseViewport = page.getViewport({ scale: 1.0 });
      const renderViewport = page.getViewport({ scale });

      // Convert PDF points (72 pt = 1 inch = 25.4 mm) to mm
      const pageWidthMm = Math.max(50, (baseViewport.width * 25.4) / 72);
      const pageHeightMm = Math.max(50, (baseViewport.height * 25.4) / 72);
      const orientation: 'p' | 'l' = pageWidthMm > pageHeightMm ? 'l' : 'p';

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(renderViewport.width);
      canvas.height = Math.round(renderViewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: renderViewport
      }).promise;

      const pageJpegDataUrl = canvas.toDataURL('image/jpeg', jpegQuality);

      if (!doc) {
        doc = new jsPDF({
          orientation,
          unit: 'mm',
          format: [pageWidthMm, pageHeightMm],
          compress: true
        });
      } else {
        doc.addPage([pageWidthMm, pageHeightMm], orientation);
      }

      doc.addImage(
        pageJpegDataUrl,
        'JPEG',
        0,
        0,
        pageWidthMm,
        pageHeightMm,
        undefined,
        'FAST'
      );

      if (onProgress) {
        onProgress(Math.min(90, Math.round((pageNum / numPages) * 85)));
      }
    }

    if (!doc) {
      throw new Error('No pages rendered during PDF compression');
    }

    const pdfBlob = doc.output('blob');
    const compressedFile = new File([pdfBlob], file.name, {
      type: 'application/pdf',
      lastModified: Date.now()
    });

    // Only keep compressed PDF if it is genuinely smaller than the original
    if (compressedFile.size >= originalSize * 0.95) {
      return {
        file,
        originalSize,
        compressedSize: originalSize,
        savedBytes: 0,
        compressionRatioPct: 0,
        presetUsed: 'original',
        wasCompressed: false,
        badgeText: `${formatByteSize(originalSize)} (Already Optimal)`
      };
    }

    const savedBytes = originalSize - compressedFile.size;
    const compressionRatioPct = Math.round((savedBytes / originalSize) * 100);
    const badgeText = `${formatByteSize(originalSize)} → ${formatByteSize(compressedFile.size)} (-${compressionRatioPct}%)`;

    return {
      file: compressedFile,
      originalSize,
      compressedSize: compressedFile.size,
      savedBytes,
      compressionRatioPct,
      presetUsed: preset,
      wasCompressed: true,
      badgeText
    };
  } catch (err) {
    console.warn('[compressPdfFile] Fallback to original PDF:', err);
    return {
      file,
      originalSize,
      compressedSize: originalSize,
      savedBytes: 0,
      compressionRatioPct: 0,
      presetUsed: 'original',
      wasCompressed: false,
      badgeText: `${formatByteSize(originalSize)}`
    };
  }
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
      provider: 'supabase',
      pdfCompressionPreset: candidate.pdfCompressionPreset || 'standard'
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
 * Unified helper to upload Product Catalog Images, Product Datasheets, Supplier Bill Scans, and Quotation Studio Assets
 * to the workspace's Custom Supabase Storage Bucket, with client-side image & PDF compression and automatic fallback
 * when offline or unconfigured. Also optionally deletes a replaced previousUrl from the bucket.
 */
export async function uploadWorkspaceMediaAsset(
  file: File,
  folder: string,
  workspaceOrSettings?: WorkspaceStorageSettings | null,
  options?: {
    compressImage?: boolean;
    compressPdf?: boolean;
    pdfCompressionPreset?: PdfCompressionPreset;
    previousUrlToDelete?: string | null;
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
  compressedSize: number;
  originalSize: number;
  wasCompressed: boolean;
  compressionRatioPct?: number;
  compressionPreset?: PdfCompressionPreset;
  compressionBadgeText?: string;
  type: string;
  name: string;
  storageKey?: string;
  storagePath?: string;
}> {
  const originalSize = file.size;
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  let targetFile = file;
  let fallbackDataUrl = '';
  let compressionRatioPct: number | undefined = undefined;
  let compressionPreset: PdfCompressionPreset | undefined = undefined;
  let compressionBadgeText: string | undefined = undefined;

  const storageConfig = resolveWorkspaceStorageConfig(workspaceOrSettings);

  if (isImage && options?.compressImage !== false) {
    const compressed = await compressImageFile(
      file,
      options?.maxDimension ?? options?.maxWidth ?? 800,
      options?.quality ?? 0.78
    );
    targetFile = compressed.file;
    fallbackDataUrl = compressed.dataUrl;
    if (originalSize > targetFile.size) {
      compressionRatioPct = Math.round(((originalSize - targetFile.size) / originalSize) * 100);
      compressionBadgeText = `${formatByteSize(originalSize)} → ${formatByteSize(targetFile.size)} (-${compressionRatioPct}%)`;
    }
  } else if (isPdf && options?.compressPdf !== false) {
    const presetToUse: PdfCompressionPreset =
      options?.pdfCompressionPreset || storageConfig?.pdfCompressionPreset || 'standard';
    const pdfRes = await compressPdfFile(file, presetToUse, options?.onProgress);
    targetFile = pdfRes.file;
    compressionPreset = pdfRes.presetUsed;
    compressionRatioPct = pdfRes.compressionRatioPct;
    compressionBadgeText = pdfRes.badgeText;
  }

  // If replacing an existing bucket asset, delete the old object from the bucket
  if (options?.previousUrlToDelete) {
    deleteFromStorageBucket(options.previousUrlToDelete, workspaceOrSettings).catch(() => {});
  }

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
        compressedSize: targetFile.size,
        originalSize,
        wasCompressed: originalSize > targetFile.size,
        compressionRatioPct,
        compressionPreset,
        compressionBadgeText,
        type: targetFile.type || file.type,
        name: targetFile.name || file.name
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
    compressedSize: targetFile.size,
    originalSize,
    wasCompressed: originalSize > targetFile.size,
    compressionRatioPct,
    compressionPreset,
    compressionBadgeText,
    type: targetFile.type || file.type,
    name: targetFile.name || file.name,
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

export interface BucketObjectEntry {
  name: string;
  fullPath: string;
  publicUrl: string;
  sizeBytes: number;
  createdAt?: string;
}

export interface BucketOrphanScanResult {
  totalObjects: number;
  totalFiles: number;
  totalSizeBytes: number;
  totalBytes: number;
  referencedCount: number;
  orphanedObjects: BucketObjectEntry[];
  orphanedPaths: BucketObjectEntry[];
  orphanedCount: number;
  orphanedSizeBytes: number;
  orphanedBytes: number;
}

/**
 * Lists all objects across standard workspace folders in the configured Supabase Storage bucket.
 */
export async function listWorkspaceBucketObjects(
  storageConfig: StorageConfig
): Promise<BucketObjectEntry[]> {
  if (!storageConfig.supabaseUrl || !storageConfig.supabaseAnonKey || !storageConfig.bucket) {
    return [];
  }
  const baseUrl = storageConfig.supabaseUrl.trim().replace(/\/+$/, '');
  const bucket = storageConfig.bucket.trim();
  const key = storageConfig.supabaseAnonKey.trim();
  const listUrl = `${baseUrl}/storage/v1/object/list/${bucket}`;

  const folders = [
    '',
    'enquiries',
    'products',
    'products/images',
    'products/datasheets',
    'quotations',
    'quotations/annexes',
    'branding',
    'procurement',
    'procurement/bills'
  ];

  const discovered = new Map<string, BucketObjectEntry>();

  for (const prefix of folders) {
    try {
      const res = await fetch(listUrl, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prefix,
          limit: 500,
          offset: 0,
          sortBy: { column: 'name', order: 'asc' }
        })
      });
      if (!res.ok) continue;
      const items = await res.json();
      if (!Array.isArray(items)) continue;

      for (const item of items) {
        if (!item || !item.name) continue;
        // Skip folder placeholders (items without id and metadata)
        if (!item.id && !item.metadata) continue;
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${fullPath}`;
        const sizeBytes = Number(item.metadata?.size || 0);
        discovered.set(fullPath, {
          name: item.name,
          fullPath,
          publicUrl,
          sizeBytes,
          createdAt: item.created_at || item.updated_at
        });
      }
    } catch (err) {
      console.warn(`[listWorkspaceBucketObjects] Failed listing prefix "${prefix}":`, err);
    }
  }

  return Array.from(discovered.values());
}

/**
 * Scans the Supabase Storage bucket and compares against all active URLs referenced in Firestore
 * to identify orphaned files that can be safely purged to reclaim 1GB quota space.
 */
export async function scanBucketForOrphanedFiles(
  workspaceOrSettings: WorkspaceStorageSettings | null | undefined,
  activeReferencedUrls: Iterable<string>
): Promise<BucketOrphanScanResult> {
  const storageConfig = resolveWorkspaceStorageConfig(workspaceOrSettings);
  if (!storageConfig || !storageConfig.bucket) {
    throw new Error('Cloud Storage bucket is not configured.');
  }

  const bucket = storageConfig.bucket.trim();
  const normalizedActivePaths = new Set<string>();
  for (const rawUrl of activeReferencedUrls) {
    if (!rawUrl || typeof rawUrl !== 'string') continue;
    const p = extractBucketObjectPath(rawUrl, bucket);
    if (p) normalizedActivePaths.add(p);
  }

  const allObjects = await listWorkspaceBucketObjects(storageConfig);
  let totalSizeBytes = 0;
  let orphanedSizeBytes = 0;
  const orphanedObjects: BucketObjectEntry[] = [];

  for (const obj of allObjects) {
    totalSizeBytes += obj.sizeBytes;
    const normalizedObjPath = obj.fullPath.replace(/^\/+/, '');
    if (!normalizedActivePaths.has(normalizedObjPath)) {
      orphanedObjects.push(obj);
      orphanedSizeBytes += obj.sizeBytes;
    }
  }

  return {
    totalObjects: allObjects.length,
    totalFiles: allObjects.length,
    totalSizeBytes,
    totalBytes: totalSizeBytes,
    referencedCount: allObjects.length - orphanedObjects.length,
    orphanedObjects,
    orphanedPaths: orphanedObjects,
    orphanedCount: orphanedObjects.length,
    orphanedSizeBytes,
    orphanedBytes: orphanedSizeBytes
  };
}

/**
 * Deletes a list of orphaned bucket objects and returns the count and bytes reclaimed.
 */
export async function purgeOrphanedBucketFiles(
  workspaceOrSettings: WorkspaceStorageSettings | null | undefined,
  orphanedObjects: BucketObjectEntry[]
): Promise<{ deletedCount: number; reclaimedBytes: number; failedCount: number }> {
  const storageConfig = resolveWorkspaceStorageConfig(workspaceOrSettings);
  if (!storageConfig) return { deletedCount: 0, reclaimedBytes: 0, failedCount: 0 };

  let deletedCount = 0;
  let reclaimedBytes = 0;
  let failedCount = 0;

  for (const obj of orphanedObjects) {
    const ok = await deleteFromSupabaseStorage(obj.fullPath, storageConfig);
    if (ok) {
      deletedCount++;
      reclaimedBytes += obj.sizeBytes;
    } else {
      failedCount++;
    }
  }

  return { deletedCount, reclaimedBytes, failedCount };
}

/**
 * Process attachments before saving an Enquiry to Firestore.
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

    const isCloudUrl = typeof rawUrl === 'string' && (rawUrl.startsWith('http://') || rawUrl.startsWith('https://'));

    if (isCloudUrl) {
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
        custom_title: att.custom_title,
        show_title_on_annex: att.show_title_on_annex,
        page_placement: att.page_placement,
        full_bleed: att.full_bleed,
        exclude_from_page_count: att.exclude_from_page_count,
        uploadedByUserName: att.uploadedByUserName,
        originalSize: att.originalSize,
        compressedSize: att.compressedSize,
        compressionRatioPct: att.compressionRatioPct,
        compressionPreset: att.compressionPreset
      });
      continue;
    }

    const memoryAtt: Attachment = {
      ...att,
      id: att.id || key,
      storageKey: key,
      url: rawUrl,
      isLocal: true
    };
    memoryAttachments.push(memoryAtt);

    if (rawUrl.startsWith('data:')) {
      await saveAttachmentBlob(key, rawUrl);
    }

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
      custom_title: att.custom_title,
      show_title_on_annex: att.show_title_on_annex,
      page_placement: att.page_placement,
      full_bleed: att.full_bleed,
      exclude_from_page_count: att.exclude_from_page_count,
      uploadedByUserName: att.uploadedByUserName,
      originalSize: att.originalSize,
      compressedSize: att.compressedSize,
      compressionRatioPct: att.compressionRatioPct,
      compressionPreset: att.compressionPreset
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

  if (Array.isArray(copy.attachments)) {
    copy.attachments = copy.attachments.map((att: any, i: number) => {
      const url = att?.url || '';
      if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
        return {
          ...att,
          isLocal: false
        };
      }
      if (typeof url === 'string' && url.startsWith('data:') && url.length > 25000) {
        const key = att.storageKey || att.id || `blob_${att.name || 'file'}_${i}`;
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

  if (typeof copy.raw_source_text === 'string' && copy.raw_source_text.length > 500000) {
    copy.raw_source_text = copy.raw_source_text.substring(0, 500000) + '\n\n[TRUNCATED TO PREVENT FIRESTORE 1MB LIMIT]';
  }

  return copy;
}

/**
 * Permanently deletes an enquiry's attachments from both Supabase cloud storage and IndexedDB.
 */
export async function purgeEnquiryAttachments(
  attachments?: Attachment[] | null,
  workspaceSettings?: WorkspaceStorageSettings | null
): Promise<void> {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return;
  }

  const purgePromises = attachments.map(async (att) => {
    if (!att || typeof att !== 'object') return;
    const rawUrl = (att as any).url || (att as any).fileUrl || (att as any).downloadURL || (att as any).downloadUrl || '';
    const key = att.storageKey || (att.id ? `blob_${att.id}` : '') || getAttachmentStorageKey(att);
    await deleteFromStorageBucket(rawUrl, workspaceSettings, key);
  });

  await Promise.allSettled(purgePromises);
}

/**
 * Permanently deletes all cloud storage objects and local blobs associated with a purged entity
 * (Enquiry, Quotation, Product, Project, or SupplierBill) when emptied from the Recycle Bin.
 */
export async function purgeEntityStorageAssets(
  entityType: 'enquiry' | 'quotation' | 'product' | 'project' | 'supplier_bill',
  entity: any,
  workspaceSettings?: WorkspaceStorageSettings | null
): Promise<void> {
  if (!entity || typeof entity !== 'object') return;

  const urlsToDelete = new Set<string>();
  const keysToDelete = new Set<string>();

  const collectAttachment = (att?: Attachment | null) => {
    if (!att || typeof att !== 'object') return;
    const u = (att as any).url || (att as any).fileUrl || (att as any).downloadURL || '';
    if (typeof u === 'string' && u.trim()) urlsToDelete.add(u.trim());
    const k = att.storageKey || (att.id ? `blob_${att.id}` : '');
    if (k) keysToDelete.add(k);
  };

  if (entityType === 'enquiry') {
    if (Array.isArray(entity.attachments)) {
      entity.attachments.forEach(collectAttachment);
    }
  } else if (entityType === 'quotation') {
    if (Array.isArray(entity.flyer_attachments)) {
      entity.flyer_attachments.forEach(collectAttachment);
    }
    if (entity.pdf_download_url) urlsToDelete.add(entity.pdf_download_url);
  } else if (entityType === 'product') {
    if (entity.image_url) urlsToDelete.add(entity.image_url);
    if (entity.secondary_image_url) urlsToDelete.add(entity.secondary_image_url);
    collectAttachment(entity.datasheet_attachment);
  } else if (entityType === 'supplier_bill') {
    collectAttachment(entity.attachment);
  }

  const tasks: Promise<any>[] = [];
  urlsToDelete.forEach((url) => {
    tasks.push(deleteFromStorageBucket(url, workspaceSettings));
  });
  keysToDelete.forEach((key) => {
    tasks.push(deleteAttachmentBlob(key).catch(() => {}));
  });

  await Promise.allSettled(tasks);
}

