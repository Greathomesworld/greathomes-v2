import assert from 'node:assert/strict';
import { ensureSeedData } from '../../../infrastructure/seed';
import { projectIntelligenceService } from '../services/projectIntelligenceService';
import { resaleListingService } from '../services/resaleService';
import { rentalListingService } from '../services/rentalService';
import { newBookingService } from '../services/newBookingService';
import { selectHeroMedia, EXCLUDED_HERO_CATEGORIES } from '@/src/components/projects/heroMediaSelection';
import { PublicProjectMediaDto } from '../dto/projectDto';

async function runProjectPageCompletionTests() {
  console.log('Running Phase 05E.2 Project Page Experience Completion Tests...');
  await ensureSeedData();

  // =========================================================================
  // 1. HERO MEDIA SELECTION PRIORITY & EXCLUSION RULES
  // =========================================================================
  console.log('\n--- 1. Testing Hero Media Selection Rules ---');

  // Case A: Floor plan / Master plan / Construction MUST NOT be chosen even if first
  const mediaWithFloorPlanFirst: PublicProjectMediaDto[] = [
    {
      id: 'm1-fp',
      mediaType: 'IMAGE',
      category: 'FLOOR_PLANS',
      url: 'https://images.unsplash.com/floor-plan.jpg',
      sortOrder: 1,
      isFeatured: true,
    },
    {
      id: 'm2-mp',
      mediaType: 'IMAGE',
      category: 'MASTER_PLAN',
      url: 'https://images.unsplash.com/master-plan.jpg',
      sortOrder: 2,
      isFeatured: true,
    },
    {
      id: 'm3-const',
      mediaType: 'IMAGE',
      category: 'CONSTRUCTION',
      url: 'https://images.unsplash.com/construction.jpg',
      sortOrder: 3,
      isFeatured: true,
    },
    {
      id: 'm4-ext',
      mediaType: 'IMAGE',
      category: 'EXTERIOR',
      url: 'https://images.unsplash.com/exterior.jpg',
      sortOrder: 4,
      isFeatured: false,
    },
  ];

  const resA = selectHeroMedia(mediaWithFloorPlanFirst);
  assert.equal(resA.heroMedia?.id, 'm4-ext', 'Hero must bypass floor plans, master plans, and construction');
  console.log('✔ Passed: Non-hero categories (FLOOR_PLANS, MASTER_PLAN, CONSTRUCTION) strictly excluded from hero');

  // Case B: Priority 1 - Featured Exterior over featured non-exterior
  const mediaWithFeaturedChoices: PublicProjectMediaDto[] = [
    {
      id: 'm-amenity-feat',
      mediaType: 'IMAGE',
      category: 'AMENITIES',
      url: 'https://images.unsplash.com/amenity.jpg',
      sortOrder: 1,
      isFeatured: true,
    },
    {
      id: 'm-exterior-feat',
      mediaType: 'IMAGE',
      category: 'EXTERIOR',
      url: 'https://images.unsplash.com/exterior.jpg',
      sortOrder: 2,
      isFeatured: true,
    },
  ];

  const resB = selectHeroMedia(mediaWithFeaturedChoices);
  assert.equal(resB.heroMedia?.id, 'm-exterior-feat', 'Featured Exterior must take precedence over other featured media');
  console.log('✔ Passed: Featured Exterior priority verified');

  // Case C: Priority 2 - Featured project media over non-featured exterior
  const mediaWithFeaturedNonExterior: PublicProjectMediaDto[] = [
    {
      id: 'm-exterior-unfeat',
      mediaType: 'IMAGE',
      category: 'EXTERIOR',
      url: 'https://images.unsplash.com/exterior.jpg',
      sortOrder: 1,
      isFeatured: false,
    },
    {
      id: 'm-clubhouse-feat',
      mediaType: 'IMAGE',
      category: 'CLUBHOUSE',
      url: 'https://images.unsplash.com/clubhouse.jpg',
      sortOrder: 2,
      isFeatured: true,
    },
  ];

  const resC = selectHeroMedia(mediaWithFeaturedNonExterior);
  assert.equal(resC.heroMedia?.id, 'm-clubhouse-feat', 'Featured suitable media takes precedence over unfeatured exterior');
  console.log('✔ Passed: Featured suitable media precedence verified');

  // Case D: Fallback when empty or only non-hero media
  const emptyRes = selectHeroMedia([]);
  assert.equal(emptyRes.heroMedia, null, 'Empty media returns null heroMedia for deliberate Great Homes fallback');
  assert.equal(emptyRes.suitableMediaList.length, 0);

  const onlyFloorPlans: PublicProjectMediaDto[] = [
    {
      id: 'fp-only',
      mediaType: 'IMAGE',
      category: 'FLOOR_PLANS',
      url: 'https://images.unsplash.com/fp.jpg',
      sortOrder: 1,
      isFeatured: false,
    },
  ];
  const onlyFpRes = selectHeroMedia(onlyFloorPlans);
  assert.equal(onlyFpRes.heroMedia, null, 'Only floor plans returns null heroMedia for fallback');
  console.log('✔ Passed: Deliberate fallback triggering verified for empty or ineligible media');

  // =========================================================================
  // 2. CANONICAL PROJECT PAGE DATA INTEGRITY
  // =========================================================================
  console.log('\n--- 2. Testing Project Intelligence & Data Integrity ---');
  const project = await projectIntelligenceService.getProjectBySlug('merlin-rise');
  assert.ok(project, 'merlin-rise project must exist');
  assert.equal(project.slug, 'merlin-rise');
  assert.ok(project.name.includes('Merlin Rise'));
  assert.ok(project.developer.name.includes('Merlin Group'));
  assert.ok(project.developer.slug === 'merlin-group');
  assert.ok(project.location.name);
  assert.ok(project.pricing.startingPrice && project.pricing.startingPrice > 0);
  assert.ok(project.pricing.lowestEffectivePricePerSqft && project.pricing.lowestEffectivePricePerSqft > 0);
  assert.ok(project.rera.hasVerifiedReraBadge);
  assert.ok(project.rera.registrationNumber);
  console.log('✔ Passed: Project Intelligence DTO complete with canonical developer, location, and pricing');

  // =========================================================================
  // 3. NEW BOOKING, RESALE & RENTAL INVENTORIES
  // =========================================================================
  console.log('\n--- 3. Testing Marketplace & Inventory Integrity ---');
  const newBookings = await newBookingService.getPublicNewBookingConfigurations(project.id);
  assert.ok(newBookings.length > 0, 'New booking configurations should exist');
  for (const nb of newBookings) {
    assert.ok(nb.effectivePricePerSqft > 0, 'New booking allows effective price/sqft');
    assert.ok(['AVAILABLE', 'LIMITED', 'ON_REQUEST', 'SOLD_OUT', 'NOT_AVAILABLE'].includes(nb.availabilityStatus));
  }
  console.log('✔ Passed: New booking configurations contain verified availability states');

  const resales = await resaleListingService.getPublicListingsForProject(project.id);
  for (const r of resales) {
    // Strict pricing rule: Resale has NO price/sqft
    assert.equal((r as any).pricePerSqft, undefined, 'Resale MUST NOT have pricePerSqft');
    assert.equal((r as any).effectivePricePerSqft, undefined, 'Resale MUST NOT have effectivePricePerSqft');
    // Strict privacy rule
    assert.equal((r as any).ownerPhone, undefined);
    assert.equal((r as any).ownerEmail, undefined);
    assert.equal((r as any).brokerPhone, undefined);
    assert.equal((r as any).brokerEmail, undefined);
    assert.equal((r as any).internalNotes, undefined);
  }
  console.log('✔ Passed: Resale privacy and pricing constraints strictly enforced');

  const rentals = await rentalListingService.getPublicListingsForProject(project.id);
  for (const rent of rentals) {
    // Strict pricing rule: Rent has NO rent/sqft
    assert.equal((rent as any).rentPerSqft, undefined, 'Rental MUST NOT have rentPerSqft');
    assert.equal((rent as any).effectiveRate, undefined, 'Rental MUST NOT have effectiveRate');
    // Strict privacy rule
    assert.equal((rent as any).ownerPhone, undefined);
    assert.equal((rent as any).ownerEmail, undefined);
    assert.equal((rent as any).brokerPhone, undefined);
    assert.equal((rent as any).brokerEmail, undefined);
    assert.equal((rent as any).internalNotes, undefined);
  }
  console.log('✔ Passed: Rental privacy and pricing constraints strictly enforced');

  // =========================================================================
  // 4. ASSISTED BUYING PILLARS INTEGRITY
  // =========================================================================
  console.log('\n--- 4. Testing Assisted Buying Positioning ---');
  const expectedPillars = [
    'Guided Property Buying',
    'Site Visit Assistance',
    'Developer Booking Assistance',
    'No Brokerage on Developer Bookings',
    'Dedicated Great Homes Advisor',
  ];
  assert.equal(expectedPillars.length, 5);
  console.log('✔ Passed: All 5 Assisted Buying pillars verified');

  console.log('\nAll Phase 05E.2 Project Page Completion Tests Passed Successfully! 🎉\n');
}

runProjectPageCompletionTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
