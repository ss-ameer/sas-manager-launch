import assert from 'assert';
import {
  normalizeExtractedLineItems,
  normalizeLineItemAttributeKey,
  normalizeTechnicalStandardValue,
  isFlowRateValue,
  isGenericGlobalDeliveryPhrase,
  isPlaceholderSubRemark,
  parseStructuredSubComponent
} from '../utils/aiExtractionNormalizer';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.message || err}`);
  }
}

console.log('\nRunning AI Extraction Normalizer (Track S2) Tests...\n');

// ---------------------------------------------------------------------------
// 1. Flow Rate vs. Volume
// ---------------------------------------------------------------------------
test('detects flow-rate units (LPS, L/s, LPH, LPM, m³/hr, GPM) without matching static tank/resin volumes', () => {
  assert.strictEqual(isFlowRateValue('10 LPS (36 m³/hr)'), true);
  assert.strictEqual(isFlowRateValue('9 LPS (32.4 m³/hr)'), true);
  assert.strictEqual(isFlowRateValue('4 LPS (14.4 m³/hr)'), true);
  assert.strictEqual(isFlowRateValue('15 m3/hr'), true);
  assert.strictEqual(isFlowRateValue('120 m³/day'), true);
  assert.strictEqual(isFlowRateValue('250 LPH'), true);
  assert.strictEqual(isFlowRateValue('12 L/s'), true);
  assert.strictEqual(isFlowRateValue('45 GPM'), true);
  assert.strictEqual(isFlowRateValue('30 USGPM'), true);

  // Static tank / resin / storage volumes must NOT be treated as flow rates
  assert.strictEqual(isFlowRateValue('500 Ltrs'), false);
  assert.strictEqual(isFlowRateValue('350 Ltrs'), false);
  assert.strictEqual(isFlowRateValue('10 m³'), false);
  assert.strictEqual(isFlowRateValue('2500 Liters'), false);
});

test('remaps mislabeled Volume / Capacity keys with flow-rate values to Flow Rate while preserving real Volumes', () => {
  assert.strictEqual(normalizeLineItemAttributeKey('Volume', '10 LPS (36 m³/hr)'), 'Flow Rate');
  assert.strictEqual(normalizeLineItemAttributeKey('Capacity', '9 LPS (32.4 m³/hr)'), 'Flow Rate');
  assert.strictEqual(normalizeLineItemAttributeKey('Volume', '4 LPS (14.4 m³/hr)'), 'Flow Rate');
  assert.strictEqual(normalizeLineItemAttributeKey('Volume', '500 Ltrs'), 'Volume');
  assert.strictEqual(normalizeLineItemAttributeKey('Capacity', '350 Ltrs'), 'Capacity');
  assert.strictEqual(normalizeLineItemAttributeKey('Volume', '10 m³'), 'Volume');
});

// ---------------------------------------------------------------------------
// 2. Per-Item Lead Time & Global Delivery Protection
// ---------------------------------------------------------------------------
test('detects generic global delivery phrases and protects per-item lead times', () => {
  assert.strictEqual(isGenericGlobalDeliveryPhrase('As mentioned against each item'), true);
  assert.strictEqual(isGenericGlobalDeliveryPhrase('As per item'), true);
  assert.strictEqual(isGenericGlobalDeliveryPhrase('See table'), true);
  assert.strictEqual(isGenericGlobalDeliveryPhrase('Ex-Stock / Standard'), true);
  assert.strictEqual(isGenericGlobalDeliveryPhrase('8-10 Weeks'), false);
  assert.strictEqual(
    isGenericGlobalDeliveryPhrase('Limited stock available, subject to prior sale'),
    false
  );
  assert.strictEqual(isGenericGlobalDeliveryPhrase('Ex-Stock'), false);
});

test('routes per-item lead time out of attributes into lead_time_note and ignores generic global delivery', () => {
  const result = normalizeExtractedLineItems(
    [
      {
        item_name: 'FRP Pressure Vessel 30" x 72"',
        quantity: 2,
        unit: 'Nos',
        unit_price: 2850,
        attributes: [
          { key: 'Brand / Make', value: 'AVENTURA' },
          { key: 'Model', value: 'FRP-3072' },
          { key: 'Country of Origin', value: 'China' },
          { key: 'Lead Time / Delivery', value: '8-10 Weeks' },
          { key: 'Design Pressure', value: '10.5 bar' }
        ]
      },
      {
        item_name: 'Automatic Multiport Valve',
        quantity: 2,
        unit: 'Nos',
        unit_price: 5000,
        lead_time_note: 'As mentioned against each item',
        availability: 'Limited stock available, subject to prior sale',
        attributes: [
          { key: 'Brand', value: 'Clack (USA)' },
          { key: 'Model', value: 'WS2EI' },
          { key: 'Delivery', value: 'As per item' }
        ]
      },
      {
        item_name: 'Brine Tank 500 Ltrs',
        quantity: 1,
        unit: 'Nos',
        unit_price: 950,
        lead_time_note: 'As mentioned against each item',
        attributes: [{ key: 'Volume', value: '500 Ltrs' }]
      }
    ],
    { globalDeliveryPeriod: 'As mentioned against each item' }
  );

  // Item 1: core fields routed out of attributes, Lead Time preserved in lead_time_note
  assert.strictEqual(result[0].brand_make, 'AVENTURA');
  assert.strictEqual(result[0].model_part_no, 'FRP-3072');
  assert.strictEqual(result[0].country_of_origin, 'China');
  assert.strictEqual(result[0].lead_time_note, '8-10 Weeks');
  assert.deepStrictEqual(result[0].attributes, [{ key: 'Design Pressure', value: '10.5 bar' }]);

  // Item 2: generic lead_time_note skipped in favor of concrete availability; inline Brand (USA) split
  assert.strictEqual(result[1].brand_make, 'Clack');
  assert.strictEqual(result[1].country_of_origin, 'USA');
  assert.strictEqual(result[1].model_part_no, 'WS2EI');
  assert.strictEqual(result[1].lead_time_note, 'Limited stock available, subject to prior sale');
  assert.deepStrictEqual(result[1].attributes, []);

  // Item 3: generic phrase stripped to empty string, real Volume preserved
  assert.strictEqual(result[2].lead_time_note, '');
  assert.deepStrictEqual(result[2].attributes, [{ key: 'Volume', value: '500 Ltrs' }]);
});

// ---------------------------------------------------------------------------
// 3. Standards vs Country of Origin & AMSE -> ASME Typo Fix
// ---------------------------------------------------------------------------
test('cleans USA AMSE Standards -> USA ASME and prevents false USA country_of_origin', () => {
  assert.strictEqual(
    normalizeTechnicalStandardValue('Manufactured to USA AMSE Standards'),
    'USA ASME'
  );
  assert.strictEqual(normalizeTechnicalStandardValue('USA ASME Standards'), 'USA ASME');

  const items = normalizeExtractedLineItems([
    {
      item_name: 'FRP Multimedia Filter Vessel 48" x 72"',
      description: 'Manufactured to USA AMSE Standards',
      brand_make: 'AVENTURA',
      country_of_origin: 'USA', // Hallucinated from "USA ASME Standards"
      quantity: 2,
      unit: 'Nos',
      unit_price: 9800,
      attributes: [
        { key: 'Standard', value: 'USA AMSE Standards' },
        { key: 'Design Pressure', value: '10.5 bar' }
      ]
    },
    {
      item_name: 'Clack WS3 Automatic Control Valve',
      brand_make: 'Clack',
      model_part_no: 'WS3',
      country_of_origin: 'USA', // Genuine USA origin (no USA ASME clause)
      quantity: 2,
      unit: 'Nos',
      unit_price: 7500,
      attributes: [{ key: 'In/Out Size', value: '3"' }]
    }
  ]);

  // Vessel: USA origin cleared, Standard normalized to "USA ASME"
  assert.strictEqual(items[0].country_of_origin, undefined);
  assert.deepStrictEqual(items[0].attributes, [
    { key: 'Standard', value: 'USA ASME' },
    { key: 'Design Pressure', value: '10.5 bar' }
  ]);

  // Clack valve: genuine USA origin preserved
  assert.strictEqual(items[1].country_of_origin, 'USA');
});

// ---------------------------------------------------------------------------
// 4. Strict No-Fabrication Rule & Structured Sub-Component Parsing
// ---------------------------------------------------------------------------
test('strips fabricated placeholder remarks ("Standard", "N/A", "Included") on accessories', () => {
  assert.strictEqual(isPlaceholderSubRemark('Standard'), true);
  assert.strictEqual(isPlaceholderSubRemark('N/A'), true);
  assert.strictEqual(isPlaceholderSubRemark('Included accessory'), true);
  assert.strictEqual(isPlaceholderSubRemark('Standard accessory'), true);
  assert.strictEqual(isPlaceholderSubRemark('With differential pressure gauge'), false);

  const vacBreaker = parseStructuredSubComponent(
    {
      item_name: 'Vacuum Breaker',
      quantity: 2,
      unit: 'Nos',
      unit_price: 0,
      technical_Highlight: 'Standard'
    },
    0
  );
  assert.strictEqual(vacBreaker.component.remark, '');
  assert.strictEqual(vacBreaker.component.attributes, undefined);

  const flangeKit = parseStructuredSubComponent(
    {
      item_name: 'Flange Kits',
      quantity: 2,
      unit: 'Set',
      unit_price: 0,
      remark: 'N/A'
    },
    1
  );
  assert.strictEqual(flangeKit.component.remark, '');
});

// ---------------------------------------------------------------------------
// 5. Realistic Veolia Duplex MMF + Simplex Water Softener End-to-End Fixture
// ---------------------------------------------------------------------------
test('normalizes realistic Veolia Duplex MMF + Simplex Softener extraction cleanly end-to-end', () => {
  const veoliaRawLineItems = [
    {
      item_type: 'product',
      product_type: 'Multimedia Filter System',
      item_name: 'AUTOMATIC DUPLEX MULTIMEDIA FILTER SYSTEM - 10 LPS (36 m³/hr)',
      // Redundant AI-synthesized narrative summary paragraph
      description:
        'Complete automatic duplex multimedia filter system consisting of 2 Nos AVENTURA FRP Vessels 48"x72", graded filter media, Clack WS3 Multiport Valves, Vacuum Breaker and Flange Kits.',
      // Blended multi-vendor brand & bled valve model & hallucinated USA origin on parent
      brand_make: 'AVENTURA / AQUAFIL / Clack (USA)',
      model_part_no: 'WS3 (Multiport Valve)',
      country_of_origin: 'USA',
      lead_time_note: '8-10 Weeks',
      quantity: 1,
      unit: 'Set',
      unit_price: 78500,
      is_composite_set: true,
      attributes: [
        // Flow rate mislabeled as Volume
        { key: 'Volume', value: '10 LPS (36 m³/hr)' },
        { key: 'Arrangement', value: 'Duplex (1 Working + 1 Standby)' },
        { key: 'Design Pressure', value: '10.5 bar' },
        // Dedicated core fields duplicated in attributes
        { key: 'Brand / Make', value: 'AVENTURA / Clack' },
        { key: 'Model', value: 'WS3' },
        { key: 'Lead Time / Delivery', value: '8-10 Weeks' },
        // Tank/valve-only attributes bled onto parent
        { key: 'Dimensions', value: '48" x 72"' },
        { key: 'In/Out Size', value: '3"' },
        { key: 'Installation', value: 'Top Mount' },
        { key: 'Standard', value: 'USA AMSE Standards' }
      ],
      sub_components: [
        {
          item_name: 'FRP Pressure Vessel 48" x 72"',
          quantity: 2,
          unit: 'Nos',
          unit_price: 0,
          is_included_accessory: true,
          country_of_origin: 'USA', // Hallucinated from USA AMSE Standards
          technical_Highlight:
            'Brand: AVENTURA | Design Pressure: 10.5 bar | Manufactured to USA AMSE Standards | Top/Bottom Opening: 6" Flanged'
        },
        {
          item_name: 'Graded Filter Media Set',
          quantity: 2,
          unit: 'Set',
          unit_price: 0,
          is_included_accessory: true,
          brand_make: 'AQUAFIL',
          description:
            'Anthracite (0.8-1.6 mm): 450 kg (18 bags x 25 kg)\nSilica Sand (0.5-1.0 mm): 900 kg (36 bags x 25 kg)\nSupporting Gravel (2-5 mm & 6-12 mm): 600 kg (24 bags x 25 kg)'
        },
        {
          item_name: 'Automatic Multiport Control Valve',
          quantity: 2,
          unit: 'Nos',
          unit_price: 0,
          is_included_accessory: true,
          technical_Highlight:
            'Brand: Clack | Model: WS3 | Origin: USA | In/Out Size: 3" | Installation: Top Mount | Operation: Automatic, Programmable | Application: Filtration | MAV: 1 No.'
        },
        {
          item_name: 'Vacuum Breaker',
          quantity: 2,
          unit: 'Nos',
          unit_price: 0,
          is_included_accessory: true,
          technical_Highlight: 'Standard'
        },
        {
          item_name: 'Flange Kits & Interconnecting Accessories',
          quantity: 2,
          unit: 'Set',
          unit_price: 0,
          is_included_accessory: true,
          remark: 'N/A'
        }
      ]
    },
    {
      item_type: 'product',
      product_type: 'Water Softener System',
      item_name: 'AUTOMATIC SIMPLEX WATER SOFTENER - 4 LPS (14.4 m³/hr)',
      description:
        'Automatic simplex water softener comprising FRP vessel, cation exchange resin 500 Ltrs, Clack WS2EI valve and brine tank.',
      brand_make: 'AVENTURA / Clack',
      model_part_no: 'WS2EI (Control Valve)',
      quantity: 1,
      unit: 'Set',
      unit_price: 29400,
      is_composite_set: true,
      attributes: [
        { key: 'Capacity', value: '4 LPS (14.4 m³/hr)' },
        { key: 'Arrangement', value: 'Simplex' },
        { key: 'Availability', value: 'Limited stock available, subject to prior sale' }
      ],
      sub_components: [
        {
          item_name: 'FRP Softener Vessel 30" x 72"',
          quantity: 1,
          unit: 'Nos',
          unit_price: 0,
          brand_make: 'AVENTURA',
          country_of_origin: 'China',
          attributes: [
            { key: 'Design Pressure', value: '10.5 bar' },
            { key: 'Standard', value: 'USA AMSE Standards' }
          ]
        },
        {
          item_name: 'Food Grade Cation Exchange Resin',
          quantity: 500,
          unit: 'Ltr',
          unit_price: 0,
          attributes: [{ key: 'Volume', value: '500 Ltrs' }]
        },
        {
          item_name: 'HDPE Brine Tank with Brine Well & Salt Grid',
          quantity: 1,
          unit: 'Nos',
          unit_price: 0,
          attributes: [{ key: 'Volume', value: '350 Ltrs' }],
          remark: 'Standard'
        }
      ]
    }
  ];

  const normalized = normalizeExtractedLineItems(veoliaRawLineItems, {
    globalDeliveryPeriod: 'As mentioned against each item'
  });

  // --- Assertions on Item 1: Duplex MMF ---
  const mmf = normalized[0];
  assert.strictEqual(mmf.is_composite_set, true);
  // Parent anti-bleed: blended brand, bled valve model, hallucinated origin, and redundant narrative cleared
  assert.strictEqual(mmf.brand_make, undefined);
  assert.strictEqual(mmf.model_part_no, undefined);
  assert.strictEqual(mmf.country_of_origin, undefined);
  assert.strictEqual(mmf.description, '');
  // Per-item lead time preserved, not overwritten by generic global phrase
  assert.strictEqual(mmf.lead_time_note, '8-10 Weeks');
  // Parent attributes strictly system-level, Flow Rate fixed (NOT Volume!)
  assert.deepStrictEqual(mmf.attributes, [
    { key: 'Flow Rate', value: '10 LPS (36 m³/hr)' },
    { key: 'Arrangement', value: 'Duplex (1 Working + 1 Standby)' },
    { key: 'Design Pressure', value: '10.5 bar' }
  ]);

  const subs = mmf.sub_components || [];
  // 5 original sub-components + 1 extracted MAV = 6 sub-components
  assert.strictEqual(subs.length, 6);

  // Sub 1: FRP Vessel — exact duplex quantity 2 preserved, AMSE->ASME fixed, false USA origin cleared
  const vessel = subs[0];
  assert.strictEqual(vessel.quantity, 2);
  assert.strictEqual(vessel.brand_make, 'AVENTURA');
  assert.strictEqual(vessel.country_of_origin, undefined);
  assert.strictEqual(vessel.remark, '');
  assert.deepStrictEqual(vessel.attributes, [
    { key: 'Design Pressure', value: '10.5 bar' },
    { key: 'Standard', value: 'USA ASME' },
    { key: 'Top/Bottom Opening', value: '6" Flanged' }
  ]);

  // Sub 2: Graded Filter Media — multi-line composition preserved in description
  const media = subs[1];
  assert.strictEqual(media.brand_make, 'AQUAFIL');
  assert.ok(media.description?.includes('Anthracite'));
  assert.ok(media.description?.includes('Silica Sand'));
  assert.ok(media.description?.includes('Supporting Gravel'));
  assert.strictEqual(media.remark, '');

  // Sub 3: Clack WS3 Valve — structured Brand/Model/Origin/attributes parsed cleanly
  const valve = subs[2];
  assert.strictEqual(valve.quantity, 2);
  assert.strictEqual(valve.brand_make, 'Clack');
  assert.strictEqual(valve.model_part_no, 'WS3');
  assert.strictEqual(valve.country_of_origin, 'USA');
  assert.strictEqual(valve.remark, '');
  assert.deepStrictEqual(valve.attributes, [
    { key: 'In/Out Size', value: '3"' },
    { key: 'Installation', value: 'Top Mount' },
    { key: 'Operation', value: 'Automatic, Programmable' },
    { key: 'Application', value: 'Filtration' }
  ]);

  // Sub 4 & 5: Accessories — fabricated "Standard" & "N/A" remarks stripped completely
  assert.strictEqual(subs[3].item_name, 'Vacuum Breaker');
  assert.strictEqual(subs[3].quantity, 2);
  assert.strictEqual(subs[3].remark, '');
  assert.strictEqual(subs[4].item_name, 'Flange Kits & Interconnecting Accessories');
  assert.strictEqual(subs[4].remark, '');

  // Sub 6: Embedded MAV extracted as distinct hardware sub-component with quantity 1
  const mav = subs[5];
  assert.strictEqual(mav.item_name, 'Motorized Alternating Valve (MAV)');
  assert.strictEqual(mav.quantity, 1);
  assert.strictEqual(mav.unit, 'Nos');
  assert.strictEqual(mav.remark, '');

  // --- Assertions on Item 2: Simplex Softener ---
  const softener = normalized[1];
  assert.strictEqual(softener.brand_make, undefined);
  assert.strictEqual(softener.model_part_no, undefined);
  assert.strictEqual(softener.description, '');
  assert.strictEqual(softener.lead_time_note, 'Limited stock available, subject to prior sale');
  assert.deepStrictEqual(softener.attributes, [
    { key: 'Flow Rate', value: '4 LPS (14.4 m³/hr)' },
    { key: 'Arrangement', value: 'Simplex' }
  ]);
  // Softener sub-components keep real Volumes (500 Ltrs, 350 Ltrs), real Origin (China), fixed ASME Standard, and stripped "Standard" remark
  const sSubs = softener.sub_components || [];
  assert.strictEqual(sSubs[0].country_of_origin, 'China');
  assert.deepStrictEqual(sSubs[0].attributes, [
    { key: 'Design Pressure', value: '10.5 bar' },
    { key: 'Standard', value: 'USA ASME' }
  ]);
  assert.deepStrictEqual(sSubs[1].attributes, [{ key: 'Volume', value: '500 Ltrs' }]);
  assert.deepStrictEqual(sSubs[2].attributes, [{ key: 'Volume', value: '350 Ltrs' }]);
  assert.strictEqual(sSubs[2].remark, '');

  // --- Idempotency check: running normalizer a second time produces identical output ---
  const normalizedAgain = normalizeExtractedLineItems(normalized, {
    globalDeliveryPeriod: 'As mentioned against each item'
  });
  assert.strictEqual(normalizedAgain[0].sub_components?.length, 6);
  assert.deepStrictEqual(normalizedAgain[0].attributes, mmf.attributes);
  assert.strictEqual(normalizedAgain[0].lead_time_note, mmf.lead_time_note);
  assert.strictEqual(normalizedAgain[1].lead_time_note, softener.lead_time_note);
});

console.log(`\nAI Extraction Normalizer Tests Complete: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) {
  process.exit(1);
}
