import { MetadataRoute } from 'next';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { getDb } from '@/src/db/client';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { developerService } from '@/src/domain/developers/services/developerService';
import { locationSeoService } from '@/src/domain/locations/services/locationSeoService';
import { isPublicCanonicalLocation } from '@/src/domain/locations/locationRegionMapper';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import {
  getEligibleResaleListings,
  getEligibleRentalListings,
} from '@/src/domain/projects/viewModels/projectSectionEligibility';

const BASE_URL = 'https://www.greathomes.co.in';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // Cache for 24 hours

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  let hasDb = false;
  try {
    const db = getDb();
    if (db) {
      hasDb = true;
    } else {
      await ensureSeedData();
    }
  } catch {
    // If DATABASE_URL is not provided (e.g. during offline build prerendering), safe static fallback will be used
    hasDb = false;
  }

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/projects`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/buy`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/rent`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/developers`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/locations`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/market`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/guides`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/reviews`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ];

  try {
    const [
      allPublishedProjects,
      developersRes,
      indexableLocations,
      resaleListings,
      rentalListings,
      editorialRes,
    ] = await Promise.all([
      projectIntelligenceService.listAllProjects({}, false),
      developerService.listPublicDevelopers({ limit: 1000, isInternalStaff: false }),
      locationSeoService.getIndexableLocations(),
      resaleListingService.listPublicListings({}),
      rentalListingService.listPublicListings({}),
      editorialService.getPublicArticles({ limit: 1000 }),
    ]);

    const publishedProjects = (allPublishedProjects || []).filter(
      p => Boolean(p.slug && p.slug.trim()) && p.lifecycleStatus === 'PUBLISHED'
    );

    const resolveValidDate = (rawDate: string | Date | undefined | null, fallback: Date): Date => {
      if (!rawDate) return fallback;
      const d = rawDate instanceof Date ? rawDate : new Date(rawDate);
      return isNaN(d.getTime()) ? fallback : d;
    };

    const resolveLatestInventoryDate = (
      projectUpdatedAt: string | Date | undefined | null,
      listings: Array<{ updatedAt?: string | null; createdAt?: string | null }>
    ): Date => {
      const baseDate = resolveValidDate(projectUpdatedAt, now);
      if (!listings || listings.length === 0) {
        return baseDate;
      }
      let maxTime = baseDate.getTime();
      for (const item of listings) {
        const itemDate = resolveValidDate(item.updatedAt || item.createdAt, baseDate);
        if (itemDate.getTime() > maxTime) {
          maxTime = itemDate.getTime();
        }
      }
      return new Date(maxTime);
    };

    const projectUrls: MetadataRoute.Sitemap = publishedProjects.map(p => {
      const heroImage = p.media?.find(m => m.isFeatured)?.url || p.media?.[0]?.url;
      return {
        url: `${BASE_URL}/projects/${p.slug.trim()}`,
        lastModified: resolveValidDate(p.updatedAt, now),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
        ...(heroImage ? { images: [heroImage] } : {}),
      };
    });

    // Qualified 12 BHK landing pages verified in Phase 4I-N.4
    const bhkLandingPageSlugs = [
      '2-bhk-flats-in-kolkata',
      '3-bhk-flats-in-kolkata',
      '4-bhk-flats-in-kolkata',
      '5-bhk-flats-in-kolkata',
      '2-bhk-flats-in-rajarhat',
      '3-bhk-flats-in-rajarhat',
      '4-bhk-flats-in-rajarhat',
      '2-bhk-flats-in-new-town',
      '3-bhk-flats-in-new-town',
      '4-bhk-flats-in-new-town',
      '3-bhk-flats-in-em-bypass',
      '4-bhk-flats-in-em-bypass',
    ];

    const bhkLandingPageUrls: MetadataRoute.Sitemap = bhkLandingPageSlugs.map(slug => ({
      url: `${BASE_URL}/buy/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    }));

    // Include /projects/[slug]/resale and /projects/[slug]/rent ONLY when eligible inventory exists
    const projectInventoryUrls: MetadataRoute.Sitemap = [];
    for (const p of publishedProjects) {
      const slug = p.slug.trim();
      const eligibleResale = getEligibleResaleListings(resaleListings || [], p.id);
      const eligibleRental = getEligibleRentalListings(rentalListings || [], p.id);

      if (eligibleResale.length > 0) {
        projectInventoryUrls.push({
          url: `${BASE_URL}/projects/${slug}/resale`,
          lastModified: resolveLatestInventoryDate(p.updatedAt, eligibleResale),
          changeFrequency: 'daily' as const,
          priority: 0.75,
        });
      }

      if (eligibleRental.length > 0) {
        projectInventoryUrls.push({
          url: `${BASE_URL}/projects/${slug}/rent`,
          lastModified: resolveLatestInventoryDate(p.updatedAt, eligibleRental),
          changeFrequency: 'daily' as const,
          priority: 0.75,
        });
      }
    }

    const developerUrls: MetadataRoute.Sitemap = (developersRes.items || [])
      .filter(d => Boolean(d.slug && d.slug.trim()) && d.status === 'PUBLISHED')
      .map(d => ({
        url: `${BASE_URL}/developers/${d.slug.trim()}`,
        lastModified: resolveValidDate(d.updatedAt, now),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));

    const locationUrls: MetadataRoute.Sitemap = (indexableLocations || [])
      .filter(loc => Boolean(loc.slug && loc.slug.trim()) && isPublicCanonicalLocation(loc))
      .map(loc => ({
        url: `${BASE_URL}/locations/${loc.slug.trim()}`,
        lastModified: loc.updatedAt || now,
        changeFrequency: 'weekly' as const,
        priority: 0.75,
      }));

    // Only PUBLISHED + VERIFIED resale listings with non-empty slugs
    const resaleUrls: MetadataRoute.Sitemap = (resaleListings || [])
      .filter(r => Boolean(r.slug && r.slug.trim()) && r.isVerified === true)
      .map(r => ({
        url: `${BASE_URL}/buy/${r.slug.trim()}`,
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));

    // Only PUBLISHED + VERIFIED rental listings with non-empty slugs
    const rentalUrls: MetadataRoute.Sitemap = (rentalListings || [])
      .filter(r => Boolean(r.slug && r.slug.trim()) && r.isVerified === true)
      .map(r => ({
        url: `${BASE_URL}/rent/${r.slug.trim()}`,
        lastModified: now,
        changeFrequency: 'daily' as const,
        priority: 0.7,
      }));

    // Published editorial guides and project reviews
    const editorialUrls: MetadataRoute.Sitemap = (editorialRes.items || [])
      .filter(article => Boolean(article.slug && article.slug.trim()))
      .map(article => {
        const prefix = article.type === 'PROJECT_REVIEW' ? '/reviews' : '/guides';
        const lastMod = article.updatedAt ? new Date(article.updatedAt) : now;
        return {
          url: `${BASE_URL}${prefix}/${article.slug.trim()}`,
          lastModified: isNaN(lastMod.getTime()) ? now : lastMod,
          changeFrequency: 'monthly' as const,
          priority: 0.65,
        };
      });

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

    return combined.filter(entry => {
      if (seen.has(entry.url)) return false;
      seen.add(entry.url);
      return true;
    });
  } catch (err) {
    console.error('[SEO Sitemap] Failed to load dynamic entries, falling back to static routes:', err);
    return staticRoutes;
  }
}
