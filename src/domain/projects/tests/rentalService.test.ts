import { resaleListingService } from '../services/resaleService';
import { rentalListingService, RentalService } from '../services/rentalService';
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
import { RentalListingRepositoryMemory } from '../repositories/rentalRepository';

async function runRentalTests() {
  console.log('Running Rental Intelligence Tests...');

  const projectRepo = new ProjectRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();
  const rentalRepo = new RentalListingRepositoryMemory();

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

  const rentalService = new RentalService(rentalRepo, projectService);

  // 1. Create developer, location, project
  const developer = await devRepo.create({
    name: 'Rental Developer',
    slug: 'rental-developer',
    description: 'Test developer',
    shortDescription: 'Short desc',
    websiteUrl: 'https://example.com',
    status: 'PUBLISHED',
    featured: false,
  });

  const location = await locRepo.create({
    name: 'Rental Location',
    slug: 'rental-location',
    type: 'CITY',
    status: 'PUBLISHED',
    featured: false,
  });

  const project = await projectService.createProject({
    developerId: developer.id,
    locationId: location.id,
    name: 'Rental Tower',
    slug: 'rental-tower',
    status: 'READY_TO_MOVE',
    propertyType: 'APARTMENT',
    lifecycleStatus: 'PUBLISHED',
  });

  // 2. Test listing creation with OWNER and LISTING_PARTNER
  const ownerListing = await rentalService.createListing({
    projectId: project.id,
    propertyType: 'APARTMENT',
    configuration: '2 BHK',
    bedroomCount: 2,
    carpetArea: 1100,
    monthlyRent: 45000,
    maintenance: 5000,
    securityDeposit: 150000,
    furnishing: 'SEMI_FURNISHED',
    listingPartyType: 'OWNER',
    ownerName: 'John Doe',
    ownerPhone: '+919999999999',
    ownerEmail: 'john@example.com',
    internalNotes: 'Owner tenant verification pending.',
  });

  const partnerListing = await rentalService.createListing({
    projectId: project.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK',
    bedroomCount: 3,
    carpetArea: 1600,
    monthlyRent: 75000,
    maintenance: 8000,
    securityDeposit: 250000,
    furnishing: 'FULLY_FURNISHED',
    listingPartyType: 'LISTING_PARTNER',
    brokerName: 'Apex Realty',
    brokerPhone: '+918888888888',
    brokerEmail: 'broker@apexrealty.com',
  });

  console.log('✔ 1. Rental listings creation passed');

  // 3. Test Lifecycle Transitions
  await rentalService.transitionLifecycle(ownerListing.id, 'SUBMITTED');
  await rentalService.transitionLifecycle(ownerListing.id, 'UNDER_REVIEW');
  await rentalService.transitionLifecycle(ownerListing.id, 'APPROVED');
  await rentalService.transitionLifecycle(ownerListing.id, 'PUBLISHED');

  await rentalService.transitionLifecycle(partnerListing.id, 'SUBMITTED');
  await rentalService.transitionLifecycle(partnerListing.id, 'UNDER_REVIEW');
  await rentalService.transitionLifecycle(partnerListing.id, 'APPROVED');
  await rentalService.transitionLifecycle(partnerListing.id, 'PUBLISHED');

  console.log('✔ 2. Valid rental lifecycle transitions passed');

  // Test invalid lifecycle transition (PUBLISHED -> DRAFT)
  try {
    await rentalService.transitionLifecycle(ownerListing.id, 'DRAFT');
    throw new Error('Should have failed');
  } catch (err: any) {
    if (err.name !== 'InvalidLifecycleTransitionError') throw err;
  }
  console.log('✔ 3. Invalid rental lifecycle transition rejection passed');



  // 4. Test Privacy & Security Audit (Private fields stripping)
  const publicDto = await rentalService.getPublicListingById(ownerListing.id);
  if (!publicDto) throw new Error('Public DTO should exist for published rental listing');

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
    'verifiedBy',
  ];

  for (const field of forbiddenFields) {
    if (serialized.includes(field)) {
      throw new Error(`SECURITY VIOLATION: Forbidden field '${field}' found in public rental DTO!`);
    }
  }
  console.log('✔ 4. Public Rental DTO privacy & security audit passed (No private contacts)');

  // 5. Test Listing Party public label representation
  if (publicDto.listingParty.type !== 'OWNER' || publicDto.listingParty.label !== 'Owner Listed') {
    throw new Error('Incorrect owner rental listing party public representation');
  }

  const partnerPublicDto = await rentalService.getPublicListingById(partnerListing.id);
  if (!partnerPublicDto || partnerPublicDto.listingParty.type !== 'LISTING_PARTNER' || partnerPublicDto.listingParty.label !== 'Listing Partner') {
    throw new Error('Incorrect listing partner rental public representation');
  }
  console.log('✔ 5. Listing party rental public representation passed');

  // 6. Test Project-level published rental filtering
  const projectListings = await rentalService.getPublicListingsForProject(project.id);
  if (projectListings.length !== 2) {
    throw new Error(`Expected 2 published rental listings for project, got ${projectListings.length}`);
  }
  console.log('✔ 6. Project published rental filtering passed');

  // 7. Test Rental Archive and Restore workflow (PUBLISHED -> PAUSED -> ARCHIVED -> DRAFT)
  await rentalService.transitionLifecycle(ownerListing.id, 'PAUSED');
  await rentalService.transitionLifecycle(ownerListing.id, 'ARCHIVED');
  const restoredRental = await rentalService.transitionLifecycle(ownerListing.id, 'DRAFT');
  if (restoredRental.lifecycleStatus !== 'DRAFT') {
    throw new Error('Failed to restore archived rental listing to DRAFT');
  }
  console.log('✔ 7. Rental Archive and restore (ARCHIVED -> DRAFT) test passed');

  console.log('Rental Test Initialization passed successfully.');
}

runRentalTests().catch(err => {
  console.error('Rental tests failed:', err);
  process.exit(1);
});
