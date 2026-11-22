/**
 * Server-side Firebase Auth ID token verification (zero service-account / zero firebase-admin),
 * sliding-window per-user rate limiter, and non-production fault-simulation gate for Express
 * `/api/gemini/*` routes.
 */
import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const MAX_CLOCK_SKEW_SEC = 300;
const MIN_CERT_CACHE_TTL_MS = 60_000;
const MAX_CERT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CERT_CACHE_TTL_MS = 5 * 60 * 1000;

export type FirebaseAuthErrorCode =
  | 'MISSING_PROJECT_ID'
  | 'MISSING_TOKEN'
  | 'MALFORMED_TOKEN'
  | 'INVALID_HEADER'
  | 'UNSUPPORTED_ALG'
  | 'UNKNOWN_KID'
  | 'INVALID_SIGNATURE'
  | 'INVALID_PAYLOAD'
  | 'TOKEN_EXPIRED'
  | 'INVALID_IAT'
  | 'INVALID_AUTH_TIME'
  | 'INVALID_AUD'
  | 'INVALID_ISS'
  | 'INVALID_SUB'
  | 'CERT_FETCH_FAILED';

export class FirebaseAuthError extends Error {
  public readonly code: FirebaseAuthErrorCode;

  constructor(code: FirebaseAuthErrorCode, message: string) {
    super(message);
    this.name = 'FirebaseAuthError';
    this.code = code;
  }
}

export interface VerifiedFirebaseUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  claims: Record<string, any>;
}

export interface AuthenticatedRequest extends Request {
  authUser?: {
    uid: string;
    email?: string;
  };
}

/**
 * Extracts a Bearer token from an HTTP Authorization header.
 * Returns null if the header is missing, not a Bearer scheme, or malformed.
 */
export function extractBearerToken(authHeader?: string | string[]): string | null {
  if (!authHeader) return null;
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (!match || !match[1]) return null;
  return match[1];
}

/**
 * Fault simulation headers (`x-simulate-latency`, `x-simulate-gemini-error`)
 * are strictly disallowed in production.
 */
export function shouldAllowFaultSimulation(nodeEnv?: string): boolean {
  return String(nodeEnv || '').trim().toLowerCase() !== 'production';
}

function decodeBase64UrlJson<T = Record<string, any>>(
  segment: string,
  errorCode: FirebaseAuthErrorCode
): T {
  if (!segment || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new FirebaseAuthError(errorCode, 'Invalid base64url JWT segment.');
  }
  try {
    const jsonStr = Buffer.from(segment, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Segment is not a JSON object');
    }
    return parsed as T;
  } catch {
    throw new FirebaseAuthError(errorCode, 'Failed to decode JWT JSON segment.');
  }
}

/**
 * Synchronously verifies a Firebase Auth RS256 ID token against a map of PEM public keys /
 * X.509 certificates keyed by `kid`, checking signature and all Firebase Auth JWT claims.
 */
export function verifyFirebaseIdTokenWithCerts(
  token: string,
  expectedProjectId: string,
  certsByKid: Record<string, string>,
  nowSec: number = Math.floor(Date.now() / 1000)
): VerifiedFirebaseUser {
  const projectId = String(expectedProjectId || '').trim();
  if (!projectId) {
    throw new FirebaseAuthError(
      'MISSING_PROJECT_ID',
      'Firebase project ID is not configured on the server.'
    );
  }
  if (!token || typeof token !== 'string') {
    throw new FirebaseAuthError('MISSING_TOKEN', 'Missing Firebase ID token.');
  }

  const segments = token.trim().split('.');
  if (segments.length !== 3 || segments.some((s) => !s)) {
    throw new FirebaseAuthError('MALFORMED_TOKEN', 'Malformed JWT format.');
  }

  const [headerB64, payloadB64, signatureB64] = segments;
  const header = decodeBase64UrlJson<{ alg?: unknown; kid?: unknown; typ?: unknown }>(
    headerB64,
    'INVALID_HEADER'
  );

  if (header.alg !== 'RS256') {
    throw new FirebaseAuthError(
      'UNSUPPORTED_ALG',
      `Unsupported JWT algorithm: ${String(header.alg || 'none')}.`
    );
  }
  if (typeof header.kid !== 'string' || !header.kid.trim()) {
    throw new FirebaseAuthError('INVALID_HEADER', 'JWT header is missing a valid key ID (kid).');
  }

  const certPem = certsByKid[header.kid];
  if (!certPem || typeof certPem !== 'string') {
    throw new FirebaseAuthError('UNKNOWN_KID', `Unknown signing key ID: ${header.kid}.`);
  }

  if (!/^[A-Za-z0-9_-]+$/.test(signatureB64)) {
    throw new FirebaseAuthError('INVALID_SIGNATURE', 'Malformed JWT signature encoding.');
  }

  let signatureValid = false;
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const signatureBuf = Buffer.from(signatureB64, 'base64url');
    signatureValid = signatureBuf.length > 0 && verifier.verify(certPem, signatureBuf);
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    throw new FirebaseAuthError('INVALID_SIGNATURE', 'Invalid Firebase ID token signature.');
  }

  const payload = decodeBase64UrlJson<Record<string, any>>(payloadB64, 'INVALID_PAYLOAD');

  // Verify expiration (must be strictly in the future)
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) || payload.exp <= nowSec) {
    throw new FirebaseAuthError('TOKEN_EXPIRED', 'Firebase ID token has expired.');
  }

  // Verify issued-at time (must be in the past, allowing modest clock skew)
  if (
    typeof payload.iat !== 'number' ||
    !Number.isFinite(payload.iat) ||
    payload.iat > nowSec + MAX_CLOCK_SKEW_SEC
  ) {
    throw new FirebaseAuthError('INVALID_IAT', 'Firebase ID token has an invalid iat claim.');
  }

  // Verify auth_time if present
  if (
    payload.auth_time !== undefined &&
    (typeof payload.auth_time !== 'number' ||
      !Number.isFinite(payload.auth_time) ||
      payload.auth_time > nowSec + MAX_CLOCK_SKEW_SEC)
  ) {
    throw new FirebaseAuthError(
      'INVALID_AUTH_TIME',
      'Firebase ID token has an invalid auth_time claim.'
    );
  }

  // Verify audience matches this Firebase project
  if (payload.aud !== projectId) {
    throw new FirebaseAuthError(
      'INVALID_AUD',
      'Firebase ID token audience does not match this project.'
    );
  }

  // Verify issuer matches Google Secure Token service for this Firebase project
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;
  if (payload.iss !== expectedIssuer) {
    throw new FirebaseAuthError(
      'INVALID_ISS',
      'Firebase ID token issuer does not match this project.'
    );
  }

  // Verify subject (Firebase UID) is a non-empty string (<= 128 chars per Firebase spec)
  if (
    typeof payload.sub !== 'string' ||
    payload.sub.trim().length === 0 ||
    payload.sub.length > 128
  ) {
    throw new FirebaseAuthError(
      'INVALID_SUB',
      'Firebase ID token subject (uid) is missing or invalid.'
    );
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: Boolean(payload.email_verified),
    claims: payload,
  };
}

let cachedGoogleCerts: { certs: Record<string, string>; expiresAtMs: number } | null = null;
let inFlightCertFetch: Promise<Record<string, string>> | null = null;

function parseCacheControlMaxAgeMs(cacheControlHeader: string | null): number {
  if (!cacheControlHeader) return DEFAULT_CERT_CACHE_TTL_MS;
  const match = /max-age=(\d+)/i.exec(cacheControlHeader);
  if (!match) return DEFAULT_CERT_CACHE_TTL_MS;
  const seconds = parseInt(match[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_CERT_CACHE_TTL_MS;
  const ms = seconds * 1000;
  return Math.max(MIN_CERT_CACHE_TTL_MS, Math.min(MAX_CERT_CACHE_TTL_MS, ms));
}

/**
 * Fetches and caches Google's official Firebase Auth public X.509 certificates,
 * honoring the HTTP Cache-Control max-age directive.
 */
export async function fetchGoogleFirebasePublicCerts(
  forceRefresh = false
): Promise<Record<string, string>> {
  const nowMs = Date.now();
  if (!forceRefresh && cachedGoogleCerts && nowMs < cachedGoogleCerts.expiresAtMs) {
    return cachedGoogleCerts.certs;
  }

  if (!forceRefresh && inFlightCertFetch) {
    return inFlightCertFetch;
  }

  const fetchPromise = (async () => {
    const response = await fetch(GOOGLE_SECURETOKEN_CERTS_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new FirebaseAuthError(
        'CERT_FETCH_FAILED',
        `Failed to fetch Firebase public certificates (HTTP ${response.status}).`
      );
    }
    const json = (await response.json()) as Record<string, string>;
    if (!json || typeof json !== 'object' || Object.keys(json).length === 0) {
      throw new FirebaseAuthError(
        'CERT_FETCH_FAILED',
        'Firebase public certificate response was empty.'
      );
    }
    const ttlMs = parseCacheControlMaxAgeMs(response.headers.get('cache-control'));
    cachedGoogleCerts = {
      certs: json,
      expiresAtMs: Date.now() + ttlMs,
    };
    return json;
  })();

  inFlightCertFetch = fetchPromise;
  try {
    return await fetchPromise;
  } finally {
    if (inFlightCertFetch === fetchPromise) {
      inFlightCertFetch = null;
    }
  }
}

/**
 * Verifies a Firebase Auth ID token against Google's official cached public keys,
 * with a single automatic cert refresh if an unknown `kid` is encountered (key rotation).
 */
export async function verifyFirebaseIdToken(
  token: string,
  expectedProjectId: string
): Promise<VerifiedFirebaseUser> {
  const certs = await fetchGoogleFirebasePublicCerts(false);
  try {
    return verifyFirebaseIdTokenWithCerts(token, expectedProjectId, certs);
  } catch (err) {
    if (err instanceof FirebaseAuthError && err.code === 'UNKNOWN_KID') {
      const refreshedCerts = await fetchGoogleFirebasePublicCerts(true);
      return verifyFirebaseIdTokenWithCerts(token, expectedProjectId, refreshedCerts);
    }
    throw err;
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSec: number;
}

export interface SlidingWindowRateLimiter {
  check(key: string, nowMs?: number): RateLimitResult;
  reset(): void;
}

/**
 * Lightweight in-memory sliding-window rate limiter keyed by authenticated UID (or IP fallback).
 */
export function createSlidingWindowRateLimiter(options?: {
  maxRequests?: number;
  windowMs?: number;
  maxTrackedKeys?: number;
}): SlidingWindowRateLimiter {
  const maxRequests = Math.max(1, options?.maxRequests ?? 20);
  const windowMs = Math.max(1000, options?.windowMs ?? 60_000);
  const maxTrackedKeys = Math.max(100, options?.maxTrackedKeys ?? 10_000);

  const buckets = new Map<string, number[]>();

  const pruneStaleKeys = (nowMs: number) => {
    const cutoff = nowMs - windowMs;
    for (const [k, timestamps] of buckets.entries()) {
      const active = timestamps.filter((t) => t > cutoff);
      if (active.length === 0) {
        buckets.delete(k);
      } else {
        buckets.set(k, active);
      }
    }
  };

  return {
    check(key: string, nowMs: number = Date.now()): RateLimitResult {
      const normalizedKey = String(key || 'unknown');
      const cutoff = nowMs - windowMs;

      if (buckets.size >= maxTrackedKeys && !buckets.has(normalizedKey)) {
        pruneStaleKeys(nowMs);
      }

      const existing = buckets.get(normalizedKey) || [];
      const active = existing.filter((t) => t > cutoff);

      if (active.length >= maxRequests) {
        buckets.set(normalizedKey, active);
        const oldestInWindow = active[0];
        const retryAfterMs = Math.max(1, oldestInWindow + windowMs - nowMs);
        return {
          allowed: false,
          limit: maxRequests,
          remaining: 0,
          retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)),
        };
      }

      active.push(nowMs);
      buckets.set(normalizedKey, active);
      return {
        allowed: true,
        limit: maxRequests,
        remaining: Math.max(0, maxRequests - active.length),
        retryAfterSec: 0,
      };
    },
    reset() {
      buckets.clear();
    },
  };
}

/**
 * Express middleware enforcing verified Firebase Auth Bearer ID tokens on `/api/gemini/*`.
 */
export function createFirebaseAuthMiddleware(
  expectedProjectId: string,
  verifyFn: (token: string, projectId: string) => Promise<VerifiedFirebaseUser> = verifyFirebaseIdToken
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({
        error: 'Authentication required. Please sign in to use AI features.',
        isAuthError: true,
        isFirebaseAuthError: true,
      });
    }

    try {
      const verified = await verifyFn(token, expectedProjectId);
      (req as AuthenticatedRequest).authUser = {
        uid: verified.uid,
        email: verified.email,
      };
      return next();
    } catch (err: any) {
      const code = err instanceof FirebaseAuthError ? err.code : 'INVALID_TOKEN';
      console.warn(`[serverAuth] Rejected /api/gemini request (${code}): ${err?.message || 'Unauthorized'}`);
      return res.status(401).json({
        error: 'Invalid or expired authentication session. Please refresh or sign in again.',
        isAuthError: true,
        isFirebaseAuthError: true,
      });
    }
  };
}

/**
 * Express middleware enforcing sliding-window rate limits per authenticated Firebase UID (or IP fallback).
 */
export function createGeminiRateLimitMiddleware(options?: {
  maxRequests?: number;
  windowMs?: number;
}) {
  const limiter = createSlidingWindowRateLimiter(options);

  return (req: Request, res: Response, next: NextFunction) => {
    const authUser = (req as AuthenticatedRequest).authUser;
    const rateKey = authUser?.uid
      ? `uid:${authUser.uid}`
      : `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;

    const result = limiter.check(rateKey);
    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        error: `Too many AI requests. Please wait ${result.retryAfterSec}s before trying again.`,
        isQuotaError: true,
        isRateLimited: true,
        retryAfterSec: result.retryAfterSec,
      });
    }

    return next();
  };
}
