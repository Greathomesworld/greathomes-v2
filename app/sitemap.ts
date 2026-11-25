import { MetadataRoute } from 'next';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { getDb } from '@/src/db/client';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import {
  developerService,
} from '@/src/domain/developers/services/developerService';
import { evaluateDeveloperSeoEligibility } from '@/src/domain/developers/services/developerSeoService';
import { locationSeoService } from '@/src/domain/locations/services/locationSeoService';
import { LOCATION_ALIASES } from '@/src/domain/locations/services/locationService';
import { isPublicCanonicalLocation } from '@/src/domain/locations/locationRegionMapper';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { bhkLandingService } from '@/src/domain/projects/services/bhkLandingService';
import {
  getEligibleResaleListings,
  getEligibleRentalListings,
} from '@/src/domain/projects/viewModels/projectSectionEligibility';
import {
  normalizePublicSeoImageUrl,
  SITE_ORIGIN,
} from '@/src/domain/seo/metadataBuilder';

const BASE_URL = SITE_ORIGIN;

// Revalidate cached sitemap every hour via ISR (do not pair with force-dynamic, which disables caching)
export const revalidate = 3600;

const SITEMAP_MEMORY_TTL_MS = 10 * 60 * 1000; // 10-minute process-level cache guard
let cachedSitemap: { entries: MetadataRoute.Sitemap; expiresAt: number } | null = null;
let inflightSitemapPromise: Promise<MetadataRoute.Sitemap> | null = null;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const nowMs = Date.now();
  if (cachedSitemap && cachedSitemap.expiresAt > nowMs) {
    return cachedSitemap.entries;
  }
  if (inflightSitemapPromise) {
    return inflightSitemapPromise;
  }

  inflightSitemapPromise = buildSitemap().finally(() => {
    inflightSitemapPromise = null;
  });
  return inflightSitemapPromise;
}

function resolveOptionalDate(rawDate: string | Date | undefined | null): Date | undefined {
  if (!rawDate) return undefined;
  const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
  return isNaN(d.getTime()) ? undefined : d;
}

function maxValidDate(dates: Array<Date | undefined | null>): Date | undefined {
  let maxMs = -Infinity;
  for (const d of dates) {
    if (d && !isNaN(d.getTime()) && d.getTime() > maxMs) {
      maxMs = d.getTime();
    }
  }
  return Number.isFinite(maxMs) ? new Date(maxMs) : undefined;
}

function resolveLatestInventoryDate(
  projectUpdatedAt: string | Date | undefined | null,
  listings: Array<{ updatedAt?: string | null; createdAt?: string | null }>
): Date | undefined {
  const candidates: Array<Date | undefined> = [resolveOptionalDate(projectUpdatedAt)];
  for (const item of listings || []) {
    candidates.push(resolveOptionalDate(item.updatedAt || item.createdAt));
  }
  return maxValidDate(candidates);
}

async function buildSitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const db = getDb();
    if (!db) {
      await ensureSeedData();
    }
  } catch {
    // If DATABASE_URL is not provided (e.g. during offline build prerendering), safe fallback will be used
  }

  const [
    projectsResult,
    developersResult,
    locationsResult,
    resaleResult,
    rentalResult,
    editorialResult,
  ] = await Promise.allSettled([
    projectIntelligenceService.listAllProjects({}, false),
    developerService.listPublicDevelopers({ limit: 1000, isInternalStaff: false }),
    locationSeoService.getIndexableLocations(),
    resaleListingService.listPublicListings({}),
    rentalListingService.listPublicListings({}),
    editorialService.getPublicArticles({ limit: 1000 }),
  ]);

  let degraded = false;
  const failedSources: string[] = [];
  let firstFailureReason: string | null = null;

  const recordSourceFailure = (label: string, result: PromiseSettledResult<unknown>) => {
    if (result.status === 'rejected') {
      degraded = true;
      failedSources.push(label);
      if (!firstFailureReason) {
        const reason = result.reason;
        firstFailureReason =
          reason instanceof Error
            ? reason.message
            : typeof reason === 'string'
              ? reason
              : 'Database unavailable';
      }
    }
  };

  recordSourceFailure('projects', projectsResult);
  recordSourceFailure('developers', developersResult);
  recordSourceFailure('locations', locationsResult);
  recordSourceFailure('resaleListings', resaleResult);
  recordSourceFailure('rentalListings', rentalResult);
  recordSourceFailure('editorial', editorialResult);

  const allPublishedProjects =
    projectsResult.status === 'fulfilled' ? projectsResult.value || [] : [];
  const developersItems =
    developersResult.status === 'fulfilled' ? developersResult.value?.items || [] : [];
  const indexableLocations =
    locationsResult.status === 'fulfilled' ? locationsResult.value || [] : [];
  const resaleListings =
    resaleResult.status === 'fulfilled' ? resaleResult.value || [] : [];
  const rentalListings =
    rentalResult.status === 'fulfilled' ? rentalResult.value || [] : [];
  const editorialItems =
    editorialResult.status === 'fulfilled' ? editorialResult.value?.items || [] : [];

  const publishedProjects = allPublishedProjects.filter(
    (p) => Boolean(p.slug && p.slug.trim()) && p.lifecycleStatus === 'PUBLISHED'
  );

  // Compute dynamic eligible BHK landing pages (>= 3 published projects) directly from live data
  let eligibleBhkPages: Awaited<ReturnType<typeof bhkLandingService.getEligibleBhkLandingPages>> = [];
  if (projectsResult.status === 'fulfilled' && publishedProjects.length > 0) {
    try {
      eligibleBhkPages = await bhkLandingService.getEligibleBhkLandingPages(publishedProjects);
    } catch (err) {
      degraded = true;
      failedSources.push('bhkLandingPages');
      if (!firstFailureReason) {
        firstFailureReason = err instanceof Error ? err.message : 'Database unavailable';
      }
    }
  }

  if (degraded && failedSources.length > 0) {
    console.warn(
      `[SEO Sitemap] Degraded mode (serving static hub fallback); unavailable sources: ${failedSources.join(', ')}. Reason: ${firstFailureReason || 'Database unavailable'}`
    );
  }

  // Project URLs with strictly validated absolute https:// <image:loc>
  const projectUrls: MetadataRoute.Sitemap = publishedProjects.map((p) => {
    const rawHero = p.media?.find((m) => m.isFeatured)?.url || p.media?.[0]?.url;
    const absoluteHero = normalizePublicSeoImageUrl(rawHero);
    const lastModified = resolveOptionalDate(p.updatedAt);

    return {
      url: `${BASE_URL}/projects/${p.slug.trim()}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      ...(absoluteHero && /^https:\/\//i.test(absoluteHero) ? { images: [absoluteHero] } : {}),
    };
  });

  // Dynamic eligible BHK landing pages
  const bhkLandingPageUrls: MetadataRoute.Sitemap = eligibleBhkPages.map((entry) => ({
    url: `${BASE_URL}${entry.href}`,
    ...(entry.latestUpdatedAt ? { lastModified: entry.latestUpdatedAt } : {}),
    changeFrequency: 'weekly' as const,
    priority: 0.85,
  }));

  // Include /projects/[slug]/resale and /projects/[slug]/rent ONLY when eligible inventory exists
  const projectInventoryUrls: MetadataRoute.Sitemap = [];
  for (const p of publishedProjects) {
    const slug = p.slug.trim();
    const eligibleResale = getEligibleResaleListings(resaleListings, p.id);
    const eligibleRental = getEligibleRentalListings(rentalListings, p.id);

    if (eligibleResale.length > 0) {
      const lastModified = resolveLatestInventoryDate(p.updatedAt, eligibleResale);
      projectInventoryUrls.push({
        url: `${BASE_URL}/projects/${slug}/resale`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'daily' as const,
        priority: 0.75,
      });
    }

    if (eligibleRental.length > 0) {
      const lastModified = resolveLatestInventoryDate(p.updatedAt, eligibleRental);
      projectInventoryUrls.push({
        url: `${BASE_URL}/projects/${slug}/rent`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'daily' as const,
        priority: 0.75,
      });
    }
  }

  // Build in-memory published project & editorial counts per developer for consistent SEO eligibility (F-04)
  const publishedProjectsByDeveloperId = new Map<string, number>();
  for (const p of publishedProjects) {
    const devId = p.developer?.id;
    if (devId) {
      publishedProjectsByDeveloperId.set(
        devId,
        (publishedProjectsByDeveloperId.get(devId) || 0) + 1
      );
    }
  }

  const publishedEditorialByDeveloperId = new Map<string, number>();
  const publishedEditorialByDeveloperSlug = new Map<string, number>();
  for (const article of editorialItems) {
    if (article.developer?.id) {
      publishedEditorialByDeveloperId.set(
        article.developer.id,
        (publishedEditorialByDeveloperId.get(article.developer.id) || 0) + 1
      );
    }
    if (article.developer?.slug) {
      const slugKey = article.developer.slug.trim().toLowerCase();
      publishedEditorialByDeveloperSlug.set(
        slugKey,
        (publishedEditorialByDeveloperSlug.get(slugKey) || 0) + 1
      );
    }
  }

  // Only SEO-eligible canonical developers (consistent with /developers/[slug] robots metadata)
  const developerUrls: MetadataRoute.Sitemap = developersItems
    .filter((d) => {
      const slugKey = (d.slug || '').trim().toLowerCase();
      const publishedProjectCount =
        projectsResult.status === 'fulfilled'
          ? (publishedProjectsByDeveloperId.get(d.id) ?? d.projectCount ?? 0)
          : (d.projectCount ?? 0);
      const publishedEditorialCount = Math.max(
        publishedEditorialByDeveloperId.get(d.id) || 0,
        slugKey ? publishedEditorialByDeveloperSlug.get(slugKey) || 0 : 0
      );

      const eligibility = evaluateDeveloperSeoEligibility({
        developer: d,
        publishedProjectCount,
        publishedEditorialCount,
      });
      return eligibility.eligible;
    })
    .map((d) => {
      const lastModified = resolveOptionalDate(d.updatedAt);
      return {
        url: `${BASE_URL}/developers/${d.slug.trim()}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      };
    });

  // Indexable canonical locations (defensively excluding alias slugs)
  const locationUrls: MetadataRoute.Sitemap = indexableLocations
    .filter((loc) => {
      const cleanSlug = (loc.slug || '').toLowerCase().trim();
      if (!cleanSlug || !isPublicCanonicalLocation(loc)) return false;
      const aliasTarget = LOCATION_ALIASES[cleanSlug];
      if (aliasTarget && aliasTarget !== cleanSlug) return false;
      return true;
    })
    .map((loc) => {
      const lastModified = resolveOptionalDate(loc.updatedAt);
      return {
        url: `${BASE_URL}/locations/${loc.slug.trim()}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'weekly' as const,
        priority: 0.75,
      };
    });

  // Only PUBLISHED + VERIFIED resale listings with non-empty slugs
  const resaleUrls: MetadataRoute.Sitemap = resaleListings
    .filter((r) => Boolean(r.slug && r.slug.trim()) && r.isVerified === true)
    .map((r) => {
      const lastModified = resolveOptionalDate((r as any).updatedAt || (r as any).createdAt);
      return {
        url: `${BASE_URL}/buy/${r.slug.trim()}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      };
    });

  // Only PUBLISHED + VERIFIED rental listings with non-empty slugs
  const rentalUrls: MetadataRoute.Sitemap = rentalListings
    .filter((r) => Boolean(r.slug && r.slug.trim()) && r.isVerified === true)
    .map((r) => {
      const lastModified = resolveOptionalDate((r as any).updatedAt || (r as any).createdAt);
      return {
        url: `${BASE_URL}/rent/${r.slug.trim()}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      };
    });

  // Published editorial guides and project reviews
  const editorialUrls: MetadataRoute.Sitemap = editorialItems
    .filter((article) => Boolean(article.slug && article.slug.trim()))
    .map((article) => {
      const prefix = article.type === 'PROJECT_REVIEW' ? '/reviews' : '/guides';
      const lastModified = resolveOptionalDate(article.updatedAt || article.publishedAt);
      return {
        url: `${BASE_URL}${prefix}/${article.slug.trim()}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: 'monthly' as const,
        priority: 0.65,
      };
    });

  // Derive genuine lastModified timestamps for static hubs from underlying real data (never fake `new Date()`)
  const latestProjectDate = maxValidDate(projectUrls.map((u) => u.lastModified as Date | undefined));
  const latestResaleDate = maxValidDate(resaleUrls.map((u) => u.lastModified as Date | undefined));
  const latestRentalDate = maxValidDate(rentalUrls.map((u) => u.lastModified as Date | undefined));
  const latestDeveloperDate = maxValidDate(developerUrls.map((u) => u.lastModified as Date | undefined));
  const latestLocationDate = maxValidDate(locationUrls.map((u) => u.lastModified as Date | undefined));
  const latestGuideDate = maxValidDate(
    editorialUrls
      .filter((u) => u.url.includes('/guides/'))
      .map((u) => u.lastModified as Date | undefined)
  );
  const latestReviewDate = maxValidDate(
    editorialUrls
      .filter((u) => u.url.includes('/reviews/'))
      .map((u) => u.lastModified as Date | undefined)
  );
  const latestGlobalDate = maxValidDate([
    latestProjectDate,
    latestResaleDate,
    latestRentalDate,
    latestLocationDate,
    latestGuideDate,
    latestReviewDate,
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      ...(latestGlobalDate ? { lastModified: latestGlobalDate } : {}),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/projects`,
      ...(latestProjectDate ? { lastModified: latestProjectDate } : {}),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/buy`,
      ...(maxValidDate([latestProjectDate, latestResaleDate])
        ? { lastModified: maxValidDate([latestProjectDate, latestResaleDate]) }
        : {}),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/rent`,
      ...(latestRentalDate ? { lastModified: latestRentalDate } : {}),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/developers`,
      ...(latestDeveloperDate ? { lastModified: latestDeveloperDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/locations`,
      ...(latestLocationDate ? { lastModified: latestLocationDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/market`,
      ...(latestGlobalDate ? { lastModified: latestGlobalDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/guides`,
      ...(latestGuideDate ? { lastModified: latestGuideDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/reviews`,
      ...(latestReviewDate ? { lastModified: latestReviewDate } : {}),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/post-property`,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ];

  // Deterministic URL deduplication
  const seen = new Set<string>();
  const combined = [
    ...staticRoutes,
    ...bhkLandingPageUrls,
    ...projectUrls,
    ...projectInventoryUrls,
    ...developerUrls,
    ...locationUrls,
    ...resaleUrls,
    ...rentalUrls,
    ...editorialUrls,
  ];

  const deduped = combined.filter((entry) => {
    if (seen.has(entry.url)) return false;
    seen.add(entry.url);
    return true;
  });

  // Only populate process-level cache when all data sources succeeded cleanly
  if (!degraded) {
    cachedSitemap = {
      entries: deduped,
      expiresAt: Date.now() + SITEMAP_MEMORY_TTL_MS,
    };
  }

  return deduped;
}
