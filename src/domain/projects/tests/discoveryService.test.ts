import { propertyDiscoveryService } from '../services/propertyDiscoveryService';
import { projectIntelligenceService } from '../services/projectIntelligenceService';
import { resaleListingService } from '../services/resaleService';
import { rentalListingService } from '../services/rentalService';
import { newBookingService } from '../services/newBookingService';
import { developerRepository } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { locationRepository } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';

async function runDiscoveryTests() {
  console.log('Running Discovery Intelligence Tests...');

  const dev = await developerRepository.create({
    name: 'Discovery Developer',
    slug: 'discovery-developer',
    description: 'Dev',
    shortDescription: 'Dev',
    websiteUrl: 'https://example.com',
    status: 'PUBLISHED',
    featured: false,
  });

  const loc = await locationRepository.create({
    name: 'Discovery Location',
    slug: 'discovery-location',
    type: 'CITY',
    status: 'PUBLISHED',
    featured: false,
  });

  const proj = await projectIntelligenceService.createProject({
    developerId: dev.id,
    locationId: loc.id,
    name: 'Discovery Project',
    slug: 'discovery-project',
    status: 'UNDER_CONSTRUCTION',
    propertyType: 'APARTMENT',
    lifecycleStatus: 'PUBLISHED',
  });

  const config = await projectIntelligenceService.createConfiguration(
    proj.id,
    {
      name: '2 BHK Premium',
      bedroomCount: 2,
      carpetArea: 800,
      builtUpArea: 1000,
      superBuiltUpArea: 1200,
      price: 8500000,
      priceBasis: 'CARPET_AREA',
    }
  );

  await newBookingService.setConfigurationAvailability(
    proj.id,
    config.id,
    'AVAILABLE',
    'INTERNAL',
    'TEST_NOTES'
  );

  const resale = await resaleListingService.createListing({
    projectId: proj.id,
    propertyType: 'APARTMENT',
    configuration: '3 BHK',
    bedroomCount: 3,
    carpetArea: 1200,
    askingPrice: 15000000,
    furnishing: 'SEMI_FURNISHED',
    facing: 'UNKNOWN',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'OWNER',
    ownerName: 'Private Owner',
    ownerPhone: '+919876543210',
    ownerEmail: 'private@example.com',
    internalNotes: 'SECRET_NOTE_123'
  });
  await resaleListingService.transitionLifecycle(resale.id, 'SUBMITTED');
  await resaleListingService.transitionLifecycle(resale.id, 'UNDER_REVIEW');
  await resaleListingService.transitionLifecycle(resale.id, 'APPROVED');
  await resaleListingService.transitionLifecycle(resale.id, 'PUBLISHED');

  const rental = await rentalListingService.createListing({
    projectId: proj.id,
    propertyType: 'APARTMENT',
    configuration: '2 BHK',
    bedroomCount: 2,
    carpetArea: 800,
    monthlyRent: 45000,
    furnishing: 'FULLY_FURNISHED',
    facing: 'UNKNOWN',
    floorCategory: 'MID_FLOOR',
    possession: 'READY',
    listingPartyType: 'LISTING_PARTNER',
    brokerName: 'Secret Broker',
    brokerPhone: '+919999988888',
    brokerEmail: 'broker@example.com',
    internalNotes: 'SECRET_NOTE_456'
  });
  await rentalListingService.transitionLifecycle(rental.id, 'SUBMITTED');
  await rentalListingService.transitionLifecycle(rental.id, 'UNDER_REVIEW');
  await rentalListingService.transitionLifecycle(rental.id, 'APPROVED');
  await rentalListingService.transitionLifecycle(rental.id, 'PUBLISHED');

  // 1. Test Project Discovery
  const projectResults = await propertyDiscoveryService.discoverProjects({ location: 'discovery-location' }, 1, 10);
  if (projectResults.data.length === 0) {
    throw new Error('Project discovery failed to find the project');
  }
  const p = projectResults.data[0];
  if (p.name !== 'Discovery Project' || !p.developer || p.developer.name !== 'Discovery Developer') {
    throw new Error('Project discovery returned malformed data');
  }
  console.log('✔ 1. Project discovery passed');

  // 2. Test Buy Discovery
  const buyResults = await propertyDiscoveryService.discoverBuy({}, 1, 10);
  if (buyResults.data.length < 2) {
    throw new Error(`Buy discovery failed to find all properties. Found: ${buyResults.data.length}`);
  }
  const hasResale = buyResults.data.some(b => b.type === 'RESALE' && b.bedroomCount === 3);
  const hasNewBooking = buyResults.data.some(b => b.type === 'NEW_BOOKING' && b.bedroomCount === 2);
  if (!hasResale || !hasNewBooking) {
    throw new Error('Buy discovery failed to return both New Booking and Resale types');
  }
  console.log('✔ 2. Buy discovery unified results passed');

  // 3. Test Rent Discovery
  const rentResults = await propertyDiscoveryService.discoverRent({ maxPrice: 50000 }, 1, 10);
  if (rentResults.data.length === 0) {
    throw new Error('Rent discovery failed to find the rental property');
  }
  const r = rentResults.data[0];
  if (r.type !== 'RENT' || r.monthlyRent > 50000) {
    throw new Error('Rent discovery returned malformed data');
  }
  console.log('✔ 3. Rent discovery filters passed');

  // 4. Test Search
  const searchResults = await propertyDiscoveryService.search('discovery');
  if (searchResults.length < 3) {
    throw new Error(`Search failed to find developer, project, and location. Found: ${searchResults.length}`);
  }
  const types = searchResults.map(s => s.type);
  if (!types.includes('PROJECT') || !types.includes('DEVELOPER') || !types.includes('LOCATION')) {
    throw new Error('Search failed to correctly categorize results');
  }
  console.log('✔ 4. Search foundation passed');

  // 5. Test Security & Privacy
  const serializedBuy = JSON.stringify(buyResults);
  const serializedRent = JSON.stringify(rentResults);
  const privateStrings = [
    'Private Owner', '+919876543210', 'private@example.com', 'SECRET_NOTE_123',
    'Secret Broker', '+919999988888', 'broker@example.com', 'SECRET_NOTE_456'
  ];

  for (const s of privateStrings) {
    if (serializedBuy.includes(s) || serializedRent.includes(s)) {
      throw new Error(`SECURITY VIOLATION: Private string '${s}' exposed in discovery DTO`);
    }
  }
  console.log('✔ 5. Discovery Security & Privacy tests passed');

  console.log('Discovery Intelligence Tests passed successfully.');
}

runDiscoveryTests().catch(err => {
  console.error('Discovery tests failed:', err);
  process.exit(1);
});
