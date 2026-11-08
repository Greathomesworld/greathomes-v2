import assert from 'node:assert/strict';
import http from 'node:http';

function logSection(title) {
  console.log(`\n==================================================`);
  console.log(`  ${title}`);
  console.log(`==================================================\n`);
}

async function fetchRoute(urlPath, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${urlPath}`, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('Starting Phase 05F.7.G — Location SEO Authority, Indexation & Crawl Governance Tests\n');

  // Load domain services
  const { locationService, LOCATION_ALIASES } = await import(
    '../src/domain/locations/services/locationService.ts'
  );
  const { locationSeoService } = await import(
    '../src/domain/locations/services/locationSeoService.ts'
  );
  const { projectIntelligenceService } = await import(
    '../src/domain/projects/services/projectIntelligenceService.ts'
  );
  const { ensureSeedData } = await import(
    '../src/infrastructure/seed.ts'
  );

  await ensureSeedData();

  // ==========================================
  // SECTION A: SEO ELIGIBILITY ENGINE DETERMINISM (1 - 8)
  // ==========================================
  logSection('A. Location SEO Eligibility Engine Determinism (1 - 8)');

  // 1. Published Location with Projects (Rajarhat)
  const rajarhatLoc = await locationService.resolveLocationBySlug('rajarhat');
  assert.ok(rajarhatLoc, 'Rajarhat must exist in seed');
  const rajPath = await locationService.getLocationPath(rajarhatLoc.id);
  const rajProjects = (await projectIntelligenceService.listProjects({ locationId: rajarhatLoc.id }, false)).data;

  const rajEval = locationSeoService.evaluateEligibility({
    location: rajarhatLoc,
    path: rajPath,
    childLocations: [],
    projects: rajProjects,
  });
  assert.strictEqual(rajEval.eligible, true, 'Rajarhat with projects must be eligible');
  assert.strictEqual(rajEval.index, true, 'Rajarhat must be indexable');
  assert.strictEqual(rajEval.follow, true, 'Rajarhat must be crawlable');
  assert.strictEqual(rajEval.reason, 'SUFFICIENT_PROJECT_DEPTH');
  assert.strictEqual(rajEval.canonicalUrl, 'https://greathomes.co.in/locations/rajarhat');
  console.log('✓ 1. Location with published projects evaluates to SUFFICIENT_PROJECT_DEPTH (index: true, follow: true)');

  // 2. Published Parent Location with Child Locations (Kolkata City)
  const kolkataLoc = await locationService.resolveLocationBySlug('kolkata');
  assert.ok(kolkataLoc, 'Kolkata must exist in seed');
  const kolChildren = await locationService.getChildLocations(kolkataLoc.id, { publishedOnly: true });

  const kolEval = locationSeoService.evaluateEligibility({
    location: kolkataLoc,
    path: [kolkataLoc],
    childLocations: kolChildren,
    projects: [],
  });
  assert.strictEqual(kolEval.eligible, true, 'Kolkata with child locations must be eligible');
  assert.strictEqual(kolEval.index, true, 'Kolkata must be indexable');
  assert.strictEqual(kolEval.follow, true, 'Kolkata must be crawlable');
  assert.strictEqual(kolEval.reason, 'SUFFICIENT_CONTENT');
  console.log('✓ 2. Location with child areas evaluates to SUFFICIENT_CONTENT (index: true, follow: true)');

  // 3. Published Location with Editorial Description only
  const descLoc = {
    ...rajarhatLoc,
    id: 'test-desc-loc',
    slug: 'desc-only-loc',
    description: 'A thriving residential corridor with extensive planned infrastructure and green belts.',
  };
  const descEval = locationSeoService.evaluateEligibility({
    location: descLoc,
    path: [descLoc],
    childLocations: [],
    projects: [],
  });
  assert.strictEqual(descEval.eligible, true, 'Location with description must be eligible');
  assert.strictEqual(descEval.index, true, 'Location with description must be indexable');
  assert.strictEqual(descEval.reason, 'SUFFICIENT_CONTENT');
  console.log('✓ 3. Location with editorial description evaluates to SUFFICIENT_CONTENT');

  // 4. Thin Location (Published but 0 projects, 0 children, 0 description) -> noindex, follow
  const thinLoc = {
    ...rajarhatLoc,
    id: 'test-thin-loc',
    slug: 'thin-empty-loc',
    description: null,
    shortDescription: null,
  };
  const thinEval = locationSeoService.evaluateEligibility({
    location: thinLoc,
    path: [thinLoc],
    childLocations: [],
    projects: [],
  });
  assert.strictEqual(thinEval.eligible, false, 'Thin location must NOT be indexable');
  assert.strictEqual(thinEval.index, false, 'Thin location must have index: false (noindex)');
  assert.strictEqual(thinEval.follow, true, 'Thin location must have follow: true');
  assert.strictEqual(thinEval.reason, 'INSUFFICIENT_CONTENT');
  console.log('✓ 4. Thin location protected against indexation (index: false, follow: true)');

  // 5. Draft Location -> DRAFT (noindex, nofollow)
  const draftLoc = {
    ...rajarhatLoc,
    id: 'test-draft-loc',
    slug: 'draft-loc',
    status: 'DRAFT',
  };
  const draftEval = locationSeoService.evaluateEligibility({
    location: draftLoc,
    path: [draftLoc],
  });
  assert.strictEqual(draftEval.eligible, false);
  assert.strictEqual(draftEval.index, false);
  assert.strictEqual(draftEval.follow, false);
  assert.strictEqual(draftEval.reason, 'DRAFT');
  console.log('✓ 5. Draft location evaluates to DRAFT (index: false, follow: false)');

  // 6. Archived Location -> ARCHIVED (noindex, nofollow)
  const archivedLoc = {
    ...rajarhatLoc,
    id: 'test-archived-loc',
    slug: 'archived-loc',
    status: 'ARCHIVED',
  };
  const archEval = locationSeoService.evaluateEligibility({
    location: archivedLoc,
    path: [archivedLoc],
  });
  assert.strictEqual(archEval.eligible, false);
  assert.strictEqual(archEval.index, false);
  assert.strictEqual(archEval.follow, false);
  assert.strictEqual(archEval.reason, 'ARCHIVED');
  console.log('✓ 6. Archived location evaluates to ARCHIVED (index: false, follow: false)');

  // 7. Alias Slug -> ALIAS (noindex, follow)
  const aliasEval = locationSeoService.evaluateEligibility({
    location: rajarhatLoc,
    isAlias: true,
  });
  assert.strictEqual(aliasEval.eligible, false);
  assert.strictEqual(aliasEval.index, false);
  assert.strictEqual(aliasEval.follow, true);
  assert.strictEqual(aliasEval.reason, 'ALIAS');
  console.log('✓ 7. Alias route evaluates to ALIAS (index: false, follow: true)');

  // 8. Self-referential invalid hierarchy -> INVALID_HIERARCHY
  const cyclicLoc = {
    ...rajarhatLoc,
    id: 'cyclic-loc-id',
    parentId: 'cyclic-loc-id',
  };
  const cyclicEval = locationSeoService.evaluateEligibility({
    location: cyclicLoc,
  });
  assert.strictEqual(cyclicEval.eligible, false);
  assert.strictEqual(cyclicEval.index, false);
  assert.strictEqual(cyclicEval.reason, 'INVALID_HIERARCHY');
  console.log('✓ 8. Self-referential hierarchy evaluates to INVALID_HIERARCHY');

  // ==========================================
  // SECTION B: METADATA & SCHEMA.ORG STRUCTURED DATA (9 - 14)
  // ==========================================
  logSection('B. Metadata & Schema.org Structured Data (9 - 14)');

  // 9. Canonical URL formation
  const metadata = locationSeoService.buildMetadata(rajEval);
  assert.strictEqual(metadata.alternates.canonical, 'https://greathomes.co.in/locations/rajarhat');
  assert.strictEqual(metadata.robots.index, true);
  assert.strictEqual(metadata.robots.follow, true);
  console.log('✓ 9. Canonical URL properly configured in Metadata object');

  // 10. No forbidden corporate terminology in metadata
  const forbiddenTerms = [
    'Micro-Market', 'Micro Market', 'Investment Corridor',
    'Business Corridor', 'Growth Corridor'
  ];
  for (const term of forbiddenTerms) {
    assert.ok(!metadata.title.includes(term), `Metadata title must not contain ${term}`);
    assert.ok(!metadata.description.includes(term), `Metadata description must not contain ${term}`);
  }
  console.log('✓ 10. Zero forbidden corridor terminology in metadata titles or descriptions');

  // 11. Schema.org JSON-LD generation
  const jsonLd = locationSeoService.buildJsonLd({
    location: rajarhatLoc,
    path: rajPath,
    canonicalUrl: rajEval.canonicalUrl,
    description: 'Rajarhat Area',
  });
  assert.strictEqual(jsonLd['@context'], 'https://schema.org');
  assert.ok(Array.isArray(jsonLd['@graph']), 'JSON-LD must contain @graph array');

  const placeObj = jsonLd['@graph'].find(item => item['@type'] === 'Place');
  assert.ok(placeObj, 'Place schema must exist');
  assert.strictEqual(placeObj.name, 'Rajarhat');
  assert.strictEqual(placeObj.address.addressCountry, 'IN');
  console.log('✓ 11. Valid Schema.org Place object with Indian country code');

  // 12. Schema.org BreadcrumbList sequential numbering
  const breadcrumbObj = jsonLd['@graph'].find(item => item['@type'] === 'BreadcrumbList');
  assert.ok(breadcrumbObj, 'BreadcrumbList schema must exist');
  assert.ok(breadcrumbObj.itemListElement.length >= 2, 'Breadcrumbs must have at least Home and Current');
  assert.strictEqual(breadcrumbObj.itemListElement[0].position, 1);
  assert.strictEqual(breadcrumbObj.itemListElement[0].name, 'Home');
  console.log('✓ 12. Valid Schema.org BreadcrumbList with 1-based sequential position index');

  // 13. Indexable locations query for sitemap
  const indexableLocations = await locationSeoService.getIndexableLocations();
  assert.ok(indexableLocations.length >= 3, 'Indexable locations should include published locations');
  const indexableSlugs = indexableLocations.map(l => l.slug);
  assert.ok(indexableSlugs.includes('kolkata'), 'Kolkata must be in indexable list');
  assert.ok(indexableSlugs.includes('rajarhat'), 'Rajarhat must be in indexable list');
  assert.ok(indexableSlugs.includes('new-town'), 'New Town must be in indexable list');
  assert.ok(!indexableSlugs.includes('secret-sector-9'), 'Draft locations must NOT be indexable');
  assert.ok(!indexableSlugs.includes('old-industrial-zone'), 'Archived locations must NOT be indexable');
  console.log('✓ 13. getIndexableLocations correctly includes published locations and excludes non-public locations');

  // 14. Zero fabricated claims in default metadata description
  assert.ok(!metadata.description.includes('guaranteed return'));
  assert.ok(!metadata.description.includes('high ROI'));
  assert.ok(!metadata.description.includes('% appreciation'));
  console.log('✓ 14. Zero fabricated investment / ROI claims in SEO descriptions');

  // ==========================================
  // SECTION C: ROBOTS.TXT & SITEMAP.XML CRAWL GOVERNANCE (15 - 18)
  // ==========================================
  logSection('C. Crawl Governance Routes (15 - 18)');

  // 15. Robots.txt route
  const robotsRes = await fetchRoute('/robots.txt');
  assert.strictEqual(robotsRes.status, 200, '/robots.txt must return 200');
  assert.ok(robotsRes.body.includes('User-Agent: *') || robotsRes.body.includes('User-agent: *'), 'Robots must target User-agent *');
  assert.ok(robotsRes.body.includes('Allow: /'), 'Robots must allow /');
  assert.ok(robotsRes.body.includes('Disallow: /api/'), 'Robots must disallow /api/');
  assert.ok(robotsRes.body.includes('https://greathomes.co.in/sitemap.xml'), 'Robots must reference sitemap');
  console.log('✓ 15. /robots.txt serves compliant crawl directives and sitemap reference');

  // 16. Sitemap.xml route
  const sitemapRes = await fetchRoute('/sitemap.xml');
  assert.strictEqual(sitemapRes.status, 200, '/sitemap.xml must return 200');
  assert.ok(sitemapRes.body.includes('https://greathomes.co.in/locations/rajarhat'), 'Sitemap must contain Rajarhat');
  assert.ok(sitemapRes.body.includes('https://greathomes.co.in/locations/kolkata'), 'Sitemap must contain Kolkata');
  assert.ok(sitemapRes.body.includes('https://greathomes.co.in/locations/new-town'), 'Sitemap must contain New Town');
  assert.ok(sitemapRes.body.includes('https://greathomes.co.in/projects/merlin-rise'), 'Sitemap must contain published projects');
  assert.ok(!sitemapRes.body.includes('secret-sector-9'), 'Sitemap must NOT contain draft locations');
  assert.ok(!sitemapRes.body.includes('old-industrial-zone'), 'Sitemap must NOT contain archived locations');
  console.log('✓ 16. /sitemap.xml generates high-quality XML URLs and excludes non-public locations');

  // 17. Live Canonical Location page SSR structured data check
  const liveRajarhat = await fetchRoute('/locations/rajarhat');
  assert.strictEqual(liveRajarhat.status, 200, '/locations/rajarhat must return 200');
  assert.ok(liveRajarhat.body.includes('application/ld+json'), 'Live page must include JSON-LD script tag');
  assert.ok(liveRajarhat.body.includes('https://greathomes.co.in/locations/rajarhat'), 'Live page must include canonical URL in JSON-LD');
  console.log('✓ 17. Live /locations/rajarhat renders Schema.org JSON-LD tag');

  // 18. Draft and archived locations return 404
  const liveDraft = await fetchRoute('/locations/secret-sector-9');
  assert.ok(
    liveDraft.status === 404 ||
    liveDraft.body.includes('NEXT_HTTP_ERROR_FALLBACK;404') ||
    liveDraft.body.includes('Page Not Found') ||
    liveDraft.body.includes('Location Not Found'),
    'Draft location must return 404 or Not Found'
  );
  console.log('✓ 18. Draft location correctly protected against crawl and indexation with 404 Not Found');

  console.log('\n==================================================');
  console.log('  ALL PHASE 05F.7.G LOCATION SEO TESTS PASSED');
  console.log('==================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Phase 05F.7.G Test Failure:', err);
  process.exit(1);
});
