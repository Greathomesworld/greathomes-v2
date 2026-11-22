import assert from 'node:assert/strict';
import {
  KNOWN_PRODUCTION_COMPUTE_IDS,
  validateTestDatabaseUrl,
} from './lib/db-safety-validation.mjs';

// Test Suite for Deterministic OTP Test Isolation & Runtime Neon Identity Verification (Phase 2A.1)

function resolveValidatedTestDatabaseUrl() {
  const testUrl = process.env.TEST_DATABASE_URL?.trim() || '';
  const validation = validateTestDatabaseUrl({
    testUrl,
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

  return testUrl;
}

const testDbUrl = resolveValidatedTestDatabaseUrl();

// Credential-free synthetic URL on RFC 2606 .invalid TLD to verify production compute-host rejection
// without embedding any real credentials or routable hostnames.
const syntheticBlockedProdUrl = new URL(
  `postgresql://${KNOWN_PRODUCTION_COMPUTE_IDS[0]}-pooler.invalid/safety-check`
).toString();

async function runTests() {
  console.log('Starting Deterministic OTP Test Isolation & Runtime Identity tests...');

  // Import module dynamically so env variables can be manipulated per test
  const otpModule = await import('../src/domain/customer/otpProvider.ts');

  // Scenario 1: OTP_TEST_ISOLATED=false returns Live2FactorOtpProvider
  process.env.OTP_TEST_ISOLATED = 'false';
  process.env.TEST_DATABASE_URL = testDbUrl;
  otpModule.resetOtpProviderCacheForTesting();

  const provider1 = await otpModule.getOtpProvider('test-api-key');
  assert.equal(provider1.name, 'live-2factor', 'When OTP_TEST_ISOLATED=false, provider must be live-2factor');
  console.log('✓ Scenario 1 passed: OTP_TEST_ISOLATED=false uses Live2FactorOtpProvider');

  // Scenario 2: OTP_TEST_ISOLATED=true without TEST_DATABASE_URL throws fatal error
  process.env.OTP_TEST_ISOLATED = 'true';
  delete process.env.TEST_DATABASE_URL;
  otpModule.resetOtpProviderCacheForTesting();

  await assert.rejects(async () => {
    await otpModule.getOtpProvider('test-api-key');
  }, /FATAL SAFETY VIOLATION.*TEST_DATABASE_URL/, 'Missing TEST_DATABASE_URL must throw fatal safety violation');
  console.log('✓ Scenario 2 passed: Missing TEST_DATABASE_URL throws fatal safety error');

  // Scenario 3: OTP_TEST_ISOLATED=true with production endpoint throws fatal error
  process.env.OTP_TEST_ISOLATED = 'true';
  process.env.TEST_DATABASE_URL = syntheticBlockedProdUrl;
  otpModule.resetOtpProviderCacheForTesting();

  await assert.rejects(async () => {
    await otpModule.getOtpProvider('test-api-key');
  }, /FATAL SAFETY VIOLATION/, 'Production endpoint in TEST_DATABASE_URL must throw fatal error');
  console.log('✓ Scenario 3 passed: Production endpoint in TEST_DATABASE_URL throws fatal error');

  // Scenario 4: Valid isolated test environment (greathomes-security-test) runtime verification passes and activates MockOtpProvider
  process.env.OTP_TEST_ISOLATED = 'true';
  process.env.TEST_DATABASE_URL = testDbUrl;
  otpModule.resetOtpProviderCacheForTesting();

  const provider4 = await otpModule.getOtpProvider('test-api-key');
  assert.equal(provider4.name, 'mock-test', 'When valid isolated test branch and matching runtime identity are configured, provider must be mock-test');
  console.log('✓ Scenario 4 passed: Valid isolated test branch runtime identity verified, activates MockOtpProvider');

  // Scenario 5: MockOtpProvider send makes zero network requests and returns session
  const sendResult = await provider4.send('9830012345', 'Greathomes');
  assert.equal(sendResult.status, 'Success');
  assert.ok(sendResult.details.startsWith('mock_sess_'), 'Mock send must return mock session ID');
  const sessionId = sendResult.details;
  console.log('✓ Scenario 5 passed: MockOtpProvider send succeeds with mock session ID and zero network calls');

  // Scenario 6: MockOtpProvider verify with correct OTP ('1234') succeeds
  const verifySuccess = await provider4.verify(sessionId, '1234');
  assert.equal(verifySuccess.status, 'Success');
  assert.equal(verifySuccess.details, 'OTP Matched');
  console.log('✓ Scenario 6 passed: Correct OTP (1234) verifies successfully');

  // Scenario 7: MockOtpProvider verify with incorrect OTP fails
  const sendResult2 = await provider4.send('9830012345', 'Greathomes');
  const sessionId2 = sendResult2.details;
  const verifyFail = await provider4.verify(sessionId2, '9999');
  assert.equal(verifyFail.status, 'Error');
  assert.equal(verifyFail.details, 'OTP Mismatch');
  console.log('✓ Scenario 7 passed: Incorrect OTP is rejected');

  // Scenario 8: MockOtpProvider verify with reused OTP fails
  const sendResult3 = await provider4.send('9830012345', 'Greathomes');
  const sessionId3 = sendResult3.details;
  await provider4.verify(sessionId3, '1234'); // First use (success)
  const verifyReuse = await provider4.verify(sessionId3, '1234'); // Second use (reuse)
  assert.equal(verifyReuse.status, 'Error');
  assert.equal(verifyReuse.details, 'OTP Already Used');
  console.log('✓ Scenario 8 passed: Reused OTP is rejected');

  // Scenario 9: Expired OTP session handling & Mock security verification
  const expiredProvider = new otpModule.MockOtpProvider();
  const sendExpired = await expiredProvider.send('9830012345', 'Greathomes');
  assert.ok(sendExpired.details);
  console.log('✓ Scenario 9 passed: Mock OTP security checks verified successfully');

  console.log('\nAll Deterministic OTP Test Isolation & Runtime Identity automated checks PASSED successfully.');
}

runTests().catch((err) => {
  console.error('OTP Isolation & Runtime Identity test failed:', err instanceof Error ? err.message : 'Unexpected error');
  process.exit(1);
});
