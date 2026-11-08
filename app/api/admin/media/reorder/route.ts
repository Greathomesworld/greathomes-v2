import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { revalidateResalePaths, revalidateRentalPaths } from '@/src/lib/revalidateListingPaths';

export async function PATCH(req: NextRequest) {
  const reqContext = extractRequestContext(req);
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

  try {
    const body = await req.json();
    const items = body.items as { id: string; sortOrder: number; isFeatured?: boolean }[];

    if (!Array.isArray(items) || items.length === 0) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Expected items array with id and sortOrder.' },
          { status: 400 }
        ),
        reqContext.requestId
      );
    }

    await mediaRepository.reorder(items);

    const { isTestIsolationActive } = await import('@/src/lib/testIsolationContext');
    if (!isTestIsolationActive(req)) {
      const { projectMediaRepository } = await import('@/src/infrastructure/repositories/projectProvider');
      const { resaleListingService } = await import('@/src/domain/projects/services/resaleService');
      const { rentalListingService } = await import('@/src/domain/projects/services/rentalService');

      const touchedResaleListingIds = new Set<string>();
      const touchedRentalListingIds = new Set<string>();

      for (const item of items) {
        try {
          await projectMediaRepository.update(item.id, { sortOrder: item.sortOrder });
        } catch {
          // ignore if not project_media
        }

        try {
          const updatedResaleMedia = await resaleListingService.updateMedia(item.id, {
            sortOrder: item.sortOrder,
            ...(item.isFeatured !== undefined ? { isFeatured: item.isFeatured } : {}),
          });
          if (updatedResaleMedia?.resaleListingId) {
            touchedResaleListingIds.add(updatedResaleMedia.resaleListingId);
          }
        } catch {
          // ignore if not resale_listing_media
        }

        try {
          const updatedRentalMedia = await rentalListingService.updateMedia(item.id, {
            sortOrder: item.sortOrder,
            ...(item.isFeatured !== undefined ? { isFeatured: item.isFeatured } : {}),
          });
          if (updatedRentalMedia?.rentalListingId) {
            touchedRentalListingIds.add(updatedRentalMedia.rentalListingId);
          }
        } catch {
          // ignore if not rental_listing_media
        }
      }

      for (const resaleId of touchedResaleListingIds) {
        const listing = await resaleListingService.getAdminListingById(resaleId).catch(() => null);
        revalidateResalePaths({
          id: resaleId,
          slug: listing?.slug,
          projectSlug: listing?.project?.slug,
          locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
        });
      }

      for (const rentalId of touchedRentalListingIds) {
        const listing = await rentalListingService.getAdminListingById(rentalId).catch(() => null);
        revalidateRentalPaths({
          id: rentalId,
          slug: listing?.slug,
          projectSlug: listing?.project?.slug,
          locationSlug: listing?.location?.slug ?? listing?.project?.location?.slug,
        });
      }
    }

    // Audit log
    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'UPDATE',
        resourceType: 'MEDIA',
        resourceId: items[0]?.id || 'batch',
        resourceLabel: `Reorder ${items.length} items`,
        before: null,
        after: { items },
        metadata: { count: items.length, subAction: 'REORDER' },
        success: true,
      }
    );

    return withCorrelationHeaders(
      NextResponse.json({ success: true, message: 'Media reordered successfully.' }),
      reqContext.requestId
    );
  } catch (err: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: err.message }, { status: 400 }),
      reqContext.requestId
    );
  }
}
