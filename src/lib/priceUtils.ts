/**
 * Utility functions for robust currency and price parsing in Great Homes V2.
 * Supports plain numeric, formatted Indian currency (e.g. 85,00,000 or ₹85,00,000),
 * and rejects malformed, empty, negative, or zero inputs.
 */

export interface PriceParseResult {
  valid: boolean;
  value?: number;
  error?: string;
}

/**
 * Returns detailed parse result with validation error message if invalid.
 */
export function parseIndianCurrencyPriceDetailed(input: string | number | null | undefined): PriceParseResult {
  if (input === null || input === undefined) {
    return { valid: false, error: 'Price is required. Please enter a valid amount.' };
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input <= 0) {
      return { valid: false, error: 'Price must be a positive number greater than 0.' };
    }
    return { valid: true, value: input };
  }

  const raw = String(input).trim();
  if (!raw) {
    return { valid: false, error: 'Price is required. Please enter a valid amount.' };
  }

  // Remove common currency symbols and prefixes (₹, Rs., INR)
  let cleaned = raw.replace(/^(₹|Rs\.?|INR)\s*/i, '').trim();

  // Reject consecutive delimiters (e.g. "85,,000" or "85..00")
  if (/,,|\.\./.test(cleaned)) {
    return { valid: false, error: 'Price contains invalid formatting (consecutive delimiters).' };
  }

  // Reject negative prices
  if (cleaned.startsWith('-')) {
    return { valid: false, error: 'Price cannot be negative.' };
  }

  // Remove standard commas used in Indian/international grouping
  cleaned = cleaned.replace(/,/g, '').trim();

  // Support optional Indian shorthand unit suffixes (Cr/Crore, L/Lac/Lakh, K)
  let multiplier = 1;
  const unitMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(cr|crore|crores|l|lac|lacs|lakh|lakhs|k)$/i);
  if (unitMatch) {
    cleaned = unitMatch[1];
    const unit = unitMatch[2].toLowerCase();
    if (unit === 'cr' || unit === 'crore' || unit === 'crores') {
      multiplier = 10_000_000;
    } else if (unit === 'l' || unit === 'lac' || unit === 'lacs' || unit === 'lakh' || unit === 'lakhs') {
      multiplier = 100_000;
    } else if (unit === 'k') {
      multiplier = 1_000;
    }
  }

  // Ensure cleaned value is purely numeric with an optional single decimal point
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return { valid: false, error: 'Price contains invalid characters. Please enter a valid number (e.g. 85,00,000).' };
  }

  const num = Math.round(parseFloat(cleaned) * multiplier);
  if (!Number.isFinite(num) || num <= 0) {
    return { valid: false, error: 'Price must be a positive number greater than 0.' };
  }

  return { valid: true, value: num };
}

/**
 * Parses an Indian currency or numeric string and returns a valid positive number,
 * or null if invalid, malformed, non-positive, or empty.
 */
export function parseIndianCurrencyPrice(input: string | number | null | undefined): number | null {
  const result = parseIndianCurrencyPriceDetailed(input);
  return result.valid && result.value !== undefined ? result.value : null;
}

/**
 * Safely parses a square-footage area input (number or string, with optional comma separators).
 * Returns a positive finite number (> 0), or null if empty, non-numeric, zero, or negative.
 */
export function parsePositiveAreaSqft(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    return Number.isFinite(input) && input > 0 ? input : null;
  }
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/,,|\.\./.test(trimmed) || trimmed.startsWith('-')) return null;

  const normalized = trimmed.replace(/,/g, '').replace(/\s*(sq\.?\s*ft\.?|sqft)$/i, '').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Compares two effective price-per-sqft rates for sorting.
 * Invalid, missing, or non-positive rates (null, undefined, NaN, <= 0) ALWAYS sort last,
 * regardless of ascending or descending direction.
 */
export function compareEffectiveRates(
  rateA: number | null | undefined,
  rateB: number | null | undefined,
  direction: 'asc' | 'desc'
): number {
  const validA = typeof rateA === 'number' && Number.isFinite(rateA) && rateA > 0 ? rateA : null;
  const validB = typeof rateB === 'number' && Number.isFinite(rateB) && rateB > 0 ? rateB : null;

  if (validA === null && validB === null) return 0;
  if (validA === null) return 1; // Invalid/missing always sorts last
  if (validB === null) return -1;

  return direction === 'asc' ? validA - validB : validB - validA;
}

/**
 * Checks whether a numerical price is a valid positive finite number (> 0).
 */
export function isPositivePrice(price: unknown): price is number {
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

/**
 * Centralized resolver for whether a specific configuration/typology is Price on Request.
 * Returns true if:
 * 1. The parent project has `priceOnRequest === true` (project-level override), OR
 * 2. The configuration itself has `priceOnRequest === true`, OR
 * 3. The configuration has no valid positive numerical price (`<= 0`, `null`, `undefined`, `NaN`).
 */
export function isConfigurationPriceOnRequest(
  config: { priceOnRequest?: boolean | null; price?: number | null } | null | undefined,
  project?: { priceOnRequest?: boolean | null } | null
): boolean {
  if (!config) return true;
  if (project?.priceOnRequest) return true;
  if (config.priceOnRequest) return true;
  return !isPositivePrice(config.price);
}

/**
 * Centralized resolver for whether a project as a whole is Price on Request.
 * Rules:
 * 1. If `project.priceOnRequest === true`, returns `true`.
 * 2. If `configurations` are present (`configurations.length > 0`):
 *    Returns `true` if ALL configurations are Price on Request (never falls back to `project.startingPrice` when all configurations are PoR).
 * 3. If no configurations exist:
 *    Returns `true` if `project.startingPrice` is missing or not a valid positive number.
 */
export function isProjectPriceOnRequest(
  project: { priceOnRequest?: boolean | null; startingPrice?: number | null } | null | undefined,
  configurations?: Array<{ priceOnRequest?: boolean | null; price?: number | null }> | null
): boolean {
  if (!project) return true;
  if (project.priceOnRequest) return true;

  if (configurations && configurations.length > 0) {
    return configurations.every((c) => isConfigurationPriceOnRequest(c, project));
  }

  return !isPositivePrice(project.startingPrice);
}

/**
 * Compares two prices for sorting while ensuring that Price on Request items
 * (or items with missing/non-positive prices) ALWAYS sort last in both
 * ascending (`asc`) and descending (`desc`) order.
 */
export function comparePricesWithPorLast(
  priceA: number | null | undefined,
  priceB: number | null | undefined,
  direction: 'asc' | 'desc',
  porA = false,
  porB = false
): number {
  const validA = !porA && isPositivePrice(priceA) ? priceA : null;
  const validB = !porB && isPositivePrice(priceB) ? priceB : null;

  if (validA === null && validB === null) return 0;
  if (validA === null) return 1; // PoR / missing price always sorts last
  if (validB === null) return -1;

  return direction === 'asc' ? validA - validB : validB - validA;
}

