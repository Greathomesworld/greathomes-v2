import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import {
  mediaProcessingService,
  isSingleDerivativeWatermarkedAsset,
} from '@/src/domain/media/services/mediaProcessingService';
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

  // Prevent double-watermarking on single-derivative watermarked WebP assets (`public_wm.webp`)
  if (isSingleDerivativeWatermarkedAsset(existing)) {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          code: 'SINGLE_DERIVATIVE_WATERMARKED_ASSET',
          error:
            'This property photograph is stored as a final watermarked WebP asset without a separate unwatermarked original. Reprocessing is blocked to prevent double watermarking. Please use Replace Asset to upload a new image.',
        },
        { status: 409 }
      ),
      reqContext.requestId
    );
  }

  if (existing.mediaType === 'DOCUMENT' || existing.mimeType === 'application/pdf') {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          code: 'DOCUMENT_REPROCESS_NOT_APPLICABLE',
          error: 'PDF documents are preserved in their original format and do not undergo raster reprocessing.',
        },
        { status: 400 }
      ),
      reqContext.requestId
    );
  }

  if (existing.mimeType === 'image/svg+xml') {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          code: 'SVG_LOGO_REPROCESS_NOT_APPLICABLE',
          error: 'Vector SVG logos are preserved in vector format and are never watermarked.',
        },
        { status: 400 }
      ),
      reqContext.requestId
    );
  }

  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional
    }

    const storage = getStorageProviderForAsset(existing.storageProvider);
    let originalBuffer = await storage.read(existing.storageKey);

    if (!originalBuffer && existing.originalUrl) {
      try {
        const fetchRes = await fetch(existing.originalUrl);
        if (fetchRes.ok) {
          const ab = await fetchRes.arrayBuffer();
          originalBuffer = Buffer.from(ab);
        }
      } catch (fetchErr) {
        console.warn('Fetch fallback for reprocess failed:', fetchErr);
      }
    }

    if (!originalBuffer || originalBuffer.length === 0) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Unwatermarked source asset could not be retrieved from storage for reprocessing.',
          },
          { status: 404 }
        ),
        reqContext.requestId
      );
    }

    const watermarkOptions = body.watermarkConfig || undefined;
    const processed = await mediaProcessingService.reprocessMedia(
      originalBuffer,
      existing.filename,
      existing.mimeType,
      existing.category,
      existing.entityType,
      existing.entityId,
      watermarkOptions
    );

    const updated = await mediaRepository.update(id, {
      width: processed.width,
      height: processed.height,
      mimeType: processed.mimeType,
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

    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'UPDATE',
        resourceType: 'MEDIA',
        resourceId: id,
        resourceLabel: existing.filename,
        before: { watermarkApplied: existing.watermarkApplied },
        after: { watermarkApplied: processed.watermarkApplied, variants: processed.variants },
        metadata: { entityType: existing.entityType, entityId: existing.entityId, subAction: 'REPROCESS' },
        success: true,
      }
    );

    return withCorrelationHeaders(
      NextResponse.json({ success: true, data: updated }),
      reqContext.requestId
    );
  } catch (err: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: err.message }, { status: 500 }),
      reqContext.requestId
    );
  }
}
