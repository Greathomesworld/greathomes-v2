/**
 * Phase 1 SEO Remediation Regression Test Suite (F-04, F-05, F-06, F-07, F-08)
 *
 * Verifies:
 *  - F-04: Developer page indexing governance (rules, robots metadata, sitemap consistency)
 *  - F-05: Meta description quality (zero mid-word cuts, zero dangling connectors/prepositions/brand stubs)
 *  - F-06: Removal of placeholder picsum.photos editorial images across OG, Twitter, Article JSON-LD, and DTOs
 *  - F-07: Guides directory & editorial internal links route PROJECT_REVIEW directly to /reviews/[slug]
 *  - F-08: /post-property server-rendered H1 outside Suspense without breaking interactive controls
 *
 * Strictly memory-only — NEVER touches PostgreSQL or production data.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Metadata } from 'next';
import {
  buildPageMetadata,
  buildProjectMetaDescription,
  clampAtWordBoundary,
  DEFAULT_OG_IMAGE,
  isPlaceholderImageUrl,
  resolveEditorialSeoImage,
  sanitizeMetaDescription,
  SITE_ORIGIN,
} from '../src/domain/seo/metadataBuilder';
import {
  evaluateDeveloperSeoEligibility,
  hasSubstantialDeveloperEditorialContent,
} from '../src/domain/developers/services/developerSeoService';
import { locationSeoService } from '../src/domain/locations/services/locationSeoService';
import { metadata as locationsHubMetadata } from '../app/locations/page';
import { metadata as developersHubMetadata } from '../app/developers/(directory)/page';
import { metadata as guidesHubMetadata } from '../app/guides/page';
import { metadata as reviewsHubMetadata } from '../app/reviews/page';
import { metadata as postPropertyMetadata } from '../app/post-property/page';
import { generateMetadata as generateDeveloperMetadata } from '../app/developers/[slug]/page';
import { generateMetadata as generateGuideMetadata } from '../app/guides/[slug]/page';
import { generateMetadata as generateReviewMetadata } from '../app/reviews/[slug]/page';
import { GuidesDirectoryView } from '../src/components/editorial/GuidesDirectoryView';
import { ArticleDetailView } from '../src/components/editorial/ArticleDetailView';
import { ReviewDetailView } from '../src/components/editorial/ReviewDetailView';
import { HomeIntelligenceGuides } from '../src/components/home/HomeIntelligenceGuides';
import type { PublicEditorialArticleDTO } from '../src/domain/editorial/entities';
import { ensureSeedData } from '../src/infrastructure/seed';
import { getDb } from '../src/db/client';
import { developerRepository } from '../src/infrastructure/repositories/developerProvider';
import { editorialRepositoryPostgres } from '../src/domain/editorial/repositories/editorialRepositoryPostgres';
import { editorialService } from '../src/domain/editorial/services/editorialService';
import sitemap from '../app/sitemap';

function assertSafeMemoryOnlyEnv(): void {
  if (process.env.PERSISTENCE_PROVIDER === 'postgres') {
    throw new Error('FATAL: Phase 1 SEO tests must never run against PostgreSQL.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: Phase 1 SEO tests must never run with NODE_ENV=production.');
  }
  if (getDb() !== null) {
    throw new Error('FATAL: Active PostgreSQL handle detected; aborting memory-only test run.');
  }
}

function getRobots(meta: Metadata): { index?: boolean; follow?: boolean } {
  if (!meta.robots || typeof meta.robots === 'string') return {};
  return { index: meta.robots.index, follow: meta.robots.follow };
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

function getTwitterImages(meta: Metadata): string[] {
  const imgs = meta.twitter?.images;
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

const FORBIDDEN_TRAILING_WORDS = new Set([
  '&',
  'and',
  'or',
  'with',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'from',
  'by',
  'across',
  'the',
  'a',
  'an',
  'great',
]);

function assertCleanMetaDescription(desc: string, label: string): void {
  assert.ok(desc && desc.trim().length >= 50, `[${label}] Description too short: "${desc}"`);
  assert.ok(desc.length <= 160, `[${label}] Description exceeds 160 chars (${desc.length}): "${desc}"`);
  assert.ok(!/[,;:\-\/&+]$/.test(desc.trim()), `[${label}] Ends with awkward punctuation: "${desc}"`);
  assert.ok(!/…$/.test(desc.trim()), `[${label}] Ends with mid-clause ellipsis: "${desc}"`);

  const withoutPunct = desc.trim().replace(/[.!?]+$/, '').trim();
  const lastWord = withoutPunct.split(/\s+/).pop()?.toLowerCase() || '';
  assert.ok(
    !FORBIDDEN_TRAILING_WORDS.has(lastWord),
    `[${label}] Ends with dangling trailing word "${lastWord}": "${desc}"`
  );
}

async function testF04DeveloperSeoGovernance(): Promise<void> {
  console.log('\n--- Testing F-04: Developer Indexing Governance ---');

  // 1. Published developer with published projects -> indexable
  const withProjects = evaluateDeveloperSeoEligibility({
    developer: {
      slug: 'merlin-group',
      status: 'PUBLISHED',
      shortDescription: 'Multi-city developer.',
      description: 'Short blurb.',
      projectCount: 4,
    },
    projects: [{ lifecycleStatus: 'PUBLISHED', isPublished: true }],
  });
  assert.strictEqual(withProjects.eligible, true);
  assert.strictEqual(withProjects.index, true);
  assert.strictEqual(withProjects.follow, true);
  assert.strictEqual(withProjects.reason, 'SUFFICIENT_PROJECT_DEPTH');

  // 2a. Zero-project developer with substantial multi-sentence editorial profile -> indexable
  const substantialNarrative =
    'Ambuja Neotia has developed landmark residential, hospitality, and mixed-use destinations across Kolkata and Eastern India for over three decades. ' +
    'Its portfolio spans planned townships, urban residential communities, and commercial hubs built with long-term architectural stewardship. ' +
    'Homebuyers evaluating legacy developments across New Town, Salt Lake, and South Kolkata frequently review the group delivery track record, RERA compliance, and community maintenance standards.';
  const zeroProjectsRichBio = evaluateDeveloperSeoEligibility({
    developer: {
      slug: 'ambuja-neotia-editorial',
      status: 'PUBLISHED',
      shortDescription: 'Kolkata developer with multi-decade heritage.',
      description: substantialNarrative,
      projectCount: 0,
    },
    projects: [],
    publishedEditorialCount: 0,
  });
  assert.strictEqual(hasSubstantialDeveloperEditorialContent({ description: substantialNarrative }, 0), true);
  assert.strictEqual(zeroProjectsRichBio.eligible, true);
  assert.strictEqual(zeroProjectsRichBio.index, true);
  assert.strictEqual(zeroProjectsRichBio.follow, true);
  assert.strictEqual(zeroProjectsRichBio.reason, 'SUFFICIENT_EDITORIAL_DEPTH');

  // 2b. Zero-project developer with linked published editorial story -> indexable
  const zeroProjectsEditorialStory = evaluateDeveloperSeoEligibility({
    developer: {
      slug: 'story-backed-developer',
      status: 'PUBLISHED',
      shortDescription: 'Short summary.',
      description: 'Brief note.',
      projectCount: 0,
    },
    projects: [],
    publishedEditorialCount: 1,
  });
  assert.strictEqual(zeroProjectsEditorialStory.eligible, true);
  assert.strictEqual(zeroProjectsEditorialStory.index, true);
  assert.strictEqual(zeroProjectsEditorialStory.follow, true);
  assert.strictEqual(zeroProjectsEditorialStory.reason, 'SUFFICIENT_EDITORIAL_DEPTH');

  // 3. Zero-project developer with thin 1-2 sentence imported directory blurb -> noindex, follow
  const thinImportedDev = evaluateDeveloperSeoEligibility({
    developer: {
      slug: 'dlf',
      status: 'PUBLISHED',
      shortDescription: "India's premier national real estate developer with landmark residential and commercial projects.",
      description:
        'DLF is a leading real estate developer in India with residential, office, and retail developments across major cities including Kolkata.',
      projectCount: 0,
    },
    projects: [],
    publishedEditorialCount: 0,
  });
  assert.strictEqual(thinImportedDev.eligible, false);
  assert.strictEqual(thinImportedDev.index, false);
  assert.strictEqual(thinImportedDev.follow, true);
  assert.strictEqual(thinImportedDev.reason, 'THIN_ZERO_PROJECT_PROFILE');

  // 4. Developer with ONLY unpublished / DRAFT / ARCHIVED projects -> treated as 0 published projects -> noindex, follow
  const unpublishedOnlyProjects = evaluateDeveloperSeoEligibility({
    developer: {
      slug: 'draft-projects-only-dev',
      status: 'PUBLISHED',
      shortDescription: 'Kolkata residential developer.',
      description: 'Developing apartments in North Kolkata.',
      projectCount: 2,
    },
    projects: [
      { lifecycleStatus: 'DRAFT', isPublished: false },
      { lifecycleStatus: 'ARCHIVED', isPublished: false },
    ],
    publishedEditorialCount: 0,
  });
  assert.strictEqual(unpublishedOnlyProjects.publishedProjectCount, 0);
  assert.strictEqual(unpublishedOnlyProjects.eligible, false);
  assert.strictEqual(unpublishedOnlyProjects.index, false);
  assert.strictEqual(unpublishedOnlyProjects.follow, true);

  // 5. Developer with no usable content -> noindex, follow
  const emptyContentDev = evaluateDeveloperSeoEligibility({
    developer: {
      slug: 'empty-dev-profile',
      status: 'PUBLISHED',
      shortDescription: '',
      description: '',
      projectCount: 0,
    },
    projects: [],
    publishedEditorialCount: 0,
  });
  assert.strictEqual(emptyContentDev.eligible, false);
  assert.strictEqual(emptyContentDev.index, false);
  assert.strictEqual(emptyContentDev.follow, true);

  // 6. DRAFT / ARCHIVED / test developer -> noindex, nofollow
  const draftDev = evaluateDeveloperSeoEligibility({
    developer: { slug: 'draft-builder', status: 'DRAFT', projectCount: 3 },
  });
  assert.strictEqual(draftDev.eligible, false);
  assert.strictEqual(draftDev.index, false);
  assert.strictEqual(draftDev.follow, false);

  const testDev = evaluateDeveloperSeoEligibility({
    developer: { slug: 'neon-dev-1792051107022', status: 'PUBLISHED', projectCount: 5 },
  });
  assert.strictEqual(testDev.eligible, false);
  assert.strictEqual(testDev.index, false);
  assert.strictEqual(testDev.follow, false);

  // 7. End-to-end consistency between /developers/[slug] metadata and /sitemap.xml in memory store
  await ensureSeedData();
  const createdThinDev = await developerRepository.create({
    name: 'Phase1 Thin Zero Project Builder',
    slug: 'phase1-thin-zero-project-builder',
    shortDescription: 'Regional builder with residential developments in Kolkata.',
    description: 'Regional builder with residential and commercial interest across Kolkata.',
    websiteUrl: null,
    status: 'PUBLISHED',
    featured: false,
  });

  const createdRichDev = await developerRepository.create({
    name: 'Phase1 Editorial Rich Zero Project Builder',
    slug: 'phase1-editorial-rich-builder',
    shortDescription: 'Established Kolkata developer profile.',
    description: substantialNarrative,
    websiteUrl: null,
    status: 'PUBLISHED',
    featured: false,
  });

  const thinMeta = await generateDeveloperMetadata({
    params: Promise.resolve({ slug: createdThinDev.slug }),
  });
  const thinRobots = getRobots(thinMeta);
  assert.strictEqual(thinRobots.index, false, 'Thin zero-project developer must emit index: false');
  assert.strictEqual(thinRobots.follow, true, 'Thin zero-project developer must emit follow: true');

  const richMeta = await generateDeveloperMetadata({
    params: Promise.resolve({ slug: createdRichDev.slug }),
  });
  const richRobots = getRobots(richMeta);
  assert.strictEqual(richRobots.index, true, 'Editorial-rich zero-project developer must remain index: true');
  assert.strictEqual(richRobots.follow, true);

  const sitemapEntries = await sitemap();
  const sitemapUrls = new Set(sitemapEntries.map((e) => e.url));
  assert.ok(
    !sitemapUrls.has(`${SITE_ORIGIN}/developers/${createdThinDev.slug}`),
    'Thin zero-project developer MUST be excluded from sitemap.xml'
  );
  assert.ok(
    sitemapUrls.has(`${SITE_ORIGIN}/developers/${createdRichDev.slug}`),
    'Editorial-rich zero-project developer MUST be included in sitemap.xml'
  );

  console.log('✓ F-04 passed (all 7 developer governance & sitemap consistency assertions)');
}

async function testF05MetaDescriptions(): Promise<void> {
  console.log('\n--- Testing F-05: Meta Description Quality ---');

  // 1. Static hubs that previously truncated to "...with Great" / "...on Great"
  assertCleanMetaDescription(String(locationsHubMetadata.description || ''), '/locations hub');
  assertCleanMetaDescription(String(developersHubMetadata.description || ''), '/developers hub');
  assertCleanMetaDescription(String(guidesHubMetadata.description || ''), '/guides hub');
  assertCleanMetaDescription(String(reviewsHubMetadata.description || ''), '/reviews hub');
  assertCleanMetaDescription(String(postPropertyMetadata.description || ''), '/post-property hub');

  // 2. Curated & dynamic location descriptions (previously ended on "...with", "...connectivity in")
  const locationFixtures = [
    { id: 'loc-nt', name: 'New Town', slug: 'new-town', type: 'AREA' as const, status: 'PUBLISHED' as const },
    { id: 'loc-sl', name: 'Salt Lake', slug: 'salt-lake', type: 'AREA' as const, status: 'PUBLISHED' as const },
    { id: 'loc-rj', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA' as const, status: 'PUBLISHED' as const },
    {
      id: 'loc-aa1',
      name: 'Action Area 1B Extension',
      slug: 'action-area-1b-extension',
      type: 'NEIGHBOURHOOD' as const,
      status: 'PUBLISHED' as const,
    },
  ];
  for (const loc of locationFixtures) {
    const eligibility = locationSeoService.evaluateEligibility({
      location: loc as any,
      projects: [{ id: 'p-1', lifecycleStatus: 'PUBLISHED' }],
    });
    assertCleanMetaDescription(eligibility.description, `/locations/${loc.slug}`);
  }

  // 3. Project meta description with long name, developer, BHKs, price, and RERA (previously clipped to "...possession timeline &")
  const projectDesc = buildProjectMetaDescription({
    name: 'Merlin Rise – The Sports Republic Residences',
    locationName: 'Rajarhat',
    cityName: 'Kolkata',
    developerName: 'Merlin Group',
    configurations: [{ bedroomCount: 2 }, { bedroomCount: 3 }, { bedroomCount: 4 }],
    startingPriceFormatted: '₹62 Lakh',
    hasVerifiedRera: true,
  });
  assertCleanMetaDescription(projectDesc, 'Project detail (long fields)');
  assert.ok(projectDesc.includes('Merlin Rise'), 'Project description must retain project name');

  // 4. Synthetic boundary tests reproducing exact previously failing raw inputs
  const rawTruncCases = [
    'Explore Kolkata residential areas, neighbourhoods and localities. Discover New Town, Rajarhat, Salt Lake, Ballygunge and property opportunities with Great Homes.',
    "Explore Kolkata's leading real estate developers and builders. Compare active residential projects, WBRERA credentials, and location footprints on Great Homes.",
    'Explore Merlin Rise in Rajarhat, Kolkata offering 2 & 3 BHK homes starting from ₹55 Lakh. Check floor plans, amenities, possession timeline & pricing on Great Homes.',
    'Well-connected planned residential micro-market. Explore residential projects, resale homes, rental listings and connectivity in Action Area III, New Town, Kolkata with Great Homes.',
  ];
  for (let i = 0; i < rawTruncCases.length; i++) {
    const cleaned = sanitizeMetaDescription(rawTruncCases[i], undefined, { maxLength: 158 });
    assertCleanMetaDescription(cleaned, `Raw sanitize case #${i + 1}`);
  }

  // 5. Direct clampAtWordBoundary check against mid-word and dangling connector cuts
  const clamped = clampAtWordBoundary(
    'Discover residential apartments, resale homes, and rental properties across New Town with Great Homes',
    95,
    false
  );
  assert.ok(!/\b(with|great|and|in|on|&)$/i.test(clamped), `Clamped ended awkwardly: "${clamped}"`);

  // 6. Distinct templates per page type (not identical boilerplate)
  const distinctSet = new Set([
    String(locationsHubMetadata.description),
    String(developersHubMetadata.description),
    String(guidesHubMetadata.description),
    String(reviewsHubMetadata.description),
    String(postPropertyMetadata.description),
    projectDesc,
  ]);
  assert.strictEqual(distinctSet.size, 6, 'Each page type must keep a distinct meta description template');

  console.log('✓ F-05 passed (all meta description boundary, cleanliness & distinct-template assertions)');
}

async function testF06EditorialImages(): Promise<void> {
  console.log('\n--- Testing F-06: Removal of Placeholder picsum.photos Images ---');

  const picsumUrl = 'https://picsum.photos/seed/kolkata-guide/1200/630';
  const validCustomUrl = 'https://www.greathomes.co.in/uploads/editorial/rajarhat-guide-cover.webp';

  // 1. Placeholder host detection
  assert.strictEqual(isPlaceholderImageUrl(picsumUrl), true);
  assert.strictEqual(isPlaceholderImageUrl('https://fastly.picsum.photos/id/10/1200/630.jpg'), true);
  assert.strictEqual(isPlaceholderImageUrl('https://via.placeholder.com/1200x630'), true);
  assert.strictEqual(isPlaceholderImageUrl(validCustomUrl), false);
  assert.strictEqual(isPlaceholderImageUrl(DEFAULT_OG_IMAGE), false);

  // 2. Fallback hierarchy: valid custom -> preserved; picsum / null -> DEFAULT_OG_IMAGE
  assert.strictEqual(resolveEditorialSeoImage(validCustomUrl), validCustomUrl);
  assert.strictEqual(resolveEditorialSeoImage(picsumUrl), DEFAULT_OG_IMAGE);
  assert.strictEqual(resolveEditorialSeoImage(null), DEFAULT_OG_IMAGE);
  assert.strictEqual(resolveEditorialSeoImage(''), DEFAULT_OG_IMAGE);

  // 3. buildPageMetadata never emits picsum.photos in OG or Twitter
  const metaWithPicsum = buildPageMetadata({
    title: 'Sample Buyer Guide',
    description: 'Comprehensive guide to residential buying across Kolkata neighbourhoods.',
    canonicalPath: '/guides/sample-guide',
    ogType: 'article',
    ogImage: picsumUrl,
  });
  assert.deepStrictEqual(getOgImages(metaWithPicsum), [DEFAULT_OG_IMAGE]);
  assert.deepStrictEqual(getTwitterImages(metaWithPicsum), [DEFAULT_OG_IMAGE]);

  const metaWithValid = buildPageMetadata({
    title: 'Sample Buyer Guide',
    description: 'Comprehensive guide to residential buying across Kolkata neighbourhoods.',
    canonicalPath: '/guides/sample-guide',
    ogType: 'article',
    ogImage: validCustomUrl,
  });
  assert.deepStrictEqual(getOgImages(metaWithValid), [validCustomUrl]);
  assert.deepStrictEqual(getTwitterImages(metaWithValid), [validCustomUrl]);

  // 4. Seed editorial articles in memory with picsum.photos & verify service + route metadata + JSON-LD
  const picsumGuide = await editorialRepositoryPostgres.create({
    type: 'BUYING_GUIDE',
    status: 'PUBLISHED',
    title: 'Phase 1 Picsum Test Buyer Guide',
    slug: 'phase1-picsum-test-guide',
    excerpt: 'Factual homebuyer guide for testing placeholder image removal.',
    body: 'Detailed factual content about Kolkata residential projects and WBRERA verification.',
    authorName: 'Great Homes Editorial',
    authorRole: 'Research Desk',
    featuredImage: picsumUrl,
    seoTitle: 'Phase 1 Picsum Test Buyer Guide',
    seoDescription: 'Factual homebuyer guide for testing placeholder image removal in Kolkata.',
    canonicalUrl: '/guides/phase1-picsum-test-guide',
    readingTimeMinutes: 5,
    contentVersion: 1,
    factCheckStatus: 'REVIEWED',
    publishedAt: new Date(),
  });

  const picsumReview = await editorialRepositoryPostgres.create({
    type: 'PROJECT_REVIEW',
    status: 'PUBLISHED',
    title: 'Phase 1 Picsum Test Project Review',
    slug: 'phase1-picsum-test-review',
    excerpt: 'Independent project assessment for testing placeholder image removal.',
    body: 'Detailed factual project assessment covering configurations, pricing, and WBRERA details.',
    authorName: 'Great Homes Editorial',
    authorRole: 'Research Desk',
    featuredImage: picsumUrl,
    seoTitle: 'Phase 1 Picsum Test Project Review',
    seoDescription: 'Independent project assessment for testing placeholder image removal in Kolkata.',
    canonicalUrl: '/reviews/phase1-picsum-test-review',
    readingTimeMinutes: 5,
    contentVersion: 1,
    factCheckStatus: 'REVIEWED',
    publishedAt: new Date(),
  });

  const guideDto = await editorialService.getPublicArticleBySlug(picsumGuide.slug);
  assert.ok(guideDto, 'Public guide DTO should exist');
  assert.strictEqual(guideDto!.featuredImage, null, 'Public DTO must strip picsum.photos featuredImage');

  const guideMeta = await generateGuideMetadata({
    params: Promise.resolve({ slug: picsumGuide.slug }),
  });
  assert.deepStrictEqual(getOgImages(guideMeta), [DEFAULT_OG_IMAGE]);
  assert.deepStrictEqual(getTwitterImages(guideMeta), [DEFAULT_OG_IMAGE]);

  const reviewMeta = await generateReviewMetadata({
    params: Promise.resolve({ slug: picsumReview.slug }),
  });
  assert.deepStrictEqual(getOgImages(reviewMeta), [DEFAULT_OG_IMAGE]);
  assert.deepStrictEqual(getTwitterImages(reviewMeta), [DEFAULT_OG_IMAGE]);

  // Verify Article JSON-LD and rendered HTML for both ArticleDetailView and ReviewDetailView
  const picsumArticleProp: PublicEditorialArticleDTO = {
    ...guideDto!,
    featuredImage: picsumUrl, // Even if a caller passes raw picsum directly, view must sanitize!
  };
  const guideHtml = renderToStaticMarkup(
    React.createElement(ArticleDetailView, { article: picsumArticleProp })
  );
  assert.ok(!guideHtml.includes('picsum.photos'), 'ArticleDetailView HTML/JSON-LD must never include picsum.photos');
  assert.ok(guideHtml.includes(DEFAULT_OG_IMAGE), 'ArticleDetailView JSON-LD must use DEFAULT_OG_IMAGE fallback');

  const reviewDto = await editorialService.getPublicArticleBySlug(picsumReview.slug);
  const reviewHtml = renderToStaticMarkup(
    React.createElement(ReviewDetailView, {
      review: { ...reviewDto!, featuredImage: picsumUrl },
    })
  );
  assert.ok(!reviewHtml.includes('picsum.photos'), 'ReviewDetailView HTML/JSON-LD must never include picsum.photos');
  assert.ok(reviewHtml.includes(DEFAULT_OG_IMAGE), 'ReviewDetailView JSON-LD must use DEFAULT_OG_IMAGE fallback');

  console.log('✓ F-06 passed (zero picsum.photos across DTO, OG, Twitter & Article JSON-LD; valid custom images preserved)');
}

async function testF07GuidesDirectoryLinks(): Promise<void> {
  console.log('\n--- Testing F-07: Guides Directory & Editorial Internal Links ---');

  const now = new Date().toISOString();
  const sampleArticles: PublicEditorialArticleDTO[] = [
    {
      id: 'art-review-1',
      type: 'PROJECT_REVIEW',
      typeDisplay: 'Project Review',
      title: 'Merlin Rise Review: Honest Assessment',
      slug: 'merlin-rise-review',
      excerpt: 'Independent project assessment.',
      body: 'Body text.',
      authorName: 'Great Homes Editorial',
      authorRole: 'Research Desk',
      publishedAt: now,
      updatedAt: now,
      featuredImage: null,
      seoTitle: 'Merlin Rise Review',
      seoDescription: 'Independent project assessment.',
      canonicalUrl: '/reviews/merlin-rise-review',
      readingTimeMinutes: 5,
      structuredSections: [],
      project: null,
      developer: null,
      location: null,
    },
    {
      id: 'art-guide-1',
      type: 'LOCATION_GUIDE',
      typeDisplay: 'Location Guide',
      title: 'Rajarhat Residential Location Guide',
      slug: 'rajarhat-residential-location-guide',
      excerpt: 'Locality guide.',
      body: 'Body text.',
      authorName: 'Great Homes Editorial',
      authorRole: 'Research Desk',
      publishedAt: now,
      updatedAt: now,
      featuredImage: null,
      seoTitle: 'Rajarhat Guide',
      seoDescription: 'Locality guide.',
      canonicalUrl: '/locations/rajarhat/guide', // legacy stale wrapper URL
      readingTimeMinutes: 6,
      structuredSections: [],
      project: null,
      developer: null,
      location: null,
    },
  ];

  // 1. GuidesDirectoryView links PROJECT_REVIEW -> /reviews/[slug] and guide -> /guides/[slug]
  const directoryHtml = renderToStaticMarkup(
    React.createElement(GuidesDirectoryView, {
      initialArticles: sampleArticles,
      totalArticles: sampleArticles.length,
    })
  );
  assert.ok(
    directoryHtml.includes('href="/reviews/merlin-rise-review"'),
    'GuidesDirectoryView must link PROJECT_REVIEW directly to /reviews/[slug]'
  );
  assert.ok(
    !directoryHtml.includes('href="/guides/merlin-rise-review"'),
    'GuidesDirectoryView must NOT link PROJECT_REVIEW through /guides/[slug]'
  );
  assert.ok(
    directoryHtml.includes('href="/guides/rajarhat-residential-location-guide"'),
    'GuidesDirectoryView must continue linking guides to /guides/[slug]'
  );

  // 2. ArticleDetailView relatedArticles links PROJECT_REVIEW directly to /reviews/[slug]
  const relatedHtml = renderToStaticMarkup(
    React.createElement(ArticleDetailView, {
      article: {
        ...sampleArticles[1],
        relatedArticles: [
          {
            id: 'art-review-1',
            type: 'PROJECT_REVIEW',
            typeDisplay: 'Project Review',
            title: 'Merlin Rise Review',
            slug: 'merlin-rise-review',
            excerpt: 'Assessment.',
            featuredImage: null,
            readingTimeMinutes: 5,
          },
        ],
      },
    })
  );
  assert.ok(
    relatedHtml.includes('href="/reviews/merlin-rise-review"'),
    'ArticleDetailView related PROJECT_REVIEW must link directly to /reviews/[slug]'
  );
  assert.ok(
    !relatedHtml.includes('href="/guides/merlin-rise-review"'),
    'ArticleDetailView related PROJECT_REVIEW must NOT link through /guides/[slug]'
  );

  // 3. HomeIntelligenceGuides links directly to canonical /reviews/[slug] and /guides/[slug]
  const homeHtml = renderToStaticMarkup(
    React.createElement(HomeIntelligenceGuides, { articles: sampleArticles })
  );
  assert.ok(homeHtml.includes('href="/reviews/merlin-rise-review"'));
  assert.ok(homeHtml.includes('href="/guides/rajarhat-residential-location-guide"'));
  assert.ok(!homeHtml.includes('href="/locations/rajarhat/guide"'));

  console.log('✓ F-07 passed (GuidesDirectoryView, ArticleDetailView & HomeIntelligenceGuides link directly to /reviews/[slug])');
}

async function testF08PostPropertySsr(): Promise<void> {
  console.log('\n--- Testing F-08: /post-property Server-Rendered H1 ---');

  // 1. Static architecture check: H1 in Server Component outside Suspense
  const pageSource = fs.readFileSync(
    path.join(process.cwd(), 'app', 'post-property', 'page.tsx'),
    'utf8'
  );
  assert.ok(
    pageSource.includes('<h1'),
    'app/post-property/page.tsx must render <h1> directly in the Server Component'
  );
  assert.ok(
    pageSource.includes('Sell or Rent Your Property in Kolkata, Faster.'),
    'app/post-property/page.tsx must render the canonical H1 headline'
  );
  assert.ok(
    !pageSource.includes('Loading Great Homes Post Property Hub...'),
    'app/post-property/page.tsx must not suspend the Hero behind a loading fallback'
  );

  const clientSource = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'post-property', 'PostPropertyHeroClient.tsx'),
    'utf8'
  );
  assert.ok(
    clientSource.includes('<Suspense fallback={null}>') &&
      clientSource.includes('PostPropertyUrlParamSync'),
    'PostPropertyHeroClient must isolate useSearchParams inside <Suspense fallback={null}>'
  );

  // 2. Live local SSR HTTP verification (when dev server is running on port 3000)
  try {
    const res = await fetch('http://127.0.0.1:3000/post-property', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
      signal: AbortSignal.timeout(10000),
    });
    assert.strictEqual(res.status, 200, `/post-property returned HTTP ${res.status}`);
    const html = await res.text();
    const h1Matches = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    );
    assert.strictEqual(
      h1Matches.length,
      1,
      `Expected exactly 1 SSR <h1> on /post-property, got ${h1Matches.length}: ${JSON.stringify(h1Matches)}`
    );
    assert.strictEqual(
      h1Matches[0],
      'Sell or Rent Your Property in Kolkata, Faster.',
      `Unexpected /post-property H1 text: "${h1Matches[0]}"`
    );
    assert.ok(
      !html.includes('Loading Great Homes Post Property Hub...'),
      '/post-property SSR HTML must not contain loading fallback text'
    );
    assert.ok(
      html.includes('id="quick-post-form"'),
      '/post-property SSR HTML must preserve the interactive quick submission form'
    );
    console.log('✓ F-08 passed (both static architecture check + live SSR Googlebot HTTP 200 verification)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`F-08 live SSR check against http://127.0.0.1:3000/post-property failed: ${msg}`);
  }
}

async function main(): Promise<void> {
  assertSafeMemoryOnlyEnv();
  await testF04DeveloperSeoGovernance();
  await testF05MetaDescriptions();
  await testF06EditorialImages();
  await testF07GuidesDirectoryLinks();
  await testF08PostPropertySsr();
  console.log('\nALL PHASE 1 SEO REMEDIATION TESTS PASSED (5/5).');
}

main().catch((err) => {
  console.error('\nPHASE 1 SEO REMEDIATION TEST FAILED:', err);
  process.exit(1);
});
