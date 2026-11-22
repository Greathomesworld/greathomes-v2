/**
 * Timezone-safe date parser and validator for Rental availabilityDate and Resale possessionDate.
 *
 * Rules:
 * - null, undefined, or empty/whitespace-only strings normalize to null.
 * - Date-only strings ("YYYY-MM-DD") are validated against real calendar dates
 *   (rejecting rollovers such as "2026-02-31") and parsed strictly as UTC midnight
 *   so no local timezone offset can shift the calendar day.
 * - Full ISO-8601 date-time strings are validated for real calendar dates and valid timestamps.
 * - Date instances are validated against NaN / Invalid Date.
 * - Any invalid input throws the provided ValidationError constructor (defaulting to Error with name='ValidationError').
 */

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

type ErrorCtor = new (message: string) => Error;

function buildValidationError(message: string, ErrorClass?: ErrorCtor): Error {
  if (ErrorClass) {
    return new ErrorClass(message);
  }
  const err = new Error(message);
  err.name = 'ValidationError';
  return err;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const probe = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function parseListingDate(
  value: unknown,
  fieldLabel: string,
  ErrorClass?: ErrorCtor
): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw buildValidationError(`${fieldLabel} must be a valid date.`, ErrorClass);
    }
    return new Date(value.getTime());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const dateOnlyMatch = DATE_ONLY_REGEX.exec(trimmed);
    if (dateOnlyMatch) {
      const year = Number(dateOnlyMatch[1]);
      const month = Number(dateOnlyMatch[2]);
      const day = Number(dateOnlyMatch[3]);
      if (!isValidCalendarDate(year, month, day)) {
        throw buildValidationError(
          `${fieldLabel} must be a valid calendar date (YYYY-MM-DD).`,
          ErrorClass
        );
      }
      return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    }

    const isoMatch = ISO_DATETIME_REGEX.exec(trimmed);
    if (isoMatch) {
      const year = Number(isoMatch[1]);
      const month = Number(isoMatch[2]);
      const day = Number(isoMatch[3]);
      if (!isValidCalendarDate(year, month, day)) {
        throw buildValidationError(
          `${fieldLabel} must be a valid calendar date.`,
          ErrorClass
        );
      }
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        throw buildValidationError(`${fieldLabel} must be a valid ISO date.`, ErrorClass);
      }
      return parsed;
    }

    throw buildValidationError(
      `${fieldLabel} must be a valid date in YYYY-MM-DD or ISO-8601 format.`,
      ErrorClass
    );
  }

  throw buildValidationError(`${fieldLabel} must be a valid date.`, ErrorClass);
}
