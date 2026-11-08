import assert from 'node:assert';
import { ResaleListingRepositoryMemory } from '../repositories/resaleRepository';
import { RentalListingRepositoryMemory } from '../repositories/rentalRepository';
import { ResaleListingService } from '../services/resaleService';
import { RentalService } from '../services/rentalService';
import {
  parseProjectResaleSearchParams,
  parseProjectRentalSearchParams,
  PROJECT_INVENTORY_PAGE_SIZE,
  PROJECT_CAROUSEL_MAX_ITEMS,
} from '../viewModels/projectInventoryViewModel';
import {
  getEligibleResaleListings,
  getEligibleRentalListings,
} from '../viewModels/projectSectionEligibility';

async function runTests() {
  console.log('Running Project Inventory Pagination, Facets, Eligibility & DTO Sanitization Tests...');

  const mockProjectService = {
    async getProjectById(id: string) {
      return {
        id,
        name: id === 'proj-1' ? 'Merlin Rise' : 'Other Project',
        slug: id === 'proj-1' ? 'merlin-rise' : 'other-project',
        locationId: null,
      };
    },
  };

  const resaleRepo = new ResaleListingRepositoryMemory();
  const rentalRepo = new RentalListingRepositoryMemory();

  const resaleService = new ResaleListingService(resaleRepo, mockProjectService);
  const rentalService = new RentalService(rentalRepo, mockProjectService);

  // Seed 11 eligible published resale listings for proj-1 (BHKs: only 2 and 3 BHK exist)
  for (let i = 1; i <= 11; i++) {
    const bhk = i % 2 === 0 ? 3 : 2;
    await resaleRepo.create({
      slug: `merlin-rise-resale-${i}`,
      projectId: 'proj-1',
      locationId: null,
      propertyType: 'APARTMENT',
      configuration: `${bhk} BHK Unit ${i}`,
      bedroomCount: bhk,
      carpetArea: 900 + i * 25,
      builtUpArea: 1100 + i * 25,
      superBuiltUpArea: 1300 + i * 25,
      askingPrice: 5000000 + i * 500000, // 55L to 1.05Cr
      furnishing: i % 3 === 0 ? 'FULLY_FURNISHED' : 'SEMI_FURNISHED',
      facing: 'EAST',
      floorCategory: i <= 5 ? 'HIGH_FLOOR' : 'MID_FLOOR',
      possession: 'READY',
      possessionDate: null,
      description: `Verified resale apartment ${i}`,
      listingPartyType: 'OWNER',
      listingPartyDisplayName: 'Owner',
      ownerName: 'Secret Owner Name',
      ownerPhone: '+919999999999',
      ownerEmail: 'secret@owner.com',
      brokerName: 'Secret Broker',
      brokerPhone: '+918888888888',
      brokerEmail: 'secret@broker.com',
      privatePhone: '+917777777777',
      privateEmail: 'private@secret.com',
      internalNotes: 'Confidential internal note',
      source: 'INTERNAL_CRM',
      crmId: 'CRM-123',
      lifecycleStatus: 'PUBLISHED',
      verificationStatus: i <= 8 ? 'VERIFIED' : 'PENDING',
      verifiedAt: i <= 8 ? new Date() : null,
      verifiedBy: i <= 8 ? 'admin' : null,
    });
  }

  // Add ineligible records that MUST be excluded:
  // 1. DRAFT listing in proj-1 (4 BHK - should NOT appear in availableBhkCounts!)
  await resaleRepo.create({
    slug: 'merlin-rise-draft-4bhk',
    projectId: 'proj-1',
    propertyType: 'APARTMENT',
    configuration: '4 BHK Draft',
    bedroomCount: 4,
    askingPrice: 12000000,
    furnishing: 'UNFURNISHED',
    facing: 'NORTH',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    lifecycleStatus: 'DRAFT',
    verificationStatus: 'VERIFIED',
  });

  // 2. Zero-price published listing in proj-1 (5 BHK - should NOT appear in availableBhkCounts!)
  await resaleRepo.create({
    slug: 'merlin-rise-zero-price',
    projectId: 'proj-1',
    propertyType: 'APARTMENT',
    configuration: '5 BHK Zero Price',
    bedroomCount: 5,
    askingPrice: 0,
    furnishing: 'UNFURNISHED',
    facing: 'NORTH',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
  });

  // 3. Another project's published listing (1 BHK in proj-2 - should NOT leak into proj-1!)
  await resaleRepo.create({
    slug: 'other-project-1bhk',
    projectId: 'proj-2',
    propertyType: 'APARTMENT',
    configuration: '1 BHK Other',
    bedroomCount: 1,
    askingPrice: 3500000,
    furnishing: 'UNFURNISHED',
    facing: 'SOUTH',
    floorCategory: 'LOWER_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
  });

  // 4. Standalone published listing (projectId: null - MUST NOT leak into proj-1 or proj-2!)
  const standaloneResale = await resaleRepo.create({
    slug: 'standalone-penthouse-resale',
    projectId: null,
    propertyType: 'PENTHOUSE',
    configuration: '3 BHK Standalone Penthouse',
    bedroomCount: 3,
    askingPrice: 16500000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'EAST',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
  });

  // TEST 1: Page 1 of Resale Inventory (pageSize = 9)
  const page1 = await resaleService.getPaginatedPublicListingsForProject('proj-1', {
    page: 1,
    pageSize: PROJECT_INVENTORY_PAGE_SIZE,
    filter: { sortBy: 'price_asc' },
  });

  assert.strictEqual(page1.facets.totalEligibleCount, 11, 'Total eligible resale count should be 11');
  assert.strictEqual(page1.facets.filteredCount, 11, 'Unfiltered count should be 11');
  assert.strictEqual(page1.facets.verifiedCount, 8, 'Verified count should be 8');
  assert.deepStrictEqual(
    page1.facets.availableBhkCounts,
    [2, 3],
    'Available BHK facets must strictly contain [2, 3] from eligible published inventory'
  );
  assert.strictEqual(page1.facets.minPrice, 5500000, 'Min price should be 55L');
  assert.strictEqual(page1.facets.maxPrice, 10500000, 'Max price should be 1.05Cr');
  assert.strictEqual(page1.items.length, 9, 'Page 1 must return 9 items');
  assert.strictEqual(page1.totalPages, 2, '11 items with pageSize 9 must have 2 pages');
  assert.strictEqual(page1.items[0].askingPrice, 5500000, 'Sorted by price_asc, first item is 55L');
  assert.strictEqual(page1.items[8].askingPrice, 9500000, '9th item is 95L');

  // TEST 2: Page 2 (Last Valid Page) of Resale Inventory
  const page2 = await resaleService.getPaginatedPublicListingsForProject('proj-1', {
    page: 2,
    pageSize: PROJECT_INVENTORY_PAGE_SIZE,
    filter: { sortBy: 'price_asc' },
  });
  assert.strictEqual(page2.page, 2, 'Page 2 should report page = 2');
  assert.strictEqual(page2.items.length, 2, 'Page 2 must return remaining 2 items');
  assert.strictEqual(page2.items[0].askingPrice, 10000000, '10th item is 1.00Cr');
  assert.strictEqual(page2.items[1].askingPrice, 10500000, '11th item is 1.05Cr');

  // TEST 2b: Page 99 Clamping (Out-of-range page must clamp to last valid page = 2)
  const page99 = await resaleService.getPaginatedPublicListingsForProject('proj-1', {
    page: 99,
    pageSize: PROJECT_INVENTORY_PAGE_SIZE,
    filter: { sortBy: 'price_asc' },
  });
  assert.strictEqual(page99.page, 2, 'Requested page 99 must clamp to totalPages (2)');
  assert.strictEqual(page99.totalPages, 2, 'Total pages remains 2');
  assert.strictEqual(page99.items.length, 2, 'Clamped page 99 must return the 2 items from the last valid page');
  assert.strictEqual(page99.items[0].askingPrice, 10000000);
  assert.strictEqual(page99.items[1].askingPrice, 10500000);

  // TEST 3: Filtering by BHK, Furnishing, and Verification
  const filteredResale = await resaleService.getPaginatedPublicListingsForProject('proj-1', {
    page: 1,
    pageSize: PROJECT_INVENTORY_PAGE_SIZE,
    filter: {
      bedroomCount: 3,
      verificationStatus: 'VERIFIED',
      sortBy: 'price_desc',
    },
  });
  assert.ok(filteredResale.items.length > 0, 'Should return matching 3 BHK verified listings');
  for (const item of filteredResale.items) {
    assert.strictEqual(item.bedroomCount, 3, 'Every item must be 3 BHK');
    assert.strictEqual(item.isVerified, true, 'Every item must be verified');
    assert.strictEqual(item.project?.id, 'proj-1', 'Every item must belong to proj-1');
  }
  assert.deepStrictEqual(
    filteredResale.facets.availableBhkCounts,
    [2, 3],
    'Project-wide availableBhkCounts must remain [2, 3] even when a BHK filter is active'
  );

  // TEST 4: Public DTO Sanitization (No PII Leakage)
  const sampleDto = page1.items[0] as unknown as Record<string, unknown>;
  const forbiddenKeys = [
    'ownerName',
    'ownerPhone',
    'ownerEmail',
    'brokerName',
    'brokerPhone',
    'brokerEmail',
    'privatePhone',
    'privateEmail',
    'internalNotes',
    'source',
    'crmId',
  ];
  for (const key of forbiddenKeys) {
    assert.strictEqual(sampleDto[key], undefined, `Public DTO must not expose private field: ${key}`);
  }

  // TEST 5: Carousel capping at 6 items, Zero-Inventory Rule & Standalone Listing Exclusion
  const allPublicResale = await resaleService.listPublicListings({});
  assert.ok(
    allPublicResale.some(l => l.id === standaloneResale.id),
    'Global public resale listings must still include standalone (projectId: null) listing'
  );
  const globalEligible = getEligibleResaleListings(allPublicResale);
  assert.ok(
    globalEligible.some(l => l.id === standaloneResale.id),
    'Global getEligibleResaleListings without projectId must include standalone listing'
  );
  const proj1EligibleFromGlobal = getEligibleResaleListings(allPublicResale, 'proj-1');
  assert.strictEqual(
    proj1EligibleFromGlobal.length,
    11,
    'Project-scoped getEligibleResaleListings(allPublicResale, "proj-1") must strictly exclude standalone and proj-2 listings'
  );
  assert.ok(
    !proj1EligibleFromGlobal.some(l => l.id === standaloneResale.id),
    'Standalone listing (projectId: null) must never leak into proj-1 inventory'
  );
  const emptyProjEligibleFromGlobal = getEligibleResaleListings(allPublicResale, 'proj-empty');
  assert.strictEqual(
    emptyProjEligibleFromGlobal.length,
    0,
    'Project with zero linked listings must have 0 eligible listings even when standalone listings exist'
  );

  const carouselSlice = proj1EligibleFromGlobal.slice(0, PROJECT_CAROUSEL_MAX_ITEMS);
  assert.strictEqual(carouselSlice.length, 6, 'Carousel must cap at maximum 6 items when 11 exist');

  // Zero-inventory check on empty rental inventory for proj-1 (including page 99 clamping on empty set)
  const emptyRentalResult = await rentalService.getPaginatedPublicListingsForProject('proj-1', {
    page: 99,
    pageSize: PROJECT_INVENTORY_PAGE_SIZE,
  });
  assert.strictEqual(emptyRentalResult.facets.totalEligibleCount, 0, 'Rental count for proj-1 is 0');
  assert.strictEqual(emptyRentalResult.page, 1, 'Empty inventory must clamp page 99 to page 1');
  assert.strictEqual(emptyRentalResult.totalPages, 1, 'Empty inventory has totalPages = 1');
  assert.strictEqual(emptyRentalResult.items.length, 0, 'Rental items for proj-1 is empty');
  assert.deepStrictEqual(emptyRentalResult.facets.availableBhkCounts, [], 'Empty inventory has no BHK facets');
  assert.strictEqual(getEligibleRentalListings(emptyRentalResult.items, 'proj-1').length, 0);

  // TEST 6: Deterministic Sorting with Identical Prices and Timestamps
  const fixedTimestamp = new Date('2025-01-15T10:00:00.000Z');
  const tieRepo = new RentalListingRepositoryMemory();
  const tieService = new RentalService(tieRepo, mockProjectService);
  const tie1 = await tieRepo.create({
    slug: 'tie-rent-1',
    projectId: 'proj-tie',
    propertyType: 'APARTMENT',
    configuration: '2 BHK Tie A',
    bedroomCount: 2,
    monthlyRent: 30000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'EAST',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
  });
  const tie2 = await tieRepo.create({
    slug: 'tie-rent-2',
    projectId: 'proj-tie',
    propertyType: 'APARTMENT',
    configuration: '2 BHK Tie B',
    bedroomCount: 2,
    monthlyRent: 30000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'EAST',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
  });
  // Force identical createdAt timestamps
  tie1.createdAt = fixedTimestamp;
  tie2.createdAt = fixedTimestamp;

  const tiePage = await tieService.getPaginatedPublicListingsForProject('proj-tie', {
    page: 1,
    pageSize: 9,
    filter: { sortBy: 'rent_asc' },
  });
  const expectedOrder = [tie1.id, tie2.id].sort((a, b) => a.localeCompare(b));
  assert.deepStrictEqual(
    tiePage.items.map(i => i.id),
    expectedOrder,
    'Listings with identical rent and timestamp must sort deterministically by ID ASC'
  );

  // TEST 7: Search Param Parsing & Canonical Possession Validation
  const parsedResale = parseProjectResaleSearchParams({
    bhk: '3',
    minPrice: '5000000',
    furnishing: 'SEMI_FURNISHED',
    possession: 'UNDER_CONSTRUCTION',
    verified: 'true',
    sort: 'price_asc',
    page: '2',
  });
  assert.strictEqual(parsedResale.filter.bedroomCount, 3);
  assert.strictEqual(parsedResale.filter.minPrice, 5000000);
  assert.strictEqual(parsedResale.filter.furnishing, 'SEMI_FURNISHED');
  assert.strictEqual(parsedResale.filter.possession, 'UNDER_CONSTRUCTION');
  assert.strictEqual(parsedResale.filter.verificationStatus, 'VERIFIED');
  assert.strictEqual(parsedResale.sortBy, 'price_asc');
  assert.strictEqual(parsedResale.page, 2);
  assert.strictEqual(parsedResale.hasActiveFilters, true);

  // Legacy unsupported possession values (WITHIN_3_MONTHS, WITHIN_6_MONTHS) must be rejected
  const legacyPossession = parseProjectResaleSearchParams({
    possession: 'WITHIN_3_MONTHS',
  });
  assert.strictEqual(
    legacyPossession.filter.possession,
    undefined,
    'Unsupported WITHIN_3_MONTHS possession must be ignored'
  );
  assert.strictEqual(legacyPossession.hasActiveFilters, false);

  const canonicalRentalPossession = parseProjectRentalSearchParams({
    possession: 'AVAILABLE_FROM_DATE',
  });
  assert.strictEqual(
    canonicalRentalPossession.filter.possession,
    'AVAILABLE_FROM_DATE',
    'Canonical AVAILABLE_FROM_DATE possession must be accepted'
  );

  const parsedRental = parseProjectRentalSearchParams({
    bhk: 'invalid',
    furnishing: 'INVALID_ENUM',
    sort: 'rent_desc',
  });
  assert.strictEqual(parsedRental.filter.bedroomCount, undefined);
  assert.strictEqual(parsedRental.filter.furnishing, undefined);
  assert.strictEqual(parsedRental.sortBy, 'rent_desc');
  assert.strictEqual(parsedRental.page, 1);
  assert.strictEqual(parsedRental.hasActiveFilters, false);

  console.log('ALL PROJECT INVENTORY PAGINATION & ELIGIBILITY TESTS PASSED!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
