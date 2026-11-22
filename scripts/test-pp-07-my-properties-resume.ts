import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import {
  PropertySubmissionRepository,
  PropertySubmissionPersistenceError,
} from '../src/domain/propertySubmission/repository.ts';
import {
  PropertySubmissionService,
  SubmissionReferenceLookup,
} from '../src/domain/propertySubmission/service.ts';
import { SubmissionMediaService } from '../src/domain/propertySubmission/mediaService.ts';
import {
  handleListCustomerSubmissions,
  handleGetCustomerSubmissionDetail,
  handleWithdrawCustomerSubmission,
} from '../src/domain/propertySubmission/customerSubmissionRouteHandlers.ts';
import {
  handlePostSubmissionMedia,
  handlePatchSubmissionMediaCollection,
  handlePatchSubmissionMediaItem,
  handleDeleteSubmissionMediaItem,
} from '../src/domain/propertySubmission/mediaRouteHandlers.ts';
import { CANONICAL_RESIDENTIAL_AMENITIES } from '../src/domain/propertySubmission/validation.ts';

(process.env as any).NODE_ENV = 'test';
process.env.MEDIA_TEST_ISOLATED = 'true';

const PROJ_NT_URBANA_ID = '11111111-1111-4111-8111-111111111111';
const PROJ_ALIPORE_CREST_ID = '22222222-2222-4222-8222-222222222222';

const mockLookup: SubmissionReferenceLookup = {
  async findLocationById(id: string) {
    const map: Record<string, { id: string; name: string; parentId: string | null }> = {
      loc_new_town: { id: 'loc_new_town', name: 'New Town', parentId: null },
      loc_alipore: { id: 'loc_alipore', name: 'Alipore', parentId: null },
      loc_rajarhat: { id: 'loc_rajarhat', name: 'Rajarhat', parentId: null },
    };
    return map[id] || null;
  },
  async findProjectById(id: string) {
    const map: Record<string, { id: string; locationId: string; name: string }> = {
      [PROJ_NT_URBANA_ID]: {
        id: PROJ_NT_URBANA_ID,
        locationId: 'loc_new_town',
        name: 'New Town Heights',
      },
      [PROJ_ALIPORE_CREST_ID]: {
        id: PROJ_ALIPORE_CREST_ID,
        locationId: 'loc_alipore',
        name: 'Alipore Royal Crest',
      },
    };
    return map[id] || null;
  },
  async listAmenityIdentifiers() {
    return new Set(CANONICAL_RESIDENTIAL_AMENITIES.map((a) => a.slug));
  },
};

async function createSampleJpegBuffer(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: color,
    },
  })
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function runTests() {
  console.log('==================================================================');
  console.log('GREAT HOMES V2 — PP-07 AUTOMATED VERIFICATION SUITE');
  console.log('Customer Submission Management: Draft, Resume & My Listings');
  console.log('Execution Mode: Isolated Test Sandbox (NODE_ENV=test, MEDIA_TEST_ISOLATED=true)');
  console.log('==================================================================\n');

  const testRepo = PropertySubmissionRepository.createForTesting();
  testRepo.clearMemoryForTesting();
  const testService = new PropertySubmissionService(testRepo, mockLookup);

  const deletedStorageKeys: string[] = [];
  const mockStorageProvider = {
    name: 'local' as const,
    async put(key: string) {
      return {
        key,
        url: `/uploads/${key}`,
        provider: 'local' as const,
      };
    },
    async delete(key: string) {
      deletedStorageKeys.push(key);
    },
    getPublicUrl(key: string) {
      return `/uploads/${key}`;
    },
  };

  const testMediaService = new SubmissionMediaService({
    repo: testRepo,
    storageProviderResolver: () => mockStorageProvider as any,
    storageProviderForAssetResolver: () => mockStorageProvider as any,
  });

  const makeAuthVerifier =
    (authorized: boolean, customerId?: string, statusCode: 401 | 403 = 401, error?: string) =>
    async (_req: NextRequest) => ({
      authorized,
      customerId,
      statusCode: authorized ? undefined : statusCode,
      error: authorized ? undefined : error || 'Customer authentication required.',
    });

  // ---------------------------------------------------------------------------
  // 1 & 2. Unauthenticated and staff-token rejection on /my-properties endpoints
  // ---------------------------------------------------------------------------
  console.log('1. Testing authentication enforcement on customer submission endpoints...');
  {
    const unauthReq = new NextRequest('http://localhost:3000/api/customer/submissions');
    const unauthRes = await handleListCustomerSubmissions(unauthReq, {
      authVerifier: makeAuthVerifier(false, undefined, 401, 'Customer authentication required.'),
      service: testService,
    });
    assert.equal(unauthRes.status, 401);

    const staffTokenRes = await handleListCustomerSubmissions(unauthReq, {
      authVerifier: makeAuthVerifier(
        false,
        undefined,
        401,
        'Staff tokens cannot be used for customer property submission endpoints.'
      ),
      service: testService,
    });
    assert.equal(staffTokenRes.status, 401);

    const unauthDetailRes = await handleGetCustomerSubmissionDetail(unauthReq, 'sub_any', {
      authVerifier: makeAuthVerifier(false),
      service: testService,
    });
    assert.equal(unauthDetailRes.status, 401);

    const unauthWithdrawRes = await handleWithdrawCustomerSubmission(unauthReq, 'sub_any', {
      authVerifier: makeAuthVerifier(false),
      service: testService,
    });
    assert.equal(unauthWithdrawRes.status, 401);
  }
  console.log('  ✓ Unauthenticated requests and staff tokens rejected with HTTP 401.\n');

  // ---------------------------------------------------------------------------
  // 3 & 4. Customer isolation & cross-customer access rejection
  // ---------------------------------------------------------------------------
  console.log('2. Testing strict customer isolation and cross-customer access rejection...');
  const draftCustomerA = await testService.createDraft('cust_owner_a', {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: {
      propertyType: 'APARTMENT',
      location: {
        city: 'Kolkata',
        locality: 'New Town',
        locationId: 'loc_new_town',
        projectId: PROJ_NT_URBANA_ID,
        projectName: 'New Town Heights',
        address: 'Tower 4, Flat 12B, Action Area I',
        isCustomLocality: false,
      },
      details: {
        configuration: '3 BHK',
        bedroomCount: 3,
        bathroomCount: 3,
        balconies: 2,
        coveredParking: 2,
        openParking: 0,
        propertyAgeYears: 4,
        carpetArea: 1350,
        builtUpArea: 1620,
        superBuiltUpArea: 1950,
        askingPrice: 16500000,
        maintenance: 5500,
        furnishing: 'SEMI_FURNISHED',
        facing: 'SOUTH_EAST',
        floorCategory: 'HIGH_FLOOR',
        totalFloors: 28,
        possession: 'READY_TO_MOVE',
        amenities: ['swimming-pool', 'fitness-center', 'security-cctv'],
        description:
          'Spacious 3 BHK apartment overlooking central greens at New Town Heights with 2 covered car parks.',
      },
    },
  });

  const draftCustomerB = await testService.createDraft('cust_owner_b', {
    listingType: 'RENTAL',
    listingSource: 'OWNER',
    payload: {
      propertyType: 'INDEPENDENT_HOUSE',
      location: {
        city: 'Kolkata',
        locality: 'Alipore',
        locationId: 'loc_alipore',
        address: '18 Belvedere Road, Alipore',
        isCustomLocality: false,
      },
      details: {
        configuration: '4 BHK',
        bedroomCount: 4,
        bathroomCount: 4,
        carpetArea: 2800,
        builtUpArea: 3300,
        monthlyRent: 145000,
        securityDeposit: 435000,
        furnishing: 'FULLY_FURNISHED',
        facing: 'EAST',
        floorCategory: 'GROUND',
        totalFloors: 2,
        availabilityDate: '2026-12-01',
        leaseDuration: '24 Months',
        noticePeriod: '2 Months',
        amenities: ['power-backup', 'landscaped-gardens'],
        description:
          'Independent 4 BHK residence in Alipore with private lawn and servant quarters.',
      },
    },
  });

  {
    const listReqA = new NextRequest('http://localhost:3000/api/customer/submissions');
    const listResA = await handleListCustomerSubmissions(listReqA, {
      authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
      service: testService,
    });
    assert.equal(listResA.status, 200);
    const bodyA = await listResA.json();
    assert.equal(bodyA.success, true);
    assert.equal(bodyA.items.length, 1);
    assert.equal(bodyA.items[0].id, draftCustomerA.id);
    assert.equal(
      bodyA.items.some((item: { id: string }) => item.id === draftCustomerB.id),
      false,
      'Customer A must never see Customer B submissions'
    );

    // Cross-customer detail fetch -> 404
    const crossDetailRes = await handleGetCustomerSubmissionDetail(
      listReqA,
      draftCustomerB.id,
      {
        authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
        service: testService,
      }
    );
    assert.equal(crossDetailRes.status, 404);

    // Cross-customer withdraw -> 404
    const crossWithdrawRes = await handleWithdrawCustomerSubmission(
      listReqA,
      draftCustomerB.id,
      {
        authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
        service: testService,
      }
    );
    assert.equal(crossWithdrawRes.status, 404);

    // Cross-customer draft update -> 404
    await assert.rejects(
      async () => {
        await testService.updateDraft(draftCustomerB.id, 'cust_owner_a', {
          payload: { details: { askingPrice: 9999999 } },
        });
      },
      (err: unknown) => (err as { statusCode?: number }).statusCode === 404
    );
  }
  console.log('  ✓ Customer isolation and 404 cross-customer protection verified.\n');

  // ---------------------------------------------------------------------------
  // 5, 6, 7, 8, 9. Draft resume with <3 photos, deep-merge updates, and PP-06 media hydration
  // ---------------------------------------------------------------------------
  console.log('3. Testing draft save & resume with <3 photos, deep-merge updates, and PP-06 media...');
  {
    // Upload 2 photos to draftCustomerA (<3 photos allowed in draft!)
    const img1 = await createSampleJpegBuffer({ r: 40, g: 90, b: 140 });
    const img2 = await createSampleJpegBuffer({ r: 90, g: 130, b: 80 });

    const upload1 = await testMediaService.uploadMedia(draftCustomerA.id, 'cust_owner_a', {
      buffer: img1,
      filename: 'living-room.jpg',
      mimeType: 'image/jpeg',
      category: 'Living Room',
      caption: 'Main living and dining hall',
    });
    const upload2 = await testMediaService.uploadMedia(draftCustomerA.id, 'cust_owner_a', {
      buffer: img2,
      filename: 'balcony-view.jpg',
      mimeType: 'image/jpeg',
      category: 'Balcony',
      caption: 'South-East facing balcony view',
    });

    assert.equal(upload2.assets.length, 2);

    // Set 2nd photo as featured cover and reorder [photo2, photo1]
    const patchReq = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${draftCustomerA.id}/media/${upload2.asset.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFeatured: true, caption: 'Featured Balcony Panorama' }),
      }
    );
    const patchRes = await handlePatchSubmissionMediaItem(
      patchReq,
      draftCustomerA.id,
      upload2.asset.id,
      {
        verifyAuth: makeAuthVerifier(true, 'cust_owner_a'),
        mediaService: testMediaService,
      }
    );
    assert.equal(patchRes.status, 200);

    const reorderReq = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${draftCustomerA.id}/media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: [upload2.asset.id, upload1.asset.id],
        }),
      }
    );
    const reorderRes = await handlePatchSubmissionMediaCollection(reorderReq, draftCustomerA.id, {
      verifyAuth: makeAuthVerifier(true, 'cust_owner_a'),
      mediaService: testMediaService,
    });
    assert.equal(reorderRes.status, 200);

    // Perform partial draft update (only updating askingPrice and maintenance) and verify deep merge preserves all other fields & photos
    await testService.updateDraft(draftCustomerA.id, 'cust_owner_a', {
      payload: {
        details: {
          askingPrice: 17000000,
          maintenance: 5800,
        },
      },
    });

    // Resume draft via GET /api/customer/submissions/[id]
    const detailReq = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${draftCustomerA.id}`
    );
    const detailRes = await handleGetCustomerSubmissionDetail(detailReq, draftCustomerA.id, {
      authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
      service: testService,
    });
    assert.equal(detailRes.status, 200);
    const detailData = await detailRes.json();

    assert.equal(detailData.success, true);
    assert.equal(detailData.submission.id, draftCustomerA.id);
    assert.equal(detailData.submission.submissionStatus, 'DRAFT');
    assert.equal(detailData.permissions.canEdit, true);
    assert.equal(detailData.permissions.canWithdraw, true);
    assert.equal(detailData.summary.photoCount, 2);

    // Verify all PP-04 and PP-05 fields survived partial update
    const resumedPayload = detailData.submission.payload;
    assert.equal(resumedPayload.propertyType, 'APARTMENT');
    assert.equal(resumedPayload.location.locality, 'New Town');
    assert.equal(resumedPayload.location.locationId, 'loc_new_town');
    assert.equal(resumedPayload.location.projectId, PROJ_NT_URBANA_ID);
    assert.equal(resumedPayload.location.projectName, 'New Town Heights');
    assert.equal(resumedPayload.details.configuration, '3 BHK');
    assert.equal(resumedPayload.details.carpetArea, 1350);
    assert.equal(resumedPayload.details.builtUpArea, 1620);
    assert.equal(resumedPayload.details.superBuiltUpArea, 1950);
    assert.equal(resumedPayload.details.askingPrice, 17000000);
    assert.equal(resumedPayload.details.maintenance, 5800);
    assert.equal(resumedPayload.details.facing, 'SOUTH_EAST');
    assert.deepEqual(resumedPayload.details.amenities, [
      'swimming-pool',
      'fitness-center',
      'security-cctv',
    ]);

    // Verify PP-06 media ordering and featured cover selection on resume
    assert.equal(detailData.photos.length, 2);
    assert.equal(detailData.photos[0].id, upload2.asset.id);
    assert.equal(detailData.photos[0].sortOrder, 0);
    assert.equal(detailData.photos[0].isFeatured, true);
    assert.equal(detailData.photos[0].caption, 'Featured Balcony Panorama');
    assert.equal(detailData.photos[1].id, upload1.asset.id);
    assert.equal(detailData.photos[1].sortOrder, 1);
    assert.equal(detailData.photos[1].isFeatured, false);
    assert.equal(detailData.summary.coverPhotoUrl, detailData.photos[0].url);
  }
  console.log('  ✓ Draft with 2 photos saved, deep-merged, and resumed with full PP-04/05/06 state intact.\n');

  // ---------------------------------------------------------------------------
  // 10. 3-image minimum enforced on final submission
  // ---------------------------------------------------------------------------
  console.log('4. Testing 3-image minimum enforcement on final submission...');
  {
    // Submitting draftCustomerA with only 2 photos must fail with 400
    await assert.rejects(
      async () => {
        await testService.submitForReview(draftCustomerA.id, 'cust_owner_a', {
          consent: { ownerDeclarationAccepted: true },
        });
      },
      (err: unknown) => {
        const domErr = err as { statusCode?: number; message?: string };
        return (
          domErr.statusCode === 400 &&
          Boolean(
            domErr.message?.includes('Minimum 3 property photographs') ||
              domErr.message?.includes('At least 3 property photographs')
          )
        );
      }
    );

    // Upload 3rd photo and submit -> succeeds and transitions to SUBMITTED
    const img3 = await createSampleJpegBuffer({ r: 160, g: 110, b: 60 });
    await testMediaService.uploadMedia(draftCustomerA.id, 'cust_owner_a', {
      buffer: img3,
      filename: 'master-bedroom.jpg',
      mimeType: 'image/jpeg',
      category: 'Bedroom',
      caption: 'Master bedroom with attached bath',
    });

    const submitted = await testService.submitForReview(draftCustomerA.id, 'cust_owner_a', {
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submitted.submissionStatus, 'SUBMITTED');
  }
  console.log('  ✓ 3-image minimum enforced on final submission; succeeded after 3rd photo upload.\n');

  // ---------------------------------------------------------------------------
  // 13. SUBMITTED editing and media mutation restrictions
  // ---------------------------------------------------------------------------
  console.log('5. Testing SUBMITTED editing and media mutation restrictions...');
  {
    await assert.rejects(
      async () => {
        await testService.updateDraft(draftCustomerA.id, 'cust_owner_a', {
          payload: { details: { askingPrice: 18000000 } },
        });
      },
      (err: unknown) => (err as { statusCode?: number }).statusCode === 400
    );

    const imgExtra = await createSampleJpegBuffer({ r: 50, g: 50, b: 50 });
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([new Uint8Array(imgExtra)], { type: 'image/jpeg' }),
      'extra.jpg'
    );
    const uploadWhileSubmittedReq = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${draftCustomerA.id}/media`,
      {
        method: 'POST',
        body: formData,
      }
    );
    const uploadWhileSubmittedRes = await handlePostSubmissionMedia(
      uploadWhileSubmittedReq,
      draftCustomerA.id,
      {
        verifyAuth: makeAuthVerifier(true, 'cust_owner_a'),
        mediaService: testMediaService,
      }
    );
    assert.equal(uploadWhileSubmittedRes.status, 409);
  }
  console.log('  ✓ Editing and media mutations blocked while submission is in SUBMITTED status.\n');

  // ---------------------------------------------------------------------------
  // 11, 12, 15, 16, 17. CHANGES_REQUESTED feedback, internalNote exclusion, correction & resubmission
  // ---------------------------------------------------------------------------
  console.log(
    '6. Testing CHANGES_REQUESTED review feedback, internalNote exclusion, correction & resubmission...'
  );
  {
    // Simulate staff moving submission to UNDER_REVIEW and then CHANGES_REQUESTED with both submitterFeedback and confidential internalNote
    testRepo.addReviewEventForTesting({
      submissionId: draftCustomerA.id,
      newStatus: 'UNDER_REVIEW',
      eventType: 'UNDER_REVIEW',
      staffUserId: 'staff_mod_secret_001',
      internalNote: 'CONFIDENTIAL STAFF NOTE: Checking RERA tower records.',
      submitterFeedback: null,
    });

    testRepo.addReviewEventForTesting({
      submissionId: draftCustomerA.id,
      newStatus: 'CHANGES_REQUESTED',
      eventType: 'CHANGES_REQUESTED',
      staffUserId: 'staff_mod_secret_001',
      internalNote: 'CONFIDENTIAL STAFF NOTE: Owner phone verified, ask for kitchen photo & exact flat number.',
      submitterFeedback:
        'Please include your flat tower entrance details in the description and verify the monthly maintenance amount.',
    });

    // Fetch customer detail & list responses and verify submitterFeedback is exposed while internalNote & staffUserId are NEVER exposed
    const detailReq = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${draftCustomerA.id}`
    );
    const detailRes = await handleGetCustomerSubmissionDetail(detailReq, draftCustomerA.id, {
      authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
      service: testService,
    });
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();
    const rawDetailText = JSON.stringify(detailJson);

    assert.equal(
      rawDetailText.includes('CONFIDENTIAL STAFF NOTE'),
      false,
      'Internal staff notes must NEVER appear in customer detail API responses'
    );
    assert.equal(
      rawDetailText.includes('staff_mod_secret_001'),
      false,
      'Staff user IDs must NEVER appear in customer detail API responses'
    );
    assert.equal(
      rawDetailText.includes('internalNote'),
      false,
      'internalNote property key must NEVER be serialized to customer responses'
    );
    assert.equal(
      detailJson.latestFeedback?.submitterFeedback,
      'Please include your flat tower entrance details in the description and verify the monthly maintenance amount.'
    );
    assert.equal(detailJson.permissions.canEdit, true);
    assert.equal(detailJson.permissions.canResubmit, true);

    const listReq = new NextRequest(
      'http://localhost:3000/api/customer/submissions?status=CHANGES_REQUESTED'
    );
    const listRes = await handleListCustomerSubmissions(listReq, {
      authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
      service: testService,
    });
    const listJson = await listRes.json();
    const rawListText = JSON.stringify(listJson);
    assert.equal(rawListText.includes('CONFIDENTIAL STAFF NOTE'), false);
    assert.equal(rawListText.includes('staff_mod_secret_001'), false);
    assert.equal(listJson.items.length, 1);
    assert.equal(
      listJson.items[0].latestFeedback?.submitterFeedback,
      'Please include your flat tower entrance details in the description and verify the monthly maintenance amount.'
    );

    // Edit the CHANGES_REQUESTED submission (update description & maintenance) and resubmit
    await testService.updateDraft(draftCustomerA.id, 'cust_owner_a', {
      payload: {
        details: {
          maintenance: 5600,
          description:
            'Spacious 3 BHK apartment at New Town Heights (Tower 4, Lobby B entrance) overlooking central greens with 2 covered car parks.',
        },
      },
    });

    const resubmitted = await testService.submitForReview(draftCustomerA.id, 'cust_owner_a', {
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(resubmitted.submissionStatus, 'SUBMITTED');

    // Verify chronological activity timeline includes DRAFT_CREATED -> SUBMITTED -> UNDER_REVIEW -> CHANGES_REQUESTED -> RESUBMITTED
    const afterResubmitDetail = await testService.getCustomerSubmissionDetail(
      draftCustomerA.id,
      'cust_owner_a'
    );
    const eventTypes = afterResubmitDetail.activityTimeline.map((a) => a.eventType);
    assert.ok(eventTypes.includes('DRAFT_CREATED'));
    assert.ok(eventTypes.includes('SUBMITTED'));
    assert.ok(eventTypes.includes('UNDER_REVIEW'));
    assert.ok(eventTypes.includes('CHANGES_REQUESTED'));
    assert.ok(eventTypes.includes('RESUBMITTED'));
  }
  console.log(
    '  ✓ CHANGES_REQUESTED feedback displayed, internalNote/staffUserId strictly stripped, and RESUBMITTED workflow verified.\n'
  );

  // ---------------------------------------------------------------------------
  // 14. Withdrawal authorization and status restrictions
  // ---------------------------------------------------------------------------
  console.log('7. Testing withdrawal workflow across statuses...');
  {
    // Withdraw draftCustomerB (currently DRAFT) -> succeeds and transitions to WITHDRAWN
    const withdrawReqB = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${draftCustomerB.id}/withdraw`,
      { method: 'POST' }
    );
    const withdrawResB = await handleWithdrawCustomerSubmission(
      withdrawReqB,
      draftCustomerB.id,
      {
        authVerifier: makeAuthVerifier(true, 'cust_owner_b'),
        service: testService,
      }
    );
    assert.equal(withdrawResB.status, 200);
    const withdrawJsonB = await withdrawResB.json();
    assert.equal(withdrawJsonB.submission.submissionStatus, 'WITHDRAWN');
    assert.ok(withdrawJsonB.submission.withdrawnAt);

    // Withdrawing an already WITHDRAWN submission -> 409
    const withdrawAgainRes = await handleWithdrawCustomerSubmission(
      withdrawReqB,
      draftCustomerB.id,
      {
        authVerifier: makeAuthVerifier(true, 'cust_owner_b'),
        service: testService,
      }
    );
    assert.equal(withdrawAgainRes.status, 409);

    // Editing a WITHDRAWN submission -> 400
    await assert.rejects(
      async () => {
        await testService.updateDraft(draftCustomerB.id, 'cust_owner_b', {
          payload: { details: { monthlyRent: 150000 } },
        });
      },
      (err: unknown) => (err as { statusCode?: number }).statusCode === 400
    );

    // Approve draftCustomerA and verify APPROVED submission cannot be withdrawn or edited
    testRepo.addReviewEventForTesting({
      submissionId: draftCustomerA.id,
      newStatus: 'APPROVED',
      eventType: 'APPROVED',
      submitterFeedback: 'Verified and published on Great Homes.',
    });

    const withdrawApprovedRes = await handleWithdrawCustomerSubmission(
      withdrawReqB,
      draftCustomerA.id,
      {
        authVerifier: makeAuthVerifier(true, 'cust_owner_a'),
        service: testService,
      }
    );
    assert.equal(withdrawApprovedRes.status, 409);
  }
  console.log('  ✓ Withdrawal permitted for eligible statuses and blocked for APPROVED/WITHDRAWN.\n');

  // ---------------------------------------------------------------------------
  // 18 & 21. Pagination, status filter counts, empty state, and PP-06 media deletion
  // ---------------------------------------------------------------------------
  console.log('8. Testing pagination, status filters, empty state, and PP-06 media deletion...');
  {
    // Empty state for a brand new customer with 0 submissions
    const emptyRes = await handleListCustomerSubmissions(
      new NextRequest('http://localhost:3000/api/customer/submissions'),
      {
        authVerifier: makeAuthVerifier(true, 'cust_brand_new'),
        service: testService,
      }
    );
    assert.equal(emptyRes.status, 200);
    const emptyJson = await emptyRes.json();
    assert.equal(emptyJson.items.length, 0);
    assert.equal(emptyJson.countsByStatus.ALL, 0);

    // Create 5 drafts for cust_paginated and test page=1&limit=2 and page=3&limit=2
    for (let i = 1; i <= 5; i++) {
      await testService.createDraft('cust_paginated', {
        listingType: i % 2 === 0 ? 'RENTAL' : 'RESALE',
        listingSource: 'OWNER',
        payload: {
          propertyType: 'PLOT',
          location: {
            city: 'Kolkata',
            locality: `Sector ${i}, Rajarhat`,
            locationId: 'loc_rajarhat',
            address: `Plot ${i}, Sector ${i}, Rajarhat Main Road, Kolkata`,
          },
          details: {
            plotArea: 1800 + i * 100,
            askingPrice: i % 2 !== 0 ? 7500000 + i * 100000 : undefined,
            monthlyRent: i % 2 === 0 ? 35000 + i * 1000 : undefined,
          },
        },
      });
    }

    const page1Res = await handleListCustomerSubmissions(
      new NextRequest('http://localhost:3000/api/customer/submissions?page=1&limit=2&status=DRAFT'),
      {
        authVerifier: makeAuthVerifier(true, 'cust_paginated'),
        service: testService,
      }
    );
    const page1Json = await page1Res.json();
    assert.equal(page1Json.items.length, 2);
    assert.equal(page1Json.pagination.total, 5);
    assert.equal(page1Json.pagination.page, 1);
    assert.equal(page1Json.pagination.limit, 2);
    assert.equal(page1Json.pagination.totalPages, 3);
    assert.equal(page1Json.countsByStatus.DRAFT, 5);

    const page3Res = await handleListCustomerSubmissions(
      new NextRequest('http://localhost:3000/api/customer/submissions?page=3&limit=2&status=DRAFT'),
      {
        authVerifier: makeAuthVerifier(true, 'cust_paginated'),
        service: testService,
      }
    );
    const page3Json = await page3Res.json();
    assert.equal(page3Json.items.length, 1);
    assert.equal(page3Json.pagination.page, 3);

    // Verify PP-06 image deletion on a draft
    const targetDraftId = page1Json.items[0].id;
    const sampleImg = await createSampleJpegBuffer({ r: 100, g: 140, b: 180 });
    const uploaded = await testMediaService.uploadMedia(targetDraftId, 'cust_paginated', {
      buffer: sampleImg,
      filename: 'plot-corner.jpg',
      mimeType: 'image/jpeg',
    });
    assert.equal(uploaded.assets.length, 1);

    const delReq = new NextRequest(
      `http://localhost:3000/api/customer/submissions/${targetDraftId}/media/${uploaded.asset.id}`,
      { method: 'DELETE' }
    );
    const delRes = await handleDeleteSubmissionMediaItem(
      delReq,
      targetDraftId,
      uploaded.asset.id,
      {
        verifyAuth: makeAuthVerifier(true, 'cust_paginated'),
        mediaService: testMediaService,
      }
    );
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(delJson.assets.length, 0);
    assert.ok(deletedStorageKeys.includes(uploaded.asset.storageKey));
  }
  console.log('  ✓ Pagination, status filter counts, empty state, and media deletion verified.\n');

  // ---------------------------------------------------------------------------
  // 20 & 22. PP-05 cross-field validation on draft updates & fail-closed 503 persistence behavior
  // ---------------------------------------------------------------------------
  console.log('9. Testing PP-05 validation during draft edits and fail-closed 503 persistence...');
  {
    const editDraft = await testService.createDraft('cust_pp05_check', {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'APARTMENT',
        details: {
          carpetArea: 1200,
          builtUpArea: 1450,
          superBuiltUpArea: 1750,
        },
      },
    });

    // Updating carpetArea > builtUpArea must fail with 400
    await assert.rejects(
      async () => {
        await testService.updateDraft(editDraft.id, 'cust_pp05_check', {
          payload: {
            details: {
              carpetArea: 1600,
            },
          },
        });
      },
      (err: unknown) => (err as { statusCode?: number }).statusCode === 400
    );

    // Fail-closed 503 behavior when DB is unavailable
    const brokenRepo = new PropertySubmissionRepository({
      allowTestMemoryPersistence: false,
      dbResolver: () => {
        throw new PropertySubmissionPersistenceError(
          'Property submission service is temporarily unavailable.'
        );
      },
    });
    const brokenService = new PropertySubmissionService(brokenRepo, mockLookup);

    const list503Res = await handleListCustomerSubmissions(
      new NextRequest('http://localhost:3000/api/customer/submissions'),
      {
        authVerifier: makeAuthVerifier(true, 'cust_any'),
        service: brokenService,
      }
    );
    assert.equal(list503Res.status, 503);

    const detail503Res = await handleGetCustomerSubmissionDetail(
      new NextRequest('http://localhost:3000/api/customer/submissions/sub_any'),
      'sub_any',
      {
        authVerifier: makeAuthVerifier(true, 'cust_any'),
        service: brokenService,
      }
    );
    assert.equal(detail503Res.status, 503);

    const withdraw503Res = await handleWithdrawCustomerSubmission(
      new NextRequest('http://localhost:3000/api/customer/submissions/sub_any/withdraw', {
        method: 'POST',
      }),
      'sub_any',
      {
        authVerifier: makeAuthVerifier(true, 'cust_any'),
        service: brokenService,
      }
    );
    assert.equal(withdraw503Res.status, 503);
  }
  console.log('  ✓ PP-05 cross-field validation and fail-closed HTTP 503 behavior verified.\n');

  console.log('==================================================================');
  console.log('ALL PP-07 AUTOMATED TESTS PASSED SUCCESSFULLY');
  console.log('==================================================================');
}

runTests().catch((err) => {
  console.error('PP-07 Automated Verification Failed:', err);
  process.exit(1);
});
