import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  extractBearerToken,
  verifyFirebaseIdTokenWithCerts,
  shouldAllowFaultSimulation,
  createSlidingWindowRateLimiter,
  createFirebaseAuthMiddleware,
  createGeminiRateLimitMiddleware,
  FirebaseAuthError,
  type AuthenticatedRequest,
} from '../utils/serverAuth';
import {
  getExtractionSystemPrompt,
  buildCompatibleGenerationConfig,
  DEFAULT_MODEL_CASCADE,
  DEEP_MODEL_CASCADE,
} from '../utils/aiExtractionPrompt';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++;
      console.log(`  PASS  ${name}`);
    })
    .catch((err: any) => {
      failed++;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${err?.message || err}`);
    });
}

// Generate two ephemeral RSA-2048 key pairs for RS256 JWT tests
const primaryKeys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const rogueKeys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TEST_PROJECT_ID = 'gen-lang-client-0374443245';
const TEST_KID = 'test-key-1';
const TEST_CERTS: Record<string, string> = {
  [TEST_KID]: primaryKeys.publicKey,
};

function signTestJwt(
  payload: Record<string, any>,
  options?: {
    header?: Record<string, any>;
    privateKeyPem?: string;
  }
): string {
  const header = options?.header ?? { alg: 'RS256', typ: 'JWT', kid: TEST_KID };
  const headerB64 = Buffer.from(JSON.stringify(header), 'utf8').toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(options?.privateKeyPem ?? primaryKeys.privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

function makeValidPayload(nowSec: number, overrides?: Record<string, any>): Record<string, any> {
  return {
    iss: `https://securetoken.google.com/${TEST_PROJECT_ID}`,
    aud: TEST_PROJECT_ID,
    sub: 'firebase-uid-12345',
    email: 'engineer@example.com',
    email_verified: true,
    iat: nowSec - 60,
    auth_time: nowSec - 60,
    exp: nowSec + 3600,
    ...overrides,
  };
}

function createMockResponse() {
  const headers: Record<string, string> = {};
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function runAllTests() {
  console.log('\nRunning serverSecurity tests...\n');

  await test('extractBearerToken handles missing, malformed, and valid Authorization headers', () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken(''), null);
    assert.equal(extractBearerToken('Basic abc123'), null);
    assert.equal(extractBearerToken('Bearer'), null);
    assert.equal(extractBearerToken('Bearer   '), null);
    assert.equal(extractBearerToken('Bearer token extra'), null);
    assert.equal(extractBearerToken('Bearer my.jwt.token'), 'my.jwt.token');
    assert.equal(extractBearerToken('bearer my.jwt.token'), 'my.jwt.token');
    assert.equal(extractBearerToken(['Bearer first.jwt.token', 'Bearer second']), 'first.jwt.token');
  });

  await test('verifyFirebaseIdTokenWithCerts accepts a valid RS256 Firebase ID token', () => {
    const nowSec = 1_750_000_000;
    const token = signTestJwt(makeValidPayload(nowSec));
    const user = verifyFirebaseIdTokenWithCerts(token, TEST_PROJECT_ID, TEST_CERTS, nowSec);
    assert.equal(user.uid, 'firebase-uid-12345');
    assert.equal(user.email, 'engineer@example.com');
    assert.equal(user.emailVerified, true);
  });

  await test('verifyFirebaseIdTokenWithCerts rejects malformed tokens and unsupported algorithms', () => {
    const nowSec = 1_750_000_000;
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts('not-a-jwt', TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'MALFORMED_TOKEN'
    );

    const hs256Token = signTestJwt(makeValidPayload(nowSec), {
      header: { alg: 'HS256', typ: 'JWT', kid: TEST_KID },
    });
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(hs256Token, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'UNSUPPORTED_ALG'
    );

    const noneAlgToken = signTestJwt(makeValidPayload(nowSec), {
      header: { alg: 'none', typ: 'JWT', kid: TEST_KID },
    });
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(noneAlgToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'UNSUPPORTED_ALG'
    );
  });

  await test('verifyFirebaseIdTokenWithCerts rejects unknown kid, rogue signature, and tampered payload', () => {
    const nowSec = 1_750_000_000;

    const unknownKidToken = signTestJwt(makeValidPayload(nowSec), {
      header: { alg: 'RS256', typ: 'JWT', kid: 'rotated-key-999' },
    });
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(unknownKidToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'UNKNOWN_KID'
    );

    const rogueSignedToken = signTestJwt(makeValidPayload(nowSec), {
      privateKeyPem: rogueKeys.privateKey,
    });
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(rogueSignedToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'INVALID_SIGNATURE'
    );

    // Tamper with payload segment after signing
    const validToken = signTestJwt(makeValidPayload(nowSec));
    const [h, , s] = validToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify(makeValidPayload(nowSec, { sub: 'admin-impersonator' })),
      'utf8'
    ).toString('base64url');
    assert.throws(
      () =>
        verifyFirebaseIdTokenWithCerts(
          `${h}.${tamperedPayload}.${s}`,
          TEST_PROJECT_ID,
          TEST_CERTS,
          nowSec
        ),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'INVALID_SIGNATURE'
    );
  });

  await test('verifyFirebaseIdTokenWithCerts rejects expired tokens, future iat, wrong aud, wrong iss, and empty sub', () => {
    const nowSec = 1_750_000_000;

    const expiredToken = signTestJwt(makeValidPayload(nowSec, { exp: nowSec - 1 }));
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(expiredToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'TOKEN_EXPIRED'
    );

    const futureIatToken = signTestJwt(makeValidPayload(nowSec, { iat: nowSec + 600 }));
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(futureIatToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'INVALID_IAT'
    );

    const wrongAudToken = signTestJwt(makeValidPayload(nowSec, { aud: 'other-firebase-project' }));
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(wrongAudToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'INVALID_AUD'
    );

    const wrongIssToken = signTestJwt(
      makeValidPayload(nowSec, { iss: 'https://securetoken.google.com/other-firebase-project' })
    );
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(wrongIssToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'INVALID_ISS'
    );

    const emptySubToken = signTestJwt(makeValidPayload(nowSec, { sub: '   ' }));
    assert.throws(
      () => verifyFirebaseIdTokenWithCerts(emptySubToken, TEST_PROJECT_ID, TEST_CERTS, nowSec),
      (err: any) => err instanceof FirebaseAuthError && err.code === 'INVALID_SUB'
    );
  });

  await test('shouldAllowFaultSimulation blocks fault injection in production and allows dev/test', () => {
    assert.equal(shouldAllowFaultSimulation('production'), false);
    assert.equal(shouldAllowFaultSimulation('PRODUCTION'), false);
    assert.equal(shouldAllowFaultSimulation('  production  '), false);
    assert.equal(shouldAllowFaultSimulation('development'), true);
    assert.equal(shouldAllowFaultSimulation('test'), true);
    assert.equal(shouldAllowFaultSimulation(undefined), true);
  });

  await test('createSlidingWindowRateLimiter allows 20 requests/min, blocks 21st with Retry-After, isolates users, and resets after window', () => {
    const limiter = createSlidingWindowRateLimiter({ maxRequests: 20, windowMs: 60_000 });
    const t0 = 1_750_000_000_000;

    for (let i = 1; i <= 20; i++) {
      const res = limiter.check('uid:userA', t0 + i * 100);
      assert.equal(res.allowed, true, `Request #${i} should be allowed`);
      assert.equal(res.remaining, 20 - i);
      assert.equal(res.retryAfterSec, 0);
    }

    // 21st request within the 60s window must be rejected
    const blocked = limiter.check('uid:userA', t0 + 5_000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);

    // Distinct user must remain unaffected
    const userB = limiter.check('uid:userB', t0 + 5_000);
    assert.equal(userB.allowed, true);
    assert.equal(userB.remaining, 19);

    // After the 60s sliding window advances past the earliest timestamp, userA is allowed again
    const recovered = limiter.check('uid:userA', t0 + 60_200);
    assert.equal(recovered.allowed, true);
  });

  await test('createFirebaseAuthMiddleware rejects missing/invalid tokens with 401 and attaches req.authUser on valid token', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const middleware = createFirebaseAuthMiddleware(TEST_PROJECT_ID, async (token, projectId) =>
      verifyFirebaseIdTokenWithCerts(token, projectId, TEST_CERTS, nowSec)
    );

    // 1. Missing Authorization header -> 401
    {
      let nextCalled = false;
      const req = { headers: {} } as unknown as AuthenticatedRequest;
      const res = createMockResponse();
      await middleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body?.isFirebaseAuthError, true);
    }

    // 2. Invalid token -> 401
    {
      let nextCalled = false;
      const req = { headers: { authorization: 'Bearer invalid.jwt.token' } } as unknown as AuthenticatedRequest;
      const res = createMockResponse();
      await middleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.equal(res.body?.isFirebaseAuthError, true);
    }

    // 3. Valid token -> calls next() and attaches req.authUser
    {
      let nextCalled = false;
      const validJwt = signTestJwt(makeValidPayload(nowSec));
      const req = { headers: { authorization: `Bearer ${validJwt}` } } as unknown as AuthenticatedRequest;
      const res = createMockResponse();
      await middleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(req.authUser?.uid, 'firebase-uid-12345');
      assert.equal(req.authUser?.email, 'engineer@example.com');
    }
  });

  await test('createGeminiRateLimitMiddleware returns 429 with Retry-After after limit exceeded', () => {
    const rateMiddleware = createGeminiRateLimitMiddleware({ maxRequests: 2, windowMs: 60_000 });
    const req = { authUser: { uid: 'uid-rate-test' }, ip: '127.0.0.1' } as unknown as AuthenticatedRequest;

    for (let i = 0; i < 2; i++) {
      let nextCalled = false;
      const res = createMockResponse();
      rateMiddleware(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(res.headers['x-ratelimit-limit'], '2');
    }

    let nextCalled = false;
    const res3 = createMockResponse();
    rateMiddleware(req, res3, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res3.statusCode, 429);
    assert.equal(res3.body?.isRateLimited, true);
    assert.ok(parseInt(res3.headers['retry-after'], 10) > 0);
  });

  await test('Track S2 shared extraction prompt and generationConfig match server/client parity', () => {
    const prompt = getExtractionSystemPrompt([
      { full_name: 'Nitin Srivastava', initials: 'NS', email: 'nitin@company.com' },
    ]);
    assert.ok(prompt.includes('is_composite_set'));
    assert.ok(prompt.includes('sub_components'));
    assert.ok(prompt.includes('Flow Rate'));
    assert.ok(prompt.includes('USA ASME'));
    assert.ok(prompt.includes('lead_time_note'));
    assert.ok(prompt.includes('Nitin Srivastava'));

    const modernCfg = buildCompatibleGenerationConfig('gemini-4-hydrogen', 'fast');
    assert.equal(modernCfg.maxOutputTokens, 65536);
    assert.equal(modernCfg.responseMimeType, 'application/json');
    assert.equal('temperature' in modernCfg, false);

    const legacyCfg = buildCompatibleGenerationConfig('gemini-2.5-flash', 'fast');
    assert.equal(legacyCfg.maxOutputTokens, 65536);
    assert.equal(legacyCfg.temperature, 0.1);

    assert.ok(DEFAULT_MODEL_CASCADE.length >= 3);
    assert.ok(DEEP_MODEL_CASCADE.length >= 3);
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
