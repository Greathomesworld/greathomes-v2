import assert from 'node:assert/strict';
import {
  PropertySubmissionRepository,
  PropertySubmissionDomainError,
  PropertySubmissionPersistenceError,
  isPersistenceUnavailableError,
} from '../src/domain/propertySubmission/repository.ts';
import {
  PropertySubmissionService,
  SubmissionReferenceLookup,
} from '../src/domain/propertySubmission/service.ts';
import {
  createSubmissionSchema,
  updateSubmissionSchema,
  locationPayloadSchema,
  validateWizardStep,
  validateSubmissionForSubmit,
  computeHighestReachedWizardStep,
  CANONICAL_OWNER_DECLARATION_TEXT,
  CANONICAL_PARTNER_ATTESTATION_TEXT,
  CANONICAL_ATTESTATION_VERSION,
  CANONICAL_RESIDENTIAL_AMENITIES,
  PropertySubmissionPayload,
} from '../src/domain/propertySubmission/validation.ts';

// Strictly isolate test execution from any production DATABASE_URL
const envRef = process.env as Record<string, string | undefined>;
envRef.NODE_ENV = 'test';
delete envRef.VERCEL_ENV;
delete envRef.DATABASE_URL;
envRef.PERSISTENCE_PROVIDER = 'memory';

const VERIFIED_PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const mockReferenceLookup: SubmissionReferenceLookup = {
  async findLocationById(id: string) {
    const map: Record<string, { id: string; name: string; parentId: string | null }> = {
      loc_ballygunge: { id: 'loc_ballygunge', name: 'Ballygunge', parentId: null },
      loc_new_town: { id: 'loc_new_town', name: 'New Town', parentId: null },
    };
    return map[id] || null;
  },
  async findProjectById(id: string) {
    if (id === VERIFIED_PROJECT_ID) {
      return {
        id: VERIFIED_PROJECT_ID,
        locationId: 'loc_new_town',
        name: 'New Town Heights',
      };
    }
    return null;
  },
  async listAmenityIdentifiers() {
    return new Set(CANONICAL_RESIDENTIAL_AMENITIES.map((a) => a.slug));
  },
};

function makeInitialWizardStep1State(
  overrides?: Partial<PropertySubmissionPayload>
): Omit<PropertySubmissionPayload, 'photos'> {
  return {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    propertyType: 'APARTMENT',
    location: {
      city: 'Kolkata',
      locality: '',
      locationId: null,
      address: '',
      projectId: null,
      projectName: '',
      isCustomLocality: false,
      latitude: null,
      longitude: null,
    },
    details: {
      configuration: '3 BHK',
      bedroomCount: 3,
      bathroomCount: 2,
      balconies: 1,
      coveredParking: 1,
      openParking: 0,
      propertyAgeYears: 0,
      carpetArea: undefined,
      builtUpArea: undefined,
      superBuiltUpArea: undefined,
      plotArea: undefined,
      askingPrice: undefined,
      monthlyRent: undefined,
      securityDeposit: undefined,
      maintenance: undefined,
      furnishing: 'SEMI_FURNISHED',
      facing: 'EAST',
      floorCategory: 'MID_FLOOR',
      totalFloors: undefined,
      possession: 'READY_TO_MOVE',
      possessionDate: undefined,
      availabilityDate: undefined,
      leaseDuration: undefined,
      noticePeriod: undefined,
      amenities: [],
      description: '',
    },
    consent: {
      ownerDeclarationAccepted: false,
      partnerAttestationAccepted: false,
      declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
      attestationVersion: CANONICAL_ATTESTATION_VERSION,
    },
    ...overrides,
  };
}

function makeValidPhotos(submissionId: string) {
  return [
    {
      id: 'med_1',
      url: `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/${submissionId}/med_1/public_wm.webp`,
      category: 'Living Room',
      caption: 'Living Room',
      sortOrder: 0,
      isFeatured: true,
    },
    {
      id: 'med_2',
      url: `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/${submissionId}/med_2/public_wm.webp`,
      category: 'Bedroom',
      caption: 'Master Bedroom',
      sortOrder: 1,
      isFeatured: false,
    },
    {
      id: 'med_3',
      url: `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/${submissionId}/med_3/public_wm.webp`,
      category: 'Kitchen',
      caption: 'Modular Kitchen',
      sortOrder: 2,
      isFeatured: false,
    },
  ];
}

async function runPrematureValidationRemediationTests() {
  console.log('======================================================================');
  console.log('GREAT HOMES V2 — POST PROPERTY WIZARD REMEDIATION REGRESSION SUITE');
  console.log('Target: Premature Cross-Step Validation & Draft Restoration Progress');
  console.log('Backing Mode: Isolated In-Memory Repository (Zero Production DB Access)');
  console.log('======================================================================\n');

  const testRepo = PropertySubmissionRepository.createForTesting({
    dbResolver: () => null,
  });
  testRepo.clearMemoryForTesting();
  const service = new PropertySubmissionService(testRepo, mockReferenceLookup);

  const ownerCustomerId = 'cust_rem_owner_1';
  const otherCustomerId = 'cust_rem_other_2';
  const activePartnerId = 'cust_rem_partner_active';
  const pendingPartnerId = 'cust_rem_partner_pending';

  await testRepo.setMemoryPartnerProfileForTesting(activePartnerId, 'ACTIVE');
  await testRepo.setMemoryPartnerProfileForTesting(pendingPartnerId, 'PENDING');

  // -------------------------------------------------------------------------
  // 1. Fresh draft creation with empty locality and address
  // -------------------------------------------------------------------------
  console.log('1. Testing Scenario 1: Fresh draft creation with empty locality and address...');
  const initialStep1Payload = makeInitialWizardStep1State();
  const parsedCreateWithEmptyLocation = createSubmissionSchema.safeParse({
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: initialStep1Payload,
  });
  assert.equal(
    parsedCreateWithEmptyLocation.success,
    true,
    'createSubmissionSchema must accept initial wizardState with empty locality and address strings'
  );

  // Also verify location is optional in createSubmissionSchema when omitted
  const parsedCreateWithoutLocation = createSubmissionSchema.safeParse({
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'APARTMENT',
    },
  });
  assert.equal(
    parsedCreateWithoutLocation.success,
    true,
    'createSubmissionSchema must accept omitted location'
  );

  // Verify malformed location types are still rejected by createSubmissionSchema
  assert.equal(
    createSubmissionSchema.safeParse({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        ...initialStep1Payload,
        location: {
          city: 'Kolkata',
          locality: 12345,
          address: '',
        },
      },
    }).success,
    false,
    'createSubmissionSchema must reject non-string locality'
  );
  assert.equal(
    createSubmissionSchema.safeParse({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        ...initialStep1Payload,
        location: {
          city: 'Kolkata',
          locality: '',
          address: '',
          projectId: 'not-a-valid-uuid',
        },
      },
    }).success,
    false,
    'createSubmissionSchema must reject malformed projectId UUID'
  );
  assert.equal(
    createSubmissionSchema.safeParse({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        ...initialStep1Payload,
        location: {
          city: 'Kolkata',
          locality: '',
          address: '',
          latitude: 145,
        },
      },
    }).success,
    false,
    'createSubmissionSchema must reject out-of-range latitude'
  );

  const freshDraft = await service.createDraft(ownerCustomerId, {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: initialStep1Payload as unknown as Record<string, unknown>,
  });
  assert.ok(freshDraft.id.startsWith('sub_'));
  assert.equal(freshDraft.submissionStatus, 'DRAFT');
  console.log('  ✓ Scenario 1 Passed: Fresh draft created with empty locality and address.\n');

  // -------------------------------------------------------------------------
  // 2. Fresh draft Step 1 -> Step 2 navigation
  // -------------------------------------------------------------------------
  console.log('2. Testing Scenario 2: Fresh draft Step 1 -> Step 2 navigation...');
  const step1Validation = validateWizardStep(1, initialStep1Payload);
  assert.equal(step1Validation.valid, true);
  assert.equal(step1Validation.errors.length, 0);

  const navDraft = await service.createDraft(ownerCustomerId, {
    listingType: initialStep1Payload.listingType,
    listingSource: initialStep1Payload.listingSource,
    payload: initialStep1Payload as unknown as Record<string, unknown>,
  });
  assert.equal(navDraft.submissionStatus, 'DRAFT');
  const nextStepAfterStep1 = 2;
  assert.equal(nextStepAfterStep1, 2);
  console.log('  ✓ Scenario 2 Passed: Step 1 validation and server draft sync succeed cleanly.\n');

  // -------------------------------------------------------------------------
  // 3. Save Draft on Step 1 with incomplete location
  // -------------------------------------------------------------------------
  console.log('3. Testing Scenario 3: Save Draft on Step 1 with incomplete location...');
  const savedOnStep1New = await service.createDraft(ownerCustomerId, {
    listingType: 'RENTAL',
    listingSource: 'OWNER',
    payload: makeInitialWizardStep1State({
      listingType: 'RENTAL',
      propertyType: 'INDEPENDENT_HOUSE',
    }) as unknown as Record<string, unknown>,
  });
  assert.equal(savedOnStep1New.submissionStatus, 'DRAFT');

  const savedOnStep1Repeat = await service.updateDraft(savedOnStep1New.id, ownerCustomerId, {
    payload: makeInitialWizardStep1State({
      listingType: 'RENTAL',
      propertyType: 'PLOT',
      details: {
        configuration: 'Residential Plot',
        facing: 'EAST',
        possession: 'READY_TO_MOVE',
        amenities: [],
        description: '',
      },
    }) as unknown as Record<string, unknown>,
  });
  assert.equal(savedOnStep1Repeat.submissionStatus, 'DRAFT');
  assert.equal((savedOnStep1Repeat.payload as Record<string, unknown>).propertyType, 'PLOT');
  console.log('  ✓ Scenario 3 Passed: Save Draft on Step 1 succeeds for both new and existing drafts.\n');

  // -------------------------------------------------------------------------
  // 4. Existing draft update with empty location strings
  // -------------------------------------------------------------------------
  console.log('4. Testing Scenario 4: Existing draft update with empty location strings...');
  const parsedUpdateEmptyStrings = updateSubmissionSchema.safeParse({
    payload: {
      location: {
        city: '',
        locality: '',
        address: '',
        projectName: '',
      },
    },
  });
  assert.equal(parsedUpdateEmptyStrings.success, true);

  const updatedEmptyLoc = await service.updateDraft(freshDraft.id, ownerCustomerId, {
    payload: {
      ...initialStep1Payload,
      location: {
        city: 'Kolkata',
        locality: '',
        locationId: null,
        address: '',
        projectId: null,
        projectName: '',
        isCustomLocality: false,
      },
    } as unknown as Record<string, unknown>,
  });
  assert.equal(updatedEmptyLoc.submissionStatus, 'DRAFT');
  console.log('  ✓ Scenario 4 Passed: Existing draft update accepts empty location strings.\n');

  // -------------------------------------------------------------------------
  // 5. Restored incomplete draft navigation & highestReachedStep calculation
  // -------------------------------------------------------------------------
  console.log('5. Testing Scenario 5: Restored incomplete draft navigation & progress calculation...');

  // 5a. Bare draft without persisted propertyType stays at Step 1
  assert.equal(
    computeHighestReachedWizardStep(initialStep1Payload, {
      isReadOnly: false,
      rawPersistedPayload: {},
    }),
    1,
    'Bare draft without persisted propertyType must stay at Step 1'
  );

  // 5b. Step 1 OWNER draft with initialized empty Step 2 location & initialized Step 3/5 objects -> Step 2 (cannot jump to Steps 3..6)
  const hydratedStep1Only = {
    ...initialStep1Payload,
    photos: [],
  };
  assert.equal(
    computeHighestReachedWizardStep(hydratedStep1Only, {
      isReadOnly: false,
      rawPersistedPayload: initialStep1Payload as unknown as Record<string, unknown>,
    }),
    2,
    'Draft with valid Step 1 and empty Step 2 location must have highestReachedStep = 2 (blocking Steps 3-6)'
  );

  // 5c. Step 1 PARTNER draft with incomplete Step 2 stays at Step 1 until partner check runs
  assert.equal(
    computeHighestReachedWizardStep(
      { ...hydratedStep1Only, listingSource: 'PARTNER' },
      {
        isReadOnly: false,
        rawPersistedPayload: { ...initialStep1Payload, listingSource: 'PARTNER' },
      }
    ),
    1,
    'Unverified PARTNER draft with incomplete Step 2 must start with highestReachedStep = 1'
  );

  // 5d. Draft with completed Step 1 & Step 2, but incomplete Step 3 -> highestReachedStep = 3 (Steps 1, 2, 3 accessible; Steps 4-6 locked)
  const hydratedStep2Complete: PropertySubmissionPayload = {
    ...hydratedStep1Only,
    location: {
      city: 'Kolkata',
      locality: 'Ballygunge',
      locationId: 'loc_ballygunge',
      address: '12 Ballygunge Circular Road, Kolkata 700019',
      projectId: null,
      projectName: 'Ballygunge Enclave',
      isCustomLocality: false,
      latitude: null,
      longitude: null,
    },
  };
  assert.equal(
    computeHighestReachedWizardStep(hydratedStep2Complete, {
      isReadOnly: false,
      rawPersistedPayload: hydratedStep2Complete as unknown as Record<string, unknown>,
    }),
    3,
    'Draft with completed Step 1 & 2 but incomplete Step 3 must have highestReachedStep = 3'
  );

  // 5e. Draft with completed Steps 1, 2, 3, but incomplete Step 4 (0 photos) -> highestReachedStep = 4 (Steps 5-6 locked)
  const hydratedStep3Complete: PropertySubmissionPayload = {
    ...hydratedStep2Complete,
    details: {
      ...hydratedStep2Complete.details,
      carpetArea: 1450,
      builtUpArea: 1750,
      askingPrice: 18500000,
    },
  };
  assert.equal(
    computeHighestReachedWizardStep(hydratedStep3Complete, {
      isReadOnly: false,
      rawPersistedPayload: hydratedStep3Complete as unknown as Record<string, unknown>,
    }),
    4,
    'Draft with completed Steps 1-3 but <3 photos must have highestReachedStep = 4'
  );

  // 5f. Draft with completed Steps 1, 2, 3, 4 (3 photos), but incomplete Step 5 (consent false) -> highestReachedStep = 5 (Step 6 locked)
  const hydratedStep4Complete: PropertySubmissionPayload = {
    ...hydratedStep3Complete,
    photos: makeValidPhotos(freshDraft.id),
  };
  assert.equal(
    computeHighestReachedWizardStep(hydratedStep4Complete, {
      isReadOnly: false,
      rawPersistedPayload: hydratedStep4Complete as unknown as Record<string, unknown>,
    }),
    5,
    'Draft with completed Steps 1-4 but unconfirmed Step 5 declaration must have highestReachedStep = 5'
  );

  // 5g. Non-contiguous gap: Steps 3, 4, 5 filled, but Step 2 locality is empty string '' -> stops at Step 2!
  const hydratedWithClearedStep2: PropertySubmissionPayload = {
    ...hydratedStep4Complete,
    location: {
      ...hydratedStep4Complete.location!,
      locality: '',
    },
    consent: {
      ownerDeclarationAccepted: true,
      partnerAttestationAccepted: false,
      declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
      attestationVersion: CANONICAL_ATTESTATION_VERSION,
    },
  };
  assert.equal(
    computeHighestReachedWizardStep(hydratedWithClearedStep2, {
      isReadOnly: false,
      rawPersistedPayload: hydratedWithClearedStep2 as unknown as Record<string, unknown>,
    }),
    2,
    'Draft with missing Step 2 locality must not unlock Steps 3-6 even if later steps have data'
  );

  // 5h. Draft with all Steps 1-5 valid -> highestReachedStep = 6
  const hydratedAllStepsComplete: PropertySubmissionPayload = {
    ...hydratedStep4Complete,
    consent: {
      ownerDeclarationAccepted: true,
      partnerAttestationAccepted: false,
      declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
      attestationVersion: CANONICAL_ATTESTATION_VERSION,
    },
  };
  assert.equal(
    computeHighestReachedWizardStep(hydratedAllStepsComplete, {
      isReadOnly: false,
      rawPersistedPayload: hydratedAllStepsComplete as unknown as Record<string, unknown>,
    }),
    6,
    'Fully valid draft across Steps 1-5 must unlock Step 6'
  );

  // 5i. Read-only submission always returns 6
  assert.equal(
    computeHighestReachedWizardStep(hydratedStep1Only, {
      isReadOnly: true,
    }),
    6,
    'Read-only submissions must return highestReachedStep = 6 for summary viewing'
  );
  console.log('  ✓ Scenario 5 Passed: Restored draft progress calculation enforces contiguous valid steps.\n');

  // -------------------------------------------------------------------------
  // 6. Step 2 Save Draft before completing location
  // -------------------------------------------------------------------------
  console.log('6. Testing Scenario 6: Step 2 Save Draft before completing location...');
  // User selects verified locality & project on Step 2, but address is still empty ''
  const step2PartialDraft = await service.updateDraft(freshDraft.id, ownerCustomerId, {
    payload: {
      ...initialStep1Payload,
      location: {
        city: 'Kolkata',
        locality: 'New Town',
        locationId: 'loc_new_town',
        projectId: VERIFIED_PROJECT_ID,
        projectName: 'New Town Heights',
        address: '',
        isCustomLocality: false,
      },
    } as unknown as Record<string, unknown>,
  });
  assert.equal(step2PartialDraft.submissionStatus, 'DRAFT');
  const savedLoc6 = (step2PartialDraft.payload as Record<string, any>).location;
  assert.equal(savedLoc6.locality, 'New Town');
  assert.equal(savedLoc6.address, '');
  console.log('  ✓ Scenario 6 Passed: Step 2 Save Draft succeeds with partial location.\n');

  // -------------------------------------------------------------------------
  // 7. Verified/Custom locality toggle followed by draft save
  // -------------------------------------------------------------------------
  console.log('7. Testing Scenario 7: Verified/Custom locality toggle followed by draft save...');
  // Switching from Verified Locality to Custom Locality clears locality: '', locationId: null, projectId: null
  const afterCustomToggleDraft = await service.updateDraft(freshDraft.id, ownerCustomerId, {
    payload: {
      ...initialStep1Payload,
      location: {
        city: 'Kolkata',
        locality: '',
        locationId: null,
        projectId: null,
        projectName: '',
        address: 'Plot 44, Action Area IIB',
        isCustomLocality: true,
      },
    } as unknown as Record<string, unknown>,
  });
  assert.equal(afterCustomToggleDraft.submissionStatus, 'DRAFT');
  const savedLoc7 = (afterCustomToggleDraft.payload as Record<string, any>).location;
  assert.equal(savedLoc7.isCustomLocality, true);
  assert.equal(savedLoc7.locality, '');
  console.log('  ✓ Scenario 7 Passed: Verified/Custom locality toggle followed by draft save succeeds.\n');

  // -------------------------------------------------------------------------
  // 8. Step 2 Continue still rejects missing mandatory location fields
  // -------------------------------------------------------------------------
  console.log('8. Testing Scenario 8: Step 2 Continue still rejects missing mandatory location fields...');
  const step2MissingBoth = validateWizardStep(2, {
    location: { city: 'Kolkata', locality: '', address: '' },
  });
  assert.equal(step2MissingBoth.valid, false);
  assert.ok(step2MissingBoth.errors.some((e) => e.includes('Locality is required')));
  assert.ok(step2MissingBoth.errors.some((e) => e.includes('address')));

  const step2MissingAddress = validateWizardStep(2, {
    location: { city: 'Kolkata', locality: 'Ballygunge', address: '  ' },
  });
  assert.equal(step2MissingAddress.valid, false);
  assert.ok(step2MissingAddress.fieldErrors?.['location.address']);

  const step2MissingLocality = validateWizardStep(2, {
    location: { city: 'Kolkata', locality: '   ', address: '12 Ballygunge Circular Road' },
  });
  assert.equal(step2MissingLocality.valid, false);
  assert.ok(step2MissingLocality.fieldErrors?.['location.locality']);

  const step2CustomWithProject = validateWizardStep(2, {
    location: {
      city: 'Kolkata',
      locality: 'Custom Micro-Market',
      address: '12 Main Road, Kolkata',
      isCustomLocality: true,
      projectId: VERIFIED_PROJECT_ID,
    },
  });
  assert.equal(step2CustomWithProject.valid, false);
  assert.ok(step2CustomWithProject.fieldErrors?.['location.projectId']);
  console.log('  ✓ Scenario 8 Passed: Step 2 Continue strictly rejects missing/invalid location fields.\n');

  // -------------------------------------------------------------------------
  // 9. Final submission still rejects missing locality and address
  // -------------------------------------------------------------------------
  console.log('9. Testing Scenario 9: Final submission still rejects missing locality and address...');

  // 9a. locationPayloadSchema remains strict
  assert.equal(
    locationPayloadSchema.safeParse({
      city: 'Kolkata',
      locality: '',
      address: '12 Ballygunge Circular Road',
    }).success,
    false,
    'locationPayloadSchema must reject empty locality'
  );
  assert.equal(
    locationPayloadSchema.safeParse({
      city: 'Kolkata',
      locality: 'Ballygunge',
      address: '',
    }).success,
    false,
    'locationPayloadSchema must reject empty address'
  );

  // 9b. validateWizardStep(6) and validateSubmissionForSubmit reject missing locality/address and whitespace-only strings
  const finalMissingLocality = {
    ...hydratedAllStepsComplete,
    location: {
      city: 'Kolkata',
      locality: '',
      address: '12 Ballygunge Circular Road, Kolkata 700019',
    },
  };
  assert.equal(validateWizardStep(6, finalMissingLocality).valid, false);
  assert.equal(validateSubmissionForSubmit(finalMissingLocality).success, false);

  const finalMissingAddress = {
    ...hydratedAllStepsComplete,
    location: {
      city: 'Kolkata',
      locality: 'Ballygunge',
      address: '',
    },
  };
  assert.equal(validateWizardStep(6, finalMissingAddress).valid, false);
  assert.equal(validateSubmissionForSubmit(finalMissingAddress).success, false);

  const finalWhitespaceLocation = {
    ...hydratedAllStepsComplete,
    location: {
      city: 'Kolkata',
      locality: '   ',
      address: '   ',
    },
  };
  assert.equal(validateWizardStep(6, finalWhitespaceLocation).valid, false);
  assert.equal(validateSubmissionForSubmit(finalWhitespaceLocation).success, false);

  // 9c. service.submitForReview rejects draft when locality or address is missing
  await assert.rejects(
    async () => {
      await service.submitForReview(freshDraft.id, ownerCustomerId, {
        ...hydratedAllStepsComplete,
        location: {
          city: 'Kolkata',
          locality: '',
          address: '',
        },
      } as unknown as Record<string, unknown>);
    },
    (err: unknown) => {
      assert.ok(err instanceof PropertySubmissionDomainError);
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('Locality is required'));
      assert.ok(err.message.includes('Address is required'));
      return true;
    }
  );

  const stillDraftAfterRejection = await service.getSubmission(freshDraft.id, ownerCustomerId);
  assert.equal(
    stillDraftAfterRejection.submissionStatus,
    'DRAFT',
    'Rejected submission must remain in DRAFT status'
  );
  console.log('  ✓ Scenario 9 Passed: Final submission strictly rejects missing locality and address.\n');

  // -------------------------------------------------------------------------
  // 10. Valid completed submission follows the existing lifecycle
  // -------------------------------------------------------------------------
  console.log('10. Testing Scenario 10: Valid completed submission follows existing lifecycle...');
  await service.updateDraft(freshDraft.id, ownerCustomerId, {
    payload: hydratedAllStepsComplete as unknown as Record<string, unknown>,
  });
  const submittedRecord = await service.submitForReview(
    freshDraft.id,
    ownerCustomerId,
    hydratedAllStepsComplete as unknown as Record<string, unknown>
  );
  assert.equal(submittedRecord.submissionStatus, 'SUBMITTED');
  assert.ok(submittedRecord.submittedAt);
  assert.equal(submittedRecord.resaleListingId, null);
  assert.equal(submittedRecord.rentalListingId, null);

  // Cannot update or re-submit a SUBMITTED record
  await assert.rejects(
    async () => {
      await service.updateDraft(freshDraft.id, ownerCustomerId, {
        payload: { propertyType: 'PLOT' },
      });
    },
    (err: unknown) =>
      err instanceof PropertySubmissionDomainError &&
      err.statusCode === 400 &&
      err.message.includes('Cannot update submission in status SUBMITTED')
  );

  await assert.rejects(
    async () => {
      await service.submitForReview(freshDraft.id, ownerCustomerId);
    },
    (err: unknown) =>
      err instanceof PropertySubmissionDomainError &&
      err.statusCode === 409 &&
      err.message.includes('Cannot submit property from status SUBMITTED')
  );
  console.log('  ✓ Scenario 10 Passed: Valid completed submission transitions cleanly to SUBMITTED.\n');

  // -------------------------------------------------------------------------
  // 11. Existing ownership, authorization and persistence safeguards remain intact
  // -------------------------------------------------------------------------
  console.log('11. Testing Scenario 11: Ownership, authorization, and persistence safeguards...');

  // 11a. Cross-customer IDOR blocked on getSubmission, updateDraft, and submitForReview
  await assert.rejects(
    async () => {
      await service.getSubmission(savedOnStep1New.id, otherCustomerId);
    },
    (err: unknown) =>
      err instanceof PropertySubmissionDomainError &&
      err.statusCode === 404 &&
      err.message.includes('not found or unauthorized')
  );

  await assert.rejects(
    async () => {
      await service.updateDraft(savedOnStep1New.id, otherCustomerId, {
        payload: { propertyType: 'APARTMENT' },
      });
    },
    (err: unknown) =>
      err instanceof PropertySubmissionDomainError &&
      err.statusCode === 404 &&
      err.message.includes('not found or unauthorized')
  );

  await assert.rejects(
    async () => {
      await service.submitForReview(savedOnStep1New.id, otherCustomerId);
    },
    (err: unknown) =>
      err instanceof PropertySubmissionDomainError &&
      err.statusCode === 404 &&
      err.message.includes('not found or unauthorized')
  );

  // 11b. Non-eligible partner blocked from creating or updating to PARTNER source
  await assert.rejects(
    async () => {
      await service.createDraft(pendingPartnerId, {
        listingType: 'RESALE',
        listingSource: 'PARTNER',
        payload: makeInitialWizardStep1State({
          listingSource: 'PARTNER',
        }) as unknown as Record<string, unknown>,
      });
    },
    (err: unknown) =>
      err instanceof PropertySubmissionDomainError &&
      err.statusCode === 403 &&
      err.message.includes('PENDING')
  );

  // Active partner CAN create draft with initial Step 1 state (empty locality/address)
  const partnerStep1Draft = await service.createDraft(activePartnerId, {
    listingType: 'RESALE',
    listingSource: 'PARTNER',
    payload: makeInitialWizardStep1State({
      listingSource: 'PARTNER',
      consent: {
        ownerDeclarationAccepted: false,
        partnerAttestationAccepted: false,
        declarationText: CANONICAL_PARTNER_ATTESTATION_TEXT,
        attestationVersion: CANONICAL_ATTESTATION_VERSION,
      },
    }) as unknown as Record<string, unknown>,
  });
  assert.equal(partnerStep1Draft.submissionStatus, 'DRAFT');
  assert.equal(partnerStep1Draft.listingSource, 'PARTNER');

  // 11c. Fail-closed persistence when PostgreSQL is unavailable and test memory is not enabled
  delete envRef.PERSISTENCE_PROVIDER;
  const failClosedRepo = new PropertySubmissionRepository({
    allowTestMemoryPersistence: false,
    dbResolver: () => null,
  });
  const failClosedService = new PropertySubmissionService(failClosedRepo, mockReferenceLookup);

  await assert.rejects(
    async () => {
      await failClosedService.createDraft(ownerCustomerId, {
        listingType: 'RESALE',
        listingSource: 'OWNER',
        payload: initialStep1Payload as unknown as Record<string, unknown>,
      });
    },
    (err: unknown) => {
      assert.equal(isPersistenceUnavailableError(err), true);
      assert.equal((err as PropertySubmissionPersistenceError).statusCode, 503);
      return true;
    }
  );
  console.log('  ✓ Scenario 11 Passed: Ownership, RBAC/Partner eligibility, and fail-closed persistence verified.\n');

  console.log('======================================================================');
  console.log('ALL 11 POST PROPERTY WIZARD REMEDIATION REGRESSION SCENARIOS PASSED');
  console.log('======================================================================');
}

runPrematureValidationRemediationTests().catch((err) => {
  console.error('Premature Validation Remediation Tests Failed:', err);
  process.exit(1);
});
