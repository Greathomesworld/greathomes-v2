import crypto from 'crypto';

export interface BrochureTokenPayload {
  projectId: string;
  brochureId: string;
  enquiryId?: string;
  iat: number;
  exp: number;
}

function getSigningSecret(): string {
  return (
    process.env.BROCHURE_TOKEN_SECRET ||
    process.env.CUSTOMER_SESSION_SECRET ||
    process.env.ADMIN_JWT_SECRET ||
    'gh-v2-brochure-hmac-secret-key-2026'
  );
}

/**
 * Creates an HMAC-SHA256 signed, short-lived download token bound to
 * a specific project, active brochure media ID, and lead enquiry ID.
 */
export function createBrochureDownloadToken(
  params: {
    projectId: string;
    brochureId: string;
    enquiryId?: string;
  },
  ttlSeconds = 600
): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: BrochureTokenPayload = {
    projectId: params.projectId,
    brochureId: params.brochureId,
    enquiryId: params.enquiryId,
    iat: nowSec,
    exp: nowSec + Math.max(60, ttlSeconds),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies a signed brochure download token and enforces expiry and project binding.
 */
export function verifyBrochureDownloadToken(
  token: string,
  expectedProjectId: string
): {
  valid: boolean;
  payload?: BrochureTokenPayload;
  error?: string;
} {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing brochure download token.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed brochure download token.' };
  }

  const [payloadB64, providedSig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  const sigBufA = Buffer.from(providedSig, 'utf8');
  const sigBufB = Buffer.from(expectedSig, 'utf8');
  if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
    return { valid: false, error: 'Invalid brochure download token signature.' };
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as BrochureTokenPayload;

    const nowSec = Math.floor(Date.now() / 1000);
    if (!decoded.exp || decoded.exp < nowSec) {
      return { valid: false, error: 'Brochure download link has expired. Please request again.' };
    }

    if (!decoded.projectId || decoded.projectId !== expectedProjectId) {
      return { valid: false, error: 'Brochure token does not match the requested project.' };
    }

    if (!decoded.brochureId) {
      return { valid: false, error: 'Brochure token is missing media identifier.' };
    }

    return { valid: true, payload: decoded };
  } catch {
    return { valid: false, error: 'Unable to parse brochure download token.' };
  }
}
