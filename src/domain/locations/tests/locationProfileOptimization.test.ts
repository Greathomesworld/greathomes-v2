import { locationSeoService } from '../services/locationSeoService';
import { marketIntelligenceService } from '../../marketIntelligence/services/marketIntelligenceService';
import { locationIntelligenceService } from '../../marketIntelligence/services/locationIntelligenceService';
import { propertyDiscoveryService } from '../../projects/services/propertyDiscoveryService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

export async function runLocationProfileOptimizationTests() {
  console.log('=== Running Location Profile Optimization Unit & Integration Tests ===');

  // 1. SEO Metadata & JSON-LD Tests
  console.log('1. Testing Location SEO Service (titles, descriptions, OG/Twitter images, JSON-LD)...');
  const northKolkataLoc: any = {
    id: 'loc-north-kolkata',
    name: 'North Kolkata',
    slug: 'north-kolkata',
    type: 'AREA',
    status: 'PUBLISHED',
    shortDescription: 'Historic residential zone of Kolkata.',
    description: 'Historic residential zone of Kolkata with heritage architecture and metro connectivity.',
    latitude: 22.6000,
    longitude: 88.3700,
  };
  const kolkataCity: any = {
    id: 'loc-kolkata',
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    status: 'PUBLISHED',
  };

  const nkEligibility = locationSeoService.evaluateEligibility({
    location: northKolkataLoc,
    path: [kolkataCity, northKolkataLoc],
    childLocations: [{ id: 'c1' } as any],
    projects: [],
    isAlias: false,
  });

  assert(
    !nkEligibility.title.includes('Kolkata Kolkata'),
    `Expected title not to repeat Kolkata, got: "${nkEligibility.title}"`
  );
  assert(
    nkEligibility.title === 'North Kolkata – Residential Area & Property Guide | Great Homes',
    `Expected clean North Kolkata title, got: "${nkEligibility.title}"`
  );
  assert(
    Boolean(nkEligibility.imageUrl && nkEligibility.imageUrl.length > 0),
    'Expected eligibility.imageUrl to be populated'
  );

  const nkMetadata = locationSeoService.buildMetadata(nkEligibility);
  assert(
    Array.isArray((nkMetadata.openGraph as any)?.images) && (nkMetadata.openGraph as any).images.length > 0,
    'Expected openGraph.images to be populated'
  );
  assert(
    Array.isArray((nkMetadata.twitter as any)?.images) && (nkMetadata.twitter as any).images.length > 0,
    'Expected twitter.images to be populated'
  );

  const emBypassLoc: any = {
    id: 'loc-em-bypass',
    name: 'EM Bypass',
    slug: 'em-bypass',
    type: 'AREA',
    status: 'PUBLISHED',
    shortDescription: 'Eastern Metropolitan Bypass corridor',
    description: null,
  };
  const emEligibility = locationSeoService.evaluateEligibility({
    location: emBypassLoc,
    path: [kolkataCity, emBypassLoc],
    childLocations: [{ id: 'c2' } as any],
    projects: [],
    isAlias: false,
  });
  assert(
    !emEligibility.description.includes('corridor Explore'),
    `Expected missing period fixed in EM Bypass description, got: "${emEligibility.description}"`
  );

  const jsonLd = locationSeoService.buildJsonLd({
    location: northKolkataLoc,
    path: [kolkataCity, northKolkataLoc],
    canonicalUrl: 'https://www.greathomes.co.in/locations/north-kolkata',
    description: nkEligibility.description,
  });
  const breadcrumbGraph = (jsonLd['@graph'] as any[]).find(g => g['@type'] === 'BreadcrumbList');
  assert(Boolean(breadcrumbGraph), 'Expected BreadcrumbList in JSON-LD @graph');
  assert(
    breadcrumbGraph.itemListElement[0].name === 'Home' &&
      breadcrumbGraph.itemListElement[1].name === 'Locations' &&
      breadcrumbGraph.itemListElement[1].item === 'https://www.greathomes.co.in/locations',
    'Expected JSON-LD BreadcrumbList position 2 to be Locations (/locations)'
  );
  console.log('✔ 1. Location SEO & JSON-LD tests passed');

  // 2. Unique Project Configuration Counts Test
  console.log('2. Testing unique project configuration counts per BHK...');
  const mockPreloadedData: any = {
    publishedProjects: [
      { id: 'proj-1', lifecycleStatus: 'PUBLISHED', status: 'UNDER_CONSTRUCTION', reraVerificationStatus: 'VERIFIED' },
      { id: 'proj-2', lifecycleStatus: 'PUBLISHED', status: 'READY_TO_MOVE', reraVerificationStatus: 'VERIFIED' },
    ],
    projectConfigurationRows: [
      // proj-1 has THREE different 3 BHK variants and TWO 2 BHK variants
      { id: 'cfg-1', projectId: 'proj-1', bedroomCount: 3, carpetArea: 1100, price: 9500000 },
      { id: 'cfg-2', projectId: 'proj-1', bedroomCount: 3, carpetArea: 1250, price: 11000000 },
      { id: 'cfg-3', projectId: 'proj-1', bedroomCount: 3, carpetArea: 1400, price: 12500000 },
      { id: 'cfg-4', projectId: 'proj-1', bedroomCount: 2, carpetArea: 850, price: 7200000 },
      { id: 'cfg-5', projectId: 'proj-1', bedroomCount: 2, carpetArea: 900, price: 7600000 },
      // proj-2 has ONE 3 BHK variant and ONE 4 BHK variant
      { id: 'cfg-6', projectId: 'proj-2', bedroomCount: 3, carpetArea: 1500, price: 14500000 },
      { id: 'cfg-7', projectId: 'proj-2', bedroomCount: 4, carpetArea: 2100, price: 21000000 },
    ],
    verifiedResaleRows: [],
    unverifiedResaleRows: [],
    verifiedRentalRows: [],
    unverifiedRentalRows: [],
  };

  const supplyMetrics = await marketIntelligenceService.getSupplyMetrics(
    'loc-test-area',
    'DESCENDANT',
    ['loc-test-area'],
    mockPreloadedData
  );
  assert(supplyMetrics.publishedProjects === 2, `Expected 2 published projects, got ${supplyMetrics.publishedProjects}`);
  assert(
    supplyMetrics.configurationDistribution.bhk2Count === 1,
    `Expected bhk2Count === 1 unique project, got ${supplyMetrics.configurationDistribution.bhk2Count}`
  );
  assert(
    supplyMetrics.configurationDistribution.bhk3Count === 2,
    `Expected bhk3Count === 2 unique projects (not 4 variants), got ${supplyMetrics.configurationDistribution.bhk3Count}`
  );
  assert(
    supplyMetrics.configurationDistribution.bhk4Count === 1,
    `Expected bhk4Count === 1 unique project, got ${supplyMetrics.configurationDistribution.bhk4Count}`
  );
  console.log('✔ 2. Unique project configuration counts per BHK passed');

  // 3. Scope Filtering (DIRECT vs DESCENDANT), Market Activity Filtering & Snapshot Validation against live/memory data
  console.log('3. Testing DIRECT vs DESCENDANT scope, Market Activity filtering, and Snapshot validation on New Town...');
  const newTownDescendantIntel = await locationIntelligenceService.getLocationIntelligence('new-town', { scope: 'DESCENDANT' });
  const newTownDirectIntel = await locationIntelligenceService.getLocationIntelligence('new-town', { scope: 'DIRECT' });

  if (newTownDescendantIntel && newTownDirectIntel) {
    // Check that configuration counts never exceed publishedProjects
    const descConfig = newTownDescendantIntel.supply.projectConfigurationDistribution;
    if (descConfig !== ('NOT_AVAILABLE' as any)) {
      assert(
        descConfig.bhk2Count <= newTownDescendantIntel.marketOverview.publishedProjects &&
          descConfig.bhk3Count <= newTownDescendantIntel.marketOverview.publishedProjects &&
          descConfig.bhk4Count <= newTownDescendantIntel.marketOverview.publishedProjects,
        'Configuration project count cannot exceed total published projects in scope'
      );
    }

    // Check that recentActivity contains zero synthetic/test events
    for (const evt of newTownDescendantIntel.recentActivity.events) {
      assert(
        !evt.summary.toLowerCase().includes('neon test') &&
          !evt.title.toLowerCase().includes('neon test'),
        `Synthetic test event leaked into recentActivity: ${evt.title} - ${evt.summary}`
      );
    }

    // Check discovery scope alignment between LocationHero2 and discovery sections
    const directProjects = await propertyDiscoveryService.discoverProjects({ location: 'new-town', scope: 'DIRECT' }, 1, 20);
    const descendantProjects = await propertyDiscoveryService.discoverProjects({ location: 'new-town', scope: 'DESCENDANT' }, 1, 20);

    assert(
      directProjects.pagination.total === newTownDirectIntel.marketOverview.publishedProjects,
      `DIRECT scope mismatch: discoverProjects.pagination.total (${directProjects.pagination.total}) !== intel.marketOverview.publishedProjects (${newTownDirectIntel.marketOverview.publishedProjects})`
    );
    assert(
      descendantProjects.pagination.total === newTownDescendantIntel.marketOverview.publishedProjects,
      `DESCENDANT scope mismatch: discoverProjects.pagination.total (${descendantProjects.pagination.total}) !== intel.marketOverview.publishedProjects (${newTownDescendantIntel.marketOverview.publishedProjects})`
    );

    // Check snapshot validation
    const directHistory = await locationIntelligenceService.getLocationHistory(
      newTownDirectIntel.location.id,
      'DIRECT',
      { hasChildLocations: true, liveSupply: newTownDirectIntel.marketOverview }
    );
    assert(
      directHistory.length === 0,
      `Expected DIRECT scope on parent location with children to return 0 snapshots, got ${directHistory.length}`
    );

    const descendantHistory = await locationIntelligenceService.getLocationHistory(
      newTownDescendantIntel.location.id,
      'DESCENDANT',
      { hasChildLocations: true, liveSupply: newTownDescendantIntel.marketOverview }
    );
    for (const snap of descendantHistory) {
      assert(
        !String(snap.snapshotDate).startsWith('2026-09-'),
        `Synthetic 2026-09-* snapshot leaked into validated history: ${snap.snapshotDate}`
      );
    }
  }
  console.log('✔ 3. Scope filtering, Market Activity hygiene, and Snapshot validation passed');

  console.log('=== All Location Profile Optimization Tests Passed Successfully ===');
}

runLocationProfileOptimizationTests().catch(err => {
  console.error(err);
  process.exit(1);
});
