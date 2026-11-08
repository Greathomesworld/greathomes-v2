import { LatLng } from '../spatial/distance';
import { validateCoordinatePair } from '../../projects/viewModels/projectLocationViewModel';
import {
  ProviderRouteResponse,
  RoadRoutingProviderAdapter,
  RoutingProviderId,
} from './types';

export const DEFAULT_HEIGIT_BASE_URL = 'https://api.heigit.org';
export const HEIGIT_ORS_DIRECTIONS_PATH = '/openrouteservice/v2/directions/driving-car';
export const LEGACY_ORS_DIRECTIONS_PATH = '/v2/directions/driving-car';

/**
 * Constructs the canonical OpenRouteService V2 driving-car directions URL.
 * - For the current HeiGIT gateway (`https://api.heigit.org`), resolves to:
 *   `https://api.heigit.org/openrouteservice/v2/directions/driving-car`
 * - If the caller already includes `/openrouteservice` or `/v2/directions/driving-car`,
 *   normalizes without duplicating path segments.
 */
export function buildOpenRouteServiceDirectionsUrl(baseUrl?: string | null): string {
  const rawBase = (baseUrl && baseUrl.trim().length > 0 ? baseUrl.trim() : DEFAULT_HEIGIT_BASE_URL)
    .replace(/\/+$/, '');

  if (rawBase.endsWith('/v2/directions/driving-car')) {
    return rawBase;
  }

  if (rawBase.endsWith('/openrouteservice')) {
    return `${rawBase}${LEGACY_ORS_DIRECTIONS_PATH}`;
  }

  try {
    const parsed = new URL(rawBase);
    const host = parsed.hostname.toLowerCase();
    const cleanPath = parsed.pathname.replace(/\/+$/, '');

    if (host === 'api.heigit.org' && cleanPath === '') {
      return `${rawBase}${HEIGIT_ORS_DIRECTIONS_PATH}`;
    }
  } catch {
    // Fallback if non-standard URL string passed
  }

  return `${rawBase}${HEIGIT_ORS_DIRECTIONS_PATH}`;
}

/**
 * Redacts any occurrence of an API key or Authorization token from diagnostic strings.
 */
export function sanitizeProviderErrorMessage(
  rawMessage: string,
  apiKey?: string | null
): string {
  if (!rawMessage) return 'OpenRouteService request failed.';
  let sanitized = rawMessage;
  if (apiKey && apiKey.trim().length > 0) {
    const escaped = apiKey.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sanitized = sanitized.replace(new RegExp(escaped, 'gi'), '[REDACTED_API_KEY]');
  }
  return sanitized.slice(0, 300);
}

export interface OpenRouteServiceAdapterOptions {
  apiKey?: string | null;
  baseUrl?: string | null;
  defaultTimeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Server-Side OpenRouteService / HeiGIT Provider Adapter (Phase 3).
 *
 * Verified Contract:
 * - Endpoint: POST https://api.heigit.org/openrouteservice/v2/directions/driving-car
 * - Headers:
 *   - Authorization: <OPENROUTESERVICE_API_KEY>
 *   - Content-Type: application/json; charset=utf-8
 *   - Accept: application/json, application/geo+json
 * - Request Payload:
 *   {
 *     "coordinates": [[origin.longitude, origin.latitude], [destination.longitude, destination.latitude]],
 *     "instructions": false,
 *     "geometry": false
 *   }
 * - Response Summary Units:
 *   - routes[0].summary.distance: metres (number)
 *   - routes[0].summary.duration: seconds (number)
 */
export class OpenRouteServiceAdapter implements RoadRoutingProviderAdapter {
  public readonly providerId: RoutingProviderId = 'OPENROUTESERVICE';
  private readonly apiKey: string | null;
  private readonly directionsUrl: string;
  private readonly defaultTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options?: OpenRouteServiceAdapterOptions) {
    if (typeof window !== 'undefined') {
      throw new Error(
        'SECURITY VIOLATION: OpenRouteServiceAdapter is strictly server-only and must never be instantiated in browser code.'
      );
    }

    const rawKey =
      options?.apiKey !== undefined
        ? options.apiKey
        : process.env.OPENROUTESERVICE_API_KEY ?? null;

    this.apiKey = rawKey && rawKey.trim().length > 0 ? rawKey.trim() : null;

    const rawBaseUrl =
      options?.baseUrl !== undefined
        ? options.baseUrl
        : process.env.OPENROUTESERVICE_BASE_URL ?? DEFAULT_HEIGIT_BASE_URL;

    this.directionsUrl = buildOpenRouteServiceDirectionsUrl(rawBaseUrl);
    this.defaultTimeoutMs =
      options?.defaultTimeoutMs && Number.isFinite(options.defaultTimeoutMs) && options.defaultTimeoutMs >= 500
        ? options.defaultTimeoutMs
        : 2000;
    this.fetchFn = options?.fetchFn ?? globalThis.fetch;
  }

  /**
   * Returns true only when a non-empty server-side API key is configured.
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  /**
   * Returns the resolved endpoint URL (contains no secrets).
   */
  getEndpointUrl(): string {
    return this.directionsUrl;
  }

  /**
   * Executes a server-side driving-car route calculation via HeiGIT / OpenRouteService V2.
   */
  async computeDrivingRoute(
    origin: LatLng,
    destination: LatLng,
    options?: { timeoutMs?: number }
  ): Promise<ProviderRouteResponse> {
    if (!this.isConfigured() || !this.apiKey) {
      return {
        status: 'ERROR',
        errorCode: 'UNCONFIGURED',
        errorMessage: 'OpenRouteService API key is not configured.',
      };
    }

    const originValid = validateCoordinatePair(origin?.latitude, origin?.longitude);
    const destValid = validateCoordinatePair(destination?.latitude, destination?.longitude);

    if (
      !originValid.valid ||
      originValid.latitude === null ||
      originValid.longitude === null ||
      !destValid.valid ||
      destValid.latitude === null ||
      destValid.longitude === null
    ) {
      return {
        status: 'ERROR',
        errorCode: 'INVALID_COORDINATES',
        errorMessage: 'Invalid origin or destination coordinates supplied to OpenRouteServiceAdapter.',
      };
    }

    const timeoutMs =
      options?.timeoutMs && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
        ? options.timeoutMs
        : this.defaultTimeoutMs;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    // OpenRouteService strictly requires [longitude, latitude] coordinate order
    const requestPayload = {
      coordinates: [
        [originValid.longitude, originValid.latitude],
        [destValid.longitude, destValid.latitude],
      ],
      instructions: false,
      geometry: false,
    };

    try {
      const response = await this.fetchFn(this.directionsUrl, {
        method: 'POST',
        headers: {
          Authorization: this.apiKey,
          'Content-Type': 'application/json; charset=utf-8',
          Accept: 'application/json, application/geo+json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      const httpStatus = response.status;
      let parsedBody: unknown = null;

      try {
        parsedBody = await response.json();
      } catch {
        parsedBody = null;
      }

      if (!response.ok) {
        return this.handleErrorHttpResponse(httpStatus, parsedBody);
      }

      return this.parseSuccessResponse(httpStatus, parsedBody);
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.message.toLowerCase().includes('abort') ||
          err.message.toLowerCase().includes('timeout'));

      if (isAbort) {
        return {
          status: 'TIMEOUT',
          errorCode: 'TIMEOUT',
          errorMessage: `OpenRouteService request timed out after ${timeoutMs}ms.`,
        };
      }

      const rawMsg = err instanceof Error ? err.message : 'Network error calling OpenRouteService.';
      return {
        status: 'ERROR',
        errorCode: 'NETWORK_ERROR',
        errorMessage: sanitizeProviderErrorMessage(rawMsg, this.apiKey),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private handleErrorHttpResponse(
    httpStatus: number,
    body: unknown
  ): ProviderRouteResponse {
    const errorCode = this.extractOrsErrorCode(body);
    const rawErrorMessage = this.extractOrsErrorMessage(body);

    // ORS error codes 2009 ("Route could not be found") and 2010 ("Point was not found")
    // indicate unroutable coordinates rather than a system failure.
    if (errorCode === 2009 || errorCode === 2010) {
      return {
        status: 'UNROUTABLE',
        errorCode: 'UNROUTABLE',
        httpStatus,
        errorMessage: sanitizeProviderErrorMessage(
          rawErrorMessage || `No drivable route found (ORS code ${errorCode}).`,
          this.apiKey
        ),
      };
    }

    if (httpStatus === 401 || httpStatus === 403) {
      return {
        status: 'ERROR',
        errorCode: 'AUTH_FAILED',
        httpStatus,
        errorMessage: `OpenRouteService authentication failed (HTTP ${httpStatus}).`,
      };
    }

    if (httpStatus === 429) {
      return {
        status: 'RATE_LIMITED',
        errorCode: 'PROVIDER_RATE_LIMITED',
        httpStatus: 429,
        errorMessage: 'OpenRouteService rate limit or quota exhausted (HTTP 429).',
      };
    }

    if (httpStatus >= 500) {
      return {
        status: 'ERROR',
        errorCode: 'SERVER_ERROR',
        httpStatus,
        errorMessage: `OpenRouteService upstream server error (HTTP ${httpStatus}).`,
      };
    }

    return {
      status: 'ERROR',
      errorCode: 'SERVER_ERROR',
      httpStatus,
      errorMessage: sanitizeProviderErrorMessage(
        rawErrorMessage || `OpenRouteService request failed with HTTP ${httpStatus}.`,
        this.apiKey
      ),
    };
  }

  private parseSuccessResponse(
    httpStatus: number,
    body: unknown
  ): ProviderRouteResponse {
    if (!body || typeof body !== 'object') {
      return {
        status: 'INVALID_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        httpStatus,
        errorMessage: 'OpenRouteService returned a non-JSON or empty response body.',
      };
    }

    const record = body as Record<string, unknown>;

    // Check if body contains an embedded ORS error despite 200 status
    if (record.error) {
      const code = this.extractOrsErrorCode(body);
      if (code === 2009 || code === 2010) {
        return {
          status: 'UNROUTABLE',
          errorCode: 'UNROUTABLE',
          httpStatus,
          errorMessage: `No drivable route found (ORS code ${code}).`,
        };
      }
      return {
        status: 'INVALID_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        httpStatus,
        errorMessage: sanitizeProviderErrorMessage(
          this.extractOrsErrorMessage(body) || 'OpenRouteService returned an error payload on HTTP 200.',
          this.apiKey
        ),
      };
    }

    // Standard JSON format: { routes: [ { summary: { distance, duration } } ] }
    let summary: Record<string, unknown> | null = null;

    if (Array.isArray(record.routes)) {
      if (record.routes.length === 0) {
        return {
          status: 'UNROUTABLE',
          errorCode: 'UNROUTABLE',
          httpStatus,
          errorMessage: 'OpenRouteService returned an empty routes array.',
        };
      }
      const firstRoute = record.routes[0];
      if (firstRoute && typeof firstRoute === 'object' && 'summary' in firstRoute) {
        const cand = (firstRoute as Record<string, unknown>).summary;
        if (cand && typeof cand === 'object') {
          summary = cand as Record<string, unknown>;
        }
      }
    } else if (Array.isArray(record.features)) {
      if (record.features.length === 0) {
        return {
          status: 'UNROUTABLE',
          errorCode: 'UNROUTABLE',
          httpStatus,
          errorMessage: 'OpenRouteService returned an empty features array.',
        };
      }
      // GeoJSON fallback format: { features: [ { properties: { summary: { distance, duration } } } ] }
      const firstFeature = record.features[0];
      if (firstFeature && typeof firstFeature === 'object') {
        const props = (firstFeature as Record<string, unknown>).properties;
        if (props && typeof props === 'object' && 'summary' in props) {
          const cand = (props as Record<string, unknown>).summary;
          if (cand && typeof cand === 'object') {
            summary = cand as Record<string, unknown>;
          }
        }
      }
    }

    if (!summary) {
      return {
        status: 'INVALID_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        httpStatus,
        errorMessage: 'OpenRouteService response is missing routes[0].summary.',
      };
    }

    const distanceMeters = summary.distance;
    const durationSeconds = summary.duration;

    if (
      typeof distanceMeters !== 'number' ||
      typeof durationSeconds !== 'number' ||
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds)
    ) {
      return {
        status: 'INVALID_RESPONSE',
        errorCode: 'INVALID_RESPONSE',
        httpStatus,
        errorMessage:
          'OpenRouteService response summary is missing finite numeric distance or duration.',
      };
    }

    return {
      status: 'OK',
      httpStatus,
      distanceMeters,
      durationSeconds,
    };
  }

  private extractOrsErrorCode(body: unknown): number | null {
    if (!body || typeof body !== 'object') return null;
    const err = (body as Record<string, unknown>).error;
    if (err && typeof err === 'object' && 'code' in err) {
      const code = Number((err as Record<string, unknown>).code);
      return Number.isFinite(code) ? code : null;
    }
    return null;
  }

  private extractOrsErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object') return null;
    const err = (body as Record<string, unknown>).error;
    if (typeof err === 'string') {
      return err;
    }
    if (err && typeof err === 'object' && 'message' in err) {
      const msg = (err as Record<string, unknown>).message;
      if (typeof msg === 'string') return msg;
    }
    return null;
  }
}
