import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { getStorageProviderForAsset } from '@/src/domain/media/storage/storageProvider';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
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

  const { id } = await props.params;
  const asset = await mediaRepository.findById(id);
  if (!asset) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Media asset not found.' }, { status: 404 }),
      reqContext.requestId
    );
  }

  return withCorrelationHeaders(
    NextResponse.json({ success: true, data: asset, media: asset }),
    reqContext.requestId
  );
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
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

  const { id } = await props.params;
  const existing = await mediaRepository.findById(id);
  if (!existing) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Media asset not found.' }, { status: 404 }),
      reqContext.requestId
    );
  }

  try {
    const body = await req.json();
    const updates: any = {};
    if (body.altText !== undefined) updates.altText = body.altText;
    if (body.caption !== undefined) updates.caption = body.caption;
    if (body.category !== undefined) updates.category = body.category;
    if (body.sortOrder !== undefined) updates.sortOrder = parseInt(body.sortOrder, 10);
    if (body.isFeatured !== undefined) updates.isFeatured = Boolean(body.isFeatured);

    const updated = await mediaRepository.update(id, updates);

    if (body.isFeatured) {
      await mediaRepository.setFeatured(id, existing.entityType, existing.entityId);
    }

    // Audit log
    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'UPDATE',
        resourceType: 'MEDIA',
        resourceId: id,
        resourceLabel: existing.filename,
        before: { altText: existing.altText, caption: existing.caption, category: existing.category },
        after: { altText: updated?.altText, caption: updated?.caption, category: updated?.category },
        metadata: { entityType: existing.entityType, entityId: existing.entityId },
        success: true,
      }
    );

    return withCorrelationHeaders(
      NextResponse.json({ success: true, data: updated }),
      reqContext.requestId
    );
  } catch (err: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: err.message }, { status: 400 }),
      reqContext.requestId
    );
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
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

  const { id } = await props.params;
  const existing = await mediaRepository.findById(id);
  if (!existing) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Media asset not found.' }, { status: 404 }),
      reqContext.requestId
    );
  }

  // 1. Safe deletion & referential integrity check (e.g. active floorPlanMediaId on project_configurations)
  const refCheck = await mediaRepository.checkReferenced(id);
  if (refCheck.referenced) {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          error:
            refCheck.reason ||
            'Cannot delete media asset because it is actively referenced by another resource.',
        },
        { status: 409 }
      ),
      reqContext.requestId
    );
  }

  // 2. Check whether the underlying storage object is shared by any other media_assets record
  const isSharedObject = await mediaRepository.isStorageObjectShared(existing);

  // 3. Remove entity-media linkage records (project_media, developer_media, resale_listing_media, rental_listing_media)
  const removedLinks = await mediaRepository.removeEntityMediaReferences(existing);

  // 4. Delete media_assets record
  await mediaRepository.delete(id);

  // 5. Delete physical object from storage ONLY when not shared with any other media asset
  let storageDeleted = false;
  if (!isSharedObject && existing.storageKey) {
    try {
      const storage = getStorageProviderForAsset(existing.storageProvider);
      storageDeleted = await storage.delete(existing.storageKey);
    } catch (storageErr) {
      console.warn('[DELETE /api/admin/media/[id]] Storage object delete warning:', storageErr);
    }
  }

  // Audit log
  await auditService.record(
    req,
    auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
    {
      action: 'DELETE',
      resourceType: 'MEDIA',
      resourceId: id,
      resourceLabel: existing.filename,
      before: { id, filename: existing.filename, url: existing.url, storageKey: existing.storageKey },
      after: null,
      metadata: {
        entityType: existing.entityType,
        entityId: existing.entityId,
        filename: existing.filename,
        storageDeleted,
        removedLinks,
      },
      success: true,
    }
  );

  return withCorrelationHeaders(
    NextResponse.json({
      success: true,
      message: 'Media asset deleted successfully.',
      storageDeleted,
      removedLinks,
    }),
    reqContext.requestId
  );
}
