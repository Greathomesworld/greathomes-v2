import { isIP } from 'node:net';
import { enterTestIsolationForRequest } from './testIsolationContext';

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const MAX_TRUSTED_PROXIES = 10;

/**
 * Parses `TRUSTED_PROXY_COUNT` strictly:
 * - Unset or empty defaults to 1 (single reverse proxy topology).
 * - Must be a non-negative base-10 integer string within [0, MAX_TRUSTED_PROXIES].
 * - Any negative, floating-point, non-numeric, or out-of-range value fails closed (returns 0)
 *   rather than silently defaulting to 1.
 */
export function getTrustedProxyCount(): number {
  const raw = process.env.TRUSTED_PROXY_COUNT;
  if (raw === undefined) {
    return 1;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return 0;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_TRUSTED_PROXIES) {
    return 0;
  }
  return parsed;
}

/**
 * Normalizes IPv4, IPv6, and IPv4-mapped IPv6 addresses to a canonical string:
 * - Standard IPv4 (`192.0.2.1`) -> `192.0.2.1`
 * - Dotted-quad IPv4-mapped IPv6 (`::ffff:192.0.2.1`, `::FFFF:192.0.2.1`,
 *   `0:0:0:0:0:ffff:192.0.2.1`, `0000:0000:0000:0000:0000:ffff:192.0.2.1`) -> `192.0.2.1`
 * - Hex-word IPv4-mapped IPv6 (`::ffff:c000:0201`, `0:0:0:0:0:ffff:c000:201`) -> `192.0.2.1`
 * - Standard IPv6 -> lowercase canonical representation
 * - Rejects any non-IP strings, port suffixes, CIDR masks, zone indices, or injection payloads.
 */
export function normalizeAndValidateIp(rawIp: string | null | undefined): string | null {
  if (!rawIp) return null;
  const trimmed = rawIp.trim();
  if (!trimmed || trimmed.length > 64) return null;
  if (trimmed.includes('%') || trimmed.includes('/')) return null;

  const lower = trimmed.toLowerCase();

  if (isIP(lower) === 4) {
    return lower;
  }

  // Dotted-quad IPv4-mapped IPv6 in compressed (::ffff:a.b.c.d) or expanded (0:0:0:0:0:ffff:a.b.c.d) form
  const dottedMappedMatch = lower.match(
    /^(?:::ffff:|(?:0{1,4}:){5}ffff:)(\d{1,3}(?:\.\d{1,3}(?:\.\d{1,3})\.\d{1,3}))$/i
  );
  if (dottedMappedMatch) {
    const v4Part = dottedMappedMatch[1];
    return isIP(v4Part) === 4 ? v4Part : null;
  }

  // Hex-word IPv4-mapped IPv6 (e.g. ::ffff:c000:0201 or 0:0:0:0:0:ffff:c000:0201)
  const hexMappedMatch = lower.match(
    /^(?:::ffff:|(?:0{1,4}:){5}ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i
  );
  if (hexMappedMatch && isIP(lower) === 6) {
    const hi = Number.parseInt(hexMappedMatch[1], 16);
    const lo = Number.parseInt(hexMappedMatch[2], 16);
    const v4Converted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isIP(v4Converted) === 4 ? v4Converted : null;
  }

  if (isIP(lower) === 6) {
    return lower;
  }

  return null;
}

/**
 * Selects the client IP from a comma-separated forwarding header by walking strictly
 * right-to-left across raw hops WITHOUT pre-filtering invalid entries:
 * - If fewer hops are present than `trustedProxyCount`, returns `null` (never clamping to index 0).
 * - If the selected client hop or any trusted proxy hop to its right is invalid, returns `null`
 *   so malformed entries can never shift the trust boundary leftward.
 */
function selectRightToLeftHop(headerValue: string, trustedProxyCount: number): string | null {
  if (trustedProxyCount <= 0) return null;
  const rawParts = headerValue.split(',').map((p) => p.trim());
  if (rawParts.length < trustedProxyCount) {
    return null;
  }

  const targetIndex = rawParts.length - trustedProxyCount;
  // Validate the target hop and every trusted proxy hop to its right
  let selectedCanonicalIp: string | null = null;
  for (let i = targetIndex; i < rawParts.length; i++) {
    const validated = normalizeAndValidateIp(rawParts[i]);
    if (!validated) {
      return null;
    }
    if (i === targetIndex) {
      selectedCanonicalIp = validated;
    }
  }

  return selectedCanonicalIp;
}

function constantTimeSecretEquals(supplied: string | null | undefined, expected: string | null | undefined): boolean {
  if (!supplied || !expected) return false;
  const s = supplied.trim();
  const e = expected.trim();
  if (e.length < 16 || s.length !== e.length) return false;
  let diff = 0;
  for (let i = 0; i < e.length; i++) {
    diff |= s.charCodeAt(i) ^ e.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verifies whether incoming request headers carry trusted ingress provenance from Vercel.
 *
 * Security model (RL-01-ARCH & RL-01):
 * - Request headers alone (`x-vercel-id`, `x-vercel-forwarded-for`, `x-real-ip`) are NOT sufficient
 *   proof of trusted ingress if the origin is directly reachable.
 * - Requires:
 *   1. `TRUST_VERCEL_PROXY === 'true'`
 *   2. Runtime platform markers `VERCEL === '1'` and non-empty `VERCEL_ENV`
 *   3. Syntactically valid `x-vercel-id` edge correlation header
 *   4. Network/origin ingress verification via EITHER:
 *      - `ORIGIN_INGRESS_SHARED_SECRET` matched in constant time against `x-origin-ingress-secret`, OR
 *      - Explicit infrastructure attestation `VERCEL_EDGE_INGRESS_ENFORCED === 'true'` (confirming
 *        deployment is serverless/edge-only with no direct origin socket exposure).
 */
export function hasVerifiedVercelProvenance(headers: Headers): boolean {
  if (
    process.env.TRUST_VERCEL_PROXY !== 'true' ||
    process.env.VERCEL !== '1' ||
    !process.env.VERCEL_ENV?.trim()
  ) {
    return false;
  }

  const vercelId = headers.get('x-vercel-id')?.trim() || '';
  if (!vercelId || vercelId.length > 128 || !/^[a-z0-9_:\-.]+$/i.test(vercelId)) {
    return false;
  }

  const expectedSecret = process.env.ORIGIN_INGRESS_SHARED_SECRET?.trim();
  if (expectedSecret && expectedSecret.length >= 16) {
    return constantTimeSecretEquals(headers.get('x-origin-ingress-secret'), expectedSecret);
  }

  return process.env.VERCEL_EDGE_INGRESS_ENFORCED === 'true';
}

/**
 * Verifies whether incoming request headers carry trusted ingress provenance from Cloudflare.
 *
 * Security model (RL-01-ARCH):
 * - `cf-ray` and `x-forwarded-for` are unauthenticated HTTP strings and can be forged if an
 *   attacker can reach the origin server directly.
 * - Requires:
 *   1. `TRUST_CLOUDFLARE_PROXY === 'true'`
 *   2. Valid `cf-ray` format (`^[0-9a-f]{12,16}-[a-z]{3}$`)
 *   3. Valid `x-forwarded-for` chain with a valid rightmost proxy hop
 *   4. Network/origin ingress verification via EITHER:
 *      - `CLOUDFLARE_ORIGIN_SHARED_SECRET` (or `ORIGIN_INGRESS_SHARED_SECRET`) matched in constant
 *        time against `x-cloudflare-origin-secret` / `x-origin-ingress-secret`, OR
 *      - Explicit infrastructure attestation `CLOUDFLARE_STRICT_ORIGIN_INGRESS_ENFORCED === 'true'`
 *        (confirming Cloudflare Authenticated Origin Pulls / mTLS or firewall IP allowlisting blocks
 *        all direct-origin connections).
 */
export function hasVerifiedCloudflareProvenance(headers: Headers): boolean {
  if (process.env.TRUST_CLOUDFLARE_PROXY !== 'true') {
    return false;
  }

  const expectedCfSecret =
    process.env.CLOUDFLARE_ORIGIN_SHARED_SECRET?.trim() ||
    process.env.ORIGIN_INGRESS_SHARED_SECRET?.trim();
  if (expectedCfSecret && expectedCfSecret.length >= 16) {
    const supplied =
      headers.get('x-cloudflare-origin-secret') || headers.get('x-origin-ingress-secret');
    if (!constantTimeSecretEquals(supplied, expectedCfSecret)) {
      return false;
    }
  } else if (process.env.CLOUDFLARE_STRICT_ORIGIN_INGRESS_ENFORCED !== 'true') {
    return false;
  }

  const cfRay = headers.get('cf-ray')?.trim() || '';
  if (!/^[0-9a-f]{12,16}-[a-z]{3}$/i.test(cfRay)) {
    return false;
  }
  const xff = headers.get('x-forwarded-for');
  if (!xff) {
    return false;
  }
  const rawParts = xff.split(',').map((p) => p.trim());
  const rightmostHop = rawParts[rawParts.length - 1];
  return Boolean(normalizeAndValidateIp(rightmostHop));
}

/**
 * Verifies whether a generic reverse proxy (e.g. nginx / ALB) is explicitly trusted and attested.
 */
export function hasVerifiedGenericReverseProxyProvenance(headers: Headers): boolean {
  if (process.env.TRUST_REVERSE_PROXY !== 'true') {
    return false;
  }
  const expectedSecret = process.env.ORIGIN_INGRESS_SHARED_SECRET?.trim();
  if (expectedSecret && expectedSecret.length >= 16) {
    return constantTimeSecretEquals(headers.get('x-origin-ingress-secret'), expectedSecret);
  }
  return process.env.REVERSE_PROXY_INGRESS_ENFORCED === 'true';
}

/**
 * Extracts a trusted client IP address from reverse proxy headers using a
 * right-to-left hop count (`TRUSTED_PROXY_COUNT`) rather than blindly trusting
 * client-spoofable headers or leftmost `X-Forwarded-For` values.
 *
 * Security invariants (PP-10C & PP-10C2 RL-01-ARCH, RL-01..RL-03):
 * 1. Proxy headers (`x-vercel-forwarded-for`, `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`)
 *    are untrusted by default and require verified ingress provenance.
 * 2. Under Vercel provenance (`hasVerifiedVercelProvenance`), `x-vercel-forwarded-for` is parsed
 *    strictly right-to-left using `trustedProxyCount` (no hardcoded hop=1 assumption) and NEVER
 *    falls through to generic `x-forwarded-for` if missing or malformed.
 * 3. Under Cloudflare provenance (`hasVerifiedCloudflareProvenance`), `cf-connecting-ip` is
 *    validated and must match the selected right-to-left hop in `x-forwarded-for` when `trustedProxyCount`
 *    is configured, never falling back to an untrusted leftmost hop.
 * 4. IPv4-mapped IPv6 addresses are canonicalized to their underlying IPv4 address.
 */
export function extractTrustedClientIp(headers: Headers): string | null {
  const trustedProxyCount = getTrustedProxyCount();

  // Zero (or invalid) trusted reverse proxies configured: ignore all forwarding headers
  if (trustedProxyCount <= 0) {
    return null;
  }

  const hasVercel = hasVerifiedVercelProvenance(headers);
  const hasCloudflare = hasVerifiedCloudflareProvenance(headers);
  const hasGenericReverseProxy = hasVerifiedGenericReverseProxyProvenance(headers);

  // Path 1: Verified Vercel ingress (strictly isolated from generic X-Forwarded-For fallback)
  if (hasVercel) {
    if (headers.has('x-vercel-forwarded-for')) {
      const vercelForwarded = headers.get('x-vercel-forwarded-for') || '';
      return selectRightToLeftHop(vercelForwarded, trustedProxyCount);
    }
    if (trustedProxyCount === 1 && headers.has('x-real-ip')) {
      return normalizeAndValidateIp(headers.get('x-real-ip'));
    }
    return null;
  }

  // Path 2: Verified Cloudflare ingress
  if (hasCloudflare) {
    const xff = headers.get('x-forwarded-for') || '';
    const xffSelectedIp = selectRightToLeftHop(xff, trustedProxyCount);
    if (!xffSelectedIp) {
      return null;
    }
    if (headers.has('cf-connecting-ip')) {
      const cfIp = normalizeAndValidateIp(headers.get('cf-connecting-ip'));
      if (!cfIp || cfIp !== xffSelectedIp) {
        return null;
      }
      return cfIp;
    }
    return xffSelectedIp;
  }

  // Path 3: Verified generic reverse proxy ingress
  if (!hasGenericReverseProxy) {
    return null;
  }

  if (headers.has('x-forwarded-for')) {
    const forwardedFor = headers.get('x-forwarded-for') || '';
    return selectRightToLeftHop(forwardedFor, trustedProxyCount);
  }

  if (trustedProxyCount === 1 && headers.has('x-real-ip')) {
    return normalizeAndValidateIp(headers.get('x-real-ip'));
  }

  return null;
}

/**
 * Extracts or generates a bounded, secure request ID and trusted client IP from incoming HTTP request.
 */
export function extractRequestContext(req: Request): RequestContext {
  enterTestIsolationForRequest(req);
  const headers = req.headers;

  // Accept trusted x-request-id or generate new
  const rawRequestId = headers.get('x-request-id') || headers.get('x-trace-id');
  let requestId: string;

  if (rawRequestId && rawRequestId.trim().length > 0 && rawRequestId.length <= 100) {
    // Sanitize string to prevent header injection or weird chars
    requestId = rawRequestId.replace(/[^a-zA-Z0-9_\-\.]/g, '').substring(0, 100);
    if (!requestId) {
      requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  } else {
    requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  const ipAddress = extractTrustedClientIp(headers);

  // Extract User-Agent with max 300 char bound
  const rawUserAgent = headers.get('user-agent');
  const userAgent = rawUserAgent ? rawUserAgent.substring(0, 300) : null;

  return {
    requestId,
    ipAddress,
    userAgent,
  };
}

/**
 * Appends standard request correlation headers to outgoing Response
 */
export function withCorrelationHeaders<T extends Response>(res: T, requestId: string): T {
  res.headers.set('x-request-id', requestId);
  return res;
}
