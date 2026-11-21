/**
 * Unit Test Suite for Catalog Variant Utilities:
 * - Smart Hierarchical Auto-SKU (suggestParentBaseSku, normalizeVariantSkuToken, buildSmartVariantSku)
 * - Controlled Parent -> Variant Field Sync (buildParentToVariantSyncPatch, detectProtectedVariantSpecKeys)
 *
 * Execute directly via `npx tsx src/__tests__/catalogVariantUtils.test.ts`.
 */

import type { Product } from '../types';
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
  formatCustomLineItemVariantSummary,
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
