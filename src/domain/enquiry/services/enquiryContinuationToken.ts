import crypto from 'node:crypto';
import type { EnquiryEntity } from '../entities/enquiryEntity';

export const CONTINUATION_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
export const MAX_CONTINUATION_ROTATIONS = 5;
export const MIN_CLIENT_IDEMPOTENCY_KEY_LENGTH_FOR_RECOVERY = 16;

export interface StoredContinuationRecord {
  tokenHash: string;
  issuedAt: string;
  expiresAt: string;
  rotationCount: number;
}

export interface IssuedContinuationToken {
  rawToken: string;
  record: StoredContinuationRecord;
}

/**
 * Generates a cryptographically secure 256-bit random token and its SHA-256 hash.
 * Only the hash is persisted; the raw token is returned solely to the caller once.
 */
export function issueContinuationToken(existingExpiresAt?: string | null, rotationCount = 0): IssuedContinuationToken {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashContinuationToken(rawToken);
  const now = Date.now();
  const expiresAt =
    existingExpiresAt && Number.isFinite(Date.parse(existingExpiresAt))
      ? existingExpiresAt
      : new Date(now + CONTINUATION_TOKEN_TTL_MS).toISOString();

  return {
    rawToken,
    record: {
      tokenHash,
      issuedAt: new Date(now).toISOString(),
      expiresAt,
      rotationCount,
    },
  };
}

export function hashContinuationToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export type ContinuationVerificationResult =
  | { valid: true }
  | { valid: false; reason: 'MISSING_TOKEN' | 'MISSING_RECORD' | 'EXPIRED' | 'INVALID_TOKEN' };

/**
 * Verifies a supplied continuation token against the stored hash using constant-time comparison
 * and enforces the expiry window.
 */
export function verifyContinuationToken(
  rawToken: string | null | undefined,
  record: StoredContinuationRecord | null | undefined,
  nowMs: number = Date.now()
): ContinuationVerificationResult {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, reason: 'MISSING_TOKEN' };
  }

  const trimmed = rawToken.trim();
  // 32 random bytes base64url-encoded is 43 chars; reject clearly malformed inputs early
  if (trimmed.length < 32 || trimmed.length > 128) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }

  if (!record || typeof record.tokenHash !== 'string' || typeof record.expiresAt !== 'string') {
    return { valid: false, reason: 'MISSING_RECORD' };
  }

  const expiresMs = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    return { valid: false, reason: 'EXPIRED' };
  }

  const expectedBuf = Buffer.from(record.tokenHash, 'hex');
  const suppliedBuf = Buffer.from(hashContinuationToken(trimmed), 'hex');
  if (expectedBuf.length !== 32 || suppliedBuf.length !== 32) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }

  if (!crypto.timingSafeEqual(expectedBuf, suppliedBuf)) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }

  return { valid: true };
}

/**
 * Checks whether an existing enquiry is eligible for controlled continuation token rotation
 * during an authentic idempotent Step 1 retry (e.g., after a client timeout / lost response).
 */
export function canRotateContinuationOnIdempotentRetry(params: {
  existing: EnquiryEntity;
  explicitClientKey: string | null;
  requestCustomerId: string | null;
  nowMs?: number;
}): { eligible: boolean; existingExpiresAt?: string; nextRotationCount?: number } {
  const { existing, explicitClientKey, requestCustomerId } = params;
  const nowMs = params.nowMs ?? Date.now();

  if (!explicitClientKey || explicitClientKey.length < MIN_CLIENT_IDEMPOTENCY_KEY_LENGTH_FOR_RECOVERY) {
    return { eligible: false };
  }

  if ((existing.customerId ?? null) !== (requestCustomerId ?? null)) {
    return { eligible: false };
  }

  if (existing.status !== 'NEW' && existing.status !== 'RECEIVED') {
    return { eligible: false };
  }

  const record = (existing.metadata as Record<string, any> | null | undefined)?._continuation as
    | StoredContinuationRecord
    | undefined;

  if (!record || typeof record.expiresAt !== 'string') {
    return { eligible: false };
  }

  const expiresMs = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresMs) || nowMs > expiresMs) {
    return { eligible: false };
  }

  const currentRotations = typeof record.rotationCount === 'number' ? record.rotationCount : 0;
  if (currentRotations >= MAX_CONTINUATION_ROTATIONS) {
    return { eligible: false };
  }

  return {
    eligible: true,
    existingExpiresAt: record.expiresAt,
    nextRotationCount: currentRotations + 1,
  };
}

/**
 * Strips internal security metadata (such as `_continuation` / token hashes) before exposing
 * an enquiry entity through any admin, customer, or public API response.
 */
export function stripInternalEnquiryMetadata(
  metadata?: Record<string, any> | null
): Record<string, any> | null | undefined {
  if (!metadata || typeof metadata !== 'object') return metadata;
  let hasInternal = false;
  for (const key of Object.keys(metadata)) {
    if (key.startsWith('_') || key.toLowerCase().includes('tokenhash')) {
      hasInternal = true;
      break;
    }
  }
  if (!hasInternal) return metadata;

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (key.startsWith('_') || key.toLowerCase().includes('tokenhash')) continue;
    clean[key] = value;
  }
  return clean;
}

export function sanitizeEnquiryForExposure(enquiry: EnquiryEntity): EnquiryEntity {
  if (!enquiry.metadata) return enquiry;
  const cleanedMetadata = stripInternalEnquiryMetadata(enquiry.metadata);
  if (cleanedMetadata === enquiry.metadata) return enquiry;
  return {
    ...enquiry,
    metadata: cleanedMetadata,
  };
}
