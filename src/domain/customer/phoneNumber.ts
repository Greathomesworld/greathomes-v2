/**
 * Normalizes India mobile numbers into +91XXXXXXXXXX.
 * Only Indian mobile numbers are supported by the first customer OTP release.
 */
export class PhoneValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PhoneValidationError';
    this.statusCode = statusCode;
  }
}

export function normalizeIndianPhone(value: unknown): string {
  if (typeof value !== 'string') {
    throw new PhoneValidationError('Enter a valid Indian mobile number.', 400);
  }

  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new PhoneValidationError('Enter a valid 10-digit Indian mobile number.', 400);
  }

  return `+91${digits}`;
}

export function indianPhoneDigits(normalizedPhone: string): string {
  return normalizedPhone.startsWith('+91') ? normalizedPhone.slice(3) : normalizedPhone.replace(/\D/g, '');
}
