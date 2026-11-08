import assert from 'node:assert/strict';

process.env.CUSTOMER_AUTH_SECRET = 'test-only-customer-secret-that-is-at-least-32-characters';
process.env.GH_STAFF_SESSION_SECRET = 'test-only-staff-secret-that-is-at-least-32-characters-long';

const { verifyCustomerAuth } = await import('../src/domain/customer/customerAuth.ts');
const { createBrochureDownloadToken, verifyBrochureDownloadToken } = await import('../src/lib/brochureToken.ts');
const { normalizeIndianPhone } = await import('../src/domain/customer/phoneNumber.ts');

// 1. Verify unauthenticated customer request fails closed
const unauthRequest = new Request('https://greathomes.invalid/api/projects/proj-123/brochure/request', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
});
const unauthResult = await verifyCustomerAuth(unauthRequest);
assert.equal(unauthResult.authorized, false, 'Unauthenticated visitor must not have customer access');
assert.equal(unauthResult.statusCode, 401, 'Unauthenticated request must return 401');

// 2. Verify staff credentials cannot spoof customer session
const staffSpoofRequest = new Request('https://greathomes.invalid/api/projects/proj-123/brochure/request', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-staff-role': 'ADMIN',
  },
});
const staffResult = await verifyCustomerAuth(staffSpoofRequest);
assert.equal(staffResult.authorized, false, 'Staff headers must be rejected at customer boundary');
assert.equal(staffResult.statusCode, 403, 'Cross-boundary spoofing must return 403');

// 3. Verify brochure download token lifecycle & cryptographic binding
const brochureToken = createBrochureDownloadToken({
  projectId: 'project-kolkata-heights',
  brochureId: 'brochure-doc-789',
  enquiryId: 'GH-ENQ-999888',
}, 600);

const validCheck = verifyBrochureDownloadToken(brochureToken, 'project-kolkata-heights');
assert.equal(validCheck.valid, true, 'Matching project ID must validate token');
assert.equal(validCheck.payload?.brochureId, 'brochure-doc-789');
assert.equal(validCheck.payload?.enquiryId, 'GH-ENQ-999888');

// Cross-project replay attack attempt must fail
const crossProjectCheck = verifyBrochureDownloadToken(brochureToken, 'different-project-id');
assert.equal(crossProjectCheck.valid, false, 'Token issued for Project A must not authorize Project B');

// Tampered token check
const [payloadPart, sigPart] = brochureToken.split('.');
const tamperedToken = `${payloadPart}.${sigPart.slice(0, -2)}AA`;
const tamperedCheck = verifyBrochureDownloadToken(tamperedToken, 'project-kolkata-heights');
assert.equal(tamperedCheck.valid, false, 'Tampered signature must be rejected');

// 4. Verify Indian phone normalization for brochure leads
assert.equal(normalizeIndianPhone('9830012345'), '+919830012345');
assert.equal(normalizeIndianPhone('+91 98300 12345'), '+919830012345');
assert.equal(normalizeIndianPhone('09830012345'), '+919830012345');
assert.throws(() => normalizeIndianPhone('12345'), /valid 10-digit Indian mobile number/);

console.log('Brochure flow unit tests passed: Customer auth enforcement, staff isolation, and cryptographic project binding verified.');
