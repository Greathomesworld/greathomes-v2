#!/usr/bin/env node
/**
 * Great Homes V2 — Database Connection Safety Validation Unit Tests
 *
 * Verifies that the safety guardrails correctly accept valid disposable Neon branch URLs
 * (including those using the logical database name 'greathomes-production') while strictly
 * rejecting production compute hosts, poolers, matching hosts, and missing configuration.
 *
 * This test suite does NOT connect to PostgreSQL and can run entirely in local/CI memory.
 */

import assert from 'node:assert/strict';
import { validateTestDatabaseUrl, redactDatabaseUrl } from './lib/db-safety-validation.mjs';

let passed = 0;
let failed = 0;

function check(condition, id, message) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m[PASS]\x1b[0m ${id}: ${message}`);
  } else {
    failed++;
    console.error(`\x1b[31m[FAIL]\x1b[0m ${id}: ${message}`);
  }
}

console.log('================================================================');
console.log('DATABASE CONNECTION SAFETY VALIDATION UNIT TESTS');
console.log('================================================================\n');

const DUMMY_PROD_URL = 'postgresql://neondb_owner:secretProdPass123@ep-royal-smoke-b3uti4fv-pooler.c-4.ap-southeast-1.aws.neon.tech/greathomes-production?sslmode=require';
const DUMMY_TEST_BRANCH_URL = 'postgresql://neondb_owner:secretTestPass456@ep-billowing-sound-b31orpm0-pooler.c-4.ap-southeast-1.aws.neon.tech/greathomes-production?sslmode=require';
const DUMMY_TEST_DIRECT_URL = 'postgresql://neondb_owner:secretTestPass456@ep-billowing-sound-b31orpm0.c-4.ap-southeast-1.aws.neon.tech/greathomes-production?sslmode=require';

// 1. Missing TEST_DATABASE_URL
const missingUrlRes = validateTestDatabaseUrl({
  testUrl: '',
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '1',
});
check(
  !missingUrlRes.valid && missingUrlRes.code === 2 && missingUrlRes.error.includes('TEST_DATABASE_URL is not configured'),
  'VAL-MISSING-URL',
  'Missing or empty TEST_DATABASE_URL returns exit code 2 and helpful guidance'
);

// 2. Missing or invalid ALLOW_DISPOSABLE_DB_TESTS
const missingFlagRes = validateTestDatabaseUrl({
  testUrl: DUMMY_TEST_BRANCH_URL,
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '0',
});
check(
  !missingFlagRes.valid && missingFlagRes.code === 2 && missingFlagRes.error.includes('ALLOW_DISPOSABLE_DB_TESTS=1'),
  'VAL-MISSING-FLAG',
  'Missing or non-"1" ALLOW_DISPOSABLE_DB_TESTS flag returns exit code 2'
);

// 3. Exact production direct host rejection
const prodDirectUrl = 'postgresql://user:pass@ep-royal-smoke-b3uti4fv.c-4.ap-southeast-1.aws.neon.tech/greathomes-production';
const prodDirectRes = validateTestDatabaseUrl({
  testUrl: prodDirectUrl,
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '1',
});
check(
  !prodDirectRes.valid && prodDirectRes.code === 1 && prodDirectRes.error.includes('matches production endpoint pattern'),
  'VAL-REJECT-PROD-HOST',
  'Direct production compute endpoint host is strictly rejected with code 1'
);

// 4. Production pooler host rejection
const prodPoolerUrl = 'postgresql://user:pass@ep-royal-smoke-b3uti4fv-pooler.c-4.ap-southeast-1.aws.neon.tech/greathomes-production';
const prodPoolerRes = validateTestDatabaseUrl({
  testUrl: prodPoolerUrl,
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '1',
});
check(
  !prodPoolerRes.valid && prodPoolerRes.code === 1,
  'VAL-REJECT-PROD-POOLER',
  'Production pooled compute endpoint host is strictly rejected with code 1'
);

// 5. Test host matches application DATABASE_URL host directly
const matchingHostUrl = 'postgresql://user:pass@ep-royal-smoke-b3uti4fv-pooler.c-4.ap-southeast-1.aws.neon.tech/other_db';
const matchingHostRes = validateTestDatabaseUrl({
  testUrl: matchingHostUrl,
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '1',
});
check(
  !matchingHostRes.valid && matchingHostRes.code === 1,
  'VAL-REJECT-MATCHING-HOST',
  'Host matching application DATABASE_URL host is strictly rejected even with a different DB name'
);

// 6. Test host shares base compute with DATABASE_URL (direct vs pooler)
const dynamicProdUrl = 'postgresql://user:pass@ep-custom-prod-endpoint-pooler.c-4.ap-southeast-1.aws.neon.tech/greathomes-production';
const dynamicTestUrl = 'postgresql://user:pass@ep-custom-prod-endpoint.c-4.ap-southeast-1.aws.neon.tech/isolated_test';
const baseMatchingRes = validateTestDatabaseUrl({
  testUrl: dynamicTestUrl,
  prodUrl: dynamicProdUrl,
  allowDisposable: '1',
});
check(
  !baseMatchingRes.valid && baseMatchingRes.code === 1 && baseMatchingRes.error.includes('shares the base compute endpoint'),
  'VAL-REJECT-BASE-COMPUTE-MATCH',
  'Host sharing underlying base compute endpoint with DATABASE_URL is strictly rejected'
);

// 7. Legitimate test branch host with 'greathomes-production' database name ACCEPTANCE
const validBranchRes = validateTestDatabaseUrl({
  testUrl: DUMMY_TEST_BRANCH_URL,
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '1',
});
check(
  validBranchRes.valid === true && validBranchRes.code === 0,
  'VAL-ACCEPT-TEST-BRANCH-POOLER',
  'Distinct test branch compute host with greathomes-production database name is ACCEPTED'
);

// 8. Legitimate test direct branch host ACCEPTANCE
const validDirectRes = validateTestDatabaseUrl({
  testUrl: DUMMY_TEST_DIRECT_URL,
  prodUrl: DUMMY_PROD_URL,
  allowDisposable: '1',
});
check(
  validDirectRes.valid === true && validDirectRes.code === 0,
  'VAL-ACCEPT-TEST-BRANCH-DIRECT',
  'Distinct test branch direct compute host with greathomes-production database name is ACCEPTED'
);

// 9. Redaction verification
const redacted = redactDatabaseUrl(DUMMY_PROD_URL);
check(
  !redacted.includes('secretProdPass123') && redacted.includes('***:***@ep-royal-smoke-b3uti4fv-pooler'),
  'VAL-REDACT-SECRETS',
  'Credentials and passwords are completely redacted from URL strings'
);

console.log('\n================================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
