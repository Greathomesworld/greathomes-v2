import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

(process.env as Record<string, string | undefined>).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';
process.env.ENABLE_SEEDING = 'false';

import { ensureSeedData } from '../src/infrastructure/seed.ts';
import { POST as postEnquiriesRoute } from '../app/api/enquiries/route.ts';
import { PATCH as patchEnquiryRequirementsRoute } from '../app/api/enquiries/[id]/requirements/route.ts';
import {
  enquiryService,
  EnquiryContinuationAuthError,
} from '../src/domain/enquiry/services/enquiryService.ts';
import { enquiryRepository } from '../src/domain/enquiry/repositories/enquiryRepository.ts';
import { siteVisitRepository } from '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts';
import { resaleListingRepository } from '../src/domain/projects/repositories/resaleRepository.ts';
import { rentalListingRepository } from '../src/domain/projects/repositories/rentalRepository.ts';
import {
  classifySiteVisitState,
  computeRequirementsCompleteness,
  MAX_ADDITIONAL_REQUIREMENTS_LENGTH,
  resolveBudgetBounds,
} from '../src/domain/enquiry/buyerRequirements.ts';
import {
  CONTINUATION_TOKEN_TTL_MS,
  MAX_CONTINUATION_ROTATIONS,
} from '../src/domain/enquiry/services/enquiryContinuationToken.ts';
import {
  enableTestMemoryRateLimit,
  resetRateLimitStoreForTesting,
} from '../src/lib/rateLimit.ts';
import { initializeTestRunnerSecret } from '../src/lib/testIsolationContext.ts';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err: any) {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${name}`);
    console.error(`    ${err?.stack || err?.message || err}`);
  }
}

function makePostRequest(body: Record<string, any>, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/enquiries', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.42',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
}

function makePatchRequest(
  enquiryId: string,
  body: Record<string, any>,
  headers?: Record<string, string>
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/enquiries/${enquiryId}/requirements`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.42',
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
}

async function run() {
  initializeTestRunnerSecret();
  enquiryRepository.enableTestMemoryPersistence(true);
  siteVisitRepository.enableTestMemoryPersistence(true);
  resaleListingRepository.enableTestMemoryPersistence(true);
  rentalListingRepository.enableTestMemoryPersistence(true);
  process.env.ENABLE_SEEDING = 'true';
  await ensureSeedData();
  process.env.ENABLE_SEEDING = 'false';
  resetRateLimitStoreForTesting();
  enableTestMemoryRateLimit(true);

  console.log('\n[A] Step 1 — Immediate Lead Capture & Validation');

  let step1EnquiryId = '';
  let step1Ref = '';
  let step1Token = '';
  const step1Key = 'gpa_test_idempotency_key_0001_alpha';

  await test('Step 1 creates lead immediately in enquiries with zero fake Step 2 defaults', async () => {
    const req = makePostRequest(
      {
        contextType: 'PROJECT',
        projectSlug: 'merlin-rise',
        sourcePage: '/projects/merlin-rise',
        ctaSource: 'GET_PRICE_AVAILABILITY',
        flowMode: 'LEAD_FIRST_PROJECT',
        name: 'Anirban Sen',
        phone: '9830011223',
        email: 'anirban.sen@example.com',
        preferredContact: 'PHONE',
        requestSiteVisit: false,
        idempotencyKey: step1Key,
        // Attempted client injection that must be stripped:
        status: 'CONVERTED',
        priority: 'URGENT',
        _continuation: { tokenHash: 'forged' },
        leadCaptureStage: 'STEP2_SUBMITTED',
      },
      { 'x-idempotency-key': step1Key }
    );

    const res = await postEnquiriesRoute(req);
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('cache-control'), 'no-store');

    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.enquiryId, 'enquiryId should be returned');
    assert.ok(data.referenceNumber, 'referenceNumber should be returned');
    assert.ok(data.continuationToken && data.continuationToken.length >= 32, 'continuationToken should be issued');
    assert.ok(data.continuationExpiresAt, 'continuationExpiresAt should be returned');
    assert.equal(data.deduplicated, false);

    step1EnquiryId = data.enquiryId;
    step1Ref = data.referenceNumber;
    step1Token = data.continuationToken;

    const stored = await enquiryService.getEnquiryById(step1EnquiryId);
    assert.ok(stored, 'Enquiry must exist in CRM immediately after Step 1');
    assert.equal(stored.status, 'NEW', 'Client-injected status must be ignored');
    assert.equal(stored.priority, 'NORMAL', 'Client-injected priority must be ignored');
    assert.equal(stored.buyerName, 'Anirban Sen');
    assert.equal(stored.buyerPhone, '+919830011223');
    assert.equal(stored.buyerEmail, 'anirban.sen@example.com');
    assert.equal(stored.requestSiteVisit, false);
    assert.equal(stored.siteVisitId ?? null, null);
    assert.equal(stored.message ?? null, null);

    // Zero fake Step 2 defaults
    assert.equal(stored.metadata?.preferredBhk, null);
    assert.equal(stored.metadata?.propertyType, null);
    assert.equal(stored.metadata?.budgetRange, null);
    assert.equal(stored.metadata?.budgetMin, null);
    assert.equal(stored.metadata?.budgetMax, null);
    assert.equal(stored.metadata?.purchaseTimeline, null);
    assert.equal(stored.metadata?.purchasePurpose, null);
    assert.equal(stored.metadata?.siteVisitInterest, false);
    assert.equal(stored.metadata?.ctaSource, 'GET_PRICE_AVAILABILITY');
    assert.equal(stored.metadata?.flowMode, 'LEAD_FIRST_PROJECT');
    assert.equal(stored.metadata?.leadCaptureStage, 'STEP1_CAPTURED');
    assert.equal(stored.metadata?.requirementsStatus, 'INCOMPLETE');

    // Internal _continuation token hash must NEVER be exposed through service reads
    assert.equal(stored.metadata?._continuation, undefined, '_continuation must be stripped from CRM reads');
    assert.equal(JSON.stringify(stored).includes('tokenHash'), false, 'tokenHash must never appear in exposed enquiry');
  });

  await test('Step 1 rejects invalid name (< 2 chars), invalid phone, and invalid email', async () => {
    const badNameRes = await postEnquiriesRoute(
      makePostRequest({
        contextType: 'PROJECT',
        projectSlug: 'merlin-rise',
        flowMode: 'LEAD_FIRST_PROJECT',
        name: 'A',
        phone: '9830011224',
      })
    );
    assert.equal(badNameRes.status, 400);

    const badPhoneRes = await postEnquiriesRoute(
      makePostRequest({
        contextType: 'PROJECT',
        projectSlug: 'merlin-rise',
        flowMode: 'LEAD_FIRST_PROJECT',
        name: 'Valid Name',
        phone: '12345',
      })
    );
    assert.equal(badPhoneRes.status, 400);

    const badEmailRes = await postEnquiriesRoute(
      makePostRequest({
        contextType: 'PROJECT',
        projectSlug: 'merlin-rise',
        flowMode: 'LEAD_FIRST_PROJECT',
        name: 'Valid Name',
        phone: '9830011225',
        email: 'not-an-email',
      })
    );
    assert.equal(badEmailRes.status, 400);
  });

  console.log('\n[B] Idempotency & Retry Continuation Token Rotation');

  let rotatedToken = '';

  await test('Duplicate Step 1 retry with same idempotencyKey reuses lead and rotates continuation token cleanly', async () => {
    const beforeCount = (await enquiryService.getEnquiries({ limit: 100 })).total;

    const retryReq = makePostRequest(
      {
        contextType: 'PROJECT',
        projectSlug: 'merlin-rise',
        sourcePage: '/projects/merlin-rise',
        ctaSource: 'GET_PRICE_AVAILABILITY',
        flowMode: 'LEAD_FIRST_PROJECT',
        name: 'Anirban Sen',
        phone: '9830011223',
        email: 'anirban.sen@example.com',
        requestSiteVisit: false,
        idempotencyKey: step1Key,
      },
      { 'x-idempotency-key': step1Key }
    );

    const retryRes = await postEnquiriesRoute(retryReq);
    assert.equal(retryRes.status, 201);
    const retryData = await retryRes.json();

    assert.equal(retryData.success, true);
    assert.equal(retryData.deduplicated, true);
    assert.equal(retryData.enquiryId, step1EnquiryId, 'Must return exact same enquiryId');
    assert.equal(retryData.referenceNumber, step1Ref);
    assert.ok(retryData.continuationToken, 'Authentic idempotent retry must issue a rotated token');
    assert.notEqual(retryData.continuationToken, step1Token, 'Rotated token must differ from lost original token');

    const afterCount = (await enquiryService.getEnquiries({ limit: 100 })).total;
    assert.equal(afterCount, beforeCount, 'No duplicate enquiry record may be created');

    rotatedToken = retryData.continuationToken;

    // Lost original token must now be invalidated!
    const oldTokenPatch = await patchEnquiryRequirementsRoute(
      makePatchRequest(step1EnquiryId, { preferredBhk: '2 BHK' }, { 'x-enquiry-token': step1Token }),
      { params: Promise.resolve({ id: step1EnquiryId }) }
    );
    assert.equal(oldTokenPatch.status, 403, 'Superseded token must be rejected after retry rotation');
  });

  await test('Bounded retry rotation stops issuing tokens after MAX_IDEMPOTENT_TOKEN_ROTATIONS', async () => {
    const boundedKey = 'gpa_bounded_rotation_key_0002_beta';
    const initRes = await postEnquiriesRoute(
      makePostRequest(
        {
          contextType: 'PROJECT',
          projectSlug: 'merlin-rise',
          flowMode: 'LEAD_FIRST_PROJECT',
          name: 'Bounded Retry User',
          phone: '9830022334',
          idempotencyKey: boundedKey,
        },
        { 'x-idempotency-key': boundedKey }
      )
    );
    assert.equal(initRes.status, 201);

    for (let i = 0; i < MAX_CONTINUATION_ROTATIONS; i++) {
      const r = await postEnquiriesRoute(
        makePostRequest(
          {
            contextType: 'PROJECT',
            projectSlug: 'merlin-rise',
            flowMode: 'LEAD_FIRST_PROJECT',
            name: 'Bounded Retry User',
            phone: '9830022334',
            idempotencyKey: boundedKey,
          },
          { 'x-idempotency-key': boundedKey }
        )
      );
      const d = await r.json();
      assert.ok(d.continuationToken, `Rotation ${i + 1} within cap should issue token`);
    }

    // One more retry exceeds rotation cap
    const cappedRes = await postEnquiriesRoute(
      makePostRequest(
        {
          contextType: 'PROJECT',
          projectSlug: 'merlin-rise',
          flowMode: 'LEAD_FIRST_PROJECT',
          name: 'Bounded Retry User',
          phone: '9830022334',
          idempotencyKey: boundedKey,
        },
        { 'x-idempotency-key': boundedKey }
      )
    );
    const cappedData = await cappedRes.json();
    assert.equal(cappedData.deduplicated, true);
    assert.equal(cappedData.continuationToken, undefined, 'Rotation cap must stop further token issuance');
  });

  console.log('\n[C] Step 2 — Buyer Requirements (Partial, Optionality, Bounds, Length, Metadata Merge)');

  await test('Partial Step 2 update uses rotated token, updates same enquiry, preserves metadata & leaves unselected null', async () => {
    const beforeCount = (await enquiryService.getEnquiries({ limit: 100 })).total;

    const patchRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(
        step1EnquiryId,
        {
          preferredBhk: '3 BHK',
          budgetRange: '75L_1CR',
          additionalRequirements: 'Looking for east-facing higher floor with car parking.\nPlease share payment plan.',
        },
        { 'x-enquiry-token': rotatedToken }
      ),
      { params: Promise.resolve({ id: step1EnquiryId }) }
    );

    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.headers.get('cache-control'), 'no-store');
    const data = await patchRes.json();
    assert.equal(data.success, true);
    assert.equal(data.enquiryId, step1EnquiryId);
    assert.equal(data.referenceNumber, step1Ref);
    assert.equal(data.requirementsStatus, 'PARTIAL');
    assert.equal(data.providedCount, 3);
    assert.equal(data.totalOptionalFields, 7);
    // Minimal non-PII response check
    assert.equal('buyerPhone' in data, false);
    assert.equal('buyerEmail' in data, false);
    assert.equal('buyerName' in data, false);

    const afterCount = (await enquiryService.getEnquiries({ limit: 100 })).total;
    assert.equal(afterCount, beforeCount, 'Step 2 PATCH must NOT create a duplicate enquiry');

    const stored = await enquiryService.getEnquiryById(step1EnquiryId);
    assert.ok(stored);
    assert.equal(stored.metadata?.preferredBhk, '3 BHK');
    assert.equal(stored.metadata?.budgetRange, '75L_1CR');
    assert.equal(stored.metadata?.budgetMin, 7_500_000);
    assert.equal(stored.metadata?.budgetMax, 10_000_000);
    // Unselected fields remain null (no invented defaults)
    assert.equal(stored.metadata?.propertyType, null);
    assert.equal(stored.metadata?.purchaseTimeline, null);
    assert.equal(stored.metadata?.purchasePurpose, null);
    assert.equal(stored.metadata?.siteVisitInterest, false);
    // Preserved Step 1 metadata keys
    assert.equal(stored.metadata?.referenceNumber, step1Ref);
    assert.equal(stored.metadata?.ctaSource, 'GET_PRICE_AVAILABILITY');
    assert.equal(stored.metadata?.flowMode, 'LEAD_FIRST_PROJECT');
    assert.equal(stored.metadata?.leadCaptureStage, 'STEP2_SUBMITTED');
    assert.equal(stored.message, 'Looking for east-facing higher floor with car parking.\nPlease share payment plan.');
  });

  await test('Open-ended and Flexible budget ranges map open bounds safely to null', () => {
    const under30 = resolveBudgetBounds('UNDER_30L');
    assert.equal(under30.budgetMin, null);
    assert.equal(under30.budgetMax, 3_000_000);

    const twoCrPlus = resolveBudgetBounds('2CR_PLUS');
    assert.equal(twoCrPlus.budgetMin, 20_000_000);
    assert.equal(twoCrPlus.budgetMax, null);

    const flexible = resolveBudgetBounds('FLEXIBLE');
    assert.equal(flexible.budgetMin, null);
    assert.equal(flexible.budgetMax, null);
    assert.equal(flexible.budgetRange, 'FLEXIBLE');
  });

  await test('Step 2 rejects additionalRequirements > 1500 chars and invalid enum options', async () => {
    const overLimit = 'x'.repeat(MAX_ADDITIONAL_REQUIREMENTS_LENGTH + 1);
    const longRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(step1EnquiryId, { additionalRequirements: overLimit }, { 'x-enquiry-token': rotatedToken }),
      { params: Promise.resolve({ id: step1EnquiryId }) }
    );
    assert.equal(longRes.status, 400);

    const badBhkRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(step1EnquiryId, { preferredBhk: '99 BHK' }, { 'x-enquiry-token': rotatedToken }),
      { params: Promise.resolve({ id: step1EnquiryId }) }
    );
    assert.equal(badBhkRes.status, 400);

    const badBudgetRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(step1EnquiryId, { budgetRange: 'FREE_HOUSE' }, { 'x-enquiry-token': rotatedToken }),
      { params: Promise.resolve({ id: step1EnquiryId }) }
    );
    assert.equal(badBudgetRes.status, 400);
  });

  await test('Skipping Step 2 succeeds cleanly and marks enquiry STEP2_SKIPPED with zero fake defaults', async () => {
    const skipKey = 'gpa_skip_flow_key_0003_gamma';
    const s1Res = await postEnquiriesRoute(
      makePostRequest(
        {
          contextType: 'PROJECT',
          projectSlug: 'merlin-rise',
          flowMode: 'LEAD_FIRST_PROJECT',
          ctaSource: 'GET_PRICE_AVAILABILITY',
          name: 'Priya Chatterjee',
          phone: '9830033445',
          idempotencyKey: skipKey,
        },
        { 'x-idempotency-key': skipKey }
      )
    );
    assert.equal(s1Res.status, 201);
    const s1 = await s1Res.json();

    const skipRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(s1.enquiryId, { skipped: true }, { 'x-enquiry-token': s1.continuationToken }),
      { params: Promise.resolve({ id: s1.enquiryId }) }
    );
    assert.equal(skipRes.status, 200);
    const skipData = await skipRes.json();
    assert.equal(skipData.requirementsStatus, 'SKIPPED');
    assert.equal(skipData.providedCount, 0);

    const stored = await enquiryService.getEnquiryById(s1.enquiryId);
    assert.ok(stored);
    const summary = computeRequirementsCompleteness(stored);
    assert.equal(summary.captureStage, 'STEP2_SKIPPED');
    assert.equal(summary.requirementsStatus, 'SKIPPED');
    assert.equal(summary.providedCount, 0);
  });

  console.log('\n[D] Abandonment After Step 1');

  let abandonedEnquiryId = '';
  let abandonedToken = '';

  await test('Lead abandoned after Step 1 remains captured in CRM as STEP1_CAPTURED / INCOMPLETE', async () => {
    const abandonKey = 'gpa_abandon_key_0004_delta';
    const res = await postEnquiriesRoute(
      makePostRequest(
        {
          contextType: 'PROJECT',
          projectSlug: 'merlin-rise',
          flowMode: 'LEAD_FIRST_PROJECT',
          ctaSource: 'GET_PRICE_AVAILABILITY',
          name: 'Subhajit Das',
          phone: '9830044556',
          idempotencyKey: abandonKey,
        },
        { 'x-idempotency-key': abandonKey }
      )
    );
    assert.equal(res.status, 201);
    const data = await res.json();
    abandonedEnquiryId = data.enquiryId;
    abandonedToken = data.continuationToken;

    // Simulate user closing modal without calling Step 2
    const stored = await enquiryService.getEnquiryById(abandonedEnquiryId);
    assert.ok(stored);
    assert.equal(stored.status, 'NEW');
    const summary = computeRequirementsCompleteness(stored);
    assert.equal(summary.captureStage, 'STEP1_CAPTURED');
    assert.equal(summary.requirementsStatus, 'INCOMPLETE');
    assert.equal(summary.providedCount, 0);
  });

  console.log('\n[E] Security, IDOR, Expiry, State Lock, Forbidden Fields & Rate Limiting');

  await test('Missing, wrong, cross-enquiry, and non-existent-ID tokens are uniformly rejected with 403', async () => {
    // Missing token
    const missingRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(abandonedEnquiryId, { preferredBhk: '2 BHK' }),
      { params: Promise.resolve({ id: abandonedEnquiryId }) }
    );
    assert.equal(missingRes.status, 403);

    // Wrong token
    const wrongRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(abandonedEnquiryId, { preferredBhk: '2 BHK' }, { 'x-enquiry-token': 'totally-wrong-token-value-123456' }),
      { params: Promise.resolve({ id: abandonedEnquiryId }) }
    );
    assert.equal(wrongRes.status, 403);

    // Cross-enquiry token (Enquiry A's valid rotatedToken used against Enquiry B)
    const crossRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(abandonedEnquiryId, { preferredBhk: '2 BHK' }, { 'x-enquiry-token': rotatedToken }),
      { params: Promise.resolve({ id: abandonedEnquiryId }) }
    );
    assert.equal(crossRes.status, 403);

    // Non-existent enquiry ID
    const ghostRes = await patchEnquiryRequirementsRoute(
      makePatchRequest('non-existent-enquiry-id-999', { preferredBhk: '2 BHK' }, { 'x-enquiry-token': abandonedToken }),
      { params: Promise.resolve({ id: 'non-existent-enquiry-id-999' }) }
    );
    assert.equal(ghostRes.status, 403);
  });

  await test('Forbidden fields (status, buyerPhone, internalNotes, metadata, _continuation) are rejected with 400', async () => {
    const forbiddenPayloads: Record<string, any>[] = [
      { status: 'CONVERTED' },
      { buyerPhone: '+919999999999' },
      { buyerName: 'Attacker' },
      { internalNotes: 'Hacked note' },
      { assignedTo: 'sales-agent-1' },
      { metadata: { hacked: true } },
      { _continuation: { tokenHash: 'abc' } },
      { priority: 'URGENT' },
      { preferredDate: '2026-12-01' },
    ];

    for (const payload of forbiddenPayloads) {
      const res = await patchEnquiryRequirementsRoute(
        makePatchRequest(abandonedEnquiryId, payload, { 'x-enquiry-token': abandonedToken }),
        { params: Promise.resolve({ id: abandonedEnquiryId }) }
      );
      assert.equal(res.status, 400, `Forbidden payload ${JSON.stringify(payload)} must return 400`);
      const body = await res.json();
      assert.equal(body.code, 'FORBIDDEN_FIELDS');
    }
  });

  await test('Expired continuation token (> 30 min) is rejected with 401', async () => {
    const futureMs = Date.now() + CONTINUATION_TOKEN_TTL_MS + 60_000;
    let caught: any = null;
    try {
      await enquiryService.updateBuyerRequirements(
        abandonedEnquiryId,
        abandonedToken,
        { preferredBhk: '2 BHK' },
        { nowMs: futureMs }
      );
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof EnquiryContinuationAuthError);
    assert.equal(caught.statusCode, 401);
    assert.equal(caught.code, 'CONTINUATION_TOKEN_EXPIRED');
  });

  await test('Enquiry locked after staff transitions status from NEW to CONTACTED (409)', async () => {
    await enquiryService.updateEnquiry(abandonedEnquiryId, { status: 'CONTACTED' });

    const lockedRes = await patchEnquiryRequirementsRoute(
      makePatchRequest(abandonedEnquiryId, { preferredBhk: '4 BHK' }, { 'x-enquiry-token': abandonedToken }),
      { params: Promise.resolve({ id: abandonedEnquiryId }) }
    );
    assert.equal(lockedRes.status, 409);
    const body = await lockedRes.json();
    assert.equal(body.code, 'ENQUIRY_STATE_LOCKED');
  });

  await test('Per-target-enquiry rate limiting triggers 429 on brute-force attempts', async () => {
    resetRateLimitStoreForTesting();
    enableTestMemoryRateLimit(true);
    const targetId = 'rate-limit-target-check-001';
    let hit429 = false;
    for (let i = 0; i < 25; i++) {
      const res = await patchEnquiryRequirementsRoute(
        makePatchRequest(targetId, { preferredBhk: '2 BHK' }, { 'x-enquiry-token': 'invalid-guess' }),
        { params: Promise.resolve({ id: targetId }) }
      );
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert.equal(hit429, true, 'Per-enquiry target rate limiter must return 429 after 20 requests/min');
    resetRateLimitStoreForTesting();
    enableTestMemoryRateLimit(true);
  });

  console.log('\n[F] Site Visit Interest vs Actual Scheduled Visit Correction & Metrics');

  await test('Site visit interest in Step 2 does NOT schedule a visit, create site_visits row, or inflate siteVisitsCount', async () => {
    const metricsBefore = await enquiryService.getMetrics();
    const visitsBefore = (await siteVisitRepository.list()).length;

    const visitInterestKey = 'gpa_visit_interest_key_0005_eps';
    const s1Res = await postEnquiriesRoute(
      makePostRequest(
        {
          contextType: 'PROJECT',
          projectSlug: 'merlin-rise',
          flowMode: 'LEAD_FIRST_PROJECT',
          ctaSource: 'GET_PRICE_AVAILABILITY',
          name: 'Debashish Ghosh',
          phone: '9830055667',
          idempotencyKey: visitInterestKey,
        },
        { 'x-idempotency-key': visitInterestKey }
      )
    );
    assert.equal(s1Res.status, 201);
    const s1 = await s1Res.json();

    const s2Res = await patchEnquiryRequirementsRoute(
      makePatchRequest(
        s1.enquiryId,
        {
          preferredBhk: '4 BHK',
          propertyType: 'PENTHOUSE',
          budgetRange: '2CR_PLUS',
          purchaseTimeline: 'IMMEDIATE',
          purchasePurpose: 'SELF_USE',
          siteVisitInterest: true,
          additionalRequirements: 'Interested in top floor penthouse with terrace.',
        },
        { 'x-enquiry-token': s1.continuationToken }
      ),
      { params: Promise.resolve({ id: s1.enquiryId }) }
    );
    assert.equal(s2Res.status, 200);
    const s2 = await s2Res.json();
    assert.equal(s2.requirementsStatus, 'COMPLETE');
    assert.equal(s2.providedCount, 7);

    const stored = await enquiryService.getEnquiryById(s1.enquiryId);
    assert.ok(stored);
    assert.equal(stored.status, 'NEW', 'Site visit interest must keep status NEW, NOT SITE_VISIT_SCHEDULED');
    assert.equal(stored.requestSiteVisit, true);
    assert.equal(stored.metadata?.siteVisitInterest, true);
    assert.equal(stored.siteVisitId ?? null, null, 'No site_visits record may be linked for interest alone');

    const visitState = classifySiteVisitState(stored);
    assert.equal(visitState.state, 'INTEREST_EXPRESSED');

    const visitsAfter = (await siteVisitRepository.list()).length;
    assert.equal(visitsAfter, visitsBefore, 'No row may be created in site_visits table for interest alone');

    const metricsAfter = await enquiryService.getMetrics();
    assert.equal(
      metricsAfter.siteVisitsCount,
      metricsBefore.siteVisitsCount,
      'siteVisitsCount must NOT increment for interest-only enquiries'
    );
    assert.equal(
      metricsAfter.siteVisitInterestCount,
      (metricsBefore.siteVisitInterestCount || 0) + 1,
      'siteVisitInterestCount must track interest-only enquiries separately'
    );
  });

  await test('Standard scheduled site visit (date + time window) DOES create site_visits row and increments siteVisitsCount', async () => {
    const metricsBefore = await enquiryService.getMetrics();
    const visitsBefore = (await siteVisitRepository.list()).length;

    const scheduledKey = 'std_scheduled_visit_key_0006_zeta';
    const res = await postEnquiriesRoute(
      makePostRequest(
        {
          contextType: 'PROJECT',
          projectSlug: 'merlin-rise',
          name: 'Rituparna Banerjee',
          phone: '9830066778',
          requestSiteVisit: true,
          preferredDate: '2026-12-15',
          preferredTimeWindow: '12:00–15:00',
          visitType: 'IN_PERSON',
          idempotencyKey: scheduledKey,
        },
        { 'x-idempotency-key': scheduledKey }
      )
    );
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.siteVisitId, 'Scheduled visit must create a site_visits record');

    const stored = await enquiryService.getEnquiryById(data.enquiryId);
    assert.ok(stored);
    assert.equal(stored.status, 'SITE_VISIT_SCHEDULED');
    assert.equal(classifySiteVisitState(stored).state, 'VISIT_SCHEDULED');

    const visitsAfter = (await siteVisitRepository.list()).length;
    assert.equal(visitsAfter, visitsBefore + 1);

    const metricsAfter = await enquiryService.getMetrics();
    assert.equal(metricsAfter.siteVisitsCount, metricsBefore.siteVisitsCount + 1);
  });

  console.log('\n[G] Scoped CTA Regression & Isolation Verification');

  await test('Only project Get Price & Availability CTAs opt into LEAD_FIRST_PROJECT; Visit/Resale/Rental remain unchanged', () => {
    const advisoryCard = fs.readFileSync(
      path.join(process.cwd(), 'src/components/projects/GreatHomesAdvisoryCard.tsx'),
      'utf8'
    );
    const mobileSticky = fs.readFileSync(
      path.join(process.cwd(), 'src/components/projects/MobileStickyCta.tsx'),
      'utf8'
    );
    const dialog = fs.readFileSync(
      path.join(process.cwd(), 'src/components/enquiry/GreatHomesEnquiryDialog.tsx'),
      'utf8'
    );

    assert.ok(
      advisoryCard.includes('const isLeadFirstProjectCta = isProjectMode && !requestVisit;'),
      'GreatHomesAdvisoryCard must scope LEAD_FIRST_PROJECT strictly to isProjectMode && !requestVisit'
    );
    assert.ok(
      mobileSticky.includes("flowMode: 'LEAD_FIRST_PROJECT'") && mobileSticky.includes('!requestVisit'),
      'MobileStickyCta must scope LEAD_FIRST_PROJECT strictly to !requestVisit'
    );
    assert.ok(
      dialog.includes("contextData.flowMode === 'LEAD_FIRST_PROJECT'") &&
        dialog.includes('contextData?.requestSiteVisit ?? true'),
      'GreatHomesEnquiryDialog must route LEAD_FIRST_PROJECT cleanly while preserving legacy dialog defaults'
    );
  });

  console.log(`\nSummary: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Unhandled test runner error:', err);
  process.exit(1);
});
