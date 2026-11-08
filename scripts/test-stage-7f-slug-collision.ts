import { ResaleListingService } from '../src/domain/projects/services/resaleService';
import { RentalService } from '../src/domain/projects/services/rentalService';

async function runStage7FTests() {
  console.log('=== RUNNING STAGE 7F SLUG COLLISION MOCKED TESTS ===\n');

  let passedCount = 0;
  let totalCount = 10;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`[PASS] Test ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] Test ${testName}`);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  const mockProjService: any = {
    getProjectById: async () => ({
      id: 'proj-1',
      name: 'Grand Residency',
      slug: 'grand-residency',
      locationId: null,
      lifecycleStatus: 'PUBLISHED',
    }),
  };

  const baseMockRepoMethods = {
    findMediaByListingId: async () => [],
    findAmenitiesByListingId: async () => [],
    findBySlug: async () => null,
  };

  // --- Test 1: Successful first insert (Resale) ---
  {
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async (data: any) => ({
        id: 'resale-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    const result = await service.createListing({
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      askingPrice: 15000000,
      listingPartyType: 'OWNER',
      projectId: 'proj-1',
    } as any);
    assert(result.id === 'resale-1' && Boolean(result.slug), '1. Successful first insert');
  }

  // --- Test 2: Resale exact constraint collision followed by successful retry ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async (data: any) => {
        createAttempts++;
        if (createAttempts === 1) {
          const err: any = new Error('Unique violation');
          err.code = '23505';
          err.constraint = 'uq_resale_listings_slug_not_null';
          throw err;
        }
        return {
          id: 'resale-retry',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    const result = await service.createListing({
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      askingPrice: 15000000,
      listingPartyType: 'OWNER',
      projectId: 'proj-1',
    } as any);
    assert(createAttempts === 2 && result.id === 'resale-retry', '2. Resale exact constraint collision followed by successful retry');
  }

  // --- Test 3: Rental exact constraint collision followed by successful retry ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async (data: any) => {
        createAttempts++;
        if (createAttempts === 1) {
          const err: any = new Error('Unique violation');
          err.code = '23505';
          err.constraint = 'uq_rental_listings_slug_not_null';
          throw err;
        }
        return {
          id: 'rental-retry',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
      },
    };
    const service = new RentalService(mockRepo, mockProjService);
    const result = await service.createListing({
      propertyType: 'APARTMENT',
      configuration: '2 BHK',
      bedroomCount: 2,
      monthlyRent: 45000,
      furnishing: 'FULLY_FURNISHED',
      listingPartyType: 'OWNER',
      projectId: 'proj-1',
    } as any);
    assert(createAttempts === 2 && result.id === 'rental-retry', '3. Rental exact constraint collision followed by successful retry');
  }

  // --- Test 4: Second collision stops after two attempts ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async () => {
        createAttempts++;
        const err: any = new Error('Persistent collision');
        err.code = '23505';
        err.constraint = 'uq_resale_listings_slug_not_null';
        throw err;
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    let threw = false;
    try {
      await service.createListing({
        propertyType: 'APARTMENT',
        configuration: '3 BHK',
        bedroomCount: 3,
        askingPrice: 15000000,
        listingPartyType: 'OWNER',
        projectId: 'proj-1',
      } as any);
    } catch {
      threw = true;
    }
    assert(threw && createAttempts === 2, '4. Second collision stops after two attempts');
  }

  // --- Test 5: Unrelated unique constraint containing the word "slug" does not retry ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async () => {
        createAttempts++;
        const err: any = new Error('Unrelated unique violation');
        err.code = '23505';
        err.constraint = 'uq_some_other_slug_field';
        err.detail = 'Key (other_slug)=(test) already exists.';
        throw err;
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    let threw = false;
    try {
      await service.createListing({
        propertyType: 'APARTMENT',
        configuration: '3 BHK',
        bedroomCount: 3,
        askingPrice: 15000000,
        listingPartyType: 'OWNER',
        projectId: 'proj-1',
      } as any);
    } catch {
      threw = true;
    }
    assert(threw && createAttempts === 1, '5. Unrelated unique constraint containing word slug does not retry');
  }

  // --- Test 6: Non-23505 error does not retry ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async () => {
        createAttempts++;
        const err: any = new Error('Database connection lost');
        err.code = '08006';
        throw err;
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    let threw = false;
    try {
      await service.createListing({
        propertyType: 'APARTMENT',
        configuration: '3 BHK',
        bedroomCount: 3,
        askingPrice: 15000000,
        listingPartyType: 'OWNER',
        projectId: 'proj-1',
      } as any);
    } catch {
      threw = true;
    }
    assert(threw && createAttempts === 1, '6. Non-23505 error does not retry');
  }

  // --- Test 7: Retry uses a different slug ---
  {
    let slugUsed1 = '';
    let slugUsed2 = '';
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async (data: any) => {
        createAttempts++;
        if (createAttempts === 1) {
          slugUsed1 = data.slug;
          const err: any = new Error('Collision');
          err.code = '23505';
          err.constraint = 'uq_resale_listings_slug_not_null';
          throw err;
        }
        slugUsed2 = data.slug;
        return {
          id: 'resale-diff-slug',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    await service.createListing({
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      askingPrice: 15000000,
      listingPartyType: 'OWNER',
      projectId: 'proj-1',
    } as any);
    assert(Boolean(slugUsed1) && Boolean(slugUsed2) && slugUsed1 !== slugUsed2, '7. Retry uses a different slug');
  }

  // --- Test 8: Actual nested driver error structure is handled correctly ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async (data: any) => {
        createAttempts++;
        if (createAttempts === 1) {
          const err: any = new Error('Nested driver error');
          err.parent = {
            code: '23505',
            constraint: 'uq_resale_listings_slug_not_null',
          };
          throw err;
        }
        return {
          id: 'resale-nested',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    const result = await service.createListing({
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      askingPrice: 15000000,
      listingPartyType: 'OWNER',
      projectId: 'proj-1',
    } as any);
    assert(createAttempts === 2 && result.id === 'resale-nested', '8. Actual nested driver error structure is handled correctly');
  }

  // --- Test 9: Missing constraint name does not trigger unsafe retry ---
  {
    let createAttempts = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async () => {
        createAttempts++;
        const err: any = new Error('Unique violation without constraint');
        err.code = '23505';
        // constraint is missing/undefined
        throw err;
      },
    };
    const service = new ResaleListingService(mockRepo, mockProjService);
    let threw = false;
    try {
      await service.createListing({
        propertyType: 'APARTMENT',
        configuration: '3 BHK',
        bedroomCount: 3,
        askingPrice: 15000000,
        listingPartyType: 'OWNER',
        projectId: 'proj-1',
      } as any);
    } catch {
      threw = true;
    }
    assert(threw && createAttempts === 1, '9. Missing constraint name does not trigger unsafe retry');
  }

  // --- Test 10: No duplicate listing is created during retry (exactly 2 create calls max) ---
  {
    let createCalls = 0;
    const mockRepo: any = {
      ...baseMockRepoMethods,
      create: async (data: any) => {
        createCalls++;
        if (createCalls === 1) {
          const err: any = new Error('Collision');
          err.code = '23505';
          err.constraint = 'uq_rental_listings_slug_not_null';
          throw err;
        }
        return {
          id: 'rental-clean',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
      },
    };
    const service = new RentalService(mockRepo, mockProjService);
    await service.createListing({
      propertyType: 'APARTMENT',
      configuration: '2 BHK',
      bedroomCount: 2,
      monthlyRent: 35000,
      furnishing: 'SEMI_FURNISHED',
      listingPartyType: 'OWNER',
      projectId: 'proj-1',
    } as any);
    assert(createCalls === 2, '10. No duplicate listing is created (exactly 2 attempts on collision)');
  }

  console.log(`\n=== ALL ${passedCount}/${totalCount} STAGE 7F MOCKED TESTS PASSED SUCCESSFULLY ===\n`);
}

runStage7FTests().catch((err) => {
  console.error('Stage 7F tests failed:', err);
  process.exit(1);
});
