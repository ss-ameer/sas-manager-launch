import assert from 'node:assert';
import {
  purgeEnquiryAttachments,
  deleteFromSupabaseStorage,
  getAttachmentStorageKey,
  dataUrlToFile,
  StorageConfig,
  WorkspaceStorageSettings
} from '../attachmentStorage';
import { Attachment } from '../../types';

// Mock environment setup for Node execution
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    indexedDB: undefined
  };
}

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
  console.log('Running Storage Subsystem Unit Tests');
  console.log('========================================\n');

  const originalFetch = globalThis.fetch;
  let fetchCalls: { url: string; init?: RequestInit }[] = [];
  let mockFetchStatus = 200;
  let mockFetchError: Error | null = null;

  const resetMocks = () => {
    fetchCalls = [];
    mockFetchStatus = 200;
    mockFetchError = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      fetchCalls.push({ url: urlStr, init });
      if (mockFetchError) {
        throw mockFetchError;
      }
      return {
        ok: mockFetchStatus >= 200 && mockFetchStatus < 300,
        status: mockFetchStatus,
        statusText: mockFetchStatus === 200 ? 'OK' : mockFetchStatus === 404 ? 'Not Found' : 'Error',
        json: async () => ({}),
        text: async () => ''
      } as Response;
    }) as any;
  };

  const validWorkspaceSettings: WorkspaceStorageSettings = {
    storage: {
      enabled: true,
      provider: 'supabase',
      bucket: 'workspace-a-bucket',
      supabaseUrl: 'https://workspace-a.supabase.co',
      supabaseAnonKey: 'anon-key-a-123'
    }
  };

  // --------------------------------------------------------------------------
  // Group 1: purgeEnquiryAttachments Null/Empty Resolution
  // --------------------------------------------------------------------------
  console.log('Group 1: purgeEnquiryAttachments Null/Empty Resolution');

  await test('handles undefined attachments gracefully without throwing', async () => {
    resetMocks();
    await purgeEnquiryAttachments(undefined, validWorkspaceSettings);
    assert.strictEqual(fetchCalls.length, 0, 'Should make no fetch calls');
  });

  await test('handles null attachments gracefully without throwing', async () => {
    resetMocks();
    await purgeEnquiryAttachments(null, validWorkspaceSettings);
    assert.strictEqual(fetchCalls.length, 0, 'Should make no fetch calls');
  });

  await test('handles empty attachments array gracefully', async () => {
    resetMocks();
    await purgeEnquiryAttachments([], validWorkspaceSettings);
    assert.strictEqual(fetchCalls.length, 0, 'Should make no fetch calls');
  });

  await test('handles array with null/undefined elements gracefully', async () => {
    resetMocks();
    await purgeEnquiryAttachments([null as any, undefined as any], validWorkspaceSettings);
    assert.strictEqual(fetchCalls.length, 0, 'Should make no fetch calls for invalid elements');
  });

  // --------------------------------------------------------------------------
  // Group 2: Idempotency & 404 Resilience (deleteFromSupabaseStorage)
  // --------------------------------------------------------------------------
  console.log('\nGroup 2: Idempotency & 404 Resilience (deleteFromSupabaseStorage)');

  const validStorageConfig: StorageConfig = {
    supabaseUrl: 'https://test-tenant.supabase.co',
    supabaseAnonKey: 'test-key-xyz',
    bucket: 'test-bucket'
  };

  const sampleFileUrl = 'https://test-tenant.supabase.co/storage/v1/object/public/test-bucket/enquiries/quote_101.pdf';

  await test('returns true for 200 OK response', async () => {
    resetMocks();
    mockFetchStatus = 200;
    const result = await deleteFromSupabaseStorage(sampleFileUrl, validStorageConfig);
    assert.strictEqual(result, true, 'Status 200 should resolve to true');
    assert.strictEqual(fetchCalls.length, 1);
    assert.strictEqual(fetchCalls[0].init?.method, 'DELETE');
    assert.ok(fetchCalls[0].url.includes('/storage/v1/object/test-bucket/enquiries/quote_101.pdf'));
  });

  await test('returns true for 204 No Content response', async () => {
    resetMocks();
    mockFetchStatus = 204;
    const result = await deleteFromSupabaseStorage(sampleFileUrl, validStorageConfig);
    assert.strictEqual(result, true, 'Status 204 should resolve to true');
  });

  await test('returns true for 404 Not Found (Idempotent Deletion)', async () => {
    resetMocks();
    mockFetchStatus = 404;
    const result = await deleteFromSupabaseStorage(sampleFileUrl, validStorageConfig);
    assert.strictEqual(result, true, 'Status 404 (already deleted) should resolve to true for idempotency');
  });

  await test('returns false for 500 Internal Server Error', async () => {
    resetMocks();
    mockFetchStatus = 500;
    const result = await deleteFromSupabaseStorage(sampleFileUrl, validStorageConfig);
    assert.strictEqual(result, false, 'Status 500 should resolve to false');
  });

  await test('handles network/fetch exceptions gracefully and returns false', async () => {
    resetMocks();
    mockFetchError = new Error('Network timeout / connection refused');
    const result = await deleteFromSupabaseStorage(sampleFileUrl, validStorageConfig);
    assert.strictEqual(result, false, 'Network exception should be caught and return false');
  });

  await test('returns false when storageConfig is missing or incomplete', async () => {
    resetMocks();
    const resultNoUrl = await deleteFromSupabaseStorage(sampleFileUrl, { ...validStorageConfig, supabaseUrl: '' });
    assert.strictEqual(resultNoUrl, false, 'Missing supabaseUrl should return false');

    const resultNullConfig = await deleteFromSupabaseStorage(sampleFileUrl, null);
    assert.strictEqual(resultNullConfig, false, 'Null storageConfig should return false');

    const resultEmptyFileUrl = await deleteFromSupabaseStorage('', validStorageConfig);
    assert.strictEqual(resultEmptyFileUrl, false, 'Empty fileUrl should return false');
  });

  // --------------------------------------------------------------------------
  // Group 3: Concurrent Safety & Promise.allSettled
  // --------------------------------------------------------------------------
  console.log('\nGroup 3: Concurrent Safety & Promise.allSettled');

  await test('purgeEnquiryAttachments settles without throwing when partial failures occur', async () => {
    resetMocks();
    let callIndex = 0;
    // Alternate success and failure on fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      callIndex++;
      fetchCalls.push({ url: input.toString(), init });
      if (callIndex === 2) {
        throw new Error('Simulated transient drop on 2nd file');
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({}),
        text: async () => ''
      } as Response;
    }) as any;

    const attachments: Attachment[] = [
      {
        id: 'att-1',
        name: 'spec_1.pdf',
        size: 1024,
        type: 'application/pdf',
        url: 'https://workspace-a.supabase.co/storage/v1/object/public/workspace-a-bucket/enquiries/spec_1.pdf',
        storageKey: 'blob_att_1',
        uploadedAt: '2026-10-06T12:00:00Z'
      },
      {
        id: 'att-2',
        name: 'spec_2.pdf',
        size: 2048,
        type: 'application/pdf',
        url: 'https://workspace-a.supabase.co/storage/v1/object/public/workspace-a-bucket/enquiries/spec_2.pdf',
        storageKey: 'blob_att_2',
        uploadedAt: '2026-10-06T12:00:00Z'
      },
      {
        id: 'att-3',
        name: 'spec_3.pdf',
        size: 4096,
        type: 'application/pdf',
        url: 'https://workspace-a.supabase.co/storage/v1/object/public/workspace-a-bucket/enquiries/spec_3.pdf',
        storageKey: 'blob_att_3',
        uploadedAt: '2026-10-06T12:00:00Z'
      }
    ];

    // Must resolve cleanly without throwing uncaught exception
    await assert.doesNotReject(async () => {
      await purgeEnquiryAttachments(attachments, validWorkspaceSettings);
    }, 'purgeEnquiryAttachments must settle all promises safely');

    assert.strictEqual(fetchCalls.length, 3, 'All 3 attachments should have been attempted');
  });

  // --------------------------------------------------------------------------
  // Group 4: Workspace Scoping & Anti-Leakage
  // --------------------------------------------------------------------------
  console.log('\nGroup 4: Workspace Scoping & Anti-Leakage');

  await test('does NOT execute cloud deletion when active workspace has no storage configured', async () => {
    resetMocks();
    const emptySettings: WorkspaceStorageSettings = {
      storage: {
        enabled: false
      }
    };

    const cloudAttachment: Attachment = {
      id: 'att-cloud',
      name: 'proposal.pdf',
      size: 5000,
      type: 'application/pdf',
      url: 'https://workspace-a.supabase.co/storage/v1/object/public/workspace-a-bucket/enquiries/proposal.pdf',
      uploadedAt: '2026-10-06T12:00:00Z'
    };

    await purgeEnquiryAttachments([cloudAttachment], emptySettings);
    assert.strictEqual(fetchCalls.length, 0, 'Must NOT delete from cloud when workspace has no storage configured');
  });

  await test('strictly dispatches to Workspace A bucket and credentials', async () => {
    resetMocks();
    const workspaceASettings: WorkspaceStorageSettings = {
      storage: {
        bucket: 'tenant-alpha-bucket',
        supabaseUrl: 'https://alpha.supabase.co',
        supabaseAnonKey: 'alpha-anon-key-999'
      }
    };

    const attachmentA: Attachment = {
      id: 'att-alpha',
      name: 'alpha_quote.pdf',
      size: 3000,
      type: 'application/pdf',
      url: 'https://alpha.supabase.co/storage/v1/object/public/tenant-alpha-bucket/enquiries/alpha_quote.pdf',
      uploadedAt: '2026-10-06T12:00:00Z'
    };

    await purgeEnquiryAttachments([attachmentA], workspaceASettings);

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('alpha.supabase.co/storage/v1/object/tenant-alpha-bucket/enquiries/alpha_quote.pdf'));
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    assert.strictEqual(headers['apikey'], 'alpha-anon-key-999');
    assert.strictEqual(headers['Authorization'], 'Bearer alpha-anon-key-999');
  });

  await test('strictly dispatches to Workspace B credentials without cross-workspace leakage', async () => {
    resetMocks();
    const workspaceBSettings: WorkspaceStorageSettings = {
      storage: {
        bucket: 'tenant-beta-bucket',
        supabaseUrl: 'https://beta.supabase.co',
        supabaseAnonKey: 'beta-anon-key-888'
      }
    };

    const attachmentB: Attachment = {
      id: 'att-beta',
      name: 'beta_quote.pdf',
      size: 7000,
      type: 'application/pdf',
      url: 'https://beta.supabase.co/storage/v1/object/public/tenant-beta-bucket/enquiries/beta_quote.pdf',
      uploadedAt: '2026-10-06T12:00:00Z'
    };

    await purgeEnquiryAttachments([attachmentB], workspaceBSettings);

    assert.strictEqual(fetchCalls.length, 1);
    assert.ok(fetchCalls[0].url.includes('beta.supabase.co/storage/v1/object/tenant-beta-bucket/enquiries/beta_quote.pdf'));
    const headers = fetchCalls[0].init?.headers as Record<string, string>;
    assert.strictEqual(headers['apikey'], 'beta-anon-key-888');
    assert.strictEqual(headers['Authorization'], 'Bearer beta-anon-key-888');
    assert.notStrictEqual(headers['apikey'], 'alpha-anon-key-999', 'Must not leak Workspace A credentials into Workspace B');
  });

  // Restore fetch
  globalThis.fetch = originalFetch;

  console.log('\n========================================');
  console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
  console.log('========================================\n');

  if (failedCount > 0) {
    throw new Error(`Unit tests failed with ${failedCount} failure(s)`);
  }
}

// Automatically execute suite when run directly via tsx
runTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
