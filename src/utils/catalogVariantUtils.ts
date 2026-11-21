import type { Product, ProductAttribute, ProductSpecVariant, LineItemComponent } from '../types';

export type ParentSyncFieldKey =
  | 'category'
  | 'brand_make'
  | 'country_of_origin'
  | 'lead_time'
  | 'description'
  | 'media'
  | 'datasheet'
  | 'shared_specs'
  | 'sub_components';

export const ALL_PARENT_SYNC_FIELDS: ParentSyncFieldKey[] = [
  'category',
  'brand_make',
  'country_of_origin',
  'lead_time',
  'description',
  'media',
  'datasheet',
  'shared_specs',
  'sub_components'
];

export interface VariantSkuDraftInput {
  variant_label?: string | null;
  model_part_no?: string | null;
  name?: string | null;
  attributes?: ProductAttribute[] | null;
}

const NAME_STOP_WORDS = new Set([
  'with',
  'for',
  'and',
  'of',
  'the',
  'in',
  'to',
  'by',
  'on',
  'at',
  'from',
  'type',
  'series',
  'model',
  'unit',
  'set',
  'assembly',
  'system',
  'complete',
  'standard',
  'industrial',
  'commercial'
]);

const PROTECTED_SPEC_KEY_PATTERNS: RegExp[] = [
  /^dimensions?(\s*\/\s*size)?$/i,
  /^size$/i,
  /^(vessel\s*)?(dia|diameter)$/i,
  /^capacity$/i,
  /^flow(\s*rate)?$/i,
  /^connection(\s*size)?$/i,
  /^in\/?out(\s*size)?$/i,
  /^inlet\/?outlet(\s*size)?$/i,
  /^port(\s*size)?$/i,
  /^pipe(\s*size)?$/i,
  /^model(\s*(no|number|\/\s*part\s*no))?$/i,
  /^part(\s*(no|number))?$/i,
  /^sku$/i,
  /^(gross\s*|net\s*)?weight$/i,
  /^(motor\s*)?power$/i,
  /^voltage$/i,
  /^volume$/i,
  /^length$/i,
  /^height$/i,
  /^width$/i,
  /^rating$/i
];

const DISTINGUISHING_ATTR_PRIORITY_RE =
  /^(dimensions?(\s*\/\s*size)?|size|diameter|dia|capacity|flow(\s*rate)?|connection(\s*size)?|in\/?out(\s*size)?|port(\s*size)?|model(\s*no)?|part(\s*no)?|rating|power|voltage|volume|length)$/i;

function stripDiacritics(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function sanitizeSkuSegment(raw: string): string {
  return stripDiacritics(raw)
    .toUpperCase()
    .replace(/["'″′`]/g, '')
    .replace(/[\s/_\\@+&,;:()[\]{}]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generates a clean uppercase base SKU for a Master Parent product
 * (e.g. "Aventura" + "Multi Media Filter" -> "AVE-MMF").
 */
export function suggestParentBaseSku(
  brand?: string | null,
  productName?: string | null,
  category?: string | null
): string {
  const cleanBrandWords = stripDiacritics(brand || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  let brandCode = '';
  if (cleanBrandWords.length === 1) {
    brandCode = cleanBrandWords[0].slice(0, 3).toUpperCase();
  } else if (cleanBrandWords.length > 1) {
    const initials = cleanBrandWords
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase();
    brandCode =
      initials.length >= 2
        ? initials
        : cleanBrandWords[0].slice(0, 3).toUpperCase();
  }

  const brandWordSet = new Set(cleanBrandWords.map((w) => w.toLowerCase()));

  // Strip embedded dimensions (e.g. 36" x 72", 12", DN50) before building series code
  const cleanedName = stripDiacritics(productName || '')
    .replace(/\b\d+(?:\.\d+)?\s*(?:"|″|in(?:ch(?:es)?)?|mm|cm|m|ft)?\s*[x×*]\s*\d+(?:\.\d+)?\s*(?:"|″|in(?:ch(?:es)?)?|mm|cm|m|ft)?\b/gi, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:"|″|in(?:ch(?:es)?)?|mm|cm|m|l|lph|gpm|bar|kw|hp)\b/gi, ' ')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim();

  const rawNameWords = cleanedName
    .split(/\s+/)
    .filter((w) => w.length > 0 && !brandWordSet.has(w.toLowerCase()));

  const significantWords = rawNameWords.filter(
    (w) => !NAME_STOP_WORDS.has(w.toLowerCase()) && !/^\d+$/.test(w)
  );
  const wordsForSeries = significantWords.length > 0 ? significantWords : rawNameWords;

  let seriesCode = '';
  if (wordsForSeries.length >= 2) {
    seriesCode = wordsForSeries
      .slice(0, 4)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  } else if (wordsForSeries.length === 1) {
    seriesCode = wordsForSeries[0].slice(0, 3).toUpperCase();
  }

  // Fallback to category prefix when brand or series is missing
  const cleanCatWords = stripDiacritics(category || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !NAME_STOP_WORDS.has(w.toLowerCase()));

  if (!brandCode && cleanCatWords.length > 0) {
    brandCode =
      cleanCatWords.length >= 2
        ? cleanCatWords
            .slice(0, 3)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
        : cleanCatWords[0].slice(0, 3).toUpperCase();
  }

  if (!seriesCode && cleanCatWords.length > 0) {
    seriesCode = cleanCatWords[0].slice(0, 3).toUpperCase();
  }

  const parts = [brandCode, seriesCode]
    .map((p) => sanitizeSkuSegment(p))
    .filter(Boolean);

  if (parts.length === 0) return 'PRD';
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
  return parts.join('-');
}

function padSingleDigitInt(numToken: string): string {
  if (/^\d$/.test(numToken)) {
    return `0${numToken}`;
  }
  return numToken;
}

/**
 * Formats a raw variant label / dimension / model string into a clean,
 * human-readable, naturally sortable SKU token.
 *
 * Examples:
 * - `36" × 72"` -> `3672`
 * - `8" x 44"`  -> `0844`
 * - `9"`        -> `09`
 * - `12"`       -> `12`
 * - `WS1.5EI`   -> `WS15EI`
 */
export function normalizeVariantSkuToken(rawInput?: string | null): string {
  const trimmed = stripDiacritics(rawInput || '').trim();
  if (!trimmed) return '';

  // 1. Dimension pair: e.g. 36" × 72", 36x72, 10" x 54"
  const dimPairMatch = trimmed.match(
    /^\s*(\d+(?:\.\d+)?)\s*(?:"|″|''|in(?:ch(?:es)?)?|mm|cm|m|ft)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:"|″|''|in(?:ch(?:es)?)?|mm|cm|m|ft)?\s*$/i
  );
  if (dimPairMatch) {
    const first = padSingleDigitInt(dimPairMatch[1].replace(/\./g, ''));
    const second = padSingleDigitInt(dimPairMatch[2].replace(/\./g, ''));
    return `${first}${second}`;
  }

  // 2. Single integer size/inch: e.g. 9", 9 inch, 12"
  const singleIntSizeMatch = trimmed.match(
    /^\s*(\d+)\s*(?:"|″|''|in(?:ch(?:es)?)?)?\s*$/i
  );
  if (singleIntSizeMatch) {
    return padSingleDigitInt(singleIntSizeMatch[1]);
  }

  // 3. Single alphanumeric model/code with dots (e.g. WS1.5EI -> WS15EI, DN50 -> DN50)
  // Remove dots between digits/letters before general sanitization so decimal codes stay compact
  const compactDotCleaned = trimmed
    .replace(/(\d)\.(\d)/g, '$1$2')
    .replace(/(\d)\s*(?:"|″|'')/g, '$1');

  const sanitized = sanitizeSkuSegment(compactDotCleaned);
  if (!sanitized) return '';
  return sanitized.slice(0, 18).replace(/-+$/g, '');
}

function extractBestVariantToken(
  variantDraft: VariantSkuDraftInput | null | undefined,
  parentProduct: Partial<Pick<Product, 'name' | 'model_part_no'>> | null | undefined
): string {
  if (!variantDraft) return '';

  // Priority 1: Explicit variant label
  if (variantDraft.variant_label && variantDraft.variant_label.trim()) {
    const tok = normalizeVariantSkuToken(variantDraft.variant_label);
    if (tok) return tok;
  }

  // Priority 2: Distinguishing technical attributes (Dimensions, Size, Capacity, Flow Rate, etc.)
  const attrs = Array.isArray(variantDraft.attributes) ? variantDraft.attributes : [];
  const priorityAttr = attrs.find(
    (a) =>
      a &&
      a.key &&
      a.value &&
      a.value.trim() !== '' &&
      DISTINGUISHING_ATTR_PRIORITY_RE.test(a.key.trim())
  );
  if (priorityAttr?.value) {
    const tok = normalizeVariantSkuToken(priorityAttr.value);
    if (tok) return tok;
  }

  // Priority 3: Model / Part Number (if distinct from parent model)
  const draftModel = (variantDraft.model_part_no || '').trim();
  const parentModel = (parentProduct?.model_part_no || '').trim();
  if (draftModel && draftModel.toLowerCase() !== parentModel.toLowerCase()) {
    const tok = normalizeVariantSkuToken(draftModel);
    if (tok) return tok;
  }

  // Priority 4: First non-empty attribute value
  const firstPopulatedAttr = attrs.find((a) => a && a.value && a.value.trim() !== '');
  if (firstPopulatedAttr?.value) {
    const tok = normalizeVariantSkuToken(firstPopulatedAttr.value);
    if (tok) return tok;
  }

  // Priority 5: Trailing distinguishing suffix on variant name after stripping parent name
  const draftName = (variantDraft.name || '').trim();
  const parentName = (parentProduct?.name || '').trim();
  if (
    draftName &&
    parentName &&
    draftName.length > parentName.length &&
    draftName.toLowerCase().startsWith(parentName.toLowerCase())
  ) {
    const remainder = draftName.slice(parentName.length).replace(/^[\s\-–—:/()]+/, '').trim();
    const tok = normalizeVariantSkuToken(remainder);
    if (tok) return tok;
  }

  return '';
}

/**
 * Deduplicates a candidate SKU against existing sibling/catalog SKUs
 * by appending `-2`, `-3`, etc. only on collision.
 */
export function deduplicateSku(
  candidateSku: string,
  existingSkus: Array<string | null | undefined> = []
): string {
  const cleanCandidate = sanitizeSkuSegment(candidateSku);
  if (!cleanCandidate) return '';

  const taken = new Set(
    existingSkus
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean)
  );

  if (!taken.has(cleanCandidate)) {
    return cleanCandidate;
  }

  let suffix = 2;
  while (taken.has(`${cleanCandidate}-${suffix}`)) {
    suffix += 1;
  }
  return `${cleanCandidate}-${suffix}`;
}

/**
 * Builds a smart hierarchical variant SKU: `[PARENT_SKU]-[VARIANT_TOKEN]`.
 *
 * - Uses explicit `parentSku` or `parentProduct.sku`, falling back to `suggestParentBaseSku`.
 * - Normalizes dimensions (`36" × 72"` -> `3672`), zero-pads single digits (`9"` -> `09`),
 *   and strips dots/quotes/symbols (`WS1.5EI` -> `WS15EI`).
 * - Falls back to zero-padded sequential code (`01`, `02`, ...) when no variant token is entered yet.
 * - Deduplicates against `existingSiblingSkus` by appending `-2`, `-3` on collision.
 */
export function buildSmartVariantSku(
  parentSku: string | null | undefined,
  parentProduct:
    | Partial<Pick<Product, 'sku' | 'brand_make' | 'brand' | 'name' | 'product_type' | 'model_part_no'>>
    | null
    | undefined,
  variantDraft: VariantSkuDraftInput | null | undefined,
  existingSiblingSkus: Array<string | null | undefined> = []
): string {
  const explicitParentCode = sanitizeSkuSegment(parentSku || parentProduct?.sku || '');
  const baseCode =
    explicitParentCode ||
    suggestParentBaseSku(
      parentProduct?.brand_make || parentProduct?.brand,
      parentProduct?.name,
      parentProduct?.product_type
    );

  const variantToken = extractBestVariantToken(variantDraft, parentProduct);

  if (variantToken) {
    // Avoid double-prefixing if the token already starts with the parent base code
    const combined =
      baseCode && !variantToken.startsWith(`${baseCode}-`) && variantToken !== baseCode
        ? `${baseCode}-${variantToken}`
        : variantToken || baseCode;
    return deduplicateSku(combined, existingSiblingSkus);
  }

  // No distinguishing token yet — assign next clean zero-padded slot (01, 02, ...)
  const taken = new Set(
    existingSiblingSkus
      .map((s) => String(s || '').trim().toUpperCase())
      .filter(Boolean)
  );

  let seq = 1;
  while (seq < 1000) {
    const seqToken = seq < 10 ? `0${seq}` : String(seq);
    const candidate = baseCode ? `${baseCode}-${seqToken}` : seqToken;
    if (!taken.has(candidate)) {
      return candidate;
    }
    seq += 1;
  }

  return deduplicateSku(`${baseCode}-01`, existingSiblingSkus);
}

/**
 * Identifies normalized (lowercase) spec attribute keys that must NEVER be
 * overwritten when syncing shared specs from Parent to Child variants.
 *
 * Includes:
 * 1. Canonical variant-differentiating keys (Dimensions, Size, Capacity, Flow Rate, Connection Size, In/Out Size, etc.)
 * 2. Any attribute key whose non-empty values vary across sibling variants (>= 2 distinct values).
 */
export function detectProtectedVariantSpecKeys(
  siblingChildren: Array<Pick<Product, 'attributes'>> = []
): Set<string> {
  const protectedKeys = new Set<string>();
  const distinctValuesByKey = new Map<string, Set<string>>();

  for (const sibling of siblingChildren) {
    const attrs = Array.isArray(sibling?.attributes) ? sibling.attributes : [];
    for (const attr of attrs) {
      const keyNorm = String(attr?.key || '').trim().toLowerCase();
      if (!keyNorm) continue;
      if (PROTECTED_SPEC_KEY_PATTERNS.some((re) => re.test(keyNorm))) {
        protectedKeys.add(keyNorm);
      }
      const valNorm = String(attr?.value || '').trim().toLowerCase();
      if (valNorm) {
        if (!distinctValuesByKey.has(keyNorm)) {
          distinctValuesByKey.set(keyNorm, new Set());
        }
        distinctValuesByKey.get(keyNorm)!.add(valNorm);
      }
    }
  }

  distinctValuesByKey.forEach((vals, keyNorm) => {
    if (vals.size >= 2) {
      protectedKeys.add(keyNorm);
    }
  });

  return protectedKeys;
}

export function isProtectedVariantSpecKey(
  rawKey: string,
  siblingProtectedKeys?: Set<string>
): boolean {
  const keyNorm = String(rawKey || '').trim().toLowerCase();
  if (!keyNorm) return false;
  if (PROTECTED_SPEC_KEY_PATTERNS.some((re) => re.test(keyNorm))) {
    return true;
  }
  return Boolean(siblingProtectedKeys?.has(keyNorm));
}

/**
 * Returns smart default field selections for the "Sync to N Variants" dialog
 * based on which shared fields are currently populated on the Master Parent.
 */
export function getDefaultSelectedParentSyncFields(
  parent: Partial<Product> | null | undefined,
  siblingChildren: Array<Pick<Product, 'attributes'>> = []
): ParentSyncFieldKey[] {
  if (!parent) return [];
  const defaults: ParentSyncFieldKey[] = [];

  if (parent.product_type && String(parent.product_type).trim()) {
    defaults.push('category');
  }
  if ((parent.brand_make || parent.brand || '').trim()) {
    defaults.push('brand_make');
  }
  if ((parent.country_of_origin || '').trim()) {
    defaults.push('country_of_origin');
  }
  if ((parent.default_availability || '').trim()) {
    defaults.push('lead_time');
  }
  if ((parent.image_url || '').trim() || (parent.secondary_image_url || '').trim()) {
    defaults.push('media');
  }
  if (parent.datasheet_attachment || (parent.datasheet_url || '').trim()) {
    defaults.push('datasheet');
  }

  const protectedKeys = detectProtectedVariantSpecKeys(siblingChildren);
  const hasSyncableSharedSpec = (parent.attributes || []).some(
    (a) =>
      a &&
      a.key.trim() !== '' &&
      a.value.trim() !== '' &&
      !isProtectedVariantSpecKey(a.key, protectedKeys)
  );
  if (hasSyncableSharedSpec) {
    defaults.push('shared_specs');
  }

  if (
    parent.is_composite_set &&
    Array.isArray(parent.sub_components) &&
    parent.sub_components.length > 0
  ) {
    defaults.push('sub_components');
  }

  // Note: `description` is intentionally opt-in (unchecked by default) unless no other fields are populated,
  // since child descriptions sometimes include size-specific phrasing; users can check it with 1 click.
  return defaults;
}

function cloneSubComponents(subComponents?: LineItemComponent[]): LineItemComponent[] | undefined {
  if (!Array.isArray(subComponents)) return undefined;
  return subComponents.map((sc) => ({
    ...sc,
    attributes: Array.isArray(sc.attributes)
      ? sc.attributes.map((a) => ({ ...a }))
      : undefined
  }));
}

/**
 * Builds a strictly safe update patch for pushing selected Master Parent fields
 * down to a linked Child Variant.
 *
 * HARD SAFETY GUARD:
 * NEVER touches or returns `sku`, `model_part_no`, `part_no`, `cost_price`,
 * `cost_price_aed`, `last_landed_cost`, `unit_price`, `selling_price`,
 * `stock_quantity`, `stock_on_hand`, `current_stock`, `stock_reserved`,
 * `is_inventoried`, `reorder_level`, `variant_label`, `variant_parent_id`,
 * or `parent_product_id`.
 */
export function buildParentToVariantSyncPatch(
  parent: Partial<Product>,
  child: Partial<Product>,
  selectedFields: ParentSyncFieldKey[],
  siblingChildren: Array<Partial<Product>> = []
): Partial<Product> & Record<string, any> {
  const fieldSet = new Set<ParentSyncFieldKey>(selectedFields || []);
  const patch: Partial<Product> & Record<string, any> = {};

  if (fieldSet.size === 0) {
    return patch;
  }

  if (fieldSet.has('category') && parent.product_type) {
    patch.product_type = parent.product_type;
  }

  if (fieldSet.has('brand_make')) {
    const resolvedBrand = (parent.brand_make || parent.brand || '').trim() || undefined;
    patch.brand_make = resolvedBrand;
    if (resolvedBrand !== undefined) {
      patch.brand = resolvedBrand;
    }
  }

  if (fieldSet.has('country_of_origin')) {
    patch.country_of_origin = (parent.country_of_origin || '').trim() || undefined;
  }

  if (fieldSet.has('lead_time')) {
    patch.default_availability = (parent.default_availability || '').trim() || undefined;
  }

  if (fieldSet.has('description')) {
    patch.description = (parent.description || '').trim();
  }

  if (fieldSet.has('media')) {
    const primaryUrl = (parent.image_url || '').trim();
    const secondaryUrl = (parent.secondary_image_url || '').trim();
    patch.image_url = primaryUrl || (null as any);
    patch.secondary_image_url = secondaryUrl || (null as any);
    patch.image_caption = (parent.image_caption || '').trim() || undefined;
    patch.secondary_image_caption = (parent.secondary_image_caption || '').trim() || undefined;
    patch.image_adjustments = parent.image_adjustments
      ? { ...parent.image_adjustments }
      : undefined;
    if (!primaryUrl) {
      patch.image_storage_key = null as any;
    } else if ((parent as any).image_storage_key) {
      patch.image_storage_key = (parent as any).image_storage_key;
    }
    if (!secondaryUrl) {
      patch.secondary_image_storage_key = null as any;
    } else if ((parent as any).secondary_image_storage_key) {
      patch.secondary_image_storage_key = (parent as any).secondary_image_storage_key;
    }
  }

  if (fieldSet.has('datasheet')) {
    if (parent.datasheet_attachment) {
      patch.datasheet_attachment = { ...parent.datasheet_attachment };
      patch.datasheet_url = parent.datasheet_url || parent.datasheet_attachment.url || undefined;
      if ((parent as any).datasheet_storage_key) {
        patch.datasheet_storage_key = (parent as any).datasheet_storage_key;
      }
    } else if ((parent.datasheet_url || '').trim()) {
      patch.datasheet_url = (parent.datasheet_url || '').trim();
    } else {
      patch.datasheet_attachment = null as any;
      patch.datasheet_url = null as any;
      patch.datasheet_storage_key = null as any;
    }
  }

  if (fieldSet.has('shared_specs')) {
    const allSiblingsForCheck = siblingChildren.length > 0 ? siblingChildren : [child];
    const protectedKeys = detectProtectedVariantSpecKeys(allSiblingsForCheck);

    const existingChildAttrs: ProductAttribute[] = Array.isArray(child.attributes)
      ? child.attributes.map((a) => ({ key: a.key.trim(), value: a.value.trim() })).filter((a) => a.key !== '')
      : [];

    const parentSyncableAttrs: ProductAttribute[] = (
      Array.isArray(parent.attributes) ? parent.attributes : []
    )
      .map((a) => ({ key: String(a?.key || '').trim(), value: String(a?.value || '').trim() }))
      .filter(
        (a) =>
          a.key !== '' &&
          a.value !== '' &&
          !isProtectedVariantSpecKey(a.key, protectedKeys)
      );

    // Start with all existing child attributes (preserving protected & child-specific specs in their exact order)
    const mergedAttrs: ProductAttribute[] = existingChildAttrs.map((a) => ({ ...a }));
    const indexByLowerKey = new Map<string, number>();
    mergedAttrs.forEach((a, idx) => {
      indexByLowerKey.set(a.key.toLowerCase(), idx);
    });

    for (const parentAttr of parentSyncableAttrs) {
      const lower = parentAttr.key.toLowerCase();
      if (isProtectedVariantSpecKey(lower, protectedKeys)) continue;
      if (indexByLowerKey.has(lower)) {
        const existingIdx = indexByLowerKey.get(lower)!;
        mergedAttrs[existingIdx] = {
          key: mergedAttrs[existingIdx].key,
          value: parentAttr.value
        };
      } else {
        indexByLowerKey.set(lower, mergedAttrs.length);
        mergedAttrs.push({ key: parentAttr.key, value: parentAttr.value });
      }
    }

    patch.attributes = mergedAttrs;
  }

  if (fieldSet.has('sub_components')) {
    const isComposite = Boolean(parent.is_composite_set);
    patch.is_composite_set = isComposite;
    patch.sub_components = isComposite ? cloneSubComponents(parent.sub_components) || [] : undefined;
    patch.package_pricing_mode = isComposite
      ? parent.package_pricing_mode || 'itemized'
      : undefined;
    patch.option_scope_notes =
      isComposite && (parent.option_scope_notes || '').trim()
        ? (parent.option_scope_notes || '').trim()
        : undefined;
  }

  // Hard Safety Guard: guarantee forbidden child identity / pricing / stock keys can never leak into patch
  const PROTECTED_PRODUCT_KEYS = [
    'id',
    'sku',
    'model_part_no',
    'part_no',
    'cost_price',
    'cost_price_aed',
    'last_landed_cost',
    'unit_price',
    'selling_price',
    'stock_quantity',
    'stock_on_hand',
    'current_stock',
    'stock_reserved',
    'is_inventoried',
    'reorder_level',
    'min_stock_level',
    'variant_label',
    'variant_parent_id',
    'parent_product_id'
  ];
  for (const key of PROTECTED_PRODUCT_KEYS) {
    if (key in patch) {
      delete patch[key];
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.updatedAt = new Date().toISOString();
  }

  return patch;
}

// ============================================================================
// TRACK D2: BULK VARIANT MATRIX & EXACT-MATCH VARIANT FAMILY RESOLUTION
// ============================================================================

export interface BulkVariantMatrixRow {
  id: string;
  variantLabel: string;
  modelPartNo: string;
  sku: string;
  isSkuManual: boolean;
  costPrice: string;
  sellingPrice: string;
}

export const COMMON_DIFFERENTIATING_SPEC_KEYS: string[] = [
  'Dimensions',
  'Size',
  'In/Out Size',
  'Connection Size',
  'Capacity',
  'Flow Rate',
  'Diameter',
  'Model',
  'Rating',
  'Power'
];

/**
 * Auto-detects the most appropriate differentiating technical spec key
 * for a Master Parent's Bulk Variant Matrix based on blank template keys
 * on the parent or varying keys across existing linked child variants.
 */
export function detectDefaultDifferentiatingSpecKey(
  parent: Partial<Product> | null | undefined,
  existingSiblings: Array<Pick<Product, 'attributes'>> = []
): string {
  // 1. Blank template attribute key on parent (e.g. `Dimensions: ""`)
  const parentAttrs = Array.isArray(parent?.attributes) ? parent!.attributes : [];
  const blankParentKey = parentAttrs.find(
    (a) => a && a.key.trim() !== '' && String(a.value ?? '').trim() === ''
  );
  if (blankParentKey?.key.trim()) {
    return blankParentKey.key.trim();
  }

  // 2. Attribute keys whose values vary across existing siblings
  const keyOriginalCasing = new Map<string, string>();
  const distinctValuesByKey = new Map<string, Set<string>>();
  for (const sibling of existingSiblings) {
    const attrs = Array.isArray(sibling?.attributes) ? sibling.attributes : [];
    for (const attr of attrs) {
      const keyTrim = String(attr?.key || '').trim();
      const valTrim = String(attr?.value || '').trim();
      if (!keyTrim || !valTrim) continue;
      const lower = keyTrim.toLowerCase();
      if (!keyOriginalCasing.has(lower)) keyOriginalCasing.set(lower, keyTrim);
      if (!distinctValuesByKey.has(lower)) distinctValuesByKey.set(lower, new Set());
      distinctValuesByKey.get(lower)!.add(valTrim.toLowerCase());
    }
  }

  // Prioritize canonical distinguishing keys that vary across siblings
  for (const [lower, vals] of distinctValuesByKey.entries()) {
    if (vals.size >= 2 && DISTINGUISHING_ATTR_PRIORITY_RE.test(lower)) {
      return keyOriginalCasing.get(lower) || 'Dimensions';
    }
  }
  for (const [lower, vals] of distinctValuesByKey.entries()) {
    if (vals.size >= 2) {
      return keyOriginalCasing.get(lower) || 'Dimensions';
    }
  }

  // 3. Single sibling or parent distinguishing key
  for (const [lower] of keyOriginalCasing.entries()) {
    if (DISTINGUISHING_ATTR_PRIORITY_RE.test(lower)) {
      return keyOriginalCasing.get(lower) || 'Dimensions';
    }
  }
  const parentDistinguishing = parentAttrs.find(
    (a) => a && a.key.trim() !== '' && DISTINGUISHING_ATTR_PRIORITY_RE.test(a.key.trim())
  );
  if (parentDistinguishing?.key.trim()) {
    return parentDistinguishing.key.trim();
  }

  return 'Dimensions';
}

/**
 * Recomputes live Smart Hierarchical Auto-SKUs across all rows in the Bulk Variant Matrix.
 * - Strictly preserves any row with `isSkuManual === true`.
 * - Deduplicates sequentially against both `existingCatalogSkus` and earlier/manual rows in the batch.
 */
export function recomputeBulkVariantMatrixSkus(
  rows: BulkVariantMatrixRow[],
  parentSku: string | null | undefined,
  parentProduct:
    | Partial<Pick<Product, 'sku' | 'brand_make' | 'brand' | 'name' | 'product_type' | 'model_part_no'>>
    | null
    | undefined,
  existingCatalogSkus: Array<string | null | undefined> = [],
  diffSpecKey: string = 'Dimensions'
): BulkVariantMatrixRow[] {
  const takenSkus: string[] = existingCatalogSkus
    .map((s) => String(s || '').trim().toUpperCase())
    .filter(Boolean);

  // Reserve manually edited row SKUs up front so auto-generated rows never collide with them
  for (const row of rows) {
    if (row.isSkuManual && row.sku.trim()) {
      takenSkus.push(row.sku.trim().toUpperCase());
    }
  }

  return rows.map((row) => {
    if (row.isSkuManual) {
      return row;
    }

    const cleanLabel = row.variantLabel.trim();
    const cleanModel = row.modelPartNo.trim();
    if (!cleanLabel && !cleanModel) {
      return { ...row, sku: '' };
    }

    const generated = buildSmartVariantSku(
      parentSku,
      parentProduct,
      {
        variant_label: cleanLabel || undefined,
        model_part_no: cleanModel || undefined,
        attributes: cleanLabel ? [{ key: diffSpecKey || 'Dimensions', value: cleanLabel }] : []
      },
      takenSkus
    );

    if (generated) {
      takenSkus.push(generated.toUpperCase());
    }

    return {
      ...row,
      sku: generated
    };
  });
}

function parseOptionalNumericToken(raw: string): string | null {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^(?:AED|USD|EUR|GBP|SAR|OMR|QAR|BHD|KWD|\$|€|£)\s*/i, '')
    .replace(/,/g, '')
    .trim();
  if (!cleaned) return null;
  if (/^\d+(?:\.\d+)?$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Parses pasted multi-line variant drafts into BulkVariantMatrixRow items.
 * Supports:
 * - `30" × 72"` (variant label only)
 * - `30" × 72" | 2850` or `30" × 72"\t2850` (label + selling price)
 * - `30" × 72" | MMF-3072` (label + model)
 * - `30" × 72" | 1900 | 2850` (label + cost + selling price)
 * - `30" × 72" | MMF-3072 | 1900 | 2850` (label + model + cost + selling price)
 */
export function parseBulkVariantPasteLines(
  rawText: string,
  idPrefix: string = 'bvr'
): BulkVariantMatrixRow[] {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed: BulkVariantMatrixRow[] = [];

  lines.forEach((line, idx) => {
    const delimiter = line.includes('\t') ? '\t' : line.includes('|') ? '|' : null;
    const cols = delimiter
      ? line.split(delimiter).map((c) => c.trim())
      : [line];

    const variantLabel = (cols[0] || '').trim();
    if (!variantLabel) return;

    let modelPartNo = '';
    let costPrice = '';
    let sellingPrice = '';

    if (cols.length === 2) {
      const maybePrice = parseOptionalNumericToken(cols[1]);
      if (maybePrice !== null) {
        sellingPrice = maybePrice;
      } else {
        modelPartNo = cols[1];
      }
    } else if (cols.length === 3) {
      const num2 = parseOptionalNumericToken(cols[1]);
      const num3 = parseOptionalNumericToken(cols[2]);
      if (num2 !== null && num3 !== null) {
        costPrice = num2;
        sellingPrice = num3;
      } else {
        modelPartNo = cols[1];
        sellingPrice = num3 !== null ? num3 : '';
      }
    } else if (cols.length >= 4) {
      modelPartNo = cols[1];
      costPrice = parseOptionalNumericToken(cols[2]) ?? '';
      sellingPrice = parseOptionalNumericToken(cols[3]) ?? '';
    }

    parsed.push({
      id: `${idPrefix}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      variantLabel,
      modelPartNo,
      sku: '',
      isSkuManual: false,
      costPrice,
      sellingPrice
    });
  });

  return parsed;
}

// ============================================================================
// VARIANT FAMILY BAR EXACT-MATCH RESOLUTION
// ============================================================================

export const VARIANT_SELECT_PARENT = '__parent__';
export const VARIANT_SELECT_CUSTOM = '__custom__';

export interface VariantBarItemLike {
  product_id?: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
  sku?: string | null;
  product_sku?: string | null;
  item_name?: string | null;
  model_part_no?: string | null;
  unit_price?: number | null;
  attributes?: ProductAttribute[] | null;
}

export interface VariantBarInlineOptionLike {
  id: string;
  variant_name?: string;
  sku?: string;
  unit_price?: number;
  attributes?: ProductAttribute[];
}

export interface ResolveSelectedVariantParams {
  item: VariantBarItemLike | null | undefined;
  matchedProduct: Product | null | undefined;
  rootParent: Product;
  childProducts: Product[];
  inlineVariants?: VariantBarInlineOptionLike[];
}

const EMBEDDED_DIMENSION_PAIR_RE =
  /\b(\d+(?:\.\d+)?)\s*(?:"|″|''|in(?:ch(?:es)?)?|mm|cm|m|ft)?\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(?:"|″|''|in(?:ch(?:es)?)?|mm|cm|m|ft)?\b/i;

function extractEmbeddedDimensionToken(text?: string | null): string {
  const m = String(text || '').match(EMBEDDED_DIMENSION_PAIR_RE);
  if (!m) return '';
  return normalizeVariantSkuToken(`${m[1]}x${m[2]}`);
}

function buildNormalizedAttrMap(
  attrs: ProductAttribute[] | null | undefined,
  protectedKeys: Set<string>
): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(attrs)) return map;
  for (const attr of attrs) {
    const keyLower = String(attr?.key || '').trim().toLowerCase();
    const rawVal = String(attr?.value || '').trim();
    if (!keyLower || !rawVal) continue;
    if (!isProtectedVariantSpecKey(keyLower, protectedKeys)) continue;
    const tok = normalizeVariantSkuToken(rawVal);
    if (tok) {
      map.set(keyLower, tok);
    }
  }
  return map;
}

function getCandidateIdentityTokens(
  candidate: {
    variant_label?: string | null;
    variant_name?: string | null;
    name?: string | null;
    model_part_no?: string | null;
    attributes?: ProductAttribute[] | null;
  },
  protectedKeys: Set<string>
): { attrMap: Map<string, string>; labelToken: string; dimToken: string } {
  const attrMap = buildNormalizedAttrMap(candidate.attributes, protectedKeys);
  const explicitLabel = (candidate.variant_label || candidate.variant_name || '').trim();
  const labelToken = explicitLabel ? normalizeVariantSkuToken(explicitLabel) : '';
  const dimToken =
    extractEmbeddedDimensionToken(explicitLabel) ||
    extractEmbeddedDimensionToken(candidate.name) ||
    Array.from(attrMap.values()).find((v) => /^\d{3,}$/.test(v)) ||
    '';
  return { attrMap, labelToken, dimToken };
}

function doesItemConflictWithCandidate(
  item: VariantBarItemLike | null | undefined,
  candidate: {
    variant_label?: string | null;
    variant_name?: string | null;
    name?: string | null;
    model_part_no?: string | null;
    attributes?: ProductAttribute[] | null;
  },
  protectedKeys: Set<string>
): boolean {
  if (!item) return false;
  const itemAttrs = buildNormalizedAttrMap(item.attributes, protectedKeys);
  const cand = getCandidateIdentityTokens(candidate, protectedKeys);

  // 1. Direct protected/differentiating attribute conflict on the same key (e.g. Dimensions: 3072 vs 3672)
  for (const [keyLower, itemTok] of itemAttrs.entries()) {
    const candTok = cand.attrMap.get(keyLower);
    if (candTok && itemTok !== candTok) {
      return true;
    }
  }

  // 2. Explicit item.variant_name conflict against candidate label or distinguishing attributes
  const itemVarNameTok = normalizeVariantSkuToken(item.variant_name || '');
  if (itemVarNameTok) {
    const candTokens = new Set<string>(
      [cand.labelToken, cand.dimToken, ...Array.from(cand.attrMap.values())].filter(Boolean)
    );
    if (candTokens.size > 0 && !candTokens.has(itemVarNameTok)) {
      return true;
    }
  }

  // 3. Embedded dimension conflict in item_name (e.g. item_name says 30" x 72" while candidate is 36" x 72")
  const itemDimTok =
    extractEmbeddedDimensionToken(item.variant_name) ||
    extractEmbeddedDimensionToken(item.item_name) ||
    Array.from(itemAttrs.values()).find((v) => /^\d{3,}$/.test(v)) ||
    '';
  if (itemDimTok && cand.dimToken && itemDimTok !== cand.dimToken) {
    return true;
  }

  return false;
}

function resolveCanonicalInlineOptionKey(
  iv: VariantBarInlineOptionLike,
  rootParent: Product,
  childProducts: Product[],
  isRootParentSelectableOption: boolean
): string {
  const ivSkuLower = String(iv.sku || '').trim().toLowerCase();
  if (ivSkuLower) {
    if (
      isRootParentSelectableOption &&
      rootParent.id &&
      String(rootParent.sku || '').trim().toLowerCase() === ivSkuLower
    ) {
      return `prod_${rootParent.id}`;
    }
    const matchingChild = childProducts.find(
      (cp) => cp.id && String(cp.sku || '').trim().toLowerCase() === ivSkuLower
    );
    if (matchingChild) {
      return `prod_${matchingChild.id}`;
    }
  }
  return `ivar_${iv.id}`;
}

/**
 * Resolves the EXACT active `<select>` value for `VariantFamilyBar`.
 *
 * Guarantees:
 * - Never silently falls back to `options[0]` or a mismatched sibling variant.
 * - Matches exact `variant_id` or `product_id` first, then verifies differentiating specs don't conflict.
 * - Maps deduplicated inline variants (`ivar_...`) whose SKU matches a concrete catalog child or
 *   selectable Master Parent directly to that rendered `prod_...` option key.
 * - Returns `prod_${rootParent.id}` when linked to a selectable (priced or childless) Master Parent,
 *   and `VARIANT_SELECT_PARENT` (`__parent__`) ONLY when linked to an unpriced Master Parent template with variants.
 * - Returns `VARIANT_SELECT_CUSTOM` (`__custom__`) when the line item has locally modified conflicting specs,
 *   an unrecognized/deleted variant link, or custom overrides that don't match any concrete sibling.
 */
export function resolveSelectedVariantId(params: ResolveSelectedVariantParams): string {
  const { item, matchedProduct, rootParent, childProducts = [], inlineVariants = [] } = params;
  const hasVariants = childProducts.length > 0 || inlineVariants.length > 0;
  const isRootParentSelectableOption = !hasVariants || Number(rootParent.unit_price || 0) > 0;
  const protectedKeys = detectProtectedVariantSpecKeys([rootParent, ...childProducts]);

  // 1. Exact inline variant_id match (mapped to canonical rendered key if deduplicated by SKU)
  const itemVariantId = String(item?.variant_id || '').trim();
  if (itemVariantId) {
    const matchedInline = inlineVariants.find((iv) => iv.id === itemVariantId);
    if (matchedInline) {
      const conflict = doesItemConflictWithCandidate(
        item,
        {
          variant_name: matchedInline.variant_name,
          attributes: matchedInline.attributes
        },
        protectedKeys
      );
      if (conflict) return VARIANT_SELECT_CUSTOM;
      return resolveCanonicalInlineOptionKey(
        matchedInline,
        rootParent,
        childProducts,
        isRootParentSelectableOption
      );
    }
    // Stale/deleted inline variant_id — never fall back to options[0]
    return VARIANT_SELECT_CUSTOM;
  }

  const linkedProductId = String(item?.product_id || matchedProduct?.id || '').trim();

  // 2. Exact child product match
  if (linkedProductId) {
    const matchedChild = childProducts.find((cp) => cp.id === linkedProductId);
    if (matchedChild) {
      const conflict = doesItemConflictWithCandidate(
        item,
        {
          variant_label: (matchedChild as any).variant_label,
          name: matchedChild.name,
          model_part_no: matchedChild.model_part_no,
          attributes: matchedChild.attributes
        },
        protectedKeys
      );
      return conflict ? VARIANT_SELECT_CUSTOM : `prod_${matchedChild.id}`;
    }
  }

  // 3. Unambiguous exact SKU match against child variants (useful when item.product_id was left on parent or cleared)
  const itemSkuNorm = String(item?.sku || item?.product_sku || '').trim().toLowerCase();
  if (itemSkuNorm) {
    const skuChildMatches = childProducts.filter(
      (cp) => cp.id && String(cp.sku || '').trim().toLowerCase() === itemSkuNorm
    );
    if (skuChildMatches.length === 1) {
      const onlyChild = skuChildMatches[0];
      const conflict = doesItemConflictWithCandidate(
        item,
        {
          variant_label: (onlyChild as any).variant_label,
          name: onlyChild.name,
          model_part_no: onlyChild.model_part_no,
          attributes: onlyChild.attributes
        },
        protectedKeys
      );
      if (!conflict) {
        return `prod_${onlyChild.id}`;
      }
    }
    const skuInlineMatches = inlineVariants.filter(
      (iv) => String(iv.sku || '').trim().toLowerCase() === itemSkuNorm
    );
    if (skuInlineMatches.length === 1) {
      const onlyInline = skuInlineMatches[0];
      const conflict = doesItemConflictWithCandidate(
        item,
        {
          variant_name: onlyInline.variant_name,
          attributes: onlyInline.attributes
        },
        protectedKeys
      );
      if (!conflict) {
        return resolveCanonicalInlineOptionKey(
          onlyInline,
          rootParent,
          childProducts,
          isRootParentSelectableOption
        );
      }
    }
  }

  // 4. Linked directly to Master Parent
  if (linkedProductId && linkedProductId === rootParent.id) {
    if (!hasVariants) {
      return `prod_${rootParent.id}`;
    }

    const parentConflict = doesItemConflictWithCandidate(
      item,
      {
        variant_label: (rootParent as any).variant_label,
        name: rootParent.name,
        model_part_no: rootParent.model_part_no,
        attributes: rootParent.attributes
      },
      protectedKeys
    );
    if (parentConflict) {
      return VARIANT_SELECT_CUSTOM;
    }

    // Check if the item carries a concrete custom differentiating spec/price when the parent is a blank base template
    const itemAttrs = buildNormalizedAttrMap(item?.attributes, protectedKeys);
    const parentAttrs = buildNormalizedAttrMap(rootParent.attributes, protectedKeys);
    const hasCustomPopulatedSpec = Array.from(itemAttrs.entries()).some(
      ([k, v]) => !parentAttrs.has(k) && Boolean(v)
    );
    const itemPrice = Number(item?.unit_price || 0);
    const parentPrice = Number(rootParent.unit_price || 0);
    const hasDistinctCustomPrice =
      itemPrice > 0 && parentPrice > 0 && Math.abs(itemPrice - parentPrice) > 0.01;

    if (hasCustomPopulatedSpec || hasDistinctCustomPrice || Boolean(item?.variant_name?.trim())) {
      return VARIANT_SELECT_CUSTOM;
    }

    // Priced Master Parents are rendered as a concrete selectable `prod_${rootParent.id}` option;
    // unpriced Master Parent templates use the `__parent__` sentinel prompting the user to pick a variant.
    return isRootParentSelectableOption ? `prod_${rootParent.id}` : VARIANT_SELECT_PARENT;
  }

  // 5. Fallback: NEVER silently pick options[0]
  return VARIANT_SELECT_CUSTOM;
}

/**
 * Defensive invariant check ensuring the `<select>` value in `VariantFamilyBar`
 * ALWAYS matches an actually rendered `<option value={...}>` element.
 * If an unexpected ID is ever not present in `renderedOptionKeys`, falls back
 * explicitly to `VARIANT_SELECT_CUSTOM` instead of letting `<select>` silently
 * display `options[0]`.
 */
export function resolveSafeVariantSelectKey(
  resolvedKey: string,
  renderedOptionKeys: Iterable<string>,
  rootParentId?: string | null
): string {
  const keySet = new Set(renderedOptionKeys);
  if (resolvedKey === VARIANT_SELECT_CUSTOM) {
    return VARIANT_SELECT_CUSTOM;
  }
  if (resolvedKey === VARIANT_SELECT_PARENT) {
    if (rootParentId && keySet.has(`prod_${rootParentId}`)) {
      return `prod_${rootParentId}`;
    }
    return VARIANT_SELECT_PARENT;
  }
  return keySet.has(resolvedKey) ? resolvedKey : VARIANT_SELECT_CUSTOM;
}

/**
 * Formats a compact, truthful summary of the active line item for the
 * `Custom / Modified (...)` option in `VariantFamilyBar`.
 */
export function formatCustomLineItemVariantSummary(
  item: VariantBarItemLike | null | undefined,
  currency: string = 'AED'
): string {
  if (!item) return 'Unmatched Variant';

  const parts: string[] = [];

  // 1. Distinguishing spec or variant name
  const explicitVar = String(item.variant_name || '').trim();
  if (explicitVar) {
    parts.push(explicitVar);
  } else {
    const attrs = Array.isArray(item.attributes) ? item.attributes : [];
    const distAttr = attrs.find(
      (a) => a && a.key.trim() !== '' && a.value.trim() !== '' && DISTINGUISHING_ATTR_PRIORITY_RE.test(a.key.trim())
    );
    if (distAttr?.value.trim()) {
      parts.push(distAttr.value.trim());
    } else {
      const dimMatch = String(item.item_name || '').match(EMBEDDED_DIMENSION_PAIR_RE);
      if (dimMatch) {
        parts.push(dimMatch[0].trim());
      } else if (item.model_part_no?.trim()) {
        parts.push(item.model_part_no.trim());
      }
    }
  }

  // 2. Active line item unit price
  const price = Number(item.unit_price || 0);
  if (price > 0) {
    const curr = String(currency || 'AED').toUpperCase();
    parts.push(`${curr} ${price.toLocaleString()}`);
  }

  return parts.length > 0 ? parts.join(' · ') : 'Local Quote Edits';
}

// ============================================================================
// FIX F3: DRAFT BOM SUB_COMPONENTS MERGE (P0-4) & VARIANT SWITCH HYGIENE (P0-7)
// ============================================================================

function trimOrUndefined(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Merges fresh Enquiry `sub_components` into existing Draft Quotation Studio `sub_components`
 * without wiping Studio-only presentation overrides or Studio-populated metadata (P0-4).
 *
 * Matching priority per fresh sub-item:
 * 1. Exact `id` match
 * 2. Exact trimmed case-insensitive `item_name` match (unused)
 * 3. Unambiguous positional index fallback (only when that previous slot is not claimed by
 *    a different fresh sub-item's exact `id` or `item_name` match)
 */
export function mergeFreshSubComponentsIntoStudioSubs(
  freshSubs: LineItemComponent[] | undefined | null,
  prevSubs: LineItemComponent[] | undefined | null
): LineItemComponent[] | undefined {
  if (freshSubs === undefined || freshSubs === null) {
    return Array.isArray(prevSubs) && prevSubs.length > 0 ? prevSubs : undefined;
  }
  if (!Array.isArray(prevSubs) || prevSubs.length === 0 || freshSubs.length === 0) {
    return freshSubs;
  }

  const matchedPrevIndexByFreshIndex = new Map<number, number>();
  const usedPrevIndices = new Set<number>();

  // Pass 1: Exact ID match
  freshSubs.forEach((freshSub, fIdx) => {
    const freshId = String(freshSub?.id || '').trim();
    if (!freshId) return;
    const pIdx = prevSubs.findIndex(
      (prev, idx) => !usedPrevIndices.has(idx) && String(prev?.id || '').trim() === freshId
    );
    if (pIdx !== -1) {
      matchedPrevIndexByFreshIndex.set(fIdx, pIdx);
      usedPrevIndices.add(pIdx);
    }
  });

  // Pass 2: Exact case-insensitive item_name match (prefer same index if duplicated)
  freshSubs.forEach((freshSub, fIdx) => {
    if (matchedPrevIndexByFreshIndex.has(fIdx)) return;
    const freshName = String(freshSub?.item_name || '').trim().toLowerCase();
    if (!freshName) return;

    let chosenIdx = -1;
    if (
      fIdx < prevSubs.length &&
      !usedPrevIndices.has(fIdx) &&
      String(prevSubs[fIdx]?.item_name || '').trim().toLowerCase() === freshName
    ) {
      chosenIdx = fIdx;
    } else {
      chosenIdx = prevSubs.findIndex(
        (prev, idx) =>
          !usedPrevIndices.has(idx) &&
          String(prev?.item_name || '').trim().toLowerCase() === freshName
      );
    }

    if (chosenIdx !== -1) {
      matchedPrevIndexByFreshIndex.set(fIdx, chosenIdx);
      usedPrevIndices.add(chosenIdx);
    }
  });

  // Pass 3: Unambiguous positional index fallback
  freshSubs.forEach((_freshSub, fIdx) => {
    if (matchedPrevIndexByFreshIndex.has(fIdx)) return;
    if (fIdx < prevSubs.length && !usedPrevIndices.has(fIdx)) {
      matchedPrevIndexByFreshIndex.set(fIdx, fIdx);
      usedPrevIndices.add(fIdx);
    }
  });

  return freshSubs.map((freshSub, fIdx) => {
    const prevIdx = matchedPrevIndexByFreshIndex.get(fIdx);
    if (prevIdx === undefined) {
      return freshSub;
    }
    const prevSub = prevSubs[prevIdx];
    const resolvedImageStorageKey =
      trimOrUndefined((freshSub as any).image_storage_key) ??
      trimOrUndefined((prevSub as any).image_storage_key);

    return {
      ...prevSub,
      ...freshSub,
      id: prevSub.id || freshSub.id,
      // Preserve Studio presentation & layout overrides when not explicitly set on fresh Enquiry sub-item
      show_attributes: freshSub.show_attributes ?? prevSub.show_attributes,
      show_image: freshSub.show_image ?? prevSub.show_image,
      remark: trimOrUndefined(freshSub.remark) ?? prevSub.remark,
      row_note: trimOrUndefined(freshSub.row_note) ?? prevSub.row_note,
      row_highlight: freshSub.row_highlight ?? prevSub.row_highlight,
      row_bold: freshSub.row_bold ?? prevSub.row_bold,
      hide_row_price: freshSub.hide_row_price ?? prevSub.hide_row_price,
      page_break_after: freshSub.page_break_after ?? prevSub.page_break_after,
      row_spacer_after_mm: freshSub.row_spacer_after_mm ?? prevSub.row_spacer_after_mm,
      // Preserve Studio-populated metadata when Enquiry's field is blank/undefined
      brand_make: trimOrUndefined(freshSub.brand_make) ?? prevSub.brand_make,
      model_part_no: trimOrUndefined(freshSub.model_part_no) ?? prevSub.model_part_no,
      country_of_origin: trimOrUndefined(freshSub.country_of_origin) ?? prevSub.country_of_origin,
      image_url: trimOrUndefined(freshSub.image_url) ?? prevSub.image_url,
      image_caption: trimOrUndefined(freshSub.image_caption) ?? prevSub.image_caption,
      image_adjustments: freshSub.image_adjustments ?? prevSub.image_adjustments,
      ...(resolvedImageStorageKey !== undefined ? { image_storage_key: resolvedImageStorageKey } : {}),
      description: trimOrUndefined(freshSub.description) ?? prevSub.description,
      attributes:
        Array.isArray(freshSub.attributes) && freshSub.attributes.length > 0
          ? freshSub.attributes
          : prevSub.attributes
    };
  });
}

export interface VariantSwitchCleanupParams {
  existingItem: any;
  catalogProduct: Product;
  resolvedVariantProduct?: Product | null;
  specVariant?: ProductSpecVariant | Product | null;
  scaledSubs?: LineItemComponent[];
  isVariantSwitch?: boolean;
}

/**
 * Computes clean composite BOM, media, and lead-time fields when pulling catalog defaults
 * or switching variants via `VariantFamilyBar` (P0-7).
 *
 * Guarantees:
 * - Composite reset: if the target variant has no `sub_components`, explicitly clears
 *   `is_composite_set: false`, `sub_components: undefined`, and `package_pricing_mode: undefined`.
 * - Media reset on variant switch: never carries over previous sibling `image_url`,
 *   `secondary_image_url`, `image_storage_key`, `secondary_image_storage_key`,
 *   `image_display_override`, or `image_adjustments`.
 * - Lead time hygiene: never writes empty string `""` into `lead_time_note` or `availability`.
 */
export function buildVariantSwitchLineItemFields(params: VariantSwitchCleanupParams): {
  lead_time_note: string | undefined;
  availability: string | undefined;
  targetLeadForSpecs: string | undefined;
  image_url: string | undefined;
  secondary_image_url: string | undefined;
  image_storage_key: string | undefined;
  secondary_image_storage_key: string | undefined;
  image_caption: string | undefined;
  secondary_image_caption: string | undefined;
  image_adjustments: any;
  image_display_override: any;
  datasheet_attachment: any;
  is_composite_set: boolean;
  sub_components: LineItemComponent[] | undefined;
  package_pricing_mode: any;
  option_scope_notes?: string;
} {
  const {
    existingItem,
    catalogProduct,
    resolvedVariantProduct,
    specVariant,
    scaledSubs,
    isVariantSwitch
  } = params;

  const targetProductId = (specVariant as Product)?.product_type
    ? (specVariant as Product).id
    : catalogProduct.id;
  const targetVariantId = (specVariant as ProductSpecVariant)?.variant_name
    ? specVariant?.id
    : undefined;

  const isSwitchingTarget =
    Boolean(isVariantSwitch) ||
    (Boolean(existingItem?.product_id) && existingItem.product_id !== targetProductId) ||
    (Boolean(existingItem?.variant_id || targetVariantId) &&
      existingItem?.variant_id !== targetVariantId);

  const mediaSource = resolvedVariantProduct || catalogProduct;

  const targetImageUrl =
    trimOrUndefined(specVariant?.image_url) ?? trimOrUndefined(mediaSource?.image_url);
  const targetSecondaryImageUrl =
    trimOrUndefined((specVariant as Product)?.secondary_image_url) ??
    trimOrUndefined(mediaSource?.secondary_image_url);
  const targetImageStorageKey =
    trimOrUndefined((specVariant as any)?.image_storage_key) ??
    trimOrUndefined((mediaSource as any)?.image_storage_key);
  const targetSecondaryImageStorageKey =
    trimOrUndefined((specVariant as any)?.secondary_image_storage_key) ??
    trimOrUndefined((mediaSource as any)?.secondary_image_storage_key);
  const targetImageCaption =
    trimOrUndefined((specVariant as Product)?.image_caption) ??
    trimOrUndefined(mediaSource?.image_caption);
  const targetSecondaryImageCaption =
    trimOrUndefined((specVariant as Product)?.secondary_image_caption) ??
    trimOrUndefined(mediaSource?.secondary_image_caption);
  const targetImageAdjustments =
    (specVariant as Product)?.image_adjustments || mediaSource?.image_adjustments || undefined;
  const targetDatasheet =
    (specVariant as Product)?.datasheet_attachment || mediaSource?.datasheet_attachment || undefined;

  const targetLead =
    trimOrUndefined((specVariant as ProductSpecVariant)?.lead_time_note) ??
    trimOrUndefined((specVariant as Product)?.default_availability) ??
    trimOrUndefined(mediaSource?.default_availability);
  const existingLead =
    trimOrUndefined(existingItem?.lead_time_note) ?? trimOrUndefined(existingItem?.availability);
  const resolvedLeadTime = targetLead ?? existingLead;

  const hasScaledSubs = Array.isArray(scaledSubs) && scaledSubs.length > 0;

  return {
    lead_time_note: resolvedLeadTime,
    availability: resolvedLeadTime,
    targetLeadForSpecs: targetLead,
    image_url: isSwitchingTarget
      ? targetImageUrl
      : targetImageUrl ?? trimOrUndefined(existingItem?.image_url),
    secondary_image_url: isSwitchingTarget
      ? targetSecondaryImageUrl
      : targetSecondaryImageUrl ?? trimOrUndefined(existingItem?.secondary_image_url),
    image_storage_key: isSwitchingTarget
      ? targetImageStorageKey
      : targetImageStorageKey ?? trimOrUndefined(existingItem?.image_storage_key),
    secondary_image_storage_key: isSwitchingTarget
      ? targetSecondaryImageStorageKey
      : targetSecondaryImageStorageKey ?? trimOrUndefined(existingItem?.secondary_image_storage_key),
    image_caption: isSwitchingTarget
      ? targetImageCaption
      : targetImageCaption ?? trimOrUndefined(existingItem?.image_caption),
    secondary_image_caption: isSwitchingTarget
      ? targetSecondaryImageCaption
      : targetSecondaryImageCaption ?? trimOrUndefined(existingItem?.secondary_image_caption),
    image_adjustments: isSwitchingTarget
      ? targetImageAdjustments
      : targetImageAdjustments ?? existingItem?.image_adjustments,
    image_display_override: isSwitchingTarget ? undefined : existingItem?.image_display_override,
    datasheet_attachment: isSwitchingTarget
      ? targetDatasheet
      : targetDatasheet ?? existingItem?.datasheet_attachment,
    ...(hasScaledSubs
      ? {
          is_composite_set: true,
          sub_components: scaledSubs,
          package_pricing_mode:
            specVariant?.package_pricing_mode || catalogProduct.package_pricing_mode || 'itemized',
          option_scope_notes:
            specVariant?.option_scope_notes ||
            catalogProduct.option_scope_notes ||
            existingItem?.option_scope_notes
        }
      : {
          is_composite_set: false,
          sub_components: undefined,
          package_pricing_mode: undefined
        })
  };
}


