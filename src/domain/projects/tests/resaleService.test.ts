import { resaleListingService } from '../services/resaleService';
import { ProjectIntelligenceService } from '../services/projectIntelligenceService';
import {
  ProjectRepositoryMemory,
  ProjectConfigurationRepositoryMemory,
  ProjectMediaRepositoryMemory,
  ProjectReraRepositoryMemory,
  AmenityRepositoryMemory,
  ProjectFaqRepositoryMemory,
} from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { DeveloperRepositoryMemory } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { LocationRepositoryMemory } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';
import { ResaleListingRepositoryMemory } from '../repositories/resaleRepository';
import { ResaleListingService } from '../services/resaleService';

async function runResaleTests() {
  console.log('Running Resale Intelligence Tests...');

  const projectRepo = new ProjectRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();
  const resaleRepo = new ResaleListingRepositoryMemory();

  const projectService = new ProjectIntelligenceService(
    projectRepo,
    configRepo,
    mediaRepo,
    reraRepo,
    amenityRepo,
    faqRepo,
    devRepo,
    locRepo
  );

  const resaleService = new ResaleListingService(resaleRepo, projectService);

  // 1. Create developer, location, project
  const developer = await devRepo.create({
    name: 'Resale Developer',
    slug: 'resale-developer',
    description: 'Test developer',
    shortDescription: 'Test short desc',
    websiteUrl: 'https://example.com',
    status: 'PUBLISHED',
    featured: false,
  });

  const location = await locRepo.create({
    name: 'Resale Location',
    slug: 'resale-location',
    type: 'CITY',
    status: 'PUBLISHED',
    featured: false,
  });

  const project = await projectService.createProject({
    developerId: developer.id,
    locationId: location.id,
    name: 'Resale Tower',
    slug: 'resale-tower',
    status: 'READY_TO_MOVE',
    propertyType: 'APARTMENT',
    lifecycleStatus: 'PUBLISHED',
  });

  // 2. Test listing creation with OWNER and LISTING_PARTNER
  const ownerListing = await resaleService.createListing({
    projectId: project.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK',
    bedroomCount: 3,
    carpetArea: 1450,
    askingPrice: 16500000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'EAST',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    ownerName: 'Secret Owner Name',
    ownerPhone: '+919999999999',
    ownerEmail: 'owner@example.com',
    internalNotes: 'VIP client, needs urgent sale.',
    source: 'Direct Walk-in',
  });

  const partnerListing = await resaleService.createListing({
    projectId: project.id,
    propertyType: 'APARTMENT',
    configuration: '2 BHK',
    bedroomCount: 2,
    carpetArea: 1100,
    askingPrice: 11500000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'NORTH',
    floorCategory: 'HIGH_FLOOR',
    possession: 'READY',
    listingPartyType: 'LISTING_PARTNER',
    brokerName: 'Secret Broker Name',
    brokerPhone: '+918888888888',
    brokerEmail: 'broker@example.com',
    internalNotes: 'Exclusive mandate.',
  });

  console.log('✔ 1. Resale listings creation passed');

  // 3. Test Lifecycle Transitions
  await resaleService.transitionLifecycle(ownerListing.id, 'SUBMITTED');
  await resaleService.transitionLifecycle(ownerListing.id, 'UNDER_REVIEW');
  await resaleService.transitionLifecycle(ownerListing.id, 'APPROVED');
  await resaleService.transitionLifecycle(ownerListing.id, 'PUBLISHED');

  await resaleService.transitionLifecycle(partnerListing.id, 'SUBMITTED');
  await resaleService.transitionLifecycle(partnerListing.id, 'UNDER_REVIEW');
  await resaleService.transitionLifecycle(partnerListing.id, 'APPROVED');
  await resaleService.transitionLifecycle(partnerListing.id, 'PUBLISHED');

  console.log('✔ 2. Valid lifecycle transitions passed');

  // Test invalid lifecycle transition (PUBLISHED cannot transition directly to ARCHIVED without going through SOLD_RENTED or PAUSED)
  try {
    await resaleService.transitionLifecycle(ownerListing.id, 'DRAFT');
    throw new Error('Should have failed');
  } catch (err: any) {
    if (err.name !== 'InvalidLifecycleTransitionError') throw err;
  }
  console.log('✔ 3. Invalid lifecycle transition rejection passed');



  // 4. Test Privacy & Security Audit (Private fields stripping)
  const publicDto = await resaleService.getPublicListingById(ownerListing.id);
  if (!publicDto) throw new Error('Public DTO should exist for published listing');

  const serialized = JSON.stringify(publicDto);
  const forbiddenFields = [
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
    'pricePerSqft',
    'effectivePricePerSqft',
  ];

  for (const field of forbiddenFields) {
    if (serialized.includes(field)) {
      throw new Error(`SECURITY VIOLATION: Forbidden field '${field}' found in public resale DTO!`);
    }
  }
  console.log('✔ 4. Public DTO privacy & security audit passed (No private contacts, no per-sqft pricing)');

  // 5. Test Listing Party public label representation
  if (publicDto.listingParty.type !== 'OWNER' || publicDto.listingParty.label !== 'Owner Listed') {
    throw new Error('Incorrect owner listing party public representation');
  }

  const partnerPublicDto = await resaleService.getPublicListingById(partnerListing.id);
  if (!partnerPublicDto || partnerPublicDto.listingParty.type !== 'LISTING_PARTNER' || partnerPublicDto.listingParty.label !== 'Listing Partner') {
    throw new Error('Incorrect listing partner public representation');
  }
  console.log('✔ 5. Listing party public representation (Owner Listed vs Listing Partner) passed');

  // 6. Test Project-level published filtering
  const projectListings = await resaleService.getPublicListingsForProject(project.id);
  if (projectListings.length !== 2) {
    throw new Error(`Expected 2 published listings for project, got ${projectListings.length}`);
  }
  console.log('✔ 6. Project published resale filtering passed');

  // 7. Test Archive and Restore workflow (PUBLISHED -> PAUSED -> ARCHIVED -> DRAFT)
  await resaleService.transitionLifecycle(ownerListing.id, 'PAUSED');
  await resaleService.transitionLifecycle(ownerListing.id, 'ARCHIVED');
  const restored = await resaleService.transitionLifecycle(ownerListing.id, 'DRAFT');
  if (restored.lifecycleStatus !== 'DRAFT') {
    throw new Error('Failed to restore archived listing to DRAFT');
  }
  console.log('✔ 7. Archive and restore (ARCHIVED -> DRAFT) test passed');

  console.log('Resale Test Initialization passed successfully.');
}

runResaleTests().catch(err => {
  console.error('Resale tests failed:', err);
  process.exit(1);
});
