import React, { useState, useEffect, useRef } from 'react';
import { sanitizeAuditPayload } from '../utils/sanitizeAuditLog';
import {
  prepareAttachmentsForSave,
  resolveAttachmentUrl,
  getAttachmentStorageKey,
  uploadToSupabaseStorage,
  deleteFromSupabaseStorage,
  deleteAttachmentBlob,
  dataUrlToFile,
  uploadWorkspaceMediaAsset,
  stripCatalogRedundantLineItemMedia,
  rehydrateLineItemsFromCatalog,
  rehydrateDocumentBlobsFromLocal
} from '../services/attachmentStorage';
import mammoth from 'mammoth';
import { PdfViewer } from './PdfViewer';
import { MarqueeLabel } from './MarqueeLabel';
import { Enquiry, Company, Contact, Salesperson, LineItem, Attachment, ProductType, UnitType, EnquiryStatus, Product, ProductAttribute, CATEGORY_SUGGESTED_ATTRIBUTES, DropdownOption, Workspace, ENQUIRY_STATUS_OPTIONS, normalizeEnquiryStatus, LegalSuffix, PIPELINE_STATUS_GROUPS, WorkspaceSequenceCounters, resolveCountryCode, sanitizeCompanyCode, LineItemImageDisplayOverride, LineItemImageSizeOverride, LineItemImageAspectOverride, QuotationTaxMode, resolveSalespersonName } from '../types';
import { db } from '../firebase';
import { writeBatch, doc, updateDoc } from 'firebase/firestore';
import { safeAddDoc, safeUpdateDoc, uploadAttachmentWithProgress } from '../firebase';
import { EnquiryRepository } from '../services/repositories/EnquiryRepository';
import { CompanyRepository } from '../services/repositories/CompanyRepository';
import { QuotationRepository } from '../services/repositories/QuotationRepository';
import { previewNextEnquirySequence, claimNextEnquirySequence, syncSequenceHighWaterMark, getWorkspaceSequenceCounters, getSequencePeriodKey, formatPattern, patternRequiresCompanyCode, patternRequiresCountryCode } from '../services/enquirySequences';
import { BRAND_CONFIG } from '../config';
import DuplicateMatchModal from './DuplicateMatchModal';
import GeminiKeyModal from './GeminiKeyModal';
import { findDuplicateCompany } from '../utils/fuzzyMatch';
import { extractEnquiryClientSide, AVAILABLE_GEMINI_MODELS } from '../utils/aiExtractionClient';
import { getUserWorkspaceRole, canEditEnquiry } from '../utils/permissions';
import CompositePackageEditor from './quotations/CompositePackageEditor';
import { cloneLineItemToNextOption, recalculateCompositeItemTotals, formatSlashSeparatedDescription } from '../utils/compositeBomUtils';
import { ImageLightboxModal } from './common/ImageLightboxModal';
import {
  FileText,
  Building,
  User,
  Plus,
  Trash2,
  Paperclip,
  Check,
  Cloud,
  UploadCloud,
  HardDrive,
  AlertTriangle,
  Lock,
  X,
  FileCheck,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sparkles,
  Loader2,
  Eye,
  ExternalLink,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MoreVertical,
  FileSpreadsheet,
  Minimize2,
  Maximize2,
  Copy,
  Tag,
  Calendar,
  DollarSign,
  Layers,
  MapPin,
  Sliders,
  CheckCircle2,
  KeyRound,
  Info,
  UserPlus,
  Pencil,
  Package,
  Wrench,
  Link2,
  RefreshCw,
  RotateCw,
  Upload,
  Image as ImageIcon,
  Scissors,
  BookmarkPlus,
  Building2,
  Compass,
  TrendingUp,
  GitBranch
} from 'lucide-react';
import SaveToCatalogModal, {
  parseLineItemTitleAndSpec,
  hasCatalogDrift,
  syncLineItemToCatalogProduct,
  compileDescriptionWithSpecs,
  isLineItemPopulated,
  linkLineItemToCatalogProductNonDestructive,
  CatalogSyncMenu
} from './SaveToCatalogModal';
import { useEnquiryDisclosureState } from '../hooks/useEnquiryDisclosureState';
import { EnquiryMetadataSummaryBar } from './enquiry/EnquiryMetadataSummaryBar';

interface LineItemTier3BMediaGridProps {
  index: number;
  item: LineItem;
  matchedProd: Product | null | undefined;
  effectiveImageUrl: string;
  effectiveDatasheet: any;
  activeWorkspace: any;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  onSyncToCatalog?: () => Promise<void> | void;
  handleLineItemChange: (index: number, field: keyof LineItem, value: any) => void;
  onPatchMedia: (patch: Partial<LineItem>) => void;
}

const LineItemTier3BMediaGrid: React.FC<LineItemTier3BMediaGridProps> = ({
  index,
  item,
  matchedProd,
  effectiveImageUrl,
  effectiveDatasheet,
  activeWorkspace,
  triggerToast,
  onSyncToCatalog,
  handleLineItemChange,
  onPatchMedia
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = React.useState(false);
  const [isUploadingPrimary, setIsUploadingPrimary] = React.useState(false);
  const [isUploadingSecondary, setIsUploadingSecondary] = React.useState(false);
  const [isSyncingCatalog, setIsSyncingCatalog] = React.useState(false);
  const [syncSuccess, setSyncSuccess] = React.useState(false);

  const primaryInputRef = React.useRef<HTMLInputElement | null>(null);
  const secondaryInputRef = React.useRef<HTMLInputElement | null>(null);

  const secondaryImageUrl = item.secondary_image_url || matchedProd?.secondary_image_url || '';
  const imageCaption = item.image_caption ?? matchedProd?.image_caption ?? '';
  const secondaryImageCaption = item.secondary_image_caption ?? matchedProd?.secondary_image_caption ?? '';
  const imageAdjustments = item.image_adjustments || matchedProd?.image_adjustments;
  const displayOverride = item.image_display_override || 'inherit';
  const sizeOverride = item.image_size_override || 'inherit';
  const aspectOverride = item.image_aspect_override || 'inherit';

  const hasCustomOverrides =
    Boolean(secondaryImageUrl) ||
    Boolean(imageCaption.trim()) ||
    Boolean(secondaryImageCaption.trim()) ||
    (displayOverride && displayOverride !== 'inherit') ||
    (sizeOverride && sizeOverride !== 'inherit') ||
    (aspectOverride && aspectOverride !== 'inherit') ||
    Boolean(imageAdjustments?.rotation);

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
        onPatchMedia({ image_url: url });
        triggerToast?.('Primary product photo uploaded', 'success');
      } else {
        onPatchMedia({ secondary_image_url: url });
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

  const handlePasteOnMedia = async (e: React.ClipboardEvent) => {
    const clipItems = e.clipboardData?.items;
    if (!clipItems) return;
    for (let i = 0; i < clipItems.length; i++) {
      if (clipItems[i].type.startsWith('image/')) {
        const file = clipItems[i].getAsFile();
        if (file) {
          e.preventDefault();
          e.stopPropagation();
          const target = effectiveImageUrl && isOpen && !secondaryImageUrl ? 'secondary' : 'primary';
          await handleUploadFile(file, target);
          break;
        }
      }
    }
  };

  const handleQuickRotate = () => {
    const current = imageAdjustments?.rotation || 0;
    const next = ((((current + 90) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    onPatchMedia({
      image_adjustments: {
        ...imageAdjustments,
        rotation: next
      }
    });
  };

  const handleTriggerSyncCatalog = async () => {
    if (!onSyncToCatalog) return;
    try {
      setIsSyncingCatalog(true);
      await onSyncToCatalog();
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to sync media to catalog:', err);
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-12 gap-3 pt-1" onPaste={handlePasteOnMedia}>
      <div className="col-span-1 sm:col-span-3 min-w-0">
        <div className="flex items-center justify-between h-5 mb-1">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            Brand / Make
          </label>
        </div>
        <input
          type="text"
          placeholder="e.g. Siemens, ABB, Schneider"
          value={item.brand_make ?? matchedProd?.brand_make ?? ''}
          onChange={(e) => handleLineItemChange(index, 'brand_make', e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
        />
      </div>

      <div className="col-span-1 sm:col-span-3 min-w-0">
        <div className="flex items-center justify-between h-5 mb-1">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            Model / Part No.
          </label>
        </div>
        <input
          type="text"
          placeholder="e.g. MOD-200X"
          value={item.model_part_no ?? matchedProd?.model_part_no ?? ''}
          onChange={(e) => handleLineItemChange(index, 'model_part_no', e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-lg py-1.5 px-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none"
        />
      </div>

      <div className="col-span-1 sm:col-span-2 min-w-0">
        <div className="flex items-center justify-between h-5 mb-1">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            Origin
          </label>
        </div>
        <input
          type="text"
          placeholder="e.g. USA, UAE"
          value={item.country_of_origin ?? matchedProd?.country_of_origin ?? ''}
          onChange={(e) => handleLineItemChange(index, 'country_of_origin', e.target.value)}
          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
        />
      </div>

      <div className="col-span-2 sm:col-span-4 min-w-0">
        <div className="flex items-center justify-between h-5 mb-1 gap-2">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            Media &amp; Datasheet
          </label>
          {effectiveDatasheet && (
            <label className="flex items-center gap-1 text-[10px] text-indigo-700 dark:text-indigo-300 font-semibold cursor-pointer truncate shrink-0">
              <input
                type="checkbox"
                checked={item.include_datasheet_in_quote !== false}
                onChange={(e) =>
                  handleLineItemChange(index, 'include_datasheet_in_quote', e.target.checked)
                }
                className="w-3 h-3 rounded text-indigo-600"
              />
              <span className="truncate" title={effectiveDatasheet.name}>
                Annex PDF
              </span>
            </label>
          )}
        </div>

        {/* Trigger Row inside 4th column */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file && file.type.startsWith('image/')) {
                handleUploadFile(file, 'primary');
              }
            }}
            className="relative group w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center shrink-0 transition hover:border-blue-400"
            title={
              effectiveImageUrl
                ? 'Click to Zoom / Adjust • Drop file or Ctrl+V to replace'
                : 'Click to upload photo • Drop file or focus & Ctrl+V to paste'
            }
          >
            {effectiveImageUrl ? (
              <>
                <img
                  src={effectiveImageUrl}
                  alt={item.item_name || item.description || `Item #${index + 1}`}
                  onClick={() => setIsLightboxOpen(true)}
                  className="w-full h-full object-contain p-0.5 cursor-zoom-in"
                  style={{
                    transform: `rotate(${imageAdjustments?.rotation || 0}deg) scale(${imageAdjustments?.scale || 1})`
                  }}
                />
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(true)}
                  className="absolute inset-0 bg-slate-900/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition cursor-pointer"
                  title="Inspect & Adjust Image"
                >
                  <Maximize2 className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => primaryInputRef.current?.click()}
                disabled={isUploadingPrimary}
                className="w-full h-full flex flex-col items-center justify-center text-slate-400 hover:text-blue-600 transition cursor-pointer"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {secondaryImageUrl && (
            <div
              onClick={() => setIsLightboxOpen(true)}
              className="relative group w-8 h-8 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/40 dark:bg-blue-950/40 overflow-hidden flex items-center justify-center shrink-0 cursor-zoom-in"
              title="2nd Technical Diagram attached (Click to zoom)"
            >
              <img
                src={secondaryImageUrl}
                alt="2nd Diagram"
                className="w-full h-full object-contain p-0.5"
              />
              <span className="absolute bottom-0 right-0 px-1 bg-blue-600 text-white text-[7px] font-bold leading-tight rounded-tl">
                2nd
              </span>
            </div>
          )}

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
            className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
            title="Upload or Replace Primary Image (or press Ctrl+V)"
          >
            <Upload className="w-3 h-3 text-slate-500" />
            <span>{isUploadingPrimary ? 'Uploading...' : effectiveImageUrl ? 'Replace' : 'Upload Photo'}</span>
          </button>

          {effectiveImageUrl && (
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
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
                ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                : 'bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Configure Per-Item Image Placement, Size, 2nd Diagram & Caption"
          >
            <Sliders className="w-3 h-3" />
            <span>Image Options</span>
            {hasCustomOverrides && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            )}
            {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {effectiveImageUrl && (
            <button
              type="button"
              onClick={() => onPatchMedia({ image_url: '' })}
              className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
              title="Remove Primary Image"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Full-Width Expanded Per-Item Visual Overrides & Secondary Diagram Panel */}
      {isOpen && (
        <div className="col-span-full mt-1 p-3.5 rounded-xl bg-slate-50/95 dark:bg-slate-800/70 border border-slate-200/90 dark:border-slate-700 space-y-3 text-xs animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80 dark:border-slate-700">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Per-Item Visual Overrides &amp; Secondary Diagram</span>
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {effectiveImageUrl && (
                <button
                  type="button"
                  onClick={handleQuickRotate}
                  className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer"
                  title="Rotate 90°"
                >
                  <RotateCw className="w-2.5 h-2.5" />
                  <span>Rotate ({imageAdjustments?.rotation || 0}°)</span>
                </button>
              )}
              {Boolean(matchedProd) && onSyncToCatalog && (
                <button
                  type="button"
                  onClick={handleTriggerSyncCatalog}
                  disabled={isSyncingCatalog}
                  className={`px-2.5 py-1 rounded-md border text-[10px] font-semibold flex items-center gap-1 transition cursor-pointer ${
                    syncSuccess
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
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

          {/* Unclipped 3-Column Grid for All 6 Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="min-w-0">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Placement Override
              </label>
              <select
                value={displayOverride}
                onChange={(e) =>
                  onPatchMedia({
                    image_display_override: e.target.value as LineItemImageDisplayOverride
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Size Override
              </label>
              <select
                value={sizeOverride}
                onChange={(e) =>
                  onPatchMedia({
                    image_size_override: e.target.value as LineItemImageSizeOverride
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Aspect Ratio Override
              </label>
              <select
                value={aspectOverride}
                onChange={(e) =>
                  onPatchMedia({
                    image_aspect_override: e.target.value as LineItemImageAspectOverride
                  })
                }
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="inherit">Inherit Table Ratio</option>
                <option value="1:1">1:1 Square</option>
                <option value="4:3">4:3 Standard</option>
                <option value="16:9">16:9 Wide Diagram</option>
                <option value="auto">Auto (Natural Fit)</option>
              </select>
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                2nd Image (Technical Drawing)
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => secondaryInputRef.current?.click()}
                  disabled={isUploadingSecondary}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <Layers className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <span className="truncate">
                    {isUploadingSecondary
                      ? 'Uploading...'
                      : secondaryImageUrl
                      ? 'Replace 2nd Diagram'
                      : 'Add 2nd Diagram'}
                  </span>
                </button>
                {secondaryImageUrl && (
                  <button
                    type="button"
                    onClick={() => onPatchMedia({ secondary_image_url: '' })}
                    className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 shrink-0 cursor-pointer"
                    title="Remove 2nd Diagram"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                Primary Photo Caption (Optional)
              </label>
              <input
                type="text"
                value={imageCaption}
                onChange={(e) => onPatchMedia({ image_caption: e.target.value })}
                placeholder="e.g., Fig 1.1: General Arrangement..."
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div className="min-w-0">
              <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
                2nd Diagram Caption (Optional)
              </label>
              <input
                type="text"
                value={secondaryImageCaption}
                onChange={(e) => onPatchMedia({ secondary_image_caption: e.target.value })}
                placeholder="e.g., Fig 1.2: Dimensional P&ID..."
                className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      <ImageLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        imageUrl={effectiveImageUrl}
        secondaryImageUrl={secondaryImageUrl}
        title={item.item_name || item.description || `Item #${index + 1}`}
        sku={item.sku}
        caption={imageCaption}
        secondaryCaption={secondaryImageCaption}
        adjustments={imageAdjustments}
        activeWorkspace={activeWorkspace}
        triggerToast={triggerToast}
        onUpdateImage={(newUrl, slot) => {
          if (slot === 'primary') onPatchMedia({ image_url: newUrl });
          else onPatchMedia({ secondary_image_url: newUrl });
        }}
        onRemoveImage={(slot) => {
          if (slot === 'primary') onPatchMedia({ image_url: '' });
          else onPatchMedia({ secondary_image_url: '' });
        }}
        onUpdateCaption={(newCap, slot) => {
          if (slot === 'primary') onPatchMedia({ image_caption: newCap });
          else onPatchMedia({ secondary_image_caption: newCap });
        }}
        onUpdateAdjustments={(adj) => onPatchMedia({ image_adjustments: adj })}
      />
    </div>
  );
};

const DEFAULT_QUICK_ATTRIBUTES = [
  'Flow Rate',
  'Operating Pressure',
  'Connection Size',
  'Material (MOC)',
  'Power Supply',
  'Capacity / Volume'
];

const FormattedNumberInput = ({ value, onChange, className, ...props }: any) => {
  const [displayValue, setDisplayValue] = React.useState('');

  React.useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      const parsedDisplay = parseFloat(String(displayValue).replace(/,/g, ''));
      const numVal = Number(value);
      if (parsedDisplay !== numVal || isNaN(parsedDisplay)) {
        setDisplayValue(isNaN(numVal) ? '' : numVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  const handleBlur = () => {
    if (value !== undefined && value !== null && value !== '') {
      const numVal = Number(value);
      setDisplayValue(isNaN(numVal) ? '' : numVal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDisplayValue(val);
    const raw = val.replace(/,/g, '');
    if (raw === '' || raw === '-') {
      onChange(0);
      return;
    }
    const num = parseFloat(raw);
    if (!isNaN(num)) {
      onChange(num);
    }
  };

  return (
    <input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      {...props}
    />
  );
};

const CreatableCombobox = ({ value, onChange, options, placeholder, className }: any) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(value || '');
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt: string) => 
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );
  
  // Custom sorting to prioritize "starts with"
  filteredOptions.sort((a: string, b: string) => {
    const aStarts = a.toLowerCase().startsWith(inputValue.toLowerCase());
    const bStarts = b.toLowerCase().startsWith(inputValue.toLowerCase());
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return a.localeCompare(b);
  });
  
  const showCreateOption = inputValue && !options.some((opt: string) => opt.toLowerCase() === inputValue.toLowerCase());

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={className}
        placeholder={placeholder}
      />
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filteredOptions.length > 0 && filteredOptions.map((opt: string) => (
            <div
              key={opt}
              className="px-3 py-2 text-sm cursor-pointer hover:bg-slate-100 text-slate-800"
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                setInputValue(opt);
                onChange(opt);
                setIsOpen(false);
              }}
            >
              {opt}
            </div>
          ))}
          {showCreateOption && (
            <div
              className="px-3 py-2 text-sm cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 border-t border-slate-100"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputValue(inputValue);
                onChange(inputValue);
                setIsOpen(false);
              }}
            >
              + Create "{inputValue}"
            </div>
          )}
          {filteredOptions.length === 0 && !showCreateOption && (
            <div className="px-3 py-2 text-sm text-slate-500 italic">
              No matching options
            </div>
          )}
        </div>
      )}
    </div>
  );
};


const dataUrlBlobCache = new Map<string, string>();

/**
 * Safely converts Base64 Data URLs to Blob URLs to bypass browser sandbox, iframe, 
 * and target="_blank" about:blank blocking behaviors in modern browsers like Chrome and Opera.
 */
function getSafeBlobUrl(url: string): string {
  if (!url) return '';
  if (!url.startsWith('data:')) return url; // Keep remote URLs unchanged

  const cached = dataUrlBlobCache.get(url);
  if (cached) return cached;

  try {
    const arr = url.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : '';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    dataUrlBlobCache.set(url, blobUrl);
    return blobUrl;
  } catch (e) {
    console.error("Failed to convert data URL to blob URL:", e);
    return url; // Fallback to raw data URL on any error
  }
}

const CANONICAL_ATTRIBUTE_MAP: Record<string, string> = {
  'brand': 'Brand / Make',
  'make': 'Brand / Make',
  'manufacturer': 'Brand / Make',
  'brand / make': 'Brand / Make',
  'model': 'Model',
  'model no': 'Model',
  'model number': 'Model',
  'opening': 'Top/Bottom Opening',
  'openings': 'Top/Bottom Opening',
  'top/bottom opening': 'Top/Bottom Opening',
  'top & bottom opening': 'Top/Bottom Opening',
  'design pressure': 'Design Pressure',
  'working pressure': 'Design Pressure',
  'pressure': 'Design Pressure',
  'standard': 'Standard',
  'standards': 'Standard',
  'dimensions': 'Dimensions',
  'size': 'Dimensions',
  'tank size': 'Dimensions',
  'vessel size': 'Dimensions',
  'volume': 'Volume',
  'capacity': 'Volume',
};

const normalizeAttributeKey = (rawKey: string): string => {
  if (!rawKey) return '';
  const clean = rawKey.trim().toLowerCase();
  return CANONICAL_ATTRIBUTE_MAP[clean] || rawKey.trim();
};

interface CatalogItem {
  id?: string;
  name?: string;
  sku?: string;
  brand_make?: string;
  model_part_no?: string;
  country_of_origin?: string;
  hs_code?: string;
  image_url?: string;
  datasheet_attachment?: Attachment;
  is_inventoried?: boolean;
  stock_on_hand?: number;
  stock_reserved?: number;
  reorder_level?: number;
  product_type: ProductType;
  description: string;
  unit: UnitType;
  unit_price_aed?: number;
  cost_price_aed?: number;
  lead_time_note?: string;
  attributes?: ProductAttribute[];
}

interface EnquiryFormProps {
  enquiries?: Enquiry[];
  companies: Company[];
  contacts: Contact[];
  salespersons: { id?: string; initials?: string; full_name: string }[];
  products: Product[];
  enquirySources?: string[];
  productCategories?: string[];
  units?: string[];
  enquiryToEdit?: Enquiry | null;
  onClose: () => void;
  onSaveAndOpenStudio?: (savedEnquiry: Enquiry) => void;
  user: any;
  nextSn: number;
  triggerToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  setEnquiries?: React.Dispatch<React.SetStateAction<Enquiry[]>>;
  setCompanies?: React.Dispatch<React.SetStateAction<Company[]>>;
  setContacts?: React.Dispatch<React.SetStateAction<Contact[]>>;
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setAuditLogs?: React.Dispatch<React.SetStateAction<any[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setEnquirySources?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setUnits?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  setSalespersons?: React.Dispatch<React.SetStateAction<Salesperson[]>>;
  activeWorkspace?: Workspace;
  allowUserSalespersonSelection?: boolean;
}

export default function EnquiryForm({
  enquiries = [],
  companies,
  contacts,
  salespersons,
  products,
  enquirySources = [],
  productCategories = [],
  units = [],
  enquiryToEdit,
  onClose,
  onSaveAndOpenStudio,
  user,
  nextSn,
  triggerToast,
  setEnquiries,
  setCompanies,
  setContacts,
  setProducts,
  setAuditLogs,
  setProductCategories,
  setEnquirySources,
  setUnits,
  setSalespersons,
  activeWorkspace,
  allowUserSalespersonSelection = false
}: EnquiryFormProps) {
  const fallbackSources = ['Email', 'Phone', 'WhatsApp', 'Meeting', 'Verbal'];
  const fallbackCategories = [
    'FRP Tanks',
    'FRP Vessels',
    'Pressure Vessels',
    'RO Membranes',
    'RO Housing',
    'Cartridge Filters',
    'Dosing Pumps',
    'MBBR Media',
    'Filter Media',
    'Tube Settler Media',
    'Chemicals',
    'Valves',
    'Frames/Fabrication',
    'Various',
    'Other'
  ];
  const fallbackUnits = ['Nos', 'M3', 'MT', 'Set', 'LS', 'Kg'];

  const [extraCategories, setExtraCategories] = useState<string[]>([]);

  const activeSources = enquirySources.length > 0 ? enquirySources : fallbackSources;
  const baseCategories = productCategories.length > 0 ? productCategories : fallbackCategories;
  const activeCategories = Array.from(new Set([...baseCategories, ...extraCategories]));
  const activeUnits = units.length > 0 ? units : fallbackUnits;

  // Sort states for dropdowns
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categoriesSort, setCategoriesSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [salespersonsSort, setSalespersonsSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [sourcesSort, setSourcesSort] = useState<'default' | 'asc' | 'desc'>('default');
  const [unitsSort, setUnitsSort] = useState<'default' | 'asc' | 'desc'>('default');

  // Sorted list selectors
  const sortedSalespersons = React.useMemo(() => {
    const list = [...salespersons];
    if (salespersonsSort === 'asc') {
      return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
    if (salespersonsSort === 'desc') {
      return list.sort((a, b) => b.full_name.localeCompare(a.full_name));
    }
    return list;
  }, [salespersons, salespersonsSort]);

  const sortedSources = React.useMemo(() => {
    const list = [...activeSources];
    if (sourcesSort === 'asc') {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (sourcesSort === 'desc') {
      return list.sort((a, b) => b.localeCompare(a));
    }
    return list;
  }, [activeSources, sourcesSort]);

  const sortedCategories = React.useMemo(() => {
    const list = [...activeCategories];
    if (categoriesSort === 'asc') {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (categoriesSort === 'desc') {
      return list.sort((a, b) => b.localeCompare(a));
    }
    return list;
  }, [activeCategories, categoriesSort]);

  const sortedUnits = React.useMemo(() => {
    const list = [...activeUnits];
    if (unitsSort === 'asc') {
      return list.sort((a, b) => a.localeCompare(b));
    }
    if (unitsSort === 'desc') {
      return list.sort((a, b) => b.localeCompare(a));
    }
    return list;
  }, [activeUnits, unitsSort]);

  // Ultra-subtle sort button helper (Sort / A–Z / Z–A)
  const renderSortButton = (
    currentSort: 'default' | 'asc' | 'desc',
    setSort: (val: 'default' | 'asc' | 'desc') => void,
    title: string
  ) => {
    const cycleSort = () => {
      if (currentSort === 'default') setSort('asc');
      else if (currentSort === 'asc') setSort('desc');
      else setSort('default');
    };

    const label = currentSort === 'asc' ? 'A–Z' : currentSort === 'desc' ? 'Z–A' : 'Sort';
    const isActive = currentSort !== 'default';

    return (
      <button
        type="button"
        onClick={cycleSort}
        className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border transition inline-flex items-center gap-0.5 align-middle cursor-pointer shrink-0 ${
          isActive
            ? 'bg-blue-50/80 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-200/80 dark:border-blue-800 font-semibold'
            : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 bg-transparent border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
        title={`Change sort order for ${title} (Current: ${label})`}
      >
        {currentSort === 'default' && <ArrowUpDown className="w-2.5 h-2.5 shrink-0" />}
        {currentSort === 'asc' && <ArrowUp className="w-2.5 h-2.5 shrink-0" />}
        {currentSort === 'desc' && <ArrowDown className="w-2.5 h-2.5 shrink-0" />}
        <span>{label}</span>
      </button>
    );
  };

  // Calibrate default S/N based strictly on non-deleted active/reserved workspace enquiries
  const calibratedDefaultSn = React.useMemo(() => {
    if (enquiries && enquiries.length > 0) {
      const currentWorkspaceId = activeWorkspace?.id;
      const workspaceEnqs = enquiries.filter((e) => {
        if (e.is_deleted) return false;
        const eWid = e.workspace_id || (e as any).workspaceId;
        return eWid === currentWorkspaceId || (!eWid && activeWorkspace?.is_default);
      });
      const maxSn = workspaceEnqs.reduce((max, e) => Math.max(max, Number(e.sn) || 0), 0);
      return maxSn > 0 ? maxSn + 1 : (nextSn || 1001);
    }
    return nextSn || 1001;
  }, [enquiries, activeWorkspace, nextSn]);

  // Parent state fields
  const [sn, setSn] = useState(calibratedDefaultSn);
  const [enquiryDate, setEnquiryDate] = useState(new Date().toISOString().split('T')[0]);
  const [loggedDate, setLoggedDate] = useState(new Date().toISOString().split('T')[0]);
  const [salesPerson, setSalesPerson] = useState('');
  const [concernedPersons, setConcernedPersons] = useState<string[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [contactId, setContactId] = useState('');
  const [country, setCountry] = useState('UAE');
  const [projectLocation, setProjectLocation] = useState('');
  const defaultEmailSource = activeSources.find(s => s.toLowerCase().includes('email')) || activeSources[0] || 'Email';
  const [enquirySource, setEnquirySource] = useState<string>(defaultEmailSource);
  const [status, setStatus] = useState<EnquiryStatus>('Active');
  const [quoteRefNo, setQuoteRefNo] = useState('');
  const [projectedOrderDate, setProjectedOrderDate] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState('');
  const [isLumpSum, setIsLumpSum] = useState(false);
  const [manualValue, setManualValue] = useState<number>(0);
  const [remarks, setRemarks] = useState('');
  const [invoicePoNo, setInvoicePoNo] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [validityDays, setValidityDays] = useState<number>(30);
  const [priceBasis, setPriceBasis] = useState<string>('');
  const [deliveryPeriod, setDeliveryPeriod] = useState<string>('');
  const [paymentTerms, setPaymentTerms] = useState<string>('');
  const [taxMode, setTaxMode] = useState<QuotationTaxMode>('taxes_extra');
  const [subject, setSubject] = useState('');
  const [customerReferenceCode, setCustomerReferenceCode] = useState('');
  const [proposalOption, setProposalOption] = useState('');

  // Submit and form sequence states
  const [shiftExistingOnCollision, setShiftExistingOnCollision] = useState<boolean>(false);
  const [submitMode, setSubmitMode] = useState<'close' | 'another' | 'open_studio'>('close');
  const submitModeRef = React.useRef<'close' | 'another' | 'open_studio'>('close');
  const updateSubmitMode = (mode: 'close' | 'another' | 'open_studio') => {
    setSubmitMode(mode);
    submitModeRef.current = mode;
  };

  const resetForm = (newSn: number) => {
    setSn(newSn);
    setConcernedPersons([]);
    setCompanyId('');
    setContactId('');
    setCompanySearch('');
    setProjectLocation('');
    setProjectedOrderDate('');
    setNextFollowupDate('');
    setIsLumpSum(false);
    setManualValue(0);
    setRemarks('');
    setInvoicePoNo('');
    setPaymentStatus('');
    setValidityDays(30);
    setPriceBasis('');
    setDeliveryPeriod('');
    setPaymentTerms('');
    setTaxMode('taxes_extra');
    setSubject('');
    setCustomerReferenceCode('');
    setProposalOption('');
    setLineItems([]);
    setAttachments([]);
    setParentId(null);
    setRevisionNumber(0);
    setAiConfidence(null);
  };

  // Line items state
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [linkingLineIndex, setLinkingLineIndex] = useState<number | null>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('All');
  const [catalogStockFilter, setCatalogStockFilter] = useState<'all' | 'in_stock' | 'low_stock'>('all');
  const [saveToCatalogState, setSaveToCatalogState] = useState<{
    isOpen: boolean;
    item: any;
    itemIndex: number;
  }>({ isOpen: false, item: null, itemIndex: -1 });
  const [syncingCatalogIdx, setSyncingCatalogIdx] = useState<number | null>(null);
  const [customContactInput, setCustomContactInput] = useState('');
  const [isCreatingContactInline, setIsCreatingContactInline] = useState(false);

  const combinedCatalog = React.useMemo(() => {
    return (products || [])
      .filter((p) => !p.is_deleted)
      .map((p) => {
        const defaultLeadTime =
          p.default_availability?.trim() ||
          ((p as any).lead_time_note?.trim()
            ? (p as any).lead_time_note
            : p.is_inventoried && (p.stock_on_hand || 0) - (p.stock_reserved || 0) > 0
            ? 'Ex-Stock'
            : '');
        const cleanUnit =
          !p.unit || String(p.unit).toLowerCase() === 'custom unit' ? ('Nos' as UnitType) : p.unit;
        return {
          id: p.id,
          name: p.name || p.product_type,
          sku: p.sku || '',
          brand_make: p.brand_make || '',
          model_part_no: p.model_part_no || '',
          country_of_origin: p.country_of_origin || '',
          hs_code: p.hs_code || '',
          image_url: p.image_url || '',
          datasheet_attachment: p.datasheet_attachment,
          is_inventoried: p.is_inventoried,
          stock_on_hand: p.stock_on_hand,
          stock_reserved: p.stock_reserved,
          reorder_level: p.reorder_level,
          product_type: p.product_type,
          description: p.description,
          unit: cleanUnit,
          unit_price_aed: p.unit_price,
          cost_price_aed: p.cost_price ?? p.cost_price_aed,
          lead_time_note: defaultLeadTime,
          attributes: p.attributes || [],
          is_composite_set: p.is_composite_set,
          sub_components: p.sub_components,
          package_pricing_mode: p.package_pricing_mode,
          option_scope_notes: p.option_scope_notes,
        };
      });
  }, [products]);

  const filteredCatalog = React.useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    return combinedCatalog.filter((item) => {
      const matchesSearch =
        !q ||
        (item.name || '').toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        (item.sku || '').toLowerCase().includes(q) ||
        (item.brand_make || '').toLowerCase().includes(q) ||
        (item.model_part_no || '').toLowerCase().includes(q);
      const matchesCategory =
        catalogCategory === 'All' ||
        item.product_type === catalogCategory ||
        (catalogCategory === 'Filter Media' && item.product_type === 'Sand Media');
      const avail = (item.stock_on_hand || 0) - (item.stock_reserved || 0);
      const isLow = Boolean(item.is_inventoried) && avail <= (item.reorder_level || 0);
      const matchesStock =
        catalogStockFilter === 'all' ||
        (catalogStockFilter === 'in_stock' && Boolean(item.is_inventoried) && avail > 0) ||
        (catalogStockFilter === 'low_stock' && isLow);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [combinedCatalog, catalogSearch, catalogCategory, catalogStockFilter]);

  // Attachments state
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadTarget, setUploadTarget] = useState<'cloud' | 'local'>('cloud');
  const [promotingAttachmentKey, setPromotingAttachmentKey] = useState<string | null>(null);
  const [uploading, setGeneratingUrl] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [currentUploadingFile, setCurrentUploadingFile] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatusText, setExtractionStatusText] = useState('Extracting...');
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [showGeminiKeyModal, setShowGeminiKeyModal] = useState(false);
  const [selectedAiModel, setSelectedAiModel] = useState<string>(() => {
    const saved = localStorage.getItem('omni_gemini_model_preference');
    if (!saved || saved.startsWith('gemini-2.5') || saved === 'gemini-3.1-pro') return 'auto';
    if (AVAILABLE_GEMINI_MODELS.some((m) => m.id === saved)) return saved;
    return 'auto';
  });
  const [aiScanMode, setAiScanMode] = useState<'fast' | 'deep'>('fast');
  const [extractionElapsedSec, setExtractionElapsedSec] = useState<number>(0);
  const extractionAbortRef = useRef<AbortController | null>(null);
  const userStoppedExtractionRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isExtracting) {
      setExtractionElapsedSec(0);
      return;
    }
    setExtractionElapsedSec(0);
    const intervalId = setInterval(() => {
      setExtractionElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [isExtracting]);

  const handleStopExtraction = () => {
    userStoppedExtractionRef.current = true;
    if (extractionAbortRef.current) {
      try {
        extractionAbortRef.current.abort();
      } catch {
        // ignore
      }
      extractionAbortRef.current = null;
    }
    setIsExtracting(false);
    setExtractionStatusText('');
    setExtractionError(null);
    if (triggerToast) {
      triggerToast('AI Autofill stopped — source file kept attached', 'info');
    }
  };

  // Revoke cached blob object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (extractionAbortRef.current) {
        try {
          extractionAbortRef.current.abort();
        } catch {
          // ignore
        }
      }
      dataUrlBlobCache.forEach((blobUrl) => {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // ignore
        }
      });
      dataUrlBlobCache.clear();
    };
  }, []);
  const [aiConfidence, setAiConfidence] = useState<{
    company_name?: 'high' | 'medium' | 'low';
    contact_name?: 'high' | 'medium' | 'low';
    project_location?: 'high' | 'medium' | 'low';
    line_items?: 'high' | 'medium' | 'low';
  } | null>(null);

  // Document preview states
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string>('');
  const [previewFileType, setPreviewFileType] = useState<string>('application/pdf');

  // Smart Paste Text Preview & Layout Sizing states
  const [pastedSourceText, setPastedSourceText] = useState<string | null>(null);
  const [pastedExtractedData, setPastedExtractedData] = useState<any | null>(null);
  const [previewMinimized, setPreviewMinimized] = useState<boolean>(false);
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [glowingField, setGlowingField] = useState<string | null>(null);

  // Custom Quote Ref flag to prevent auto-calculation override bug
  const [isQuoteRefCustom, setIsQuoteRefCustom] = useState<boolean>(false);

  // Multi-level Hierarchical Token Expansion for Line Items
  const [expandedLineItemsToken, setExpandedLineItemsToken] = useState<boolean>(false);
  const [expandedItemIndices, setExpandedItemIndices] = useState<number[]>([]);
  const [editingLineTotalIdx, setEditingLineTotalIdx] = useState<number | null>(null);

  // Modal state for Confirm Entity Registration
  const [showConfirmRegistrationModal, setShowConfirmRegistrationModal] = useState<boolean>(false);

  // Custom Project Specifications & Details (Key-Value pairs)
  const [parentId, setParentId] = useState<string | null>(enquiryToEdit?.parent_id ?? null);
  const [revisionNumber, setRevisionNumber] = useState<number>(
    typeof enquiryToEdit?.revision_number === 'number'
      ? enquiryToEdit.revision_number
      : (enquiryToEdit?.parent_id ? 1 : 0)
  );
  const [customProjectDetails, setCustomProjectDetails] = useState<Array<{ key: string; value: string }>>([]);

  // Detected Unregistered Entities State (Company, Contact, Sales Person)
  const [unregisteredEntities, setUnregisteredEntities] = useState<{
    companyName?: string;
    legalSuffix?: string;
    city?: string;
    country?: string;
    relationship?: string;
    temperature?: string;
    contactName?: string;
    contactDesignation?: string;
    contactEmail?: string;
    contactMobile?: string;
    generalPhone?: string;
    generalEmail?: string;
    salespersonName?: string;
    emailDestination: 'contact' | 'company';
    phoneDestination: 'contact' | 'company';
    companyResolutionMode?: 'create' | 'link';
    linkedCompanyId?: string;
    linkedCompanySearchTerm?: string;
    ignoreContact?: boolean;
  } | null>(null);

  // Global keyboard paste listener (Ctrl+V / Cmd+V anywhere on form for instant autofill)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Don't intercept if user is typing in an active input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const pastedText = e.clipboardData?.getData('text');
      if (pastedText && pastedText.trim().length > 10) {
        e.preventDefault();
        handleExtractFromRawText(pastedText);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, []);
  const [activeFormSection, setActiveFormSection] = useState<'company' | 'line_items' | 'value'>('company');
  const disclosure = useEnquiryDisclosureState(Boolean(enquiryToEdit?.id));

  const handleFormScroll = (e: React.UIEvent<HTMLFieldSetElement>) => {
    const container = e.currentTarget;
    const containerRect = container.getBoundingClientRect();
    const sectionOrder: Array<{ key: 'company' | 'line_items' | 'value'; id: string }> = [
      { key: 'company', id: 'field-company' },
      { key: 'line_items', id: 'field-line_items' },
      { key: 'value', id: 'field-value' }
    ];

    // If scrolled near the bottom of the drawer, highlight section 3
    if (container.scrollHeight - container.scrollTop - container.clientHeight <= 48) {
      if (activeFormSection !== 'value') setActiveFormSection('value');
      return;
    }

    let current: 'company' | 'line_items' | 'value' = 'company';
    for (const sec of sectionOrder) {
      const el = document.getElementById(sec.id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top - containerRect.top <= 140) {
          current = sec.key;
        }
      }
    }
    if (current !== activeFormSection) {
      setActiveFormSection(current);
    }
  };

  const scrollToField = (fieldKey: string) => {
    disclosure.ensureFieldVisible(fieldKey);
    if (fieldKey === 'company' || fieldKey === 'line_items' || fieldKey === 'value') {
      setActiveFormSection(fieldKey);
    } else if (
      fieldKey === 'country' ||
      fieldKey === 'location' ||
      fieldKey === 'received_date' ||
      fieldKey === 'quote_ref_no' ||
      fieldKey === 'salesperson' ||
      fieldKey === 'subject' ||
      fieldKey === 'contact' ||
      fieldKey === 'unregistered_entities' ||
      fieldKey === 'custom_project_details'
    ) {
      setActiveFormSection('company');
    } else if (fieldKey.startsWith('line_item_')) {
      setActiveFormSection('line_items');
    } else if (
      fieldKey === 'source_files' ||
      fieldKey === 'price_basis' ||
      fieldKey === 'delivery_period' ||
      fieldKey === 'payment_terms' ||
      fieldKey === 'validity_days' ||
      fieldKey === 'tax_mode' ||
      fieldKey === 'remarks' ||
      fieldKey === 'commercial_terms' ||
      fieldKey === 'invoice_po_no' ||
      fieldKey === 'payment_status'
    ) {
      setActiveFormSection('value');
    }
    setHighlightedField(fieldKey);
    setGlowingField(fieldKey);

    const idMap: Record<string, string> = {
      quote_ref_no: 'field-quote_ref_no',
      company: 'field-company',
      contact: 'field-contact',
      salesperson: 'field-salesperson',
      received_date: 'field-received_date',
      location: 'field-location',
      country: 'field-country',
      value: 'field-value',
      line_items: 'field-line_items',
      subject: 'field-subject',
      custom_project_details: 'field-custom_project_details',
      unregistered_entities: 'field-unregistered_entities',
      price_basis: 'field-price_basis',
      delivery_period: 'field-delivery_period',
      payment_terms: 'field-payment_terms',
      validity_days: 'field-validity_days',
      tax_mode: 'field-tax_mode',
      remarks: 'field-remarks'
    };

    const targetId = idMap[fieldKey] || `field-${fieldKey}`;
    setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) {
        const isSectionJump = fieldKey === 'company' || fieldKey === 'line_items' || fieldKey === 'value';
        el.scrollIntoView({ behavior: 'smooth', block: isSectionJump ? 'start' : 'center' });
      }
    }, 35);

    setTimeout(() => {
      setGlowingField(null);
    }, 2800);
  };

  // Helper for applying visual highlight rings & temporary glow on autofilled fields
  const getHighlightClasses = (field: string) => {
    if (glowingField === field) {
      return 'ring-4 ring-emerald-500/80 bg-emerald-50/90 border-emerald-500 shadow-lg scale-[1.01] transition-all duration-300 animate-pulse';
    }
    if (highlightedField === field) {
      return 'ring-2 ring-emerald-500 bg-emerald-50/50 border-emerald-400 transition-all duration-300 shadow-sm';
    }
    return '';
  };

  // Shared parser for commercial terms, header salesperson/company ("received by X for Y"), and unit/package prices
  const extractCommercialTermsAndHeaderFromText = React.useCallback(
    (rawText?: string | null) => {
      const result: {
        salesperson?: string;
        companyName?: string;
        subject?: string;
        priceBasis?: string;
        deliveryPeriod?: string;
        paymentTerms?: string;
        validityDays?: number;
        taxMode?: QuotationTaxMode;
        unitPrice?: number;
      } = {};
      if (!rawText || typeof rawText !== 'string') return result;
      const clean = rawText.trim();
      if (!clean) return result;

      // 1. Header pattern: e.g. "A RFQ received by Nitin Srivastava for Metichem - Enquiry Details:"
      const receivedByForMatch = clean.match(
        /received\s+by\s+([A-Za-z][A-Za-z\s.]{1,40}?)\s+for\s+([^\n\r\-–—:]+?)(?:\s*[-–—:]|\r|\n|$)/i
      );
      if (receivedByForMatch) {
        result.salesperson = receivedByForMatch[1].trim();
        const candidateComp = receivedByForMatch[2].trim();
        if (candidateComp && !/^(enquiry|rfq|quotation|quote|details)$/i.test(candidateComp)) {
          result.companyName = candidateComp;
        }
      } else {
        const spExplicitMatch = clean.match(
          /(?:received\s+by|sales\s*person|sales\s*rep|assigned\s+to|prepared\s+by|handled\s+by)\s*[:=-]?\s*([A-Za-z][A-Za-z\s.]{1,35}?)(?=\s+for\b|\s*[-–—:,\n\r]|$)/i
        );
        if (spExplicitMatch) {
          result.salesperson = spExplicitMatch[1].trim();
        }
      }

      // Match workspace salespersons by full name or first name if still not resolved
      if (Array.isArray(salespersons) && salespersons.length > 0) {
        const lowerClean = clean.toLowerCase();
        for (const sp of salespersons) {
          const fullName = (sp.full_name || '').trim();
          if (fullName && fullName.length >= 3 && lowerClean.includes(fullName.toLowerCase())) {
            result.salesperson = sp.id || sp.initials || fullName;
            break;
          }
        }
        if (result.salesperson) {
          const rawSpLower = result.salesperson.toLowerCase();
          const firstToken = rawSpLower.split(/\s+/)[0];
          const matchedSp = salespersons.find((sp) => {
            const fn = (sp.full_name || '').toLowerCase();
            const ini = (sp.initials || '').toLowerCase();
            return (
              sp.id === result.salesperson ||
              fn === rawSpLower ||
              ini === rawSpLower ||
              fn.includes(rawSpLower) ||
              (firstToken.length >= 3 && fn.split(/\s+/)[0] === firstToken)
            );
          });
          if (matchedSp) {
            result.salesperson = matchedSp.id || matchedSp.initials || matchedSp.full_name;
          }
        }
      }

      // 2. Company Name fallback from "for [Company]" or matching workspace companies
      if (!result.companyName) {
        const forCompanyMatch = clean.match(
          /(?:rfq|enquiry|quote|quotation|proposal|inquiry)[^\n\r]{0,50}?\bfor\s+([A-Z][A-Za-z0-9\s&.,()-]{1,55}?)(?:\s*[-–—:]\s*(?:enquiry|rfq|details|scope)|\r|\n|$)/i
        );
        if (forCompanyMatch) {
          const cand = forCompanyMatch[1].trim();
          if (cand && !/^(enquiry|rfq|quotation|details|supply)$/i.test(cand)) {
            result.companyName = cand;
          }
        }
      }
      if (!result.companyName && Array.isArray(companies) && companies.length > 0) {
        const lowerClean = clean.toLowerCase();
        for (const comp of companies) {
          const dName = (comp.display_name || '').trim();
          if (dName && dName.length >= 4 && lowerClean.includes(dName.toLowerCase())) {
            result.companyName = dName;
            break;
          }
        }
      }

      // 3. Subject / Primary Equipment Title detection
      const subjExplicit = clean.match(/(?:subject|project\s*title|re)\s*[:=-]\s*([^\n\r]+)/i);
      if (subjExplicit && subjExplicit[1]?.trim()) {
        result.subject = subjExplicit[1].trim();
      } else {
        const lines = clean
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines.slice(0, 5)) {
          if (
            /received\s+by/i.test(line) ||
            /^(from|to|client|company|attn|date|email|phone|tel)\b/i.test(line)
          ) {
            continue;
          }
          if (
            /\b(system|skid|unit|package|plant|vessel|pump|valve|filter|softener|ro\b|uf\b|mmf\b|dosing|panel|supply|assembly)\b/i.test(
              line
            ) &&
            line.length <= 120
          ) {
            result.subject = line.replace(/^\d+[\.\)]\s*/, '').trim();
            break;
          }
        }
      }

      // 4. Price Basis / Incoterms
      const explicitBasis = clean.match(
        /(?:price\s*basis|incoterms?|basis\s*of\s*price|delivery\s*basis)\s*[:=-]\s*([^\n\r;|]+)/i
      );
      if (explicitBasis && explicitBasis[1]?.trim()) {
        result.priceBasis = explicitBasis[1].trim();
      } else {
        const standaloneBasis = clean.match(
          /(?:^|[\n\r;|•])\s*((?:ex[\s-]*warehouse|ex[\s-]*works|exw\b|ddp\b|cif\b|fob\b|cfr\b|dap\b)[^\n\r;|]*)/i
        );
        if (standaloneBasis && standaloneBasis[1]?.trim()) {
          result.priceBasis = standaloneBasis[1].trim();
        }
      }

      // 5. Delivery Period / Lead Time
      const deliveryMatch = clean.match(
        /(?:delivery(?:\s*period|\s*time|\s*terms|\s*schedule)?|lead\s*time)\s*[:=-]\s*([^\n\r;|]+)/i
      );
      if (deliveryMatch && deliveryMatch[1]?.trim()) {
        result.deliveryPeriod = deliveryMatch[1].trim();
      } else {
        const weeksStandalone = clean.match(
          /(?:^|[\n\r;|•])\s*(\d+\s*(?:[-–to]+\s*\d+\s*)?(?:weeks?|days?|months?)\s*(?:from\s+[^\n\r;|]+)?|ex[\s-]*stock(?:\s*\/\s*immediate)?)/i
        );
        if (weeksStandalone && weeksStandalone[1]?.trim()) {
          result.deliveryPeriod = weeksStandalone[1].trim();
        }
      }

      // 6. Payment Terms
      const paymentMatch = clean.match(
        /(?:payment(?:\s*terms)?|terms\s*of\s*payment)\s*[:=-]\s*([^\n\r;|]+)/i
      );
      if (paymentMatch && paymentMatch[1]?.trim()) {
        result.paymentTerms = paymentMatch[1].trim();
      } else {
        const advanceLine = clean.match(
          /(?:^|[\n\r;|•])\s*(\d{1,3}%\s*advance[^\n\r;|]*|\d+\s*days?\s*(?:pdc|credit|from\s+invoice)[^\n\r;|]*)/i
        );
        if (advanceLine && advanceLine[1]?.trim()) {
          result.paymentTerms = advanceLine[1].trim();
        }
      }

      // 7. Offer Validity (Days)
      const validityMatch =
        clean.match(/(?:offer\s*)?validity\s*[:=-]?\s*(\d{1,3})\s*days?/i) ||
        clean.match(/valid\s+for\s+(\d{1,3})\s*days?/i);
      if (validityMatch && validityMatch[1]) {
        const vDays = Number(validityMatch[1]);
        if (vDays > 0 && vDays <= 365) {
          result.validityDays = vDays;
        }
      }

      // 8. VAT / Tax Mode
      if (/\+\s*(?:5%\s*)?vat\b|\bexcl(?:uding|\.)?\s*vat\b|\bvat\s*extra\b/i.test(clean)) {
        result.taxMode = 'taxes_extra';
      } else if (/\bincl(?:uding|\.)?\s*vat\b|\bvat\s*included\b/i.test(clean)) {
        result.taxMode = 'tax_calculated';
      } else if (/\b(?:0%\s*vat|zero[\s-]*rated|tax\s*exempt)\b/i.test(clean)) {
        result.taxMode = 'tax_exempt';
      }

      // 9. Unit / Package Price (e.g. "Unit Price - AED 207,150.00 + VAT" or "Total: AED 45,000")
      const explicitPriceMatch =
        clean.match(
          /(?:unit\s*price|package\s*price|total\s*price|total\s*amount|offer\s*price|price|amount)\s*[-:=$]*\s*(?:aed|usd|\$)?\s*([\d,]{3,}(?:\.\d{1,2})?)/i
        ) ||
        clean.match(/(?:aed|usd|\$)\s*([\d,]{3,}(?:\.\d{1,2})?)/i);
      if (explicitPriceMatch && explicitPriceMatch[1]) {
        const parsedNum = Number(explicitPriceMatch[1].replace(/,/g, ''));
        if (!isNaN(parsedNum) && parsedNum > 0) {
          result.unitPrice = parsedNum;
        }
      }

      return result;
    },
    [salespersons, companies]
  );

  // Search/Fuzzy Company Add state
  const [companySearch, setCompanySearch] = useState('');

  // Unified live + AI extracted tokens so the "AI Extracted Field Tokens" card is ALWAYS populated
  // even when re-opening an existing Enquiry (where pastedExtractedData is null on reload)
  const effectiveExtractedTokens = React.useMemo(() => {
    const parsedFromRaw = extractCommercialTermsAndHeaderFromText(pastedSourceText);
    const resolvedCompName =
      pastedExtractedData?.company_name ||
      companies.find((c) => c.id === companyId)?.display_name ||
      (companySearch && companySearch.trim() ? companySearch.trim() : '') ||
      parsedFromRaw.companyName ||
      '';
    const resolvedContName =
      pastedExtractedData?.contact_name ||
      contacts.find((c) => c.id === contactId)?.full_name ||
      (customContactInput && customContactInput.trim() ? customContactInput.trim() : '') ||
      '';
    const resolvedSpObj = salespersons.find(
      (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
    );
    const resolvedSpName =
      resolvedSpObj?.full_name ||
      pastedExtractedData?.salesperson ||
      parsedFromRaw.salesperson ||
      salesPerson ||
      '';
    const resolvedValue =
      Number(pastedExtractedData?.package_value) > 0
        ? Number(pastedExtractedData.package_value)
        : Number(manualValue) > 0
        ? Number(manualValue)
        : parsedFromRaw.unitPrice || 0;
    const resolvedLineItems =
      Array.isArray(lineItems) && lineItems.length > 0
        ? lineItems
        : Array.isArray(pastedExtractedData?.line_items)
        ? pastedExtractedData.line_items
        : [];

    return {
      quote_ref_no: quoteRefNo || pastedExtractedData?.quote_ref_no || '',
      company_name: resolvedCompName,
      contact_name: resolvedContName,
      salesperson: resolvedSpName,
      subject: subject || pastedExtractedData?.subject || parsedFromRaw.subject || '',
      received_date: enquiryDate || pastedExtractedData?.received_date || '',
      project_location: projectLocation || pastedExtractedData?.project_location || '',
      country: country || pastedExtractedData?.country || '',
      price_basis: priceBasis || pastedExtractedData?.price_basis || parsedFromRaw.priceBasis || '',
      delivery_period:
        deliveryPeriod || pastedExtractedData?.delivery_period || parsedFromRaw.deliveryPeriod || '',
      payment_terms:
        paymentTerms || pastedExtractedData?.payment_terms || parsedFromRaw.paymentTerms || '',
      validity_days:
        validityDays || pastedExtractedData?.validity_days || parsedFromRaw.validityDays || 0,
      tax_mode: taxMode || pastedExtractedData?.tax_mode || parsedFromRaw.taxMode || '',
      package_value: resolvedValue,
      line_items: resolvedLineItems,
      remarks: remarks || pastedExtractedData?.remarks || ''
    };
  }, [
    pastedSourceText,
    pastedExtractedData,
    extractCommercialTermsAndHeaderFromText,
    companies,
    companyId,
    companySearch,
    contacts,
    contactId,
    customContactInput,
    salespersons,
    salesPerson,
    subject,
    enquiryDate,
    projectLocation,
    country,
    priceBasis,
    deliveryPeriod,
    paymentTerms,
    validityDays,
    taxMode,
    manualValue,
    lineItems,
    remarks
  ]);

  // Helper for bi-directional text highlighting in the raw source text preview
  const renderSourceTextWithHighlight = (text: string | null, fieldKey: string | null, data: any) => {
    try {
      if (!text || typeof text !== 'string') return null;
      const activeData = data || effectiveExtractedTokens;
      if (!fieldKey || !activeData) return text;

      let searchStr: string | null = null;
      if (fieldKey === 'quote_ref_no' && activeData.quote_ref_no) searchStr = String(activeData.quote_ref_no);
      else if (fieldKey === 'company' && activeData.company_name) searchStr = String(activeData.company_name);
      else if (fieldKey === 'contact' && activeData.contact_name) searchStr = String(activeData.contact_name);
      else if (fieldKey === 'salesperson' && activeData.salesperson) searchStr = String(activeData.salesperson);
      else if (fieldKey === 'received_date' && activeData.received_date) searchStr = String(activeData.received_date);
      else if (fieldKey === 'location' && activeData.project_location) searchStr = String(activeData.project_location);
      else if (fieldKey === 'country' && activeData.country) searchStr = String(activeData.country);
      else if (fieldKey === 'value' && activeData.package_value) {
        const formatted = Number(activeData.package_value).toLocaleString();
        searchStr = text.includes(formatted) ? formatted : String(activeData.package_value);
      } else if (fieldKey === 'subject' && activeData.subject) searchStr = String(activeData.subject);
      else if (fieldKey === 'price_basis' && activeData.price_basis) searchStr = String(activeData.price_basis);
      else if (fieldKey === 'delivery_period' && activeData.delivery_period) searchStr = String(activeData.delivery_period);
      else if (fieldKey === 'payment_terms' && activeData.payment_terms) searchStr = String(activeData.payment_terms);
      else if (fieldKey === 'validity_days' && activeData.validity_days) searchStr = `${activeData.validity_days}`;
      else if (fieldKey === 'tax_mode') searchStr = 'VAT';
      else if (fieldKey.startsWith('line_item_') && Array.isArray(activeData.line_items)) {
        const idx = parseInt(fieldKey.replace('line_item_', ''), 10);
        const item = activeData.line_items[idx];
        if (item) searchStr = item.item_name || item.description || item.product_type;
      } else if (fieldKey === 'line_items' && Array.isArray(activeData.line_items) && activeData.line_items[0]) {
        searchStr =
          activeData.line_items[0].item_name ||
          activeData.line_items[0].description ||
          activeData.line_items[0].product_type;
      }

      if (!searchStr || searchStr.trim().length < 2) return text;

      const cleanSearch = searchStr.trim();
      const escapedSearch = cleanSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const regex = new RegExp(`(${escapedSearch})`, 'gi');
      const parts = text.split(regex);

      return parts.map((part, i) => {
        if (part.toLowerCase() === cleanSearch.toLowerCase()) {
          return (
            <mark key={i} className="bg-amber-300 text-slate-950 font-bold px-1 rounded shadow-xs underline decoration-amber-600 decoration-2">
              {part}
            </mark>
          );
        }
        return part;
      });
    } catch {
      return text;
    }
  };

  // Auto-detect listener reading clipboard text with graceful fallback
  const handleAutoDetectClipboard = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        setRawTextModalOpen(true);
        if (triggerToast) triggerToast('Clipboard auto-read restricted in preview. Paste text below.', 'info');
        return;
      }
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        setRawTextModalOpen(true);
        if (triggerToast) triggerToast('Clipboard is empty. Paste text into the box below.', 'info');
        return;
      }

      if (triggerToast) triggerToast('Reading clipboard text for AI auto-detect...', 'info');
      await handleExtractFromRawText(text);
    } catch (err: any) {
      // Gracefully fall back to the Raw Text Paste Modal when browser permissions block readText
      console.warn('Clipboard read access restricted by permissions policy:', err?.message || err);
      setRawTextModalOpen(true);
      if (triggerToast) triggerToast('Clipboard read blocked by browser policy. Paste text below.', 'info');
    }
  };

  // Robust media type detection combining mimeType and file extension
  const mediaType = React.useMemo<'image' | 'pdf' | 'other'>(() => {
    const name = (previewFileName || '').toLowerCase();
    const mime = (previewFileType || '').toLowerCase();
    if (
      mime.startsWith('image/') ||
      name.endsWith('.png') ||
      name.endsWith('.jpg') ||
      name.endsWith('.jpeg') ||
      name.endsWith('.gif') ||
      name.endsWith('.webp') ||
      name.endsWith('.bmp') ||
      name.endsWith('.svg')
    ) {
      return 'image';
    }
    if (
      mime === 'application/pdf' ||
      name.endsWith('.pdf')
    ) {
      return 'pdf';
    }
    return 'other';
  }, [previewFileName, previewFileType]);

  // Admin New Product Category states
  const [newCategoryModal, setNewCategoryModal] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [showContactMenu, setShowContactMenu] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [initiatingLineItemIndex, setInitiatingLineItemIndex] = useState<number | null>(null);

  // Status text ticker for AI extraction phase
  useEffect(() => {
    if (!isExtracting) {
      setExtractionStatusText('Extracting...');
      return;
    }
    const stages = [
      "Analyzing document structure...",
      "Extracting text details with Gemini...",
      "Resolving companies and contacts...",
      "Decoding product categories and line items...",
      "Calibrating field confidence levels...",
      "Performing multi-tier fuzzy matching...",
      "Parsing commercial terms & currencies...",
      "Still processing, finalizing results..."
    ];
    let index = 0;
    setExtractionStatusText(stages[0]);
    const interval = setInterval(() => {
      index = (index + 1) % stages.length;
      setExtractionStatusText(stages[index]);
    }, 2500);
    return () => clearInterval(interval);
  }, [isExtracting]);

  // Client-side image downsampler to compress image attachments to sub-200KB JPEG
  const downsampleImage = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_DIM = 1200; // Optimal resolution for Gemini OCR
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          const base64 = dataUrl.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error("Could not get canvas context"));
        }
      };
      img.onerror = (err) => reject(err);
    });
  };

  const [showCompanyList, setShowCompanyList] = useState(false);
  const [newCompanyModal, setNewCompanyModal] = useState(false);
  const [isCreatingCompanyInline, setIsCreatingCompanyInline] = useState(false);

  // Inline company creation from search dropdown without losing form state
  const handleCreateCompanyInline = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed || isCreatingCompanyInline) return;

    // Check if already exists in workspace companies
    const existing = companies.find(
      (c) =>
        (c.display_name && c.display_name.toLowerCase() === trimmed.toLowerCase()) ||
        (c.canonical_name && c.canonical_name.toLowerCase() === trimmed.toLowerCase())
    );

    if (existing && existing.id) {
      setCompanyId(existing.id);
      setCompanySearch(existing.display_name);
      if (existing.country) setCountry(existing.country);
      if (existing.city) setProjectLocation(existing.city);
      setShowCompanyList(false);
      const prim = contacts.find((ct) => ct.company_id === existing.id && ct.is_primary);
      setContactId(prim?.id || '');
      if (triggerToast) {
        triggerToast(`Matched existing company: "${existing.display_name}"`, 'info');
      }
      return;
    }

    if (!activeWorkspace?.id) {
      if (triggerToast) {
        triggerToast('Error: Active workspace context is missing.', 'error');
      }
      return;
    }

    setIsCreatingCompanyInline(true);
    try {
      const newCompPayload: Omit<Company, 'id'> = {
        workspace_id: activeWorkspace.id,
        display_name: trimmed,
        canonical_name: trimmed,
        aliases: [trimmed],
        legal_suffix: 'None / To Be Added Later',
        city: projectLocation?.trim() || 'Dubai',
        country: country?.trim() || 'UAE',
        general_phone: undefined,
        general_email: undefined,
        notes: 'Created inline from Enquiry Form search dropdown',
        created_by_uid: user?.uid || '',
        created_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
        last_modified_by_uid: user?.uid || '',
        last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docId = await safeAddDoc('companies', newCompPayload);

      // Log audit
      await logAudit(docId.id, 'company', 'create', null, newCompPayload, []);

      if (setCompanies) {
        const newCompObj: Company = { id: docId.id, canonical_name: trimmed, ...newCompPayload };
        setCompanies((prev) => [newCompObj, ...prev.filter((c) => c.id !== docId.id)]);
      }

      // Immediately set selection in form and close dropdown without losing form data
      setCompanyId(docId.id);
      setCompanySearch(trimmed);
      if (!country) setCountry(newCompPayload.country);
      if (!projectLocation) setProjectLocation(newCompPayload.city);
      setContactId('');
      setShowCompanyList(false);

      if (triggerToast) {
        triggerToast(`Created and paired new company: "${trimmed}"`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to create company inline:', err);
      if (triggerToast) {
        triggerToast(`Error creating company: ${err?.message || 'Unknown error'}`, 'error');
      }
    } finally {
      setIsCreatingCompanyInline(false);
    }
  };

  // Inline contact creation from contact field or on submit
  const handleCreateContactInline = async (rawName: string, targetCompId?: string): Promise<string | null> => {
    const trimmed = rawName.trim();
    const resolvedCompId = targetCompId || companyId;
    if (!trimmed || !resolvedCompId || !activeWorkspace?.id) return null;

    const existing = contacts.find(
      (ct) => ct.company_id === resolvedCompId && ct.full_name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing && existing.id) {
      setContactId(existing.id);
      setCustomContactInput('');
      return existing.id;
    }

    setIsCreatingContactInline(true);
    try {
      const hasPrimary = contacts.some((ct) => ct.company_id === resolvedCompId && ct.is_primary);
      const newContactPayload = {
        workspace_id: activeWorkspace.id,
        company_id: resolvedCompId,
        full_name: trimmed,
        is_primary: !hasPrimary,
        createdAt: new Date().toISOString()
      };
      const docRef = await safeAddDoc('contacts', newContactPayload);
      await logAudit(docRef.id, 'contact', 'create', null, newContactPayload, []);
      if (setContacts) {
        const created: Contact = { id: docRef.id, ...newContactPayload };
        setContacts((prev) => [created, ...prev.filter((c) => c.id !== docRef.id)]);
      }
      setContactId(docRef.id);
      setCustomContactInput('');
      if (triggerToast) {
        triggerToast(`Saved contact "${trimmed}" to registry!`, 'success');
      }
      return docRef.id;
    } catch (err: any) {
      console.error('Failed to create contact inline:', err);
      if (triggerToast) {
        triggerToast(`Failed to save contact: ${err?.message || 'Unknown error'}`, 'error');
      }
      return null;
    } finally {
      setIsCreatingContactInline(false);
    }
  };

  // Raw Excel / Plain text AI paste modal states
  const [rawTextModalOpen, setRawTextModalOpen] = useState(false);
  const [rawTextInput, setRawTextInput] = useState('');

  const SAMPLE_EXCEL_ROW = `2792\t2751-300626AA\tJul-2026\t29/06/2026\tPV\tApex Industrial Solutions LLC\tRajesh Menon\trajesh.menon@apexindustrial.com\t\t+971 55 267 0574\tUAE\tDubai\tEMAIL\tCommercial Control Units, Modular Assembly Package and Actuated Valve Manifold\t"Commercial Control Unit
Quantity 05 Nos.

10 Weeks from Order and advance payment

Model CCU-6300 (Heavy Duty)
Arrangements 04 Duty + 01 Standby
Type Vertical Skid-Mounted
Enclosure Grade SS316L / IP65
Design Rating 10.5 Bar
Operation Automatic PLC
Accessories Dual Manifold Header, Pressure Relief Assembly, Flanged Connection Kit
Manufacturing Standard: ISO 9001 / ASME Compliant
Make OEM Standard

Auxiliary Sensor Module
Quantity 5 Sets - Client Scope

Consumables & Spares Kit
Quantity 5 Sets
Contents: Primary Seal Set, Calibration Kit, Mounting Hardware
Make Standard OEM

Actuated Isolation Valves – DN80
Quantity 15 Nos. (Duty)
Make Georg Fischer

Pneumatic Bypass Valves – DN100
Quantity 10 Nos. (Duty)
Make Georg Fischer

Modular Skid Frame & Instrumentation Header
Quantity 05 Sets (Duty)
Size As per Design, Type Fabricated Skid, Material Coated Carbon Steel, Main Header DN100 Flanged Termination, Pressure Gauges 15 Nos. - Wika
PRICE & COMMERCIAL TERMS
Sl. No. Description Qty Unit Price (AED) Total Amount (AED)
1 Commercial Control Unit Model CCU-6300 Design Rating: 10.5 Bar Ex-Works UAE Basis 05 Nos. 12,500.00 62,500.00
2 Auxiliary Sensor Module (CLIENT SCOPE) 05 Set NA NA
3 Consumables & Spares Kit Ex-Works UAE Basis 05 Set 1,500.00 7,500.00
4 Actuated Isolation Valves with Manifold Piping, Pressure Gauges and Modular Skid Frame 05 Set 23,100.00 115,500.00"\t195,500.00`;

  // Currency of this individual Enquiry (AED or USD)
  const [formCurrency, setFormCurrency] = useState<'AED' | 'USD'>('AED');

  const handleCurrencySwitch = (targetCurrency: 'AED' | 'USD') => {
    if (targetCurrency === formCurrency) return;
    const rate = targetCurrency === 'USD' ? 1 / 3.6725 : 3.6725;
    setLineItems((prev) =>
      prev.map((li) => {
        const nextPrice = Number(((Number(li.unit_price) || 0) * rate).toFixed(2));
        const nextQty = Number(li.qty) || 0;
        const nextCost =
          li.cost_price !== undefined ? Number(((Number(li.cost_price) || 0) * rate).toFixed(2)) : undefined;
        return {
          ...li,
          unit_price: nextPrice,
          total: Number((nextQty * nextPrice).toFixed(2)),
          ...(nextCost !== undefined ? { cost_price: nextCost } : {})
        };
      })
    );
    if (isLumpSum && manualValue > 0) {
      setManualValue((prev) => Number((prev * rate).toFixed(2)));
    }
    setFormCurrency(targetCurrency);
  };

  // Sub-modal states for inline Company and Contact creation
  const [showNewContactModal, setShowNewContactModal] = useState(false);
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [subCompanyName, setSubCompanyName] = useState('');
  const [subLegalSuffix, setSubLegalSuffix] = useState('None / To Be Added Later');
  const [subCompanyCode, setSubCompanyCode] = useState('');
  const [subCountryCode, setSubCountryCode] = useState('');
  const [subCountry, setSubCountry] = useState('UAE');
  const [subCity, setSubCity] = useState('');
  const [subGeneralPhone, setSubGeneralPhone] = useState('');
  const [subGeneralEmail, setSubGeneralEmail] = useState('');
  const [subNotes, setSubNotes] = useState('');

  // Workspace sequence counters & inline Quick-Resolve Company Code state
  const [workspaceCounters, setWorkspaceCounters] = useState<WorkspaceSequenceCounters | null>(null);
  const [showQuickResolveCode, setShowQuickResolveCode] = useState(false);
  const [quickResolveCodeVal, setQuickResolveCodeVal] = useState('');
  const [quickResolveCountryCodeVal, setQuickResolveCountryCodeVal] = useState('');
  const [isSavingQuickCode, setIsSavingQuickCode] = useState(false);

  const [subContactName, setSubContactName] = useState('');
  const [subContactDesignation, setSubContactDesignation] = useState('');
  const [subContactMobile, setSubContactMobile] = useState('');
  const [subContactEmail, setSubContactEmail] = useState('');
  const [subContactIsPrimary, setSubContactIsPrimary] = useState(false);

  // Fuzzy matches duplicate matches state inside form
  const [duplicateWarning, setDuplicateWarning] = useState<Company | null>(null);

  // Contact list filtered by company
  const companyContacts = contacts.filter((c) => c.company_id === companyId);

  // Auto-calculate suggested Quote Ref using workspace pattern or standard DDMMYY (only if not custom/extracted by AI)
  useEffect(() => {
    const isExistingRecord = Boolean(enquiryToEdit && (enquiryToEdit.id || (enquiryToEdit as any)._id));
    const isGapRecord = Boolean(
      enquiryToEdit && (
        Boolean((enquiryToEdit as any).is_gap_placeholder) ||
        enquiryToEdit.status === 'Gap / Reserved' ||
        enquiryToEdit.status === 'GAP / RESERVED' ||
        (enquiryToEdit.company_name && enquiryToEdit.company_name.includes('[Reserved Sequence'))
      )
    );
    const hasPresetQuoteRef = Boolean(
      enquiryToEdit?.quote_ref_no &&
      enquiryToEdit.quote_ref_no.trim() &&
      /\d/.test(enquiryToEdit.quote_ref_no) &&
      !enquiryToEdit.quote_ref_no.includes('[COMPANY_CODE]') &&
      !enquiryToEdit.quote_ref_no.includes('[COUNTRY]')
    );

    const selectedComp = companies.find((c) => c.id === companyId);
    const effectiveCountry = country || selectedComp?.country || 'UAE';
    const effectiveCountryCode = selectedComp?.country_code || '';
    const effectiveCompanyCode = selectedComp?.company_code || '';

    const selectedSpForRef = salespersons.find(
      (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
    );
    const repInitialsForRef =
      selectedSpForRef?.initials ||
      (selectedSpForRef?.full_name
        ? selectedSpForRef.full_name.slice(0, 2).toUpperCase()
        : salesPerson
        ? salesPerson.trim().slice(0, 3).toUpperCase()
        : '');

    const applyPrefixToExistingSeqTail = (rawRef: string): string | null => {
      const clean = (rawRef || '').trim();
      if (!clean || !workspaceCounters?.pattern) return null;
      const tailMatch = clean.match(/(?:^|\/)(\d{2,6})-(\d{2})(\d{2})(\d{2,4})([A-Za-z]{0,4})((?:-R\d+|\/Rev\.\d+)?)$/i);
      if (!tailMatch) return null;
      const existingSeq = Number(tailMatch[1]);
      const dd = tailMatch[2];
      const mm = tailMatch[3];
      const yyRaw = tailMatch[4];
      const fullYear = yyRaw.length === 2 ? Number(`20${yyRaw}`) : Number(yyRaw);
      const parsedDate = new Date(fullYear, Number(mm) - 1, Number(dd));
      const fallbackParts = (enquiryDate || '').split('-');
      const fallbackDate =
        fallbackParts.length === 3
          ? new Date(Number(fallbackParts[0]), Number(fallbackParts[1]) - 1, Number(fallbackParts[2]))
          : new Date();
      const validDate = !isNaN(parsedDate.getTime()) ? parsedDate : fallbackDate;
      const existingTailLetters = tailMatch[5] || '';
      const revSuffix = tailMatch[6] || '';

      const formattedBase = formatPattern(workspaceCounters.pattern, {
        seq: existingSeq,
        prefix: workspaceCounters.prefix || '',
        date: validDate,
        rep: existingTailLetters || repInitialsForRef,
        country: effectiveCountry,
        countryCode: effectiveCountryCode,
        companyCode: effectiveCompanyCode
      });

      const withRepTail =
        existingTailLetters &&
        !/\{REP\}/i.test(workspaceCounters.pattern) &&
        !formattedBase.toUpperCase().endsWith(existingTailLetters.toUpperCase())
          ? `${formattedBase}${existingTailLetters}`
          : formattedBase;

      return `${withRepTail}${revSuffix}`;
    };

    // If quoteRefNo (on an existing record or extracted via Smart Paste) contains unresolved [COMPANY_CODE]/[COUNTRY]
    // OR is a bare sequence-date code like "2802-030926AA" lacking the workspace slash prefix,
    // preserve its exact sequence/date suffix and only prepend/resolve the workspace/country/company prefix!
    if (quoteRefNo && (!isGapRecord || hasPresetQuoteRef)) {
      let nextRef = quoteRefNo;
      if (effectiveCompanyCode && nextRef.includes('[COMPANY_CODE]')) {
        nextRef = nextRef.replace(/\[COMPANY_CODE\]/g, sanitizeCompanyCode(effectiveCompanyCode));
      }
      const resolvedCtry = resolveCountryCode(effectiveCountry, effectiveCountryCode);
      if (resolvedCtry && nextRef.includes('[COUNTRY]')) {
        nextRef = nextRef.replace(/\[COUNTRY\]/g, resolvedCtry);
      }
      if (
        !nextRef.includes('/') &&
        workspaceCounters?.pattern?.includes('/') &&
        /^\d{2,6}-\d{6,8}[A-Za-z]{0,4}(?:-R\d+)?$/i.test(nextRef.trim())
      ) {
        const upgradedWithPrefix = applyPrefixToExistingSeqTail(nextRef);
        if (upgradedWithPrefix && !upgradedWithPrefix.includes('[COMPANY_CODE]')) {
          nextRef = upgradedWithPrefix;
        }
      }
      if (nextRef !== quoteRefNo) {
        setQuoteRefNo(nextRef);
      }
    }

    if (enquiryDate && sn && (!isExistingRecord || isGapRecord) && !hasPresetQuoteRef && !isQuoteRefCustom) {
      if (activeWorkspace?.id) {
        const selectedSp = salespersons.find(
          (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
        );
        const repInitials =
          selectedSp?.initials ||
          (selectedSp?.full_name
            ? selectedSp.full_name.slice(0, 2).toUpperCase()
            : salesPerson
            ? salesPerson.trim().slice(0, 3).toUpperCase()
            : '');
        const parts = enquiryDate.split('-');
        const dateObj = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) : new Date();

        if (workspaceCounters) {
          const periodKey = getSequencePeriodKey(workspaceCounters.resetCadence, dateObj);
          const calculatedNextSeq = (workspaceCounters.sequences?.[periodKey] || 0) + 1;
          const liveRef = formatPattern(workspaceCounters.pattern, {
            seq: isGapRecord && sn > 0 ? sn : calculatedNextSeq,
            prefix: workspaceCounters.prefix,
            date: dateObj,
            rep: repInitials,
            country: effectiveCountry,
            countryCode: effectiveCountryCode,
            companyCode: effectiveCompanyCode
          });
          if (liveRef) {
            setQuoteRefNo(liveRef);
          }
        }
      } else {
        const parts = enquiryDate.split('-'); // [YYYY, MM, DD]
        if (parts.length === 3) {
          const formattedDate = `${parts[2]}${parts[1]}${parts[0].slice(2)}`; // DDMMYY
          setQuoteRefNo(`${sn}-${formattedDate}`);
        }
      }
    }
  }, [enquiryDate, sn, companyId, country, companies, enquiryToEdit, isQuoteRefCustom, activeWorkspace?.id, salesPerson, salespersons, enquiries, workspaceCounters]);

  // Live Next Sequence Resolution: On mount for new enquiries (including Duplicated deals without an ID or preset ref), fetch fresh counters from Firestore
  useEffect(() => {
    if (!activeWorkspace?.id) return;
    const isExistingRecord = Boolean(enquiryToEdit && (enquiryToEdit.id || (enquiryToEdit as any)._id));
    const isGapRecord = Boolean(
      enquiryToEdit && (
        Boolean((enquiryToEdit as any).is_gap_placeholder) ||
        enquiryToEdit.status === 'Gap / Reserved' ||
        enquiryToEdit.status === 'GAP / RESERVED' ||
        (enquiryToEdit.company_name && enquiryToEdit.company_name.includes('[Reserved Sequence'))
      )
    );
    const hasPresetQuoteRef = Boolean(
      enquiryToEdit?.quote_ref_no &&
      enquiryToEdit.quote_ref_no.trim() &&
      /\d/.test(enquiryToEdit.quote_ref_no) &&
      !enquiryToEdit.quote_ref_no.includes('[COMPANY_CODE]') &&
      !enquiryToEdit.quote_ref_no.includes('[COUNTRY]')
    );

    let isMounted = true;
    getWorkspaceSequenceCounters(activeWorkspace.id)
      .then((counters) => {
        if (!isMounted) return;
        setWorkspaceCounters(counters);
        if ((isExistingRecord && !isGapRecord) || hasPresetQuoteRef) return;

        const parts = (enquiryDate || new Date().toISOString().split('T')[0]).split('-');
        const dateObj = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) : new Date();
        const periodKey = getSequencePeriodKey(counters.resetCadence, dateObj);

        // Calculate maxSn strictly based on non-deleted workspace enquiries
        const currentWorkspaceId = activeWorkspace?.id;
        const workspaceEnqs = (enquiries || []).filter(e => {
          if (e.is_deleted) return false;
          const eWid = e.workspace_id || (e as any).workspaceId;
          return eWid === currentWorkspaceId || (!eWid && activeWorkspace?.is_default);
        });
        const maxWorkspaceSn = workspaceEnqs.reduce((max, e) => Math.max(max, Number(e.sn) || 0), 0);
        const calculatedNextSn = maxWorkspaceSn > 0 ? maxWorkspaceSn + 1 : ((counters.lastSnNumber || 0) + 1);
        const calculatedNextSeq = (counters.sequences?.[periodKey] || 0) + 1;

        // If S/N is unset or default on a brand new record, update to live nextSn
        if (!isExistingRecord) {
          setSn((prev) => (prev <= 1 || prev === nextSn || prev === calibratedDefaultSn ? calculatedNextSn : prev));
        }

        if (!isQuoteRefCustom) {
          const selectedSp = salespersons.find(
            (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
          );
          const repInitials =
            selectedSp?.initials ||
            (selectedSp?.full_name
              ? selectedSp.full_name.slice(0, 2).toUpperCase()
              : salesPerson
              ? salesPerson.trim().slice(0, 3).toUpperCase()
              : '');
          const selectedComp = companies.find((c) => c.id === companyId);
          const liveRef = formatPattern(counters.pattern, {
            seq: isGapRecord && sn > 0 ? sn : calculatedNextSeq,
            prefix: counters.prefix,
            date: dateObj,
            rep: repInitials,
            country: country || selectedComp?.country || 'UAE',
            countryCode: selectedComp?.country_code || '',
            companyCode: selectedComp?.company_code || ''
          });
          setQuoteRefNo(liveRef);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch live workspace sequence counters:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [enquiryToEdit?.id, activeWorkspace?.id]);

  // Check if target S/N is already assigned to an existing, non-deleted enquiry
  const occupiedEnquiry = React.useMemo(() => {
    if (!enquiries || enquiries.length === 0 || isNaN(sn) || sn <= 0) return null;
    const isEditing = Boolean(enquiryToEdit && (enquiryToEdit.id || (enquiryToEdit as any)._id));
    if (isEditing && Number(enquiryToEdit?.sn) === Number(sn)) return null;
    const currentWorkspaceId = activeWorkspace?.id;
    return enquiries.find((e) => {
      if (e.is_deleted) return false;
      if (isEditing && (e.id === enquiryToEdit?.id || (e as any)._id === enquiryToEdit?.id)) return false;
      const eWorkspaceId = e.workspace_id || (e as any).workspaceId;
      const sameWorkspace = eWorkspaceId === currentWorkspaceId || (!eWorkspaceId && activeWorkspace?.is_default);
      if (!sameWorkspace) return false;
      return Number(e.sn) === Number(sn);
    }) || null;
  }, [enquiries, sn, enquiryToEdit, activeWorkspace]);

  const isTargetSnOccupied = Boolean(occupiedEnquiry);

  // Compute how many existing enquiries would need to shift if this S/N is submitted
  const collidingShiftCount = React.useMemo(() => {
    if (!isTargetSnOccupied || !enquiries || enquiries.length === 0 || isNaN(sn) || sn <= 0) return 0;
    const isEditing = Boolean(enquiryToEdit && (enquiryToEdit.id || (enquiryToEdit as any)._id));
    const currentWorkspaceId = activeWorkspace?.id;
    return enquiries.filter((e) => {
      if (e.is_deleted) return false;
      if (isEditing && (e.id === enquiryToEdit?.id || (e as any)._id === enquiryToEdit?.id)) return false;
      const eWorkspaceId = e.workspace_id || (e as any).workspaceId;
      const sameWorkspace = eWorkspaceId === currentWorkspaceId || (!eWorkspaceId && activeWorkspace?.is_default);
      if (!sameWorkspace) return false;
      return Number(e.sn) >= Number(sn);
    }).length;
  }, [isTargetSnOccupied, enquiries, sn, enquiryToEdit, activeWorkspace]);

  // Read-only state for users without edit permissions on this enquiry
  const isEditing = Boolean(enquiryToEdit && (enquiryToEdit.id || (enquiryToEdit as any)._id));
  const isClaimingGap = Boolean(
    enquiryToEdit && (
      Boolean((enquiryToEdit as any).is_gap_placeholder) ||
      enquiryToEdit.status === 'Gap / Reserved' ||
      enquiryToEdit.status === 'GAP / RESERVED' ||
      (enquiryToEdit.company_name && enquiryToEdit.company_name.includes('[Reserved Sequence'))
    )
  );
  const isReadOnly = React.useMemo(() => {
    if (!isEditing || !enquiryToEdit) return false;
    return !canEditEnquiry(user, activeWorkspace, enquiryToEdit);
  }, [isEditing, enquiryToEdit, user, activeWorkspace]);

  // Load edit values
  useEffect(() => {
    if (enquiryToEdit) {
      setSn(enquiryToEdit.sn ?? calibratedDefaultSn);
      setEnquiryDate(enquiryToEdit.enquiry_date || new Date().toISOString().split('T')[0]);
      setLoggedDate(enquiryToEdit.logged_date || new Date().toISOString().split('T')[0]);
      setSalesPerson(enquiryToEdit.sales_person_id || enquiryToEdit.sales_person || '');
      setConcernedPersons(enquiryToEdit.concerned_persons || (enquiryToEdit.concerned_person ? [enquiryToEdit.concerned_person] : []));
      setCompanyId(enquiryToEdit.company_id || '');
      setContactId(enquiryToEdit.contact_id || '');
      setCountry(enquiryToEdit.country || 'UAE');
      setProjectLocation(enquiryToEdit.project_location || '');
      setEnquirySource(e_src_fallback(enquiryToEdit.enquiry_source));

      const dedupeRemarkLines = (raw?: string) => {
        if (!raw) return '';
        const nonEmpty = raw
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const exactUnique: string[] = [];
        const seen = new Set<string>();
        for (const line of nonEmpty) {
          const key = line.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            exactUnique.push(line);
          }
        }
        return exactUnique
          .filter((line, idx) => {
            const lower = line.toLowerCase();
            if (lower.length < 10) return true;
            return !exactUnique.some(
              (other, oIdx) =>
                oIdx !== idx &&
                other.length > line.length &&
                other.toLowerCase().includes(lower)
            );
          })
          .join('\n');
      };

      if (isClaimingGap || enquiryToEdit.status === 'Gap / Reserved' || enquiryToEdit.status === 'GAP / RESERVED') {
        setStatus('Active');
        if (enquiryToEdit.remarks?.startsWith('[Reserved Gap]') || enquiryToEdit.remarks?.includes('missing record')) {
          setRemarks('');
        } else {
          setRemarks(dedupeRemarkLines(enquiryToEdit.remarks));
        }
      } else {
        setStatus(normalizeEnquiryStatus(enquiryToEdit.status) as EnquiryStatus);
        setRemarks(dedupeRemarkLines(enquiryToEdit.remarks));
      }

      setPastedSourceText(enquiryToEdit.raw_source_text || null);
      const initialEditRef =
        enquiryToEdit.quote_ref_no &&
        /\d/.test(enquiryToEdit.quote_ref_no) &&
        !/^(received|details|from|for|by|subject|enquiry|quotation|item|none|null)$/i.test(
          enquiryToEdit.quote_ref_no.trim()
        )
          ? enquiryToEdit.quote_ref_no.trim()
          : '';
      setQuoteRefNo(initialEditRef);
      if (initialEditRef) {
        setIsQuoteRefCustom(true);
      }
      setProjectedOrderDate(enquiryToEdit.projected_order_date || '');
      setNextFollowupDate(enquiryToEdit.next_followup_date || '');
      const editCurrency = enquiryToEdit.currency || 'AED';
      setFormCurrency(editCurrency);
      const safeVal = Number(enquiryToEdit.value_aed) || 0;
      const resolvedManualVal = editCurrency === 'USD' ? safeVal / 3.6725 : safeVal;
      setManualValue(resolvedManualVal);
      setInvoicePoNo(enquiryToEdit.invoice_po_no || '');
      setPaymentStatus(enquiryToEdit.payment_status || '');
      const rawRem = enquiryToEdit.remarks || '';
      const fallbackFromSource = extractCommercialTermsAndHeaderFromText(
        `${rawRem}\n${enquiryToEdit.raw_source_text || ''}`
      );
      const extractedValidity = rawRem.match(/validity\s*[:=-]\s*(\d+)\s*day/i)?.[1];
      const extractedPriceBasis =
        rawRem.match(/(?:price\s*basis|incoterms?)\s*[:=-]\s*([^\n;|]+)/i)?.[1]?.trim() ||
        fallbackFromSource.priceBasis;
      const extractedDelivery =
        rawRem.match(/delivery(?:\s*period|\s*terms)?\s*[:=-]\s*([^\n;|]+)/i)?.[1]?.trim() ||
        fallbackFromSource.deliveryPeriod;
      const extractedPayment =
        rawRem.match(/payment(?:\s*terms)?\s*[:=-]\s*([^\n;|]+)/i)?.[1]?.trim() ||
        fallbackFromSource.paymentTerms;
      setValidityDays(
        typeof enquiryToEdit.validity_days === 'number' && enquiryToEdit.validity_days > 0
          ? enquiryToEdit.validity_days
          : extractedValidity
          ? Number(extractedValidity) || 30
          : fallbackFromSource.validityDays || 30
      );
      setPriceBasis(enquiryToEdit.price_basis || extractedPriceBasis || '');
      setDeliveryPeriod(enquiryToEdit.delivery_period || extractedDelivery || '');
      setPaymentTerms(enquiryToEdit.payment_terms || extractedPayment || enquiryToEdit.payment_status || '');
      const rawTaxMode = String(enquiryToEdit.tax_mode || fallbackFromSource.taxMode || 'taxes_extra');
      const normalizedTaxMode: QuotationTaxMode =
        rawTaxMode === 'inclusive'
          ? 'tax_calculated'
          : rawTaxMode === 'zero_rated'
          ? 'tax_exempt'
          : (rawTaxMode as QuotationTaxMode);
      setTaxMode(normalizedTaxMode);
      setSubject(enquiryToEdit.subject || fallbackFromSource.subject || '');
      setCustomerReferenceCode(enquiryToEdit.customer_reference_code || '');
      setProposalOption(enquiryToEdit.proposal_option || '');
      setParentId(enquiryToEdit.parent_id ?? null);
      setRevisionNumber(
        typeof enquiryToEdit.revision_number === 'number'
          ? enquiryToEdit.revision_number
          : (enquiryToEdit.parent_id ? 1 : 0)
      );
      if (enquiryToEdit.custom_project_details) {
        if (Array.isArray(enquiryToEdit.custom_project_details)) {
          setCustomProjectDetails(enquiryToEdit.custom_project_details);
        } else if (typeof enquiryToEdit.custom_project_details === 'object') {
          const arr = Object.entries(enquiryToEdit.custom_project_details).map(([key, value]) => ({ key, value: String(value) }));
          if (arr.length > 0) setCustomProjectDetails(arr);
        }
      }
      const parsedItems = rehydrateLineItemsFromCatalog(
        (enquiryToEdit.line_items || []).map(item => {
          let cleanedSubs = item.sub_components;
          if (Array.isArray(cleanedSubs) && cleanedSubs.length >= 2) {
            const first = cleanedSubs[0];
            const pName = (item.item_name || '').trim().toLowerCase();
            const fName = (first.item_name || '').trim().toLowerCase();
            if (
              !first.is_included_accessory &&
              (Number(first.unit_price) || 0) === 0 &&
              (!fName || fName === pName) &&
              cleanedSubs.slice(1).some((c) => Boolean(c.is_included_accessory) || (Number(c.unit_price) || 0) === 0)
            ) {
              cleanedSubs = cleanedSubs.slice(1);
            }
          }
          const hasCustomEnquiryDelivery =
            Boolean(enquiryToEdit.delivery_period?.trim()) &&
            enquiryToEdit.delivery_period?.trim() !== 'Ex-Stock / Standard';
          const normalizedLeadTime =
            hasCustomEnquiryDelivery && item.lead_time_note?.trim() === 'Ex-Stock / Standard'
              ? ''
              : item.lead_time_note;
          return {
            ...item,
            lead_time_note: normalizedLeadTime,
            ...(cleanedSubs ? { sub_components: cleanedSubs } : {}),
            option: item.option || (item as any).option_designation || 'Default / Included',
            attributes: item.attributes || []
          };
        }),
        products
      );

      // Auto-heal single-package items whose unit_price was zeroed out by legacy BOM conversion while value_aed held the real package price
      let shouldKeepLumpSum = Boolean(enquiryToEdit.is_lump_sum);
      if (
        parsedItems.length === 1 &&
        (Number(parsedItems[0].unit_price) || 0) === 0 &&
        resolvedManualVal > 0
      ) {
        const q = Math.max(1, Number(parsedItems[0].quantity) || 1);
        parsedItems[0] = {
          ...parsedItems[0],
          unit_price: Number((resolvedManualVal / q).toFixed(2)),
          total_price: Number(resolvedManualVal.toFixed(2)),
        };
        shouldKeepLumpSum = false;
      }
      setIsLumpSum(shouldKeepLumpSum);

      setLineItems(parsedItems);
      if (parsedItems.length > 0) {
        rehydrateDocumentBlobsFromLocal({ line_items: parsedItems })
          .then((rehydrated) => {
            if (rehydrated?.line_items) {
              setLineItems(rehydrateLineItemsFromCatalog(rehydrated.line_items, products));
            }
          })
          .catch(() => {});
      }
      const initialAttachments = enquiryToEdit.attachments || [];
      setAttachments(initialAttachments);
      if (initialAttachments.length > 0) {
        Promise.all(
          initialAttachments.map(async (att) => {
            const resolvedUrl = await resolveAttachmentUrl(att);
            return {
              ...att,
              url: resolvedUrl || att.url || ''
            };
          })
        ).then((resolved) => {
          setAttachments(resolved);
          if (resolved.length > 0 && resolved[0].url) {
            setActivePreviewUrl(resolved[0].url);
            setPreviewFileName(resolved[0].name);
            setPreviewFileType(resolved[0].type || 'application/pdf');
          }
        });
      }

      const matchedComp = companies.find((c) => c.id === enquiryToEdit.company_id);
      if (matchedComp) {
        setCompanySearch(matchedComp.display_name || matchedComp.canonical_name || '');
      } else if (isClaimingGap || enquiryToEdit.status === 'Gap / Reserved' || enquiryToEdit.status === 'GAP / RESERVED' || enquiryToEdit.company_name?.includes('[Reserved Sequence')) {
        setCompanySearch('');
        setCompanyId('');
      }
    } else {
      // Default Salesperson to the first initials/ID in the list
      if (salespersons.length > 0) {
        setSalesPerson(salespersons[0].id || salespersons[0].initials || '');
      }
    }
  }, [enquiryToEdit, companies, salespersons]);

  const e_src_fallback = (val: string): string => {
    return activeSources.includes(val) ? val : (activeSources[0] || 'Email');
  };

  // Option-Aware Package Total Math:
  // Baseline items include 'Default / Included' and 'Option A'
  const calculateOptionAwareTotals = (items: LineItem[]) => {
    if (!Array.isArray(items)) {
      return {
        baseTotal: 0,
        optionTotals: {},
        optionalAddonsTotal: 0,
      };
    }

    const baselineItems = items.filter((item) => {
      if (!item) return false;
      const des = ((item as any).option_designation || item.option || '').trim();
      return des === 'Default / Included' || des === 'Option A' || des === '' || (!item.option && !(item as any).option_designation);
    });

    const baseTotal = baselineItems.reduce((sum, item) => {
      if (!item) return sum;
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const lineVal = item.total_price !== undefined ? (Number(item.total_price) || 0) : (qty * unitPrice);
      return sum + lineVal;
    }, 0);

    const optionTotals: Record<string, number> = {};
    let optionalAddonsTotal = 0;

    items.forEach((item) => {
      if (!item) return;
      const des = ((item as any).option_designation || item.option || '').trim();
      const qty = Number(item.quantity) || 0;
      const unitPrice = Number(item.unit_price) || 0;
      const lineVal = item.total_price !== undefined ? (Number(item.total_price) || 0) : (qty * unitPrice);

      if (des === 'Optional / Add-On' || des.toLowerCase().includes('optional') || des.toLowerCase().includes('add-on')) {
        optionalAddonsTotal += lineVal;
      } else if (des.startsWith('Option ') && des !== 'Option A') {
        optionTotals[des] = (optionTotals[des] || 0) + lineVal;
      }
    });

    return {
      baseTotal: Number((baseTotal || 0).toFixed(2)) || 0,
      optionTotals: optionTotals || {},
      optionalAddonsTotal: Number((optionalAddonsTotal || 0).toFixed(2)) || 0,
    };
  };

  const optionBreakdown = React.useMemo(() => calculateOptionAwareTotals(lineItems), [lineItems]);
  const computedValue = Number(optionBreakdown?.baseTotal || 0);
  const finalValue = isLumpSum ? (Number(manualValue) || 0) : computedValue;
  const priceDiscrepancyAmount = Math.abs((Number(manualValue) || 0) - computedValue);

  const handleAddLineItem = () => {
    const newItem: LineItem = {
      item_type: 'product',
      product_type: 'Other',
      description: '',
      quantity: 1,
      unit: 'Nos',
      unit_price: 0,
      total_price: 0,
      lead_time_note: '',
      option: 'Default / Included',
      attributes: []
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleAddCatalogItem = (item: any) => {
    const isUsd = formCurrency === 'USD';
    const rawPrice = item.unit_price_aed !== undefined && item.unit_price_aed > 0
      ? (isUsd ? item.unit_price_aed / 3.6725 : item.unit_price_aed)
      : 0;
    const price = Math.round(rawPrice * 100) / 100;

    const rawCost = item.cost_price_aed !== undefined && item.cost_price_aed > 0
      ? (isUsd ? item.cost_price_aed / 3.6725 : item.cost_price_aed)
      : 0;
    const costPrice = rawCost > 0 ? Math.round(rawCost * 100) / 100 : undefined;

    const clonedSubComponents =
      item.is_composite_set && Array.isArray(item.sub_components) && item.sub_components.length > 0
        ? item.sub_components.map((sc: any, idx: number) => ({
            ...sc,
            id: `comp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
            unit_price:
              sc.unit_price !== undefined
                ? Math.round((isUsd ? Number(sc.unit_price) / 3.6725 : Number(sc.unit_price)) * 100) / 100
                : 0,
            cost_price:
              sc.cost_price !== undefined
                ? Math.round((isUsd ? Number(sc.cost_price) / 3.6725 : Number(sc.cost_price)) * 100) / 100
                : undefined
          }))
        : undefined;

    if (linkingLineIndex !== null && lineItems[linkingLineIndex]) {
      // Update existing line item in place — 100% NON-DESTRUCTIVE when line item is already populated
      const existingTarget = lineItems[linkingLineIndex];
      const wasPopulated = isLineItemPopulated(existingTarget);
      const fullCatalogProd: Product =
        (products || []).find((p) => p.id === item.id) ||
        ({
          ...item,
          unit_price: item.unit_price ?? item.unit_price_aed ?? 0,
          cost_price: item.cost_price ?? item.cost_price_aed ?? undefined,
          default_availability: item.default_availability ?? item.lead_time_note ?? undefined
        } as Product);

      setLineItems((prev) => {
        const next = [...prev];
        const current = next[linkingLineIndex];
        next[linkingLineIndex] = linkLineItemToCatalogProductNonDestructive(
          current,
          fullCatalogProd,
          formCurrency,
          false
        );
        return next;
      });
      if (triggerToast) {
        const skuLabel = fullCatalogProd.sku || fullCatalogProd.name || 'Catalog SKU';
        if (wasPopulated) {
          triggerToast(
            `Linked to SKU ${skuLabel} — kept your custom quote price & specs intact. Use the SKU Sync menu to Save as Variant, Push to Catalog, or Pull Catalog Defaults.`,
            'info'
          );
        } else {
          triggerToast(`Linked line item to Catalog SKU ${skuLabel}.`, 'success');
        }
      }
      setLinkingLineIndex(null);
    } else {
      // Default append behavior
      const bomRollup = clonedSubComponents
        ? recalculateCompositeItemTotals(clonedSubComponents, 1, price, costPrice)
        : null;
      const resolvedNewUnitPrice =
        bomRollup && bomRollup.unitSellingPrice > 0 ? bomRollup.unitSellingPrice : price;
      const resolvedNewCostPrice =
        bomRollup && bomRollup.unitCostPrice > 0 ? bomRollup.unitCostPrice : costPrice;
      const newItem: LineItem = {
        product_id: item.id || undefined,
        sku: item.sku || undefined,
        item_name: item.name,
        item_type: 'product',
        product_type: item.product_type,
        description: item.description,
        quantity: 1,
        unit: item.unit,
        unit_price: resolvedNewUnitPrice,
        cost_price: resolvedNewCostPrice,
        total_price: resolvedNewUnitPrice,
        brand_make: item.brand_make || undefined,
        model_part_no: item.model_part_no || undefined,
        country_of_origin: item.country_of_origin || undefined,
        hs_code: item.hs_code || undefined,
        image_url: item.image_url || undefined,
        secondary_image_url: item.secondary_image_url || undefined,
        image_caption: item.image_caption || undefined,
        secondary_image_caption: item.secondary_image_caption || undefined,
        image_adjustments: item.image_adjustments || undefined,
        datasheet_attachment: item.datasheet_attachment || undefined,
        include_datasheet_in_quote: item.datasheet_attachment ? true : undefined,
        lead_time_note: item.lead_time_note || '',
        option: 'Default / Included',
        attributes: item.attributes || [],
        ...(item.is_composite_set ? { is_composite_set: true } : {}),
        ...(bomRollup ? { sub_components: bomRollup.normalizedComponents } : {}),
        ...(item.package_pricing_mode ? { package_pricing_mode: item.package_pricing_mode } : {}),
        ...(item.option_scope_notes ? { option_scope_notes: item.option_scope_notes } : {})
      };
      setLineItems((prev) => [...prev, newItem]);
    }
    setShowCatalogModal(false);
  };

  const handleUnlinkCatalogItem = (index: number) => {
    setLineItems((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], product_id: undefined };
      }
      return next;
    });
  };

  const handleLineItemChange = (index: number, field: keyof LineItem | 'classification', val: any) => {
    const updated = [...lineItems];
    const item = { ...updated[index] };

    if (field === 'quantity' || field === 'unit_price') {
      const q = field === 'quantity' ? (Number(val) || 0) : (Number(item.quantity) || 0);
      const p = field === 'unit_price' ? (Number(val) || 0) : (Number(item.unit_price) || 0);
      item[field] = (Number(val) || 0) as any;
      item.total_price = Number((q * p).toFixed(2));
    } else if (field === 'cost_price') {
      item.cost_price = val === '' || val === null || val === undefined ? undefined : (Number(val) || 0);
    } else if (field === 'total_price') {
      const tot = Number(val) || 0;
      item.total_price = tot;
      const q = Number(item.quantity) || 0;
      if (q > 0) {
        item.unit_price = Number((tot / q).toFixed(2));
      }
    } else if (field === 'item_type' || (field as string) === 'classification') {
      const isServiceChange =
        val === 'charge' ||
        val === 'discount' ||
        val === 'service' ||
        val === 'fee' ||
        val === 'Charge / Fee (Service)' ||
        val === 'Discount / Rebate';

      if (isServiceChange) {
        // Automatically clear any warehouse link
        item.product_id = undefined;
        (item as any).product_sku = undefined;
        item.item_name = item.item_name || item.description;
        item.lead_time_note = '';
        item.attributes = [];

        // If item.unit === 'Nos' or !item.unit, default it to 'LS'
        if (item.unit === 'Nos' || !item.unit) {
          item.unit = 'LS';
        }

        if (val === 'discount' || val === 'Discount / Rebate') {
          item.item_type = 'discount';
          (item as any).classification = 'Discount / Rebate';
          item.charge_type = 'Discount';
          item.product_type = 'Service / Charge';
        } else {
          item.item_type = 'charge';
          (item as any).classification = 'Charge / Fee (Service)';
          item.charge_type = item.charge_type || 'Transportation';
          item.product_type = 'Service / Charge';
        }
      } else {
        item.item_type = 'product';
        (item as any).classification = 'Product (Hardware / Component)';
        item.charge_type = undefined;
        if (item.product_type === 'Service / Charge') {
          item.product_type = 'Other';
        }
      }
    } else if (field === 'charge_type') {
      item.charge_type = val;
      item.product_type = 'Service / Charge';
    } else if (field === 'product_type') {
      item.product_type = val;
      const existingFilled = (item.attributes || []).filter((a) => (a.key && a.key.trim() !== '') || (a.value && a.value.trim() !== ''));
      item.attributes = existingFilled;
    } else if (field === 'lead_time_note' || (field as string) === 'delivery_time' || (field as string) === 'lead_time') {
      const strVal = String(val ?? '');
      item.lead_time_note = strVal;
      item.delivery_time = strVal;
      item.lead_time = strVal;
      item.availability = strVal;
      if (!item.specifications) {
        item.specifications = {};
      }
      item.specifications['Delivery'] = strVal;
      item.specifications['Lead Time'] = strVal;
      if (Array.isArray(item.attributes)) {
        const found = item.attributes.find((a) => {
          const k = (a.key || '').trim().toLowerCase();
          return k === 'delivery' || k === 'lead time' || k === 'availability';
        });
        if (found) {
          found.value = strVal;
        }
      }
    } else {
      item[field] = val as any;
    }

    updated[index] = item;
    setLineItems(updated);
  };

  const handleRemoveLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  // File attachment uploading: Streams to Supabase Storage if configured and selected, or uses local IndexedDB fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const storageConfig = activeWorkspace?.settings?.storage;
    const hasCloudStorage = Boolean(
      storageConfig?.supabaseUrl &&
      storageConfig?.supabaseAnonKey &&
      storageConfig?.bucket
    );

    setGeneratingUrl(true);
    const uploadedList: Attachment[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setCurrentUploadingFile(file.name);
        setUploadProgress(0);

        let downloadUrl = '';
        let isLocal = false;
        let resolvedSize = file.size;
        let resolvedType = file.type || 'application/pdf';
        let customStorageKey = '';

        if (uploadTarget === 'cloud') {
          const uploaded = await uploadWorkspaceMediaAsset(
            file,
            'enquiries/rfq',
            activeWorkspace,
            {
              compressImage: true,
              maxDimension: 1400,
              quality: 0.85,
              onProgress: (percent) => setUploadProgress(percent)
            }
          );
          downloadUrl = uploaded.url;
          isLocal = uploaded.isLocal;
          resolvedSize = uploaded.size || file.size;
          resolvedType = uploaded.type || resolvedType;
          customStorageKey = uploaded.storageKey || '';
        } else {
          // Local fallback (IndexedDB / Base64)
          const storagePath = `proposals/${Date.now()}_${file.name}`;
          downloadUrl = await uploadAttachmentWithProgress(file, storagePath, (percent) => {
            setUploadProgress(percent);
          });
          isLocal = true;
        }

        const storageKey = customStorageKey || getAttachmentStorageKey({ name: file.name, size: resolvedSize }, i, enquiryToEdit?.id);

        const attachment: Attachment = {
          name: file.name,
          size: resolvedSize,
          type: resolvedType,
          url: downloadUrl,
          storageKey,
          uploadedAt: new Date().toISOString(),
          isLocal,
          storageProvider: isLocal ? 'local' : 'supabase',
          include_in_quote_annex: false,
          uploadedByUserName: user?.displayName || user?.full_name || user?.username || user?.name || user?.email || 'User'
        };
        uploadedList.push(attachment);
      }
      setAttachments((prev) => {
        const next = [...prev, ...uploadedList];
        if (uploadedList.length > 0) {
          const first = uploadedList[0];
          setActivePreviewUrl(first.url);
          setPreviewFileName(first.name);
          setPreviewFileType(first.type || 'application/pdf');
        }
        return next;
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      alert(err.message || "Failed to upload file(s). Please try again.");
    } finally {
      setGeneratingUrl(false);
      setUploadProgress(null);
      setCurrentUploadingFile(null);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  // Synchronized deletion: Removes cloud object from Supabase or blob from IndexedDB
  const removeAttachment = async (index: number) => {
    const target = attachments[index];
    if (target) {
      const storageConfig = activeWorkspace?.settings?.storage;
      const isCloudUrl = target.url && (target.url.startsWith('http://') || target.url.startsWith('https://'));
      if (isCloudUrl && storageConfig?.supabaseUrl && storageConfig?.supabaseAnonKey && storageConfig?.bucket) {
        deleteFromSupabaseStorage(target.url, {
          supabaseUrl: storageConfig.supabaseUrl,
          supabaseAnonKey: storageConfig.supabaseAnonKey,
          bucket: storageConfig.bucket
        }).catch((err) => console.warn('Could not delete from Supabase storage:', err));
      }
      if (target.storageKey) {
        deleteAttachmentBlob(target.storageKey).catch(() => {});
      }
      if (activePreviewUrl && activePreviewUrl === target.url) {
        setActivePreviewUrl(null);
      }
    }
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  // Promote local attachment to cloud
  const handlePromoteAttachmentToCloud = async (index: number) => {
    const target = attachments[index];
    if (!target) return;
    const storageConfig = activeWorkspace?.settings?.storage;
    if (!storageConfig?.supabaseUrl || !storageConfig?.supabaseAnonKey || !storageConfig?.bucket) {
      alert('Cloud storage is not configured for this workspace.');
      return;
    }

    const key = target.storageKey || target.id || `att_${index}`;
    setPromotingAttachmentKey(key);

    try {
      let dataUrl = target.url;
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        dataUrl = await resolveAttachmentUrl(target);
      }
      if (!dataUrl || !dataUrl.startsWith('data:')) {
        alert("The local file content could not be found on this device to upload to cloud.");
        return;
      }

      const fileObj = dataUrlToFile(dataUrl, target.name);
      const publicUrl = await uploadToSupabaseStorage(
        fileObj,
        {
          supabaseUrl: storageConfig.supabaseUrl,
          supabaseAnonKey: storageConfig.supabaseAnonKey,
          bucket: storageConfig.bucket
        }
      );

      if (target.storageKey) {
        deleteAttachmentBlob(target.storageKey).catch(() => {});
      }

      setAttachments((prev) =>
        prev.map((att, i) =>
          i === index
            ? {
                ...att,
                url: publicUrl,
                isLocal: false,
                storageProvider: 'supabase'
              }
            : att
        )
      );

      if (activePreviewUrl === target.url) {
        setActivePreviewUrl(publicUrl);
      }
    } catch (err: any) {
      console.error('Failed to promote attachment to cloud:', err);
      alert(`Promotion failed: ${err.message || 'Unknown error'}`);
    } finally {
      setPromotingAttachmentKey(null);
    }
  };

  // Sorensen-Dice coefficient similarity matching
  const getFuzzySimilarity = (s1: string, s2: string): number => {
    const clean1 = s1.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    const clean2 = s2.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '');
    if (clean1 === clean2) return 1.0;
    if (!clean1 || !clean2) return 0.0;
    if (clean1.includes(clean2) || clean2.includes(clean1)) return 0.85;

    const getBigrams = (str: string) => {
      const bigrams = new Set<string>();
      for (let i = 0; i < str.length - 1; i++) {
        bigrams.add(str.substring(i, i + 2));
      }
      return bigrams;
    };

    const b1 = getBigrams(clean1);
    const b2 = getBigrams(clean2);
    let matches = 0;
    b1.forEach(bg => {
      if (b2.has(bg)) matches++;
    });

    const total = b1.size + b2.size;
    if (total === 0) return 0;
    return (2 * matches) / total;
  };

  // Duplicate Match Dialog State for EnquiryForm registration
  const [duplicateMatchState, setDuplicateMatchState] = useState<{
    isOpen: boolean;
    type: 'company' | 'contact';
    candidateName: string;
    existingRecordName: string;
    matchReason: string;
    similarityScore: number;
    existingDetails?: {
      city?: string;
      country?: string;
      phone?: string;
      email?: string;
    };
    newDetails?: {
      city?: string;
      country?: string;
      phone?: string;
      email?: string;
    };
    onMerge: () => void;
    onKeepNew?: () => void;
    onIgnore: () => void;
  } | null>(null);

  // One-click Confirm & Register Unregistered Entities handler
  const handleConfirmRegisterEntities = async (bypassDuplicateCheck = false) => {
    if (!unregisteredEntities) return;

    if (!activeWorkspace?.id) {
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    const processContactPhase = async (resolvedCompanyId: string, companyNameForToast: string) => {
      // 2. Create Contact Person account in Firestore catalog
      if (!unregisteredEntities.ignoreContact && unregisteredEntities.contactName && unregisteredEntities.contactName.trim()) {
        const contactEmailVal = unregisteredEntities.emailDestination === 'contact' ? (unregisteredEntities.contactEmail || unregisteredEntities.generalEmail) : undefined;
        const contactMobileVal = unregisteredEntities.phoneDestination === 'contact' ? (unregisteredEntities.contactMobile || unregisteredEntities.generalPhone) : undefined;

        const newContactPayload = {
          workspace_id: activeWorkspace!.id,
          company_id: resolvedCompanyId,
          full_name: unregisteredEntities.contactName.trim(),
          designation: unregisteredEntities.contactDesignation?.trim() || undefined,
          email: contactEmailVal,
          mobile: contactMobileVal,
          is_primary: true,
          createdAt: new Date().toISOString()
        };

        const contactRef = await safeAddDoc('contacts', newContactPayload);
        await logAudit(contactRef.id, 'contact', 'create', null, newContactPayload, []);

        if (setContacts) {
          const createdContact: Contact = { id: contactRef.id, ...newContactPayload };
          setContacts(prev => [createdContact, ...prev.filter(c => c.id !== contactRef.id)]);
        }

        setContactId(contactRef.id);
      }

      // 3. Register / Assign Salesperson if provided and unassigned
      if (unregisteredEntities.salespersonName) {
        const spName = unregisteredEntities.salespersonName.trim();
        const existingSp = salespersons.find(s => s.full_name.toLowerCase().includes(spName.toLowerCase()));
        if (existingSp) {
          setSalesPerson(existingSp.id || existingSp.initials || existingSp.full_name);
        } else {
          setSalesPerson(spName);
        }
      }

      setUnregisteredEntities(null);

      if (triggerToast) {
        if (unregisteredEntities.ignoreContact) {
          triggerToast(`Processed company "${companyNameForToast}". Contact was ignored.`, 'success');
        } else {
          triggerToast(`Processed company "${companyNameForToast}" and contact person!`, 'success');
        }
      }
    };

    if (unregisteredEntities.companyResolutionMode === 'link') {
      if (!unregisteredEntities.linkedCompanyId) {
         alert("Please select a company to link to.");
         return;
      }
      const resolvedCompanyId = unregisteredEntities.linkedCompanyId;
      const comp = companies.find(c => c.id === resolvedCompanyId);
      
      if (comp) {
        setCompanyId(comp.id!);
        setCompanySearch(comp.display_name);
        setCountry(comp.country || unregisteredEntities.country || 'UAE');
        setProjectLocation(comp.city || unregisteredEntities.city || 'Dubai');
        
        await processContactPhase(comp.id!, comp.display_name);
      }
    } else {
      if (!unregisteredEntities.companyName) return;

      const compName = unregisteredEntities.companyName.trim();
      const rawSuf = unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'None / To Be Added Later';
      const isNoneSuf = !rawSuf || /^(none|none\s*\/\s*to\s*be\s*added\s*later|none\s*\/\s*other)$/i.test(String(rawSuf).trim());
      const suf = isNoneSuf ? undefined : (rawSuf as LegalSuffix);
      const sufLower = (rawSuf || '').trim().toLowerCase();
      const compLower = compName.toLowerCase();
      const display_name = isNoneSuf
        ? compName
        : (compLower.endsWith(` ${sufLower}`) || compLower.endsWith(sufLower))
          ? compName
          : `${compName} ${String(rawSuf).trim()}`;
      const city = unregisteredEntities.city?.trim() || 'Dubai';
      const countryVal = unregisteredEntities.country?.trim() || 'UAE';
      const cleanCompCode = sanitizeCompanyCode(unregisteredEntities.companyCode);
      const cleanCountryCode = sanitizeCompanyCode(unregisteredEntities.countryCode);
      const companyGeneralPhone = unregisteredEntities.phoneDestination === 'company' ? (unregisteredEntities.generalPhone || unregisteredEntities.contactMobile) : undefined;
      const companyGeneralEmail = unregisteredEntities.emailDestination === 'company' ? (unregisteredEntities.generalEmail || unregisteredEntities.contactEmail) : undefined;

      // Fuzzy duplicate check against existing company index
      if (!bypassDuplicateCheck && companies.length > 0) {
        const duplicateCompanyMatch = findDuplicateCompany(display_name, companies);
        if (duplicateCompanyMatch) {
          setDuplicateMatchState({
            isOpen: true,
            type: 'company',
            candidateName: display_name,
            existingRecordName: duplicateCompanyMatch.match.display_name,
            matchReason: duplicateCompanyMatch.reason,
            similarityScore: duplicateCompanyMatch.similarity,
            existingDetails: {
              city: duplicateCompanyMatch.match.city,
              country: duplicateCompanyMatch.match.country,
              phone: duplicateCompanyMatch.match.general_phone,
              email: duplicateCompanyMatch.match.general_email
            },
            newDetails: {
              city,
              country: countryVal,
              phone: companyGeneralPhone,
              email: companyGeneralEmail
            },
            onMerge: () => {
              // MERGE: Select existing company instead of creating new
              setCompanyId(duplicateCompanyMatch.match.id);
              setCompanySearch(duplicateCompanyMatch.match.display_name);
              setCountry(duplicateCompanyMatch.match.country || countryVal);
              setProjectLocation(duplicateCompanyMatch.match.city || city);
              setDuplicateMatchState(null);
              
              // Proceed to contact phase using this merged ID
              processContactPhase(duplicateCompanyMatch.match.id, duplicateCompanyMatch.match.display_name);
            },
            onKeepNew: async () => {
              // KEEP NEW: Overwrite existing company record with new values and select it
              const targetId = duplicateCompanyMatch.match.id;
              if (targetId) {
                const updatedCompany: Partial<Company> = {
                  canonical_name: compName,
                  display_name,
                  legal_suffix: suf,
                  ...(cleanCompCode ? { company_code: cleanCompCode } : {}),
                  ...(cleanCountryCode ? { country_code: cleanCountryCode } : {}),
                  city,
                  country: countryVal,
                  relationship: unregisteredEntities.relationship || 'Prospect',
                  temperature: unregisteredEntities.temperature || 'Cold ❄️',
                  general_phone: companyGeneralPhone,
                  general_email: companyGeneralEmail,
                  updatedAt: new Date().toISOString()
                };
                await safeUpdateDoc('companies', targetId, updatedCompany);
                if (setCompanies) {
                  setCompanies(prev => prev.map(c => c.id === targetId ? { ...c, ...updatedCompany } : c));
                }
                setCompanyId(targetId);
                setCompanySearch(display_name);
                setCountry(countryVal);
                setProjectLocation(city);
                
                processContactPhase(targetId, display_name);
              }
              setDuplicateMatchState(null);
            },
            onIgnore: () => {
              // IGNORE: Proceed with registration bypassing duplicate check
              setDuplicateMatchState(null);
              handleConfirmRegisterEntities(true);
            }
          });
          return;
        }
      }

      try {
        // 1. Create Company account in Firestore catalog
        const newCompPayload = {
          workspace_id: activeWorkspace.id,
          workspaceId: activeWorkspace.id,
          canonical_name: compName,
          display_name,
          aliases: [compName],
          legal_suffix: suf,
          ...(cleanCompCode ? { company_code: cleanCompCode } : {}),
          ...(cleanCountryCode ? { country_code: cleanCountryCode } : {}),
          city,
          country: countryVal,
          relationship: unregisteredEntities.relationship || 'Prospect',
          temperature: unregisteredEntities.temperature || 'Cold ❄️',
          general_phone: companyGeneralPhone,
          general_email: companyGeneralEmail,
          createdAt: new Date().toISOString()
        };

        const compRef = await safeAddDoc('companies', newCompPayload);
        await logAudit(compRef.id, 'company', 'create', null, newCompPayload, []);

        if (setCompanies) {
          const createdComp: Company = { id: compRef.id, ...newCompPayload };
          setCompanies(prev => [createdComp, ...prev.filter(c => c.id !== compRef.id)]);
        }

        // Update active form company state immediately
        setCompanyId(compRef.id);
        setCompanySearch(display_name);
        setCountry(countryVal);
        setProjectLocation(city);
        
        await processContactPhase(compRef.id, display_name);
      } catch (err: any) {
        console.error('Error confirming & registering entities:', err);
        alert('Failed to register new entities: ' + err.message);
        return;
      }
    }
  };

  // Helper to apply AI extracted JSON data to state variables
  const applyExtractedData = (data: any) => {
    // Scrub internal salesperson email and phone from client contact fields if extracted
    if (salespersons && salespersons.length > 0) {
      salespersons.forEach((spItem) => {
        const sp = spItem as Salesperson;
        const spEmail = sp.email?.trim().toLowerCase();
        const spPhoneDigits = sp.phone?.replace(/\D/g, '');

        if (spEmail) {
          if (data.contact_email && data.contact_email.trim().toLowerCase() === spEmail) {
            data.contact_email = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
          if (data.email && data.email.trim().toLowerCase() === spEmail) {
            data.email = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
        }

        if (spPhoneDigits && spPhoneDigits.length >= 7) {
          const isPhoneMatch = (val?: string) => {
            if (!val) return false;
            const digits = val.replace(/\D/g, '');
            return digits.length >= 7 && (digits.includes(spPhoneDigits) || spPhoneDigits.includes(digits));
          };

          if (isPhoneMatch(data.contact_phone)) {
            data.contact_phone = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
          if (isPhoneMatch(data.phone)) {
            data.phone = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
          if (isPhoneMatch(data.mobile)) {
            data.mobile = '';
            if (!data.salesperson) data.salesperson = sp.initials || sp.full_name;
          }
        }
      });
    }

    if (data.sn && !isNaN(Number(data.sn))) {
      setSn(Number(data.sn));
    }
    if (data.quote_ref_no) {
      const candidateRef = String(data.quote_ref_no).trim();
      if (
        /\d/.test(candidateRef) &&
        !/^(received|details|from|for|by|subject|enquiry|quotation|item|none|null)$/i.test(candidateRef)
      ) {
        setQuoteRefNo(candidateRef);
        setIsQuoteRefCustom(true);
      }
    }
    if (data.received_date) {
      const dateStr = String(data.received_date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        setEnquiryDate(dateStr);
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        setEnquiryDate(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
        const parts = dateStr.split('/');
        const year = parts[2].length === 5 ? parts[2].slice(0, 4) : parts[2];
        const month = parts[1].padStart(2, '0');
        const day = parts[0].padStart(2, '0');
        setEnquiryDate(`${year}-${month}-${day}`);
      } else {
        setEnquiryDate(dateStr);
      }
    }
    if (data.proposal_option || data.option) {
      setProposalOption(String(data.proposal_option || data.option).trim());
    }
    if (data.enquiry_source) {
      const matchedSource = activeSources.find(s => s.toLowerCase() === String(data.enquiry_source).toLowerCase());
      if (matchedSource) setEnquirySource(matchedSource);
      else setEnquirySource(String(data.enquiry_source));
    }
    if (data.country) {
      setCountry(String(data.country));
    }
    if (data.project_location) {
      setProjectLocation(String(data.project_location));
    }
    if (data.subject) {
      setSubject(String(data.subject));
    }
    if (data.customer_reference_code) {
      setCustomerReferenceCode(String(data.customer_reference_code));
    }
    // Detect document currency (USD vs AED) so USD proposals are never forced into AED or divided by 3.6725
    const rawCurrencySignal = String(
      data.currency ||
        data.document_currency ||
        (Array.isArray(data.line_items) && data.line_items[0]?.currency) ||
        ''
    )
      .trim()
      .toUpperCase();
    const hasUsdIndicatorInPayload =
      rawCurrencySignal === 'USD' ||
      rawCurrencySignal.includes('USD') ||
      rawCurrencySignal.includes('$') ||
      /\bUSD\b|\(USD\)/i.test(String(data.remarks || '') + ' ' + String(data.subject || ''));
    const effectiveExtractedCurrency: 'AED' | 'USD' = hasUsdIndicatorInPayload
      ? 'USD'
      : rawCurrencySignal === 'AED'
      ? 'AED'
      : formCurrency;

    if (effectiveExtractedCurrency !== formCurrency) {
      setFormCurrency(effectiveExtractedCurrency);
    }

    const hasPricedLineItems =
      Array.isArray(data.line_items) &&
      data.line_items.some(
        (li: any) =>
          Number(li?.unit_price) > 0 ||
          Number(li?.unit_price_aed) > 0 ||
          Number(li?.price) > 0 ||
          Number(li?.unitPrice) > 0
      );

    if (
      data.package_value &&
      !isNaN(Number(data.package_value)) &&
      Number(data.package_value) > 0 &&
      !hasPricedLineItems
    ) {
      setManualValue(Number(data.package_value));
      setIsLumpSum(true);
    } else if (hasPricedLineItems) {
      setIsLumpSum(false);
    }
    const fallbackCommercial = extractCommercialTermsAndHeaderFromText(
      `${data.remarks || ''}\n${pastedSourceText || ''}\n${rawTextInput || ''}`
    );

    if (!data.subject && fallbackCommercial.subject) {
      setSubject(fallbackCommercial.subject);
    }
    if (
      (!data.company_name || data.company_name === 'Prospective Client') &&
      fallbackCommercial.companyName
    ) {
      data.company_name = fallbackCommercial.companyName;
    }

    const effectiveSalespersonToken = data.salesperson || fallbackCommercial.salesperson;
    if (effectiveSalespersonToken) {
      const spQuery = String(effectiveSalespersonToken).trim().toLowerCase();
      const spFirstWord = spQuery.split(/\s+/)[0];
      const matchedSp = salespersons.find((s) => {
        const fullLower = (s.full_name || '').toLowerCase();
        const initLower = (s.initials || '').toLowerCase();
        return (
          s.id === effectiveSalespersonToken ||
          fullLower === spQuery ||
          initLower === spQuery ||
          fullLower.includes(spQuery) ||
          spQuery.includes(fullLower) ||
          (spFirstWord.length >= 3 && fullLower.split(/\s+/)[0] === spFirstWord)
        );
      });
      if (matchedSp) {
        setSalesPerson(matchedSp.id || matchedSp.initials || matchedSp.full_name);
      }
    }

    const resolvedPriceBasis = String(data.price_basis || fallbackCommercial.priceBasis || '').trim();
    if (resolvedPriceBasis) {
      setPriceBasis(resolvedPriceBasis);
    }
    const resolvedDeliveryPeriod = String(
      data.delivery_period || fallbackCommercial.deliveryPeriod || ''
    ).trim();
    if (resolvedDeliveryPeriod) {
      setDeliveryPeriod(resolvedDeliveryPeriod);
    }
    const resolvedPaymentTerms = String(
      data.payment_terms || fallbackCommercial.paymentTerms || ''
    ).trim();
    if (resolvedPaymentTerms) {
      setPaymentTerms(resolvedPaymentTerms);
    }
    const resolvedValidityDays = Number(data.validity_days || fallbackCommercial.validityDays || 0);
    if (!isNaN(resolvedValidityDays) && resolvedValidityDays > 0 && resolvedValidityDays <= 365) {
      setValidityDays(resolvedValidityDays);
    }
    const rawExtractedTaxMode = String(data.tax_mode || fallbackCommercial.taxMode || '').trim();
    if (rawExtractedTaxMode) {
      const normTax: QuotationTaxMode =
        rawExtractedTaxMode === 'inclusive'
          ? 'tax_calculated'
          : rawExtractedTaxMode === 'zero_rated'
          ? 'tax_exempt'
          : (rawExtractedTaxMode as QuotationTaxMode);
      if (
        normTax === 'taxes_extra' ||
        normTax === 'tax_calculated' ||
        normTax === 'tax_exempt' ||
        normTax === 'vat_excluded_extra' ||
        normTax === 'vat_hidden'
      ) {
        setTaxMode(normTax);
      }
    }

    if (
      Array.isArray(data.line_items) &&
      data.line_items.length === 1 &&
      !hasPricedLineItems &&
      (Number(data.package_value) > 0 || (fallbackCommercial.unitPrice && fallbackCommercial.unitPrice > 0))
    ) {
      const pkgPrice = Number(data.package_value) || fallbackCommercial.unitPrice || 0;
      const qty = Math.max(1, Number(data.line_items[0].quantity) || 1);
      data.line_items[0].unit_price = Number((pkgPrice / qty).toFixed(2));
      data.line_items[0].unit_price_aed = Number((pkgPrice / qty).toFixed(2));
      setManualValue(pkgPrice);
      setIsLumpSum(false);
    }

    if (data.remarks) {
      setRemarks((prev) => {
        const combined = `${prev || ''}\n${String(data.remarks || '')}`
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const exactUnique: string[] = [];
        const seen = new Set<string>();
        for (const line of combined) {
          const key = line.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            exactUnique.push(line);
          }
        }
        return exactUnique
          .filter((line, idx) => {
            const lower = line.toLowerCase();
            if (lower.length < 10) return true;
            return !exactUnique.some(
              (other, oIdx) =>
                oIdx !== idx &&
                other.length > line.length &&
                other.toLowerCase().includes(lower)
            );
          })
          .join('\n');
      });
    }

    // Process custom project specifications / attributes if present
    if (data.custom_project_details && Array.isArray(data.custom_project_details) && data.custom_project_details.length > 0) {
      setCustomProjectDetails(data.custom_project_details);
    } else {
      const extractedSpecs: Array<{ key: string; value: string }> = [];
      if (data.consultant) extractedSpecs.push({ key: 'Consultant', value: String(data.consultant) });
      if (data.main_contractor) extractedSpecs.push({ key: 'Main Contractor', value: String(data.main_contractor) });
      if (data.site_location) extractedSpecs.push({ key: 'Site Location', value: String(data.site_location) });
      if (data.scope_of_work) extractedSpecs.push({ key: 'Scope of Work', value: String(data.scope_of_work) });
      if (extractedSpecs.length > 0) {
        setCustomProjectDetails(extractedSpecs);
      }
    }

    // Autofill company and contact using professional fuzzy matching
    if (data.company_name) {
      let bestCompanyMatch: any = null;
      let highestCompanyScore = 0;

      companies.forEach(c => {
        const names = [c.canonical_name, c.display_name].filter(Boolean) as string[];
        names.forEach(n => {
          const score = getFuzzySimilarity(n, data.company_name);
          if (score > highestCompanyScore) {
            highestCompanyScore = score;
            bestCompanyMatch = c;
          }
        });
      });

      const companyMatched = highestCompanyScore >= 0.55 ? bestCompanyMatch : null;

      if (companyMatched && companyMatched.id) {
        setCompanyId(companyMatched.id);
        setCompanySearch(companyMatched.display_name);
        if (companyMatched.country) setCountry(companyMatched.country);
        if (companyMatched.city) setProjectLocation(companyMatched.city);

        const matchedContacts = contacts.filter(c => c.company_id === companyMatched.id);
        let bestContactMatch: any = null;
        let highestContactScore = 0;

        if (data.contact_name) {
          matchedContacts.forEach(c => {
            const score = getFuzzySimilarity(c.full_name, data.contact_name);
            if (score > highestContactScore) {
              highestContactScore = score;
              bestContactMatch = c;
            }
          });
        }

        const contactMatched = highestContactScore >= 0.55 ? bestContactMatch : (matchedContacts[0] || null);
        if (contactMatched && contactMatched.id) {
          setContactId(contactMatched.id);
        } else if (data.contact_name) {
          // Company matched, but contact is new/unregistered!
          setUnregisteredEntities({
            companyName: companyMatched.display_name,
            legalSuffix: companyMatched.legal_suffix || 'None / To Be Added Later',
            city: companyMatched.city || '',
            country: companyMatched.country || 'UAE',
            contactName: data.contact_name || '',
            contactDesignation: data.contact_designation || '',
            contactEmail: data.contact_email || data.email || '',
            contactMobile: data.contact_phone || data.mobile || data.phone || '',
            generalPhone: data.contact_phone || data.phone || '',
            generalEmail: data.contact_email || data.email || '',
            salespersonName: data.salesperson || '',
            emailDestination: 'contact',
            phoneDestination: 'contact'
          });
        }
      } else {
        setSubCompanyName(data.company_name);
        setSubLegalSuffix(data.legal_suffix || 'None / To Be Added Later');
        setSubCountry(data.country || data.project_location || 'UAE');
        setSubCity(data.project_location || '');
        setSubContactName(data.contact_name || '');
        setSubContactEmail(data.contact_email || data.email || '');
        if (data.contact_phone || data.mobile || data.phone) setSubGeneralPhone(data.contact_phone || data.mobile || data.phone);

        setUnregisteredEntities({
          companyName: data.company_name,
          legalSuffix: data.legal_suffix || 'None / To Be Added Later',
          city: data.project_location || '',
          country: data.country || 'UAE',
          contactName: data.contact_name || '',
          contactDesignation: data.contact_designation || '',
          contactEmail: data.contact_email || data.email || '',
          contactMobile: data.contact_phone || data.mobile || data.phone || '',
          generalPhone: data.contact_phone || data.phone || '',
          generalEmail: data.contact_email || data.email || '',
          salespersonName: data.salesperson || '',
          emailDestination: 'contact',
          phoneDestination: 'contact'
        });
      }
    }

    if (data.confidence_scores) {
      const scores: any = {};
      Object.keys(data.confidence_scores).forEach(key => {
        let val = data.confidence_scores[key];
        if (typeof val === 'string') {
          val = val.toLowerCase().trim();
          if (val.includes('high')) {
            scores[key] = 'high';
          } else if (val.includes('medium')) {
            scores[key] = 'medium';
          } else {
            scores[key] = 'low';
          }
        } else {
          scores[key] = 'low';
        }
      });
      setAiConfidence(scores);
    }

    if (data.line_items && Array.isArray(data.line_items)) {
      const formattedItems = data.line_items.map((item: any) => {
        const qty = Number(item.quantity) || 1;
        // Preserve the exact numeric rate from the document without dividing by 3.6725 when extracted in USD
        const rawPrice =
          Number(item.unit_price) ||
          Number(item.unit_price_aed) ||
          Number(item.price) ||
          Number(item.unitPrice) ||
          0;
        const price = rawPrice;

        const rawExtracted: any[] = Array.isArray(item.attributes) ? item.attributes : [];
        const normalizedAttrMap = new Map<string, string>(); // canonicalKey -> value

        rawExtracted.forEach((attr: any) => {
          if (!attr || !attr.key) return;
          const val = attr.value !== undefined && attr.value !== null ? String(attr.value).trim() : '';
          if (!val) return;
          const canonicalKey = normalizeAttributeKey(String(attr.key));
          if (!canonicalKey) return;
          if (!normalizedAttrMap.has(canonicalKey)) {
            normalizedAttrMap.set(canonicalKey, val);
          }
        });

        const mergedAttributes: ProductAttribute[] = Array.from(normalizedAttrMap.entries()).map(([key, value]) => ({
          key,
          value
        }));

        let productType = item.product_type || 'Other';
        let itemType: 'product' | 'charge' | 'discount' = item.item_type || 'product';
        let chargeType: string | undefined = item.charge_type;

        const descLower = (item.description || '').toLowerCase();
        const prodLower = (item.product_type || '').toLowerCase();

        if (!item.item_type) {
          if (/\b(transport|transportation|freight|shipping|delivery|dispatch|courier|logistics)\b/i.test(descLower) || /\b(transport|freight|delivery)\b/i.test(prodLower)) {
            itemType = 'charge';
            chargeType = 'Transportation';
            productType = 'Service / Charge';
          } else if (/\b(installation|commissioning|testing|erection|labor|labour)\b/i.test(descLower)) {
            itemType = 'charge';
            chargeType = 'Installation';
            productType = 'Service / Charge';
          } else if (/\b(customs|duty|clearance|tax)\b/i.test(descLower)) {
            itemType = 'charge';
            chargeType = 'Customs';
            productType = 'Service / Charge';
          } else if (/\b(discount|rebate|deduction)\b/i.test(descLower)) {
            itemType = 'discount';
            chargeType = 'Discount';
            productType = 'Service / Charge';
          }
        } else if (itemType === 'charge' || itemType === 'discount') {
          productType = 'Service / Charge';
        }

        const rawOpt = String(item.option_designation || item.option || 'Default / Included').trim();
        const rawDesc = String(item.description || '').trim();
        const rawName = String(item.item_name || item.name || '').trim();
        const parsedTitleSpec = parseLineItemTitleAndSpec(rawName, rawDesc);
        const extractedBrand =
          item.brand_make ||
          normalizedAttrMap.get('Brand / Make') ||
          '';
        const extractedModel =
          item.model_part_no ||
          normalizedAttrMap.get('Model') ||
          '';

        // Auto-match against workspace Products Catalog by SKU, Model, or Name
        const matchedCatalogProd = (products || []).find((p) => {
          if (p.is_deleted) return false;
          if (item.sku && p.sku && p.sku.toLowerCase() === String(item.sku).toLowerCase()) return true;
          if (extractedModel && p.model_part_no && p.model_part_no.toLowerCase() === extractedModel.toLowerCase()) return true;
          const pName = (p.name || '').toLowerCase().trim();
          const cTitle = (parsedTitleSpec.title || '').toLowerCase().trim();
          return Boolean(pName && cTitle && (pName === cTitle || (cTitle.length > 5 && pName.includes(cTitle))));
        });

        const finalUnitPrice =
          price > 0
            ? Number(price.toFixed(2))
            : matchedCatalogProd?.unit_price
            ? Number(
                (effectiveExtractedCurrency === 'USD'
                  ? matchedCatalogProd.unit_price / 3.6725
                  : matchedCatalogProd.unit_price
                ).toFixed(2)
              )
            : 0;

        const rawCostAed =
          Number(item.cost_price) ||
          matchedCatalogProd?.cost_price ||
          matchedCatalogProd?.cost_price_aed ||
          0;
        const finalCostPrice =
          rawCostAed > 0
            ? Number(
                (effectiveExtractedCurrency === 'USD' && !item.cost_price
                  ? rawCostAed / 3.6725
                  : rawCostAed
                ).toFixed(2)
              )
            : undefined;

        // Extract any "2 x ..." or "1 x ..." included sub-items from raw description or item.sub_components
        const rawSubList: any[] = Array.isArray(item.sub_components) ? item.sub_components : [];
        let extractedSubs = rawSubList
          .map((sub: any, sIdx: number) => ({
            id: sub.id || `sub_${Date.now()}_${sIdx + 1}`,
            sn: String(sIdx + 1),
            item_name: String(sub.item_name || sub.name || '').trim(),
            remark: String(sub.remark || sub.technical_Highlight || '').trim(),
            quantity: Number(sub.quantity) || 1,
            unit: String(sub.unit || 'Nos').trim(),
            cost_price: Number(sub.cost_price) || 0,
            unit_price: Number(sub.unit_price) || 0,
            total_price: (Number(sub.quantity) || 1) * (Number(sub.unit_price) || 0),
            line_total: (Number(sub.quantity) || 1) * (Number(sub.unit_price) || 0),
            is_included_accessory: (Number(sub.unit_price) || 0) <= 0
          }))
          .filter((sub: any) => Boolean(sub.item_name));

        // Fallback: if AI left sub_components empty, scan description for "2 x ..." / "1 x ..." included lines
        if (extractedSubs.length === 0 && rawDesc) {
          const descLines = String(rawDesc).split(/\r?\n/);
          descLines.forEach((line, lIdx) => {
            const m = line.trim().match(/^(\d+)\s*[xX]\s+(.+)$/);
            if (m && m[2]) {
              extractedSubs.push({
                id: `sub_${Date.now()}_${lIdx + 1}`,
                sn: String(extractedSubs.length + 1),
                item_name: m[2].trim(),
                remark: '',
                quantity: Number(m[1]) || 1,
                unit: 'Nos',
                cost_price: 0,
                unit_price: 0,
                total_price: 0,
                line_total: 0,
                is_included_accessory: true
              });
            }
          });
        }

        // Remove legacy duplicate Row #1 if it just repeats the parent title with 0 price
        if (
          extractedSubs.length > 1 &&
          extractedSubs[0].unit_price === 0 &&
          (parsedTitleSpec.title || '').trim() &&
          extractedSubs[0].item_name.toLowerCase() === (parsedTitleSpec.title || '').trim().toLowerCase()
        ) {
          extractedSubs = extractedSubs.slice(1).map((s, idx) => ({ ...s, sn: String(idx + 1) }));
        }

        return {
          product_id: matchedCatalogProd?.id || undefined,
          sku: item.sku || matchedCatalogProd?.sku || undefined,
          item_name: parsedTitleSpec.title || matchedCatalogProd?.name || '',
          item_type: itemType,
          charge_type: chargeType,
          product_type: matchedCatalogProd?.product_type || productType,
          description:
            compileDescriptionWithSpecs(
              parsedTitleSpec.title || matchedCatalogProd?.name || '',
              parsedTitleSpec.spec || rawDesc || matchedCatalogProd?.description || '',
              mergedAttributes.length > 0 ? mergedAttributes : (matchedCatalogProd?.attributes || [])
            ) ||
            parsedTitleSpec.spec ||
            rawDesc ||
            matchedCatalogProd?.description ||
            '',
          quantity: qty,
          unit: item.unit || item.uom || matchedCatalogProd?.unit || (extractedSubs.length > 0 ? 'Set' : 'Nos'),
          unit_price: finalUnitPrice,
          cost_price: finalCostPrice,
          total_price: Number((qty * finalUnitPrice).toFixed(2)),
          is_composite_set: extractedSubs.length > 0 ? true : undefined,
          sub_components: extractedSubs.length > 0 ? extractedSubs : undefined,
          brand_make: extractedBrand || matchedCatalogProd?.brand_make || undefined,
          model_part_no: extractedModel || matchedCatalogProd?.model_part_no || undefined,
          country_of_origin: item.country_of_origin || matchedCatalogProd?.country_of_origin || undefined,
          hs_code: item.hs_code || matchedCatalogProd?.hs_code || undefined,
          lead_time_note: item.lead_time_note || matchedCatalogProd?.default_availability || '',
          image_url: item.image_url || matchedCatalogProd?.image_url || undefined,
          datasheet_attachment: item.datasheet_attachment || matchedProdDatasheetFallback(item, matchedCatalogProd),
          include_datasheet_in_quote:
            item.datasheet_attachment || matchedCatalogProd?.datasheet_attachment ? true : undefined,
          option: rawOpt,
          attributes: mergedAttributes.length > 0 ? mergedAttributes : (matchedCatalogProd?.attributes || [])
        };
      });
      setLineItems(formattedItems);
    }
  };

  function matchedProdDatasheetFallback(item: any, matchedCatalogProd: any) {
    return item?.datasheet_attachment || matchedCatalogProd?.datasheet_attachment || undefined;
  }

  // Ultra-fast client-side instant pre-parser for Excel tab-delimited & Email text (<5ms execution)
  const parseInstantSmartTextData = (text: string) => {
    if (!text || typeof text !== 'string') return null;

    try {
      const clean = text.trim();

      // Extract Email
      const emailMatch = clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const extractedEmail = emailMatch ? emailMatch[0] : '';

      // Extract Phone
      const phoneMatch = clean.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/);
      const extractedPhone = phoneMatch ? phoneMatch[0] : '';

      // Extract Quote Ref (must contain at least one digit so phrases like "RFQ received by..." never match "received")
      const refMatch =
        clean.match(/\b([A-Za-z0-9]{2,}(?:\/[A-Za-z0-9-]+){2,})\b/) ||
        clean.match(/\b([A-Za-z0-9]*\d[A-Za-z0-9]*-[A-Za-z0-9]{4,})\b/) ||
        clean.match(/(?:quote\s*(?:ref|no\.?|#)|rfq\s*(?:ref|no\.?|#)|enquiry\s*(?:ref|no\.?|#)|ref(?:\s*no\.?|\s*#)?\s*[:#-])\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9/_-]{3,})/i);
      const rawCandidateRef = refMatch ? (refMatch[1] || refMatch[0] || '').trim() : '';
      const extractedQuoteRef =
        /\d/.test(rawCandidateRef) &&
        !/^(received|details|from|for|by|subject|enquiry|quotation|item)$/i.test(rawCandidateRef)
          ? rawCandidateRef
          : '';

      // Extract Date
      const dateMatch = clean.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,5}|\d{4}-\d{2}-\d{2})/);
      let extractedDate = '';
      if (dateMatch) {
        const dStr = dateMatch[1];
        if (dStr.includes('/')) {
          const parts = dStr.split('/');
          if (parts.length === 3) {
            let year = parts[2];
            if (year.length > 4) year = year.slice(-4);
            if (year.length === 2) year = '20' + year;
            extractedDate = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        } else {
          extractedDate = dStr;
        }
      }

      // Extract Country & Location
      let extractedLocation = 'Dubai';
      let extractedCountry = 'UAE';
      if (/abu dhabi/i.test(clean)) extractedLocation = 'Abu Dhabi';
      else if (/sharjah/i.test(clean)) extractedLocation = 'Sharjah';
      else if (/ajman/i.test(clean)) extractedLocation = 'Ajman';
      else if (/qatar/i.test(clean)) { extractedCountry = 'Qatar'; extractedLocation = 'Doha'; }
      else if (/saudi|ksa|riyadh|jeddah/i.test(clean)) { extractedCountry = 'Saudi Arabia'; extractedLocation = 'Riyadh'; }

      const extractedCommercial = extractCommercialTermsAndHeaderFromText(clean);

      // Extract Package Value (prefer explicit unit/package price over raw numbers so years like 2026 are never matched)
      let extractedValue: number | null = extractedCommercial.unitPrice || null;
      if (!extractedValue) {
        const valMatch = clean.match(
          /(?:total|amount|value|budget|unit\s*price|aed|usd)\s*[-:=$]*\s*([\d,]{4,}(?:\.\d{2})?)/i
        );
        if (valMatch) {
          const num = Number(valMatch[1].replace(/,/g, ''));
          if (!isNaN(num) && num > 100 && !(num >= 1990 && num <= 2050 && !valMatch[1].includes(','))) {
            extractedValue = num;
          }
        }
      }

      // Semantic cell parsing if tab-separated or pipe-separated
      let extractedCompany = extractedCommercial.companyName || '';
      let extractedContact = '';
      let salesperson = extractedCommercial.salesperson || '';

      if (clean.includes('\t') || clean.includes('|')) {
        const delimiter = clean.includes('\t') ? '\t' : '|';
        const parts = clean.split('\n')[0].split(delimiter).map(p => p.trim());

        // Dynamic token inspection across all cells
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (!p) continue;

          // Salesperson initials (2-3 chars uppercase e.g. PV, NS, MK)
          if (!salesperson && /^[A-Z]{2,3}$/.test(p)) {
            salesperson = p;
            continue;
          }

          // Company Name (contains company keywords or legal suffixes)
          if (!extractedCompany && /\b(solutions|llc|fze|fzc|ltd|co\.|trading|est|wll|projects|services|engineering|industries|systems|group|enterprise|global)\b/i.test(p)) {
            extractedCompany = p;
            continue;
          }

          // Contact Name (2 capitalized words, not email, phone, or quote ref)
          if (!extractedContact && /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(p) && p !== extractedCompany && !p.includes('@')) {
            extractedContact = p;
            continue;
          }
        }
      }

      // Fallback Company & Contact parsing if not found in tab cells
      if (!extractedCompany) {
        const companyLineMatch = clean.match(/(?:company|client|customer|for|from):\s*([^\n\r]+)/i);
        if (companyLineMatch) {
          extractedCompany = companyLineMatch[1].trim();
        } else {
          const lines = clean.split(/\r?\n/);
          for (const line of lines) {
            if (/\b(llc|fze|fzc|ltd|co\.|trading|est|wll|projects|solutions|services|engineering|industries)\b/i.test(line)) {
              extractedCompany = line.trim().replace(/^(from|to|for|client|company|customer):\s*/i, '');
              break;
            }
          }
        }
      }

      if (!extractedContact) {
        const contactLineMatch = clean.match(/(?:contact|attn|attention|name|person|mr\.|ms\.|eng\.):\s*([^\n\r]+)/i);
        if (contactLineMatch) {
          extractedContact = contactLineMatch[1].trim();
        } else if (extractedEmail) {
          const emailNamePart = extractedEmail.split('@')[0];
          if (emailNamePart && emailNamePart.includes('.')) {
            extractedContact = emailNamePart.split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
          }
        }
      }

      // Line items intelligent parser
      const lineItemsArr: any[] = [];
      const itemBlocks = clean.split(/(?=(?:Commercial Control|Modular Assembly|Consumables|Actuated|Isolation Valve|Control Unit|Skid Frame|Assembly|Pump|Valve|Equipment|Module|DUPLEX WATER SOFTENER|WATER SOFTENER|RO SYSTEM|MMF SYSTEM))/i);

      if (itemBlocks.length > 1) {
        itemBlocks.forEach((block) => {
          const trimmed = block.trim();
          if (trimmed.length < 5) return;
          if (/^a\s+rfq\s+received\s+by/i.test(trimmed) && trimmed.split(/\r?\n/).length === 1) return;

          let productType = 'General Equipment';
          if (/control|instrument|sensor|plc/i.test(trimmed)) productType = 'Instrumentation & Controls';
          else if (/consumable|spare|seal|kit/i.test(trimmed)) productType = 'Consumables & Spares';
          else if (/valve|manifold|flange|fastener/i.test(trimmed)) productType = 'Hardware & Fasteners';
          else if (/frame|skid|fabrication|softener/i.test(trimmed)) productType = 'Custom Fabrication';
          else if (/service|commissioning|turnkey/i.test(trimmed)) productType = 'Turnkey / Services';

          const qtyMatch = trimmed.match(/(?:quantity|qty|nos\.?|sets?)\s*:?\s*(\d+)/i) || trimmed.match(/(\d+)\s*(?:nos|pcs|set|kg|mtr|lot)/i);
          const qty = qtyMatch ? Number(qtyMatch[1]) : 1;

          const unitMatch = trimmed.match(/(nos|pcs|set|kg|mtr|lot)/i);
          const unit = unitMatch ? (unitMatch[1].charAt(0).toUpperCase() + unitMatch[1].slice(1).toLowerCase()) : 'Nos';

          // Extract key attributes
          const attributes: { key: string; value: string }[] = [];
          const modelMatch = trimmed.match(/model\s*:?\s*([^\n,\r]+)/i);
          if (modelMatch) attributes.push({ key: normalizeAttributeKey('Model'), value: modelMatch[1].trim() });

          const makeMatch = trimmed.match(/make\s*:?\s*([^\n,\r]+)/i);
          if (makeMatch) attributes.push({ key: normalizeAttributeKey('Make'), value: makeMatch[1].trim() });

          const pressMatch = trimmed.match(/design pressure\s*:?\s*([^\n,\r]+)/i);
          if (pressMatch) attributes.push({ key: normalizeAttributeKey('Design Pressure'), value: pressMatch[1].trim() });

          const firstLine = trimmed.split(/\r?\n/)[0].replace(/^["'\s\t]+/, '').slice(0, 500);
          const parsedBlock = parseLineItemTitleAndSpec(firstLine);

          lineItemsArr.push({
            item_name: parsedBlock.title,
            product_type: productType,
            description: parsedBlock.spec || firstLine,
            quantity: qty,
            unit: unit === 'Nos' ? 'Nos' : unit === 'Set' ? 'Set' : 'Nos',
            unit_price: 0,
            unit_price_aed: 0,
            brand_make: makeMatch ? makeMatch[1].trim() : undefined,
            model_part_no: modelMatch ? modelMatch[1].trim() : undefined,
            attributes
          });
        });
      }

      if (lineItemsArr.length === 1 && extractedValue && extractedValue > 0) {
        const qty = Math.max(1, Number(lineItemsArr[0].quantity) || 1);
        lineItemsArr[0].unit_price = Number((extractedValue / qty).toFixed(2));
        lineItemsArr[0].unit_price_aed = Number((extractedValue / qty).toFixed(2));
      }

      if (lineItemsArr.length === 0) {
        const lines = clean.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 5 && (/\d+\s*(nos|pcs|set|kg|mtr|lot|unit)/i.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed))) {
            const parsedLine = parseLineItemTitleAndSpec(trimmed);
            lineItemsArr.push({
              item_name: parsedLine.title,
              product_type: 'General',
              description: parsedLine.spec || trimmed,
              quantity: 1,
              unit: 'Lot',
              unit_price: extractedValue || 0,
              unit_price_aed: extractedValue || 0,
              attributes: []
            });
          }
        }
      }

      const detectedInstantCurrency =
        /\bunit\s*price\s*\(usd\)|\btotal\s*price\s*\(usd\)|\busd\b|\$/i.test(clean) &&
        !/\baed\b/i.test(clean)
          ? 'USD'
          : undefined;

      if (
        extractedCompany ||
        extractedContact ||
        extractedEmail ||
        extractedQuoteRef ||
        salesperson ||
        extractedCommercial.priceBasis ||
        extractedCommercial.deliveryPeriod ||
        extractedCommercial.paymentTerms ||
        lineItemsArr.length > 0
      ) {
        return {
          sn: null,
          quote_ref_no: extractedQuoteRef,
          subject: extractedCommercial.subject || null,
          received_date: extractedDate || new Date().toISOString().split('T')[0],
          salesperson: salesperson || '',
          company_name: extractedCompany || 'Prospective Client',
          legal_suffix: 'None / To Be Added Later',
          contact_name: extractedContact || '',
          contact_email: extractedEmail || '',
          contact_phone: extractedPhone || '',
          country: extractedCountry,
          project_location: extractedLocation,
          enquiry_source: 'EMAIL',
          ...(detectedInstantCurrency ? { currency: detectedInstantCurrency } : {}),
          package_value: extractedValue,
          price_basis: extractedCommercial.priceBasis || null,
          delivery_period: extractedCommercial.deliveryPeriod || null,
          payment_terms: extractedCommercial.paymentTerms || null,
          validity_days: extractedCommercial.validityDays || null,
          tax_mode: extractedCommercial.taxMode || null,
          line_items: lineItemsArr,
          confidence_scores: { company_name: 'high', contact_name: 'high', project_location: 'high', line_items: 'medium' }
        };
      }
    } catch (e) {
      console.warn('Instant pre-parser exception:', e);
    }
    return null;
  };

  const handleExtractFromRawText = async (textToExtract?: string) => {
    const textContent = textToExtract || rawTextInput;
    if (!textContent || !textContent.trim()) {
      if (triggerToast) triggerToast('Please paste or enter raw text / Excel row data first.', 'error');
      return;
    }

    // 1. Instant client-side heuristic pre-fill (<5ms)
    const instantData = parseInstantSmartTextData(textContent);
    if (instantData) {
      applyExtractedData(instantData);
      setPastedSourceText(textContent);
      setPastedExtractedData(instantData);
      setActivePreviewUrl(null);
      setPreviewMinimized(false);
      setRawTextModalOpen(false);
      if (triggerToast) {
        triggerToast(`Instant Smart Fill applied in <5ms! Refining line items with AI in background...`, 'info');
      }
    }

    if (extractionAbortRef.current) {
      try {
        extractionAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    userStoppedExtractionRef.current = false;
    setIsExtracting(true);
    setExtractionStatusText('Refining extracted fields with AI...');
    const startTime = Date.now();

    // 180 second safety timeout for text AI refinement
    const textController = new AbortController();
    extractionAbortRef.current = textController;
    const textTimeoutId = setTimeout(() => {
      textController.abort();
    }, 180000);

    try {
      const userGeminiKey = localStorage.getItem('omni_user_gemini_api_key') || '';
      const preferredModel = selectedAiModel || 'auto';

      const data = await extractEnquiryClientSide(
        userGeminiKey,
        textContent,
        false, // isBase64
        'text/plain',
        'Pasted_Excel_Row.txt',
        salespersons,
        textController.signal,
        preferredModel,
        (statusText) => setExtractionStatusText(statusText),
        aiScanMode
      );

      clearTimeout(textTimeoutId);

      applyExtractedData(data);

      setPastedSourceText(textContent);
      setPastedExtractedData(data);
      setActivePreviewUrl(null);
      setPreviewMinimized(false);

      const duration = Date.now() - startTime;
      const itemsCount = data.line_items ? data.line_items.length : 0;
      if (triggerToast) {
        triggerToast(
          `AI Autofill completed! Refined company "${data.company_name || 'N/A'}" and ${itemsCount} line items in ${(duration / 1000).toFixed(1)}s.`,
          'success'
        );
      }
      setRawTextModalOpen(false);
      setRawTextInput('');
    } catch (err: any) {
      clearTimeout(textTimeoutId);
      if (userStoppedExtractionRef.current) {
        return;
      }
      console.warn('Text extraction AI refinement note:', err);
      const isAuthErr = err.message?.includes('401') || err.message?.includes('UNAUTHENTICATED') || err.message?.toLowerCase().includes('api key') || err.message?.toLowerCase().includes('credentials');
      
      if (instantData) {
        if (triggerToast) {
          triggerToast(
            isAuthErr 
              ? `Instant Smart Fill applied! AI refinement skipped (Configure GEMINI_API_KEY in AI Studio Settings).`
              : `Instant Smart Fill preserved! AI refinement skipped.`, 
            'info'
          );
        }
      } else {
        const msg = isAuthErr
          ? "Gemini API key is unconfigured, deleted, or invalid (401 Unauthenticated). Please set your GEMINI_API_KEY in AI Studio Settings."
          : `Text Autofill note: ${err.message}`;
        if (triggerToast) {
          triggerToast(msg, 'info');
        }
      }
    } finally {
      if (extractionAbortRef.current === textController) {
        extractionAbortRef.current = null;
      }
      setIsExtracting(false);
    }
  };

  const handleExtractFromAttachment = async (fileData: Attachment) => {
    if (extractionAbortRef.current) {
      try {
        extractionAbortRef.current.abort();
      } catch {
        // ignore
      }
    }
    userStoppedExtractionRef.current = false;

    // Set active preview immediately so they see the file side-by-side during extraction
    setActivePreviewUrl(fileData.url);
    setPreviewFileName(fileData.name);
    setPreviewFileType(fileData.type || 'application/pdf');
    setPastedSourceText(null);
    setPastedExtractedData(null);
    setPreviewMinimized(false);

    setIsExtracting(true);
    setExtractionError(null);
    setAiConfidence(null);
    setExtractionStatusText(`Preparing "${fileData.name}" for AI extraction...`);

    const clientStartTime = Date.now();
    let fileFetchTime = 0;
    let fileConversionTime = 0;
    let networkRequestTime = 0;
    let stateUpdateTime = 0;

    // Set up AbortController for a generous 180-second (3-minute) ceiling
    const controller = new AbortController();
    extractionAbortRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 180000);

    try {
      console.log(`%c[AI Client-Side Extraction Start] Processing: ${fileData.name}`, "color: #3b82f6; font-weight: bold; font-size: 11px;");
      const isImage = fileData.type.startsWith('image/');
      const isPdf = fileData.type === 'application/pdf';
      const isDocx = fileData.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileData.name.endsWith('.docx');
      
      let requestPayload: any = {
        fileName: fileData.name,
        mimeType: fileData.type || 'application/octet-stream',
        salespersons,
      };

      const fetchStart = Date.now();
      if (isImage || isPdf) {
        setExtractionStatusText(`Reading "${fileData.name}"...`);
        const response = await fetch(fileData.url, { signal: controller.signal });
        const blob = await response.blob();
        fileFetchTime = Date.now() - fetchStart;

        const convertStart = Date.now();
        let base64Content = '';
        if (isImage) {
          setExtractionStatusText(`Optimizing image for fast vision scan...`);
          base64Content = await downsampleImage(blob);
        } else {
          setExtractionStatusText(`Encoding PDF pages for AI extraction...`);
          const base64Promise = new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              const base64Data = result.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = (e) => reject(e);
            reader.readAsDataURL(blob);
          });
          base64Content = await base64Promise;
        }
        fileConversionTime = Date.now() - convertStart;

        requestPayload.content = base64Content;
        requestPayload.isBase64 = true;
      } else if (isDocx) {
        setExtractionStatusText(`Extracting text from Word document...`);
        const response = await fetch(fileData.url, { signal: controller.signal });
        const arrayBuffer = await response.arrayBuffer();
        fileFetchTime = Date.now() - fetchStart;
        
        const convertStart = Date.now();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const textContent = result.value;
        fileConversionTime = Date.now() - convertStart;
        
        requestPayload.content = textContent;
        requestPayload.isBase64 = false;
      } else {
        setExtractionStatusText(`Reading document text...`);
        const response = await fetch(fileData.url, { signal: controller.signal });
        fileFetchTime = Date.now() - fetchStart;

        const convertStart = Date.now();
        const textContent = await response.text();
        fileConversionTime = Date.now() - convertStart;

        requestPayload.content = textContent;
        requestPayload.isBase64 = false;
      }

      const networkStart = Date.now();
      const userGeminiKey = localStorage.getItem('omni_user_gemini_api_key') || '';
      const preferredModel = selectedAiModel || 'auto';

      const data = await extractEnquiryClientSide(
        userGeminiKey,
        requestPayload.content,
        requestPayload.isBase64,
        requestPayload.mimeType,
        requestPayload.fileName,
        salespersons,
        controller.signal,
        preferredModel,
        (statusText) => setExtractionStatusText(statusText),
        aiScanMode
      );

      clearTimeout(timeoutId);
      networkRequestTime = Date.now() - networkStart;

      const stateStart = Date.now();
      applyExtractedData(data);
      setPastedExtractedData(data);

      stateUpdateTime = Date.now() - stateStart;
      const clientTotalTime = Date.now() - clientStartTime;
      console.log(`[AI Autofill Completed] Total: ${clientTotalTime}ms (Fetch/Encode: ${fileFetchTime + fileConversionTime}ms, Gemini: ${networkRequestTime}ms, UI Sync: ${stateUpdateTime}ms)`);

      const itemsCount = data.line_items ? data.line_items.length : 0;
      const summaryToast = `AI Autofill complete in ${(clientTotalTime / 1000).toFixed(1)}s — populated "${data.company_name || 'Client'}" & ${itemsCount} item(s).`;
      if (triggerToast) {
        triggerToast(summaryToast, 'success');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (userStoppedExtractionRef.current) {
        // User explicitly clicked [Stop Autofill] — exit cleanly with zero error banner
        return;
      }

      const clientTotalTime = Date.now() - clientStartTime;
      const userMessage = err?.message || 'Failed to extract content.';
      const msgLower = userMessage.toLowerCase();
      const isQuotaError = 
        userMessage.includes('429') || 
        msgLower.includes('quota') || 
        msgLower.includes('rate limit') || 
        msgLower.includes('prepayment') || 
        msgLower.includes('credits') || 
        msgLower.includes('resource_exhausted') || 
        msgLower.includes('depleted') || 
        msgLower.includes('exceeded');
      
      const isAuthError = 
        userMessage.includes('401') || 
        userMessage.includes('UNAUTHENTICATED') || 
        msgLower.includes('invalid authentication') || 
        msgLower.includes('api key') || 
        msgLower.includes('credentials');

      if (!isQuotaError && !isAuthError) {
        console.warn(`[AI Extraction Error after ${clientTotalTime}ms]:`, err);
      }

      const isAbortError = err.name === 'AbortError' || 
                           err.message?.toLowerCase().includes('abort') || 
                           err.message?.toLowerCase().includes('aborted') || 
                           err.message?.toLowerCase().includes('signal is');

      let displayMsg = userMessage;
      if (isAbortError) {
        displayMsg = "AI extraction timed out (180 seconds limit exceeded). Try switching to Fast Scan (Gemini 2.5 Flash) or use Paste Excel / Text.";
      } else if (isQuotaError) {
        displayMsg = "Gemini API Quota or Prepayment Credits Depleted. Enter your personal Gemini API key below or use Smart Paste (100% offline).";
      } else if (isAuthError) {
        displayMsg = "Gemini AI Key is missing or invalid. Enter your personal Gemini API key below or configure GEMINI_API_KEY in AI Studio Settings.";
      }

      setExtractionError(displayMsg);

      if (triggerToast) {
        triggerToast(`Autofill note: ${displayMsg}`, (isQuotaError || isAuthError) ? 'info' : 'error');
      }
    } finally {
      clearTimeout(timeoutId);
      if (extractionAbortRef.current === controller) {
        extractionAbortRef.current = null;
      }
      setIsExtracting(false);
    }
  };

  const renderConfidenceBadge = (field: 'company_name' | 'contact_name' | 'project_location' | 'line_items') => {
    if (!aiConfidence || !aiConfidence[field]) return null;
    let score = aiConfidence[field];
    if (typeof score !== 'string') return null;
    score = score.toLowerCase().trim();
    if (score !== 'high' && score !== 'medium' && score !== 'low') {
      score = 'low';
    }
    
    let bg = '';
    if (score === 'high') {
      bg = 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    } else if (score === 'medium') {
      bg = 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    } else {
      bg = 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-mono font-bold border ${bg} tracking-wider whitespace-nowrap shrink-0 z-10 shadow-2xs`}>
        AI: {score.toUpperCase()} CONFIDENCE
      </span>
    );
  };

  // Submit Enquiry record save
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    // Zero-Trust Check: Ensure Viewers cannot generate or mutate proposals
    const userRole = getUserWorkspaceRole(user, activeWorkspace?.id, activeWorkspace);
    if (userRole === 'Viewer') {
      alert('Access Denied: Viewers do not have permission to create or mutate proposals.');
      return;
    }

    // Zero-Trust Check: Ensure non-authorized users cannot mutate enquiries
    if (isReadOnly) {
      alert('Access Denied: You do not have permission to edit this enquiry.');
      return;
    }

    if (!activeWorkspace?.id) {
      alert('Critical Error: Active workspace context lost. Cannot save record.');
      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
    }

    const isGapReserved = status === 'Gap / Reserved' || status === 'GAP / RESERVED';

    let activeCompanyId = companyId;
    let activeContactId = contactId;

    if (!activeCompanyId && !isGapReserved) {
      const typedComp = companySearch.trim();
      if (typedComp) {
        const existingComp = companies.find(
          (c) =>
            c.display_name.toLowerCase() === typedComp.toLowerCase() ||
            (c.canonical_name && c.canonical_name.toLowerCase() === typedComp.toLowerCase())
        );
        if (existingComp && existingComp.id) {
          activeCompanyId = existingComp.id;
          setCompanyId(existingComp.id);
        } else {
          const shouldCreateComp = window.confirm(
            `Company "${typedComp}" is not in your Companies Registry yet.\n\nClick OK to save "${typedComp}" to your Companies Registry and continue submitting this enquiry.`
          );
          if (!shouldCreateComp) {
            return;
          }
          try {
            const newCompPayload: Omit<Company, 'id'> = {
              workspace_id: activeWorkspace.id,
              display_name: typedComp,
              canonical_name: typedComp,
              aliases: [typedComp],
              legal_suffix: 'None / To Be Added Later',
              city: projectLocation?.trim() || 'Dubai',
              country: country?.trim() || 'UAE',
              notes: 'Auto-registered on Enquiry submit',
              created_by_uid: user?.uid || '',
              created_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
              last_modified_by_uid: user?.uid || '',
              last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            const docRef = await safeAddDoc('companies', newCompPayload);
            await logAudit(docRef.id, 'company', 'create', null, newCompPayload, []);
            if (setCompanies) {
              setCompanies((prev) => [{ id: docRef.id, ...newCompPayload }, ...prev]);
            }
            activeCompanyId = docRef.id;
            setCompanyId(docRef.id);
          } catch (compErr: any) {
            alert('Failed to register company: ' + (compErr?.message || 'Unknown error'));
            return;
          }
        }
      } else {
        alert('Please search and select or enter a client company name first.');
        return;
      }
    }

    if (activeCompanyId && !activeContactId && customContactInput.trim()) {
      const typedContact = customContactInput.trim();
      const shouldCreateContact = window.confirm(
        `Save new contact "${typedContact}" to this company's Contacts Registry as well?`
      );
      if (shouldCreateContact) {
        const createdCtId = await handleCreateContactInline(typedContact, activeCompanyId);
        if (createdCtId) {
          activeContactId = createdCtId;
        }
      }
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(enquiryDate)) {
      alert('Please enter the Received Date in YYYY-MM-DD format (e.g. 2026-06-19).');
      return;
    }
    if (projectedOrderDate && !dateRegex.test(projectedOrderDate)) {
      alert('Please enter the Estimated Order Date in YYYY-MM-DD format (e.g. 2026-06-19) or clear the field.');
      return;
    }
    if (nextFollowupDate && !dateRegex.test(nextFollowupDate)) {
      alert('Please enter the Next Follow-up Date in YYYY-MM-DD format (e.g. 2026-06-19) or clear the field.');
      return;
    }

    setIsSubmitting(true);

    const cleanLineItems = lineItems.map((item) => {
      const isServiceOrFee =
        (item as any).classification === 'Charge / Fee (Service)' ||
        (item as any).classification === 'Discount / Rebate' ||
        item.item_type === 'charge' ||
        item.item_type === 'discount' ||
        (item.item_type as string) === 'service' ||
        (item.item_type as string) === 'fee' ||
        item.product_type === 'Service / Charge';

      const cleanAttr: ProductAttribute[] = isServiceOrFee
        ? []
        : (item.attributes || [])
            .map((a) => ({ key: normalizeAttributeKey(a.key.trim()), value: a.value.trim() }))
            .filter((a) => a.key !== '' && a.value !== '');
      const optDes = ((item as any).option_designation || item.option || 'Default / Included').trim();
      const resolvedDelivery = isServiceOrFee
        ? ''
        : (
            item.lead_time_note ||
            item.delivery_time ||
            item.lead_time ||
            item.availability ||
            (item.specifications as any)?.['Delivery'] ||
            (item.specifications as any)?.['Lead Time'] ||
            ''
          );
      const updatedSpecs = { ...(item.specifications || {}) };
      if (resolvedDelivery) {
        updatedSpecs['Delivery'] = resolvedDelivery;
        updatedSpecs['Lead Time'] = resolvedDelivery;
      }
      return {
        ...item,
        product_id: isServiceOrFee ? undefined : item.product_id,
        lead_time_note: resolvedDelivery,
        delivery_time: resolvedDelivery,
        lead_time: resolvedDelivery,
        availability: resolvedDelivery,
        specifications: updatedSpecs,
        option: optDes,
        option_designation: optDes,
        attributes: cleanAttr,
      };
    });

    const selectedSp = salespersons.find(
      (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
    );
    const spId = selectedSp?.id || (salesPerson && salesPerson.length > 5 ? salesPerson : undefined);
    const spInitialsOrName = selectedSp?.initials || selectedSp?.full_name || salesPerson;

    const { firestoreAttachments, memoryAttachments } = await prepareAttachmentsForSave(
      attachments,
      enquiryToEdit?.id
    );

    const currentUserId = user?.uid || user?.id || 'system';
    const repIdOrInitials = spInitialsOrName || spId || selectedSp?.initials || '';

    const selectedCompany = companies.find((c) => c.id === activeCompanyId);
    const resolvedCompanyName = selectedCompany?.display_name || (selectedCompany as any)?.name || companySearch?.trim();

    const payload: any = {
      workspace_id: activeWorkspace.id,
      workspaceId: activeWorkspace.id,
      assignedSalesperson: repIdOrInitials,
      sales_person_id: spId,
      sales_person: spInitialsOrName,
      salesperson: spInitialsOrName,
      sn: Number(sn),
      enquiry_date: enquiryDate,
      logged_date: loggedDate,
      assigned_to_id: (selectedSp as any)?.linked_user_id || (selectedSp as any)?.uid || (selectedSp?.id && selectedSp.id.length > 10 ? selectedSp.id : undefined) || enquiryToEdit?.assigned_to_id || currentUserId,
      assigned_to: spInitialsOrName || enquiryToEdit?.assigned_to || '',
      shared_with: enquiryToEdit?.shared_with || (Array.isArray(enquiryToEdit?.shared_with_uids) ? (enquiryToEdit?.shared_with_uids as any) : []),
      shared_with_uids: enquiryToEdit?.shared_with_uids || (enquiryToEdit?.shared_with as any) || [],
      shared_with_names: enquiryToEdit?.shared_with_names || [],
      additional_team: enquiryToEdit?.additional_team || [],
      concerned_persons: concernedPersons,
      company_id: activeCompanyId || '',
      company_name: selectedCompany?.display_name || (selectedCompany as any)?.name || (!activeCompanyId && isGapReserved ? (companySearch?.trim() || '[Reserved Sequence / Missing File]') : (companySearch?.trim() || ((enquiryToEdit as any)?.company_name && !(enquiryToEdit as any)?.company_name.includes('[Reserved Sequence') ? (enquiryToEdit as any)?.company_name : undefined))),
      contact_id: activeContactId || undefined,
      country,
      project_location: projectLocation,
      enquiry_source: enquirySource,
      status: status || 'Active',
      is_gap_placeholder: isGapReserved ? true : false,
      raw_source_text: pastedSourceText && pastedSourceText.length > 500000 
        ? pastedSourceText.substring(0, 500000) + '\n\n[TEXT_TRUNCATED_DUE_TO_SIZE_LIMIT]' 
        : pastedSourceText || undefined,
      quote_ref_no: (quoteRefNo || '').trim(),
      subject: (subject || '').trim() || undefined,
      customer_reference_code: (customerReferenceCode || '').trim() || undefined,
      proposal_option: proposalOption || undefined,
      projected_order_date: projectedOrderDate || undefined,
      next_followup_date: nextFollowupDate || undefined,
      value_aed: formCurrency === 'USD' ? finalValue * 3.6725 : finalValue,
      currency: formCurrency,
      is_lump_sum: isLumpSum,
      remarks: (() => {
        const lines = (remarks || '')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        const exactUnique: string[] = [];
        const seen = new Set<string>();
        for (const line of lines) {
          const key = line.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            exactUnique.push(line);
          }
        }
        return exactUnique
          .filter((line, idx) => {
            const lower = line.toLowerCase();
            if (lower.length < 10) return true;
            return !exactUnique.some(
              (other, oIdx) =>
                oIdx !== idx &&
                other.length > line.length &&
                other.toLowerCase().includes(lower)
            );
          })
          .join('\n');
      })(),
      invoice_po_no: (invoicePoNo || '').trim() || undefined,
      payment_status: (paymentStatus || '').trim() || undefined,
      validity_days: Number(validityDays) > 0 ? Number(validityDays) : 30,
      valid_until: (() => {
        const base = new Date(enquiryDate || Date.now());
        const d = !isNaN(base.getTime()) ? base : new Date();
        d.setDate(d.getDate() + (Number(validityDays) > 0 ? Number(validityDays) : 30));
        return d.toISOString();
      })(),
      price_basis: (priceBasis || '').trim() || undefined,
      delivery_period: (deliveryPeriod || '').trim() || undefined,
      payment_terms: (paymentTerms || '').trim() || undefined,
      tax_mode: taxMode || 'taxes_extra',
      custom_project_details: customProjectDetails.filter(d => d.key.trim() && d.value.trim()),
      line_items: stripCatalogRedundantLineItemMedia(cleanLineItems, products),
      attachments: firestoreAttachments && firestoreAttachments.length > 0 ? firestoreAttachments : undefined,
      parent_id: parentId ?? enquiryToEdit?.parent_id ?? null,
      revision_number: typeof revisionNumber === 'number' ? revisionNumber : (enquiryToEdit?.revision_number ?? (parentId ? 1 : 0)),
      createdBy: enquiryToEdit?.createdBy || enquiryToEdit?.created_by_uid || enquiryToEdit?.createdByUid || currentUserId,
      created_by: enquiryToEdit?.created_by || enquiryToEdit?.created_by_uid || enquiryToEdit?.createdByUid || currentUserId,
      created_by_uid: enquiryToEdit?.created_by_uid || enquiryToEdit?.createdByUid || currentUserId,
      created_by_name: enquiryToEdit?.created_by_name || enquiryToEdit?.createdByUsername || user?.username || user?.full_name || user?.email || 'Unknown User',
      createdByUid: enquiryToEdit?.createdByUid || enquiryToEdit?.created_by_uid || currentUserId,
      createdByUsername: enquiryToEdit?.createdByUsername || enquiryToEdit?.created_by_name || user?.username || user?.full_name || user?.email || 'Unknown User',
      last_modified_by_uid: currentUserId,
      last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
      updatedByUid: currentUserId,
      updatedByUsername: user?.username || user?.full_name || user?.email || 'Unknown User',
      createdAt: enquiryToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    try {
      const targetSn = Number(sn);
      const isEditing = Boolean(enquiryToEdit && enquiryToEdit.id);
      const isSnChanged = !isEditing || (enquiryToEdit?.sn !== targetSn);
      const currentWorkspaceId = activeWorkspace?.id;

      // Check if targetSn is occupied by an existing, non-deleted enquiry
      const occupiedRecord = (isSnChanged && enquiries && enquiries.length > 0 && !isNaN(targetSn) && targetSn > 0)
        ? enquiries.find((e) => {
            if (e.is_deleted) return false;
            if (isEditing && (e.id === enquiryToEdit?.id || (e as any)._id === enquiryToEdit?.id)) return false;
            const eWorkspaceId = e.workspace_id || (e as any).workspaceId;
            const sameWorkspace = eWorkspaceId === currentWorkspaceId || (!eWorkspaceId && activeWorkspace?.is_default);
            if (!sameWorkspace) return false;
            return Number(e.sn) === Number(targetSn);
          })
        : null;

      const isTargetOccupied = Boolean(occupiedRecord);

      // If targetSn is OCCUPIED: do not shift silently. Confirm or require toggle.
      if (isTargetOccupied && !shiftExistingOnCollision) {
        const compLabel = occupiedRecord ? ((occupiedRecord as any).company_name || (occupiedRecord as any).client_company || 'existing enquiry') : 'an existing enquiry';
        const confirmed = window.confirm(
          `S/N #${targetSn} is already assigned to "${compLabel}".\n\nDo you want to shift S/N #${targetSn} and subsequent records down by +1? Click OK to shift existing records down, or Cancel to abort saving so you can choose a different S/N.`
        );
        if (!confirmed) {
          setIsSubmitting(false);
          return;
        }
      }

      // Smart S/N auto-adjustment:
      // If targetSn is UNOCCUPIED (filling an open gap), SKIP the cascade shift entirely (toShift = []).
      // Only shift when targetSn is OCCUPIED and confirmed/toggled.
      const shiftedMap = new Map<string, number>();
      if (isTargetOccupied && isSnChanged && enquiries && enquiries.length > 0 && !isNaN(targetSn) && targetSn > 0) {
        try {
          const toShift = enquiries
            .filter((e) => {
              if (e.is_deleted) return false;
              if (isEditing && (e.id === enquiryToEdit?.id || (e as any)._id === enquiryToEdit?.id)) return false;
              const eWorkspaceId = e.workspace_id || (e as any).workspaceId;
              const sameWorkspace = eWorkspaceId === currentWorkspaceId || (!eWorkspaceId && activeWorkspace?.is_default);
              if (!sameWorkspace) return false;
              return Number(e.sn) >= targetSn;
            })
            .sort((a, b) => (b.sn || 0) - (a.sn || 0)); // Descending order so higher numbers increment first

          if (toShift.length > 0) {
            const chunkSize = 400;
            for (let i = 0; i < toShift.length; i += chunkSize) {
              const chunk = toShift.slice(i, i + chunkSize);
              const batch = writeBatch(db);
              for (const item of chunk) {
                if (item.id) {
                  const newSn = (item.sn || 0) + 1;
                  shiftedMap.set(item.id, newSn);
                  const ref = doc(db, 'enquiries', item.id);
                  batch.update(ref, {
                    sn: newSn,
                    updatedAt: new Date().toISOString()
                  });
                }
              }
              await batch.commit();
            }
          }
        } catch (shiftErr) {
          console.error('Failed to auto-shift existing enquiries S/N:', shiftErr);
        }
      }

      const shiftCount = shiftedMap.size;
      const shiftNotice = shiftCount > 0 ? ` (${shiftCount} subsequent ${shiftCount === 1 ? 'record' : 'records'} shifted by +1)` : '';

      if (enquiryToEdit && enquiryToEdit.id) {
        const updatedDoc: Enquiry = { 
          id: enquiryToEdit.id, 
          ...payload,
          sn: Number(sn),
          attachments: memoryAttachments && memoryAttachments.length > 0 ? memoryAttachments : undefined
        };
        // Log update audit trail
        const changes = getDiffs(enquiryToEdit, updatedDoc);

        if (isClaimingGap) {
          try {
            await updateDoc(doc(db, 'enquiries', enquiryToEdit.id), payload);
          } catch (updateErr) {
            console.warn('Direct updateDoc failed, falling back to safeUpdateDoc:', updateErr);
            await safeUpdateDoc('enquiries', enquiryToEdit.id, payload);
          }
        } else {
          await safeUpdateDoc('enquiries', enquiryToEdit.id, payload);
        }

        // Persist to EnquiryRepository and local cache so onSnapshot and local cache remain in sync
        try {
          await EnquiryRepository.save(updatedDoc, activeWorkspace?.id);
        } catch (repoErr) {
          console.warn('Failed to save updated enquiry to EnquiryRepository:', repoErr);
        }

        // Keep all active Draft quotations for this Enquiry 100% synchronized with Enquiry Form edits
        try {
          const wsId = activeWorkspace?.id || 'ws_default';
          const relatedQuotes = await QuotationRepository.getQuotationsForEnquiry(enquiryToEdit.id, wsId);
          const draftQuotes = relatedQuotes.filter(
            (q) =>
              !q.is_deleted &&
              String(q.status || 'Draft').toLowerCase() === 'draft' &&
              (q.document_type || 'quotation') === 'quotation'
          );
          for (const activeDraftQuote of draftQuotes) {
            if (!activeDraftQuote.id) continue;
            const updatedQuoteLineItems = cleanLineItems.map((li, idx) => {
              const existingQuoteItem =
                (li.id && activeDraftQuote.line_items?.find((qi) => qi.id === li.id)) ||
                activeDraftQuote.line_items?.[idx];
              const qty = Number(li.quantity) || 1;
              const uPrice = Number(li.unit_price) || 0;
              const tPrice =
                li.total_price !== undefined
                  ? QuotationRepository.roundCurrency(Number(li.total_price) || 0)
                  : QuotationRepository.roundCurrency(qty * uPrice);
              const deliveryVal =
                (li.lead_time_note && li.lead_time_note !== 'Ex-Stock / Standard' ? li.lead_time_note : '') ||
                ((li as any).delivery_time && (li as any).delivery_time !== 'Ex-Stock / Standard' ? (li as any).delivery_time : '') ||
                ((li as any).lead_time && (li as any).lead_time !== 'Ex-Stock / Standard' ? (li as any).lead_time : '') ||
                ((li as any).availability && (li as any).availability !== 'Ex-Stock / Standard' ? (li as any).availability : '') ||
                (li.specifications as any)?.['Delivery'] ||
                (li.specifications as any)?.['Lead Time'] ||
                (deliveryPeriod && deliveryPeriod.trim() ? deliveryPeriod.trim() : '') ||
                existingQuoteItem?.availability ||
                li.lead_time_note ||
                'Ex-Stock / Standard';
              return {
                ...(existingQuoteItem || {}),
                id: existingQuoteItem?.id || li.id || `item_${idx}`,
                item_name: li.item_name || existingQuoteItem?.item_name || `Item ${idx + 1}`,
                description: li.description ?? existingQuoteItem?.description ?? '',
                quantity: qty,
                unit: li.unit || existingQuoteItem?.unit || 'pcs',
                unit_price: uPrice,
                cost_price: li.cost_price,
                total_price: tPrice,
                availability: deliveryVal,
                lead_time_note: deliveryVal,
                product_id: li.product_id,
                sku: li.sku,
                brand_make: li.brand_make || existingQuoteItem?.brand_make,
                model_part_no: li.model_part_no || existingQuoteItem?.model_part_no,
                country_of_origin: li.country_of_origin || existingQuoteItem?.country_of_origin,
                hs_code: li.hs_code || existingQuoteItem?.hs_code,
                image_url: li.image_url || existingQuoteItem?.image_url,
                secondary_image_url: li.secondary_image_url || existingQuoteItem?.secondary_image_url,
                image_caption: li.image_caption ?? existingQuoteItem?.image_caption,
                secondary_image_caption: li.secondary_image_caption ?? existingQuoteItem?.secondary_image_caption,
                datasheet_attachment: li.datasheet_attachment || existingQuoteItem?.datasheet_attachment,
                option: li.option || existingQuoteItem?.option,
                option_group: li.option || existingQuoteItem?.option_group,
                option_scope_notes: li.option_scope_notes ?? existingQuoteItem?.option_scope_notes,
                is_composite_set: li.is_composite_set,
                sub_components: li.sub_components,
                package_pricing_mode: li.package_pricing_mode,
                specifications: li.specifications,
                attributes:
                  Array.isArray(li.attributes) && li.attributes.length > 0
                    ? li.attributes
                    : existingQuoteItem?.attributes
              };
            });
            const resolvedTaxMode = taxMode || activeDraftQuote.tax_mode || 'taxes_extra';
            const totals = QuotationRepository.calculateTotals(
              updatedQuoteLineItems as any,
              activeDraftQuote.freight_amount || 0,
              resolvedTaxMode,
              activeDraftQuote.tax_rate_percent ?? 5
            );
            const assignedRep = resolveSalespersonName(updatedDoc);
            await QuotationRepository.updateQuotation(activeDraftQuote.id, {
              line_items: updatedQuoteLineItems as any,
              subject: (subject || '').trim() || activeDraftQuote.subject,
              ...(assignedRep ? { prepared_by: assignedRep } : {}),
              ...(priceBasis.trim() ? { price_basis: priceBasis.trim() } : {}),
              ...(deliveryPeriod.trim() ? { delivery_period: deliveryPeriod.trim() } : {}),
              ...(paymentTerms.trim() ? { payment_terms: paymentTerms.trim() } : {}),
              ...(Number(validityDays) > 0 ? { validity_days: Number(validityDays) } : {}),
              tax_mode: resolvedTaxMode,
              subtotal: totals.subtotal,
              tax_amount: totals.tax_amount,
              grand_total: totals.grand_total,
              updated_at: new Date().toISOString()
            });
          }
        } catch (quoteSyncErr) {
          console.warn('Could not auto-sync draft quotation line items from EnquiryForm:', quoteSyncErr);
        }

        try {
          const cached = localStorage.getItem('omni_enquiries');
          if (cached) {
            const list = JSON.parse(cached);
            const updated = list.map((e: any) => (e.id === enquiryToEdit.id ? updatedDoc : e));
            localStorage.setItem('omni_enquiries', JSON.stringify(updated));
          }
        } catch (_) {}

        await logAudit(enquiryToEdit.id, 'enquiry', 'update', enquiryToEdit, updatedDoc, changes);

        // Instant local state update with shifted S/Ns
        if (setEnquiries) {
          setEnquiries((prev) => {
            const shiftedList = prev.map((e) => {
              if (shiftedMap.has(e.id!)) {
                return { ...e, sn: shiftedMap.get(e.id!)! };
              }
              return e;
            });
            return shiftedList.map((e) => (e.id === enquiryToEdit.id ? updatedDoc : e));
          });
        }

        if (triggerToast) {
          triggerToast(
            isClaimingGap
              ? `Reserved sequence gap #${targetSn} has been successfully claimed and registered.`
              : `Enquiry #${targetSn} has been updated successfully${shiftNotice}.`,
            'success'
          );
        }
        if (submitModeRef.current === 'open_studio' && onSaveAndOpenStudio) {
          onSaveAndOpenStudio(updatedDoc);
        } else {
          onClose();
        }
      } else {
        let finalQuoteRef = (quoteRefNo || '').trim();
        let finalSn = targetSn;

        if (activeWorkspace?.id) {
          try {
            const selectedSp = salespersons.find(
              (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
            );
            const repInitials =
              selectedSp?.initials ||
              (selectedSp?.full_name
                ? selectedSp.full_name.slice(0, 2).toUpperCase()
                : salesPerson
                ? salesPerson.trim().slice(0, 3).toUpperCase()
                : '');
            const parts = (enquiryDate || new Date().toISOString().split('T')[0]).split('-');
            const formDate = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) : new Date();

            const claimed = await claimNextEnquirySequence(
              activeWorkspace.id,
              repInitials,
              user?.uid || 'system',
              formDate,
              {
                targetSn: targetSn > 0 ? targetSn : undefined,
                customQuoteRef: isQuoteRefCustom ? (quoteRefNo || '').trim() : undefined,
                companyAccount: resolvedCompanyName || '',
                companyCode: selectedCompany?.company_code || '',
                country: country || selectedCompany?.country || 'UAE',
                countryCode: selectedCompany?.country_code || '',
                enquiries
              }
            );

            if (!isQuoteRefCustom && claimed.quoteRef) {
              finalQuoteRef = claimed.quoteRef;
            } else if (finalQuoteRef && selectedCompany?.company_code && finalQuoteRef.includes('[COMPANY_CODE]')) {
              finalQuoteRef = finalQuoteRef.replace(/\[COMPANY_CODE\]/g, sanitizeCompanyCode(selectedCompany.company_code));
            }
            if (claimed.sn) {
              finalSn = claimed.sn;
            }
          } catch (seqErr) {
            console.warn('Atomic sequence claim failed, syncing high-water mark:', seqErr);
            syncSequenceHighWaterMark(
              activeWorkspace.id,
              targetSn,
              user?.uid || 'system',
              finalQuoteRef,
              enquiryDate ? new Date(enquiryDate) : new Date()
            ).catch(console.error);
          }
        }

        const finalPayload = {
          ...payload,
          sn: finalSn,
          quote_ref_no: finalQuoteRef
        };

        const res = await safeAddDoc('enquiries', finalPayload);
        const newId = res?.id || ('enq_' + Date.now());
        const newDoc: Enquiry = { 
          id: newId, 
          ...finalPayload,
          attachments: memoryAttachments && memoryAttachments.length > 0 ? memoryAttachments : undefined
        };

        try {
          await EnquiryRepository.save(newDoc, activeWorkspace?.id);
        } catch (repoErr) {
          console.warn('Failed to save new enquiry to EnquiryRepository:', repoErr);
        }

        await logAudit(newId, 'enquiry', 'create', null, finalPayload, []);

        // Instant local state update with shifted S/Ns
        if (setEnquiries) {
          setEnquiries((prev) => {
            const shiftedList = prev.map((e) => {
              if (shiftedMap.has(e.id!)) {
                return { ...e, sn: shiftedMap.get(e.id!)! };
              }
              return e;
            });
            return [newDoc, ...shiftedList.filter((e) => e.id !== newId)];
          });
        }

        if (triggerToast) {
          triggerToast(`Enquiry #${finalSn} registered successfully${shiftNotice}.`, 'success');
        }
        if (submitModeRef.current === 'another') {
          resetForm(Number(finalSn) + 1);
        } else if (submitModeRef.current === 'open_studio' && onSaveAndOpenStudio) {
          onSaveAndOpenStudio(newDoc);
        } else {
          onClose();
        }
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast('Submit failed: ' + err.message, 'error');
      } else {
        alert('Submit failed: ' + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDiffs = (b: any, a: any) => {
    const IGNORED_DIFF_KEYS = new Set([
      'id',
      '_id',
      'updatedAt',
      'updated_at',
      'createdAt',
      'created_at',
      'version',
      'sync_status',
      'workspace_id',
      'workspaceId',
      'last_modified_by_uid',
      'last_modified_by_name',
      'updatedByUid',
      'updatedByUsername',
      'created_by_uid',
      'created_by_name',
      'statusUpdatedAt',
      'statusUpdatedBy',
      'statusHistory'
    ]);
    const isEmptyVal = (v: any) =>
      v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

    const diffs: any[] = [];
    Object.keys({ ...b, ...a }).forEach((k) => {
      if (IGNORED_DIFF_KEYS.has(k)) return;
      if (isEmptyVal(b[k]) && isEmptyVal(a[k])) return;
      if (JSON.stringify(b[k]) !== JSON.stringify(a[k])) {
        diffs.push({
          field: k,
          old_value: b[k] === undefined ? null : b[k],
          new_value: a[k] === undefined ? null : a[k]
        });
      }
    });
    return diffs;
  };

  const logAudit = async (docId: string, type: 'company' | 'contact' | 'enquiry', action: 'create' | 'update' | 'delete', before: any, after: any, changes: any[]) => {
    try {
      const sanitizedChanges = sanitizeAuditPayload(changes || []);
      // Skip writing empty no-op 'update' audit entries when no user-facing property changed
      if (action === 'update' && (!Array.isArray(sanitizedChanges) || sanitizedChanges.length === 0)) {
        return;
      }
      const log = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        document_id: docId,
        entity_type: type,
        action,
        details: action === 'create' ? 'Initial enquiry record created' : undefined,
        changed_by_uid: user.uid,
        changed_by_name: user.username,
        timestamp: new Date().toISOString(),
        before: sanitizeAuditPayload(before || {}),
        after: sanitizeAuditPayload(after || {}),
        changes: sanitizedChanges
      };
      await safeAddDoc('audit_logs', log);
      if (setAuditLogs) {
        setAuditLogs((prev) => [log, ...prev]);
      }
    } catch (err) {
      console.error('Audit logger failed:', err);
    }
  };

  // Searching for existing companies in list
  const matchingCompanies = companies.filter((c) =>
    c.display_name.toLowerCase().includes(companySearch.toLowerCase()) ||
    c.aliases.some((a) => a.toLowerCase().includes(companySearch.toLowerCase()))
  );

  const isPreviewActive = (!!activePreviewUrl || !!pastedSourceText) && !previewMinimized;

  return (
    <div 
      id="enquiry-form-drawer" 
      className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (isExtracting || uploading || isSubmitting) {
            return;
          }
          const hasDirtyContent =
            Boolean(companySearch.trim()) ||
            Boolean(subject.trim()) ||
            Boolean(remarks.trim()) ||
            attachments.length > 0 ||
            lineItems.some((li) => Boolean(li.item_name?.trim()) || (Number(li.unit_price) || 0) > 0);
          if (hasDirtyContent && !isReadOnly) {
            return;
          }
          onClose();
        }
      }}
    >
      <div 
        className={`fixed inset-y-0 right-0 w-full ${
          isPreviewActive ? 'max-w-[96vw] xl:max-w-[1440px]' : 'max-w-5xl'
        } z-50 bg-white shadow-2xl flex flex-col md:flex-row transform-gpu transition-transform duration-200 ease-out border-l border-slate-200 overflow-hidden`}
      >
        
        {/* Left Panel: File Preview or Smart Paste Text Preview (visible when isPreviewActive is true) */}
        {isPreviewActive && (
          <div className="w-full md:w-[42%] xl:w-[44%] border-b md:border-b-0 md:border-r border-slate-200 h-[45vh] md:h-full flex flex-col bg-slate-50 shrink-0 font-sans overflow-hidden">
            {/* Case 1: Document File Preview (PDF or Image) */}
            {activePreviewUrl && (
              <>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
                  <div className="flex items-center space-x-2 truncate">
                    <Eye className="w-5 h-5 text-blue-600 shrink-0" />
                    <span className="font-bold text-slate-800 text-xs sm:text-sm truncate max-w-[180px] md:max-w-[280px]" title={previewFileName}>
                      {previewFileName}
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <a 
                      href={getSafeBlobUrl(activePreviewUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] font-sans rounded-lg transition border border-slate-200"
                      title="Open file in a new tab (bypasses browser iframe/adblock restrictions)"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                      <span className="hidden sm:inline">Open in New Tab</span>
                    </a>
                    <button 
                      type="button"
                      onClick={() => setPreviewMinimized(true)}
                      className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition font-sans text-xs flex items-center gap-1 border border-slate-200"
                      title="Minimize preview & expand Register New Enquiry form to maximum width"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                      <span className="hidden sm:inline font-semibold">Minimize</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => setActivePreviewUrl(null)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                      title="Hide Preview Panel"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-auto min-h-0 relative bg-slate-50/50">
                  {mediaType === 'image' ? (
                    <img 
                      src={getSafeBlobUrl(activePreviewUrl)} 
                      alt="Source document preview" 
                      className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-slate-200 bg-white"
                      referrerPolicy="no-referrer"
                    />
                  ) : mediaType === 'pdf' ? (
                    <div className="w-full h-full flex flex-col min-h-0">
                      <PdfViewer pdfUrl={getSafeBlobUrl(activePreviewUrl)} />
                    </div>
                  ) : (
                    <div className="text-center p-8 bg-white rounded-2xl border border-slate-150 shadow-sm max-w-md">
                      <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-800 font-sans">Preview not supported in-app</p>
                      <p className="text-xs text-slate-500 mt-1 mb-4 leading-relaxed font-sans">
                        This file format ({previewFileType}) cannot be rendered inside the applet. Click below to view/download it directly.
                      </p>
                      <a 
                        href={getSafeBlobUrl(activePreviewUrl)} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition shadow-sm"
                      >
                        <span>Open in New Tab</span>
                      </a>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Case 2: Smart Paste Raw Text Source & Field Mapping Preview */}
            {!activePreviewUrl && pastedSourceText && (
              <>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0 shadow-2xs">
                  <div className="flex items-center space-x-2 truncate">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <h4 className="font-bold text-slate-800 text-xs sm:text-sm font-sans flex items-center gap-1.5">
                        <span>Smart Paste Source & Mapping</span>
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono rounded-full font-bold">
                          AI Mapped
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-500 font-sans">
                        Interactive autofill preview — click chips below to highlight form fields
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setPreviewMinimized(true)}
                      className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-lg transition font-sans text-xs flex items-center gap-1 border border-slate-200"
                      title="Minimize preview & expand Register New Enquiry form to full width"
                    >
                      <Minimize2 className="w-3.5 h-3.5 text-slate-600" />
                      <span className="hidden sm:inline font-semibold">Minimize</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPastedSourceText(null);
                        setPastedExtractedData(null);
                      }}
                      className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition"
                      title="Close Smart Paste preview"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Extracted Tokens Card (synthesized from live form + Smart Paste tokens so it is never blank on reload) */}
                  {(() => {
                    const hasAnyTokens = Boolean(
                      effectiveExtractedTokens.quote_ref_no ||
                        effectiveExtractedTokens.company_name ||
                        effectiveExtractedTokens.contact_name ||
                        effectiveExtractedTokens.salesperson ||
                        effectiveExtractedTokens.subject ||
                        effectiveExtractedTokens.received_date ||
                        effectiveExtractedTokens.project_location ||
                        effectiveExtractedTokens.price_basis ||
                        effectiveExtractedTokens.delivery_period ||
                        effectiveExtractedTokens.payment_terms ||
                        effectiveExtractedTokens.validity_days ||
                        effectiveExtractedTokens.tax_mode ||
                        effectiveExtractedTokens.package_value > 0 ||
                        effectiveExtractedTokens.line_items.length > 0 ||
                        unregisteredEntities ||
                        customProjectDetails.some((d) => d.value.trim() !== '')
                    );
                    if (!hasAnyTokens) return null;

                    const taxModeLabel =
                      effectiveExtractedTokens.tax_mode === 'tax_calculated'
                        ? 'VAT Included'
                        : effectiveExtractedTokens.tax_mode === 'tax_exempt'
                        ? '0% Zero-Rated'
                        : effectiveExtractedTokens.tax_mode === 'vat_hidden'
                        ? 'No VAT Shown'
                        : '5% VAT Extra';

                    return (
                      <div className="bg-white border border-emerald-200/80 rounded-2xl p-4 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                          <span className="text-xs font-bold text-slate-800 font-sans flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-600" />
                            <span>AI Extracted Field Tokens</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Hover/Click to Highlight Field
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {effectiveExtractedTokens.quote_ref_no && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('quote_ref_no')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('quote_ref_no')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'quote_ref_no' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Quote Ref field"
                            >
                              <Tag className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Quote Ref: <strong className="font-mono">{effectiveExtractedTokens.quote_ref_no}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.company_name && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('company')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField(unregisteredEntities ? 'unregistered_entities' : 'company')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'company' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Company account field"
                            >
                              <Building className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Company: <strong>{effectiveExtractedTokens.company_name}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.contact_name && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('contact')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField(unregisteredEntities ? 'unregistered_entities' : 'contact')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'contact' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Contact field"
                            >
                              <User className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Contact: <strong>{effectiveExtractedTokens.contact_name}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.salesperson && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('salesperson')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('salesperson')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'salesperson' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Salesperson field"
                            >
                              <User className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Salesperson: <strong>{effectiveExtractedTokens.salesperson}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.subject && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('subject')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('subject')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer max-w-full ${highlightedField === 'subject' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Subject field"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span className="truncate">Subject: <strong>{effectiveExtractedTokens.subject}</strong></span>
                            </button>
                          )}

                          {unregisteredEntities && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('unregistered_entities')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => {
                                setShowConfirmRegistrationModal(true);
                                scrollToField('unregistered_entities');
                              }}
                              className="px-2.5 py-1.5 rounded-xl text-left border border-amber-300 bg-amber-100 hover:bg-amber-200 text-amber-950 transition flex items-center space-x-1.5 cursor-pointer font-semibold animate-pulse"
                              title="Click to open Entity Registration & Mapping Modal"
                            >
                              <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-700" />
                              <span>New Entity Registration Action Required</span>
                            </button>
                          )}

                          {effectiveExtractedTokens.received_date && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('received_date')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('received_date')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'received_date' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Date field"
                            >
                              <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Date: <strong className="font-mono">{effectiveExtractedTokens.received_date}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.project_location && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('location')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('location')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'location' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Location field"
                            >
                              <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Location: <strong>{effectiveExtractedTokens.project_location}</strong></span>
                            </button>
                          )}

                          {customProjectDetails.some(d => d.value.trim() !== '') && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('custom_project_details')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('custom_project_details')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'custom_project_details' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Custom Project Details field"
                            >
                              <Sliders className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Custom Project Specs: <strong>{customProjectDetails.filter(d => d.value.trim() !== '').length} Specs</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.package_value > 0 && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('value')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('value')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'value' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to scroll & glow Package Value field"
                            >
                              <DollarSign className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Value: <strong className="font-mono">{formCurrency} {Number(effectiveExtractedTokens.package_value || 0).toLocaleString()}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.price_basis && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('price_basis')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('price_basis')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'price_basis' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to jump to Chapter 3 & glow Price Basis / Incoterms"
                            >
                              <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Price Basis: <strong>{effectiveExtractedTokens.price_basis}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.delivery_period && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('delivery_period')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('delivery_period')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'delivery_period' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to jump to Chapter 3 & glow Delivery Period"
                            >
                              <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Delivery: <strong>{effectiveExtractedTokens.delivery_period}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.payment_terms && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('payment_terms')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('payment_terms')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer max-w-full ${highlightedField === 'payment_terms' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to jump to Chapter 3 & glow Payment Terms"
                            >
                              <FileCheck className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span className="truncate">Payment: <strong>{effectiveExtractedTokens.payment_terms}</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.validity_days > 0 && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('validity_days')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('validity_days')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'validity_days' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to jump to Chapter 3 & glow Offer Validity"
                            >
                              <Calendar className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>Validity: <strong className="font-mono">{effectiveExtractedTokens.validity_days} Days</strong></span>
                            </button>
                          )}

                          {effectiveExtractedTokens.tax_mode && (
                            <button
                              type="button"
                              onMouseEnter={() => setHighlightedField('tax_mode')}
                              onMouseLeave={() => setHighlightedField(null)}
                              onClick={() => scrollToField('tax_mode')}
                              className={`px-2.5 py-1.5 rounded-xl text-left border transition flex items-center space-x-1.5 cursor-pointer ${highlightedField === 'tax_mode' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                              title="Click to jump to Chapter 3 & glow VAT / Tax Mode"
                            >
                              <Tag className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                              <span>VAT Mode: <strong>{taxModeLabel}</strong></span>
                            </button>
                          )}

                          {/* Multi-Level Hierarchical Token Expander for Line Items */}
                          {Array.isArray(effectiveExtractedTokens.line_items) && effectiveExtractedTokens.line_items.length > 0 && (
                            <div className="w-full space-y-2 border-t border-slate-100 pt-2">
                              <button
                                type="button"
                                onMouseEnter={() => setHighlightedField('line_items')}
                                onMouseLeave={() => setHighlightedField(null)}
                                onClick={() => {
                                  setExpandedLineItemsToken(!expandedLineItemsToken);
                                  scrollToField('line_items');
                                }}
                                onDoubleClick={() => setExpandedLineItemsToken(!expandedLineItemsToken)}
                                className={`w-full px-2.5 py-1.5 rounded-xl text-left border transition flex items-center justify-between cursor-pointer ${highlightedField === 'line_items' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold' : 'bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 border-emerald-200'}`}
                                title="Click or double-click to toggle items tree expansion"
                              >
                                <div className="flex items-center space-x-1.5">
                                  <Layers className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                  <span>Line Items: <strong className="font-mono">{effectiveExtractedTokens.line_items.length} Items Parsed</strong></span>
                                </div>
                                <div className="flex items-center space-x-1 text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                                  <span>{expandedLineItemsToken ? 'Collapse' : 'Expand Tree'}</span>
                                  <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expandedLineItemsToken ? 'rotate-180' : ''}`} />
                                </div>
                              </button>

                              {/* Level 1 & Level 2 Tree */}
                              {expandedLineItemsToken && (
                                <div className="pl-3 border-l-2 border-emerald-300 space-y-2 py-1">
                                  {effectiveExtractedTokens.line_items.map((item: any, idx: number) => {
                                    const isItemExpanded = expandedItemIndices.includes(idx);
                                    const attrs: ProductAttribute[] = Array.isArray(item.attributes) ? item.attributes : [];
                                    const itemPrice = Number(item.total_price || item.unit_price || item.unit_price_aed || 0);

                                    return (
                                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2 text-xs">
                                        <div 
                                          className="flex items-center justify-between cursor-pointer hover:bg-emerald-50/60 p-1 rounded-lg transition"
                                          onClick={() => scrollToField(`line_item_${idx}`)}
                                          onDoubleClick={() => {
                                            setExpandedItemIndices(prev =>
                                              prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                            );
                                          }}
                                          onMouseEnter={() => setHighlightedField(`line_item_${idx}`)}
                                          onMouseLeave={() => setHighlightedField(null)}
                                        >
                                          <div className="flex items-center space-x-2 truncate">
                                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-900 font-mono font-bold text-[10px] rounded-md">
                                              #{idx + 1}
                                            </span>
                                            <span className="font-bold text-slate-800 truncate">
                                              {item.item_name || item.product_type || 'Item'}: {item.description || 'No description'}
                                            </span>
                                          </div>
                                          <div className="flex items-center space-x-2 shrink-0">
                                            <span className="font-mono text-emerald-700 font-bold text-[11px]">
                                              {itemPrice > 0 ? `${formCurrency} ${itemPrice.toLocaleString()}` : (item.quantity ? `Qty: ${item.quantity}` : 'Parsed')}
                                            </span>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedItemIndices(prev =>
                                                  prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
                                                );
                                              }}
                                              className="p-1 text-slate-400 hover:text-slate-700 rounded-md"
                                              title="Toggle attributes details"
                                            >
                                              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isItemExpanded ? 'rotate-90' : ''}`} />
                                            </button>
                                          </div>
                                        </div>

                                        {/* Level 2 Attributes Tree */}
                                        {isItemExpanded && (
                                          <div className="pl-4 pt-1 border-t border-slate-200/60 space-y-1.5 text-[11px]">
                                            <span className="text-[10px] font-mono uppercase text-slate-400 font-bold block">
                                              Technical Attributes ({attrs.length}):
                                            </span>
                                            <div className="flex flex-wrap gap-1.5">
                                              {attrs.length > 0 ? (
                                                attrs.map((attr, aIdx) => (
                                                  <span key={aIdx} className="bg-white border border-slate-200 px-2 py-0.5 rounded-md text-slate-700 font-sans shadow-2xs">
                                                    <strong className="text-slate-900 font-semibold">{attr.key}:</strong> {attr.value || 'N/A'}
                                                  </span>
                                                ))
                                              ) : (
                                                <span className="text-slate-400 italic">No custom attributes extracted.</span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Price Discrepancy & Valuation Accuracy Validation Ping */}
                  {lineItems.length === 0 ? (
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 shadow-2xs flex items-center justify-between text-slate-500 font-sans text-xs">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-slate-400" />
                        <span>Awaiting Line Items - Package Value: <strong className="text-slate-700">AED {Number(manualValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                      </div>
                    </div>
                  ) : priceDiscrepancyAmount > 1.0 && (
                    <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between text-rose-900 font-bold text-xs">
                        <span className="flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
                          <span>Price Discrepancy Alert</span>
                        </span>
                        <span className="font-mono text-[10px] bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold">
                          Diff: AED {Number(priceDiscrepancyAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-xs text-rose-700 leading-relaxed font-sans">
                        Package Value (AED {Number(manualValue || 0).toLocaleString()}) does not match calculated Line Items Sum (AED {Number(computedValue || 0).toLocaleString()}).
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setManualValue(computedValue);
                            setIsLumpSum(true);
                            if (triggerToast) triggerToast('Package Value synced to Line Items sum!', 'success');
                          }}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-2xs"
                        >
                          Sync Package Total to AED {Number(computedValue || 0).toLocaleString()}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (lineItems.length > 0 && manualValue > 0) {
                              const share = Number((manualValue / lineItems.length).toFixed(2));
                              setLineItems(lineItems.map(it => ({
                                ...it,
                                unit_price: it.quantity > 0 ? Number((share / it.quantity).toFixed(2)) : share,
                                total_price: share
                              })));
                              if (triggerToast) triggerToast('Package Total distributed across line items!', 'info');
                            }
                          }}
                          className="px-3 py-1.5 bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 font-semibold rounded-xl text-xs transition"
                        >
                          Distribute Evenly
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Raw Source Text Display */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-mono uppercase text-slate-400 font-semibold">
                        Original Copy-Pasted Excel / Text
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (pastedSourceText) {
                            try {
                              navigator.clipboard.writeText(pastedSourceText);
                              if (triggerToast) triggerToast('Copied source text to clipboard!', 'info');
                            } catch (e) {
                              if (triggerToast) triggerToast('Unable to write to clipboard in this frame', 'error');
                            }
                          }
                        }}
                        className="text-[11px] font-sans font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy Source Text</span>
                      </button>
                    </div>

                    <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[350px]">
                      {renderSourceTextWithHighlight(pastedSourceText, highlightedField, effectiveExtractedTokens)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right Panel: The actual Form */}
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-slate-900 overflow-hidden">
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
            {/* Sticky Header */}
            <div className="px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs flex items-center justify-between shrink-0 z-10 shadow-xs">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-200/60 dark:border-blue-700/60 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white font-sans flex items-center gap-1.5">
                      <span>{enquiryToEdit ? (isClaimingGap ? `Claim Reserved Gap #${enquiryToEdit.sn}` : `Edit Enquiry #${enquiryToEdit.sn}`) : 'Register New Enquiry'}</span>
                    </h3>
                    {quoteRefNo && (
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 max-w-[260px] truncate" title={quoteRefNo}>
                        {quoteRefNo}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      status === 'Active' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400' :
                      status === 'Order Received' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-400' :
                      status === 'Gap / Reserved' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-400 border border-dashed border-amber-400/60' :
                      'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                    {isClaimingGap
                      ? 'Populate details and convert this reserved sequence gap into an active proposal'
                      : (enquiryToEdit ? 'Modify proposal specifications, line items, and pricing' : 'Create a new commercial enquiry record with multi-product breakdown')}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {!enquiryToEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Clear and reset all form inputs to default?')) {
                        resetForm(sn);
                        if (triggerToast) triggerToast('Form reset to defaults', 'info');
                      }
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors border border-slate-200/80 dark:border-slate-700 cursor-pointer"
                    title="Reset form fields to blank"
                  >
                    Clear / Reset
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Close drawer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Minimized Source Preview Banner */}
            {((!!activePreviewUrl || !!pastedSourceText) && previewMinimized) && (
              <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-emerald-50 dark:from-slate-800 dark:to-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-2.5 flex items-center justify-between text-xs font-sans shrink-0 animate-in fade-in duration-150">
                <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200">
                  <Sparkles className="w-4 h-4 text-emerald-600 animate-pulse" />
                  <span className="font-bold text-slate-800 dark:text-white">
                    {activePreviewUrl ? 'Document Preview Minimized' : 'Smart Paste Source Preview Minimized'}
                  </span>
                  <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">
                    (Form expanded to maximum wide view)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewMinimized(false)}
                  className="px-3 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-blue-700 dark:text-blue-300 font-bold rounded-xl shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Expand Split-Screen Preview</span>
                </button>
              </div>
            )}

            {/* Read-Only Warning Banner */}
            {isReadOnly && (
              <div className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-800 px-6 py-2.5 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200 shrink-0 animate-in fade-in duration-150">
                <div className="flex items-center space-x-2 font-medium">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Read-Only View: You do not have permission to modify this enquiry. All fields are locked.</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-amber-200/60 dark:bg-amber-800 text-[10px] font-bold uppercase tracking-wider">
                  Read Only
                </span>
              </div>
            )}

            {/* Sticky Quick-Jump Section Bar (Unified Navigation + Smart RFQ Actions) */}
            <div className="px-6 py-2 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 overflow-x-auto shrink-0 z-10">
              <div className="flex items-center gap-1.5">
                {(() => {
                  const hasCommercialOrRemarks = Boolean(
                    (priceBasis && priceBasis.trim()) ||
                      (deliveryPeriod && deliveryPeriod.trim()) ||
                      (paymentTerms && paymentTerms.trim()) ||
                      (remarks && remarks.trim()) ||
                      (invoicePoNo && invoicePoNo.trim()) ||
                      (paymentStatus && paymentStatus.trim())
                  );
                  const tab3Suffix =
                    attachments.length > 0
                      ? ` (${attachments.length} ${attachments.length === 1 ? 'File' : 'Files'}${hasCommercialOrRemarks ? ' ✓' : ''})`
                      : hasCommercialOrRemarks
                      ? ' ✓'
                      : '';
                  return (
                    [
                      { label: '1. Client & Details', target: 'company' },
                      { label: `2. Line Items (${lineItems.length})`, target: 'line_items' },
                      { label: `3. Summary, Terms & Files${tab3Suffix}`, target: 'value' }
                    ] as const
                  ).map((sec) => {
                    const isActive = activeFormSection === sec.target;
                    return (
                      <button
                        key={sec.target}
                        type="button"
                        onClick={() => scrollToField(sec.target)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold font-sans border transition whitespace-nowrap cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs ring-2 ring-blue-500/20'
                            : 'bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        {sec.label}
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {isExtracting && (
                  <button
                    type="button"
                    onClick={handleStopExtraction}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold font-sans bg-rose-600 hover:bg-rose-500 text-white border border-rose-700 flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 shadow-xs animate-pulse"
                    title="Immediately stop AI Autofill and keep source files attached"
                  >
                    <X className="w-3.5 h-3.5 shrink-0" />
                    <span>Stop Autofill ({extractionElapsedSec}s)</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAutoDetectClipboard}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold font-sans bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 shadow-2xs"
                  title="Read clipboard text & auto-detect company, contact, or RFQ lines"
                >
                  <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Paste RFQ</span>
                </button>
                <button
                  type="button"
                  onClick={() => scrollToField('source_files')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold font-sans bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer shrink-0 shadow-2xs"
                  title="Jump to Source PDF / Excel AI Autofill & Attached Files"
                >
                  <Paperclip className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Files / AI ({attachments.length})</span>
                </button>
              </div>
            </div>

            {/* Scrollable Form body */}
            <fieldset
              disabled={isReadOnly}
              onScroll={handleFormScroll}
              className="flex-1 overflow-x-hidden overflow-y-auto p-5 pb-24 space-y-4 bg-slate-50/80 dark:bg-slate-950/70 border-0 m-0 min-w-0"
            >
            {/* Chapter 1: Core Client, Contact & Project Subject (80/20 Primary Surface) */}
            <div
              id="field-company"
              className={`scroll-mt-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-2xs transition-all duration-300 ${getHighlightClasses('company')}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200/60 dark:border-blue-800/60">
                    1
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
                      Client, Contact &amp; Subject
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      Pair company, select contact manager, and enter proposal subject
                    </p>
                  </div>
                </div>
              </div>

              {/* Compact Auto-Metadata Summary Strip Inside Chapter 1 */}
              {(() => {
                const matchedSp = sortedSalespersons.find(
                  (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
                );
                const spDisplay = matchedSp?.full_name || salesPerson || 'Assigned Rep';
                const needsTokenAttention = Boolean(
                  quoteRefNo?.includes('[COMPANY_CODE]') || quoteRefNo?.includes('[COUNTRY]')
                );
                const metaHasWarning = Boolean(isTargetSnOccupied || needsTokenAttention);
                const metaWarningText = isTargetSnOccupied
                  ? `S/N #${sn} is already occupied — click to resolve sequence collision`
                  : needsTokenAttention
                  ? `Quote Ref contains unresolved token (${quoteRefNo}) — select Company or set Company Code`
                  : undefined;

                const isDetailsExpanded =
                  disclosure.isMetadataExpanded ||
                  disclosure.expandedSections.locationScope ||
                  isTargetSnOccupied ||
                  isClaimingGap ||
                  needsTokenAttention;

                return (
                  <EnquiryMetadataSummaryBar
                    sn={sn}
                    quoteRefNo={quoteRefNo}
                    enquiryDate={enquiryDate}
                    salesPersonDisplay={spDisplay}
                    enquirySource={enquirySource}
                    formCurrency={formCurrency}
                    status={status}
                    country={country}
                    projectLocation={projectLocation}
                    customerReferenceCode={customerReferenceCode}
                    isExpanded={isDetailsExpanded}
                    onToggleExpand={() => {
                      const next = !isDetailsExpanded;
                      disclosure.setIsMetadataExpanded(next);
                      disclosure.setSectionExpanded('locationScope', next);
                    }}
                    hasWarning={metaHasWarning}
                    warningText={metaWarningText}
                  />
                );
              })()}

              {/* Subsection 1A: Account & Contact Pairing (Primary Task First) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative">
                {/* Company search */}
                <div className="relative min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[28px]">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                        Search &amp; Pair Company
                      </span>
                      {renderConfidenceBadge('company_name')}
                    </div>

                    {/* Explicit Inline Company Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {companyId && (
                        <button
                          type="button"
                          onClick={() => {
                            setCompanyMenuOpen(false);
                            const comp = companies.find((c) => c.id === companyId);
                            if (comp) {
                              let baseName = comp.display_name;
                              if (comp.legal_suffix && comp.legal_suffix !== 'None / Other') {
                                if (comp.display_name.endsWith(comp.legal_suffix)) {
                                  baseName = comp.display_name.slice(0, -comp.legal_suffix.length).trim();
                                }
                              }
                              setSubCompanyName(baseName);
                              setSubLegalSuffix(comp.legal_suffix || 'None / To Be Added Later');
                              setSubCompanyCode(comp.company_code || '');
                              setSubCountryCode(comp.country_code || '');
                              setSubCity(comp.city);
                              setSubCountry(comp.country);
                              setSubGeneralPhone(comp.general_phone || '');
                              setSubGeneralEmail(comp.general_email || '');
                              setSubNotes(comp.notes || '');
                              setIsEditingCompany(true);
                              setNewCompanyModal(true);
                            }
                          }}
                          className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                          title="Edit selected Company"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>Edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setCompanyMenuOpen(false);
                          setSubCompanyName(companySearch);
                          setSubLegalSuffix('None / To Be Added Later');
                          setSubCompanyCode('');
                          setSubCountryCode('');
                          setSubCity('');
                          setSubCountry('UAE');
                          setSubGeneralPhone('');
                          setSubGeneralEmail('');
                          setSubNotes('');
                          setIsEditingCompany(false);
                          setNewCompanyModal(true);
                        }}
                        className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 transition cursor-pointer whitespace-nowrap"
                        title="Register a new Company"
                      >
                        <Plus className="w-2.5 h-2.5" />
                        <span>New</span>
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2 items-center min-w-0">
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        required={status !== 'Gap / Reserved'}
                        placeholder={status === 'Gap / Reserved' ? '[Reserved Sequence / Missing File]' : BRAND_CONFIG.placeholderSearchText}
                        value={companySearch ?? ''}
                        onChange={(e) => {
                          setCompanySearch(e.target.value);
                          if (companyId) setCompanyId('');
                          setShowCompanyList(true);
                        }}
                        onFocus={() => setShowCompanyList(true)}
                        className={`w-full min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 pl-3 pr-14 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-all ${getHighlightClasses('company')}`}
                      />
                      {companyId && (() => {
                        const selComp = companies.find((c) => c.id === companyId);
                        return selComp?.company_code ? (
                          <span className="absolute right-2.5 top-2 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-bold text-[10px] pointer-events-none">
                            {selComp.company_code}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {companySearch.trim().length > 0 && !companyId && (
                      <button
                        type="button"
                        disabled={isCreatingCompanyInline}
                        onClick={() => handleCreateCompanyInline(companySearch)}
                        className="px-2.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 shadow-2xs transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        title="Save typed company name directly to Companies Registry"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    )}
                  </div>

                  {showCompanyList && companySearch.trim().length > 0 && (
                    <div className="absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl mt-1.5 max-h-52 overflow-y-auto z-50 shadow-2xl divide-y divide-slate-100 dark:divide-slate-800">
                      {matchingCompanies.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            setCompanyId(c.id!);
                            setCompanySearch(c.display_name);
                            setCountry(c.country);
                            setProjectLocation(c.city);
                            setShowCompanyList(false);
                            const prim = contacts.find((ct) => ct.company_id === c.id && ct.is_primary);
                            if (prim) {
                              setContactId(prim.id!);
                            } else {
                              setContactId('');
                            }
                          }}
                          className="w-full p-3 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs font-sans text-slate-700 dark:text-slate-200 flex items-center justify-between cursor-pointer transition"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-100 truncate">{c.display_name}</span>
                            {c.company_code && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-bold text-[10px] shrink-0">
                                {c.company_code}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0 ml-2">{c.city}, {c.country}</span>
                        </button>
                      ))}
                      {matchingCompanies.length === 0 ? (
                        <button
                          type="button"
                          disabled={isCreatingCompanyInline}
                          onClick={() => handleCreateCompanyInline(companySearch)}
                          className="w-full p-3.5 bg-blue-50/90 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-left text-xs font-semibold flex items-center space-x-2.5 transition cursor-pointer disabled:opacity-50"
                        >
                          {isCreatingCompanyInline ? (
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin shrink-0" />
                          ) : (
                            <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                          )}
                          <span className="truncate">
                            Create New Company: <strong className="underline underline-offset-2">"{companySearch.trim()}"</strong>
                          </span>
                        </button>
                      ) : (
                        !matchingCompanies.some((c) => c.display_name.toLowerCase() === companySearch.trim().toLowerCase()) && (
                          <button
                            type="button"
                            disabled={isCreatingCompanyInline}
                            onClick={() => handleCreateCompanyInline(companySearch)}
                            className="w-full p-2.5 bg-slate-50 hover:bg-blue-50/80 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-600 hover:text-blue-700 dark:text-slate-400 dark:hover:text-blue-300 text-left text-[11px] font-medium flex items-center space-x-2 transition cursor-pointer border-t border-slate-100 dark:border-slate-800"
                          >
                            <Plus className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <span className="truncate">
                              Create New Company: <strong>"{companySearch.trim()}"</strong>
                            </span>
                          </button>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* Contact lookup */}
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1.5 min-h-[28px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                        Account Contact Personnel
                      </span>
                      {renderConfidenceBadge('contact_name')}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {companyId && contactId && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowContactMenu(false);
                            const ct = contacts.find((c) => c.id === contactId);
                            if (ct) {
                              setSubContactName(ct.full_name);
                              setSubContactDesignation(ct.designation || '');
                              setSubContactMobile(ct.mobile || '');
                              setSubContactEmail(ct.email || '');
                              setSubContactIsPrimary(ct.is_primary || false);
                              setIsEditingContact(true);
                              setShowNewContactModal(true);
                            }
                          }}
                          className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition cursor-pointer whitespace-nowrap"
                          title="Edit selected contact"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>Edit</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowContactMenu(false);
                          if (!companyId) {
                            if (triggerToast) {
                              triggerToast('Please search or select a Company first before adding a contact person.', 'info');
                            } else {
                              alert('Please search or select a Company first before adding a contact person.');
                            }
                            return;
                          }
                          setSubContactName('');
                          setSubContactDesignation('');
                          setSubContactMobile('');
                          setSubContactEmail('');
                          setSubContactIsPrimary(false);
                          setIsEditingContact(false);
                          setShowNewContactModal(true);
                        }}
                        className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 shrink-0 transition cursor-pointer whitespace-nowrap"
                        title="Add a new contact person for this account"
                      >
                        <UserPlus className="w-2.5 h-2.5" />
                        <span>New</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <select
                      value={contactId ?? ''}
                      onChange={(e) => setContactId(e.target.value)}
                      disabled={!companyId}
                      className={`w-full min-w-0 truncate bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:outline-none disabled:opacity-50 font-sans transition-all ${getHighlightClasses('contact')}`}
                    >
                      <option value="" className="text-slate-500">-- Choose Contact Manager --</option>
                      {companyContacts.map((ct) => (
                        <option key={ct.id} value={ct.id}>
                          {ct.full_name} {ct.designation ? `(${ct.designation})` : ''}
                        </option>
                      ))}
                    </select>
                    {companyId && !contactId && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <input
                          type="text"
                          placeholder="Or type new contact name to quick-save..."
                          value={customContactInput ?? ''}
                          onChange={(e) => setCustomContactInput(e.target.value)}
                          className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg py-1 px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                        />
                        {customContactInput.trim().length > 0 && (
                          <button
                            type="button"
                            disabled={isCreatingContactInline}
                            onClick={() => handleCreateContactInline(customContactInput)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Unregistered Entities Confirmation & One-Click Registration Card */}
              {unregisteredEntities && (
                <div 
                  id="field-unregistered_entities" 
                  className={`bg-gradient-to-r from-amber-50/90 via-slate-50 to-emerald-50/90 border-2 border-emerald-400 rounded-2xl p-5 shadow-sm space-y-4 transition-all duration-300 ${getHighlightClasses('unregistered_entities')}`}
                >
                  <div className="flex items-start justify-between border-b border-emerald-200/60 pb-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
                        <Sparkles className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-sans flex items-center gap-2">
                          <span>Detected New / Unregistered Entities</span>
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-mono rounded-full font-bold">
                            AI Match Action Required
                          </span>
                        </h4>
                        <p className="text-xs text-slate-600 font-sans mt-0.5">
                          Review extracted data and click "Confirm &amp; Register" to instantly record into Company and Contact database catalogs.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUnregisteredEntities(null)}
                      className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition border border-transparent hover:border-red-100 flex items-center space-x-1"
                      title="Dismiss confirmation"
                    >
                      <span className="text-[11px] font-bold">Discard / Ignore AI Suggestion</span>
                      <X className="w-4 h-4 inline" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                    {/* Company Fields */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <Building className="w-4 h-4 text-blue-600" />
                          <span>1. Company Resolution</span>
                        </span>
                        <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          <button 
                            type="button"
                            onClick={() => setUnregisteredEntities({...unregisteredEntities, companyResolutionMode: 'create'})}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition ${unregisteredEntities.companyResolutionMode !== 'link' ? 'bg-white shadow-2xs text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            Create New
                          </button>
                          <button 
                            type="button"
                            onClick={() => setUnregisteredEntities({...unregisteredEntities, companyResolutionMode: 'link'})}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition ${unregisteredEntities.companyResolutionMode === 'link' ? 'bg-white shadow-2xs text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            Link Existing
                          </button>
                        </div>
                      </div>
                      
                      {unregisteredEntities.companyResolutionMode === 'link' ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase">Search Existing Company</label>
                            <select
                              value={unregisteredEntities.linkedCompanyId || ''}
                              onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, linkedCompanyId: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                            >
                              <option value="">-- Select Company --</option>
                              {companies.map(c => (
                                <option key={c.id} value={c.id}>{c.display_name} ({c.city}, {c.country})</option>
                              ))}
                            </select>
                          </div>
                          <p className="text-[10px] text-slate-500 font-sans italic">
                            Select an existing company to link this contact and enquiry to.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2 animate-in fade-in duration-200">
                          <div className="flex flex-wrap gap-2">
                            <div className="flex-1 min-w-[250px]">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">Company Name</label>
                              <input
                                type="text"
                                value={unregisteredEntities.companyName || ''}
                                onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, companyName: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="flex-1 min-w-[150px]">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">Legal Suffix</label>
                              <select
                                value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'None / To Be Added Later'}
                                onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500 font-sans cursor-pointer"
                              >
                                {['None / To Be Added Later', 'LLC', 'FZE', 'FZCO', 'FZC', 'Co. LLC', 'PJSC', 'JSC', 'Corp', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((suf) => (
                                  <option key={suf} value={suf}>{suf}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">City / Location</label>
                              <input
                                type="text"
                                value={unregisteredEntities.city || ''}
                                onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, city: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">Country</label>
                              <input
                                type="text"
                                value={unregisteredEntities.country || 'UAE'}
                                onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, country: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">Relationship</label>
                              <select
                                value={unregisteredEntities.relationship || 'Prospect'}
                                onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, relationship: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                              >
                                <option value="Prospect">Prospect</option>
                                <option value="Client">Client</option>
                                <option value="Partner">Partner</option>
                                <option value="Vendor">Vendor</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase">Temperature</label>
                              <select
                                value={unregisteredEntities.temperature || 'Cold ❄️'}
                                onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, temperature: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                              >
                                <option value="Cold ❄️">Cold ❄️</option>
                                <option value="Warm 🔥">Warm 🔥</option>
                                <option value="Hot 🚨">Hot 🚨</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Contact Person Fields */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-2.5 shadow-2xs">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <User className="w-4 h-4 text-emerald-600" />
                          <span>2. Contact Resolution</span>
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={unregisteredEntities.ignoreContact || false}
                            onChange={(e) => setUnregisteredEntities({...unregisteredEntities, ignoreContact: e.target.checked})}
                            className="rounded border-slate-300 text-rose-500 focus:ring-rose-500" 
                          />
                          <span className="text-[10px] font-bold text-rose-600">Ignore/Do not register</span>
                        </label>
                      </div>

                      <div className={`space-y-2 transition-opacity ${unregisteredEntities.ignoreContact ? 'opacity-40 pointer-events-none' : ''}`}>
                        <div className="flex flex-wrap gap-2">
                          <div className="flex-1 min-w-[250px]">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase">Full Name</label>
                            <input
                              type="text"
                              value={unregisteredEntities.contactName || ''}
                              onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactName: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-semibold focus:bg-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div className="flex-1 min-w-[150px]">
                            <label className="text-[10px] font-semibold text-slate-500 uppercase">Designation / Job Title</label>
                            <input
                              type="text"
                              value={unregisteredEntities.contactDesignation || ''}
                              onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactDesignation: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase">Email Address</label>
                            <input
                              type="email"
                              value={unregisteredEntities.contactEmail || ''}
                              onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactEmail: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase">Phone / Mobile</label>
                            <input
                              type="text"
                              value={unregisteredEntities.contactMobile || ''}
                              onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactMobile: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 font-mono focus:bg-white focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Field Assignment Routing */}
                  <div className="bg-white/80 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className={`flex flex-wrap items-center gap-4 ${unregisteredEntities.ignoreContact ? 'opacity-40 pointer-events-none' : ''}`}>
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-700 text-[11px]">Route Email To:</span>
                        <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'contact' })}
                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.emailDestination === 'contact' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Contact Person
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'company' })}
                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.emailDestination === 'company' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Company General
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-700 text-[11px]">Route Phone To:</span>
                        <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
                          <button
                            type="button"
                            onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'contact' })}
                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.phoneDestination === 'contact' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Contact Person
                          </button>
                          <button
                            type="button"
                            onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'company' })}
                            className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition ${unregisteredEntities.phoneDestination === 'company' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                          >
                            Company General
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleConfirmRegisterEntities()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition flex items-center space-x-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-100" />
                      <span>Process Entity Resolutions</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Primary 80/20 Field: Subject / Project Title */}
              <div id="field-subject" className="pt-1">
                <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block truncate">
                  Subject / Project Title (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Equipment Supply & Commissioning"
                  value={subject || ''}
                  onChange={(e) => setSubject(e.target.value)}
                  className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans ${getHighlightClasses('subject')}`}
                />
              </div>

              {/* Inline + Progressive Disclosure Triggers for Consolidated Metadata/Location & Custom Specs */}
              {(() => {
                const customSpecsCount = customProjectDetails.filter((d) => d.key.trim() || d.value.trim()).length;
                const isSpecsOpen = disclosure.expandedSections.customSpecs || customSpecsCount > 0;
                const needsMetaOpen =
                  disclosure.isMetadataExpanded ||
                  disclosure.expandedSections.locationScope ||
                  isTargetSnOccupied ||
                  isClaimingGap ||
                  Boolean(quoteRefNo?.includes('[COMPANY_CODE]') || quoteRefNo?.includes('[COUNTRY]'));
                const locSummary = [projectLocation, country].filter(Boolean).join(', ');

                return (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => disclosure.toggleSection('customSpecs')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1.5 cursor-pointer ${
                          isSpecsOpen
                            ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                            : 'bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                        }`}
                      >
                        <Plus className={`w-3 h-3 transition-transform ${isSpecsOpen ? 'rotate-45 text-blue-600' : 'text-slate-400'}`} />
                        <span>Custom Project Specs</span>
                        {customSpecsCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-bold">
                            {customSpecsCount}
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Unified Expandable Panel: Sequence, Quote Ref, Dates, Location, Client Ref & Option Scope */}
                    {needsMetaOpen && (
                      <div className="p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3.5 animate-in fade-in duration-150">
                        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                          <div>
                            <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <span>S/N</span>
                              {isClaimingGap && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold lowercase tracking-normal">
                                  (locked to gap #{sn})
                                </span>
                              )}
                            </MarqueeLabel>
                            <input
                              type="number"
                              required
                              value={sn ?? ''}
                              disabled={isClaimingGap}
                              onChange={(e) => setSn(Number(e.target.value))}
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-mono ${
                                isClaimingGap ? 'opacity-70 bg-slate-100 dark:bg-slate-800 cursor-not-allowed select-none' : ''
                              }`}
                              title={isClaimingGap ? `Sequence S/N #${sn} is locked to this reserved gap` : 'Serial Number'}
                            />
                          </div>

                          <div id="field-quote_ref_no" className="sm:col-span-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                Quote Ref
                              </MarqueeLabel>
                              {!isReadOnly && activeWorkspace?.id && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const selectedSp = salespersons.find(
                                      (s) => s.id === salesPerson || s.initials === salesPerson || s.full_name === salesPerson
                                    );
                                    const repInitials =
                                      selectedSp?.initials ||
                                      (selectedSp?.full_name
                                        ? selectedSp.full_name.slice(0, 2).toUpperCase()
                                        : salesPerson
                                        ? salesPerson.trim().slice(0, 3).toUpperCase()
                                        : '');
                                    const selectedComp = companies.find((c) => c.id === companyId);
                                    const parts = enquiryDate.split('-');
                                    const dateObj = parts.length === 3 ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) : new Date();
                                    const isExisting = Boolean(enquiryToEdit && (enquiryToEdit.id || (enquiryToEdit as any)._id));

                                    // Check if current quoteRefNo or enquiryToEdit.quote_ref_no already has a valid sequence-date suffix (e.g. 2802-030926AA)
                                    const existingCandidate = (quoteRefNo || enquiryToEdit?.quote_ref_no || '').trim();
                                    const tailMatch = existingCandidate.match(
                                      /(?:^|\/)(\d{2,6})-(\d{2})(\d{2})(\d{2,4})([A-Za-z]{0,4})((?:-R\d+|\/Rev\.\d+)?)$/i
                                    );

                                    if (tailMatch && !isClaimingGap) {
                                      try {
                                        const counters = await getWorkspaceSequenceCounters(activeWorkspace.id);
                                        setWorkspaceCounters(counters);
                                        const existingSeq = Number(tailMatch[1]);
                                        const dd = tailMatch[2];
                                        const mm = tailMatch[3];
                                        const yyRaw = tailMatch[4];
                                        const fullYear = yyRaw.length === 2 ? Number(`20${yyRaw}`) : Number(yyRaw);
                                        const parsedTailDate = new Date(fullYear, Number(mm) - 1, Number(dd));
                                        const validDate = !isNaN(parsedTailDate.getTime()) ? parsedTailDate : dateObj;
                                        const existingTailLetters = tailMatch[5] || '';
                                        const revSuffix = tailMatch[6] || '';
                                        const activePat = counters.pattern || '{SEQ}-{DD}{MM}{YY}';
                                        const formattedBase = formatPattern(activePat, {
                                          seq: existingSeq,
                                          prefix: counters.prefix || '',
                                          date: validDate,
                                          rep: existingTailLetters || repInitials,
                                          country: country || selectedComp?.country || 'UAE',
                                          countryCode: selectedComp?.country_code || '',
                                          companyCode: selectedComp?.company_code || ''
                                        });
                                        const withRepTail =
                                          existingTailLetters &&
                                          !/\{REP\}/i.test(activePat) &&
                                          !formattedBase.toUpperCase().endsWith(existingTailLetters.toUpperCase())
                                            ? `${formattedBase}${existingTailLetters}`
                                            : formattedBase;
                                        setQuoteRefNo(`${withRepTail}${revSuffix}`);
                                        setIsQuoteRefCustom(true);
                                        return;
                                      } catch (err) {
                                        console.warn(err);
                                      }
                                    }

                                    setIsQuoteRefCustom(false);
                                    if (isExisting && !isClaimingGap && typeof sn === 'number' && sn > 0) {
                                      try {
                                        const counters = await getWorkspaceSequenceCounters(activeWorkspace.id);
                                        setWorkspaceCounters(counters);
                                        const formatted = formatPattern(counters.pattern || '{SEQ}-{DD}{MM}{YY}', {
                                          seq: sn,
                                          prefix: counters.prefix || '',
                                          date: dateObj,
                                          rep: repInitials,
                                          country: country || selectedComp?.country || 'UAE',
                                          countryCode: selectedComp?.country_code || '',
                                          companyCode: selectedComp?.company_code || ''
                                        });
                                        setQuoteRefNo(formatted);
                                      } catch (err) {
                                        console.warn(err);
                                      }
                                    } else {
                                      previewNextEnquirySequence(activeWorkspace.id, repInitials, dateObj, enquiries, {
                                        country: country || selectedComp?.country || 'UAE',
                                        countryCode: selectedComp?.country_code || '',
                                        companyCode: selectedComp?.company_code || ''
                                      }).then((res) => {
                                        if (res.quoteRef) setQuoteRefNo(res.quoteRef);
                                      });
                                    }
                                  }}
                                  className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 transition cursor-pointer"
                                  title="Generate or re-sync based on workspace sequence configuration and selected company/date"
                                >
                                  <Sparkles className="w-3 h-3" /> {isQuoteRefCustom ? 'Reset to Auto Pattern' : 'Auto Pattern'}
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              required
                              value={quoteRefNo || ''}
                              onChange={(e) => {
                                setQuoteRefNo(e.target.value);
                                setIsQuoteRefCustom(true);
                              }}
                              className={`w-full bg-white dark:bg-slate-900 border ${
                                quoteRefNo?.includes('[COMPANY_CODE]') || quoteRefNo?.includes('[COUNTRY]')
                                  ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-500/20 bg-amber-50/40 dark:bg-amber-950/20'
                                  : 'border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-blue-500/20'
                              } focus:ring-2 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-mono ${getHighlightClasses('quote_ref_no')}`}
                            />

                            {/* Structured Token Status & Quick-Resolve Prompt for {COMPANY_CODE} / {COUNTRY} */}
                            {(() => {
                              const activePat =
                                workspaceCounters?.pattern ||
                                (activeWorkspace as any)?.settings?.quote_sequence_pattern ||
                                '';
                              const needsCompCode =
                                patternRequiresCompanyCode(activePat) || Boolean(quoteRefNo?.includes('[COMPANY_CODE]'));
                              const needsCountry =
                                patternRequiresCountryCode(activePat) || Boolean(quoteRefNo?.includes('[COUNTRY]'));
                              if (!needsCompCode && !needsCountry) return null;

                              const selectedComp = companies.find((c) => c.id === companyId);
                              const hasCompCode = Boolean(selectedComp?.company_code?.trim());
                              const resolvedCtry = resolveCountryCode(
                                country || selectedComp?.country || 'UAE',
                                selectedComp?.country_code
                              );

                              if (needsCompCode && !companyId) {
                                return (
                                  <div className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-[11px] text-amber-800 dark:text-amber-300">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      <span className="truncate">
                                        Select a <strong>Company</strong> above to resolve{' '}
                                        <code className="font-mono font-bold">[COMPANY_CODE]</code>
                                      </span>
                                    </div>
                                    {resolvedCtry && (
                                      <span className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-amber-200 dark:border-slate-700 font-mono font-bold text-[10px] shrink-0">
                                        {resolvedCtry}
                                      </span>
                                    )}
                                  </div>
                                );
                              }

                              if (needsCompCode && companyId && selectedComp && !hasCompCode) {
                                return (
                                  <div className="mt-1.5 p-2.5 rounded-lg bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-2 animate-in fade-in duration-150">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5 text-[11px] text-amber-900 dark:text-amber-200 font-medium">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                        <span>
                                          <strong>{selectedComp.display_name}</strong> has no registered Company Code for{' '}
                                          <code className="font-mono font-bold">[COMPANY_CODE]</code>.
                                        </span>
                                      </div>
                                      {!showQuickResolveCode && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setQuickResolveCodeVal(selectedComp.company_code || '');
                                            setQuickResolveCountryCodeVal(
                                              selectedComp.country_code || resolvedCtry || 'UAE'
                                            );
                                            setShowQuickResolveCode(true);
                                          }}
                                          className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] uppercase tracking-wider shrink-0 transition cursor-pointer shadow-2xs"
                                        >
                                          Set Company Code
                                        </button>
                                      )}
                                    </div>

                                    {showQuickResolveCode && (
                                      <div className="pt-1.5 border-t border-amber-200/80 dark:border-amber-800/60 flex flex-wrap items-end gap-2">
                                        <div className="flex-1 min-w-[120px]">
                                          <label className="block text-[9px] font-mono uppercase text-amber-800 dark:text-amber-300 font-bold mb-0.5">
                                            Company Code (e.g. CWE, BME) *
                                          </label>
                                          <input
                                            type="text"
                                            value={quickResolveCodeVal}
                                            onChange={(e) => setQuickResolveCodeVal(sanitizeCompanyCode(e.target.value))}
                                            placeholder="e.g. CWE"
                                            maxLength={12}
                                            className="w-full px-2 py-1 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white"
                                          />
                                        </div>
                                        <div className="w-24">
                                          <label className="block text-[9px] font-mono uppercase text-amber-800 dark:text-amber-300 font-bold mb-0.5">
                                            Country Code
                                          </label>
                                          <input
                                            type="text"
                                            value={quickResolveCountryCodeVal}
                                            onChange={(e) => setQuickResolveCountryCodeVal(sanitizeCompanyCode(e.target.value))}
                                            placeholder={resolvedCtry || 'UAE'}
                                            maxLength={6}
                                            className="w-full px-2 py-1 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 text-slate-900 dark:text-white"
                                          />
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <button
                                            type="button"
                                            disabled={!quickResolveCodeVal.trim() || isSavingQuickCode}
                                            onClick={async () => {
                                              const cleanCode = sanitizeCompanyCode(quickResolveCodeVal);
                                              const cleanCtry = sanitizeCompanyCode(quickResolveCountryCodeVal) || resolvedCtry;
                                              if (!cleanCode || !selectedComp.id) return;
                                              setIsSavingQuickCode(true);
                                              try {
                                                const patch: Partial<Company> = {
                                                  company_code: cleanCode,
                                                  ...(cleanCtry ? { country_code: cleanCtry } : {}),
                                                  updatedAt: new Date().toISOString()
                                                };
                                                await safeUpdateDoc('companies', selectedComp.id, patch);
                                                await CompanyRepository.updateCompany(
                                                  selectedComp.id,
                                                  patch
                                                ).catch(() => {});
                                                if (setCompanies) {
                                                  setCompanies((prev) =>
                                                    prev.map((c) => (c.id === selectedComp.id ? { ...c, ...patch } : c))
                                                  );
                                                }
                                                setQuoteRefNo((prev) => {
                                                  let updated = (prev || '').replace(/\[COMPANY_CODE\]/g, cleanCode);
                                                  if (cleanCtry) {
                                                    updated = updated.replace(/\[COUNTRY\]/g, cleanCtry);
                                                  }
                                                  return updated;
                                                });
                                                setShowQuickResolveCode(false);
                                                triggerToast?.(
                                                  `Saved Company Code "${cleanCode}" to ${selectedComp.display_name} and updated Quote Ref!`,
                                                  'success'
                                                );
                                              } catch (err: any) {
                                                console.error('Failed saving quick company code:', err);
                                                triggerToast?.('Failed to save company code: ' + err.message, 'error');
                                              } finally {
                                                setIsSavingQuickCode(false);
                                              }
                                            }}
                                            className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider transition cursor-pointer flex items-center gap-1"
                                          >
                                            {isSavingQuickCode ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                            <span>Save &amp; Apply</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setShowQuickResolveCode(false)}
                                            className="px-2 py-1 rounded-md border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 text-[10px] font-semibold transition cursor-pointer"
                                          >
                                            Skip
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              if (selectedComp && hasCompCode) {
                                return (
                                  <div className="mt-1 space-y-1.5">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 px-1">
                                      <span className="flex items-center gap-1.5">
                                        <span>Resolved Tokens:</span>
                                        <span className="px-1.5 py-0.2 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono font-bold">
                                          {sanitizeCompanyCode(selectedComp.company_code)}
                                        </span>
                                        {resolvedCtry && (
                                          <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-mono font-bold">
                                            {resolvedCtry}
                                          </span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setQuickResolveCodeVal(selectedComp.company_code || '');
                                          setQuickResolveCountryCodeVal(selectedComp.country_code || resolvedCtry || 'UAE');
                                          setShowQuickResolveCode((v) => !v);
                                        }}
                                        className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                                      >
                                        {showQuickResolveCode ? 'Close' : 'Edit Code'}
                                      </button>
                                    </div>
                                    {showQuickResolveCode && (
                                      <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex flex-wrap items-end gap-2">
                                        <div className="flex-1 min-w-[110px]">
                                          <label className="block text-[9px] font-mono uppercase text-slate-500 font-bold mb-0.5">
                                            Company Code
                                          </label>
                                          <input
                                            type="text"
                                            value={quickResolveCodeVal}
                                            onChange={(e) => setQuickResolveCodeVal(sanitizeCompanyCode(e.target.value))}
                                            maxLength={12}
                                            className="w-full px-2 py-1 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none text-slate-900 dark:text-white"
                                          />
                                        </div>
                                        <div className="w-20">
                                          <label className="block text-[9px] font-mono uppercase text-slate-500 font-bold mb-0.5">
                                            Country
                                          </label>
                                          <input
                                            type="text"
                                            value={quickResolveCountryCodeVal}
                                            onChange={(e) => setQuickResolveCountryCodeVal(sanitizeCompanyCode(e.target.value))}
                                            maxLength={6}
                                            className="w-full px-2 py-1 text-xs font-mono font-bold uppercase bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md focus:outline-none text-slate-900 dark:text-white"
                                          />
                                        </div>
                                        <button
                                          type="button"
                                          disabled={!quickResolveCodeVal.trim() || isSavingQuickCode}
                                          onClick={async () => {
                                            const oldCode = sanitizeCompanyCode(selectedComp.company_code);
                                            const cleanCode = sanitizeCompanyCode(quickResolveCodeVal);
                                            const cleanCtry = sanitizeCompanyCode(quickResolveCountryCodeVal) || resolvedCtry;
                                            if (!cleanCode || !selectedComp.id) return;
                                            setIsSavingQuickCode(true);
                                            try {
                                              const patch: Partial<Company> = {
                                                company_code: cleanCode,
                                                ...(cleanCtry ? { country_code: cleanCtry } : {}),
                                                updatedAt: new Date().toISOString()
                                              };
                                              await safeUpdateDoc('companies', selectedComp.id, patch);
                                              await CompanyRepository.updateCompany(
                                                selectedComp.id,
                                                patch
                                              ).catch(() => {});
                                              if (setCompanies) {
                                                setCompanies((prev) =>
                                                  prev.map((c) => (c.id === selectedComp.id ? { ...c, ...patch } : c))
                                                );
                                              }
                                              if (oldCode && quoteRefNo.includes(`/${oldCode}/`)) {
                                                setQuoteRefNo((prev) => prev.replace(`/${oldCode}/`, `/${cleanCode}/`));
                                              }
                                              setShowQuickResolveCode(false);
                                              triggerToast?.(`Updated Company Code to "${cleanCode}"`, 'success');
                                            } catch (err: any) {
                                              triggerToast?.('Failed to update company code: ' + err.message, 'error');
                                            } finally {
                                              setIsSavingQuickCode(false);
                                            }
                                          }}
                                          className="px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-[10px] uppercase tracking-wider transition cursor-pointer"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              return null;
                            })()}
                          </div>

                          <div id="field-received_date">
                            <MarqueeLabel required className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1" title="Received Date (YYYY-MM-DD)">Received Date</MarqueeLabel>
                            <input
                              type="date"
                              required
                              placeholder="YYYY-MM-DD"
                              value={enquiryDate || ''}
                              onChange={(e) => setEnquiryDate(e.target.value)}
                              className={`dark:[color-scheme:dark] w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-mono ${getHighlightClasses('received_date')}`}
                            />
                          </div>

                          <div>
                            <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1" title="Logged Date (YYYY-MM-DD)">Logged Date</MarqueeLabel>
                            <input
                              type="date"
                              required
                              placeholder="YYYY-MM-DD"
                              value={loggedDate || ''}
                              onChange={(e) => setLoggedDate(e.target.value)}
                              className="dark:[color-scheme:dark] w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-mono"
                            />
                          </div>

                          {isTargetSnOccupied && (
                            <div className="col-span-full p-2.5 rounded-lg border border-amber-300 dark:border-amber-700/70 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 space-y-1.5 animate-in fade-in duration-150">
                              <div className="flex items-start gap-1.5 font-semibold text-[11px]">
                                <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                                <span>S/N #{sn} is occupied by {occupiedEnquiry?.company_name || (occupiedEnquiry as any)?.client_company || 'an existing enquiry'}.</span>
                              </div>
                              <label className="flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-700 dark:text-slate-300 pt-1 border-t border-amber-200 dark:border-amber-800/60">
                                <input
                                  type="checkbox"
                                  checked={shiftExistingOnCollision}
                                  onChange={(e) => setShiftExistingOnCollision(e.target.checked)}
                                  className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                                />
                                <span>Shift existing records down (#{sn} and above by +1)</span>
                              </label>
                            </div>
                          )}

                          <div id="field-salesperson">
                            <MarqueeLabel
                              badge={
                                user?.role === 'Admin' || allowUserSalespersonSelection
                                  ? renderSortButton(salespersonsSort, setSalespersonsSort, 'Salespersons')
                                  : undefined
                              }
                              className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between"
                            >
                              Salesperson
                            </MarqueeLabel>
                            <select
                              value={salesPerson}
                              onChange={(e) => setSalesPerson(e.target.value)}
                              disabled={user?.role !== 'Admin' && !allowUserSalespersonSelection}
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans ${
                                user?.role !== 'Admin' && !allowUserSalespersonSelection ? 'bg-slate-100/90 text-slate-500 cursor-not-allowed' : ''
                              } ${getHighlightClasses('salesperson')}`}
                            >
                              {sortedSalespersons.map((s) => (
                                <option key={s.id || s.initials} value={s.id || s.initials}>
                                  {s.full_name}
                                </option>
                              ))}
                            </select>
                            {user?.role !== 'Admin' && !allowUserSalespersonSelection && (
                              <p className="text-[10px] text-amber-700 font-sans mt-1">
                                🔒 Registered automatically under your account.
                              </p>
                            )}
                          </div>

                          <div>
                            <MarqueeLabel badge={renderSortButton(sourcesSort, setSourcesSort, 'Enquiry Sources')} className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">Enquiry Source</MarqueeLabel>
                            <CreatableCombobox
                              options={sortedSources}
                              value={enquirySource}
                              onChange={(val: string) => setEnquirySource(val)}
                              onCreateOption={async (val: string) => {
                                setEnquirySource(val);
                                if (setEnquirySources) {
                                  try {
                                    const docRef = await safeAddDoc('dropdown_enquiry_sources', { name: val });
                                    setEnquirySources((prev) => {
                                      if (prev.some((s) => s.name.toLowerCase() === val.toLowerCase())) return prev;
                                      return [...prev, { id: docRef?.id || ('src_' + Date.now()), name: val }];
                                    });
                                  } catch (e) {
                                    console.warn('Failed to save new source', e);
                                  }
                                }
                              }}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans"
                            />
                          </div>

                          <div>
                            <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">Enquiry Currency</MarqueeLabel>
                            <select
                              value={formCurrency}
                              onChange={(e) => setFormCurrency(e.target.value as 'AED' | 'USD')}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans"
                            >
                              <option value="AED">AED (Dirhams)</option>
                              <option value="USD">USD (Dollars)</option>
                            </select>
                          </div>
                        </div>

                        <div
                          id="field-country"
                          className={`pt-3 border-t border-slate-200/70 dark:border-slate-700/70 grid grid-cols-1 sm:grid-cols-2 ${
                            isPreviewActive ? 'xl:grid-cols-2' : 'lg:grid-cols-4'
                          } gap-3`}
                        >
                          <div>
                            <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">Country</MarqueeLabel>
                            <input
                              type="text"
                              required
                              placeholder="e.g. UAE / Oman"
                              value={country || ''}
                              onChange={(e) => setCountry(e.target.value)}
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans ${getHighlightClasses('country')}`}
                            />
                          </div>

                          <div id="field-location">
                            <div className="flex justify-between items-center mb-1.5">
                              <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                City
                              </MarqueeLabel>
                              {renderConfidenceBadge('project_location')}
                            </div>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Dubai / Muscat"
                              value={projectLocation || ''}
                              onChange={(e) => setProjectLocation(e.target.value)}
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans ${getHighlightClasses('location')}`}
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block truncate">
                              Client Ref
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. PO-8902-X / RFQ-2026"
                              value={customerReferenceCode || ''}
                              onChange={(e) => setCustomerReferenceCode(e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-mono"
                            />
                          </div>

                          <div className="min-w-0">
                            <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block truncate">
                              Option Scope
                            </label>
                            <select
                              value={proposalOption}
                              onChange={(e) => setProposalOption(e.target.value)}
                              className="w-full min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg text-sm text-slate-900 dark:text-white px-3 py-2 transition-all font-sans"
                            >
                              <option value="">None / Single Option</option>
                              <option value="Option A">Option A</option>
                              <option value="Option B">Option B</option>
                              <option value="Option C">Option C</option>
                              <option value="Option D">Option D</option>
                              <option value="Multi-Option (A/B/C)">Multi-Option (A/B/C)</option>
                              {proposalOption && !['', 'Option A', 'Option B', 'Option C', 'Option D', 'Multi-Option (A/B/C)'].includes(proposalOption) && (
                                <option value={proposalOption}>{proposalOption}</option>
                              )}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Expandable Panel C: Custom Project Specifications */}
                    {isSpecsOpen && (
                      <div
                        id="field-custom_project_details"
                        className={`p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5 transition-all duration-300 ${getHighlightClasses('custom_project_details')}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Sliders className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-sans uppercase tracking-wider truncate">
                              Custom Project Specifications
                            </span>
                            {customSpecsCount > 0 && (
                              <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0">
                                ({customSpecsCount})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setCustomProjectDetails((prev) => [...prev, { key: '', value: '' }])}
                            className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-2.5 py-1 rounded-lg border border-blue-200/80 dark:border-blue-800/80 transition flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Custom Spec</span>
                          </button>
                        </div>

                        {/* Quick Spec Presets */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-sans">
                          {['Consultant', 'Main Contractor', 'Site Location', 'Tender Ref', 'Scope of Work', 'Delivery Terms', 'Payment Terms'].map((quickKey) => (
                            <button
                              key={quickKey}
                              type="button"
                              onClick={() => {
                                if (!customProjectDetails.some((d) => d.key.toLowerCase() === quickKey.toLowerCase())) {
                                  setCustomProjectDetails((prev) => [...prev, { key: quickKey, value: '' }]);
                                }
                              }}
                              className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-600 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 rounded-lg border border-slate-200/80 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-800 transition font-medium cursor-pointer"
                            >
                              + {quickKey}
                            </button>
                          ))}
                        </div>

                        {/* Active Key-Value Specs List */}
                        {customProjectDetails.length > 0 && (
                          <div className="space-y-2 pt-1">
                            {customProjectDetails.map((detail, idx) => (
                              <div key={idx} className="flex items-center space-x-2 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/80 dark:border-slate-700/80">
                                <input
                                  type="text"
                                  placeholder="Attribute (e.g. Consultant)"
                                  value={detail.key ?? ''}
                                  onChange={(e) => {
                                    const next = [...customProjectDetails];
                                    next[idx].key = e.target.value;
                                    setCustomProjectDetails(next);
                                  }}
                                  className="w-1/3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-sans"
                                />
                                <span className="text-slate-400 font-bold">:</span>
                                <input
                                  type="text"
                                  placeholder="Value (e.g. Khatib & Alami / Site Ref)"
                                  value={detail.value ?? ''}
                                  onChange={(e) => {
                                    const next = [...customProjectDetails];
                                    next[idx].value = e.target.value;
                                    setCustomProjectDetails(next);
                                  }}
                                  className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-sans"
                                />
                                <button
                                  type="button"
                                  onClick={() => setCustomProjectDetails(customProjectDetails.filter((_, i) => i !== idx))}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition shrink-0 cursor-pointer"
                                  title="Remove Spec"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

          {/* Chapter 2: 2. Proposal Line Items */}
          <div id="field-line_items" className={`scroll-mt-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-2xs ${getHighlightClasses('line_items')}`}>
            <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0 flex-wrap">
                <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200/60 dark:border-blue-800/60">
                  2
                </span>
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight whitespace-nowrap">
                    Proposal Line Items
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px] font-bold">
                    {lineItems.length}
                  </span>
                </div>
                {renderConfidenceBadge('line_items')}
                <div
                  className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700"
                  title="Switch active proposal currency (converts existing line item rates between AED and USD)"
                >
                  <button
                    type="button"
                    onClick={() => handleCurrencySwitch('AED')}
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md transition cursor-pointer ${
                      formCurrency === 'AED'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    AED
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCurrencySwitch('USD')}
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-md transition cursor-pointer ${
                      formCurrency === 'USD'
                        ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    USD
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {lineItems.some((li) => !li.item_name?.trim() && li.description?.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setLineItems((prev) =>
                        prev.map((li) => {
                          if (li.item_name?.trim() || !li.description?.trim()) return li;
                          const parsed = parseLineItemTitleAndSpec(li.description, li.item_name);
                          return {
                            ...li,
                            item_name: parsed.title,
                            description: parsed.spec
                          };
                        })
                      );
                      if (triggerToast) {
                        triggerToast('Cleaned up and split legacy item titles & specs!', 'success');
                      }
                    }}
                    className="py-1.5 px-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-amber-800 dark:text-amber-300 rounded-lg text-xs font-semibold font-sans transition flex items-center gap-1 shadow-2xs cursor-pointer whitespace-nowrap"
                    title="Automatically split combined description text into Item Name and Technical Spec across all items"
                  >
                    <Scissors className="w-3.5 h-3.5 shrink-0" />
                    <span>Clean Up Titles</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLinkingLineIndex(null);
                    setShowCatalogModal(true);
                  }}
                  className="py-1.5 px-3 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg text-xs font-semibold font-sans transition flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                  title="Search and insert items from your product catalog"
                >
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <span>Quick Catalog Insert</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="py-1.5 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold font-sans transition flex items-center gap-1.5 shadow-2xs cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>Add Item Line</span>
                </button>
              </div>
            </div>

            {lineItems.length > 0 ? (
              <div className="space-y-4">
                <datalist id="product-category-list">
                  {sortedCategories.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>

                {lineItems.map((item, index) => {
                  const isServiceOrFee =
                    (item as any).classification === 'Charge / Fee (Service)' ||
                    (item as any).classification === 'Discount / Rebate' ||
                    item.item_type === 'charge' ||
                    item.item_type === 'discount' ||
                    (item.item_type as string) === 'service' ||
                    (item.item_type as string) === 'fee' ||
                    item.product_type === 'Service / Charge';

                  const isCompositeItem = Boolean(
                    item.is_composite_set || (item.sub_components && item.sub_components.length > 0)
                  );

                  return (
                    <div
                      key={index}
                      className="bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/90 dark:border-slate-700/80 p-4 rounded-xl space-y-3.5"
                    >
                      {/* Card Header Bar — Single Clean Row */}
                      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80 dark:border-slate-700/80 gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold shrink-0">
                            #{index + 1}
                          </span>
                          {(() => {
                            if (isServiceOrFee) {
                              return (
                                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800">
                                  <span>Service / Fee</span>
                                </span>
                              );
                            }

                            const matchedProduct = item.product_id
                              ? (products || []).find((p) => p.id === item.product_id)
                              : null;
                            if (matchedProduct) {
                              const availStock =
                                (matchedProduct.stock_on_hand || 0) - (matchedProduct.stock_reserved || 0);
                              const isLow =
                                Boolean(matchedProduct.is_inventoried) &&
                                availStock <= (matchedProduct.reorder_level || 0);
                              const drifted = hasCatalogDrift(item, matchedProduct, formCurrency);
                              return (
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 max-w-[220px] truncate"
                                    title={`${matchedProduct.name} ${matchedProduct.sku ? `[${matchedProduct.sku}]` : ''}`}
                                  >
                                    <Package className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span className="truncate">{matchedProduct.sku || matchedProduct.name}</span>
                                  </span>
                                  {matchedProduct.is_inventoried ? (
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border whitespace-nowrap ${
                                        isLow
                                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      }`}
                                    >
                                      <span>
                                        Avail: {availStock} {matchedProduct.unit}
                                      </span>
                                      {(matchedProduct.stock_reserved || 0) > 0 && (
                                        <span>(Res: {matchedProduct.stock_reserved})</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                      {matchedProduct.default_availability || 'Order / Non-Stock'}
                                    </span>
                                  )}
                                  <CatalogSyncMenu
                                    item={item}
                                    matchedProduct={matchedProduct}
                                    products={products}
                                    setProducts={setProducts}
                                    currency={formCurrency}
                                    activeWorkspaceId={activeWorkspace?.id}
                                    triggerToast={triggerToast}
                                    compact
                                    onUpdateLineItem={(patch) => {
                                      setLineItems((prev) =>
                                        prev.map((li, i) => (i === index ? { ...li, ...patch } : li))
                                      );
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUnlinkCatalogItem(index)}
                                    className="text-[10px] text-slate-400 hover:text-rose-600 underline cursor-pointer whitespace-nowrap"
                                    title="Unlink from catalog SKU (converts to custom/non-stock)"
                                  >
                                    Unlink
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                  <Wrench className="w-2.5 h-2.5 text-slate-400" />
                                  <span>Custom Item</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinkingLineIndex(index);
                                    setShowCatalogModal(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200/70 dark:border-blue-800/70 transition cursor-pointer whitespace-nowrap"
                                >
                                  <Link2 className="w-2.5 h-2.5" />
                                  <span>Link SKU</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const itemInAed = {
                                      ...item,
                                      unit_price:
                                        formCurrency === 'USD'
                                          ? Number(((Number(item.unit_price) || 0) * 3.6725).toFixed(2))
                                          : item.unit_price,
                                      cost_price:
                                        item.cost_price !== undefined
                                          ? formCurrency === 'USD'
                                            ? Number((Number(item.cost_price) * 3.6725).toFixed(2))
                                            : item.cost_price
                                          : undefined
                                    };
                                    setSaveToCatalogState({
                                      isOpen: true,
                                      item: itemInAed,
                                      itemIndex: index
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/70 transition cursor-pointer whitespace-nowrap"
                                  title="Register this custom line item into the master Products Catalog and link it"
                                >
                                  <BookmarkPlus className="w-2.5 h-2.5" />
                                  <span>Save to Catalog</span>
                                </button>
                              </div>
                            );
                          })()}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          {!isServiceOrFee && (
                            <button
                              type="button"
                              onClick={() => {
                                const { clonedItem, targetOption, updatedSourceOption } = cloneLineItemToNextOption(
                                  item,
                                  lineItems
                                );
                                setLineItems((prev) => {
                                  const next = [...prev];
                                  if (updatedSourceOption) {
                                    next[index] = {
                                      ...next[index],
                                      option: updatedSourceOption,
                                      item_option: updatedSourceOption,
                                      option_designation: updatedSourceOption
                                    };
                                  }
                                  next.splice(index + 1, 0, clonedItem);
                                  return next;
                                });
                                if (triggerToast) {
                                  triggerToast(
                                    `Cloned "${item.item_name || item.product_type || 'Line Item'}" as ${targetOption}!`,
                                    'success'
                                  );
                                }
                              }}
                              className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-sans font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                              title="Clone this item (and all sub-components) into the next Option group (e.g. Option B)"
                            >
                              <GitBranch className="w-3 h-3 text-indigo-500 shrink-0" />
                              <span>Clone Option</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveLineItem(index)}
                            className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:border-rose-200 dark:border-rose-800 hover:text-rose-600 dark:hover:text-rose-400 text-slate-500 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-sans font-medium cursor-pointer shrink-0 whitespace-nowrap"
                            title="Remove Line Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </div>

                      {/* Primary 80/20 Commercial Row: Item Name, Qty, Unit, Selling Price & Live Line Total */}
                      {(() => {
                        const panelState = disclosure.expandedLinePanels[index] || {};
                        const matchedProd = item.product_id
                          ? (products || []).find((p) => p.id === item.product_id)
                          : null;
                        const effectiveImageUrl = item.image_url || matchedProd?.image_url || '';
                        const effectiveDatasheet =
                          item.datasheet_attachment || matchedProd?.datasheet_attachment;

                        const qtyVal = Number(item.quantity) || 0;
                        const unitVal = Number(item.unit_price) || 0;
                        const calcTotal = Number((qtyVal * unitVal).toFixed(2));
                        const currentTotal = Number(item.total_price) || 0;
                        const isOverridden =
                          !item.is_composite_set &&
                          !(item.sub_components && item.sub_components.length > 0) &&
                          Math.abs(currentTotal - calcTotal) > 0.01;
                        const isEditingOverride = editingLineTotalIdx === index || isOverridden;
                        const cleanUom =
                          !item.unit || String(item.unit).toLowerCase() === 'custom unit'
                            ? isCompositeItem
                              ? 'Sets'
                              : 'Nos'
                            : item.unit;

                        const sell = Number(item.unit_price) || 0;
                        const cost = Number(item.cost_price) || 0;
                        const marginPct = sell > 0 && cost > 0 ? ((sell - cost) / sell) * 100 : null;

                        const specCount =
                          (item.description?.trim() ? 1 : 0) +
                          (item.attributes || []).filter((a) => a.key?.trim() || a.value?.trim()).length;

                        const hasMediaOrBrand = Boolean(
                          (item.brand_make ?? matchedProd?.brand_make) ||
                            (item.model_part_no ?? matchedProd?.model_part_no) ||
                            effectiveImageUrl ||
                            effectiveDatasheet
                        );

                        const optLabel =
                          (item as any).option_designation || item.option || 'Default / Included';
                        const shortOpt =
                          optLabel === 'Default / Included' ? 'Baseline' : optLabel;

                        const isScopeOpen = Boolean(panelState.scope);
                        const isSpecsOpen = Boolean(panelState.specs);
                        const isMediaOpen = Boolean(panelState.media);
                        const isCostOpen = Boolean(panelState.cost || isEditingOverride);
                        const subCount = (item.sub_components || []).length;
                        const isIncludedOpen = Boolean(panelState.included ?? (isCompositeItem || subCount > 0));

                        return (
                          <div className="space-y-3">
                            {/* Consistent Primary Commercial Row for ALL Line Items (Single or Package) */}
                            <div className="grid grid-cols-12 gap-2.5 items-end">
                              {/* Item Name / Heading */}
                              <div className="col-span-12 sm:col-span-5 min-w-0">
                                <div className="flex items-center justify-between gap-2 h-5 mb-1 min-w-0">
                                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                    Item Name / Heading
                                  </label>
                                  {!item.item_name?.trim() && item.description?.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const parsed = parseLineItemTitleAndSpec(item.description, item.item_name);
                                        const updated = [...lineItems];
                                        updated[index] = {
                                          ...updated[index],
                                          item_name: parsed.title,
                                          description: parsed.spec
                                        };
                                        setLineItems(updated);
                                      }}
                                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md transition cursor-pointer whitespace-nowrap shrink-0"
                                      title="Split leading title from description"
                                    >
                                      <Scissors className="w-2.5 h-2.5 shrink-0" />
                                      <span>Split Title</span>
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  placeholder="e.g. Automatic Duplex MMF System (4.32m3/hr)"
                                  value={item.item_name ?? ''}
                                  onChange={(e) => handleLineItemChange(index, 'item_name', e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none"
                                />
                              </div>

                              {/* Qty */}
                              <div className="col-span-4 sm:col-span-2 min-w-0">
                                <div className="flex items-center justify-between h-5 mb-1">
                                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                    Qty
                                  </label>
                                </div>
                                <input
                                  type="number"
                                  required
                                  value={item.quantity ?? ''}
                                  onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none"
                                />
                              </div>

                              {/* Unit */}
                              <div className="col-span-4 sm:col-span-2 min-w-0">
                                <div className="flex items-center justify-between h-5 mb-1">
                                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                    Unit
                                  </label>
                                  {renderSortButton(unitsSort, setUnitsSort, 'Unit Suffixes')}
                                </div>
                                <CreatableCombobox
                                  options={sortedUnits}
                                  value={item.unit}
                                  onChange={(val: string) => handleLineItemChange(index, 'unit', val)}
                                  onCreateOption={(val: string) => {
                                    handleLineItemChange(index, 'unit', val);
                                  }}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-sans"
                                />
                              </div>

                              {/* Selling Unit Price + Live Line Total Pill */}
                              <div className="col-span-4 sm:col-span-3 min-w-0">
                                <div className="flex items-center justify-between gap-1 h-5 mb-1 min-w-0">
                                  <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                    Rate ({formCurrency})
                                  </label>
                                  <span
                                    onClick={() => disclosure.toggleLinePanel(index, 'cost')}
                                    className="text-[10px] font-mono font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.2 rounded border border-blue-200/70 dark:border-blue-800/70 whitespace-nowrap shrink-0 cursor-pointer"
                                    title="Line Total = Qty × Selling Price (click to inspect Cost, Margin or Override)"
                                  >
                                    = {formCurrency}{' '}
                                    {currentTotal.toLocaleString(undefined, {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2
                                    })}
                                  </span>
                                </div>
                                <FormattedNumberInput
                                  required
                                  value={item.unit_price}
                                  onChange={(val: number) => handleLineItemChange(index, 'unit_price', val)}
                                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none"
                                />
                              </div>
                            </div>

                            {/* Inline + Progressive Disclosure Trigger Strip for Line Item */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                              {!isServiceOrFee && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextOpen = !isIncludedOpen;
                                    disclosure.setLinePanelExpanded(index, 'included', nextOpen);
                                    if (nextOpen && (!item.sub_components || item.sub_components.length === 0)) {
                                      // Seed 1 blank Included Item row without touching item.unit_price or item.total_price!
                                      const seed = [
                                        {
                                          id: `sub_${Date.now()}_1`,
                                          sn: '1',
                                          item_name: '',
                                          remark: '',
                                          quantity: 1,
                                          unit: 'Nos',
                                          cost_price: 0,
                                          unit_price: 0,
                                          total_price: 0,
                                          line_total: 0,
                                          is_included_accessory: true
                                        }
                                      ];
                                      setLineItems((prev) => {
                                        const next = [...prev];
                                        next[index] = {
                                          ...next[index],
                                          is_composite_set: true,
                                          sub_components: seed
                                        };
                                        return next;
                                      });
                                    }
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer ${
                                    isIncludedOpen
                                      ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                      : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                  }`}
                                >
                                  <Plus className={`w-2.5 h-2.5 transition-transform ${isIncludedOpen ? 'rotate-45 text-indigo-600' : 'text-slate-400'}`} />
                                  <span>Included Items</span>
                                  {subCount > 0 && (
                                    <span className="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold">
                                      {subCount}
                                    </span>
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => disclosure.toggleLinePanel(index, 'specs')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer ${
                                  isSpecsOpen
                                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                }`}
                              >
                                <Plus className={`w-2.5 h-2.5 transition-transform ${isSpecsOpen ? 'rotate-45 text-blue-600' : 'text-slate-400'}`} />
                                <span>Tech Specs &amp; Attributes</span>
                                {specCount > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-mono font-bold">
                                    {specCount}
                                  </span>
                                )}
                              </button>

                              <button
                                type="button"
                                onClick={() => disclosure.toggleLinePanel(index, 'scope')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer ${
                                  isScopeOpen
                                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                }`}
                              >
                                <Plus className={`w-2.5 h-2.5 transition-transform ${isScopeOpen ? 'rotate-45 text-blue-600' : 'text-slate-400'}`} />
                                <span>Category &amp; Scope</span>
                                <span className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-600 dark:text-slate-300">
                                  {item.product_type || 'General'} · {shortOpt} ·{' '}
                                  {item.lead_time_note &&
                                  item.lead_time_note.trim() &&
                                  item.lead_time_note.trim() !== 'Ex-Stock / Standard'
                                    ? item.lead_time_note.trim()
                                    : deliveryPeriod?.trim() || item.lead_time_note?.trim() || 'Standard'}
                                </span>
                              </button>

                              {!isServiceOrFee && (
                                <button
                                  type="button"
                                  onClick={() => disclosure.toggleLinePanel(index, 'media')}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer ${
                                    isMediaOpen
                                      ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                      : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                  }`}
                                >
                                  <Plus className={`w-2.5 h-2.5 transition-transform ${isMediaOpen ? 'rotate-45 text-blue-600' : 'text-slate-400'}`} />
                                  <span>Brand, Model &amp; Media</span>
                                  {hasMediaOrBrand && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                  )}
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => disclosure.toggleLinePanel(index, 'cost')}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition inline-flex items-center gap-1 cursor-pointer ${
                                  isCostOpen
                                    ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                                    : 'bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700'
                                }`}
                              >
                                <Plus className={`w-2.5 h-2.5 transition-transform ${isCostOpen ? 'rotate-45 text-blue-600' : 'text-slate-400'}`} />
                                <span>Cost &amp; Margin</span>
                                {marginPct !== null && (
                                  <span
                                    className={`px-1.5 py-0.2 rounded font-mono text-[10px] font-bold ${
                                      marginPct >= 20
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                                        : marginPct >= 0
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                                    }`}
                                  >
                                    {marginPct.toFixed(1)}%
                                  </span>
                                )}
                                {isOverridden && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 text-[10px] font-mono font-bold">
                                    Overridden
                                  </span>
                                )}
                              </button>
                            </div>

                            {/* Expandable Panel 0: Included Items & Package Contents */}
                            {!isServiceOrFee && isIncludedOpen && (
                              <CompositePackageEditor
                                item={item}
                                isCompositeSet={true}
                                subComponents={item.sub_components || []}
                                packagePricingMode={item.package_pricing_mode || 'itemized'}
                                optionScopeNotes={item.option_scope_notes || ''}
                                parentQuantity={item.quantity || 1}
                                currency={formCurrency || 'AED'}
                                products={products || []}
                                activeWorkspace={activeWorkspace}
                                onChange={(patch) => {
                                  if (patch.is_composite_set === false) {
                                    disclosure.setLinePanelExpanded(index, 'included', false);
                                  }
                                  setLineItems((prev) => {
                                    const next = [...prev];
                                    next[index] = {
                                      ...next[index],
                                      ...patch
                                    };
                                    return next;
                                  });
                                }}
                              />
                            )}

                            {/* Expandable Panel 1: Category, Classification, Option Scope & Lead Time */}
                            {isScopeOpen && (
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 grid grid-cols-12 gap-3 animate-in fade-in duration-150">
                                <div className="col-span-12 sm:col-span-3 min-w-0">
                                  <div className="flex items-center justify-between h-5 mb-1">
                                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                      Classification
                                    </label>
                                  </div>
                                  <select
                                    value={
                                      (item as any).classification === 'Charge / Fee (Service)' || item.item_type === 'charge'
                                        ? 'charge'
                                        : (item as any).classification === 'Discount / Rebate' || item.item_type === 'discount'
                                        ? 'discount'
                                        : 'product'
                                    }
                                    onChange={(e) => handleLineItemChange(index, 'item_type', e.target.value)}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-sans font-medium"
                                  >
                                    <option value="product">Product (Hardware)</option>
                                    <option value="charge">Charge / Fee</option>
                                    <option value="discount">Discount / Rebate</option>
                                  </select>
                                </div>

                                <div className="col-span-12 sm:col-span-3 min-w-0">
                                  {item.item_type === 'charge' || item.item_type === 'discount' ? (
                                    <>
                                      <div className="flex items-center justify-between h-5 mb-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                          Charge Type
                                        </label>
                                      </div>
                                      <select
                                        value={item.charge_type || 'Transportation'}
                                        onChange={(e) => handleLineItemChange(index, 'charge_type', e.target.value)}
                                        className="w-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg py-1.5 px-2.5 text-xs text-amber-900 dark:text-amber-300 focus:outline-none font-sans font-semibold"
                                      >
                                        <option value="Transportation">Transportation / Freight</option>
                                        <option value="Installation">Installation &amp; Commissioning</option>
                                        <option value="Customs">Customs &amp; Clearance</option>
                                        <option value="Testing">Testing &amp; Inspection</option>
                                        <option value="Discount">Discount / Rebate</option>
                                        <option value="Other Charge">Other Non-Product Fee</option>
                                      </select>
                                    </>
                                  ) : (
                                    <>
                                      <div className="flex items-center justify-between h-5 mb-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                          Product Category
                                        </label>
                                        {renderSortButton(categoriesSort, setCategoriesSort, 'Product Categories')}
                                      </div>
                                      <CreatableCombobox
                                        options={sortedCategories}
                                        value={item.product_type}
                                        onChange={(val: string) => handleLineItemChange(index, 'product_type', val)}
                                        onCreateOption={(val: string) => {
                                          handleLineItemChange(index, 'product_type', val);
                                        }}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-sans font-medium"
                                      />
                                    </>
                                  )}
                                </div>

                                <div className="col-span-12 sm:col-span-3 min-w-0">
                                  <div className="flex items-center justify-between h-5 mb-1">
                                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                      Option Scope
                                    </label>
                                  </div>
                                  <select
                                    value={(item as any).option_designation || item.option || 'Default / Included'}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      handleLineItemChange(index, 'option', val);
                                      handleLineItemChange(index, 'option_designation' as any, val);
                                    }}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none font-sans font-medium"
                                  >
                                    <option value="Default / Included">Baseline / Included</option>
                                    <option value="Option A">Option A (Baseline)</option>
                                    <option value="Option B">Option B (Alternative)</option>
                                    <option value="Option C">Option C (Alternative)</option>
                                    <option value="Option D">Option D (Alternative)</option>
                                    <option value="Optional / Add-On">Optional / Add-On</option>
                                    {((item as any).option_designation || item.option) &&
                                      ![
                                        'Default / Included',
                                        'Option A',
                                        'Option B',
                                        'Option C',
                                        'Option D',
                                        'Optional / Add-On',
                                        ''
                                      ].includes((item as any).option_designation || item.option) && (
                                        <option value={(item as any).option_designation || item.option}>
                                          {(item as any).option_designation || item.option}
                                        </option>
                                      )}
                                  </select>
                                </div>

                                {(() => {
                                  const isDiscount =
                                    (item as any).classification === 'Discount / Rebate' || item.item_type === 'discount';
                                  const isService =
                                    (item as any).classification === 'Charge / Fee (Service)' ||
                                    item.item_type === 'charge' ||
                                    (item.item_type as string) === 'service';

                                  if (isDiscount) {
                                    return <div className="col-span-12 sm:col-span-3 opacity-0 pointer-events-none" />;
                                  }

                                  return (
                                    <div className="col-span-12 sm:col-span-3 min-w-0">
                                      <div className="flex items-center justify-between h-5 mb-1">
                                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                          {isService ? 'Duration' : 'Lead Time'}
                                        </label>
                                      </div>
                                      <input
                                        type="text"
                                        placeholder={isService ? 'e.g. 1–2 Days' : 'Ex-Stock / 2-3 Wks'}
                                        value={item.lead_time_note ?? ''}
                                        onChange={(e) => handleLineItemChange(index, 'lead_time_note', e.target.value)}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none"
                                      />
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* Expandable Panel 2: Item Description & Technical Specification Attributes */}
                            {isSpecsOpen && (
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 space-y-3 animate-in fade-in duration-150">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate">
                                      Item Description &amp; Technical Specifications
                                    </label>
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const cur = (item.description ?? '').trim();
                                          const next = cur
                                            ? `${cur}\n\nMOTOR SPECIFICATIONS:-\n• `
                                            : `MOTOR SPECIFICATIONS:-\n• `;
                                          handleLineItemChange(index, 'description', next);
                                        }}
                                        className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 text-slate-700 hover:text-blue-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                                        title="Insert a bold uppercase sub-heading section (e.g. MOTOR SPECIFICATIONS:-)"
                                      >
                                        + Sub-Heading
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const cur = item.description ?? '';
                                          const next = cur.trim()
                                            ? `${cur.replace(/\s+$/, '')}\n• `
                                            : `• `;
                                          handleLineItemChange(index, 'description', next);
                                        }}
                                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 text-slate-700 hover:text-blue-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                                        title="Insert a bullet point line"
                                      >
                                        • Bullet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const formatted = formatSlashSeparatedDescription(item.description ?? '');
                                          if (formatted) {
                                            handleLineItemChange(index, 'description', formatted);
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition cursor-pointer"
                                        title="Automatically split slash-separated (' / ') technical specs and section headings into clean multi-line blocks"
                                      >
                                        <Sparkles className="w-2.5 h-2.5 shrink-0" />
                                        <span>Split &ldquo;/&rdquo; into Lines</span>
                                      </button>
                                    </div>
                                  </div>
                                  <textarea
                                    rows={Math.min(8, Math.max(3, (item.description || '').split('\n').length))}
                                    placeholder={"e.g. Supply of Submersible Mixer for Anoxic Tank.\nMOTOR SPECIFICATIONS:-\n• Make: PYTHON\n• Origin: Poland\n• Power: 2.5 kW"}
                                    value={item.description ?? ''}
                                    onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                                    className="w-full bg-slate-50/70 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none leading-relaxed resize-y"
                                  />
                                </div>

                                {!isServiceOrFee && (
                                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center flex-wrap gap-1.5">
                                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold mr-1">
                                          Spec Attributes:
                                        </span>
                                        {(() => {
                                          const categoryPresets = CATEGORY_SUGGESTED_ATTRIBUTES[item.product_type];
                                          const currentPresets =
                                            categoryPresets && categoryPresets.length > 0
                                              ? categoryPresets
                                              : DEFAULT_QUICK_ATTRIBUTES;
                                          const existingKeys = new Set(
                                            (item.attributes || []).map((a) => a.key.trim().toLowerCase())
                                          );
                                          const availablePresets = currentPresets.filter(
                                            (p) => !existingKeys.has(p.toLowerCase())
                                          );

                                          return availablePresets.map((preset) => (
                                            <button
                                              key={preset}
                                              type="button"
                                              onClick={() => {
                                                const updated = [...lineItems];
                                                const attrList = [...(updated[index].attributes || [])];
                                                attrList.push({ key: preset, value: '' });
                                                updated[index] = { ...updated[index], attributes: attrList };
                                                setLineItems(updated);
                                              }}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-blue-950/40 text-slate-600 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300 border border-slate-200/80 hover:border-blue-300 dark:border-slate-700 dark:hover:border-blue-700 transition cursor-pointer"
                                            >
                                              <Plus className="w-2.5 h-2.5 shrink-0 opacity-70" />
                                              <span>{preset}</span>
                                            </button>
                                          ));
                                        })()}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...lineItems];
                                            const attrList = [...(updated[index].attributes || [])];
                                            attrList.push({ key: '__custom_editing__', value: '' });
                                            updated[index] = { ...updated[index], attributes: attrList };
                                            setLineItems(updated);
                                          }}
                                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-dashed border-blue-300 dark:border-blue-800 transition cursor-pointer"
                                        >
                                          <Plus className="w-2.5 h-2.5 shrink-0" />
                                          <span>Custom Attribute</span>
                                        </button>
                                      </div>
                                    </div>

                                    {item.attributes && item.attributes.length > 0 && (
                                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                                        {item.attributes.map((attr, attrIdx) => {
                                          const suggestedKeys = CATEGORY_SUGGESTED_ATTRIBUTES[item.product_type] || [];
                                          const isCustom = attr.key && !suggestedKeys.includes(attr.key);
                                          const showCustomInput =
                                            isCustom || attr.key === '__custom_editing__' || suggestedKeys.length === 0;

                                          return (
                                            <div
                                              key={attrIdx}
                                              className="flex items-center gap-2 bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-1.5 rounded-lg shadow-2xs"
                                            >
                                              {showCustomInput ? (
                                                <div className="w-28 sm:w-36 flex-shrink-0 flex items-center gap-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium text-xs px-2 py-1.5 rounded-md border border-slate-200/80 dark:border-slate-700 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-colors">
                                                  <input
                                                    type="text"
                                                    value={attr.key === '__custom_editing__' ? '' : attr.key ?? ''}
                                                    placeholder="Key"
                                                    onChange={(e) => {
                                                      const updated = [...lineItems];
                                                      const attrList = [...(updated[index].attributes || [])];
                                                      attrList[attrIdx] = {
                                                        ...attrList[attrIdx],
                                                        key: e.target.value
                                                      };
                                                      updated[index] = { ...updated[index], attributes: attrList };
                                                      setLineItems(updated);
                                                    }}
                                                    className="w-full bg-transparent border-0 focus:ring-0 p-0 text-xs text-slate-800 dark:text-slate-200 font-semibold focus:outline-none truncate"
                                                  />
                                                  {suggestedKeys.length > 0 && (
                                                    <button
                                                      type="button"
                                                      title="Back to suggestions"
                                                      onClick={() => {
                                                        const updated = [...lineItems];
                                                        const attrList = [...(updated[index].attributes || [])];
                                                        attrList[attrIdx] = { ...attrList[attrIdx], key: '' };
                                                        updated[index] = { ...updated[index], attributes: attrList };
                                                        setLineItems(updated);
                                                      }}
                                                      className="text-[9px] text-blue-600 dark:text-blue-400 hover:underline font-bold px-0.5 shrink-0 cursor-pointer"
                                                    >
                                                      List
                                                    </button>
                                                  )}
                                                </div>
                                              ) : (
                                                <select
                                                  value={attr.key ?? ''}
                                                  title={attr.key || 'Select Attribute Key'}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    const updated = [...lineItems];
                                                    const attrList = [...(updated[index].attributes || [])];
                                                    if (val === '__custom__') {
                                                      attrList[attrIdx] = {
                                                        ...attrList[attrIdx],
                                                        key: '__custom_editing__'
                                                      };
                                                    } else {
                                                      attrList[attrIdx] = { ...attrList[attrIdx], key: val };
                                                    }
                                                    updated[index] = { ...updated[index], attributes: attrList };
                                                    setLineItems(updated);
                                                  }}
                                                  className="w-28 sm:w-36 flex-shrink-0 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium text-xs px-2 py-1.5 rounded-md border border-slate-200/80 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors cursor-pointer truncate"
                                                >
                                                  <option value="">Select Key...</option>
                                                  {suggestedKeys.map((k) => (
                                                    <option key={k} value={k}>
                                                      {k}
                                                    </option>
                                                  ))}
                                                  <option value="__custom__">+ Custom Key...</option>
                                                </select>
                                              )}
                                              <input
                                                type="text"
                                                value={attr.value ?? ''}
                                                placeholder="Value (e.g. 10m3 / SS316)"
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  const updated = [...lineItems];
                                                  const attrList = [...(updated[index].attributes || [])];
                                                  attrList[attrIdx] = {
                                                    ...attrList[attrIdx],
                                                    value: val
                                                  };
                                                  const currentKey = (attrList[attrIdx]?.key || '').trim().toLowerCase();
                                                  const isDeliveryKey = currentKey === 'delivery' || currentKey === 'lead time' || currentKey === 'availability';
                                                  const targetItem = {
                                                    ...updated[index],
                                                    attributes: attrList,
                                                    ...(isDeliveryKey
                                                      ? {
                                                          lead_time_note: val,
                                                          delivery_time: val,
                                                          lead_time: val,
                                                          availability: val,
                                                          specifications: {
                                                            ...(updated[index].specifications || {}),
                                                            Delivery: val,
                                                            'Lead Time': val
                                                          }
                                                        }
                                                      : {})
                                                  };
                                                  updated[index] = targetItem;
                                                  setLineItems(updated);
                                                }}
                                                className="flex-1 min-w-0 bg-transparent border-0 focus:ring-0 px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                                              />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const updated = [...lineItems];
                                                  const attrList = (updated[index].attributes || []).filter(
                                                    (_, i) => i !== attrIdx
                                                  );
                                                  updated[index] = { ...updated[index], attributes: attrList };
                                                  setLineItems(updated);
                                                }}
                                                className="p-1 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md transition shrink-0 cursor-pointer"
                                              >
                                                <X className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Expandable Panel 3: Brand, Model, Origin, Product Image & Datasheet */}
                            {!isServiceOrFee && isMediaOpen && (
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 animate-in fade-in duration-150">
                                <LineItemTier3BMediaGrid
                                  index={index}
                                  item={item}
                                  matchedProd={matchedProd}
                                  effectiveImageUrl={effectiveImageUrl}
                                  effectiveDatasheet={effectiveDatasheet}
                                  activeWorkspace={activeWorkspace}
                                  triggerToast={triggerToast}
                                  handleLineItemChange={handleLineItemChange}
                                  onSyncToCatalog={
                                    matchedProd
                                      ? async () => {
                                          await syncLineItemToCatalogProduct(
                                            item,
                                            matchedProd,
                                            setProducts,
                                            triggerToast,
                                            formCurrency
                                          );
                                        }
                                      : undefined
                                  }
                                  onPatchMedia={(patch) => {
                                    setLineItems((prev) => {
                                      const next = [...prev];
                                      next[index] = {
                                        ...next[index],
                                        ...patch
                                      };
                                      return next;
                                    });
                                  }}
                                />
                              </div>
                            )}

                            {/* Expandable Panel 4: Supplier Cost, Gross Margin & Line Total Override */}
                            {isCostOpen && (
                              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center animate-in fade-in duration-150">
                                <div className="sm:col-span-4 min-w-0">
                                  <div className="flex items-center justify-between gap-1 h-5 mb-1 min-w-0">
                                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                                      Unit Cost ({formCurrency})
                                    </label>
                                    {marginPct !== null ? (
                                      <span
                                        className={`font-mono tabular-nums text-[10px] font-bold px-1.5 py-0.2 rounded whitespace-nowrap shrink-0 ${
                                          marginPct >= 20
                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                            : marginPct >= 0
                                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                            : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                        }`}
                                      >
                                        {marginPct.toFixed(1)}% Margin
                                      </span>
                                    ) : (
                                      <span className="text-[10px] font-mono text-slate-400 whitespace-nowrap shrink-0">
                                        Base Cost
                                      </span>
                                    )}
                                  </div>
                                  <FormattedNumberInput
                                    value={item.cost_price ?? ''}
                                    placeholder="0.00"
                                    onChange={(val: number) => handleLineItemChange(index, 'cost_price', val)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white font-mono tabular-nums focus:outline-none"
                                  />
                                </div>

                                <div className="sm:col-span-8 flex flex-wrap items-center justify-between gap-2 bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3.5 py-2">
                                  <div className="flex items-center gap-2 flex-wrap text-xs font-mono tabular-nums">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                      Line Total ({formCurrency})
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                      {qtyVal} {cleanUom} × {formCurrency}{' '}
                                      {unitVal.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2 font-mono tabular-nums">
                                    {isEditingOverride ? (
                                      <>
                                        <FormattedNumberInput
                                          value={item.total_price}
                                          onChange={(val: number) => handleLineItemChange(index, 'total_price', val)}
                                          className="w-32 bg-white dark:bg-slate-900 border border-blue-400 dark:border-blue-600 rounded-lg py-1 px-2.5 text-xs font-bold text-slate-900 dark:text-white text-right focus:outline-none focus:ring-2 focus:ring-blue-500/20 shrink-0"
                                        />
                                        {isOverridden ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              handleLineItemChange(index, 'total_price', calcTotal);
                                              setEditingLineTotalIdx(null);
                                            }}
                                            className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 transition cursor-pointer whitespace-nowrap"
                                          >
                                            Reset
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setEditingLineTotalIdx(null)}
                                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-sans font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer whitespace-nowrap"
                                          >
                                            Done
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                                        {formCurrency}{' '}
                                        {currentTotal.toLocaleString(undefined, {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}
                                      </span>
                                    )}

                                    {!isEditingOverride && !isReadOnly && (
                                      <button
                                        type="button"
                                        onClick={() => setEditingLineTotalIdx(index)}
                                        className="px-2 py-0.5 rounded-md text-[10px] font-sans font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 bg-white hover:bg-blue-50 dark:bg-slate-900 dark:hover:bg-blue-950/40 border border-slate-200/80 dark:border-slate-700 transition cursor-pointer whitespace-nowrap"
                                      >
                                        Override Total
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 p-8 text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800/70 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Package className="w-5 h-5" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">
                    No Proposal Line Items Added Yet
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                    Add custom equipment lines, insert pre-configured items from the product catalog, or paste an RFQ above for AI extraction.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2.5 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleAddLineItem}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold font-sans transition inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Item Line</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkingLineIndex(null);
                      setShowCatalogModal(true);
                    }}
                    className="px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold font-sans transition inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Browse Catalog</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Chapter 3: 3. Financial Summary, Terms & Source Files */}
          <div id="field-value" className="scroll-mt-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center shrink-0 border border-blue-200/60 dark:border-blue-800/60">
                  3
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
                    Financial Summary, Terms &amp; Source Files
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    Live profitability &amp; VAT summary — expand pipeline dates, commercial terms, or AI files on demand
                  </p>
                </div>
              </div>
              {isLumpSum && (
                <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10px] font-mono font-bold text-amber-700 dark:text-amber-300">
                  Lump-Sum Override Active
                </span>
              )}
            </div>

            {/* Unified Financial & VAT Summary Strip (Always Visible in Default 80/20 Flow) */}
            {(() => {
              const baselineList = lineItems.filter((li) => {
                const opt = String((li as any).option_designation || li.option || 'Default / Included').trim();
                return !opt || opt === 'Default / Included' || opt === 'Baseline / All' || opt === 'Option A' || opt.startsWith('Option A ');
              });
              const calcList = baselineList.length > 0 ? baselineList : lineItems;
              const totalSelling = calcList.reduce((sum, li) => {
                const isDisc = li.item_type === 'discount' || (li as any).classification === 'Discount / Rebate';
                const lineVal = Number(li.total_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
                return isDisc ? sum - Math.abs(lineVal) : sum + lineVal;
              }, 0);
              const totalCost = calcList.reduce((sum, li) => {
                const isDisc = li.item_type === 'discount' || (li as any).classification === 'Discount / Rebate';
                if (isDisc) return sum;
                return sum + (Number(li.quantity) || 0) * (Number(li.cost_price) || 0);
              }, 0);
              const effectiveSubtotal = isLumpSum ? (Number(manualValue) || 0) : totalSelling;
              const vatAmount = Math.round(effectiveSubtotal * 0.05 * 100) / 100;
              const grandTotalInclVat = effectiveSubtotal + vatAmount;
              const hasAnyCost = calcList.some((li) => (Number(li.cost_price) || 0) > 0);
              const grossProfit = effectiveSubtotal - totalCost;
              const marginPct = effectiveSubtotal > 0 && hasAnyCost ? (grossProfit / effectiveSubtotal) * 100 : null;

              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                          Financial &amp; VAT Summary
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">
                          ({isLumpSum ? 'Lump-Sum Basis' : `${lineItems.length} Line Item${lineItems.length === 1 ? '' : 's'}`})
                        </span>
                      </div>

                      <label
                        htmlFor="lump-sum-chk"
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-300 font-mono cursor-pointer uppercase select-none"
                      >
                        <input
                          type="checkbox"
                          id="lump-sum-chk"
                          checked={isLumpSum}
                          onChange={(e) => setIsLumpSum(e.target.checked)}
                          className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Manual Lump-Sum Override</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {((optionBreakdown?.optionTotals && Object.keys(optionBreakdown.optionTotals).length > 0) || Number(optionBreakdown?.optionalAddonsTotal || 0) > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {Object.entries(optionBreakdown?.optionTotals || {}).map(([optName, optTotal]) => (
                            <span
                              key={optName}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/60"
                              title={`${optName} Alternative Subtotal`}
                            >
                              <span className="font-semibold">{optName}:</span>
                              <span>{formCurrency} {Number(optTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </span>
                          ))}
                          {Number(optionBreakdown?.optionalAddonsTotal || 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60"
                              title="Optional / Add-On Electives Total"
                            >
                              <span className="font-semibold">Optionals:</span>
                              <span>+{formCurrency} {Number(optionBreakdown?.optionalAddonsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {marginPct !== null && (
                        <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                          <span>
                            <span className="text-slate-400 mr-1">Est. Profit:</span>
                            <span className={`font-bold ${grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                              {formCurrency} {grossProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                              marginPct >= 20
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                                : marginPct >= 0
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60'
                            }`}
                          >
                            {marginPct.toFixed(1)}% Gross Margin
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`grid grid-cols-1 sm:grid-cols-2 ${
                      isPreviewActive ? 'xl:grid-cols-2' : 'lg:grid-cols-4'
                    } gap-2.5 text-xs font-mono tabular-nums`}
                  >
                    <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-400 uppercase block leading-tight">Total Cost</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                        {hasAnyCost
                          ? `${formCurrency} ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : `${formCurrency} 0.00`}
                      </span>
                    </div>

                    <div className={`bg-slate-50/80 dark:bg-slate-800/50 border ${isLumpSum ? 'border-blue-400 dark:border-blue-600 ring-2 ring-blue-500/15' : 'border-slate-200/80 dark:border-slate-700/80'} rounded-xl px-3 py-2 flex flex-col justify-between ${getHighlightClasses('value')}`}>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold block leading-tight">
                        Net Total (Excl. VAT)
                      </span>
                      {isLumpSum ? (
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">{formCurrency}</span>
                          <FormattedNumberInput
                            value={manualValue}
                            onChange={(val: number) => setManualValue(val)}
                            className="w-full bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-700 rounded px-1.5 py-0.5 text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none font-mono"
                          />
                        </div>
                      ) : (
                        <span className="font-bold text-slate-900 dark:text-white mt-0.5">
                          {formCurrency} {effectiveSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {formCurrency === 'USD' ? (
                        <span className="text-blue-500 dark:text-blue-400 font-semibold text-[10px] whitespace-nowrap mt-0.5 block">
                          ≈ AED {Number(effectiveSubtotal * 3.6725).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-blue-500 dark:text-blue-400 font-semibold text-[10px] whitespace-nowrap mt-0.5 block">
                          ≈ ${Number(effectiveSubtotal / 3.6725).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </span>
                      )}
                    </div>

                    <div className="bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 rounded-xl px-3 py-2 flex flex-col justify-between">
                      <span className="text-[10px] text-slate-400 uppercase block leading-tight">5% VAT</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                        {formCurrency} {vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800 rounded-xl px-3 py-2 flex flex-col justify-between">
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-bold block leading-tight">Grand Total (Incl. VAT)</span>
                      <span className="font-bold text-blue-700 dark:text-blue-300 mt-0.5">
                        {formCurrency} {grandTotalInclVat.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Chapter 4 Progressive Disclosure Trigger Bar */}
            {(() => {
              const hasPipelineDatesData = Boolean(projectedOrderDate || nextFollowupDate);
              const showPipelineDates = disclosure.expandedSections.pipelineDates || hasPipelineDatesData;

              const hasRemarksTermsData = Boolean(
                (remarks && remarks.trim()) ||
                  (invoicePoNo && invoicePoNo.trim()) ||
                  (paymentStatus && paymentStatus.trim()) ||
                  (priceBasis && priceBasis.trim()) ||
                  (deliveryPeriod && deliveryPeriod.trim()) ||
                  (paymentTerms && paymentTerms.trim())
              );
              const showRemarksTerms = disclosure.expandedSections.remarksTerms || hasRemarksTermsData;

              const hasSourceFilesData = attachments.length > 0 || isExtracting || uploading || Boolean(extractionError);
              const showSourceFiles = disclosure.expandedSections.sourceFiles || hasSourceFilesData;

              return (
                <>
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => disclosure.toggleSection('pipelineDates')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        showPipelineDates
                          ? 'bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      {showPipelineDates ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-blue-500" />}
                      <span>Pipeline Status &amp; Follow-up Dates</span>
                      <span className="px-1.5 py-0.2 rounded bg-white/80 dark:bg-slate-900/80 text-[10px] font-mono text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
                        {normalizeEnquiryStatus(status)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => disclosure.toggleSection('remarksTerms')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        showRemarksTerms
                          ? 'bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    >
                      {showRemarksTerms ? <ChevronUp className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-blue-500" />}
                      <span>Commercial Terms, PO &amp; Remarks</span>
                      {hasRemarksTermsData && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-[10px] font-mono text-blue-700 dark:text-blue-300">
                          Active
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => disclosure.toggleSection('sourceFiles')}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        showSourceFiles
                          ? 'bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
                      }`}
                    >
                      {showSourceFiles ? <ChevronUp className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-500" />}
                      <span>Source PDF / Excel AI Autofill &amp; Files</span>
                      {attachments.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/60 text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
                          {attachments.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Collapsible Subsection 4A: Pipeline Status & Follow-up Dates */}
                  {showPipelineDates && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150">
                      <div className="min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block truncate">
                          Enquiry Status
                        </label>
                        <select
                          value={normalizeEnquiryStatus(status)}
                          onChange={(e) => setStatus(e.target.value as EnquiryStatus)}
                          className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:outline-none font-sans"
                        >
                          {PIPELINE_STATUS_GROUPS.map((group) => (
                            <optgroup
                              key={group.label}
                              label={group.label}
                              className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]"
                            >
                              {group.options.map((st) => (
                                <option
                                  key={st}
                                  value={st}
                                  className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs font-normal"
                                >
                                  {st}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                          {status && !PIPELINE_STATUS_GROUPS.some((g) => (g.options as readonly string[]).includes(normalizeEnquiryStatus(status))) && (
                            <optgroup label="Other / Legacy" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                              <option value={status} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 normal-case font-sans text-xs">
                                {status}
                              </option>
                            </optgroup>
                          )}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block truncate">
                          Estimated Order Date
                        </label>
                        <input
                          type="date"
                          placeholder="YYYY-MM-DD"
                          value={projectedOrderDate}
                          onChange={(e) => setProjectedOrderDate(e.target.value)}
                          className="dark:[color-scheme:dark] w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:outline-none font-mono"
                        />
                      </div>

                      <div className="min-w-0">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 block truncate">
                          Next Follow-up Date
                        </label>
                        <input
                          type="date"
                          placeholder="YYYY-MM-DD"
                          value={nextFollowupDate}
                          onChange={(e) => setNextFollowupDate(e.target.value)}
                          className="dark:[color-scheme:dark] w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:outline-none font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {/* Collapsible Subsection 4C: Commercial Terms & Remarks */}
                  {showRemarksTerms && (
                    <div className="border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-4 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                            Commercial Terms &amp; Remarks
                          </span>
                        </div>
                        <span className="text-[10.5px] text-slate-500">
                          Automatically flows into Quotation Studio &amp; Draft Proposals
                        </span>
                      </div>

                      {/* Structured Quotation Commercial Terms Grid */}
                      <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                        <div
                          className={`grid grid-cols-1 sm:grid-cols-2 ${
                            isPreviewActive ? 'xl:grid-cols-2' : 'lg:grid-cols-4'
                          } gap-3`}
                        >
                          {/* 1. Offer Validity (Days) + Valid Until Preview */}
                          <div id="field-validity_days">
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10.5px] font-bold uppercase text-slate-600 dark:text-slate-300">
                                Offer Validity (Days)
                              </label>
                              <span className="text-[10px] font-mono font-semibold text-blue-600 dark:text-blue-400">
                                Until:{' '}
                                {(() => {
                                  const base = new Date(enquiryDate || Date.now());
                                  const d = !isNaN(base.getTime()) ? base : new Date();
                                  d.setDate(d.getDate() + (Number(validityDays) > 0 ? Number(validityDays) : 30));
                                  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                })()}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                max={365}
                                value={validityDays}
                                onChange={(e) => setValidityDays(Math.max(1, Number(e.target.value) || 30))}
                                className={`w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 ${getHighlightClasses('validity_days')}`}
                              />
                              <div className="flex items-center gap-1 flex-wrap">
                                {[7, 15, 30, 60].map((dVal) => (
                                  <button
                                    key={dVal}
                                    type="button"
                                    onClick={() => setValidityDays(dVal)}
                                    className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition cursor-pointer ${
                                      Number(validityDays) === dVal
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    {dVal}d
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* 2. Price Basis / Incoterms */}
                          <div id="field-price_basis">
                            <label className="block text-[10.5px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                              Price Basis / Incoterms
                            </label>
                            <input
                              type="text"
                              list="enquiry-price-basis-presets"
                              value={priceBasis}
                              onChange={(e) => setPriceBasis(e.target.value)}
                              placeholder="e.g. EX Warehouse Ajman, UAE"
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 ${getHighlightClasses('price_basis')}`}
                            />
                            <datalist id="enquiry-price-basis-presets">
                              <option value="EX Warehouse Ajman, UAE" />
                              <option value="Ex-Works Warehouse" />
                              <option value="DDP Client Site" />
                              <option value="CIF / FOB Port" />
                            </datalist>
                          </div>

                          {/* 3. Delivery Period */}
                          <div id="field-delivery_period">
                            <label className="block text-[10.5px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                              Delivery Period
                            </label>
                            <input
                              type="text"
                              list="enquiry-delivery-period-presets"
                              value={deliveryPeriod}
                              onChange={(e) => setDeliveryPeriod(e.target.value)}
                              placeholder="e.g. As mentioned against each item"
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 ${getHighlightClasses('delivery_period')}`}
                            />
                            <datalist id="enquiry-delivery-period-presets">
                              <option value="As mentioned against each item" />
                              <option value="Ex-Stock / Immediate" />
                              <option value="1 - 2 Weeks from order" />
                              <option value="4 - 6 Weeks from advance" />
                            </datalist>
                          </div>

                          {/* 4. VAT / Tax Mode */}
                          <div id="field-tax_mode">
                            <label className="block text-[10.5px] font-bold uppercase text-slate-600 dark:text-slate-300 mb-1">
                              VAT / Tax Mode
                            </label>
                            <select
                              value={
                                (taxMode as string) === 'inclusive'
                                  ? 'tax_calculated'
                                  : (taxMode as string) === 'zero_rated'
                                  ? 'tax_exempt'
                                  : taxMode
                              }
                              onChange={(e) => setTaxMode(e.target.value as QuotationTaxMode)}
                              className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-2.5 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 ${getHighlightClasses('tax_mode')}`}
                            >
                              <option value="taxes_extra">5% Standard VAT (Extra)</option>
                              <option value="tax_calculated">VAT Included in Total</option>
                              <option value="tax_exempt">0% Zero-Rated / Export</option>
                              <option value="vat_excluded_extra">VAT Excluded (Extra as Applicable)</option>
                              <option value="vat_hidden">Hide VAT Line</option>
                            </select>
                          </div>
                        </div>

                        {/* 5. Payment Terms with Quick Preset Chips */}
                        <div id="field-payment_terms">
                          <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                            <label className="text-[10.5px] font-bold uppercase text-slate-600 dark:text-slate-300">
                              Payment Terms (Quotation Commercial Clause)
                            </label>
                            <div className="flex items-center gap-1 flex-wrap">
                              {[
                                '50% advance to reserve and 50% before collection',
                                '30 days PDC from Invoice & Collection',
                                '100% Advance against PI'
                              ].map((presetTerm) => (
                                <button
                                  key={presetTerm}
                                  type="button"
                                  onClick={() => setPaymentTerms(presetTerm)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition cursor-pointer ${
                                    paymentTerms === presetTerm
                                      ? 'bg-blue-600 text-white border-blue-600'
                                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-blue-50'
                                  }`}
                                >
                                  {presetTerm}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            value={paymentTerms}
                            onChange={(e) => setPaymentTerms(e.target.value)}
                            placeholder="e.g. 50% advance to reserve and 50% before collection / 30 days PDC from Invoice & Collection"
                            className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-1.5 px-3 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 ${getHighlightClasses('payment_terms')}`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div id="field-remarks" className="md:col-span-2">
                          <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">Remarks / Status Updates</MarqueeLabel>
                          <textarea
                            rows={3}
                            placeholder="e.g. Quotation sent. Customer requested 5% discount."
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            className={`w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-2 px-3 text-sm text-slate-900 dark:text-white focus:outline-none font-sans ${getHighlightClasses('remarks')}`}
                          />
                        </div>

                        <div className="space-y-3">
                          <div>
                            <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">Invoice PO #</MarqueeLabel>
                            <input
                              type="text"
                              placeholder="e.g. PO-4500989583"
                              value={invoicePoNo}
                              onChange={(e) => setInvoicePoNo(e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-3 text-sm text-slate-900 dark:text-white focus:outline-none font-mono"
                            />
                          </div>
                          <div>
                            <MarqueeLabel className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">Payment Status</MarqueeLabel>
                            <input
                              type="text"
                              placeholder="e.g. 50% Advance, 50% PDC"
                              value={paymentStatus}
                              onChange={(e) => setPaymentStatus(e.target.value)}
                              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-lg py-1.5 px-3 text-sm text-slate-900 dark:text-white focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Subsection 3C: Source PDF Proposal & Excel AI Data */}
                  <div id="field-source_files" className={`scroll-mt-4 ${showSourceFiles ? 'border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-3 animate-in fade-in duration-150' : 'hidden'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Source PDF Proposal &amp; Excel AI Data</span>
                      </span>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Compact Cloud / Local destination pill when Cloud Storage is configured */}
                        {Boolean(activeWorkspace?.settings?.storage?.supabaseUrl && activeWorkspace?.settings?.storage?.bucket && activeWorkspace?.settings?.storage?.supabaseAnonKey) && (
                          <div
                            className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/80 dark:border-slate-700"
                            title={`Storage Target: ${activeWorkspace?.settings?.storage?.bucket}`}
                          >
                            <button
                              type="button"
                              onClick={() => setUploadTarget('cloud')}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md transition cursor-pointer ${
                                uploadTarget === 'cloud'
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                              }`}
                            >
                              <Cloud className="w-3 h-3" />
                              <span>Cloud</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setUploadTarget('local')}
                              className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded-md transition cursor-pointer ${
                                uploadTarget === 'local'
                                  ? 'bg-amber-600 text-white shadow-2xs'
                                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                              }`}
                            >
                              <HardDrive className="w-3 h-3" />
                              <span>Local</span>
                            </button>
                          </div>
                        )}

                        {attachments.length > 0 && !uploading && (
                          <label className="relative inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-semibold text-xs rounded-lg border border-blue-200 dark:border-blue-800 shadow-2xs transition cursor-pointer">
                            <input
                              type="file"
                              multiple
                              accept="application/pdf,image/png,image/jpeg,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,message/rfc822,.eml"
                              onChange={handleFileUpload}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <Plus className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                            <span>Attach File</span>
                          </label>
                        )}

                        <button
                          type="button"
                          onClick={() => setRawTextModalOpen(true)}
                          className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs rounded-lg border border-emerald-200 dark:border-emerald-800 shadow-2xs transition cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>Paste Excel / Text</span>
                        </button>

                        <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setAiScanMode('fast')}
                            className={`px-2 py-1 rounded-md transition cursor-pointer ${
                              aiScanMode === 'fast'
                                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                            title="Fast Scan (Gemini 2.5 Flash — best for 1-3 page quotes & RFQs)"
                          >
                            ⚡ Fast Scan
                          </button>
                          <button
                            type="button"
                            onClick={() => setAiScanMode('deep')}
                            className={`px-2 py-1 rounded-md transition cursor-pointer ${
                              aiScanMode === 'deep'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                            title="Deep Scan (180s budget — best for multi-page BOQs & complex tables)"
                          >
                            🔍 Deep Scan (180s)
                          </button>
                        </div>

                        <select
                          value={selectedAiModel}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSelectedAiModel(val);
                            localStorage.setItem('omni_gemini_model_preference', val);
                          }}
                          title="Select Gemini Engine"
                          aria-label="Select Gemini Engine"
                          className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 font-medium text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                        >
                          {AVAILABLE_GEMINI_MODELS.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}
                            </option>
                          ))}
                        </select>

                        {isExtracting && (
                          <button
                            type="button"
                            onClick={handleStopExtraction}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
                            title="Stop AI Autofill immediately and keep source files attached"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Stop Autofill</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Full dropzone only when 0 attachments or actively uploading */}
                    {(attachments.length === 0 || uploading) && (
                      <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-xl p-5 text-center transition duration-150 cursor-pointer relative bg-white/50 dark:bg-slate-900/50">
                        <input
                          type="file"
                          multiple
                          accept="application/pdf,image/png,image/jpeg,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,message/rfc822,.eml"
                          onChange={handleFileUpload}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <Paperclip className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-1.5" />
                        <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 block font-sans">
                          {uploading ? (
                            <div className="flex flex-col items-center justify-center space-y-1.5">
                              <div className="flex items-center space-x-2">
                                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                <span>Stage 1/2: Syncing "{currentUploadingFile || 'file...'}"</span>
                              </div>
                              {uploadProgress !== null && (
                                <span className="text-xs font-mono text-blue-500 font-semibold">
                                  {uploadProgress}% Uploaded
                                </span>
                              )}
                            </div>
                          ) : (
                            <span>Drag and Drop or Click to Attach Proposal / RFQ Files</span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5 block">
                          Supports PDF, Word (.docx), Email (.eml), images, and text files • Click "Autofill Form" below to extract details
                        </span>

                        {uploading && uploadProgress !== null && (
                          <div className="w-full max-w-xs bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full mx-auto mt-2.5 overflow-hidden">
                            <div
                              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Persistent AI Extraction / API Key Notice Banner */}
                    {extractionError && (
                      <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/60 rounded-xl p-4 space-y-3 font-sans shadow-2xs animate-in fade-in duration-200">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-2.5">
                            <KeyRound className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <h5 className="text-xs font-bold text-amber-900 dark:text-amber-300 font-sans uppercase tracking-wider">
                                {extractionError.includes('401') || extractionError.includes('API Key') || extractionError.includes('invalid') || extractionError.includes('unconfigured')
                                  ? 'Gemini API Key Required'
                                  : 'AI Extraction Notice'}
                              </h5>
                              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed font-sans">
                                {extractionError}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExtractionError(null)}
                            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 p-1 rounded-lg hover:bg-amber-100/50 dark:hover:bg-amber-900/40 transition cursor-pointer"
                            title="Dismiss notice"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {(extractionError.includes('401') || extractionError.includes('API Key') || extractionError.includes('Settings')) && (
                          <div className="bg-white/90 dark:bg-slate-900/90 border border-amber-200/80 dark:border-amber-800/50 rounded-xl p-3 space-y-2 text-[11px] text-slate-700 dark:text-slate-300 font-sans shadow-2xs">
                            <p className="font-bold text-slate-800 dark:text-white flex items-center space-x-1.5">
                              <Info className="w-3.5 h-3.5 text-blue-600" />
                              <span>How to configure or update your Gemini API Key in AI Studio:</span>
                            </p>
                            <ol className="list-decimal list-inside space-y-1 text-slate-600 dark:text-slate-400 pl-1 leading-relaxed">
                              <li>Click <strong className="text-slate-800 dark:text-slate-200">Settings</strong> (gear icon) in the AI Studio header.</li>
                              <li>Select <strong className="text-slate-800 dark:text-slate-200">Secrets / API Keys</strong>.</li>
                              <li>Set <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-amber-800 dark:text-amber-400 border border-slate-200 dark:border-slate-700">GEMINI_API_KEY</code> with your active Gemini key.</li>
                            </ol>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          <button
                            type="button"
                            onClick={() => setShowGeminiKeyModal(true)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            <span>Enter Personal Gemini API Key</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRawTextModalOpen(true)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>Use Smart Paste Instead (No API Key Required)</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dynamic AI Extraction heartbeat / status ticker with instant Stop button */}
                    {isExtracting && (
                      <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2.5">
                            <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans">
                              AI Document Autofill Running ({extractionElapsedSec}s / 180s max)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleStopExtraction}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg shadow-xs transition cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Stop Autofill</span>
                          </button>
                        </div>
                        <div className="pl-6.5 space-y-1">
                          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium font-sans">
                            Stage: <span className="text-blue-800 dark:text-blue-200 font-bold">{extractionStatusText || 'Scanning document with Gemini Flash...'}</span>
                          </p>
                          {extractionElapsedSec >= 45 ? (
                            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium font-sans">
                              Complex scan in progress — you can keep editing Client &amp; Details above while this finishes, or click Stop Autofill anytime.
                            </p>
                          ) : (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              Source files remain safely attached even if you stop autofill early.
                            </p>
                          )}
                        </div>
                        <div className="w-full bg-blue-100 dark:bg-blue-900 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-blue-600 h-1.5 rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(98, Math.max(8, Math.round((extractionElapsedSec / 45) * 100)))}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Attached files:</span>
                        {attachments.map((file, idx) => (
                          <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex items-center justify-between text-xs font-mono text-slate-700 dark:text-slate-300 shadow-2xs">
                            <div 
                              onClick={() => {
                                if (file.url) {
                                  setActivePreviewUrl(file.url);
                                  setPreviewFileName(file.name);
                                  setPreviewFileType(file.type || 'application/pdf');
                                }
                              }}
                              className={`flex items-center space-x-2 truncate mr-2 transition ${file.url ? 'cursor-pointer hover:text-blue-600 dark:hover:text-blue-400' : 'text-slate-500'}`}
                              title={file.url ? "Click to preview side-by-side" : "Attachment stored offline"}
                            >
                              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="truncate font-sans font-medium text-slate-800 dark:text-slate-200 hover:underline">{file.name}</span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                                {!file.isLocal && file.url && (file.url.startsWith('http://') || file.url.startsWith('https://')) ? (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold font-sans bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 shrink-0">
                                    <Cloud className="w-2.5 h-2.5" />
                                    <span>Cloud</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold font-sans bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0" title={file.uploadedByUserName ? `Stored on ${file.uploadedByUserName}'s browser` : 'Stored locally on this browser'}>
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    <span>Local</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              {file.url && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActivePreviewUrl(file.url);
                                    setPreviewFileName(file.name);
                                    setPreviewFileType(file.type || 'application/pdf');
                                  }}
                                  className={`flex items-center space-x-1 px-2 py-1 rounded-lg transition text-[10px] font-sans font-medium border cursor-pointer ${
                                    activePreviewUrl === file.url 
                                      ? 'bg-blue-600 text-white border-blue-600' 
                                      : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                  }`}
                                  title="Open side-by-side preview panel"
                                >
                                  <Eye className="w-3 h-3" />
                                  <span>{activePreviewUrl === file.url ? 'Previewing' : 'View'}</span>
                                </button>
                              )}

                              {Boolean(activeWorkspace?.settings?.storage?.supabaseUrl && activeWorkspace?.settings?.storage?.bucket && activeWorkspace?.settings?.storage?.supabaseAnonKey) && (file.isLocal || !file.url || !file.url.startsWith('http')) && (
                                <button
                                  type="button"
                                  onClick={() => handlePromoteAttachmentToCloud(idx)}
                                  disabled={promotingAttachmentKey === (file.storageKey || file.id || `att_${idx}`) || uploading}
                                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg transition text-[10px] font-sans font-medium border border-blue-200 dark:border-blue-800 disabled:opacity-50 cursor-pointer shadow-2xs"
                                  title="Promote this local attachment to Supabase Cloud Storage to share with entire team"
                                >
                                  {promotingAttachmentKey === (file.storageKey || file.id || `att_${idx}`) ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                                  ) : (
                                    <UploadCloud className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                  )}
                                  <span>Upload to Cloud</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  setAttachments((prev) =>
                                    prev.map((att, i) =>
                                      i === idx
                                        ? { ...att, include_in_quote_annex: !att.include_in_quote_annex }
                                        : att
                                    )
                                  );
                                }}
                                className={`flex items-center space-x-1 px-2 py-1 rounded-lg transition text-[10px] font-sans font-semibold border cursor-pointer whitespace-nowrap ${
                                  file.include_in_quote_annex
                                    ? 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                    : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                                }`}
                                title="Toggle to automatically include this file in Quotation Studio Technical Annexes"
                              >
                                <FileCheck className="w-3 h-3" />
                                <span>{file.include_in_quote_annex ? 'In Quote Annex' : '+ Quote Annex'}</span>
                              </button>

                              {isExtracting ? (
                                <button
                                  type="button"
                                  onClick={handleStopExtraction}
                                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition text-[10px] font-sans font-bold border border-rose-700 cursor-pointer"
                                  title="Stop AI Autofill immediately and keep this file attached"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Stop ({extractionElapsedSec}s)</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleExtractFromAttachment(file)}
                                  disabled={uploading}
                                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-300 rounded-lg transition text-[10px] font-sans font-medium border border-blue-200 dark:border-blue-800 disabled:opacity-50 cursor-pointer"
                                  title="AI Document Autofill: Extracts client company, line items, and attributes using Gemini AI"
                                >
                                  <Sparkles className="w-3 h-3 text-blue-500 fill-blue-500" />
                                  <span>Autofill Form</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => removeAttachment(idx)}
                                disabled={isExtracting || uploading}
                                className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition p-1 disabled:opacity-50 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Section 7.5: Original Pasted Source / Raw Context */}
          {pastedSourceText && (
            <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 shadow-2xs rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-xs font-sans uppercase tracking-wide">
                    Original Pasted Source / Raw Context
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(pastedSourceText);
                      if (triggerToast) triggerToast('Copied raw context to clipboard!', 'info');
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg transition text-xs font-semibold cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy to Clipboard</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 max-h-60 overflow-y-auto">
                {pastedSourceText}
              </pre>
            </div>
          )}

            </fieldset> {/* End of scrollable Form body */}

            {/* Executive Sticky Footer Bar with Live Deal Summary */}
            <div className="sticky bottom-0 z-20 px-4 py-3 sm:px-6 sm:py-3.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 shrink-0">
              {(() => {
                const baselineList = lineItems.filter((li) => {
                  const opt = String((li as any).option_designation || li.option || 'Default / Included').trim();
                  return !opt || opt === 'Default / Included' || opt === 'Baseline / All' || opt === 'Option A' || opt.startsWith('Option A ');
                });
                const calcList = baselineList.length > 0 ? baselineList : lineItems;
                const totalSelling = calcList.reduce((sum, li) => {
                  const isDisc = li.item_type === 'discount' || (li as any).classification === 'Discount / Rebate';
                  const lineVal = Number(li.total_price) || (Number(li.quantity) || 0) * (Number(li.unit_price) || 0);
                  return isDisc ? sum - Math.abs(lineVal) : sum + lineVal;
                }, 0);
                const effectiveSubtotal = isLumpSum ? (Number(manualValue) || 0) : totalSelling;
                const vatAmount = Math.round(effectiveSubtotal * 0.05 * 100) / 100;
                const grandTotalInclVat = effectiveSubtotal + vatAmount;

                return (
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-xs font-mono tabular-nums min-w-0">
                    <span className="text-slate-500 dark:text-slate-400">
                      Items: <strong className="text-slate-800 dark:text-slate-200">{lineItems.length}</strong>
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      Net (Excl. VAT):{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {formCurrency}{' '}
                        {effectiveSubtotal.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </strong>
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="text-slate-600 dark:text-slate-300 font-sans font-medium">
                      Grand Total:{' '}
                      <strong className="font-mono font-bold text-blue-600 dark:text-blue-400">
                        {formCurrency}{' '}
                        {grandTotalInclVat.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </strong>
                    </span>
                  </div>
                );
              })()}

              {isReadOnly ? (
                <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto sm:ml-auto">
                  <div className="flex items-center space-x-1.5 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>Read-Only View</span>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-9 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap w-full sm:w-auto"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto sm:ml-auto">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={onClose}
                    className="h-9 px-4 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 text-slate-700 dark:text-slate-300 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  {!enquiryToEdit && (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      onClick={() => updateSubmitMode('another')}
                      className="h-9 px-4 border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 disabled:opacity-50 text-blue-700 dark:text-blue-300 font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition shadow-2xs cursor-pointer whitespace-nowrap w-full sm:w-auto"
                    >
                      {isSubmitting && submitMode === 'another' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{isSubmitting && submitMode === 'another' ? 'Saving...' : 'Register & Add Another'}</span>
                    </button>
                  )}
                  {onSaveAndOpenStudio && (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      onClick={() => updateSubmitMode('open_studio')}
                      className="h-9 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap w-full sm:w-auto"
                      title="Save Enquiry and immediately open Quotation Studio"
                    >
                      {isSubmitting && submitMode === 'open_studio' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span className="text-xs leading-none">⚡</span>
                      )}
                      <span>
                        {isSubmitting && submitMode === 'open_studio'
                          ? 'Opening Studio...'
                          : 'Save & Open Studio'}
                      </span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    onClick={() => updateSubmitMode('close')}
                    className="h-9 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg text-xs inline-flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer whitespace-nowrap w-full sm:w-auto"
                  >
                    {isSubmitting && submitMode === 'close' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>
                      {enquiryToEdit
                        ? isSubmitting && submitMode === 'close'
                          ? 'Saving Changes...'
                          : 'Save Changes'
                        : isSubmitting && submitMode === 'close'
                        ? 'Registering...'
                        : 'Register & Close'}
                    </span>
                  </button>
                </div>
              )}
            </div>

        </form>
        </div>
      </div>

      {/* Inline Create New Company Modal overlay */}
      {newCompanyModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[96vh] sm:max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider">
                {isEditingCompany ? 'Edit Company Account' : 'Create New Company Account'}
              </h3>
              <button
                type="button"
                onClick={() => setNewCompanyModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <MarqueeLabel required>Company Name</MarqueeLabel>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al Naboodah"
                  value={subCompanyName}
                  onChange={(e) => setSubCompanyName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel>Legal Suffix</MarqueeLabel>
                  <select
                    value={subLegalSuffix}
                    onChange={(e) => setSubLegalSuffix(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                  >
                    {['None / To Be Added Later', 'LLC', 'FZE', 'FZCO', 'FZC', 'Co. LLC', 'PJSC', 'JSC', 'Corp', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((suf) => (
                      <option key={suf} value={suf}>{suf}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <MarqueeLabel required>City/State</MarqueeLabel>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dubai"
                    value={subCity}
                    onChange={(e) => setSubCity(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel>Company Code (Quote Ref)</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. CWE, BME, VWT"
                    maxLength={12}
                    value={subCompanyCode}
                    onChange={(e) => setSubCompanyCode(sanitizeCompanyCode(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono font-bold uppercase"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Used for {'{COMPANY_CODE}'} in Quote Refs
                  </span>
                </div>
                <div>
                  <MarqueeLabel>Country Code (3-Letter)</MarqueeLabel>
                  <input
                    type="text"
                    placeholder={resolveCountryCode(subCountry) || 'e.g. UAE, KSA'}
                    maxLength={6}
                    value={subCountryCode}
                    onChange={(e) => setSubCountryCode(sanitizeCompanyCode(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono font-bold uppercase"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Auto: {resolveCountryCode(subCountry, subCountryCode) || 'UAE'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel required>Country</MarqueeLabel>
                  <input
                    type="text"
                    required
                    placeholder="e.g. UAE"
                    value={subCountry}
                    onChange={(e) => setSubCountry(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                  />
                </div>
                <div>
                  <MarqueeLabel>General Phone</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. +971 4 123 4567"
                    value={subGeneralPhone}
                    onChange={(e) => setSubGeneralPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <MarqueeLabel>General Email</MarqueeLabel>
                <input
                  type="email"
                  placeholder="e.g. procurement@alnaboodah.com"
                  value={subGeneralEmail}
                  onChange={(e) => setSubGeneralEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                />
              </div>

              <div>
                <MarqueeLabel>Internal Remarks</MarqueeLabel>
                <textarea
                  rows={2}
                  placeholder="Key relationships, legacy accounts, etc."
                  value={subNotes}
                  onChange={(e) => setSubNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button
                type="button"
                onClick={() => setNewCompanyModal(false)}
                className="w-1/2 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!subCompanyName.trim() || !subCity.trim() || !subCountry.trim()) {
                    alert('Please fill out Name, City, and Country fields.');
                    return;
                  }
                  
                  const isNoneSubSuf =
                    !subLegalSuffix ||
                    /^(none|none\s*\/\s*to\s*be\s*added\s*later|none\s*\/\s*other)$/i.test(String(subLegalSuffix).trim());
                  const cleanSubName = subCompanyName.trim();
                  const sufLower = (subLegalSuffix || '').trim().toLowerCase();
                  const subLower = cleanSubName.toLowerCase();
                  const display_name = isNoneSubSuf
                    ? cleanSubName
                    : (subLower.endsWith(` ${sufLower}`) || subLower.endsWith(sufLower))
                      ? cleanSubName
                      : `${cleanSubName} ${String(subLegalSuffix).trim()}`;
                  const finalSubSuffix = isNoneSubSuf ? undefined : (subLegalSuffix as LegalSuffix);
                  const cleanSubCode = sanitizeCompanyCode(subCompanyCode);
                  const cleanSubCountryCode = sanitizeCompanyCode(subCountryCode);

                  if (isEditingCompany) {
                    if (!companyId) return;
                    try {
                      const updatePayload: Partial<Company> = {
                        display_name,
                        aliases: [cleanSubName],
                        legal_suffix: finalSubSuffix,
                        company_code: cleanSubCode || undefined,
                        country_code: cleanSubCountryCode || undefined,
                        city: subCity.trim(),
                        country: subCountry.trim(),
                        general_phone: subGeneralPhone.trim() || undefined,
                        general_email: subGeneralEmail.trim() || undefined,
                        notes: subNotes.trim() || undefined,
                        last_modified_by_uid: user?.uid || '',
                        last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                        updatedAt: new Date().toISOString()
                      };
                      await safeUpdateDoc('companies', companyId, updatePayload);
                      await CompanyRepository.updateCompany(companyId, updatePayload).catch(() => {});
                      await logAudit(companyId, 'company', 'update', null, updatePayload, []);
                      
                      if (setCompanies) {
                        setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, ...updatePayload } : c)));
                      }

                      setCompanySearch(display_name);
                      setCountry(subCountry.trim());
                      setProjectLocation(subCity.trim());
                      if (cleanSubCode && quoteRefNo.includes('[COMPANY_CODE]')) {
                        setQuoteRefNo((prev) => prev.replace(/\[COMPANY_CODE\]/g, cleanSubCode));
                      }

                      setNewCompanyModal(false);
                      if (triggerToast) {
                        triggerToast('Company account updated successfully.', 'success');
                      }
                    } catch (err: any) {
                      console.error('Failed to update company inline:', err);
                      alert('Error updating company: ' + err.message);
                    }
                    return;
                  }

                  // Check duplicate displayName
                  const exists = companies.find(c => c.display_name.toLowerCase() === display_name.toLowerCase());
                  if (exists) {
                    alert(`An account with the name "${display_name}" already exists.`);
                    setCompanyId(exists.id!);
                    setCompanySearch(exists.display_name);
                    setCountry(exists.country);
                    setProjectLocation(exists.city);
                    setNewCompanyModal(false);
                    return;
                  }

                  try {
                    if (!activeWorkspace?.id) {
                      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
                    }
                    const newCompPayload = {
                      workspace_id: activeWorkspace.id,
                      workspaceId: activeWorkspace.id,
                      canonical_name: cleanSubName.toLowerCase(),
                      display_name,
                      aliases: [cleanSubName],
                      legal_suffix: finalSubSuffix,
                      ...(cleanSubCode ? { company_code: cleanSubCode } : {}),
                      ...(cleanSubCountryCode ? { country_code: cleanSubCountryCode } : {}),
                      city: subCity.trim(),
                      country: subCountry.trim(),
                      general_phone: subGeneralPhone.trim() || undefined,
                      general_email: subGeneralEmail.trim() || undefined,
                      notes: subNotes.trim() || undefined,
                      created_by_uid: user?.uid || '',
                      created_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      last_modified_by_uid: user?.uid || '',
                      last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };

                    const docId = await safeAddDoc('companies', newCompPayload);
                    
                    // Log audit
                    await logAudit(docId.id, 'company', 'create', null, newCompPayload, []);

                    const newCompObj: Company = { id: docId.id, canonical_name: display_name, ...newCompPayload };
                    await CompanyRepository.saveCompany(newCompObj).catch(() => {});

                    if (setCompanies) {
                      setCompanies((prev) => [newCompObj, ...prev.filter((c) => c.id !== docId.id)]);
                    }

                    setCompanyId(docId.id);
                    setCompanySearch(display_name);
                    setCountry(subCountry.trim());
                    setProjectLocation(subCity.trim());
                    if (cleanSubCode && quoteRefNo.includes('[COMPANY_CODE]')) {
                      setQuoteRefNo((prev) => prev.replace(/\[COMPANY_CODE\]/g, cleanSubCode));
                    }
                    
                    // Reset fields
                    setSubCompanyName('');
                    setSubCompanyCode('');
                    setSubCountryCode('');
                    setSubCity('');
                    setSubCountry('UAE');
                    setSubGeneralPhone('');
                    setSubGeneralEmail('');
                    setSubNotes('');
                    setNewCompanyModal(false);
                  } catch (err) {
                    console.error('Failed to create company inline:', err);
                    alert('Error creating company. Please try again.');
                  }
                }}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
              >
                {isEditingCompany ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create New Contact Modal overlay */}
      {showNewContactModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[96vh] sm:max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider">
                {isEditingContact ? 'Edit Contact Personnel' : 'Add Contact Personnel'}
              </h3>
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              <div>
                <MarqueeLabel required>Full Name</MarqueeLabel>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={subContactName}
                  onChange={(e) => setSubContactName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <MarqueeLabel>Designation / Role</MarqueeLabel>
                <input
                  type="text"
                  placeholder="e.g. Procurement Manager"
                  value={subContactDesignation}
                  onChange={(e) => setSubContactDesignation(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <MarqueeLabel>Mobile Number</MarqueeLabel>
                  <input
                    type="text"
                    placeholder="e.g. +971 50 123 4567"
                    value={subContactMobile}
                    onChange={(e) => setSubContactMobile(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <MarqueeLabel>Email Address</MarqueeLabel>
                  <input
                    type="email"
                    placeholder="e.g. john.doe@domain.com"
                    value={subContactEmail}
                    onChange={(e) => setSubContactEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="sub-contact-primary"
                  checked={subContactIsPrimary}
                  onChange={(e) => setSubContactIsPrimary(e.target.checked)}
                  className="rounded border-slate-200 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="sub-contact-primary" className="text-xs text-slate-500 font-sans cursor-pointer">
                  Mark as Primary Contact for this Account
                </label>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button
                type="button"
                onClick={() => setShowNewContactModal(false)}
                className="w-1/2 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!subContactName.trim()) {
                    alert('Please enter a full name for the contact person.');
                    return;
                  }
                  if (!companyId) {
                    alert('No company is selected.');
                    return;
                  }

                  if (isEditingContact) {
                    if (!contactId) return;
                    try {
                      const updateContactPayload = {
                        company_id: companyId,
                        full_name: subContactName.trim(),
                        designation: subContactDesignation.trim() || undefined,
                        mobile: subContactMobile.trim() || undefined,
                        email: subContactEmail.trim() || undefined,
                        is_primary: subContactIsPrimary,
                        last_modified_by_uid: user?.uid || '',
                        last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                        updatedAt: new Date().toISOString()
                      };
                      await safeUpdateDoc('contacts', contactId, updateContactPayload);
                      await logAudit(contactId, 'contact', 'update', null, updateContactPayload, []);
                      
                      setShowNewContactModal(false);
                      if (triggerToast) {
                        triggerToast('Contact personnel updated successfully.', 'success');
                      }
                    } catch (err: any) {
                      console.error('Failed to update contact inline:', err);
                      alert('Error updating contact: ' + err.message);
                    }
                    return;
                  }

                  try {
                    if (!activeWorkspace?.id) {
                      throw new Error("Critical Error: Active workspace context lost. Cannot save record.");
                    }
                    const newContactPayload = {
                      workspace_id: activeWorkspace.id,
                      company_id: companyId,
                      full_name: subContactName.trim(),
                      designation: subContactDesignation.trim() || undefined,
                      mobile: subContactMobile.trim() || undefined,
                      email: subContactEmail.trim() || undefined,
                      is_primary: subContactIsPrimary,
                      created_by_uid: user?.uid || '',
                      created_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      last_modified_by_uid: user?.uid || '',
                      last_modified_by_name: user?.username || user?.full_name || user?.email || 'Unknown User',
                      createdAt: new Date().toISOString(),
                      updatedAt: new Date().toISOString()
                    };

                    const docId = await safeAddDoc('contacts', newContactPayload);
                    
                    // Log audit
                    await logAudit(docId.id, 'contact', 'create', null, newContactPayload, []);

                    const createdContactObj: Contact = {
                      id: docId.id,
                      company_id: companyId,
                      full_name: subContactName.trim(),
                      designation: subContactDesignation.trim() || undefined,
                      mobile: subContactMobile.trim() || undefined,
                      email: subContactEmail.trim() || undefined,
                      is_primary: subContactIsPrimary,
                      createdAt: new Date().toISOString()
                    };

                    if (setContacts) {
                      setContacts((prev) => [createdContactObj, ...prev]);
                    }

                    setContactId(docId.id);
                    if (triggerToast) {
                      triggerToast(`Contact "${subContactName.trim()}" added successfully.`, 'success');
                    }

                    // Reset contact states
                    setSubContactName('');
                    setSubContactDesignation('');
                    setSubContactMobile('');
                    setSubContactEmail('');
                    setSubContactIsPrimary(false);
                    setShowNewContactModal(false);
                  } catch (err) {
                    console.error('Failed to create contact inline:', err);
                    alert('Error creating contact person.');
                  }
                }}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold transition shadow-sm"
              >
                {isEditingContact ? 'Save Changes' : 'Add Personnel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Create New Category Modal overlay (Admin privilege protection) */}
      {newCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[96vh] sm:max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-600" />
                <span>Add Product Category</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setNewCategoryModal(false);
                  setNewCategoryName('');
                  setInitiatingLineItemIndex(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Security info card to keep catalog from fragmenting */}
              <div className="p-3.5 bg-amber-50/75 border border-amber-200 rounded-xl flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-800 font-sans leading-relaxed">
                  <p className="font-semibold text-amber-900 mb-0.5">Administrator privilege</p>
                  <p>
                    Adding new product categories is restricted to prevent catalog fragmentation. Ensure this category is distinctly required and doesn't duplicate existing ones.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Automation & Controls"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 focus:border-blue-500 rounded-xl py-2 px-3 text-sm text-slate-800 focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setNewCategoryModal(false);
                  setNewCategoryName('');
                  setInitiatingLineItemIndex(null);
                }}
                className="w-1/2 py-2 border border-slate-200 hover:bg-white text-slate-600 rounded-xl text-xs font-semibold transition font-sans"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingCategory}
                onClick={async () => {
                  const cleaned = newCategoryName.trim();
                  if (!cleaned) {
                    alert('Please enter a category name.');
                    return;
                  }

                  // Avoid duplicates
                  const lower = cleaned.toLowerCase();
                  const exists = activeCategories.some(c => c.toLowerCase() === lower);
                  if (exists) {
                    alert(`The category "${cleaned}" already exists in the catalog.`);
                    // If it exists, just update the initiating line item type to it
                    const found = activeCategories.find(c => c.toLowerCase() === lower) || cleaned;
                    if (initiatingLineItemIndex !== null) {
                      handleLineItemChange(initiatingLineItemIndex, 'product_type', found);
                    }
                    setNewCategoryModal(false);
                    setNewCategoryName('');
                    setInitiatingLineItemIndex(null);
                    return;
                  }

                  try {
                    setSubmittingCategory(true);
                    
                    // Create in Firestore dropdown options with workspace scoping
                    const docRef = await safeAddDoc('dropdown_product_categories', {
                      name: cleaned,
                      workspace_id: activeWorkspace?.id || undefined
                    });
                    const newOptId = docRef?.id || ('cat_' + Date.now());
                    const newOpt: DropdownOption = {
                      id: newOptId,
                      name: cleaned,
                      workspace_id: activeWorkspace?.id || undefined
                    };

                    // Sync parent App state so Settings, Product Manager, etc. immediately reflect the new category
                    if (setProductCategories) {
                      setProductCategories((prev) => {
                        if (prev.some(c => c.name.toLowerCase() === lower)) return prev;
                        return [...prev, newOpt];
                      });
                    }

                    // Sync form local state
                    setExtraCategories((prev) => prev.includes(cleaned) ? prev : [...prev, cleaned]);

                    // Log audit
                    await logAudit(cleaned, 'enquiry', 'update', null, { added_product_category: cleaned }, []);

                    // Update the active line item that requested this
                    if (initiatingLineItemIndex !== null) {
                      handleLineItemChange(initiatingLineItemIndex, 'product_type', cleaned);
                    }

                    if (triggerToast) {
                      triggerToast(`Successfully added "${cleaned}" to product categories.`, 'success');
                    }

                    // Reset and close
                    setNewCategoryModal(false);
                    setNewCategoryName('');
                    setInitiatingLineItemIndex(null);
                  } catch (err) {
                    console.error('Failed to create new product category:', err);
                    alert('Error creating product category.');
                  } finally {
                    setSubmittingCategory(false);
                  }
                }}
                className="w-1/2 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white rounded-xl text-xs font-semibold transition shadow-sm font-sans flex items-center justify-center gap-1.5"
              >
                {submittingCategory && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Add Category</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Catalog Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[96vh] sm:max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white font-sans">
                  {BRAND_CONFIG.catalogTitle}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                  Select a pre-configured component with specs, standard pricing, and availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter and Search Bar */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-3 shrink-0 font-sans">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by product name or description..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl py-2 px-9 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                />
                {catalogSearch && (
                  <button
                    onClick={() => setCatalogSearch('')}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="w-full sm:w-52">
                <select
                  value={catalogCategory}
                  onChange={(e) => setCatalogCategory(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl py-2 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none"
                >
                  <option value="All">All Categories</option>
                  {sortedCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-1 shrink-0">
                {[
                  { id: 'all', label: 'All Stock' },
                  { id: 'in_stock', label: 'In Stock' },
                  { id: 'low_stock', label: 'Low Stock' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCatalogStockFilter(tab.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      catalogStockFilter === tab.id
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Catalog Grid/List */}
            <div className="flex-1 overflow-y-auto p-6 pb-8 space-y-4 bg-slate-50 dark:bg-slate-950/60">
              {filteredCatalog.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredCatalog.map((item) => {
                    const priceAed = Number(item.unit_price_aed) || 0;
                    const convertedPrice = formCurrency === 'USD' ? priceAed / 3.6725 : priceAed;
                    const availStock = (item.stock_on_hand || 0) - (item.stock_reserved || 0);
                    const isLowStock = Boolean(item.is_inventoried) && availStock <= (item.reorder_level || 0);
                    const cleanUom = !item.unit || String(item.unit).toLowerCase() === 'custom unit' ? 'Nos' : item.unit;
                    return (
                      <div
                        key={item.id || item.name}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm transition duration-150 flex flex-col justify-between"
                      >
                        <div className="space-y-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0">
                              {item.image_url ? (
                                <img
                                  src={item.image_url}
                                  alt={item.name}
                                  className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200 dark:border-slate-700 p-0.5 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                                  <Package className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 rounded text-[9px] font-mono uppercase font-bold whitespace-nowrap">
                                    {item.product_type}
                                  </span>
                                  {item.is_composite_set && Array.isArray(item.sub_components) && item.sub_components.length > 0 && (
                                    <span className="inline-block px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap">
                                      Kit / BOM ({item.sub_components.length} parts)
                                    </span>
                                  )}
                                  {item.is_inventoried ? (
                                    <span
                                      className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${
                                        isLowStock
                                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                      }`}
                                    >
                                      Avail: {availStock} {cleanUom}
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-mono bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      {item.lead_time_note || 'Order / Non-Stock'}
                                    </span>
                                  )}
                                  {item.datasheet_attachment?.url && (
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                      Datasheet
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white mt-1 font-sans truncate" title={item.name}>
                                  {item.name}
                                </h4>
                                {(item.brand_make || item.model_part_no || item.sku) && (
                                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                                    {item.brand_make && <span>{item.brand_make}</span>}
                                    {item.model_part_no && <span>• {item.model_part_no}</span>}
                                    {item.sku && <span>• SKU: {item.sku}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums shrink-0">
                              <span className="text-[10px] text-slate-400 block">Unit Price</span>
                              {priceAed > 0 ? (
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 block">
                                  {formCurrency}{' '}
                                  {Number(convertedPrice || 0).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}
                                </span>
                              ) : (
                                <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[10px] font-sans font-semibold text-amber-700 dark:text-amber-300">
                                  Price on Request
                                </span>
                              )}
                              {item.cost_price_aed && item.cost_price_aed > 0 && priceAed > 0 && (
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                  Margin: {(((priceAed - item.cost_price_aed) / priceAed) * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-xs text-slate-500 dark:text-slate-400 font-sans line-clamp-2">
                            {item.description}
                          </p>

                          {item.attributes && item.attributes.filter((a) => a.key && a.value).length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {item.attributes
                                .filter((a) => a.key && a.value)
                                .slice(0, 3)
                                .map((attr, aIdx) => (
                                  <span
                                    key={aIdx}
                                    className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-mono border border-slate-200/80 dark:border-slate-700"
                                  >
                                    {attr.key}: {attr.value}
                                  </span>
                                ))}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-2 pt-2 text-[10px] border-t border-slate-100 dark:border-slate-800 font-mono text-slate-400">
                            <div>
                              <span className="font-semibold text-slate-500 dark:text-slate-400">Unit:</span> {cleanUom}
                              {item.country_of_origin ? ` • Origin: ${item.country_of_origin}` : ''}
                            </div>
                            {item.lead_time_note && (
                              <div className="truncate text-right">
                                <span className="font-semibold text-slate-500 dark:text-slate-400">Lead Time:</span> {item.lead_time_note}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddCatalogItem({ ...item, unit: cleanUom as UnitType })}
                          className="mt-4 w-full py-2 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 hover:bg-blue-600 hover:text-white border border-blue-200/80 dark:border-blue-800/80 text-xs font-semibold rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{linkingLineIndex !== null ? 'Link & Populate Line Item' : 'Add to Proposal'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 font-sans">
                  No products matched your filters. Try search keywords like "RO", "Vessel", "WIKA" etc.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 font-mono text-[10px] text-slate-400">
              <span>* Pricing converted in real-time from AED to USD if USD is selected.</span>
              <button
                type="button"
                onClick={() => setShowCatalogModal(false)}
                className="py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 font-semibold font-sans text-xs transition cursor-pointer"
              >
                Close Catalog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Raw Excel Row / RFQ Text AI Paste Modal */}
      {rawTextModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl p-4 sm:p-6 space-y-4 max-h-[96vh] sm:max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white font-sans">
                  AI Paste Raw Excel Row / RFQ Text
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRawTextModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">
              Copy a row directly from Excel or paste any raw RFQ text below. The AI will parse tab-delimited columns (Serial No, Quote Ref, Dates, Company, Contact Name, Email, Phone, Country, Location), specifications, and multi-line commercial pricing tables directly into structured form fields.
            </p>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-mono text-slate-500 dark:text-slate-400 uppercase font-semibold">
                  Raw Text / Tab-Delimited Excel Row
                </label>
                <button
                  type="button"
                  onClick={() => setRawTextInput(SAMPLE_EXCEL_ROW)}
                  className="text-[11px] font-sans font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  <span>Load Sample Excel Row</span>
                </button>
              </div>
              <textarea
                rows={10}
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                placeholder="Paste raw Excel row or RFQ text here (e.g. 2792  2751-300626AA  Jul-2026...)"
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/20 rounded-xl p-3 font-mono text-xs text-slate-800 dark:text-slate-100 focus:outline-none resize-y"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRawTextInput('')}
                className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-sans cursor-pointer text-center"
              >
                Clear
              </button>

              <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setRawTextModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer w-full sm:w-auto text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleExtractFromRawText()}
                  disabled={isExtracting || !rawTextInput.trim()}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-sm transition flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer w-full sm:w-auto"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Parsing Data...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-emerald-200 fill-emerald-200" />
                      <span>Parse Excel Data with AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Registration Modal for Unregistered Entities */}
      {showConfirmRegistrationModal && unregisteredEntities && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-amber-200 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[96vh] sm:max-h-[90vh]">
            <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white p-4 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-amber-200 fill-amber-200" />
                <h3 className="text-base font-bold font-sans">
                  Confirm Entity Registration & Field Mapping
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirmRegistrationModal(false)}
                className="p-1 text-amber-100 hover:text-white rounded-lg hover:bg-amber-600/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 bg-slate-50 flex-1">
              <p className="text-xs text-slate-600 leading-relaxed font-sans">
                The AI detected an unregistered company or contact person in the pasted text. Review and map the extracted details below to register them directly into your database catalog.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Column 1: Company Profile */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                    <Building className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800 font-sans">Company Profile</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Company Display Name</label>
                    <input
                      type="text"
                      value={unregisteredEntities.companyName || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, companyName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Legal Suffix</label>
                      <select
                        value={unregisteredEntities.legalSuffix !== undefined ? unregisteredEntities.legalSuffix : 'None / To Be Added Later'}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, legalSuffix: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 font-sans cursor-pointer"
                      >
                        {['None / To Be Added Later', 'LLC', 'FZE', 'FZCO', 'FZC', 'Co. LLC', 'PJSC', 'JSC', 'Corp', 'Ltd', 'W.L.L.', 'Est.', 'None / Other'].map((suf) => (
                          <option key={suf} value={suf}>{suf}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Country</label>
                      <input
                        type="text"
                        value={unregisteredEntities.country || 'UAE'}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, country: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Company Code (Quote Ref)</label>
                      <input
                        type="text"
                        placeholder="e.g. CWE, BME"
                        maxLength={12}
                        value={unregisteredEntities.companyCode || ''}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, companyCode: sanitizeCompanyCode(e.target.value) })}
                        className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs font-mono font-bold uppercase text-slate-800 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">City / Location</label>
                      <input
                        type="text"
                        value={unregisteredEntities.city || ''}
                        onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, city: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Column 2: Contact Person */}
                <div className="bg-white border border-slate-200 p-4 rounded-xl space-y-3 shadow-2xs">
                  <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
                    <User className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-slate-800 font-sans">Contact Person</span>
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Full Name</label>
                    <input
                      type="text"
                      value={unregisteredEntities.contactName || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={unregisteredEntities.contactEmail || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactEmail: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-mono uppercase text-slate-400 font-semibold block mb-1">Contact Mobile / Phone</label>
                    <input
                      type="text"
                      value={unregisteredEntities.contactMobile || ''}
                      onChange={(e) => setUnregisteredEntities({ ...unregisteredEntities, contactMobile: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 rounded-lg py-1.5 px-2.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Destination Routing Controls */}
              <div className="bg-amber-50/80 border border-amber-200 p-4 rounded-xl space-y-2">
                <span className="text-xs font-bold text-amber-900 font-sans block">
                  Interactive Routing Assignments:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-medium text-slate-700">Route Email ({unregisteredEntities.contactEmail || 'N/A'}) to:</span>
                    <div className="flex rounded-md overflow-hidden border border-amber-300">
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'contact' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.emailDestination === 'contact' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, emailDestination: 'company' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.emailDestination === 'company' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Company
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-white p-2.5 rounded-lg border border-amber-200">
                    <span className="font-medium text-slate-700">Route Phone ({unregisteredEntities.contactMobile || 'N/A'}) to:</span>
                    <div className="flex rounded-md overflow-hidden border border-amber-300">
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'contact' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.phoneDestination === 'contact' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Contact
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnregisteredEntities({ ...unregisteredEntities, phoneDestination: 'company' })}
                        className={`px-2 py-0.5 text-[10px] font-bold ${unregisteredEntities.phoneDestination === 'company' ? 'bg-amber-600 text-white' : 'bg-white text-slate-600'}`}
                      >
                        Company
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setShowConfirmRegistrationModal(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition font-sans"
              >
                Skip / Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleConfirmRegisterEntities();
                  setShowConfirmRegistrationModal(false);
                }}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Confirm & Register Entities to Catalog</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Fuzzy Match Warning Modal */}
      {duplicateMatchState && duplicateMatchState.isOpen && (
        <DuplicateMatchModal
          isOpen={duplicateMatchState.isOpen}
          type={duplicateMatchState.type}
          candidateName={duplicateMatchState.candidateName}
          existingRecordName={duplicateMatchState.existingRecordName}
          matchReason={duplicateMatchState.matchReason}
          similarityScore={duplicateMatchState.similarityScore}
          existingDetails={duplicateMatchState.existingDetails}
          newDetails={duplicateMatchState.newDetails}
          onMerge={duplicateMatchState.onMerge}
          onKeepNew={duplicateMatchState.onKeepNew}
          onIgnore={duplicateMatchState.onIgnore}
          onCancel={() => setDuplicateMatchState(null)}
        />
      )}

      {/* Personal Gemini API Key Modal */}
      <GeminiKeyModal
        isOpen={showGeminiKeyModal}
        onClose={() => setShowGeminiKeyModal(false)}
        triggerToast={triggerToast}
        onKeySaved={() => {
          setExtractionError(null);
        }}
      />

      {/* Save Custom Line Item to Catalog Modal */}
      <SaveToCatalogModal
        isOpen={saveToCatalogState.isOpen}
        onClose={() => setSaveToCatalogState({ isOpen: false, item: null, itemIndex: -1 })}
        initialItem={saveToCatalogState.item}
        currency={formCurrency || 'AED'}
        products={products}
        setProducts={setProducts}
        productCategories={activeCategories}
        units={activeUnits}
        setProductCategories={setProductCategories}
        activeWorkspace={activeWorkspace}
        user={user}
        triggerToast={triggerToast}
        onSaved={(newProduct) => {
          const idx = saveToCatalogState.itemIndex;
          if (idx >= 0 && idx < lineItems.length) {
            setLineItems((prev) => {
              const next = [...prev];
              const current = next[idx];
              const unitPriceInFormCurrency =
                formCurrency === 'USD'
                  ? Number(((newProduct.unit_price || 0) / 3.6725).toFixed(2))
                  : newProduct.unit_price || 0;
              const costPriceInFormCurrency =
                newProduct.cost_price !== undefined
                  ? formCurrency === 'USD'
                    ? Number((newProduct.cost_price / 3.6725).toFixed(2))
                    : newProduct.cost_price
                  : current.cost_price;
              next[idx] = {
                ...current,
                product_id: newProduct.id,
                sku: newProduct.sku || current.sku,
                item_name: newProduct.name || current.item_name,
                product_type: newProduct.product_type || current.product_type,
                description: newProduct.description || current.description,
                unit: newProduct.unit || current.unit,
                unit_price: current.unit_price > 0 ? current.unit_price : unitPriceInFormCurrency,
                cost_price: costPriceInFormCurrency,
                total_price: Number(
                  ((current.quantity || 1) * (current.unit_price > 0 ? current.unit_price : unitPriceInFormCurrency)).toFixed(2)
                ),
                brand_make: newProduct.brand_make || current.brand_make,
                model_part_no: newProduct.model_part_no || current.model_part_no,
                country_of_origin: newProduct.country_of_origin || current.country_of_origin,
                hs_code: newProduct.hs_code || current.hs_code,
                image_url: newProduct.image_url || current.image_url,
                datasheet_attachment: newProduct.datasheet_attachment || current.datasheet_attachment,
                include_datasheet_in_quote:
                  newProduct.datasheet_attachment || current.datasheet_attachment ? true : undefined,
                lead_time_note: newProduct.default_availability || current.lead_time_note,
                attributes:
                  newProduct.attributes && newProduct.attributes.length > 0
                    ? newProduct.attributes
                    : current.attributes
              };
              return next;
            });
          }
        }}
      />

    </div>
  );
}
