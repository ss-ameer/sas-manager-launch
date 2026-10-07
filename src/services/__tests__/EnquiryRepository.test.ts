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

import { EnquiryRepository } from '../repositories/EnquiryRepository';
import { Enquiry, UserProfile, Workspace } from '../../types';
import { WorkspaceStorageSettings } from '../attachmentStorage';
import { getPendingMutations } from '../db';

// Test Runner Helper
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
  console.log('Running EnquiryRepository Unit Tests');
  console.log('========================================\n');

  const originalFetch = globalThis.fetch;
  let fetchCalls: { url: string; method?: string; headers?: any }[] = [];

  const resetFetchSpy = () => {
    fetchCalls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({
        url: typeof input === 'string' ? input : input.toString(),
        method: init?.method,
        headers: init?.headers
      });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => ''
      } as Response;
    }) as any;
  };

  const sampleWorkspaceSettings: WorkspaceStorageSettings = {
    storage: {
      enabled: true,
      bucket: 'tenant-omega-bucket',
      supabaseUrl: 'https://omega.supabase.co',
      supabaseAnonKey: 'anon-key-omega'
    }
  };

  const createTestEnquiry = (overrides: Partial<Enquiry>): Enquiry => {
    return {
      id: overrides.id || 'enq-test',
      sn: overrides.sn ?? 100,
      enquiry_date: overrides.enquiry_date || '2026-10-06',
      workspace_id: overrides.workspace_id || 'ws_default',
      workspaceId: overrides.workspaceId || overrides.workspace_id || 'ws_default',
      company_id: overrides.company_id || 'comp-test',
      country: overrides.country || 'UAE',
      project_location: overrides.project_location || 'Dubai',
      enquiry_source: overrides.enquiry_source || 'Email',
      status: overrides.status || 'Draft',
      quote_ref_no: overrides.quote_ref_no || `QT-${overrides.sn ?? 100}`,
      value_aed: overrides.value_aed ?? 5000,
      line_items: overrides.line_items || [],
      ...overrides
    };
  };

  // --------------------------------------------------------------------------
  // Group 1: softDelete Behavior & Storage Safety
  // --------------------------------------------------------------------------
  console.log('Group 1: softDelete Behavior & Storage Safety');

  await test('softDelete sets is_deleted, timestamp, and user UID without purging storage', async () => {
    resetFetchSpy();
    const testEnquiry = createTestEnquiry({
      id: 'enq-soft-1',
      sn: 201,
      enquiry_date: '2026-10-06',
      workspace_id: 'ws_test_1',
      workspaceId: 'ws_test_1',
      attachments: [
        {
          id: 'att-soft-1',
          name: 'quote_omega.pdf',
          size: 2048,
          type: 'application/pdf',
          url: 'https://omega.supabase.co/storage/v1/object/public/tenant-omega-bucket/enquiries/quote_omega.pdf',
          storageKey: 'blob_omega_1',
          uploadedAt: '2026-10-06T10:00:00Z'
        }
      ]
    });

    await EnquiryRepository.save(testEnquiry);

    // Execute soft deletion
    await EnquiryRepository.softDelete('enq-soft-1', { uid: 'user-op-1', name: 'Operator One' });

    // Verify cache state
    const all = await EnquiryRepository.getAllLocal();
    const target = all.find((e) => e.id === 'enq-soft-1');

    assert.ok(target, 'Enquiry should still exist in store');
    assert.strictEqual(target?.is_deleted, true, 'is_deleted must be true');
    assert.strictEqual(target?.deleted_by_uid, 'user-op-1', 'deleted_by_uid must match caller UID');
    assert.strictEqual(target?.deleted_by_name, 'Operator One', 'deleted_by_name must match caller name');
    assert.ok(typeof target?.deleted_at === 'string', 'deleted_at timestamp must be recorded');
    assert.strictEqual(fetchCalls.length, 0, 'Soft-delete must NEVER trigger remote storage deletion');
  });

  // --------------------------------------------------------------------------
  // Group 2: restore Verification
  // --------------------------------------------------------------------------
  console.log('\nGroup 2: restore Verification');

  await test('restore reverts is_deleted to false and clears deletion metadata', async () => {
    // Restore the soft-deleted item from Group 1
    await EnquiryRepository.restore('enq-soft-1');

    const all = await EnquiryRepository.getAllLocal();
    const target = all.find((e) => e.id === 'enq-soft-1');

    assert.ok(target, 'Enquiry should exist in store');
    assert.strictEqual(target?.is_deleted, false, 'is_deleted must be false upon restoration');
    assert.strictEqual(target?.deleted_at, undefined, 'deleted_at must be undefined');
    assert.strictEqual(target?.deleted_by_uid, undefined, 'deleted_by_uid must be undefined');
    assert.strictEqual(target?.deleted_by_name, undefined, 'deleted_by_name must be undefined');
  });

  // --------------------------------------------------------------------------
  // Group 3: purgePermanent (Safety Net & Cascade Storage)
  // --------------------------------------------------------------------------
  console.log('\nGroup 3: purgePermanent (Safety Net & Cascade Storage)');

  await test('purgePermanent invokes attachment cleanup and hard deletes record with storage settings', async () => {
    resetFetchSpy();
    const testEnquiry = createTestEnquiry({
      id: 'enq-purge-cloud',
      sn: 202,
      enquiry_date: '2026-10-06',
      workspace_id: 'ws_test_1',
      workspaceId: 'ws_test_1',
      attachments: [
        {
          id: 'att-purge-1',
          name: 'hard_purge.pdf',
          size: 4096,
          type: 'application/pdf',
          url: 'https://omega.supabase.co/storage/v1/object/public/tenant-omega-bucket/enquiries/hard_purge.pdf',
          storageKey: 'blob_purge_1',
          uploadedAt: '2026-10-06T10:00:00Z'
        }
      ]
    });

    await EnquiryRepository.save(testEnquiry);

    // Call purgePermanent with valid workspace storage settings
    await EnquiryRepository.purgePermanent('enq-purge-cloud', sampleWorkspaceSettings);

    // 1. Verify item removed from local cache
    const all = await EnquiryRepository.getAllLocal();
    const target = all.find((e) => e.id === 'enq-purge-cloud');
    assert.strictEqual(target, undefined, 'Record should be permanently removed from local store');

    // 2. Verify cloud deletion request was dispatched
    assert.strictEqual(fetchCalls.length, 1, 'Remote deletion should be triggered for cloud attachment');
    assert.strictEqual(fetchCalls[0].method, 'DELETE');
    assert.ok(fetchCalls[0].url.includes('/tenant-omega-bucket/enquiries/hard_purge.pdf'));

    // 3. Verify sync engine enqueued delete mutation
    const mutations = await getPendingMutations();
    const deleteMutation = mutations.find((m) => m.entity === 'enquiries' && m.action === 'delete' && m.docId === 'enq-purge-cloud');
    assert.ok(deleteMutation, 'Delete mutation must be queued for Firestore sync');
  });

  await test('purgePermanent safely skips remote storage when workspaceSettings is undefined', async () => {
    resetFetchSpy();
    const testEnquiry = createTestEnquiry({
      id: 'enq-purge-nostorage',
      sn: 203,
      enquiry_date: '2026-10-06',
      workspace_id: 'ws_test_1',
      workspaceId: 'ws_test_1',
      attachments: [
        {
          id: 'att-purge-2',
          name: 'local_only.pdf',
          size: 1024,
          type: 'application/pdf',
          url: 'https://omega.supabase.co/storage/v1/object/public/tenant-omega-bucket/enquiries/local_only.pdf',
          storageKey: 'blob_purge_2',
          uploadedAt: '2026-10-06T10:00:00Z'
        }
      ]
    });

    await EnquiryRepository.save(testEnquiry);

    // Call purgePermanent without storage settings
    await EnquiryRepository.purgePermanent('enq-purge-nostorage', undefined);

    const all = await EnquiryRepository.getAllLocal();
    assert.strictEqual(all.find((e) => e.id === 'enq-purge-nostorage'), undefined);
    assert.strictEqual(fetchCalls.length, 0, 'No remote delete calls should be made if workspaceSettings is omitted');
  });

  // --------------------------------------------------------------------------
  // Group 4: Workspace Scoping & Query Isolation
  // --------------------------------------------------------------------------
  console.log('\nGroup 4: Workspace Scoping & Query Isolation');

  await test('docToEnquiry safely standardizes dual workspace fields (workspace_id and workspaceId)', () => {
    // Legacy document with only workspaceId
    const enqFromLegacy = EnquiryRepository.docToEnquiry('enq-leg', {
      sn: 301,
      workspaceId: 'ws_legacy_tenant'
    });
    assert.strictEqual(enqFromLegacy.workspace_id, 'ws_legacy_tenant');
    assert.strictEqual(enqFromLegacy.workspaceId, 'ws_legacy_tenant');

    // Modern document with workspace_id
    const enqFromModern = EnquiryRepository.docToEnquiry('enq-mod', {
      sn: 302,
      workspace_id: 'ws_modern_tenant'
    });
    assert.strictEqual(enqFromModern.workspace_id, 'ws_modern_tenant');
    assert.strictEqual(enqFromModern.workspaceId, 'ws_modern_tenant');

    // Document with neither defaults safely to ws_default
    const enqDefault = EnquiryRepository.docToEnquiry('enq-def', {
      sn: 303
    });
    assert.strictEqual(enqDefault.workspace_id, 'ws_default');
    assert.strictEqual(enqDefault.workspaceId, 'ws_default');
  });

  await test('getEnquiryById enforces workspace boundaries', async () => {
    const scopedEnquiry = createTestEnquiry({
      id: 'enq-tenant-a',
      sn: 401,
      enquiry_date: '2026-10-06',
      workspace_id: 'ws_tenant_a',
      workspaceId: 'ws_tenant_a'
    });
    await EnquiryRepository.save(scopedEnquiry);

    // Same workspace access: succeeds
    const accessOk = await EnquiryRepository.getEnquiryById('enq-tenant-a', 'ws_tenant_a');
    assert.ok(accessOk);
    assert.strictEqual(accessOk?.id, 'enq-tenant-a');

    // Cross-workspace access: throws boundary violation error
    await assert.rejects(
      async () => {
        await EnquiryRepository.getEnquiryById('enq-tenant-a', 'ws_tenant_b');
      },
      /Access Denied: Cross-Workspace Boundary Violation/
    );
  });

  await test('filterVisibleEnquiries isolates records according to user workspace role', () => {
    const list: Enquiry[] = [
      createTestEnquiry({
        id: 'e-1',
        sn: 501,
        workspace_id: 'ws_sample',
        assigned_to_id: 'user-admin',
        is_deleted: false
      }),
      createTestEnquiry({
        id: 'e-2',
        sn: 502,
        workspace_id: 'ws_sample',
        assigned_to_id: 'user-member-1',
        is_deleted: false
      }),
      createTestEnquiry({
        id: 'e-3',
        sn: 503,
        workspace_id: 'ws_sample',
        assigned_to_id: 'user-member-2',
        shared_with_uids: ['user-member-1'],
        is_deleted: false
      }),
      createTestEnquiry({
        id: 'e-4',
        sn: 504,
        workspace_id: 'ws_sample',
        is_deleted: true // soft-deleted
      })
    ];

    const adminUser: UserProfile = {
      id: 'user-admin',
      uid: 'user-admin',
      username: 'admin',
      name: 'Admin Boss',
      email: 'admin@company.com',
      role: 'Admin'
    };

    const regularUser: UserProfile = {
      id: 'user-member-1',
      uid: 'user-member-1',
      username: 'rep1',
      name: 'Regular Rep',
      email: 'rep@company.com',
      role: 'Employee'
    };

    const sampleWorkspace: Workspace = {
      id: 'ws_sample',
      name: 'Sample WS',
      created_by: 'user-admin',
      createdAt: '2026-01-01',
      modules: { enquiriesEnabled: true, callLogEnabled: true },
      data_visibility_scope: 'OWN_DATA_ONLY'
    };

    // Admin sees all non-deleted records (3 records)
    const adminVisible = EnquiryRepository.filterVisibleEnquiries(list, adminUser, sampleWorkspace);
    assert.strictEqual(adminVisible.length, 3, 'Admin must see all 3 non-deleted records');

    // Restricted member sees assigned (e-2) and shared (e-3), but not e-1 or soft-deleted e-4
    const memberVisible = EnquiryRepository.filterVisibleEnquiries(list, regularUser, sampleWorkspace);
    assert.strictEqual(memberVisible.length, 2, 'Restricted member should only see assigned or shared records');
    assert.ok(memberVisible.some((e) => e.id === 'e-2'));
    assert.ok(memberVisible.some((e) => e.id === 'e-3'));
    assert.ok(!memberVisible.some((e) => e.id === 'e-1'));
    assert.ok(!memberVisible.some((e) => e.id === 'e-4'));
  });

  // Restore fetch
  globalThis.fetch = originalFetch;

  console.log('\n========================================');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    throw new Error(`EnquiryRepository unit tests failed with ${failedCount} failure(s)`);
  }
}

// Automatically execute suite when run via tsx
runTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
