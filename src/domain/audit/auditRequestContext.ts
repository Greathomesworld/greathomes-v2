import { extractTrustedClientIp } from '../../lib/requestContext';

export interface RequestContextInfo {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RequestLike {
  headers: {
    get(name: string): string | null;
    has?(name: string): boolean;
  };
}

export function extractRequestContext(req: RequestLike): RequestContextInfo {
  const requestId =
    req.headers.get('x-request-id') ||
    req.headers.get('x-trace-id') ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Delegate IP extraction to the trusted-proxy-aware helper so untrusted
  // X-Forwarded-For headers cannot spoof audit log IP attribution.
  const headersAdapter = {
    get: (name: string) => req.headers.get(name),
    has: (name: string) =>
      typeof req.headers.has === 'function'
        ? req.headers.has(name)
        : req.headers.get(name) !== null,
  } as unknown as Headers;
  const ipAddress = extractTrustedClientIp(headersAdapter);

  const rawUserAgent = req.headers.get('user-agent');
  const userAgent = rawUserAgent ? rawUserAgent.substring(0, 300) : null;

  return {
    requestId,
    ipAddress,
    userAgent,
  };
}
