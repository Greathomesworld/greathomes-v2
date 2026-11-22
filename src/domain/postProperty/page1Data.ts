import { unstable_cache } from 'next/cache';
import { and, asc, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import {
  developers,
  locations,
  projects,
  rentalListingMedia,
  rentalListings,
  resaleListingMedia,
  resaleListings,
} from '@/src/db/schema';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { developerRepository } from '@/src/infrastructure/repositories/developerProvider';
import {
  buildSelectableKolkataLocations,
  type PostPropertyLocationOption,
} from '@/src/domain/locations/locationOptions';
import { isKnownTestDeveloperSlug } from '@/src/domain/developers/services/developerService';
import {
  isKnownTestResaleListing,
  resaleListingService,
} from '@/src/domain/projects/services/resaleService';
import {
  isKnownTestRentalListing,
  rentalListingService,
} from '@/src/domain/projects/services/rentalService';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';
import type {
  PostPropertyStatsData,
  RecentPostedPropertyItem,
} from '@/src/components/post-property/PostPropertyHub';

export interface PostPropertyProjectOption {
  id: string;
  name: string;
  slug: string;
  locationId: string;
}

export interface PostPropertyPage1Data {
  locationOptions: PostPropertyLocationOption[];
  stats: PostPropertyStatsData;
  recentListings: RecentPostedPropertyItem[];
}

function formatIndianPrice(amount?: number | null): string | undefined {
  if (amount === undefined || amount === null || Number.isNaN(amount) || amount <= 0) {
    return undefined;
  }
  if (amount >= 10_000_000) {
    const cr = (amount / 10_000_000).toFixed(2).replace(/\.00$/, '');
    return `₹${cr} Cr`;
  }
  if (amount >= 100_000) {
    const l = (amount / 100_000).toFixed(2).replace(/\.00$/, '');
    return `₹${l} L`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatPropertyTypeLabel(propertyType?: string | null): string {
  const key = (propertyType || '').toUpperCase().trim();
  const map: Record<string, string> = {
    APARTMENT: 'Apartment',
    INDEPENDENT_HOUSE: 'Independent House',
    PLOT: 'Residential Plot',
    VILLA: 'Villa',
    PENTHOUSE: 'Penthouse',
    DUPLEX: 'Duplex',
    STUDIO: 'Studio',
  };
  return map[key] || 'Apartment';
}

function buildCompactListingTitle(
  item: {
    propertyType?: string | null;
    configuration?: string | null;
    bedroomCount?: number | null;
    locationName?: string | null;
  },
  kind: 'RESALE' | 'RENTAL'
): string {
  const propLabel = formatPropertyTypeLabel(item.propertyType);
  const locName = item.locationName || 'Kolkata';
  const rawConfig = typeof item.configuration === 'string' ? item.configuration.trim() : '';
  const cleanedConfig = rawConfig.replace(/\s+for\s+(sale|rent|lease)$/i, '').trim();

  let headlinePrefix = '';
  if (item.propertyType === 'PLOT') {
    headlinePrefix = 'Residential Plot';
  } else if (item.propertyType === 'INDEPENDENT_HOUSE') {
    headlinePrefix = 'Independent House';
  } else if (cleanedConfig) {
    const lower = cleanedConfig.toLowerCase();
    headlinePrefix =
      lower.includes(propLabel.toLowerCase()) ||
      lower.includes('flat') ||
      lower.includes('house') ||
      lower.includes('plot')
        ? cleanedConfig
        : `${cleanedConfig} ${propLabel}`;
  } else if (typeof item.bedroomCount === 'number' && item.bedroomCount > 0) {
    headlinePrefix = `${item.bedroomCount} BHK ${propLabel}`;
  } else {
    headlinePrefix = `${kind === 'RESALE' ? '2 BHK' : '2 BHK'} ${propLabel}`;
  }

  return `${headlinePrefix} in ${locName}`;
}

function toIstCalendarDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatIstListingDate(isoDate?: string | Date | null, nowDate = new Date()): string {
  if (!isoDate) return 'Recently';
  const parsed = isoDate instanceof Date ? isoDate : new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return 'Recently';

  const todayKey = toIstCalendarDayKey(nowDate);
  const yesterdayDate = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = toIstCalendarDayKey(yesterdayDate);
  const itemKey = toIstCalendarDayKey(parsed);

  if (itemKey === todayKey) return 'Today';
  if (itemKey === yesterdayKey) return 'Yesterday';

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

function parseNumeric(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : null;
}

function collectKolkataDescendantIds(
  rows: Array<{ id: string; slug: string; parentId?: string | null; status?: string | null }>
): Set<string> {
  const published = rows.filter((r) => !r.status || r.status === 'PUBLISHED');
  const root = published.find((r) => r.slug === 'kolkata') || published[0];
  if (!root) return new Set();

  const childrenByParent = new Map<string, string[]>();
  for (const r of published) {
    if (r.parentId) {
      const list = childrenByParent.get(r.parentId) || [];
      list.push(r.id);
      childrenByParent.set(r.parentId, list);
    }
  }

  const visited = new Set<string>([root.id]);
  const queue = [root.id];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const kids = childrenByParent.get(curr) || [];
    for (const kid of kids) {
      if (!visited.has(kid)) {
        visited.add(kid);
        queue.push(kid);
      }
    }
  }
  return visited;
}

async function fetchSelectableKolkataLocationsDirect(): Promise<PostPropertyLocationOption[]> {
  const db = getDb();
  if (!db) {
    await ensureSeedData().catch(() => {});
    const rawLocations = await locationRepository.findAll().catch(() => []);
    return buildSelectableKolkataLocations(Array.isArray(rawLocations) ? rawLocations : []);
  }

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      slug: locations.slug,
      type: locations.type,
      parentId: locations.parentId,
      status: locations.status,
      featured: locations.featured,
    })
    .from(locations)
    .where(eq(locations.status, 'PUBLISHED'));

  return buildSelectableKolkataLocations(rows);
}

const cachedSelectableKolkataLocations = unstable_cache(
  async () => fetchSelectableKolkataLocationsDirect(),
  ['post-property-selectable-kolkata-locations-v1'],
  { revalidate: 120 }
);

export async function getSelectableKolkataLocations(): Promise<PostPropertyLocationOption[]> {
  try {
    return await cachedSelectableKolkataLocations();
  } catch {
    return fetchSelectableKolkataLocationsDirect();
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchProjectOptionsForLocationDirect(
  locationId?: string,
  limit = 50
): Promise<PostPropertyProjectOption[]> {
  const clampedLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? limit : 50));
  const db = getDb();

  if (!db) {
    await ensureSeedData().catch(() => {});
    const [allProjects, allDevelopers] = await Promise.all([
      projectRepository.list({
        locationId: locationId || undefined,
        lifecycleStatus: 'PUBLISHED',
        isPublished: true,
      }),
      developerRepository.list(),
    ]);
    const devMap = new Map(
      allDevelopers.map((d): [string, (typeof allDevelopers)[number]] => [d.id, d])
    );
    return allProjects
      .filter((p) => {
        const dev = devMap.get(p.developerId);
        return dev && dev.status === 'PUBLISHED' && !isKnownTestDeveloperSlug(dev.slug);
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, clampedLimit)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        locationId: p.locationId,
      }));
  }

  if (locationId && !UUID_REGEX.test(locationId)) {
    return [];
  }

  const conditions = [
    eq(projects.lifecycleStatus, 'PUBLISHED'),
    eq(projects.isPublished, true),
    eq(developers.status, 'PUBLISHED'),
  ];
  if (locationId) {
    conditions.push(eq(projects.locationId, locationId));
  }

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      locationId: projects.locationId,
      developerSlug: developers.slug,
    })
    .from(projects)
    .innerJoin(developers, eq(projects.developerId, developers.id))
    .innerJoin(locations, eq(projects.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(asc(projects.name))
    .limit(clampedLimit);

  return rows
    .filter((r) => !isKnownTestDeveloperSlug(r.developerSlug))
    .map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      locationId: r.locationId,
    }));
}

const cachedProjectOptionsForLocation = unstable_cache(
  async (locationId: string, limit: number) =>
    fetchProjectOptionsForLocationDirect(locationId || undefined, limit),
  ['post-property-project-options-v1'],
  { revalidate: 60 }
);

export async function getProjectOptionsForLocation(
  locationId?: string,
  limit = 50
): Promise<PostPropertyProjectOption[]> {
  try {
    return await cachedProjectOptionsForLocation(locationId || '', limit);
  } catch {
    return fetchProjectOptionsForLocationDirect(locationId, limit);
  }
}

async function fetchPostPropertyPage1DataDirect(): Promise<PostPropertyPage1Data> {
  const db = getDb();

  if (!db) {
    await ensureSeedData().catch(() => {});
    const [rawLocations, allProjects, allDevelopers, verifiedResales, verifiedRentals] =
      await Promise.all([
        locationRepository.findAll().catch(() => []),
        projectRepository.list({ lifecycleStatus: 'PUBLISHED', isPublished: true }).catch(() => []),
        developerRepository.list().catch(() => []),
        resaleListingService
          .listPublicListings({
            verificationStatus: 'VERIFIED',
            onlyEligiblePublic: true,
            skipAmenities: true,
          })
          .catch(() => []),
        rentalListingService
          .listPublicListings({
            verificationStatus: 'VERIFIED',
            onlyEligiblePublic: true,
            skipAmenities: true,
          })
          .catch(() => []),
      ]);

    const locationOptions = buildSelectableKolkataLocations(
      Array.isArray(rawLocations) ? rawLocations : []
    );
    const devMap = new Map(
      allDevelopers.map((d): [string, (typeof allDevelopers)[number]] => [d.id, d])
    );
    const scopeIds = collectKolkataDescendantIds(Array.isArray(rawLocations) ? rawLocations : []);
    const publishedProjectsCount = allProjects.filter((p) => {
      const dev = devMap.get(p.developerId);
      return (
        dev &&
        dev.status === 'PUBLISHED' &&
        !isKnownTestDeveloperSlug(dev.slug) &&
        (scopeIds.size === 0 || scopeIds.has(p.locationId))
      );
    }).length;

    const verifiedResaleList = (Array.isArray(verifiedResales) ? verifiedResales : []).filter(
      (item: any) => item?.isVerified === true && Boolean(item?.slug)
    );
    const verifiedRentalList = (Array.isArray(verifiedRentals) ? verifiedRentals : []).filter(
      (item: any) => item?.isVerified === true && Boolean(item?.slug)
    );

    const serverNow = new Date();
    const merged: Array<RecentPostedPropertyItem & { sortMs: number }> = [
      ...verifiedResaleList.map((item: any) => {
        const sortRaw = item.verifiedAt || item.createdAt || item.updatedAt;
        const sortMs = sortRaw ? new Date(sortRaw).getTime() : 0;
        const areaVal =
          item.propertyType === 'PLOT' ? item.plotArea : item.carpetArea || item.plotArea;
        const areaPrefix =
          typeof areaVal === 'number' && areaVal > 0
            ? `${areaVal.toLocaleString('en-IN')} sq.ft. · `
            : '';
        return {
          id: `resale-${item.id}`,
          title: buildCompactListingTitle(
            {
              propertyType: item.propertyType,
              configuration: item.configuration,
              bedroomCount: item.bedroomCount,
              locationName: item.location?.name || item.project?.location?.name,
            },
            'RESALE'
          ),
          metaText: `${areaPrefix}Resale`,
          priceDisplay: formatIndianPrice(item.askingPrice) || 'Price on Request',
          dateLabel: formatIstListingDate(sortRaw, serverNow),
          href: `/buy/${item.slug}`,
          imageUrl: normalizeMediaPublicUrl(item.media?.[0]?.url ?? null) || null,
          listingType: 'RESALE' as const,
          sortMs: Number.isFinite(sortMs) ? sortMs : 0,
        };
      }),
      ...verifiedRentalList.map((item: any) => {
        const sortRaw = item.verifiedAt || item.createdAt || item.updatedAt;
        const sortMs = sortRaw ? new Date(sortRaw).getTime() : 0;
        const areaVal = item.carpetArea || item.plotArea;
        const areaPrefix =
          typeof areaVal === 'number' && areaVal > 0
            ? `${areaVal.toLocaleString('en-IN')} sq.ft. · `
            : '';
        const rentStr = formatIndianPrice(item.monthlyRent);
        return {
          id: `rental-${item.id}`,
          title: buildCompactListingTitle(
            {
              propertyType: item.propertyType,
              configuration: item.configuration,
              bedroomCount: item.bedroomCount,
              locationName: item.location?.name || item.project?.location?.name,
            },
            'RENTAL'
          ),
          metaText: `${areaPrefix}Rent`,
          priceDisplay: rentStr ? `${rentStr}/mo` : 'Rent on Request',
          dateLabel: formatIstListingDate(sortRaw, serverNow),
          href: `/rent/${item.slug}`,
          imageUrl: normalizeMediaPublicUrl(item.media?.[0]?.url ?? null) || null,
          listingType: 'RENTAL' as const,
          sortMs: Number.isFinite(sortMs) ? sortMs : 0,
        };
      }),
    ];
    merged.sort((a, b) => b.sortMs - a.sortMs);

    return {
      locationOptions,
      stats: {
        publishedProjects: publishedProjectsCount,
        verifiedListings: verifiedResaleList.length + verifiedRentalList.length,
        locationsCovered: locationOptions.length,
      },
      recentListings: merged.slice(0, 4).map(({ sortMs: _omit, ...rest }) => rest),
    };
  }

  // Direct lightweight PostgreSQL queries (no N+1 location dashboard scans, no full amenities/configs hydration)
  const isMissingPlotAreaError = (err: unknown): boolean => {
    const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const code = e?.code || e?.cause?.code;
    const msg = `${e?.message || ''} ${e?.cause?.message || ''}`;
    return code === '42703' || /plot_area/i.test(msg);
  };

  type LightweightResaleRow = {
    id: string;
    slug: string | null;
    projectId: string | null;
    locationId: string | null;
    propertyType: string;
    configuration: string | null;
    bedroomCount: number | null;
    carpetArea: string | null;
    plotArea?: string | null;
    askingPrice: string;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  type LightweightRentalRow = {
    id: string;
    slug: string | null;
    projectId: string | null;
    locationId: string | null;
    propertyType: string;
    configuration: string | null;
    bedroomCount: number | null;
    carpetArea: string | null;
    plotArea?: string | null;
    monthlyRent: string;
    verifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };

  const fetchVerifiedResales = async (): Promise<LightweightResaleRow[]> => {
    try {
      return await db
        .select({
          id: resaleListings.id,
          slug: resaleListings.slug,
          projectId: resaleListings.projectId,
          locationId: resaleListings.locationId,
          propertyType: resaleListings.propertyType,
          configuration: resaleListings.configuration,
          bedroomCount: resaleListings.bedroomCount,
          carpetArea: resaleListings.carpetArea,
          plotArea: resaleListings.plotArea,
          askingPrice: resaleListings.askingPrice,
          verifiedAt: resaleListings.verifiedAt,
          createdAt: resaleListings.createdAt,
          updatedAt: resaleListings.updatedAt,
        })
        .from(resaleListings)
        .where(
          and(
            eq(resaleListings.lifecycleStatus, 'PUBLISHED'),
            eq(resaleListings.verificationStatus, 'VERIFIED'),
            isNotNull(resaleListings.slug)
          )
        )
        .orderBy(desc(sql`COALESCE(${resaleListings.verifiedAt}, ${resaleListings.createdAt}, ${resaleListings.updatedAt})`));
    } catch (err) {
      if (!isMissingPlotAreaError(err)) throw err;
      return db
        .select({
          id: resaleListings.id,
          slug: resaleListings.slug,
          projectId: resaleListings.projectId,
          locationId: resaleListings.locationId,
          propertyType: resaleListings.propertyType,
          configuration: resaleListings.configuration,
          bedroomCount: resaleListings.bedroomCount,
          carpetArea: resaleListings.carpetArea,
          askingPrice: resaleListings.askingPrice,
          verifiedAt: resaleListings.verifiedAt,
          createdAt: resaleListings.createdAt,
          updatedAt: resaleListings.updatedAt,
        })
        .from(resaleListings)
        .where(
          and(
            eq(resaleListings.lifecycleStatus, 'PUBLISHED'),
            eq(resaleListings.verificationStatus, 'VERIFIED'),
            isNotNull(resaleListings.slug)
          )
        )
        .orderBy(desc(sql`COALESCE(${resaleListings.verifiedAt}, ${resaleListings.createdAt}, ${resaleListings.updatedAt})`));
    }
  };

  const fetchVerifiedRentals = async (): Promise<LightweightRentalRow[]> => {
    try {
      return await db
        .select({
          id: rentalListings.id,
          slug: rentalListings.slug,
          projectId: rentalListings.projectId,
          locationId: rentalListings.locationId,
          propertyType: rentalListings.propertyType,
          configuration: rentalListings.configuration,
          bedroomCount: rentalListings.bedroomCount,
          carpetArea: rentalListings.carpetArea,
          plotArea: rentalListings.plotArea,
          monthlyRent: rentalListings.monthlyRent,
          verifiedAt: rentalListings.verifiedAt,
          createdAt: rentalListings.createdAt,
          updatedAt: rentalListings.updatedAt,
        })
        .from(rentalListings)
        .where(
          and(
            eq(rentalListings.lifecycleStatus, 'PUBLISHED'),
            eq(rentalListings.verificationStatus, 'VERIFIED'),
            isNotNull(rentalListings.slug)
          )
        )
        .orderBy(desc(sql`COALESCE(${rentalListings.verifiedAt}, ${rentalListings.createdAt}, ${rentalListings.updatedAt})`));
    } catch (err) {
      if (!isMissingPlotAreaError(err)) throw err;
      return db
        .select({
          id: rentalListings.id,
          slug: rentalListings.slug,
          projectId: rentalListings.projectId,
          locationId: rentalListings.locationId,
          propertyType: rentalListings.propertyType,
          configuration: rentalListings.configuration,
          bedroomCount: rentalListings.bedroomCount,
          carpetArea: rentalListings.carpetArea,
          monthlyRent: rentalListings.monthlyRent,
          verifiedAt: rentalListings.verifiedAt,
          createdAt: rentalListings.createdAt,
          updatedAt: rentalListings.updatedAt,
        })
        .from(rentalListings)
        .where(
          and(
            eq(rentalListings.lifecycleStatus, 'PUBLISHED'),
            eq(rentalListings.verificationStatus, 'VERIFIED'),
            isNotNull(rentalListings.slug)
          )
        )
        .orderBy(desc(sql`COALESCE(${rentalListings.verifiedAt}, ${rentalListings.createdAt}, ${rentalListings.updatedAt})`));
    }
  };

  const [locationRows, publishedProjectRows, verifiedResaleRows, verifiedRentalRows] =
    await Promise.all([
      db
        .select({
          id: locations.id,
          name: locations.name,
          slug: locations.slug,
          type: locations.type,
          parentId: locations.parentId,
          status: locations.status,
          featured: locations.featured,
        })
        .from(locations)
        .where(eq(locations.status, 'PUBLISHED')),

      db
        .select({
          id: projects.id,
          locationId: projects.locationId,
          developerSlug: developers.slug,
        })
        .from(projects)
        .innerJoin(developers, eq(projects.developerId, developers.id))
        .where(
          and(
            eq(projects.lifecycleStatus, 'PUBLISHED'),
            eq(projects.isPublished, true),
            eq(developers.status, 'PUBLISHED')
          )
        ),

      fetchVerifiedResales(),
      fetchVerifiedRentals(),
    ]);

  const locationOptions = buildSelectableKolkataLocations(locationRows);
  const locationNameById = new Map(locationRows.map((l) => [l.id, l.name]));
  const scopeIds = collectKolkataDescendantIds(locationRows);

  const eligibleProjects = publishedProjectRows.filter(
    (p) => !isKnownTestDeveloperSlug(p.developerSlug)
  );
  const eligibleProjectLocationById = new Map(eligibleProjects.map((p) => [p.id, p.locationId]));

  const scopedPublishedProjectsCount = eligibleProjects.filter(
    (p) => scopeIds.size === 0 || scopeIds.has(p.locationId)
  ).length;

  const eligibleResales = verifiedResaleRows.filter((row) => {
    if (!row.slug || !row.slug.trim()) return false;
    if (isKnownTestResaleListing(row)) return false;
    if (row.projectId && !eligibleProjectLocationById.has(row.projectId)) return false;
    return true;
  });

  const eligibleRentals = verifiedRentalRows.filter((row) => {
    if (!row.slug || !row.slug.trim()) return false;
    if (isKnownTestRentalListing(row)) return false;
    if (row.projectId && !eligibleProjectLocationById.has(row.projectId)) return false;
    return true;
  });

  // Count listings within Kolkata scope (matching marketIntelligenceService semantics)
  const scopedResaleCount = eligibleResales.filter((row) => {
    if (scopeIds.size === 0) return true;
    const resolvedLocId =
      row.locationId || (row.projectId ? eligibleProjectLocationById.get(row.projectId) : null);
    return !resolvedLocId || scopeIds.has(resolvedLocId);
  }).length;

  const scopedRentalCount = eligibleRentals.filter((row) => {
    if (scopeIds.size === 0) return true;
    const resolvedLocId =
      row.locationId || (row.projectId ? eligibleProjectLocationById.get(row.projectId) : null);
    return !resolvedLocId || scopeIds.has(resolvedLocId);
  }).length;

  // Pick top 4 combined recent listings before fetching cover photos for ONLY those <= 4 IDs
  type CandidateRow =
    | { kind: 'RESALE'; sortMs: number; sortRaw: Date | null; row: (typeof eligibleResales)[number] }
    | { kind: 'RENTAL'; sortMs: number; sortRaw: Date | null; row: (typeof eligibleRentals)[number] };

  const candidates: CandidateRow[] = [
    ...eligibleResales.slice(0, 6).map((row) => {
      const sortRaw = row.verifiedAt || row.createdAt || row.updatedAt || null;
      const sortMs = sortRaw ? new Date(sortRaw).getTime() : 0;
      return { kind: 'RESALE' as const, sortMs: Number.isFinite(sortMs) ? sortMs : 0, sortRaw, row };
    }),
    ...eligibleRentals.slice(0, 6).map((row) => {
      const sortRaw = row.verifiedAt || row.createdAt || row.updatedAt || null;
      const sortMs = sortRaw ? new Date(sortRaw).getTime() : 0;
      return { kind: 'RENTAL' as const, sortMs: Number.isFinite(sortMs) ? sortMs : 0, sortRaw, row };
    }),
  ];
  candidates.sort((a, b) => b.sortMs - a.sortMs);
  const topFour = candidates.slice(0, 4);

  const topResaleIds = topFour.filter((c) => c.kind === 'RESALE').map((c) => c.row.id);
  const topRentalIds = topFour.filter((c) => c.kind === 'RENTAL').map((c) => c.row.id);

  const [resaleMediaRows, rentalMediaRows] = await Promise.all([
    topResaleIds.length > 0
      ? db
          .select({
            listingId: resaleListingMedia.resaleListingId,
            url: resaleListingMedia.url,
            isFeatured: resaleListingMedia.isFeatured,
            sortOrder: resaleListingMedia.sortOrder,
          })
          .from(resaleListingMedia)
          .where(inArray(resaleListingMedia.resaleListingId, topResaleIds))
          .orderBy(desc(resaleListingMedia.isFeatured), asc(resaleListingMedia.sortOrder))
      : Promise.resolve([]),
    topRentalIds.length > 0
      ? db
          .select({
            listingId: rentalListingMedia.rentalListingId,
            url: rentalListingMedia.url,
            isFeatured: rentalListingMedia.isFeatured,
            sortOrder: rentalListingMedia.sortOrder,
          })
          .from(rentalListingMedia)
          .where(inArray(rentalListingMedia.rentalListingId, topRentalIds))
          .orderBy(desc(rentalListingMedia.isFeatured), asc(rentalListingMedia.sortOrder))
      : Promise.resolve([]),
  ]);

  const resaleCoverById = new Map<string, string>();
  for (const m of resaleMediaRows) {
    if (!resaleCoverById.has(m.listingId) && m.url) {
      resaleCoverById.set(m.listingId, m.url);
    }
  }
  const rentalCoverById = new Map<string, string>();
  for (const m of rentalMediaRows) {
    if (!rentalCoverById.has(m.listingId) && m.url) {
      rentalCoverById.set(m.listingId, m.url);
    }
  }

  const serverNow = new Date();
  const recentListings: RecentPostedPropertyItem[] = topFour.map((entry) => {
    if (entry.kind === 'RESALE') {
      const { row, sortRaw } = entry;
      const resolvedLocId =
        row.locationId || (row.projectId ? eligibleProjectLocationById.get(row.projectId) : null);
      const locationName = resolvedLocId ? locationNameById.get(resolvedLocId) : null;
      const carpetVal = parseNumeric(row.carpetArea);
      const plotVal = parseNumeric(row.plotArea);
      const areaVal = row.propertyType === 'PLOT' ? plotVal : carpetVal || plotVal;
      const areaPrefix =
        areaVal !== null && areaVal > 0 ? `${areaVal.toLocaleString('en-IN')} sq.ft. · ` : '';

      return {
        id: `resale-${row.id}`,
        title: buildCompactListingTitle(
          {
            propertyType: row.propertyType,
            configuration: row.configuration,
            bedroomCount: row.bedroomCount,
            locationName,
          },
          'RESALE'
        ),
        metaText: `${areaPrefix}Resale`,
        priceDisplay: formatIndianPrice(parseNumeric(row.askingPrice)) || 'Price on Request',
        dateLabel: formatIstListingDate(sortRaw, serverNow),
        href: `/buy/${row.slug}`,
        imageUrl: normalizeMediaPublicUrl(resaleCoverById.get(row.id) ?? null) || null,
        listingType: 'RESALE',
      };
    } else {
      const { row, sortRaw } = entry;
      const resolvedLocId =
        row.locationId || (row.projectId ? eligibleProjectLocationById.get(row.projectId) : null);
      const locationName = resolvedLocId ? locationNameById.get(resolvedLocId) : null;
      const carpetVal = parseNumeric(row.carpetArea);
      const plotVal = parseNumeric(row.plotArea);
      const areaVal = carpetVal || plotVal;
      const areaPrefix =
        areaVal !== null && areaVal > 0 ? `${areaVal.toLocaleString('en-IN')} sq.ft. · ` : '';
      const rentStr = formatIndianPrice(parseNumeric(row.monthlyRent));

      return {
        id: `rental-${row.id}`,
        title: buildCompactListingTitle(
          {
            propertyType: row.propertyType,
            configuration: row.configuration,
            bedroomCount: row.bedroomCount,
            locationName,
          },
          'RENTAL'
        ),
        metaText: `${areaPrefix}Rent`,
        priceDisplay: rentStr ? `${rentStr}/mo` : 'Rent on Request',
        dateLabel: formatIstListingDate(sortRaw, serverNow),
        href: `/rent/${row.slug}`,
        imageUrl: normalizeMediaPublicUrl(rentalCoverById.get(row.id) ?? null) || null,
        listingType: 'RENTAL',
      };
    }
  });

  return {
    locationOptions,
    stats: {
      publishedProjects: scopedPublishedProjectsCount,
      verifiedListings: scopedResaleCount + scopedRentalCount,
      locationsCovered: locationOptions.length,
    },
    recentListings,
  };
}

const cachedPostPropertyPage1Data = unstable_cache(
  async () => fetchPostPropertyPage1DataDirect(),
  ['post-property-page1-data-v1'],
  { revalidate: 120 }
);

export async function getPostPropertyPage1Data(): Promise<PostPropertyPage1Data> {
  try {
    return await cachedPostPropertyPage1Data();
  } catch {
    return fetchPostPropertyPage1DataDirect();
  }
}
