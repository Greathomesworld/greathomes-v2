import assert from 'node:assert/strict';
import {
  validateWizardStep,
  isValidPersistedSubmissionPhotoUrl,
  sanitizeInternalRedirectPath,
  CANONICAL_OWNER_DECLARATION_TEXT,
  CANONICAL_PARTNER_ATTESTATION_TEXT,
  CANONICAL_ATTESTATION_VERSION,
} from '../src/domain/propertySubmission/validation.ts';
import { propertySubmissionService } from '../src/domain/propertySubmission/service.ts';
import { propertySubmissionRepository } from '../src/domain/propertySubmission/repository.ts';

async function runWizardTests() {
  console.log('=== STARTING PP-04 POST PROPERTY HUB & WIZARD TESTS ===\n');

  // ---------------------------------------------------------------------------
  // 1. Redirect Sanitization Tests
  // ---------------------------------------------------------------------------
  console.log('1. Testing redirect sanitization (open-redirect protection)...');
  assert.equal(sanitizeInternalRedirectPath('/post-property/new'), '/post-property/new');
  assert.equal(
    sanitizeInternalRedirectPath('/post-property/new?purpose=RESALE&type=APARTMENT&source=OWNER'),
    '/post-property/new?purpose=RESALE&type=APARTMENT&source=OWNER'
  );
  assert.equal(sanitizeInternalRedirectPath('https://evil.example.com'), '/post-property');
  assert.equal(sanitizeInternalRedirectPath('//evil.example.com/steal'), '/post-property');
  assert.equal(sanitizeInternalRedirectPath('javascript:alert(1)'), '/post-property');
  assert.equal(sanitizeInternalRedirectPath('data:text/html,<script>alert(1)</script>'), '/post-property');
  assert.equal(sanitizeInternalRedirectPath('/\\evil.com'), '/post-property');
  assert.equal(sanitizeInternalRedirectPath(null), '/post-property');
  assert.equal(sanitizeInternalRedirectPath(''), '/post-property');
  console.log('✓ Open-redirect protection verified.\n');

  // ---------------------------------------------------------------------------
  // 2. Media Restrictions Validation (Server-Persisted Images Only, No Base64/External/Videos/Docs)
  // ---------------------------------------------------------------------------
  console.log('2. Testing persisted media URL validation (Great Homes storage only, blocking Base64/external/videos/docs)...');
  assert.equal(
    isValidPersistedSubmissionPhotoUrl(
      'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_1/med_1/public_wm.webp'
    ),
    true
  );
  assert.equal(
    isValidPersistedSubmissionPhotoUrl(
      'https://media.greathomes.co.in/media/submission/sub_1/med_2/public_wm.webp'
    ),
    true
  );

  // Reject inline Base64 data URIs and unverified external URLs
  assert.equal(
    isValidPersistedSubmissionPhotoUrl('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200'),
    false
  );
  assert.equal(isValidPersistedSubmissionPhotoUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD='), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA'), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAv'), false);

  // Reject videos, SVGs & documents
  assert.equal(isValidPersistedSubmissionPhotoUrl('https://cdn.example.com/walkthrough.mp4'), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('https://cdn.example.com/tour.mov?token=123'), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('https://cdn.example.com/brochure.pdf'), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('https://cdn.example.com/deed.docx'), false);
  assert.equal(
    isValidPersistedSubmissionPhotoUrl(
      'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_1/med_1/floorplan.svg'
    ),
    false
  );
  assert.equal(isValidPersistedSubmissionPhotoUrl('data:video/mp4;base64,AAAAIGZ0eXBpc29t'), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('data:application/pdf;base64,JVBERi0xLjQK'), false);
  assert.equal(isValidPersistedSubmissionPhotoUrl('javascript:alert(1)'), false);
  console.log('✓ Media type validation verified (persisted submission images accepted, Base64/external/videos/documents blocked).\n');

  // ---------------------------------------------------------------------------
  // 3. Step-by-Step Wizard Validation (Steps 1 through 6)
  // ---------------------------------------------------------------------------
  console.log('3. Testing 6-step wizard validation rules...');

  // Step 1: Valid and invalid combinations
  const step1Valid = validateWizardStep(1, {
    listingType: 'RESALE',
    propertyType: 'APARTMENT',
    listingSource: 'OWNER',
  });
  assert.equal(step1Valid.valid, true);

  const step1Invalid = validateWizardStep(1, {
    listingType: 'COMMERCIAL' as any,
    propertyType: 'VILLA' as any,
    listingSource: 'BROKER' as any,
  });
  assert.equal(step1Invalid.valid, false);
  assert.equal(step1Invalid.errors.length, 3);

  // Step 2: Location & Project Context
  const step2MissingLocality = validateWizardStep(2, {
    location: {
      city: 'Kolkata',
      locality: '',
      address: '',
    },
  });
  assert.equal(step2MissingLocality.valid, false);
  assert.ok(step2MissingLocality.errors.some((e) => e.includes('Locality')));

  const step2Valid = validateWizardStep(2, {
    location: {
      city: 'Kolkata',
      locality: 'Ballygunge',
      address: '12 Ballygunge Circular Road, Kolkata 700019',
      projectName: 'Urbana',
    },
  });
  assert.equal(step2Valid.valid, true);

  // Step 3: Property Details & Pricing (Apartment vs Plot, Resale vs Rental)
  const step3ApartmentMissingFields = validateWizardStep(3, {
    listingType: 'RESALE',
    propertyType: 'APARTMENT',
    details: {
      askingPrice: 0,
    },
  });
  assert.equal(step3ApartmentMissingFields.valid, false);
  assert.ok(step3ApartmentMissingFields.errors.some((e) => e.includes('Bedroom')));
  assert.ok(step3ApartmentMissingFields.errors.some((e) => e.includes('area')));
  assert.ok(step3ApartmentMissingFields.errors.some((e) => e.includes('Asking price')));

  const step3ApartmentValid = validateWizardStep(3, {
    listingType: 'RESALE',
    propertyType: 'APARTMENT',
    details: {
      configuration: '3 BHK',
      bedroomCount: 3,
      bathroomCount: 3,
      carpetArea: 1450,
      askingPrice: 18500000,
      furnishing: 'SEMI_FURNISHED',
    },
  });
  assert.equal(step3ApartmentValid.valid, true);

  // Plot does NOT require bedrooms, requires plotArea
  const step3PlotMissingArea = validateWizardStep(3, {
    listingType: 'RESALE',
    propertyType: 'PLOT',
    details: {
      askingPrice: 9500000,
    },
  });
  assert.equal(step3PlotMissingArea.valid, false);
  assert.ok(step3PlotMissingArea.errors.some((e) => e.includes('Plot area')));
  assert.equal(step3PlotMissingArea.errors.some((e) => e.includes('Bedroom')), false);

  const step3PlotValid = validateWizardStep(3, {
    listingType: 'RESALE',
    propertyType: 'PLOT',
    details: {
      plotArea: 2400,
      askingPrice: 9500000,
    },
  });
  assert.equal(step3PlotValid.valid, true);

  // Rental requires monthlyRent
  const step3RentalMissingRent = validateWizardStep(3, {
    listingType: 'RENTAL',
    propertyType: 'INDEPENDENT_HOUSE',
    details: {
      bedroomCount: 4,
      builtUpArea: 2800,
    },
  });
  assert.equal(step3RentalMissingRent.valid, false);
  assert.ok(step3RentalMissingRent.errors.some((e) => e.includes('Monthly rent')));

  // Step 4: Photographs (Minimum 3 photos, server-persisted image-only)
  const step4TooFewPhotos = validateWizardStep(4, {
    photos: [
      { id: 'p1', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_1/public_wm.webp', category: 'Property', sortOrder: 0, isFeatured: true },
      { id: 'p2', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_2/public_wm.webp', category: 'Property', sortOrder: 1, isFeatured: false },
    ],
  });
  assert.equal(step4TooFewPhotos.valid, false);
  assert.ok(step4TooFewPhotos.errors.some((e) => e.includes('Minimum 3')));

  const step4WithVideoUrl = validateWizardStep(4, {
    photos: [
      { id: 'p1', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_1/public_wm.webp', category: 'Property', sortOrder: 0, isFeatured: true },
      { id: 'p2', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_2/public_wm.webp', category: 'Property', sortOrder: 1, isFeatured: false },
      { id: 'p3', url: 'https://cdn.example.com/property-video.mp4', category: 'Property', sortOrder: 2, isFeatured: false },
    ],
  });
  assert.equal(step4WithVideoUrl.valid, false);
  assert.ok(step4WithVideoUrl.errors.some((e) => e.includes('strictly prohibited')));

  const validPhotos = [
    { id: 'p1', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_1/public_wm.webp', category: 'Living Room', caption: 'Living Room', sortOrder: 0, isFeatured: true },
    { id: 'p2', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_2/public_wm.webp', category: 'Master Bedroom', caption: 'Master Bedroom', sortOrder: 1, isFeatured: false },
    { id: 'p3', url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_test/med_3/public_wm.webp', category: 'Kitchen', caption: 'Kitchen & Dining', sortOrder: 2, isFeatured: false },
  ];
  const step4Valid = validateWizardStep(4, { photos: validPhotos });
  assert.equal(step4Valid.valid, true);

  // Step 5: Identity & Declaration (Owner vs Partner)
  const step5OwnerMissingDeclaration = validateWizardStep(5, {
    listingSource: 'OWNER',
    consent: { ownerDeclarationAccepted: false },
  });
  assert.equal(step5OwnerMissingDeclaration.valid, false);
  assert.ok(step5OwnerMissingDeclaration.errors.some((e) => e.includes('Owner authority declaration')));

  const step5OwnerValid = validateWizardStep(5, {
    listingSource: 'OWNER',
    consent: { ownerDeclarationAccepted: true },
  });
  assert.equal(step5OwnerValid.valid, true);

  const step5PartnerMissingConsent = validateWizardStep(5, {
    listingSource: 'PARTNER',
    consent: { partnerAttestationAccepted: false },
  });
  assert.equal(step5PartnerMissingConsent.valid, false);
  assert.ok(step5PartnerMissingConsent.errors.some((e) => e.includes('Partner owner-consent attestation')));

  const step5PartnerValid = validateWizardStep(5, {
    listingSource: 'PARTNER',
    consent: { partnerAttestationAccepted: true },
  });
  assert.equal(step5PartnerValid.valid, true);

  // Step 6: Full Final Submission Validation
  const step6CompleteValid = validateWizardStep(6, {
    listingType: 'RESALE',
    propertyType: 'APARTMENT',
    listingSource: 'OWNER',
    location: {
      city: 'Kolkata',
      locality: 'Ballygunge',
      address: '12 Ballygunge Circular Road, Kolkata 700019',
      projectName: 'Urbana',
    },
    details: {
      configuration: '3 BHK',
      bedroomCount: 3,
      bathroomCount: 3,
      carpetArea: 1450,
      askingPrice: 18500000,
      furnishing: 'SEMI_FURNISHED',
    },
    photos: validPhotos,
    consent: {
      ownerDeclarationAccepted: true,
      declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
      attestationVersion: CANONICAL_ATTESTATION_VERSION,
    },
  });
  assert.equal(step6CompleteValid.valid, true);
  console.log('✓ All 6 wizard step validation contracts verified.\n');

  // ---------------------------------------------------------------------------
  // 4. Service & Repository Lifecycle Integration Tests
  // ---------------------------------------------------------------------------
  console.log('4. Testing end-to-end Wizard -> Service -> Repository submission flow...');

  (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
  propertySubmissionRepository.enableTestMemoryPersistence(true);

  const ownerCustomerId = 'cust_pp04_owner_1';
  const otherCustomerId = 'cust_pp04_other_2';
  const activePartnerCustomerId = 'cust_pp04_partner_active_3';
  const pendingPartnerCustomerId = 'cust_pp04_partner_pending_4';

  // Seed partner profiles for testing
  await propertySubmissionRepository.setMemoryPartnerProfileForTesting(activePartnerCustomerId, 'ACTIVE');
  await propertySubmissionRepository.setMemoryPartnerProfileForTesting(pendingPartnerCustomerId, 'PENDING');

  // If DB is connected, also ensure partner profiles exist in DB for deterministic testing
  const { getDb } = await import('../src/db/client.ts');
  const { customers, customerPartnerProfiles } = await import('../src/db/schema.ts');
  type CustomerInsertRow = typeof customers.$inferInsert & Partial<typeof customers.$inferSelect>;
  type PartnerProfileInsertRow = typeof customerPartnerProfiles.$inferInsert &
    Partial<typeof customerPartnerProfiles.$inferSelect>;
  type PartnerProfileUpdateRow = Partial<typeof customerPartnerProfiles.$inferSelect>;

  const db = getDb();
  if (db) {
    for (const cid of [ownerCustomerId, otherCustomerId, activePartnerCustomerId, pendingPartnerCustomerId]) {
      const custRow: CustomerInsertRow = {
        id: cid,
        name: `Test User ${cid}`,
        email: `${cid}@example.com`,
        phone: `+9198000000${cid.slice(-2)}`,
        phoneVerifiedAt: new Date(),
      };
      await db
        .insert(customers)
        .values(custRow)
        .onConflictDoNothing();
    }
    const activeProfileInsert: PartnerProfileInsertRow = {
      id: `prof_${activePartnerCustomerId}`,
      customerId: activePartnerCustomerId,
      status: 'ACTIVE',
    };
    const activeProfileUpdate: PartnerProfileUpdateRow = {
      status: 'ACTIVE',
      updatedAt: new Date(),
    };
    await db
      .insert(customerPartnerProfiles)
      .values(activeProfileInsert)
      .onConflictDoUpdate({
        target: customerPartnerProfiles.customerId,
        set: activeProfileUpdate,
      });

    const pendingProfileInsert: PartnerProfileInsertRow = {
      id: `prof_${pendingPartnerCustomerId}`,
      customerId: pendingPartnerCustomerId,
      status: 'PENDING',
    };
    const pendingProfileUpdate: PartnerProfileUpdateRow = {
      status: 'PENDING',
      updatedAt: new Date(),
    };
    await db
      .insert(customerPartnerProfiles)
      .values(pendingProfileInsert)
      .onConflictDoUpdate({
        target: customerPartnerProfiles.customerId,
        set: pendingProfileUpdate,
      });
  }

  // 4a. Partner eligibility check
  const activeEligibility = await propertySubmissionService.getPartnerEligibility(activePartnerCustomerId);
  assert.equal(activeEligibility.eligible, true);
  assert.equal(activeEligibility.status, 'ACTIVE');

  const pendingEligibility = await propertySubmissionService.getPartnerEligibility(pendingPartnerCustomerId);
  assert.equal(pendingEligibility.eligible, false);
  assert.equal(pendingEligibility.status, 'PENDING');

  const noneEligibility = await propertySubmissionService.getPartnerEligibility(ownerCustomerId);
  assert.equal(noneEligibility.eligible, false);
  assert.equal(noneEligibility.status, 'NONE');

  // 4b. Non-eligible partner blocked from creating PARTNER draft
  await assert.rejects(
    async () => {
      await propertySubmissionService.createDraft(pendingPartnerCustomerId, {
        listingType: 'RESALE',
        listingSource: 'PARTNER',
        payload: {
          listingType: 'RESALE',
          listingSource: 'PARTNER',
          propertyType: 'APARTMENT',
        },
      });
    },
    (err: any) => err.message.includes('PENDING')
  );

  // 4c. Owner creates draft, updates across wizard steps, and submits for review
  const ownerDraft = await propertySubmissionService.createDraft(ownerCustomerId, {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
    },
  });
  assert.equal(ownerDraft.submissionStatus, 'DRAFT');
  assert.equal(ownerDraft.submitterCustomerId, ownerCustomerId);

  // Ownership isolation: another customer cannot read or update ownerDraft
  await assert.rejects(
    async () => {
      await propertySubmissionService.getSubmission(ownerDraft.id, otherCustomerId);
    },
    (err: any) => err.message.includes('not found or unauthorized')
  );

  await assert.rejects(
    async () => {
      await propertySubmissionService.updateDraft(ownerDraft.id, otherCustomerId, {
        payload: { propertyType: 'PLOT' },
      });
    },
    (err: any) => err.message.includes('not found or unauthorized')
  );

  // Owner updates draft with location and details
  const updatedOwnerDraft = await propertySubmissionService.updateDraft(ownerDraft.id, ownerCustomerId, {
    payload: {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
      location: {
        city: 'Kolkata',
        locality: 'Ballygunge',
        address: '12 Ballygunge Circular Road, Kolkata 700019',
        projectName: 'Ballygunge Enclave',
      },
      details: {
        configuration: '3 BHK',
        bedroomCount: 3,
        bathroomCount: 3,
        carpetArea: 1580,
        builtUpArea: 1920,
        askingPrice: 21000000,
        furnishing: 'SEMI_FURNISHED',
        possession: 'READY_TO_MOVE',
        facing: 'South',
        description: 'Meticulously maintained 3 BHK residence with Italian marble flooring.',
      },
      photos: validPhotos,
      consent: {
        ownerDeclarationAccepted: true,
        declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
        attestationVersion: CANONICAL_ATTESTATION_VERSION,
      },
    },
  });
  assert.equal(updatedOwnerDraft.submissionStatus, 'DRAFT');

  // Owner submits final wizard payload
  const submittedOwnerRecord = await propertySubmissionService.submitForReview(
    ownerDraft.id,
    ownerCustomerId
  );

  assert.equal(submittedOwnerRecord.submissionStatus, 'SUBMITTED');
  assert.ok(submittedOwnerRecord.submittedAt);
  assert.equal(submittedOwnerRecord.resaleListingId, null);
  assert.equal(submittedOwnerRecord.rentalListingId, null);

  // 4d. Duplicate submission prevention: cannot submit an already SUBMITTED record
  await assert.rejects(
    async () => {
      await propertySubmissionService.submitForReview(ownerDraft.id, ownerCustomerId);
    },
    (err: any) => err.message.includes('Cannot submit property from status SUBMITTED')
  );

  // 4e. Active Partner creates and submits a RENTAL INDEPENDENT_HOUSE with consent attestation
  const partnerDraft = await propertySubmissionService.createDraft(activePartnerCustomerId, {
    listingType: 'RENTAL',
    listingSource: 'PARTNER',
    payload: {
      listingType: 'RENTAL',
      listingSource: 'PARTNER',
      propertyType: 'INDEPENDENT_HOUSE',
    },
  });
  assert.equal(partnerDraft.submissionStatus, 'DRAFT');
  assert.equal(partnerDraft.listingSource, 'PARTNER');

  const submittedPartnerRecord = await propertySubmissionService.submitForReview(
    partnerDraft.id,
    activePartnerCustomerId,
    {
      listingType: 'RENTAL',
      listingSource: 'PARTNER',
      propertyType: 'INDEPENDENT_HOUSE',
      location: {
        city: 'Kolkata',
        locality: 'Salt Lake',
        address: 'Sector II, Salt Lake City, Kolkata 700091',
      },
      details: {
        configuration: '4 BHK',
        bedroomCount: 4,
        bathroomCount: 4,
        builtUpArea: 3200,
        monthlyRent: 85000,
        securityDeposit: 255000,
        furnishing: 'SEMI_FURNISHED',
      },
      photos: validPhotos,
      consent: {
        partnerAttestationAccepted: true,
        declarationText: CANONICAL_PARTNER_ATTESTATION_TEXT,
        attestationVersion: CANONICAL_ATTESTATION_VERSION,
      },
    }
  );
  assert.equal(submittedPartnerRecord.submissionStatus, 'SUBMITTED');
  assert.equal(submittedPartnerRecord.listingSource, 'PARTNER');
  assert.equal(submittedPartnerRecord.resaleListingId, null);
  assert.equal(submittedPartnerRecord.rentalListingId, null);

  // Clean up test DB records if DB was used
  if (db) {
    const { eq, inArray } = await import('drizzle-orm');
    const { propertySubmissions, propertySubmissionReviews, partnerAttestations } = await import('../src/db/schema.ts');
    await db.delete(partnerAttestations).where(inArray(partnerAttestations.submissionId, [ownerDraft.id, partnerDraft.id]));
    await db.delete(propertySubmissionReviews).where(inArray(propertySubmissionReviews.submissionId, [ownerDraft.id, partnerDraft.id]));
    await db.delete(propertySubmissions).where(inArray(propertySubmissions.id, [ownerDraft.id, partnerDraft.id]));
    await db.delete(customerPartnerProfiles).where(inArray(customerPartnerProfiles.customerId, [activePartnerCustomerId, pendingPartnerCustomerId]));
    await db.delete(customers).where(inArray(customers.id, [ownerCustomerId, otherCustomerId, activePartnerCustomerId, pendingPartnerCustomerId]));
  }

  console.log('✓ End-to-end Owner & Active Partner wizard submission lifecycles verified.\n');
  console.log('=== ALL PP-04 POST PROPERTY HUB & WIZARD TESTS PASSED ===');
}

runWizardTests().catch((err) => {
  console.error('PP-04 Test Execution Failed:', err);
  process.exit(1);
});
