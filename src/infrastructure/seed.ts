import { developerRepository } from './repositories/developerProvider';
import {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
  projectReraRepository,
  amenityRepository,
  projectFaqRepository,
  newBookingAvailabilityRepository,
} from './repositories/projectProvider';
import { locationRepository } from './repositories/locationProvider';
import { resaleListingRepository } from '../domain/projects/repositories/resaleRepository';
import { rentalListingRepository } from '../domain/projects/repositories/rentalRepository';
import { enquiryRepository } from '../domain/enquiry/repositories/enquiryRepository';
import {
  customerRepository,
  savedItemRepository,
  recentlyViewedRepository,
  customerPreferenceRepository,
  projectWatchRepository,
  locationWatchRepository,
} from '../domain/customer/repositories/index';
import { siteVisitRepository } from './repositories/postgres/siteVisitRepositoryPostgres';
import { visitorIntelligenceRepository } from '../domain/visitorIntelligence/repositories/visitorIntelligenceRepository';
import { getDb, ensureSchemaUpdates } from '../db/client';
import { LOCATION_MASTER_RECORDS, LocationMasterRecord } from './data/locations';
import { locations } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getStorageProvider } from '../domain/media/storage/storageProvider';

async function getOrCreateLocation(data: Parameters<typeof locationRepository.create>[0]) {
  const existing = await locationRepository.findBySlug(data.slug);
  if (existing) return existing;
  return locationRepository.create(data);
}

async function getOrCreateDeveloper(data: Parameters<typeof developerRepository.create>[0]) {
  const existing = await developerRepository.findBySlug(data.slug);
  if (existing) return existing;
  return developerRepository.create(data);
}

async function getOrCreateAmenity(data: Parameters<typeof amenityRepository.create>[0]) {
  const all = await amenityRepository.findAll();
  const existing = all.find(a => a.slug === data.slug);
  if (existing) return existing;
  return amenityRepository.create(data);
}

const globalForSeed = globalThis as unknown as {
  __ghSeedInFlight?: Promise<void> | null;
  __ghPostgresSeedCompleted?: boolean;
  __ghInitialBrochureSeeded?: boolean;
};

let seedPromise: Promise<void> | null = null;

export async function ensureSeedData(): Promise<void> {
  // Seeding is strictly disabled by default unless explicitly authorized via ENABLE_SEEDING='true'
  if (process.env.ENABLE_SEEDING !== 'true') {
    return;
  }

  // If a seed run is currently in flight anywhere in this process, wait for it instead of racing
  if (globalForSeed.__ghSeedInFlight) {
    return globalForSeed.__ghSeedInFlight;
  }

  const db = getDb();
  const isMemoryMode = process.env.PERSISTENCE_PROVIDER === 'memory' || !db;

  // Fast-path for PostgreSQL once seed + schema verification has already succeeded in this process
  if (!isMemoryMode && globalForSeed.__ghPostgresSeedCompleted) {
    return;
  }

  const activeRun = (async () => {
    if (db) {
      await ensureSchemaUpdates(db);
    }
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.PERSISTENCE_PROVIDER !== 'memory' &&
      process.env.ALLOW_PRODUCTION_SEED !== 'true'
    ) {
      if (!isMemoryMode) {
        globalForSeed.__ghPostgresSeedCompleted = true;
      }
      return;
    }

    // Modular, idempotent domain seed checks:
    const existingProject = await projectRepository.findBySlug('merlin-rise');
    const existingLocation = await locationRepository.findBySlug('rajarhat');

    if (existingProject) {
      if (isMemoryMode) {
        const existingAvails = await newBookingAvailabilityRepository.findAll();
        if (existingAvails.length === 0) {
          const allProjects = await projectRepository.list({ isPublished: true });
          for (const proj of allProjects) {
            const configs = await projectConfigurationRepository.findByProjectId(proj.id);
            for (const cfg of configs) {
              await newBookingAvailabilityRepository.create({
                projectId: proj.id,
                configurationId: cfg.id,
                availabilityStatus: cfg.availability === 'FEW_UNITS_LEFT' ? 'LIMITED' : 'AVAILABLE',
                lastVerifiedAt: new Date(),
              });
            }
          }
        }
      }
      await ensureSampleBrochureSeedData(existingProject);
      if (existingLocation) {
        await ensureVisitorAndCustomer360SeedData(existingProject, existingLocation);
      }
    }


    // 1. Seed Locations
  const state = await getOrCreateLocation({
    name: 'West Bengal',
    slug: 'west-bengal',
    type: 'STATE',
    status: 'PUBLISHED',
    featured: true,
  });

  const city = await getOrCreateLocation({
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    parentId: state.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const rajarhat = await getOrCreateLocation({
    name: 'Rajarhat',
    slug: 'rajarhat',
    type: 'AREA',
    parentId: city.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const newTown = await getOrCreateLocation({
    name: 'New Town',
    slug: 'new-town',
    type: 'AREA',
    parentId: city.id,
    status: 'PUBLISHED',
    featured: true,
  });

  // Note: Boundary testing dummy locations (secret-sector-9, old-industrial-zone)
  // have been decommissioned for Phase 2 Location Master cleanup.

  // 2. Seed Amenities
  const gym = await getOrCreateAmenity({
    name: 'State-of-the-Art Fitness Center',
    slug: 'fitness-center',
    category: 'FITNESS',
    icon: 'dumbbell',
  });

  const pool = await getOrCreateAmenity({
    name: 'Olympic-Length Swimming Pool',
    slug: 'swimming-pool',
    category: 'WELLNESS',
    icon: 'waves',
  });

  const clubhouse = await getOrCreateAmenity({
    name: 'Luxury Clubhouse',
    slug: 'clubhouse',
    category: 'COMMUNITY',
    icon: 'building',
  });

  const gardens = await getOrCreateAmenity({
    name: 'Landscaped Reflexology Gardens',
    slug: 'landscaped-gardens',
    category: 'OUTDOOR',
    icon: 'trees',
  });

  // 3. Seed Developers
  const merlin = await getOrCreateDeveloper({
    name: 'Merlin Group',
    slug: 'merlin-group',
    shortDescription: 'Pioneering real estate enterprise with over 35 years of legacy, developing landmark residences and modern lifestyle spaces across India.',
    description: 'Founded in 1984, Merlin Group is one of the premier real estate conglomerates in India. Having developed over 20 million sq. ft. of residential and commercial spaces, Merlin Group continues to shape the skyline of Kolkata and major metropolitan hubs with sustainable, RERA-compliant architecture.',
    websiteUrl: 'https://merlingroup.com',
    status: 'PUBLISHED',
    featured: true,
  });

  const psGroup = await getOrCreateDeveloper({
    name: 'PS Group',
    slug: 'ps-group',
    shortDescription: 'Renowned for sustainable urban developments and architectural integrity across premium residential segments.',
    description: 'With over three decades of experience, PS Group is committed to environmental sustainability and timely project deliveries.',
    websiteUrl: 'https://psgroup.in',
    status: 'PUBLISHED',
    featured: false,
  });

  await getOrCreateDeveloper({
    name: 'Alpha Infra Draft',
    slug: 'alpha-infra-draft',
    shortDescription: 'Internal draft developer pending identity verification.',
    description: 'Internal documentation only.',
    websiteUrl: null,
    status: 'DRAFT',
    featured: false,
  });

  // 4. Seed Projects for Merlin Group
  const merlinRise = await projectRepository.create({
    developerId: merlin.id,
    locationId: rajarhat.id,
    name: 'Merlin Rise — Sports Republic',
    slug: 'merlin-rise',
    shortDescription: 'East Kolkata’s first sports-themed residential enclave featuring Olympic-standard amenities and expansive green zones.',
    description: 'Spread over 15 acres in Rajarhat, Merlin Rise features international sports academies, modern high-rise apartments, and world-class leisure facilities designed for holistic urban living.',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 4800000,
    projectArea: '15 Acres',
    towerCount: 8,
    totalUnits: 850,
    floors: 'G+18',
    possession: 'Dec 2026',
    isPublished: true,
    featured: true,
    reraStatus: 'VERIFIED',
    reraRegistrationNumber: 'WBRERA/P/NOR/2023/000123',
  });

  await projectReraRepository.upsert({
    projectId: merlinRise.id,
    status: 'VERIFIED',
    authority: 'WBRERA',
    registrationNumber: 'WBRERA/P/NOR/2023/000123',
    verifiedAt: new Date('2023-04-15'),
  });

  // Configurations for Merlin Rise
  const merlinConfig1 = await projectConfigurationRepository.create({
    projectId: merlinRise.id,
    name: '2 BHK Classic',
    bedroomCount: 2,
    carpetArea: 640,
    builtUpArea: 780,
    superBuiltUpArea: 950,
    price: 4800000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });
  await newBookingAvailabilityRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig1.id,
    availabilityStatus: 'AVAILABLE',
    lastVerifiedAt: new Date('2024-01-10'),
  });

  const merlinConfig2 = await projectConfigurationRepository.create({
    projectId: merlinRise.id,
    name: '3 BHK Grande',
    bedroomCount: 3,
    carpetArea: 890,
    builtUpArea: 1080,
    superBuiltUpArea: 1320,
    price: 6800000,
    priceBasis: 'CARPET_AREA',
    availability: 'FEW_UNITS_LEFT',
  });
  await newBookingAvailabilityRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig2.id,
    availabilityStatus: 'LIMITED',
    lastVerifiedAt: new Date('2024-01-10'),
  });

  // Media for Merlin Rise
  await projectMediaRepository.create({
    projectId: merlinRise.id,
    mediaType: 'IMAGE',
    category: 'EXTERIOR',
    url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80',
    altText: 'Merlin Rise Architectural Elevation View',
    caption: 'Modern residential towers framed by open sky and landscaped courtyards',
    sortOrder: 1,
    isFeatured: true,
  });

  await projectMediaRepository.create({
    projectId: merlinRise.id,
    mediaType: 'IMAGE',
    category: 'AMENITIES',
    url: 'https://images.unsplash.com/photo-1576013551627-0cc20b96c2a7?auto=format&fit=crop&w=1600&q=80',
    altText: 'Merlin Rise Olympic-Style Swimming Pool',
    caption: 'Expansive temperature-controlled community lap pool',
    sortOrder: 2,
    isFeatured: false,
  });

  // Floor Plans for Merlin Rise 2 BHK (2 plans for carousel)
  await projectMediaRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig1.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-rise-2bhk-type-a.svg',
    altText: '2 BHK Classic — Layout Type A (640 sq.ft. Carpet)',
    caption: '2 BHK Type A — Efficient 2-bedroom plan with dedicated utility balcony',
    sortOrder: 1,
    isFeatured: true,
  });

  await projectMediaRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig1.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-rise-2bhk-type-b.svg',
    altText: '2 BHK Classic — Layout Type B (665 sq.ft. Carpet)',
    caption: '2 BHK Type B — Extended living-dining layout with double-glazed window wall',
    sortOrder: 2,
    isFeatured: false,
  });

  // Floor Plans for Merlin Rise 3 BHK (3 plans for multi-plan carousel)
  await projectMediaRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-rise-3bhk-type-a.svg',
    altText: '3 BHK Grande — Layout Type A (890 sq.ft. Carpet)',
    caption: '3 BHK Type A — Spacious 3-bedroom master suite with 3-side open ventilation',
    sortOrder: 1,
    isFeatured: true,
  });

  await projectMediaRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-rise-3bhk-type-b.svg',
    altText: '3 BHK Grande — Layout Type B (915 sq.ft. Corner Suite)',
    caption: '3 BHK Type B — Corner residence with expansive panoramic sundeck',
    sortOrder: 2,
    isFeatured: false,
  });

  await projectMediaRepository.create({
    projectId: merlinRise.id,
    configurationId: merlinConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-rise-3bhk-type-c.svg',
    altText: '3 BHK Grande — Layout Type C (930 sq.ft. Deck Residence)',
    caption: '3 BHK Type C — Premium family residence with dual balconies',
    sortOrder: 3,
    isFeatured: false,
  });

  // Amenities for Merlin Rise
  await amenityRepository.associateWithProject(merlinRise.id, gym.id, true, 1);
  await amenityRepository.associateWithProject(merlinRise.id, pool.id, true, 2);
  await amenityRepository.associateWithProject(merlinRise.id, clubhouse.id, false, 3);
  await amenityRepository.associateWithProject(merlinRise.id, gardens.id, false, 4);

  // FAQs for Merlin Rise
  await projectFaqRepository.create({
    projectId: merlinRise.id,
    question: 'When is the possession date for Merlin Rise?',
    answer: 'Phase 1 possession is scheduled for December 2026 as per WBRERA guidelines.',
    sortOrder: 1,
    isPublished: true,
  });

  await projectFaqRepository.create({
    projectId: merlinRise.id,
    question: 'What are the primary sports facilities available?',
    answer: 'The project features state-of-the-art football, cricket, and swimming training academies curated in partnership with renowned sports icons.',
    sortOrder: 2,
    isPublished: true,
  });

  // Project 2: Merlin The Fourth
  const theFourth = await projectRepository.create({
    developerId: merlin.id,
    locationId: newTown.id,
    name: 'Merlin The Fourth',
    slug: 'merlin-the-fourth',
    shortDescription: 'Super-luxury residences overlooking lush natural waterbodies in New Town Action Area II.',
    description: 'Designed for discerning homebuyers, Merlin The Fourth offers palatial 3 and 4 BHK lifestyle suites featuring 3-side open architecture and private deck terraces.',
    status: 'READY_TO_MOVE',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 12500000,
    projectArea: '2.5 Acres',
    towerCount: 2,
    totalUnits: 120,
    floors: 'G+24',
    possession: 'Ready to Move',
    isPublished: true,
    featured: true,
    reraStatus: 'VERIFIED',
    reraRegistrationNumber: 'WBRERA/P/NOR/2023/000456',
  });

  await projectReraRepository.upsert({
    projectId: theFourth.id,
    status: 'VERIFIED',
    authority: 'WBRERA',
    registrationNumber: 'WBRERA/P/NOR/2023/000456',
    verifiedAt: new Date('2023-01-20'),
  });

  const theFourthConfig1 = await projectConfigurationRepository.create({
    projectId: theFourth.id,
    name: '3 BHK Suite',
    bedroomCount: 3,
    carpetArea: 1250,
    builtUpArea: 1520,
    superBuiltUpArea: 1850,
    price: 12500000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });

  const theFourthConfig2 = await projectConfigurationRepository.create({
    projectId: theFourth.id,
    name: '4 BHK Presidential',
    bedroomCount: 4,
    carpetArea: 1750,
    builtUpArea: 2150,
    superBuiltUpArea: 2600,
    price: 17500000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });

  await projectMediaRepository.create({
    projectId: theFourth.id,
    mediaType: 'IMAGE',
    category: 'EXTERIOR',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80',
    altText: 'Merlin The Fourth Grand Facade',
    caption: 'Architectural distinction nestled beside tranquil waters',
    sortOrder: 1,
    isFeatured: true,
  });

  // Single Floor Plan for 3 BHK Suite (Merlin The Fourth)
  await projectMediaRepository.create({
    projectId: theFourth.id,
    configurationId: theFourthConfig1.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-the-fourth-3bhk-type-a.svg',
    altText: '3 BHK Suite — Layout Type A (1,250 sq.ft. Carpet)',
    caption: '3 BHK Suite Type A — 3-side open layout with private deck and foyer',
    sortOrder: 1,
    isFeatured: true,
  });

  // Multiple Floor Plans for 4 BHK Presidential (Merlin The Fourth)
  await projectMediaRepository.create({
    projectId: theFourth.id,
    configurationId: theFourthConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-the-fourth-4bhk-type-a.svg',
    altText: '4 BHK Presidential — Layout Type A (1,750 sq.ft. Carpet)',
    caption: '4 BHK Presidential Type A — Palatial master suite with dual dressing zones',
    sortOrder: 1,
    isFeatured: true,
  });

  await projectMediaRepository.create({
    projectId: theFourth.id,
    configurationId: theFourthConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-the-fourth-4bhk-type-b.svg',
    altText: '4 BHK Presidential — Layout Type B (1,950 sq.ft. Duplex Suite)',
    caption: '4 BHK Presidential Type B — Double-height dining with sky lounge',
    sortOrder: 2,
    isFeatured: false,
  });

  await amenityRepository.associateWithProject(theFourth.id, pool.id, true, 1);
  await amenityRepository.associateWithProject(theFourth.id, clubhouse.id, true, 2);

  // Project 3: Merlin Elements (RERA PROVIDED, not verified)
  const elements = await projectRepository.create({
    developerId: merlin.id,
    locationId: city.id,
    name: 'Merlin Elements',
    slug: 'merlin-elements',
    shortDescription: 'Contemporary residences seamlessly connecting South Kolkata and modern transit routes.',
    description: 'Merlin Elements is built with natural light orientation and expansive landscaped skywalks.',
    status: 'COMPLETED',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 9200000,
    projectArea: '3.2 Acres',
    towerCount: 3,
    totalUnits: 180,
    floors: 'G+20',
    possession: 'Ready to Move',
    isPublished: true,
    featured: false,
    reraStatus: 'PROVIDED', // Note: Not verified! Verified badge must not render
    reraRegistrationNumber: 'WBRERA/P/KOL/2022/000789',
  });

  await projectReraRepository.upsert({
    projectId: elements.id,
    status: 'PROVIDED',
    authority: 'WBRERA',
    registrationNumber: 'WBRERA/P/KOL/2022/000789',
  });

  const elementsConfig = await projectConfigurationRepository.create({
    projectId: elements.id,
    name: '3 BHK Urban',
    bedroomCount: 3,
    carpetArea: 950,
    builtUpArea: 1160,
    superBuiltUpArea: 1400,
    price: 9200000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });

  await projectMediaRepository.create({
    projectId: elements.id,
    mediaType: 'IMAGE',
    category: 'EXTERIOR',
    url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80',
    altText: 'Merlin Elements Contemporary Facade',
    caption: 'Modern luxury residential towers located in the EM Bypass corridor',
    sortOrder: 1,
    isFeatured: true,
  });

  await projectMediaRepository.create({
    projectId: elements.id,
    configurationId: elementsConfig.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/merlin-elements-3bhk-type-a.svg',
    altText: '3 BHK Urban — Layout Type A (950 sq.ft. Carpet)',
    caption: '3 BHK Urban Type A — Natural light cross-ventilation layout',
    sortOrder: 2,
    isFeatured: false,
  });

  // Project 4: Draft Project (Secret Villa)
  await projectRepository.create({
    developerId: merlin.id,
    locationId: city.id,
    name: 'Merlin Secret Villa',
    slug: 'merlin-secret-villa',
    shortDescription: 'Internal draft villa enclave.',
    description: 'Internal documentation only.',
    status: 'UPCOMING',
    lifecycleStatus: 'DRAFT',
    propertyType: 'VILLA',
    startingPrice: 25000000,
    isPublished: false,
    reraStatus: 'NOT_PROVIDED',
  });

  // Project 5: PS One10
  const psOne10 = await projectRepository.create({
    developerId: psGroup.id,
    locationId: newTown.id,
    name: 'PS One10',
    slug: 'ps-one10',
    shortDescription: 'Kolkata’s premier child-centric luxury enclave offering Olympic-size sporting facilities and learning zones.',
    description: 'PS One10 is designed specifically around holistic child development with expansive play areas and Olympic-size sports arenas.',
    status: 'READY_TO_MOVE',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 8500000,
    projectArea: '9 Acres',
    towerCount: 5,
    totalUnits: 620,
    floors: 'G+20',
    possession: 'Ready to Move',
    isPublished: true,
    featured: true,
    reraStatus: 'VERIFIED',
    reraRegistrationNumber: 'WBRERA/P/NOR/2023/000999',
  });

  await projectReraRepository.upsert({
    projectId: psOne10.id,
    status: 'VERIFIED',
    authority: 'WBRERA',
    registrationNumber: 'WBRERA/P/NOR/2023/000999',
    verifiedAt: new Date('2023-02-10'),
  });

  const psConfig1 = await projectConfigurationRepository.create({
    projectId: psOne10.id,
    name: '2 BHK Smart',
    bedroomCount: 2,
    carpetArea: 592,
    builtUpArea: 725,
    superBuiltUpArea: 890,
    price: 8500000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });
  await newBookingAvailabilityRepository.create({
    projectId: psOne10.id,
    configurationId: psConfig1.id,
    availabilityStatus: 'AVAILABLE',
    lastVerifiedAt: new Date('2024-02-01'),
  });

  const psConfig2 = await projectConfigurationRepository.create({
    projectId: psOne10.id,
    name: '3 BHK Prime',
    bedroomCount: 3,
    carpetArea: 1010,
    builtUpArea: 1235,
    superBuiltUpArea: 1515,
    price: 13500000,
    priceBasis: 'CARPET_AREA',
    availability: 'FEW_UNITS_LEFT',
  });
  await newBookingAvailabilityRepository.create({
    projectId: psOne10.id,
    configurationId: psConfig2.id,
    availabilityStatus: 'LIMITED',
    lastVerifiedAt: new Date('2024-02-01'),
  });

  await projectMediaRepository.create({
    projectId: psOne10.id,
    mediaType: 'IMAGE',
    category: 'EXTERIOR',
    url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1600&q=80',
    altText: 'PS One10 Campus Landscape',
    caption: 'Thoughtfully designed residential towers with dedicated activity clusters',
    sortOrder: 1,
    isFeatured: true,
  });

  // Single Floor Plan for PS One10 2 BHK Smart
  await projectMediaRepository.create({
    projectId: psOne10.id,
    configurationId: psConfig1.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/ps-one10-2bhk-type-a.svg',
    altText: '2 BHK Smart — Layout Type A (592 sq.ft. Carpet)',
    caption: '2 BHK Smart Type A — Compact ergonomic layout with child-safe balcony',
    sortOrder: 1,
    isFeatured: true,
  });

  // Multiple Floor Plans for PS One10 3 BHK Prime
  await projectMediaRepository.create({
    projectId: psOne10.id,
    configurationId: psConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/ps-one10-3bhk-type-a.svg',
    altText: '3 BHK Prime — Layout Type A (1,010 sq.ft. Carpet)',
    caption: '3 BHK Prime Type A — Extended children study nook & dual master bedrooms',
    sortOrder: 1,
    isFeatured: true,
  });

  await projectMediaRepository.create({
    projectId: psOne10.id,
    configurationId: psConfig2.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: '/floor-plans/ps-one10-3bhk-type-b.svg',
    altText: '3 BHK Prime — Layout Type B (1,065 sq.ft. Corner Suite)',
    caption: '3 BHK Prime Type B — Corner residence with landscaped terrace view',
    sortOrder: 2,
    isFeatured: false,
  });

  await amenityRepository.associateWithProject(psOne10.id, gym.id, true, 1);
  await amenityRepository.associateWithProject(psOne10.id, pool.id, true, 2);

  // 4. Seed Resale Listings
  const resale1 = await resaleListingRepository.create({
    slug: 'merlin-rise-3-bhk-executive-resale',
    projectId: merlinRise.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK Executive',
    bedroomCount: 3,
    carpetArea: 920,
    builtUpArea: 1120,
    superBuiltUpArea: 1380,
    askingPrice: 7500000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'NORTH_EAST',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    ownerName: 'Private Owner',
    ownerPhone: '+919830012345',
    ownerEmail: 'owner@example.com',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2024-01-15'),
    verifiedBy: 'Great Homes Verification Desk',
    description: 'Immaculately maintained high-floor 3 BHK overlooking landscaped community gardens. Custom Italian modular kitchen with piped gas.',
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resale1.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1600&q=80',
    altText: 'Living Room View',
    caption: 'Bright high-floor living room with natural lighting',
    sortOrder: 1,
    isFeatured: true,
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resale1.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1600&q=80',
    altText: 'Modular Kitchen',
    caption: 'Italian modular kitchen with integrated breakfast bar',
    sortOrder: 2,
    isFeatured: false,
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resale1.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1600&q=80',
    altText: 'Master Bedroom Suite',
    caption: 'Spacious master bedroom with floor-to-ceiling windows',
    sortOrder: 3,
    isFeatured: false,
  });
  await resaleListingRepository.associateAmenity(resale1.id, clubhouse.id);
  await resaleListingRepository.associateAmenity(resale1.id, pool.id);
  await resaleListingRepository.associateAmenity(resale1.id, gardens.id);

  const resale2 = await resaleListingRepository.create({
    slug: 'ps-one10-2-bhk-designer-resale',
    projectId: psOne10.id,
    propertyType: 'APARTMENT',
    configuration: '2 BHK Designer',
    bedroomCount: 2,
    carpetArea: 610,
    builtUpArea: 750,
    superBuiltUpArea: 920,
    askingPrice: 9200000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'SOUTH',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'LISTING_PARTNER',
    brokerName: 'Trusted Homes Realty',
    brokerPhone: '+919830098765',
    brokerEmail: 'broker@example.com',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2024-02-10'),
    verifiedBy: 'Great Homes Quality Desk',
    description: 'Designer 2 BHK fully customized with premium hardwood wardrobes and modern fixtures.',
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resale2.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1600&q=80',
    altText: 'Designer Bedroom',
    caption: 'Warm ambient lighting and custom modular cabinetry',
    sortOrder: 1,
    isFeatured: true,
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resale2.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
    altText: 'Lounge and Dining Area',
    caption: 'Open concept living area with contemporary furnishings',
    sortOrder: 2,
    isFeatured: false,
  });
  await resaleListingRepository.associateAmenity(resale2.id, gym.id);
  await resaleListingRepository.associateAmenity(resale2.id, clubhouse.id);

  // 4b. Seed Unlinked Resale Listing (projectId = null)
  const resaleUnlinked = await resaleListingRepository.create({
    slug: 'south-city-3-bhk-independent-penthouse-resale',
    projectId: null,
    propertyType: 'PENTHOUSE',
    configuration: '3 BHK Penthouse',
    bedroomCount: 3,
    carpetArea: 1450,
    builtUpArea: 1780,
    superBuiltUpArea: 2150,
    askingPrice: 16500000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'EAST',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    ownerName: 'Independent Owner',
    ownerPhone: '+919830077889',
    ownerEmail: 'ind.owner@example.com',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2024-02-20'),
    verifiedBy: 'Great Homes Verification Desk',
    description: 'Standalone duplex penthouse with private wrap-around terrace and panoramic southern skyline exposure.',
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resaleUnlinked.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1567496898669-ee935f5f647a?auto=format&fit=crop&w=1600&q=80',
    altText: 'Penthouse Living Deck',
    caption: 'Private terrace garden and expansive high-ceiling lounge',
    sortOrder: 1,
    isFeatured: true,
  });
  await resaleListingRepository.addMedia({
    resaleListingId: resaleUnlinked.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80',
    altText: 'Skyline Terrace',
    caption: 'Unobstructed 270-degree panorama of the Kolkata southern horizon',
    sortOrder: 2,
    isFeatured: false,
  });
  await resaleListingRepository.associateAmenity(resaleUnlinked.id, clubhouse.id);
  await resaleListingRepository.associateAmenity(resaleUnlinked.id, gardens.id);

  // 5. Seed Rental Listings
  const rent1 = await rentalListingRepository.create({
    slug: 'merlin-rise-2-bhk-semi-furnished-rent',
    projectId: merlinRise.id,
    propertyType: 'APARTMENT',
    configuration: '2 BHK Semi Furnished',
    bedroomCount: 2,
    carpetArea: 650,
    builtUpArea: 790,
    superBuiltUpArea: 960,
    monthlyRent: 28000,
    maintenance: 3500,
    securityDeposit: 56000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'EAST',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    ownerName: 'Private Landlord',
    ownerPhone: '+919831122334',
    ownerEmail: 'landlord@example.com',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2024-03-01'),
    verifiedBy: 'Great Homes Lease Desk',
    description: 'Spacious 2 BHK available for immediate lease. Close to transit corridor and international school.',
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rent1.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
    altText: 'Sunlit Living Space',
    caption: 'Airy layout with balcony orientation',
    sortOrder: 1,
    isFeatured: true,
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rent1.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1556912172-45b7abe8b7e1?auto=format&fit=crop&w=1600&q=80',
    altText: 'Kitchen and Dining',
    caption: 'Modern modular kitchen setup with granite countertops',
    sortOrder: 2,
    isFeatured: false,
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rent1.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?auto=format&fit=crop&w=1600&q=80',
    altText: 'Master Bedroom',
    caption: 'Spacious bedroom with natural ventilation and built-in closet',
    sortOrder: 3,
    isFeatured: false,
  });
  await rentalListingRepository.associateAmenity(rent1.id, clubhouse.id);
  await rentalListingRepository.associateAmenity(rent1.id, pool.id);

  const rent2 = await rentalListingRepository.create({
    slug: 'ps-one10-3-bhk-luxury-suite-rent',
    projectId: psOne10.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK Luxury Suite',
    bedroomCount: 3,
    carpetArea: 1020,
    builtUpArea: 1240,
    superBuiltUpArea: 1520,
    monthlyRent: 45000,
    maintenance: 5500,
    securityDeposit: 90000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'NORTH',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'LISTING_PARTNER',
    brokerName: 'Apex Leasing Partners',
    brokerPhone: '+919832233445',
    brokerEmail: 'apex@example.com',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2024-03-12'),
    verifiedBy: 'Great Homes Lease Desk',
    description: 'Fully furnished family residence in child-centric luxury enclave with access to sports academy.',
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rent2.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1600&q=80',
    altText: 'Furnished Living Area',
    caption: 'Tastefully furnished interiors ready for occupancy',
    sortOrder: 1,
    isFeatured: true,
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rent2.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1512918728675-ed5a9ecdebfd?auto=format&fit=crop&w=1600&q=80',
    altText: 'Guest Suite',
    caption: 'Comfortable guest room with ensuite bathroom and desk space',
    sortOrder: 2,
    isFeatured: false,
  });
  await rentalListingRepository.associateAmenity(rent2.id, gym.id);
  await rentalListingRepository.associateAmenity(rent2.id, clubhouse.id);

  // 5b. Seed Unlinked Rental Listing (projectId = null)
  const rentUnlinked = await rentalListingRepository.create({
    slug: 'ballygunge-2-bhk-classic-residence-rent',
    projectId: null,
    propertyType: 'APARTMENT',
    configuration: '2 BHK Classic',
    bedroomCount: 2,
    carpetArea: 720,
    builtUpArea: 860,
    superBuiltUpArea: 1040,
    monthlyRent: 35000,
    maintenance: 4000,
    securityDeposit: 70000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'SOUTH',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'LISTING_PARTNER',
    brokerName: 'Heritage Realty Associates',
    brokerPhone: '+919830088990',
    brokerEmail: 'heritage@example.com',
    lifecycleStatus: 'PUBLISHED',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date('2024-03-15'),
    verifiedBy: 'Great Homes Lease Desk',
    description: 'Heritage residential flat on a leafy south Kolkata avenue with cross-ventilation and 24x7 security.',
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rentUnlinked.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1600&q=80',
    altText: 'Heritage Living Space',
    caption: 'Sunlit living room with teakwood windows',
    sortOrder: 1,
    isFeatured: true,
  });
  await rentalListingRepository.addMedia({
    rentalListingId: rentUnlinked.id,
    mediaType: 'IMAGE',
    category: 'INTERIOR',
    url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
    altText: 'Balcony Outlook',
    caption: 'Green canopy view over the historic Ballygunge neighborhood',
    sortOrder: 2,
    isFeatured: false,
  });
  await rentalListingRepository.associateAmenity(rentUnlinked.id, clubhouse.id);
  await rentalListingRepository.associateAmenity(rentUnlinked.id, gardens.id);

  // 6. Seed Representative Enquiries
  await enquiryRepository.create({
    contextType: 'PROJECT',
    projectId: merlinRise.id,
    projectSlug: merlinRise.slug,
    projectName: merlinRise.name,
    configurationId: merlinConfig2.id,
    configuration: '3 BHK Grande',
    propertyType: 'APARTMENT',
    priceDisplay: '₹ 68.00 L',
    locationName: 'Rajarhat, Kolkata',
    buyerName: 'Rahul Sharma',
    buyerPhone: '+919876543210',
    buyerEmail: 'rahul.sharma@example.com',
    preferredContact: 'WHATSAPP',
    requestSiteVisit: true,
    message: 'Looking for a 3 BHK unit on high floor facing the sports academy. Need weekend site visit.',
    status: 'NEW',
    priority: 'HIGH',
    source: 'WEB_PORTAL',
    sourcePage: '/projects/merlin-rise',
    internalNotes: 'Customer prefers morning slot on Saturday. Possibility of immediate booking.',
  });

  await enquiryRepository.create({
    contextType: 'CONFIGURATION',
    projectId: merlinRise.id,
    projectSlug: merlinRise.slug,
    projectName: merlinRise.name,
    configurationId: merlinConfig1.id,
    configuration: '2 BHK Classic',
    propertyType: 'APARTMENT',
    priceDisplay: '₹ 48.00 L',
    locationName: 'Rajarhat, Kolkata',
    buyerName: 'Priya Mukherjee',
    buyerPhone: '+919830112233',
    buyerEmail: 'priya.m@example.com',
    preferredContact: 'PHONE',
    requestSiteVisit: false,
    message: 'Interested in payment plans for 2 BHK. Please share brochure and bank approval details.',
    status: 'CONTACTED',
    priority: 'NORMAL',
    assignedTo: 'sales-agent-1',
    assignedToName: 'Suman Sen (Sales)',
    source: 'PROJECT_PAGE',
    sourcePage: '/projects/merlin-rise',
    lastContactedAt: new Date(),
    nextFollowUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    internalNotes: 'Shared SBI pre-approval letter and payment schedule via email.',
  });

  await enquiryRepository.create({
    contextType: 'RESALE',
    projectId: merlinRise.id,
    projectSlug: merlinRise.slug,
    projectName: merlinRise.name,
    listingId: resale1.id,
    listingSlug: resale1.slug || resale1.id,
    listingTitle: '3 BHK Apartment Resale',
    configuration: '3 BHK Premium',
    propertyType: 'APARTMENT',
    priceDisplay: '₹ 92.00 L',
    locationName: 'Rajarhat, Kolkata',
    buyerName: 'Amitabh Sen',
    buyerPhone: '+919811223344',
    buyerEmail: 'amitabh.sen@example.com',
    preferredContact: 'WHATSAPP',
    requestSiteVisit: true,
    message: 'Want to inspect the property in person. Is price negotiable for ready buyer?',
    status: 'QUALIFIED',
    priority: 'URGENT',
    assignedTo: 'sales-agent-2',
    assignedToName: 'Ananya Roy (Advisory)',
    source: 'LISTING_PAGE',
    sourcePage: `/buy/${resale1.slug}`,
    lastContactedAt: new Date(),
    nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    internalNotes: 'Buyer is pre-sanctioned with HDFC Bank. Ready for immediate token on satisfactory inspection.',
  });

  await enquiryRepository.create({
    contextType: 'RENTAL',
    projectId: merlinRise.id,
    projectSlug: merlinRise.slug,
    projectName: merlinRise.name,
    listingId: rent1.id,
    listingSlug: rent1.slug || rent1.id,
    listingTitle: '3 BHK Furnished Rental',
    configuration: '3 BHK Executive',
    propertyType: 'APARTMENT',
    priceDisplay: '₹ 38,000 / month',
    locationName: 'Rajarhat, Kolkata',
    buyerName: 'Vikramaditya Banerjee',
    buyerPhone: '+919822334455',
    buyerEmail: 'vikram.b@example.com',
    preferredContact: 'EMAIL',
    requestSiteVisit: true,
    message: 'Relocating to Kolkata IT park next month. Looking for 12-month corporate lease.',
    status: 'SITE_VISIT_SCHEDULED',
    priority: 'NORMAL',
    assignedTo: 'sales-agent-1',
    assignedToName: 'Suman Sen (Sales)',
    source: 'LISTING_PAGE',
    sourcePage: `/rent/${rent1.slug}`,
    lastContactedAt: new Date(),
    nextFollowUpAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    internalNotes: 'Site visit scheduled for Sunday 11:30 AM with landlord agent.',
  });

  await ensureSampleBrochureSeedData(merlinRise);
  await ensureVisitorAndCustomer360SeedData(merlinRise, rajarhat);
  if (!isMemoryMode) {
    globalForSeed.__ghPostgresSeedCompleted = true;
  }
  })()
    .catch((err) => {
      seedPromise = null;
      globalForSeed.__ghPostgresSeedCompleted = false;
      throw err;
    })
    .finally(() => {
      globalForSeed.__ghSeedInFlight = null;
    });

  seedPromise = activeRun;
  globalForSeed.__ghSeedInFlight = activeRun;
  return seedPromise;
}

async function ensureSampleBrochureSeedData(merlinRise: any): Promise<void> {
  if (!merlinRise?.id || globalForSeed.__ghInitialBrochureSeeded) return;
  try {
    const existingMedia = await projectMediaRepository.findByProjectId(merlinRise.id);
    const existingBrochure = existingMedia.find(
      (m) => (m.category || '').toUpperCase() === 'BROCHURE'
    );
    const storage = getStorageProvider();

    if (existingBrochure) {
      // Ensure the physical PDF file exists in storage for the existing brochure record
      const cleanUrl = existingBrochure.url.split('?')[0].trim();
      const storageKey = cleanUrl.startsWith('/uploads/')
        ? cleanUrl.replace(/^\/uploads\//, '')
        : cleanUrl.replace(/^\/+/, '');
      const exists = await storage.exists(storageKey).catch(() => false);
      if (!exists) {
        const pdfBuffer = buildMinimalValidPdfBuffer(merlinRise.name || 'Merlin Rise');
        await storage.upload(storageKey, pdfBuffer, 'application/pdf');
      }
      globalForSeed.__ghInitialBrochureSeeded = true;
      return;
    }

    const storageKey = `media/project/${merlinRise.id}/seed-brochure-merlin-rise/original_merlin-rise-official-brochure.pdf`;
    const pdfBuffer = buildMinimalValidPdfBuffer(merlinRise.name || 'Merlin Rise');
    const uploadedUrl = await storage.upload(storageKey, pdfBuffer, 'application/pdf');

    await projectMediaRepository.create({
      projectId: merlinRise.id,
      mediaType: 'DOCUMENT',
      category: 'BROCHURE',
      url: uploadedUrl,
      caption: 'merlin-rise-official-brochure.pdf',
      altText: `${merlinRise.name} Official Project Brochure PDF`,
      sortOrder: 99,
      isFeatured: false,
    });

    globalForSeed.__ghInitialBrochureSeeded = true;
  } catch (err) {
    console.warn('Sample brochure seed warning:', err);
  }
}

function buildMinimalValidPdfBuffer(projectName: string): Buffer {
  const safeTitle = projectName.replace(/[()\\]/g, '');
  const content = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >> endobj',
    '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj',
    `5 0 obj << /Length 120 >> stream\nBT /F1 18 Tf 72 700 Td (${safeTitle} - Great Homes Official Project Brochure) Tj ET\nendstream endobj`,
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000010 00000 n ',
    '0000000060 00000 n ',
    '0000000117 00000 n ',
    '0000000242 00000 n ',
    '0000000315 00000 n ',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '488',
    '%%EOF',
  ].join('\n');
  return Buffer.from(content, 'utf-8');
}

async function ensureVisitorAndCustomer360SeedData(merlinRise: any, rajarhat: any): Promise<void> {
  try {
    const existingArjun = await customerRepository.findByEmail('arjun.chatterjee@example.com');
    if (existingArjun) return;

    const newTown = await locationRepository.findBySlug('new-town');
    const allResale = await resaleListingRepository.findAll();
    const resale1 = allResale[0] || null;

    // 1. Customer: Arjun Chatterjee (OTP-verified buyer with full anonymous -> OTP -> shortlist -> enquiry -> site visit journey)
    const arjun = await customerRepository.create({
      name: 'Arjun Chatterjee',
      email: 'arjun.chatterjee@example.com',
      phone: '+919830551122',
      passwordHash: 'otp-only',
      status: 'ACTIVE',
    });

    await customerPreferenceRepository.upsert(arjun.id, {
      preferredMode: 'BUY',
      preferredLocations: ['Rajarhat', 'New Town'],
      preferredBhk: [3],
      preferredPropertyTypes: ['APARTMENT'],
      budgetMin: 6000000,
      budgetMax: 9500000,
      emailAlertsEnabled: true,
      newLaunchAlerts: true,
      priceDropAlerts: true,
    });

    await savedItemRepository.create({
      customerId: arjun.id,
      resourceType: 'PROJECT',
      resourceId: merlinRise.id,
    });
    if (resale1) {
      await savedItemRepository.create({
        customerId: arjun.id,
        resourceType: 'RESALE_LISTING',
        resourceId: resale1.id,
      });
    }

    await projectWatchRepository.create({
      customerId: arjun.id,
      projectId: merlinRise.id,
      enabled: true,
    });
    await locationWatchRepository.create({
      customerId: arjun.id,
      locationId: rajarhat.id,
      enabled: true,
    });

    // Record repeated views (3 views of Merlin Rise, 2 views of Resale 1)
    await recentlyViewedRepository.recordView(arjun.id, 'PROJECT', merlinRise.id);
    await recentlyViewedRepository.recordView(arjun.id, 'PROJECT', merlinRise.id);
    await recentlyViewedRepository.recordView(arjun.id, 'PROJECT', merlinRise.id);
    if (resale1) {
      await recentlyViewedRepository.recordView(arjun.id, 'RESALE_LISTING', resale1.id);
      await recentlyViewedRepository.recordView(arjun.id, 'RESALE_LISTING', resale1.id);
    }

    const arjunVisitorId = 'vis-seed-arjun-01';
    const arjunSession1 = 'sess-seed-arjun-01';
    const arjunSession2 = 'sess-seed-arjun-02';

    await visitorIntelligenceRepository.upsertVisitor({
      id: arjunVisitorId,
      customerId: arjun.id,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'kolkata_east_3bhk',
      referrerUrl: 'https://www.google.com/',
      landingPath: '/projects/merlin-rise',
      deviceClass: 'MOBILE',
      browserFamily: 'Chrome',
      incrementSessionCount: true,
    });
    await visitorIntelligenceRepository.linkVisitorToCustomer(arjunVisitorId, arjun.id);

    await visitorIntelligenceRepository.upsertSession({
      id: arjunSession1,
      visitorId: arjunVisitorId,
      customerId: arjun.id,
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'kolkata_east_3bhk',
      referrerUrl: 'https://www.google.com/',
      entryPath: '/projects/merlin-rise',
      exitPath: '/compare',
      deviceClass: 'MOBILE',
      browserFamily: 'Chrome',
      incrementPageViews: true,
      incrementEvents: true,
      durationSeconds: 340,
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: arjunVisitorId,
      sessionId: arjunSession1,
      customerId: arjun.id,
      eventType: 'SEARCH_EXECUTED',
      pagePath: '/projects',
      entityType: 'SEARCH',
      areaBasis: 'CARPET',
      metadata: {
        query: '3 BHK sports township Rajarhat',
        location: 'Rajarhat',
        bhk: '3 BHK',
        propertyType: 'APARTMENT',
        backfilledFromAnonymous: true,
      },
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: arjunVisitorId,
      sessionId: arjunSession1,
      customerId: arjun.id,
      eventType: 'PROJECT_VIEW',
      pagePath: '/projects/merlin-rise',
      pageTitle: merlinRise.name,
      entityType: 'PROJECT',
      entityId: merlinRise.id,
      entitySlug: merlinRise.slug,
      areaBasis: 'CARPET',
      durationSeconds: 185,
      metadata: {
        locationName: 'Rajarhat',
        bhk: '3 BHK',
        propertyType: 'APARTMENT',
        areaSqft: 890,
        price: 6800000,
        backfilledFromAnonymous: true,
      },
    });

    if (resale1) {
      await visitorIntelligenceRepository.recordEvent({
        visitorId: arjunVisitorId,
        sessionId: arjunSession1,
        customerId: arjun.id,
        eventType: 'RESALE_LISTING_VIEW',
        pagePath: `/buy/${resale1.slug || resale1.id}`,
        entityType: 'RESALE_LISTING',
        entityId: resale1.id,
        entitySlug: resale1.slug || resale1.id,
        areaBasis: 'SUPER_BUILT_UP',
        durationSeconds: 95,
        metadata: {
          locationName: 'Rajarhat',
          bhk: '3 BHK',
          propertyType: 'APARTMENT',
          areaSqft: 1450,
          price: 9200000,
          backfilledFromAnonymous: true,
        },
      });
    }

    await visitorIntelligenceRepository.recordEvent({
      visitorId: arjunVisitorId,
      sessionId: arjunSession1,
      customerId: arjun.id,
      eventType: 'COMPARE_VIEWED',
      pagePath: '/compare',
      entityType: 'COMPARISON',
      metadata: { mode: 'PROJECTS', comparedCount: 2, backfilledFromAnonymous: true },
    });

    await visitorIntelligenceRepository.upsertSession({
      id: arjunSession2,
      visitorId: arjunVisitorId,
      customerId: arjun.id,
      utmSource: 'direct',
      utmMedium: 'none',
      entryPath: '/projects/merlin-rise',
      exitPath: '/account/enquiries',
      deviceClass: 'MOBILE',
      browserFamily: 'Chrome',
      incrementPageViews: true,
      incrementEvents: true,
      durationSeconds: 420,
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: arjunVisitorId,
      sessionId: arjunSession2,
      customerId: arjun.id,
      eventType: 'OTP_VERIFIED',
      pagePath: '/projects/merlin-rise',
      metadata: { linkedPriorEvents: 4 },
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: arjunVisitorId,
      sessionId: arjunSession2,
      customerId: arjun.id,
      eventType: 'ITEM_SAVED',
      pagePath: '/projects/merlin-rise',
      entityType: 'PROJECT',
      entityId: merlinRise.id,
      entitySlug: merlinRise.slug,
      metadata: {},
    });

    const arjunEnquiry = await enquiryRepository.create({
      contextType: 'PROJECT',
      customerId: arjun.id,
      visitorId: arjunVisitorId,
      sessionId: arjunSession2,
      projectId: merlinRise.id,
      projectSlug: merlinRise.slug,
      projectName: merlinRise.name,
      configuration: '3 BHK Grande',
      propertyType: 'APARTMENT',
      priceDisplay: '₹ 68.00 L',
      locationName: 'Rajarhat, Kolkata',
      buyerName: arjun.name,
      buyerPhone: arjun.phone!,
      buyerEmail: arjun.email,
      preferredContact: 'WHATSAPP',
      requestSiteVisit: true,
      message: 'Shortlisted Merlin Rise 3 BHK Grande after comparing carpet efficiency. Requesting Saturday site visit.',
      status: 'SITE_VISIT_SCHEDULED',
      priority: 'HIGH',
      assignedTo: 'sales-agent-1',
      assignedToName: 'Suman Sen (Sales)',
      source: 'WEB_PORTAL',
      sourcePage: '/projects/merlin-rise',
      nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        referenceNumber: 'GH-ENQ-360101',
        customerId: arjun.id,
        visitorId: arjunVisitorId,
        sessionId: arjunSession2,
        preferredBhk: '3 BHK',
        budgetMin: 6000000,
        budgetMax: 9500000,
      },
    });

    const arjunVisit = await siteVisitRepository.create({
      enquiryId: arjunEnquiry.id,
      customerId: arjun.id,
      projectId: merlinRise.id,
      visitType: 'IN_PERSON',
      status: 'CONFIRMED',
      preferredDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      preferredTimeWindow: '10:00–12:00',
      confirmedAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      assignedTo: 'sales-agent-1',
      assignedToName: 'Suman Sen (Sales)',
      buyerNote: 'Bringing family to inspect model flat and sports complex.',
    });
    await enquiryRepository.update(arjunEnquiry.id, { siteVisitId: arjunVisit.id });

    // 2. Customer: Sneha Roy (High-intent researcher who opened enquiry modal without submitting)
    const sneha = await customerRepository.create({
      name: 'Sneha Roy',
      email: 'sneha.roy@example.com',
      phone: '+919830778899',
      passwordHash: 'otp-only',
      status: 'ACTIVE',
    });

    await customerPreferenceRepository.upsert(sneha.id, {
      preferredMode: 'BUY',
      preferredLocations: ['New Town', 'Rajarhat'],
      preferredBhk: [2, 3],
      preferredPropertyTypes: ['APARTMENT'],
      budgetMin: 4500000,
      budgetMax: 7200000,
    });

    await savedItemRepository.create({
      customerId: sneha.id,
      resourceType: 'PROJECT',
      resourceId: merlinRise.id,
    });
    if (newTown) {
      await locationWatchRepository.create({
        customerId: sneha.id,
        locationId: newTown.id,
        enabled: true,
      });
    }
    await recentlyViewedRepository.recordView(sneha.id, 'PROJECT', merlinRise.id);
    await recentlyViewedRepository.recordView(sneha.id, 'PROJECT', merlinRise.id);

    const snehaVisitorId = 'vis-seed-sneha-01';
    const snehaSessionId = 'sess-seed-sneha-01';

    await visitorIntelligenceRepository.upsertVisitor({
      id: snehaVisitorId,
      customerId: sneha.id,
      utmSource: 'instagram',
      utmMedium: 'paid_social',
      utmCampaign: 'kolkata_new_launch_2026',
      landingPath: '/locations/new-town',
      deviceClass: 'MOBILE',
      browserFamily: 'Safari',
      incrementSessionCount: true,
    });
    await visitorIntelligenceRepository.linkVisitorToCustomer(snehaVisitorId, sneha.id);

    await visitorIntelligenceRepository.upsertSession({
      id: snehaSessionId,
      visitorId: snehaVisitorId,
      customerId: sneha.id,
      utmSource: 'instagram',
      utmMedium: 'paid_social',
      utmCampaign: 'kolkata_new_launch_2026',
      entryPath: '/locations/new-town',
      exitPath: '/projects/merlin-rise',
      deviceClass: 'MOBILE',
      browserFamily: 'Safari',
      incrementPageViews: true,
      incrementEvents: true,
      durationSeconds: 260,
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: snehaVisitorId,
      sessionId: snehaSessionId,
      customerId: sneha.id,
      eventType: 'FILTER_APPLIED',
      pagePath: '/projects',
      entityType: 'SEARCH',
      areaBasis: 'BUILT_UP',
      metadata: {
        location: 'New Town',
        bhk: '2 BHK',
        propertyType: 'APARTMENT',
        areaSqft: 780,
      },
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: snehaVisitorId,
      sessionId: snehaSessionId,
      customerId: sneha.id,
      eventType: 'PROJECT_VIEW',
      pagePath: '/projects/merlin-rise',
      entityType: 'PROJECT',
      entityId: merlinRise.id,
      entitySlug: merlinRise.slug,
      areaBasis: 'BUILT_UP',
      durationSeconds: 140,
      metadata: {
        locationName: 'Rajarhat',
        bhk: '2 BHK',
        areaSqft: 780,
        price: 4800000,
      },
    });

    await visitorIntelligenceRepository.recordEvent({
      visitorId: snehaVisitorId,
      sessionId: snehaSessionId,
      customerId: sneha.id,
      eventType: 'ENQUIRY_MODAL_OPENED',
      pagePath: '/projects/merlin-rise',
      entityType: 'PROJECT',
      entityId: merlinRise.id,
      entitySlug: merlinRise.slug,
      metadata: { contextType: 'PROJECT', title: merlinRise.name },
    });

    // 3. Customer: Rahul Sharma (+919876543210 — matches historical anonymous enquiry by phone)
    await customerRepository.create({
      name: 'Rahul Sharma',
      email: 'rahul.sharma@example.com',
      phone: '+919876543210',
      passwordHash: 'otp-only',
      status: 'ACTIVE',
    });

    // 4. Anonymous Visitors (Not yet OTP-authenticated)
    const anonVisitor1 = 'vis-seed-anon-01';
    const anonSession1 = 'sess-seed-anon-01';
    await visitorIntelligenceRepository.upsertVisitor({
      id: anonVisitor1,
      utmSource: 'organic',
      utmMedium: 'search',
      referrerUrl: 'https://www.google.co.in/',
      landingPath: '/locations/rajarhat',
      deviceClass: 'DESKTOP',
      browserFamily: 'Chrome',
      incrementSessionCount: true,
    });
    await visitorIntelligenceRepository.upsertSession({
      id: anonSession1,
      visitorId: anonVisitor1,
      utmSource: 'organic',
      utmMedium: 'search',
      entryPath: '/locations/rajarhat',
      exitPath: '/projects/merlin-rise',
      deviceClass: 'DESKTOP',
      browserFamily: 'Chrome',
      incrementPageViews: true,
      incrementEvents: true,
      durationSeconds: 210,
    });
    await visitorIntelligenceRepository.recordEvent({
      visitorId: anonVisitor1,
      sessionId: anonSession1,
      eventType: 'LOCATION_VIEW',
      pagePath: '/locations/rajarhat',
      entityType: 'LOCATION',
      entityId: rajarhat.id,
      entitySlug: rajarhat.slug,
      metadata: { locationName: 'Rajarhat' },
    });
    await visitorIntelligenceRepository.recordEvent({
      visitorId: anonVisitor1,
      sessionId: anonSession1,
      eventType: 'PROJECT_VIEW',
      pagePath: '/projects/merlin-rise',
      entityType: 'PROJECT',
      entityId: merlinRise.id,
      entitySlug: merlinRise.slug,
      areaBasis: 'CARPET',
      durationSeconds: 115,
      metadata: { locationName: 'Rajarhat', bhk: '3 BHK', areaSqft: 890 },
    });
  } catch (err) {
    console.warn('Visitor & Customer 360 seed warning:', err);
  }
}

// ============================================================================
// Phase 2: Location Master Import & Idempotent Sync
// ============================================================================

export interface LocationMasterImportResult {
  totalSourceRecords: number;
  preservedExistingCount: number;
  createdCount: number;
  updatedCount: number;
  unmodifiedCount: number;
  preservedSlugs: string[];
  createdSlugs: string[];
  updatedSlugs: string[];
  isDryRun: boolean;
  hierarchyValid: boolean;
  errors: string[];
}

export async function importLocationMasterData(options?: {
  dryRun?: boolean;
  protectCuratedFields?: boolean;
}): Promise<LocationMasterImportResult> {
  const isDryRun = options?.dryRun ?? false;
  const protectCurated = options?.protectCuratedFields ?? true;

  const errors: string[] = [];
  const preservedSlugs: string[] = [];
  const createdSlugs: string[] = [];
  const updatedSlugs: string[] = [];
  let unmodifiedCount = 0;

  // 1. Fetch all current locations
  const existingLocations = await locationRepository.findAll();
  const existingBySlug = new Map<string, typeof existingLocations[0]>();
  const slugToId = new Map<string, string>();

  for (const loc of existingLocations) {
    existingBySlug.set(loc.slug, loc);
    slugToId.set(loc.slug, loc.id);
  }

  // 2. Order records by hierarchy tier to ensure parent always exists before children
  const tierOrder: Record<string, number> = {
    STATE: 0,
    DISTRICT: 1,
    CITY: 2,
    DISCOVERY_REGION: 3,
    AREA: 4,
    NEIGHBOURHOOD: 5,
  };

  const sortedRecords = [...LOCATION_MASTER_RECORDS].sort((a, b) => {
    const aTier = tierOrder[a.type] ?? 99;
    const bTier = tierOrder[b.type] ?? 99;
    return aTier - bTier;
  });

  // 3. Process each record idempotently
  for (const record of sortedRecords) {
    let parentId: string | null = null;
    if (record.parentSlug) {
      parentId = slugToId.get(record.parentSlug) ?? null;
      if (!parentId) {
        errors.push(`Parent slug "${record.parentSlug}" not resolved for "${record.name}" (${record.slug})`);
      }
    }

    const existing = existingBySlug.get(record.slug);

    if (existing) {
      // Preserve existing ID
      slugToId.set(record.slug, existing.id);
      preservedSlugs.push(record.slug);

      // Check if update is needed while protecting curated fields
      let needsUpdate = false;
      const updateData: Partial<typeof existing> = {};

      if (parentId && existing.parentId !== parentId) {
        updateData.parentId = parentId;
        needsUpdate = true;
      }

      if (!protectCurated) {
        if (record.description && record.description !== existing.description) {
          updateData.description = record.description;
          needsUpdate = true;
        }
        if (record.tagline && record.tagline !== existing.shortDescription) {
          updateData.shortDescription = record.tagline;
          needsUpdate = true;
        }
        if (record.latitude != null && record.latitude !== existing.latitude) {
          updateData.latitude = record.latitude;
          needsUpdate = true;
        }
        if (record.longitude != null && record.longitude !== existing.longitude) {
          updateData.longitude = record.longitude;
          needsUpdate = true;
        }
      } else {
        // Only backfill missing fields without clobbering curated content
        if (!existing.description && record.description) {
          updateData.description = record.description;
          needsUpdate = true;
        }
        if (!existing.shortDescription && record.tagline) {
          updateData.shortDescription = record.tagline;
          needsUpdate = true;
        }
        if (existing.latitude == null && record.latitude != null) {
          updateData.latitude = record.latitude;
          needsUpdate = true;
        }
        if (existing.longitude == null && record.longitude != null) {
          updateData.longitude = record.longitude;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        if (!isDryRun) {
          await locationRepository.update(existing.id, updateData);
        }
        updatedSlugs.push(record.slug);
      } else {
        unmodifiedCount++;
      }
    } else {
      // New record to insert
      if (isDryRun) {
        slugToId.set(record.slug, `dry-run-simulated-${record.slug}`);
        createdSlugs.push(record.slug);
      } else {
        const created = await locationRepository.create({
          name: record.name,
          slug: record.slug,
          type: record.type,
          parentId: parentId,
          description: record.description ?? null,
          shortDescription: record.tagline ?? null,
          latitude: record.latitude,
          longitude: record.longitude,
          status: record.status,
          featured: record.featured,
        });
        slugToId.set(record.slug, created.id);
        createdSlugs.push(record.slug);
      }
    }
  }

  return {
    totalSourceRecords: LOCATION_MASTER_RECORDS.length,
    preservedExistingCount: preservedSlugs.length,
    createdCount: createdSlugs.length,
    updatedCount: updatedSlugs.length,
    unmodifiedCount,
    preservedSlugs,
    createdSlugs,
    updatedSlugs,
    isDryRun,
    hierarchyValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Phase 2: Dummy Locations Identification & Cleanup
// ============================================================================

export const CONFIRMED_DUMMY_SLUGS = [
  'secret-sector-9',
  'old-industrial-zone',
  'disposable-test-loc-1791542849839',
  'p151-loc-1791315489019',
  'neon-loc-1790939962578',
  'neon-loc-1790940437716',
  'neon-loc-1790941426458',
];

export interface DummyLocationDependencyReport {
  projects: number;
  resaleListings: number;
  rentalListings: number;
  locationWatchlists: number;
  notifications: number;
  locationMarketSnapshots: number;
  marketEvents: number;
  editorialArticles: number;
  childLocations: number;
}

export interface DummyLocationCandidate {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: string;
  createdAt: Date;
  creationContext: string;
  isConfirmedDummy: boolean;
  dependencies: DummyLocationDependencyReport;
  totalDependencies: number;
  canSafelyDelete: boolean;
  actionProposed: 'DELETE' | 'BLOCKED_BY_DEPENDENCIES' | 'PRESERVED_LEGITIMATE';
}

export async function inspectDummyLocations(): Promise<DummyLocationCandidate[]> {
  const allLocations = await locationRepository.findAll();
  const db = getDb();
  const candidates: DummyLocationCandidate[] = [];

  for (const loc of allLocations) {
    if (!CONFIRMED_DUMMY_SLUGS.includes(loc.slug)) continue;

    let creationContext = 'Unknown / Test Run';
    if (loc.slug.startsWith('neon-loc-')) {
      creationContext = 'Neon Postgres Initial Connectivity & Persistence Test (Oct 2, 2026)';
    } else if (loc.slug.startsWith('p151-loc-')) {
      creationContext = 'Phase 15.1 Integration Test Locality (Oct 6, 2026)';
    } else if (loc.slug.startsWith('disposable-test-loc-')) {
      creationContext = 'Ephemeral Test Locality Validation (Oct 9, 2026)';
    } else if (loc.slug === 'secret-sector-9') {
      creationContext = 'Initial Seeder Boundary Draft Test Node (Oct 2, 2026)';
    } else if (loc.slug === 'old-industrial-zone') {
      creationContext = 'Initial Seeder Boundary Archived Test Node (Oct 2, 2026)';
    }

    const deps: DummyLocationDependencyReport = {
      projects: 0,
      resaleListings: 0,
      rentalListings: 0,
      locationWatchlists: 0,
      notifications: 0,
      locationMarketSnapshots: 0,
      marketEvents: 0,
      editorialArticles: 0,
      childLocations: 0,
    };

    if (db && typeof (db as any).execute === 'function') {
      try {
        const checkCount = async (table: string, col: string) => {
          try {
            const res: any = await (db as any).execute(
              `SELECT count(*) as count FROM ${table} WHERE ${col} = '${loc.id}'`
            );
            return parseInt(res.rows?.[0]?.count ?? '0', 10);
          } catch {
            return 0;
          }
        };

        deps.projects = await checkCount('projects', 'location_id');
        deps.resaleListings = await checkCount('resale_listings', 'location_id');
        deps.rentalListings = await checkCount('rental_listings', 'location_id');
        deps.locationWatchlists = await checkCount('location_watchlists', 'location_id');
        deps.notifications = await checkCount('notifications', 'location_id');
        deps.locationMarketSnapshots = await checkCount('location_market_snapshots', 'location_id');
        deps.marketEvents = await checkCount('market_events', 'location_id');
        deps.editorialArticles = await checkCount('editorial_articles', 'location_id');
        deps.childLocations = await checkCount('locations', 'parent_id');
      } catch (err) {
        console.warn('Dependency check warning:', err);
      }
    }

    const totalDependencies =
      deps.projects +
      deps.resaleListings +
      deps.rentalListings +
      deps.locationWatchlists +
      deps.notifications +
      deps.locationMarketSnapshots +
      deps.marketEvents +
      deps.editorialArticles +
      deps.childLocations;

    const canSafelyDelete = totalDependencies === 0;

    candidates.push({
      id: loc.id,
      name: loc.name,
      slug: loc.slug,
      status: loc.status,
      type: loc.type,
      createdAt: loc.createdAt,
      creationContext,
      isConfirmedDummy: true,
      dependencies: deps,
      totalDependencies,
      canSafelyDelete,
      actionProposed: canSafelyDelete ? 'DELETE' : 'BLOCKED_BY_DEPENDENCIES',
    });
  }

  return candidates;
}

export async function cleanupDummyLocations(options?: { dryRun?: boolean }) {
  const isDryRun = options?.dryRun ?? true;
  const candidates = await inspectDummyLocations();
  const deletedSlugs: string[] = [];
  const blockedSlugs: string[] = [];

  for (const c of candidates) {
    if (!c.canSafelyDelete) {
      blockedSlugs.push(c.slug);
      continue;
    }

    if (!isDryRun) {
      await locationRepository.delete(c.id);
      deletedSlugs.push(c.slug);
    } else {
      deletedSlugs.push(`(dry-run: ${c.slug})`);
    }
  }

  return {
    candidates,
    deletedSlugs,
    blockedSlugs,
    isDryRun,
  };
}

// ============================================================================
// Phase 3: Developer Profile JSON Import
// ============================================================================

export interface DeveloperImportRecord {
  developerName: string;
  officialWebsiteUrl: string;
  shortOneLineDescription: string;
  longDetailedNarrativeAbout: string;
}

export interface DeveloperImportResult {
  totalSourceRecords: number;
  matchedExistingCount: number;
  updatedCount: number;
  unmodifiedCount: number;
  proposedNewDraftsCount: number;
  flaggedInvalidUrlsCount: number;
  ambiguousConflictsCount: number;
  updatedDevelopers: {
    id: string;
    name: string;
    slug: string;
    websiteUrl: string | null;
    shortDescription: string | null;
    description: string | null;
  }[];
  proposedNewDrafts: {
    developerName: string;
    officialWebsiteUrl: string;
    hasValidUrl: boolean;
    shortOneLineDescription: string;
    flags: string[];
  }[];
  flaggedRecords: {
    developerName: string;
    websiteValue: string;
    reason: string;
  }[];
  isDryRun: boolean;
}

export async function importDeveloperProfileData(options?: {
  dryRun?: boolean;
}): Promise<DeveloperImportResult> {
  const isDryRun = options?.dryRun ?? false;

  const fs = await import('fs');
  const path = await import('path');
  const jsonPath = path.resolve('src/infrastructure/data/Great_Homes_Developer_Profile_Import.json');
  const rawData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const records: DeveloperImportRecord[] = rawData.records;

  const normalize = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const isValidHttpUrl = (url: string) => {
    if (!url || url.toLowerCase() === 'not verified') return false;
    try {
      const u = new URL(url);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const nationalCorporateNames = ['DLF', 'Ekta World', 'Unitech Group', 'Lodha Developers'];
  const withheldWebsiteNames = ['Realtech Group', 'Space Group', 'Bengal NRI Complex'];

  const allDevelopers = await developerRepository.list();
  const updatedDevelopers: DeveloperImportResult['updatedDevelopers'] = [];
  const proposedNewDrafts: DeveloperImportResult['proposedNewDrafts'] = [];
  const flaggedRecords: DeveloperImportResult['flaggedRecords'] = [];

  let updatedCount = 0;
  let unmodifiedCount = 0;

  for (const r of records) {
    const rNorm = normalize(r.developerName);
    const hasValidUrl = isValidHttpUrl(r.officialWebsiteUrl);

    if (!hasValidUrl || r.officialWebsiteUrl.toLowerCase() === 'not verified') {
      flaggedRecords.push({
        developerName: r.developerName,
        websiteValue: r.officialWebsiteUrl,
        reason: r.officialWebsiteUrl.toLowerCase() === 'not verified'
          ? "Explicitly marked 'Not verified'; cannot be saved as official website URL."
          : "Invalid or unsupported URL format.",
      });
    }

    const matched = allDevelopers.find(d => normalize(d.name) === rNorm);

    if (matched) {
      // Safe update of only the 3 profile fields
      const updates: Partial<typeof matched> = {};
      let needsUpdate = false;

      // 1. Official website URL: never overwrite with 'Not verified' or invalid URL
      if (hasValidUrl && r.officialWebsiteUrl !== matched.websiteUrl) {
        updates.websiteUrl = r.officialWebsiteUrl;
        needsUpdate = true;
      }

      // 2. Short description
      if (r.shortOneLineDescription && r.shortOneLineDescription !== matched.shortDescription) {
        updates.shortDescription = r.shortOneLineDescription;
        needsUpdate = true;
      }

      // 3. Long narrative about
      if (r.longDetailedNarrativeAbout && r.longDetailedNarrativeAbout !== matched.description) {
        updates.description = r.longDetailedNarrativeAbout;
        needsUpdate = true;
      }

      if (needsUpdate) {
        if (!isDryRun) {
          const updated = await developerRepository.update(matched.id, updates);
          if (updated) {
            updatedDevelopers.push({
              id: updated.id,
              name: updated.name,
              slug: updated.slug,
              websiteUrl: updated.websiteUrl,
              shortDescription: updated.shortDescription,
              description: updated.description,
            });
          }
        } else {
          updatedDevelopers.push({
            id: matched.id,
            name: matched.name,
            slug: matched.slug,
            websiteUrl: updates.websiteUrl ?? matched.websiteUrl,
            shortDescription: updates.shortDescription ?? matched.shortDescription,
            description: updates.description ?? matched.description,
          });
        }
        updatedCount++;
      } else {
        unmodifiedCount++;
      }
    } else {
      // Developer does not exist: list as proposed new draft profile without inventing ID or slug
      const flags: string[] = [];
      if (withheldWebsiteNames.includes(r.developerName)) {
        flags.push('WITHHELD_WEBSITE_NOT_VERIFIED');
      }
      if (nationalCorporateNames.includes(r.developerName)) {
        flags.push('NATIONAL_PORTFOLIO_REVIEW_REQUIRED');
      }

      proposedNewDrafts.push({
        developerName: r.developerName,
        officialWebsiteUrl: r.officialWebsiteUrl,
        hasValidUrl,
        shortOneLineDescription: r.shortOneLineDescription,
        flags,
      });
    }
  }

  return {
    totalSourceRecords: records.length,
    matchedExistingCount: updatedDevelopers.length + unmodifiedCount,
    updatedCount,
    unmodifiedCount,
    proposedNewDraftsCount: proposedNewDrafts.length,
    flaggedInvalidUrlsCount: flaggedRecords.length,
    ambiguousConflictsCount: 0,
    updatedDevelopers,
    proposedNewDrafts,
    flaggedRecords,
    isDryRun,
  };
}

