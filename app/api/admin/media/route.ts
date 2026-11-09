import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { projectRepository, projectMediaRepository } from '@/src/infrastructure/repositories/projectProvider';
import { developerRepository, developerMediaRepository } from '@/src/infrastructure/repositories/developerProvider';
import { resaleListingRepository } from '@/src/domain/projects/repositories/resaleRepository';
import { rentalListingRepository } from '@/src/domain/projects/repositories/rentalRepository';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { normalizeMediaPublicUrl, normalizeMediaAssetUrls } from '@/src/lib/mediaUtils';

export async function GET(req: NextRequest) {
  const reqContext = extractRequestContext(req);
  try {
    const { isTestIsolationActive } = await import('@/src/lib/testIsolationContext');
    const testIsolated = isTestIsolationActive(req);

    if (!testIsolated) {
      await ensureSeedData();
    }
    const auth = await verifyStaffCapability(req, 'MANAGE_MEDIA');
    if (!auth.authorized) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: auth.error || 'Unauthorized' },
          { status: auth.status || 401 }
        ),
        reqContext.requestId
      );
    }

    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType')?.toUpperCase() || '';
    const entityId = searchParams.get('entityId')?.trim() || '';
    const category = searchParams.get('category')?.toUpperCase() || '';
    const featuredOnly = searchParams.get('featured') === 'true';
    const search = searchParams.get('search')?.toLowerCase().trim() || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // 1. Fetch from Unified Media Repository
    const repoResult = await mediaRepository.list({
      entityType: entityType && entityType !== 'ALL' ? entityType : undefined,
      entityId: entityId || undefined,
      category: category && category !== 'ALL' ? category : undefined,
      featuredOnly,
      search: search || undefined,
      page: 1,
      limit: 500,
    });

    // 2. Fetch existing seeded / domain repository media items (only in non-isolated mode)
    let legacyItems: any[] = [];

    if (!testIsolated) {
      if (!entityType || entityType === 'ALL' || entityType === 'PROJECT') {
        const allProjects = await projectRepository.findAll();
        const projMap = new Map(allProjects.map((p) => [p.id, p]));

        let mediaList: any[] = [];
        if (entityId) {
          mediaList = await projectMediaRepository.findByProjectId(entityId);
        } else {
          mediaList = await projectMediaRepository.findAll();
        }

        for (const m of mediaList) {
          const proj = projMap.get(m.projectId);
          const normalizedUrl = normalizeMediaPublicUrl(m.url) || m.url;
          legacyItems.push({
            id: m.id,
            mediaId: m.mediaId || null,
            entityType: 'PROJECT',
            entityId: m.projectId,
            entityName: proj?.name || 'Unknown Project',
            entitySlug: proj?.slug || '',
            mediaType: m.mediaType,
            category: m.category,
            url: normalizedUrl,
            originalUrl: normalizedUrl,
            thumbnailUrl: normalizedUrl,
            webpUrl: normalizedUrl,
            altText: m.altText || null,
            caption: m.caption || null,
            sortOrder: m.sortOrder,
            isFeatured: m.isFeatured,
            watermarkApplied: normalizedUrl?.endsWith('public_wm.webp') || false,
            processingStatus: 'READY',
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
          });
        }
      }

      if (!entityType || entityType === 'ALL' || entityType === 'DEVELOPER') {
        const allDevs = await developerRepository.list();
        const devMap = new Map(allDevs.map((d) => [d.id, d]));

        let mediaList: any[] = [];
        if (entityId) {
          mediaList = await developerMediaRepository.findByDeveloperId(entityId);
        } else {
          mediaList = await developerMediaRepository.findAll();
        }

        for (const m of mediaList) {
          const dev = devMap.get(m.developerId);
          const normalizedUrl = normalizeMediaPublicUrl(m.url) || m.url;
          legacyItems.push({
            id: m.id,
            entityType: 'DEVELOPER',
            entityId: m.developerId,
            entityName: dev?.name || 'Unknown Developer',
            entitySlug: dev?.slug || '',
            mediaType: m.mediaType,
            category: m.category,
            url: normalizedUrl,
            originalUrl: normalizedUrl,
            thumbnailUrl: normalizedUrl,
            webpUrl: normalizedUrl,
            altText: null,
            caption: null,
            sortOrder: m.sortOrder,
            isFeatured: m.isFeatured,
            watermarkApplied: false,
            processingStatus: 'READY',
            createdAt: m.createdAt,
            updatedAt: m.updatedAt,
          });
        }
      }

      if (!entityType || entityType === 'ALL' || entityType === 'RESALE') {
        const allResales = await resaleListingRepository.findAll();
        const targetListings = entityId
          ? allResales.filter((r) => r.id === entityId)
          : allResales;

        for (const r of targetListings) {
          const media = await resaleListingRepository.findMediaByListingId(r.id);
          for (const m of media) {
            const normalizedUrl = normalizeMediaPublicUrl(m.url) || m.url;
            legacyItems.push({
              id: m.id,
              entityType: 'RESALE',
              entityId: m.resaleListingId,
              entityName: r.slug || `Resale #${r.id.slice(-6)}`,
              entitySlug: r.slug || r.id,
              mediaType: m.mediaType,
              category: m.category,
              url: normalizedUrl,
              originalUrl: normalizedUrl,
              thumbnailUrl: normalizedUrl,
              webpUrl: normalizedUrl,
              altText: m.altText || null,
              caption: m.caption || null,
              sortOrder: m.sortOrder,
              isFeatured: m.isFeatured,
              watermarkApplied: normalizedUrl?.endsWith('public_wm.webp') || false,
              processingStatus: 'READY',
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
            });
          }
        }
      }

      if (!entityType || entityType === 'ALL' || entityType === 'RENTAL') {
        const allRentals = await rentalListingRepository.findAll();
        const targetListings = entityId
          ? allRentals.filter((r) => r.id === entityId)
          : allRentals;

        for (const r of targetListings) {
          const media = await rentalListingRepository.findMediaByListingId(r.id);
          for (const m of media) {
            const normalizedUrl = normalizeMediaPublicUrl(m.url) || m.url;
            legacyItems.push({
              id: m.id,
              entityType: 'RENTAL',
              entityId: m.rentalListingId,
              entityName: r.slug || `Rental #${r.id.slice(-6)}`,
              entitySlug: r.slug || r.id,
              mediaType: m.mediaType,
              category: m.category,
              url: normalizedUrl,
              originalUrl: normalizedUrl,
              thumbnailUrl: normalizedUrl,
              webpUrl: normalizedUrl,
              altText: m.altText || null,
              caption: m.caption || null,
              sortOrder: m.sortOrder,
              isFeatured: m.isFeatured,
              watermarkApplied: normalizedUrl?.endsWith('public_wm.webp') || false,
              processingStatus: 'READY',
              createdAt: m.createdAt,
              updatedAt: m.updatedAt,
            });
          }
        }
      }
    }

    // Apply filtering to legacy items
    if (category && category !== 'ALL') {
      legacyItems = legacyItems.filter((i) => i.category === category);
    }
    if (featuredOnly) {
      legacyItems = legacyItems.filter((i) => i.isFeatured);
    }
    if (search) {
      legacyItems = legacyItems.filter(
        (i) =>
          i.entityName?.toLowerCase().includes(search) ||
          (i.caption && i.caption.toLowerCase().includes(search)) ||
          (i.altText && i.altText.toLowerCase().includes(search)) ||
          i.url.toLowerCase().includes(search)
      );
    }

    // Merge: unified repo items take precedence over legacy items with same ID, mediaId, or URL
    const mergedMap = new Map<string, any>();
    const repoById = new Map(repoResult.items.map((r) => [r.id, r]));
    const repoByUrl = new Map(repoResult.items.map((r) => [r.url, r]));
    const matchedRepoIds = new Set<string>();

    for (const leg of legacyItems) {
      const matchedRepo =
        repoById.get(leg.id) ||
        (leg.mediaId ? repoById.get(leg.mediaId) : undefined) ||
        (leg.url ? repoByUrl.get(leg.url) : undefined);

      if (matchedRepo) {
        matchedRepoIds.add(matchedRepo.id);
        mergedMap.set(matchedRepo.id, {
          ...matchedRepo,
          entityName: leg.entityName || matchedRepo.filename || matchedRepo.entityId,
          entitySlug: leg.entitySlug || '',
        });
      } else {
        mergedMap.set(leg.id, leg);
      }
    }

    for (const repoItem of repoResult.items) {
      if (!matchedRepoIds.has(repoItem.id)) {
        mergedMap.set(repoItem.id, {
          ...repoItem,
          entityName: repoItem.filename || repoItem.entityId,
        });
      }
    }

    const mergedList = Array.from(mergedMap.values());
    mergedList.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.id || '').localeCompare(b.id || '');
    });

    const boundedLimit = Math.min(Math.max(1, limit), 100);
    const total = mergedList.length;
    const startIndex = (page - 1) * boundedLimit;
    const paginatedItems = mergedList
      .slice(startIndex, startIndex + boundedLimit)
      .map((item) => normalizeMediaAssetUrls(item));

    const response = NextResponse.json({
      success: true,
      data: paginatedItems,
      items: paginatedItems,
      total,
      page,
      limit: boundedLimit,
    });

    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return withCorrelationHeaders(response, reqContext.requestId);
  } catch (error: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: error.message }, { status: 500 }),
      reqContext.requestId
    );
  }
}
