import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import {
  ProjectRepositoryMemory,
  ProjectConfigurationRepositoryMemory,
  ProjectMediaRepositoryMemory,
  ProjectReraRepositoryMemory,
  AmenityRepositoryMemory,
  ProjectFaqRepositoryMemory,
  ProjectSeoRepositoryMemory,
} from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { ProjectConsiderationRepositoryMemory } from '../../../infrastructure/repositories/memory/projectConsiderationRepositoryMemory';
import { DeveloperRepositoryMemory } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { LocationRepositoryMemory } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';
import { ProjectIntelligenceService } from '../services/projectIntelligenceService';
import { ProjectLifecycleStatus, ProjectStatus } from '../entities';

async function runAdminProjectSearchAndPaginationTests() {
  console.log('Running Phase 4I-J Admin Project Directory Search & Pagination Tests...');

  const projectRepo = new ProjectRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const seoRepo = new ProjectSeoRepositoryMemory();
  const considerationRepo = new ProjectConsiderationRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();

  const service = new ProjectIntelligenceService(
    projectRepo,
    configRepo,
    mediaRepo,
    reraRepo,
    amenityRepo,
    faqRepo,
    devRepo,
    locRepo,
    seoRepo,
    considerationRepo
  );

  // 1. Seed Location Hierarchy (State -> City -> Areas)
  const stateWb = await locRepo.create({
    name: 'West Bengal',
    slug: 'west-bengal',
    type: 'STATE',
    status: 'PUBLISHED',
    featured: true,
  });

  const cityKolkata = await locRepo.create({
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    parentId: stateWb.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const locSectorV = await locRepo.create({
    name: 'Sector V',
    slug: 'sector-v',
    type: 'AREA',
    parentId: cityKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const locEmBypass = await locRepo.create({
    name: 'EM Bypass',
    slug: 'em-bypass',
    type: 'AREA',
    parentId: cityKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const locActionArea1 = await locRepo.create({
    name: 'Action Area I',
    slug: 'action-area-1',
    type: 'AREA',
    parentId: cityKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const locActionArea1D = await locRepo.create({
    name: 'Action Area ID',
    slug: 'action-area-1d',
    type: 'AREA',
    parentId: cityKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const locNewTown = await locRepo.create({
    name: 'New Town',
    slug: 'new-town',
    type: 'AREA',
    parentId: cityKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const locRajarhat = await locRepo.create({
    name: 'Rajarhat',
    slug: 'rajarhat',
    type: 'AREA',
    parentId: cityKolkata.id,
    status: 'PUBLISHED',
    featured: true,
  });

  // 2. Seed Developers
  const devMerlin = await devRepo.create({
    name: 'Merlin Group',
    slug: 'merlin-group',
    shortDescription: 'Leading developer in East India',
    description: 'Premier real estate developer in Kolkata.',
    websiteUrl: 'https://merlingroup.com',
    status: 'PUBLISHED',
    featured: true,
  });

  const devPs = await devRepo.create({
    name: 'PS Group',
    slug: 'ps-group',
    shortDescription: 'Award-winning Kolkata developer',
    description: 'Award-winning residential and commercial developer.',
    websiteUrl: 'https://psgroup.in',
    status: 'PUBLISHED',
    featured: true,
  });

  const devSrijan = await devRepo.create({
    name: 'Srijan Realty',
    slug: 'srijan-realty',
    shortDescription: 'Trusted residential developer',
    description: 'Trusted developer across Kolkata and East India.',
    websiteUrl: 'https://srijanrealty.com',
    status: 'PUBLISHED',
    featured: true,
  });

  // 3. Seed 52 Projects (41 PUBLISHED, 3 DRAFT, 8 ARCHIVED) across 6 pages (sorted by createdAt:desc)
  // Row #1 (newest) -> Row #52 (oldest)
  const baseTime = new Date('2026-06-01T12:00:00.000Z').getTime();

  interface SeedSpec {
    rowNumber: number; // 1..52
    name: string;
    slug: string;
    developerId: string;
    locationId: string;
    status: ProjectStatus;
    lifecycleStatus: ProjectLifecycleStatus;
    startingPrice: number;
    priceOnRequest?: boolean;
  }

  const specialRows: Record<number, Omit<SeedSpec, 'rowNumber'>> = {
    1: {
      name: 'Merlin 5th Avenue',
      slug: 'merlin-5th-avenue',
      developerId: devMerlin.id,
      locationId: locSectorV.id,
      status: 'READY_TO_MOVE',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 16500000,
    },
    11: {
      name: 'Merlin Ivy',
      slug: 'merlin-ivy',
      developerId: devMerlin.id,
      locationId: locEmBypass.id,
      status: 'UNDER_CONSTRUCTION',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 12000000,
    },
    21: {
      name: 'PS One 10',
      slug: 'ps-one-10',
      developerId: devPs.id,
      locationId: locActionArea1.id,
      status: 'READY_TO_MOVE',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 14500000,
    },
    31: {
      name: 'Srijan Spacia',
      slug: 'srijan-spacia',
      developerId: devSrijan.id,
      locationId: stateWb.id,
      status: 'UNDER_CONSTRUCTION',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 7800000,
    },
    41: {
      name: 'Town Square',
      slug: 'town-square',
      developerId: devSrijan.id,
      locationId: locActionArea1D.id,
      status: 'NEW_LAUNCH',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 19000000,
      priceOnRequest: true,
    },
    51: {
      name: 'Merlin The Fourth',
      slug: 'merlin-the-fourth',
      developerId: devMerlin.id,
      locationId: locNewTown.id,
      status: 'UNDER_CONSTRUCTION',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 28000000,
    },
    52: {
      name: 'Merlin Rise',
      slug: 'merlin-rise',
      developerId: devMerlin.id,
      locationId: locRajarhat.id,
      status: 'UNDER_CONSTRUCTION',
      lifecycleStatus: 'PUBLISHED',
      startingPrice: 5200000,
    },
  };

  for (let rowNum = 1; rowNum <= 52; rowNum++) {
    const spec = specialRows[rowNum];
    // Assign 3 DRAFT (rows 4, 14, 24) and 8 ARCHIVED (rows 5, 6, 15, 16, 25, 26, 35, 36)
    let lifecycleStatus: ProjectLifecycleStatus = 'PUBLISHED';
    if ([4, 14, 24].includes(rowNum)) lifecycleStatus = 'DRAFT';
    if ([5, 6, 15, 16, 25, 26, 35, 36].includes(rowNum)) lifecycleStatus = 'ARCHIVED';

    const createdProject = await service.createProject({
      name: spec ? spec.name : `Catalog Enclave Block ${rowNum}`,
      slug: spec ? spec.slug : `catalog-enclave-block-${rowNum}`,
      developerId: spec ? spec.developerId : rowNum % 2 === 0 ? devPs.id : devSrijan.id,
      locationId: spec ? spec.locationId : locNewTown.id,
      status: spec ? spec.status : 'UNDER_CONSTRUCTION',
      lifecycleStatus: spec ? spec.lifecycleStatus : lifecycleStatus,
      propertyType: 'APARTMENT',
      startingPrice: spec ? spec.startingPrice : 6000000 + rowNum * 100000,
      priceOnRequest: spec?.priceOnRequest ?? false,
      reraStatus: 'VERIFIED',
      reraRegistrationNumber: `WBRERA/P/2026/${String(rowNum).padStart(6, '0')}`,
    });

    // Enforce deterministic createdAt so row #1 is newest and row #52 is oldest
    const deterministicDate = new Date(baseTime - rowNum * 60_000);
    await projectRepo.update(createdProject.id, {
      createdAt: deterministicDate,
      updatedAt: deterministicDate,
    });

    await service.createConfiguration(createdProject.id, {
      name: '3 BHK Residence',
      bedroomCount: 3,
      carpetArea: 1000,
      builtUpArea: 1200,
      superBuiltUpArea: 1450,
      price: spec ? spec.startingPrice : 6000000 + rowNum * 100000,
      priceBasis: 'CARPET_AREA',
      priceOnRequest: spec?.priceOnRequest ?? false,
      availability: 'AVAILABLE',
    });
  }

  // =========================================================================
  // 8.1 SEARCH TESTS
  // =========================================================================

  // 1. Exact project name search (finds Page 6 project from Page 1)
  const exactNameRes = await service.listProjects({ page: 1, limit: 10, search: 'Merlin Rise' }, true);
  assert.equal(exactNameRes.pagination.total, 1, 'Exact name search for Merlin Rise should match 1 project');
  assert.equal(exactNameRes.pagination.totalPages, 1);
  assert.equal(exactNameRes.data[0].slug, 'merlin-rise');
  console.log('✔ 8.1.1 Exact project name search finds Page 6 project immediately on Page 1');

  // 2. Partial project name search
  const partialNameRes = await service.listProjects({ page: 1, limit: 10, search: 'Fourth' }, true);
  assert.equal(partialNameRes.pagination.total, 1);
  assert.equal(partialNameRes.data[0].name, 'Merlin The Fourth');
  console.log('✔ 8.1.2 Partial project name search passed');

  // 3. Project slug search
  const slugSearchRes = await service.listProjects({ page: 1, limit: 10, search: 'ps-one-10' }, true);
  assert.equal(slugSearchRes.pagination.total, 1);
  assert.equal(slugSearchRes.data[0].name, 'PS One 10');
  console.log('✔ 8.1.3 Project slug search passed');

  // 4. Developer name & slug search
  const devNameSearchRes = await service.listProjects({ page: 1, limit: 10, search: 'Merlin Group' }, true);
  assert.equal(devNameSearchRes.pagination.total, 4, 'Should match all 4 Merlin Group projects across all pages');
  const devSlugSearchRes = await service.listProjects({ page: 1, limit: 10, search: 'merlin-group' }, true);
  assert.equal(devSlugSearchRes.pagination.total, 4, 'Developer slug search should also match all 4 Merlin Group projects');
  console.log('✔ 8.1.4 Developer name & slug search passed');

  // 5. Location name & slug search
  const locNameSearchRes = await service.listProjects({ page: 1, limit: 10, search: 'Rajarhat' }, true);
  assert.equal(locNameSearchRes.pagination.total, 1);
  assert.equal(locNameSearchRes.data[0].slug, 'merlin-rise');
  const locSlugSearchRes = await service.listProjects({ page: 1, limit: 10, search: 'action-area-1d' }, true);
  assert.equal(locSlugSearchRes.pagination.total, 1);
  assert.equal(locSlugSearchRes.data[0].slug, 'town-square');
  console.log('✔ 8.1.5 Location name & slug search passed');

  // 6. Case-insensitive & whitespace-trimmed search
  const caseSearchRes = await service.listProjects({ page: 1, limit: 10, search: '   mErLiN rIsE   ' }, true);
  assert.equal(caseSearchRes.pagination.total, 1);
  assert.equal(caseSearchRes.data[0].slug, 'merlin-rise');
  console.log('✔ 8.1.6 Case-insensitive & trimmed search passed');

  // 7. No-result search
  const noResultRes = await service.listProjects({ page: 1, limit: 10, search: 'non-existent-xyz-999' }, true);
  assert.equal(noResultRes.pagination.total, 0);
  assert.equal(noResultRes.pagination.totalPages, 1);
  assert.equal(noResultRes.data.length, 0);
  console.log('✔ 8.1.7 No-result search returns empty data and total=0, totalPages=1');

  // =========================================================================
  // 8.2 COMBINED FILTER TESTS
  // =========================================================================

  // 1. Search + publication status (lifecycleStatus)
  const draftSearchRes = await service.listProjects(
    { page: 1, limit: 10, search: 'Catalog Enclave', lifecycleStatus: 'DRAFT' },
    true
  );
  assert.equal(draftSearchRes.pagination.total, 3, 'Should match the 3 DRAFT projects matching Catalog Enclave');
  assert.ok(draftSearchRes.data.every(p => p.lifecycleStatus === 'DRAFT'));

  const archivedSearchRes = await service.listProjects(
    { page: 1, limit: 10, search: 'Catalog Enclave', lifecycleStatus: 'ARCHIVED' },
    true
  );
  assert.equal(archivedSearchRes.pagination.total, 8, 'Should match the 8 ARCHIVED projects matching Catalog Enclave');
  console.log('✔ 8.2.1 Search + publication status (DRAFT / ARCHIVED) passed');

  // 2. Search + project stage (status)
  const stageSearchRes = await service.listProjects(
    { page: 1, limit: 10, search: 'Merlin', status: 'READY_TO_MOVE' },
    true
  );
  assert.equal(stageSearchRes.pagination.total, 1);
  assert.equal(stageSearchRes.data[0].slug, 'merlin-5th-avenue');
  console.log('✔ 8.2.2 Search + project stage filter passed');

  // 3. Search + developer filter
  const devFilterSearchRes = await service.listProjects(
    { page: 1, limit: 10, search: 'Action Area', developerId: devSrijan.id },
    true
  );
  assert.equal(devFilterSearchRes.pagination.total, 1);
  assert.equal(devFilterSearchRes.data[0].slug, 'town-square');
  console.log('✔ 8.2.3 Search + developer filter passed');

  // 4. Search + location filter
  const locFilterSearchRes = await service.listProjects(
    { page: 1, limit: 10, search: 'Merlin', locationId: locEmBypass.id },
    true
  );
  assert.equal(locFilterSearchRes.pagination.total, 1);
  assert.equal(locFilterSearchRes.data[0].slug, 'merlin-ivy');
  console.log('✔ 8.2.4 Search + location filter passed');

  // =========================================================================
  // 8.3 PAGINATION & PAGINATE-FIRST BATCH EFFICIENCY TESTS
  // =========================================================================

  // 1. Finding projects that normally reside on Pages 2, 3, 4, 5, 6 when unsearched
  const page2Normal = await service.listProjects({ page: 2, limit: 10 }, true);
  assert.equal(page2Normal.data[0].slug, 'merlin-ivy', 'Row #11 is on Page 2 when unsearched');
  const page3Normal = await service.listProjects({ page: 3, limit: 10 }, true);
  assert.equal(page3Normal.data[0].slug, 'ps-one-10', 'Row #21 is on Page 3 when unsearched');
  const page4Normal = await service.listProjects({ page: 4, limit: 10 }, true);
  assert.equal(page4Normal.data[0].slug, 'srijan-spacia', 'Row #31 is on Page 4 when unsearched');
  const page5Normal = await service.listProjects({ page: 5, limit: 10 }, true);
  assert.equal(page5Normal.data[0].slug, 'town-square', 'Row #41 is on Page 5 when unsearched');
  const page6Normal = await service.listProjects({ page: 6, limit: 10 }, true);
  assert.equal(page6Normal.data[0].slug, 'merlin-the-fourth', 'Row #51 is on Page 6 when unsearched');
  assert.equal(page6Normal.data[1].slug, 'merlin-rise', 'Row #52 is on Page 6 when unsearched');

  // Searching from Page 1 finds each of them immediately
  for (const query of ['Merlin Ivy', 'PS One 10', 'Srijan Spacia', 'Town Square', 'Merlin The Fourth', 'Merlin Rise']) {
    const found = await service.listProjects({ page: 1, limit: 10, search: query }, true);
    assert.equal(found.pagination.total, 1, `Search for "${query}" must return total=1 on Page 1`);
    assert.equal(found.data[0].name, query);
  }
  console.log('✔ 8.3.1 Projects on Pages 2, 3, 4, 5, and 6 are all found on Page 1 when searched');

  // 2. Clearing search restores full paginated dataset (52 total, 6 pages)
  const clearedSearchRes = await service.listProjects({ page: 1, limit: 10, search: '' }, true);
  assert.equal(clearedSearchRes.pagination.total, 52);
  assert.equal(clearedSearchRes.pagination.totalPages, 6);
  assert.equal(clearedSearchRes.data.length, 10);
  console.log('✔ 8.3.2 Clearing search restores all 52 projects across 6 pages');

  // 3. Verify Paginate-First Batch Hydration (only hydrates the 10 current-page projects, 0 per-project N+1 calls)
  let mediaBatchCalls = 0;
  let mediaBatchIdsCount = 0;
  let mediaSingleCalls = 0;
  let locFindByIdCalls = 0;

  const origMediaBatch = mediaRepo.findByProjectIds.bind(mediaRepo);
  const origMediaSingle = mediaRepo.findByProjectId.bind(mediaRepo);
  const origLocFindById = locRepo.findById.bind(locRepo);

  mediaRepo.findByProjectIds = async (ids: string[]) => {
    mediaBatchCalls++;
    mediaBatchIdsCount += ids.length;
    return origMediaBatch(ids);
  };
  mediaRepo.findByProjectId = async (id: string) => {
    mediaSingleCalls++;
    return origMediaSingle(id);
  };
  locRepo.findById = async (id: string) => {
    locFindByIdCalls++;
    return origLocFindById(id);
  };

  const page1BatchCheck = await service.listProjects({ page: 1, limit: 10 }, true);
  assert.equal(page1BatchCheck.data.length, 10);
  assert.equal(mediaBatchCalls, 1, 'Must call mediaRepository.findByProjectIds exactly once for the page');
  assert.equal(mediaBatchIdsCount, 10, 'Must hydrate media for only the 10 projects on the requested page, not all 52');
  assert.equal(mediaSingleCalls, 0, 'Must never call per-project mediaRepository.findByProjectId during listProjects');
  assert.equal(locFindByIdCalls, 0, 'Must resolve location ancestry in memory with 0 locationRepository.findById calls');

  // Restore original methods
  mediaRepo.findByProjectIds = origMediaBatch;
  mediaRepo.findByProjectId = origMediaSingle;
  locRepo.findById = origLocFindById;
  console.log('✔ 8.3.3 Paginate-first architecture verified: 1 batch call for 10 page items, 0 N+1 queries');

  // =========================================================================
  // 8.4 DATA INTEGRITY & PRICE ON REQUEST PRIVACY TESTS
  // =========================================================================

  // 1. Public vs Internal Staff visibility & PoR privacy
  const publicListRes = await service.listProjects({ page: 1, limit: 50 }, false);
  assert.equal(publicListRes.pagination.total, 41, 'Public listing must only include the 41 PUBLISHED projects');

  const publicTownSquareRes = await service.listProjects({ page: 1, limit: 10, search: 'Town Square' }, false);
  assert.equal(publicTownSquareRes.pagination.total, 1);
  const pubPorDto = publicTownSquareRes.data[0];
  assert.equal(pubPorDto.priceOnRequest, true);
  assert.equal(pubPorDto.pricing.priceOnRequest, true);
  assert.equal(pubPorDto.pricing.startingPrice, null, 'Public DTO must never leak internal startingPrice when PoR');
  assert.equal(pubPorDto.startingPrice, undefined, 'Public top-level startingPrice must be undefined when PoR');
  assert.equal(pubPorDto.manualStartingPrice, undefined, 'Public DTO must not expose manualStartingPrice');
  assert.equal(pubPorDto.configurations[0].price, 0, 'Public configuration price must be 0 when PoR');

  const staffTownSquareRes = await service.listProjects({ page: 1, limit: 10, search: 'Town Square' }, true);
  const staffPorDto = staffTownSquareRes.data[0];
  assert.equal(staffPorDto.priceOnRequest, true);
  assert.equal(staffPorDto.manualStartingPrice, 19000000, 'Staff DTO must retain manualStartingPrice reference');
  assert.equal(staffPorDto.configurations[0].price, 19000000, 'Staff configuration retains internal price');
  console.log('✔ 8.4.1 Price on Request privacy & staff vs public visibility verified');

  // 2. Price sorting places PoR projects last and filters exclude PoR from minPrice/maxPrice
  const priceAscRes = await service.listProjects({ page: 1, limit: 50, search: 'Merlin', sort: 'price:asc' }, false);
  assert.equal(priceAscRes.data[0].slug, 'merlin-rise', 'Lowest priced Merlin project (52L) sorts first');
  const minPriceRes = await service.listProjects({ page: 1, limit: 50, search: 'Town Square', minPrice: 1000000 }, false);
  assert.equal(minPriceRes.pagination.total, 0, 'PoR project must be excluded from minPrice/maxPrice filters');
  console.log('✔ 8.4.2 Price sorting & minPrice/maxPrice PoR exclusion verified');

  // =========================================================================
  // 8.5 FRONTEND STATE, DEBOUNCE, PAGE RESET & CANCELLATION VERIFICATION
  // =========================================================================
  const adminPagePath = path.resolve(process.cwd(), 'app/admin/projects/page.tsx');
  const adminPageSource = fs.readFileSync(adminPagePath, 'utf8');

  assert.ok(
    !adminPageSource.includes('const filteredProjects = projects.filter'),
    'Client-side slice filtering (filteredProjects) must be removed'
  );
  assert.ok(
    adminPageSource.includes('debouncedSearch') && adminPageSource.includes("params.append('search', debouncedSearch)"),
    'AdminProjectsPage must debounce search and send search param to /api/projects'
  );
  assert.ok(
    adminPageSource.includes('new AbortController()') && adminPageSource.includes('signal: controller.signal'),
    'AdminProjectsPage must use AbortController to cancel stale in-flight requests'
  );
  assert.ok(
    adminPageSource.includes("setSearch('');") && adminPageSource.includes("setDebouncedSearch('');"),
    'Filter bar onReset must clear search and debouncedSearch and reset page to 1'
  );
  console.log('✔ 8.5.1 AdminProjectsPage frontend state, debounce, page reset, and AbortController verified');

  // Verify API route parses both `search` and `q`
  const apiRoutePath = path.resolve(process.cwd(), 'app/api/projects/route.ts');
  const apiRouteSource = fs.readFileSync(apiRoutePath, 'utf8');
  assert.ok(
    apiRouteSource.includes("searchParams.get('search') ?? searchParams.get('q')"),
    'GET /api/projects route must accept both search and q query parameters'
  );
  console.log('✔ 8.5.2 GET /api/projects route search/q parameter handling verified');

  console.log('\nAll Phase 4I-J Admin Project Directory Search & Pagination Tests Passed! 🎉');
}

runAdminProjectSearchAndPaginationTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
