/**
 * Great Homes V2 — Project Detail Page Batch 3 Verification Suite
 *
 * Verifies all 10 Batch 3 requirements and regression guards:
 *   1. SaveButton with resourceType="PROJECT" is preserved on /projects/[slug]
 *   2. AddToCompareButton with mode="PROJECTS" is integrated beside SaveButton on /projects/[slug]
 *   3. requestSiteVisit intent is explicitly passed across all project detail enquiry callers
 *      while preserving configuration, floor-plan, and area-basis context fields
 *   4. Verified configuration availability overrides are merged and badges render ONLY for valid
 *      canonical statuses (never inferred from price or floor-plan presence)
 *   5. Featured amenities are not duplicated in the secondary amenities grid, and empty-amenities
 *      guard is preserved
 *   6. Redundant middle breadcrumb is removed from ProjectLocationSection while preserving top
 *      breadcrumbs, map, nearby places, Administrative Hierarchy cards, and missing-coord fallback
 *   7. ProjectLocationMap useEffect dependencies use stable primitive values
 *   8. RecentlyViewedTracker useEffect dependencies use stable primitive values (no duplicate timers
 *      when telemetry state or inline metadata references change)
 *   9. Footer Guides link uses Next.js Link to /guides and provides mobile bottom clearance for both
 *      MobileBottomNav and MobileStickyCta
 *  10. Unused HeroAdvisoryCard.tsx is deleted while MobileStickyCTA.tsx wrapper is preserved, and
 *      live HTTP SSR routes render cleanly
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  getConfigurationAvailabilityBadge,
  mapDtoToConfigurationViewModel,
  mergeConfigurationAvailabilityOverrides,
} from '../src/components/projects/typologies/typologyModel.ts';
import {
  MAX_COMPARE_ITEMS,
  getAddToCompareButtonLabel,
  computeNextCompareIds,
} from '../src/components/comparison/AddToCompareButton.tsx';
import { buildComparisonTrayModel } from '../src/components/comparison/ComparisonTray.tsx';
import { ProjectConfigurationCard } from '../src/components/projects/typologies/ProjectConfigurationCard.tsx';
import { ProjectAmenities } from '../src/components/projects/ProjectAmenities.tsx';
import { ProjectLocationSection } from '../src/components/projects/ProjectLocationSection.tsx';
import { EnquiryProvider } from '../src/components/enquiry/EnquiryContext.tsx';
import { projectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService.ts';
import { newBookingService } from '../src/domain/projects/services/newBookingService.ts';
import { ensureSeedData } from '../src/infrastructure/seed.ts';

globalThis.React = React;

const rootDir = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

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
  console.log('\n=== Great Homes V2 — Project Detail Page Batch 3 Verification Suite ===\n');

  await ensureSeedData();

  const pageSource = read('app/projects/[slug]/page.tsx');
  const advisoryCardSource = read('src/components/projects/GreatHomesAdvisoryCard.tsx');
  const finalCtaSource = read('src/components/projects/ProjectFinalCta.tsx');
  const configCardSource = read('src/components/projects/typologies/ProjectConfigurationCard.tsx');
  const floorPlanViewerSource = read('src/components/projects/ProjectFloorPlanViewer.tsx');
  const mobileStickyCtaSource = read('src/components/projects/MobileStickyCta.tsx');
  const amenitiesSource = read('src/components/projects/ProjectAmenities.tsx');
  const locationSectionSource = read('src/components/projects/ProjectLocationSection.tsx');
  const locationMapSource = read('src/components/projects/ProjectLocationMap.tsx');
  const trackerSource = read('src/components/customer/RecentlyViewedTracker.tsx');
  const footerSource = read('src/components/layout/Footer.tsx');

  // 1 & 2. SaveButton + AddToCompareButton on Project Detail Page
  await test('1 & 2. Project detail page integrates SaveButton (resourceType="PROJECT") and AddToCompareButton (mode="PROJECTS") side-by-side', () => {
    assert.ok(
      pageSource.includes("import { SaveButton } from '@/src/components/customer/SaveButton'"),
      'page.tsx must import SaveButton'
    );
    assert.ok(
      pageSource.includes("import { AddToCompareButton } from '@/src/components/comparison/AddToCompareButton'"),
      'page.tsx must import AddToCompareButton'
    );
    assert.ok(
      pageSource.includes('<SaveButton resourceType="PROJECT" resourceId={project.id} showLabel />'),
      'page.tsx must render SaveButton with resourceType="PROJECT" and resourceId={project.id}'
    );
    assert.ok(
      pageSource.includes('<AddToCompareButton mode="PROJECTS" id={project.id} name={project.name} />'),
      'page.tsx must render AddToCompareButton with mode="PROJECTS", id={project.id}, and name={project.name}'
    );
  });

  // 3. Explicit requestSiteVisit intent across all project detail enquiry callers
  await test('3. All project detail enquiry callers pass explicit requestSiteVisit intent while preserving context fields', () => {
    // GreatHomesAdvisoryCard
    assert.ok(
      advisoryCardSource.includes('requestSiteVisit: requestVisit'),
      'GreatHomesAdvisoryCard must pass requestSiteVisit: requestVisit to openEnquiry'
    );
    assert.ok(
      advisoryCardSource.includes('handleOpenEnquiry(false)') &&
        advisoryCardSource.includes('handleOpenEnquiry(true)'),
      'GreatHomesAdvisoryCard must invoke handleOpenEnquiry(false) for details/call and handleOpenEnquiry(true) for visit'
    );

    // ProjectFinalCta
    assert.ok(
      finalCtaSource.includes('requestSiteVisit: requestVisit'),
      'ProjectFinalCta must pass requestSiteVisit: requestVisit to openEnquiry'
    );
    assert.ok(
      finalCtaSource.includes('handleOpenEnquiry(false)') &&
        finalCtaSource.includes('handleOpenEnquiry(true)'),
      'ProjectFinalCta must invoke handleOpenEnquiry(false) for details and handleOpenEnquiry(true) for site visit'
    );

    // ProjectConfigurationCard
    assert.ok(
      configCardSource.includes('configurationId: config.id') &&
        configCardSource.includes('configuration: config.name') &&
        configCardSource.includes('requestSiteVisit: false'),
      'ProjectConfigurationCard must pass requestSiteVisit: false alongside configurationId and configuration name'
    );

    // ProjectFloorPlanViewer
    assert.ok(
      floorPlanViewerSource.includes('configurationId: activeConfig.id') &&
        floorPlanViewerSource.includes('configuration: activeConfig.name') &&
        floorPlanViewerSource.includes('requestSiteVisit: false'),
      'ProjectFloorPlanViewer must pass requestSiteVisit: false alongside configurationId and configuration name'
    );

    // MobileStickyCta (Batch 1 regression guard)
    assert.ok(
      mobileStickyCtaSource.includes('requestSiteVisit: requestVisit'),
      'MobileStickyCta must continue passing requestSiteVisit: requestVisit'
    );
  });

  // 4. Configuration availability overrides, fallback protection, and strict canonical badge rendering (Fix 1 & Fix 3)
  await test('4. Configuration availability merges only genuine overrides, preserves canonical SOLD_OUT / FEW_UNITS_LEFT when no override exists, and avoids duplicate project fetches', async () => {
    assert.ok(
      pageSource.includes('newBookingService.getProjectConfigurationAvailabilityRecords(project.id)') &&
        !pageSource.includes('newBookingService.getPublicNewBookingConfigurations(project.id)') &&
        pageSource.includes('mergeConfigurationAvailabilityOverrides(') &&
        pageSource.includes('configurations={mergedConfigurations}'),
      'page.tsx must use lightweight getProjectConfigurationAvailabilityRecords and mergeConfigurationAvailabilityOverrides'
    );

    const sampleConfigs = [
      {
        id: 'cfg_sold_out',
        name: '4 BHK Duplex',
        price: 25000000,
        priceBasis: 'CARPET_AREA',
        effectivePricePerSqft: 12000,
        availability: 'SOLD_OUT',
      },
      {
        id: 'cfg_few_left',
        name: '3 BHK Residence',
        price: 15000000,
        priceBasis: 'CARPET_AREA',
        effectivePricePerSqft: 10000,
        availability: 'FEW_UNITS_LEFT',
      },
      {
        id: 'cfg_available',
        name: '2 BHK Smart',
        price: 9500000,
        priceBasis: 'CARPET_AREA',
        effectivePricePerSqft: 9500,
        availability: 'AVAILABLE',
      },
    ];

    // Case A: No overrides -> SOLD_OUT and FEW_UNITS_LEFT remain untouched
    const mergedNoOverrides = mergeConfigurationAvailabilityOverrides(sampleConfigs, []);
    assert.equal(mergedNoOverrides[0].availability, 'SOLD_OUT');
    assert.equal(mergedNoOverrides[1].availability, 'FEW_UNITS_LEFT');
    assert.equal(mergedNoOverrides[2].availability, 'AVAILABLE');

    // Case B: Synthetic fallback_<id> record NEVER overwrites canonical SOLD_OUT or FEW_UNITS_LEFT
    const mergedWithFallbacks = mergeConfigurationAvailabilityOverrides(sampleConfigs, [
      {
        id: 'fallback_cfg_sold_out',
        configurationId: 'cfg_sold_out',
        availabilityStatus: 'AVAILABLE',
      },
      {
        id: 'fallback_cfg_few_left',
        configurationId: 'cfg_few_left',
        availabilityStatus: 'AVAILABLE',
      },
    ]);
    assert.equal(
      mergedWithFallbacks[0].availability,
      'SOLD_OUT',
      'Synthetic fallback record must never overwrite canonical SOLD_OUT status'
    );
    assert.equal(
      mergedWithFallbacks[1].availability,
      'FEW_UNITS_LEFT',
      'Synthetic fallback record must never overwrite canonical FEW_UNITS_LEFT status'
    );

    // Case C: Genuine override updates only the targeted configurationId and leaves others untouched
    const mergedWithGenuineOverride = mergeConfigurationAvailabilityOverrides(sampleConfigs, [
      {
        id: 'nav_genuine_1',
        configurationId: 'cfg_available',
        availabilityStatus: 'ON_REQUEST',
      },
      {
        id: 'nav_invalid_status',
        configurationId: 'cfg_sold_out',
        availabilityStatus: 'FABRICATED_INVALID_STATUS',
      },
    ]);
    assert.equal(
      mergedWithGenuineOverride[0].availability,
      'SOLD_OUT',
      'Invalid override status must not overwrite canonical SOLD_OUT status'
    );
    assert.equal(
      mergedWithGenuineOverride[1].availability,
      'FEW_UNITS_LEFT',
      'Override for another configuration must not affect cfg_few_left'
    );
    assert.equal(
      mergedWithGenuineOverride[2].availability,
      'ON_REQUEST',
      'Genuine override must update targeted configurationId to ON_REQUEST'
    );

    // Verify lightweight service method works directly against availability repository
    const records = await newBookingService.getProjectConfigurationAvailabilityRecords('non_existent_proj');
    assert.ok(Array.isArray(records) && records.length === 0);

    // Canonical statuses resolve accurately
    assert.deepEqual(getConfigurationAvailabilityBadge('AVAILABLE'), {
      status: 'AVAILABLE',
      label: 'Available',
      tone: 'available',
    });
    assert.deepEqual(getConfigurationAvailabilityBadge('LIMITED'), {
      status: 'LIMITED',
      label: 'Limited Units',
      tone: 'limited',
    });
    assert.deepEqual(getConfigurationAvailabilityBadge('FEW_UNITS_LEFT'), {
      status: 'FEW_UNITS_LEFT',
      label: 'Few Units Left',
      tone: 'limited',
    });
    assert.deepEqual(getConfigurationAvailabilityBadge('ON_REQUEST'), {
      status: 'ON_REQUEST',
      label: 'On Request',
      tone: 'request',
    });
    assert.deepEqual(getConfigurationAvailabilityBadge('SOLD_OUT'), {
      status: 'SOLD_OUT',
      label: 'Sold Out',
      tone: 'sold_out',
    });
    assert.deepEqual(getConfigurationAvailabilityBadge('NOT_AVAILABLE'), {
      status: 'NOT_AVAILABLE',
      label: 'Not Available',
      tone: 'sold_out',
    });

    // Invalid, empty, or unknown statuses never fabricate badges
    assert.equal(getConfigurationAvailabilityBadge(null), null);
    assert.equal(getConfigurationAvailabilityBadge(undefined), null);
    assert.equal(getConfigurationAvailabilityBadge(''), null);
    assert.equal(getConfigurationAvailabilityBadge('   '), null);
    assert.equal(getConfigurationAvailabilityBadge('INVENTED_STATUS'), null);

    // SSR markup check on ProjectConfigurationCard
    const vmLimited = mapDtoToConfigurationViewModel({
      id: 'cfg_limited',
      name: '3 BHK Residence',
      bedroomCount: 3,
      carpetArea: 1250,
      builtUpArea: 1500,
      superBuiltUpArea: 1750,
      price: 12500000,
      priceBasis: 'CARPET_AREA',
      effectivePricePerSqft: 10000,
      availability: 'LIMITED',
    });
    const htmlLimited = renderToStaticMarkup(
      React.createElement(
        EnquiryProvider,
        null,
        React.createElement(ProjectConfigurationCard, { config: vmLimited, projectName: 'Test Project' })
      )
    );
    assert.ok(
      htmlLimited.includes('data-availability-status="LIMITED"') &&
        htmlLimited.includes('Limited Units'),
      'ProjectConfigurationCard must render canonical availability badge for LIMITED status'
    );

    const vmInvalid = {
      ...vmLimited,
      availability: 'UNKNOWN_FABRICATED_VALUE',
    };
    const htmlInvalid = renderToStaticMarkup(
      React.createElement(
        EnquiryProvider,
        null,
        React.createElement(ProjectConfigurationCard, { config: vmInvalid, projectName: 'Test Project' })
      )
    );
    assert.ok(
      !htmlInvalid.includes('data-availability-status='),
      'ProjectConfigurationCard must not render an availability badge when status is not canonical'
    );
  });

  // 5. Featured amenities deduplication & empty-state preservation
  await test('5. Featured amenities are not duplicated in the secondary grid and empty state returns null', () => {
    // Empty state returns empty markup
    const emptyHtml = renderToStaticMarkup(React.createElement(ProjectAmenities, { amenities: [] }));
    assert.equal(emptyHtml, '', 'ProjectAmenities must return null when no eligible amenities exist');

    // Mixed featured + non-featured amenities render each item exactly once
    const mixedAmenities = [
      { id: 'am_1', name: 'Infinity Edge Pool', category: 'LEISURE', isFeatured: true },
      { id: 'am_2', name: 'Skyline Clubhouse', category: 'CLUBHOUSE', isFeatured: true },
      { id: 'am_3', name: 'Indoor Badminton Court', category: 'SPORTS', isFeatured: false },
      { id: 'am_4', name: 'Children Play Zone', category: 'FAMILY', isFeatured: false },
    ];
    const mixedHtml = renderToStaticMarkup(
      React.createElement(ProjectAmenities, { amenities: mixedAmenities })
    );

    const countOccurrences = (str, sub) => str.split(sub).length - 1;
    assert.equal(
      countOccurrences(mixedHtml, 'Infinity Edge Pool'),
      1,
      'Featured amenity "Infinity Edge Pool" must appear exactly once'
    );
    assert.equal(
      countOccurrences(mixedHtml, 'Skyline Clubhouse'),
      1,
      'Featured amenity "Skyline Clubhouse" must appear exactly once'
    );
    assert.equal(
      countOccurrences(mixedHtml, 'Indoor Badminton Court'),
      1,
      'Non-featured amenity "Indoor Badminton Court" must appear once'
    );
    assert.ok(
      mixedHtml.includes('Key Project Highlights (2)') &&
        mixedHtml.includes('All Verified Enclave Amenities (2)'),
      'Section headers must reflect 2 featured highlights and 2 remaining verified amenities'
    );

    // If all amenities are featured, secondary section is hidden
    const allFeaturedHtml = renderToStaticMarkup(
      React.createElement(ProjectAmenities, {
        amenities: mixedAmenities.filter((a) => a.isFeatured),
      })
    );
    assert.ok(
      allFeaturedHtml.includes('Key Project Highlights (2)') &&
        !allFeaturedHtml.includes('All Verified Enclave Amenities'),
      'Secondary grid must be hidden when all eligible amenities are already shown in Key Project Highlights'
    );
    assert.ok(
      amenitiesSource.includes('const standardAmenities ='),
      'ProjectAmenities.tsx must compute standardAmenities excluding featured items'
    );
  });

  // 6. Remove redundant middle breadcrumb from ProjectLocationSection
  await test('6. Redundant middle breadcrumb is removed from ProjectLocationSection while preserving Administrative Hierarchy and fallback', () => {
    assert.ok(
      !locationSectionSource.includes('aria-label="Location hierarchy"'),
      'ProjectLocationSection must not render the redundant middle Location hierarchy breadcrumb row'
    );
    assert.ok(
      locationSectionSource.includes('Administrative Hierarchy'),
      'ProjectLocationSection must preserve the Administrative Hierarchy cards section'
    );

    const sampleLocation = {
      id: 'loc_1',
      name: 'New Town',
      slug: 'new-town',
      type: 'LOCALITY',
      path: [
        { id: 'loc_state', name: 'West Bengal', slug: 'west-bengal', type: 'STATE' },
        { id: 'loc_city', name: 'Kolkata', slug: 'kolkata', type: 'CITY' },
        { id: 'loc_1', name: 'New Town', slug: 'new-town', type: 'LOCALITY' },
      ],
      latitude: null,
      longitude: null,
    };
    const locHtml = renderToStaticMarkup(
      React.createElement(ProjectLocationSection, {
        location: sampleLocation,
        projectName: 'Test Enclave',
        nearbyPlaces: [],
      })
    );
    assert.ok(
      !locHtml.includes('aria-label="Location hierarchy"'),
      'Rendered ProjectLocationSection HTML must not contain middle breadcrumb strip'
    );
    assert.ok(
      locHtml.includes('Administrative Hierarchy') &&
        locHtml.includes('Map location unavailable'),
      'Rendered ProjectLocationSection HTML must preserve Administrative Hierarchy cards and missing-coordinate fallback'
    );
  });

  // 7. Stabilize ProjectLocationMap useEffect dependencies
  await test('7. ProjectLocationMap useEffect depends on primitive values instead of object/array references', () => {
    assert.ok(
      locationMapSource.includes('}, [lat, lng, hasValidCoords, projectName, nearbyMarkersKey]);'),
      'ProjectLocationMap useEffect and handleRetry must depend on primitive [lat, lng, hasValidCoords, projectName, nearbyMarkersKey]'
    );
    assert.ok(
      locationMapSource.includes('}, [lat, lng, hasValidCoords]);'),
      'ProjectLocationMap handleRecenter must depend on primitive [lat, lng, hasValidCoords]'
    );
    assert.ok(
      !locationMapSource.includes('[coordinates, hasValidCoords, projectName, nearbyMarkers]'),
      'ProjectLocationMap must not include unstable coordinates object or nearbyMarkers array in dependency array'
    );
  });

  // 8. Stabilize RecentlyViewedTracker useEffect dependencies
  await test('8. RecentlyViewedTracker useEffect depends only on primitive values and uses refs for trackEvent and metadata', () => {
    assert.ok(
      trackerSource.includes('const customerId = customer?.id ?? null;') &&
        trackerSource.includes('const trackEventRef = useRef(trackEvent);') &&
        trackerSource.includes('const metadataRef = useRef(metadata);'),
      'RecentlyViewedTracker must extract primitive customerId and store trackEvent and metadata in refs'
    );
    assert.ok(
      trackerSource.includes('}, [customerId, resourceType, resourceId, resourceSlug, areaBasis]);'),
      'RecentlyViewedTracker useEffect dependency array must contain only primitive [customerId, resourceType, resourceId, resourceSlug, areaBasis]'
    );
    assert.ok(
      !trackerSource.includes('[customer, resourceType, resourceId, resourceSlug, areaBasis, metadata, trackEvent]'),
      'RecentlyViewedTracker must not include customer, metadata, or trackEvent objects/functions in useEffect dependency array'
    );
  });

  // 9. Footer Guides link to /guides and mobile bottom padding clearance
  await test('9. Footer links Guides to /guides via Next.js Link and provides mobile bottom clearance for sticky bars', () => {
    assert.ok(
      footerSource.includes('<Link href="/guides"') &&
        !footerSource.includes('href="#intelligence"'),
      'Footer.tsx must use <Link href="/guides"> instead of <a href="#intelligence"> for Guides'
    );
    assert.ok(
      footerSource.includes('pb-36 md:pb-12'),
      'Footer.tsx must include pb-36 md:pb-12 to clear both MobileBottomNav and MobileStickyCta on mobile screens'
    );
  });

  // 10. HeroAdvisoryCard.tsx removal & live SSR route check
  await test('10. HeroAdvisoryCard.tsx is removed while MobileStickyCTA.tsx wrapper and live SSR project detail routes remain intact', async () => {
    const heroAdvisoryPath = path.join(
      rootDir,
      'app/projects/[slug]/components/HeroAdvisoryCard.tsx'
    );
    const mobileStickyWrapperPath = path.join(
      rootDir,
      'app/projects/[slug]/components/MobileStickyCTA.tsx'
    );

    assert.equal(
      fs.existsSync(heroAdvisoryPath),
      false,
      'Unused app/projects/[slug]/components/HeroAdvisoryCard.tsx must be deleted'
    );
    assert.equal(
      fs.existsSync(mobileStickyWrapperPath),
      true,
      'app/projects/[slug]/components/MobileStickyCTA.tsx wrapper must be preserved'
    );

    const published = await projectIntelligenceService.listProjects({ limit: 5 }, false);
    assert.ok(published.data.length > 0, 'At least 1 published project must exist');

    const sampleSlug = published.data[0].slug;
    const res = await fetch(`http://localhost:3000/projects/${sampleSlug}`);
    assert.equal(res.status, 200, `Expected HTTP 200 for /projects/${sampleSlug}`);
    const html = await res.text();

    assert.ok(
      html.includes('+ Add to Compare') && html.includes('Save'),
      `Live SSR /projects/${sampleSlug} must render '+ Add to Compare' and 'Save' buttons in the action bar`
    );
    assert.ok(
      html.includes('href="/guides"'),
      `Live SSR /projects/${sampleSlug} footer must include href="/guides"`
    );
    assert.ok(
      !html.includes('aria-label="Location hierarchy"'),
      `Live SSR /projects/${sampleSlug} must not contain the redundant middle location breadcrumb`
    );
  });

  // 11. Comparison state synchronization, mobile ComparisonTray offset, and discovery card controls
  await test('11. AddToCompareButton, /compare/projects removeItem, ComparisonTray, and project discovery cards stay synchronized and clear mobile sticky bars', async () => {
    const addToCompareSource = read('src/components/comparison/AddToCompareButton.tsx');
    const compareTraySource = read('src/components/comparison/ComparisonTray.tsx');
    const compareProjectsPageSource = read('app/compare/projects/page.tsx');
    const propertyCardSource = read('src/components/discovery/PropertyCard.tsx');
    const homeExploreSource = read('src/components/home/HomeExploreProjects.tsx');

    // Fix 2A: AddToCompareButton subscribes and cleans up gh_compare_updated and storage listeners
    assert.ok(
      addToCompareSource.includes("window.addEventListener('gh_compare_updated', syncCompareState)") &&
        addToCompareSource.includes("window.removeEventListener('gh_compare_updated', syncCompareState)") &&
        addToCompareSource.includes("window.addEventListener('storage', syncCompareState)") &&
        addToCompareSource.includes("window.removeEventListener('storage', syncCompareState)"),
      'AddToCompareButton must subscribe and clean up gh_compare_updated and storage listeners'
    );

    // Fix 2B: /compare/projects removeItem updates or removes gh_compare_projects in localStorage and dispatches gh_compare_updated
    assert.ok(
      compareProjectsPageSource.includes("localStorage.removeItem('gh_compare_projects')") &&
        compareProjectsPageSource.includes("localStorage.setItem('gh_compare_projects', JSON.stringify(updated))") &&
        compareProjectsPageSource.includes("window.dispatchEvent(new Event('gh_compare_updated'))"),
      '/compare/projects removeItem must sync gh_compare_projects in localStorage and dispatch gh_compare_updated'
    );

    // Fix 4: ComparisonTray positions above MobileBottomNav on ordinary pages and above MobileStickyCta on project detail pages
    assert.ok(
      compareTraySource.includes('bottom-36 md:bottom-4') &&
        compareTraySource.includes('bottom-16 md:bottom-4'),
      'ComparisonTray must use bottom-36 md:bottom-4 on project detail pages and bottom-16 md:bottom-4 on ordinary mobile pages'
    );

    // Discovery cards integrate AddToCompareButton (mode="PROJECTS")
    assert.ok(
      propertyCardSource.includes('<AddToCompareButton mode="PROJECTS" id={item.id} name={item.name} />'),
      'PropertyCard ProjectCard must render AddToCompareButton with mode="PROJECTS"'
    );
    assert.ok(
      homeExploreSource.includes('<AddToCompareButton mode="PROJECTS" id={project.id} name={project.name} />'),
      'HomeExploreProjects must render AddToCompareButton with mode="PROJECTS"'
    );

    // Live /projects route renders '+ Add to Compare' on project cards
    const projectsRes = await fetch('http://localhost:3000/projects');
    assert.equal(projectsRes.status, 200, 'Expected HTTP 200 for /projects');
    const projectsHtml = await projectsRes.text();
    assert.ok(
      projectsHtml.includes('+ Add to Compare'),
      'Live SSR /projects discovery page must render "+ Add to Compare" controls on project cards'
    );
  });

  // 12. Mobile Project Comparison Discoverability & User Flow (All 13 Comparison Journey Requirements)
  await test('12. ComparisonTray and AddToCompareButton state machine covers 0, 1, and 2-4 selected projects, 4-project cap, deduplication, and Browse/Compare actions', () => {
    // 12.1 & 12.2: Button states
    assert.equal(
      getAddToCompareButtonLabel(false),
      '+ Add to Compare',
      'Unselected button state must render "+ Add to Compare"'
    );
    assert.equal(
      getAddToCompareButtonLabel(true),
      '✓ Added to Compare',
      'Selected button state must render "✓ Added to Compare"'
    );
    assert.equal(MAX_COMPARE_ITEMS, 4, 'MAX_COMPARE_ITEMS must be 4');

    // 12.3: Zero projects selected state
    const trayZero = buildComparisonTrayModel({
      mode: 'projects',
      ids: [],
      pathname: '/projects/merlin-rise',
    });
    assert.equal(trayZero.count, 0);
    assert.equal(trayZero.heading, 'Compare Projects');
    assert.equal(trayZero.instruction, 'Add projects to compare them side-by-side.');
    assert.equal(trayZero.primaryAction, null, 'Zero-selected state must not display a disabled Compare Now button');
    assert.equal(trayZero.mobileBottomOffsetClass, 'bottom-36 md:bottom-4');

    // 12.4: Selecting 1 project updates ids and renders '1 of 4 projects selected', 'Add another project to compare side-by-side.', and 'Browse Projects' linking to /projects
    const step1 = computeNextCompareIds([], 'proj_1');
    assert.deepEqual(step1, {
      ids: ['proj_1'],
      added: true,
      removed: false,
      blockedByLimit: false,
    });
    const trayOne = buildComparisonTrayModel({
      mode: 'projects',
      ids: step1.ids,
      namesMap: { proj_1: 'Merlin Rise' },
      pathname: '/projects/merlin-rise',
    });
    assert.equal(trayOne.count, 1);
    assert.equal(trayOne.heading, 'Compare Projects');
    assert.equal(trayOne.selectionCountText, '1 of 4 projects selected');
    assert.equal(trayOne.instruction, 'Add another project to compare side-by-side.');
    assert.deepEqual(trayOne.primaryAction, {
      type: 'BROWSE',
      label: 'Browse Projects',
      href: '/projects',
    });
    assert.deepEqual(trayOne.selectedItems, [{ id: 'proj_1', name: 'Merlin Rise' }]);

    // 12.5: Selecting 2 projects enables 'Compare Now' and generates /compare/projects?ids=proj_1,proj_2
    const step2 = computeNextCompareIds(step1.ids, 'proj_2');
    assert.deepEqual(step2, {
      ids: ['proj_1', 'proj_2'],
      added: true,
      removed: false,
      blockedByLimit: false,
    });
    const trayTwo = buildComparisonTrayModel({
      mode: 'projects',
      ids: step2.ids,
      namesMap: { proj_1: 'Merlin Rise', proj_2: 'Sansara' },
      pathname: '/projects',
    });
    assert.equal(trayTwo.count, 2);
    assert.equal(trayTwo.heading, 'Compare 2 Projects');
    assert.equal(trayTwo.selectionCountText, '2 of 4 projects selected');
    assert.deepEqual(trayTwo.primaryAction, {
      type: 'COMPARE',
      label: 'Compare Now',
      href: '/compare/projects?ids=proj_1,proj_2',
    });
    assert.equal(trayTwo.mobileBottomOffsetClass, 'bottom-16 md:bottom-4');

    // 12.6 & 12.7: Selecting up to 4 projects works, and selecting a 5th project is blocked at 4
    const step3 = computeNextCompareIds(step2.ids, 'proj_3');
    const step4 = computeNextCompareIds(step3.ids, 'proj_4');
    assert.equal(step4.ids.length, 4);
    assert.equal(step4.added, true);

    const trayFour = buildComparisonTrayModel({
      mode: 'projects',
      ids: step4.ids,
      pathname: '/projects',
    });
    assert.equal(trayFour.heading, 'Compare 4 Projects');
    assert.equal(trayFour.selectionCountText, '4 of 4 projects selected');
    assert.equal(trayFour.primaryAction?.href, '/compare/projects?ids=proj_1,proj_2,proj_3,proj_4');

    const step5 = computeNextCompareIds(step4.ids, 'proj_5');
    assert.equal(step5.blockedByLimit, true, 'Selecting a 5th project must be blocked by the 4-project limit');
    assert.deepEqual(step5.ids, ['proj_1', 'proj_2', 'proj_3', 'proj_4']);

    // 12.8: Duplicate IDs are prevented
    const dupStep = computeNextCompareIds(['proj_1', 'proj_1', 'proj_2'], 'proj_3');
    assert.deepEqual(dupStep.ids, ['proj_1', 'proj_2', 'proj_3']);
    const trayDup = buildComparisonTrayModel({
      mode: 'projects',
      ids: ['proj_1', 'proj_1', 'proj_2'],
      pathname: '/projects',
    });
    assert.deepEqual(trayDup.ids, ['proj_1', 'proj_2']);
    assert.equal(trayDup.count, 2);

    // 12.9: Removing a project toggles it off and removing the last project yields empty array
    const removeOne = computeNextCompareIds(['proj_1', 'proj_2'], 'proj_2');
    assert.deepEqual(removeOne, {
      ids: ['proj_1'],
      added: false,
      removed: true,
      blockedByLimit: false,
    });
    const removeLast = computeNextCompareIds(removeOne.ids, 'proj_1');
    assert.deepEqual(removeLast, {
      ids: [],
      added: false,
      removed: true,
      blockedByLimit: false,
    });
  });

  console.log(`\n=== Batch 3 Summary: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Fatal error in Batch 3 verification suite:', err);
  process.exit(1);
});

