import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { mediaProcessingService } from '@/src/domain/media/services/mediaProcessingService';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { getStorageProviderForAsset } from '@/src/domain/media/storage/storageProvider';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function POST(
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
    const contentType = req.headers.get('content-type') || '';
    let filename = '';
    let mimeType = '';
    let fileBuffer: Buffer | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: 'No replacement file provided.' }, { status: 400 }),
          reqContext.requestId
        );
      }
      filename = file.name;
      mimeType = file.type || (filename.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
      fileBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      const body = await req.json();
      filename = body.filename || 'replacement.jpg';
      mimeType = body.mimeType || (filename.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
      const rawData = body.fileBase64 || body.data || '';
      const base64Str = rawData.replace(/^data:[a-zA-Z0-9/+.-]+;base64,/, '');
      fileBuffer = Buffer.from(base64Str, 'base64');
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: 'Empty file buffer received.' }, { status: 400 }),
        reqContext.requestId
      );
    }

    // 1. Process replacement file under the asset's category and entity policy
    const processed = await mediaProcessingService.processUpload(
      fileBuffer,
      filename,
      mimeType,
      existing.category,
      existing.entityType,
      existing.entityId
    );

    const oldStorageKey = existing.storageKey;
    const oldStorageProvider = existing.storageProvider;
    const oldUrls = [
      existing.url,
      existing.originalUrl,
      existing.watermarkedUrl,
      existing.webpUrl,
      existing.thumbnailUrl,
    ].filter((u): u is string => Boolean(u));

    // 2. Check if old storage object is shared with any other media_assets record before updating
    const wasOldStorageShared = await mediaRepository.isStorageObjectShared(existing);

    // 3. Update existing media_assets record with new URLs, storageKey, dimensions, and variants while preserving ID
    const updated = await mediaRepository.update(id, {
      filename: processed.filename,
      mimeType: processed.mimeType,
      width: processed.width,
      height: processed.height,
      fileSizeBytes: processed.originalSizeBytes,
      storageProvider: processed.storageProvider,
      storageKey: processed.storageKey,
      url: processed.variants.publicUrl,
      originalUrl: processed.variants.original,
      thumbnailUrl: processed.variants.thumbnail,
      webpUrl: processed.variants.webp,
      avifUrl: processed.variants.avif,
      watermarkedUrl: processed.variants.watermarkedWebp,
      watermarkApplied: processed.watermarkApplied,
      variants: processed.variants,
      processingStatus: processed.processingStatus,
    });

    // 4. Propagate new URL across referencing rows in project_media, developer_media, resale_listing_media, rental_listing_media
    const propagatedReferences = await mediaRepository.propagateReplacedAssetUrl(
      id,
      oldUrls,
      processed.variants.publicUrl
    );

    // 5. Delete superseded storage object ONLY after replacement and DB updates have succeeded
    let oldStorageDeleted = false;
    if (
      oldStorageKey &&
      oldStorageKey !== processed.storageKey &&
      !wasOldStorageShared
    ) {
      try {
        const storage = getStorageProviderForAsset(oldStorageProvider);
        oldStorageDeleted = await storage.delete(oldStorageKey);
      } catch (delErr) {
        console.warn('[POST /api/admin/media/[id]/replace] Superseded object delete warning:', delErr);
      }
    }

    // Audit log
    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'UPDATE',
        resourceType: 'MEDIA',
        resourceId: id,
        resourceLabel: processed.filename,
        before: { filename: existing.filename, url: existing.url, storageKey: oldStorageKey },
        after: { filename: processed.filename, url: processed.variants.publicUrl, storageKey: processed.storageKey },
        metadata: {
          entityType: existing.entityType,
          entityId: existing.entityId,
          subAction: 'REPLACE',
          oldStorageDeleted,
          propagatedReferences,
        },
        success: true,
      }
    );

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        data: updated,
        oldStorageDeleted,
        propagatedReferences,
      }),
      reqContext.requestId
    );
  } catch (err: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: err.message }, { status: 400 }),
      reqContext.requestId
    );
  }
}
