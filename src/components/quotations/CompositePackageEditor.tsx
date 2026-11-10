import React, { useState, useMemo } from 'react';
import { LineItemComponent, Product } from '../../types';
import {
  recalculateCompositeItemTotals,
  parseBulkSubComponentsText,
} from '../../utils/compositeBomUtils';
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
  MessageSquarePlus,
  Image as ImageIcon,
  ZoomIn,
  DollarSign,
} from 'lucide-react';
import { AtMentionInput, AtMentionTextarea } from './AtMentionField';
import { QuotationTokenContext } from '../../utils/quotationTokenResolver';
import { uploadWorkspaceMediaAsset } from '../../services/attachmentStorage';
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
  const [expandedRowNotes, setExpandedRowNotes] = useState<Record<string, boolean>>({});
  const [expandedFormatRows, setExpandedFormatRows] = useState<Record<string, boolean>>({});
  const [showScopeNotes, setShowScopeNotes] = useState<boolean>(Boolean(optionScopeNotes && optionScopeNotes.trim()));
  const [showCostInputs, setShowCostInputs] = useState<boolean>(false);
  const [lightboxSubComp, setLightboxSubComp] = useState<LineItemComponent | null>(null);

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

  const toggleNoteRow = (compId: string) => {
    setExpandedRowNotes((prev) => ({
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
        handleUpdateSub(compId, 'image_url', uploaded.url);
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

  const activeCatalogProducts = useMemo(
    () => (products || []).filter((p) => !p.is_deleted),
    [products]
  );

  const convertFromCatalogAed = (amountAed?: number): number => {
    const val = Number(amountAed) || 0;
    if (val <= 0) return 0;
    return currency === 'USD'
      ? Math.round((val / AED_TO_USD_RATE) * 100) / 100
      : Math.round(val * 100) / 100;
  };

  /**
   * Commits sub-component changes without wiping the parent line item's selling price
   * when all sub-items are zero-price / included accessories.
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
    const resolvedMode: 'itemized' | 'lump_sum' =
      nextMode || (hasPricedSubItems ? 'itemized' : 'lump_sum');

    const currentParentUnitPrice = Number(item?.unit_price) || 0;
    const currentParentCostPrice = Number(item?.cost_price) || 0;

    // Preserve parent price if sub-items are all Included (0.00) or unless sub-items have prices and parent was 0 / forced sync
    const shouldUpdateParentPrice =
      forceSyncParentPrice ||
      (hasPricedSubItems && (currentParentUnitPrice <= 0 || packagePricingMode === 'itemized'));

    const nextUnitPrice = shouldUpdateParentPrice ? totals.unitSellingPrice : currentParentUnitPrice;
    const nextTotalPrice = Math.round(effectiveParentQty * nextUnitPrice * 100) / 100;
    const nextCostPrice = totals.unitCostPrice > 0 ? totals.unitCostPrice : currentParentCostPrice;

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
      ...(totals.unitCostPrice > 0 ? { cost_price: nextCostPrice } : {}),
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

  const handleSelectCatalogProductForSub = (
    prod: Product,
    targetId: string | 'NEW'
  ) => {
    const snapUnitPrice = convertFromCatalogAed(prod.unit_price);
    const snapCostPrice = convertFromCatalogAed(prod.cost_price ?? prod.cost_price_aed);
    const cleanUnit = !prod.unit || prod.unit === 'Custom Unit' ? 'Nos' : prod.unit;
    const specSummary = [
      prod.brand_make ? `Brand: ${prod.brand_make}` : '',
      prod.model_part_no ? `Model: ${prod.model_part_no}` : '',
      prod.description || '',
    ]
      .filter(Boolean)
      .join(' · ');

    if (targetId === 'NEW') {
      const nextIdx = subComponents.length + 1;
      const isAcc = snapUnitPrice <= 0;
      const newComp: LineItemComponent = {
        id: `sub_${Date.now()}_${nextIdx}`,
        sn: isAcc ? undefined : String(subComponents.filter((c) => !c.is_included_accessory).length + 1),
        product_id: prod.id,
        sku: prod.sku,
        item_name: prod.name || prod.product_type || 'Catalog Item',
        remark: specSummary,
        description: prod.description || '',
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
      commitComponents([...subComponents, newComp]);
    } else {
      const updated = subComponents.map((c) => {
        if (c.id !== targetId) return c;
        const qty = Math.max(1, Number(c.quantity) || 1);
        const uPrice = snapUnitPrice;
        const isAcc = uPrice <= 0;
        const tot = isAcc ? 0 : Math.round(qty * uPrice * 100) / 100;
        return {
          ...c,
          product_id: prod.id,
          sku: prod.sku,
          item_name: prod.name || c.item_name,
          remark: c.remark || specSummary,
          image_url: c.image_url || prod.image_url,
          image_caption: c.image_caption || prod.image_caption,
          image_adjustments: c.image_adjustments || prod.image_adjustments,
          unit: cleanUnit,
          cost_price: snapCostPrice,
          unit_price: uPrice,
          total_price: tot,
          line_total: tot,
          is_included_accessory: isAcc,
        };
      });
      commitComponents(updated);
    }

    setShowCatalogPickerForRow(null);
    setCatalogSearchQuery('');
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
    return activeCatalogProducts
      .filter((p) => {
        if (!q) return true;
        return (
          (p.name || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.brand_make || '').toLowerCase().includes(q) ||
          (p.model_part_no || '').toLowerCase().includes(q) ||
          (p.product_type || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 20);
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
    <div className="rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
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
          <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {(() => {
              const variantAnalysisMap = buildCatalogVariantAnalysisMap(activeCatalogProducts);
              return filteredPickerProducts.map((prod) => {
                const avail = (prod.stock_on_hand || 0) - (prod.stock_reserved || 0);
                const priceConv = convertFromCatalogAed(prod.unit_price);
                const cleanUnit = !prod.unit || prod.unit === 'Custom Unit' ? 'Nos' : prod.unit;
                const vInfo = prod.id ? variantAnalysisMap.get(prod.id) : undefined;
                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectCatalogProductForSub(prod, showCatalogPickerForRow)}
                    className="text-left p-2 rounded-lg bg-white dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-slate-800/80 border border-slate-200 dark:border-slate-700 hover:border-blue-400 flex items-center justify-between gap-2 transition cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {prod.name || prod.product_type}
                        </div>
                        {vInfo?.isVariant && (
                          <span className="text-[9px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.2 rounded">
                            Variant
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 truncate">
                        {[prod.sku ? `SKU: ${prod.sku}` : '', prod.brand_make, prod.model_part_no]
                          .filter(Boolean)
                          .join(' · ') || prod.product_type}
                      </div>
                      {prod.is_inventoried && (
                        <span className="inline-block text-[9.5px] font-mono font-bold text-emerald-700 mt-0.5">
                          Avail: {avail} {cleanUnit}
                        </span>
                      )}
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      {priceConv > 0 ? (
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                          {currency} {priceConv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      ) : (
                        <span className="text-[10px] font-sans text-slate-400 block">Included</span>
                      )}
                      <span className="text-[10px] text-blue-600 font-sans font-semibold block">
                        Select
                      </span>
                    </div>
                  </button>
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
          const hasNote = isMeaningfulRemark(comp.remark) || Boolean(comp.row_note && comp.row_note.trim());
          const isNoteOpen = Boolean(expandedRowNotes[comp.id] || hasNote);
          const activeFmtCount = getActiveFormatCount(comp);
          const isFmtOpen = Boolean(expandedFormatRows[comp.id]);
          const linkedProduct = comp.product_id
            ? activeCatalogProducts.find((p) => p.id === comp.product_id)
            : undefined;

          return (
            <div
              key={comp.id}
              className="px-3 py-2 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors space-y-1.5"
            >
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                {/* # Index */}
                <span className="w-5 text-[10px] font-mono font-bold text-slate-400 text-center shrink-0">
                  {idx + 1}.
                </span>

                {/* Qty */}
                <input
                  type="number"
                  step="any"
                  value={comp.quantity ?? ''}
                  onChange={(e) => handleUpdateSub(comp.id, 'quantity', e.target.value)}
                  placeholder="Qty"
                  title="Quantity"
                  className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-1 text-xs font-mono text-center font-bold text-slate-900 dark:text-white focus:border-blue-500 focus:bg-white focus:outline-none shrink-0"
                />

                {/* Unit */}
                <input
                  type="text"
                  value={comp.unit ?? 'Nos'}
                  onChange={(e) => handleUpdateSub(comp.id, 'unit', e.target.value)}
                  placeholder="Nos"
                  title="Unit (e.g. Nos, Set, Lot)"
                  className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-1.5 py-1 text-xs font-mono text-center text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none shrink-0"
                />

                {/* Item Name */}
                <input
                  type="text"
                  value={comp.item_name ?? ''}
                  onChange={(e) => handleUpdateSub(comp.id, 'item_name', e.target.value)}
                  placeholder="Included item or component name (e.g. Top and Bottom Distribution System, Vacuum Breaker)"
                  className="flex-1 min-w-[160px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-xs font-medium text-slate-900 dark:text-white focus:border-blue-500 focus:outline-none"
                />

                {/* Optional Cost Input (Only when Sub-Item Costs toggle is active) */}
                {showCostInputs && (
                  <div className="relative w-24 shrink-0" title={`Internal Supplier Cost (${currency})`}>
                    <input
                      type="number"
                      step="0.01"
                      value={comp.cost_price || ''}
                      onChange={(e) => handleUpdateSub(comp.id, 'cost_price', e.target.value)}
                      placeholder="Cost 0.00"
                      className="w-full bg-amber-50/40 dark:bg-slate-800 border border-amber-200 dark:border-slate-700 rounded-md px-2 py-1 text-xs font-mono text-right text-slate-700 dark:text-slate-300 tabular-nums focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}

                {/* Optional Unit Price or "Included" */}
                <div className="relative w-28 shrink-0" title={`Optional sub-item price in ${currency} (leave 0 for Included)`}>
                  <input
                    type="number"
                    step="0.01"
                    value={unitPriceVal > 0 ? unitPriceVal : ''}
                    onChange={(e) => handleUpdateSub(comp.id, 'unit_price', e.target.value)}
                    placeholder="Included"
                    className={`w-full rounded-md px-2 py-1 text-xs font-mono text-right tabular-nums focus:outline-none border ${
                      isIncludedZeroPrice
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 placeholder:text-emerald-600/80 dark:placeholder:text-emerald-400/80 font-semibold'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold focus:border-blue-500'
                    }`}
                  />
                </div>

                {/* Compact Action Buttons */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleNoteRow(comp.id)}
                    className={`p-1 rounded-md border text-[10px] transition cursor-pointer ${
                      isNoteOpen
                        ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-800 text-slate-400 hover:text-slate-700 border-transparent hover:border-slate-200'
                    }`}
                    title="Add or edit specification note for this sub-item"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                  </button>

                  {linkedProduct ? (
                    <button
                      type="button"
                      onClick={() => {
                        const updated = subComponents.map((c) =>
                          c.id === comp.id ? { ...c, product_id: undefined, sku: undefined } : c
                        );
                        commitComponents(updated);
                      }}
                      className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9.5px] font-mono font-semibold truncate max-w-[80px] cursor-pointer"
                      title={`Linked to ${linkedProduct.sku || linkedProduct.name} (click to unlink)`}
                    >
                      {linkedProduct.sku || 'Linked'}
                    </button>
                  ) : (
                    activeCatalogProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowCatalogPickerForRow((prev) => (prev === comp.id ? null : comp.id))
                        }
                        className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition cursor-pointer"
                        title="Link to Catalog SKU"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => toggleFormatRow(comp.id)}
                    className={`p-1 rounded-md border text-[10px] transition cursor-pointer ${
                      isFmtOpen || activeFmtCount > 0
                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                        : 'text-slate-400 hover:text-slate-700 border-transparent hover:border-slate-200'
                    }`}
                    title="Photo & Print Formatting"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>

                  {subComponents.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleMoveSub(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 cursor-pointer hidden sm:inline-flex"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveSub(idx, 'down')}
                        disabled={idx === subComponents.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-25 cursor-pointer hidden sm:inline-flex"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleRemoveSub(comp.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                    title="Remove Item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Optional Collapsible Spec / Application Note Row */}
              {isNoteOpen && (
                <div className="pl-6 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={isMeaningfulRemark(comp.remark) ? comp.remark : comp.row_note || ''}
                    onChange={(e) => handleUpdateSub(comp.id, 'remark', e.target.value)}
                    placeholder="Optional spec / note (e.g. Factory pre-fitted, SS316, ASME standard)..."
                    className="flex-1 bg-slate-50/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1 text-[11px] text-slate-700 dark:text-slate-300 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateSub(comp.id, 'remark', '');
                      setExpandedRowNotes((prev) => ({ ...prev, [comp.id]: false }));
                    }}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    title="Clear note"
                  >
                    <X className="w-3 h-3" />
                  </button>
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
            No included items yet. Click "+ Add Included Item" below.
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
