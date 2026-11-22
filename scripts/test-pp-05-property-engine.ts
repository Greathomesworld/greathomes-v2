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
  validateAreaHierarchy,
  validateWizardStep,
  validateSubmissionForSubmit,
  CANONICAL_AMENITY_SLUG_SET,
  LEASE_DURATION_OPTIONS,
  NOTICE_PERIOD_OPTIONS,
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

async function runPp05Tests() {
  console.log('=== STARTING PP-05 PROPERTY INFORMATION ENGINE TESTS ===\n');

  const envRef = process.env as Record<string, string | undefined>;
  const savedNodeEnv = envRef.NODE_ENV;
  const savedVercelEnv = envRef.VERCEL_ENV;
  const savedPersistenceProvider = envRef.PERSISTENCE_PROVIDER;
  const savedDatabaseUrl = envRef.DATABASE_URL;

  try {
    envRef.NODE_ENV = 'test';
    delete envRef.VERCEL_ENV;
    delete envRef.DATABASE_URL;
    delete envRef.PERSISTENCE_PROVIDER;

    // Deterministic canonical reference lookup for isolated testing
    const LOC_RAJARHAT = 'loc-rajarhat-0001';
    const LOC_NEW_TOWN = 'loc-newtown-0002';
    const LOC_RAJARHAT_SUB = 'loc-rajarhat-sub-0003';

    const PROJ_RAJARHAT_ID = '11111111-1111-4111-8111-111111111111';
    const PROJ_NEWTOWN_ID = '22222222-2222-4222-8222-222222222222';
    const PROJ_RAJARHAT_SUB_ID = '33333333-3333-4333-8333-333333333333';
    const PROJ_NON_EXISTENT_ID = '99999999-9999-4999-8999-999999999999';

    const referenceLookup: SubmissionReferenceLookup = {
      async findProjectById(id: string) {
        if (id === PROJ_RAJARHAT_ID) {
          return { id: PROJ_RAJARHAT_ID, locationId: LOC_RAJARHAT, name: 'Merlin Rise — Sports Republic' };
        }
        if (id === PROJ_NEWTOWN_ID) {
          return { id: PROJ_NEWTOWN_ID, locationId: LOC_NEW_TOWN, name: 'PS One10' };
        }
        if (id === PROJ_RAJARHAT_SUB_ID) {
          return { id: PROJ_RAJARHAT_SUB_ID, locationId: LOC_RAJARHAT_SUB, name: 'Rajarhat Enclave' };
        }
        return null;
      },
      async findLocationById(id: string) {
        if (id === LOC_RAJARHAT) return { id: LOC_RAJARHAT, name: 'Rajarhat', parentId: null };
        if (id === LOC_NEW_TOWN) return { id: LOC_NEW_TOWN, name: 'New Town', parentId: null };
        if (id === LOC_RAJARHAT_SUB) {
          return { id: LOC_RAJARHAT_SUB, name: 'Rajarhat Main Road', parentId: LOC_RAJARHAT };
        }
        return null;
      },
      async listAmenityIdentifiers() {
        return new Set(CANONICAL_AMENITY_SLUG_SET);
      },
    };

    const repo = PropertySubmissionRepository.createForTesting({ dbResolver: () => null });
    repo.clearMemoryForTesting();
    const service = new PropertySubmissionService(repo, referenceLookup);

    const ownerId = 'cust_pp05_owner';
    const partnerId = 'cust_pp05_partner';
    const intruderId = 'cust_pp05_intruder';
    await repo.setMemoryPartnerProfileForTesting(partnerId, 'ACTIVE');

    // =========================================================================
    // 1. CROSS-FIELD AREA VALIDATION (CLIENT & SERVER PARITY)
    // =========================================================================
    console.log('1. Testing Cross-Field Area Validation (Carpet <= Built-up <= Super Built-up)...');

    // 1a. Valid strict order & boundary equality
    assert.equal(
      validateAreaHierarchy({ carpetArea: 1100, builtUpArea: 1320, superBuiltUpArea: 1580 }).valid,
      true
    );
    assert.equal(
      validateAreaHierarchy({ carpetArea: 1200, builtUpArea: 1200, superBuiltUpArea: 1200 }).valid,
      true
    );
    assert.equal(validateAreaHierarchy({ carpetArea: 1200 }).valid, true);
    assert.equal(validateAreaHierarchy({ carpetArea: 1200, superBuiltUpArea: 1450 }).valid, true);

    // 1b. carpetArea > builtUpArea fails client Step 3 and submit validation
    const carpetExceedsBuiltUpStep = validateWizardStep(3, {
      listingType: 'RESALE',
      propertyType: 'APARTMENT',
      details: {
        bedroomCount: 3,
        bathroomCount: 2,
        carpetArea: 1500,
        builtUpArea: 1300,
        askingPrice: 12000000,
      },
    });
    assert.equal(carpetExceedsBuiltUpStep.valid, false);
    assert.ok(carpetExceedsBuiltUpStep.fieldErrors?.['details.builtUpArea']);

    // 1c. builtUpArea > superBuiltUpArea fails client Step 3
    const builtUpExceedsSuperStep = validateWizardStep(3, {
      listingType: 'RESALE',
      propertyType: 'APARTMENT',
      details: {
        bedroomCount: 3,
        bathroomCount: 2,
        carpetArea: 1100,
        builtUpArea: 1700,
        superBuiltUpArea: 1500,
        askingPrice: 12000000,
      },
    });
    assert.equal(builtUpExceedsSuperStep.valid, false);
    assert.ok(builtUpExceedsSuperStep.fieldErrors?.['details.superBuiltUpArea']);

    // 1d. carpetArea > superBuiltUpArea when builtUpArea omitted
    const carpetExceedsSuperStep = validateWizardStep(3, {
      listingType: 'RESALE',
      propertyType: 'INDEPENDENT_HOUSE',
      details: {
        bedroomCount: 4,
        bathroomCount: 3,
        carpetArea: 2200,
        superBuiltUpArea: 1900,
        askingPrice: 28000000,
      },
    });
    assert.equal(carpetExceedsSuperStep.valid, false);
    assert.ok(carpetExceedsSuperStep.fieldErrors?.['details.superBuiltUpArea']);

    // 1e. Server createDraft rejects carpet > builtUp
    await assert.rejects(
      async () => {
        await service.createDraft(ownerId, {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: {
            propertyType: 'APARTMENT',
            details: {
              bedroomCount: 3,
              carpetArea: 1600,
              builtUpArea: 1400,
              askingPrice: 15000000,
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // 1f. Partial updateDraft catches area violation against previously saved carpetArea
    const partialAreaDraft = await service.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'APARTMENT',
        details: {
          bedroomCount: 3,
          bathroomCount: 2,
          carpetArea: 1400,
          askingPrice: 15000000,
        },
      },
    });

    await assert.rejects(
      async () => {
        await service.updateDraft(partialAreaDraft.id, ownerId, {
          payload: {
            details: {
              builtUpArea: 1250, // Violates previously saved carpetArea: 1400
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['details.builtUpArea']);
        return true;
      }
    );

    console.log('  ✓ Cross-field area validation enforced consistently across client & server (including partial updates).');

    // =========================================================================
    // 2. LOCALITY-PROJECT COMPATIBILITY & CUSTOM LOCALITY RULES
    // =========================================================================
    console.log('2. Testing Locality-Project Compatibility & Custom Locality Enforcement...');

    // 2a. Valid matching locality + project succeeds
    const validLocDraft = await service.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'APARTMENT',
        location: {
          city: 'Kolkata',
          locality: 'Rajarhat',
          locationId: LOC_RAJARHAT,
          address: 'Tower 4, Merlin Rise, Rajarhat Main Road',
          projectId: PROJ_RAJARHAT_ID,
          projectName: 'Merlin Rise — Sports Republic',
          isCustomLocality: false,
        },
      },
    });
    assert.ok(validLocDraft.id);

    // 2b. Hierarchical child location project under parent locality succeeds
    const hierarchicalLocDraft = await service.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'APARTMENT',
        location: {
          city: 'Kolkata',
          locality: 'Rajarhat',
          locationId: LOC_RAJARHAT,
          address: 'Block B, Rajarhat Enclave',
          projectId: PROJ_RAJARHAT_SUB_ID,
          projectName: 'Rajarhat Enclave',
          isCustomLocality: false,
        },
      },
    });
    assert.ok(hierarchicalLocDraft.id);

    // 2c. Mismatched locality + projectId rejected (New Town project inside Rajarhat locality)
    await assert.rejects(
      async () => {
        await service.updateDraft(validLocDraft.id, ownerId, {
          payload: {
            location: {
              locality: 'Rajarhat',
              locationId: LOC_RAJARHAT,
              projectId: PROJ_NEWTOWN_ID,
              isCustomLocality: false,
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['location.projectId']);
        return true;
      }
    );

    // 2d. Non-existent projectId rejected
    await assert.rejects(
      async () => {
        await service.updateDraft(validLocDraft.id, ownerId, {
          payload: {
            location: {
              locality: 'Rajarhat',
              locationId: LOC_RAJARHAT,
              projectId: PROJ_NON_EXISTENT_ID,
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        return true;
      }
    );

    // 2e. Custom locality with canonical projectId rejected on client Step 2 and server
    const customWithProjStep2 = validateWizardStep(2, {
      location: {
        city: 'Kolkata',
        locality: 'Custom Ballygunge Lane',
        address: '14 Dover Road',
        isCustomLocality: true,
        projectId: PROJ_RAJARHAT_ID,
      },
    });
    assert.equal(customWithProjStep2.valid, false);
    assert.ok(customWithProjStep2.fieldErrors?.['location.projectId']);

    await assert.rejects(
      async () => {
        await service.createDraft(ownerId, {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: {
            propertyType: 'APARTMENT',
            location: {
              city: 'Kolkata',
              locality: 'My Custom Colony',
              address: '22 Park Lane',
              isCustomLocality: true,
              projectId: PROJ_RAJARHAT_ID,
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['location.projectId']);
        return true;
      }
    );

    // 2f. Custom locality standalone (no projectId) succeeds cleanly
    const customStandaloneDraft = await service.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'INDEPENDENT_HOUSE',
        location: {
          city: 'Kolkata',
          locality: 'Jodhpur Park Extension',
          address: '45B Lake Gardens Road',
          isCustomLocality: true,
          projectId: null,
          projectName: 'Shantiniketan Bhavan',
        },
      },
    });
    assert.ok(customStandaloneDraft.id);
    console.log('  ✓ Locality-project compatibility and custom-locality standalone enforcement verified.');

    // =========================================================================
    // 3. STRUCTURED ATTRIBUTES PERSISTENCE, DEEP-MERGE & RETRIEVAL
    // =========================================================================
    console.log('3. Testing Structured Attributes Persistence, Deep-Merge & Retrieval...');

    const structuredResaleDraft = await service.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'APARTMENT',
        location: {
          city: 'Kolkata',
          locality: 'Rajarhat',
          locationId: LOC_RAJARHAT,
          address: 'Unit 9C, Merlin Rise, Rajarhat',
          projectId: PROJ_RAJARHAT_ID,
          projectName: 'Merlin Rise — Sports Republic',
          isCustomLocality: false,
        },
        details: {
          configuration: '3 BHK',
          bedroomCount: 3,
          bathroomCount: 2,
          balconies: 2,
          coveredParking: 1,
          openParking: 1,
          propertyAgeYears: 2,
          carpetArea: 1180,
          builtUpArea: 1410,
          superBuiltUpArea: 1650,
          askingPrice: 12500000,
          furnishing: 'SEMI_FURNISHED',
          facing: 'EAST',
          floorCategory: 'MID_FLOOR',
          possession: 'UNDER_CONSTRUCTION',
          possessionDate: '2026-12-31',
          amenities: ['fitness-center', 'swimming-pool', 'security-cctv', 'lift-elevator'],
          description: 'Sunlit corner apartment overlooking central park.',
        },
        photos: makePhotos(3),
      },
    });

    // Partial update modifying ONLY balconies + amenities must retain location, areas, photos, and other details!
    const updatedResale = await service.updateDraft(structuredResaleDraft.id, ownerId, {
      payload: {
        details: {
          balconies: 3,
          amenities: ['fitness-center', 'swimming-pool', 'power-backup', 'security-cctv'],
        },
      },
    });

    const retrievedResale = await service.getSubmission(updatedResale.id, ownerId);
    const rp = retrievedResale.payload as Record<string, any>;
    assert.equal(rp.location.address, 'Unit 9C, Merlin Rise, Rajarhat');
    assert.equal(rp.location.projectId, PROJ_RAJARHAT_ID);
    assert.equal(rp.details.carpetArea, 1180);
    assert.equal(rp.details.builtUpArea, 1410);
    assert.equal(rp.details.superBuiltUpArea, 1650);
    assert.equal(rp.details.balconies, 3);
    assert.equal(rp.details.coveredParking, 1);
    assert.equal(rp.details.openParking, 1);
    assert.equal(rp.details.propertyAgeYears, 2);
    assert.equal(rp.details.possessionDate, '2026-12-31');
    assert.deepEqual(rp.details.amenities, [
      'fitness-center',
      'swimming-pool',
      'power-backup',
      'security-cctv',
    ]);
    assert.equal(rp.photos.length, 3);

    // Reject arbitrary free-text amenity
    await assert.rejects(
      async () => {
        await service.updateDraft(structuredResaleDraft.id, ownerId, {
          payload: {
            details: {
              amenities: ['custom-arbitrary-free-text'],
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['details.amenities']);
        return true;
      }
    );

    // Submit Resale Apartment for review cleanly
    const submittedResale = await service.submitForReview(structuredResaleDraft.id, ownerId, {
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(submittedResale.submissionStatus, 'SUBMITTED');
    console.log('  ✓ Structured attributes persisted, deep-merged on partial updates, and submitted cleanly.');

    // =========================================================================
    // 4. RENTAL CONDITIONAL FIELDS & PARTNER FLOW
    // =========================================================================
    console.log('4. Testing Rental-Only Structured Fields & Active Partner Submission...');

    const rentalDraft = await service.createDraft(partnerId, {
      listingType: 'RENTAL',
      listingSource: 'PARTNER',
      payload: {
        propertyType: 'INDEPENDENT_HOUSE',
        location: {
          city: 'Kolkata',
          locality: 'New Town',
          locationId: LOC_NEW_TOWN,
          address: 'Plot 18, Action Area II, New Town',
          projectId: PROJ_NEWTOWN_ID,
          projectName: 'PS One10',
          isCustomLocality: false,
        },
        details: {
          configuration: '4 BHK',
          bedroomCount: 4,
          bathroomCount: 4,
          balconies: 2,
          coveredParking: 2,
          openParking: 1,
          propertyAgeYears: 4,
          carpetArea: 2100,
          builtUpArea: 2450,
          superBuiltUpArea: 2800,
          monthlyRent: 65000,
          securityDeposit: 195000,
          maintenance: 5000,
          totalFloors: 2,
          furnishing: 'FULLY_FURNISHED',
          facing: 'SOUTH',
          possession: 'READY_TO_MOVE',
          leaseDuration: LEASE_DURATION_OPTIONS[1], // '11 Months'
          noticePeriod: NOTICE_PERIOD_OPTIONS[1], // '1 Month'
          availabilityDate: '2026-12-01',
          amenities: ['power-backup', 'security-cctv', 'visitor-parking'],
        },
        photos: makePhotos(3),
        consent: { partnerAttestationAccepted: true },
      },
    });

    const submittedRental = await service.submitForReview(rentalDraft.id, partnerId);
    assert.equal(submittedRental.submissionStatus, 'SUBMITTED');
    assert.equal(submittedRental.listingSource, 'PARTNER');
    const rentalPayload = submittedRental.payload as Record<string, any>;
    assert.equal(rentalPayload.details.leaseDuration, '11 Months');
    assert.equal(rentalPayload.details.noticePeriod, '1 Month');
    assert.equal(rentalPayload.details.availabilityDate, '2026-12-01');

    // Verify Resale submission rejects rental-only fields (leaseDuration / noticePeriod / availabilityDate)
    await assert.rejects(
      async () => {
        await service.createDraft(ownerId, {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: {
            propertyType: 'APARTMENT',
            details: {
              bedroomCount: 2,
              carpetArea: 950,
              askingPrice: 8000000,
              leaseDuration: '11 Months',
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['details.leaseDuration']);
        return true;
      }
    );

    // Verify Rental submission rejects resale possessionDate
    await assert.rejects(
      async () => {
        await service.createDraft(ownerId, {
          listingType: 'RENTAL',
          listingSource: 'OWNER',
          payload: {
            propertyType: 'APARTMENT',
            details: {
              bedroomCount: 2,
              carpetArea: 950,
              monthlyRent: 28000,
              possessionDate: '2026-12-31',
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['details.possessionDate']);
        return true;
      }
    );
    console.log('  ✓ Rental terms validated exclusively for RENTAL and active PARTNER flow succeeded.');

    // =========================================================================
    // 5. PLOT CONDITIONAL EXCLUSIONS & VALIDATION
    // =========================================================================
    console.log('5. Testing Residential Plot Conditional Rules...');

    // Plot rejects apartment-only fields (bedroomCount, balconies, carpetArea, lift-elevator)
    await assert.rejects(
      async () => {
        await service.createDraft(ownerId, {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: {
            propertyType: 'PLOT',
            details: {
              plotArea: 2160,
              askingPrice: 9500000,
              bedroomCount: 3,
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['details.bedroomCount']);
        return true;
      }
    );

    await assert.rejects(
      async () => {
        await service.createDraft(ownerId, {
          listingType: 'RESALE',
          listingSource: 'OWNER',
          payload: {
            propertyType: 'PLOT',
            details: {
              plotArea: 2160,
              askingPrice: 9500000,
              amenities: ['lift-elevator'],
            },
          },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 400);
        assert.ok(err.fieldErrors?.['details.amenities']);
        return true;
      }
    );

    // Valid Plot submission with plot-compatible amenities succeeds
    const validPlotDraft = await service.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'PLOT',
        location: {
          city: 'Kolkata',
          locality: 'New Town Action Area III',
          address: 'Plot C-14, Eco Enclave',
          isCustomLocality: true,
        },
        details: {
          configuration: 'Residential Plot',
          plotArea: 2160,
          askingPrice: 9800000,
          facing: 'CORNER_PLOT',
          possession: 'READY_TO_MOVE',
          amenities: ['security-cctv', 'rainwater-harvesting', 'landscaped-gardens'],
        },
        photos: makePhotos(3),
        consent: { ownerDeclarationAccepted: true },
      },
    });
    const submittedPlot = await service.submitForReview(validPlotDraft.id, ownerId);
    assert.equal(submittedPlot.submissionStatus, 'SUBMITTED');
    const plotFullValidation = validateSubmissionForSubmit(submittedPlot.payload);
    assert.equal(plotFullValidation.success, true);
    console.log('  ✓ Residential Plot exclusions and valid Plot submission verified.');

    // =========================================================================
    // 6. AUTHORIZATION ISOLATION & FAIL-CLOSED PERSISTENCE SAFETY
    // =========================================================================
    console.log('6. Testing Ownership Isolation & Fail-Closed Persistence Guard...');

    await assert.rejects(
      async () => {
        await service.updateDraft(validLocDraft.id, intruderId, {
          payload: { details: { balconies: 1 } },
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof PropertySubmissionDomainError);
        assert.equal(err.statusCode, 404);
        return true;
      }
    );

    const failClosedRepo = new PropertySubmissionRepository({ dbResolver: () => null });
    const failClosedService = new PropertySubmissionService(failClosedRepo, referenceLookup);
    await assert.rejects(
      async () => {
        await failClosedService.createDraft(ownerId, {
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
    console.log('  ✓ Ownership isolation (404) and fail-closed persistence (503) verified.\n');

    console.log('=== ALL PP-05 PROPERTY INFORMATION ENGINE TESTS PASSED ===');
  } finally {
    if (savedNodeEnv !== undefined) envRef.NODE_ENV = savedNodeEnv;
    else delete envRef.NODE_ENV;
    if (savedVercelEnv !== undefined) envRef.VERCEL_ENV = savedVercelEnv;
    else delete envRef.VERCEL_ENV;
    if (savedPersistenceProvider !== undefined) envRef.PERSISTENCE_PROVIDER = savedPersistenceProvider;
    else delete envRef.PERSISTENCE_PROVIDER;
    if (savedDatabaseUrl !== undefined) envRef.DATABASE_URL = savedDatabaseUrl;
    else delete envRef.DATABASE_URL;
  }
}

runPp05Tests().catch((err) => {
  console.error('PP-05 Test Suite Failed:', err);
  process.exit(1);
});
