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
  ALL_PARENT_SYNC_FIELDS
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
