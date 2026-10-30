import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Upload,
  Trash2,
  Check,
  RefreshCw,
  Sparkles,
  Image as ImageIcon,
  Layers,
  Maximize2
} from 'lucide-react';
import { ImageAdjustmentConfig } from '../../types';
import { uploadWorkspaceMediaAsset } from '../../services/attachmentStorage';

export interface ImageLightboxUpdatePayload {
  image_url?: string;
  secondary_image_url?: string;
  image_caption?: string;
  secondary_image_caption?: string;
  image_adjustments?: ImageAdjustmentConfig;
}

export interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  secondaryImageUrl?: string;
  title?: string;
  sku?: string;
  caption?: string;
  imageCaption?: string;
  secondaryCaption?: string;
  secondaryImageCaption?: string;
  adjustments?: ImageAdjustmentConfig;
  imageAdjustments?: ImageAdjustmentConfig;
  workspaceId?: string;
  activeWorkspace?: any;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  canEdit?: boolean;
  assetCategory?: 'product_image' | 'quotation_asset' | 'branding_logo';
  onUpdateImage?: (newUrl: string, target: 'primary' | 'secondary') => void;
  onRemoveImage?: (target: 'primary' | 'secondary') => void;
  onUpdateCaption?: (caption: string, target: 'primary' | 'secondary') => void;
  onUpdateAdjustments?: (adjustments: ImageAdjustmentConfig) => void;
  onSaveChanges?: (updates: ImageLightboxUpdatePayload) => Promise<void> | void;
}

export const ImageLightboxModal: React.FC<ImageLightboxModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  secondaryImageUrl,
  title,
  sku,
  caption,
  imageCaption,
  secondaryCaption,
  secondaryImageCaption,
  adjustments,
  imageAdjustments,
  activeWorkspace,
  triggerToast,
  canEdit = true,
  onUpdateImage,
  onRemoveImage,
  onUpdateCaption,
  onUpdateAdjustments,
  onSaveChanges
}) => {
  const effectiveAdjustments = adjustments || imageAdjustments;
  const effectiveCaption = caption ?? imageCaption ?? '';
  const effectiveSecondaryCaption = secondaryCaption ?? secondaryImageCaption ?? '';
  const isEditable = Boolean(canEdit && (onUpdateImage || onSaveChanges || onUpdateAdjustments));

  const [activeSlot, setActiveSlot] = useState<'primary' | 'secondary'>('primary');
  const [localPrimaryUrl, setLocalPrimaryUrl] = useState<string>(imageUrl || '');
  const [localSecondaryUrl, setLocalSecondaryUrl] = useState<string>(secondaryImageUrl || '');
  const [localAdjustments, setLocalAdjustments] = useState<ImageAdjustmentConfig>({
    rotation: effectiveAdjustments?.rotation || 0,
    scale: effectiveAdjustments?.scale || 1,
    bgFill: effectiveAdjustments?.bgFill || 'white',
    objectFit: effectiveAdjustments?.objectFit || 'contain'
  });
  const [localCaption, setLocalCaption] = useState<string>(effectiveCaption);
  const [localSecondaryCaption, setLocalSecondaryCaption] = useState<string>(effectiveSecondaryCaption);
  const [isBaking, setIsBaking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalPrimaryUrl(imageUrl || '');
      setLocalSecondaryUrl(secondaryImageUrl || '');
      setLocalAdjustments({
        rotation: effectiveAdjustments?.rotation || 0,
        scale: effectiveAdjustments?.scale || 1,
        bgFill: effectiveAdjustments?.bgFill || 'white',
        objectFit: effectiveAdjustments?.objectFit || 'contain'
      });
      setLocalCaption(effectiveCaption);
      setLocalSecondaryCaption(effectiveSecondaryCaption);
      setActiveSlot('primary');
    }
  }, [isOpen, imageUrl, secondaryImageUrl, effectiveAdjustments, effectiveCaption, effectiveSecondaryCaption]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handlePaste = async (e: ClipboardEvent) => {
      if (!isEditable) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            await handleFileUpload(file);
            break;
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handlePaste);
    };
  }, [isOpen, activeSlot, isEditable]);

  if (!isOpen) return null;

  const currentUrl = activeSlot === 'primary' ? localPrimaryUrl : localSecondaryUrl;
  const currentCaption = activeSlot === 'primary' ? localCaption : localSecondaryCaption;

  const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(msg);
    triggerToast?.(msg, type);
    setTimeout(() => setToastMessage(null), 2600);
  };

  const emitUpdates = (updates: ImageLightboxUpdatePayload) => {
    onSaveChanges?.(updates);
  };

  const applyAdjustments = (next: Partial<ImageAdjustmentConfig>) => {
    const merged: ImageAdjustmentConfig = {
      ...localAdjustments,
      ...next
    };
    setLocalAdjustments(merged);
    onUpdateAdjustments?.(merged);
    emitUpdates({ image_adjustments: merged });
  };

  const handleRotate = (delta: 90 | -90) => {
    const current = localAdjustments.rotation || 0;
    const nextRotation = (((current + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    applyAdjustments({ rotation: nextRotation });
  };

  const handleScale = (delta: number) => {
    const current = localAdjustments.scale || 1;
    const next = Math.min(1.5, Math.max(0.65, Number((current + delta).toFixed(2))));
    applyAdjustments({ scale: next });
  };

  const handleFileUpload = async (file: File) => {
    if (!isEditable) return;
    try {
      setIsUploading(true);
      const storageTarget = (activeWorkspace as any)?.settings || activeWorkspace || null;
      const uploaded = await uploadWorkspaceMediaAsset(file, 'products/images', storageTarget, {
        compressImage: true,
        maxDimension: 1200,
        quality: 0.86
      });
      const url = uploaded.url;
      if (activeSlot === 'primary') {
        setLocalPrimaryUrl(url);
        onUpdateImage?.(url, 'primary');
        emitUpdates({ image_url: url });
      } else {
        setLocalSecondaryUrl(url);
        onUpdateImage?.(url, 'secondary');
        emitUpdates({ secondary_image_url: url });
      }
      showToast(activeSlot === 'primary' ? 'Primary image updated' : 'Secondary diagram updated');
    } catch (err) {
      console.error('Image upload failed in lightbox:', err);
      showToast('Failed to upload image', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveCurrentImage = () => {
    if (activeSlot === 'primary') {
      setLocalPrimaryUrl('');
      onRemoveImage?.('primary');
      emitUpdates({ image_url: '' });
    } else {
      setLocalSecondaryUrl('');
      onRemoveImage?.('secondary');
      emitUpdates({ secondary_image_url: '' });
    }
  };

  const handleBakeAdjustmentsToFile = async () => {
    if (!currentUrl || !isEditable) return;
    try {
      setIsBaking(true);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
        img.src = currentUrl;
      });

      const rot = localAdjustments.rotation || 0;
      const scale = localAdjustments.scale || 1;
      const isRotated90 = rot === 90 || rot === 270;
      const srcW = img.naturalWidth || 800;
      const srcH = img.naturalHeight || 800;
      const canvasW = isRotated90 ? srcH : srcW;
      const canvasH = isRotated90 ? srcW : srcH;

      const canvas = document.createElement('canvas');
      canvas.width = canvasW;
      canvas.height = canvasH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      if (localAdjustments.bgFill === 'white') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasW, canvasH);
      } else if (localAdjustments.bgFill === 'slate') {
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvasW, canvasH);
      }

      ctx.save();
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(scale, scale);
      ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
      ctx.restore();

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png', 0.92)
      );
      if (!blob) throw new Error('Failed to encode baked image');

      const bakedFile = new File([blob], `baked-${Date.now()}.png`, { type: 'image/png' });
      const storageTarget = (activeWorkspace as any)?.settings || activeWorkspace || null;
      const uploaded = await uploadWorkspaceMediaAsset(bakedFile, 'products/images', storageTarget, {
        compressImage: true,
        maxDimension: 1200,
        quality: 0.9
      });
      const uploadedUrl = uploaded.url;

      const resetAdj: ImageAdjustmentConfig = {
        ...localAdjustments,
        rotation: 0,
        scale: 1
      };
      setLocalAdjustments(resetAdj);
      onUpdateAdjustments?.(resetAdj);

      if (activeSlot === 'primary') {
        setLocalPrimaryUrl(uploadedUrl);
        onUpdateImage?.(uploadedUrl, 'primary');
        emitUpdates({ image_url: uploadedUrl, image_adjustments: resetAdj });
      } else {
        setLocalSecondaryUrl(uploadedUrl);
        onUpdateImage?.(uploadedUrl, 'secondary');
        emitUpdates({ secondary_image_url: uploadedUrl, image_adjustments: resetAdj });
      }
      showToast('Adjustments permanently baked & saved');
    } catch (err) {
      console.warn('Could not bake image via canvas (CORS or network), keeping non-destructive settings:', err);
      showToast('Saved as non-destructive transform metadata', 'info');
    } finally {
      setIsBaking(false);
    }
  };

  const bgPreviewClass =
    localAdjustments.bgFill === 'transparent'
      ? 'bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] bg-slate-900/40'
      : localAdjustments.bgFill === 'slate'
      ? 'bg-slate-100'
      : 'bg-white';

  return (
    <div
      className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 print:hidden animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 shrink-0">
              <Maximize2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold truncate">
                  {title || 'Product Visual & Technical Media Inspector'}
                </h3>
                {sku && (
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 rounded border border-slate-700 shrink-0">
                    {sku}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] font-mono">Ctrl+V</kbd> anywhere to paste from clipboard • Non-destructive adjustments or bake to file
              </p>
            </div>
          </div>

          {/* Slot Switcher (Primary Photo vs Secondary Diagram) */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
              <button
                type="button"
                onClick={() => setActiveSlot('primary')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeSlot === 'primary'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Primary Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSlot('secondary')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  activeSlot === 'secondary'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>2nd Tech Diagram</span>
                {localSecondaryUrl && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close Lightbox (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Viewport */}
        <div className="flex-1 min-h-[340px] max-h-[56vh] bg-slate-900/95 relative flex items-center justify-center p-6 overflow-hidden">
          {toastMessage && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold shadow-lg flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" />
              <span>{toastMessage}</span>
            </div>
          )}

          {currentUrl ? (
            <div
              className={`w-full h-full max-w-2xl max-h-[48vh] rounded-xl border border-slate-700/80 shadow-inner flex items-center justify-center overflow-hidden p-4 transition-colors ${bgPreviewClass}`}
            >
              <img
                src={currentUrl}
                alt={title || 'Preview'}
                className={`max-w-full max-h-[42vh] transition-transform duration-150 ${
                  localAdjustments.objectFit === 'cover' ? 'object-cover w-full h-full' : 'object-contain'
                }`}
                style={{
                  transform: `rotate(${localAdjustments.rotation || 0}deg) scale(${localAdjustments.scale || 1})`
                }}
              />
            </div>
          ) : (
            <div
              onClick={() => isEditable && fileInputRef.current?.click()}
              className="w-full max-w-md h-64 rounded-xl border-2 border-dashed border-slate-700 hover:border-blue-500 bg-slate-900/50 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-blue-300 transition cursor-pointer p-6 text-center"
            >
              <Upload className="w-8 h-8 stroke-[1.5]" />
              <div className="text-sm font-semibold text-slate-200">
                {activeSlot === 'primary'
                  ? 'Upload or Paste Primary Product Photo'
                  : 'Upload or Paste Secondary Technical Drawing / Diagram'}
              </div>
              <p className="text-xs text-slate-400">
                Click to browse file or press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-mono text-[10px]">Ctrl+V</kbd> to paste screenshot
              </p>
            </div>
          )}
        </div>

        {/* Bottom Controls Bar */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3 shrink-0">
          {/* Adjustment Ribbon */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Rotation & Zoom */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleRotate(-90)}
                  disabled={!currentUrl || !isEditable}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  title="Rotate 90° Counter-Clockwise"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>-90°</span>
                </button>
                <span className="px-2 text-[11px] font-mono font-bold text-slate-600 border-x border-slate-100">
                  {localAdjustments.rotation || 0}°
                </span>
                <button
                  type="button"
                  onClick={() => handleRotate(90)}
                  disabled={!currentUrl || !isEditable}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                  title="Rotate 90° Clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>+90°</span>
                </button>
              </div>

              {/* Scale / Padding */}
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => handleScale(-0.1)}
                  disabled={!currentUrl || !isEditable}
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-40 cursor-pointer"
                  title="Zoom Out / Increase Padding"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-[11px] font-mono font-bold text-slate-600 border-x border-slate-100">
                  {Math.round((localAdjustments.scale || 1) * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => handleScale(0.1)}
                  disabled={!currentUrl || !isEditable}
                  className="p-1.5 text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-40 cursor-pointer"
                  title="Zoom In / Fill Frame"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Background Fill */}
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs text-xs">
                {(['white', 'slate', 'transparent'] as const).map((bg) => (
                  <button
                    key={bg}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => applyAdjustments({ bgFill: bg })}
                    className={`px-2 py-1 rounded-md font-semibold capitalize transition cursor-pointer ${
                      (localAdjustments.bgFill || 'white') === bg
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {bg === 'white' ? 'White BG' : bg === 'slate' ? 'Soft Slate' : 'Clear'}
                  </button>
                ))}
              </div>

              {/* Object Fit */}
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs text-xs">
                {(['contain', 'cover'] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => applyAdjustments({ objectFit: fit })}
                    className={`px-2 py-1 rounded-md font-semibold capitalize transition cursor-pointer ${
                      (localAdjustments.objectFit || 'contain') === fit
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {fit}
                  </button>
                ))}
              </div>

              {(localAdjustments.rotation || (localAdjustments.scale && localAdjustments.scale !== 1)) ? (
                <button
                  type="button"
                  onClick={() => applyAdjustments({ rotation: 0, scale: 1 })}
                  className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg flex items-center gap-1 cursor-pointer"
                  title="Reset Rotation and Scale"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              ) : null}
            </div>

            {/* File Actions & Bake Button */}
            <div className="flex items-center gap-2">
              {currentUrl && isEditable && ((localAdjustments.rotation || 0) !== 0 || (localAdjustments.scale || 1) !== 1) && (
                <button
                  type="button"
                  onClick={handleBakeAdjustmentsToFile}
                  disabled={isBaking}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  title="Permanently bake rotation and scale into a new image file"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>{isBaking ? 'Baking...' : 'Bake into File'}</span>
                </button>
              )}

              {isEditable && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isUploading ? 'Uploading...' : currentUrl ? 'Replace Image' : 'Upload Image'}</span>
                  </button>
                </>
              )}

              {currentUrl && isEditable && (
                <button
                  type="button"
                  onClick={handleRemoveCurrentImage}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                  title="Remove Image"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>
          </div>

          {/* Caption Editor Row */}
          {isEditable && (
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/70">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                {activeSlot === 'primary' ? 'Image Caption:' : '2nd Diagram Caption:'}
              </label>
              <input
                type="text"
                value={currentCaption}
                onChange={(e) => {
                  const val = e.target.value;
                  if (activeSlot === 'primary') {
                    setLocalCaption(val);
                    onUpdateCaption?.(val, 'primary');
                    emitUpdates({ image_caption: val });
                  } else {
                    setLocalSecondaryCaption(val);
                    onUpdateCaption?.(val, 'secondary');
                    emitUpdates({ secondary_image_caption: val });
                  }
                }}
                placeholder={
                  activeSlot === 'primary'
                    ? 'Optional caption printed below image (e.g., Fig 1.1 — SS316 Dosing Skid)...'
                    : 'Optional caption for technical drawing (e.g., Fig 1.2 — Dimensional P&ID)...'
                }
                className="flex-1 min-w-0 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition cursor-pointer shrink-0"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageLightboxModal;
