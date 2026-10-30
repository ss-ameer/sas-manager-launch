import React, { useState, useMemo } from 'react';
import { LineItemComponent, Product } from '../../types';
import {
  recalculateCompositeItemTotals,
  applyMarkupToSubComponents,
  parseBulkSubComponentsText,
} from '../../utils/compositeBomUtils';
import {
  Layers,
  Plus,
  Trash2,
  Percent,
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
    name?: string;
    description?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    cost_price?: number;
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
  const packagePricingMode = propPackagePricingMode ?? item?.package_pricing_mode ?? 'itemized';
  const optionScopeNotes = propOptionScopeNotes ?? item?.option_scope_notes ?? '';
  const parentQuantity = propParentQuantity ?? item?.quantity ?? 1;

  const [markupInput, setMarkupInput] = useState<string>('25');
  const [showBulkPaste, setShowBulkPaste] = useState<boolean>(false);
  const [bulkPasteText, setBulkPasteText] = useState<string>('');
  const [bulkPasteAsAccessory, setBulkPasteAsAccessory] = useState<boolean>(false);
  const [showCatalogPickerForRow, setShowCatalogPickerForRow] = useState<string | 'NEW' | null>(null);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState<string>('');
  const [expandedRowNotes, setExpandedRowNotes] = useState<Record<string, boolean>>({});
  const [lightboxSubComp, setLightboxSubComp] = useState<LineItemComponent | null>(null);
  const effectiveTokenContext = useMemo<QuotationTokenContext>(
    () => tokenContext || {},
    [tokenContext]
  );

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
    const isNoteOpen = Boolean(expandedRowNotes[comp.id] || (comp.row_note && comp.row_note.trim()));
    return (
      <div
        className="mt-1.5 pt-1.5 border-t border-slate-100 flex flex-col gap-1.5"
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
          {/* Compact 28x28px Sub-Component Photo Thumbnail + Upload Trigger */}
          <div className="inline-flex items-center gap-1 pr-1 border-r border-slate-200">
            {comp.image_url ? (
              <div className="relative group inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setLightboxSubComp(comp)}
                  className="w-7 h-7 rounded border border-slate-200 bg-white overflow-hidden flex items-center justify-center cursor-pointer relative"
                  title="Click to inspect or rotate sub-component photo"
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
                  title="Remove sub-component photo"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ) : (
              <label
                className="px-1.5 py-0.5 rounded bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 text-[10px] font-semibold flex items-center gap-1 cursor-pointer transition"
                title="Upload sub-component photo (or Ctrl+V paste on this row)"
              >
                <ImageIcon className="w-2.5 h-2.5 text-blue-600" />
                <span>+ Photo</span>
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
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title={`Force a new A4 page after sub-component ${rowNumLabel}`}
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
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title="Highlight this sub-component row in soft amber on the quotation"
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
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title="Render this sub-component row in bold text"
          >
            <Bold className="w-2.5 h-2.5" />
            <span>Bold</span>
          </button>

          {!comp.is_included_accessory && (
            <button
              type="button"
              onClick={() => handleUpdateSub(comp.id, 'hide_row_price', !comp.hide_row_price)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer ${
                comp.hide_row_price
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Mask individual price on this row (shows 'Included' visually while keeping its value in the Set total)"
            >
              <EyeOff className="w-2.5 h-2.5" />
              <span>{comp.hide_row_price ? 'Price Hidden (Included)' : 'Hide Price'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              setExpandedRowNotes((prev) => ({
                ...prev,
                [comp.id]: !isNoteOpen,
              }))
            }
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border flex items-center gap-1 transition cursor-pointer ${
              isNoteOpen
                ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-2xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
            }`}
            title="Add or edit a custom row note (supports @tags)"
          >
            <MessageSquarePlus className="w-2.5 h-2.5" />
            <span>{comp.row_note ? 'Edit Note' : '+ Note'}</span>
          </button>

          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200 text-[10px] font-mono text-slate-600">
            <span>Spacer:</span>
            <input
              type="number"
              min={0}
              max={120}
              value={comp.row_spacer_after_mm || ''}
              placeholder="0"
              onChange={(e) => {
                const v = Math.max(0, Math.min(120, Number(e.target.value) || 0));
                handleUpdateSub(comp.id, 'row_spacer_after_mm', v > 0 ? v : undefined);
              }}
              className="w-10 bg-white border border-slate-200 rounded px-1 py-0 text-[10px] font-mono text-center text-slate-800"
            />
            <span>mm</span>
          </div>
        </div>

        {isNoteOpen && (
          <div className="flex items-center gap-1.5">
            <div className="flex-1">
              <AtMentionInput
                value={comp.row_note || ''}
                onChange={(val) => handleUpdateSub(comp.id, 'row_note', val)}
                tokenContext={effectiveTokenContext}
                placeholder="Custom row note (type @ for live tags, e.g. @delivery_location)..."
                className="w-full rounded border border-blue-200 bg-blue-50/30 px-2 py-1 text-[11px] text-slate-800 focus:border-blue-500 focus:outline-none"
              />
            </div>
            {comp.row_note && (
              <button
                type="button"
                onClick={() => {
                  handleUpdateSub(comp.id, 'row_note', '');
                  setExpandedRowNotes((prev) => ({ ...prev, [comp.id]: false }));
                }}
                className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                title="Clear row note"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
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

  const commitComponents = (
    nextComponents: LineItemComponent[],
    nextMode: 'itemized' | 'lump_sum' = packagePricingMode,
    nextNotes: string = optionScopeNotes,
    nextCompositeFlag: boolean = true
  ) => {
    const totals = recalculateCompositeItemTotals(nextComponents, parentQuantity);
    onChange({
      is_composite_set: nextCompositeFlag,
      sub_components: totals.normalizedComponents,
      package_pricing_mode: nextMode,
      option_scope_notes: nextNotes,
      unit_price: totals.unitSellingPrice,
      cost_price: totals.unitCostPrice,
      total_price: totals.totalSellingPrice,
    });
  };

  const handleToggleComposite = (enabled: boolean) => {
    if (!enabled) {
      onChange({
        is_composite_set: false,
        sub_components: subComponents,
        package_pricing_mode: packagePricingMode,
        option_scope_notes: optionScopeNotes,
      });
      return;
    }
    const seed: LineItemComponent[] =
      subComponents.length > 0
        ? subComponents
        : [
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
              is_included_accessory: false,
            },
          ];
    commitComponents(seed, packagePricingMode, optionScopeNotes, true);
  };

  const handleAddSubComponent = (isAccessory: boolean) => {
    const nextIdx = subComponents.length + 1;
    const newComp: LineItemComponent = {
      id: `sub_${Date.now()}_${nextIdx}`,
      sn: isAccessory
        ? undefined
        : String(subComponents.filter((c) => !c.is_included_accessory).length + 1),
      item_name: '',
      remark: '',
      quantity: 1,
      unit: 'Nos',
      cost_price: 0,
      unit_price: 0,
      total_price: 0,
      line_total: 0,
      is_included_accessory: isAccessory,
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
      const newComp: LineItemComponent = {
        id: `sub_${Date.now()}_${nextIdx}`,
        sn: String(subComponents.filter((c) => !c.is_included_accessory).length + 1),
        product_id: prod.id,
        sku: prod.sku,
        item_name: prod.name || prod.product_type || 'Catalog Component',
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
        is_included_accessory: false,
      };
      commitComponents([...subComponents, newComp]);
    } else {
      const updated = subComponents.map((c) => {
        if (c.id !== targetId) return c;
        const qty = Math.max(0, Number(c.quantity) || 1);
        const isAcc = Boolean(c.is_included_accessory);
        const uPrice = isAcc ? 0 : snapUnitPrice;
        const cPrice = isAcc ? 0 : snapCostPrice;
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
          cost_price: cPrice,
          unit_price: uPrice,
          total_price: tot,
          line_total: tot,
        };
      });
      commitComponents(updated);
    }

    setShowCatalogPickerForRow(null);
    setCatalogSearchQuery('');
  };

  const handleRefreshSubFromCatalog = (compId: string, prod: Product) => {
    const snapUnitPrice = convertFromCatalogAed(prod.unit_price);
    const snapCostPrice = convertFromCatalogAed(prod.cost_price ?? prod.cost_price_aed);
    const updated = subComponents.map((c) => {
      if (c.id !== compId) return c;
      const qty = Math.max(0, Number(c.quantity) || 0);
      const isAcc = Boolean(c.is_included_accessory);
      const uPrice = isAcc ? 0 : snapUnitPrice;
      const cPrice = isAcc ? 0 : snapCostPrice;
      const tot = isAcc ? 0 : Math.round(qty * uPrice * 100) / 100;
      return {
        ...c,
        sku: prod.sku || c.sku,
        image_url: c.image_url || prod.image_url,
        cost_price: cPrice,
        unit_price: uPrice,
        total_price: tot,
        line_total: tot,
      };
    });
    commitComponents(updated);
  };

  const handleRefreshAllLinkedFromCatalog = () => {
    const updated = subComponents.map((c) => {
      if (!c.product_id) return c;
      const prod = activeCatalogProducts.find((p) => p.id === c.product_id);
      if (!prod) return c;
      const snapUnitPrice = convertFromCatalogAed(prod.unit_price);
      const snapCostPrice = convertFromCatalogAed(prod.cost_price ?? prod.cost_price_aed);
      const qty = Math.max(0, Number(c.quantity) || 0);
      const isAcc = Boolean(c.is_included_accessory);
      const uPrice = isAcc ? 0 : snapUnitPrice;
      const cPrice = isAcc ? 0 : snapCostPrice;
      const tot = isAcc ? 0 : Math.round(qty * uPrice * 100) / 100;
      return {
        ...c,
        sku: prod.sku || c.sku,
        image_url: c.image_url || prod.image_url,
        cost_price: cPrice,
        unit_price: uPrice,
        total_price: tot,
        line_total: tot,
      };
    });
    commitComponents(updated);
  };

  const handleUpdateSub = (id: string, field: keyof LineItemComponent, value: any) => {
    const updated = subComponents.map((c) => {
      if (c.id !== id) return c;
      const next: LineItemComponent = { ...c, [field]: value };
      const qty = Math.max(0, Number(next.quantity) || 0);
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
    commitComponents(filtered);
  };

  const handleApplyGlobalMarkup = () => {
    const pct = parseFloat(markupInput);
    if (isNaN(pct)) return;
    const markedUp = applyMarkupToSubComponents(subComponents, pct);
    commitComponents(markedUp);
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

  const pricedComponents = subComponents.filter((c) => !c.is_included_accessory);
  const includedAccessories = subComponents.filter((c) => c.is_included_accessory);
  const totals = recalculateCompositeItemTotals(subComponents, parentQuantity);
  const profit = totals.unit_price - totals.cost_price;
  const marginPct = totals.unit_price > 0 ? (profit / totals.unit_price) * 100 : 0;

  // Check if any linked sub-components have drifted from current catalog price/cost
  const hasAnyDriftedSub = useMemo(() => {
    return subComponents.some((sub) => {
      if (!sub.product_id || sub.is_included_accessory) return false;
      const prod = activeCatalogProducts.find((p) => p.id === sub.product_id);
      if (!prod) return false;
      const catPrice = convertFromCatalogAed(prod.unit_price);
      const catCost = convertFromCatalogAed(prod.cost_price ?? prod.cost_price_aed);
      return (
        Math.abs((Number(sub.unit_price) || 0) - catPrice) > 0.01 ||
        (catCost > 0 && Math.abs((Number(sub.cost_price) || 0) - catCost) > 0.01)
      );
    });
  }, [subComponents, activeCatalogProducts, currency]);

  if (!isCompositeSet) {
    return (
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span>
            Need a multi-component system, equipment assembly, or Bill of Materials (BOM)?
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => handleToggleComposite(true)}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <ListTree className="w-3.5 h-3.5" />
            <span>Convert to Composite Package / Kit (BOM)</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-indigo-200/90 bg-indigo-50/30 dark:bg-slate-900/70 dark:border-indigo-900/60 overflow-hidden">
      {/* Top Bar */}
      <div className="px-3.5 py-2.5 bg-indigo-100/70 dark:bg-indigo-950/50 border-b border-indigo-200/80 dark:border-indigo-900 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
            <Layers className="w-3.5 h-3.5" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                Composite Package / Kit (BOM) Breakdown
              </span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold">
                {pricedComponents.length} Priced • {includedAccessories.length} Included
              </span>
            </div>
            {!compact && (
              <p className="text-[10.5px] text-indigo-700/80 dark:text-indigo-300/70">
                Manage sub-components, catalog SKU links, supplier costs, markups, and included zero-price accessories.
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Package Pricing Display Mode Toggle */}
          <div className="inline-flex rounded-lg bg-white dark:bg-slate-800 p-0.5 border border-indigo-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() =>
                commitComponents(subComponents, 'itemized', optionScopeNotes, true)
              }
              className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                packagePricingMode === 'itemized'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
              title="Show each sub-component's unit price and total on the client quotation"
            >
              Itemized Component Prices
            </button>
            <button
              type="button"
              onClick={() =>
                commitComponents(subComponents, 'lump_sum', optionScopeNotes, true)
              }
              className={`px-2 py-1 rounded-md text-[10.5px] font-semibold transition cursor-pointer ${
                packagePricingMode === 'lump_sum'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
              title="Show sub-components with quantities as 'Included in Set' and display a single package lump-sum price"
            >
              Single Package Lump-Sum
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowBulkPaste((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer ${
              showBulkPaste
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white hover:bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}
            title="Bulk paste sub-components or accessories from Excel, TSV, CSV, or pipe-separated rows"
          >
            <ClipboardPaste className="w-3 h-3" />
            <span>Paste Sub-Components</span>
          </button>

          {hasAnyDriftedSub && (
            <button
              type="button"
              onClick={handleRefreshAllLinkedFromCatalog}
              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[10.5px] font-semibold flex items-center gap-1 transition cursor-pointer"
              title="Update all linked sub-components with the latest prices and costs from the Products Catalog"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh from Catalog</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleToggleComposite(false)}
            className="px-2 py-1 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 text-[10.5px] font-semibold transition cursor-pointer"
          >
            Switch to Single Item
          </button>
        </div>
      </div>

      {/* Bulk Paste Sub-Components Drawer */}
      {showBulkPaste && (
        <div className="p-3 bg-indigo-50/90 dark:bg-slate-800/90 border-b border-indigo-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                <ClipboardPaste className="w-3.5 h-3.5 text-indigo-600" />
                Bulk Paste Sub-Components &amp; Accessories (Excel / TSV / CSV / Pipe)
              </span>
              <p className="text-[10.5px] text-slate-600 dark:text-slate-400">
                Format: <code className="font-mono bg-white px-1 py-0.5 rounded border">Component Name | Application / Scope Note | Qty | UOM | Supplier Cost | Selling Rate</code> (or paste 1-2 columns for zero-price accessories).
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
            rows={4}
            value={bulkPasteText}
            onChange={(e) => setBulkPasteText(e.target.value)}
            placeholder={`Example:\nPrimary Vessel Shell SS316\tAeration Tank\t2\tNos\t18500\t24000\n EPDM Membrane Roof Cover\tAeration Tank\t2\tNos\t4200\t5500\nSS316 Anchor Bolts & Fasteners\tIncluded Hardware\t2\tSet\t0\t0`}
            className="w-full rounded-lg border border-indigo-200 bg-white p-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={bulkPasteAsAccessory}
                onChange={(e) => setBulkPasteAsAccessory(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Default rows without prices as Included Zero-Price Accessories</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-indigo-800 font-semibold">
                Parsed: {parsedBulkPreview.length} row(s)
              </span>
              <button
                type="button"
                disabled={parsedBulkPreview.length === 0}
                onClick={() => handleCommitBulkPaste('append')}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold transition cursor-pointer"
              >
                + Append {parsedBulkPreview.length} Rows
              </button>
              <button
                type="button"
                disabled={parsedBulkPreview.length === 0}
                onClick={() => handleCommitBulkPaste('replace')}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 disabled:opacity-40 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
              >
                Replace Existing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Cost & Markup Calculator Bar */}
      <div className="px-3.5 py-2 bg-white/80 dark:bg-slate-900/90 border-b border-indigo-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
            <Percent className="w-3.5 h-3.5 text-indigo-600" />
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Supplier Cost Markup:
            </span>
            <input
              type="number"
              step="0.5"
              value={markupInput}
              onChange={(e) => setMarkupInput(e.target.value)}
              className="w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 dark:text-white text-right"
            />
            <span className="text-[11px] font-mono text-slate-500">%</span>
            <button
              type="button"
              onClick={handleApplyGlobalMarkup}
              className="ml-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-bold transition cursor-pointer"
              title="Calculate component selling prices from their supplier cost price + markup %"
            >
              Apply Markup to Costs
            </button>
          </div>
        </div>

        {/* Live Rollup Totals */}
        <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
          <span className="text-slate-500">
            Set Cost:{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {currency}{' '}
              {totals.cost_price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </span>
          {totals.cost_price > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10.5px] font-bold ${
                marginPct >= 20
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : marginPct >= 0
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}
            >
              {marginPct.toFixed(1)}% Margin
            </span>
          )}
          <span className="text-indigo-950 dark:text-indigo-200 font-bold">
            Package Total:{' '}
            <span className="text-indigo-600 dark:text-indigo-400">
              {currency}{' '}
              {totals.total_price.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </span>
        </div>
      </div>

      {/* Catalog Sub-Component Picker Popover */}
      {showCatalogPickerForRow && activeCatalogProducts.length > 0 && (
        <div className="p-3 bg-blue-50/80 dark:bg-slate-800 border-b border-blue-200 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-blue-950 dark:text-blue-200 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5 text-blue-600" />
              {showCatalogPickerForRow === 'NEW'
                ? 'Add Sub-Component from Products Catalog'
                : 'Link Sub-Component Row to Catalog Product'}
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
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-blue-200 bg-white text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {filteredPickerProducts.map((prod) => {
              const avail = (prod.stock_on_hand || 0) - (prod.stock_reserved || 0);
              const priceConv = convertFromCatalogAed(prod.unit_price);
              const cleanUnit = !prod.unit || prod.unit === 'Custom Unit' ? 'Nos' : prod.unit;
              return (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => handleSelectCatalogProductForSub(prod, showCatalogPickerForRow)}
                  className="text-left p-2 rounded-lg bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-400 flex items-center justify-between gap-2 transition cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">
                      {prod.name || prod.product_type}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate">
                      {[prod.sku ? `SKU: ${prod.sku}` : '', prod.brand_make, prod.model_part_no]
                        .filter(Boolean)
                        .join(' · ') || prod.product_type}
                    </div>
                    {prod.is_inventoried && (
                      <span
                        className={`inline-block mt-0.5 text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded ${
                          avail > 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        Avail: {avail} {cleanUnit}
                      </span>
                    )}
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <span className="text-xs font-bold text-emerald-700 block">
                      {currency}{' '}
                      {priceConv.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-[10px] text-blue-600 font-sans font-semibold">
                      Select
                    </span>
                  </div>
                </button>
              );
            })}
            {filteredPickerProducts.length === 0 && (
              <div className="col-span-2 py-4 text-center text-xs text-slate-400 italic">
                No matching catalog products found.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. Priced Sub-Components Table */}
      <div className="p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-700 dark:text-slate-300">
            1. Sub-Components &amp; Priced Items ({pricedComponents.length})
          </span>
          <div className="flex items-center gap-1.5">
            {activeCatalogProducts.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setShowCatalogPickerForRow((prev) => (prev === 'NEW' ? null : 'NEW'))
                }
                className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>+ Link Catalog SKU</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleAddSubComponent(false)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Priced Sub-Component</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-mono uppercase text-slate-500">
                <th className="py-2 px-2 w-10 text-center">#</th>
                <th className="py-2 px-2 min-w-[200px]">Component Name / Spec</th>
                <th className="py-2 px-2 min-w-[140px]">Application / Scope Note</th>
                <th className="py-2 px-2 w-20 text-center">Qty</th>
                <th className="py-2 px-2 w-20 text-center">UOM</th>
                <th className="py-2 px-2 w-28 text-right">Supplier Cost</th>
                <th className="py-2 px-2 w-28 text-right">Selling Rate</th>
                <th className="py-2 px-2 w-28 text-right">Total ({currency})</th>
                <th className="py-2 px-2 w-20 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {subComponents.map((comp, idx) => {
                if (comp.is_included_accessory) return null;
                const cCost = Number(comp.cost_price) || 0;
                const cSell = Number(comp.unit_price) || 0;
                const cMargin = cSell > 0 && cCost > 0 ? ((cSell - cCost) / cSell) * 100 : null;

                const linkedProduct = comp.product_id
                  ? activeCatalogProducts.find((p) => p.id === comp.product_id)
                  : undefined;
                const catalogSell = linkedProduct
                  ? convertFromCatalogAed(linkedProduct.unit_price)
                  : 0;
                const catalogCost = linkedProduct
                  ? convertFromCatalogAed(linkedProduct.cost_price ?? linkedProduct.cost_price_aed)
                  : 0;
                const isPriceDrifted =
                  linkedProduct &&
                  (Math.abs(cSell - catalogSell) > 0.01 ||
                    (catalogCost > 0 && Math.abs(cCost - catalogCost) > 0.01));

                const reqTotalQty =
                  (Math.max(1, Number(parentQuantity) || 1)) * (Number(comp.quantity) || 0);
                const availStock = linkedProduct
                  ? (linkedProduct.stock_on_hand || 0) - (linkedProduct.stock_reserved || 0)
                  : null;
                const isShortStock =
                  Boolean(linkedProduct?.is_inventoried) &&
                  availStock !== null &&
                  availStock < reqTotalQty;

                return (
                  <tr
                    key={comp.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-1.5 px-2 text-center font-mono text-[11px] font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={comp.item_name ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'item_name', e.target.value)}
                        placeholder="e.g. Primary Vessel Shell / Control Panel / Pump Skid"
                        className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-medium text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                      />
                      {/* Linked Catalog Badge & Live Stock / Drift Indicators */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {linkedProduct ? (
                          <>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[9.5px] font-mono font-semibold">
                              <Check className="w-2.5 h-2.5" />
                              SKU: {linkedProduct.sku || linkedProduct.name}
                            </span>
                            {linkedProduct.is_inventoried && availStock !== null && (
                              <span
                                className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold border ${
                                  isShortStock
                                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                                title={`Required across ${parentQuantity} set(s): ${reqTotalQty} ${comp.unit || 'Nos'}`}
                              >
                                {isShortStock && <AlertTriangle className="w-2.5 h-2.5" />}
                                Avail: {availStock} / Req: {reqTotalQty}
                              </span>
                            )}
                            {isPriceDrifted && (
                              <button
                                type="button"
                                onClick={() => handleRefreshSubFromCatalog(comp.id, linkedProduct)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-[9.5px] font-semibold cursor-pointer transition"
                                title={`Catalog rate changed to ${currency} ${catalogSell.toLocaleString()}. Click to refresh snapshot.`}
                              >
                                <RefreshCw className="w-2.5 h-2.5" />
                                <span>Refresh from Catalog ({currency} {catalogSell})</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                const updated = subComponents.map((c) =>
                                  c.id === comp.id
                                    ? { ...c, product_id: undefined, sku: undefined }
                                    : c
                                );
                                commitComponents(updated);
                              }}
                              className="text-[9.5px] text-slate-400 hover:text-rose-600 underline cursor-pointer"
                            >
                              Unlink
                            </button>
                          </>
                        ) : (
                          activeCatalogProducts.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setShowCatalogPickerForRow((prev) =>
                                  prev === comp.id ? null : comp.id
                                )
                              }
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                            >
                              <Link2 className="w-2.5 h-2.5" />
                              <span>Link Catalog SKU</span>
                            </button>
                          )
                        )}
                      </div>
                      {renderSubRowCustomizationBar(comp, `#${idx + 1}`)}
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={comp.remark ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'remark', e.target.value)}
                        placeholder="e.g. Aeration Section / Duty-Standby / SS316"
                        className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:border-indigo-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="any"
                        value={comp.quantity ?? ''}
                        onChange={(e) => handleUpdateSub(comp.id, 'quantity', e.target.value)}
                        className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-center font-bold text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        value={comp.unit ?? 'Nos'}
                        onChange={(e) => handleUpdateSub(comp.id, 'unit', e.target.value)}
                        className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-center text-slate-700 dark:text-slate-300 focus:border-indigo-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        step="0.01"
                        value={comp.cost_price ?? ''}
                        placeholder="0.00"
                        onChange={(e) => handleUpdateSub(comp.id, 'cost_price', e.target.value)}
                        className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums focus:border-indigo-500 focus:outline-none"
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="space-y-0.5">
                        <input
                          type="number"
                          step="0.01"
                          value={comp.unit_price ?? ''}
                          placeholder="0.00"
                          onChange={(e) => handleUpdateSub(comp.id, 'unit_price', e.target.value)}
                          className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs font-mono font-bold text-right text-slate-900 dark:text-white tabular-nums focus:border-indigo-500 focus:outline-none"
                        />
                        {cMargin !== null && (
                          <span
                            className={`block text-right text-[9px] font-mono ${
                              cMargin >= 15 ? 'text-emerald-600' : 'text-amber-600'
                            }`}
                          >
                            {cMargin.toFixed(0)}% mgn
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                      {(Number(comp.total_price) || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="py-1.5 px-2 text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleMoveSub(idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveSub(idx, 'down')}
                          disabled={idx === subComponents.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSub(comp.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          title="Delete Component"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pricedComponents.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-slate-400 italic text-xs">
                    No priced sub-components added yet. Click "+ Add Priced Sub-Component" or "+ Link Catalog SKU".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 2. Included Accessories & Zero-Price Sub-Items */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                2. Included Accessories &amp; Zero-Price Sub-Items ({includedAccessories.length})
              </span>
            </span>
            <button
              type="button"
              onClick={() => handleAddSubComponent(true)}
              className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Add Included Accessory (No Extra Charge)</span>
            </button>
          </div>

          {includedAccessories.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-emerald-50/50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] font-mono uppercase text-slate-500">
                    <th className="py-1.5 px-2">Included Accessory / Sub-Item Specification</th>
                    <th className="py-1.5 px-2 w-48">Application / Scope Note</th>
                    <th className="py-1.5 px-2 w-20 text-center">Qty</th>
                    <th className="py-1.5 px-2 w-20 text-center">UOM</th>
                    <th className="py-1.5 px-2 w-24 text-center">Status</th>
                    <th className="py-1.5 px-2 w-16 text-center">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 dark:divide-slate-800">
                  {subComponents.map((comp) => {
                    if (!comp.is_included_accessory) return null;
                    return (
                      <tr key={comp.id} className="hover:bg-slate-50/70">
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={comp.item_name ?? ''}
                            onChange={(e) => handleUpdateSub(comp.id, 'item_name', e.target.value)}
                            placeholder="e.g. Fasteners, Interconnecting Piping, Manhole, Level Indicator"
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                          />
                          {renderSubRowCustomizationBar(comp, 'Acc')}
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={comp.remark ?? ''}
                            onChange={(e) => handleUpdateSub(comp.id, 'remark', e.target.value)}
                            placeholder="Optional scope remark"
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs text-slate-600 dark:text-slate-400"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="number"
                            step="any"
                            value={comp.quantity ?? ''}
                            onChange={(e) => handleUpdateSub(comp.id, 'quantity', e.target.value)}
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-center font-bold text-slate-900 dark:text-white"
                          />
                        </td>
                        <td className="py-1.5 px-2">
                          <input
                            type="text"
                            value={comp.unit ?? 'Nos'}
                            onChange={(e) => handleUpdateSub(comp.id, 'unit', e.target.value)}
                            className="w-full bg-transparent border border-slate-200 dark:border-slate-700 rounded px-1.5 py-1 text-xs font-mono text-center text-slate-700 dark:text-slate-300"
                          />
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-semibold">
                            Included
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSub(comp.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 3. Option / Package Technical Scope Notes */}
        <div className="pt-2 space-y-1">
          <label className="text-[10.5px] font-mono uppercase tracking-wider font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <FileText className="w-3 h-3 text-indigo-600" />
            <span>
              3. Package / Option Scope Notes (Material Standards, Warranties, Exclusions)
            </span>
          </label>
          <AtMentionTextarea
            rows={3}
            value={optionScopeNotes}
            tokenContext={effectiveTokenContext}
            onChange={(val) =>
              commitComponents(
                subComponents,
                packagePricingMode,
                val,
                true
              )
            }
            placeholder="e.g. Materials of construction, warranty terms, testing standards, or client-scope exclusions (type @ for live tags)..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {lightboxSubComp && (
        <ImageLightboxModal
          isOpen={Boolean(lightboxSubComp)}
          onClose={() => setLightboxSubComp(null)}
          title={lightboxSubComp.item_name || 'Sub-Component Photo'}
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
