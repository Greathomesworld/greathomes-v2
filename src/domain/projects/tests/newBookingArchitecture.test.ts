process.env.PERSISTENCE_PROVIDER = 'memory';

import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

(globalThis as unknown as { React: typeof React }).React = React;

import fs from 'node:fs';
import path from 'node:path';
import {
  CONFIGURATION_AVAILABILITY_STATUSES,
  isPubliclyBookableAvailabilityStatus,
  isValidConfigurationAvailabilityStatus,
} from '../dto/newBookingDto';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '../services/projectIntelligenceService';
import { NewBookingService, newBookingService } from '../services/newBookingService';
import { NewBookingAvailabilityRepositoryMemory } from '../repositories/newBookingRepository';
import { NewBookingAvailabilityRepositoryPostgres } from '../../../infrastructure/repositories/postgres/newBookingRepositoryPostgres';
import {
  projectConfigurationAvailabilities,
  projectConfigurations,
} from '../../../db/schema';
import { propertyDiscoveryService } from '../services/propertyDiscoveryService';
import { resaleListingService } from '../services/resaleService';
import { developerRepository } from '../../../infrastructure/repositories/developerProvider';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { auditService } from '../../audit/auditService';
import { initializeTestRunnerSecret, resetTestSandbox } from '../../../lib/testIsolationContext';
import { NewBookingSection } from '../../../components/projects/NewBookingSection';
import { mapDtoToConfigurationViewModel } from '../../../components/projects/typologies/typologyModel';
import {
  GET as getNewBookingRoute,
  POST as postNewBookingRoute,
} from '../../../../app/api/projects/[id]/new-booking/route';
import {
  PATCH as patchNewBookingRoute,
  DELETE as deleteNewBookingRoute,
} from '../../../../app/api/projects/[id]/new-booking/[availabilityId]/route';
import { GET as getBuyDiscoveryRoute } from '../../../../app/api/discovery/buy/route';

async function runPhase4IQVerification() {
  console.log('=== PHASE 4I-Q: NEW BOOKING ARCHITECTURE VERIFICATION ===');
  assert.equal(
    process.env.PERSISTENCE_PROVIDER,
    'memory',
    'Test suite must run in memory persistence mode and NEVER touch Neon PostgreSQL.'
  );

  resetTestSandbox();
  const testSecret = initializeTestRunnerSecret();
  const suffix = Date.now().toString();

  // 1. Canonical Status & Validator checks
  assert.deepEqual(
    [...CONFIGURATION_AVAILABILITY_STATUSES],
    ['AVAILABLE', 'LIMITED', 'ON_REQUEST', 'SOLD_OUT', 'NOT_AVAILABLE']
  );
  assert.equal(isValidConfigurationAvailabilityStatus('AVAILABLE'), true);
  assert.equal(isValidConfigurationAvailabilityStatus('LIMITED'), true);
  assert.equal(isValidConfigurationAvailabilityStatus('ON_REQUEST'), true);
  assert.equal(isValidConfigurationAvailabilityStatus('SOLD_OUT'), true);
  assert.equal(isValidConfigurationAvailabilityStatus('NOT_AVAILABLE'), true);
  assert.equal(isValidConfigurationAvailabilityStatus('FEW_UNITS_LEFT'), false);
  assert.equal(isPubliclyBookableAvailabilityStatus('AVAILABLE'), true);
  assert.equal(isPubliclyBookableAvailabilityStatus('LIMITED'), true);
  assert.equal(isPubliclyBookableAvailabilityStatus('ON_REQUEST'), true);
  assert.equal(isPubliclyBookableAvailabilityStatus('SOLD_OUT'), false);
  assert.equal(isPubliclyBookableAvailabilityStatus('NOT_AVAILABLE'), false);
  console.log('✔ 1. Canonical 5-status availability enum & validators verified');

  // Seed supporting developer & location
  const dev = await developerRepository.create({
    name: `Phase4IQ Builder ${suffix}`,
    slug: `phase4iq-builder-${suffix}`,
    shortDescription: 'Verified test developer',
    description: 'Verified test developer',
    websiteUrl: 'https://greathomes.co.in',
    status: 'PUBLISHED',
    featured: true,
  });

  const loc = await locationRepository.create({
    name: `New Town ${suffix}`,
    slug: `new-town-${suffix}`,
    type: 'AREA',
    status: 'PUBLISHED',
    featured: true,
  });

  // Create Published Project (Publicly Priced)
  const publishedProj = await projectIntelligenceService.createProject(
    {
      name: `Skyline Phase 4IQ ${suffix}`,
      slug: `skyline-4iq-${suffix}`,
      developerId: dev.id,
      locationId: loc.id,
      status: 'NEW_LAUNCH',
      lifecycleStatus: 'PUBLISHED',
      propertyType: 'APARTMENT',
      startingPrice: 7500000,
    },
    true
  );

  // Create Second Project (PoR / The Balmoral style)
  const balmoralProj = await projectIntelligenceService.createProject(
    {
      name: `The Balmoral Test ${suffix}`,
      slug: `the-balmoral-test-${suffix}`,
      developerId: dev.id,
      locationId: loc.id,
      status: 'READY_TO_MOVE',
      lifecycleStatus: 'PUBLISHED',
      propertyType: 'APARTMENT',
      priceOnRequest: true,
    },
    true
  );

  // Create Archived & Sold Out Projects
  const archivedProj = await projectIntelligenceService.createProject(
    {
      name: `Archived Project ${suffix}`,
      slug: `archived-4iq-${suffix}`,
      developerId: dev.id,
      locationId: loc.id,
      status: 'UNDER_CONSTRUCTION',
      lifecycleStatus: 'ARCHIVED',
      propertyType: 'APARTMENT',
      startingPrice: 6000000,
    },
    true
  );

  const draftProj = await projectIntelligenceService.createProject(
    {
      name: `Draft Project ${suffix}`,
      slug: `draft-4iq-${suffix}`,
      developerId: dev.id,
      locationId: loc.id,
      status: 'NEW_LAUNCH',
      lifecycleStatus: 'DRAFT',
      propertyType: 'APARTMENT',
      startingPrice: 6000000,
    },
    true
  );

  // 2. Fail-Closed Default on New Configurations
  const cfgDefault = await projectIntelligenceService.createConfiguration(
    publishedProj.id,
    {
      name: '2 BHK Unreviewed',
      bedroomCount: 2,
      carpetArea: 900,
      price: 7500000,
      priceBasis: 'CARPET_AREA',
    },
    true
  );
  assert.equal(cfgDefault.availability, 'NOT_AVAILABLE', 'New config must fail closed to NOT_AVAILABLE');

  const cfgAvailable = await projectIntelligenceService.createConfiguration(
    publishedProj.id,
    {
      name: '3 BHK Available',
      bedroomCount: 3,
      carpetArea: 1200,
      price: 10800000,
      priceBasis: 'CARPET_AREA',
    },
    true
  );
  const cfgLimited = await projectIntelligenceService.createConfiguration(
    publishedProj.id,
    {
      name: '3 BHK Limited',
      bedroomCount: 3,
      carpetArea: 1350,
      price: 12500000,
      priceBasis: 'CARPET_AREA',
    },
    true
  );
  const cfgOnRequest = await projectIntelligenceService.createConfiguration(
    publishedProj.id,
    {
      name: '4 BHK On Request Priced',
      bedroomCount: null,
      carpetArea: 1800,
      price: 19500000,
      priceOnRequest: false,
      priceBasis: 'CARPET_AREA',
    },
    true
  );
  const cfgSoldOut = await projectIntelligenceService.createConfiguration(
    publishedProj.id,
    {
      name: '2 BHK Sold Out',
      bedroomCount: 2,
      carpetArea: 850,
      price: 7000000,
      priceBasis: 'CARPET_AREA',
    },
    true
  );

  // PoR config (106997760 internal price must NEVER leak publicly)
  const SECRET_INTERNAL_PRICE = 106997760;
  const cfgBalmoral = await projectIntelligenceService.createConfiguration(
    balmoralProj.id,
    {
      name: 'Presidential Residence',
      bedroomCount: 5,
      carpetArea: 4200,
      price: SECRET_INTERNAL_PRICE,
      priceBasis: 'CARPET_AREA',
    },
    true
  );

  // Draft & Archived configs
  const cfgArchived = await projectIntelligenceService.createConfiguration(
    archivedProj.id,
    {
      name: 'Archived 2 BHK',
      bedroomCount: 2,
      carpetArea: 800,
      price: 6000000,
      priceBasis: 'CARPET_AREA',
    },
    true
  );
  const cfgDraft = await projectIntelligenceService.createConfiguration(
    draftProj.id,
    {
      name: 'Draft 2 BHK',
      bedroomCount: 2,
      carpetArea: 800,
      price: 6000000,
      priceBasis: 'CARPET_AREA',
    },
    true
  );

  // Before any activation, public New Booking list must be empty (fail-closed)
  const initialPublicNb = await newBookingService.getPublicNewBookingConfigurations(publishedProj.id);
  assert.equal(initialPublicNb.length, 0, 'Unreviewed configurations must NOT appear in public New Booking');
  console.log('✔ 2. Fail-closed NOT_AVAILABLE default verified');

  // 3. RBAC Matrix on /api/projects/[id]/new-booking
  const unauthPost = await postNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${publishedProj.id}/new-booking`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ configurationId: cfgAvailable.id, availabilityStatus: 'AVAILABLE' }),
    }),
    { params: Promise.resolve({ id: publishedProj.id }) }
  );
  assert.equal(unauthPost.status, 401, 'Unauthenticated availability update must return 401');

  const salesManagerPost = await postNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${publishedProj.id}/new-booking`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-staff-test-token': testSecret,
        'x-staff-role': 'SALES_MANAGER',
      },
      body: JSON.stringify({ configurationId: cfgAvailable.id, availabilityStatus: 'AVAILABLE' }),
    }),
    { params: Promise.resolve({ id: publishedProj.id }) }
  );
  assert.equal(salesManagerPost.status, 403, 'SALES_MANAGER lacks MANAGE_CONFIGURATIONS and must receive 403');

  // Legacy/invalid status rejected with 400
  const invalidStatusPost = await postNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${publishedProj.id}/new-booking`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-staff-test-token': testSecret,
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({ configurationId: cfgAvailable.id, availabilityStatus: 'FEW_UNITS_LEFT' }),
    }),
    { params: Promise.resolve({ id: publishedProj.id }) }
  );
  assert.equal(invalidStatusPost.status, 400, 'Non-canonical FEW_UNITS_LEFT status must be rejected with 400');

  // Authorized roles: CONTENT_MANAGER, PROPERTY_MANAGER, ADMIN, SUPER_ADMIN
  const postWithRole = async (role: string, projectId: string, configurationId: string, availabilityStatus: string, notes?: string) => {
    return postNewBookingRoute(
      new NextRequest(`http://localhost:3000/api/projects/${projectId}/new-booking`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-staff-test-token': testSecret,
          'x-staff-role': role,
        },
        body: JSON.stringify({
          configurationId,
          availabilityStatus,
          internalNotes: notes || `PRIVATE_AUDIT_NOTE_${role}`,
          source: 'PHASE4IQ_TEST',
        }),
      }),
      { params: Promise.resolve({ id: projectId }) }
    );
  };

  const resAvail = await postWithRole('CONTENT_MANAGER', publishedProj.id, cfgAvailable.id, 'AVAILABLE', 'SECRET_NOTE_AVAIL');
  assert.equal(resAvail.status, 201, 'CONTENT_MANAGER must be authorized to update availability');
  const avJsonAvail = await resAvail.json();
  const avRecordAvail = avJsonAvail.data;

  const resLim = await postWithRole('PROPERTY_MANAGER', publishedProj.id, cfgLimited.id, 'LIMITED');
  assert.equal(resLim.status, 201, 'PROPERTY_MANAGER must be authorized to update availability');

  const resOnReq = await postWithRole('ADMIN', publishedProj.id, cfgOnRequest.id, 'ON_REQUEST');
  assert.equal(resOnReq.status, 201, 'ADMIN must be authorized to update availability');

  const resSold = await postWithRole('SUPER_ADMIN', publishedProj.id, cfgSoldOut.id, 'SOLD_OUT');
  assert.equal(resSold.status, 201, 'SUPER_ADMIN must be authorized to update availability');

  const resBalmoral = await postWithRole('ADMIN', balmoralProj.id, cfgBalmoral.id, 'AVAILABLE');
  assert.equal(resBalmoral.status, 201, 'PoR project config availability update succeeded');

  // Archived project cannot be marked AVAILABLE (400 ValidationError)
  const resArchivedFail = await postWithRole('SUPER_ADMIN', archivedProj.id, cfgArchived.id, 'AVAILABLE');
  assert.equal(resArchivedFail.status, 400, 'Activating bookable availability on ARCHIVED project must return 400');

  // Draft project CAN be saved persistently (excluded from public until published)
  const resDraftOk = await postWithRole('ADMIN', draftProj.id, cfgDraft.id, 'AVAILABLE');
  assert.equal(resDraftOk.status, 201, 'Draft project availability can be staged by admin');

  // Cross-project PATCH/DELETE rejected (400) and SALES_MANAGER PATCH/DELETE rejected (403)
  const smPatch = await patchNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${publishedProj.id}/new-booking/${avRecordAvail.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-staff-test-token': testSecret,
        'x-staff-role': 'SALES_MANAGER',
      },
      body: JSON.stringify({ availabilityStatus: 'LIMITED' }),
    }),
    { params: Promise.resolve({ id: publishedProj.id, availabilityId: avRecordAvail.id }) }
  );
  assert.equal(smPatch.status, 403, 'SALES_MANAGER PATCH must return 403');

  const crossPostRes = await postWithRole('SUPER_ADMIN', balmoralProj.id, cfgAvailable.id, 'AVAILABLE');
  assert.equal(crossPostRes.status, 404, 'Cross-project availability POST must return 404');

  const crossPatch = await patchNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${balmoralProj.id}/new-booking/${avRecordAvail.id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-staff-test-token': testSecret,
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({ availabilityStatus: 'LIMITED' }),
    }),
    { params: Promise.resolve({ id: balmoralProj.id, availabilityId: avRecordAvail.id }) }
  );
  assert.equal(crossPatch.status, 404, 'Cross-project availability PATCH must return 404 (not found in target project)');

  const smDelete = await deleteNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${publishedProj.id}/new-booking/${avRecordAvail.id}`, {
      method: 'DELETE',
      headers: {
        'x-staff-test-token': testSecret,
        'x-staff-role': 'SALES_MANAGER',
      },
    }),
    { params: Promise.resolve({ id: publishedProj.id, availabilityId: avRecordAvail.id }) }
  );
  assert.equal(smDelete.status, 403, 'SALES_MANAGER DELETE must return 403');
  console.log('✔ 3. RBAC matrix (401/403/400/404/201) & cross-project guard verified');

  // 4. Audit trail verification
  const auditLogs = await auditService.list({ resourceType: 'PROJECT_CONFIGURATION' });
  const statusAudit = auditLogs.items.find(
    (log) => log.resourceId === cfgAvailable.id && log.action === 'STATUS_CHANGED'
  );
  assert.ok(statusAudit, 'Availability update must record an audit log on PROJECT_CONFIGURATION');
  console.log('✔ 4. Audit logging verified');

  // 5. Public GET /api/projects/[id]/new-booking filtering & PoR/Internal Note privacy
  const publicNbRes = await getNewBookingRoute(
    new NextRequest(`http://localhost:3000/api/projects/${publishedProj.id}/new-booking`),
    { params: Promise.resolve({ id: publishedProj.id }) }
  );
  assert.equal(publicNbRes.status, 200);
  const publicNbJson = await publicNbRes.json();
  const publicNbData = publicNbJson.data;
  const publicNbNames = publicNbData.map((d: any) => d.name);
  assert.deepEqual(
    publicNbNames.sort(),
    ['3 BHK Available', '3 BHK Limited', '4 BHK On Request Priced'].sort(),
    'Only AVAILABLE, LIMITED, and ON_REQUEST should appear in public New Booking API'
  );
  assert.equal(JSON.stringify(publicNbData).includes('SECRET_NOTE_AVAIL'), false, 'Internal notes must never leak publicly');
  const onRequestItem = publicNbData.find((d: any) => d.name === '4 BHK On Request Priced');
  assert.equal(onRequestItem.price, 19500000, 'ON_REQUEST availability must keep pricing independent of priceOnRequest');
  assert.equal(onRequestItem.priceOnRequest, false);

  // Project detail typologies MUST still include SOLD_OUT & NOT_AVAILABLE with accurate statuses
  const projectDetail = await projectIntelligenceService.getProjectBySlug(publishedProj.slug, false);
  assert.ok(projectDetail, 'Published project must resolve by slug');
  const soldOutDetail = projectDetail.configurations.find((c) => c.id === cfgSoldOut.id);
  const unreviewedDetail = projectDetail.configurations.find((c) => c.id === cfgDefault.id);
  assert.equal(soldOutDetail?.availability, 'SOLD_OUT', 'Project detail must keep SOLD_OUT visible');
  assert.equal(unreviewedDetail?.availability, 'NOT_AVAILABLE', 'Unreviewed config must show NOT_AVAILABLE');
  const vmDefault = mapDtoToConfigurationViewModel(
    { ...unreviewedDetail!, availability: undefined },
    [],
    projectDetail.id
  );
  assert.equal(vmDefault.availability, 'NOT_AVAILABLE', 'typologyModel must fail closed to NOT_AVAILABLE');
  console.log('✔ 5. Public New Booking filter & Project Typology SOLD_OUT visibility verified');

  // 6. Discovery Service & API: full unpaginated countsByType, Balmoral PoR zero-leakage, Draft/Archived exclusion
  const resale = await resaleListingService.createListing({
    projectId: publishedProj.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK Resale',
    bedroomCount: 3,
    carpetArea: 1100,
    askingPrice: 9500000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'EAST',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    ownerName: 'Test Owner',
    ownerPhone: '+919999999999',
    ownerEmail: 'owner@test.com',
  });
  await resaleListingService.transitionLifecycle(resale.id, 'SUBMITTED');
  await resaleListingService.transitionLifecycle(resale.id, 'UNDER_REVIEW');
  await resaleListingService.transitionLifecycle(resale.id, 'APPROVED');
  await resaleListingService.transitionLifecycle(resale.id, 'PUBLISHED');

  const unifiedBuy = await propertyDiscoveryService.discoverBuy({}, 1, 2);
  assert.equal(unifiedBuy.data.length, 2, 'Page size 2 should return 2 items');
  assert.equal(unifiedBuy.pagination.total, 5, 'Unified /buy should total 5 (4 new booking + 1 resale)');
  assert.deepEqual(
    unifiedBuy.countsByType,
    { newBooking: 4, resale: 1 },
    'Unfiltered /buy countsByType must reflect full unpaginated totals across both NEW_BOOKING and RESALE'
  );

  const paginatedBuy = await propertyDiscoveryService.discoverBuy(
    { inventoryType: 'NEW_BOOKING' },
    1,
    2
  );
  assert.equal(paginatedBuy.data.length, 2, 'Page size 2 should return 2 items');
  assert.equal(paginatedBuy.pagination.total, 4, 'Total NEW_BOOKING items should be 4 (3 skyline + 1 balmoral, excluding draft/soldout/not_available)');
  assert.deepEqual(
    paginatedBuy.countsByType,
    { newBooking: 4, resale: 0 },
    'NEW_BOOKING filtered countsByType must reflect full unpaginated NEW_BOOKING total'
  );

  // Zero-leakage check on The Balmoral internal price (106997760)
  const fullBuy = await propertyDiscoveryService.discoverBuy({ inventoryType: 'NEW_BOOKING' }, 1, 20);
  const serializedDiscovery = JSON.stringify(fullBuy);
  assert.equal(
    serializedDiscovery.includes(String(SECRET_INTERNAL_PRICE)),
    false,
    'CRITICAL: Internal Balmoral price 106997760 must NEVER appear in public discovery DTO'
  );
  const balmoralCard = fullBuy.data.find(
    (d) => d.type === 'NEW_BOOKING' && d.project.slug === balmoralProj.slug
  );
  assert.ok(balmoralCard && balmoralCard.type === 'NEW_BOOKING');
  assert.equal(balmoralCard.priceOnRequest, true);
  assert.equal(balmoralCard.price, 0);
  assert.equal(balmoralCard.effectivePricePerSqft, 0);

  // Budget filter excludes PoR items
  const budgetFiltered = await propertyDiscoveryService.discoverBuy(
    { inventoryType: 'NEW_BOOKING', minPrice: 1000000, maxPrice: 500000000 },
    1,
    20
  );
  assert.equal(
    budgetFiltered.data.some((d) => d.type === 'NEW_BOOKING' && d.project.slug === balmoralProj.slug),
    false,
    'Price filter must exclude Price on Request items'
  );

  // /api/discovery/buy NaN-safe query params check
  const apiBuyRes = await getBuyDiscoveryRoute(
    new NextRequest('http://localhost:3000/api/discovery/buy?inventoryType=NEW_BOOKING&minPrice=abc&page=1&pageSize=2')
  );
  assert.equal(apiBuyRes.status, 200);
  const apiBuyJson = await apiBuyRes.json();
  assert.equal(apiBuyJson.data.length, 2);
  assert.deepEqual(apiBuyJson.countsByType, { newBooking: 4, resale: 0 });
  console.log('✔ 6. Discovery pagination, countsByType, NaN guards & Balmoral PoR zero-leakage verified');

  // 7. NewBookingSection markup checks
  const nbMarkup = renderToStaticMarkup(
    React.createElement(NewBookingSection, { configurations: publicNbData })
  );
  assert.ok(nbMarkup.includes('Limited Units'), 'LIMITED status should render Limited Units in NewBookingSection');
  assert.ok(nbMarkup.includes('On Request'), 'ON_REQUEST status should render On Request in NewBookingSection');

  const balmoralNbData = await newBookingService.getPublicNewBookingConfigurations(balmoralProj.id);
  const balmoralMarkup = renderToStaticMarkup(
    React.createElement(NewBookingSection, { configurations: balmoralNbData })
  );
  assert.ok(balmoralMarkup.includes('Price on Request'), 'PoR config should show Price on Request');
  assert.equal(balmoralMarkup.includes('onwards'), false, 'PoR config must NOT render "onwards"');
  assert.equal(balmoralMarkup.includes(String(SECRET_INTERNAL_PRICE)), false, 'PoR HTML must never contain internal price');
  console.log('✔ 7. NewBookingSection PoR & availability rendering verified');

  // 8. Rental empty-state regression
  const rentRes = await propertyDiscoveryService.discoverRent({}, 1, 12);
  assert.equal(rentRes.data.length, 0, 'Rental inventory must remain intentionally empty when 0 rental records exist');
  console.log('✔ 8. Rental empty-state behavior verified');

  // 9. Postgres Repository Explicit Error Propagation (No Silent Fallback)
  class ThrowingAvailabilityRepo extends NewBookingAvailabilityRepositoryPostgres {
    public async testFindAllError() {
      return await this.findAll();
    }
  }
  const failingRepo = new ThrowingAvailabilityRepo();
  (failingRepo as any).requireDb = () => ({
    select: () => {
      throw new Error('SIMULATED_PG_CONNECTION_FAILURE');
    },
  });
  await assert.rejects(
    async () => failingRepo.testFindAllError(),
    /SIMULATED_PG_CONNECTION_FAILURE/,
    'Postgres repository must throw explicitly instead of falling back to memory or returning []'
  );
  console.log('✔ 9. Postgres repository explicit error propagation verified');

  // 10. Database Integrity Correction Verification (Composite FK, Service & Repository Ownership)
  // 10a. Service-layer cross-project guards
  await assert.rejects(
    async () =>
      newBookingService.setConfigurationAvailability(
        balmoralProj.id,
        cfgAvailable.id,
        'AVAILABLE'
      ),
    (err: unknown) => err instanceof NotFoundError,
    'Service must reject setting availability when configuration belongs to another project'
  );

  await assert.rejects(
    async () =>
      newBookingService.deleteAvailabilityRecord(avRecordAvail.id, {
        expectedProjectId: balmoralProj.id,
      }),
    (err: unknown) => err instanceof NotFoundError,
    'Service must reject deleting availability record under wrong expectedProjectId'
  );

  // Guard if an availability record in storage ever disagrees on projectId
  const conflictingMemRepo = new NewBookingAvailabilityRepositoryMemory();
  await conflictingMemRepo.create({
    projectId: balmoralProj.id,
    configurationId: cfgAvailable.id,
    availabilityStatus: 'NOT_AVAILABLE',
    availableFrom: null,
    lastVerifiedAt: new Date(),
    updatedByStaffId: null,
    updatedByStaffName: null,
    source: 'LEGACY_CORRUPT',
    internalNotes: null,
  });
  const strictService = new NewBookingService(conflictingMemRepo, projectIntelligenceService);
  await assert.rejects(
    async () =>
      strictService.setConfigurationAvailability(publishedProj.id, cfgAvailable.id, 'AVAILABLE'),
    (err: unknown) => err instanceof ValidationError,
    'Service must reject updating when existing availability record points to a different project'
  );

  // 10b. Memory repository upsert() & update() immutability
  await assert.rejects(
    async () =>
      conflictingMemRepo.upsert({
        projectId: publishedProj.id,
        configurationId: cfgAvailable.id,
        availabilityStatus: 'AVAILABLE',
      }),
    /IntegrityError/,
    'Memory repository upsert() must reject cross-project reassignment'
  );
  const memExisting = await conflictingMemRepo.findByConfigurationId(cfgAvailable.id);
  assert.ok(memExisting);
  await assert.rejects(
    async () => conflictingMemRepo.update(memExisting.id, { projectId: publishedProj.id }),
    /IntegrityError/,
    'Memory repository update() must reject mutating projectId'
  );
  await assert.rejects(
    async () => conflictingMemRepo.update(memExisting.id, { configurationId: cfgLimited.id }),
    /IntegrityError/,
    'Memory repository update() must reject mutating configurationId'
  );

  // 10c. Postgres repository simulated upsert() / create() / update() ownership & conflictSet guards
  const PROJECT_A = '11111111-1111-4111-8111-111111111111';
  const PROJECT_B = '22222222-2222-4222-8222-222222222222';
  const CONFIG_A = '33333333-3333-4333-8333-333333333333';
  const AVAIL_ID = '44444444-4444-4444-8444-444444444444';

  const makeMockPgDb = (opts: {
    configProjectId: string;
    existingAvailabilityProjectId?: string | null;
    onConflictSetCapture?: (setArg: Record<string, unknown>) => void;
    onMutate?: () => void;
  }) => {
    const now = new Date();
    const row = {
      id: AVAIL_ID,
      projectId: opts.existingAvailabilityProjectId ?? opts.configProjectId,
      configurationId: CONFIG_A,
      availabilityStatus: 'AVAILABLE',
      availableFrom: null,
      lastVerifiedAt: now,
      updatedByStaffId: null,
      source: 'TEST',
      internalNotes: null,
      createdAt: now,
      updatedAt: now,
    };

    const buildSelect = () => ({
      from: (table: unknown) => {
        const makeResult = () => {
          if (table === projectConfigurations) {
            return [{ id: CONFIG_A, projectId: opts.configProjectId }];
          }
          if (table === projectConfigurationAvailabilities) {
            if (opts.existingAvailabilityProjectId === null) return [];
            return [{ availability: row, staffName: null, id: AVAIL_ID, projectId: row.projectId }];
          }
          return [];
        };
        const chain: any = {
          leftJoin: () => chain,
          where: () => chain,
          orderBy: () => Promise.resolve(makeResult()),
          limit: () => Promise.resolve(makeResult()),
        };
        return chain;
      },
    });

    const dbMock: any = {
      select: buildSelect,
      insert: () => ({
        values: () => ({
          onConflictDoUpdate: (arg: { target: unknown; set: Record<string, unknown> }) => {
            opts.onMutate?.();
            opts.onConflictSetCapture?.(arg.set);
            return { returning: () => Promise.resolve([row]) };
          },
          returning: () => {
            opts.onMutate?.();
            return Promise.resolve([row]);
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => {
              opts.onMutate?.();
              return Promise.resolve([row]);
            },
          }),
        }),
      }),
      transaction: async (fn: (tx: any) => Promise<any>) => fn(dbMock),
    };
    return dbMock;
  };

  const pgRepo = new NewBookingAvailabilityRepositoryPostgres();

  // Reject mismatched projectId in upsert() before any insert/update executes
  let mutatedOnMismatch = false;
  (pgRepo as any).requireDb = () =>
    makeMockPgDb({
      configProjectId: PROJECT_A,
      existingAvailabilityProjectId: null,
      onMutate: () => {
        mutatedOnMismatch = true;
      },
    });
  await assert.rejects(
    async () =>
      pgRepo.upsert({
        projectId: PROJECT_B,
        configurationId: CONFIG_A,
        availabilityStatus: 'AVAILABLE',
      }),
    /IntegrityError/,
    'Postgres upsert() must reject configuration belonging to a different project'
  );
  assert.equal(mutatedOnMismatch, false, 'Postgres upsert() must abort before executing insert/update on mismatch');

  // Reject when existing availability row in DB belongs to another project
  (pgRepo as any).requireDb = () =>
    makeMockPgDb({
      configProjectId: PROJECT_A,
      existingAvailabilityProjectId: PROJECT_B,
      onMutate: () => {
        mutatedOnMismatch = true;
      },
    });
  await assert.rejects(
    async () =>
      pgRepo.upsert({
        projectId: PROJECT_A,
        configurationId: CONFIG_A,
        availabilityStatus: 'AVAILABLE',
      }),
    /IntegrityError/,
    'Postgres upsert() must reject existing availability row belonging to a different project'
  );
  assert.equal(mutatedOnMismatch, false, 'Postgres upsert() must not overwrite existing row projectId');

  // Valid upsert() succeeds and omits projectId/configurationId from conflictUpdateSet
  let capturedConflictSet: Record<string, unknown> | undefined;
  (pgRepo as any).requireDb = () =>
    makeMockPgDb({
      configProjectId: PROJECT_A,
      existingAvailabilityProjectId: PROJECT_A,
      onConflictSetCapture: (setArg) => {
        capturedConflictSet = setArg;
      },
    });
  const validUpsertRes = await pgRepo.upsert({
    projectId: PROJECT_A,
    configurationId: CONFIG_A,
    availabilityStatus: 'AVAILABLE',
    source: 'VERIFIED_ADMIN',
  });
  assert.equal(validUpsertRes.projectId, PROJECT_A);
  assert.ok(capturedConflictSet, 'Expected conflictUpdateSet to be passed to onConflictDoUpdate');
  assert.equal('projectId' in capturedConflictSet, false, 'conflictUpdateSet must NOT contain projectId');
  assert.equal('configurationId' in capturedConflictSet, false, 'conflictUpdateSet must NOT contain configurationId');

  // Postgres create() rejects mismatched projectId
  let mutatedOnCreateMismatch = false;
  (pgRepo as any).requireDb = () =>
    makeMockPgDb({
      configProjectId: PROJECT_A,
      existingAvailabilityProjectId: null,
      onMutate: () => {
        mutatedOnCreateMismatch = true;
      },
    });
  await assert.rejects(
    async () =>
      pgRepo.create({
        projectId: PROJECT_B,
        configurationId: CONFIG_A,
        availabilityStatus: 'AVAILABLE',
        availableFrom: null,
        lastVerifiedAt: new Date(),
        updatedByStaffId: null,
        updatedByStaffName: null,
        source: 'TEST',
        internalNotes: null,
      }),
    /IntegrityError/,
    'Postgres create() must reject mismatched projectId'
  );
  assert.equal(mutatedOnCreateMismatch, false);

  // Postgres update() rejects mutating projectId or configurationId
  let mutatedOnUpdateMismatch = false;
  (pgRepo as any).requireDb = () =>
    makeMockPgDb({
      configProjectId: PROJECT_A,
      existingAvailabilityProjectId: PROJECT_A,
      onMutate: () => {
        mutatedOnUpdateMismatch = true;
      },
    });
  await assert.rejects(
    async () => pgRepo.update(AVAIL_ID, { projectId: PROJECT_B }),
    /IntegrityError/,
    'Postgres update() must reject mutating projectId'
  );
  await assert.rejects(
    async () => pgRepo.update(AVAIL_ID, { configurationId: '55555555-5555-4555-8555-555555555555' }),
    /IntegrityError/,
    'Postgres update() must reject mutating configurationId'
  );
  assert.equal(mutatedOnUpdateMismatch, false);

  // 10d. Verify migration SQL & Drizzle schema enforce composite FK integrity
  const migrationSql = fs.readFileSync(
    path.join(process.cwd(), 'drizzle/0007_new_booking_availability.sql'),
    'utf8'
  );
  assert.ok(
    migrationSql.includes('UNIQUE ("project_id", "id")'),
    'Migration 0007 must create UNIQUE ("project_id", "id") on project_configurations'
  );
  assert.ok(
    migrationSql.includes(
      'FOREIGN KEY ("project_id", "configuration_id") REFERENCES "public"."project_configurations"("project_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION'
    ),
    'Migration 0007 must enforce composite FK (project_id, configuration_id) -> project_configurations(project_id, id)'
  );
  assert.ok(
    migrationSql.includes("'NOT_AVAILABLE'::\"public\".\"configuration_availability_status\"") &&
      migrationSql.includes('ON CONFLICT ("configuration_id") DO NOTHING'),
    'Migration 0007 must initialize existing 78 configurations fail-closed as NOT_AVAILABLE'
  );
  console.log('✔ 10. Composite FK migration, schema, service & repository integrity verified');

  // ValidationError import sanity assertion
  assert.ok(new ValidationError('check') instanceof Error);

  console.log('\n🎉 ALL PHASE 4I-Q VERIFICATION CHECKS PASSED SUCCESSFULLY!');
}

runPhase4IQVerification().catch((err) => {
  console.error('❌ Phase 4I-Q verification failed:', err);
  process.exit(1);
});
