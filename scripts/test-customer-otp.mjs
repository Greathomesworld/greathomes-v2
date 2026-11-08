import assert from 'node:assert/strict';

process.env.CUSTOMER_AUTH_SECRET = 'test-only-customer-secret-that-is-at-least-32-characters';

const { normalizeIndianPhone, indianPhoneDigits } = await import('../src/domain/customer/phoneNumber.ts');
const { createCustomerToken, verifyCustomerToken, verifyCustomerAuth } = await import('../src/domain/customer/customerAuth.ts');

assert.equal(normalizeIndianPhone('98300 12345'), '+919830012345');
assert.equal(normalizeIndianPhone('+91 98300-12345'), '+919830012345');
assert.equal(normalizeIndianPhone('09830012345'), '+919830012345');
assert.equal(indianPhoneDigits('+919830012345'), '9830012345');
assert.throws(() => normalizeIndianPhone('12345'), /valid 10-digit Indian mobile number/);
assert.throws(() => normalizeIndianPhone('+1 415 555 0199'), /valid 10-digit Indian mobile number/);

const token = createCustomerToken('customer-test-id');
assert.equal(verifyCustomerToken(token), 'customer-test-id');
const [encodedId, timestamp, signature] = token.split(':');
const changedSignature = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
assert.equal(verifyCustomerToken(`${encodedId}:${timestamp}:${changedSignature}`), null);
assert.equal(verifyCustomerToken('gh-internal-staff-secret'), null);

const staffSpoof = await verifyCustomerAuth(new Request('https://greathomes.invalid/api/customer/auth/me', {
  headers: { 'x-staff-role': 'SUPER_ADMIN' },
}));
assert.equal(staffSpoof.authorized, false);
assert.equal(staffSpoof.statusCode, 403);

delete process.env.CUSTOMER_AUTH_SECRET;
assert.equal(verifyCustomerToken(token), null, 'Customer sessions must fail closed when the session secret is missing');
assert.throws(() => createCustomerToken('customer-test-id'), /CUSTOMER_AUTH_SECRET/);

console.log('Customer OTP unit tests passed: Indian phone normalization, token integrity, missing-secret fail-closed behavior, and staff/customer boundary.');
