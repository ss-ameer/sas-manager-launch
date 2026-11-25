import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Z_NESTED_MODAL } from '../constants/zIndex';
import {
  Product,
  ProductAttribute,
  ProductSpecVariant,
  Attachment,
  Workspace,
  DropdownOption,
  CATEGORY_SUGGESTED_ATTRIBUTES,
  ImageAdjustmentConfig
} from '../types';
import { safeAddDoc, safeUpdateDoc } from '../firebase';
import { generateProductSearchTerms } from '../utils/defaults';
import { UNIVERSAL_CATEGORIES, UNIVERSAL_UNITS } from '../constants';
import { uploadWorkspaceMediaAsset } from '../services/attachmentStorage';
import { MetadataRepository } from '../services/repositories/MetadataRepository';
import LineItemImageOptionsPopover from './common/LineItemImageOptionsPopover';
import {
  resolveSelectedVariantId,
  resolveSafeVariantSelectKey,
  formatCustomLineItemVariantSummary,
  buildVariantSwitchLineItemFields,
  mergeProductsIntoOfflineCache,
  VARIANT_SELECT_PARENT,
  VARIANT_SELECT_CUSTOM
} from '../utils/catalogVariantUtils';
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
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronDown,
  GitBranch,
  RefreshCw,
  Search
} from 'lucide-react';

function persistProductsToOfflineCacheSafe(updatedProducts: Product[]) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem('omni_products');
    const existingCached: Product[] = raw ? JSON.parse(raw) : [];
    const merged = mergeProductsIntoOfflineCache(
      Array.isArray(existingCached) ? existingCached : [],
      updatedProducts
    );
    window.localStorage.setItem('omni_products', JSON.stringify(merged));
  } catch (_) {}
}

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
    // Handle case where item_name itself has multiple lines
    const nameLines = cleanName.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (nameLines.length > 1) {
      const firstLineTitle = nameLines[0].replace(/[:\-–—]\s*$/, '').trim();
      const restFromName = nameLines.slice(1).join('\n').trim();
      const combinedSpec =
        cleanDesc && cleanDesc !== cleanName
          ? `${restFromName}\n${cleanDesc}`.trim()
          : restFromName;
      return {
        title: firstLineTitle,
        spec: combinedSpec,
        wasSplit: true
      };
    }

    // Strip redundant first line from description if it repeats cleanName
    if (cleanDesc) {
      const descLines = cleanDesc.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (
        descLines.length > 1 &&
        descLines[0].replace(/[:\-–—]\s*$/, '').trim().toLowerCase() === cleanName.toLowerCase()
      ) {
        return {
          title: cleanName,
          spec: descLines.slice(1).join('\n').trim(),
          wasSplit: true
        };
      }
    }

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
 * Extracts structured Key/Value specification attributes from multi-line
 * technical descriptions (e.g. "Flow Rate: 50 m3/h" or "• Material: SS316L")
 * and merges them with any existing attributes without duplicating keys.
 */
export function extractAttributesFromDescription(
  description?: string | null,
  existingAttributes?: ProductAttribute[] | null
): ProductAttribute[] {
  const baseAttrs: ProductAttribute[] = Array.isArray(existingAttributes)
    ? existingAttributes
        .map((a) => ({ key: String(a?.key ?? '').trim(), value: String(a?.value ?? '').trim() }))
        .filter((a) => a.key !== '' || a.value !== '')
    : [];

  const seenKeys = new Set(baseAttrs.map((a) => a.key.toLowerCase()).filter(Boolean));
  const raw = (description ?? '').trim();
  if (!raw) return baseAttrs;

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const withoutSpecsPrefix = line.replace(/^specs:\s*/i, '').trim();
    const segments = /^specs:\s*/i.test(line)
      ? withoutSpecsPrefix.split(/\s*[•|]\s*/)
      : [withoutSpecsPrefix];
    for (const seg of segments) {
      const cleaned = seg.replace(/^(?:[-•*▪▸]+|\d+[.)])\s*/, '').trim();
      const match = cleaned.match(/^([A-Za-z0-9][A-Za-z0-9\s/&().\-_#]{1,42}?)\s*:\s*(.+)$/);
      if (match) {
        const k = match[1].replace(/^(?:[-•*▪▸]+)\s*/, '').trim();
        const v = match[2].trim();
        if (
          k &&
          v &&
          !k.toLowerCase().startsWith('http') &&
          !k.toLowerCase().startsWith('note') &&
          !seenKeys.has(k.toLowerCase())
        ) {
          seenKeys.add(k.toLowerCase());
          baseAttrs.push({ key: k, value: v });
        }
      }
    }
  }

  return baseAttrs;
}

export const CURRENCY_TO_AED_RATES: Record<string, number> = {
  AED: 1,
  USD: 3.6725,
  EUR: 4.0,
  GBP: 4.65,
  SAR: 0.979,
  QAR: 1.008,
  KWD: 11.95,
  OMR: 9.54,
  BHD: 9.74,
  INR: 0.044,
  CNY: 0.51
};

export function resolveToAedMultiplier(currency?: string | null): number {
  const code = String(currency || 'AED').trim().toUpperCase();
  return CURRENCY_TO_AED_RATES[code] ?? 1;
}

/**
 * Ensures the Commercial & Technical Description retains narrative lines without
 * duplicating structured Key/Value specification attributes that are already rendered
 * as dedicated specification pills on Quotations, Delivery Notes, and Purchase Orders.
 */
export function compileDescriptionWithSpecs(
  title?: string | null,
  rawDescription?: string | null,
  attributes?: ProductAttribute[] | null
): string {
  const cleanTitle = (title ?? '').trim();
  let cleanDesc = (rawDescription ?? '').trim();

  if (cleanTitle && cleanDesc) {
    const descLines = cleanDesc.split(/\r?\n/);
    if (
      descLines.length > 1 &&
      descLines[0].trim().replace(/[:\-–—]\s*$/, '').toLowerCase() === cleanTitle.toLowerCase()
    ) {
      cleanDesc = descLines.slice(1).join('\n').trim();
    }
  }

  const validAttrs = (Array.isArray(attributes) ? attributes : [])
    .map((a) => ({ key: String(a?.key ?? '').trim(), value: String(a?.value ?? '').trim() }))
    .filter((a) => a.key !== '' && a.value !== '');

  if (validAttrs.length === 0) {
    return cleanDesc || cleanTitle;
  }

  // Strip any Key: Value line from cleanDesc that already exists in structured attributes
  const attrKeySet = new Set(validAttrs.map((a) => a.key.toLowerCase()));
  const filteredLines = cleanDesc
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^specs:\s*/i.test(trimmed)) return false;
      const strippedBullet = trimmed.replace(/^(?:[-•*▪▸]+|\d+[.)])\s*/, '').trim();
      const colonIdx = strippedBullet.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        const lineKey = strippedBullet.slice(0, colonIdx).trim().toLowerCase();
        if (attrKeySet.has(lineKey)) {
          return false;
        }
      }
      return true;
    });

  const narrativeOnly = filteredLines.join('\n').trim();
  const isDescSameAsTitle =
    !narrativeOnly || (cleanTitle !== '' && narrativeOnly.toLowerCase() === cleanTitle.toLowerCase());

  if (isDescSameAsTitle) {
    return '';
  }

  return narrativeOnly;
}

/**
 * Checks whether a catalog-linked line item has commercial, technical, or media
 * modifications compared to its master Product in the catalog.
 */
export function hasCatalogDrift(item: any, product?: Product | null, currency?: string): boolean {
  if (!item || !product || !item.product_id) return false;

  const effectiveCurrency = String(currency || item?.currency || product?.currency || 'AED').toUpperCase();
  const prodCurrency = String(product?.currency || 'AED').toUpperCase();
  const fxMultiplier =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(effectiveCurrency) / resolveToAedMultiplier(prodCurrency);
  const priceTolerance = effectiveCurrency !== 'AED' ? 0.05 : 0.005;

  const itemSell = Math.round(Number(item.unit_price ?? 0) * fxMultiplier * 100) / 100;
  const prodSell = Number(product.unit_price ?? 0);
  if (Math.abs(itemSell - prodSell) > priceTolerance) return true;

  const itemCost = Math.round(Number(item.cost_price ?? 0) * fxMultiplier * 100) / 100;
  const prodCost = Number(product.cost_price ?? 0);
  if (itemCost > 0 && Math.abs(itemCost - prodCost) > priceTolerance) return true;

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

  const itemSecImg = (item.secondary_image_url ?? '').trim();
  const prodSecImg = (product.secondary_image_url ?? '').trim();
  if (itemSecImg && itemSecImg !== prodSecImg) return true;

  const itemCap = (item.image_caption ?? '').trim();
  const prodCap = (product.image_caption ?? '').trim();
  if (itemCap && itemCap !== prodCap) return true;

  const itemSecCap = (item.secondary_image_caption ?? '').trim();
  const prodSecCap = (product.secondary_image_caption ?? '').trim();
  if (itemSecCap && itemSecCap !== prodSecCap) return true;

  if (item.image_adjustments) {
    const itemAdjJson = JSON.stringify(item.image_adjustments);
    const prodAdjJson = JSON.stringify(product.image_adjustments || {});
    if (itemAdjJson !== prodAdjJson) return true;
  }

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
    const normalizedItemSubs = item.sub_components.map((sub: any) => ({
      ...sub,
      unit_price: sub.is_included_accessory ? 0 : Math.round(Number(sub.unit_price || 0) * fxMultiplier * 100) / 100,
      cost_price: sub.is_included_accessory ? 0 : Math.round(Number(sub.cost_price || 0) * fxMultiplier * 100) / 100,
      total_price: sub.is_included_accessory ? 0 : Math.round(Number(sub.total_price || 0) * fxMultiplier * 100) / 100,
      line_total: sub.is_included_accessory ? 0 : Math.round(Number(sub.line_total || 0) * fxMultiplier * 100) / 100
    }));
    const itemSubsJson = JSON.stringify(normalizedItemSubs);
    const prodSubsJson = JSON.stringify(product.sub_components || []);
    if (itemSubsJson !== prodSubsJson) return true;
  }

  return false;
}

export interface CatalogItemDiffEntry {
  field: string;
  catalogValue: string;
  quoteValue: string;
  isIdentifyingSpec: boolean;
}

export interface CatalogItemDiffSummary {
  hasDrift: boolean;
  hasIdentifyingDrift: boolean;
  entries: CatalogItemDiffEntry[];
  summaryText: string;
}

/**
 * Computes a human-readable diff between a quote/enquiry line item and its linked Catalog Product,
 * and flags whether key identifying specs (Name, Model, Dimensions, Size, Capacity, Rating, Pressure, Flow)
 * were modified so the UI can recommend saving as a new Variant rather than overwriting the linked product.
 */
export function computeCatalogItemDiff(
  item: any,
  product?: Product | null,
  currency?: string,
  allProducts?: Product[]
): CatalogItemDiffSummary {
  if (!item || !product || !item.product_id) {
    return {
      hasDrift: false,
      hasIdentifyingDrift: false,
      entries: [],
      summaryText: ''
    };
  }

  const effProduct = resolveEffectiveCatalogProduct(product, allProducts);
  const effectiveCurrency = String(currency || item?.currency || effProduct?.currency || 'AED').toUpperCase();
  const prodCurrency = String(effProduct?.currency || 'AED').toUpperCase();
  const fxMultiplier =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(effectiveCurrency) / resolveToAedMultiplier(prodCurrency);
  const priceTolerance = effectiveCurrency !== 'AED' ? 0.05 : 0.005;

  const entries: CatalogItemDiffEntry[] = [];
  const identifyingKeyRegex =
    /size|dimension|dia|height|length|width|capacity|flow|pressure|rating|model|material|moc|grade|volume|power|kw|hp|voltage|output/i;

  // 1. Title / Name
  const itemName = String(item.item_name || item.title || '').trim();
  const prodName = String(effProduct.name || '').trim();
  if (itemName && prodName && itemName.toLowerCase() !== prodName.toLowerCase()) {
    entries.push({
      field: 'Title',
      catalogValue: prodName,
      quoteValue: itemName,
      isIdentifyingSpec: true
    });
  }

  // 2. Model / Part #
  const itemModel = String(item.model_part_no ?? '').trim();
  const prodModel = String(effProduct.model_part_no ?? '').trim();
  if (itemModel && itemModel.toLowerCase() !== prodModel.toLowerCase()) {
    entries.push({
      field: 'Model',
      catalogValue: prodModel || 'None',
      quoteValue: itemModel,
      isIdentifyingSpec: true
    });
  }

  // 3. Structured Attributes (Dimensions, Capacity, Size, etc.)
  const itemAttrs: ProductAttribute[] = Array.isArray(item.attributes)
    ? item.attributes.filter((a: any) => a && String(a.key ?? '').trim() !== '')
    : [];
  const prodAttrs: ProductAttribute[] = Array.isArray(effProduct.attributes)
    ? effProduct.attributes.filter((a) => a && String(a.key ?? '').trim() !== '')
    : [];

  for (const ia of itemAttrs) {
    const k = ia.key.trim();
    const v = String(ia.value ?? '').trim();
    if (!k || !v) continue;
    const kLower = k.toLowerCase();
    if (kLower === 'delivery' || kLower === 'lead time' || kLower === 'availability') continue;
    const pMatch = prodAttrs.find((pa) => pa.key.trim().toLowerCase() === kLower);
    const pVal = String(pMatch?.value ?? '').trim();
    if (!pMatch || pVal.toLowerCase() !== v.toLowerCase()) {
      entries.push({
        field: k,
        catalogValue: pVal || 'Unset',
        quoteValue: v,
        isIdentifyingSpec: identifyingKeyRegex.test(k)
      });
    }
  }

  // 4. Price
  const itemSellInProdCurr = Math.round(Number(item.unit_price ?? 0) * fxMultiplier * 100) / 100;
  const prodSell = Number(effProduct.unit_price ?? 0);
  if (Math.abs(itemSellInProdCurr - prodSell) > priceTolerance) {
    entries.push({
      field: 'Price',
      catalogValue: `${prodCurrency} ${prodSell.toLocaleString()}`,
      quoteValue: `${prodCurrency} ${itemSellInProdCurr.toLocaleString()}`,
      isIdentifyingSpec: false
    });
  }

  // 5. Cost Price
  const itemCostInProdCurr = Math.round(Number(item.cost_price ?? 0) * fxMultiplier * 100) / 100;
  const prodCost = Number(effProduct.cost_price ?? 0);
  if (itemCostInProdCurr > 0 && Math.abs(itemCostInProdCurr - prodCost) > priceTolerance) {
    entries.push({
      field: 'Cost',
      catalogValue: `${prodCurrency} ${prodCost.toLocaleString()}`,
      quoteValue: `${prodCurrency} ${itemCostInProdCurr.toLocaleString()}`,
      isIdentifyingSpec: false
    });
  }

  // 6. Brand / Origin / Lead Time / Photo
  const itemBrand = String(item.brand_make ?? '').trim();
  const prodBrand = String(effProduct.brand_make ?? '').trim();
  if (itemBrand && itemBrand.toLowerCase() !== prodBrand.toLowerCase()) {
    entries.push({
      field: 'Brand',
      catalogValue: prodBrand || 'Unset',
      quoteValue: itemBrand,
      isIdentifyingSpec: false
    });
  }

  const itemLead = String(item.lead_time_note ?? item.availability ?? '').trim();
  const prodLead = String(effProduct.default_availability ?? '').trim();
  if (itemLead && prodLead && itemLead.toLowerCase() !== prodLead.toLowerCase()) {
    entries.push({
      field: 'Lead Time',
      catalogValue: prodLead,
      quoteValue: itemLead,
      isIdentifyingSpec: false
    });
  }

  const itemImg = String(item.image_url ?? '').trim();
  const prodImg = String(effProduct.image_url ?? '').trim();
  if (itemImg && itemImg !== prodImg) {
    entries.push({
      field: 'Photo',
      catalogValue: prodImg ? 'Catalog Image' : 'None',
      quoteValue: 'Custom Image',
      isIdentifyingSpec: false
    });
  }

  const hasDrift = entries.length > 0 || hasCatalogDrift(item, effProduct, currency);
  const hasIdentifyingDrift = entries.some((e) => e.isIdentifyingSpec);
  const summaryText = entries
    .slice(0, 3)
    .map((e) =>
      e.field === 'Photo'
        ? 'Photo (Custom Image)'
        : `${e.field} (${e.catalogValue} → ${e.quoteValue})`
    )
    .join(', ');

  return {
    hasDrift,
    hasIdentifyingDrift,
    entries,
    summaryText
  };
}

/**
 * Pushes updated line item fields (price, cost, unit, brand, model, origin, specs, image, datasheet)
 * directly back to the master Product record in Firestore and local state.
 * Automatically converts USD prices to AED (* 3.6725) when currency === 'USD'.
 */
export async function syncLineItemToCatalogProduct(
  item: any,
  product: Product,
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>> | any,
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void,
  currency?: string
): Promise<Product | null> {
  if (!product?.id) return null;

  const effectiveCurrency = String(currency || item?.currency || product?.currency || 'AED').toUpperCase();
  const prodCurrency = String(product?.currency || 'AED').toUpperCase();
  const fxMultiplier =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(effectiveCurrency) / resolveToAedMultiplier(prodCurrency);

  const parsed = parseLineItemTitleAndSpec(item.item_name || item.title, item.description);
  const updatedName = (item.item_name || item.title || product.name || parsed.title || '').trim();
  const rawAttrsSource: ProductAttribute[] = Array.isArray(item.attributes)
    ? item.attributes
        .map((a: any) => ({ key: String(a.key ?? '').trim(), value: String(a.value ?? '').trim() }))
        .filter((a: ProductAttribute) => a.key !== '' && a.value !== '')
    : product.attributes || [];
  const updatedAttributes = extractAttributesFromDescription(
    parsed.spec || item.description,
    rawAttrsSource
  ).filter((a) => a.key !== '' && a.value !== '');
  const updatedDesc = compileDescriptionWithSpecs(
    updatedName,
    item.description || product.description || '',
    updatedAttributes
  );
  const updatedBrand = (item.brand_make ?? product.brand_make ?? '').trim() || undefined;
  const updatedModel = (item.model_part_no ?? product.model_part_no ?? '').trim() || undefined;
  const updatedUnit = (item.unit || (item as any).uom || product.unit || 'Nos').trim();
  const updatedSell =
    item.unit_price !== undefined && item.unit_price !== null && !isNaN(Number(item.unit_price))
      ? Math.round(Number(item.unit_price) * fxMultiplier * 100) / 100
      : product.unit_price;
  const updatedCost =
    item.cost_price !== undefined && item.cost_price !== null && !isNaN(Number(item.cost_price)) && Number(item.cost_price) > 0
      ? Math.round(Number(item.cost_price) * fxMultiplier * 100) / 100
      : product.cost_price;
  const updatedLead = (item.lead_time_note ?? item.availability ?? product.default_availability ?? '').trim() || undefined;
  const updatedOrigin = (item.country_of_origin ?? item.origin ?? product.country_of_origin ?? '').trim() || undefined;
  const updatedHs = (item.hs_code ?? product.hs_code ?? '').trim() || undefined;
  const updatedImage = (item.image_url ?? product.image_url ?? '').trim() || undefined;
  const updatedSecondaryImage = (item.secondary_image_url ?? product.secondary_image_url ?? '').trim() || undefined;
  const updatedImageCaption = (item.image_caption ?? product.image_caption ?? '').trim() || undefined;
  const updatedSecondaryCaption = (item.secondary_image_caption ?? product.secondary_image_caption ?? '').trim() || undefined;
  const updatedImageAdjustments = item.image_adjustments || product.image_adjustments || undefined;
  const updatedDatasheet = item.datasheet_attachment || product.datasheet_attachment || undefined;

  const updatedSubComponents = Array.isArray(item.sub_components)
    ? item.sub_components.map((sub: any) => {
        const subSell = sub.is_included_accessory
          ? 0
          : Math.round(Number(sub.unit_price || 0) * fxMultiplier * 100) / 100;
        const subCost = sub.is_included_accessory
          ? 0
          : Math.round(Number(sub.cost_price || 0) * fxMultiplier * 100) / 100;
        const subQty = Number(sub.quantity) || 0;
        const subTotal = sub.is_included_accessory ? 0 : Math.round(subSell * subQty * 100) / 100;
        return {
          ...sub,
          unit_price: subSell,
          cost_price: subCost,
          total_price: subTotal,
          line_total: subTotal
        };
      })
    : undefined;

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
    ...(updatedSecondaryImage !== undefined ? { secondary_image_url: updatedSecondaryImage } : {}),
    ...(updatedImageCaption !== undefined ? { image_caption: updatedImageCaption } : {}),
    ...(updatedSecondaryCaption !== undefined ? { secondary_image_caption: updatedSecondaryCaption } : {}),
    ...(updatedImageAdjustments !== undefined ? { image_adjustments: updatedImageAdjustments } : {}),
    datasheet_attachment: updatedDatasheet,
    attributes: updatedAttributes,
    ...(item.is_composite_set !== undefined ? { is_composite_set: Boolean(item.is_composite_set) } : {}),
    ...(updatedSubComponents ? { sub_components: updatedSubComponents } : {}),
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

  await MetadataRepository.upsertLocalProduct(mergedProduct).catch(() => {});

  if (typeof setProducts === 'function') {
    setProducts((prev: Product[]) => prev.map((p) => (p.id === product.id ? mergedProduct : p)));
  }

  if (triggerToast) {
    triggerToast(
      `Master Catalog SKU ${product.sku || updatedName} updated from this line item.`,
      'success'
    );
  }

  return mergedProduct;
}

/**
 * Checks whether a line item already has user-populated or AI-extracted content
 * that should be preserved when linking to a Catalog SKU.
 */
export function isLineItemPopulated(item: any): boolean {
  if (!item) return false;
  const cleanName = String(item.item_name ?? item.title ?? '').trim();
  const hasRealName =
    cleanName !== '' &&
    cleanName.toLowerCase() !== 'custom line item' &&
    cleanName.toLowerCase() !== 'custom item';
  const hasPrice = Number(item.unit_price) > 0;
  const hasLeadTime =
    String(item.lead_time_note ?? item.availability ?? '').trim() !== '' &&
    !String(item.lead_time_note ?? '').trim().startsWith('SKU:');
  const hasDesc =
    String(item.description ?? '').trim() !== '' &&
    String(item.description ?? '').trim().toLowerCase() !== 'custom line item';
  const hasAttrs =
    Array.isArray(item.attributes) &&
    item.attributes.some((a: any) => String(a?.key ?? '').trim() !== '' || String(a?.value ?? '').trim() !== '');
  const hasSubComponents = Array.isArray(item.sub_components) && item.sub_components.length > 0;

  return hasRealName || hasPrice || hasLeadTime || hasDesc || hasAttrs || hasSubComponents;
}

let latestKnownCatalogProducts: Product[] = [];

function getFallbackCatalogProducts(explicitProducts?: Product[]): Product[] {
  if (Array.isArray(explicitProducts) && explicitProducts.length > 0) {
    latestKnownCatalogProducts = explicitProducts;
    return explicitProducts;
  }
  if (latestKnownCatalogProducts.length > 0) {
    return latestKnownCatalogProducts;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('omni_products');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          latestKnownCatalogProducts = parsed;
          return parsed;
        }
      }
    }
  } catch (_) {}
  return [];
}

/**
 * Merges parent base attributes with variant override/specific attributes:
 * 1. All shared base attributes from the parent (e.g., MOC: FRP, Design Code: ASME) are inherited first in order.
 * 2. Any matching attribute key in variantAttributes overrides the parent's value.
 * 3. Any additional variant-specific attributes (e.g., Dimensions: 48" x 72") are appended.
 */
export function mergeParentAndVariantAttributes(
  parentAttributes?: ProductAttribute[] | null,
  variantAttributes?: ProductAttribute[] | null
): ProductAttribute[] {
  const pAttrs = Array.isArray(parentAttributes)
    ? parentAttributes.filter((a) => a && String(a.key ?? '').trim() !== '')
    : [];
  const vAttrs = Array.isArray(variantAttributes)
    ? variantAttributes.filter((a) => a && String(a.key ?? '').trim() !== '')
    : [];

  if (pAttrs.length === 0) {
    return vAttrs.map((a) => ({ key: String(a.key).trim(), value: String(a.value ?? '').trim() }));
  }
  if (vAttrs.length === 0) {
    return pAttrs.map((a) => ({ key: String(a.key).trim(), value: String(a.value ?? '').trim() }));
  }

  const merged: ProductAttribute[] = pAttrs.map((pa) => ({
    key: String(pa.key).trim(),
    value: String(pa.value ?? '').trim()
  }));

  const keyIndexMap = new Map<string, number>();
  merged.forEach((attr, idx) => {
    keyIndexMap.set(attr.key.toLowerCase(), idx);
  });

  for (const va of vAttrs) {
    const cleanKey = String(va.key).trim();
    const cleanVal = String(va.value ?? '').trim();
    const lowerKey = cleanKey.toLowerCase();
    const existingIdx = keyIndexMap.get(lowerKey);
    if (existingIdx !== undefined) {
      if (cleanVal !== '' || merged[existingIdx].value === '') {
        merged[existingIdx] = {
          key: merged[existingIdx].key,
          value: cleanVal
        };
      }
    } else {
      keyIndexMap.set(lowerKey, merged.length);
      merged.push({ key: cleanKey, value: cleanVal });
    }
  }

  return merged;
}

/**
 * Resolves a Catalog Product with full Parent-to-Variant attribute and media inheritance.
 * When `product.parent_product_id` or `product.variant_parent_id` is set and the parent exists in `allProducts`:
 * - Merges `parent.attributes` (base defaults) + `product.attributes` (variant overrides & additions).
 * - Falls back to parent's `image_url`, `secondary_image_url`, `datasheet_url`, `datasheet_attachment`,
 *   `brand_make`, `country_of_origin`, `product_type`, and `product_family` when unset on the variant.
 */
export function resolveEffectiveCatalogProduct(
  product: Product,
  allProducts?: Product[]
): Product {
  if (!product) return product;
  const catalogList = getFallbackCatalogProducts(allProducts);
  const parentId = (product as any).parent_product_id || product.variant_parent_id || null;
  if (!parentId || catalogList.length === 0) {
    return product;
  }

  const parent = catalogList.find(
    (p) => p && !p.is_deleted && p.id === parentId && p.id !== product.id
  );
  if (!parent) {
    return product;
  }

  const mergedAttributes = mergeParentAndVariantAttributes(parent.attributes, product.attributes);

  const resolved: Product = {
    ...product,
    variant_parent_id: parent.id,
    product_type:
      product.product_type && product.product_type !== 'Other' && product.product_type !== 'Custom'
        ? product.product_type
        : parent.product_type || product.product_type,
    product_family: product.product_family || parent.product_family || parent.name || null,
    brand_make: product.brand_make?.trim() ? product.brand_make : parent.brand_make,
    country_of_origin: product.country_of_origin?.trim()
      ? product.country_of_origin
      : parent.country_of_origin,
    hs_code: product.hs_code?.trim() ? product.hs_code : parent.hs_code,
    default_availability: product.default_availability?.trim()
      ? product.default_availability
      : parent.default_availability,
    image_url: product.image_url?.trim() ? product.image_url : parent.image_url,
    secondary_image_url: product.secondary_image_url?.trim()
      ? product.secondary_image_url
      : parent.secondary_image_url,
    image_caption: product.image_caption?.trim() ? product.image_caption : parent.image_caption,
    secondary_image_caption: product.secondary_image_caption?.trim()
      ? product.secondary_image_caption
      : parent.secondary_image_caption,
    image_adjustments: product.image_adjustments || parent.image_adjustments,
    datasheet_url: product.datasheet_url?.trim() ? product.datasheet_url : parent.datasheet_url,
    datasheet_attachment: product.datasheet_attachment?.url
      ? product.datasheet_attachment
      : parent.datasheet_attachment || product.datasheet_attachment,
    attributes: mergedAttributes
  };
  (resolved as any).parent_product_id = parent.id;
  if ((product as any).variant_label) {
    (resolved as any).variant_label = (product as any).variant_label;
  }
  return resolved;
}

/**
 * Rehydrates catalog-linked line items (`item.product_id`) in memory using `catalogProducts`,
 * automatically resolving parent-to-variant attribute & media inheritance via `resolveEffectiveCatalogProduct`.
 */
export function rehydrateLineItemsFromCatalog(
  lineItems: any[] | undefined,
  catalogProducts?: Product[]
): any[] {
  if (!Array.isArray(lineItems)) return [];
  const list = getFallbackCatalogProducts(catalogProducts);
  if (!Array.isArray(list) || list.length === 0) {
    return lineItems;
  }
  const productMap = new Map<string, Product>();
  for (const p of list) {
    if (p?.id) productMap.set(p.id, p);
  }
  return lineItems.map((li) => {
    if (!li || typeof li !== 'object') return li;

    const hydratedSubComponents = Array.isArray(li.sub_components)
      ? li.sub_components.map((sub: any) => {
          if (!sub || !sub.product_id) return sub;
          const rawSubProd = productMap.get(sub.product_id);
          if (!rawSubProd) return sub;
          const effSubProd = resolveEffectiveCatalogProduct(rawSubProd, list);
          return {
            ...sub,
            image_url:
              sub.image_url ||
              (sub.image_storage_key ? '' : effSubProd.image_url),
            brand_make: sub.brand_make || effSubProd.brand_make,
            model_part_no: sub.model_part_no || effSubProd.model_part_no,
            country_of_origin: sub.country_of_origin || effSubProd.country_of_origin,
            attributes:
              Array.isArray(sub.attributes) && sub.attributes.length > 0
                ? mergeParentAndVariantAttributes(effSubProd.attributes, sub.attributes)
                : effSubProd.attributes
          };
        })
      : li.sub_components;

    if (!li.product_id) {
      return hydratedSubComponents !== li.sub_components
        ? { ...li, sub_components: hydratedSubComponents }
        : li;
    }
    const rawCatProd = productMap.get(li.product_id);
    if (!rawCatProd) {
      return hydratedSubComponents !== li.sub_components
        ? { ...li, sub_components: hydratedSubComponents }
        : li;
    }
    const catProd = resolveEffectiveCatalogProduct(rawCatProd, list);
    const parentId = (rawCatProd as any).parent_product_id || rawCatProd.variant_parent_id;
    const parentProd = parentId ? productMap.get(parentId) : undefined;
    const resolvedAttrs =
      Array.isArray(li.attributes) && li.attributes.length > 0
        ? parentProd
          ? mergeParentAndVariantAttributes(parentProd.attributes, li.attributes)
          : li.attributes
        : catProd.attributes
        ? [...catProd.attributes]
        : li.attributes;

    return {
      ...li,
      brand_make: li.brand_make || catProd.brand_make,
      country_of_origin: li.country_of_origin || catProd.country_of_origin,
      image_url:
        li.image_url ||
        (li.image_storage_key ||
        li.image_display_override === 'none' ||
        li.image_display_override === 'hidden'
          ? ''
          : catProd.image_url),
      secondary_image_url:
        li.secondary_image_url ||
        (li.secondary_image_storage_key ? '' : catProd.secondary_image_url),
      datasheet_attachment: li.datasheet_attachment?.url || li.datasheet_attachment?.storageKey
        ? li.datasheet_attachment
        : catProd.datasheet_attachment || li.datasheet_attachment,
      attributes: resolvedAttrs,
      ...(hydratedSubComponents !== undefined ? { sub_components: hydratedSubComponents } : {})
    };
  });
}

/**
 * Non-destructively links an existing line item to a Catalog Product:
 * - Resolves `catalogProduct` through `resolveEffectiveCatalogProduct` first so variants inherit parent attributes & media.
 * - If the line item is already populated (has name, price > 0, lead time, description, or attributes),
 *   ALL existing non-empty values on the line item are preserved intact! Only missing/blank fields
 *   (like image_url, brand_make, category, sku, and missing parent base attributes) are backfilled.
 * - If the line item is a brand-new blank row, it populates all default fields from the resolved catalog product.
 */
export function linkLineItemToCatalogProductNonDestructive(
  existingItem: any,
  rawCatalogProduct: Product,
  currency?: string,
  isVendorCostDoc?: boolean,
  allProducts?: Product[]
): any {
  const catalogProduct = resolveEffectiveCatalogProduct(rawCatalogProduct, allProducts);
  const effectiveCurrency = String(currency || existingItem?.currency || 'AED').toUpperCase();
  const prodCurrency = String(catalogProduct?.currency || 'AED').toUpperCase();
  const fxFromProdToItem =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(prodCurrency) / resolveToAedMultiplier(effectiveCurrency);

  const catalogUnitSell = Math.round(Number(catalogProduct.unit_price ?? (catalogProduct as any).selling_price ?? 0) * fxFromProdToItem * 100) / 100;
  const catalogUnitCost = Math.round(Number(catalogProduct.cost_price ?? (catalogProduct as any).cost_price_aed ?? catalogProduct.last_landed_cost ?? 0) * fxFromProdToItem * 100) / 100;
  const qty = Number(existingItem?.quantity) || 1;
  const populated = isLineItemPopulated(existingItem);

  const scaledCatalogSubs = Array.isArray(catalogProduct.sub_components) && catalogProduct.sub_components.length > 0
    ? catalogProduct.sub_components.map((sc, idx) => {
        const scSell = sc.is_included_accessory ? 0 : Math.round(Number(sc.unit_price || 0) * fxFromProdToItem * 100) / 100;
        const scCost = sc.is_included_accessory ? 0 : Math.round(Number(sc.cost_price || 0) * fxFromProdToItem * 100) / 100;
        const scQty = Number(sc.quantity) || 1;
        return {
          ...sc,
          id: sc.id || `sub_${Date.now()}_${idx}`,
          unit_price: scSell,
          cost_price: scCost,
          total_price: sc.is_included_accessory ? 0 : Math.round(scSell * scQty * 100) / 100,
          line_total: sc.is_included_accessory ? 0 : Math.round(scSell * scQty * 100) / 100
        };
      })
    : undefined;

  if (populated) {
    const existingName = String(existingItem.item_name ?? '').trim();
    const keepName =
      existingName !== '' &&
      existingName.toLowerCase() !== 'custom line item' &&
      existingName.toLowerCase() !== 'custom item';
    const existingPrice = Number(existingItem.unit_price) || 0;
    const existingCost = Number(existingItem.cost_price) || 0;
    const defaultCatRate = isVendorCostDoc ? (catalogUnitCost || catalogUnitSell) : catalogUnitSell;
    const resolvedUnitPrice = existingPrice > 0 ? existingPrice : defaultCatRate;
    const resolvedCostPrice = existingCost > 0 ? existingCost : catalogUnitCost;

    const hasExistingAttrs =
      Array.isArray(existingItem.attributes) &&
      existingItem.attributes.some((a: any) => String(a?.key ?? '').trim() !== '' || String(a?.value ?? '').trim() !== '');
    const hasExistingSubs =
      Array.isArray(existingItem.sub_components) && existingItem.sub_components.length > 0;
    const existingLead = String(existingItem.lead_time_note ?? existingItem.availability ?? '').trim();
    const keepLead = existingLead !== '' && !existingLead.startsWith('SKU:');
    const existingDesc = String(existingItem.description ?? '').trim();
    const keepDesc = existingDesc !== '' && existingDesc.toLowerCase() !== 'custom line item';

    const updatedItem = {
      ...existingItem,
      product_id: catalogProduct.id || undefined,
      sku: catalogProduct.sku || existingItem.sku,
      product_sku: catalogProduct.sku || existingItem.product_sku,
      item_name: keepName ? existingItem.item_name : (catalogProduct.name || existingItem.item_name),
      product_type:
        existingItem.product_type && existingItem.product_type !== 'Custom' && existingItem.product_type !== 'Other'
          ? existingItem.product_type
          : (catalogProduct.product_type || existingItem.product_type),
      description: keepDesc ? existingItem.description : (catalogProduct.description || existingItem.description),
      unit: existingItem.unit && existingItem.unit !== 'Custom Unit' ? existingItem.unit : (catalogProduct.unit || 'Nos'),
      unit_price: resolvedUnitPrice,
      cost_price: resolvedCostPrice,
      total_price: Math.round(qty * resolvedUnitPrice * 100) / 100,
      brand_make: existingItem.brand_make?.trim() ? existingItem.brand_make : (catalogProduct.brand_make || existingItem.brand_make),
      model_part_no: existingItem.model_part_no?.trim() ? existingItem.model_part_no : (catalogProduct.model_part_no || existingItem.model_part_no),
      country_of_origin: existingItem.country_of_origin?.trim() ? existingItem.country_of_origin : (catalogProduct.country_of_origin || existingItem.country_of_origin),
      hs_code: existingItem.hs_code?.trim() ? existingItem.hs_code : (catalogProduct.hs_code || existingItem.hs_code),
      image_url: existingItem.image_url?.trim() ? existingItem.image_url : (catalogProduct.image_url || existingItem.image_url),
      secondary_image_url: existingItem.secondary_image_url?.trim() ? existingItem.secondary_image_url : (catalogProduct.secondary_image_url || existingItem.secondary_image_url),
      image_caption: existingItem.image_caption?.trim() ? existingItem.image_caption : (catalogProduct.image_caption || existingItem.image_caption),
      secondary_image_caption: existingItem.secondary_image_caption?.trim() ? existingItem.secondary_image_caption : (catalogProduct.secondary_image_caption || existingItem.secondary_image_caption),
      image_adjustments: existingItem.image_adjustments || catalogProduct.image_adjustments,
      datasheet_attachment: existingItem.datasheet_attachment || catalogProduct.datasheet_attachment,
      include_datasheet_in_quote:
        existingItem.datasheet_attachment || catalogProduct.datasheet_attachment
          ? existingItem.include_datasheet_in_quote !== false
          : undefined,
      lead_time_note: keepLead ? existingItem.lead_time_note : (catalogProduct.default_availability || existingItem.lead_time_note || ''),
      availability: keepLead ? (existingItem.availability || existingItem.lead_time_note) : (catalogProduct.default_availability || existingItem.availability || ''),
      attributes: hasExistingAttrs
        ? mergeParentAndVariantAttributes(catalogProduct.attributes, existingItem.attributes)
        : catalogProduct.attributes
        ? [...catalogProduct.attributes]
        : [],
      ...(hasExistingSubs
        ? {}
        : scaledCatalogSubs
        ? {
            is_composite_set: Boolean(catalogProduct.is_composite_set),
            sub_components: scaledCatalogSubs,
            package_pricing_mode: catalogProduct.package_pricing_mode || existingItem.package_pricing_mode,
            option_scope_notes: existingItem.option_scope_notes || catalogProduct.option_scope_notes
          }
        : {})
    };

    return updatedItem;
  }

  // Blank row: populate all defaults from catalogProduct
  const defaultRate = isVendorCostDoc ? (catalogUnitCost || catalogUnitSell) : catalogUnitSell;
  const updatedItem = {
    ...existingItem,
    product_id: catalogProduct.id || undefined,
    sku: catalogProduct.sku || undefined,
    product_sku: catalogProduct.sku || undefined,
    item_name: catalogProduct.name || catalogProduct.product_type || existingItem?.item_name || '',
    product_type: catalogProduct.product_type || existingItem?.product_type || 'General Equipment',
    description:
      compileDescriptionWithSpecs(
        catalogProduct.name || '',
        catalogProduct.description || '',
        catalogProduct.attributes || []
      ) ||
      catalogProduct.description ||
      catalogProduct.name ||
      '',
    unit: catalogProduct.unit || (catalogProduct.is_composite_set ? 'SET' : 'Nos'),
    unit_price: defaultRate,
    cost_price: catalogUnitCost,
    total_price: Math.round(qty * defaultRate * 100) / 100,
    brand_make: catalogProduct.brand_make || undefined,
    model_part_no: catalogProduct.model_part_no || undefined,
    country_of_origin: catalogProduct.country_of_origin || undefined,
    hs_code: catalogProduct.hs_code || undefined,
    image_url: catalogProduct.image_url || undefined,
    secondary_image_url: catalogProduct.secondary_image_url || undefined,
    image_caption: catalogProduct.image_caption || undefined,
    secondary_image_caption: catalogProduct.secondary_image_caption || undefined,
    image_adjustments: catalogProduct.image_adjustments || undefined,
    datasheet_attachment: catalogProduct.datasheet_attachment || undefined,
    include_datasheet_in_quote: catalogProduct.datasheet_attachment ? true : undefined,
    lead_time_note: catalogProduct.default_availability || '',
    availability: catalogProduct.default_availability || '',
    attributes: catalogProduct.attributes ? [...catalogProduct.attributes] : [],
    ...(catalogProduct.is_composite_set ? { is_composite_set: true } : {}),
    ...(scaledCatalogSubs ? { sub_components: scaledCatalogSubs } : {}),
    ...(catalogProduct.package_pricing_mode ? { package_pricing_mode: catalogProduct.package_pricing_mode } : {}),
    ...(catalogProduct.option_scope_notes ? { option_scope_notes: catalogProduct.option_scope_notes } : {})
  };

  return updatedItem;
}

/**
 * Explicitly pulls defaults from a Catalog Product (or a specific Spec Variant)
 * into a line item, resetting its price, delivery, description, and attributes.
 */
export function pullCatalogDefaultsToLineItem(
  existingItem: any,
  rawCatalogProduct: Product,
  currency?: string,
  specVariant?: ProductSpecVariant | Product | null,
  isVendorCostDoc?: boolean,
  allProducts?: Product[],
  options?: { isVariantSwitch?: boolean }
): any {
  const catalogProduct = resolveEffectiveCatalogProduct(rawCatalogProduct, allProducts);
  const resolvedVariantProduct =
    specVariant && (specVariant as Product).product_type
      ? resolveEffectiveCatalogProduct(specVariant as Product, allProducts)
      : null;

  const effectiveCurrency = String(currency || existingItem?.currency || 'AED').toUpperCase();
  const prodCurrency = String(catalogProduct?.currency || 'AED').toUpperCase();
  const fxFromProdToItem =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(prodCurrency) / resolveToAedMultiplier(effectiveCurrency);

  const sourceSell = specVariant?.unit_price !== undefined ? Number(specVariant.unit_price) : Number(catalogProduct.unit_price ?? 0);
  const sourceCost = specVariant?.cost_price !== undefined ? Number(specVariant.cost_price) : Number(catalogProduct.cost_price ?? 0);
  const scaledSell = Math.round(sourceSell * fxFromProdToItem * 100) / 100;
  const scaledCost = Math.round(sourceCost * fxFromProdToItem * 100) / 100;
  const qty = Number(existingItem?.quantity) || 1;
  const resolvedRate = isVendorCostDoc ? (scaledCost || scaledSell) : scaledSell;

  const sourceAttrs = resolvedVariantProduct
    ? resolvedVariantProduct.attributes || []
    : specVariant && Array.isArray(specVariant.attributes) && specVariant.attributes.length > 0
    ? mergeParentAndVariantAttributes(catalogProduct.attributes, specVariant.attributes)
    : catalogProduct.attributes || [];

  const sourceSubs =
    specVariant && Array.isArray(specVariant.sub_components) && specVariant.sub_components.length > 0
      ? specVariant.sub_components
      : catalogProduct.sub_components;

  const scaledSubs =
    Array.isArray(sourceSubs) && sourceSubs.length > 0
      ? sourceSubs.map((sc, idx) => {
          const scSell = sc.is_included_accessory ? 0 : Math.round(Number(sc.unit_price || 0) * fxFromProdToItem * 100) / 100;
          const scCost = sc.is_included_accessory ? 0 : Math.round(Number(sc.cost_price || 0) * fxFromProdToItem * 100) / 100;
          const scQty = Number(sc.quantity) || 1;
          return {
            ...sc,
            id: sc.id || `sub_${Date.now()}_${idx}`,
            unit_price: scSell,
            cost_price: scCost,
            total_price: sc.is_included_accessory ? 0 : Math.round(scSell * scQty * 100) / 100,
            line_total: sc.is_included_accessory ? 0 : Math.round(scSell * scQty * 100) / 100
          };
        })
      : undefined;

  const switchCleanedFields = buildVariantSwitchLineItemFields({
    existingItem,
    catalogProduct,
    resolvedVariantProduct,
    specVariant,
    scaledSubs,
    isVariantSwitch: options?.isVariantSwitch
  });

  const sourceName =
    (specVariant as Product)?.name ||
    catalogProduct.name ||
    existingItem?.item_name ||
    '';

  const sourceDesc =
    specVariant?.description ||
    compileDescriptionWithSpecs(sourceName, catalogProduct.description || '', sourceAttrs) ||
    catalogProduct.description ||
    '';

  const specsRecord: Record<string, string> = {};
  for (const attr of sourceAttrs) {
    if (attr?.key && attr?.value) {
      specsRecord[attr.key.trim()] = attr.value.trim();
    }
  }
  if (switchCleanedFields.targetLeadForSpecs) {
    specsRecord['Delivery'] = switchCleanedFields.targetLeadForSpecs;
  }

  return {
    ...existingItem,
    product_id: (specVariant as Product)?.product_type ? (specVariant as Product).id : catalogProduct.id,
    sku: specVariant?.sku || catalogProduct.sku || existingItem?.sku,
    product_sku: specVariant?.sku || catalogProduct.sku || existingItem?.product_sku,
    variant_id: (specVariant as ProductSpecVariant)?.variant_name ? specVariant?.id : undefined,
    variant_name: (specVariant as ProductSpecVariant)?.variant_name || undefined,
    item_name: sourceName,
    description: sourceDesc,
    unit: specVariant?.unit || catalogProduct.unit || existingItem?.unit || 'Nos',
    unit_price: resolvedRate,
    cost_price: scaledCost,
    total_price: Math.round(qty * resolvedRate * 100) / 100,
    brand_make: (specVariant as Product)?.brand_make || catalogProduct.brand_make || existingItem?.brand_make,
    model_part_no: specVariant?.model_part_no || catalogProduct.model_part_no || existingItem?.model_part_no,
    country_of_origin: (specVariant as Product)?.country_of_origin || catalogProduct.country_of_origin || existingItem?.country_of_origin,
    hs_code: (specVariant as Product)?.hs_code || catalogProduct.hs_code || existingItem?.hs_code,
    lead_time_note: switchCleanedFields.lead_time_note,
    availability: switchCleanedFields.availability,
    image_url: switchCleanedFields.image_url,
    secondary_image_url: switchCleanedFields.secondary_image_url,
    image_storage_key: switchCleanedFields.image_storage_key,
    secondary_image_storage_key: switchCleanedFields.secondary_image_storage_key,
    image_caption: switchCleanedFields.image_caption,
    secondary_image_caption: switchCleanedFields.secondary_image_caption,
    image_adjustments: switchCleanedFields.image_adjustments,
    image_display_override: switchCleanedFields.image_display_override,
    datasheet_attachment: switchCleanedFields.datasheet_attachment,
    attributes: sourceAttrs.map((a) => ({ ...a })),
    specifications: Object.keys(specsRecord).length > 0 ? specsRecord : existingItem?.specifications,
    is_composite_set: switchCleanedFields.is_composite_set,
    sub_components: switchCleanedFields.sub_components,
    package_pricing_mode: switchCleanedFields.package_pricing_mode,
    ...(switchCleanedFields.option_scope_notes !== undefined
      ? { option_scope_notes: switchCleanedFields.option_scope_notes }
      : {})
  };
}

/**
 * Generates a concise suggested Spec Variant label from a line item's differentiating attributes or title.
 */
export function deriveSuggestedVariantLabel(item: any, parentProduct?: Product | null): string {
  if (!item) return 'Custom Spec Variant';
  const itemAttrs: ProductAttribute[] = Array.isArray(item.attributes)
    ? item.attributes.filter((a: any) => a && a.key && a.value)
    : [];
  const parentAttrs: ProductAttribute[] = Array.isArray(parentProduct?.attributes)
    ? parentProduct!.attributes!.filter((a) => a && a.key && a.value)
    : [];

  // 1. Check attributes that differ from parentProduct
  if (itemAttrs.length > 0 && parentAttrs.length > 0) {
    const diffValues: string[] = [];
    for (const ia of itemAttrs) {
      const kLower = ia.key.trim().toLowerCase();
      if (kLower === 'delivery' || kLower === 'lead time' || kLower === 'brand' || kLower === 'origin') continue;
      const pMatch = parentAttrs.find((pa) => pa.key.trim().toLowerCase() === kLower);
      if (!pMatch || pMatch.value.trim().toLowerCase() !== ia.value.trim().toLowerCase()) {
        diffValues.push(`${ia.key.trim()}: ${ia.value.trim()}`);
      }
    }
    if (diffValues.length > 0) {
      return diffValues.slice(0, 2).join(' • ');
    }
  }

  // 2. Check key dimension / size / pressure / capacity / model attributes
  const priorityAttr = itemAttrs.find((a) =>
    /size|dimension|dia|height|capacity|flow|pressure|rating|model|material|packing/i.test(a.key || '')
  );
  if (priorityAttr && priorityAttr.value?.trim()) {
    return `${priorityAttr.key.trim()}: ${priorityAttr.value.trim()}`;
  }

  if (item.model_part_no && String(item.model_part_no).trim() !== (parentProduct?.model_part_no || '').trim()) {
    return String(item.model_part_no).trim();
  }

  const itemTitle = String(item.item_name || item.title || '').trim();
  const parentTitle = String(parentProduct?.name || '').trim();
  if (itemTitle && itemTitle.toLowerCase() !== parentTitle.toLowerCase()) {
    return itemTitle.slice(0, 55);
  }

  if (itemAttrs.length > 0) {
    return itemAttrs
      .slice(0, 2)
      .map((a) => `${a.key.trim()}: ${a.value.trim()}`)
      .join(' • ');
  }

  return `${parentProduct?.sku || 'SKU'} Spec Variant`;
}

/**
 * Non-destructively saves a line item as a new Spec Variant under an existing Catalog Product:
 * 1. Appends a ProductSpecVariant entry to `parentProduct.spec_variants` & `parentProduct.variants`.
 * 2. Creates a linked sibling Variant Product record (`variant_parent_id`) so ProductManager & Catalog pickers display it.
 */
export async function saveLineItemAsSpecVariant(params: {
  item: any;
  parentProduct: Product;
  variantName: string;
  variantSku?: string;
  products?: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>> | any;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  currency?: string;
  activeWorkspaceId?: string;
}): Promise<{
  updatedParentProduct: Product;
  createdVariantProduct: Product;
  newVariantEntry: ProductSpecVariant;
} | null> {
  const {
    item,
    parentProduct: rawParentProduct,
    variantName,
    variantSku,
    products = [],
    setProducts,
    triggerToast,
    currency,
    activeWorkspaceId
  } = params;

  if (!rawParentProduct?.id) return null;

  // If the passed product is ALREADY a child variant, resolve its root Parent Family product so we don't nest grandchildren
  const candidateRootId =
    (rawParentProduct as any).parent_product_id || rawParentProduct.variant_parent_id || null;
  const catalogPool =
    Array.isArray(products) && products.length > 0 ? products : latestKnownCatalogProducts;
  const parentProduct: Product =
    (candidateRootId
      ? catalogPool.find((p) => p && !p.is_deleted && p.id === candidateRootId)
      : null) || rawParentProduct;

  const effectiveCurrency = String(currency || item?.currency || parentProduct?.currency || 'AED').toUpperCase();
  const fxMultiplier = resolveToAedMultiplier(effectiveCurrency);
  const parentFxToAed = resolveToAedMultiplier(String(parentProduct?.currency || 'AED').toUpperCase());

  const parsed = parseLineItemTitleAndSpec(item.item_name || item.title, item.description);
  const rawAttrsSource: ProductAttribute[] = Array.isArray(item.attributes)
    ? item.attributes
        .map((a: any) => ({ key: String(a.key ?? '').trim(), value: String(a.value ?? '').trim() }))
        .filter((a: ProductAttribute) => a.key !== '' && a.value !== '')
    : parentProduct.attributes || [];
  const extractedAttrs = extractAttributesFromDescription(
    parsed.spec || item.description,
    rawAttrsSource
  ).filter((a) => a.key !== '' && a.value !== '');

  // Ensure the variant label itself is captured in attributes if not already present
  const cleanVariantLabel = (variantName || '').trim() || deriveSuggestedVariantLabel(item, parentProduct);
  const finalAttrs = [...extractedAttrs];
  const colonSplit = cleanVariantLabel.match(/^([^:]{2,30}):\s*(.+)$/);
  if (colonSplit) {
    const k = colonSplit[1].trim();
    const v = colonSplit[2].trim();
    const existingIdx = finalAttrs.findIndex((a) => a.key.toLowerCase() === k.toLowerCase());
    if (existingIdx >= 0) {
      finalAttrs[existingIdx] = { key: finalAttrs[existingIdx].key, value: v };
    } else {
      finalAttrs.unshift({ key: k, value: v });
    }
  } else if (!finalAttrs.some((a) => a.value.toLowerCase() === cleanVariantLabel.toLowerCase())) {
    finalAttrs.unshift({ key: 'Variant / Spec', value: cleanVariantLabel });
  }

  const scaledSell =
    item.unit_price !== undefined && item.unit_price !== null && !isNaN(Number(item.unit_price))
      ? Math.round(Number(item.unit_price) * fxMultiplier * 100) / 100
      : parentProduct.unit_price !== undefined && parentProduct.unit_price !== null
      ? Math.round(Number(parentProduct.unit_price) * parentFxToAed * 100) / 100
      : parentProduct.unit_price;
  const scaledCost =
    item.cost_price !== undefined && item.cost_price !== null && !isNaN(Number(item.cost_price)) && Number(item.cost_price) > 0
      ? Math.round(Number(item.cost_price) * fxMultiplier * 100) / 100
      : parentProduct.cost_price !== undefined && parentProduct.cost_price !== null
      ? Math.round(Number(parentProduct.cost_price) * parentFxToAed * 100) / 100
      : parentProduct.cost_price;
  const cleanUnit = (item.unit || (item as any).uom || parentProduct.unit || 'Nos').trim();
  const cleanLead = (item.lead_time_note ?? item.availability ?? parentProduct.default_availability ?? '').trim() || undefined;
  const cleanModel = (item.model_part_no ?? parentProduct.model_part_no ?? '').trim() || undefined;
  const compiledDesc =
    compileDescriptionWithSpecs(
      parentProduct.name || parsed.title,
      item.description || parentProduct.description || '',
      finalAttrs
    ) ||
    item.description ||
    parentProduct.description ||
    '';

  const scaledSubComponents = Array.isArray(item.sub_components) && item.sub_components.length > 0
    ? item.sub_components.map((sub: any) => {
        const subSell = sub.is_included_accessory ? 0 : Math.round(Number(sub.unit_price || 0) * fxMultiplier * 100) / 100;
        const subCost = sub.is_included_accessory ? 0 : Math.round(Number(sub.cost_price || 0) * fxMultiplier * 100) / 100;
        const subQty = Number(sub.quantity) || 0;
        const subTotal = sub.is_included_accessory ? 0 : Math.round(subSell * subQty * 100) / 100;
        return {
          ...sub,
          unit_price: subSell,
          cost_price: subCost,
          total_price: subTotal,
          line_total: subTotal
        };
      })
    : undefined;

  const existingVariants: ProductSpecVariant[] = Array.isArray(parentProduct.spec_variants)
    ? parentProduct.spec_variants
    : Array.isArray(parentProduct.variants)
    ? parentProduct.variants
    : [];

  const rootParentId = (parentProduct as any).parent_product_id || parentProduct.variant_parent_id || parentProduct.id;
  const cleanLabelLower = cleanVariantLabel.trim().toLowerCase();
  const explicitSkuLower = (variantSku || '').trim().toLowerCase();

  // Check if a sibling child variant Product under rootParentId already has the same SKU or variant_label
  const existingChildVariantProduct = catalogPool.find((p) => {
    if (!p || p.is_deleted || p.id === rootParentId) return false;
    const pParentId = (p as any).parent_product_id || p.variant_parent_id;
    if (pParentId !== rootParentId) return false;
    const pSkuLower = String(p.sku || '').trim().toLowerCase();
    const pLabelLower = String((p as any).variant_label || '').trim().toLowerCase();
    if (explicitSkuLower && pSkuLower === explicitSkuLower) return true;
    if (cleanLabelLower && pLabelLower === cleanLabelLower) return true;
    return false;
  });

  const existingSpecVarIdx = existingVariants.findIndex((sv) => {
    const svSkuLower = String(sv?.sku || '').trim().toLowerCase();
    const svNameLower = String(sv?.variant_name || '').trim().toLowerCase();
    if (explicitSkuLower && svSkuLower === explicitSkuLower) return true;
    if (cleanLabelLower && svNameLower === cleanLabelLower) return true;
    if (existingChildVariantProduct?.sku && svSkuLower === String(existingChildVariantProduct.sku).trim().toLowerCase()) {
      return true;
    }
    return false;
  });

  const baseSku = (parentProduct.sku || 'SKU').replace(/-V\d+$/i, '').trim();
  const resolvedVariantSku =
    (variantSku || '').trim() ||
    existingChildVariantProduct?.sku ||
    (existingSpecVarIdx >= 0 ? existingVariants[existingSpecVarIdx].sku : '') ||
    `${baseSku}-V${existingVariants.length + 1}`;

  const specsMap: Record<string, string> = {};
  for (const a of finalAttrs) {
    if (a.key && a.value) specsMap[a.key] = a.value;
  }

  const newVariantEntry: ProductSpecVariant = {
    id:
      existingSpecVarIdx >= 0 && existingVariants[existingSpecVarIdx]?.id
        ? existingVariants[existingSpecVarIdx].id
        : `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    variant_name: cleanVariantLabel,
    sku: resolvedVariantSku,
    unit_price: scaledSell,
    cost_price: scaledCost,
    unit: cleanUnit,
    model_part_no: cleanModel,
    lead_time_note: cleanLead,
    description: compiledDesc,
    attributes: finalAttrs,
    specifications: specsMap,
    ...(scaledSubComponents ? { sub_components: scaledSubComponents, is_composite_set: true } : {}),
    ...(item.package_pricing_mode ? { package_pricing_mode: item.package_pricing_mode } : {}),
    ...(item.option_scope_notes ? { option_scope_notes: item.option_scope_notes } : {}),
    ...(item.image_url ? { image_url: item.image_url } : {}),
    createdAt:
      existingSpecVarIdx >= 0 && existingVariants[existingSpecVarIdx]?.createdAt
        ? existingVariants[existingSpecVarIdx].createdAt
        : new Date().toISOString()
  };

  const nextSpecVariants =
    existingSpecVarIdx >= 0
      ? existingVariants.map((sv, idx) => (idx === existingSpecVarIdx ? newVariantEntry : sv))
      : [...existingVariants, newVariantEntry];

  // 1. Update parent product's spec_variants array & has_variants flag
  const familyName = (parentProduct.product_family || parentProduct.name || '').trim();
  const parentPatch: Partial<Product> & Record<string, any> = {
    spec_variants: nextSpecVariants,
    variants: nextSpecVariants,
    has_variants: true,
    product_family: familyName || parentProduct.name,
    updatedAt: new Date().toISOString()
  };
  await safeUpdateDoc('products', parentProduct.id, parentPatch);
  const updatedParentProduct: Product = {
    ...parentProduct,
    ...parentPatch
  };

  // 2. Create or update the sibling Variant Product record in 'products' so ProductManager & Catalog pickers surface it
  const variantProductName = (item.item_name || parentProduct.name || familyName).trim();
  const searchTerms = generateProductSearchTerms(
    variantProductName,
    parentProduct.product_type || 'General Equipment',
    resolvedVariantSku,
    cleanVariantLabel
  );

  const mergedVariantAndParentAttrs = mergeParentAndVariantAttributes(parentProduct.attributes, finalAttrs);

  const nowIso = new Date().toISOString();
  const variantProductPayload: Partial<Product> & Record<string, any> = {
    workspace_id: parentProduct.workspace_id || activeWorkspaceId || 'ws_default',
    name: variantProductName,
    description: compiledDesc || variantProductName,
    product_type: parentProduct.product_type || 'General Equipment',
    sku: resolvedVariantSku,
    brand_make: item.brand_make || parentProduct.brand_make || undefined,
    model_part_no: cleanModel,
    unit: cleanUnit,
    unit_price: scaledSell,
    cost_price: scaledCost,
    currency: 'AED',
    default_availability: cleanLead,
    country_of_origin: item.country_of_origin || item.origin || parentProduct.country_of_origin || undefined,
    hs_code: item.hs_code || parentProduct.hs_code || undefined,
    image_url: item.image_url || parentProduct.image_url || undefined,
    secondary_image_url: item.secondary_image_url || parentProduct.secondary_image_url || undefined,
    image_caption: item.image_caption || parentProduct.image_caption || undefined,
    secondary_image_caption: item.secondary_image_caption || parentProduct.secondary_image_caption || undefined,
    image_adjustments: item.image_adjustments || parentProduct.image_adjustments || undefined,
    datasheet_attachment: item.datasheet_attachment || parentProduct.datasheet_attachment || undefined,
    attributes: mergedVariantAndParentAttrs,
    variant_parent_id: rootParentId,
    parent_product_id: rootParentId,
    variant_label: cleanVariantLabel,
    product_family: familyName || variantProductName,
    ...(scaledSubComponents ? { is_composite_set: true, sub_components: scaledSubComponents } : {}),
    ...(item.package_pricing_mode ? { package_pricing_mode: item.package_pricing_mode } : {}),
    ...(item.option_scope_notes ? { option_scope_notes: item.option_scope_notes } : {}),
    search_terms: searchTerms,
    is_inventoried: existingChildVariantProduct?.is_inventoried ?? false,
    stock_on_hand: existingChildVariantProduct?.stock_on_hand ?? 0,
    stock_reserved: existingChildVariantProduct?.stock_reserved ?? 0,
    createdAt: existingChildVariantProduct?.createdAt || nowIso,
    updatedAt: nowIso
  };

  let createdVariantProduct: Product;
  if (existingChildVariantProduct?.id) {
    await safeUpdateDoc('products', existingChildVariantProduct.id, variantProductPayload);
    createdVariantProduct = {
      ...existingChildVariantProduct,
      ...variantProductPayload,
      id: existingChildVariantProduct.id
    } as Product;
  } else {
    const addedRes = await safeAddDoc('products', variantProductPayload);
    const newProdId = addedRes?.id || `prod_var_${Date.now()}`;
    createdVariantProduct = {
      id: newProdId,
      ...variantProductPayload
    } as Product;
  }
  const targetVariantProdId = createdVariantProduct.id;

  await MetadataRepository.upsertLocalProduct(updatedParentProduct).catch(() => {});
  await MetadataRepository.upsertLocalProduct(createdVariantProduct).catch(() => {});
  persistProductsToOfflineCacheSafe([updatedParentProduct, createdVariantProduct]);

  if (typeof setProducts === 'function') {
    setProducts((prev: Product[]) => {
      const updatedList = (prev || []).map((p) => (p.id === parentProduct.id ? updatedParentProduct : p));
      return [createdVariantProduct, ...updatedList.filter((p) => p.id !== targetVariantProdId)];
    });
  }

  if (triggerToast) {
    triggerToast(
      existingChildVariantProduct?.id
        ? `Updated Spec Variant "${cleanVariantLabel}" under ${parentProduct.sku || parentProduct.name}!`
        : `Saved "${cleanVariantLabel}" as new Spec Variant under ${parentProduct.sku || parentProduct.name}!`,
      'success'
    );
  }

  return { updatedParentProduct, createdVariantProduct, newVariantEntry };
}

export interface CatalogSyncMenuProps {
  item: any;
  matchedProduct: Product;
  products?: Product[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>> | any;
  secondarySetProducts?: React.Dispatch<React.SetStateAction<Product[]>> | any;
  currency?: string;
  activeWorkspaceId?: string;
  isVendorCostDoc?: boolean;
  onUpdateLineItem: (patch: any) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  compact?: boolean;
}

/**
 * Explicit 3-Action Catalog Sync Menu (`[⇄ Catalog Sync ▾]`):
 * 1. ✨ Save as Spec Variant on SKU (Non-Destructive Variant Creation)
 * 2. ↑ Update Master Catalog SKU (Overwrite Catalog)
 * 3. ↓ Pull Defaults from Catalog (Reset Item / Pick Specific Spec Variant)
 */
export const CatalogSyncMenu: React.FC<CatalogSyncMenuProps> = ({
  item,
  matchedProduct,
  products = [],
  setProducts,
  secondarySetProducts,
  currency = 'AED',
  activeWorkspaceId,
  isVendorCostDoc = false,
  onUpdateLineItem,
  triggerToast,
  compact = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showVariantPrompt, setShowVariantPrompt] = useState(false);
  const [variantLabelInput, setVariantLabelInput] = useState('');
  const [variantSkuInput, setVariantSkuInput] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const drifted = useMemo(
    () => hasCatalogDrift(item, matchedProduct, currency),
    [item, matchedProduct, currency]
  );

  const diffSummary = useMemo(
    () => computeCatalogItemDiff(item, matchedProduct, currency, products),
    [item, matchedProduct, currency, products]
  );

  // Resolve the root Parent Family product when matchedProduct is already a child variant
  const targetParentProduct = useMemo(() => {
    const parentId =
      (matchedProduct as any).parent_product_id || matchedProduct.variant_parent_id || null;
    if (!parentId) return matchedProduct;
    return (
      (products || []).find((p) => p && !p.is_deleted && p.id === parentId) || matchedProduct
    );
  }, [matchedProduct, products]);

  // Gather available Spec Variants from both targetParentProduct.spec_variants AND sibling products in catalog
  const availableVariants = useMemo(() => {
    const inlineVars: ProductSpecVariant[] = Array.isArray(targetParentProduct.spec_variants)
      ? targetParentProduct.spec_variants
      : Array.isArray(targetParentProduct.variants)
      ? targetParentProduct.variants
      : [];

    const rootId =
      (matchedProduct as any).parent_product_id ||
      matchedProduct.variant_parent_id ||
      targetParentProduct.id;
    const familyLower = (
      targetParentProduct.product_family ||
      targetParentProduct.name ||
      matchedProduct.product_family ||
      matchedProduct.name ||
      ''
    )
      .trim()
      .toLowerCase();
    const siblingProducts = (products || []).filter((p) => {
      if (!p || p.is_deleted || p.id === matchedProduct.id) return false;
      const pParentId = (p as any).parent_product_id || p.variant_parent_id;
      if (rootId && (pParentId === rootId || p.id === rootId)) return true;
      if (familyLower && (p.product_family || p.name || '').trim().toLowerCase() === familyLower) return true;
      return false;
    });

    return { inlineVars, siblingProducts };
  }, [matchedProduct, targetParentProduct, products]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowVariantPrompt(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleOpenVariantPrompt = (e: React.MouseEvent) => {
    e.stopPropagation();
    const suggested = deriveSuggestedVariantLabel(item, targetParentProduct);
    const existingCount =
      availableVariants.inlineVars.length + availableVariants.siblingProducts.length;
    const baseSku = (
      targetParentProduct.sku ||
      matchedProduct.sku ||
      'SKU'
    )
      .replace(/-V\d+$/i, '')
      .trim();
    setVariantLabelInput(suggested);
    setVariantSkuInput(`${baseSku}-V${existingCount + 1}`);
    setShowVariantPrompt(true);
  };

  const handleConfirmSaveVariant = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    setIsBusy(true);
    try {
      const res = await saveLineItemAsSpecVariant({
        item,
        parentProduct: targetParentProduct,
        variantName:
          variantLabelInput.trim() || deriveSuggestedVariantLabel(item, targetParentProduct),
        variantSku: variantSkuInput.trim(),
        products,
        setProducts,
        triggerToast,
        currency,
        activeWorkspaceId
      });
      if (res) {
        if (secondarySetProducts) {
          secondarySetProducts((prev: Product[]) => {
            const updated = (prev || []).map((p) =>
              p.id === res.updatedParentProduct.id ? res.updatedParentProduct : p
            );
            return [
              res.createdVariantProduct,
              ...updated.filter((p) => p.id !== res.createdVariantProduct.id)
            ];
          });
        }
        onUpdateLineItem({
          product_id: res.createdVariantProduct.id,
          sku: res.createdVariantProduct.sku,
          product_sku: res.createdVariantProduct.sku,
          variant_id: res.newVariantEntry.id,
          variant_name: res.newVariantEntry.variant_name
        });
      }
      setShowVariantPrompt(false);
      setIsOpen(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handlePushToMasterCatalog = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy) return;
    setIsBusy(true);
    try {
      const updated = await syncLineItemToCatalogProduct(
        item,
        matchedProduct,
        setProducts,
        triggerToast,
        currency
      );
      if (updated && secondarySetProducts) {
        secondarySetProducts((prev: Product[]) =>
          (prev || []).map((p) => (p.id === updated.id ? updated : p))
        );
      }
      setIsOpen(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handlePullDefaults = (e: React.MouseEvent, targetVariant?: ProductSpecVariant | Product | null) => {
    e.stopPropagation();
    const resetItem = pullCatalogDefaultsToLineItem(
      item,
      matchedProduct,
      currency,
      targetVariant || null,
      isVendorCostDoc,
      products
    );
    onUpdateLineItem(resetItem);
    const label =
      (targetVariant as ProductSpecVariant)?.variant_name ||
      (targetVariant as any)?.variant_label ||
      (targetVariant as Product)?.sku ||
      matchedProduct.sku ||
      matchedProduct.name;
    if (triggerToast) {
      triggerToast(`Switched / pulled catalog defaults from ${label} into this line item.`, 'info');
    }
    setIsOpen(false);
  };

  const skuDisplay = matchedProduct.sku || matchedProduct.name || 'SKU';
  const linkedProductDisplay =
    (matchedProduct as any).variant_label
      ? `${matchedProduct.name} (${(matchedProduct as any).variant_label})`
      : matchedProduct.name || skuDisplay;
  const parentDisplay =
    targetParentProduct.product_family ||
    targetParentProduct.name ||
    targetParentProduct.sku ||
    skuDisplay;
  const totalVariantCount =
    availableVariants.inlineVars.length + availableVariants.siblingProducts.length;
  const isVariantRecommended = diffSummary.hasIdentifyingDrift;

  return (
    <div ref={menuRef} className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={isBusy}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
          if (isOpen) setShowVariantPrompt(false);
        }}
        className={`inline-flex items-center gap-1 rounded-md font-semibold transition cursor-pointer whitespace-nowrap border ${
          compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[10.5px]'
        } ${
          drifted
            ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300 shadow-2xs'
            : 'bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
        }`}
        title={
          drifted
            ? `Changed on Quote: ${diffSummary.summaryText || 'Custom quote edits'}. Click to Save as New Variant, Overwrite Existing Item, or Pull Defaults.`
            : `2-Way Catalog Sync & Spec Variants for ${skuDisplay}`
        }
      >
        <RefreshCw className={`w-2.5 h-2.5 ${isBusy ? 'animate-spin' : ''}`} />
        <span>⇄ Catalog Sync</span>
        {drifted && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
            title="Modified from catalog default"
          />
        )}
        <ChevronDown className="w-2.5 h-2.5 opacity-75" />
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1.5 w-84 sm:w-96 max-w-[calc(100vw-3rem)] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl z-[300] p-2.5 space-y-2 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-slate-500 truncate">
              SKU: {skuDisplay}
              {targetParentProduct.id !== matchedProduct.id ? ` • Family: ${parentDisplay}` : ''}
            </span>
            <span
              className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                drifted
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {drifted ? 'Custom Quote Edits' : 'In Sync with SKU'}
            </span>
          </div>

          {/* Live Diff Summary Banner when Line Item differs from Linked Catalog Product */}
          {diffSummary.entries.length > 0 && (
            <div
              className={`p-2 rounded-lg border text-[10.5px] space-y-1 ${
                isVariantRecommended
                  ? 'bg-amber-50/90 border-amber-200 text-amber-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="font-bold flex items-center justify-between gap-1">
                <span>Changed on Quote vs &ldquo;{linkedProductDisplay}&rdquo;:</span>
                {isVariantRecommended && (
                  <span className="px-1.5 py-0.2 rounded bg-violet-600 text-white text-[9px] font-mono uppercase">
                    New Size/Spec Detected
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {diffSummary.entries.slice(0, 4).map((d, i) => (
                  <span
                    key={i}
                    className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${
                      d.isIdentifyingSpec
                        ? 'bg-white text-violet-900 border-violet-300 font-semibold'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {d.field}: {d.catalogValue} → <strong>{d.quoteValue}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action 1: Save as New Variant under Family */}
          <div
            className={`rounded-lg border p-2 space-y-2 ${
              isVariantRecommended
                ? 'border-violet-400 bg-violet-50/80 dark:bg-violet-950/40 ring-1 ring-violet-400/50'
                : 'border-indigo-200/80 bg-indigo-50/40 dark:bg-indigo-950/30'
            }`}
          >
            {!showVariantPrompt ? (
              <button
                type="button"
                onClick={handleOpenVariantPrompt}
                className="w-full text-left flex items-start gap-2 cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-violet-600 text-white shrink-0 mt-0.5 group-hover:bg-violet-700 transition">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-indigo-950 dark:text-indigo-200 text-xs flex items-center gap-1.5 flex-wrap">
                    <span>✨ Save as New Variant under {parentDisplay}</span>
                    {isVariantRecommended && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white text-[9px] font-mono uppercase">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5">
                    Keeps &ldquo;{linkedProductDisplay}&rdquo; untouched and saves this item&apos;s size, specs &amp; price as a new sibling variant
                  </p>
                </div>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950 text-[11px] flex items-center gap-1 truncate">
                    <Sparkles className="w-3 h-3 text-indigo-600 shrink-0" />
                    <span className="truncate">New Spec Variant under {parentDisplay}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowVariantPrompt(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    Variant Label / Differentiating Spec *
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={variantLabelInput}
                    onChange={(e) => setVariantLabelInput(e.target.value)}
                    placeholder='e.g. 48" x 72" or 10 LPH @ 5 Bar'
                    className="w-full px-2 py-1 text-xs rounded border border-indigo-300 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    Variant SKU Code
                  </label>
                  <input
                    type="text"
                    value={variantSkuInput}
                    onChange={(e) => setVariantSkuInput(e.target.value)}
                    placeholder={`${skuDisplay}-V1`}
                    className="w-full px-2 py-1 text-xs font-mono rounded border border-slate-300 bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowVariantPrompt(false)}
                    className="px-2 py-1 rounded text-[10.5px] font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={handleConfirmSaveVariant}
                    className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{isBusy ? 'Saving...' : 'Save Variant & Link'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action 2: Overwrite Existing Linked Product */}
          <button
            type="button"
            disabled={isBusy}
            onClick={handlePushToMasterCatalog}
            className="w-full text-left p-2 rounded-lg hover:bg-emerald-50/80 border border-transparent hover:border-emerald-200 transition flex items-start gap-2 cursor-pointer group"
          >
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 shrink-0 mt-0.5 group-hover:bg-emerald-600 group-hover:text-white transition">
              <ArrowUpRight className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                ⬆️ Overwrite Existing &ldquo;{linkedProductDisplay}&rdquo;
              </div>
              <p className="text-[10.5px] text-slate-500 leading-snug mt-0.5">
                {isVariantRecommended
                  ? `Caution: Replaces ${skuDisplay}'s saved dimensions/specs & price in the catalog with this line item's values`
                  : `Updates ${skuDisplay}'s price, delivery, specs & photo in the catalog`}
              </p>
            </div>
          </button>

          {/* Action 3: Pull Defaults from Catalog (Reset Item) */}
          <button
            type="button"
            disabled={isBusy}
            onClick={(e) => handlePullDefaults(e, null)}
            className="w-full text-left p-2 rounded-lg hover:bg-amber-50/80 border border-transparent hover:border-amber-200 transition flex items-start gap-2 cursor-pointer group"
          >
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5 group-hover:bg-amber-600 group-hover:text-white transition">
              <ArrowDownLeft className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-800 dark:text-slate-100 text-xs">
                ↓ Reset to Catalog Defaults ({skuDisplay})
              </div>
              <p className="text-[10.5px] text-slate-500 leading-snug mt-0.5">
                Reverts this line item&apos;s price, delivery &amp; specs back to &ldquo;{linkedProductDisplay}&rdquo;
              </p>
            </div>
          </button>

          {/* Spec Variant Selector when SKU has saved variants */}
          {totalVariantCount > 0 && (
            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <span className="px-2 block text-[9.5px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Or Switch to Another Variant in {parentDisplay} ({totalVariantCount})
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1 px-1">
                {availableVariants.inlineVars.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={(e) => handlePullDefaults(e, v)}
                    className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-300 flex items-center justify-between gap-2 transition cursor-pointer"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-[11px] text-slate-800 block truncate">
                        {v.variant_name}
                      </span>
                      {v.sku && (
                        <span className="font-mono text-[9.5px] text-slate-500 block truncate">
                          {v.sku}
                        </span>
                      )}
                    </div>
                    {v.unit_price !== undefined && (
                      <span className="font-mono font-bold text-[10.5px] text-blue-700 shrink-0">
                        AED {Number(v.unit_price).toLocaleString()}
                      </span>
                    )}
                  </button>
                ))}
                {availableVariants.siblingProducts.map((sp) => {
                  const sibLabel =
                    (sp as any).variant_label ||
                    deriveSuggestedVariantLabel(
                      {
                        item_name: sp.name,
                        model_part_no: sp.model_part_no,
                        attributes: sp.attributes
                      },
                      targetParentProduct
                    );
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={(e) => handlePullDefaults(e, sp)}
                      className="w-full text-left px-2 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200/80 hover:border-blue-300 flex items-center justify-between gap-2 transition cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-[11px] text-slate-800 block truncate">
                          {sibLabel}
                        </span>
                        <span className="font-mono text-[9.5px] text-slate-500 block truncate">
                          {sp.sku || sp.name}
                        </span>
                      </div>
                      {sp.unit_price !== undefined && (
                        <span className="font-mono font-bold text-[10.5px] text-blue-700 shrink-0">
                          AED {Number(sp.unit_price).toLocaleString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface VariantFamilyBarProps {
  item: any;
  matchedProduct: Product;
  products: Product[];
  currency?: string;
  isVendorCostDoc?: boolean;
  onSwitchVariant: (patchedItem: any, selectedLabel: string) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  compact?: boolean;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Compact 1-Click Variant Family Bar rendered directly on catalog-linked line items
 * whenever the linked product belongs to a Variant Family (either a Parent with variants or a Child Variant).
 * Shows `Family: <Parent Family Name> • Variant: [<Active Size/Variant> ▾]` and swaps SKU, differentiating specs,
 * and price in 1 click.
 */
export const VariantFamilyBar: React.FC<VariantFamilyBarProps> = ({
  item,
  matchedProduct,
  products = [],
  currency = 'AED',
  isVendorCostDoc = false,
  onSwitchVariant,
  triggerToast,
  compact = false,
  fullWidth = false,
  className = ''
}) => {
  const familyContext = useMemo(() => {
    if (!matchedProduct || !Array.isArray(products) || products.length === 0) return null;
    const activeProds = products.filter((p) => p && !p.is_deleted);
    const parentId =
      (matchedProduct as any).parent_product_id || matchedProduct.variant_parent_id || null;
    const rootParent = parentId
      ? activeProds.find((p) => p.id === parentId) || matchedProduct
      : matchedProduct;
    const rootId = rootParent.id;
    const familyName = (
      rootParent.product_family ||
      matchedProduct.product_family ||
      rootParent.name ||
      matchedProduct.name ||
      ''
    ).trim();
    const familyLower = familyName.toLowerCase();

    // Collect all sibling products in the family (including rootParent if it has a price or children, and all child variants)
    const childProducts = activeProds.filter((p) => {
      if (p.id === rootId) return false;
      const pParentId = (p as any).parent_product_id || p.variant_parent_id;
      if (rootId && pParentId === rootId) return true;
      if (
        familyLower &&
        p.product_family &&
        p.product_family.trim().toLowerCase() === familyLower
      ) {
        return true;
      }
      return false;
    });

    const inlineVars: ProductSpecVariant[] = Array.isArray(rootParent.spec_variants)
      ? rootParent.spec_variants
      : Array.isArray(rootParent.variants)
      ? rootParent.variants
      : [];

    const isChildVariant = Boolean(parentId);
    const hasVariants = isChildVariant || childProducts.length > 0 || inlineVars.length > 0;
    if (!hasVariants) return null;

    const effectiveCurr = String(currency || item?.currency || 'AED').toUpperCase();
    const formatOptionPrice = (rawAedPrice?: number, prodCurr?: string) => {
      const num = Number(rawAedPrice || 0);
      if (num <= 0) return 'POR';
      const pCurr = String(prodCurr || 'AED').toUpperCase();
      const fx =
        effectiveCurr === pCurr
          ? 1
          : resolveToAedMultiplier(pCurr) / resolveToAedMultiplier(effectiveCurr);
      const converted = Math.round(num * fx * 100) / 100;
      return `${effectiveCurr} ${converted.toLocaleString()}`;
    };

    const options: Array<{
      key: string;
      label: string;
      sku: string;
      priceLabel: string;
      targetProduct?: Product;
      targetInlineVariant?: ProductSpecVariant;
      isCurrent: boolean;
    }> = [];

    const seenSkus = new Set<string>();
    const hasConcreteChildren = childProducts.length > 0 || inlineVars.length > 0;

    // Resolve exact active variant key strictly without ever silently falling back to options[0]
    const resolvedActiveKey = resolveSelectedVariantId({
      item,
      matchedProduct,
      rootParent,
      childProducts,
      inlineVariants: inlineVars
    });

    // Include root parent as a selectable option only if it has its own concrete price or there are no child variants
    if (!hasConcreteChildren || Number(rootParent.unit_price || 0) > 0) {
      const rootLabel =
        (rootParent as any).variant_label ||
        deriveSuggestedVariantLabel(
          {
            item_name: rootParent.name,
            model_part_no: rootParent.model_part_no,
            attributes: rootParent.attributes
          },
          null
        ) ||
        'Base / Parent Master';
      options.push({
        key: `prod_${rootParent.id}`,
        label: `${rootLabel} (Parent)`,
        sku: rootParent.sku || '',
        priceLabel: formatOptionPrice(rootParent.unit_price, rootParent.currency),
        targetProduct: rootParent,
        isCurrent: resolvedActiveKey === `prod_${rootParent.id}`
      });
      if (rootParent.sku) seenSkus.add(rootParent.sku.trim().toLowerCase());
    }

    // Add child variant product records
    for (const cp of childProducts) {
      const cpLabel =
        (cp as any).variant_label ||
        deriveSuggestedVariantLabel(
          {
            item_name: cp.name,
            model_part_no: cp.model_part_no,
            attributes: cp.attributes
          },
          rootParent
        );
      if (cp.sku) seenSkus.add(cp.sku.trim().toLowerCase());
      options.push({
        key: `prod_${cp.id}`,
        label: cpLabel,
        sku: cp.sku || '',
        priceLabel: formatOptionPrice(cp.unit_price, cp.currency),
        targetProduct: cp,
        isCurrent: resolvedActiveKey === `prod_${cp.id}`
      });
    }

    // Add any inline spec_variants that don't already have a child product record with the same SKU
    for (const iv of inlineVars) {
      const ivSkuLower = String(iv.sku || '').trim().toLowerCase();
      if (ivSkuLower && seenSkus.has(ivSkuLower)) continue;
      options.push({
        key: `ivar_${iv.id}`,
        label: iv.variant_name || iv.sku || 'Variant',
        sku: iv.sku || '',
        priceLabel: formatOptionPrice(iv.unit_price, rootParent.currency),
        targetProduct: rootParent,
        targetInlineVariant: iv,
        isCurrent: resolvedActiveKey === `ivar_${iv.id}`
      });
    }

    // Defensive invariant check: guarantee activeKey ALWAYS matches a rendered <option value>
    // (or explicit __parent__ / __custom__ sentinel) so <select> can never silently show options[0]
    const activeKey = resolveSafeVariantSelectKey(
      resolvedActiveKey,
      options.map((o) => o.key),
      rootParent.id
    );
    for (const opt of options) {
      opt.isCurrent = activeKey === opt.key;
    }

    const isSentinelSelection =
      activeKey === VARIANT_SELECT_PARENT || activeKey === VARIANT_SELECT_CUSTOM;
    const customSummary =
      activeKey === VARIANT_SELECT_CUSTOM
        ? formatCustomLineItemVariantSummary(item, effectiveCurr)
        : '';

    const currentVariantBadge =
      activeKey === VARIANT_SELECT_PARENT
        ? 'Master Parent'
        : activeKey === VARIANT_SELECT_CUSTOM
        ? `Custom (${customSummary})`
        : item?.variant_name ||
          (matchedProduct as any).variant_label ||
          (isChildVariant
            ? deriveSuggestedVariantLabel(
                {
                  item_name: matchedProduct.name,
                  model_part_no: matchedProduct.model_part_no,
                  attributes: matchedProduct.attributes
                },
                rootParent
              )
            : 'Parent Master');

    return {
      familyName,
      rootParent,
      isChildVariant,
      currentVariantBadge,
      options,
      activeKey,
      isSentinelSelection,
      customSummary
    };
  }, [matchedProduct, products, currency, item]);

  if (!familyContext) return null;

  const handleVariantChange = (nextKey: string) => {
    if (nextKey === VARIANT_SELECT_PARENT || nextKey === VARIANT_SELECT_CUSTOM) return;
    const chosen = familyContext.options.find((o) => o.key === nextKey);
    if (!chosen) return;
    const nextItem = pullCatalogDefaultsToLineItem(
      item,
      chosen.targetProduct || familyContext.rootParent,
      currency,
      chosen.targetInlineVariant || chosen.targetProduct || null,
      isVendorCostDoc,
      products,
      { isVariantSwitch: true }
    );
    onSwitchVariant(nextItem, chosen.label);
    if (triggerToast) {
      triggerToast(
        `Switched variant to "${chosen.label}" (${chosen.sku || familyContext.familyName} • ${chosen.priceLabel}).`,
        'success'
      );
    }
  };

  const renderSelectOptions = () => (
    <>
      {familyContext.activeKey === VARIANT_SELECT_PARENT && (
        <option value={VARIANT_SELECT_PARENT}>
          Master Parent (Select a variant...)
        </option>
      )}
      {familyContext.activeKey === VARIANT_SELECT_CUSTOM && (
        <option value={VARIANT_SELECT_CUSTOM}>
          Custom / Modified ({familyContext.customSummary})
        </option>
      )}
      {familyContext.options.map((opt) => (
        <option key={opt.key} value={opt.key}>
          {opt.label} {opt.sku ? `[${opt.sku}]` : ''} — {opt.priceLabel}
        </option>
      ))}
    </>
  );

  const selectToneClass = familyContext.isSentinelSelection
    ? 'bg-amber-50/95 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 hover:border-amber-500 text-amber-950 dark:text-amber-100 focus:ring-amber-500'
    : 'bg-white dark:bg-slate-900 border-violet-300 dark:border-violet-700 hover:border-violet-500 text-violet-950 dark:text-violet-100 focus:ring-violet-500';

  if (fullWidth) {
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full min-w-0 max-w-full flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap rounded-lg bg-violet-50/85 dark:bg-violet-950/35 border border-violet-200/80 dark:border-violet-800/80 px-2.5 py-1.5 text-[11px] ${className}`.trim()}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <GitBranch className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="text-violet-600 dark:text-violet-400 font-mono uppercase text-[9.5px] font-bold tracking-wider shrink-0">
            Family:
          </span>
          <span
            className="font-bold text-violet-950 dark:text-violet-100 truncate min-w-0"
            title={familyContext.familyName}
          >
            {familyContext.familyName}
          </span>
        </div>

        <div className="flex items-center gap-1.5 min-w-0 w-full sm:w-auto sm:max-w-[60%]">
          <span className="text-violet-600 dark:text-violet-400 font-mono uppercase text-[9.5px] font-bold tracking-wider shrink-0">
            Variant:
          </span>
          <select
            value={familyContext.activeKey}
            onChange={(e) => handleVariantChange(e.target.value)}
            className={`min-w-0 flex-1 sm:flex-initial sm:max-w-[290px] max-w-full border font-semibold rounded-md px-2 py-0.5 text-[11px] cursor-pointer focus:outline-none focus:ring-1 truncate ${selectToneClass}`}
            title="1-Click Switch to another Size / Spec Variant in this Parent Family (updates SKU, differentiating specs, and price)"
          >
            {renderSelectOptions()}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 flex-wrap rounded-lg bg-violet-50/90 dark:bg-violet-950/40 border border-violet-200/90 dark:border-violet-800 ${
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[10.5px]'
      } ${className}`.trim()}
    >
      <span className="inline-flex items-center gap-1 font-semibold text-violet-900 dark:text-violet-200 whitespace-nowrap">
        <GitBranch className="w-3 h-3 text-violet-600 dark:text-violet-400 shrink-0" />
        <span className="text-violet-600 dark:text-violet-400 font-mono uppercase text-[9.5px]">
          Family:
        </span>
        <span className="font-bold truncate max-w-[160px]" title={familyContext.familyName}>
          {familyContext.familyName}
        </span>
      </span>

      <span className="text-violet-300 dark:text-violet-700 select-none">•</span>

      <div className="inline-flex items-center gap-1">
        <span className="text-violet-600 dark:text-violet-400 font-mono uppercase text-[9.5px]">
          Variant:
        </span>
        <select
          value={familyContext.activeKey}
          onChange={(e) => handleVariantChange(e.target.value)}
          className={`border font-bold rounded-md px-1.5 py-0.5 text-[10.5px] cursor-pointer focus:outline-none focus:ring-1 max-w-[240px] truncate ${selectToneClass}`}
          title="1-Click Switch to another Size / Spec Variant in this Parent Family (updates SKU, differentiating specs, and price)"
        >
          {renderSelectOptions()}
        </select>
      </div>
    </div>
  );
};

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
  secondary_image_url?: string;
  image_caption?: string;
  secondary_image_caption?: string;
  image_adjustments?: ImageAdjustmentConfig;
  datasheet_attachment?: Attachment;
  attributes?: ProductAttribute[];
  is_composite_set?: boolean;
  sub_components?: any[];
  package_pricing_mode?: 'itemized' | 'lump_sum';
  option_scope_notes?: string;
  currency?: string;
}

interface SaveToCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  lineItem?: SaveToCatalogLineItemInput | null;
  initialItem?: SaveToCatalogLineItemInput | null;
  initialMode?: 'new_product' | 'spec_variant';
  currency?: string;
  activeWorkspace?: Workspace;
  activeWorkspaceId?: string;
  user?: any;
  products: Product[];
  productCategories?: string[];
  units?: string[];
  setProducts?: React.Dispatch<React.SetStateAction<Product[]>>;
  setProductCategories?: React.Dispatch<React.SetStateAction<DropdownOption[]>>;
  onSaved?: (newProduct: Product, updatedParentProduct?: Product) => void;
  onProductSaved?: (newProduct: Product, updatedParentProduct?: Product) => void;
  triggerToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export default function SaveToCatalogModal({
  isOpen,
  onClose,
  lineItem: propLineItem,
  initialItem,
  initialMode = 'new_product',
  currency: propCurrency,
  activeWorkspace,
  activeWorkspaceId,
  user,
  products,
  productCategories: propCategories,
  units: propUnits,
  setProducts,
  setProductCategories,
  onSaved,
  onProductSaved,
  triggerToast
}: SaveToCatalogModalProps) {
  const lineItem = propLineItem || initialItem || null;
  const [isSaving, setIsSaving] = useState(false);

  // Mode: 'update_linked' (Update Linked Item) vs 'spec_variant' (Save as New Size / Variant of Parent Family) vs 'new_product' (Save as Separate Standalone Product)
  const [saveMode, setSaveMode] = useState<'update_linked' | 'spec_variant' | 'new_product'>(
    initialMode
  );
  const [selectedParentProductId, setSelectedParentProductId] = useState<string>('');
  const [parentSearchQuery, setParentSearchQuery] = useState<string>('');
  const [variantLabel, setVariantLabel] = useState<string>('');

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
  const [secondaryImageUrl, setSecondaryImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');
  const [secondaryImageCaption, setSecondaryImageCaption] = useState('');
  const [imageAdjustments, setImageAdjustments] = useState<ImageAdjustmentConfig | undefined>(undefined);
  const [datasheetAttachment, setDatasheetAttachment] = useState<Attachment | undefined>(undefined);
  const [attributes, setAttributes] = useState<ProductAttribute[]>([]);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingDatasheet, setIsUploadingDatasheet] = useState(false);

  const availableCategories = useMemo(() => {
    const base = propCategories && propCategories.length > 0 ? propCategories : [...UNIVERSAL_CATEGORIES];
    const fromProds = (products || []).filter((p) => !p.is_deleted && p.product_type).map((p) => p.product_type);
    const itemCat =
      lineItem?.product_type && lineItem.product_type !== 'Custom' && lineItem.product_type !== 'Standard'
        ? lineItem.product_type.trim()
        : '';
    const activeCat = (category || '').trim();
    return Array.from(
      new Set([
        ...(activeCat ? [activeCat] : []),
        ...(itemCat ? [itemCat] : []),
        ...base,
        ...UNIVERSAL_CATEGORIES,
        ...fromProds
      ])
    ).filter(Boolean);
  }, [propCategories, products, lineItem, category]);

  const availableUnits = useMemo(() => {
    const base = propUnits && propUnits.length > 0 ? propUnits : [...UNIVERSAL_UNITS];
    const fromProds = (products || []).filter((p) => !p.is_deleted && p.unit).map((p) => p.unit);
    const itemUom = String(lineItem?.unit || (lineItem as any)?.uom || '').trim();
    const activeUom = (unit || '').trim();
    return Array.from(
      new Set([
        ...(activeUom ? [activeUom] : []),
        ...(itemUom ? [itemUom] : []),
        'Nos',
        'SET',
        'Set',
        'Pcs',
        ...base,
        ...UNIVERSAL_UNITS,
        ...fromProds
      ])
    ).filter(Boolean);
  }, [propUnits, products, lineItem, unit]);

  useEffect(() => {
    if (!isOpen || !lineItem) return;
    const rawTitle = lineItem.item_name || lineItem.title || '';
    const rawDesc = lineItem.description || '';
    const parsed = parseLineItemTitleAndSpec(rawTitle, rawDesc);

    const rawAttrs = Array.isArray(lineItem.attributes) ? lineItem.attributes : [];
    const mergedAttrs = extractAttributesFromDescription(parsed.spec || rawDesc, rawAttrs);
    const compiledDesc = compileDescriptionWithSpecs(
      parsed.title || rawTitle,
      parsed.spec || rawDesc,
      mergedAttrs
    );

    setName(parsed.title || '');
    setDescription(compiledDesc || parsed.spec || parsed.title || '');

    const initialCat =
      lineItem.product_type && lineItem.product_type !== 'Custom' && lineItem.product_type !== 'Standard'
        ? lineItem.product_type
        : (propCategories && propCategories[0]) || 'General Equipment';
    setCategory(initialCat);

    // Extract brand or model from attributes if not set directly
    const attrBrand = mergedAttrs.find((a) => /^(brand|make|manufacturer|brand \/ make)$/i.test((a.key || '').trim()))?.value;
    const attrModel = mergedAttrs.find((a) => /^(model|model no|part no|model \/ part no)$/i.test((a.key || '').trim()))?.value;

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

    const effectiveCurrency = String(propCurrency || lineItem.currency || 'AED').toUpperCase();
    const fxMultiplier = resolveToAedMultiplier(effectiveCurrency);
    const scaledSell =
      lineItem.unit_price != null && lineItem.unit_price >= 0
        ? Math.round(Number(lineItem.unit_price) * fxMultiplier * 100) / 100
        : null;
    const scaledCost =
      lineItem.cost_price != null && lineItem.cost_price > 0
        ? Math.round(Number(lineItem.cost_price) * fxMultiplier * 100) / 100
        : null;

    const rawItemUnit = String(
      lineItem.unit || (lineItem as any).uom || (lineItem.is_composite_set ? 'SET' : 'Nos')
    ).trim();
    setUnit(rawItemUnit || 'Nos');
    setUnitPrice(scaledSell !== null ? String(scaledSell) : '');
    setCostPrice(scaledCost !== null ? String(scaledCost) : '');
    setLeadTime(lineItem.lead_time_note || lineItem.availability || '');
    setCountryOfOrigin(lineItem.country_of_origin || lineItem.origin || '');
    setHsCode(lineItem.hs_code || '');
    setImageUrl(lineItem.image_url || '');
    setSecondaryImageUrl(lineItem.secondary_image_url || '');
    setImageCaption(lineItem.image_caption || '');
    setSecondaryImageCaption(lineItem.secondary_image_caption || '');
    setImageAdjustments(lineItem.image_adjustments);
    setDatasheetAttachment(lineItem.datasheet_attachment);
    setAttributes(mergedAttrs.map((a) => ({ key: a.key ?? '', value: a.value ?? '' })));
    setIsCreatingCategory(false);
    setNewCategoryInput('');

    // Check if lineItem is already linked to a product in the catalog
    const explicitLinkedId = (lineItem as any).product_id;
    const directLinkedProd = explicitLinkedId
      ? (products || []).find((p) => !p.is_deleted && p.id === explicitLinkedId) || null
      : null;
    const diffCheck = directLinkedProd
      ? computeCatalogItemDiff(lineItem, directLinkedProd, propCurrency, products)
      : null;

    if (initialMode === 'spec_variant') {
      setSaveMode('spec_variant');
    } else if (directLinkedProd) {
      if (diffCheck?.hasIdentifyingDrift) {
        const rootId =
          (directLinkedProd as any).parent_product_id ||
          directLinkedProd.variant_parent_id ||
          directLinkedProd.id;
        setSaveMode('spec_variant');
        setSelectedParentProductId(rootId || '');
      } else {
        setSaveMode('update_linked');
        setSelectedParentProductId('');
      }
    } else {
      setSaveMode(initialMode || 'new_product');
      setSelectedParentProductId('');
    }
    setParentSearchQuery('');
    setVariantLabel(deriveSuggestedVariantLabel(lineItem, directLinkedProd));
  }, [isOpen, lineItem, propCurrency, initialMode, products]);

  const suggestedChips = useMemo(() => {
    const known = category ? CATEGORY_SUGGESTED_ATTRIBUTES[category] || [] : [];
    const defaults = ['Dimensions / Size', 'Material / Grade', 'Capacity / Rating', 'Operating Pressure', 'Warranty'];
    const merged = Array.from(new Set([...known, ...defaults]));
    const used = new Set(attributes.map((a) => (a.key || '').trim().toLowerCase()));
    return merged.filter((k) => !used.has(k.toLowerCase())).slice(0, 8);
  }, [category, attributes]);

  const filteredParentProducts = useMemo(() => {
    const list = (products || []).filter(
      (p) => !p.is_deleted && !p.variant_parent_id && !(p as any).parent_product_id
    );
    const q = parentSearchQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 40);
    return list
      .filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.brand_make || '').toLowerCase().includes(q) ||
          (p.model_part_no || '').toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [products, parentSearchQuery]);

  const selectedParentProduct = useMemo(
    () => (products || []).find((p) => p.id === selectedParentProductId) || null,
    [products, selectedParentProductId]
  );

  const directlyLinkedCatalogProduct = useMemo(() => {
    const pid = (lineItem as any)?.product_id;
    if (!pid || !Array.isArray(products)) return null;
    return products.find((p) => !p.is_deleted && p.id === pid) || null;
  }, [lineItem, products]);

  const modalDiffSummary = useMemo(
    () =>
      directlyLinkedCatalogProduct
        ? computeCatalogItemDiff(lineItem, directlyLinkedCatalogProduct, propCurrency, products)
        : null,
    [lineItem, directlyLinkedCatalogProduct, propCurrency, products]
  );

  // Detect Suggested Parent Product when opening SaveToCatalogModal from a Base Template or matching Parent Family
  const suggestedParentProduct = useMemo(() => {
    if (!lineItem || !Array.isArray(products) || products.length === 0) return null;
    const activeParents = products.filter(
      (p) => !p.is_deleted && !p.variant_parent_id && !(p as any).parent_product_id
    );
    const explicitParentId =
      (lineItem as any).template_parent_id ||
      (lineItem as any).parent_product_id ||
      (lineItem as any).variant_parent_id ||
      (lineItem as any).product_id;
    if (explicitParentId) {
      const directMatch = products.find((p) => !p.is_deleted && p.id === explicitParentId);
      if (directMatch) {
        const rootId = (directMatch as any).parent_product_id || directMatch.variant_parent_id || directMatch.id;
        const rootProd = products.find((p) => !p.is_deleted && p.id === rootId) || directMatch;
        return rootProd;
      }
    }
    const cleanTitle = (name || lineItem.item_name || lineItem.title || '').trim().toLowerCase();
    const cleanBrand = (brandMake || lineItem.brand_make || '').trim().toLowerCase();
    if (!cleanTitle) return null;

    // 1. Exact or prefix title/family match
    const familyMatch = activeParents.find((p) => {
      const pName = (p.name || '').trim().toLowerCase();
      const pFam = (p.product_family || '').trim().toLowerCase();
      if (!pName && !pFam) return false;
      if (pName === cleanTitle || (pFam && pFam === cleanTitle)) return true;
      if (pName.length >= 6 && (cleanTitle.startsWith(pName) || pName.startsWith(cleanTitle))) {
        if (!cleanBrand || !p.brand_make || p.brand_make.trim().toLowerCase() === cleanBrand) {
          return true;
        }
      }
      return false;
    });
    return familyMatch || null;
  }, [lineItem, products, name, brandMake]);

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

    if (saveMode === 'spec_variant' && !selectedParentProduct) {
      if (triggerToast) triggerToast('Please select an existing Catalog Parent Product to attach this Spec Variant to.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const cleanAttrs = attributes
        .map((a) => ({ key: (a.key ?? '').trim(), value: (a.value ?? '').trim() }))
        .filter((a) => a.key !== '');

      const searchTerms = generateProductSearchTerms(
        name.trim(),
        category || 'General Equipment',
        sku.trim(),
        brandMake.trim() || modelPartNo.trim()
      );

      const effectiveCurrency = String(propCurrency || lineItem.currency || 'AED').toUpperCase();
      const fxMultiplier = resolveToAedMultiplier(effectiveCurrency);
      const numSell = unitPrice !== '' && !isNaN(Number(unitPrice)) ? Number(unitPrice) : undefined;
      const numCost = costPrice !== '' && !isNaN(Number(costPrice)) ? Number(costPrice) : undefined;
      const isComposite = Boolean(
        lineItem.is_composite_set ||
          (Array.isArray(lineItem.sub_components) && lineItem.sub_components.length > 0)
      );
      const scaledSubComponents =
        Array.isArray(lineItem.sub_components) && lineItem.sub_components.length > 0
          ? lineItem.sub_components.map((sub: any) => {
              const subSell = sub.is_included_accessory
                ? 0
                : Math.round(Number(sub.unit_price || 0) * fxMultiplier * 100) / 100;
              const subCost = sub.is_included_accessory
                ? 0
                : Math.round(Number(sub.cost_price || 0) * fxMultiplier * 100) / 100;
              const subQty = Number(sub.quantity) || 0;
              const subTotal = sub.is_included_accessory ? 0 : Math.round(subSell * subQty * 100) / 100;
              return {
                ...sub,
                unit_price: subSell,
                cost_price: subCost,
                total_price: subTotal,
                line_total: subTotal
              };
            })
          : undefined;

      const finalCompiledDescription =
        compileDescriptionWithSpecs(name.trim(), description.trim(), cleanAttrs) || name.trim();

      if (saveMode === 'spec_variant' && selectedParentProduct) {
        const res = await saveLineItemAsSpecVariant({
          item: {
            ...lineItem,
            item_name: name.trim(),
            description: finalCompiledDescription,
            unit: (unit || '').trim() || 'Nos',
            unit_price: numSell,
            cost_price: numCost,
            lead_time_note: leadTime.trim() || undefined,
            model_part_no: modelPartNo.trim() || undefined,
            brand_make: brandMake.trim() || undefined,
            country_of_origin: countryOfOrigin.trim() || undefined,
            hs_code: hsCode.trim() || undefined,
            image_url: imageUrl.trim() || undefined,
            secondary_image_url: secondaryImageUrl.trim() || undefined,
            image_caption: imageCaption.trim() || undefined,
            secondary_image_caption: secondaryImageCaption.trim() || undefined,
            image_adjustments: imageAdjustments,
            datasheet_attachment: datasheetAttachment || undefined,
            attributes: cleanAttrs,
            ...(isComposite ? { is_composite_set: true } : {}),
            ...(scaledSubComponents ? { sub_components: scaledSubComponents } : {})
          },
          parentProduct: selectedParentProduct,
          variantName: variantLabel.trim() || deriveSuggestedVariantLabel(lineItem, selectedParentProduct),
          variantSku: sku.trim() || undefined,
          products,
          setProducts,
          triggerToast,
          currency: 'AED',
          activeWorkspaceId: activeWorkspace?.id || activeWorkspaceId
        });

        if (res?.createdVariantProduct) {
          if (onSaved) onSaved(res.createdVariantProduct, res.updatedParentProduct);
          if (onProductSaved) onProductSaved(res.createdVariantProduct, res.updatedParentProduct);
          onClose();
        }
        return;
      }

      const targetWsId = activeWorkspace?.id || activeWorkspaceId || 'ws_default';
      const normSku = sku.trim().toLowerCase();
      const normName = name.trim().toLowerCase();
      const normBrand = brandMake.trim().toLowerCase();

      const existingMatch =
        saveMode === 'update_linked' && directlyLinkedCatalogProduct
          ? directlyLinkedCatalogProduct
          : saveMode === 'new_product' && directlyLinkedCatalogProduct
          ? null
          : (products || []).find((p) => {
              if (p.is_deleted) return false;
              const pWsId = p.workspace_id || (p as any).workspaceId || 'ws_default';
              if (pWsId !== targetWsId) return false;
              if (normSku && (p.sku || '').trim().toLowerCase() === normSku) {
                return true;
              }
              if (
                normName &&
                (p.name || '').trim().toLowerCase() === normName &&
                (p.brand_make || '').trim().toLowerCase() === normBrand
              ) {
                return true;
              }
              return false;
            });

      if (existingMatch && existingMatch.id) {
        const mergedAttrsMap = new Map<string, ProductAttribute>();
        (existingMatch.attributes || []).forEach((a) => {
          if (a?.key) mergedAttrsMap.set(a.key.trim().toLowerCase(), a);
        });
        cleanAttrs.forEach((a) => {
          if (a?.key) mergedAttrsMap.set(a.key.trim().toLowerCase(), a);
        });
        const mergedAttributes = Array.from(mergedAttrsMap.values());

        const updatedPayload: Partial<Product> = {
          name: name.trim() || existingMatch.name,
          description: finalCompiledDescription || existingMatch.description,
          product_type: category || existingMatch.product_type || 'General Equipment',
          sku: existingMatch.sku || sku.trim() || undefined,
          brand_make: brandMake.trim() || existingMatch.brand_make || undefined,
          model_part_no: modelPartNo.trim() || existingMatch.model_part_no || undefined,
          unit: (unit || '').trim() || existingMatch.unit || 'Nos',
          unit_price: numSell !== undefined ? numSell : existingMatch.unit_price,
          cost_price: numCost !== undefined ? numCost : existingMatch.cost_price,
          currency: 'AED',
          default_availability: leadTime.trim() || existingMatch.default_availability || undefined,
          country_of_origin: countryOfOrigin.trim() || existingMatch.country_of_origin || undefined,
          hs_code: hsCode.trim() || existingMatch.hs_code || undefined,
          image_url: imageUrl.trim() || existingMatch.image_url || undefined,
          ...(secondaryImageUrl.trim()
            ? { secondary_image_url: secondaryImageUrl.trim() }
            : existingMatch.secondary_image_url
            ? { secondary_image_url: existingMatch.secondary_image_url }
            : {}),
          ...(imageCaption.trim()
            ? { image_caption: imageCaption.trim() }
            : existingMatch.image_caption
            ? { image_caption: existingMatch.image_caption }
            : {}),
          ...(secondaryImageCaption.trim()
            ? { secondary_image_caption: secondaryImageCaption.trim() }
            : existingMatch.secondary_image_caption
            ? { secondary_image_caption: existingMatch.secondary_image_caption }
            : {}),
          ...(imageAdjustments
            ? { image_adjustments: imageAdjustments }
            : existingMatch.image_adjustments
            ? { image_adjustments: existingMatch.image_adjustments }
            : {}),
          datasheet_attachment: datasheetAttachment || existingMatch.datasheet_attachment || undefined,
          attributes: mergedAttributes,
          ...(isComposite ? { is_composite_set: true } : {}),
          ...(scaledSubComponents ? { sub_components: scaledSubComponents } : {}),
          ...(lineItem.package_pricing_mode ? { package_pricing_mode: lineItem.package_pricing_mode } : {}),
          ...(lineItem.option_scope_notes ? { option_scope_notes: lineItem.option_scope_notes } : {}),
          search_terms: searchTerms,
          updatedAt: new Date().toISOString()
        };

        await safeUpdateDoc('products', existingMatch.id, updatedPayload);
        const updatedProduct: Product = {
          ...existingMatch,
          ...updatedPayload,
          id: existingMatch.id
        } as Product;

        await MetadataRepository.upsertLocalProduct(updatedProduct).catch(() => {});

        const nextProductsList = (products || []).map((p) =>
          p.id === existingMatch.id ? updatedProduct : p
        );
        if (setProducts) {
          setProducts(nextProductsList);
        }
        persistProductsToOfflineCacheSafe([updatedProduct]);

        if (triggerToast) {
          triggerToast(
            `Updated existing Catalog SKU "${updatedProduct.sku || updatedProduct.name}" instead of creating a duplicate.`,
            'success'
          );
        }

        if (onSaved) onSaved(updatedProduct);
        if (onProductSaved) onProductSaved(updatedProduct);
        onClose();
        return;
      }

      const productPayload: Partial<Product> = {
        workspace_id: targetWsId,
        name: name.trim(),
        description: finalCompiledDescription,
        product_type: category || 'General Equipment',
        sku: sku.trim() || undefined,
        brand_make: brandMake.trim() || undefined,
        model_part_no: modelPartNo.trim() || undefined,
        unit: (unit || '').trim() || 'Nos',
        unit_price: numSell,
        cost_price: numCost,
        currency: 'AED',
        default_availability: leadTime.trim() || undefined,
        country_of_origin: countryOfOrigin.trim() || undefined,
        hs_code: hsCode.trim() || undefined,
        image_url: imageUrl.trim() || undefined,
        ...(secondaryImageUrl.trim() ? { secondary_image_url: secondaryImageUrl.trim() } : {}),
        ...(imageCaption.trim() ? { image_caption: imageCaption.trim() } : {}),
        ...(secondaryImageCaption.trim() ? { secondary_image_caption: secondaryImageCaption.trim() } : {}),
        ...(imageAdjustments ? { image_adjustments: imageAdjustments } : {}),
        datasheet_attachment: datasheetAttachment || undefined,
        attributes: cleanAttrs,
        ...(isComposite ? { is_composite_set: true } : {}),
        ...(scaledSubComponents ? { sub_components: scaledSubComponents } : {}),
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

      await MetadataRepository.upsertLocalProduct(createdProduct).catch(() => {});

      const nextProductsList = [createdProduct, ...(products || []).filter((p) => p.id !== newId)];
      if (setProducts) {
        setProducts(nextProductsList);
      }
      persistProductsToOfflineCacheSafe([createdProduct]);

      if (triggerToast) {
        triggerToast(
          `Saved ${isComposite ? 'Composite Kit / BOM' : 'Product'} "${createdProduct.name}" to Products Catalog.`,
          'success'
        );
      }

      if (onSaved) onSaved(createdProduct);
      if (onProductSaved) onProductSaved(createdProduct);
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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={`fixed inset-0 ${Z_NESTED_MODAL} bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4`}
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
                {saveMode === 'spec_variant'
                  ? 'Attach Line Item as Spec Variant to Existing Catalog SKU'
                  : isCompositePreview
                  ? 'Save Composite Package / Kit (BOM) to Catalog'
                  : 'Save Line Item to Products Catalog'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {saveMode === 'spec_variant'
                  ? 'Saves this item as a reusable Spec Variant under an existing parent Catalog Product without overwriting its master defaults.'
                  : `Creates a reusable Catalog ${isCompositePreview ? 'Composite Kit (with all BOM sub-components)' : 'Product'} and links its ID back to this line item.`}
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
          {/* Diff Summary Banner when editing a Catalog-linked item */}
          {directlyLinkedCatalogProduct && modalDiffSummary && modalDiffSummary.entries.length > 0 && (
            <div
              className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                modalDiffSummary.hasIdentifyingDrift
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-slate-50 border-slate-200 text-slate-800'
              }`}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-bold">
                  Changed on Quote vs Linked Catalog Item &ldquo;
                  {(directlyLinkedCatalogProduct as any).variant_label
                    ? `${directlyLinkedCatalogProduct.name} (${(directlyLinkedCatalogProduct as any).variant_label})`
                    : directlyLinkedCatalogProduct.name}
                  &rdquo;:
                </span>
                {modalDiffSummary.hasIdentifyingDrift && (
                  <span className="px-2 py-0.5 rounded-md bg-violet-600 text-white font-mono text-[10px] font-bold">
                    ✨ Recommended: Save as New Size / Variant
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {modalDiffSummary.entries.map((d, i) => (
                  <span
                    key={i}
                    className={`px-2 py-0.5 rounded-md font-mono text-[10.5px] border ${
                      d.isIdentifyingSpec
                        ? 'bg-white text-violet-900 border-violet-300 font-semibold'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {d.field}: {d.catalogValue} → <strong>{d.quoteValue}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 1-Click Suggested Parent Banner when item matches a Parent Family or Base Template */}
          {suggestedParentProduct && (saveMode !== 'spec_variant' || selectedParentProductId !== suggestedParentProduct.id) && (
            <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="p-1.5 rounded-lg bg-violet-600 text-white shrink-0 mt-0.5">
                  <GitBranch className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-violet-950 dark:text-violet-200">
                    Save as a New Size / Variant of {suggestedParentProduct.product_family || suggestedParentProduct.name}?
                  </div>
                  <p className="text-[11px] text-violet-700 dark:text-violet-300 leading-snug">
                    Inherits shared base specs ({(suggestedParentProduct.attributes || []).length} attrs) &amp; media from{' '}
                    <span className="font-mono font-semibold">{suggestedParentProduct.sku || suggestedParentProduct.name}</span> while saving your custom RFQ dimensions &amp; price.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSaveMode('spec_variant');
                  setSelectedParentProductId(suggestedParentProduct.id || '');
                  setCategory(suggestedParentProduct.product_type || category);
                  if (suggestedParentProduct.brand_make && !brandMake) {
                    setBrandMake(suggestedParentProduct.brand_make);
                  }
                  const suggestedLbl = deriveSuggestedVariantLabel(lineItem, suggestedParentProduct);
                  setVariantLabel(suggestedLbl);
                  const baseSku = (suggestedParentProduct.sku || 'SKU').replace(/-V\d+$/i, '').trim();
                  const suffix =
                    suggestedLbl
                      .replace(/[^A-Za-z0-9]/g, '')
                      .slice(0, 6)
                      .toUpperCase() || `V${(suggestedParentProduct.spec_variants?.length || 0) + 1}`;
                  setSku(`${baseSku}-${suffix}`);
                }}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shrink-0 cursor-pointer shadow-2xs transition"
              >
                Use Parent Family
              </button>
            </div>
          )}

          {/* Self-Explanatory Visual Cards for Save Action Choice */}
          <div
            className={`grid grid-cols-1 ${
              directlyLinkedCatalogProduct ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
            } gap-2.5`}
          >
            {directlyLinkedCatalogProduct && (
              <button
                type="button"
                onClick={() => {
                  setSaveMode('update_linked');
                  if (directlyLinkedCatalogProduct.sku) {
                    setSku(directlyLinkedCatalogProduct.sku);
                  }
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                  saveMode === 'update_linked'
                    ? 'bg-emerald-50/90 border-emerald-500 ring-1 ring-emerald-500/40 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-950">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">
                      1. Update Linked Item
                    </span>
                  </span>
                  {!modalDiffSummary?.hasIdentifyingDrift && (
                    <span className="px-1.5 py-0.2 rounded bg-emerald-600 text-white font-mono text-[9px] uppercase shrink-0">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-slate-600 leading-snug">
                  Updates price/specs on{' '}
                  <strong className="text-slate-800">
                    {(directlyLinkedCatalogProduct as any).variant_label
                      ? `${directlyLinkedCatalogProduct.name} (${(directlyLinkedCatalogProduct as any).variant_label})`
                      : directlyLinkedCatalogProduct.name}
                  </strong>
                  .
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setSaveMode('spec_variant');
                if (!selectedParentProductId && suggestedParentProduct?.id) {
                  setSelectedParentProductId(suggestedParentProduct.id);
                  const suggestedLbl = deriveSuggestedVariantLabel(lineItem, suggestedParentProduct);
                  setVariantLabel(suggestedLbl);
                  const baseSku = (suggestedParentProduct.sku || 'SKU').replace(/-V\d+$/i, '').trim();
                  const suffix =
                    suggestedLbl
                      .replace(/[^A-Za-z0-9]/g, '')
                      .slice(0, 6)
                      .toUpperCase() || `V${(suggestedParentProduct.spec_variants?.length || 0) + 1}`;
                  setSku(`${baseSku}-${suffix}`);
                }
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                saveMode === 'spec_variant'
                  ? 'bg-violet-50/90 border-violet-500 ring-1 ring-violet-500/40 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-violet-950">
                  <Sparkles className="w-3.5 h-3.5 text-violet-600 shrink-0" />
                  <span className="truncate">
                    {directlyLinkedCatalogProduct ? '2. ' : '1. '}Save as New Size / Variant
                  </span>
                </span>
                {modalDiffSummary?.hasIdentifyingDrift && (
                  <span className="px-1.5 py-0.2 rounded bg-violet-600 text-white font-mono text-[9px] uppercase shrink-0">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-slate-600 leading-snug">
                Keeps shared brand, photo &amp; base specs from{' '}
                <strong className="text-slate-800">
                  {selectedParentProduct?.product_family ||
                    selectedParentProduct?.name ||
                    suggestedParentProduct?.product_family ||
                    suggestedParentProduct?.name ||
                    'Parent Family'}
                </strong>{' '}
                and saves this as a new variant option.
              </p>
            </button>

            <button
              type="button"
              onClick={() => {
                setSaveMode('new_product');
                if (
                  directlyLinkedCatalogProduct &&
                  sku.trim().toLowerCase() === (directlyLinkedCatalogProduct.sku || '').trim().toLowerCase()
                ) {
                  const basePrefix = (brandMake || category || 'CAT')
                    .replace(/[^A-Za-z0-9]/g, '')
                    .slice(0, 3)
                    .toUpperCase() || 'ITM';
                  setSku(`${basePrefix}-${Math.floor(1000 + Math.random() * 9000)}`);
                }
              }}
              className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between gap-1.5 ${
                saveMode === 'new_product'
                  ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500/40 shadow-xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-950">
                  <Package className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="truncate">
                    {directlyLinkedCatalogProduct ? '3. ' : '2. '}Save as Separate Standalone Product
                  </span>
                </span>
              </div>
              <p className="text-[10.5px] text-slate-600 leading-snug">
                Creates an independent catalog product with its own standalone SKU and specifications.
              </p>
            </button>
          </div>

          {saveMode === 'spec_variant' && (
            <div className="p-3.5 rounded-xl bg-violet-50/80 border border-violet-200 space-y-3">
              <div>
                <label className="block text-[11px] font-mono font-bold uppercase text-violet-900 mb-1">
                  1. Select Existing Parent Catalog Product <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={parentSearchQuery}
                  onChange={(e) => setParentSearchQuery(e.target.value)}
                  placeholder="Search existing catalog product by name, SKU, brand, or model..."
                  className="w-full bg-white border border-violet-200 focus:border-violet-500 rounded-xl py-1.5 px-3 text-xs text-slate-900 mb-2 focus:outline-none"
                />
                <div className="max-h-36 overflow-y-auto rounded-xl border border-violet-200 bg-white divide-y divide-slate-100">
                  {filteredParentProducts.length === 0 ? (
                    <div className="p-3 text-xs text-slate-400 text-center">
                      No matching catalog products found.
                    </div>
                  ) : (
                    filteredParentProducts.map((prod) => {
                      const isSelected = prod.id === selectedParentProductId;
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => {
                            setSelectedParentProductId(prod.id);
                            setCategory(prod.product_type || category);
                            if (prod.brand_make && !brandMake) setBrandMake(prod.brand_make);
                            const suggestedLabel = deriveSuggestedVariantLabel(lineItem, prod);
                            setVariantLabel(suggestedLabel);
                            const baseSku = prod.sku || 'SKU';
                            const suffix =
                              suggestedLabel
                                .replace(/[^A-Za-z0-9]/g, '')
                                .slice(0, 6)
                                .toUpperCase() || `V${(prod.spec_variants?.length || 0) + 1}`;
                            setSku(`${baseSku}-${suffix}`);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 text-xs transition cursor-pointer ${
                            isSelected ? 'bg-violet-100/90 text-violet-950 font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold">{prod.name}</div>
                            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                              <span>SKU: {prod.sku || 'N/A'}</span>
                              {prod.brand_make && <span>• {prod.brand_make}</span>}
                              {Array.isArray(prod.spec_variants) && prod.spec_variants.length > 0 && (
                                <span className="text-violet-600 font-bold">
                                  • {prod.spec_variants.length} variant(s)
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-mono text-[11px] font-bold text-emerald-700 shrink-0">
                            AED {Number(prod.unit_price || 0).toLocaleString()}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase text-violet-900 mb-1">
                    2. Variant Name / Differentiating Spec <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={variantLabel}
                    onChange={(e) => setVariantLabel(e.target.value)}
                    placeholder='e.g. EPDM / 3/4" / 500 mm or 36x72 Variant'
                    className="w-full bg-white border border-violet-300 focus:border-violet-600 rounded-xl py-1.5 px-3 text-xs font-semibold text-slate-900 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono font-bold uppercase text-violet-900 mb-1">
                    Variant Sub-SKU (Optional)
                  </label>
                  <input
                    type="text"
                    value={sku ?? ''}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="e.g. SKU-1042-EPDM"
                    className="w-full bg-white border border-violet-300 focus:border-violet-600 rounded-xl py-1.5 px-3 text-xs font-mono text-slate-900 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

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
              placeholder="e.g. Industrial Control Module / Equipment Unit"
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
                placeholder="e.g. SKU-1042"
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
                placeholder="e.g. Siemens, ABB, Schneider, Bosch"
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
                placeholder="e.g. MOD-200X"
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

          {/* Commercial & Technical Description */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[11px] font-mono font-bold uppercase text-slate-500">
                Commercial &amp; Technical Description
              </label>
              {attributes.some((a) => (a.key || '').trim() && (a.value || '').trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    const compiled = compileDescriptionWithSpecs(name, description, attributes);
                    if (compiled) setDescription(compiled);
                  }}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer hover:underline"
                >
                  Sync from Spec Attributes
                </button>
              )}
            </div>
            <textarea
              rows={3}
              value={description ?? ''}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed commercial narrative, operating conditions, materials of construction, or scope of supply..."
              className="w-full bg-white border border-slate-200 focus:border-blue-500 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none"
            />
          </div>

          {/* Product Image & Datasheet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                <span>Product Image &amp; Diagram</span>
              </span>
              <LineItemImageOptionsPopover
                itemTitle={name || 'Catalog Product'}
                imageUrl={imageUrl}
                secondaryImageUrl={secondaryImageUrl}
                imageCaption={imageCaption}
                secondaryImageCaption={secondaryImageCaption}
                imageAdjustments={imageAdjustments}
                activeWorkspace={activeWorkspace}
                triggerToast={triggerToast}
                showOverrideControls={false}
                onChange={(patch) => {
                  if ('image_url' in patch) setImageUrl(patch.image_url || '');
                  if ('secondary_image_url' in patch) setSecondaryImageUrl(patch.secondary_image_url || '');
                  if ('image_caption' in patch) setImageCaption(patch.image_caption || '');
                  if ('secondary_image_caption' in patch) setSecondaryImageCaption(patch.secondary_image_caption || '');
                  if ('image_adjustments' in patch) setImageAdjustments(patch.image_adjustments);
                }}
              />
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
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setAttributes((prev) => {
                          const prevCompiled = compileDescriptionWithSpecs(name, '', prev);
                          const next = prev.map((a, i) => (i === idx ? { ...a, key: nextVal } : a));
                          const curDesc = (description || '').trim();
                          if (
                            !curDesc ||
                            curDesc.toLowerCase() === (name || '').trim().toLowerCase() ||
                            curDesc === prevCompiled
                          ) {
                            setDescription(compileDescriptionWithSpecs(name, '', next));
                          }
                          return next;
                        });
                      }}
                      placeholder="Parameter"
                      className="w-[42%] bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-semibold text-slate-800 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={attr.value ?? ''}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setAttributes((prev) => {
                          const prevCompiled = compileDescriptionWithSpecs(name, '', prev);
                          const next = prev.map((a, i) => (i === idx ? { ...a, value: nextVal } : a));
                          const curDesc = (description || '').trim();
                          if (
                            !curDesc ||
                            curDesc.toLowerCase() === (name || '').trim().toLowerCase() ||
                            curDesc === prevCompiled
                          ) {
                            setDescription(compileDescriptionWithSpecs(name, '', next));
                          }
                          return next;
                        });
                      }}
                      placeholder="Value"
                      className="flex-1 bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs text-slate-800 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setAttributes((prev) => {
                          const prevCompiled = compileDescriptionWithSpecs(name, '', prev);
                          const next = prev.filter((_, i) => i !== idx);
                          const curDesc = (description || '').trim();
                          if (
                            !curDesc ||
                            curDesc.toLowerCase() === (name || '').trim().toLowerCase() ||
                            curDesc === prevCompiled
                          ) {
                            setDescription(compileDescriptionWithSpecs(name, '', next));
                          }
                          return next;
                        });
                      }}
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
            className={`px-5 py-2 ${
              saveMode === 'spec_variant'
                ? 'bg-violet-600 hover:bg-violet-700 disabled:bg-violet-400'
                : saveMode === 'update_linked'
                ? 'bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
            } text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {isSaving
                ? 'Saving...'
                : saveMode === 'spec_variant'
                ? 'Save as New Size / Variant & Link'
                : saveMode === 'update_linked'
                ? `Update Linked Item (${directlyLinkedCatalogProduct?.sku || directlyLinkedCatalogProduct?.name || 'SKU'})`
                : 'Save Standalone Product & Link'}
            </span>
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
