export interface RequestContextInfo {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface RequestLike {
  headers: {
    get(name: string): string | null;
  };
}

export function extractRequestContext(req: RequestLike): RequestContextInfo {
  const requestId =
    req.headers.get('x-request-id') ||
    req.headers.get('x-trace-id') ||
    `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Safe IP extraction
  const forwardedFor = req.headers.get('x-forwarded-for');
  let ipAddress: string | null = null;
  if (forwardedFor) {
    const parts = forwardedFor.split(',');
    ipAddress = parts[0]?.trim() || null;
  } else {
    ipAddress = req.headers.get('x-real-ip') || null;
  }

  const rawUserAgent = req.headers.get('user-agent');
  const userAgent = rawUserAgent ? rawUserAgent.substring(0, 300) : null;

  return {
    requestId,
    ipAddress,
    userAgent,
  };
}
