/**
 * Phase 3 SEO Technical Hygiene Remediation Test Suite (F-11, F-12, F-13)
 *
 * Verifies:
 *  - F-11: Canonical host normalization, sitemap/robots host consistency, redirect loop freedom
 *  - F-12: SEO title length discipline (<= 65 chars), geographical accuracy (no "West Bengal, Kolkata"),
 *          duplicate locality elimination ("New Alipore Block A, New Alipore"), clean project title phrasing
 *  - F-13: Unified Cloudflare R2 media normalization, clean R2 imageLoader URLs (no cache-busting ?w=&q=),
 *          location OG image first-party discipline, placeholder rejection across sitemap & JSON-LD,
 *          and next.config.mjs legacy/placeholder remotePattern cleanup
 *
 * Strictly memory-only — NEVER touches PostgreSQL or production data.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Metadata } from 'next';

(globalThis as unknown as { React: typeof React }).React = React;
import {
  buildLockedProjectTitle,
  buildPageMetadata,
  DEFAULT_OG_IMAGE,
  formatLocationWithCity,
  normalizeCanonicalUrl,
  normalizePublicSeoImageUrl,
  SITE_ORIGIN,
} from '../src/domain/seo/metadataBuilder';
import {
  formatProjectLocationFullLabel,
  formatProjectLocationShortLabel,
} from '../src/domain/projects/viewModels/projectLocationViewModel';
import { locationSeoService } from '../src/domain/locations/services/locationSeoService';
import {
  classifyMediaOrigin,
  isApprovedFirstPartyMediaUrl,
  normalizeMediaPublicUrl,
  VERIFIED_R2_PUBLIC_BASE_URL,
} from '../src/lib/mediaUtils';
import greatHomesImageLoader from '../src/lib/imageLoader';
import { ProjectStructuredData } from '../src/components/projects/ProjectStructuredData';
import { metadata as homeMetadata } from '../app/page';
import { metadata as locationsHubMetadata } from '../app/locations/page';
import { metadata as developersHubMetadata } from '../app/developers/(directory)/page';
import { metadata as guidesHubMetadata } from '../app/guides/page';
import { metadata as reviewsHubMetadata } from '../app/reviews/page';
import { metadata as postPropertyMetadata } from '../app/post-property/page';
import robots from '../app/robots';
import sitemap from '../app/sitemap';
import { ensureSeedData } from '../src/infrastructure/seed';
import { getDb } from '../src/db/client';

function assertSafeMemoryOnlyEnv(): void {
  if (process.env.PERSISTENCE_PROVIDER === 'postgres') {
    throw new Error('FATAL: Phase 3 SEO tests must never run against PostgreSQL.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: Phase 3 SEO tests must never run with NODE_ENV=production.');
  }
  if (getDb() !== null) {
    throw new Error('FATAL: Active PostgreSQL handle detected; aborting memory-only test run.');
  }
}

function extractTitle(meta: Metadata): string {
  if (!meta.title) return '';
  if (typeof meta.title === 'string') return meta.title;
  if ('absolute' in meta.title && meta.title.absolute) return meta.title.absolute;
  if ('default' in meta.title && meta.title.default) return meta.title.default;
  return '';
}

function countOccurrences(haystack: string, needle: string): number {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (haystack.match(new RegExp(escaped, 'gi')) || []).length;
}

function getOgImages(meta: Metadata): string[] {
  const imgs = meta.openGraph?.images;
  if (!imgs) return [];
  const arr = Array.isArray(imgs) ? imgs : [imgs];
  return arr
    .map((img) => {
      if (typeof img === 'string') return img;
      if (img instanceof URL) return img.toString();
      return img.url instanceof URL ? img.url.toString() : img.url;
    })
    .filter(Boolean);
}

async function testF11CanonicalHostAndRedirectHygiene(): Promise<void> {
  console.log('\n--- Testing F-11: Canonical Host & Redirect Hygiene ---');

  // 1. Canonical URL normalization across apex, http, trailing slash, and query params
  assert.strictEqual(
    normalizeCanonicalUrl('http://greathomes.co.in/', '/'),
    SITE_ORIGIN
  );
  assert.strictEqual(
    normalizeCanonicalUrl('https://greathomes.co.in/projects/merlin-rise/?ref=ad', '/projects/merlin-rise'),
    `${SITE_ORIGIN}/projects/merlin-rise`
  );
  assert.strictEqual(
    normalizeCanonicalUrl('http://www.greathomes.co.in/locations/rajarhat/', '/locations/rajarhat'),
    `${SITE_ORIGIN}/locations/rajarhat`
  );

  // 2. robots.txt canonical host & sitemap URL
  const robotsConfig = robots();
  assert.strictEqual(robotsConfig.host, SITE_ORIGIN);
  assert.strictEqual(robotsConfig.sitemap, `${SITE_ORIGIN}/sitemap.xml`);

  // 3. Sitemap entries strictly use canonical https://www.greathomes.co.in
  await ensureSeedData();
  const entries = await sitemap();
  assert.ok(entries.length > 0, 'Sitemap should emit entries in memory mode');
  for (const entry of entries) {
    assert.ok(
      entry.url.startsWith(SITE_ORIGIN),
      `Sitemap URL must use canonical ${SITE_ORIGIN}, got: ${entry.url}`
    );
    assert.ok(!entry.url.startsWith('http://'), `Sitemap URL must never use HTTP: ${entry.url}`);
    assert.ok(!entry.url.startsWith('https://greathomes.co.in'), `Sitemap URL must never use apex host: ${entry.url}`);
  }

  // 4. Verify next.config.mjs has HSTS enabled and zero self-referencing redirect loops
  const nextConfigSrc = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');
  assert.ok(
    nextConfigSrc.includes('Strict-Transport-Security'),
    'next.config.mjs must preserve Strict-Transport-Security header'
  );
  assert.ok(
    !fs.existsSync(path.join(process.cwd(), 'middleware.ts')) &&
      !fs.existsSync(path.join(process.cwd(), 'src', 'middleware.ts')),
    'No synthetic middleware host-redirect loop should be added'
  );

  console.log('✓ F-11 passed (canonical host normalization, robots/sitemap host consistency & redirect safety verified)');
}

async function testF12TitleLengthAndEntityAccuracy(): Promise<void> {
  console.log('\n--- Testing F-12: SEO Title Length & Entity/Geography Accuracy ---');

  // 1. Geographical accuracy in formatProjectLocationShortLabel / FullLabel
  assert.strictEqual(
    formatProjectLocationShortLabel({
      name: 'West Bengal',
      type: 'STATE',
      path: [{ name: 'West Bengal', type: 'STATE' }],
    }),
    'West Bengal',
    'STATE location must never append ", Kolkata"'
  );
  assert.strictEqual(
    formatProjectLocationShortLabel({
      name: 'Hooghly',
      type: 'DISTRICT',
      path: [
        { name: 'West Bengal', type: 'STATE' },
        { name: 'Hooghly', type: 'DISTRICT' },
      ],
    }),
    'Hooghly',
    'DISTRICT location must never append ", Kolkata"'
  );
  assert.strictEqual(
    formatProjectLocationShortLabel({
      name: 'Howrah',
      type: 'CITY',
      path: [
        { name: 'West Bengal', type: 'STATE' },
        { name: 'Howrah', type: 'CITY' },
      ],
    }),
    'Howrah',
    'Non-Kolkata CITY must never append ", Kolkata"'
  );
  assert.strictEqual(
    formatProjectLocationShortLabel({
      name: 'Uttarpara',
      type: 'AREA',
      path: [
        { name: 'West Bengal', type: 'STATE' },
        { name: 'Hooghly', type: 'DISTRICT' },
        { name: 'Uttarpara', type: 'AREA' },
      ],
    }),
    'Uttarpara, Hooghly',
    'Sub-location under Hooghly district must pair with Hooghly, not Kolkata'
  );
  assert.strictEqual(
    formatProjectLocationShortLabel({
      name: 'Rajarhat',
      type: 'AREA',
      path: [
        { name: 'West Bengal', type: 'STATE' },
        { name: 'Kolkata', type: 'CITY' },
        { name: 'Rajarhat', type: 'AREA' },
      ],
    }),
    'Rajarhat, Kolkata'
  );
  assert.strictEqual(
    formatProjectLocationFullLabel({ name: 'West Bengal', type: 'STATE' }),
    'West Bengal'
  );
  assert.strictEqual(
    formatProjectLocationFullLabel({ name: 'Hooghly', type: 'DISTRICT' }),
    'Hooghly, West Bengal'
  );
  assert.strictEqual(formatLocationWithCity('West Bengal', 'Kolkata'), 'West Bengal');
  assert.strictEqual(formatLocationWithCity('Hooghly', 'Kolkata'), 'Hooghly');
  assert.strictEqual(formatLocationWithCity('Howrah', 'Kolkata'), 'Howrah');
  assert.strictEqual(formatLocationWithCity('Uttarpara, Hooghly', 'Kolkata'), 'Uttarpara, Hooghly');

  // 2. Project titles: concise length (<= 62 auto, <= 65 override), no double ampersand, no "West Bengal, Kolkata"
  const dtcGoodEarth = buildLockedProjectTitle({
    name: 'DTC Good Earth',
    locationName: formatProjectLocationShortLabel({ name: 'West Bengal', type: 'STATE' }),
    configurations: [{ bedroomCount: 2 }, { bedroomCount: 3 }],
    hasPricing: true,
    hasFloorPlans: true,
  });
  assert.ok(dtcGoodEarth.length <= 62, `DTC Good Earth title too long (${dtcGoodEarth.length}): "${dtcGoodEarth}"`);
  assert.ok(!dtcGoodEarth.includes('West Bengal, Kolkata'), `Must not emit "West Bengal, Kolkata": "${dtcGoodEarth}"`);
  assert.ok(!dtcGoodEarth.includes('& 3 BHK & Price'), `Must not emit double ampersand: "${dtcGoodEarth}"`);
  assert.ok(dtcGoodEarth.endsWith(' | Great Homes'));
  assert.strictEqual(countOccurrences(dtcGoodEarth, 'Great Homes'), 1);

  const staleWbKolkata = buildLockedProjectTitle({
    name: 'Srijan Spacia',
    locationName: 'West Bengal, Kolkata',
    configurations: [{ bedroomCount: 3 }, { bedroomCount: 4 }],
  });
  assert.ok(!staleWbKolkata.includes('West Bengal, Kolkata'), `Must sanitize stale "West Bengal, Kolkata": "${staleWbKolkata}"`);
  assert.ok(staleWbKolkata.length <= 62, `Srijan Spacia title too long (${staleWbKolkata.length}): "${staleWbKolkata}"`);

  const merlinRise = buildLockedProjectTitle({
    name: 'Merlin Rise',
    locationName: 'Rajarhat, Kolkata',
    configurations: [{ bedroomCount: 2 }, { bedroomCount: 3 }],
    hasPricing: true,
    hasFloorPlans: true,
  });
  assert.ok(merlinRise.length <= 62, `Merlin Rise title too long (${merlinRise.length}): "${merlinRise}"`);
  assert.ok(!merlinRise.includes('& 3 BHK & Price'), `Must avoid awkward double ampersand: "${merlinRise}"`);
  assert.ok(merlinRise.includes('Merlin Rise') && merlinRise.includes('Rajarhat'));
  assert.strictEqual(countOccurrences(merlinRise, 'Great Homes'), 1);

  const merlinImperiaOverride = buildLockedProjectTitle({
    name: 'Merlin Imperia',
    locationName: 'Uttarpara, Hooghly',
    overrideTitle: 'Merlin Imperia Uttarpara, Hooghly | Price List & Brochure',
  });
  assert.ok(
    merlinImperiaOverride.length <= 65,
    `Override title too long (${merlinImperiaOverride.length}): "${merlinImperiaOverride}"`
  );
  assert.ok(merlinImperiaOverride.endsWith(' | Great Homes'));
  assert.ok(!/&\s*\|\s*Great Homes/.test(merlinImperiaOverride), `Override left dangling &: "${merlinImperiaOverride}"`);

  // 3. Location titles: concise length, zero duplicate locality names, geographically accurate non-Kolkata context
  const wbLoc = { id: 'wb', name: 'West Bengal', slug: 'west-bengal', type: 'STATE' as const, status: 'PUBLISHED' as const };
  const kolLoc = { id: 'kol', name: 'Kolkata', slug: 'kolkata', type: 'CITY' as const, status: 'PUBLISHED' as const };
  const hooghlyLoc = { id: 'hoo', name: 'Hooghly', slug: 'hooghly', type: 'DISTRICT' as const, status: 'PUBLISHED' as const };
  const newAliporeLoc = { id: 'na', name: 'New Alipore', slug: 'new-alipore', type: 'AREA' as const, status: 'PUBLISHED' as const };
  const newAliporeBlockA = { id: 'naba', name: 'New Alipore Block A', slug: 'new-alipore-block-a', type: 'NEIGHBOURHOOD' as const, status: 'PUBLISHED' as const };
  const tollygungeLoc = { id: 'tol', name: 'Tollygunge', slug: 'tollygunge', type: 'AREA' as const, status: 'PUBLISHED' as const };
  const tollygungeMetro = { id: 'tolm', name: 'Tollygunge Metro', slug: 'tollygunge-metro', type: 'NEIGHBOURHOOD' as const, status: 'PUBLISHED' as const };
  const newTownLoc = { id: 'nt', name: 'New Town', slug: 'new-town', type: 'AREA' as const, status: 'PUBLISHED' as const };
  const actionArea2 = { id: 'aa2', name: 'Action Area II', slug: 'action-area-2', type: 'NEIGHBOURHOOD' as const, status: 'PUBLISHED' as const };
  const konnagarLoc = { id: 'kon', name: 'Konnagar', slug: 'konnagar', type: 'AREA' as const, status: 'PUBLISHED' as const };

  const locationCases = [
    { loc: wbLoc, path: [wbLoc], forbid: ['Kolkata'] },
    { loc: kolLoc, path: [wbLoc, kolLoc], forbid: ['Kolkata, Kolkata'] },
    { loc: hooghlyLoc, path: [wbLoc, hooghlyLoc], forbid: ['Kolkata'] },
    { loc: konnagarLoc, path: [wbLoc, hooghlyLoc, konnagarLoc], forbid: ['Kolkata'], mustInclude: 'Hooghly' },
    { loc: newAliporeBlockA, path: [wbLoc, kolLoc, newAliporeLoc, newAliporeBlockA], maxDupes: 'New Alipore' },
    { loc: tollygungeMetro, path: [wbLoc, kolLoc, tollygungeLoc, tollygungeMetro], maxDupes: 'Tollygunge' },
    { loc: actionArea2, path: [wbLoc, kolLoc, newTownLoc, actionArea2], mustInclude: 'New Town' },
    { loc: newTownLoc, path: [wbLoc, kolLoc, newTownLoc] },
    { loc: { id: 'rj', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA' as const, status: 'PUBLISHED' as const }, path: [wbLoc, kolLoc] },
    { loc: { id: 'sl', name: 'Salt Lake', slug: 'salt-lake', type: 'AREA' as const, status: 'PUBLISHED' as const }, path: [wbLoc, kolLoc] },
    { loc: { id: 'bg', name: 'Ballygunge', slug: 'ballygunge', type: 'AREA' as const, status: 'PUBLISHED' as const }, path: [wbLoc, kolLoc] },
  ];

  for (const c of locationCases) {
    const res = locationSeoService.evaluateEligibility({
      location: c.loc as any,
      path: c.path as any,
      projects: [{ id: 'p1', lifecycleStatus: 'PUBLISHED' }],
    });
    assert.ok(
      res.title.length <= 62,
      `Location /locations/${c.loc.slug} title too long (${res.title.length}): "${res.title}"`
    );
    assert.ok(res.title.endsWith(' | Great Homes'), `Location title missing brand suffix: "${res.title}"`);
    assert.strictEqual(countOccurrences(res.title, 'Great Homes'), 1);
    for (const forbidden of c.forbid || []) {
      assert.ok(
        !res.title.includes(forbidden),
        `Location /locations/${c.loc.slug} title must not include "${forbidden}": "${res.title}"`
      );
    }
    if (c.mustInclude) {
      assert.ok(
        res.title.includes(c.mustInclude),
        `Location /locations/${c.loc.slug} title must include "${c.mustInclude}": "${res.title}"`
      );
    }
    if (c.maxDupes) {
      assert.strictEqual(
        countOccurrences(res.title, c.maxDupes),
        1,
        `Location /locations/${c.loc.slug} duplicated "${c.maxDupes}": "${res.title}"`
      );
    }
  }

  // 4. Static hub pages all <= 65 chars & single brand
  const staticHubs: Array<[string, Metadata]> = [
    ['/', homeMetadata],
    ['/locations', locationsHubMetadata],
    ['/developers', developersHubMetadata],
    ['/guides', guidesHubMetadata],
    ['/reviews', reviewsHubMetadata],
    ['/post-property', postPropertyMetadata],
  ];
  for (const [route, meta] of staticHubs) {
    const title = extractTitle(meta);
    assert.ok(title.length >= 25 && title.length <= 65, `Hub ${route} title out of range (${title.length}): "${title}"`);
    assert.strictEqual(countOccurrences(title, 'Great Homes'), 1, `Hub ${route} must include Great Homes exactly once: "${title}"`);
  }

  // 5. Long editorial seoTitle via buildPageMetadata is cleanly clamped <= 65 chars without dangling tails
  const longGuideMeta = buildPageMetadata({
    title: 'Kolkata Residential Pricing & Configuration Structure Guide for First-Time Homebuyers',
    description: 'Comprehensive factual guide to residential pricing structures and BHK configurations across Kolkata.',
    canonicalPath: '/guides/kolkata-residential-pricing-configuration-guide',
    ogType: 'article',
  });
  const guideTitle = extractTitle(longGuideMeta);
  assert.ok(guideTitle.length <= 65, `Guide title too long (${guideTitle.length}): "${guideTitle}"`);
  assert.ok(guideTitle.endsWith(' | Great Homes'));
  assert.ok(!/\b(for|and|&|with|in|of)\s*\|\s*Great Homes$/i.test(guideTitle), `Guide title ended on dangling word: "${guideTitle}"`);

  console.log('✓ F-12 passed (project, location, hub & editorial titles concise, deduplicated & geographically accurate)');
}

async function testF13MediaOriginHygiene(): Promise<void> {
  console.log('\n--- Testing F-13: Media Origin Normalization & Hygiene ---');

  const sampleKey = 'media/project/abc/def/public_wm.webp';
  const expectedR2Url = `${VERIFIED_R2_PUBLIC_BASE_URL}/${sampleKey}`;

  // 1. Unified Cloudflare R2 origin normalization (including case-insensitive, protocol-relative, S3 API, bare/leading-slash keys)
  assert.strictEqual(normalizeMediaPublicUrl(`https://media.greathomes.co.in/${sampleKey}`), expectedR2Url);
  assert.strictEqual(normalizeMediaPublicUrl(`http://media.greathomes.co.in/${sampleKey}`), expectedR2Url);
  assert.strictEqual(normalizeMediaPublicUrl(`HTTPS://MEDIA.GREATHOMES.CO.IN/${sampleKey}`), expectedR2Url);
  assert.strictEqual(normalizeMediaPublicUrl(`//media.greathomes.co.in/${sampleKey}`), expectedR2Url);
  assert.strictEqual(normalizeMediaPublicUrl(`//pub-8e680bcad96e4b29adac1756755a344b.r2.dev/${sampleKey}`), expectedR2Url);
  assert.strictEqual(
    normalizeMediaPublicUrl(`https://acc123.r2.cloudflarestorage.com/greathomes-media/${sampleKey}`),
    expectedR2Url
  );
  assert.strictEqual(normalizeMediaPublicUrl(sampleKey), expectedR2Url);
  assert.strictEqual(normalizeMediaPublicUrl(`/${sampleKey}`), expectedR2Url);

  // Apex / HTTP first-party site assets canonicalize to https://www.greathomes.co.in
  assert.strictEqual(
    normalizeMediaPublicUrl('http://greathomes.co.in/og-image.png'),
    'https://www.greathomes.co.in/og-image.png'
  );
  assert.strictEqual(
    normalizeMediaPublicUrl('https://greathomes.co.in/icon.png'),
    'https://www.greathomes.co.in/icon.png'
  );

  // 2. Origin classification helpers
  assert.strictEqual(classifyMediaOrigin(expectedR2Url), 'VERIFIED_R2');
  assert.strictEqual(classifyMediaOrigin(DEFAULT_OG_IMAGE), 'FIRST_PARTY_SITE');
  assert.strictEqual(classifyMediaOrigin('https://images.unsplash.com/photo-123'), 'EXTERNAL_STOCK');
  assert.strictEqual(classifyMediaOrigin('https://picsum.photos/seed/a/800/600'), 'PLACEHOLDER');
  assert.strictEqual(classifyMediaOrigin('https://www.propvestors.in/img/a.jpg'), 'LEGACY_EXTERNAL');
  assert.strictEqual(isApprovedFirstPartyMediaUrl(expectedR2Url), true);
  assert.strictEqual(isApprovedFirstPartyMediaUrl(DEFAULT_OG_IMAGE), true);
  assert.strictEqual(isApprovedFirstPartyMediaUrl('https://images.unsplash.com/photo-123'), false);
  assert.strictEqual(isApprovedFirstPartyMediaUrl('https://picsum.photos/seed/a/800/600'), false);

  // 3. greatHomesImageLoader preserves clean canonical R2 & local URLs (no cache-fragmenting ?w=&q=) while optimizing Unsplash
  assert.strictEqual(
    greatHomesImageLoader({ src: expectedR2Url, width: 828, quality: 75 }),
    expectedR2Url,
    'R2 static URLs must not receive cache-fragmenting ?w=&q= query params'
  );
  assert.strictEqual(
    greatHomesImageLoader({ src: `https://media.greathomes.co.in/${sampleKey}`, width: 640, quality: 80 }),
    expectedR2Url,
    'Unverified custom media domain must normalize cleanly to verified R2 URL without query params'
  );
  assert.strictEqual(
    greatHomesImageLoader({ src: '/assets/aistudio/hero.webp', width: 640, quality: 75 }),
    '/assets/aistudio/hero.webp'
  );
  const unsplashLoaded = greatHomesImageLoader({
    src: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00',
    width: 800,
    quality: 75,
  });
  assert.ok(unsplashLoaded.includes('w=800') && unsplashLoaded.includes('q=75') && unsplashLoaded.includes('auto=format'));

  // 4. normalizePublicSeoImageUrl rejects placeholders & preserves verified R2
  assert.strictEqual(normalizePublicSeoImageUrl('https://picsum.photos/seed/test/1200/630'), null);
  assert.strictEqual(normalizePublicSeoImageUrl('https://via.placeholder.com/1200x630'), null);
  assert.strictEqual(normalizePublicSeoImageUrl(expectedR2Url), expectedR2Url);

  // 5. Location SEO metadata defaults OG/Twitter image to first-party DEFAULT_OG_IMAGE (not Unsplash),
  //    and accepts verified R2 preferredImageUrl while rejecting Unsplash/placeholder overrides
  const rajarhatDefault = locationSeoService.evaluateEligibility({
    location: { id: 'rj', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA', status: 'PUBLISHED' } as any,
    projects: [{ id: 'p1', lifecycleStatus: 'PUBLISHED' }],
  });
  assert.strictEqual(rajarhatDefault.imageUrl, DEFAULT_OG_IMAGE);
  const rajarhatMeta = locationSeoService.buildMetadata(rajarhatDefault);
  assert.deepStrictEqual(getOgImages(rajarhatMeta), [DEFAULT_OG_IMAGE]);

  const rajarhatWithR2 = locationSeoService.evaluateEligibility({
    location: { id: 'rj', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA', status: 'PUBLISHED' } as any,
    projects: [{ id: 'p1', lifecycleStatus: 'PUBLISHED' }],
    preferredImageUrl: `https://media.greathomes.co.in/${sampleKey}`,
  });
  assert.strictEqual(rajarhatWithR2.imageUrl, expectedR2Url);

  const rajarhatWithUnsplash = locationSeoService.evaluateEligibility({
    location: { id: 'rj', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA', status: 'PUBLISHED' } as any,
    projects: [{ id: 'p1', lifecycleStatus: 'PUBLISHED' }],
    preferredImageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00',
  });
  assert.strictEqual(rajarhatWithUnsplash.imageUrl, DEFAULT_OG_IMAGE);

  // 6. ProjectStructuredData filters out placeholder hosts and normalizes R2 URLs
  const projectHtml = renderToStaticMarkup(
    React.createElement(ProjectStructuredData, {
      project: {
        id: 'proj-1',
        name: 'Merlin Rise',
        slug: 'merlin-rise',
        propertyType: 'APARTMENT',
        shortDescription: 'Verified residential township in Rajarhat, Kolkata.',
        description: 'Verified residential township in Rajarhat, Kolkata.',
        pricing: { priceOnRequest: false, startingPrice: 5500000, maximumPrice: 9500000 },
        configurations: [{ bedroomCount: 2, priceOnRequest: false, price: 5500000 }],
        location: { id: 'rj', name: 'Rajarhat', slug: 'rajarhat', latitude: 22.62, longitude: 88.46, path: [] },
        developer: { id: 'dev-1', name: 'Merlin Group', slug: 'merlin-group' },
        amenities: [],
        faqs: [],
        media: [
          { id: 'm1', url: 'https://picsum.photos/seed/bad/800/600', isFeatured: true },
          { id: 'm2', url: `https://media.greathomes.co.in/${sampleKey}`, isFeatured: false },
        ],
      } as any,
    })
  );
  assert.ok(!projectHtml.includes('picsum.photos'), 'ProjectStructuredData must exclude placeholder image hosts');
  assert.ok(projectHtml.includes(expectedR2Url), 'ProjectStructuredData must emit normalized verified R2 URL');

  // 7. next.config.mjs removed banned/legacy remotePatterns (picsum.photos, propvestors.in)
  const nextConfigSrc = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8');
  assert.ok(!nextConfigSrc.includes('picsum.photos'), 'next.config.mjs must not allowlist picsum.photos');
  assert.ok(!nextConfigSrc.includes('propvestors.in'), 'next.config.mjs must not allowlist legacy propvestors.in');

  console.log('✓ F-13 passed (unified R2 normalization, clean imageLoader, first-party location OG & legacy host cleanup)');
}

async function main(): Promise<void> {
  assertSafeMemoryOnlyEnv();
  await testF11CanonicalHostAndRedirectHygiene();
  await testF12TitleLengthAndEntityAccuracy();
  await testF13MediaOriginHygiene();
  console.log('\nALL PHASE 3 SEO TECHNICAL HYGIENE TESTS PASSED (3/3).');
}

main().catch((err) => {
  console.error('\nPHASE 3 SEO TECHNICAL HYGIENE TEST FAILED:', err);
  process.exit(1);
});
