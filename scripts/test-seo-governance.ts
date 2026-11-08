/**
 * Comprehensive Automated SEO & Indexability Governance Test Suite for Great Homes V2
 * Executes deterministic verification across:
 * 1. Shared SEO Audit Engine (qualityScore vs score, lifecycle, verification, canonical regex)
 * 2. Project pagination beyond 50 published projects (listAllProjects & sitemap)
 * 3. Sitemap listing eligibility (PUBLISHED + VERIFIED + non-empty slug) & editorial routes
 * 4. Draft, archived, paused, rejected, and unverified exclusion from public indexability
 * 5. Resale & Rental admin preview routes (/buy/[slug] and /rent/[slug]) and price fields (askingPrice / monthlyRent)
 * 6. Developer JSON-LD structured data generation (Organization / RealEstateAgent + BreadcrumbList)
 * 7. Existence and structure of /admin/seo/overview, /admin/seo/sitemap, and /admin/seo/search-console
 * 8. Search Console service & page SIMULATED / PREVIEW mode disclosures
 * 9. Unauthenticated request rejection on /api/admin/locations, /api/admin/developers, and /api/admin/google/search-console/inspect
 * 10. Public listing DTO privacy boundary (zero leakage of owner/broker phone, email, notes, or CRM IDs)
 * 11. robots.txt disallow rules (/api/, /admin/, /account/)
 */

import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { NextRequest } from 'next/server';
import { evaluateEntitySeo, validateCanonicalUrl, buildDeveloperJsonLd } from '../src/domain/seo/auditEngine';
import { searchConsoleService } from '../src/domain/google/searchConsoleService';
import { projectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService';
import { resaleListingService } from '../src/domain/projects/services/resaleService';
import { rentalListingService } from '../src/domain/projects/services/rentalService';
import { ensureSeedData } from '../src/infrastructure/seed';
import sitemap from '../app/sitemap';
import robots from '../app/robots';
import { GET as getAdminLocations } from '../app/api/admin/locations/route';
import { GET as getAdminDevelopers } from '../app/api/admin/developers/route';
import { POST as postSearchConsoleInspect } from '../app/api/admin/google/search-console/inspect/route';

async function runTests() {
  console.log('=== Starting Great Homes V2 Comprehensive SEO Remediation Test Suite ===\n');
  let passedCount = 0;

  function pass(name: string) {
    passedCount++;
    console.log(` [PASS] ${name}`);
  }

  // ---------------------------------------------------------------------------
  // 1. Shared SEO Audit Engine: Quality vs Indexability, Canonical Validation
  // ---------------------------------------------------------------------------
  {
    const validCanonical = validateCanonicalUrl(
      'https://greathomes.co.in/projects/urbana-kolkata',
      'PROJECT',
      'urbana-kolkata'
    );
    assert.strictEqual(validCanonical.valid, true, 'Expected canonical project URL to be valid');

    const badCanonical = validateCanonicalUrl(
      'https://evil.example.com/greathomes.co.in/projects/urbana-kolkata',
      'PROJECT',
      'urbana-kolkata'
    );
    assert.strictEqual(badCanonical.valid, false, 'Expected spoofed domain canonical to fail');

    const wrongPrefixCanonical = validateCanonicalUrl(
      'https://greathomes.co.in/resale/some-slug',
      'RESALE',
      'some-slug'
    );
    assert.strictEqual(wrongPrefixCanonical.valid, false, 'Expected /resale/ prefix to fail canonical validation');

    // Published & Verified record with full metadata
    const indexableRes = evaluateEntitySeo({
      id: 'proj-1',
      entityType: 'PROJECT',
      title: 'Urbana in Anandapur — Real Estate Intelligence | Great Homes',
      description:
        'Explore verified 3 BHK and 4 BHK luxury residences at Urbana in Anandapur, Kolkata with RERA registration, floor plans, and pricing intelligence.',
      slug: 'urbana-kolkata',
      canonicalUrl: 'https://greathomes.co.in/projects/urbana-kolkata',
      hasFeaturedImage: true,
      hasStructuredData: true,
      schemaValidated: true,
      lifecycleStatus: 'PUBLISHED',
    });
    assert.strictEqual(indexableRes.isIndexable, true);
    assert.strictEqual(indexableRes.status, 'PASS');
    assert.strictEqual(indexableRes.score, 100);
    assert.strictEqual(indexableRes.qualityScore, 100);

    // Draft record with identical metadata MUST NOT be indexable or PASS
    const draftRes = evaluateEntitySeo({
      id: 'proj-draft',
      entityType: 'PROJECT',
      title: 'Urbana in Anandapur — Real Estate Intelligence | Great Homes',
      description:
        'Explore verified 3 BHK and 4 BHK luxury residences at Urbana in Anandapur, Kolkata with RERA registration, floor plans, and pricing intelligence.',
      slug: 'urbana-draft',
      canonicalUrl: 'https://greathomes.co.in/projects/urbana-draft',
      hasFeaturedImage: true,
      hasStructuredData: true,
      schemaValidated: true,
      lifecycleStatus: 'DRAFT',
    });
    assert.strictEqual(draftRes.isIndexable, false, 'DRAFT project must not be indexable');
    assert.strictEqual(draftRes.status, 'CRITICAL', 'DRAFT project must have CRITICAL readiness status');
    assert.ok(draftRes.score < 60, 'DRAFT project readiness score must be capped below PASS threshold');
    assert.strictEqual(draftRes.qualityScore, 100, 'Quality score should still reflect metadata completeness');

    // Archived, Paused, Sold/Rented, Rejected, Unverified records
    for (const st of ['ARCHIVED', 'PAUSED', 'SOLD_RENTED']) {
      const r = evaluateEntitySeo({
        id: `test-${st}`,
        entityType: 'RESALE',
        title: '3 BHK Resale in New Town · ₹1.45 Cr | Great Homes',
        description:
          'Verified 3 BHK apartment for resale in New Town Kolkata with modern clubhouse amenities and covered parking.',
        slug: '3-bhk-new-town',
        canonicalUrl: 'https://greathomes.co.in/buy/3-bhk-new-town',
        hasFeaturedImage: true,
        hasStructuredData: true,
        lifecycleStatus: st,
        verificationStatus: 'VERIFIED',
      });
      assert.strictEqual(r.isIndexable, false, `Lifecycle ${st} must be non-indexable`);
    }

    for (const ver of ['UNVERIFIED', 'REJECTED']) {
      const r = evaluateEntitySeo({
        id: `test-ver-${ver}`,
        entityType: 'RESALE',
        title: '3 BHK Resale in New Town · ₹1.45 Cr | Great Homes',
        description:
          'Verified 3 BHK apartment for resale in New Town Kolkata with modern clubhouse amenities and covered parking.',
        slug: '3-bhk-new-town',
        canonicalUrl: 'https://greathomes.co.in/buy/3-bhk-new-town',
        hasFeaturedImage: true,
        hasStructuredData: true,
        lifecycleStatus: 'PUBLISHED',
        verificationStatus: ver,
      });
      assert.strictEqual(r.isIndexable, false, `Verification ${ver} must be non-indexable even when PUBLISHED`);
      assert.strictEqual(r.status, 'CRITICAL');
    }

    pass('Shared SEO audit engine separates metadata quality from indexability across all lifecycle & verification states');
  }

  // ---------------------------------------------------------------------------
  // 2. Developer JSON-LD Structured Data Generation
  // ---------------------------------------------------------------------------
  {
    const jsonLd = buildDeveloperJsonLd({
      name: 'Forum Group',
      slug: 'forum-group',
      shortDescription: 'Leading luxury residential developer in Kolkata.',
      logoUrl: 'https://greathomes.co.in/images/forum-logo.png',
      websiteUrl: 'https://forumprojects.in',
      locations: [{ name: 'EM Bypass' }, { name: 'New Town' }],
    });
    assert.strictEqual(jsonLd['@context'], 'https://schema.org');
    assert.ok(Array.isArray(jsonLd['@graph']) && jsonLd['@graph'].length === 2);
    const orgNode: any = jsonLd['@graph'][0];
    assert.deepStrictEqual(orgNode['@type'], ['Organization', 'RealEstateAgent']);
    assert.strictEqual(orgNode.name, 'Forum Group');
    assert.strictEqual(orgNode.url, 'https://greathomes.co.in/developers/forum-group');
    assert.strictEqual(orgNode.logo, 'https://greathomes.co.in/images/forum-logo.png');
    pass('Developer detail route emits valid Organization / RealEstateAgent + BreadcrumbList JSON-LD');
  }

  // ---------------------------------------------------------------------------
  // 3. Project Pagination > 50 Published Projects (No 50-record Truncation)
  // ---------------------------------------------------------------------------
  {
    await ensureSeedData();
    const allPublished = await projectIntelligenceService.listAllProjects({}, false);
    assert.ok(allPublished.length > 0, 'Expected seeded published projects');

    // Simulate > 50 published projects across 2 pages by mocking listProjects temporarily
    const origListProjects = projectIntelligenceService.listProjects.bind(projectIntelligenceService);
    const syntheticProjects = Array.from({ length: 65 }, (_, i) => ({
      ...(allPublished[0] as any),
      id: `synth-proj-${i + 1}`,
      name: `Synthetic Project ${i + 1}`,
      slug: `synthetic-project-${i + 1}`,
      lifecycleStatus: 'PUBLISHED',
    }));

    (projectIntelligenceService as any).listProjects = async (opts: any) => {
      const page = opts?.page || 1;
      const limit = Math.min(50, opts?.limit || 50);
      const slice = syntheticProjects.slice((page - 1) * limit, page * limit);
      return {
        data: slice,
        pagination: {
          total: syntheticProjects.length,
          page,
          limit,
          totalPages: Math.ceil(syntheticProjects.length / limit),
        },
      };
    };

    try {
      const paginatedAll = await projectIntelligenceService.listAllProjects({}, false);
      assert.strictEqual(
        paginatedAll.length,
        65,
        `Expected listAllProjects to retrieve all 65 projects across pages, got ${paginatedAll.length}`
      );
    } finally {
      (projectIntelligenceService as any).listProjects = origListProjects;
    }
    pass('projectIntelligenceService.listAllProjects paginates past 50 published projects without truncation');
  }

  // ---------------------------------------------------------------------------
  // 4. Sitemap Eligibility, Editorial Routes & Robots Rules
  // ---------------------------------------------------------------------------
  {
    const sitemapEntries = await sitemap();
    const urls = sitemapEntries.map(e => e.url);

    // Check editorial and market routes in sitemap
    assert.ok(urls.includes('https://greathomes.co.in/market'), 'Sitemap must include /market');
    assert.ok(urls.includes('https://greathomes.co.in/guides'), 'Sitemap must include /guides');
    assert.ok(urls.includes('https://greathomes.co.in/reviews'), 'Sitemap must include /reviews');

    // Ensure no empty-slug listing URLs or duplicate URLs
    assert.ok(!urls.includes('https://greathomes.co.in/buy/'), 'Sitemap must not contain empty /buy/ slug');
    assert.ok(!urls.includes('https://greathomes.co.in/rent/'), 'Sitemap must not contain empty /rent/ slug');
    assert.ok(!urls.some(u => u.endsWith('/undefined')), 'Sitemap must not contain /undefined slugs');
    assert.strictEqual(new Set(urls).size, urls.length, 'All sitemap URLs must be unique');

    // Verify all resale/rental URLs in sitemap correspond to PUBLISHED + VERIFIED listings
    const publicResale = await resaleListingService.listPublicListings({});
    const unverifiedResaleSlugs = publicResale
      .filter(r => !r.isVerified && r.slug)
      .map(r => `https://greathomes.co.in/buy/${r.slug}`);
    for (const u of unverifiedResaleSlugs) {
      assert.ok(!urls.includes(u), `Unverified resale listing ${u} must be excluded from /sitemap.xml`);
    }

    const robotsConfig = robots();
    const rules = Array.isArray(robotsConfig.rules) ? robotsConfig.rules[0] : robotsConfig.rules;
    const disallowList = Array.isArray(rules.disallow) ? rules.disallow : [rules.disallow];
    assert.ok(disallowList.includes('/api/'), 'robots.txt must disallow /api/');
    assert.ok(disallowList.includes('/admin/'), 'robots.txt must disallow /admin/');
    assert.ok(disallowList.includes('/account/'), 'robots.txt must disallow /account/');

    pass('Sitemap includes editorial routes, excludes unverified/missing-slug listings, and robots.txt blocks /api/, /admin/, /account/');
  }

  // ---------------------------------------------------------------------------
  // 5. Missing Admin Routes & Listings Preview / Price Field Verification
  // ---------------------------------------------------------------------------
  {
    const requiredFiles = [
      'app/admin/seo/overview/page.tsx',
      'app/admin/seo/sitemap/page.tsx',
      'app/admin/seo/search-console/page.tsx',
      'app/admin/seo/projects/page.tsx',
      'app/admin/seo/developers/page.tsx',
      'app/admin/seo/locations/page.tsx',
      'app/admin/seo/listings/page.tsx',
    ];
    for (const relPath of requiredFiles) {
      const fullPath = path.join(process.cwd(), relPath);
      assert.ok(fs.existsSync(fullPath), `Expected file ${relPath} to exist`);
    }

    const listingsPageSource = fs.readFileSync(
      path.join(process.cwd(), 'app/admin/seo/listings/page.tsx'),
      'utf8'
    );
    assert.ok(
      listingsPageSource.includes("activeTab === 'RESALE' ? '/buy' : '/rent'"),
      'Listings SEO page must use /buy and /rent canonical route prefixes'
    );
    assert.ok(
      !listingsPageSource.includes('/resale/') && !listingsPageSource.includes('/rental/'),
      'Listings SEO page must not reference non-existent /resale/ or /rental/ public routes'
    );
    assert.ok(
      listingsPageSource.includes('item.askingPrice') && listingsPageSource.includes('item.monthlyRent'),
      'Listings SEO page must read item.askingPrice and item.monthlyRent'
    );

    pass('All 7 SEO admin routes exist and Listings SEO page uses /buy/[slug], /rent/[slug], askingPrice, and monthlyRent');
  }

  // ---------------------------------------------------------------------------
  // 6. Search Console Service & Admin Page SIMULATED / PREVIEW Labelling
  // ---------------------------------------------------------------------------
  {
    const inspectRes = await searchConsoleService.inspectUrl('https://greathomes.co.in/projects');
    assert.strictEqual(inspectRes.simulated, true);
    assert.strictEqual(inspectRes.mode, 'SIMULATED_PREVIEW');
    assert.ok(inspectRes.notice.includes('SIMULATED / PREVIEW MODE'));

    const adminBlockedInspect = await searchConsoleService.inspectUrl(
      'https://greathomes.co.in/admin/seo/overview'
    );
    assert.strictEqual(
      adminBlockedInspect.inspectionResult.indexStatusResult.robotsTxtState,
      'DISALLOWED',
      'Simulated URL inspection must flag /admin/ URLs as DISALLOWED by robots.txt'
    );

    const scPageSource = fs.readFileSync(
      path.join(process.cwd(), 'app/admin/seo/search-console/page.tsx'),
      'utf8'
    );
    assert.ok(
      scPageSource.includes('SIMULATED / PREVIEW MODE'),
      'Search Console admin page must prominently display SIMULATED / PREVIEW MODE'
    );

    pass('Search Console service and admin page explicitly label all outputs as SIMULATED / PREVIEW MODE');
  }

  // ---------------------------------------------------------------------------
  // 7. Admin API Unauthenticated Request Rejection (401/403)
  // ---------------------------------------------------------------------------
  {
    const unauthLocationsReq = new NextRequest('http://localhost:3000/api/admin/locations');
    const locRes = await getAdminLocations(unauthLocationsReq);
    assert.ok(
      locRes.status === 401 || locRes.status === 403,
      `Expected /api/admin/locations to reject unauthenticated request with 401/403, got ${locRes.status}`
    );

    const unauthDevelopersReq = new NextRequest('http://localhost:3000/api/admin/developers');
    const devRes = await getAdminDevelopers(unauthDevelopersReq);
    assert.ok(
      devRes.status === 401 || devRes.status === 403,
      `Expected /api/admin/developers to reject unauthenticated request with 401/403, got ${devRes.status}`
    );

    const unauthScReq = new NextRequest(
      'http://localhost:3000/api/admin/google/search-console/inspect',
      {
        method: 'POST',
        body: JSON.stringify({ targetUrl: 'https://greathomes.co.in/projects' }),
      }
    );
    const scRes = await postSearchConsoleInspect(unauthScReq);
    assert.ok(
      scRes.status === 401 || scRes.status === 403,
      `Expected /api/admin/google/search-console/inspect to reject unauthenticated request with 401/403, got ${scRes.status}`
    );

    pass('Admin SEO & location/developer APIs strictly reject unauthenticated requests with 401/403');
  }

  // ---------------------------------------------------------------------------
  // 8. Public Listing DTO Privacy Boundary Check
  // ---------------------------------------------------------------------------
  {
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
      'crmId',
      'exactFloorNumber',
      'unitNumber',
    ];

    const publicResaleList = await resaleListingService.listPublicListings({});
    for (const item of publicResaleList) {
      for (const field of forbiddenFields) {
        assert.strictEqual(
          (item as any)[field],
          undefined,
          `Public resale DTO leaked forbidden private field: ${field}`
        );
      }
    }

    const publicRentalList = await rentalListingService.listPublicListings({});
    for (const item of publicRentalList) {
      for (const field of forbiddenFields) {
        assert.strictEqual(
          (item as any)[field],
          undefined,
          `Public rental DTO leaked forbidden private field: ${field}`
        );
      }
    }

    pass('Public resale and rental DTOs strip all private owner/broker contact and unit fields');
  }

  // ---------------------------------------------------------------------------
  // 9. Project Resale & Rental SEO Metadata, Count Formatting & 90-Route Sitemap
  // ---------------------------------------------------------------------------
  {
    const {
      formatInventoryTitleCountBucket,
      formatInventoryListingCountPhrase,
      buildProjectInventorySeoMetadata,
      parseProjectResaleSearchParams,
      parseProjectRentalSearchParams,
    } = await import('../src/domain/projects/viewModels/projectInventoryViewModel');

    // Test all required count-formatting boundary values: 0, 1, 9, 10, 19, 20, 29, 30, 99, 100+
    assert.strictEqual(formatInventoryTitleCountBucket(0), null);
    assert.strictEqual(formatInventoryTitleCountBucket(1), null);
    assert.strictEqual(formatInventoryTitleCountBucket(9), null);
    assert.strictEqual(formatInventoryTitleCountBucket(10), '10+');
    assert.strictEqual(formatInventoryTitleCountBucket(19), '10+');
    assert.strictEqual(formatInventoryTitleCountBucket(20), '20+');
    assert.strictEqual(formatInventoryTitleCountBucket(29), '20+');
    assert.strictEqual(formatInventoryTitleCountBucket(30), '30+');
    assert.strictEqual(formatInventoryTitleCountBucket(45), '40+');
    assert.strictEqual(formatInventoryTitleCountBucket(55), '50+');
    assert.strictEqual(formatInventoryTitleCountBucket(65), '60+');
    assert.strictEqual(formatInventoryTitleCountBucket(75), '70+');
    assert.strictEqual(formatInventoryTitleCountBucket(85), '80+');
    assert.strictEqual(formatInventoryTitleCountBucket(99), '90+');
    assert.strictEqual(formatInventoryTitleCountBucket(100), '100+');
    assert.strictEqual(formatInventoryTitleCountBucket(245), '100+');

    // Grammar & verified accuracy checks
    assert.strictEqual(
      formatInventoryListingCountPhrase({
        eligibleCount: 1,
        verifiedCount: 1,
        singularNoun: 'resale apartment',
        pluralNoun: 'resale apartments',
      }),
      '1 verified resale apartment'
    );
    assert.strictEqual(
      formatInventoryListingCountPhrase({
        eligibleCount: 1,
        verifiedCount: 0,
        singularNoun: 'resale apartment',
        pluralNoun: 'resale apartments',
      }),
      '1 resale apartment'
    );
    assert.strictEqual(
      formatInventoryListingCountPhrase({
        eligibleCount: 5,
        verifiedCount: 3,
        singularNoun: 'resale apartment',
        pluralNoun: 'resale apartments',
      }),
      '5 resale apartments'
    );
    assert.strictEqual(
      formatInventoryListingCountPhrase({
        eligibleCount: 34,
        verifiedCount: 34,
        singularNoun: 'resale apartment',
        pluralNoun: 'resale apartments',
      }),
      '30+ verified resale apartments'
    );

    // Canonical URL validation for project inventory routes
    assert.strictEqual(
      validateCanonicalUrl('https://greathomes.co.in/projects/merlin-rise/resale', 'PROJECT', 'merlin-rise').valid,
      true
    );
    assert.strictEqual(
      validateCanonicalUrl('https://greathomes.co.in/projects/merlin-rise/rent', 'PROJECT', 'merlin-rise').valid,
      true
    );

    // Explicit sort param detection
    const cleanParsed = parseProjectResaleSearchParams({});
    assert.strictEqual(cleanParsed.hasActiveFilters, false);
    assert.strictEqual(cleanParsed.hasExplicitSort, false);
    assert.strictEqual(cleanParsed.isParameterizedUrl, false);

    const sortedParsed = parseProjectResaleSearchParams({ sort: 'price_asc' });
    assert.strictEqual(sortedParsed.hasExplicitSort, true);
    assert.strictEqual(sortedParsed.isParameterizedUrl, true);

    const rentalSortedParsed = parseProjectRentalSearchParams({ sort: 'rent_desc' });
    assert.strictEqual(rentalSortedParsed.hasExplicitSort, true);
    assert.strictEqual(rentalSortedParsed.isParameterizedUrl, true);

    // Metadata builder checks with Merlin Rise DTO
    const merlinRise = await projectIntelligenceService.getProjectBySlug('merlin-rise', false);
    assert.ok(merlinRise, 'Expected merlin-rise published project');

    const zeroRentMeta = buildProjectInventorySeoMetadata({
      project: merlinRise!,
      mode: 'RENTAL',
      totalEligibleCount: 0,
      verifiedCount: 0,
      hasActiveFilters: false,
      hasExplicitSort: false,
      page: 1,
    });
    assert.strictEqual(
      zeroRentMeta.title,
      'Apartments for Rent in Merlin Rise, Rajarhat, Kolkata | Great Homes'
    );
    assert.deepStrictEqual(zeroRentMeta.robots, { index: true, follow: true });
    assert.strictEqual(
      (zeroRentMeta.alternates as any)?.canonical,
      'https://greathomes.co.in/projects/merlin-rise/rent'
    );
    assert.ok((zeroRentMeta.openGraph as any)?.images?.length > 0, 'Expected OG image from canonical media');
    assert.strictEqual((zeroRentMeta.twitter as any)?.title, zeroRentMeta.title);

    const thirtyResaleMeta = buildProjectInventorySeoMetadata({
      project: merlinRise!,
      mode: 'RESALE',
      totalEligibleCount: 34,
      verifiedCount: 20,
      hasActiveFilters: false,
      hasExplicitSort: false,
      page: 1,
    });
    assert.strictEqual(
      thirtyResaleMeta.title,
      'Resale Apartments in Merlin Rise, Rajarhat, Kolkata – 30+ Listings | Great Homes'
    );
    assert.ok(
      !String(thirtyResaleMeta.description).includes('verified'),
      'Description must not claim all 30+ listings are verified when verifiedCount < totalEligibleCount'
    );

    const sortedResaleMeta = buildProjectInventorySeoMetadata({
      project: merlinRise!,
      mode: 'RESALE',
      totalEligibleCount: 1,
      verifiedCount: 1,
      hasActiveFilters: false,
      hasExplicitSort: true,
      page: 1,
    });
    assert.deepStrictEqual(sortedResaleMeta.robots, { index: false, follow: true });

    // Sitemap coverage for all published projects
    const allPublished = (await projectIntelligenceService.listAllProjects({}, false)).filter(
      p => Boolean(p.slug && p.slug.trim()) && p.lifecycleStatus === 'PUBLISHED'
    );
    const sitemapEntries = await sitemap();
    const sitemapUrls = new Set(sitemapEntries.map(e => e.url));

    for (const p of allPublished) {
      const slug = p.slug.trim();
      assert.ok(
        sitemapUrls.has(`https://greathomes.co.in/projects/${slug}/resale`),
        `Missing /projects/${slug}/resale in sitemap`
      );
      assert.ok(
        sitemapUrls.has(`https://greathomes.co.in/projects/${slug}/rent`),
        `Missing /projects/${slug}/rent in sitemap`
      );
    }

    // Ensure DRAFT and ARCHIVED project inventory routes are excluded
    assert.ok(!sitemapUrls.has('https://greathomes.co.in/projects/the-balmoral/resale'));
    assert.ok(!sitemapUrls.has('https://greathomes.co.in/projects/harbor-one/rent'));

    pass(
      `Project resale & rental SEO metadata, count buckets (0..100+), sort/filter/page noindex rules, and ${
        allPublished.length * 2
      } published project inventory sitemap routes verified`
    );
  }

  console.log(`\nSUCCESS: All ${passedCount} SEO remediation verification suites passed.`);
}

runTests().catch(err => {
  console.error('\nSEO Remediation Verification Suite FAILED:', err);
  process.exit(1);
});

