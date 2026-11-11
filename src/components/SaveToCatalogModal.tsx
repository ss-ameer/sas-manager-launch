import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import LineItemImageOptionsPopover from './common/LineItemImageOptionsPopover';
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
    const cleaned = line.replace(/^(?:[-•*▪▸]+|\d+[.)])\s*/, '').trim();
    const match = cleaned.match(/^([A-Za-z0-9][A-Za-z0-9\s/&().\-_#]{1,42}?)\s*:\s*(.+)$/);
    if (match) {
      const k = match[1].trim();
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
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        const lineKey = trimmed.slice(0, colonIdx).trim().toLowerCase();
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

/**
 * Non-destructively links an existing line item to a Catalog Product:
 * - If the line item is already populated (has name, price > 0, lead time, description, or attributes),
 *   ALL existing non-empty values on the line item are preserved intact! Only missing/blank fields
 *   (like image_url, brand_make, category, sku) are backfilled from the catalog product.
 * - If the line item is a brand-new blank row, it populates all default fields from the catalog product.
 */
export function linkLineItemToCatalogProductNonDestructive(
  existingItem: any,
  catalogProduct: Product,
  currency?: string,
  isVendorCostDoc?: boolean
): any {
  const effectiveCurrency = String(currency || existingItem?.currency || 'AED').toUpperCase();
  const prodCurrency = String(catalogProduct?.currency || 'AED').toUpperCase();
  const fxFromProdToItem =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(prodCurrency) / resolveToAedMultiplier(effectiveCurrency);

  const catalogUnitSell = Math.round(Number(catalogProduct.unit_price ?? (catalogProduct as any).selling_price ?? 0) * fxFromProdToItem * 100) / 100;
  const catalogUnitCost = Math.round(Number(catalogProduct.cost_price ?? catalogProduct.last_landed_cost ?? 0) * fxFromProdToItem * 100) / 100;
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
      attributes: hasExistingAttrs ? existingItem.attributes : (catalogProduct.attributes ? [...catalogProduct.attributes] : []),
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
  catalogProduct: Product,
  currency?: string,
  specVariant?: ProductSpecVariant | Product | null,
  isVendorCostDoc?: boolean
): any {
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

  const sourceAttrs =
    specVariant && Array.isArray(specVariant.attributes) && specVariant.attributes.length > 0
      ? specVariant.attributes
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

  const sourceLead =
    (specVariant as ProductSpecVariant)?.lead_time_note ||
    (specVariant as Product)?.default_availability ||
    catalogProduct.default_availability ||
    '';

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
  if (sourceLead) {
    specsRecord['Delivery'] = sourceLead;
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
    lead_time_note: sourceLead,
    availability: sourceLead,
    image_url: specVariant?.image_url || catalogProduct.image_url || existingItem?.image_url,
    secondary_image_url: catalogProduct.secondary_image_url || existingItem?.secondary_image_url,
    image_caption: catalogProduct.image_caption || existingItem?.image_caption,
    secondary_image_caption: catalogProduct.secondary_image_caption || existingItem?.secondary_image_caption,
    image_adjustments: catalogProduct.image_adjustments || existingItem?.image_adjustments,
    datasheet_attachment: catalogProduct.datasheet_attachment || existingItem?.datasheet_attachment,
    attributes: sourceAttrs.map((a) => ({ ...a })),
    specifications: Object.keys(specsRecord).length > 0 ? specsRecord : existingItem?.specifications,
    ...(scaledSubs
      ? {
          is_composite_set: true,
          sub_components: scaledSubs,
          package_pricing_mode: specVariant?.package_pricing_mode || catalogProduct.package_pricing_mode || 'itemized',
          option_scope_notes: specVariant?.option_scope_notes || catalogProduct.option_scope_notes || existingItem?.option_scope_notes
        }
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
    parentProduct,
    variantName,
    variantSku,
    products = [],
    setProducts,
    triggerToast,
    currency,
    activeWorkspaceId
  } = params;

  if (!parentProduct?.id) return null;

  const effectiveCurrency = String(currency || item?.currency || parentProduct?.currency || 'AED').toUpperCase();
  const prodCurrency = String(parentProduct?.currency || 'AED').toUpperCase();
  const fxMultiplier =
    effectiveCurrency === prodCurrency
      ? 1
      : resolveToAedMultiplier(effectiveCurrency) / resolveToAedMultiplier(prodCurrency);

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
      : parentProduct.unit_price;
  const scaledCost =
    item.cost_price !== undefined && item.cost_price !== null && !isNaN(Number(item.cost_price)) && Number(item.cost_price) > 0
      ? Math.round(Number(item.cost_price) * fxMultiplier * 100) / 100
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

  const baseSku = (parentProduct.sku || 'SKU').replace(/-V\d+$/i, '').trim();
  const resolvedVariantSku =
    (variantSku || '').trim() || `${baseSku}-V${existingVariants.length + 1}`;

  const specsMap: Record<string, string> = {};
  for (const a of finalAttrs) {
    if (a.key && a.value) specsMap[a.key] = a.value;
  }

  const newVariantEntry: ProductSpecVariant = {
    id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
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
    createdAt: new Date().toISOString()
  };

  const nextSpecVariants = [...existingVariants, newVariantEntry];

  // 1. Update parent product's spec_variants array
  const parentPatch: Partial<Product> = {
    spec_variants: nextSpecVariants,
    variants: nextSpecVariants,
    updatedAt: new Date().toISOString()
  };
  await safeUpdateDoc('products', parentProduct.id, parentPatch);
  const updatedParentProduct: Product = {
    ...parentProduct,
    ...parentPatch
  };

  // 2. Also create a sibling Variant Product record in 'products' so ProductManager & Catalog pickers surface it
  const rootParentId = parentProduct.variant_parent_id || parentProduct.id;
  const familyName = (parentProduct.product_family || parentProduct.name || '').trim();
  const variantProductName = (item.item_name || parentProduct.name || familyName).trim();
  const searchTerms = generateProductSearchTerms(
    variantProductName,
    parentProduct.product_type || 'General Equipment',
    resolvedVariantSku,
    cleanVariantLabel
  );

  const variantProductPayload: Partial<Product> = {
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
    attributes: finalAttrs,
    variant_parent_id: rootParentId,
    product_family: familyName || variantProductName,
    ...(scaledSubComponents ? { is_composite_set: true, sub_components: scaledSubComponents } : {}),
    ...(item.package_pricing_mode ? { package_pricing_mode: item.package_pricing_mode } : {}),
    ...(item.option_scope_notes ? { option_scope_notes: item.option_scope_notes } : {}),
    search_terms: searchTerms,
    is_inventoried: false,
    stock_on_hand: 0,
    stock_reserved: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const addedRes = await safeAddDoc('products', variantProductPayload);
  const newProdId = addedRes?.id || `prod_var_${Date.now()}`;
  const createdVariantProduct: Product = {
    id: newProdId,
    ...variantProductPayload
  } as Product;

  if (typeof setProducts === 'function') {
    setProducts((prev: Product[]) => {
      const updatedList = (prev || []).map((p) => (p.id === parentProduct.id ? updatedParentProduct : p));
      const finalList = [createdVariantProduct, ...updatedList.filter((p) => p.id !== newProdId)];
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('omni_products', JSON.stringify(finalList));
        }
      } catch (_) {}
      return finalList;
    });
  } else if (Array.isArray(products)) {
    try {
      const updatedList = products.map((p) => (p.id === parentProduct.id ? updatedParentProduct : p));
      const finalList = [createdVariantProduct, ...updatedList.filter((p) => p.id !== newProdId)];
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('omni_products', JSON.stringify(finalList));
      }
    } catch (_) {}
  }

  if (triggerToast) {
    triggerToast(
      `Saved "${cleanVariantLabel}" as new Spec Variant under ${parentProduct.sku || parentProduct.name}!`,
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

  // Gather available Spec Variants from both matchedProduct.spec_variants AND sibling products in catalog
  const availableVariants = useMemo(() => {
    const inlineVars: ProductSpecVariant[] = Array.isArray(matchedProduct.spec_variants)
      ? matchedProduct.spec_variants
      : Array.isArray(matchedProduct.variants)
      ? matchedProduct.variants
      : [];

    const rootId = matchedProduct.variant_parent_id || matchedProduct.id;
    const familyLower = (matchedProduct.product_family || matchedProduct.name || '').trim().toLowerCase();
    const siblingProducts = (products || []).filter((p) => {
      if (!p || p.is_deleted || p.id === matchedProduct.id) return false;
      if (rootId && (p.variant_parent_id === rootId || p.id === rootId)) return true;
      if (familyLower && (p.product_family || p.name || '').trim().toLowerCase() === familyLower) return true;
      return false;
    });

    return { inlineVars, siblingProducts };
  }, [matchedProduct, products]);

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
    const suggested = deriveSuggestedVariantLabel(item, matchedProduct);
    const existingCount =
      availableVariants.inlineVars.length + availableVariants.siblingProducts.length;
    const baseSku = (matchedProduct.sku || 'SKU').replace(/-V\d+$/i, '').trim();
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
        parentProduct: matchedProduct,
        variantName: variantLabelInput.trim() || deriveSuggestedVariantLabel(item, matchedProduct),
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
              p.id === matchedProduct.id ? res.updatedParentProduct : p
            );
            return [res.createdVariantProduct, ...updated.filter((p) => p.id !== res.createdVariantProduct.id)];
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
      isVendorCostDoc
    );
    onUpdateLineItem(resetItem);
    const label =
      (targetVariant as ProductSpecVariant)?.variant_name ||
      (targetVariant as Product)?.sku ||
      matchedProduct.sku ||
      matchedProduct.name;
    if (triggerToast) {
      triggerToast(`Pulled catalog defaults from ${label} into this line item.`, 'info');
    }
    setIsOpen(false);
  };

  const skuDisplay = matchedProduct.sku || matchedProduct.name || 'SKU';
  const totalVariantCount =
    availableVariants.inlineVars.length + availableVariants.siblingProducts.length;

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
            ? `This line item has custom edits differing from Catalog SKU ${skuDisplay}. Click to Save as Variant, Update Master SKU, or Pull Defaults.`
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
          className="absolute left-0 top-full mt-1.5 w-80 sm:w-88 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-[220] p-2 space-y-1.5 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2 py-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="font-mono font-bold text-[10px] uppercase tracking-wider text-slate-500 truncate">
              SKU: {skuDisplay}
            </span>
            <span
              className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded ${
                drifted
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {drifted ? 'Custom Quote Edits' : 'In Sync with SKU'}
            </span>
          </div>

          {/* Action 1: Save as Spec Variant on SKU */}
          <div className="rounded-lg border border-indigo-200/80 bg-indigo-50/40 dark:bg-indigo-950/30 p-2 space-y-2">
            {!showVariantPrompt ? (
              <button
                type="button"
                onClick={handleOpenVariantPrompt}
                className="w-full text-left flex items-start gap-2 cursor-pointer group"
              >
                <div className="p-1.5 rounded-lg bg-indigo-600 text-white shrink-0 mt-0.5 group-hover:bg-indigo-700 transition">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-indigo-950 dark:text-indigo-200 text-xs flex items-center gap-1">
                    <span>✨ Save as Spec Variant on SKU</span>
                  </div>
                  <p className="text-[10.5px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5">
                    Keep master SKU intact &amp; save this item&apos;s size, specs &amp; price as a reusable variant under {skuDisplay}
                  </p>
                </div>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-indigo-950 text-[11px] flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-indigo-600" />
                    <span>New Spec Variant under {skuDisplay}</span>
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
                    placeholder='e.g. 63" x 67" - 10.5 Bar'
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

          {/* Action 2: Update Master Catalog SKU (Overwrite Catalog) */}
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
                ↑ Update Master Catalog SKU (Overwrite Catalog)
              </div>
              <p className="text-[10.5px] text-slate-500 leading-snug mt-0.5">
                Push this item&apos;s specs, price, delivery &amp; photo to update master SKU {skuDisplay}
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
                ↓ Pull Defaults from Catalog (Reset Item)
              </div>
              <p className="text-[10.5px] text-slate-500 leading-snug mt-0.5">
                Replace this item&apos;s price, delivery &amp; specs with Catalog SKU {skuDisplay} defaults
              </p>
            </div>
          </button>

          {/* Spec Variant Selector when SKU has saved variants */}
          {totalVariantCount > 0 && (
            <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1">
              <span className="px-2 block text-[9.5px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Or Pull Specific Spec Variant ({totalVariantCount})
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
                  const sibLabel = deriveSuggestedVariantLabel(
                    {
                      item_name: sp.name,
                      model_part_no: sp.model_part_no,
                      attributes: sp.attributes
                    },
                    matchedProduct
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
  onSaved?: (newProduct: Product) => void;
  onProductSaved?: (newProduct: Product) => void;
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

  // Mode: 'new_product' (Create New Catalog SKU) vs 'spec_variant' (Attach as Spec Variant to Existing SKU)
  const [saveMode, setSaveMode] = useState<'new_product' | 'spec_variant'>(initialMode);
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
    setSaveMode(initialMode || 'new_product');
    setSelectedParentProductId('');
    setParentSearchQuery('');
    setVariantLabel(deriveSuggestedVariantLabel(lineItem, null));
  }, [isOpen, lineItem, propCurrency, initialMode]);

  const suggestedChips = useMemo(() => {
    const known = category ? CATEGORY_SUGGESTED_ATTRIBUTES[category] || [] : [];
    const defaults = ['Dimensions / Size', 'Material / Grade', 'Capacity / Rating', 'Operating Pressure', 'Warranty'];
    const merged = Array.from(new Set([...known, ...defaults]));
    const used = new Set(attributes.map((a) => (a.key || '').trim().toLowerCase()));
    return merged.filter((k) => !used.has(k.toLowerCase())).slice(0, 8);
  }, [category, attributes]);

  const filteredParentProducts = useMemo(() => {
    const list = (products || []).filter((p) => !p.variant_parent_id);
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
        .filter((a) => a.key !== '' && a.value !== '');

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

        if (onSaved) onSaved(res.createdVariantProduct);
        if (onProductSaved) onProductSaved(res.createdVariantProduct);
        onClose();
        return;
      }

      const productPayload: Partial<Product> = {
        workspace_id: activeWorkspace?.id || activeWorkspaceId || 'ws_default',
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

      const nextProductsList = [createdProduct, ...(products || []).filter((p) => p.id !== newId)];
      if (setProducts) {
        setProducts(nextProductsList);
      }
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('omni_products', JSON.stringify(nextProductsList));
        }
      } catch (_) {}

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
          {/* 2-Option Mode Switcher: New Catalog Product vs Attach as Spec Variant */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setSaveMode('new_product')}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                saveMode === 'new_product'
                  ? 'bg-white text-blue-700 shadow-xs border border-blue-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Create New Catalog Product (New SKU)</span>
            </button>
            <button
              type="button"
              onClick={() => setSaveMode('spec_variant')}
              className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                saveMode === 'spec_variant'
                  ? 'bg-white text-violet-700 shadow-xs border border-violet-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Attach as Spec Variant to Existing SKU...</span>
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
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
            } text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              {isSaving
                ? 'Saving...'
                : saveMode === 'spec_variant'
                ? 'Save as Spec Variant & Link Item'
                : 'Save to Catalog & Link Item'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
}
