/**
 * Unit Test Suite for Catalog Variant Utilities:
 * - Smart Hierarchical Auto-SKU (suggestParentBaseSku, normalizeVariantSkuToken, buildSmartVariantSku)
 * - Controlled Parent -> Variant Field Sync (buildParentToVariantSyncPatch, detectProtectedVariantSpecKeys)
 *
 * Execute directly via `npx tsx src/__tests__/catalogVariantUtils.test.ts`.
 */

import type { Product, LineItemComponent } from '../types';
import {
  suggestParentBaseSku,
  normalizeVariantSkuToken,
  buildSmartVariantSku,
  deduplicateSku,
  detectProtectedVariantSpecKeys,
  getDefaultSelectedParentSyncFields,
  buildParentToVariantSyncPatch,
  ALL_PARENT_SYNC_FIELDS,
  detectDefaultDifferentiatingSpecKey,
  recomputeBulkVariantMatrixSkus,
  parseBulkVariantPasteLines,
  resolveSelectedVariantId,
  resolveSafeVariantSelectKey,
  formatCustomLineItemVariantSummary,
  mergeFreshSubComponentsIntoStudioSubs,
  buildVariantSwitchLineItemFields,
  omitUndefinedDeep,
  splitFirestoreSyncPatch,
  mergeProductsIntoOfflineCache,
  VARIANT_SELECT_PARENT,
  VARIANT_SELECT_CUSTOM,
  BulkVariantMatrixRow
} from '../utils/catalogVariantUtils';

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: string;
}

const testResults: TestResult[] = [];
let currentSuite = 'Catalog Variant Utilities';

function describe(name: string, fn: () => void) {
  currentSuite = name;
  fn();
}

function it(name: string, fn: () => void) {
  try {
    fn();
    testResults.push({ suite: currentSuite, name, passed: true });
  } catch (err: any) {
    testResults.push({
      suite: currentSuite,
      name,
      passed: false,
      error: err?.message || String(err)
    });
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
      }
    },
    toEqual(expected: unknown) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected deep equal ${b}, received ${a}`);
      }
    }
  };
}

// ==========================================
// SUITE 1: SMART HIERARCHICAL AUTO-SKU
// ==========================================

describe('Smart Hierarchical Auto-SKU', () => {
  it('suggestParentBaseSku produces clean [BRAND]-[SERIES] codes and strips diacritics & embedded sizes', () => {
    expect(suggestParentBaseSku('Aventura', 'Multi Media Filter', 'Filtration')).toBe('AVE-MMF');
    expect(suggestParentBaseSku('Clack', 'Automatic Multiport Valve', 'Valves')).toBe('CLA-AMV');
    expect(suggestParentBaseSku('Jäger', 'Fine Bubble Diffuser 9"', 'Aeration')).toBe('JAG-FBD');
    expect(suggestParentBaseSku('Aventura', 'Multi Media Filter 36" x 72"', 'Filtration')).toBe('AVE-MMF');
    expect(suggestParentBaseSku('', 'Pressure Vessel', 'Vessels')).toBe('VES-PV');
  });

  it('normalizeVariantSkuToken formats dimensions, zero-pads single digits, and strips dots/quotes/slashes', () => {
    expect(normalizeVariantSkuToken('36" × 72"')).toBe('3672');
    expect(normalizeVariantSkuToken('8" x 44"')).toBe('0844');
    expect(normalizeVariantSkuToken('9"')).toBe('09');
    expect(normalizeVariantSkuToken('12"')).toBe('12');
    expect(normalizeVariantSkuToken('WS1.5EI')).toBe('WS15EI');
    expect(normalizeVariantSkuToken('SS316 / 2"')).toBe('SS316-2');
    expect(normalizeVariantSkuToken('15LPH @ 3 Bar')).toBe('15LPH-3-BAR');
  });

  it('buildSmartVariantSku builds [PARENT_SKU]-[TOKEN] from explicit parent SKU or suggested base SKU', () => {
    const parentMMF = {
      sku: 'AVE-MMF',
      brand_make: 'Aventura',
      name: 'Multi Media Filter',
      product_type: 'Filtration' as const
    };
    expect(
      buildSmartVariantSku('AVE-MMF', parentMMF, { variant_label: '36" × 72"' }, [])
    ).toBe('AVE-MMF-3672');

    const parentDiffuser = {
      sku: 'JGR-FBD',
      brand_make: 'Jager',
      name: 'Fine Bubble Diffuser',
      product_type: 'Aeration' as const
    };
    expect(
      buildSmartVariantSku('JGR-FBD', parentDiffuser, { variant_label: '9"' }, [])
    ).toBe('JGR-FBD-09');
    expect(
      buildSmartVariantSku('JGR-FBD', parentDiffuser, { variant_label: '12"' }, ['JGR-FBD-09'])
    ).toBe('JGR-FBD-12');

    // Uses model_part_no when variant_label is blank
    const parentValve = {
      sku: 'CLA-AMV',
      brand_make: 'Clack',
      name: 'Automatic Multiport Valve',
      product_type: 'Valves' as const
    };
    expect(
      buildSmartVariantSku('CLA-AMV', parentValve, { model_part_no: 'WS1.5EI' }, [])
    ).toBe('CLA-AMV-WS15EI');

    // Falls back to suggested parent base SKU when parent has no SKU yet
    expect(
      buildSmartVariantSku(
        '',
        { sku: '', brand_make: 'Aventura', name: 'Multi Media Filter', product_type: 'Filtration' },
        { attributes: [{ key: 'Dimensions', value: '30" x 72"' }] },
        []
      )
    ).toBe('AVE-MMF-3072');
  });

  it('buildSmartVariantSku handles collisions with -2, -3 and sequential fallback when blank', () => {
    const parent = {
      sku: 'AVE-MMF',
      brand_make: 'Aventura',
      name: 'Multi Media Filter',
      product_type: 'Filtration' as const
    };

    expect(
      buildSmartVariantSku(
        'AVE-MMF',
        parent,
        { variant_label: '36" × 72"' },
        ['ave-mmf-3672']
      )
    ).toBe('AVE-MMF-3672-2');

    expect(
      buildSmartVariantSku(
        'AVE-MMF',
        parent,
        { variant_label: '36" × 72"' },
        ['AVE-MMF-3672', 'AVE-MMF-3672-2']
      )
    ).toBe('AVE-MMF-3672-3');

    // Blank draft uses zero-padded sequence skipping existing codes
    expect(
      buildSmartVariantSku('AVE-MMF', parent, { variant_label: '' }, ['AVE-MMF-01'])
    ).toBe('AVE-MMF-02');

    expect(deduplicateSku('AVE-MMF', ['AVE-MMF', 'AVE-MMF-2'])).toBe('AVE-MMF-3');
  });
});

// ==========================================
// SUITE 2: CONTROLLED PARENT -> VARIANT FIELD SYNC
// ==========================================

describe('Controlled Parent -> Variant Field Sync', () => {
  const masterParent: Partial<Product> = {
    id: 'parent_mmf',
    name: 'Multimedia Filter Vessel',
    sku: 'AVE-MMF',
    product_type: 'Filtration Vessels',
    brand_make: 'Aventura',
    country_of_origin: 'China',
    default_availability: '8-10 Weeks',
    description: 'ASME FRP Multimedia Filter Vessel with top & bottom distribution system.',
    image_url: 'https://cdn.example.com/mmf-primary.jpg',
    secondary_image_url: 'https://cdn.example.com/mmf-drawing.jpg',
    image_caption: 'FRP Vessel Assembly',
    datasheet_attachment: {
      id: 'ds_mmf',
      name: 'Aventura_MMF_Datasheet.pdf',
      url: 'https://cdn.example.com/mmf-datasheet.pdf',
      type: 'application/pdf',
      size: 245000,
      uploadedAt: '2026-11-20T00:00:00Z'
    },
    attributes: [
      { key: 'Design Pressure', value: '10.5 bar' },
      { key: 'Standard', value: 'USA ASME' },
      { key: 'Dimensions', value: 'Varies by size' },
      { key: 'Vessel Diameter', value: 'Parent Placeholder' },
      { key: 'Flow Rate', value: 'Parent Placeholder' }
    ],
    is_composite_set: true,
    package_pricing_mode: 'lump_sum',
    option_scope_notes: 'Factory pre-assembled internals',
    sub_components: [
      { id: 'sc_1', item_name: 'Top & Bottom Distribution System', quantity: 1, unit: 'Set', unit_price: 0, total_price: 0 },
      { id: 'sc_2', item_name: 'Vacuum Breaker', quantity: 1, unit: 'Nos', unit_price: 0, total_price: 0 }
    ]
  };

  const child30: Partial<Product> & Record<string, any> = {
    id: 'child_3072',
    name: 'Multimedia Filter Vessel',
    sku: 'AVE-MMF-3072',
    model_part_no: 'MMF-3072-FRP',
    variant_label: '30" x 72"',
    variant_parent_id: 'parent_mmf',
    parent_product_id: 'parent_mmf',
    product_type: 'General Equipment',
    brand_make: 'Old Brand',
    country_of_origin: 'Old Origin',
    default_availability: 'Ex-stock',
    description: 'Old child description',
    unit_price: 2850,
    cost_price: 1900,
    stock_on_hand: 4,
    stock_quantity: 4,
    is_inventoried: true,
    attributes: [
      { key: 'Dimensions', value: '30" x 72"' },
      { key: 'Vessel Diameter', value: '30"' },
      { key: 'Flow Rate', value: '15 m³/h' },
      { key: 'Design Pressure', value: '10 bar' },
      { key: 'Child Only Note', value: 'Skid Mounted' }
    ]
  };

  const child36: Partial<Product> & Record<string, any> = {
    id: 'child_3672',
    name: 'Multimedia Filter Vessel',
    sku: 'AVE-MMF-3672',
    model_part_no: 'MMF-3672-FRP',
    variant_label: '36" x 72"',
    variant_parent_id: 'parent_mmf',
    parent_product_id: 'parent_mmf',
    unit_price: 3950,
    cost_price: 2600,
    stock_on_hand: 2,
    attributes: [
      { key: 'Dimensions', value: '36" x 72"' },
      { key: 'Vessel Diameter', value: '36"' },
      { key: 'Flow Rate', value: '22 m³/h' },
      { key: 'Design Pressure', value: '10 bar' }
    ]
  };

  it('copies all selected shared fields while strictly protecting child SKU, model, prices, stock, variant_label & differentiating specs', () => {
    const patch = buildParentToVariantSyncPatch(
      masterParent,
      child30,
      ALL_PARENT_SYNC_FIELDS,
      [child30, child36]
    );

    // Selected shared fields copied accurately
    expect(patch.product_type).toBe('Filtration Vessels');
    expect(patch.brand_make).toBe('Aventura');
    expect(patch.country_of_origin).toBe('China');
    expect(patch.default_availability).toBe('8-10 Weeks');
    expect(patch.description).toBe(masterParent.description);
    expect(patch.image_url).toBe('https://cdn.example.com/mmf-primary.jpg');
    expect(patch.secondary_image_url).toBe('https://cdn.example.com/mmf-drawing.jpg');
    expect(patch.datasheet_attachment?.name).toBe('Aventura_MMF_Datasheet.pdf');
    expect(patch.is_composite_set).toBe(true);
    expect(patch.sub_components?.length).toBe(2);

    // Hard safety guard: protected keys MUST NOT exist on patch
    const forbiddenKeys = [
      'id',
      'sku',
      'model_part_no',
      'part_no',
      'cost_price',
      'unit_price',
      'selling_price',
      'stock_quantity',
      'stock_on_hand',
      'current_stock',
      'stock_reserved',
      'is_inventoried',
      'variant_label',
      'variant_parent_id',
      'parent_product_id'
    ];
    for (const k of forbiddenKeys) {
      expect(k in patch).toBe(false);
    }

    // Merging patch onto child preserves every protected child field
    const mergedChild = { ...child30, ...patch };
    expect(mergedChild.sku).toBe('AVE-MMF-3072');
    expect(mergedChild.model_part_no).toBe('MMF-3072-FRP');
    expect(mergedChild.unit_price).toBe(2850);
    expect(mergedChild.cost_price).toBe(1900);
    expect(mergedChild.stock_on_hand).toBe(4);
    expect(mergedChild.variant_label).toBe('30" x 72"');

    // Shared specs updated/merged while sibling-differentiating & canonical size specs stayed untouched
    const attrByKey = new Map(
      (mergedChild.attributes || []).map((a) => [a.key, a.value])
    );
    expect(attrByKey.get('Design Pressure')).toBe('10.5 bar'); // shared spec updated!
    expect(attrByKey.get('Standard')).toBe('USA ASME'); // new shared spec added!
    expect(attrByKey.get('Dimensions')).toBe('30" x 72"'); // canonical size spec protected!
    expect(attrByKey.get('Vessel Diameter')).toBe('30"'); // sibling-varying spec protected!
    expect(attrByKey.get('Flow Rate')).toBe('15 m³/h'); // canonical & sibling-varying spec protected!
    expect(attrByKey.get('Child Only Note')).toBe('Skid Mounted'); // child-only extra spec preserved!
  });

  it('detectProtectedVariantSpecKeys flags both canonical size keys and dynamically varying sibling keys', () => {
    const protectedKeys = detectProtectedVariantSpecKeys([child30, child36]);
    expect(protectedKeys.has('dimensions')).toBe(true);
    expect(protectedKeys.has('flow rate')).toBe(true);
    expect(protectedKeys.has('vessel diameter')).toBe(true);
    expect(protectedKeys.has('design pressure')).toBe(false);
  });

  it('getDefaultSelectedParentSyncFields selects populated shared fields and keeps description opt-in', () => {
    const defaults = getDefaultSelectedParentSyncFields(masterParent, [child30, child36]);
    expect(defaults.includes('category')).toBe(true);
    expect(defaults.includes('brand_make')).toBe(true);
    expect(defaults.includes('country_of_origin')).toBe(true);
    expect(defaults.includes('lead_time')).toBe(true);
    expect(defaults.includes('media')).toBe(true);
    expect(defaults.includes('datasheet')).toBe(true);
    expect(defaults.includes('shared_specs')).toBe(true);
    expect(defaults.includes('sub_components')).toBe(true);
    expect(defaults.includes('description')).toBe(false);
  });
});

// ==========================================
// SUITE 3: BULK VARIANT MATRIX (BATCH AUTO-SKU & PASTE)
// ==========================================

describe('Bulk Variant Matrix (Batch Auto-SKU & Paste Lines)', () => {
  const parentMMF = {
    sku: 'AVE-MMF',
    brand_make: 'Aventura',
    name: 'Multimedia Filter Vessel',
    product_type: 'Filtration Vessels' as const
  };

  it('recomputeBulkVariantMatrixSkus generates live unique Auto-SKUs across a batch, deduplicates collisions, and preserves manual edits', () => {
    const initialRows: BulkVariantMatrixRow[] = [
      { id: 'r1', variantLabel: '24" × 72"', modelPartNo: '', sku: '', isSkuManual: false, costPrice: '', sellingPrice: '2400' },
      { id: 'r2', variantLabel: '30" × 72"', modelPartNo: '', sku: '', isSkuManual: false, costPrice: '', sellingPrice: '2850' },
      { id: 'r3', variantLabel: '30" × 72"', modelPartNo: '', sku: '', isSkuManual: false, costPrice: '', sellingPrice: '2950' },
      { id: 'r4', variantLabel: '36" × 72"', modelPartNo: '', sku: 'CUSTOM-3672', isSkuManual: true, costPrice: '', sellingPrice: '3750' },
      { id: 'r5', variantLabel: '42" × 72"', modelPartNo: '', sku: '', isSkuManual: false, costPrice: '', sellingPrice: '4950' },
      { id: 'r6', variantLabel: '', modelPartNo: '', sku: '', isSkuManual: false, costPrice: '', sellingPrice: '' }
    ];

    const computed = recomputeBulkVariantMatrixSkus(
      initialRows,
      'AVE-MMF',
      parentMMF,
      ['AVE-MMF-2472'], // pre-existing catalog SKU collision
      'Dimensions'
    );

    expect(computed[0].sku).toBe('AVE-MMF-2472-2'); // collides with existing catalog SKU -> -2
    expect(computed[1].sku).toBe('AVE-MMF-3072'); // clean first occurrence
    expect(computed[2].sku).toBe('AVE-MMF-3072-2'); // collides with earlier row in same batch -> -2
    expect(computed[3].sku).toBe('CUSTOM-3672'); // manual SKU strictly preserved!
    expect(computed[4].sku).toBe('AVE-MMF-4272'); // clean smart SKU
    expect(computed[5].sku).toBe(''); // blank row stays clean empty
  });

  it('parseBulkVariantPasteLines parses 1-col, 2-col (price or model), 3-col, and 4-col pipe/tab rows', () => {
    const raw = [
      '24" × 72"',
      '30" × 72" | 2850',
      '36" × 72"\tMMF-3672',
      '42" × 72" | 3200 | 4950',
      '48" × 72" | MMF-4872 | AED 4,100 | AED 6,250'
    ].join('\n');

    const rows = parseBulkVariantPasteLines(raw, 'test');
    expect(rows.length).toBe(5);
    expect(rows[0].variantLabel).toBe('24" × 72"');
    expect(rows[0].sellingPrice).toBe('');

    expect(rows[1].variantLabel).toBe('30" × 72"');
    expect(rows[1].sellingPrice).toBe('2850');
    expect(rows[1].modelPartNo).toBe('');

    expect(rows[2].variantLabel).toBe('36" × 72"');
    expect(rows[2].modelPartNo).toBe('MMF-3672');
    expect(rows[2].sellingPrice).toBe('');

    expect(rows[3].variantLabel).toBe('42" × 72"');
    expect(rows[3].costPrice).toBe('3200');
    expect(rows[3].sellingPrice).toBe('4950');

    expect(rows[4].variantLabel).toBe('48" × 72"');
    expect(rows[4].modelPartNo).toBe('MMF-4872');
    expect(rows[4].costPrice).toBe('4100');
    expect(rows[4].sellingPrice).toBe('6250');
  });

  it('detectDefaultDifferentiatingSpecKey prioritizes blank parent keys, then varying sibling keys, falling back to Dimensions', () => {
    expect(
      detectDefaultDifferentiatingSpecKey(
        { attributes: [{ key: 'In/Out Size', value: '' }, { key: 'Brand', value: 'Clack' }] },
        []
      )
    ).toBe('In/Out Size');

    expect(
      detectDefaultDifferentiatingSpecKey(
        { attributes: [{ key: 'Standard', value: 'ASME' }] },
        [
          { attributes: [{ key: 'Flow Rate', value: '10 m³/h' }, { key: 'Standard', value: 'ASME' }] },
          { attributes: [{ key: 'Flow Rate', value: '20 m³/h' }, { key: 'Standard', value: 'ASME' }] }
        ]
      )
    ).toBe('Flow Rate');

    expect(detectDefaultDifferentiatingSpecKey({ attributes: [] }, [])).toBe('Dimensions');
  });
});

// ==========================================
// SUITE 4: VARIANT FAMILY BAR EXACT-MATCH RESOLUTION
// ==========================================

describe('VariantFamilyBar Exact-Match Resolution', () => {
  const rootParent = {
    id: 'parent_mmf',
    name: 'Multimedia Filter Vessel',
    sku: 'AVE-MMF',
    unit_price: 0,
    product_type: 'Filtration Vessels',
    unit: 'Nos',
    description: 'FRP Vessel',
    attributes: [{ key: 'Design Pressure', value: '10.5 bar' }]
  } as unknown as Product;

  const child30 = {
    id: 'child_3072',
    name: 'Multimedia Filter Vessel',
    sku: 'AVE-MMF-3072',
    variant_label: '30" × 72"',
    parent_product_id: 'parent_mmf',
    variant_parent_id: 'parent_mmf',
    unit_price: 2850,
    product_type: 'Filtration Vessels',
    unit: 'Nos',
    description: 'FRP Vessel 30x72',
    attributes: [
      { key: 'Dimensions', value: '30" × 72"' },
      { key: 'Design Pressure', value: '10.5 bar' }
    ]
  } as unknown as Product;

  const child36 = {
    id: 'child_3672',
    name: 'Multimedia Filter Vessel',
    sku: 'AVE-MMF-3672',
    variant_label: '36" × 72"',
    parent_product_id: 'parent_mmf',
    variant_parent_id: 'parent_mmf',
    unit_price: 3750,
    product_type: 'Filtration Vessels',
    unit: 'Nos',
    description: 'FRP Vessel 36x72',
    attributes: [
      { key: 'Dimensions', value: '36" × 72"' },
      { key: 'Design Pressure', value: '10.5 bar' }
    ]
  } as unknown as Product;

  it('matches exact linked child variant even when quote price is locally discounted', () => {
    const resolved = resolveSelectedVariantId({
      item: {
        product_id: 'child_3072',
        sku: 'AVE-MMF-3072',
        item_name: 'Multimedia Filter Vessel 30" x 72"',
        unit_price: 2700, // negotiated discount on 30"x72"
        attributes: [{ key: 'Dimensions', value: '30" x 72"' }]
      },
      matchedProduct: child30,
      rootParent,
      childProducts: [child30, child36]
    });
    expect(resolved).toBe('prod_child_3072');
  });

  it('never displays mismatched sibling 36"×72" when line item was locally edited to 30"×72" at AED 2,850', () => {
    const item = {
      product_id: 'child_3672', // linked to 36"×72" sibling
      item_name: 'Multimedia Filter Vessel 30" x 72"',
      unit_price: 2850,
      attributes: [{ key: 'Dimensions', value: '30" × 72"' }]
    };
    const resolved = resolveSelectedVariantId({
      item,
      matchedProduct: child36,
      rootParent,
      childProducts: [child30, child36]
    });
    expect(resolved).toBe(VARIANT_SELECT_CUSTOM);
    expect(formatCustomLineItemVariantSummary(item, 'AED')).toBe('30" × 72" · AED 2,850');
  });

  it('returns __parent__ sentinel when linked to unspecialized Master Parent with variants', () => {
    const resolved = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        item_name: 'Multimedia Filter Vessel',
        unit_price: 0,
        attributes: [{ key: 'Design Pressure', value: '10.5 bar' }]
      },
      matchedProduct: rootParent,
      rootParent,
      childProducts: [child30, child36]
    });
    expect(resolved).toBe(VARIANT_SELECT_PARENT);
  });

  it('returns __custom__ when linked to Master Parent but customized with local size & price', () => {
    const resolved = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        item_name: 'Multimedia Filter Vessel 30" × 72"',
        unit_price: 2850,
        attributes: [
          { key: 'Dimensions', value: '30" × 72"' },
          { key: 'Design Pressure', value: '10.5 bar' }
        ]
      },
      matchedProduct: rootParent,
      rootParent,
      childProducts: [child30, child36]
    });
    expect(resolved).toBe(VARIANT_SELECT_CUSTOM);
  });

  it('never falls back to options[0] on stale/deleted inline variant_id', () => {
    const resolved = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        variant_id: 'ivar_deleted_999',
        item_name: 'Multimedia Filter Vessel',
        unit_price: 2850
      },
      matchedProduct: rootParent,
      rootParent,
      childProducts: [child30, child36],
      inlineVariants: [{ id: 'ivar_active_1', variant_name: '36" × 72"', sku: 'AVE-MMF-3672', unit_price: 3750 }]
    });
    expect(resolved).toBe(VARIANT_SELECT_CUSTOM);
  });

  it('resolves exact child by unique SKU if product_id remained on Master Parent', () => {
    const resolved = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        sku: 'AVE-MMF-3072',
        unit_price: 2850,
        attributes: [{ key: 'Dimensions', value: '30" × 72"' }]
      },
      matchedProduct: rootParent,
      rootParent,
      childProducts: [child30, child36]
    });
    expect(resolved).toBe('prod_child_3072');
  });

  it('maps deduplicated inline variant (ivar_...) sharing a concrete child SKU directly to rendered prod_... option (P1-11)', () => {
    const inlineVars = [
      { id: 'iv_dup_30', variant_name: '30" × 72"', sku: 'AVE-MMF-3072', unit_price: 2850 },
      { id: 'iv_only_42', variant_name: '42" × 72"', sku: 'AVE-MMF-4272', unit_price: 4950 }
    ];
    // Simulate exact rendered <option value> keys in VariantFamilyBar (inline iv_dup_30 is deduplicated by child30 SKU)
    const renderedOptionKeys = ['prod_child_3072', 'prod_child_3672', 'ivar_iv_only_42'];

    const resolvedDup = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        variant_id: 'iv_dup_30',
        variant_name: '30" × 72"',
        sku: 'AVE-MMF-3072',
        unit_price: 2850,
        attributes: [{ key: 'Dimensions', value: '30" × 72"' }]
      },
      matchedProduct: rootParent,
      rootParent,
      childProducts: [child30, child36],
      inlineVariants: inlineVars
    });
    expect(resolvedDup).toBe('prod_child_3072');
    expect(renderedOptionKeys.includes(resolvedDup)).toBe(true);
    expect(resolveSafeVariantSelectKey(resolvedDup, renderedOptionKeys, rootParent.id)).toBe('prod_child_3072');

    // Non-deduplicated inline variant still resolves to its own ivar_... key
    const resolvedUnique = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        variant_id: 'iv_only_42',
        variant_name: '42" × 72"',
        sku: 'AVE-MMF-4272',
        unit_price: 4950
      },
      matchedProduct: rootParent,
      rootParent,
      childProducts: [child30, child36],
      inlineVariants: inlineVars
    });
    expect(resolvedUnique).toBe('ivar_iv_only_42');
    expect(renderedOptionKeys.includes(resolvedUnique)).toBe(true);
  });

  it('aligns priced Master Parent selection with rendered prod_<parentId> option and defensive fallback catches unknown keys (P1-11)', () => {
    const pricedParent = {
      ...rootParent,
      unit_price: 2500
    } as unknown as Product;
    // Priced parent IS included in rendered <option> list as prod_parent_mmf
    const renderedOptionKeys = ['prod_parent_mmf', 'prod_child_3072', 'prod_child_3672'];

    const resolved = resolveSelectedVariantId({
      item: {
        product_id: 'parent_mmf',
        item_name: 'Multimedia Filter Vessel',
        unit_price: 2500,
        attributes: [{ key: 'Design Pressure', value: '10.5 bar' }]
      },
      matchedProduct: pricedParent,
      rootParent: pricedParent,
      childProducts: [child30, child36]
    });
    expect(resolved).toBe('prod_parent_mmf');
    expect(renderedOptionKeys.includes(resolved)).toBe(true);

    // Defensive invariant fallback maps any unrendered key cleanly to __custom__, never options[0]
    expect(resolveSafeVariantSelectKey('ivar_missing_from_dom', renderedOptionKeys, pricedParent.id)).toBe(
      VARIANT_SELECT_CUSTOM
    );
    expect(resolveSafeVariantSelectKey(VARIANT_SELECT_PARENT, renderedOptionKeys, pricedParent.id)).toBe(
      'prod_parent_mmf'
    );
  });
});

// ==========================================
// SUITE 5: DRAFT SUB_COMPONENTS MERGE (P0-4) & VARIANT SWITCH HYGIENE (P0-7)
// ==========================================

describe('Draft BOM sub_components Sync (P0-4) & Variant Switch Hygiene (P0-7)', () => {
  it('mergeFreshSubComponentsIntoStudioSubs preserves Studio presentation & metadata when Enquiry updates qty/name (P0-4)', () => {
    const prevStudioSubs: LineItemComponent[] = [
      {
        id: 'sub_vessel',
        item_name: 'FRP Vessel 30" x 72"',
        quantity: 1,
        unit: 'Nos',
        unit_price: 2850,
        total_price: 2850,
        brand_make: 'Aventura',
        model_part_no: 'AV-3072',
        country_of_origin: 'China',
        image_url: 'https://cdn.example.com/vessel-3072.png',
        show_attributes: true,
        show_image: true,
        remark: 'ASME certified tank',
        row_note: 'Verify skid clearance',
        row_highlight: true,
        row_bold: true,
        page_break_after: true,
        row_spacer_after_mm: 12
      },
      {
        id: 'sub_valve',
        item_name: 'Automatic Multiport Valve',
        quantity: 1,
        unit: 'Nos',
        unit_price: 1500,
        total_price: 1500,
        brand_make: 'Clack',
        show_attributes: false,
        show_image: false,
        remark: 'WS2EI included'
      }
    ];

    const freshEnquirySubs: LineItemComponent[] = [
      {
        id: 'sub_vessel',
        item_name: 'FRP Vessel 30" x 72" (Updated)',
        quantity: 2,
        unit: 'Nos',
        unit_price: 2900,
        total_price: 5800,
        brand_make: '',
        model_part_no: undefined,
        country_of_origin: '',
        image_url: ''
      },
      {
        id: 'sub_valve_new_id',
        item_name: 'Automatic Multiport Valve',
        quantity: 2,
        unit: 'Nos',
        unit_price: 1550,
        total_price: 3100
      }
    ];

    const merged = mergeFreshSubComponentsIntoStudioSubs(freshEnquirySubs, prevStudioSubs)!;
    expect(merged.length).toBe(2);

    // Sub 1: Enquiry commercial updates applied, Studio presentation & metadata preserved
    expect(merged[0].item_name).toBe('FRP Vessel 30" x 72" (Updated)');
    expect(merged[0].quantity).toBe(2);
    expect(merged[0].unit_price).toBe(2900);
    expect(merged[0].show_attributes).toBe(true);
    expect(merged[0].show_image).toBe(true);
    expect(merged[0].remark).toBe('ASME certified tank');
    expect(merged[0].row_note).toBe('Verify skid clearance');
    expect(merged[0].row_highlight).toBe(true);
    expect(merged[0].row_bold).toBe(true);
    expect(merged[0].page_break_after).toBe(true);
    expect(merged[0].row_spacer_after_mm).toBe(12);
    expect(merged[0].brand_make).toBe('Aventura');
    expect(merged[0].model_part_no).toBe('AV-3072');
    expect(merged[0].country_of_origin).toBe('China');
    expect(merged[0].image_url).toBe('https://cdn.example.com/vessel-3072.png');

    // Sub 2: Matched by item_name when ID changed, preserving Studio brand & visibility toggles
    expect(merged[1].quantity).toBe(2);
    expect(merged[1].unit_price).toBe(1550);
    expect(merged[1].brand_make).toBe('Clack');
    expect(merged[1].show_attributes).toBe(false);
    expect(merged[1].show_image).toBe(false);
    expect(merged[1].remark).toBe('WS2EI included');

    // Undefined fresh subs preserves existing Studio sub_components intact
    const preserved = mergeFreshSubComponentsIntoStudioSubs(undefined, prevStudioSubs);
    expect(preserved?.length).toBe(2);
    expect(preserved?.[0].row_note).toBe('Verify skid clearance');
  });

  it('buildVariantSwitchLineItemFields clears old composite BOM, sibling media/storage keys, and never writes empty lead_time_note (P0-7)', () => {
    const existingCompositeItem = {
      id: 'item_1',
      product_id: 'child_composite_36',
      sku: 'AVE-MMF-3672',
      item_name: 'Multimedia Filter Package 36" x 72"',
      quantity: 1,
      unit_price: 5200,
      image_url: 'https://cdn.example.com/old-3672.jpg',
      secondary_image_url: 'https://cdn.example.com/old-3672-drawing.jpg',
      image_storage_key: 'ws/media/old-3672.jpg',
      secondary_image_storage_key: 'ws/media/old-3672-drawing.jpg',
      image_display_override: 'hidden',
      image_adjustments: { zoom: 1.25, offsetX: 0, offsetY: 0 },
      is_composite_set: true,
      package_pricing_mode: 'lump_sum',
      sub_components: [
        { id: 'sc_old', item_name: 'Old Sibling Media Bed', quantity: 1, unit: 'Set', unit_price: 500, total_price: 500 }
      ]
    };

    const nonCompositeImagelessSibling = {
      id: 'child_std_24',
      name: 'Multimedia Filter Vessel 24" x 72"',
      sku: 'AVE-MMF-2472',
      product_type: 'Filtration Vessels',
      unit: 'Nos',
      unit_price: 2400,
      description: 'Standard vessel only',
      default_availability: '' // blank on catalog item
    } as unknown as Product;

    const cleaned = buildVariantSwitchLineItemFields({
      existingItem: existingCompositeItem,
      catalogProduct: nonCompositeImagelessSibling,
      resolvedVariantProduct: nonCompositeImagelessSibling,
      specVariant: nonCompositeImagelessSibling,
      scaledSubs: undefined,
      isVariantSwitch: true
    });

    // Composite BOM completely cleared (no stale leak)
    expect(cleaned.is_composite_set).toBe(false);
    expect(cleaned.sub_components).toBe(undefined);
    expect(cleaned.package_pricing_mode).toBe(undefined);

    // Sibling media & overrides completely cleared (no stale leak)
    expect(cleaned.image_url).toBe(undefined);
    expect(cleaned.secondary_image_url).toBe(undefined);
    expect(cleaned.image_storage_key).toBe(undefined);
    expect(cleaned.secondary_image_storage_key).toBe(undefined);
    expect(cleaned.image_display_override).toBe(undefined);
    expect(cleaned.image_adjustments).toBe(undefined);

    // Lead time is undefined (NEVER empty string "") so Studio's fallback chain works
    expect(cleaned.lead_time_note).toBe(undefined);
    expect(cleaned.availability).toBe(undefined);

    // Preserves existing non-empty lead_time_note when new sibling has blank default_availability
    const cleanedWithExistingLead = buildVariantSwitchLineItemFields({
      existingItem: { ...existingCompositeItem, lead_time_note: '4-6 Weeks' },
      catalogProduct: nonCompositeImagelessSibling,
      resolvedVariantProduct: nonCompositeImagelessSibling,
      specVariant: nonCompositeImagelessSibling,
      scaledSubs: undefined,
      isVariantSwitch: true
    });
    expect(cleanedWithExistingLead.lead_time_note).toBe('4-6 Weeks');
    expect(cleanedWithExistingLead.availability).toBe('4-6 Weeks');
  });
});

// ==========================================
// SUITE 6: FIX F7 — PAYLOAD SANITIZATION (P0-10) & MULTI-WORKSPACE CACHE SAFETY (P1-15)
// ==========================================

describe('Fix F7: Payload Sanitization (P0-10) & Multi-Workspace Offline Cache Merge (P1-15)', () => {
  it('omitUndefinedDeep strips top-level and nested undefined keys without turning any field into null while preserving 0, false, and ""', () => {
    const raw = {
      name: 'Multimedia Filter 30" x 72"',
      unit_price: 0,
      is_composite_set: false,
      description: '',
      brand_make: undefined,
      image_url: undefined,
      nested: {
        zoom: 1,
        rotation: 0,
        caption: undefined,
        deep: { a: '', b: undefined }
      },
      sub_components: [
        { id: 'c1', item_name: 'Valve', unit_price: 0, remark: undefined },
        undefined as any,
        { id: 'c2', item_name: 'Vessel', unit_price: 2500, model_part_no: undefined }
      ]
    };

    const cleaned = omitUndefinedDeep(raw) as Record<string, any>;
    expect(cleaned.unit_price).toBe(0);
    expect(cleaned.is_composite_set).toBe(false);
    expect(cleaned.description).toBe('');
    expect('brand_make' in cleaned).toBe(false);
    expect('image_url' in cleaned).toBe(false);
    expect(cleaned.nested.rotation).toBe(0);
    expect('caption' in cleaned.nested).toBe(false);
    expect(cleaned.nested.deep.a).toBe('');
    expect('b' in cleaned.nested.deep).toBe(false);
    expect(cleaned.sub_components.length).toBe(2);
    expect('remark' in cleaned.sub_components[0]).toBe(false);
    expect('model_part_no' in cleaned.sub_components[1]).toBe(false);
    // Guarantee zero accidental null conversions
    expect(JSON.stringify(cleaned).includes('null')).toBe(false);
  });

  it('splitFirestoreSyncPatch separates intentionally cleared parent sync fields into clearedKeys while keeping localPatch free of undefined/null', () => {
    const parentWithClearedFields: Partial<Product> = {
      id: 'parent_1',
      name: 'FRP Pressure Vessel',
      product_type: 'Filtration Vessels',
      brand_make: '', // intentionally cleared
      country_of_origin: 'China',
      image_url: '', // intentionally cleared
      secondary_image_url: '',
      datasheet_attachment: undefined,
      is_composite_set: false,
      sub_components: undefined
    };

    const existingChild: Partial<Product> = {
      id: 'child_1',
      name: 'FRP Pressure Vessel',
      sku: 'AVE-MMF-3072',
      brand_make: 'OldBrand',
      image_url: 'https://cdn.example.com/old.jpg',
      datasheet_url: 'https://cdn.example.com/old.pdf',
      is_composite_set: true
    };

    const patch = buildParentToVariantSyncPatch(
      parentWithClearedFields,
      existingChild,
      ['brand_make', 'country_of_origin', 'media', 'datasheet', 'sub_components'],
      [existingChild]
    );

    const { localPatch, clearedKeys } = splitFirestoreSyncPatch(patch);

    // Populated fields remain in localPatch with concrete values
    expect(localPatch.country_of_origin).toBe('China');
    expect(localPatch.is_composite_set).toBe(false);

    // Cleared fields are routed to clearedKeys (for Firestore deleteField()) and omitted from localPatch
    expect(clearedKeys.includes('brand_make')).toBe(true);
    expect(clearedKeys.includes('brand')).toBe(true);
    expect(clearedKeys.includes('image_url')).toBe(true);
    expect(clearedKeys.includes('datasheet_attachment')).toBe(true);
    expect(clearedKeys.includes('sub_components')).toBe(true);

    // localPatch contains ZERO undefined and ZERO null values
    for (const [k, v] of Object.entries(localPatch)) {
      expect(v !== undefined).toBe(true);
      expect(v !== null).toBe(true);
      expect(clearedKeys.includes(k)).toBe(false);
    }
  });

  it('mergeProductsIntoOfflineCache updates and inserts Workspace A products without deleting Workspace B cached products (P1-15)', () => {
    const existingCache: Product[] = [
      { id: 'prod_A1', workspace_id: 'ws_A', name: 'Vessel Old', unit_price: 1000 } as Product,
      { id: 'prod_B1', workspace_id: 'ws_B', name: 'Pump WS-B', unit_price: 4500 } as Product,
      { id: 'prod_B2', workspace_id: 'ws_B', name: 'Membrane WS-B', unit_price: 1850 } as Product
    ];

    const updatedWsA: Product[] = [
      { id: 'prod_A1', workspace_id: 'ws_A', name: 'Vessel Updated', unit_price: 1250 } as Product,
      { id: 'prod_A2', workspace_id: 'ws_A', name: 'Softener New', unit_price: 8900 } as Product
    ];

    const merged = mergeProductsIntoOfflineCache(existingCache, updatedWsA);

    expect(merged.length).toBe(4);
    expect(merged.find((p) => p.id === 'prod_A1')?.name).toBe('Vessel Updated');
    expect(merged.find((p) => p.id === 'prod_A1')?.unit_price).toBe(1250);
    expect(merged.find((p) => p.id === 'prod_A2')?.name).toBe('Softener New');
    // Workspace B products strictly preserved untouched
    expect(merged.find((p) => p.id === 'prod_B1')?.name).toBe('Pump WS-B');
    expect(merged.find((p) => p.id === 'prod_B2')?.name).toBe('Membrane WS-B');
  });
});

// ==========================================
// SUITE 7: TRACK Q1B — SUB-COMPONENT AUTO-SCALING & qty_mode VARIANT PARITY
// ==========================================

describe('Track Q1B: scale_sub_components_with_parent & qty_mode Parity', () => {
  it('buildParentToVariantSyncPatch syncs scale_sub_components_with_parent and preserves sub-component qty_mode', () => {
    const parentScaledComposite: Partial<Product> = {
      id: 'parent_pkg',
      name: 'RO Skid Package',
      product_type: 'RO Systems',
      is_composite_set: true,
      package_pricing_mode: 'itemized',
      scale_sub_components_with_parent: true,
      sub_components: [
        {
          id: 'sc_1',
          item_name: 'Membrane Vessel',
          quantity: 2,
          unit: 'Nos',
          unit_price: 1200,
          total_price: 2400,
          qty_mode: 'per_unit'
        },
        {
          id: 'sc_2',
          item_name: 'Commissioning Lot',
          quantity: 1,
          unit: 'Lot',
          unit_price: 900,
          total_price: 900,
          qty_mode: 'fixed'
        }
      ]
    };

    const childVariant: Partial<Product> = {
      id: 'child_pkg_100',
      sku: 'RO-100',
      unit_price: 15000
    };

    const patchEnabled = buildParentToVariantSyncPatch(parentScaledComposite, childVariant, [
      'sub_components'
    ]);
    expect(patchEnabled.is_composite_set).toBe(true);
    expect(patchEnabled.scale_sub_components_with_parent).toBe(true);
    expect(patchEnabled.sub_components?.[0]?.qty_mode).toBe('per_unit');
    expect(patchEnabled.sub_components?.[1]?.qty_mode).toBe('fixed');

    // Turning off auto-scale on parent explicitly pushes false to child
    const patchDisabled = buildParentToVariantSyncPatch(
      { ...parentScaledComposite, scale_sub_components_with_parent: false },
      childVariant,
      ['sub_components']
    );
    expect(patchDisabled.scale_sub_components_with_parent).toBe(false);

    // Clearing composite status clears scale_sub_components_with_parent to undefined
    const patchCleared = buildParentToVariantSyncPatch(
      { ...parentScaledComposite, is_composite_set: false, sub_components: [] },
      childVariant,
      ['sub_components']
    );
    expect(patchCleared.is_composite_set).toBe(false);
    expect(patchCleared.scale_sub_components_with_parent).toBe(undefined);
  });

  it('buildVariantSwitchLineItemFields transfers scale_sub_components_with_parent from target variant and clears stale scaling on unscaled or non-composite switches', () => {
    const existingScaledItem = {
      id: 'li_1',
      product_id: 'prod_scaled_A',
      sku: 'PKG-A',
      item_name: 'Package A',
      quantity: 2,
      unit_price: 4000,
      is_composite_set: true,
      scale_sub_components_with_parent: true,
      package_pricing_mode: 'lump_sum',
      sub_components: [
        { id: 'sc_a', item_name: 'Pump', quantity: 1, unit: 'Nos', unit_price: 0, total_price: 0, qty_mode: 'per_unit' as const }
      ]
    };

    // 1. Switch to another scaled composite sibling -> transfers true
    const scaledSibling = {
      id: 'prod_scaled_B',
      name: 'Package B',
      sku: 'PKG-B',
      product_type: 'Packages',
      unit: 'SET',
      unit_price: 5500,
      is_composite_set: true,
      scale_sub_components_with_parent: true,
      package_pricing_mode: 'itemized',
      sub_components: [
        { id: 'sc_b', item_name: 'Pump B', quantity: 2, unit: 'Nos', unit_price: 1000, total_price: 2000, qty_mode: 'per_unit' as const }
      ]
    } as unknown as Product;

    const toScaled = buildVariantSwitchLineItemFields({
      existingItem: existingScaledItem,
      catalogProduct: scaledSibling,
      resolvedVariantProduct: scaledSibling,
      specVariant: scaledSibling,
      scaledSubs: scaledSibling.sub_components,
      isVariantSwitch: true
    });
    expect(toScaled.is_composite_set).toBe(true);
    expect(toScaled.scale_sub_components_with_parent).toBe(true);

    // 2. Switch to an UNSCALED composite sibling -> clears stale true (does NOT leak!)
    const unscaledCompositeSibling = {
      id: 'prod_unscaled_C',
      name: 'Package C',
      sku: 'PKG-C',
      product_type: 'Packages',
      unit: 'SET',
      unit_price: 3000,
      is_composite_set: true,
      package_pricing_mode: 'lump_sum',
      sub_components: [
        { id: 'sc_c', item_name: 'Legacy Sub', quantity: 1, unit: 'Nos', unit_price: 0, total_price: 0 }
      ]
    } as unknown as Product;

    const toUnscaled = buildVariantSwitchLineItemFields({
      existingItem: existingScaledItem,
      catalogProduct: unscaledCompositeSibling,
      resolvedVariantProduct: unscaledCompositeSibling,
      specVariant: unscaledCompositeSibling,
      scaledSubs: unscaledCompositeSibling.sub_components,
      isVariantSwitch: true
    });
    expect(toUnscaled.is_composite_set).toBe(true);
    expect(toUnscaled.scale_sub_components_with_parent).toBe(undefined);

    // 3. Switch to a NON-composite sibling -> explicitly clears scale_sub_components_with_parent to undefined
    const nonCompositeSibling = {
      id: 'prod_single_D',
      name: 'Standalone Unit D',
      sku: 'UNIT-D',
      product_type: 'Units',
      unit: 'Nos',
      unit_price: 1200
    } as unknown as Product;

    const toNonComposite = buildVariantSwitchLineItemFields({
      existingItem: existingScaledItem,
      catalogProduct: nonCompositeSibling,
      resolvedVariantProduct: nonCompositeSibling,
      specVariant: nonCompositeSibling,
      scaledSubs: undefined,
      isVariantSwitch: true
    });
    expect(toNonComposite.is_composite_set).toBe(false);
    expect(toNonComposite.scale_sub_components_with_parent).toBe(undefined);

    // 4. Re-syncing the SAME composite item when catalog has undefined preserves existingItem flag
    const sameProductCatalog = {
      ...unscaledCompositeSibling,
      id: 'prod_scaled_A',
      sku: 'PKG-A'
    } as unknown as Product;
    const sameResync = buildVariantSwitchLineItemFields({
      existingItem: existingScaledItem,
      catalogProduct: sameProductCatalog,
      resolvedVariantProduct: sameProductCatalog,
      specVariant: sameProductCatalog,
      scaledSubs: existingScaledItem.sub_components,
      isVariantSwitch: false
    });
    expect(sameResync.scale_sub_components_with_parent).toBe(true);
  });
});

// ==========================================
// TEST REPORT SUMMARY
// ==========================================

const passedCount = testResults.filter((r) => r.passed).length;
const failedCount = testResults.filter((r) => !r.passed).length;

console.log('----------------------------------------------------');
console.log(`[CATALOG VARIANT UTILS TEST SUITE] Results: ${passedCount} Passed, ${failedCount} Failed`);
console.log('----------------------------------------------------');

if (failedCount > 0) {
  testResults
    .filter((r) => !r.passed)
    .forEach((r) => {
      console.error(`FAIL: [${r.suite}] ${r.name} -> ${r.error}`);
    });
  throw new Error(`${failedCount} catalog variant unit tests failed!`);
}

if (typeof process !== 'undefined' && process.exit) {
  process.exit(0);
}
