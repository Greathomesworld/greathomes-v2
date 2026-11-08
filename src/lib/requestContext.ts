import { enterTestIsolationForRequest } from './testIsolationContext';

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Extracts or generates a bounded, secure request ID from incoming HTTP request.
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

  // Extract client IP address
  const forwardedFor = headers.get('x-forwarded-for');
  let ipAddress: string | null = null;
  if (forwardedFor) {
    ipAddress = forwardedFor.split(',')[0]?.trim() || null;
  } else {
    ipAddress = headers.get('x-real-ip') || null;
  }

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
