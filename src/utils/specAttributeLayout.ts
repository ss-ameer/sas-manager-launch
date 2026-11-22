import type { QuotationLineItem, QuotationPresetColumns } from '../types';

export type CoreSpecAttributeCanonicalKey = 'brand' | 'model' | 'origin' | 'delivery';

export interface CoreSpecAttributeDef {
  label: 'Brand' | 'Model' | 'Origin' | 'Delivery';
  canonicalKey: CoreSpecAttributeCanonicalKey;
  columnFlag: 'brand' | 'model' | 'origin' | 'availability';
  shortHint: string;
}

export const CORE_SPEC_ATTRIBUTES: readonly CoreSpecAttributeDef[] = [
  { label: 'Brand', canonicalKey: 'brand', columnFlag: 'brand', shortHint: 'Make / Manufacturer' },
  { label: 'Model', canonicalKey: 'model', columnFlag: 'model', shortHint: 'Model / Part #' },
  { label: 'Origin', canonicalKey: 'origin', columnFlag: 'origin', shortHint: 'Country of Origin' },
  { label: 'Delivery', canonicalKey: 'delivery', columnFlag: 'availability', shortHint: 'Availability / Lead Time' }
] as const;

export const CORE_SPEC_CANONICAL_SET = new Set<string>(
  CORE_SPEC_ATTRIBUTES.map((c) => c.canonicalKey)
);

export const CORE_SPEC_COLUMN_FLAG_MAP: Record<
  CoreSpecAttributeCanonicalKey,
  'brand' | 'model' | 'origin' | 'availability'
> = {
  brand: 'brand',
  model: 'model',
  origin: 'origin',
  delivery: 'availability'
};

/**
 * Canonical attribute key normalizer (UK/US spelling + core metadata synonyms).
 * Shared across QuotationStudioModal, QuotationDocument (renderer + pagination estimator),
 * QuotationRepository, and unit tests.
 */
export function canonicalSpecAttributeKey(rawKey: string): string {
  const norm = String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\bcolours\b/g, 'color')
    .replace(/\bcolour\b/g, 'color')
    .replace(/\bcentre\b/g, 'center')
    .replace(/\bmetre\b/g, 'meter')
    .replace(/\bmetres\b/g, 'meters')
    .replace(/\bmillimetre\b/g, 'millimeter')
    .replace(/\bmillimetres\b/g, 'millimeters')
    .replace(/\bcentimetre\b/g, 'centimeter')
    .replace(/\bcentimetres\b/g, 'centimeters')
    .replace(/\blitre\b/g, 'liter')
    .replace(/\blitres\b/g, 'liters')
    .replace(/\bvapour\b/g, 'vapor')
    .replace(/\baluminium\b/g, 'aluminum')
    .replace(/\barmour\b/g, 'armor')
    .replace(/\barmoured\b/g, 'armored')
    .replace(/\bdimensions\b/g, 'dimension');

  if (
    norm === 'brand' ||
    norm === 'make' ||
    norm === 'brand make' ||
    norm === 'make brand' ||
    norm === 'manufacturer' ||
    norm === 'brand manufacturer'
  ) {
    return 'brand';
  }
  if (
    norm === 'model' ||
    norm === 'model no' ||
    norm === 'part no' ||
    norm === 'part' ||
    norm === 'model part' ||
    norm === 'model part no'
  ) {
    return 'model';
  }
  if (
    norm === 'origin' ||
    norm === 'country' ||
    norm === 'country of origin' ||
    norm === 'origin country'
  ) {
    return 'origin';
  }
  if (
    norm === 'delivery' ||
    norm === 'availability' ||
    norm === 'delivery availability' ||
    norm === 'lead time' ||
    norm === 'lead time delivery' ||
    norm === 'delivery lead time' ||
    norm === 'delivery time' ||
    norm === 'delivery period'
  ) {
    return 'delivery';
  }
  return norm;
}

export function isCoreSpecAttributeKey(key: string): boolean {
  return CORE_SPEC_CANONICAL_SET.has(canonicalSpecAttributeKey(key));
}

export function getCoreSpecColumnFlag(
  key: string
): 'brand' | 'model' | 'origin' | 'availability' | undefined {
  const cKey = canonicalSpecAttributeKey(key) as CoreSpecAttributeCanonicalKey;
  return CORE_SPEC_COLUMN_FLAG_MAP[cKey];
}

/**
 * Determine whether an attribute (core or custom technical spec) is globally visible
 * under `visibleColumns`, keeping `brand`/`model`/`origin`/`availability` boolean flags
 * and `hiddenAttributeKeys` in strict two-way sync.
 */
export function isGlobalAttributeVisible(
  visibleColumns: QuotationPresetColumns | undefined,
  key: string
): boolean {
  const cols = visibleColumns || {};
  const cKey = canonicalSpecAttributeKey(key);
  const colFlag = getCoreSpecColumnFlag(key);
  if (colFlag && cols[colFlag] === false) {
    return false;
  }
  const hidden = cols.hiddenAttributeKeys || [];
  const isInHidden = hidden.some(
    (hk) => hk === key || canonicalSpecAttributeKey(hk) === cKey
  );
  return !isInHidden;
}

/**
 * Return updated `QuotationPresetColumns` with a single attribute's visibility toggled
 * (or forced to a target visibility). Keeps `brand`/`model`/`origin`/`availability`
 * and `hiddenAttributeKeys` strictly synchronized for full backward compatibility.
 */
export function setGlobalAttributeVisibility(
  prev: QuotationPresetColumns,
  key: string,
  nextVisible?: boolean
): QuotationPresetColumns {
  const cKey = canonicalSpecAttributeKey(key);
  const colFlag = getCoreSpecColumnFlag(key);
  const currentlyVisible = isGlobalAttributeVisible(prev, key);
  const shouldBeVisible = nextVisible !== undefined ? nextVisible : !currentlyVisible;

  const currentHidden = prev.hiddenAttributeKeys || [];
  const cleanedHidden = currentHidden.filter(
    (k) => k !== key && canonicalSpecAttributeKey(k) !== cKey
  );

  const nextCols: QuotationPresetColumns = {
    ...prev,
    hiddenAttributeKeys: shouldBeVisible ? cleanedHidden : [...cleanedHidden, key]
  };

  if (colFlag) {
    nextCols[colFlag] = shouldBeVisible;
  }

  return nextCols;
}

/**
 * Show all global attributes (core + custom specs).
 */
export function showAllGlobalAttributes(prev: QuotationPresetColumns): QuotationPresetColumns {
  return {
    ...prev,
    brand: true,
    model: true,
    origin: true,
    availability: true,
    hiddenAttributeKeys: []
  };
}

/**
 * Hide all global attributes (core + custom specs).
 */
export function hideAllGlobalAttributes(
  prev: QuotationPresetColumns,
  allGlobalKeys: string[]
): QuotationPresetColumns {
  const deduped: string[] = [];
  const seen = new Set<string>();
  const pushKey = (k: string) => {
    const c = canonicalSpecAttributeKey(k);
    if (!c || seen.has(c)) return;
    seen.add(c);
    deduped.push(k);
  };
  CORE_SPEC_ATTRIBUTES.forEach((c) => pushKey(c.label));
  allGlobalKeys.forEach((k) => pushKey(k));

  return {
    ...prev,
    brand: false,
    model: false,
    origin: false,
    availability: false,
    hiddenAttributeKeys: deduped
  };
}

export type QuickSpecLayoutPresetId =
  | 'metadata_2up_tech_full'
  | 'all_balanced_2col'
  | 'all_full_width';

/**
 * Build a 1-click quick layout preset patch for global `visibleColumns`.
 * - `metadata_2up_tech_full`: Brand, Model, Origin, Delivery first in 2-up 50% grid,
 *   all non-core technical specs promoted to 100% full-width rows.
 * - `all_balanced_2col`: Balanced 2-column grid with no forced full-width or manual breaks.
 * - `all_full_width`: Every attribute spans 100% full-width (1 per row) for datasheet clarity.
 */
export function buildQuickSpecLayoutPreset(
  presetId: QuickSpecLayoutPresetId,
  orderedGlobalKeys: string[],
  prev: QuotationPresetColumns
): QuotationPresetColumns {
  // Build deduplicated full key pool ensuring core attrs exist
  const coreKeys: string[] = [];
  const techKeys: string[] = [];
  const seen = new Set<string>();

  const existingByCanonical = new Map<string, string>();
  orderedGlobalKeys.forEach((k) => {
    const c = canonicalSpecAttributeKey(k);
    if (c && !existingByCanonical.has(c)) {
      existingByCanonical.set(c, k);
    }
  });

  if (presetId === 'metadata_2up_tech_full') {
    CORE_SPEC_ATTRIBUTES.forEach((core) => {
      const label = existingByCanonical.get(core.canonicalKey) || core.label;
      if (!seen.has(core.canonicalKey)) {
        seen.add(core.canonicalKey);
        coreKeys.push(label);
      }
    });
    orderedGlobalKeys.forEach((k) => {
      const c = canonicalSpecAttributeKey(k);
      if (!c || seen.has(c)) return;
      seen.add(c);
      techKeys.push(k);
    });
    const nextOrder = [...coreKeys, ...techKeys];
    return {
      ...prev,
      showItemAttributes: true,
      attributeDisplayFormat:
        prev.attributeDisplayFormat === 'table_2col' ? 'table_2col' : 'grid_2col_balanced',
      attributeLayoutOrder: nextOrder,
      attributeFullWidthKeys: [...techKeys],
      attributeLineBreaksAfter: [],
      balanceOrphanAttributeRow: true
    };
  }

  if (presetId === 'all_balanced_2col') {
    return {
      ...prev,
      showItemAttributes: true,
      attributeDisplayFormat:
        prev.attributeDisplayFormat === 'table_2col' ? 'table_2col' : 'grid_2col_balanced',
      attributeFullWidthKeys: [],
      attributeLineBreaksAfter: [],
      balanceOrphanAttributeRow: true
    };
  }

  // 'all_full_width'
  const allKeys: string[] = [];
  orderedGlobalKeys.forEach((k) => {
    const c = canonicalSpecAttributeKey(k);
    if (!c || seen.has(c)) return;
    seen.add(c);
    allKeys.push(k);
  });
  CORE_SPEC_ATTRIBUTES.forEach((core) => {
    if (!seen.has(core.canonicalKey)) {
      seen.add(core.canonicalKey);
      allKeys.push(core.label);
    }
  });
  return {
    ...prev,
    showItemAttributes: true,
    attributeDisplayFormat:
      prev.attributeDisplayFormat === 'table_2col' ? 'table_2col' : 'grid_2col_balanced',
    attributeFullWidthKeys: allKeys,
    attributeLineBreaksAfter: []
  };
}

/**
 * Sort a list of attribute keys according to a saved order array (matching canonically).
 * Unlisted keys preserve their original relative order after listed keys.
 */
export function sortAttributeKeysByOrder(
  keys: string[],
  orderList?: string[]
): string[] {
  if (!Array.isArray(orderList) || orderList.length === 0) {
    return [...keys];
  }
  const orderCanonical = orderList.map((k) => canonicalSpecAttributeKey(k));
  return [...keys].sort((a, b) => {
    const idxA = orderCanonical.indexOf(canonicalSpecAttributeKey(a));
    const idxB = orderCanonical.indexOf(canonicalSpecAttributeKey(b));
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });
}

/**
 * Detect whether a line item has any active per-item attribute layout or visibility overrides.
 */
export function hasItemAttributeOverrides(
  item: Pick<
    QuotationLineItem,
    | 'visible_attributes'
    | 'hidden_attributes'
    | 'attribute_order'
    | 'attribute_line_breaks_after'
    | 'attribute_full_width_keys'
  >,
  itemVisibleOverride?: string[]
): boolean {
  if (itemVisibleOverride !== undefined) return true;
  if (Array.isArray(item.visible_attributes)) return true;
  if (Array.isArray(item.hidden_attributes) && item.hidden_attributes.length > 0) return true;
  if (Array.isArray(item.attribute_order) && item.attribute_order.length > 0) return true;
  if (Array.isArray(item.attribute_line_breaks_after)) return true;
  if (Array.isArray(item.attribute_full_width_keys)) return true;
  return false;
}

export interface ResolvedLineItemAttribute {
  key: string;
  value: string;
  canonicalKey: string;
  isCore: boolean;
  hasBreakAfter: boolean;
  isFullWidth: boolean;
}

export interface ResolvedLineItemAttributeLayout {
  attributes: ResolvedLineItemAttribute[];
  rows: ResolvedLineItemAttribute[][];
}

/**
 * Pure deterministic attribute layout resolver for a line item.
 * Combines core metadata (Brand, Model, Origin, Delivery) + custom technical specs,
 * applies global + per-item visibility, canonical ordering, `100%` full-width span,
 * and `↵` line breaks, and partitions them into 2-col or 3-col grid rows.
 */
export function resolveLineItemAttributeLayout(
  item: QuotationLineItem,
  visibleColumns: QuotationPresetColumns | undefined,
  extractedSpecsAttrs: Array<{ key: string; value: string }> = []
): ResolvedLineItemAttributeLayout {
  const colCfg = visibleColumns || {};
  const showBrand = colCfg.brand !== false;
  const showModel = colCfg.model !== false;
  const showOrigin = colCfg.origin !== false;
  const showAvailability = colCfg.availability !== false;
  const hiddenAttributeKeys = colCfg.hiddenAttributeKeys || [];
  const attrFormat = colCfg.attributeDisplayFormat || 'grid_2col_balanced';
  const maxCols = attrFormat === 'grid_3col' ? 3 : 2;

  const itemAny = item as any;
  const allAttrs: Array<{ key: string; value: string }> = [];

  if (showBrand && item.brand_make && item.brand_make.trim() && item.brand_make !== '—') {
    allAttrs.push({ key: 'Brand', value: item.brand_make.trim() });
  }
  if (showModel && item.model_part_no && item.model_part_no.trim() && item.model_part_no !== '—') {
    allAttrs.push({ key: 'Model', value: item.model_part_no.trim() });
  }
  if (
    showOrigin &&
    item.country_of_origin &&
    item.country_of_origin.trim() &&
    item.country_of_origin !== '—'
  ) {
    allAttrs.push({ key: 'Origin', value: item.country_of_origin.trim() });
  }
  const deliveryVal = String(
    item.availability || itemAny.lead_time_note || itemAny.delivery_time || ''
  ).trim();
  if (showAvailability && deliveryVal) {
    allAttrs.push({ key: 'Delivery', value: deliveryVal });
  }

  const rawAttrs: Array<{ key: string; value: string }> = [];
  if (Array.isArray(item.attributes)) {
    item.attributes.forEach((attr) => {
      if (attr && (attr.key || (attr as any).name) && attr.value) {
        rawAttrs.push({
          key: String(attr.key || (attr as any).name).trim(),
          value: String(attr.value).trim()
        });
      }
    });
  } else if (itemAny.attributes && typeof itemAny.attributes === 'object') {
    Object.entries(itemAny.attributes).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v).trim() !== '') {
        rawAttrs.push({ key: k.trim(), value: String(v).trim() });
      }
    });
  }

  if (Array.isArray(itemAny.specs)) {
    itemAny.specs.forEach((s: any) => {
      if (s && s.key && s.value) {
        rawAttrs.push({ key: String(s.key).trim(), value: String(s.value).trim() });
      }
    });
  }
  if (Array.isArray(itemAny.specifications)) {
    itemAny.specifications.forEach((s: any) => {
      if (s && s.key && s.value) {
        rawAttrs.push({ key: String(s.key).trim(), value: String(s.value).trim() });
      }
    });
  }
  extractedSpecsAttrs.forEach((ea) => {
    if (ea && ea.key && ea.value) {
      rawAttrs.push({ key: String(ea.key).trim(), value: String(ea.value).trim() });
    }
  });

  rawAttrs.forEach((attr) => {
    const cKey = canonicalSpecAttributeKey(attr.key);
    if (cKey === 'brand' && !showBrand) return;
    if (cKey === 'model' && !showModel) return;
    if (cKey === 'origin' && !showOrigin) return;
    if (cKey === 'delivery' && !showAvailability) return;
    if (!allAttrs.some((a) => canonicalSpecAttributeKey(a.key) === cKey)) {
      allAttrs.push(attr);
    }
  });

  const itemVisibleKeys = Array.isArray(item.visible_attributes)
    ? item.visible_attributes.map((k) => canonicalSpecAttributeKey(k))
    : undefined;
  const itemHiddenKeys = Array.isArray(item.hidden_attributes)
    ? item.hidden_attributes.map((k) => canonicalSpecAttributeKey(k))
    : undefined;

  const visibleAttrs = allAttrs.filter((attr) => {
    const kLower = attr.key.toLowerCase();
    const cKey = canonicalSpecAttributeKey(attr.key);
    if (
      hiddenAttributeKeys.some(
        (hk) => hk.toLowerCase() === kLower || canonicalSpecAttributeKey(hk) === cKey
      )
    ) {
      return false;
    }
    if (itemVisibleKeys !== undefined) {
      return (
        itemVisibleKeys.includes(cKey) ||
        item.visible_attributes!.some((k) => String(k || '').toLowerCase() === kLower)
      );
    }
    if (itemHiddenKeys !== undefined) {
      return (
        !itemHiddenKeys.includes(cKey) &&
        !item.hidden_attributes!.some((k) => String(k || '').toLowerCase() === kLower)
      );
    }
    return true;
  });

  if (visibleAttrs.length === 0) {
    return { attributes: [], rows: [] };
  }

  const effectiveOrderRaw =
    Array.isArray(item.attribute_order) && item.attribute_order.length > 0
      ? item.attribute_order
      : Array.isArray(colCfg.attributeLayoutOrder)
      ? colCfg.attributeLayoutOrder
      : [];
  const effectiveOrderCanonical = effectiveOrderRaw.map((k) => canonicalSpecAttributeKey(k));

  const orderedAttrs = [...visibleAttrs].sort((a, b) => {
    const idxA = effectiveOrderCanonical.indexOf(canonicalSpecAttributeKey(a.key));
    const idxB = effectiveOrderCanonical.indexOf(canonicalSpecAttributeKey(b.key));
    if (idxA === -1 && idxB === -1) return 0;
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const breakSet = new Set<string>(
    (Array.isArray(item.attribute_line_breaks_after)
      ? item.attribute_line_breaks_after
      : colCfg.attributeLineBreaksAfter || []
    ).map((k) => canonicalSpecAttributeKey(k))
  );

  const fullWidthSet = new Set<string>(
    (Array.isArray(item.attribute_full_width_keys)
      ? item.attribute_full_width_keys
      : colCfg.attributeFullWidthKeys || []
    ).map((k) => canonicalSpecAttributeKey(k))
  );

  const enriched: ResolvedLineItemAttribute[] = orderedAttrs.map((a) => {
    const cKey = canonicalSpecAttributeKey(a.key);
    return {
      key: a.key,
      value: a.value,
      canonicalKey: cKey,
      isCore: CORE_SPEC_CANONICAL_SET.has(cKey),
      hasBreakAfter: breakSet.has(cKey),
      isFullWidth: fullWidthSet.has(cKey)
    };
  });

  const rows: ResolvedLineItemAttribute[][] = [];
  let currentRow: ResolvedLineItemAttribute[] = [];
  enriched.forEach((attr) => {
    if (attr.isFullWidth) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
      rows.push([attr]);
      return;
    }
    currentRow.push(attr);
    if (attr.hasBreakAfter || currentRow.length >= maxCols) {
      rows.push(currentRow);
      currentRow = [];
    }
  });
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return { attributes: enriched, rows };
}
