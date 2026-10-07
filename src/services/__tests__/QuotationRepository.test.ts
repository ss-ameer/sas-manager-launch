import assert from 'node:assert';

// 1. Shims for Node execution
const storageMap = new Map<string, string>();
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = {
    getItem: (key: string) => storageMap.get(key) || null,
    setItem: (key: string, value: string) => storageMap.set(key, String(value)),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear()
  };
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    localStorage: globalThis.localStorage,
    indexedDB: undefined
  };
}

import { QuotationRepository } from '../repositories/QuotationRepository';
import { Quotation, QuotationPreset, QuotationLineItem } from '../../types';

let passedCount = 0;
let failedCount = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.message || err}`);
    if (err?.stack) {
      console.error(err.stack.split('\n').slice(1, 3).join('\n'));
    }
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('\n========================================');
  console.log('Running QuotationRepository Unit Tests');
  console.log('========================================\n');

  // Unique run prefix to isolate every run from past persistent runs
  const runTag = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const wsAlpha = `ws_alpha_${runTag}`;
  const wsTenant1 = `ws_tenant1_${runTag}`;
  const wsTenant2 = `ws_tenant2_${runTag}`;
  const wsPresetA = `ws_preset_a_${runTag}`;
  const wsPresetB = `ws_preset_b_${runTag}`;

  // Group 1: Initial Quote Creation
  console.log('Group 1: Initial Quote Creation');
  await test('creates initial quote defaulting to revision 0 (R0) and formatted reference', async () => {
    const quote = await QuotationRepository.createQuotation({
      workspace_id: wsAlpha,
      workspaceId: wsAlpha,
      enquiry_id: `enq_101_${runTag}`,
      quote_number: 'QT-2026-0001',
      status: 'Draft',
      client_snapshot: {
        entity_name: 'Acme Water Treatment LLC',
        contact_person: 'John Doe',
        email: 'john@acme.ae'
      },
      sender_snapshot: {
        entity_name: 'PureTech Solutions FZE',
        trn: '100200300400003'
      },
      line_items: [
        {
          item_name: 'RO Membrane 8040',
          description: 'High rejection brackish water membrane',
          quantity: 4,
          unit: 'pcs',
          unit_price: 1500,
          total_price: 6000
        }
      ],
      tax_mode: 'taxes_extra',
      subtotal: 6000,
      freight_amount: 250,
      tax_rate_percent: 5,
      tax_amount: 312.5,
      grand_total: 6562.5
    });

    assert.ok(quote.id, 'Quotation must have an ID');
    assert.strictEqual(quote.revision_number, 0, 'Initial quote revision number must be 0');
    assert.strictEqual(quote.formatted_quote_ref, 'QT-2026-0001-R0', 'Formatted ref must end in -R0');
    assert.strictEqual(quote.status, 'Draft', 'Default status must be Draft');
    assert.strictEqual(quote.line_items.length, 1, 'Should preserve line items');
    assert.strictEqual(quote.grand_total, 6562.5, 'Grand total must match');
  });

  // Group 2: Non-Destructive Revisioning
  console.log('Group 2: Non-Destructive Revisioning');
  await test('creates R1 revision, supersedes parent R0 quote, and maintains history', async () => {
    const enq202Id = `enq_202_${runTag}`;
    const parent = await QuotationRepository.createQuotation({
      workspace_id: wsAlpha,
      workspaceId: wsAlpha,
      enquiry_id: enq202Id,
      quote_number: 'QT-2026-0042',
      status: 'Sent',
      client_snapshot: { entity_name: 'Apex Filtration Ltd' },
      sender_snapshot: { entity_name: 'PureTech Solutions FZE' },
      line_items: [
        {
          item_name: 'Dosing Pump 5 LPH',
          description: 'Solenoid diaphragm dosing pump',
          quantity: 2,
          unit: 'pcs',
          unit_price: 800,
          total_price: 1600
        }
      ],
      tax_mode: 'taxes_extra',
      subtotal: 1600,
      freight_amount: 0,
      tax_rate_percent: 5,
      tax_amount: 80,
      grand_total: 1680
    });

    assert.strictEqual(parent.revision_number, 0);
    assert.strictEqual(parent.status, 'Sent');

    // Create revision R1 with updated price
    const childRevision = await QuotationRepository.createRevision(parent.id!, {
      line_items: [
        {
          item_name: 'Dosing Pump 5 LPH',
          description: 'Solenoid diaphragm dosing pump with special discount',
          quantity: 2,
          unit: 'pcs',
          unit_price: 750,
          total_price: 1500
        }
      ],
      subtotal: 1500,
      tax_amount: 75,
      grand_total: 1575
    });

    assert.strictEqual(childRevision.revision_number, 1, 'Child quote must be R1');
    assert.strictEqual(childRevision.formatted_quote_ref, 'QT-2026-0042-R1', 'Child formatted ref must be R1');
    assert.strictEqual(childRevision.parent_quote_id, parent.id, 'Child quote must reference parent quote id');
    assert.strictEqual(childRevision.grand_total, 1575, 'Child must have updated grand total');

    // Verify parent is superseded
    const fetchedParent = await QuotationRepository.getQuotationById(parent.id!);
    assert.strictEqual(fetchedParent?.status, 'Superseded', 'Parent quote must be superseded');

    // Verify retrieval for enquiry returns both in descending revision order
    const allEnquiryQuotes = await QuotationRepository.getQuotationsForEnquiry(enq202Id, wsAlpha);
    assert.strictEqual(allEnquiryQuotes.length, 2, 'Should return both R1 and R0');
    assert.strictEqual(allEnquiryQuotes[0].revision_number, 1, 'R1 must come first (descending)');
    assert.strictEqual(allEnquiryQuotes[1].revision_number, 0, 'R0 must come second');
  });

  // Group 3: Workspace Isolation
  console.log('Group 3: Workspace Scoping & Query Isolation');
  await test('enforces strict workspace boundaries for enquiries and dual-field lookups', async () => {
    const enq303Id = `enq_303_${runTag}`;
    await QuotationRepository.createQuotation({
      workspace_id: wsTenant1,
      workspaceId: wsTenant1,
      enquiry_id: enq303Id,
      quote_number: 'QT-T1-01',
      status: 'Draft',
      client_snapshot: { entity_name: 'Tenant 1 Client' },
      sender_snapshot: { entity_name: 'Tenant 1' },
      line_items: [],
      tax_mode: 'tax_exempt',
      subtotal: 500,
      freight_amount: 0,
      tax_rate_percent: 0,
      tax_amount: 0,
      grand_total: 500
    });

    // Query with different workspace must return empty
    const tenant2Quotes = await QuotationRepository.getQuotationsForEnquiry(enq303Id, wsTenant2);
    assert.strictEqual(tenant2Quotes.length, 0, 'Cross-workspace enquiry quote leak rejected');

    // Query with correct workspace returns the record
    const tenant1Quotes = await QuotationRepository.getQuotationsForEnquiry(enq303Id, wsTenant1);
    assert.strictEqual(tenant1Quotes.length, 1, 'Matching workspace quote found');
  });

  await test('isolates QuotationPresets by workspace', async () => {
    await QuotationRepository.savePreset({
      workspace_id: wsPresetA,
      workspaceId: wsPresetA,
      preset_name: 'Export CIF Template',
      visible_columns: { brand: true, model: true, origin: true },
      default_tax_mode: 'tax_exempt',
      default_validity_days: 60,
      signatory_mode: 'dual'
    });

    const presetA = await QuotationRepository.getPresets(wsPresetA);
    assert.strictEqual(presetA.length, 1);
    assert.strictEqual(presetA[0].preset_name, 'Export CIF Template');

    const presetB = await QuotationRepository.getPresets(wsPresetB);
    assert.strictEqual(presetB.length, 0, 'Workspace B must not see Workspace A presets');
  });

  // Group 4: Tax Calculation Integrity
  console.log('Group 4: Tax Calculation Integrity');
  await test('calculates taxes_extra (exclusive tax) accurately', () => {
    const items: QuotationLineItem[] = [
      { item_name: 'Item A', description: '', quantity: 2, unit: 'pcs', unit_price: 1000, total_price: 2000 },
      { item_name: 'Item B', description: '', quantity: 1, unit: 'pcs', unit_price: 500, total_price: 500 },
      { item_name: 'Optional Item C', description: '', quantity: 1, unit: 'pcs', unit_price: 300, total_price: 300, is_optional: true }
    ];

    // Subtotal should exclude optional items: 2000 + 500 = 2500
    // Freight: 100 -> Base: 2600
    // 5% Tax Extra: 130 -> Grand Total: 2730
    const calc = QuotationRepository.calculateTotals(items, 100, 'taxes_extra', 5);
    assert.strictEqual(calc.subtotal, 2500);
    assert.strictEqual(calc.freight_amount, 100);
    assert.strictEqual(calc.tax_amount, 130);
    assert.strictEqual(calc.grand_total, 2730);
  });

  await test('calculates tax_calculated (inclusive tax) accurately', () => {
    const items: QuotationLineItem[] = [
      { item_name: 'Item Inclusive', description: '', quantity: 1, unit: 'lot', unit_price: 2100, total_price: 2100 }
    ];

    // Base: 2100, 5% inclusive tax -> 2100 - (2100 / 1.05) = 100
    const calc = QuotationRepository.calculateTotals(items, 0, 'tax_calculated', 5);
    assert.strictEqual(calc.subtotal, 2100);
    assert.strictEqual(calc.tax_amount, 100);
    assert.strictEqual(calc.grand_total, 2100);
  });

  await test('calculates tax_exempt accurately with zero tax', () => {
    const items: QuotationLineItem[] = [
      { item_name: 'Exempt Goods', description: '', quantity: 5, unit: 'pcs', unit_price: 400, total_price: 2000 }
    ];

    const calc = QuotationRepository.calculateTotals(items, 150, 'tax_exempt', 5);
    assert.strictEqual(calc.subtotal, 2000);
    assert.strictEqual(calc.freight_amount, 150);
    assert.strictEqual(calc.tax_amount, 0);
    assert.strictEqual(calc.grand_total, 2150);
  });

  console.log('\n========================================');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
