import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Sliders,
  Maximize2,
  RotateCw,
  RefreshCw,
  Check,
  Layers,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import {
  ImageAdjustmentConfig,
  LineItemImageDisplayOverride,
  LineItemImageSizeOverride,
  LineItemImageAspectOverride
} from '../../types';
import { uploadWorkspaceMediaAsset } from '../../services/attachmentStorage';
import { ImageLightboxModal } from './ImageLightboxModal';

export interface LineItemImageMediaState {
  image_url?: string;
  secondary_image_url?: string;
  image_caption?: string;
  secondary_image_caption?: string;
  image_adjustments?: ImageAdjustmentConfig;
  image_display_override?: LineItemImageDisplayOverride;
  image_size_override?: LineItemImageSizeOverride;
  image_aspect_override?: LineItemImageAspectOverride;
}

export interface LineItemImageOptionsPopoverProps {
  media?: LineItemImageMediaState;
  imageUrl?: string;
  secondaryImageUrl?: string;
  imageCaption?: string;
  secondaryImageCaption?: string;
  imageAdjustments?: ImageAdjustmentConfig;
  displayOverride?: LineItemImageDisplayOverride;
  sizeOverride?: LineItemImageSizeOverride;
  aspectOverride?: LineItemImageAspectOverride;
  onChange: (updates: Partial<LineItemImageMediaState>) => void;
  itemTitle?: string;
  itemSku?: string;
  workspaceId?: string;
  activeWorkspace?: any;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  showOverrideControls?: boolean;
  canSyncToCatalog?: boolean;
  onSyncToCatalog?: (media?: LineItemImageMediaState) => Promise<void> | void;
  compact?: boolean;
}

export const LineItemImageOptionsPopover: React.FC<LineItemImageOptionsPopoverProps> = ({
  media: mediaProp,
  imageUrl,
  secondaryImageUrl,
  imageCaption,
  secondaryImageCaption,
  imageAdjustments,
  displayOverride,
  sizeOverride,
  aspectOverride,
  onChange,
  itemTitle,
  itemSku,
  workspaceId = 'default',
  activeWorkspace,
  triggerToast,
  showOverrideControls = true,
  canSyncToCatalog = false,
  onSyncToCatalog,
  compact = false
}) => {
  const media: LineItemImageMediaState = mediaProp || {
    image_url: imageUrl,
    secondary_image_url: secondaryImageUrl,
    image_caption: imageCaption,
    secondary_image_caption: secondaryImageCaption,
    image_adjustments: imageAdjustments,
    image_display_override: displayOverride,
    image_size_override: sizeOverride,
    image_aspect_override: aspectOverride
  };

  const [isOpen, setIsOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isUploadingPrimary, setIsUploadingPrimary] = useState(false);
  const [isUploadingSecondary, setIsUploadingSecondary] = useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const primaryInputRef = useRef<HTMLInputElement | null>(null);
  const secondaryInputRef = useRef<HTMLInputElement | null>(null);

  const hasCustomOverrides =
    Boolean(media.secondary_image_url) ||
    Boolean(media.image_caption?.trim()) ||
    Boolean(media.secondary_image_caption?.trim()) ||
    (media.image_display_override && media.image_display_override !== 'inherit') ||
    (media.image_size_override && media.image_size_override !== 'inherit') ||
    (media.image_aspect_override && media.image_aspect_override !== 'inherit') ||
    Boolean(media.image_adjustments?.rotation);

  const handleUploadFile = async (file: File, target: 'primary' | 'secondary') => {
    try {
      if (target === 'primary') setIsUploadingPrimary(true);
      else setIsUploadingSecondary(true);

      const storageTarget = (activeWorkspace as any)?.settings || activeWorkspace || null;
      const uploaded = await uploadWorkspaceMediaAsset(file, 'products/images', storageTarget, {
        compressImage: true,
        maxDimension: 1200,
        quality: 0.85
      });
      const url = uploaded.url;
      if (target === 'primary') {
        onChange({ image_url: url });
        triggerToast?.('Primary product photo uploaded', 'success');
      } else {
        onChange({ secondary_image_url: url });
        triggerToast?.('Secondary technical diagram uploaded', 'success');
      }
    } catch (err) {
      console.error('Failed to upload line item image:', err);
      triggerToast?.('Failed to upload image', 'error');
    } finally {
      if (target === 'primary') setIsUploadingPrimary(false);
      else setIsUploadingSecondary(false);
    }
  };

  const handlePasteOnCard = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          const target = media.image_url && isOpen && !media.secondary_image_url ? 'secondary' : 'primary';
          await handleUploadFile(file, target);
          break;
        }
      }
    }
  };

  const handleQuickRotate = () => {
    const current = media.image_adjustments?.rotation || 0;
    const next = (((current + 90) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    onChange({
      image_adjustments: {
        ...media.image_adjustments,
        rotation: next
      }
    });
  };

  const handleTriggerSyncCatalog = async () => {
    if (!onSyncToCatalog) return;
    try {
      setIsSyncingCatalog(true);
      await onSyncToCatalog(media);
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to sync media to catalog:', err);
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  return (
    <div
      className="w-full"
      onPaste={handlePasteOnCard}
    >
      {/* Compact Surface Bar: Thumbnail + Progressive Disclosure Trigger */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Primary Thumbnail Slot */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file && file.type.startsWith('image/')) {
              handleUploadFile(file, 'primary');
            }
          }}
          className={`relative group rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0 transition hover:border-blue-400 ${
            compact ? 'w-9 h-9' : 'w-11 h-11'
          }`}
          title={
            media.image_url
              ? 'Click to Zoom / Adjust • Drop file or Ctrl+V to replace'
              : 'Click to upload photo • Drop file or focus & Ctrl+V to paste'
          }
        >
          {media.image_url ? (
            <>
              <img
                src={media.image_url}
                alt={itemTitle || 'Item'}
                onClick={() => setIsLightboxOpen(true)}
                className="w-full h-full object-contain p-0.5 cursor-zoom-in"
                style={{
                  transform: `rotate(${media.image_adjustments?.rotation || 0}deg) scale(${media.image_adjustments?.scale || 1})`
                }}
              />
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer"
                title="Inspect & Adjust Image"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => primaryInputRef.current?.click()}
              disabled={isUploadingPrimary}
              className="w-full h-full flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Secondary Image Mini Badge if present */}
        {media.secondary_image_url && (
          <div
            onClick={() => setIsLightboxOpen(true)}
            className={`relative group rounded-lg border border-blue-200 bg-blue-50/40 overflow-hidden flex items-center justify-center shrink-0 cursor-zoom-in ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            }`}
            title="2nd Technical Diagram attached (Click to zoom)"
          >
            <img
              src={media.secondary_image_url}
              alt="2nd Diagram"
              className="w-full h-full object-contain p-0.5"
            />
            <span className="absolute bottom-0 right-0 px-1 bg-blue-600 text-white text-[8px] font-bold leading-tight rounded-tl">
              2nd
            </span>
          </div>
        )}

        {/* Quick Actions & Progressive Disclosure Button */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <input
            ref={primaryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadFile(file, 'primary');
              e.target.value = '';
            }}
          />
          <input
            ref={secondaryInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUploadFile(file, 'secondary');
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => primaryInputRef.current?.click()}
            disabled={isUploadingPrimary}
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
            title="Upload or Replace Primary Image (or press Ctrl+V)"
          >
            <Upload className="w-3 h-3 text-slate-500" />
            <span>{isUploadingPrimary ? 'Uploading...' : media.image_url ? 'Replace' : 'Upload Photo'}</span>
          </button>

          {media.image_url && (
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
              title="Open Lightbox Zoom & Rotate"
            >
              <Maximize2 className="w-3 h-3 text-blue-600" />
              <span>Zoom</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`px-2 py-1 rounded-md text-[11px] font-semibold border flex items-center gap-1 transition cursor-pointer whitespace-nowrap ${
              isOpen || hasCustomOverrides
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-100/80 hover:bg-slate-200/70 text-slate-600 border-slate-200'
            }`}
            title="Configure Per-Item Image Placement, Size, 2nd Diagram & Caption"
          >
            <Sliders className="w-3 h-3" />
            <span>Image Options</span>
            {hasCustomOverrides && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            )}
            {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {media.image_url && (
            <button
              type="button"
              onClick={() => onChange({ image_url: '' })}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
              title="Remove Primary Image"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Progressive Disclosure Panel */}
      {isOpen && (
        <div className="mt-2 p-2.5 rounded-xl bg-slate-50/90 border border-slate-200/90 space-y-2.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/70">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {showOverrideControls
                ? 'Per-Item Visual Overrides & Secondary Diagram'
                : 'Visual Media, Secondary Diagram & Captions'}
            </span>
            <div className="flex items-center gap-1.5">
              {media.image_url && (
                <button
                  type="button"
                  onClick={handleQuickRotate}
                  className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700 flex items-center gap-1 cursor-pointer"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                  <span>Rotate ({media.image_adjustments?.rotation || 0}°)</span>
                </button>
              )}
              {canSyncToCatalog && onSyncToCatalog && (
                <button
                  type="button"
                  onClick={handleTriggerSyncCatalog}
                  disabled={isSyncingCatalog}
                  className={`px-2 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                    syncSuccess
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-white hover:bg-blue-50 text-blue-700 border-blue-200'
                  }`}
                  title="Save these images, captions, and adjustments back to the Master Product Catalog"
                >
                  {syncSuccess ? (
                    <>
                      <Check className="w-2.5 h-2.5" />
                      <span>Synced to Catalog</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className={`w-2.5 h-2.5 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
                      <span>Sync to Catalog</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 2-Column Grid for Placement, Size, Aspect Overrides & 2nd Image */}
          <div className="grid grid-cols-2 gap-2">
            {showOverrideControls && (
              <>
                <div className="min-w-0">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 truncate">
                    Placement Override
                  </label>
                  <select
                    value={media.image_display_override || 'inherit'}
                    onChange={(e) =>
                      onChange({
                        image_display_override: e.target.value as LineItemImageDisplayOverride
                      })
                    }
                    className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="inherit">Inherit Table Default</option>
                    <option value="column">Dedicated Column</option>
                    <option value="inline_left">Inline Left (Beside Specs)</option>
                    <option value="inline_right">Inline Right (Floated)</option>
                    <option value="below_specs">Below Specs (Diagram Banner)</option>
                    <option value="hidden">Hide Image for This Row</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 truncate">
                    Size Override
                  </label>
                  <select
                    value={media.image_size_override || 'inherit'}
                    onChange={(e) =>
                      onChange({
                        image_size_override: e.target.value as LineItemImageSizeOverride
                      })
                    }
                    className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="inherit">Inherit Table Size</option>
                    <option value="xs">XS (32px Micro)</option>
                    <option value="sm">SM (48px Compact)</option>
                    <option value="md">MD (72px Standard)</option>
                    <option value="lg">LG (110px Feature)</option>
                    <option value="xl">XL (160px Showcase)</option>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 truncate">
                    Aspect Ratio Override
                  </label>
                  <select
                    value={media.image_aspect_override || 'inherit'}
                    onChange={(e) =>
                      onChange({
                        image_aspect_override: e.target.value as LineItemImageAspectOverride
                      })
                    }
                    className="w-full px-2 py-1 text-[11px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="inherit">Inherit Table Ratio</option>
                    <option value="1:1">1:1 Square</option>
                    <option value="4:3">4:3 Standard</option>
                    <option value="16:9">16:9 Wide Diagram</option>
                    <option value="auto">Auto (Natural Fit)</option>
                  </select>
                </div>
              </>
            )}

            <div className={showOverrideControls ? 'min-w-0' : 'col-span-2 min-w-0'}>
              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 truncate">
                2nd Image (Technical Drawing / P&amp;ID / Spec Sheet)
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => secondaryInputRef.current?.click()}
                  disabled={isUploadingSecondary}
                  className="flex-1 min-w-0 px-2 py-1 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700 flex items-center justify-center gap-1 truncate cursor-pointer"
                >
                  <Layers className="w-3 h-3 text-blue-600 shrink-0" />
                  <span className="truncate">
                    {isUploadingSecondary
                      ? 'Uploading...'
                      : media.secondary_image_url
                      ? 'Replace 2nd Diagram'
                      : '+ Add 2nd Diagram'}
                  </span>
                </button>
                {media.secondary_image_url && (
                  <button
                    type="button"
                    onClick={() => onChange({ secondary_image_url: '' })}
                    className="p-1 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 shrink-0 cursor-pointer"
                    title="Remove 2nd Diagram"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Caption Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 truncate">
                Primary Photo Caption (Optional)
              </label>
              <input
                type="text"
                value={media.image_caption || ''}
                onChange={(e) => onChange({ image_caption: e.target.value })}
                placeholder="e.g., Fig 1.1: General Arrangement..."
                className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5 truncate">
                2nd Diagram Caption (Optional)
              </label>
              <input
                type="text"
                value={media.secondary_image_caption || ''}
                onChange={(e) => onChange({ secondary_image_caption: e.target.value })}
                placeholder="e.g., Fig 1.2: Dimensional P&ID..."
                className="w-full px-2.5 py-1 text-[11px] bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Zoom & Adjustments Lightbox */}
      <ImageLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        imageUrl={media.image_url || ''}
        secondaryImageUrl={media.secondary_image_url}
        title={itemTitle}
        sku={itemSku}
        caption={media.image_caption}
        secondaryCaption={media.secondary_image_caption}
        adjustments={media.image_adjustments}
        workspaceId={workspaceId}
        activeWorkspace={activeWorkspace}
        triggerToast={triggerToast}
        onUpdateImage={(newUrl, slot) => {
          if (slot === 'primary') onChange({ image_url: newUrl });
          else onChange({ secondary_image_url: newUrl });
        }}
        onRemoveImage={(slot) => {
          if (slot === 'primary') onChange({ image_url: '' });
          else onChange({ secondary_image_url: '' });
        }}
        onUpdateCaption={(newCap, slot) => {
          if (slot === 'primary') onChange({ image_caption: newCap });
          else onChange({ secondary_image_caption: newCap });
        }}
        onUpdateAdjustments={(adj) => onChange({ image_adjustments: adj })}
      />
    </div>
  );
};

export default LineItemImageOptionsPopover;
