import React, { useState, useEffect, useMemo } from 'react';
import {
  Product,
  ProductAttribute,
  Attachment,
  Workspace,
  DropdownOption,
  CATEGORY_SUGGESTED_ATTRIBUTES
} from '../types';
import { safeAddDoc, safeUpdateDoc } from '../firebase';
import { generateProductSearchTerms } from '../utils/defaults';
import { UNIVERSAL_CATEGORIES, UNIVERSAL_UNITS } from '../constants';
import { uploadWorkspaceMediaAsset } from '../services/attachmentStorage';
import {
  Package,
  Plus,
  X,
  Image as ImageIcon,
  FileText,
  UploadCloud,
  Paperclip,
  Trash2,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Globe,
  Clock
} from 'lucide-react';

const AVAILABILITY_PRESETS = [
  'Ex-Stock',
  'Ready for Dispatch',
  '1-2 Weeks',
  '2-3 Weeks',
  '4-6 Weeks',
  '6-8 Weeks',
  'Made to Order'
];

/**
 * Smartly splits a legacy combined description (when item_name is empty)
 * into a clean Title / Heading and Specification Body.
 */
export function parseLineItemTitleAndSpec(
  itemName?: string | null,
  description?: string | null
): { title: string; spec: string; wasSplit: boolean } {
  const cleanName = (itemName ?? '').trim();
  const cleanDesc = (description ?? '').trim();

  if (cleanName) {
    return {
      title: cleanName,
      spec: cleanDesc,
      wasSplit: false
    };
  }

  if (!cleanDesc) {
    return { title: '', spec: '', wasSplit: false };
  }

  // Check if multi-line first
  const lines = cleanDesc.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && lines[0].length <= 110) {
    return {
      title: lines[0].replace(/[:\-–—]\s*$/, '').trim(),
      spec: lines.slice(1).join('\n').trim(),
      wasSplit: true
    };
  }

  // Check for " - " or " – " or " — " delimiter within first 110 chars
  const dashMatch = cleanDesc.match(/^([^—–\-]{3,95}?)\s+[—–\-]\s+(.+)$/s);
  if (dashMatch) {
    return {
      title: dashMatch[1].trim(),
      spec: dashMatch[2].trim(),
      wasSplit: true
    };
  }

  // Check for ": " delimiter within first 85 chars
  const colonMatch = cleanDesc.match(/^([^:]{3,85}?):\s+(.+)$/s);
  if (colonMatch) {
    return {
      title: colonMatch[1].trim(),
      spec: colonMatch[2].trim(),
      wasSplit: true
    };
  }

  // Fallback: if description is short, use it as title; otherwise take first 75 chars up to word boundary
  if (cleanDesc.length <= 85) {
    return {
      title: cleanDesc,
      spec: cleanDesc,
      wasSplit: false
    };
  }

  const truncated = cleanDesc.slice(0, 75).replace(/\s+\S*$/, '').trim();
  return {
    title: truncated || cleanDesc.slice(0, 75),
    spec: cleanDesc,
    wasSplit: true
  };
}

/**
 * Checks whether a catalog-linked line item has commercial, technical, or media
 * modifications compared to its master Product in the catalog.
 */
export function hasCatalogDrift(item: any, product?: Product | null): boolean {
  if (!item || !product || !item.product_id) return false;

  const itemSell = Number(item.unit_price ?? 0);
  const prodSell = Number(product.unit_price ?? 0);
  if (Math.abs(itemSell - prodSell) > 0.005) return true;

  const itemCost = Number(item.cost_price ?? 0);
  const prodCost = Number(product.cost_price ?? 0);
  if (itemCost > 0 && Math.abs(itemCost - prodCost) > 0.005) return true;

  const itemUnit = (item.unit ?? '').trim();
  const prodUnit = (product.unit ?? '').trim();
  if (itemUnit && prodUnit && itemUnit !== prodUnit) return true;

  const itemBrand = (item.brand_make ?? '').trim();
  const prodBrand = (product.brand_make ?? '').trim();
  if (itemBrand && itemBrand !== prodBrand) return true;

  const itemModel = (item.model_part_no ?? '').trim();
  const prodModel = (product.model_part_no ?? '').trim();
  if (itemModel && itemModel !== prodModel) return true;

  const itemOrigin = (item.country_of_origin ?? item.origin ?? '').trim();
  const prodOrigin = (product.country_of_origin ?? '').trim();
  if (itemOrigin && itemOrigin !== prodOrigin) return true;

  const itemHs = (item.hs_code ?? '').trim();
  const prodHs = (product.hs_code ?? '').trim();
  if (itemHs && itemHs !== prodHs) return true;

  const itemLead = (item.lead_time_note ?? item.availability ?? '').trim();
  const prodLead = (product.default_availability ?? '').trim();
  if (itemLead && itemLead !== prodLead) return true;

  const itemImg = (item.image_url ?? '').trim();
  const prodImg = (product.image_url ?? '').trim();
  if (itemImg && itemImg !== prodImg) return true;

  const itemDsUrl = (item.datasheet_attachment?.url ?? '').trim();
  const prodDsUrl = (product.datasheet_attachment?.url ?? '').trim();
  if (itemDsUrl && itemDsUrl !== prodDsUrl) return true;

  if (Array.isArray(item.attributes)) {
    const cleanItemAttrs = item.attributes
      .filter((a: any) => a && a.key && a.value)
      .map((a: any) => `${a.key.trim().toLowerCase()}=${a.value.trim().toLowerCase()}`)
      .sort()
      .join('|');
    const cleanProdAttrs = (product.attributes || [])
      .filter((a) => a && a.key && a.value)
      .map((a) => `${a.key.trim().toLowerCase()}=${a.value.trim().toLowerCase()}`)
      .sort()
      .join('|');
    if (cleanItemAttrs && cleanItemAttrs !== cleanProdAttrs) return true;
  }

  if (Array.isArray(item.sub_components) && item.sub_components.length > 0) {
    const itemSubsJson = JSON.stringify(item.sub_components);
    const prodSubsJson = JSON.stringify(product.sub_components || []);
    if (itemSubsJson !== prodSubsJson) return true;
  }

  return false;
}

/**
 * Pushes updated line item fields (price, cost, unit, brand, model, origin, specs, image, datasheet)
 * directly back to the master Product record in Firestore and local state.
 */
export async function syncLineItemToCatalogProduct(
  item: any,
  product: Product,
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>,
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
): Promise<Product | null> {
  if (!product?.id) return null;

  const parsed = parseLineItemTitleAndSpec(item.item_name || item.title, item.description);
  const updatedName = (item.item_name || item.title || product.name || parsed.title || '').trim();
  const updatedDesc = (item.description || product.description || '').trim();
  const updatedBrand = (item.brand_make ?? product.brand_make ?? '').trim() || undefined;
  const updatedModel = (item.model_part_no ?? product.model_part_no ?? '').trim() || undefined;
  const updatedUnit = (item.unit || product.unit || 'Nos').trim();
  const updatedSell =
    item.unit_price !== undefined && item.unit_price !== null && !isNaN(Number(item.unit_price))
      ? Number(item.unit_price)
      : product.unit_price;
  const updatedCost =
    item.cost_price !== undefined && item.cost_price !== null && !isNaN(Number(item.cost_price)) && Number(item.cost_price) > 0
      ? Number(item.cost_price)
      : product.cost_price;
  const updatedLead = (item.lead_time_note ?? item.availability ?? product.default_availability ?? '').trim() || undefined;
  const updatedOrigin = (item.country_of_origin ?? item.origin ?? product.country_of_origin ?? '').trim() || undefined;
  const updatedHs = (item.hs_code ?? product.hs_code ?? '').trim() || undefined;
  const updatedImage = (item.image_url ?? product.image_url ?? '').trim() || undefined;
  const updatedDatasheet = item.datasheet_attachment || product.datasheet_attachment || undefined;
  const updatedAttributes: ProductAttribute[] = Array.isArray(item.attributes)
    ? item.attributes
        .map((a: any) => ({ key: String(a.key ?? '').trim(), value: String(a.value ?? '').trim() }))
        .filter((a: ProductAttribute) => a.key !== '' && a.value !== '')
    : product.attributes || [];

  const searchTerms = generateProductSearchTerms(
    updatedName,
    product.product_type || 'General',
    product.sku || '',
    updatedBrand || updatedModel
  );

  const patch: Partial<Product> = {
    name: updatedName,
    description: updatedDesc || updatedName,
    unit: updatedUnit,
    unit_price: updatedSell,
    cost_price: updatedCost,
    brand_make: updatedBrand,
    model_part_no: updatedModel,
    default_availability: updatedLead,
    country_of_origin: updatedOrigin,
    hs_code: updatedHs,
    image_url: updatedImage,
    datasheet_attachment: updatedDatasheet,
    attributes: updatedAttributes,
    ...(item.is_composite_set !== undefined ? { is_composite_set: Boolean(item.is_composite_set) } : {}),
    ...(Array.isArray(item.sub_components) ? { sub_components: item.sub_components } : {}),
    ...(item.package_pricing_mode ? { package_pricing_mode: item.package_pricing_mode } : {}),
    ...(item.option_scope_notes !== undefined ? { option_scope_notes: item.option_scope_notes } : {}),
    search_terms: searchTerms,
    updatedAt: new Date().toISOString()
  };

  await safeUpdateDoc('products', product.id, patch);

  const mergedProduct: Product = {
    ...product,
    ...patch
  };

  if (setProducts) {
    setProducts((prev) => prev.map((p) => (p.id === product.id ? mergedProduct : p)));
  }

  if (triggerToast) {
    triggerToast(`Synced latest pricing & specs back to Catalog item "${updatedName}".`, 'success');
  }

  return mergedProduct;
}

export interface SaveToCatalogLineItemInput {
  item_name?: string;
  title?: string;
  description?: string;
  product_type?: string;
  sku?: string;
  brand_make?: string;
  model_part_no?: string;
  unit?: string;
  unit_price?: number;
  cost_price?: number;
  lead_time_note?: string;
  availability?: string;
  country_of_origin?: string;
  origin?: string;
  hs_code?: string;
  image_url?: string;
  datasheet_attachment?: Attachment;
  attributes?: ProductAttribute[];
  is_composite_set?: boolean;
  sub_components?: any[];
  package_pricing_mode?: 'itemized' | 'lump_sum';
  option_scope_notes?: string;
}

interface SaveToCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineItem?: SaveToCatalogLineItemInput | null;
  initialItem?: SaveToCatalogLineItemInput | null;
  activeWorkspace?: Workspace;
  user?: any;
  products: Product[];
  productCategories?: string[];
  units?: string[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  onSaved: (newProduct: Product) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SaveToCatalogModal({
  isOpen,
  onClose,
  lineItem: propLineItem,
  initialItem,
  activeWorkspace,
  user,
  products,
  productCategories: propCategories,
  units: propUnits,
  setProducts,
  setProductCategories,
  onSaved,
  triggerToast
}: SaveToCatalogModalProps) {
  const lineItem = propLineItem || initialItem || null;
  const [isSaving, setIsSaving] = useState(false);

  const availableCategories = useMemo(() => {
    const base = propCategories && propCategories.length > 0 ? propCategories : [...UNIVERSAL_CATEGORIES];
    const fromProds = (products || []).filter((p) => !p.is_deleted && p.product_type).map((p) => p.product_type);
    return Array.from(new Set([...base, ...fromProds])).filter(Boolean);
  }, [propCategories, products]);

  const availableUnits = useMemo(() => {
    const base = propUnits && propUnits.length > 0 ? propUnits : [...UNIVERSAL_UNITS];
    const fromProds = (products || []).filter((p) => !p.is_deleted && p.unit).map((p) => p.unit);
    return Array.from(new Set([...base, ...fromProds])).filter(Boolean);
  }, [propUnits, products]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General Equipment');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [sku, setSku] = useState('');
  const [brandMake, setBrandMake] = useState('');
  const [modelPartNo, setModelPartNo] = useState('');
  const [unit, setUnit] = useState('Nos');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [costPrice, setCostPrice] = useState<string>('');
  const [leadTime, setLeadTime] = useState('');
  const [countryOfOrigin, setCountryOfOrigin] = useState('');
  const [hsCode, setHsCode] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [datasheetAttachment, setDatasheetAttachment] = useState<Attachment | undefined>(undefined);
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingDatasheet, setIsUploadingDatasheet] = useState(false);

  useEffect(() => {
    if (!isOpen || !lineItem) return;
    const rawTitle = lineItem.item_name || lineItem.title || '';
    const rawDesc = lineItem.description || '';
    const parsed = parseLineItemTitleAndSpec(rawTitle, rawDesc);

    setName(parsed.title || '');
    setDescription(parsed.spec || parsed.title || '');

    const initialCat =
      lineItem.product_type && lineItem.product_type !== 'Custom' && lineItem.product_type !== 'Standard'
        ? lineItem.product_type
        : availableCategories[0] || 'General Equipment';
    setCategory(initialCat);

    // Extract brand or model from attributes if not set directly
    const attrs = Array.isArray(lineItem.attributes) ? lineItem.attributes : [];
    const attrBrand = attrs.find((a) => /^(brand|make|manufacturer|brand \/ make)$/i.test((a.key || '').trim()))?.value;
    const attrModel = attrs.find((a) => /^(model|model no|part no|model \/ part no)$/i.test((a.key || '').trim()))?.value;

    const resolvedBrand = lineItem.brand_make || attrBrand || '';
    const resolvedModel = lineItem.model_part_no || attrModel || '';
    setBrandMake(resolvedBrand);
    setModelPartNo(resolvedModel);

    // Auto-generate clean SKU if none exists
    if (lineItem.sku && lineItem.sku.trim()) {
      setSku(lineItem.sku.trim());
    } else {
      const prefix = (resolvedBrand || initialCat || 'CAT')
        .replace(/[^A-Za-z0-9]/g, '')
        .slice(0, 3)
        .toUpperCase() || 'ITM';
      const suffix = Math.floor(1000 + Math.random() * 9000);
      setSku(`${prefix}-${suffix}`);
    }

    setUnit(lineItem.unit || (lineItem.is_composite_set ? 'Set' : 'Nos'));
    setUnitPrice(lineItem.unit_price != null && lineItem.unit_price >= 0 ? String(lineItem.unit_price) : '');
    setCostPrice(lineItem.cost_price != null && lineItem.cost_price > 0 ? String(lineItem.cost_price) : '');
    setLeadTime(lineItem.lead_time_note || lineItem.availability || '');
    setCountryOfOrigin(lineItem.country_of_origin || lineItem.origin || '');
    setHsCode(lineItem.hs_code || '');
    setImageUrl(lineItem.image_url || '');
    setDatasheetAttachment(lineItem.datasheet_attachment);
    setAttributes(attrs.map((a) => ({ key: a.key ?? '', value: a.value ?? '' })));
    setIsCreatingCategory(false);
    setNewCategoryInput('');
  }, [isOpen, lineItem, availableCategories]);

  const suggestedChips = useMemo(() => {
    const known = category ? CATEGORY_SUGGESTED_ATTRIBUTES[category] || [] : [];
    const defaults = ['Dimensions / Size', 'Material / Grade', 'Capacity / Rating', 'Operating Pressure', 'Warranty'];
    const merged = Array.from(new Set([...known, ...defaults]));
    const used = new Set(attributes.map((a) => (a.key || '').trim().toLowerCase()));
    return merged.filter((k) => !used.has(k.toLowerCase())).slice(0, 8);
  }, [category, attributes]);

  if (!isOpen || !lineItem) return null;

  const handleCreateCategoryInline = async () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) {
      setIsCreatingCategory(false);
      return;
    }
    try {
      const res = await safeAddDoc('dropdown_product_categories', {
        name: trimmed,
        workspace_id: activeWorkspace?.id || undefined
      });
      if (setProductCategories) {
        setProductCategories((prev) => [
          ...prev,
          { id: res?.id || `cat_${Date.now()}`, name: trimmed, workspace_id: activeWorkspace?.id }
        ]);
      }
      setCategory(trimmed);
    } catch {
      setCategory(trimmed);
    } finally {
      setIsCreatingCategory(false);
      setNewCategoryInput('');
    }
  };

  const handleUploadImage = async (file: File) => {
    if (!file) return;
    setIsUploadingImage(true);
    try {
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/images',
        (activeWorkspace as any)?.settings || activeWorkspace,
        { compressImage: true, maxDimension: 650, quality: 0.84 }
      );
      setImageUrl(uploaded.url);
      if (triggerToast) {
        triggerToast('Product image uploaded and ready for catalog.', 'success');
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Image upload failed: ${err?.message || 'Error'}`, 'error');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleUploadDatasheet = async (file: File) => {
    if (!file) return;
    setIsUploadingDatasheet(true);
    try {
      const uploaded = await uploadWorkspaceMediaAsset(
        file,
        'products/datasheets',
        (activeWorkspace as any)?.settings || activeWorkspace,
        { compressImage: file.type.startsWith('image/'), maxDimension: 1400, quality: 0.86 }
      );
      setDatasheetAttachment({
        id: `ds_${Date.now()}`,
        name: file.name,
        size: uploaded.size || file.size,
        type: uploaded.type || file.type || 'application/pdf',
        url: uploaded.url,
        uploadedAt: new Date().toISOString(),
        isLocal: uploaded.isLocal,
        storageKey: uploaded.storageKey,
        uploadedByUserName: user?.full_name || user?.username || user?.email || 'User'
      });
      if (triggerToast) {
        triggerToast(`Technical datasheet "${file.name}" attached.`, 'success');
      }
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Datasheet upload failed: ${err?.message || 'Error'}`, 'error');
      }
    } finally {
      setIsUploadingDatasheet(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      if (triggerToast) triggerToast('Product Name / Title is required.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const cleanAttrs = attributes
        .map((a) => ({ key: (a.key ?? '').trim(), value: (a.value ?? '').trim() }))
        .filter((a) => a.key !== '' && a.value !== '');

      const searchTerms = generateProductSearchTerms(
        name.trim(),
        category || 'General Equipment',
        sku.trim(),
        brandMake.trim() || modelPartNo.trim()
      );

      const numSell = unitPrice !== '' && !isNaN(Number(unitPrice)) ? Number(unitPrice) : undefined;
      const numCost = costPrice !== '' && !isNaN(Number(costPrice)) ? Number(costPrice) : undefined;
      const isComposite = Boolean(
        lineItem.is_composite_set ||
          (Array.isArray(lineItem.sub_components) && lineItem.sub_components.length > 0)
      );

      const productPayload: Partial<Product> = {
        workspace_id: activeWorkspace?.id || 'ws_default',
        name: name.trim(),
        description: description.trim() || name.trim(),
        product_type: category || 'General Equipment',
        sku: sku.trim() || undefined,
        brand_make: brandMake.trim() || undefined,
        model_part_no: modelPartNo.trim() || undefined,
        unit: unit || 'Nos',
        unit_price: numSell,
        cost_price: numCost,
        default_availability: leadTime.trim() || undefined,
        country_of_origin: countryOfOrigin.trim() || undefined,
        hs_code: hsCode.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        datasheet_attachment: datasheetAttachment || undefined,
        attributes: cleanAttrs,
        ...(isComposite ? { is_composite_set: true } : {}),
        ...(Array.isArray(lineItem.sub_components) && lineItem.sub_components.length > 0
          ? { sub_components: lineItem.sub_components }
          : {}),
        ...(lineItem.package_pricing_mode ? { package_pricing_mode: lineItem.package_pricing_mode } : {}),
        ...(lineItem.option_scope_notes ? { option_scope_notes: lineItem.option_scope_notes } : {}),
        search_terms: searchTerms,
        is_inventoried: false,
        stock_on_hand: 0,
        stock_reserved: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const res = await safeAddDoc('products', productPayload);
      const newId = res?.id || `prod_${Date.now()}`;
      const createdProduct: Product = {
        id: newId,
        ...productPayload
      } as Product;

      if (setProducts) {
        setProducts((prev) => [createdProduct, ...prev.filter((p) => p.id !== newId)]);
      }

      if (triggerToast) {
        triggerToast(
          `Saved ${isComposite ? 'Composite Kit / BOM' : 'Product'} "${createdProduct.name}" to Products Catalog.`,
          'success'
        );
      }

      onSaved(createdProduct);
      onClose();
    } catch (err: any) {
      if (triggerToast) {
        triggerToast(`Failed to save to catalog: ${err?.message || 'Error'}`, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const numSellPreview = unitPrice !== '' && !isNaN(Number(unitPrice)) ? Number(unitPrice) : 0;
  const numCostPreview = costPrice !== '' && !isNaN(Number(costPrice)) ? Number(costPrice) : 0;
  const marginPreview =
    numSellPreview > 0 && numCostPreview > 0
      ? (((numSellPreview - numCostPreview) / numSellPreview) * 100).toFixed(1)
      : null;
  const isCompositePreview = Boolean(
    lineItem.is_composite_set ||
      (Array.isArray(lineItem.sub_components) && lineItem.sub_components.length > 0)
  );

  return (
    <div
      className="fixed inset-0 z-[260] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-xs">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isCompositePreview
                  ? 'Save Composite Package / Kit (BOM) to Catalog'
                  : 'Save Line Item to Products Catalog'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Creates a reusable Catalog {isCompositePreview ? 'Composite Kit (with all BOM sub-components)' : 'Product'} and links its ID back to this line item.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 font-sans">
          {isCompositePreview && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-indigo-950">
                📦 Composite Kit / BOM Breakdown Attached ({lineItem.sub_components?.length || 0} sub-components)
              </div>
              <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-mono text-[10px] font-bold">
                Mode: {lineItem.package_pricing_mode === 'lump_sum' ? 'Single Lump-Sum' : 'Itemized Rates'}
              </span>
            </div>
          )}
          {/* Name & Split Helper */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-mono font-bold uppercase text-slate-500">
                Product Name / Commercial Title <span className="text-rose-500">*</span>
              </label>
              {description && description.length > 25 && (
                <button
                  type="button"
                  onClick={() => {
                    const split = parseLineItemTitleAndSpec('', description);
                    if (split.title) {
                      setName(split.title);
                      setDescription(split.spec);
                    }
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer hover:underline"
                >
                  Auto-Split Title from Description
                </button>
              )}
            </div>
            <input
              type="text"
              required
              value={name ?? ''}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g.FRP Pressure Vessel 30x72 with Top & Bottom Opening"
              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-sm font-semibold text-slate-900 focus:outline-none"
            />
          </div>

          {/* Category & SKU */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-mono font-bold uppercase text-slate-500">
                  Category <span className="text-rose-500">*</span>
                </label>
                {!isCreatingCategory && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCategory(true);
                      setNewCategoryInput('');
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Category</span>
                  </button>
                )}
              </div>
              {isCreatingCategory ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    autoFocus
                    value={newCategoryInput ?? ''}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="Enter new category..."
                    className="flex-1 bg-white border border-blue-400 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategoryInline}
                    className="px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCreatingCategory(false)}
                    className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <select
                  value={category ?? ''}
                  onChange={(e) => {
                    if (e.target.value === '__NEW__') {
                      setIsCreatingCategory(true);
                      setNewCategoryInput('');
                    } else {
                      setCategory(e.target.value);
                    }
                  }}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="__NEW__">+ Add New Category...</option>
                </select>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                SKU / Catalog Code
              </label>
              <input
                type="text"
                value={sku ?? ''}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. VES-3072"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Brand / Make & Model / Part # */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                Brand / Make
              </label>
              <input
                type="text"
                value={brandMake ?? ''}
                onChange={(e) => setBrandMake(e.target.value)}
                placeholder="e.g. Pentair, Grundfos, Hydranautics"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                Model / Part #
              </label>
              <input
                type="text"
                value={modelPartNo ?? ''}
                onChange={(e) => setModelPartNo(e.target.value)}
                placeholder="e.g. 3072-FRP-4"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Commercial Pricing & Unit */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                  Unit (UOM)
                </label>
                <select
                  value={unit ?? 'Nos'}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-semibold text-slate-800 focus:outline-none"
                >
                  {availableUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                  Selling Price (AED)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={unitPrice ?? ''}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono font-bold text-slate-900 focus:outline-none tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                  Unit Cost Price (AED)
                </label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={costPrice ?? ''}
                  onChange={(e) => setCostPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 focus:outline-none tabular-nums"
                />
              </div>
            </div>
            {marginPreview !== null && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200/80 font-mono">
                <span className="text-slate-500">Gross Profit: AED {(numSellPreview - numCostPreview).toFixed(2)}</span>
                <span className="font-bold text-emerald-700">Gross Margin: {marginPreview}%</span>
              </div>
            )}
          </div>

          {/* Lead Time, Country of Origin, HS Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                Lead Time / Availability
              </label>
              <input
                type="text"
                list="catalog-leadtime-presets"
                value={leadTime ?? ''}
                onChange={(e) => setLeadTime(e.target.value)}
                placeholder="e.g. Ex-Stock, 2-3 Weeks"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
              />
              <datalist id="catalog-leadtime-presets">
                {AVAILABILITY_PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                Country of Origin
              </label>
              <input
                type="text"
                value={countryOfOrigin ?? ''}
                onChange={(e) => setCountryOfOrigin(e.target.value)}
                placeholder="e.g. USA, Germany, UAE"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
                HS Code
              </label>
              <input
                type="text"
                value={hsCode ?? ''}
                onChange={(e) => setHsCode(e.target.value)}
                placeholder="e.g. 8421.21.00"
                className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs font-mono text-slate-800 focus:outline-none"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-mono font-bold uppercase text-slate-500 mb-1">
              Detailed Technical Specification / Description
            </label>
            <textarea
              rows={3}
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Technical scope, materials of construction, operating parameters..."
              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
            />
          </div>

          {/* Product Image & Datasheet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Product Image</span>
              </span>
              {imageUrl ? (
                <div className="flex items-center gap-2.5 bg-white p-2 rounded-lg border border-slate-200">
                  <img
                    src={imageUrl}
                    alt="Product"
                    className="w-11 h-11 rounded object-contain border border-slate-100 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-emerald-700 block truncate">Image Attached</span>
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[10px] text-rose-600 hover:underline font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="w-full py-2 px-3 border border-dashed border-slate-300 hover:border-blue-400 bg-white rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition">
                    <UploadCloud className="w-3.5 h-3.5 text-blue-500" />
                    <span>{isUploadingImage ? 'Uploading...' : 'Upload Photo to Bucket'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isUploadingImage}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadImage(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  <input
                    type="url"
                    value={imageUrl ?? ''}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Or paste direct image URL..."
                    className="w-full bg-white border border-slate-200 rounded-lg py-1 px-2 text-[11px] text-slate-700 focus:outline-none"
                  />
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                <span>Technical Datasheet</span>
              </span>
              {datasheetAttachment ? (
                <div className="flex items-center justify-between gap-2 bg-white p-2 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="text-xs font-semibold text-slate-800 truncate" title={datasheetAttachment.name}>
                      {datasheetAttachment.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {datasheetAttachment.url && (
                      <a
                        href={datasheetAttachment.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-slate-400 hover:text-blue-600"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setDatasheetAttachment(undefined)}
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <label className="w-full py-3.5 px-3 border border-dashed border-slate-300 hover:border-indigo-400 bg-white rounded-lg text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition">
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{isUploadingDatasheet ? 'Uploading...' : 'Upload PDF Spec Sheet'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    disabled={isUploadingDatasheet}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadDatasheet(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Technical Attributes */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono font-bold uppercase text-slate-500">
                Technical Specification Attributes (Key / Value)
              </label>
              <button
                type="button"
                onClick={() => setAttributes((prev) => [...prev, { key: '', value: '' }])}
                className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Add Spec</span>
              </button>
            </div>
            {suggestedChips.length > 0 && (
              <div className="flex items-center flex-wrap gap-1 mb-2">
                {suggestedChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setAttributes((prev) => [...prev, { key: chip, value: '' }])}
                    className="px-2 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 text-[10px] font-medium cursor-pointer"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            )}
            {attributes.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                {attributes.map((attr, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={attr.key ?? ''}
                      onChange={(e) =>
                        setAttributes((prev) => prev.map((a, i) => (i === idx ? { ...a, key: e.target.value } : a)))
                      }
                      placeholder="Parameter"
                      className="w-[42%] bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-semibold text-slate-800 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={attr.value ?? ''}
                      onChange={(e) =>
                        setAttributes((prev) => prev.map((a, i) => (i === idx ? { ...a, value: e.target.value } : a)))
                      }
                      placeholder="Value"
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setAttributes((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 font-semibold rounded-xl text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || isUploadingImage || isUploadingDatasheet}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving to Catalog...' : 'Save to Catalog & Link Item'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
