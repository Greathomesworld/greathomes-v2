export type SafeApiErrorCategory =
  | 'validation'
  | 'authentication'
  | 'authorization'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'persistence_unavailable'
  | 'server'
  | 'unexpected_format'
  | 'network';

export interface SafeApiFetchResult<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  contentType: string;
  finalUrl: string;
  isHtmlResponse: boolean;
  data: T | null;
  error: string | null;
  errorCategory: SafeApiErrorCategory | null;
}

export function getSafeApiErrorTitle(category: SafeApiErrorCategory | null | undefined): string {
  switch (category) {
    case 'validation':
      return 'Validation Error';
    case 'authentication':
      return 'Authentication Required';
    case 'authorization':
      return 'Access Denied';
    case 'not_found':
      return 'Not Found';
    case 'conflict':
      return 'Conflict';
    case 'rate_limited':
      return 'Too Many Requests';
    case 'persistence_unavailable':
      return 'Service Temporarily Unavailable';
    case 'unexpected_format':
      return 'Unexpected Server Response';
    case 'network':
      return 'Network Error';
    case 'server':
    default:
      return 'Server Error';
  }
}

function classifyHttpStatus(
  status: number,
  code?: unknown
): { category: SafeApiErrorCategory; fallbackMessage: string } {
  if (status === 400 || status === 422) {
    return {
      category: 'validation',
      fallbackMessage: 'Please check the submitted fields and try again.',
    };
  }
  if (status === 401) {
    return {
      category: 'authentication',
      fallbackMessage: 'Your session has expired or is unauthenticated. Please sign in and try again.',
    };
  }
  if (status === 403) {
    return {
      category: 'authorization',
      fallbackMessage: 'You do not have permission to perform this action.',
    };
  }
  if (status === 404) {
    return {
      category: 'not_found',
      fallbackMessage: 'The requested resource or API endpoint could not be found.',
    };
  }
  if (status === 409) {
    return {
      category: 'conflict',
      fallbackMessage: 'This action conflicts with the current record state. Please refresh and try again.',
    };
  }
  if (status === 429 || code === 'RATE_LIMITED') {
    return {
      category: 'rate_limited',
      fallbackMessage: 'Too many requests. Please wait a moment and try again.',
    };
  }
  if (
    status === 503 ||
    code === 'PERSISTENCE_UNAVAILABLE' ||
    code === 'STORAGE_UNAVAILABLE' ||
    code === 'RATE_LIMIT_UNAVAILABLE' ||
    code === 'SERVICE_UNAVAILABLE'
  ) {
    return {
      category: 'persistence_unavailable',
      fallbackMessage: 'The service is temporarily unavailable. Please try again in a moment.',
    };
  }
  if (status >= 500) {
    return {
      category: 'server',
      fallbackMessage: 'An internal server error occurred while processing your request. Please try again.',
    };
  }
  return {
    category: 'server',
    fallbackMessage: `Request failed with status ${status}.`,
  };
}

/**
 * Safely executes fetch() and parses JSON while guarding against HTML error/redirect documents
 * (e.g., <!doctype html> from reverse proxies, server warmup, or unhandled HTML routes)
 * so the browser never crashes with `Unexpected token '<', "<!doctype "... is not valid JSON`.
 */
export async function safeFetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeApiFetchResult<T>> {
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  try {
    const res = await fetch(input, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const finalUrl = res.url || requestUrl;
    const rawText = await res.text();
    const trimmed = rawText.trim();

    const looksLikeHtml =
      contentType.toLowerCase().includes('text/html') ||
      trimmed.toLowerCase().startsWith('<!doctype') ||
      trimmed.toLowerCase().startsWith('<html');

    if (looksLikeHtml) {
      if (res.status === 401) {
        return {
          ok: false,
          status: res.status,
          contentType,
          finalUrl,
          isHtmlResponse: true,
          data: null,
          error: 'Your session has expired or is unauthenticated. Please sign in and try again.',
          errorCategory: 'authentication',
        };
      }
      if (res.status === 403) {
        return {
          ok: false,
          status: res.status,
          contentType,
          finalUrl,
          isHtmlResponse: true,
          data: null,
          error: 'You do not have permission to access this resource.',
          errorCategory: 'authorization',
        };
      }
      if (res.status === 404) {
        return {
          ok: false,
          status: res.status,
          contentType,
          finalUrl,
          isHtmlResponse: true,
          data: null,
          error: 'The requested API endpoint could not be found.',
          errorCategory: 'not_found',
        };
      }
      if (res.status === 429) {
        return {
          ok: false,
          status: res.status,
          contentType,
          finalUrl,
          isHtmlResponse: true,
          data: null,
          error: 'Too many requests. Please wait a moment and try again.',
          errorCategory: 'rate_limited',
        };
      }
      const lowerHtml = trimmed.toLowerCase();
      const isWarmupOrGatewayHtml =
        lowerHtml.includes('starting server') ||
        lowerHtml.includes('warming up') ||
        lowerHtml.includes('application is starting') ||
        lowerHtml.includes('502 bad gateway') ||
        lowerHtml.includes('503 service') ||
        lowerHtml.includes('504 gateway');

      if (res.status === 502 || res.status === 503 || res.status === 504 || isWarmupOrGatewayHtml) {
        return {
          ok: false,
          status: res.status === 200 ? 503 : res.status,
          contentType,
          finalUrl,
          isHtmlResponse: true,
          data: null,
          error: 'The server is warming up or temporarily unavailable. Please retry in a moment.',
          errorCategory: 'persistence_unavailable',
        };
      }

      return {
        ok: false,
        status: res.status,
        contentType,
        finalUrl,
        isHtmlResponse: true,
        data: null,
        error: 'The server returned an unexpected HTML response instead of JSON. Please retry in a moment.',
        errorCategory: 'unexpected_format',
      };
    }

    if (!trimmed) {
      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          contentType,
          finalUrl,
          isHtmlResponse: false,
          data: null,
          error: null,
          errorCategory: null,
        };
      }
      const classified = classifyHttpStatus(res.status);
      return {
        ok: false,
        status: res.status,
        contentType,
        finalUrl,
        isHtmlResponse: false,
        data: null,
        error: classified.fallbackMessage,
        errorCategory: classified.category,
      };
    }

    try {
      const parsed = JSON.parse(trimmed) as T;
      const record = parsed as unknown as Record<string, unknown>;
      if (!res.ok) {
        const nestedErrorObj =
          record?.error && typeof record.error === 'object' && !Array.isArray(record.error)
            ? (record.error as Record<string, unknown>)
            : null;
        const resolvedCode = record?.code ?? nestedErrorObj?.code;
        const classified = classifyHttpStatus(res.status, resolvedCode);
        const extractedError =
          (typeof record?.error === 'string' && record.error.trim()) ||
          (typeof nestedErrorObj?.message === 'string' && nestedErrorObj.message.trim()) ||
          (typeof record?.message === 'string' && record.message.trim()) ||
          classified.fallbackMessage;

        return {
          ok: false,
          status: res.status,
          contentType,
          finalUrl,
          isHtmlResponse: false,
          data: parsed,
          error: extractedError,
          errorCategory: classified.category,
        };
      }

      return {
        ok: true,
        status: res.status,
        contentType,
        finalUrl,
        isHtmlResponse: false,
        data: parsed,
        error: null,
        errorCategory: null,
      };
    } catch {
      return {
        ok: false,
        status: res.status,
        contentType,
        finalUrl,
        isHtmlResponse: false,
        data: null,
        error: 'Received a malformed response from the server. Please try again.',
        errorCategory: 'unexpected_format',
      };
    }
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : '';
    const safeMsg =
      rawMsg &&
      !rawMsg.toLowerCase().includes('<!doctype') &&
      !rawMsg.toLowerCase().includes('unexpected token')
        ? rawMsg
        : 'Network error while communicating with the server. Please check your connection and try again.';

    return {
      ok: false,
      status: 0,
      contentType: '',
      finalUrl: requestUrl,
      isHtmlResponse: false,
      data: null,
      error: safeMsg,
      errorCategory: 'network',
    };
  }
}
