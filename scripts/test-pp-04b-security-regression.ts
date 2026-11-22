import assert from 'node:assert/strict';
import {
  PropertySubmissionRepository,
  PropertySubmissionPersistenceError,
  isPersistenceUnavailableError,
} from '../src/domain/propertySubmission/repository.ts';
import { PropertySubmissionService } from '../src/domain/propertySubmission/service.ts';
import {
  validateSubmissionForSubmit,
  validateWizardStep,
  updateSubmissionSchema,
  CANONICAL_OWNER_DECLARATION_TEXT,
  CANONICAL_PARTNER_ATTESTATION_TEXT,
  CANONICAL_OWNER_DECLARATION_VERSION,
  CANONICAL_PARTNER_ATTESTATION_VERSION,
} from '../src/domain/propertySubmission/validation.ts';

function makePhotos(count: number) {
  return Array.from({ length: count }, (_, idx) => ({
    id: `photo_${idx + 1}`,
    url: `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_${idx + 1}/public_wm.webp`,
    category: 'Living Room',
    caption: `Photo ${idx + 1}`,
    sortOrder: idx,
    isFeatured: idx === 0,
  }));
}

async function runSecurityRegressionSuite() {
  console.log('=== STARTING PP-04B SECURITY, PERSISTENCE & BUILD REMEDIATION TESTS ===\n');

  const envRef = process.env as Record<string, string | undefined>;
  const savedNodeEnv = envRef.NODE_ENV;
  const savedVercelEnv = envRef.VERCEL_ENV;
  const savedPersistenceProvider = envRef.PERSISTENCE_PROVIDER;
  const savedDatabaseUrl = envRef.DATABASE_URL;

  try {
    // =========================================================================
    // 1. PERSISTENCE SECURITY MATRIX (PP04B-F01)
    // =========================================================================
    console.log('1. Testing PP04B-F01 Persistence Security Matrix...');

    // 1a. Missing DATABASE_URL with default repository (even in NODE_ENV=test without explicit test memory activation) fails closed
    envRef.NODE_ENV = 'test';
    delete envRef.VERCEL_ENV;
    delete envRef.DATABASE_URL;
    delete envRef.PERSISTENCE_PROVIDER;

    const defaultRepoWithoutTestOptIn = new PropertySubmissionRepository({
      dbResolver: () => null,
    });
    const defaultServiceWithoutOptIn = new PropertySubmissionService(defaultRepoWithoutTestOptIn);

    await assert.rejects(
      async () => {
        await defaultServiceWithoutOptIn.createDraft('cust_no_optin', {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: { propertyType: 'APARTMENT' },
        });
      },
      (err: unknown) => {
        assert.equal(isPersistenceUnavailableError(err), true);
        assert.equal((err as PropertySubmissionPersistenceError).statusCode, 503);
        return true;
      }
    );
    console.log('  ✓ Missing DATABASE_URL without explicit test-memory activation fails closed (503).');

    // 1b. Preview environment (VERCEL_ENV=preview) fails closed and blocks memory persistence even if NODE_ENV=test
    envRef.NODE_ENV = 'test';
    envRef.VERCEL_ENV = 'preview';
    const previewRepo = new PropertySubmissionRepository({
      allowTestMemoryPersistence: true,
      dbResolver: () => null,
    });
    const previewService = new PropertySubmissionService(previewRepo);

    await assert.rejects(
      async () => {
        await previewService.createDraft('cust_preview', {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: { propertyType: 'APARTMENT' },
        });
      },
      (err: unknown) => {
        assert.equal(isPersistenceUnavailableError(err), true);
        assert.equal((err as PropertySubmissionPersistenceError).statusCode, 503);
        return true;
      }
    );
    console.log('  ✓ Preview environment (VERCEL_ENV=preview) fails closed (503) and blocks memory fallback.');

    // 1c. Production environment (NODE_ENV=production) fails closed and blocks test memory construction
    envRef.NODE_ENV = 'production';
    delete envRef.VERCEL_ENV;

    assert.throws(
      () => {
        PropertySubmissionRepository.createForTesting();
      },
      (err: unknown) => {
        assert.equal(isPersistenceUnavailableError(err), true);
        assert.equal((err as PropertySubmissionPersistenceError).statusCode, 503);
        return true;
      }
    );

    const prodRepo = new PropertySubmissionRepository({
      allowTestMemoryPersistence: true,
      dbResolver: () => null,
    });
    const prodService = new PropertySubmissionService(prodRepo);

    await assert.rejects(
      async () => {
        await prodService.createDraft('cust_prod', {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: { propertyType: 'APARTMENT' },
        });
      },
      (err: unknown) => {
        assert.equal(isPersistenceUnavailableError(err), true);
        assert.equal((err as PropertySubmissionPersistenceError).statusCode, 503);
        return true;
      }
    );
    console.log('  ✓ Production environment (NODE_ENV=production) fails closed (503) and blocks memory fallback.');

    // 1d. Database connection / query error does NOT fall back to memory and does NOT leak credentials or SQL
    envRef.NODE_ENV = 'test';
    delete envRef.VERCEL_ENV;
    const failingDbRepo = new PropertySubmissionRepository({
      allowTestMemoryPersistence: true,
      dbResolver: () => {
        throw new Error(
          'FATAL: connection to postgres://secret_user:super_secret_pw@ep-neon.aws.neon.tech/neondb failed: SELECT * FROM property_submissions'
        );
      },
    });
    const failingDbService = new PropertySubmissionService(failingDbRepo);

    await assert.rejects(
      async () => {
        await failingDbService.getCustomerSubmissions('cust_db_err');
      },
      (err: unknown) => {
        assert.equal(isPersistenceUnavailableError(err), true);
        const msg = (err as Error).message;
        assert.equal(msg.includes('super_secret_pw'), false);
        assert.equal(msg.includes('SELECT * FROM'), false);
        return true;
      }
    );
    console.log('  ✓ Database connection/query errors fail closed (503) without falling back to memory or leaking credentials/SQL.');

    // 1e. Explicit Test environment (NODE_ENV=test + createForTesting) works in isolated memory
    envRef.NODE_ENV = 'test';
    delete envRef.VERCEL_ENV;
    const testRepo = PropertySubmissionRepository.createForTesting({
      dbResolver: () => null,
    });
    testRepo.clearMemoryForTesting();
    const testService = new PropertySubmissionService(testRepo);

    const testDraft = await testService.createDraft('cust_test_mem_1', {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: { propertyType: 'APARTMENT' },
    });
    assert.equal(testDraft.submissionStatus, 'DRAFT');
    console.log('  ✓ Isolated test environment (NODE_ENV=test + explicit test repository) memory persistence verified.\n');

    // =========================================================================
    // 2. CANONICAL SERVER-SIDE LEGAL DECLARATIONS (PP04B-F04)
    // =========================================================================
    console.log('2. Testing PP04B-F04 Canonical Server-Side Legal Declarations...');

    // 2a. Client-supplied declarationText and attestationVersion are ignored/overwritten with server canonical values
    const tamperedOwnerDraft = await testService.createDraft('cust_owner_tamper', {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: { propertyType: 'APARTMENT' },
    });

    const submittedOwner = await testService.submitForReview(
      tamperedOwnerDraft.id,
      'cust_owner_tamper',
      {
        listingType: 'RESALE',
        listingSource: 'OWNER',
        propertyType: 'APARTMENT',
        location: {
          city: 'Kolkata',
          locality: 'Ballygunge',
          address: '14 Dover Road, Kolkata 700019',
        },
        details: {
          bedroomCount: 3,
          bathroomCount: 2,
          carpetArea: 1400,
          askingPrice: 17500000,
        },
        photos: makePhotos(3),
        consent: {
          ownerDeclarationAccepted: true,
          declarationText: 'HACKED CLIENT DECLARATION: I accept zero liability.',
          attestationVersion: 'v999-tampered',
        },
      }
    );

    const storedOwnerPayload = submittedOwner.payload as {
      consent: {
        ownerDeclarationAccepted: boolean;
        partnerAttestationAccepted: boolean;
        declarationText: string;
        attestationVersion: string;
        acceptedByCustomerId: string;
        acceptedAt: string;
      };
    };
    assert.equal(storedOwnerPayload.consent.declarationText, CANONICAL_OWNER_DECLARATION_TEXT);
    assert.equal(storedOwnerPayload.consent.attestationVersion, CANONICAL_OWNER_DECLARATION_VERSION);
    assert.equal(storedOwnerPayload.consent.ownerDeclarationAccepted, true);
    assert.equal(storedOwnerPayload.consent.partnerAttestationAccepted, false);
    assert.equal(storedOwnerPayload.consent.acceptedByCustomerId, 'cust_owner_tamper');
    assert.ok(storedOwnerPayload.consent.acceptedAt);
    console.log('  ✓ Client-supplied owner declarationText and attestationVersion overwritten with server canonical text & version.');

    // 2b. Partner consent tampering test + partner_attestations table record check
    await testRepo.setMemoryPartnerProfileForTesting('cust_partner_tamper', 'ACTIVE');
    const tamperedPartnerDraft = await testService.createDraft('cust_partner_tamper', {
      listingType: 'RENTAL',
      listingSource: 'PARTNER',
      payload: { propertyType: 'APARTMENT' },
    });

    const submittedPartner = await testService.submitForReview(
      tamperedPartnerDraft.id,
      'cust_partner_tamper',
      {
        listingType: 'RENTAL',
        listingSource: 'PARTNER',
        propertyType: 'APARTMENT',
        location: {
          city: 'Kolkata',
          locality: 'New Town',
          address: 'Action Area I, New Town, Kolkata 700156',
        },
        details: {
          bedroomCount: 2,
          bathroomCount: 2,
          carpetArea: 980,
          monthlyRent: 32000,
        },
        photos: makePhotos(3),
        consent: {
          partnerAttestationAccepted: true,
          declarationText: 'CLIENT SUPPLIED PARTNER TEXT',
          attestationVersion: 'custom-v0',
        },
      }
    );

    const storedPartnerPayload = submittedPartner.payload as {
      consent: {
        ownerDeclarationAccepted: boolean;
        partnerAttestationAccepted: boolean;
        declarationText: string;
        attestationVersion: string;
        acceptedByCustomerId: string;
        acceptedAt: string;
      };
    };
    assert.equal(storedPartnerPayload.consent.declarationText, CANONICAL_PARTNER_ATTESTATION_TEXT);
    assert.equal(storedPartnerPayload.consent.attestationVersion, CANONICAL_PARTNER_ATTESTATION_VERSION);
    assert.equal(storedPartnerPayload.consent.partnerAttestationAccepted, true);
    assert.equal(storedPartnerPayload.consent.ownerDeclarationAccepted, false);
    assert.equal(storedPartnerPayload.consent.acceptedByCustomerId, 'cust_partner_tamper');

    const partnerAttestationsList = testRepo.getAttestationsForTesting(tamperedPartnerDraft.id);
    assert.equal(partnerAttestationsList.length, 1);
    assert.equal(partnerAttestationsList[0].declarationText, CANONICAL_PARTNER_ATTESTATION_TEXT);
    assert.equal(partnerAttestationsList[0].attestationVersion, CANONICAL_PARTNER_ATTESTATION_VERSION);
    assert.equal(partnerAttestationsList[0].partnerCustomerId, 'cust_partner_tamper');
    console.log('  ✓ Client-supplied partner attestationText and version overwritten with server canonical text & version.');

    // 2c. Owner and Partner declarations cannot be interchanged
    const ownerWithPartnerConsentOnly = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Alipore', address: '1 Alipore Road' },
      details: { bedroomCount: 3, carpetArea: 1600, askingPrice: 25000000 },
      photos: makePhotos(3),
      consent: {
        ownerDeclarationAccepted: false,
        partnerAttestationAccepted: true,
      },
    });
    assert.equal(ownerWithPartnerConsentOnly.success, false);

    const partnerWithOwnerConsentOnly = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'PARTNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Alipore', address: '1 Alipore Road' },
      details: { bedroomCount: 3, carpetArea: 1600, askingPrice: 25000000 },
      photos: makePhotos(3),
      consent: {
        ownerDeclarationAccepted: true,
        partnerAttestationAccepted: false,
      },
    });
    assert.equal(partnerWithOwnerConsentOnly.success, false);
    console.log('  ✓ Owner and Partner declarations cannot be interchanged.\n');

    // =========================================================================
    // 3. ATOMIC SUBMISSION STATUS TRANSITIONS & CONCURRENCY (PP04B-F05)
    // =========================================================================
    console.log('3. Testing PP04B-F05 Atomic Status Transitions & Concurrency...');

    // 3a. Concurrent duplicate submission requests do not create duplicate review or attestation records
    await testRepo.setMemoryPartnerProfileForTesting('cust_partner_concurrent', 'ACTIVE');
    const concurrentDraft = await testService.createDraft('cust_partner_concurrent', {
      listingType: 'RESALE',
      listingSource: 'PARTNER',
      payload: { propertyType: 'APARTMENT' },
    });

    const validPartnerPayload = {
      listingType: 'RESALE',
      listingSource: 'PARTNER',
      propertyType: 'APARTMENT',
      location: {
        city: 'Kolkata',
        locality: 'Salt Lake',
        address: 'Sector V, Salt Lake, Kolkata',
      },
      details: {
        bedroomCount: 3,
        bathroomCount: 3,
        carpetArea: 1550,
        askingPrice: 16500000,
      },
      photos: makePhotos(3),
      consent: {
        partnerAttestationAccepted: true,
      },
    };

    const concurrentResults = await Promise.allSettled([
      testService.submitForReview(concurrentDraft.id, 'cust_partner_concurrent', validPartnerPayload),
      testService.submitForReview(concurrentDraft.id, 'cust_partner_concurrent', validPartnerPayload),
    ]);

    const fulfilledCount = concurrentResults.filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = concurrentResults.filter((r) => r.status === 'rejected').length;
    assert.equal(fulfilledCount, 1, 'Exactly one concurrent submission should succeed');
    assert.equal(rejectedCount, 1, 'The duplicate concurrent submission must be rejected');

    const reviewsAfterConcurrent = testRepo.getReviewsForTesting(concurrentDraft.id);
    const attestationsAfterConcurrent = testRepo.getAttestationsForTesting(concurrentDraft.id);
    assert.equal(reviewsAfterConcurrent.length, 1, 'Must create exactly 1 review record');
    assert.equal(attestationsAfterConcurrent.length, 1, 'Must create exactly 1 partner attestation record');
    console.log('  ✓ Concurrent duplicate submission requests prevented from creating duplicate review or attestation records.');

    // 3b. SUBMITTED cannot be submitted again
    await assert.rejects(
      async () => {
        await testService.submitForReview(
          concurrentDraft.id,
          'cust_partner_concurrent',
          validPartnerPayload
        );
      },
      (err: unknown) => (err as Error).message.includes('Cannot submit property from status SUBMITTED')
    );
    console.log('  ✓ Repeated submission after SUBMITTED is safely rejected.');

    // 3c. CHANGES_REQUESTED can be resubmitted
    testRepo.setSubmissionStatusForTesting(concurrentDraft.id, 'CHANGES_REQUESTED');
    const resubmittedRecord = await testService.submitForReview(
      concurrentDraft.id,
      'cust_partner_concurrent',
      validPartnerPayload
    );
    assert.equal(resubmittedRecord.submissionStatus, 'SUBMITTED');
    const reviewsAfterResubmit = testRepo.getReviewsForTesting(concurrentDraft.id);
    assert.equal(reviewsAfterResubmit.length, 2);
    assert.equal(reviewsAfterResubmit[1].previousStatus, 'CHANGES_REQUESTED');
    assert.equal(reviewsAfterResubmit[1].newStatus, 'SUBMITTED');
    console.log('  ✓ CHANGES_REQUESTED status can be resubmitted atomically to SUBMITTED.');

    // 3d. Unauthorized customer cannot submit another customer's listing
    const ownerDraftForAuthTest = await testService.createDraft('cust_legit_owner', {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: { propertyType: 'PLOT' },
    });
    await assert.rejects(
      async () => {
        await testService.submitForReview(ownerDraftForAuthTest.id, 'cust_attacker', {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          propertyType: 'PLOT',
          location: { city: 'Kolkata', locality: 'Rajarhat', address: 'Main Road' },
          details: { plotArea: 2160, askingPrice: 6500000 },
          photos: makePhotos(3),
          consent: { ownerDeclarationAccepted: true },
        });
      },
      (err: unknown) => (err as Error).message.includes('not found or unauthorized')
    );
    console.log('  ✓ Unauthorized customer blocked from submitting another customer listing.');

    // 3e. Withdrawal follows permitted transitions (DRAFT / SUBMITTED / CHANGES_REQUESTED -> WITHDRAWN; APPROVED/REJECTED/WITHDRAWN rejected)
    testRepo.setSubmissionStatusForTesting(ownerDraftForAuthTest.id, 'APPROVED');
    await assert.rejects(
      async () => {
        await testService.withdraw(ownerDraftForAuthTest.id, 'cust_legit_owner');
      },
      (err: unknown) => (err as Error).message.includes('Cannot withdraw submission in status APPROVED')
    );

    const withdrawnRecord = await testService.withdraw(
      concurrentDraft.id,
      'cust_partner_concurrent'
    );
    assert.equal(withdrawnRecord.submissionStatus, 'WITHDRAWN');
    assert.ok(withdrawnRecord.withdrawnAt);

    await assert.rejects(
      async () => {
        await testService.withdraw(concurrentDraft.id, 'cust_partner_concurrent');
      },
      (err: unknown) => (err as Error).message.includes('Cannot withdraw submission in status WITHDRAWN')
    );
    console.log('  ✓ Withdrawal transition rules enforced atomically.\n');

    // =========================================================================
    // 4. SERVER-SIDE PHOTO COUNT & MEDIA VALIDATION
    // =========================================================================
    console.log('4. Testing Server-Side Photo Count (Min 3, Max 15) & Media Validation...');

    // 4a. Incomplete draft with < 3 photos CAN be saved as draft, but FAILS final submission
    const draftWithTwoPhotos = updateSubmissionSchema.safeParse({
      payload: {
        photos: makePhotos(2),
      },
    });
    assert.equal(draftWithTwoPhotos.success, true, 'Draft save with 2 photos must be allowed');

    const submitWithTwoPhotos = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Ballygunge', address: '12 Park St' },
      details: { bedroomCount: 3, carpetArea: 1400, askingPrice: 18000000 },
      photos: makePhotos(2),
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitWithTwoPhotos.success, false, '2 photos must fail final submission');

    // 4b. 3 photos pass final submission
    const submitWithThreePhotos = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Ballygunge', address: '12 Park St' },
      details: { bedroomCount: 3, carpetArea: 1400, askingPrice: 18000000 },
      photos: makePhotos(3),
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitWithThreePhotos.success, true, '3 photos must pass final submission');

    // 4c. 15 photos pass both Step 4 and final submission
    const step4WithFifteenPhotos = validateWizardStep(4, { photos: makePhotos(15) });
    assert.equal(step4WithFifteenPhotos.valid, true, '15 photos must pass Step 4 validation');

    const submitWithFifteenPhotos = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Ballygunge', address: '12 Park St' },
      details: { bedroomCount: 3, carpetArea: 1400, askingPrice: 18000000 },
      photos: makePhotos(15),
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitWithFifteenPhotos.success, true, '15 photos must pass final submission');

    // 4d. 16 photos fail draft update, Step 4 validation, and final submission
    const draftWithSixteenPhotos = updateSubmissionSchema.safeParse({
      payload: {
        photos: makePhotos(16),
      },
    });
    assert.equal(draftWithSixteenPhotos.success, false, '16 photos must be rejected on draft update');

    const step4WithSixteenPhotos = validateWizardStep(4, { photos: makePhotos(16) });
    assert.equal(step4WithSixteenPhotos.valid, false, '16 photos must fail Step 4 validation');

    const submitWithSixteenPhotos = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Ballygunge', address: '12 Park St' },
      details: { bedroomCount: 3, carpetArea: 1400, askingPrice: 18000000 },
      photos: makePhotos(16),
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitWithSixteenPhotos.success, false, '16 photos must fail final submission');

    // 4e. Videos and documents are rejected
    const submitWithVideo = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Ballygunge', address: '12 Park St' },
      details: { bedroomCount: 3, carpetArea: 1400, askingPrice: 18000000 },
      photos: [
        ...makePhotos(2),
        { id: 'v1', url: 'https://cdn.example.com/video.mp4', category: 'Living Room' },
      ],
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitWithVideo.success, false, 'Video URL must be rejected');

    const submitWithPdf = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: { city: 'Kolkata', locality: 'Ballygunge', address: '12 Park St' },
      details: { bedroomCount: 3, carpetArea: 1400, askingPrice: 18000000 },
      photos: [
        ...makePhotos(2),
        { id: 'd1', url: 'https://cdn.example.com/floorplan.pdf', category: 'Living Room' },
      ],
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitWithPdf.success, false, 'PDF document URL must be rejected');
    console.log('  ✓ Photo count bounds (2 fail, 3 pass, 15 pass, 16 fail, draft <3 allowed) and media restrictions verified.\n');

    console.log('=== ALL PP-04B SECURITY REGRESSION TESTS PASSED ===');
  } finally {
    envRef.NODE_ENV = savedNodeEnv;
    envRef.VERCEL_ENV = savedVercelEnv;
    envRef.PERSISTENCE_PROVIDER = savedPersistenceProvider;
    envRef.DATABASE_URL = savedDatabaseUrl;
  }
}

runSecurityRegressionSuite().catch((err) => {
  console.error('PP-04B Security Regression Suite Failed:', err);
  process.exit(1);
});
