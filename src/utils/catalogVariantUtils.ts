import type { Product, ProductAttribute, LineItemComponent } from '../types';

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
  parentProduct: Pick<Product, 'name' | 'model_part_no'> | null | undefined
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
    | Pick<Product, 'sku' | 'brand_make' | 'brand' | 'name' | 'product_type' | 'model_part_no'>
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
