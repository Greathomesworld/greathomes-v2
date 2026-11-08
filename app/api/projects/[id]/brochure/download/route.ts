import { NextRequest, NextResponse } from 'next/server';
import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  projectRepository,
  projectMediaRepository,
} from '@/src/infrastructure/repositories/projectProvider';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { getStorageProvider } from '@/src/domain/media/storage/storageProvider';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { verifyBrochureDownloadToken } from '@/src/lib/brochureToken';
import { validatePdfContent } from '@/src/lib/fileSecurity';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function deriveStorageKeyFromUrl(url: string): string {
  const cleanUrl = url.split('?')[0].trim();
  if (cleanUrl.startsWith('/uploads/')) {
    return cleanUrl.replace(/^\/uploads\//, '');
  }
  const mediaIdx = cleanUrl.indexOf('media/');
  if (mediaIdx >= 0) {
    return cleanUrl.slice(mediaIdx);
  }
  return cleanUrl.replace(/^\/+/, '');
}

function sanitizeDownloadFilename(rawName: string, fallbackSlug: string): string {
  const cleaned = rawName
    .replace(/[^a-zA-Z0-9._\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  const base = cleaned || `${fallbackSlug}_Brochure.pdf`;
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const { requestId } = extractRequestContext(req);

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const isDownloadAttachment = searchParams.get('download') === '1';

    // 1. Resolve canonical project
    let project = await projectRepository.findById(id);
    if (!project) {
      project = await projectRepository.findBySlug(id);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Project not found.' },
          { status: 404 }
        ),
        requestId
      );
    }

    // 2. Verify authorization: either valid short-lived buyer token OR internal staff/admin
    let isAuthorizedStaff = false;
    let verifiedTokenBrochureId: string | null = null;

    if (token) {
      const tokenCheck = verifyBrochureDownloadToken(token, project.id);
      if (!tokenCheck.valid || !tokenCheck.payload) {
        return withCorrelationHeaders(
          NextResponse.json(
            {
              success: false,
              error: tokenCheck.error || 'Unauthorized brochure download request.',
            },
            { status: 403 }
          ),
          requestId
        );
      }
      verifiedTokenBrochureId = tokenCheck.payload.brochureId;
    } else {
      const staffAuth = await verifyInternalStaff(req);
      const mediaCap = await verifyStaffCapability(req, 'MANAGE_MEDIA');
      if (staffAuth.authorized || mediaCap.authorized) {
        isAuthorizedStaff = true;
      } else {
        return withCorrelationHeaders(
          NextResponse.json(
            {
              success: false,
              error: 'Brochure access requires contact registration or administrator authorization.',
            },
            { status: 401 }
          ),
          requestId
        );
      }
    }

    // Public users may only download brochures for published projects
    if (!isAuthorizedStaff) {
      const isPublished = project.lifecycleStatus
        ? project.lifecycleStatus === 'PUBLISHED'
        : project.isPublished !== false;
      if (!isPublished) {
        return withCorrelationHeaders(
          NextResponse.json(
            { success: false, error: 'Project brochure is not publicly available.' },
            { status: 404 }
          ),
          requestId
        );
      }
    }

    // 3. Resolve current active brochure for this project
    const projectMediaList = await projectMediaRepository.findByProjectId(project.id);
    const brochureMediaList = projectMediaList
      .filter(
        (m) =>
          (m.category || '').toUpperCase() === 'BROCHURE' &&
          m.url &&
          m.url.trim().length > 0
      )
      .sort((a, b) => {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return timeB - timeA || a.sortOrder - b.sortOrder;
      });

    const activeBrochure = brochureMediaList[0] || null;
    if (!activeBrochure) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'No active brochure found for this project.' },
          { status: 404 }
        ),
        requestId
      );
    }

    // Ensure token was issued for the currently active brochure (prevents serving stale/removed brochure)
    if (
      verifiedTokenBrochureId &&
      verifiedTokenBrochureId !== activeBrochure.id &&
      verifiedTokenBrochureId !== activeBrochure.mediaId
    ) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'This brochure has been updated. Please request the latest brochure.',
          },
          { status: 410 }
        ),
        requestId
      );
    }

    // 4. Read PDF bytes from storage provider
    let storageKey = deriveStorageKeyFromUrl(activeBrochure.url);
    let rawFilename =
      activeBrochure.caption ||
      activeBrochure.altText ||
      `${project.name}_Brochure.pdf`;

    if (activeBrochure.mediaId) {
      const asset = await mediaRepository.findById(activeBrochure.mediaId);
      if (asset) {
        if (asset.storageKey) {
          storageKey = asset.storageKey;
        }
        if (asset.filename) {
          rawFilename = asset.filename;
        }
      }
    }

    const storage = getStorageProvider();
    const pdfBuffer = await storage.read(storageKey);
    if (!pdfBuffer) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Brochure document file could not be read from storage.' },
          { status: 404 }
        ),
        requestId
      );
    }

    const pdfCheck = validatePdfContent(pdfBuffer);
    if (!pdfCheck.valid) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Stored brochure document failed integrity verification.' },
          { status: 500 }
        ),
        requestId
      );
    }

    const safeFilename = sanitizeDownloadFilename(rawFilename, project.slug);
    const dispositionType = isDownloadAttachment ? 'attachment' : 'inline';

    const response = new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBuffer.length),
        'Content-Disposition': `${dispositionType}; filename="${safeFilename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });

    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    console.error('Brochure download error:', error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Failed to serve project brochure.' },
        { status: 500 }
      ),
      requestId
    );
  }
}
