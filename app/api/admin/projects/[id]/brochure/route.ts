import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { ensureSeedData } from '@/src/infrastructure/seed';
import {
  projectRepository,
  projectMediaRepository,
} from '@/src/infrastructure/repositories/projectProvider';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { getStorageProvider } from '@/src/domain/media/storage/storageProvider';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

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

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const reqContext = extractRequestContext(req);
  const staffAuth = await verifyInternalStaff(req);
  const capAuth = await verifyStaffCapability(req, 'MANAGE_MEDIA');
  if (!staffAuth.authorized && !capAuth.authorized) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Unauthorized administrator request.' },
        { status: 401 }
      ),
      reqContext.requestId
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;

    let project = await projectRepository.findById(id);
    if (!project) {
      project = await projectRepository.findBySlug(id);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 }),
        reqContext.requestId
      );
    }

    const mediaList = await projectMediaRepository.findByProjectId(project.id);
    const brochures = mediaList
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

    const active = brochures[0] || null;
    if (!active) {
      return withCorrelationHeaders(
        NextResponse.json({
          success: true,
          brochure: {
            available: false,
            projectMediaId: null,
            mediaId: null,
            filename: null,
            fileSizeBytes: null,
            updatedAt: null,
            previewUrl: null,
            downloadUrl: null,
          },
        }),
        reqContext.requestId
      );
    }

    let filename = active.caption || active.altText || `${project.name} Brochure.pdf`;
    let fileSizeBytes: number | null = null;
    if (active.mediaId) {
      const asset = await mediaRepository.findById(active.mediaId);
      if (asset) {
        if (asset.filename) filename = asset.filename;
        if (typeof asset.fileSizeBytes === 'number') fileSizeBytes = asset.fileSizeBytes;
      }
    }

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        brochure: {
          available: true,
          projectMediaId: active.id,
          mediaId: active.mediaId || active.id,
          filename,
          fileSizeBytes,
          updatedAt:
            active.updatedAt instanceof Date
              ? active.updatedAt.toISOString()
              : String(active.updatedAt || ''),
          previewUrl: `/api/projects/${project.id}/brochure/download`,
          downloadUrl: `/api/projects/${project.id}/brochure/download?download=1`,
        },
      }),
      reqContext.requestId
    );
  } catch (error: any) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: error.message || 'Failed to fetch project brochure details.' },
        { status: 500 }
      ),
      reqContext.requestId
    );
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const reqContext = extractRequestContext(req);
  const mediaAuth = await verifyStaffCapability(req, 'MANAGE_MEDIA');
  const projectAuth = await verifyStaffCapability(req, 'project.update');
  if (!mediaAuth.authorized && !projectAuth.authorized) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: mediaAuth.error || 'Unauthorized administrator action.' },
        { status: mediaAuth.status || 401 }
      ),
      reqContext.requestId
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;

    let project = await projectRepository.findById(id);
    if (!project) {
      project = await projectRepository.findBySlug(id);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: 'Project not found.' }, { status: 404 }),
        reqContext.requestId
      );
    }

    const mediaList = await projectMediaRepository.findByProjectId(project.id);
    const brochures = mediaList.filter(
      (m) => (m.category || '').toUpperCase() === 'BROCHURE'
    );

    if (brochures.length === 0) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'No brochure is currently attached to this project.' },
          { status: 404 }
        ),
        reqContext.requestId
      );
    }

    const storage = getStorageProvider();
    const allProjects = await projectRepository.findAll();

    for (const brochure of brochures) {
      // 1. Dissociate brochure record from this project
      await projectMediaRepository.delete(brochure.id);

      // 2. Check if any other project or configuration references this media asset or URL before deleting underlying storage
      let isReferencedElsewhere = false;
      for (const otherProj of allProjects) {
        if (otherProj.id === project.id) continue;
        const otherMedia = await projectMediaRepository.findByProjectId(otherProj.id);
        if (
          otherMedia.some(
            (om) =>
              (brochure.mediaId && (om.mediaId === brochure.mediaId || om.id === brochure.mediaId)) ||
              (brochure.url && om.url === brochure.url)
          )
        ) {
          isReferencedElsewhere = true;
          break;
        }
      }

      if (brochure.mediaId && !isReferencedElsewhere) {
        const refCheck = await mediaRepository.checkReferenced(brochure.mediaId);
        if (!refCheck.referenced) {
          const asset = await mediaRepository.findById(brochure.mediaId);
          await mediaRepository.delete(brochure.mediaId);
          const keyToDelete = asset?.storageKey || deriveStorageKeyFromUrl(brochure.url);
          if (keyToDelete) {
            await storage.delete(keyToDelete).catch(() => false);
          }
        }
      } else if (!brochure.mediaId && !isReferencedElsewhere && brochure.url) {
        const keyToDelete = deriveStorageKeyFromUrl(brochure.url);
        if (keyToDelete) {
          await storage.delete(keyToDelete).catch(() => false);
        }
      }
    }

    // Revalidate project detail and listing caches
    try {
      revalidatePath(`/projects/${project.slug}`);
      revalidatePath('/projects');
      revalidatePath('/');
    } catch {
      // Non-blocking revalidation in dev/test contexts
    }

    const activeStaff = mediaAuth.staff || projectAuth.staff || null;
    await auditService.record(
      req,
      activeStaff ? { id: activeStaff.id, role: activeStaff.role } : null,
      {
        action: 'DELETE',
        resourceType: 'MEDIA',
        resourceId: brochures[0].mediaId || brochures[0].id,
        resourceLabel: `${project.name} Brochure`,
        before: {
          projectId: project.id,
          brochureCount: brochures.length,
          brochureIds: brochures.map((b) => b.id),
        },
        after: null,
        metadata: {
          projectId: project.id,
          projectSlug: project.slug,
          category: 'BROCHURE',
        },
        success: true,
      }
    );

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        message: 'Project brochure removed successfully.',
      }),
      reqContext.requestId
    );
  } catch (error: any) {
    console.error('Error removing project brochure:', error);
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: error.message || 'Failed to remove project brochure.' },
        { status: 500 }
      ),
      reqContext.requestId
    );
  }
}
