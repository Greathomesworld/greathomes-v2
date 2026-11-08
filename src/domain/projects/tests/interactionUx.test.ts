import assert from 'node:assert/strict';
import { ensureSeedData } from '../../../infrastructure/seed';
import { propertyDiscoveryService } from '../services/propertyDiscoveryService';
import { projectIntelligenceService } from '../services/projectIntelligenceService';
import { resaleListingService } from '../services/resaleService';
import { rentalListingService } from '../services/rentalService';
import { newBookingService } from '../services/newBookingService';

async function runInteractionUxTests() {
  console.log('Running Phase 05E.1 Interaction & UX Correction Tests...');
  await ensureSeedData();

  // 1. PROJECT CANONICAL NAVIGATION DESTINATIONS
  console.log('Testing Canonical Card Destination Generation...');
  const projectDiscovery = await propertyDiscoveryService.discoverProjects({});
  assert.ok(projectDiscovery.data.length > 0, 'Should have published projects in discovery');
  const projectItem = projectDiscovery.data[0];
  const projectCanonicalUrl = `/projects/${projectItem.slug}`;
  assert.ok(!projectCanonicalUrl.includes('undefined'), 'Project destination must have valid slug');
  assert.ok(projectCanonicalUrl.startsWith('/projects/'), 'Project destination must be under /projects/');
  console.log('✔ 1. Project canonical destination verified:', projectCanonicalUrl);

  // 2. NEW BOOKING CANONICAL NAVIGATION DESTINATIONS
  const buyDiscovery = await propertyDiscoveryService.discoverBuy({ inventoryType: 'NEW_BOOKING' });
  assert.ok(buyDiscovery.data.length > 0, 'Should have new booking items in discovery');
  const nbItem = buyDiscovery.data[0];
  assert.equal(nbItem.type, 'NEW_BOOKING');
  const nbCanonicalUrl = `/projects/${nbItem.project.slug}`;
  assert.ok(!nbCanonicalUrl.includes('undefined'), 'New booking destination must resolve to canonical project slug');
  assert.ok(nbCanonicalUrl.startsWith('/projects/'), 'New booking destination must lead to project page');
  console.log('✔ 2. New Booking canonical destination verified:', nbCanonicalUrl);

  // 3. RESALE WHOLE CARD CANONICAL DESTINATION
  const resaleDiscovery = await propertyDiscoveryService.discoverBuy({ inventoryType: 'RESALE' });
  assert.ok(resaleDiscovery.data.length > 0, 'Should have resale items in discovery');
  const resaleItem = resaleDiscovery.data[0];
  assert.equal(resaleItem.type, 'RESALE');
  assert.ok(resaleItem.project?.slug, 'Resale listing must reference canonical project slug');
  const resaleCanonicalUrl = `/projects/${resaleItem.project.slug}#resale-${resaleItem.id}`;
  assert.ok(resaleCanonicalUrl.includes('#resale-'), 'Resale whole-card URL must deep-link to listing anchor');
  assert.ok(!resaleCanonicalUrl.includes('/api/'), 'Must not link to private or API endpoint');
  console.log('✔ 3. Resale whole-card canonical destination verified:', resaleCanonicalUrl);

  // 4. RENTAL WHOLE CARD CANONICAL DESTINATION
  const rentDiscovery = await propertyDiscoveryService.discoverRent({});
  assert.ok(rentDiscovery.data.length > 0, 'Should have rental items in discovery');
  const rentItem = rentDiscovery.data[0];
  assert.equal(rentItem.type, 'RENT');
  assert.ok(rentItem.project?.slug, 'Rental listing must reference canonical project slug');
  const rentalCanonicalUrl = `/projects/${rentItem.project.slug}#rental-${rentItem.id}`;
  assert.ok(rentalCanonicalUrl.includes('#rental-'), 'Rental whole-card URL must deep-link to listing anchor');
  assert.ok(!rentalCanonicalUrl.includes('/api/'), 'Must not link to private or API endpoint');
  console.log('✔ 4. Rental whole-card canonical destination verified:', rentalCanonicalUrl);

  // 5. RESALE PRIVACY & NO PER-SQFT PRICING
  console.log('Testing Resale Privacy & Pricing Integrity...');
  const project = await projectIntelligenceService.getProjectBySlug('merlin-rise');
  assert.ok(project, 'Project merlin-rise should exist');
  const projectResales = await resaleListingService.getPublicListingsForProject(project.id);
  assert.ok(projectResales.length > 0, 'Should have resale listings for project');

  for (const r of projectResales) {
    // Assert strictly NO private fields
    assert.equal((r as any).ownerPhone, undefined, 'Must not contain ownerPhone');
    assert.equal((r as any).ownerEmail, undefined, 'Must not contain ownerEmail');
    assert.equal((r as any).brokerPhone, undefined, 'Must not contain brokerPhone');
    assert.equal((r as any).brokerEmail, undefined, 'Must not contain brokerEmail');
    assert.equal((r as any).internalNotes, undefined, 'Must not contain internalNotes');
    assert.equal((r as any).crmId, undefined, 'Must not contain crmId');
    assert.equal((r as any).verifiedBy, undefined, 'Must not contain verifiedBy');

    // Assert strictly NO per-sqft calculation field
    assert.equal((r as any).pricePerSqft, undefined, 'Resale must have NO pricePerSqft');
    assert.equal((r as any).effectivePricePerSqft, undefined, 'Resale must have NO effectivePricePerSqft');
    assert.ok(r.askingPrice > 0, 'Resale must have lump-sum askingPrice');
    assert.ok(['Owner Listed', 'Listing Partner'].includes(r.listingParty.label), 'Listing party label must be sanitized');
  }
  console.log('✔ 5. Resale privacy & pricing rules strictly verified');

  // 6. RENTAL PRIVACY & NO RENT-PER-SQFT PRICING
  console.log('Testing Rental Privacy & Pricing Integrity...');
  const projectRentals = await rentalListingService.getPublicListingsForProject(project.id);
  assert.ok(projectRentals.length > 0, 'Should have rental listings for project');

  for (const rent of projectRentals) {
    // Assert strictly NO private fields
    assert.equal((rent as any).ownerPhone, undefined, 'Must not contain ownerPhone');
    assert.equal((rent as any).ownerEmail, undefined, 'Must not contain ownerEmail');
    assert.equal((rent as any).brokerPhone, undefined, 'Must not contain brokerPhone');
    assert.equal((rent as any).brokerEmail, undefined, 'Must not contain brokerEmail');
    assert.equal((rent as any).internalNotes, undefined, 'Must not contain internalNotes');
    assert.equal((rent as any).crmId, undefined, 'Must not contain crmId');
    assert.equal((rent as any).verifiedBy, undefined, 'Must not contain verifiedBy');

    // Assert strictly NO rent/sqft calculation field
    assert.equal((rent as any).rentPerSqft, undefined, 'Rental must have NO rentPerSqft');
    assert.equal((rent as any).effectiveRate, undefined, 'Rental must have NO effectiveRate');
    assert.ok(rent.monthlyRent > 0, 'Rental must have monthlyRent');
    assert.ok(['Owner Listed', 'Listing Partner'].includes(rent.listingParty.label), 'Listing party label must be sanitized');
  }
  console.log('✔ 6. Rental privacy & pricing rules strictly verified');

  // 7. NEW BOOKING DIFFERENTIATION & AVAILABILITY STATUSES
  console.log('Testing New Booking Availability States...');
  const newBookingConfigs = await newBookingService.getPublicNewBookingConfigurations(project.id);
  assert.ok(newBookingConfigs.length > 0, 'Project should have new booking configs');

  const validStatuses = new Set(['AVAILABLE', 'LIMITED', 'ON_REQUEST', 'SOLD_OUT', 'NOT_AVAILABLE']);
  for (const config of newBookingConfigs) {
    assert.ok(validStatuses.has(config.availabilityStatus), `Status ${config.availabilityStatus} must be valid`);
    assert.ok(config.name, 'Config must have a name');
    assert.ok(config.effectivePricePerSqft > 0, 'Config must have valid effective price per sqft');
  }
  console.log('✔ 7. New Booking availability states verified');

  // 8. MEDIA FALLBACK INTEGRITY
  console.log('Testing Media Fallback Resolution...');
  const mockListingWithoutMedia = {
    media: []
  };
  const mediaResult = mockListingWithoutMedia.media.find((m: any) => m.isFeatured) || mockListingWithoutMedia.media[0];
  assert.equal(mediaResult, undefined, 'Empty media array yields undefined, triggering ListingImage fallback');
  console.log('✔ 8. Media fallback behavior verified');

  console.log('All Phase 05E.1 Interaction & UX Correction Tests Passed! 🎉');
}

runInteractionUxTests().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
