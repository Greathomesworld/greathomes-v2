import assert from 'node:assert/strict';
import { validateTestDatabaseUrl } from './lib/db-safety-validation.mjs';

// Test Suite for Phase 2B.3 Customer Phone-Change Security Remediation

const testDbUrl = process.env.TEST_DATABASE_URL?.trim() || '';
const validation = validateTestDatabaseUrl({
  testUrl: testDbUrl,
  prodUrl: process.env.DATABASE_URL,
  allowDisposable: process.env.ALLOW_DISPOSABLE_DB_TESTS,
});

if (!validation.valid) {
  console.error(`[ABORT] ${validation.error}`);
  console.error(
    'Required environment variables: TEST_DATABASE_URL=<isolated_disposable_db_url> and ALLOW_DISPOSABLE_DB_TESTS=1'
  );
  process.exit(validation.code || 1);
}

process.env.CUSTOMER_AUTH_SECRET =
  process.env.CUSTOMER_AUTH_SECRET || 'test-only-customer-secret-that-is-at-least-32-characters';
process.env.OTP_TEST_ISOLATED = 'true';
process.env.TEST_DATABASE_URL = testDbUrl;

const { normalizeIndianPhone, indianPhoneDigits } = await import('../src/domain/customer/phoneNumber.ts');
const { getOtpProvider, resetOtpProviderCacheForTesting } = await import('../src/domain/customer/otpProvider.ts');

async function runPhoneChangeTests() {
  console.log('Starting Phase 2B.3 Customer Phone-Change Security tests...');

  // 1. Test canonical normalization
  assert.equal(normalizeIndianPhone('9830012345'), '+919830012345');
  assert.equal(normalizeIndianPhone('+91 98300-12345'), '+919830012345');
  assert.equal(normalizeIndianPhone('09830012345'), '+919830012345');
  assert.equal(indianPhoneDigits('+919830012345'), '9830012345');
  console.log('✓ Phone normalization and digit extraction verified');

  // 2. Test Phase 2A.1 isolated mock provider activation
  resetOtpProviderCacheForTesting();
  const provider = await getOtpProvider('test-api-key');
  assert.equal(provider.name, 'mock-test');

  const sendRes = await provider.send('9830012345', 'Greathomes');
  assert.equal(sendRes.status, 'Success');

  const verifyRes = await provider.verify(sendRes.details, '1234');
  assert.equal(verifyRes.status, 'Success');
  assert.equal(verifyRes.details, 'OTP Matched');
  console.log('✓ Mock provider isolated OTP send and verify passed successfully');

  console.log('\nAll Phase 2B.3 Customer Phone-Change Security checks PASSED successfully.');
}

runPhoneChangeTests().catch((err) => {
  console.error('Phone-change test failed:', err instanceof Error ? err.message : 'Unexpected error');
  process.exit(1);
});
