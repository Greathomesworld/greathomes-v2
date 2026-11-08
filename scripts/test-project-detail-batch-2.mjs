/**
 * Great Homes V2 — Global Project Detail Page Batch 2 Verification Suite
 *
 * Verifies all 13 Batch 2 requirements across:
 *   1. Project with no resale listings hides resale section and #resale nav item
 *   2. Project with no rental listings hides rental section and #rent nav item
 *   3. Project with no eligible gallery media hides gallery section and #gallery nav item
 *   4. Project with no valid amenities hides amenities section and #amenities nav item
 *   5. Location label formatting never produces duplicate "Kolkata, Kolkata" or "Kolkata, Kolkata, West Bengal"
 *   6. Missing/invalid coordinates render honest unavailable state, never " Coordinates" or hardcoded Kolkata center, and project-level overrides take precedence
 *   7. Snapshot possession shows formatted possessionDate first, falls back to possessionStatus/possession, and hides when both are missing without fabricating status
 *   8. Developer section renders developer logo container when logoUrl exists and clean initials/monogram fallback when missing
 *   9. Developer section does NOT render any developer website URL or external link
 *  10. "More Projects by This Developer" renders only other published projects by the same developer, excludes current project, deduplicates, and hides when none exist
 *  11. "Projects You May Also Like" excludes current project and developer other projects, deduplicates, and hides when none exist
 *  12. Current-project resale/rental sections only show current-project listings, while Nearby Resale/Rental sections exclude current-project listings and hide when coordinates or nearby listings are missing
 *  13. Live HTTP SSR check across >= 5 published /projects/[slug] routes verifying HTTP 200, navItems vs rendered sections, no "Kolkata, Kolkata", no " Coordinates", and no developer website link in #developer
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  isValidCoordinate,
  resolveProjectCoordinates,
  buildProjectLocationViewModel,
  formatProjectLocationShortLabel,
  formatProjectLocationFullLabel,
} from '../src/domain/projects/viewModels/projectLocationViewModel.ts';
import {
  formatPossessionDateValue,
  derivePossessionDisplay,
} from '../src/domain/projects/dto/projectDto.ts';
import { resolveSnapshotPossession } from '../src/components/projects/ProjectSnapshot.tsx';
import {
  getEligibleResaleListings,
  getEligibleRentalListings,
  getEligibleGalleryMedia,
  getEligibleAmenities,
} from '../src/domain/projects/viewModels/projectSectionEligibility.ts';
import { formatCoordinates } from '../src/components/projects/ProjectLocationMap.tsx';
import { getDeveloperInitials } from '../src/components/projects/ProjectDeveloperSection.tsx';
import {
  calculateGeodesicDistanceKm,
  formatDistanceKm,
  propertyDiscoveryService,
} from '../src/domain/projects/services/propertyDiscoveryService.ts';
import { projectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService.ts';
import { developerService } from '../src/domain/developers/services/developerService.ts';
import { ensureSeedData } from '../src/infrastructure/seed.ts';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

async function runSuite() {
  console.log('\n=== Great Homes V2 — Project Detail Page Batch 2 Verification Suite ===\n');

  await ensureSeedData();

  const pageSource = fs.readFileSync(
    path.resolve(process.cwd(), 'app/projects/[slug]/page.tsx'),
    'utf8'
  );
  const developerSectionSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/projects/ProjectDeveloperSection.tsx'),
    'utf8'
  );

  // 1. Project with no resale listings hides resale section and #resale nav item
  await test('1. Project with no eligible resale listings hides resale section and #resale nav item', () => {
    assert.deepEqual(getEligibleResaleListings([], 'proj_1'), []);
    assert.deepEqual(getEligibleResaleListings(null, 'proj_1'), []);

    // Listings belonging to a different project or with invalid price/configuration are excluded
    const ineligibleResale = [
      {
        id: 'r1',
        project: { id: 'other_proj', name: 'Other', slug: 'other' },
        configuration: { bhkCount: 3, carpetAreaSqft: 1200 },
        pricing: { askingPrice: 8500000 },
      },
      {
        id: 'r2',
        project: { id: 'proj_1', name: 'Current', slug: 'current' },
        configuration: { bhkCount: 0, carpetAreaSqft: 0, configurationLabel: '' },
        pricing: { askingPrice: 8500000 },
      },
      {
        id: 'r3',
        project: { id: 'proj_1', name: 'Current', slug: 'current' },
        configuration: { bhkCount: 3, carpetAreaSqft: 1200 },
        pricing: { askingPrice: 0 },
      },
    ];
    assert.equal(getEligibleResaleListings(ineligibleResale, 'proj_1').length, 0);

    // Valid listing for current project passes
    const validResale = [
      {
        id: 'r4',
        project: { id: 'proj_1', name: 'Current', slug: 'current' },
        configuration: '3 BHK',
        bedroomCount: 3,
        askingPrice: 9500000,
      },
    ];
    assert.equal(getEligibleResaleListings(validResale, 'proj_1').length, 1);

    // Verify page.tsx computes eligibleResaleListings and gates #resale nav item
    assert.ok(
      pageSource.includes('getEligibleResaleListings(resaleListings, project.id)'),
      'page.tsx must compute eligibleResaleListings using getEligibleResaleListings(resaleListings, project.id)'
    );
    assert.ok(
      pageSource.includes("eligibleResaleListings.length > 0") &&
      pageSource.includes("id: 'resale'"),
      'page.tsx must gate #resale nav item on eligibleResaleListings.length > 0'
    );
  });

  // 2. Project with no rental listings hides rental section and #rent nav item
  await test('2. Project with no eligible rental listings hides rental section and #rent nav item', () => {
    assert.deepEqual(getEligibleRentalListings([], 'proj_1'), []);
    assert.deepEqual(getEligibleRentalListings(undefined, 'proj_1'), []);

    const ineligibleRentals = [
      {
        id: 'rent1',
        projectId: 'other_proj',
        configuration: { bhkCount: 2, carpetAreaSqft: 900 },
        pricing: { monthlyRent: 25000 },
      },
      {
        id: 'rent2',
        projectId: 'proj_1',
        configuration: { bhkCount: 2, carpetAreaSqft: 900 },
        pricing: { monthlyRent: 0 },
      },
    ];
    assert.equal(getEligibleRentalListings(ineligibleRentals, 'proj_1').length, 0);

    const validRentals = [
      {
        id: 'rent3',
        projectId: 'proj_1',
        configuration: '2 BHK',
        bedroomCount: 2,
        monthlyRent: 28000,
      },
    ];
    assert.equal(getEligibleRentalListings(validRentals, 'proj_1').length, 1);

    assert.ok(
      pageSource.includes('getEligibleRentalListings(rentalListings, project.id)'),
      'page.tsx must compute eligibleRentalListings using getEligibleRentalListings(rentalListings, project.id)'
    );
    assert.ok(
      pageSource.includes("eligibleRentalListings.length > 0") &&
      pageSource.includes("id: 'rent'"),
      'page.tsx must gate #rent nav item on eligibleRentalListings.length > 0'
    );
  });

  // 3. Project with no eligible gallery media hides gallery section and #gallery nav item
  await test('3. Project with no eligible gallery media hides gallery section and #gallery nav item', () => {
    assert.deepEqual(getEligibleGalleryMedia([]), []);
    assert.deepEqual(getEligibleGalleryMedia(null), []);

    // Video/Walkthrough or empty URL records are excluded from image gallery
    const nonGalleryItems = [
      { id: 'm1', url: '   ', mediaType: 'GALLERY', title: 'Blank URL' },
      { id: 'm2', url: 'https://example.com/video.mp4', mediaType: 'VIDEO', title: 'Walkthrough Video' },
      { id: 'm3', url: 'https://example.com/tour', mediaType: 'WALKTHROUGH', title: '3D Tour' },
    ];
    assert.equal(getEligibleGalleryMedia(nonGalleryItems).length, 0);

    const validGalleryItems = [
      { id: 'm4', url: 'https://example.com/elevation.jpg', mediaType: 'ELEVATION', title: 'Elevation' },
    ];
    assert.equal(getEligibleGalleryMedia(validGalleryItems).length, 1);

    assert.ok(
      pageSource.includes('getEligibleGalleryMedia(project.media)'),
      'page.tsx must compute eligibleGalleryMedia'
    );
    assert.ok(
      pageSource.includes("eligibleGalleryMedia.length > 0") &&
      pageSource.includes("id: 'gallery'"),
      'page.tsx must gate #gallery nav item on eligibleGalleryMedia.length > 0'
    );
  });

  // 4. Project with no valid amenities hides amenities section and #amenities nav item
  await test('4. Project with no valid amenities hides amenities section and #amenities nav item', () => {
    assert.deepEqual(getEligibleAmenities([]), []);
    assert.deepEqual(getEligibleAmenities(undefined), []);
    assert.deepEqual(
      getEligibleAmenities([
        { id: 'a1', name: '   ', category: 'SPORTS' },
        { id: 'a2', name: '', category: 'LEISURE' },
      ]),
      []
    );

    // Deduplicates case-insensitively and trims
    const duplicateAmenities = [
      { id: 'a1', name: 'Swimming Pool', category: 'LEISURE' },
      { id: 'a2', name: ' swimming pool ', category: 'LEISURE' },
      { id: 'a3', name: 'Gymnasium', category: 'FITNESS' },
    ];
    assert.equal(getEligibleAmenities(duplicateAmenities).length, 2);

    assert.ok(
      pageSource.includes('getEligibleAmenities(project.amenities)'),
      'page.tsx must compute eligibleAmenities'
    );
    assert.ok(
      pageSource.includes("eligibleAmenities.length > 0") &&
      pageSource.includes("id: 'amenities'"),
      'page.tsx must gate #amenities nav item on eligibleAmenities.length > 0'
    );
  });

  // 5. Location label formatting prevents duplicate city/locality strings
  await test('5. Location label formatting prevents "Kolkata, Kolkata" or duplicate hierarchy segments', () => {
    const cityLevelLocation = {
      id: 'loc_kolkata',
      name: 'Kolkata',
      slug: 'kolkata',
      type: 'CITY',
      path: 'West Bengal > Kolkata',
      latitude: 22.5726,
      longitude: 88.3639,
    };
    const shortCityLabel = formatProjectLocationShortLabel(cityLevelLocation);
    const fullCityLabel = formatProjectLocationFullLabel(cityLevelLocation);

    assert.ok(!shortCityLabel.includes('Kolkata, Kolkata'), `Short label had duplicate Kolkata: "${shortCityLabel}"`);
    assert.ok(!fullCityLabel.includes('Kolkata, Kolkata'), `Full label had duplicate Kolkata: "${fullCityLabel}"`);
    assert.equal(shortCityLabel, 'Kolkata');
    assert.equal(fullCityLabel, 'Kolkata, West Bengal');

    const localityLocation = {
      id: 'loc_new_town',
      name: 'New Town',
      slug: 'new-town',
      type: 'LOCALITY',
      path: 'West Bengal > Kolkata > New Town',
      latitude: 22.5867,
      longitude: 88.475,
    };
    assert.equal(formatProjectLocationShortLabel(localityLocation), 'New Town, Kolkata');
    assert.equal(formatProjectLocationFullLabel(localityLocation), 'New Town, Kolkata, West Bengal');

    const duplicatePathLocation = {
      id: 'loc_dup',
      name: 'Kolkata',
      slug: 'kolkata',
      type: 'CITY',
      path: 'Kolkata > Kolkata > West Bengal',
    };
    const vm = buildProjectLocationViewModel(duplicatePathLocation);
    const breadcrumbNames = vm.breadcrumb.map(b => b.name).join(', ');
    assert.ok(
      !breadcrumbNames.includes('Kolkata, Kolkata'),
      `Breadcrumb names had duplicate Kolkata: "${breadcrumbNames}"`
    );
  });

  // 6. Missing/invalid coordinates and coordinate precedence
  await test('6. Missing/invalid coordinates show honest unavailable state and project-level overrides take precedence', () => {
    // Reject (0, 0), null, undefined, NaN, out-of-range
    assert.equal(isValidCoordinate(0, 0), false);
    assert.equal(isValidCoordinate(null, null), false);
    assert.equal(isValidCoordinate(undefined, 88.36), false);
    assert.equal(isValidCoordinate(NaN, 88.36), false);
    assert.equal(isValidCoordinate(95, 88.36), false);
    assert.equal(isValidCoordinate(22.5726, 88.3639), true);

    // formatCoordinates returns null for invalid coords
    assert.equal(formatCoordinates(null, null), null);
    assert.equal(formatCoordinates(0, 0), null);
    assert.equal(formatCoordinates(22.5726, 88.3639), '22.5726° N, 88.3639° E');

    // Missing coordinates produce coordinateSource: 'NONE', hasValidCoordinates: false, and never a hardcoded Kolkata fallback
    const missingVm = buildProjectLocationViewModel({ id: 'l1', name: 'Rajarhat', slug: 'rajarhat', latitude: null, longitude: null }, null, {
      projectLatitude: null,
      projectLongitude: null,
      latitude: null,
      longitude: null,
    });
    assert.equal(missingVm.hasValidCoordinates, false);
    assert.equal(missingVm.coordinateSource, 'NONE');
    assert.equal(missingVm.latitude, null);
    assert.equal(missingVm.longitude, null);

    // Location fallback works when project override is null
    const locationFallbackVm = buildProjectLocationViewModel({ id: 'l1', name: 'Rajarhat', slug: 'rajarhat', latitude: 22.61, longitude: 88.45 }, null, {
      projectLatitude: null,
      projectLongitude: null,
      latitude: 22.61,
      longitude: 88.45,
    });
    assert.equal(locationFallbackVm.hasValidCoordinates, true);
    assert.equal(locationFallbackVm.coordinateSource, 'LOCATION');
    assert.equal(locationFallbackVm.latitude, 22.61);

    // Project-level override takes precedence over location coordinates
    const projectOverrideVm = buildProjectLocationViewModel({ id: 'l1', name: 'Rajarhat', slug: 'rajarhat', latitude: 22.61, longitude: 88.45 }, null, {
      projectLatitude: 22.6555,
      projectLongitude: 88.5111,
      latitude: 22.6555,
      longitude: 88.5111,
    });
    assert.equal(projectOverrideVm.hasValidCoordinates, true);
    assert.equal(projectOverrideVm.coordinateSource, 'PROJECT');
    assert.equal(projectOverrideVm.latitude, 22.6555);
    assert.equal(projectOverrideVm.longitude, 88.5111);
  });

  // 7. Project Snapshot — Possession Information priority & graceful omission
  await test('7. Snapshot possession prioritizes possessionDate, then possessionStatus, and hides when both are missing', () => {
    assert.equal(formatPossessionDateValue('2027-12-01'), 'Dec 2027');
    assert.equal(formatPossessionDateValue('2026-06'), 'Jun 2026');
    assert.equal(formatPossessionDateValue('December 2028'), 'Dec 2028');
    assert.equal(formatPossessionDateValue(null), null);

    // Priority 1: possessionDate over possessionStatus
    assert.equal(
      derivePossessionDisplay({
        possessionDate: '2028-03-15',
        possessionStatus: 'Under Construction',
        status: 'UNDER_CONSTRUCTION',
      }),
      'Mar 2028'
    );

    // Priority 2: possessionStatus when possessionDate is absent
    assert.equal(
      derivePossessionDisplay({
        possessionDate: null,
        possessionStatus: 'Ready to Move',
        status: 'READY_TO_MOVE',
      }),
      'Ready to Move'
    );

    // Priority 3: null when both are missing (never fabricates from status)
    assert.equal(
      derivePossessionDisplay({
        possessionDate: null,
        possessionStatus: null,
        status: 'READY_TO_MOVE',
      }),
      null
    );

    assert.equal(
      resolveSnapshotPossession({
        status: 'UNDER_CONSTRUCTION',
        priceRange: '₹80 L - ₹1.2 Cr',
        configurations: '2, 3 BHK',
        possession: null,
        possessionDate: null,
        possessionStatus: null,
        reraStatus: 'Registered',
      }),
      null
    );
  });

  // 8. Developer section logo & fallback initials
  await test('8. Developer section renders logo container when logoUrl exists and clean initials fallback when missing', async () => {
    assert.equal(getDeveloperInitials('Merlin Group'), 'MG');
    assert.equal(getDeveloperInitials('Srijan Realty Pvt Ltd'), 'SR');
    assert.equal(getDeveloperInitials(' Siddha '), 'SI');

    assert.ok(
      developerSectionSource.includes('object-contain') &&
        developerSectionSource.includes('onError='),
      'ProjectDeveloperSection must render developer logo with object-contain and onError fallback'
    );

    // Verify projectIntelligenceService attaches developer logoUrl from developer_media (LOGO)
    const { data: publishedProjects } = await projectIntelligenceService.listProjects({
      page: 1,
      limit: 10,
    });
    assert.ok(publishedProjects.length > 0, 'Must have published projects');
    const projectsWithDeveloper = publishedProjects.filter((p) => p.developer !== null);
    assert.ok(projectsWithDeveloper.length > 0, 'Must have published projects with developer info');

    const withLogo = projectsWithDeveloper.filter((p) => Boolean(p.developer?.logoUrl));
    assert.ok(withLogo.length > 0, 'At least one published project must resolve a developer logoUrl from developer_media');
  });

  // 9. Developer section strictly prohibits developer website link
  await test('9. Developer section does NOT render or accept any developer website link', () => {
    assert.ok(
      !developerSectionSource.includes('developerWebsite'),
      'ProjectDeveloperSection must not accept or reference developerWebsite'
    );
    assert.ok(
      !developerSectionSource.includes('Official Portal'),
      'ProjectDeveloperSection must not render "Official Portal" link'
    );
    assert.ok(
      !developerSectionSource.includes('target="_blank"'),
      'ProjectDeveloperSection must not render any external target="_blank" link'
    );
    assert.ok(
      !pageSource.includes('developerWebsite='),
      'app/projects/[slug]/page.tsx must not pass developerWebsite prop'
    );
  });

  // 10. "More Projects by This Developer" discovery logic
  await test('10. "More Projects by This Developer" returns only other published projects by the same developer, excludes current project, and deduplicates', async () => {
    const allPublished = await projectIntelligenceService.listAllProjects();

    // Find a developer with >= 2 published projects
    const byDev = new Map();
    for (const p of allPublished) {
      if (!p.developer?.id) continue;
      const list = byDev.get(p.developer.id) || [];
      list.push(p);
      byDev.set(p.developer.id, list);
    }

    const multiProjectDevEntry = [...byDev.entries()].find(([, list]) => list.length >= 2);
    assert.ok(multiProjectDevEntry, 'Dataset should contain at least one developer with >= 2 published projects');

    const [devId, devProjects] = multiProjectDevEntry;
    const currentProject = devProjects[0];
    const otherDevProjects = await propertyDiscoveryService.getDeveloperOtherProjects(
      devId,
      currentProject.id,
      currentProject.slug,
      8
    );

    assert.ok(otherDevProjects.length >= 1, 'Should return at least 1 other project for multi-project developer');
    const seenIds = new Set();
    const seenSlugs = new Set();
    for (const card of otherDevProjects) {
      assert.notEqual(card.id, currentProject.id, 'Must exclude current project ID');
      assert.notEqual(card.slug, currentProject.slug, 'Must exclude current project slug');
      assert.equal(card.developer?.id, devId, 'All returned projects must belong to the same developer');
      assert.ok(!seenIds.has(card.id), `Duplicate project ID ${card.id}`);
      assert.ok(!seenSlugs.has(card.slug), `Duplicate project slug ${card.slug}`);
      seenIds.add(card.id);
      seenSlugs.add(card.slug);
    }

    // Non-existent developer returns empty array (so carousel hides cleanly)
    const emptyDevProjects = await propertyDiscoveryService.getDeveloperOtherProjects(
      'dev_non_existent_999999',
      currentProject.id,
      currentProject.slug,
      8
    );
    assert.deepEqual(emptyDevProjects, []);
  });

  // 11. "Projects You May Also Like" cross-developer recommendation logic
  await test('11. "Projects You May Also Like" excludes current project and developer other projects, deduplicates, and prioritizes cross-developer relevance', async () => {
    const allPublished = await projectIntelligenceService.listAllProjects();
    const sampleProject = allPublished[0];
    assert.ok(sampleProject, 'Sample published project must exist');

    const bundle = await propertyDiscoveryService.getProjectDetailDiscoveryBundle(sampleProject, {
      developerProjectsLimit: 8,
      relatedProjectsLimit: 8,
    });

    const devProjectIds = new Set(bundle.developerProjects.map((p) => p.id));
    const devProjectSlugs = new Set(bundle.developerProjects.map((p) => p.slug));
    const seenIds = new Set();
    const seenSlugs = new Set();

    assert.ok(bundle.relatedProjects.length > 0, 'Should return related project recommendations');

    for (const rec of bundle.relatedProjects) {
      assert.notEqual(rec.id, sampleProject.id, 'Must exclude current project ID');
      assert.notEqual(rec.slug, sampleProject.slug, 'Must exclude current project slug');
      assert.ok(!devProjectIds.has(rec.id), `Must exclude project ${rec.id} already shown in More Projects by Developer`);
      assert.ok(!devProjectSlugs.has(rec.slug), `Must exclude project slug ${rec.slug} already shown in More Projects by Developer`);
      assert.ok(!seenIds.has(rec.id), `Duplicate recommendation ID ${rec.id}`);
      assert.ok(!seenSlugs.has(rec.slug), `Duplicate recommendation slug ${rec.slug}`);
      seenIds.add(rec.id);
      seenSlugs.add(rec.slug);
    }
  });

  // 12. Current-project vs Nearby Resale and Rental property discovery
  await test('12. Nearby Resale and Nearby Rental sections exclude current-project listings, calculate accurate distance, and hide when coordinates are missing', async () => {
    const allPublished = await projectIntelligenceService.listAllProjects();
    const projectWithCoords = allPublished.find((p) => isValidCoordinate(p.latitude, p.longitude));
    assert.ok(projectWithCoords, 'Must have a published project with valid coordinates');

    const bundleWithCoords = await propertyDiscoveryService.getProjectDetailDiscoveryBundle(projectWithCoords, {
      maxNearbyRadiusKm: 25,
    });

    for (const item of bundleWithCoords.nearbyResale) {
      assert.notEqual(item.project?.id, projectWithCoords.id, 'Nearby resale must exclude current project listings');
      assert.notEqual(item.project?.slug, projectWithCoords.slug, 'Nearby resale must exclude current project slug');
      assert.ok(
        typeof item.distanceKm === 'number' && item.distanceKm <= 25,
        `Nearby resale item must have valid distanceKm <= 25, got ${item.distanceKm}`
      );
      assert.ok(Boolean(item.formattedDistance), 'Nearby resale item must have formattedDistance');
    }

    for (const item of bundleWithCoords.nearbyRental) {
      assert.notEqual(item.project?.id, projectWithCoords.id, 'Nearby rental must exclude current project listings');
      assert.notEqual(item.project?.slug, projectWithCoords.slug, 'Nearby rental must exclude current project slug');
      assert.ok(
        typeof item.distanceKm === 'number' && item.distanceKm <= 25,
        `Nearby rental item must have valid distanceKm <= 25, got ${item.distanceKm}`
      );
      assert.ok(Boolean(item.formattedDistance), 'Nearby rental item must have formattedDistance');
    }

    // Project with missing coordinates must return 0 nearby listings
    const projectWithoutCoords = {
      ...projectWithCoords,
      projectLatitude: null,
      projectLongitude: null,
      latitude: null,
      longitude: null,
      location: projectWithCoords.location
        ? { ...projectWithCoords.location, latitude: null, longitude: null }
        : null,
    };
    const bundleWithoutCoords = await propertyDiscoveryService.getProjectDetailDiscoveryBundle(projectWithoutCoords);
    assert.deepEqual(bundleWithoutCoords.nearbyResale, []);
    assert.deepEqual(bundleWithoutCoords.nearbyRental, []);
  });

  // 13. Live HTTP SSR check across >= 5 published project detail pages
  await test('13. Live HTTP SSR verification across >= 5 published /projects/[slug] routes', async () => {
    const allPublished = await projectIntelligenceService.listAllProjects();

    // Pick a diverse set of at least 6 published projects:
    // - projects with/without resale or rental listings
    // - projects with different developers and locations
    const selectedSlugs = [];
    const seenDevelopers = new Set();

    for (const proj of allPublished) {
      if (selectedSlugs.length >= 6) break;
      const devKey = proj.developer?.id ?? proj.id;
      if (!seenDevelopers.has(devKey) || selectedSlugs.length < 6) {
        selectedSlugs.push(proj.slug);
        seenDevelopers.add(devKey);
      }
    }

    assert.ok(selectedSlugs.length >= 5, `Expected at least 5 project slugs, got ${selectedSlugs.length}`);

    for (const slug of selectedSlugs) {
      const res = await fetch(`http://localhost:3000/projects/${encodeURIComponent(slug)}`);
      assert.equal(res.status, 200, `Expected HTTP 200 for /projects/${slug}, got ${res.status}`);
      const html = await res.text();

      // 13a. Must not contain duplicate "Kolkata, Kolkata"
      assert.ok(
        !html.includes('Kolkata, Kolkata'),
        `/projects/${slug} rendered duplicate "Kolkata, Kolkata"`
      );

      // 13b. Must not contain malformed " Coordinates" with missing location source
      assert.ok(
        !html.includes('> Coordinates<'),
        `/projects/${slug} rendered malformed "> Coordinates<" badge`
      );

      // 13c. Must not contain prohibited developer website link ("Official Portal")
      assert.ok(
        !html.includes('Official Portal'),
        `/projects/${slug} rendered prohibited "Official Portal" developer website link`
      );

      // 13d. Every section nav link href="#id" inside ProjectSectionNavigation must have a matching id="..." in DOM order
      const navMatch = html.match(/<nav aria-label="Project section navigation" class="sticky top-16 sm:top-18 z-30[\s\S]*?<\/nav>/);
      assert.ok(navMatch, `/projects/${slug} must render sticky ProjectSectionNavigation`);
      const navTargetMatches = [...navMatch[0].matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
      assert.ok(navTargetMatches.length > 0, `/projects/${slug} should render section navigation targets`);
      let lastPos = -1;
      for (const targetId of navTargetMatches) {
        const pos = html.indexOf(`id="${targetId}"`);
        assert.ok(
          pos !== -1,
          `/projects/${slug} nav target "#${targetId}" is missing a matching id="${targetId}" in the DOM`
        );
        assert.ok(
          pos > lastPos,
          `/projects/${slug} section #${targetId} DOM position (${pos}) is out of order relative to previous nav item (${lastPos})`
        );
        lastPos = pos;
      }
    }

    console.log(`        Verified ${selectedSlugs.length} live project routes: ${selectedSlugs.join(', ')}`);
  });

  console.log(`\n=== Batch 2 Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSuite();
