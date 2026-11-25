/**
 * Phase 2 SEO Master Remediation Regression Test Suite (F-09 & F-10)
 *
 * Verifies:
 *  - F-09A: /market dashboard eliminates per-location N+1 queries and returns exact parity metrics
 *  - F-09B: /buy/[n]-bhk-flats-in-[locality] eliminates duplicate full-catalog fetches and sequential pagination loops
 *  - F-09C: /projects/[slug], /buy/[resale-slug], and /rent/[slug] eliminate N+1 admin-DTO listing loops & PII leakage
 *  - F-09D: ISR revalidate exports exist strictly on public catalog routes with zero user/auth/transactional leakage
 *  - F-10: Project, Resale, and Rental detail pages render EXACTLY ONE semantic <h1> in the DOM with valid heading hierarchy
 *
 * Strictly memory-only — NEVER touches PostgreSQL or production data.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).React = React;

import { ensureSeedData } from '../src/infrastructure/seed';
import { locationRepository } from '../src/infrastructure/repositories/locationProvider';
import {
  projectRepository,
  projectConfigurationRepository,
  projectReraRepository,
} from '../src/infrastructure/repositories/projectProvider';
import { developerRepository } from '../src/infrastructure/repositories/developerProvider';
import { resaleListingRepository } from '../src/domain/projects/repositories/resaleRepository';
import { rentalListingRepository } from '../src/domain/projects/repositories/rentalRepository';
import { marketIntelligenceDashboardService } from '../src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService';
import { marketIntelligenceService } from '../src/domain/marketIntelligence/services/marketIntelligenceService';
import { bhkLandingService } from '../src/domain/projects/services/bhkLandingService';
import { projectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService';
import { propertyDiscoveryService } from '../src/domain/projects/services/propertyDiscoveryService';
import { resaleListingService } from '../src/domain/projects/services/resaleService';
import { rentalListingService } from '../src/domain/projects/services/rentalService';
import {
  ResaleListingDetailViewModel,
  RentalListingDetailViewModel,
} from '../src/domain/projects/viewModels/listingDetailViewModel';
import { PublicProjectDto } from '../src/domain/projects/dto/projectDto';

import { ProjectHero } from '../src/components/projects/ProjectHero';
import { ProjectInteractionProvider } from '../src/components/projects/ProjectInteractionContext';
import { VisitorTelemetryProvider } from '../src/components/telemetry/VisitorTelemetryProvider';
import { PropertyDetailHeader } from '../src/components/properties/detail/PropertyDetailHeader';
import { PropertyEnquirySidebar } from '../src/components/properties/detail/PropertyEnquirySidebar';
import { PropertyOverviewSection } from '../src/components/properties/detail/PropertyOverviewSection';
import { PropertyRentalTermsCard } from '../src/components/properties/detail/PropertyRentalTermsCard';
import { PropertySpecificationsSection } from '../src/components/properties/detail/PropertySpecificationsSection';
import { PropertyAmenitiesSection } from '../src/components/properties/detail/PropertyAmenitiesSection';
import { PropertyLocationSection } from '../src/components/properties/detail/PropertyLocationSection';
import { PropertyProjectSection } from '../src/components/properties/detail/PropertyProjectSection';
import { PropertyVerificationSection } from '../src/components/properties/detail/PropertyVerificationSection';
import { PropertySimilarSection } from '../src/components/properties/detail/PropertySimilarSection';
import { EnquiryProvider } from '../src/components/enquiry/EnquiryContext';

// Safety guard: refuse to execute against Postgres / Preview / Production
if (process.env.PERSISTENCE_PROVIDER === 'postgres' || process.env.VERCEL_ENV === 'production') {
  console.error('ABORT: Phase 2 regression suite must run in isolated memory mode only.');
  process.exit(1);
}

const ROOT = process.cwd();

function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const matches = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  return matches.map((m) => ({
    level: Number(m[1]),
    text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
}

async function seedPhase2Fixtures() {
  resaleListingRepository.enableTestMemoryPersistence(true);
  rentalListingRepository.enableTestMemoryPersistence(true);
  resaleListingRepository.clearMemoryForTesting();
  rentalListingRepository.clearMemoryForTesting();

  let locs = await locationRepository.findAll();
  if (locs.length === 0) {
    const kol = await locationRepository.create({
      name: 'Kolkata',
      slug: 'kolkata',
      type: 'CITY',
      status: 'PUBLISHED',
    } as any);
    const seedLocalities = [
      { name: 'Rajarhat', slug: 'rajarhat' },
      { name: 'New Town', slug: 'new-town' },
      { name: 'Salt Lake', slug: 'salt-lake' },
      { name: 'Ballygunge', slug: 'ballygunge' },
      { name: 'EM Bypass', slug: 'em-bypass' },
      { name: 'Joka', slug: 'joka' },
    ];
    for (const loc of seedLocalities) {
      await locationRepository.create({
        name: loc.name,
        slug: loc.slug,
        type: 'AREA',
        parentId: kol.id,
        status: 'PUBLISHED',
      } as any);
    }
    locs = await locationRepository.findAll();
  }
  const kolkata = locs.find((l) => l.slug === 'kolkata') || locs[0];
  const rajarhat = locs.find((l) => l.slug === 'rajarhat') || locs[1] || kolkata;
  const newTown = locs.find((l) => l.slug === 'new-town') || locs[2] || kolkata;

  // Ensure a published developer exists
  let devs = await developerRepository.list();
  let dev = devs.find((d) => d.status === 'PUBLISHED');
  if (!dev) {
    dev = await developerRepository.create({
      name: 'Merlin Group',
      slug: 'merlin-group-phase2',
      status: 'PUBLISHED',
      shortDescription: 'Established Kolkata residential developer.',
      description: 'Merlin Group develops residential communities across Kolkata.',
    } as any);
  }

  // Ensure >= 3 published projects with 3 BHK configurations in Kolkata / Rajarhat / New Town
  const existingProjects = await projectRepository.findAll();
  const fixtureSlugs = [
    'merlin-rise-phase2',
    'the-balmoral-phase2',
    'newtown-heights-phase2',
    'rajarhat-greens-phase2',
  ];

  const createdProjectIds: string[] = [];
  for (let i = 0; i < fixtureSlugs.length; i++) {
    const slug = fixtureSlugs[i];
    let proj = existingProjects.find((p) => p.slug === slug);
    const targetLoc = i % 2 === 0 ? rajarhat : newTown;
    if (!proj) {
      proj = await projectRepository.create({
        developerId: dev.id,
        locationId: targetLoc.id,
        name:
          i === 0
            ? 'Merlin Rise'
            : i === 1
            ? 'The Balmoral'
            : i === 2
            ? 'New Town Heights'
            : 'Rajarhat Greens',
        slug,
        shortDescription: 'Verified residential community in Kolkata.',
        description: 'Spacious 2 BHK and 3 BHK homes with modern amenities and WBRERA registration.',
        status: i % 2 === 0 ? 'UNDER_CONSTRUCTION' : 'READY_TO_MOVE',
        lifecycleStatus: 'PUBLISHED',
        propertyType: 'APARTMENT',
        startingPrice: 7500000 + i * 1000000,
        priceOnRequest: false,
        latitude: 22.62 + i * 0.01,
        longitude: 88.45 + i * 0.01,
        isPublished: true,
        featured: i === 0,
        reraStatus: 'VERIFIED',
        reraRegistrationNumber: `WBRERA/P/NOR/2026/0000${i + 1}`,
      } as any);

      await projectConfigurationRepository.create({
        projectId: proj.id,
        name: '3 BHK Classic',
        bedroomCount: 3,
        bathroomCount: 2,
        carpetArea: 1050 + i * 50,
        builtUpArea: 1280 + i * 50,
        superBuiltUpArea: 1450 + i * 50,
        price: 8500000 + i * 1000000,
        priceBasis: 'CARPET_AREA',
      } as any);

      await projectConfigurationRepository.create({
        projectId: proj.id,
        name: '2 BHK Smart',
        bedroomCount: 2,
        bathroomCount: 2,
        carpetArea: 780 + i * 30,
        builtUpArea: 950 + i * 30,
        superBuiltUpArea: 1080 + i * 30,
        price: 6200000 + i * 500000,
        priceBasis: 'CARPET_AREA',
      } as any);

      await projectReraRepository.upsert({
        projectId: proj.id,
        status: 'VERIFIED',
        authority: 'WBRERA',
        registrationNumber: `WBRERA/P/NOR/2026/0000${i + 1}`,
        verifiedAt: new Date(),
      } as any);
    }
    createdProjectIds.push(proj.id);
  }

  // Create published resale & rental listings with media (and sensitive admin PII to ensure zero leakage)
  for (let i = 0; i < 4; i++) {
    const pid = createdProjectIds[i % createdProjectIds.length];
    const loc = i % 2 === 0 ? rajarhat : newTown;
    const resale = await resaleListingRepository.create({
      slug: `merlin-resale-3bhk-p2-${i + 1}`,
      projectId: pid,
      locationId: loc.id,
      latitude: 22.62 + i * 0.005,
      longitude: 88.45 + i * 0.005,
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      carpetArea: 1080 + i * 25,
      askingPrice: 9200000 + i * 400000,
      furnishing: 'SEMI_FURNISHED',
      facing: 'SOUTH',
      floorCategory: 'MID_FLOOR',
      possession: 'READY',
      description: 'Well-ventilated 3 BHK resale apartment with covered parking.',
      listingPartyType: 'OWNER',
      ownerName: 'Private Owner Name',
      ownerPhone: '+919999999999',
      privatePhone: '+918888888888',
      internalNotes: 'CONFIDENTIAL_CRM_NOTE_DO_NOT_LEAK',
      lifecycleStatus: 'PUBLISHED',
      verificationStatus: 'VERIFIED',
    } as any);

    await resaleListingRepository.addMedia({
      resaleListingId: resale.id,
      mediaType: 'IMAGE',
      category: 'INTERIOR',
      url: `https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&sig=${i}`,
      altText: 'Living room view',
      sortOrder: 0,
      isFeatured: true,
    } as any);

    const rental = await rentalListingRepository.create({
      slug: `merlin-elements-3bhk-rental-p2-${i + 1}`,
      projectId: pid,
      locationId: loc.id,
      latitude: 22.621 + i * 0.005,
      longitude: 88.451 + i * 0.005,
      propertyType: 'APARTMENT',
      configuration: '3 BHK',
      bedroomCount: 3,
      carpetArea: 1090 + i * 20,
      monthlyRent: 34000 + i * 2500,
      maintenance: 4500,
      securityDeposit: 100000,
      furnishing: 'FULLY_FURNISHED',
      facing: 'EAST',
      floorCategory: 'HIGH_FLOOR',
      possession: 'READY',
      description: 'Fully furnished 3 BHK rental flat near Sector V and IT hubs.',
      listingPartyType: 'OWNER',
      ownerName: 'Private Landlord',
      ownerPhone: '+917777777777',
      privatePhone: '+916666666666',
      internalNotes: 'CONFIDENTIAL_RENTAL_NOTE_DO_NOT_LEAK',
      lifecycleStatus: 'PUBLISHED',
      verificationStatus: 'VERIFIED',
    } as any);

    await rentalListingRepository.addMedia({
      rentalListingId: rental.id,
      mediaType: 'IMAGE',
      category: 'INTERIOR',
      url: `https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&sig=${i}`,
      altText: 'Furnished living room',
      sortOrder: 0,
      isFeatured: true,
    } as any);
  }

  return { kolkata, rajarhat, newTown, dev, createdProjectIds };
}

async function testF09AMarketDashboardZeroNPlusOne() {
  console.log('\n--- TEST 1 (F-09A): /market Dashboard Zero-N+1 & Data Parity ---');
  marketIntelligenceDashboardService.clearCache();

  let supplyCalls = 0;
  let reraCalls = 0;
  let priceCalls = 0;
  let scopeCalls = 0;

  const origSupply = marketIntelligenceService.getSupplyMetrics.bind(marketIntelligenceService);
  const origRera = marketIntelligenceService.getReraCoverage.bind(marketIntelligenceService);
  const origPrice = marketIntelligenceService.getPriceMetrics.bind(marketIntelligenceService);
  const origScope = marketIntelligenceService.resolveLocationScopeIds.bind(marketIntelligenceService);

  marketIntelligenceService.getSupplyMetrics = (...args: any[]) => {
    supplyCalls++;
    return (origSupply as any)(...args);
  };
  marketIntelligenceService.getReraCoverage = (...args: any[]) => {
    reraCalls++;
    return (origRera as any)(...args);
  };
  marketIntelligenceService.getPriceMetrics = (...args: any[]) => {
    priceCalls++;
    return (origPrice as any)(...args);
  };
  marketIntelligenceService.resolveLocationScopeIds = (...args: any[]) => {
    scopeCalls++;
    return (origScope as any)(...args);
  };

  try {
    const dashboard = await marketIntelligenceDashboardService.getDashboardData({
      locationSlug: 'kolkata',
      scope: 'DESCENDANT',
      basis: 'CARPET_AREA',
    });

    assert.ok(dashboard.locations.length >= 3, 'Expected populated locations grid on /market');
    assert.ok(dashboard.overview.publishedProjects >= 4, 'Expected >= 4 published projects in overview');
    assert.ok(dashboard.overview.resaleHomes >= 4, 'Expected >= 4 verified resale homes in overview');
    assert.ok(dashboard.overview.rentalHomes >= 4, 'Expected >= 4 verified rental homes in overview');

    // Verify ZERO per-location N+1 fan-out
    assert.strictEqual(supplyCalls, 1, `Expected 1 getSupplyMetrics call, got ${supplyCalls}`);
    assert.strictEqual(reraCalls, 1, `Expected 1 getReraCoverage call, got ${reraCalls}`);
    assert.strictEqual(priceCalls, 1, `Expected 1 getPriceMetrics call, got ${priceCalls}`);
    assert.strictEqual(scopeCalls, 0, `Expected 0 resolveLocationScopeIds DB calls, got ${scopeCalls}`);
    const dashboardScopeCalls = scopeCalls;

    // Verify numerical parity of grid rows against direct service computation
    for (const row of dashboard.locations) {
      const locScope = ['CITY', 'DISCOVERY_REGION'].includes(row.type) ? 'DESCENDANT' : 'DIRECT';
      const directSupply = await origSupply(row.id, locScope);
      const directRera = await origRera(row.id, locScope);
      assert.strictEqual(
        row.projectsCount,
        directSupply.publishedProjects,
        `projectsCount parity mismatch for ${row.slug}`
      );
      assert.strictEqual(
        row.resaleCount,
        directSupply.resaleListingsCount,
        `resaleCount parity mismatch for ${row.slug}`
      );
      assert.strictEqual(
        row.rentalCount,
        directSupply.rentalListingsCount,
        `rentalCount parity mismatch for ${row.slug}`
      );
      assert.strictEqual(
        row.reraVerifiedCount,
        directRera.verifiedProjects,
        `reraVerifiedCount parity mismatch for ${row.slug}`
      );
    }

    console.log(
      `PASS [F-09A]: /market dashboard computed ${dashboard.locations.length} grid locations with supplyCalls=${supplyCalls}, reraCalls=${reraCalls}, priceCalls=${priceCalls}, scopeCalls=${dashboardScopeCalls} and 100% metric parity.`
    );
  } finally {
    marketIntelligenceService.getSupplyMetrics = origSupply;
    marketIntelligenceService.getReraCoverage = origRera;
    marketIntelligenceService.getPriceMetrics = origPrice;
    marketIntelligenceService.resolveLocationScopeIds = origScope;
  }
}

async function testF09BBhkLandingSingleCatalogLoad() {
  console.log('\n--- TEST 2 (F-09B): /buy/[n]-bhk-flats-in-[locality] Single Catalog Load ---');

  let listAllProjCalls = 0;
  let locFindAllCalls = 0;
  let projectRepoListCalls = 0;

  const origListAll = projectIntelligenceService.listAllProjects.bind(projectIntelligenceService);
  const origLocAll = locationRepository.findAll.bind(locationRepository);
  const origProjList = projectRepository.list.bind(projectRepository);

  projectIntelligenceService.listAllProjects = (...args: any[]) => {
    listAllProjCalls++;
    return (origListAll as any)(...args);
  };
  locationRepository.findAll = (...args: any[]) => {
    locFindAllCalls++;
    return (origLocAll as any)(...args);
  };
  projectRepository.list = (...args: any[]) => {
    projectRepoListCalls++;
    return (origProjList as any)(...args);
  };

  try {
    const bundle = await bhkLandingService.resolveBhkLandingBundle(3, 'kolkata');
    assert.ok(bundle, 'Expected valid 3 BHK Kolkata landing bundle');
    assert.ok(bundle.data.totalProjects >= 4, `Expected >= 4 matching 3 BHK projects, got ${bundle.data.totalProjects}`);
    assert.strictEqual(bundle.data.isIndexable, true, 'Expected 3 BHK Kolkata page to be indexable');
    assert.ok(bundle.relatedBhkLinks.length >= 1, 'Expected related eligible BHK links (e.g., 2 BHK Kolkata)');

    // Before Phase 2: listAllProjCalls was 2 and locFindAllCalls was 4.
    // After Phase 2: listAllProjCalls === 1, projectRepoListCalls === 1, locFindAllCalls === 2 (1 in bundle + 1 inside listAllProjects Batch A)
    assert.strictEqual(
      listAllProjCalls,
      1,
      `Expected exactly 1 listAllProjects call per BHK page, got ${listAllProjCalls}`
    );
    assert.strictEqual(
      projectRepoListCalls,
      1,
      `Expected single-pass projectRepository.list call (no pagination loop), got ${projectRepoListCalls}`
    );
    assert.ok(
      locFindAllCalls <= 2,
      `Expected <= 2 locationRepository.findAll calls (down from 4), got ${locFindAllCalls}`
    );

    console.log(
      `PASS [F-09B]: /buy/3-bhk-flats-in-kolkata resolved ${bundle.data.totalProjects} projects + ${bundle.relatedBhkLinks.length} related links with listAllProjCalls=${listAllProjCalls}, projectRepoListCalls=${projectRepoListCalls}, locFindAllCalls=${locFindAllCalls}.`
    );
  } finally {
    projectIntelligenceService.listAllProjects = origListAll;
    locationRepository.findAll = origLocAll;
    projectRepository.list = origProjList;
  }
}

async function testF09CProjectAndListingDiscoveryZeroAdminNPlusOne() {
  console.log('\n--- TEST 3 (F-09C): Project, Resale & Rental Discovery Zero Admin-DTO N+1 & Zero PII ---');

  let adminResaleCalls = 0;
  let adminRentalCalls = 0;
  let resaleSingleMediaCalls = 0;
  let rentalSingleMediaCalls = 0;
  let locFindByIdCalls = 0;

  const origResaleAdmin = resaleListingService.listAdminListings.bind(resaleListingService);
  const origRentalAdmin = rentalListingService.getAllListingsAdmin.bind(rentalListingService);
  const origResaleSingleMedia = resaleListingRepository.findMediaByListingId.bind(resaleListingRepository);
  const origRentalSingleMedia = rentalListingRepository.findMediaByListingId.bind(rentalListingRepository);
  const origLocById = locationRepository.findById.bind(locationRepository);

  resaleListingService.listAdminListings = (...args: any[]) => {
    adminResaleCalls++;
    return (origResaleAdmin as any)(...args);
  };
  rentalListingService.getAllListingsAdmin = (...args: any[]) => {
    adminRentalCalls++;
    return (origRentalAdmin as any)(...args);
  };
  resaleListingRepository.findMediaByListingId = (...args: any[]) => {
    resaleSingleMediaCalls++;
    return (origResaleSingleMedia as any)(...args);
  };
  rentalListingRepository.findMediaByListingId = (...args: any[]) => {
    rentalSingleMediaCalls++;
    return (origRentalSingleMedia as any)(...args);
  };
  locationRepository.findById = (...args: any[]) => {
    locFindByIdCalls++;
    return (origLocById as any)(...args);
  };

  try {
    // 1. Project detail lookup should resolve locationPath in memory (0 sequential findById calls)
    const sampleProj = await projectIntelligenceService.getProjectBySlug('merlin-rise-phase2', false);
    assert.ok(sampleProj, 'Expected merlin-rise-phase2 fixture project');
    assert.strictEqual(
      locFindByIdCalls,
      0,
      `Expected 0 sequential locationRepository.findById calls in buildPublicProjectDto, got ${locFindByIdCalls}`
    );

    // 2. Project detail discovery bundle
    const projBundle = await propertyDiscoveryService.getProjectDetailDiscoveryBundle(sampleProj);
    assert.strictEqual(adminResaleCalls, 0, 'Project discovery must NEVER call listAdminListings');
    assert.strictEqual(adminRentalCalls, 0, 'Project discovery must NEVER call getAllListingsAdmin');
    assert.strictEqual(resaleSingleMediaCalls, 0, 'Project discovery must batch resale media queries');
    assert.strictEqual(rentalSingleMediaCalls, 0, 'Project discovery must batch rental media queries');
    assert.ok(projBundle.nearbyResale.length > 0, 'Expected nearby resale listings for project');
    assert.ok(projBundle.nearbyRental.length > 0, 'Expected nearby rental listings for project');
    assert.ok(
      projBundle.nearbyResale.every((c) => Boolean(c.featuredImageUrl)),
      'Expected batched featuredImageUrl on nearby resale cards'
    );
    assert.ok(
      projBundle.nearbyRental.every((c) => Boolean(c.featuredImageUrl)),
      'Expected batched featuredImageUrl on nearby rental cards'
    );

    // 3. Resale detail discovery bundle
    const allResale = await resaleListingService.getPublishedListingsRaw();
    const sampleResale = allResale[0];
    assert.ok(sampleResale, 'Expected fixture resale listing');
    const resaleBundle = await propertyDiscoveryService.getListingDetailDiscoveryBundle({
      mode: 'RESALE',
      listingId: sampleResale.id,
      listingSlug: sampleResale.slug,
      projectId: sampleResale.projectId,
      locationId: sampleResale.locationId,
      bedroomCount: sampleResale.bedroomCount,
      propertyType: sampleResale.propertyType,
      priceOrRent: sampleResale.askingPrice,
      limit: 6,
    });
    assert.strictEqual(adminResaleCalls, 0, 'Resale discovery must NEVER call listAdminListings');
    assert.strictEqual(resaleSingleMediaCalls, 0, 'Resale discovery must batch resale media queries');
    assert.ok(resaleBundle.similarResale.length > 0, 'Expected similar resale listings');

    // 4. Rental detail discovery bundle
    const allRental = await rentalListingService.getPublishedListingsRaw();
    const sampleRental = allRental[0];
    assert.ok(sampleRental, 'Expected fixture rental listing');
    const rentalBundle = await propertyDiscoveryService.getListingDetailDiscoveryBundle({
      mode: 'RENTAL',
      listingId: sampleRental.id,
      listingSlug: sampleRental.slug,
      projectId: sampleRental.projectId,
      locationId: sampleRental.locationId,
      bedroomCount: sampleRental.bedroomCount,
      propertyType: sampleRental.propertyType,
      priceOrRent: sampleRental.monthlyRent,
      limit: 6,
    });
    assert.strictEqual(adminRentalCalls, 0, 'Rental discovery must NEVER call getAllListingsAdmin');
    assert.strictEqual(rentalSingleMediaCalls, 0, 'Rental discovery must batch rental media queries');
    assert.ok(rentalBundle.similarRental.length > 0, 'Expected similar rental listings');

    // 5. Verify ZERO private/admin PII leaked anywhere in public discovery bundles
    const serialized = JSON.stringify({ projBundle, resaleBundle, rentalBundle });
    assert.ok(!serialized.includes('CONFIDENTIAL_CRM_NOTE'), 'Private resale notes leaked into discovery bundle');
    assert.ok(!serialized.includes('CONFIDENTIAL_RENTAL_NOTE'), 'Private rental notes leaked into discovery bundle');
    assert.ok(!serialized.includes('+919999999999'), 'Owner phone leaked into discovery bundle');
    assert.ok(!serialized.includes('+917777777777'), 'Landlord phone leaked into discovery bundle');

    console.log(
      `PASS [F-09C]: Zero admin-DTO N+1 loops (adminResaleCalls=${adminResaleCalls}, adminRentalCalls=${adminRentalCalls}, singleMediaCalls=${resaleSingleMediaCalls + rentalSingleMediaCalls}), 0 sequential location findById calls, and 0 PII fields leaked.`
    );
  } finally {
    resaleListingService.listAdminListings = origResaleAdmin;
    rentalListingService.getAllListingsAdmin = origRentalAdmin;
    resaleListingRepository.findMediaByListingId = origResaleSingleMedia;
    rentalListingRepository.findMediaByListingId = origRentalSingleMedia;
    locationRepository.findById = origLocById;
  }
}

async function testF09DCacheSafetyGovernance() {
  console.log('\n--- TEST 4 (F-09D): ISR Cache Safety & Route Governance ---');

  const publicCachedRoutes = [
    'app/market/page.tsx',
    'app/projects/[slug]/page.tsx',
    'app/buy/[slug]/page.tsx',
    'app/rent/[slug]/page.tsx',
  ];

  for (const relPath of publicCachedRoutes) {
    const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    assert.ok(
      /export const revalidate\s*=\s*\d+/.test(content),
      `Expected safe numeric revalidate export in public route ${relPath}`
    );
    assert.ok(
      !/\bcookies\s*\(|\bheaders\s*\(|getSession|authSession|adminSession/i.test(content),
      `Cached public route ${relPath} must NEVER read cookies/headers/sessions`
    );
  }

  // Ensure sensitive/transactional/authenticated routes do NOT export ISR revalidate
  const sensitiveRoutes = [
    'app/post-property/new/page.tsx',
    'app/my-properties/page.tsx',
    'app/account/page.tsx',
    'app/admin/page.tsx',
  ];
  for (const relPath of sensitiveRoutes) {
    const fullPath = path.join(ROOT, relPath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(
        !/export const revalidate\s*=\s*[1-9]/.test(content),
        `Sensitive/interactive route ${relPath} must NOT enable ISR caching`
      );
    }
  }

  console.log(
    `PASS [F-09D]: Verified safe ISR revalidate exports on ${publicCachedRoutes.length} strictly public routes with zero cookie/header/session reads and zero caching on sensitive routes.`
  );
}

async function testF10SingleSemanticH1AndHeadingHierarchy() {
  console.log('\n--- TEST 5 (F-10): Single Semantic H1 & Heading Hierarchy (Project, Resale, Rental) ---');

  // 1. Static check: exactly one <h1 tag in ProjectHero.tsx and PropertyDetailHeader.tsx
  const projectHeroSrc = fs.readFileSync(
    path.join(ROOT, 'src/components/projects/ProjectHero.tsx'),
    'utf8'
  );
  const propertyHeaderSrc = fs.readFileSync(
    path.join(ROOT, 'src/components/properties/detail/PropertyDetailHeader.tsx'),
    'utf8'
  );
  assert.strictEqual(
    (projectHeroSrc.match(/<h1\b/g) || []).length,
    1,
    'ProjectHero.tsx must contain exactly ONE <h1> element in JSX'
  );
  assert.strictEqual(
    (propertyHeaderSrc.match(/<h1\b/g) || []).length,
    1,
    'PropertyDetailHeader.tsx must contain exactly ONE <h1> element in JSX'
  );

  // 2. Render ProjectHero via renderToStaticMarkup
  const sampleProject = await projectIntelligenceService.getProjectBySlug('merlin-rise-phase2', false);
  assert.ok(sampleProject, 'Expected sampleProject for ProjectHero render test');
  const projectHeroHtml = renderToStaticMarkup(
    React.createElement(
      VisitorTelemetryProvider,
      null,
      React.createElement(
        ProjectInteractionProvider,
        null,
        React.createElement(ProjectHero, { project: sampleProject as PublicProjectDto })
      )
    )
  );
  const projectHeadings = extractHeadings(projectHeroHtml);
  const projectH1s = projectHeadings.filter((h) => h.level === 1);
  assert.strictEqual(
    projectH1s.length,
    1,
    `Expected exactly 1 <h1> in ProjectHero rendered DOM, got ${projectH1s.length}: ${JSON.stringify(projectH1s)}`
  );
  assert.strictEqual(
    projectH1s[0].text,
    sampleProject.name,
    `Expected ProjectHero H1 text to equal project name '${sampleProject.name}', got '${projectH1s[0].text}'`
  );
  assert.ok(
    !projectHeroHtml.includes('hidden lg:grid'),
    'ProjectHero must NOT duplicate desktop/mobile hero containers with CSS-hidden duplicate H1s'
  );

  // 3. Render Resale Detail Header + Full Content Sections & Sidebar
  const resaleVm: ResaleListingDetailViewModel = {
    mode: 'RESALE',
    id: 'resale-p2-1',
    slug: 'merlin-rise-3bhk-resale-p2-1',
    canonicalUrl: '/buy/merlin-rise-3bhk-resale-p2-1',
    title: '3 BHK Apartment at Merlin Rise',
    propertyType: 'APARTMENT',
    propertyTypeDisplay: 'Apartment',
    configuration: '3 BHK',
    bedroomCount: 3,
    carpetArea: 1080,
    carpetAreaDisplay: '1,080 sq.ft.',
    builtUpArea: 1280,
    builtUpAreaDisplay: '1,280 sq.ft.',
    superBuiltUpArea: 1450,
    superBuiltUpAreaDisplay: '1,450 sq.ft.',
    plotArea: null,
    plotAreaDisplay: null,
    primaryAreaLabel: 'Carpet Area',
    primaryAreaDisplay: '1,080 sq.ft.',
    askingPrice: 9200000,
    formattedAskingPrice: '₹92 L',
    furnishing: 'SEMI_FURNISHED',
    furnishingDisplay: 'Semi-Furnished',
    facing: 'SOUTH',
    facingDisplay: 'South',
    floorCategory: 'MID_FLOOR',
    floorCategoryDisplay: 'Mid Floor',
    possession: 'READY',
    possessionDisplay: 'Ready to Move',
    possessionDate: null,
    description: 'Bright 3 BHK apartment with open balcony and modern fittings.',
    customLocalityDisplay: null,
    customProjectDisplay: null,
    listingPartyLabel: 'Owner Listed',
    isVerified: true,
    verifiedAt: new Date().toISOString(),
    location: { id: 'loc-1', name: 'Rajarhat', slug: 'rajarhat', url: '/locations/rajarhat' },
    locationDisplay: 'Rajarhat, Kolkata',
    project: {
      id: sampleProject.id,
      name: sampleProject.name,
      slug: sampleProject.slug,
      url: `/projects/${sampleProject.slug}`,
      locationName: 'Rajarhat',
      locationSlug: 'rajarhat',
      developerName: 'Merlin Group',
      developerSlug: 'merlin-group-phase2',
      status: 'UNDER_CONSTRUCTION',
      statusDisplay: 'Under Construction',
      shortDescription: 'Verified residential township.',
      reraVerified: true,
      featuredImageUrl: null,
      bhkSummary: '2 & 3 BHK',
      startingPriceDisplay: '₹75 L',
    },
    media: [],
    amenities: [{ id: 'am-1', name: 'Clubhouse', category: 'LIFESTYLE' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const renderDetailSections = (vm: ResaleListingDetailViewModel | RentalListingDetailViewModel) =>
    renderToStaticMarkup(
      React.createElement(
        EnquiryProvider,
        null,
        React.createElement(
          'main',
          null,
          React.createElement(PropertyDetailHeader, { listing: vm }),
          React.createElement(PropertyOverviewSection, { listing: vm }),
          vm.mode === 'RENTAL' ? React.createElement(PropertyRentalTermsCard, { listing: vm }) : null,
          React.createElement(PropertySpecificationsSection, { listing: vm }),
          React.createElement(PropertyAmenitiesSection, {
            amenities: vm.amenities,
            mode: vm.mode,
            projectName: vm.project?.name,
          }),
          React.createElement(PropertyLocationSection, { listing: vm, locationInfo: null }),
          vm.project ? React.createElement(PropertyProjectSection, { project: vm.project }) : null,
          React.createElement(PropertyVerificationSection, { listing: vm }),
          React.createElement(PropertyEnquirySidebar, { listing: vm }),
          React.createElement(PropertySimilarSection, {
            listing: vm,
            similarResale: [],
            similarRental: [],
            relatedProjects: [],
          })
        )
      )
    );

  const resaleHtml = renderDetailSections(resaleVm);
  const resaleHeadings = extractHeadings(resaleHtml);
  const resaleH1s = resaleHeadings.filter((h) => h.level === 1);
  assert.strictEqual(
    resaleH1s.length,
    1,
    `Expected exactly 1 <h1> on Resale detail DOM, got ${resaleH1s.length}: ${JSON.stringify(resaleH1s)}`
  );
  assert.strictEqual(resaleH1s[0].text, resaleVm.title, 'Resale H1 must match descriptive listing title');

  // Verify no skipped heading levels in Resale DOM (e.g., h1 -> h3 or h2 -> h4)
  for (let i = 1; i < resaleHeadings.length; i++) {
    assert.ok(
      resaleHeadings[i].level <= resaleHeadings[i - 1].level + 1,
      `Heading skip detected on Resale page: h${resaleHeadings[i - 1].level} ('${resaleHeadings[i - 1].text}') -> h${resaleHeadings[i].level} ('${resaleHeadings[i].text}')`
    );
  }

  // 4. Render Rental Detail Header + Full Content Sections & Sidebar
  const rentalVm: RentalListingDetailViewModel = {
    mode: 'RENTAL',
    id: 'rental-p2-1',
    slug: 'merlin-elements-3bhk-rental-p2-1',
    canonicalUrl: '/rent/merlin-elements-3bhk-rental-p2-1',
    title: '3 BHK Apartment for Rent at Merlin Elements',
    propertyType: 'APARTMENT',
    propertyTypeDisplay: 'Apartment',
    configuration: '3 BHK',
    bedroomCount: 3,
    carpetArea: 1090,
    carpetAreaDisplay: '1,090 sq.ft.',
    builtUpArea: 1290,
    builtUpAreaDisplay: '1,290 sq.ft.',
    superBuiltUpArea: 1460,
    superBuiltUpAreaDisplay: '1,460 sq.ft.',
    plotArea: null,
    plotAreaDisplay: null,
    primaryAreaLabel: 'Carpet Area',
    primaryAreaDisplay: '1,090 sq.ft.',
    monthlyRent: 34000,
    formattedMonthlyRent: '₹34,000 / mo',
    maintenance: 4500,
    formattedMaintenance: '₹4,500 / mo',
    securityDeposit: 100000,
    formattedSecurityDeposit: '₹1 L',
    furnishing: 'FULLY_FURNISHED',
    furnishingDisplay: 'Fully Furnished',
    facing: 'EAST',
    facingDisplay: 'East',
    floorCategory: 'HIGH_FLOOR',
    floorCategoryDisplay: 'High Floor',
    possession: 'READY',
    possessionDisplay: 'Immediate',
    availabilityDate: null,
    leaseDuration: '11 Months',
    noticePeriod: '1 Month',
    description: 'Fully furnished 3 BHK rental apartment with modular kitchen and AC.',
    customLocalityDisplay: null,
    customProjectDisplay: null,
    listingPartyLabel: 'Owner Listed',
    isVerified: true,
    verifiedAt: new Date().toISOString(),
    location: { id: 'loc-2', name: 'New Town', slug: 'new-town', url: '/locations/new-town' },
    locationDisplay: 'New Town, Kolkata',
    project: resaleVm.project,
    media: [],
    amenities: [{ id: 'am-1', name: 'Gymnasium', category: 'FITNESS' }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const rentalHtml = renderDetailSections(rentalVm);
  const rentalHeadings = extractHeadings(rentalHtml);
  const rentalH1s = rentalHeadings.filter((h) => h.level === 1);
  assert.strictEqual(
    rentalH1s.length,
    1,
    `Expected exactly 1 <h1> on Rental detail DOM, got ${rentalH1s.length}: ${JSON.stringify(rentalH1s)}`
  );
  assert.strictEqual(rentalH1s[0].text, rentalVm.title, 'Rental H1 must match descriptive rental title');

  for (let i = 1; i < rentalHeadings.length; i++) {
    assert.ok(
      rentalHeadings[i].level <= rentalHeadings[i - 1].level + 1,
      `Heading skip detected on Rental page: h${rentalHeadings[i - 1].level} ('${rentalHeadings[i - 1].text}') -> h${rentalHeadings[i].level} ('${rentalHeadings[i].text}')`
    );
  }

  console.log(
    `PASS [F-10]: Project (h1=1: "${projectH1s[0].text}"), Resale (h1=1: "${resaleH1s[0].text}", ${resaleHeadings.length} headings, 0 skips), and Rental (h1=1: "${rentalH1s[0].text}", ${rentalHeadings.length} headings, 0 skips) verified.`
  );
}

async function run() {
  console.log('=== PHASE 2 SEO MASTER REMEDIATION REGRESSION SUITE (F-09 & F-10) ===');
  await seedPhase2Fixtures();
  await testF09AMarketDashboardZeroNPlusOne();
  await testF09BBhkLandingSingleCatalogLoad();
  await testF09CProjectAndListingDiscoveryZeroAdminNPlusOne();
  await testF09DCacheSafetyGovernance();
  await testF10SingleSemanticH1AndHeadingHierarchy();
  console.log('\nALL PHASE 2 SEO REMEDIATION TESTS PASSED (5/5)');
}

run().catch((err) => {
  console.error('\nPHASE 2 SEO REMEDIATION TEST FAILED:', err);
  process.exit(1);
});
