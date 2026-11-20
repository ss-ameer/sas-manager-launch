import React, { useState, useMemo } from 'react';
import { LineItemComponent, Product } from '../../types';
import {
  recalculateCompositeItemTotals,
  parseBulkSubComponentsText,
} from '../../utils/compositeBomUtils';
import {
  resolveToAedMultiplier,
  resolveEffectiveCatalogProduct,
  deriveSuggestedVariantLabel,
} from '../SaveToCatalogModal';
import { buildCatalogVariantAnalysisMap } from '../../utils/productVariantFormat';
import {
  Layers,
  Plus,
  Trash2,
  PackageCheck,
  ListTree,
  ArrowUp,
  ArrowDown,
  FileText,
  Link2,
  RefreshCw,
  ClipboardPaste,
  Search,
  X,
  Check,
  AlertTriangle,
  Scissors,
  Sparkles,
  Bold,
  EyeOff,
  Image as ImageIcon,
  ZoomIn,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronUp,
  BookmarkPlus,
  SlidersHorizontal,
} from 'lucide-react';
import { AtMentionInput, AtMentionTextarea } from './AtMentionField';
import { QuotationTokenContext } from '../../utils/quotationTokenResolver';
import { uploadWorkspaceMediaAsset, sanitizeFirestorePayload } from '../../services/attachmentStorage';
import { safeUpdateDoc, safeAddDoc } from '../../firebase';
import { MetadataRepository } from '../../services/repositories/MetadataRepository';
import ImageLightboxModal from '../common/ImageLightboxModal';

interface CompositePackageEditorProps {
  item?: {
    id?: string;
    item_type?: string;
    product_type?: string;
    item_name?: string;
    name?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    cost_price?: number;
    total_price?: number;
    brand_make?: string;
    model_part_no?: string;
    product_id?: string;
    sku?: string;
    image_url?: string;
    image_caption?: string;
    image_adjustments?: any;
    attributes?: Array<{ key: string; value: string }>;
    is_composite_set?: boolean;
    sub_components?: LineItemComponent[];
    package_pricing_mode?: 'itemized' | 'lump_sum';
    option_scope_notes?: string;
  };
  isCompositeSet?: boolean;
  subComponents?: LineItemComponent[];
  packagePricingMode?: 'itemized' | 'lump_sum';
  optionScopeNotes?: string;
  parentQuantity?: number;
  currency?: string;
  products?: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  onCatalogProductUpserted?: (product: Product) => void;
  activeWorkspace?: any;
  onChange: (patch: {
    is_composite_set: boolean;
    sub_components: LineItemComponent[];
    package_pricing_mode: 'itemized' | 'lump_sum';
    option_scope_notes?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    cost_price?: number;
    total_price?: number;
  }) => void;
  compact?: boolean;
  tokenContext?: QuotationTokenContext;
}

const AED_TO_USD_RATE = 3.6725;

export const CompositePackageEditor: React.FC<CompositePackageEditorProps> = ({
  item,
  isCompositeSet: propIsCompositeSet,
  subComponents: propSubComponents,
  packagePricingMode: propPackagePricingMode,
  optionScopeNotes: propOptionScopeNotes,
  parentQuantity: propParentQuantity,
  currency = 'AED',
  products = [],
  setProducts,
  onCatalogProductUpserted,
  activeWorkspace,
  onChange,
  compact = false,
  tokenContext,
}) => {
  const isCompositeSet = propIsCompositeSet ?? Boolean(item?.is_composite_set);
  const subComponents = propSubComponents ?? item?.sub_components ?? [];
  const packagePricingMode = propPackagePricingMode ?? item?.package_pricing_mode ?? 'lump_sum';
  const optionScopeNotes = propOptionScopeNotes ?? item?.option_scope_notes ?? '';
  const parentQuantity = propParentQuantity ?? item?.quantity ?? 1;

  const [showBulkPaste, setShowBulkPaste] = useState<boolean>(false);
  const [bulkPasteText, setBulkPasteText] = useState<string>('');
  const [bulkPasteAsAccessory, setBulkPasteAsAccessory] = useState<boolean>(true);
  const [showCatalogPickerForRow, setShowCatalogPickerForRow] = useState<string | 'NEW' | null>(null);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string>('');
  const [expandedFormatRows, setExpandedFormatRows] = useState<Record<string, boolean>>({});
  const [expandedSpecRows, setExpandedSpecRows] = useState<Record<string, boolean>>({});
  const [showScopeNotes, setShowScopeNotes] = useState<boolean>(Boolean(optionScopeNotes && optionScopeNotes.trim()));
  const [showCostInputs, setShowCostInputs] = useState<boolean>(false);
  const [lightboxSubComp, setLightboxSubComp] = useState<LineItemComponent | null>(null);
  const [openSyncMenuRowId, setOpenSyncMenuRowId] = useState<string | null>(null);
  const [syncStatusByRow, setSyncStatusByRow] = useState<Record<string, string>>({});
  const [syncBusyByRow, setSyncBusyByRow] = useState<Record<string, boolean>>({});
  const [localSavedProducts, setLocalSavedProducts] = useState<Product[]>([]);

  const effectiveTokenContext = useMemo<QuotationTokenContext>(
    () => tokenContext || {},
    [tokenContext]
  );

  const isMeaningfulRemark = (rem?: string) => {
    if (!rem) return false;
    const trimmed = rem.trim();
    if (!trimmed) return false;
    if (/^included(\s+with\s+package|\s+in\s+set|\s+accessory)?$/i.test(trimmed)) return false;
    return true;
  };

  const toggleFormatRow = (compId: string) => {
    setExpandedFormatRows((prev) => ({
      ...prev,
      [compId]: !prev[compId],
    }));
  };

  const toggleDetailsRow = (compId: string) => {
    setExpandedSpecRows((prev) => ({
      ...prev,
      [compId]: !prev[compId],
    }));
  };

  const getActiveFormatCount = (comp: LineItemComponent): number => {
    let count = 0;
    if (comp.image_url) count++;
    if (comp.page_break_after) count++;
    if (comp.row_highlight) count++;
    if (comp.row_bold) count++;
    if (comp.hide_row_price) count++;
    if (comp.row_note && comp.row_note.trim()) count++;
    if (comp.row_spacer_after_mm && comp.row_spacer_after_mm > 0) count++;
    return count;
  };

  const handleUploadSubImage = async (compId: string, file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/images',
        activeWorkspace?.settings || activeWorkspace,
        { compressImage: true, maxDimension: 700, quality: 0.84 }
      );
      if (uploaded.url) {
        handleUpdateSubPatch(compId, {
          image_url: uploaded.url,
          show_image: true,
        });
      }
    } catch {
      // ignore upload error
    }
  };

  const renderSubRowCustomizationBar = (comp: LineItemComponent, rowNumLabel: string) => {
    return (
      <div
        className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1.5"
        onPaste={(e) => {
          const items = e.clipboardData?.items;
          if (!items) return;
          for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith('image/')) {
              const file = items[i].getAsFile();
              if (file) {
                e.preventDefault();
                handleUploadSubImage(comp.id, file);
                return;
              }
            }
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex items-center gap-1 pr-1 border-r border-slate-200 dark:border-slate-700">
            {comp.image_url ? (
              <div className="relative group inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setLightboxSubComp(comp)}
                  className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center cursor-pointer relative"
                  title="Click to inspect or rotate sub-item photo"
                >
                  <img
                    src={comp.image_url}
                    alt={comp.item_name || rowNumLabel}
                    className="w-full h-full object-contain p-0.5"
                    style={{
                      transform: [
                        comp.image_adjustments?.rotation ? `rotate(${comp.image_adjustments.rotation}deg)` : '',
                        comp.image_adjustments?.scale && comp.image_adjustments.scale !== 1
                          ? `scale(${comp.image_adjustments.scale})`
                          : ''
                      ]
                        .filter(Boolean)
                        .join(' ') || undefined
                    }}
                    referrerPolicy="no-referrer"
                  />
                  <span className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                    <ZoomIn className="w-3 h-3" />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateSub(comp.id, 'image_url', '')}
                  className="ml-0.5 p-0.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                  title="Remove photo"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <label
                className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 dark:text-slate-300 hover:text-blue-700 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                title="Upload photo (or Ctrl+V paste on this row)"
              >
                <ImageIcon className="w-2.5 h-2.5 text-blue-600" />
                <span>Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) handleUploadSubImage(comp.id, f);
                  }}
                />
              </label>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleUpdateSub(comp.id, 'page_break_after', !comp.page_break_after)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border flex items-center gap-1 transition cursor-pointer ${
              comp.page_break_after
                ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title={`Force a new A4 page after item ${rowNumLabel}`}
          >
            <Scissors className="w-2.5 h-2.5" />
            <span>{comp.page_break_after ? 'Page Break After' : 'Break'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleUpdateSub(comp.id, 'row_highlight', !comp.row_highlight)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer ${
              comp.row_highlight
                ? 'bg-amber-100 text-amber-900 border-amber-400 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Highlight this row on the quotation"
          >
            <Sparkles className="w-2.5 h-2.5" />
            <span>Highlight</span>
          </button>

          <button
            type="button"
            onClick={() => handleUpdateSub(comp.id, 'row_bold', !comp.row_bold)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer ${
              comp.row_bold
                ? 'bg-indigo-100 text-indigo-900 border-indigo-300 shadow-2xs'
                : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Render this row in bold text"
          >
            <Bold className="w-2.5 h-2.5" />
            <span>Bold</span>
          </button>

          {!comp.is_included_accessory && (Number(comp.unit_price) || 0) > 0 && (
            <button
              type="button"
              onClick={() => handleUpdateSub(comp.id, 'hide_row_price', !comp.hide_row_price)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer ${
                comp.hide_row_price
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs'
                  : 'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
              title="Mask individual price on quotation (shows 'Included' while keeping its value in the Set total)"
            >
              <EyeOff className="w-2.5 h-2.5" />
              <span>{comp.hide_row_price ? 'Price Hidden (Included)' : 'Hide Price'}</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const activeCatalogProducts = useMemo(() => {
    const mapById = new Map<string, Product>();
    (products || []).forEach((p) => {
      if (p && !p.is_deleted && p.id) mapById.set(p.id, p);
    });
    localSavedProducts.forEach((p) => {
      if (p && !p.is_deleted && p.id) {
        const prev = mapById.get(p.id);
        mapById.set(p.id, prev ? { ...prev, ...p } : p);
      }
    });
    return Array.from(mapById.values());
  }, [products, localSavedProducts]);

  const flashRowSyncStatus = (compId: string, label: string) => {
    setSyncStatusByRow((prev) => ({ ...prev, [compId]: label }));
    setTimeout(() => {
      setSyncStatusByRow((prev) => {
        if (prev[compId] !== label) return prev;
        const copy = { ...prev };
        delete copy[compId];
        return copy;
      });
    }, 3200);
  };

  const convertFromCatalogAed = (amountAed?: number): number => {
    const val = Number(amountAed) || 0;
    if (val <= 0) return 0;
    const fxMultiplier = resolveToAedMultiplier(currency || 'AED');
    return fxMultiplier > 0 && fxMultiplier !== 1
      ? Math.round((val / fxMultiplier) * 100) / 100
      : Math.round(val * 100) / 100;
  };

  /**
   * Commits sub-component changes without wiping the parent line item's selling price
   * in lump_sum mode when sub-items are zero-price / included accessories, while syncing
   * parent unit_price and cost_price in itemized mode (including when zeroed out).
   */
  const commitComponents = (
    nextComponents: LineItemComponent[],
    nextMode?: 'itemized' | 'lump_sum',
    nextNotes: string = optionScopeNotes,
    nextCompositeFlag: boolean = true,
    overrideParentQty?: number,
    overrideParentUnit?: string,
    forceSyncParentPrice: boolean = false
  ) => {
    const effectiveParentQty =
      overrideParentQty !== undefined ? overrideParentQty : Math.max(1, Number(parentQuantity) || 1);
    const totals = recalculateCompositeItemTotals(nextComponents, effectiveParentQty);

    const hasPricedSubItems = totals.unitSellingPrice > 0;
    const allSubsExplicitIncluded =
      nextComponents.length > 0 && nextComponents.every((c) => Boolean(c.is_included_accessory));
    const resolvedMode: 'itemized' | 'lump_sum' =
      nextMode ||
      (packagePricingMode === 'itemized' && !allSubsExplicitIncluded
        ? 'itemized'
        : hasPricedSubItems
        ? 'itemized'
        : 'lump_sum');

    const currentParentUnitPrice = Number(item?.unit_price) || 0;
    const currentParentCostPrice = Number(item?.cost_price) || 0;

    const shouldUpdateParentPrice =
      forceSyncParentPrice ||
      (resolvedMode === 'itemized' && !allSubsExplicitIncluded) ||
      (hasPricedSubItems && (currentParentUnitPrice <= 0 || packagePricingMode === 'itemized'));

    const nextUnitPrice = shouldUpdateParentPrice ? totals.unitSellingPrice : currentParentUnitPrice;
    const nextTotalPrice = Math.round(effectiveParentQty * nextUnitPrice * 100) / 100;
    const shouldUpdateParentCost =
      totals.unitCostPrice > 0 || (resolvedMode === 'itemized' && !allSubsExplicitIncluded);
    const nextCostPrice = shouldUpdateParentCost ? totals.unitCostPrice : currentParentCostPrice;

    onChange({
      is_composite_set: nextCompositeFlag,
      sub_components: totals.normalizedComponents,
      package_pricing_mode: resolvedMode,
      option_scope_notes: nextNotes,
      ...(overrideParentQty !== undefined ? { quantity: overrideParentQty } : {}),
      ...(overrideParentUnit !== undefined ? { unit: overrideParentUnit } : {}),
      ...(shouldUpdateParentPrice
        ? {
            unit_price: nextUnitPrice,
            total_price: nextTotalPrice,
          }
        : {}),
      ...(shouldUpdateParentCost ? { cost_price: nextCostPrice } : {}),
    });
  };

  // Detect if sub_components[0] is a legacy duplicate of the parent heading with 0 price
  const hasRedundantParentCloneRow = useMemo(() => {
    if (subComponents.length < 2) return false;
    const first = subComponents[0];
    const parentName = (item?.item_name || item?.name || '').trim().toLowerCase();
    const firstName = (first.item_name || '').trim().toLowerCase();
    const firstPrice = Number(first.unit_price) || 0;
    if (!first.is_included_accessory && firstPrice === 0 && (!firstName || firstName === parentName)) {
      return subComponents.slice(1).some((c) => Boolean(c.is_included_accessory) || (Number(c.unit_price) || 0) === 0);
    }
    return false;
  }, [subComponents, item?.item_name, item?.name]);

  const handleCleanRedundantParentRow = () => {
    if (!hasRedundantParentCloneRow) return;
    const cleaned = subComponents.slice(1);
    commitComponents(cleaned, 'lump_sum', optionScopeNotes, cleaned.length > 0);
  };

  const handleToggleComposite = (enabled: boolean) => {
    if (!enabled) {
      onChange({
        is_composite_set: false,
        sub_components: [],
        package_pricing_mode: 'lump_sum',
        option_scope_notes: optionScopeNotes,
      });
      return;
    }

    // Extract any "2 x Top and bottom distribution system" lines from parent description if subComponents is empty
    if (subComponents.length === 0) {
      const rawDesc = (item?.description || '').trim();
      const descLines = rawDesc
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const extracted: LineItemComponent[] = [];
      descLines.forEach((line) => {
        const qtyAccMatch = line.match(/^(?:[-•*]\s*)?(\d+)\s*[xX×]\s+(.+)$/);
        if (qtyAccMatch) {
          const accQty = Math.max(1, Number(qtyAccMatch[1]) || 1);
          const accName = qtyAccMatch[2].trim().replace(/[,;]+$/, '');
          if (accName) {
            extracted.push({
              id: `sub_${Date.now()}_acc_${extracted.length + 1}`,
              item_name: accName,
              remark: '',
              quantity: accQty,
              unit: 'Nos',
              cost_price: 0,
              unit_price: 0,
              total_price: 0,
              line_total: 0,
              is_included_accessory: true,
            });
          }
        }
      });

      const seed: LineItemComponent[] =
        extracted.length > 0
          ? extracted
          : [
              {
                id: `sub_${Date.now()}_1`,
                item_name: '',
                remark: '',
                quantity: 1,
                unit: 'Nos',
                cost_price: 0,
                unit_price: 0,
                total_price: 0,
                line_total: 0,
                is_included_accessory: true,
              },
            ];
      commitComponents(seed, 'lump_sum', optionScopeNotes, true);
      return;
    }

    commitComponents(subComponents, packagePricingMode, optionScopeNotes, true);
  };

  const handleAddSubItem = () => {
    const nextIdx = subComponents.length + 1;
    const newComp: LineItemComponent = {
      id: `sub_${Date.now()}_${nextIdx}`,
      item_name: '',
      remark: '',
      quantity: 1,
      unit: 'Nos',
      cost_price: 0,
      unit_price: 0,
      total_price: 0,
      line_total: 0,
      is_included_accessory: true,
    };
    commitComponents([...subComponents, newComp]);
  };

  const extractCleanDescAndAttributesFromProduct = (
    prod: Product
  ): { cleanDesc: string; attributes: Array<{ key: string; value: string }> } => {
    const baseAttrs: Array<{ key: string; value: string }> = Array.isArray(prod.attributes)
      ? prod.attributes
          .filter((a) => a && (a.key?.trim() || a.value?.trim()))
          .map((a) => ({
            key: String(a.key || '').trim(),
            value: String(a.value || '').replace(/^[•▪▸\-*]\s*/, '').trim(),
          }))
      : [];
    const seenKeys = new Set(baseAttrs.map((a) => a.key.toLowerCase()));
    const rawDesc = String(prod.description || '').trim();
    if (!rawDesc) {
      return { cleanDesc: '', attributes: baseAttrs };
    }

    const keptLines: string[] = [];
    rawDesc.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (/^specs?\s*:/i.test(trimmed)) {
        const specBody = trimmed.replace(/^specs?\s*:\s*/i, '');
        specBody.split(/\s*[|;•]\s*/).forEach((seg) => {
          const kv = seg.match(/^([^:=]+)[:=]\s*(.+)$/);
          if (kv) {
            const k = kv[1].trim();
            const v = kv[2].replace(/^[•▪▸\-*]\s*/, '').trim();
            if (k && v && !seenKeys.has(k.toLowerCase())) {
              seenKeys.add(k.toLowerCase());
              baseAttrs.push({ key: k, value: v });
            }
          }
        });
        return;
      }
      keptLines.push(trimmed);
    });

    return {
      cleanDesc: keptLines.join('\n'),
      attributes: baseAttrs,
    };
  };

  const handleSelectCatalogProductForSub = (
    rawProd: Product,
    targetId: string | 'NEW',
    options?: { isBaseTemplate?: boolean }
  ) => {
    const prod = resolveEffectiveCatalogProduct(rawProd, activeCatalogProducts);
    const isBaseTemplate = Boolean(options?.isBaseTemplate);
    const snapUnitPrice = convertFromCatalogAed(
      (prod as any).default_unit_price ?? prod.unit_price
    );
    const snapCostPrice = convertFromCatalogAed(prod.cost_price ?? prod.cost_price_aed);
    const cleanUnit = !prod.unit || prod.unit === 'Custom Unit' ? 'Nos' : prod.unit;
    const { cleanDesc, attributes: hydratedAttrs } = extractCleanDescAndAttributesFromProduct(prod);

    if (targetId === 'NEW') {
      const nextIdx = subComponents.length + 1;
      const isAcc = snapUnitPrice <= 0;
      const newCompId = `sub_${Date.now()}_${nextIdx}`;
      const newComp: LineItemComponent = {
        id: newCompId,
        sn: isAcc ? undefined : String(subComponents.filter((c) => !c.is_included_accessory).length + 1),
        product_id: isBaseTemplate ? undefined : prod.id,
        sku: isBaseTemplate ? undefined : prod.sku,
        item_name: prod.name || prod.product_type || 'Catalog Item',
        remark: '',
        description: cleanDesc,
        brand_make: prod.brand_make || undefined,
        model_part_no: isBaseTemplate ? undefined : prod.model_part_no || undefined,
        country_of_origin: prod.country_of_origin || undefined,
        attributes: hydratedAttrs,
        show_attributes: true,
        show_image: true,
        image_url: prod.image_url,
        image_caption: prod.image_caption,
        image_adjustments: prod.image_adjustments,
        quantity: 1,
        unit: cleanUnit,
        cost_price: snapCostPrice,
        unit_price: snapUnitPrice,
        total_price: snapUnitPrice,
        line_total: snapUnitPrice,
        is_included_accessory: isAcc,
      };
      if (isBaseTemplate && prod.id) {
        (newComp as any).template_parent_id = prod.id;
      }
      if (isBaseTemplate && hydratedAttrs.length > 0) {
        setExpandedSpecRows((prev) => ({ ...prev, [newCompId]: true }));
      }
      commitComponents([...subComponents, newComp]);
    } else {
      const updated = subComponents.map((c) => {
        if (c.id !== targetId) return c;
        const qty = Math.max(1, Number(c.quantity) || 1);
        const uPrice = snapUnitPrice;
        const isAcc = uPrice <= 0;
        const tot = isAcc ? 0 : Math.round(qty * uPrice * 100) / 100;
        const mergedAttrs = [...(Array.isArray(c.attributes) ? c.attributes : [])];
        hydratedAttrs.forEach((ha) => {
          const existingIdx = mergedAttrs.findIndex(
            (ma) => ma.key.trim().toLowerCase() === ha.key.trim().toLowerCase()
          );
          if (existingIdx === -1) {
            mergedAttrs.push(ha);
          } else if (!mergedAttrs[existingIdx].value?.trim() && ha.value?.trim()) {
            mergedAttrs[existingIdx] = ha;
          }
        });
        const nextComp: LineItemComponent = {
          ...c,
          product_id: isBaseTemplate ? undefined : prod.id,
          sku: isBaseTemplate ? undefined : prod.sku,
          item_name: prod.name || c.item_name,
          description: cleanDesc || c.description || '',
          brand_make: prod.brand_make || c.brand_make,
          model_part_no: isBaseTemplate ? c.model_part_no : prod.model_part_no || c.model_part_no,
          country_of_origin: prod.country_of_origin || c.country_of_origin,
          attributes: mergedAttrs,
          show_attributes: c.show_attributes !== false,
          show_image: c.show_image !== false,
          image_url: prod.image_url || c.image_url,
          image_caption: prod.image_caption || c.image_caption,
          image_adjustments: prod.image_adjustments || c.image_adjustments,
          unit: cleanUnit,
          cost_price: snapCostPrice,
          unit_price: uPrice,
          total_price: tot,
          line_total: tot,
          is_included_accessory: isAcc,
        };
        if (isBaseTemplate && prod.id) {
          (nextComp as any).template_parent_id = prod.id;
        }
        return nextComp;
      });
      if (isBaseTemplate && hydratedAttrs.length > 0 && targetId !== 'NEW') {
        setExpandedSpecRows((prev) => ({ ...prev, [targetId]: true }));
      }
      commitComponents(updated);
    }

    setShowCatalogPickerForRow(null);
    setCatalogSearchQuery('');
  };

  const handleUpdateSubPatch = (id: string, patch: Partial<LineItemComponent>) => {
    const updated = subComponents.map((c) => (c.id === id ? { ...c, ...patch } : c));
    commitComponents(updated);
  };

  const handlePullSubFromCatalog = (comp: LineItemComponent, targetProd: Product) => {
    const prod = resolveEffectiveCatalogProduct(targetProd, activeCatalogProducts);
    const { cleanDesc, attributes: hydratedAttrs } = extractCleanDescAndAttributesFromProduct(prod);
    const cleanUnit = !prod.unit || prod.unit === 'Custom Unit' ? comp.unit || 'Nos' : prod.unit;
    handleUpdateSubPatch(comp.id, {
      product_id: prod.id,
      sku: prod.sku || comp.sku,
      item_name: prod.name || prod.product_type || comp.item_name,
      description: cleanDesc,
      brand_make: prod.brand_make || '',
      model_part_no: prod.model_part_no || '',
      country_of_origin: prod.country_of_origin || '',
      image_url: prod.image_url || comp.image_url,
      image_caption: prod.image_caption || comp.image_caption,
      image_adjustments: prod.image_adjustments || comp.image_adjustments,
      attributes: hydratedAttrs,
      unit: cleanUnit,
    });
    setOpenSyncMenuRowId(null);
    flashRowSyncStatus(comp.id, '✓ Pulled from Catalog');
  };

  const handlePushSubToCatalog = async (comp: LineItemComponent, targetProd: Product) => {
    if (!targetProd?.id) return;
    setSyncBusyByRow((prev) => ({ ...prev, [comp.id]: true }));
    setOpenSyncMenuRowId(null);
    try {
      const effectiveAttrs =
        Array.isArray(comp.attributes) && comp.attributes.length > 0
          ? comp.attributes.filter((a) => a && (a.key?.trim() || a.value?.trim()))
          : Array.isArray(targetProd.attributes)
          ? targetProd.attributes
          : [];
      const patchPayload: Partial<Product> = {
        ...(comp.item_name?.trim() ? { name: comp.item_name.trim() } : {}),
        description: comp.description ?? '',
        brand_make: comp.brand_make ?? targetProd.brand_make ?? '',
        model_part_no: comp.model_part_no ?? targetProd.model_part_no ?? '',
        country_of_origin: comp.country_of_origin ?? targetProd.country_of_origin ?? '',
        attributes: effectiveAttrs,
        ...(comp.image_url !== undefined ? { image_url: comp.image_url } : {}),
        ...(comp.unit ? { unit: comp.unit } : {}),
      };
      const sanitizedPatch = sanitizeFirestorePayload({
        ...patchPayload,
        id: targetProd.id,
        updatedAt: new Date().toISOString(),
      });
      await safeUpdateDoc('products', targetProd.id, sanitizedPatch);
      const upserted = await MetadataRepository.upsertLocalProduct({
        ...targetProd,
        ...patchPayload,
        id: targetProd.id,
      });
      if (upserted) {
        setLocalSavedProducts((prev) => [...prev.filter((p) => p.id !== upserted.id), upserted]);
        if (typeof setProducts === 'function') {
          setProducts((prev) =>
            prev.some((p) => p.id === upserted.id)
              ? prev.map((p) => (p.id === upserted.id ? upserted : p))
              : [upserted, ...prev]
          );
        }
        if (onCatalogProductUpserted) {
          onCatalogProductUpserted(upserted);
        }
      }
      if (!comp.product_id || comp.product_id !== targetProd.id) {
        handleUpdateSubPatch(comp.id, {
          product_id: targetProd.id,
          sku: targetProd.sku || comp.sku,
        });
      }
      flashRowSyncStatus(comp.id, '✓ Saved to Catalog');
    } catch {
      flashRowSyncStatus(comp.id, '⚠ Sync Failed');
    } finally {
      setSyncBusyByRow((prev) => ({ ...prev, [comp.id]: false }));
    }
  };

  const handleCreateNewCatalogProductFromSub = async (comp: LineItemComponent) => {
    const cleanName = (comp.item_name || '').trim();
    if (!cleanName) return;
    setSyncBusyByRow((prev) => ({ ...prev, [comp.id]: true }));
    setOpenSyncMenuRowId(null);
    try {
      const fxToAed = resolveToAedMultiplier(currency || 'AED');
      const sellAed = Math.round((Number(comp.unit_price) || 0) * fxToAed * 100) / 100;
      const costAed = Math.round((Number(comp.cost_price) || 0) * fxToAed * 100) / 100;
      const generatedSku =
        (comp.sku && comp.sku.trim()) ||
        `SUB-${cleanName
          .replace(/[^a-zA-Z0-9]/g, '')
          .toUpperCase()
          .slice(0, 4) || 'ITEM'}-${Date.now().toString().slice(-4)}`;
      const cleanAttrs = Array.isArray(comp.attributes)
        ? comp.attributes.filter((a) => a && (a.key?.trim() || a.value?.trim()))
        : [];
      const wsId = activeWorkspace?.id || (item as any)?.workspace_id || 'ws_default';
      const nowIso = new Date().toISOString();

      const newProdPayload: any = {
        name: cleanName,
        product_type: item?.product_type || 'Component / Sub-Item',
        sku: generatedSku,
        description: comp.description ?? '',
        brand_make: comp.brand_make ?? '',
        model_part_no: comp.model_part_no ?? '',
        country_of_origin: comp.country_of_origin ?? '',
        unit: comp.unit || 'Nos',
        unit_price: sellAed,
        default_unit_price: sellAed,
        cost_price: costAed,
        cost_price_aed: costAed,
        currency: 'AED',
        attributes: cleanAttrs,
        image_url: comp.image_url || '',
        workspace_id: wsId,
        is_deleted: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const sanitized = sanitizeFirestorePayload(newProdPayload);
      const docRef = await safeAddDoc('products', sanitized);
      const createdId = docRef?.id || `prod_sub_${Date.now()}`;
      const savedProd: Product = {
        ...newProdPayload,
        id: createdId,
      };
      await MetadataRepository.upsertLocalProduct(savedProd);
      setLocalSavedProducts((prev) => [...prev.filter((p) => p.id !== createdId), savedProd]);
      if (typeof setProducts === 'function') {
        setProducts((prev) => [savedProd, ...prev.filter((p) => p.id !== createdId)]);
      }
      if (onCatalogProductUpserted) {
        onCatalogProductUpserted(savedProd);
      }
      handleUpdateSubPatch(comp.id, {
        product_id: createdId,
        sku: generatedSku,
      });
      flashRowSyncStatus(comp.id, '✓ Saved to Catalog');
    } catch {
      flashRowSyncStatus(comp.id, '⚠ Save Failed');
    } finally {
      setSyncBusyByRow((prev) => ({ ...prev, [comp.id]: false }));
    }
  };

  const handleUpdateSub = (id: string, field: keyof LineItemComponent, value: any) => {
    const updated = subComponents.map((c) => {
      if (c.id !== id) return c;
      const next: LineItemComponent = { ...c, [field]: value };
      const qty = Math.max(0, Number(next.quantity) || 0);

      if (field === 'unit_price') {
        const parsedPrice = Math.max(0, Number(value) || 0);
        next.unit_price = parsedPrice;
        next.is_included_accessory = parsedPrice <= 0;
      } else if (field === 'is_included_accessory') {
        if (value === true) {
          next.unit_price = 0;
        }
      }

      const uPrice = next.is_included_accessory ? 0 : Math.max(0, Number(next.unit_price) || 0);
      next.unit_price = uPrice;
      const tot = Math.round(qty * uPrice * 100) / 100;
      next.total_price = tot;
      next.line_total = tot;
      return next;
    });
    commitComponents(updated);
  };

  const handleMoveSub = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= subComponents.length) return;
    const copy = [...subComponents];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIdx, 0, moved);
    commitComponents(copy);
  };

  const handleRemoveSub = (id: string) => {
    const filtered = subComponents.filter((c) => c.id !== id);
    commitComponents(filtered, undefined, optionScopeNotes, filtered.length > 0);
  };

  const parsedBulkPreview = useMemo(
    () => parseBulkSubComponentsText(bulkPasteText, bulkPasteAsAccessory),
    [bulkPasteText, bulkPasteAsAccessory]
  );

  const handleCommitBulkPaste = (mode: 'append' | 'replace') => {
    if (parsedBulkPreview.length === 0) return;
    const nextList =
      mode === 'replace' ? parsedBulkPreview : [...subComponents, ...parsedBulkPreview];
    commitComponents(nextList);
    setBulkPasteText('');
    setShowBulkPaste(false);
  };

  const filteredPickerProducts = useMemo(() => {
    const q = catalogSearchQuery.trim().toLowerCase();
    return activeCatalogProducts.filter((p) => {
      if (!q) return true;
      const attrText = Array.isArray(p.attributes)
        ? p.attributes.map((a) => `${a.key || ''} ${a.value || ''}`).join(' ')
        : '';
      return (
        (p.name || '').toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.brand_make || '').toLowerCase().includes(q) ||
        (p.model_part_no || '').toLowerCase().includes(q) ||
        (p.product_type || '').toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q) ||
        ((p as any).variant_label || (p as any).variant_name || '').toLowerCase().includes(q) ||
        attrText.toLowerCase().includes(q)
      );
    });
  }, [activeCatalogProducts, catalogSearchQuery]);

  const totals = recalculateCompositeItemTotals(subComponents, parentQuantity);
  const pricedCount = subComponents.filter((c) => !c.is_included_accessory && (Number(c.unit_price) || 0) > 0).length;
  const includedCount = subComponents.length - pricedCount;
  const parentUnitPrice = Number(item?.unit_price) || 0;
  const hasSubPriceMismatch =
    totals.unitSellingPrice > 0 && Math.abs(totals.unitSellingPrice - parentUnitPrice) > 0.01;

  if (!isCompositeSet && subComponents.length === 0) {
    return (
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span>
            Does this system or set include sub-items or accessories?
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleToggleComposite(true)}
          className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
        >
          <ListTree className="w-3.5 h-3.5" />
          <span>+ Add Included Items / Package Contents</span>
        </button>
      </div>
    );
  }

  return (
    <div className="@container rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
      {/* Compact Header Bar */}
      <div className="px-3 py-2 bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <PackageCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Included Items &amp; Package Contents
          </span>
          <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-mono text-[10px] font-bold">
            {subComponents.length} {subComponents.length === 1 ? 'Item' : 'Items'}
            {pricedCount > 0 ? ` (${pricedCount} Priced · ${includedCount} Included)` : ' (Included in Set Price)'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {hasSubPriceMismatch && (
            <button
              type="button"
              onClick={() =>
                commitComponents(subComponents, 'itemized', optionScopeNotes, true, undefined, undefined, true)
              }
              className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10.5px] font-mono font-bold flex items-center gap-1 transition cursor-pointer"
              title="Set the main line item's unit price to the sum of these sub-item prices"
            >
              <span>
                Sub-Items Sum: {currency}{' '}
                {totals.unitSellingPrice.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{' '}
                — Apply to Item Price
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowCostInputs((v) => !v)}
            className={`px-2 py-1 rounded-md border text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer ${
              showCostInputs
                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                : 'bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Show or hide internal supplier cost per sub-item"
          >
            <DollarSign className="w-3 h-3" />
            <span>{showCostInputs ? 'Hide Cost' : 'Sub-Item Costs'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBulkPaste((prev) => !prev)}
            className={`px-2 py-1 rounded-md border text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer ${
              showBulkPaste
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Paste a list of included items or parts from Excel or text"
          >
            <ClipboardPaste className="w-3 h-3" />
            <span>Paste List</span>
          </button>

          {subComponents.length > 0 && (
            <button
              type="button"
              onClick={() => handleToggleComposite(false)}
              className="px-2 py-1 rounded-md bg-white dark:bg-slate-800 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 dark:border-slate-700 text-[10.5px] font-semibold transition cursor-pointer"
              title="Clear included sub-items and keep as a single line item"
            >
              Clear List
            </button>
          )}
        </div>
      </div>

      {/* Auto-detect notice if subComponents[0] is a legacy duplicate 0.00 row of the parent item */}
      {hasRedundantParentCloneRow && (
        <div className="px-3 py-2 bg-amber-50/90 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="truncate">
              Row #1 duplicates the main package heading with <strong>0.00</strong> price.
            </span>
          </div>
          <button
            type="button"
            onClick={handleCleanRedundantParentRow}
            className="px-2.5 py-0.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-[10.5px] font-bold shrink-0 cursor-pointer transition"
          >
            Remove Duplicate Row #1
          </button>
        </div>
      )}

      {/* Bulk Paste Drawer */}
      {showBulkPaste && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5 text-indigo-600" />
                Paste Included Items or Sub-Components
              </span>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                Paste one item per line (e.g. <code className="font-mono bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">2 x Top and bottom distribution system</code> or Excel rows).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowBulkPaste(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <textarea
            rows={3}
            value={bulkPasteText}
            onChange={(e) => setBulkPasteText(e.target.value)}
            placeholder={`2 x Top and bottom distribution system\n1 x Vacuum Breaker\n1 x Riser Pipe`}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 font-semibold">
              Detected: {parsedBulkPreview.length} item(s)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={parsedBulkPreview.length === 0}
                onClick={() => handleCommitBulkPaste('append')}
                className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
              >
                + Add {parsedBulkPreview.length} Items
              </button>
              <button
                type="button"
                disabled={parsedBulkPreview.length === 0}
                onClick={() => handleCommitBulkPaste('replace')}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-rose-50 disabled:opacity-40 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
              >
                Replace List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Catalog Sub-Component Picker Popover */}
      {showCatalogPickerForRow && activeCatalogProducts.length > 0 && (
        <div className="p-3 bg-blue-50/80 dark:bg-slate-800 border-b border-blue-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-blue-600" />
              {showCatalogPickerForRow === 'NEW'
                ? 'Add Included Item from Products Catalog'
                : 'Link Item to Catalog Product'}
            </span>
            <button
              type="button"
              onClick={() => {
                setShowCatalogPickerForRow(null);
                setCatalogSearchQuery('');
              }}
              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              value={catalogSearchQuery}
              onChange={(e) => setCatalogSearchQuery(e.target.value)}
              placeholder="Search catalog by product name, SKU, brand, model..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-blue-200 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {(() => {
              const variantAnalysisMap = buildCatalogVariantAnalysisMap(activeCatalogProducts);
              const childrenByParentId = new Map<string, Product[]>();
              activeCatalogProducts.forEach((prod) => {
                const parentId = (prod as any).parent_product_id || prod.variant_parent_id;
                if (parentId) {
                  const list = childrenByParentId.get(parentId) || [];
                  list.push(prod);
                  childrenByParentId.set(parentId, list);
                }
              });

              const matchingIds = new Set(filteredPickerProducts.map((p) => p.id));
              const topLevelRows = activeCatalogProducts
                .filter((prod) => {
                  const parentId = (prod as any).parent_product_id || prod.variant_parent_id;
                  if (parentId && activeCatalogProducts.some((cand) => cand.id === parentId)) {
                    return false;
                  }
                  if (matchingIds.has(prod.id)) return true;
                  const children = prod.id ? childrenByParentId.get(prod.id) || [] : [];
                  return children.some((c) => matchingIds.has(c.id));
                })
                .slice(0, 30);

              if (topLevelRows.length === 0) {
                return (
                  <div className="col-span-full py-4 text-center text-xs text-slate-400">
                    No matching catalog products found.
                  </div>
                );
              }

              return topLevelRows.map((prod) => {
                const effectiveProd = resolveEffectiveCatalogProduct(prod, activeCatalogProducts);
                const avail = (effectiveProd.stock_on_hand || 0) - (effectiveProd.stock_reserved || 0);
                const priceConv = convertFromCatalogAed(
                  (effectiveProd as any).default_unit_price ?? effectiveProd.unit_price
                );
                const cleanUnit =
                  !effectiveProd.unit || effectiveProd.unit === 'Custom Unit'
                    ? 'Nos'
                    : effectiveProd.unit;
                const vInfo = prod.id ? variantAnalysisMap.get(prod.id) : undefined;
                const childVariants = prod.id ? childrenByParentId.get(prod.id) || [] : [];
                const isParentFamily =
                  childVariants.length > 0 ||
                  Boolean(prod.has_variants) ||
                  (Array.isArray(prod.attributes) &&
                    prod.attributes.some((a) => a.key?.trim() && !a.value?.trim()));

                return (
                  <div
                    key={prod.id}
                    className={`rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-blue-400 transition p-2 flex flex-col gap-1.5 ${
                      isParentFamily ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectCatalogProductForSub(prod, showCatalogPickerForRow)}
                      className="w-full text-left flex items-center justify-between gap-2 cursor-pointer group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-blue-700 truncate">
                            {prod.name || prod.product_type}
                          </div>
                          {isParentFamily ? (
                            <span className="text-[9px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded">
                              {childVariants.length > 0
                                ? `Parent Family (${childVariants.length} Variants)`
                                : 'Base Template'}
                            </span>
                          ) : (
                            vInfo?.isVariant && (
                              <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded">
                                Variant
                              </span>
                            )
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {[
                            effectiveProd.sku ? `SKU: ${effectiveProd.sku}` : '',
                            effectiveProd.brand_make,
                            effectiveProd.model_part_no,
                          ]
                            .filter(Boolean)
                            .join(' · ') || effectiveProd.product_type}
                        </div>
                        {effectiveProd.is_inventoried && (
                          <span className="inline-block text-[9.5px] font-mono font-bold text-emerald-700 mt-0.5">
                            Avail: {avail} {cleanUnit}
                          </span>
                        )}
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        {priceConv > 0 ? (
                          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                            {currency}{' '}
                            {priceConv.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        ) : (
                          <span className="text-[10px] font-sans text-slate-400 block">Included</span>
                        )}
                        <span className="text-[10px] text-blue-600 font-sans font-semibold block">
                          Select
                        </span>
                      </div>
                    </button>

                    {isParentFamily && (
                      <div className="pl-2 border-l-2 border-purple-200 flex flex-wrap items-center gap-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                        {childVariants.map((cv) => {
                          const resolvedCv = resolveEffectiveCatalogProduct(
                            cv,
                            activeCatalogProducts
                          );
                          const cvLabel =
                            (cv as any).variant_label ||
                            (cv as any).variant_name ||
                            deriveSuggestedVariantLabel(cv.attributes, prod) ||
                            cv.sku ||
                            cv.name;
                          const cvPrice = convertFromCatalogAed(
                            (resolvedCv as any).default_unit_price ?? resolvedCv.unit_price
                          );
                          return (
                            <button
                              key={cv.id}
                              type="button"
                              onClick={() =>
                                handleSelectCatalogProductForSub(cv, showCatalogPickerForRow)
                              }
                              className="px-2 py-0.5 rounded-md bg-indigo-50/90 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-semibold transition cursor-pointer flex items-center gap-1"
                              title={`Select variant ${cvLabel} (inherits shared parent specs)`}
                            >
                              <span>{cvLabel}</span>
                              <span className="font-mono text-[9.5px] text-indigo-600">
                                — {currency}{' '}
                                {cvPrice.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectCatalogProductForSub(prod, showCatalogPickerForRow, {
                              isBaseTemplate: true,
                            })
                          }
                          className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-semibold transition cursor-pointer"
                          title="Insert shared base attributes & image as a custom template sub-item to fill in for this Set"
                        >
                          ✨ Custom / Base Template
                        </button>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Unified Single-Table Compact Checklist */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {subComponents.map((comp, idx) => {
          const unitPriceVal = Number(comp.unit_price) || 0;
          const isIncludedZeroPrice = Boolean(comp.is_included_accessory) || unitPriceVal <= 0;
          const hasDesc = Boolean(comp.description && comp.description.trim());
          const hasNote = isMeaningfulRemark(comp.remark) || Boolean(comp.row_note && comp.row_note.trim());
          const activeFmtCount = getActiveFormatCount(comp);
          const isFmtOpen = Boolean(expandedFormatRows[comp.id]);
          const isDetailsOpen = Boolean(expandedSpecRows[comp.id]);
          const rawLinkedProduct =
            comp.product_id
              ? activeCatalogProducts.find((p) => p.id === comp.product_id)
              : comp.sku
              ? activeCatalogProducts.find((p) => p.sku && p.sku.toLowerCase() === comp.sku!.toLowerCase())
              : comp.item_name?.trim()
              ? activeCatalogProducts.find(
                  (p) => (p.name || '').trim().toLowerCase() === comp.item_name!.trim().toLowerCase()
                )
              : undefined;
          const linkedProduct = rawLinkedProduct
            ? resolveEffectiveCatalogProduct(rawLinkedProduct, activeCatalogProducts)
            : undefined;
          const effectiveThumbUrl = comp.image_url || linkedProduct?.image_url;
          const effectiveBrand = comp.brand_make || linkedProduct?.brand_make || '';
          const effectiveModel = comp.model_part_no || linkedProduct?.model_part_no || '';
          const effectiveOrigin = comp.country_of_origin || linkedProduct?.country_of_origin || '';
          const effectiveAttrs =
            Array.isArray(comp.attributes) && comp.attributes.length > 0
              ? comp.attributes
              : Array.isArray(linkedProduct?.attributes)
              ? linkedProduct!.attributes
              : [];
          const specCount = effectiveAttrs.filter((a) => a && (a.key?.trim() || a.value?.trim())).length;
          const hasMetaDetails = Boolean(
            hasDesc || hasNote || effectiveBrand || effectiveModel || effectiveOrigin
          );
          const isEmbeddedImageBlob =
            typeof comp.image_url === 'string' &&
            (comp.image_url.startsWith('data:') ||
              comp.image_url.startsWith('blob:') ||
              comp.image_url.startsWith('idb:'));
          const rowSyncBadge = syncStatusByRow[comp.id];
          const isRowSyncBusy = Boolean(syncBusyByRow[comp.id]);

          return (
            <div
              key={comp.id}
              className="px-3 py-2.5 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-2"
            >
              {/* LINE 1: Index, Thumbnail, Qty, Unit, Sub-Item Name, Cost (optional), Price / Included */}
              <div className="flex flex-wrap @[520px]:flex-nowrap items-center gap-1.5">
                {/* # Index */}
                <span className="w-5 text-[10.5px] font-mono tabular-nums font-bold text-slate-400 text-center shrink-0">
                  {idx + 1}.
                </span>

                {/* Compact Thumbnail Badge or Photo Upload Trigger */}
                {effectiveThumbUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      setLightboxSubComp({
                        ...comp,
                        image_url: effectiveThumbUrl,
                      })
                    }
                    className={`w-7 h-7 rounded-md border bg-white dark:bg-slate-900 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer relative group ${
                      comp.show_image === false
                        ? 'opacity-40 border-slate-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-blue-400'
                    }`}
                    title={
                      comp.show_image === false
                        ? 'Sub-item photo hidden on quotation (click to inspect)'
                        : 'Sub-item photo (click to inspect / zoom)'
                    }
                  >
                    <img
                      src={effectiveThumbUrl}
                      alt={comp.item_name || `Sub #${idx + 1}`}
                      className="w-full h-full object-contain p-0.5"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ) : (
                  <label
                    className="w-7 h-7 rounded-md border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-400 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-blue-600 shrink-0 cursor-pointer transition"
                    title="Upload sub-item photo"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (f) handleUploadSubImage(comp.id, f);
                      }}
                    />
                  </label>
                )}

                {/* Qty */}
                <input
                  type="number"
                  step="any"
                  value={comp.quantity ?? ''}
                  onChange={(e) => handleUpdateSub(comp.id, 'quantity', e.target.value)}
                  placeholder="Qty"
                  title="Quantity"
                  className="w-13 h-7 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 text-xs font-mono tabular-nums text-center font-bold text-slate-900 dark:text-white focus:border-blue-500 focus:bg-white focus:outline-none shrink-0"
                />

                {/* Unit */}
                <input
                  type="text"
                  value={comp.unit ?? 'Nos'}
                  onChange={(e) => handleUpdateSub(comp.id, 'unit', e.target.value)}
                  placeholder="Nos"
                  title="Unit (e.g. Nos, Set, Lot)"
                  className="w-13 h-7 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 text-xs font-mono text-center text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none shrink-0"
                />

                {/* Sub-Item Name */}
                <input
                  type="text"
                  value={comp.item_name ?? ''}
                  onChange={(e) => handleUpdateSub(comp.id, 'item_name', e.target.value)}
                  placeholder="Included item or component name (e.g. Top and Bottom Distribution System, Vacuum Breaker)"
                  className="flex-1 min-w-[140px] h-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 text-xs font-medium text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />

                {/* Optional Cost Input (Only when Sub-Item Costs toggle is active) */}
                {showCostInputs && (
                  <div className="relative w-22 shrink-0" title={`Internal Supplier Cost (${currency})`}>
                    <input
                      type="number"
                      step="0.01"
                      value={comp.cost_price || ''}
                      onChange={(e) => handleUpdateSub(comp.id, 'cost_price', e.target.value)}
                      placeholder="Cost 0.00"
                      className="w-full h-7 bg-amber-50/40 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 rounded-md px-2 text-xs font-mono text-right text-slate-700 dark:text-slate-300 tabular-nums focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Optional Unit Price or "Included" */}
                <div className="relative w-24 shrink-0" title={`Optional sub-item price in ${currency} (leave 0 for Included)`}>
                  <input
                    type="number"
                    step="0.01"
                    value={unitPriceVal > 0 ? unitPriceVal : ''}
                    onChange={(e) => handleUpdateSub(comp.id, 'unit_price', e.target.value)}
                    placeholder="Included"
                    className={`w-full h-7 rounded-md px-2 text-xs font-mono text-right tabular-nums focus:outline-none border ${
                      isIncludedZeroPrice
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 placeholder:text-emerald-600/80 dark:placeholder:text-emerald-400/80 font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold focus:border-blue-500'
                    }`}
                  />
                </div>
              </div>

              {/* LINE 2: Calm Metadata Summary (left) + Unified Action Strip (right) */}
              <div className="pl-6 flex flex-wrap items-center justify-between gap-2">
                {/* Quiet Inline Metadata Preview (clickable to open unified Details & Specs drawer) */}
                <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  {(effectiveBrand || effectiveModel) && (
                    <button
                      type="button"
                      onClick={() => toggleDetailsRow(comp.id)}
                      className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 truncate max-w-[180px] cursor-pointer transition-colors"
                      title={`${[effectiveBrand, effectiveModel].filter(Boolean).join(' · ')} — click to edit details`}
                    >
                      {[effectiveBrand, effectiveModel].filter(Boolean).join(' · ')}
                    </button>
                  )}

                  {(effectiveBrand || effectiveModel) && !isDetailsOpen && hasDesc && (
                    <span className="text-slate-300 dark:text-slate-600 text-[10px] select-none shrink-0" aria-hidden="true">
                      ·
                    </span>
                  )}

                  {!isDetailsOpen && hasDesc && (
                    <button
                      type="button"
                      onClick={() => toggleDetailsRow(comp.id)}
                      className="text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 truncate max-w-[240px] cursor-pointer transition-colors italic"
                      title={`Sub-item subtitle: "${comp.description}" — click to edit`}
                    >
                      {comp.description}
                    </button>
                  )}

                  {rowSyncBadge && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold whitespace-nowrap shrink-0">
                      {rowSyncBadge}
                    </span>
                  )}
                </div>

                {/* Streamlined Secondary Actions Strip */}
                <div className="flex items-center gap-1 shrink-0 ml-auto flex-wrap">
                  {/* Single Unified [Details & Specs] Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleDetailsRow(comp.id)}
                    className={`px-2 py-0.5 rounded-md border text-[10.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer ${
                      isDetailsOpen
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : specCount > 0 || hasMetaDetails
                        ? 'bg-indigo-50/90 text-indigo-700 border-indigo-200 hover:bg-indigo-100/80 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 hover:bg-slate-50 border-slate-200 dark:border-slate-700'
                    }`}
                    title="Expand sub-item description, scope note, brand/model/origin, photo, and technical specifications"
                  >
                    <SlidersHorizontal className="w-3 h-3 shrink-0" />
                    <span>Details &amp; Specs</span>
                    {specCount > 0 && (
                      <span
                        className={`font-mono tabular-nums text-[10px] ${
                          isDetailsOpen ? 'text-indigo-100' : 'text-indigo-600 dark:text-indigo-300'
                        }`}
                      >
                        ({specCount})
                      </span>
                    )}
                    {specCount === 0 && hasMetaDetails && !isDetailsOpen && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"
                        title="Contains description, note, or brand/model details"
                      />
                    )}
                    {isDetailsOpen ? (
                      <ChevronUp className="w-3 h-3 shrink-0 opacity-80" />
                    ) : (
                      <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
                    )}
                  </button>

                  {/* Single Consistent Catalog Link / Sync Control (never duplicated inside drawer) */}
                  {rawLinkedProduct && linkedProduct ? (
                    <div className="relative inline-flex items-center">
                      <button
                        type="button"
                        disabled={isRowSyncBusy}
                        onClick={() =>
                          setOpenSyncMenuRowId((prev) => (prev === comp.id ? null : comp.id))
                        }
                        className="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10.5px] font-mono font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition"
                        title={`Linked to Catalog: ${linkedProduct.name || linkedProduct.sku} — click to Pull, Push, Relink, or Unlink`}
                      >
                        <RefreshCw className={`w-2.5 h-2.5 shrink-0 ${isRowSyncBusy ? 'animate-spin' : ''}`} />
                        <span className="truncate max-w-[82px]">{linkedProduct.sku || 'Catalog'}</span>
                        <ChevronDown className="w-2.5 h-2.5 shrink-0" />
                      </button>

                      {openSyncMenuRowId === comp.id && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-64 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-1.5 space-y-1 text-left">
                          <div className="px-2 py-1 border-b border-slate-100 dark:border-slate-800">
                            <div className="text-[10px] font-mono uppercase text-slate-400 font-bold">
                              Linked Catalog Product
                            </div>
                            <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate">
                              {linkedProduct.name}
                            </div>
                            {linkedProduct.sku && (
                              <div className="text-[10px] font-mono text-slate-500">
                                SKU: {linkedProduct.sku}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePullSubFromCatalog(comp, rawLinkedProduct)}
                            className="w-full px-2 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-slate-800 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer"
                          >
                            <ArrowDownToLine className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>Pull Latest Specs &amp; Description from Catalog</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePushSubToCatalog(comp, rawLinkedProduct)}
                            className="w-full px-2 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-slate-800 text-left text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2 cursor-pointer"
                          >
                            <ArrowUpFromLine className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Push Sub-Item Edits to Catalog Product</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenSyncMenuRowId(null);
                              setShowCatalogPickerForRow(comp.id);
                            }}
                            className="w-full px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-left text-[10.5px] text-slate-600 dark:text-slate-300 flex items-center gap-2 cursor-pointer"
                          >
                            <Link2 className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>Relink to Different Catalog Product...</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenSyncMenuRowId(null);
                              handleUpdateSubPatch(comp.id, {
                                product_id: undefined,
                                sku: undefined,
                              });
                            }}
                            className="w-full px-2 py-1 rounded hover:bg-rose-50 text-left text-[10.5px] text-rose-600 flex items-center gap-2 cursor-pointer"
                          >
                            <X className="w-3 h-3 shrink-0" />
                            <span>Unlink from Catalog</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1 shrink-0">
                      {activeCatalogProducts.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setShowCatalogPickerForRow((prev) => (prev === comp.id ? null : comp.id))
                          }
                          className="px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 hover:border-blue-300 text-[10.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer"
                          title="Link to existing Catalog SKU"
                        >
                          <Link2 className="w-3 h-3 shrink-0" />
                          <span>Link</span>
                        </button>
                      )}
                      {comp.item_name?.trim() && (
                        <button
                          type="button"
                          disabled={isRowSyncBusy}
                          onClick={() => handleCreateNewCatalogProductFromSub(comp)}
                          className="px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 text-emerald-800 dark:text-emerald-300 text-[10.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition cursor-pointer"
                          title="Save this sub-item as a new Product in Catalog and link it"
                        >
                          <BookmarkPlus className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>+ Catalog</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Row Formatting / Print Styling Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleFormatRow(comp.id)}
                    className={`p-1 rounded-md border text-[10px] transition shrink-0 cursor-pointer relative ${
                      isFmtOpen || activeFmtCount > 0
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                        : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 border-slate-200 dark:border-slate-700'
                    }`}
                    title="Row print formatting (Page break, Highlight, Bold, Hide price)"
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>

                  <span className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" aria-hidden="true" />

                  {subComponents.length > 1 && (
                    <div className="inline-flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveSub(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 disabled:opacity-25 cursor-pointer"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSub(idx, 'down')}
                        disabled={idx === subComponents.length - 1}
                        className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 disabled:opacity-25 cursor-pointer"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveSub(comp.id)}
                    className="p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-rose-600 hover:border-rose-200 shrink-0 cursor-pointer"
                    title="Remove Item"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* UNIFIED EXPANDABLE SUB-ITEM DETAILS & SPECS DRAWER */}
              {isDetailsOpen && (
                <div
                  className="ml-6 rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-slate-50/75 dark:bg-slate-800/40 p-3 space-y-3 animate-in fade-in duration-150"
                  onPaste={(e) => {
                    const clipItems = e.clipboardData?.items;
                    if (!clipItems) return;
                    for (let i = 0; i < clipItems.length; i++) {
                      if (clipItems[i].type.startsWith('image/')) {
                        const file = clipItems[i].getAsFile();
                        if (file) {
                          e.preventDefault();
                          handleUploadSubImage(comp.id, file);
                          return;
                        }
                      }
                    }
                  }}
                >
                  {/* Unified Drawer Header: Title + Quote Visibility Toggles */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-slate-700/70">
                    <span className="text-[10.5px] font-mono uppercase tracking-wider font-bold text-slate-600 dark:text-slate-300">
                      Sub-Item #{idx + 1} Details &amp; Specs
                    </span>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={comp.show_attributes !== false}
                          onChange={(e) => handleUpdateSub(comp.id, 'show_attributes', e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>Show Specs on Quote</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={comp.show_image !== false}
                          onChange={(e) => handleUpdateSub(comp.id, 'show_image', e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Show Photo on Quote</span>
                      </label>
                    </div>
                  </div>

                  {/* Single Description / Print Subtitle + Optional Scope Note */}
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-[10.5px] font-semibold text-slate-600 dark:text-slate-300">
                          Sub-Item Description / Print Subtitle
                          <span className="ml-1 font-normal text-slate-400">
                            (prints below sub-item name on PDF)
                          </span>
                        </label>
                        {hasDesc && (
                          <button
                            type="button"
                            onClick={() => handleUpdateSub(comp.id, 'description', '')}
                            className="px-1.5 py-0.5 rounded bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 text-[10px] font-semibold cursor-pointer transition shrink-0"
                            title="Clear sub-item print subtitle"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={comp.description ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'description', e.target.value)}
                        placeholder="Optional sub-item description or subtitle printed below the sub-item name..."
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none leading-relaxed"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={isMeaningfulRemark(comp.remark) ? comp.remark : comp.row_note || ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'remark', e.target.value)}
                        placeholder="Optional scope / application note (e.g. Factory pre-fitted, SS316, ASME standard)..."
                        className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                      />
                      {hasNote && (
                        <button
                          type="button"
                          onClick={() => handleUpdateSubPatch(comp.id, { remark: '', row_note: '' })}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0"
                          title="Clear scope note"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Balanced 3-Column Metadata Row: Brand / Model / Origin */}
                  <div className="grid grid-cols-1 @[460px]:grid-cols-3 gap-2">
                    <div className="min-w-0">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Brand / Make
                      </label>
                      <input
                        type="text"
                        value={comp.brand_make ?? linkedProduct?.brand_make ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'brand_make', e.target.value)}
                        placeholder="e.g. Pentair, Grundfos"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Model / Part No.
                      </label>
                      <input
                        type="text"
                        value={comp.model_part_no ?? linkedProduct?.model_part_no ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'model_part_no', e.target.value)}
                        placeholder="e.g. CR-10-4"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs font-mono text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div className="min-w-0">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Origin
                      </label>
                      <input
                        type="text"
                        value={comp.country_of_origin ?? linkedProduct?.country_of_origin ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'country_of_origin', e.target.value)}
                        placeholder="e.g. Italy, UAE"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Clean Dedicated Full-Width Media Upload / Paste Strip */}
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex flex-wrap sm:flex-nowrap items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                      Sub-Item Photo
                    </span>

                    {isEmbeddedImageBlob ? (
                      <div className="flex-1 min-w-0 flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-emerald-200 dark:border-slate-700 rounded-md px-2.5 py-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={comp.image_url}
                            alt={comp.item_name || 'Sub-item'}
                            referrerPolicy="no-referrer"
                            className="w-6 h-6 rounded object-contain border border-slate-200 dark:border-slate-700 shrink-0"
                          />
                          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                            Custom Photo Attached
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxSubComp({
                                ...comp,
                                image_url: effectiveThumbUrl,
                              })
                            }
                            className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10.5px] font-semibold whitespace-nowrap cursor-pointer transition"
                          >
                            Zoom
                          </button>
                          <label
                            className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10.5px] font-semibold whitespace-nowrap cursor-pointer transition"
                            title="Upload / Replace sub-item photo"
                          >
                            Replace
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = '';
                                if (f) handleUploadSubImage(comp.id, f);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => handleUpdateSub(comp.id, 'image_url', '')}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            title="Remove custom photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <input
                          type="text"
                          value={comp.image_url ?? ''}
                          onChange={(e) =>
                            handleUpdateSubPatch(comp.id, {
                              image_url: e.target.value,
                              show_image: true,
                            })
                          }
                          placeholder={
                            linkedProduct?.image_url
                              ? 'Using Catalog Photo — paste URL or upload to override'
                              : 'Paste image URL (https://...) or press Ctrl+V to paste photo'
                          }
                          className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                        />
                        <label
                          className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 hover:bg-blue-50 text-slate-700 dark:text-slate-200 hover:text-blue-700 border border-slate-200 dark:border-slate-700 hover:border-blue-300 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition"
                          title="Upload photo file (or Ctrl+V anywhere in this panel)"
                        >
                          <ImageIcon className="w-3 h-3 text-blue-600 shrink-0" />
                          <span>Upload</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = '';
                              if (f) handleUploadSubImage(comp.id, f);
                            }}
                          />
                        </label>
                        {comp.image_url && (
                          <button
                            type="button"
                            onClick={() => handleUpdateSub(comp.id, 'image_url', '')}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0"
                            title="Remove photo URL"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Key:Value Technical Specifications List */}
                  <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Technical Specifications ({specCount})
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const baseAttrs = Array.isArray(comp.attributes)
                            ? [...comp.attributes]
                            : [...effectiveAttrs];
                          baseAttrs.push({ key: '', value: '' });
                          handleUpdateSub(comp.id, 'attributes', baseAttrs);
                        }}
                        className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span>Add Spec</span>
                      </button>
                    </div>

                    {effectiveAttrs.length > 0 ? (
                      <div className="grid grid-cols-1 @[640px]:grid-cols-2 gap-1.5">
                        {effectiveAttrs.map((attr, aIdx) => (
                          <div key={aIdx} className="flex items-center gap-1.5 min-w-0">
                            <input
                              type="text"
                              value={attr.key ?? ''}
                              title={attr.key ?? ''}
                              placeholder="Spec Key (e.g. MOC, Size)"
                              onChange={(e) => {
                                const nextAttrs = [...effectiveAttrs];
                                nextAttrs[aIdx] = { ...nextAttrs[aIdx], key: e.target.value };
                                handleUpdateSub(comp.id, 'attributes', nextAttrs);
                              }}
                              className="w-[42%] min-w-[110px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200 focus:border-blue-500 focus:outline-none truncate"
                            />
                            <input
                              type="text"
                              value={attr.value ?? ''}
                              title={attr.value ?? ''}
                              placeholder="Value (e.g. FRP, 48x72)"
                              onChange={(e) => {
                                const nextAttrs = [...effectiveAttrs];
                                nextAttrs[aIdx] = { ...nextAttrs[aIdx], value: e.target.value };
                                handleUpdateSub(comp.id, 'attributes', nextAttrs);
                              }}
                              className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const nextAttrs = effectiveAttrs.filter((_, i) => i !== aIdx);
                                handleUpdateSub(comp.id, 'attributes', nextAttrs);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded shrink-0 cursor-pointer"
                              title="Remove spec attribute"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-400 italic">
                        No technical attributes yet. Click &quot;+ Add Spec&quot; to add key:value specifications (e.g. MOC: FRP, Size: 48&quot; x 72&quot;).
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Optional Collapsible Photo & Formatting Bar */}
              {isFmtOpen && (
                <div className="pl-6">
                  {renderSubRowCustomizationBar(comp, `#${idx + 1}`)}
                </div>
              )}
            </div>
          );
        })}

        {subComponents.length === 0 && (
          <div className="py-4 text-center text-xs text-slate-400 italic">
            No included items yet. Click &quot;+ Add Included Item&quot; below.
          </div>
        )}
      </div>

      {/* Footer Actions Bar */}
      <div className="px-3 py-2 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={handleAddSubItem}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Included Item</span>
          </button>

          {activeCatalogProducts.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setShowCatalogPickerForRow((prev) => (prev === 'NEW' ? null : 'NEW'))
              }
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-blue-50 text-blue-700 dark:text-blue-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>From Catalog</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowScopeNotes((v) => !v)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
              showScopeNotes || Boolean(optionScopeNotes && optionScopeNotes.trim())
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800'
                : 'bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>Package Scope Note</span>
          </button>
        </div>

        {totals.unitSellingPrice > 0 && (
          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
            Sub-Items Total:{' '}
            <strong className="text-slate-900 dark:text-white">
              {currency}{' '}
              {totals.totalSellingPrice.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </span>
        )}
      </div>

      {/* Collapsible Package Scope Notes */}
      {(showScopeNotes || Boolean(optionScopeNotes && optionScopeNotes.trim())) && (
        <div className="px-3 pb-3 pt-1 bg-slate-50/70 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-mono uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
              Package Scope Notes (Warranties, Exclusions, Standards)
            </label>
            {!optionScopeNotes?.trim() && (
              <button
                type="button"
                onClick={() => setShowScopeNotes(false)}
                className="text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Hide
              </button>
            )}
          </div>
          <AtMentionTextarea
            rows={2}
            value={optionScopeNotes}
            tokenContext={effectiveTokenContext}
            onChange={(val) =>
              commitComponents(subComponents, packagePricingMode, val, true)
            }
            placeholder="e.g. Materials of construction, warranty terms, testing standards, or exclusions (type @ for live tags)..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500"
          />
        </div>
      )}

      {lightboxSubComp && (
        <ImageLightboxModal
          isOpen={Boolean(lightboxSubComp)}
          onClose={() => setLightboxSubComp(null)}
          title={lightboxSubComp.item_name || 'Sub-Item Photo'}
          imageUrl={lightboxSubComp.image_url}
          imageCaption={lightboxSubComp.image_caption}
          adjustments={lightboxSubComp.image_adjustments}
          activeWorkspace={activeWorkspace}
          onSaveChanges={(patch) => {
            const updated = subComponents.map((c) =>
              c.id === lightboxSubComp.id
                ? {
                    ...c,
                    ...(patch.image_url !== undefined ? { image_url: patch.image_url } : {}),
                    ...(patch.image_caption !== undefined ? { image_caption: patch.image_caption } : {}),
                    ...(patch.image_adjustments !== undefined
                      ? { image_adjustments: patch.image_adjustments }
                      : {})
                  }
                : c
            );
            commitComponents(updated);
          }}
        />
      )}
    </div>
  );
};

export default CompositePackageEditor;
