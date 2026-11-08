/**
 * Normalizes India mobile numbers into +91XXXXXXXXXX.
 * Only Indian mobile numbers are supported by the first customer OTP release.
 */
export function normalizeIndianPhone(value: unknown): string {
  if (typeof value !== 'string') {
    throw Object.assign(new Error('Enter a valid Indian mobile number.'), { statusCode: 400 });
  }

  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);

  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw Object.assign(new Error('Enter a valid 10-digit Indian mobile number.'), { statusCode: 400 });
  }

  return `+91${digits}`;
}

export function indianPhoneDigits(normalizedPhone: string): string {
  return normalizedPhone.startsWith('+91') ? normalizedPhone.slice(3) : normalizedPhone.replace(/\D/g, '');
}
