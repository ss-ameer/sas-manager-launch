import { Product, ProductAttribute, normalizeAttributes } from '../types';

/**
 * Resolves the canonical product family key for grouping Spec Variants (e.g., "Cup" or "Jackson Disk Diffuser").
 * Supports transitive parent linkage via `variant_parent_id`, explicit `product_family`, or normalized `name`.
 */
export function resolveProductFamilyKey(
  product: Partial<Product>,
  byIdMap?: Map<string, Product>
): string {
  if (byIdMap && product.variant_parent_id) {
    const visited = new Set<string>();
    let curr: Partial<Product> | undefined = product;
    while (curr?.variant_parent_id && !visited.has(curr.variant_parent_id)) {
      visited.add(curr.variant_parent_id);
      const parent = byIdMap.get(curr.variant_parent_id);
      if (!parent) break;
      curr = parent;
    }
    if (curr && curr !== product) {
      const rootFamily = (curr.product_family || curr.name || curr.product_type || '').trim();
      if (rootFamily) return rootFamily.toLowerCase();
    }
  }
  const explicitFamily = (product.product_family || '').trim();
  if (explicitFamily) return explicitFamily.toLowerCase();
  const baseName = (product.name || product.product_type || '').trim();
  return baseName.toLowerCase();
}

export function resolveProductFamilyDisplayName(
  product: Partial<Product>,
  byIdMap?: Map<string, Product>
): string {
  if (byIdMap && product.variant_parent_id) {
    const visited = new Set<string>();
    let curr: Partial<Product> | undefined = product;
    while (curr?.variant_parent_id && !visited.has(curr.variant_parent_id)) {
      visited.add(curr.variant_parent_id);
      const parent = byIdMap.get(curr.variant_parent_id);
      if (!parent) break;
      curr = parent;
    }
    if (curr && curr !== product) {
      const rootDisplay = (curr.product_family || curr.name || curr.product_type || '').trim();
      if (rootDisplay) return rootDisplay;
    }
  }
  const explicitFamily = (product.product_family || '').trim();
  if (explicitFamily) return explicitFamily;
  return (product.name || product.product_type || 'Unnamed Product').trim();
}

export interface ProductVariantAnalysis {
  familyKey: string;
  familyDisplayName: string;
  siblingCount: number;
  isVariant: boolean;
  isVariantFamily: boolean;
  /** Display names of attribute keys whose values differ across siblings in this family */
  differentiatingKeys: string[];
  /** Lowercase attribute keys whose values differ across siblings in this family */
  differentiatingKeysLower: Set<string>;
  /** Attributes on this product whose value differs from at least one sibling */
  differentiatingAttributes: ProductAttribute[];
  /** Attributes on this product whose value is identical across all siblings */
  sharedAttributes: ProductAttribute[];
}

/**
 * Analyzes an entire catalog of products and returns a map of product.id -> ProductVariantAnalysis.
 * Automatically identifies which specification attributes (e.g. Height: 100mm vs Height: 120mm)
 * differentiate variants within the same product family.
 */
export function buildCatalogVariantAnalysisMap(products: Product[]): Map<string, ProductVariantAnalysis> {
  const activeProducts = (products || []).filter((p) => !p.is_deleted);
  const byIdMap = new Map<string, Product>();
  for (const p of activeProducts) {
    if (p.id) byIdMap.set(p.id, p);
  }

  const byFamily = new Map<string, Product[]>();

  for (const p of activeProducts) {
    const fKey = resolveProductFamilyKey(p, byIdMap);
    if (!fKey) continue;
    const list = byFamily.get(fKey) || [];
    list.push(p);
    byFamily.set(fKey, list);
  }

  const result = new Map<string, ProductVariantAnalysis>();

  for (const [fKey, group] of byFamily.entries()) {
    const siblingCount = group.length;
    const isVariant =
      siblingCount > 1 ||
      group.some((p) => Boolean(p.variant_parent_id));

    const valuesByAttrKey = new Map<string, Set<string>>();
    const allKeyPresenceCount = new Map<string, number>();
    const canonicalKeyLabelMap = new Map<string, string>();

    for (const prod of group) {
      const attrs = normalizeAttributes(prod.attributes);
      const seenInProd = new Set<string>();
      for (const attr of attrs) {
        const kRaw = (attr.key || '').trim();
        const kLower = kRaw.toLowerCase();
        const vNorm = (attr.value || '').trim().toLowerCase();
        if (!kLower) continue;
        if (!canonicalKeyLabelMap.has(kLower)) {
          canonicalKeyLabelMap.set(kLower, kRaw);
        }
        if (!valuesByAttrKey.has(kLower)) {
          valuesByAttrKey.set(kLower, new Set<string>());
        }
        valuesByAttrKey.get(kLower)!.add(vNorm);
        if (!seenInProd.has(kLower)) {
          seenInProd.add(kLower);
          allKeyPresenceCount.set(kLower, (allKeyPresenceCount.get(kLower) || 0) + 1);
        }
      }
    }

    const diffKeysLower = new Set<string>();
    const differentiatingKeys: string[] = [];
    if (siblingCount > 1) {
      for (const [kLower, valSet] of valuesByAttrKey.entries()) {
        const presence = allKeyPresenceCount.get(kLower) || 0;
        // Differentiating if multiple distinct values exist OR some siblings have the attribute and others don't
        if (valSet.size > 1 || presence < siblingCount) {
          diffKeysLower.add(kLower);
          differentiatingKeys.push(canonicalKeyLabelMap.get(kLower) || kLower);
        }
      }
    }

    const familyDisplayName = resolveProductFamilyDisplayName(group[0], byIdMap);

    for (const prod of group) {
      if (!prod.id) continue;
      const attrs = normalizeAttributes(prod.attributes).filter(
        (a) => a.key.trim() !== '' || a.value.trim() !== ''
      );
      const differentiatingAttributes: ProductAttribute[] = [];
      const sharedAttributes: ProductAttribute[] = [];

      for (const attr of attrs) {
        const kLower = attr.key.trim().toLowerCase();
        if (diffKeysLower.has(kLower)) {
          differentiatingAttributes.push(attr);
        } else {
          sharedAttributes.push(attr);
        }
      }

      result.set(prod.id, {
        familyKey: fKey,
        familyDisplayName,
        siblingCount,
        isVariant,
        isVariantFamily: isVariant,
        differentiatingKeys,
        differentiatingKeysLower: diffKeysLower,
        differentiatingAttributes,
        sharedAttributes,
      });
    }
  }

  return result;
}

/**
 * Formats a concise, unmistakable dropdown/selector label for a Product,
 * surfacing differentiating Spec Variant attributes first (e.g., Height: 120mm),
 * followed by shared attributes, SKU/Part No, and single-pass stock status.
 */
export function formatProductVariantSelectorLabel(
  product: Product,
  allProducts?: Product[],
  options?: { includeStock?: boolean; maxSharedSpecs?: number }
): string {
  const includeStock = options?.includeStock !== false;
  const maxSharedSpecs = options?.maxSharedSpecs ?? 2;

  const baseTitle = (product.name || product.product_type || product.description || 'Catalog Item').trim();
  const attrs = normalizeAttributes(product.attributes).filter(
    (a) => a.key.trim() !== '' && a.value.trim() !== ''
  );

  let diffSpecsText = '';
  let sharedSpecsText = '';

  if (attrs.length > 0 && allProducts && allProducts.length > 1) {
    const byIdMap = new Map<string, Product>();
    for (const p of allProducts) {
      if (p.id && !p.is_deleted) byIdMap.set(p.id, p);
    }
    const fKey = resolveProductFamilyKey(product, byIdMap);
    const siblings = allProducts.filter(
      (p) => !p.is_deleted && resolveProductFamilyKey(p, byIdMap) === fKey
    );
    if (siblings.length > 1) {
      const diffAttrs: ProductAttribute[] = [];
      const sharedAttrs: ProductAttribute[] = [];

      for (const attr of attrs) {
        const kLower = attr.key.trim().toLowerCase();
        const vLower = attr.value.trim().toLowerCase();
        const differsInSomeSibling = siblings.some((sib) => {
          if (sib.id === product.id) return false;
          const sibAttrs = normalizeAttributes(sib.attributes);
          const match = sibAttrs.find((sa) => sa.key.trim().toLowerCase() === kLower);
          return !match || match.value.trim().toLowerCase() !== vLower;
        });
        if (differsInSomeSibling) {
          diffAttrs.push(attr);
        } else {
          sharedAttrs.push(attr);
        }
      }

      if (diffAttrs.length > 0) {
        diffSpecsText = diffAttrs.map((a) => `${a.key}: ${a.value}`).join(', ');
      }
      if (sharedAttrs.length > 0 && maxSharedSpecs > 0) {
        sharedSpecsText = sharedAttrs
          .slice(0, maxSharedSpecs)
          .map((a) => `${a.key}: ${a.value}`)
          .join(', ');
      }
    } else {
      sharedSpecsText = attrs
        .slice(0, maxSharedSpecs)
        .map((a) => `${a.key}: ${a.value}`)
        .join(', ');
    }
  } else if (attrs.length > 0) {
    sharedSpecsText = attrs
      .slice(0, maxSharedSpecs)
      .map((a) => `${a.key}: ${a.value}`)
      .join(', ');
  }

  const specSummary =
    diffSpecsText && sharedSpecsText
      ? `${diffSpecsText} • ${sharedSpecsText}`
      : diffSpecsText || sharedSpecsText;

  const codeLabel = (product.sku || product.part_no || product.model_part_no || '').trim();
  const onHand = Number(product.stock_on_hand ?? product.stock_quantity ?? product.current_stock ?? 0);
  const reserved = Number(product.stock_reserved ?? 0);
  const availStock = Math.max(0, onHand - reserved);
  const cleanUnit = !product.unit || product.unit === 'Custom Unit' ? 'Nos' : product.unit;

  const parts: string[] = [baseTitle];
  if (specSummary) {
    parts.push(`(${specSummary})`);
  }
  if (codeLabel) {
    parts.push(`[${codeLabel}]`);
  }
  if (includeStock) {
    if (product.is_inventoried) {
      parts.push(`— Avail: ${availStock} ${cleanUnit} (On Hand: ${onHand})`);
    } else {
      parts.push('— Non-Stock');
    }
  }

  return parts.join(' ');
}
