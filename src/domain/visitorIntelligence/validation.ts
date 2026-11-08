import crypto from 'crypto';
import {
  AreaBasisType,
  VISITOR_EVENT_TYPES,
  VisitorDeviceClass,
  VisitorEntityType,
  VisitorEventType,
} from './entities.ts';

export const VISITOR_COOKIE_NAME = 'gh_visitor_id';
export const SESSION_COOKIE_NAME = 'gh_session_id';
export const TELEMETRY_OPT_OUT_COOKIE_NAME = 'gh_telemetry_opt_out';

export const VISITOR_COOKIE_MAX_AGE_SECONDS = 180 * 24 * 60 * 60; // 180 days
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 60; // 30 minutes rolling

const VALID_EVENT_SET = new Set<string>(VISITOR_EVENT_TYPES);

const EVENT_TYPE_ALIASES: Record<string, VisitorEventType> = {
  VIEW_PROJECT: 'PROJECT_VIEW',
  VIEW_RESALE: 'RESALE_LISTING_VIEW',
  VIEW_RENTAL: 'RENTAL_LISTING_VIEW',
  VIEW_LOCATION: 'LOCATION_VIEW',
  VIEW_DEVELOPER: 'DEVELOPER_VIEW',
  SEARCH_SUBMITTED: 'SEARCH_EXECUTED',
  FILTER_SELECTED: 'FILTER_APPLIED',
  SAVED_ADD: 'ITEM_SAVED',
  SAVED_REMOVE: 'ITEM_UNSAVED',
  WATCH_PROJECT: 'PROJECT_WATCHED',
  UNWATCH_PROJECT: 'PROJECT_UNWATCHED',
  WATCH_LOCATION: 'LOCATION_WATCHED',
  UNWATCH_LOCATION: 'LOCATION_UNWATCHED',
  COMPARE_ADD: 'COMPARE_ADDED',
  COMPARE_REMOVE: 'COMPARE_REMOVED',
  COMPARE_VIEW: 'COMPARE_VIEWED',
  ENQUIRY_OPEN: 'ENQUIRY_MODAL_OPENED',
  ENQUIRY_SUBMIT: 'ENQUIRY_SUBMITTED',
  SITE_VISIT_REQUEST: 'SITE_VISIT_REQUESTED',
};

const VALID_ENTITY_TYPES = new Set<VisitorEntityType>([
  'PROJECT',
  'RESALE_LISTING',
  'RENTAL_LISTING',
  'LOCATION',
  'DEVELOPER',
  'PAGE',
  'SEARCH',
  'COMPARISON',
  'ENQUIRY',
  'SITE_VISIT',
]);

const VALID_AREA_BASIS = new Set<AreaBasisType>([
  'CARPET',
  'BUILT_UP',
  'SUPER_BUILT_UP',
]);

const FORBIDDEN_METADATA_KEY_PATTERN =
  /(otp|password|passwd|secret|token|cookie|authorization|bearer|session_key|api_key|private_key|card|cvv|cvc|aadhaar|pan_number|phone|mobile|email|buyer_phone|buyer_email|owner_phone|owner_email|broker_phone|broker_email|address)/i;

const MAX_METADATA_JSON_BYTES = 2048;
const MAX_METADATA_DEPTH = 4;

const EMAIL_VALUE_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const INDIAN_PHONE_VALUE_REGEX = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g;
const BEARER_OR_JWT_REGEX =
  /(\bBearer\s+[A-Za-z0-9._~+/-]+=*|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b)/gi;

export function redactSensitiveStringValue(value: string): string {
  return value
    .replace(EMAIL_VALUE_REGEX, '[REDACTED_EMAIL]')
    .replace(INDIAN_PHONE_VALUE_REGEX, '[REDACTED_PHONE]')
    .replace(BEARER_OR_JWT_REGEX, '[REDACTED_TOKEN]');
}

export function sanitizeShortText(value: unknown, maxLength = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

export function sanitizeUrlPath(value: unknown, maxLength = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Strip query tokens or sensitive parameters if accidentally included
  const cleaned = trimmed.replace(
    /([?&](token|otp|code|password|secret|phone|mobile|email)=)[^&]+/gi,
    '$1REDACTED'
  );
  return cleaned.slice(0, maxLength);
}

export function validateEventType(value: unknown): VisitorEventType | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (VALID_EVENT_SET.has(upper)) {
    return upper as VisitorEventType;
  }
  if (EVENT_TYPE_ALIASES[upper]) {
    return EVENT_TYPE_ALIASES[upper];
  }
  return null;
}

export function validateEntityType(value: unknown): VisitorEntityType | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase() as VisitorEntityType;
  if (!VALID_ENTITY_TYPES.has(upper)) return null;
  return upper;
}

export function validateAreaBasis(value: unknown): AreaBasisType | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (upper === 'CARPET_AREA' || upper === 'CARPET') return 'CARPET';
  if (upper === 'BUILT_UP_AREA' || upper === 'BUILT_UP') return 'BUILT_UP';
  if (upper === 'SUPER_BUILT_UP_AREA' || upper === 'SUPER_BUILT_UP') return 'SUPER_BUILT_UP';
  if (VALID_AREA_BASIS.has(upper as AreaBasisType)) {
    return upper as AreaBasisType;
  }
  return null;
}

export function normalizeDeviceClass(userAgentOrClass: string | null | undefined): VisitorDeviceClass {
  if (!userAgentOrClass) return 'UNKNOWN';
  const upper = userAgentOrClass.toUpperCase();
  if (upper === 'MOBILE' || upper === 'TABLET' || upper === 'DESKTOP') {
    return upper as VisitorDeviceClass;
  }
  const ua = userAgentOrClass.toLowerCase();
  if (/ipad|tablet|playbook|silk/i.test(ua)) return 'TABLET';
  if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return 'MOBILE';
  if (/mozilla|chrome|safari|firefox|edg|Macintosh|windows nt|linux/i.test(ua)) return 'DESKTOP';
  return 'UNKNOWN';
}

export function normalizeBrowserFamily(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  if (/edg\//i.test(userAgent)) return 'Edge';
  if (/opr\/|opera/i.test(userAgent)) return 'Opera';
  if (/chrome\/|crios\//i.test(userAgent)) return 'Chrome';
  if (/firefox\/|fxios\//i.test(userAgent)) return 'Firefox';
  if (/safari\//i.test(userAgent) && !/chrome\/|crios\//i.test(userAgent)) return 'Safari';
  return 'Other';
}

export function hashVisitorIp(ipAddress: string | null | undefined): string | null {
  if (!ipAddress || ipAddress === 'unknown') return null;
  const salt = process.env.SESSION_SECRET || 'gh-v2-visitor-privacy-salt';
  return crypto.createHash('sha256').update(`${ipAddress}:${salt}`).digest('hex').slice(0, 32);
}

function sanitizeMetadataNode(node: unknown, depth: number): unknown {
  if (depth > MAX_METADATA_DEPTH) {
    return undefined;
  }
  if (node === null) return null;
  if (typeof node === 'string') {
    return redactSensitiveStringValue(node).slice(0, depth === 0 ? 300 : 200);
  }
  if (typeof node === 'number') {
    return Number.isFinite(node) ? node : null;
  }
  if (typeof node === 'boolean') {
    return node;
  }
  if (Array.isArray(node)) {
    const sanitizedArr: unknown[] = [];
    for (const item of node.slice(0, 20)) {
      const cleanedItem = sanitizeMetadataNode(item, depth + 1);
      if (cleanedItem !== undefined) {
        sanitizedArr.push(cleanedItem);
      }
    }
    return sanitizedArr;
  }
  if (typeof node === 'object') {
    const cleanedObj: Record<string, any> = {};
    const entries = Object.entries(node as Record<string, unknown>).slice(0, 25);
    for (const [rawKey, rawVal] of entries) {
      const cleanKey = rawKey.trim().slice(0, 64);
      if (!cleanKey || FORBIDDEN_METADATA_KEY_PATTERN.test(cleanKey)) {
        continue;
      }
      const cleanedVal = sanitizeMetadataNode(rawVal, depth + 1);
      if (cleanedVal !== undefined) {
        cleanedObj[cleanKey] = cleanedVal;
      }
    }
    return cleanedObj;
  }
  return undefined;
}

/**
 * Sanitizes event metadata recursively across nested objects and arrays,
 * rejecting oversized payloads and stripping any secret/auth/OTP/PII keys or values.
 */
export function sanitizeEventMetadata(
  rawMetadata: unknown
): { valid: boolean; sanitized: Record<string, any> | null; error?: string } {
  if (rawMetadata === undefined || rawMetadata === null) {
    return { valid: true, sanitized: null };
  }
  if (typeof rawMetadata !== 'object' || Array.isArray(rawMetadata)) {
    return { valid: false, sanitized: null, error: 'Event metadata must be a JSON object.' };
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(rawMetadata);
  } catch {
    return { valid: false, sanitized: null, error: 'Event metadata is not serializable.' };
  }

  if (Buffer.byteLength(serialized, 'utf8') > MAX_METADATA_JSON_BYTES) {
    return {
      valid: false,
      sanitized: null,
      error: `Event metadata exceeds maximum size of ${MAX_METADATA_JSON_BYTES} bytes.`,
    };
  }

  const sanitized = sanitizeMetadataNode(rawMetadata, 0) as Record<string, any>;
  return { valid: true, sanitized: sanitized || {} };
}

export function extractCookiesFromRequest(req: Request): {
  visitorId: string | null;
  sessionId: string | null;
  optedOut: boolean;
} {
  const cookieHeader = req.headers.get('cookie') || '';
  const parseCookie = (name: string): string | null => {
    const anyReq = req as any;
    if (anyReq?.cookies && typeof anyReq.cookies.get === 'function') {
      const c = anyReq.cookies.get(name);
      if (c && typeof c.value === 'string' && c.value.trim()) {
        return c.value.trim();
      }
    }
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    return match ? decodeURIComponent(match[1].trim()) : null;
  };

  const dntHeader = req.headers.get('dnt');
  const gpcHeader = req.headers.get('sec-gpc');
  const optOutCookie = parseCookie(TELEMETRY_OPT_OUT_COOKIE_NAME);

  const optedOut =
    optOutCookie === '1' ||
    optOutCookie === 'true' ||
    dntHeader === '1' ||
    gpcHeader === '1';

  return {
    visitorId: sanitizeShortText(parseCookie(VISITOR_COOKIE_NAME), 64),
    sessionId: sanitizeShortText(parseCookie(SESSION_COOKIE_NAME), 64),
    optedOut,
  };
}

export function isOptedOutRequest(req: Request): boolean {
  return extractCookiesFromRequest(req).optedOut;
}

export function setVisitorSessionCookies(
  response: { cookies: { set: (name: string, value: string, options?: any) => any } },
  visitorId: string,
  sessionId: string
): void {
  const secure = process.env.NODE_ENV === 'production';
  response.cookies.set(VISITOR_COOKIE_NAME, visitorId, {
    path: '/',
    httpOnly: false, // First-party cookie readable by client telemetry hook for correlation
    maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure,
  });
  response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: false,
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure,
  });
}

const SAFE_VISITOR_ID_REGEX = /^[A-Za-z0-9_-]{8,64}$/;

export function validateUuidOrGenerate(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (SAFE_VISITOR_ID_REGEX.test(trimmed)) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

