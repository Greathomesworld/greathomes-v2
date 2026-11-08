import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

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
  const { isTestIsolationActive } = await import('@/src/lib/testIsolationContext');
  const testIsolated = isTestIsolationActive(req);

  let existing = await mediaRepository.findById(id);
  let resolvedProjectMediaId = id;
  let standaloneProjectMedia: any = null;

  if (!existing && !testIsolated) {
    const { projectMediaRepository } = await import('@/src/infrastructure/repositories/projectProvider');
    const pm = await projectMediaRepository.findById(id);
    if (pm) {
      resolvedProjectMediaId = pm.id;
      if (pm.mediaId) {
        existing = await mediaRepository.findById(pm.mediaId);
      }
      if (!existing) {
        standaloneProjectMedia = pm;
      }
    }
  }

  if (!existing && !standaloneProjectMedia) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Media asset not found.' }, { status: 404 }),
      reqContext.requestId
    );
  }

  try {
    const body = await req.json();
    const isFeatured = body.isFeatured !== undefined ? Boolean(body.isFeatured) : true;

    if (existing) {
      if (isFeatured) {
        await mediaRepository.setFeatured(existing.id, existing.entityType, existing.entityId);
      } else {
        await mediaRepository.update(existing.id, { isFeatured: false });
      }

      if (existing.entityType === 'PROJECT' && !testIsolated) {
        const { projectMediaRepository } = await import('@/src/infrastructure/repositories/projectProvider');
        const allProjectMedia = await projectMediaRepository.findByProjectId(existing.entityId);
        for (const m of allProjectMedia) {
          const matchesTarget = m.id === resolvedProjectMediaId || m.id === existing.id || m.mediaId === existing.id;
          const newFeatured = isFeatured ? matchesTarget : false;
          if (m.isFeatured !== newFeatured) {
            await projectMediaRepository.update(m.id, { isFeatured: newFeatured });
          }
        }
      }

      const updated = await mediaRepository.findById(existing.id);

      // Audit log
      await auditService.record(
        req,
        auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
        {
          action: 'UPDATE',
          resourceType: 'MEDIA',
          resourceId: id,
          resourceLabel: existing.filename,
          before: { isFeatured: existing.isFeatured },
          after: { isFeatured },
          metadata: { entityType: existing.entityType, entityId: existing.entityId, subAction: isFeatured ? 'SET_FEATURED' : 'UNSET_FEATURED' },
          success: true,
        }
      );

      return withCorrelationHeaders(
        NextResponse.json({ success: true, data: updated }),
        reqContext.requestId
      );
    } else if (standaloneProjectMedia) {
      const { projectMediaRepository } = await import('@/src/infrastructure/repositories/projectProvider');
      const allProjectMedia = await projectMediaRepository.findByProjectId(standaloneProjectMedia.projectId);
      for (const m of allProjectMedia) {
        const matchesTarget = m.id === standaloneProjectMedia.id;
        const newFeatured = isFeatured ? matchesTarget : false;
        if (m.isFeatured !== newFeatured) {
          await projectMediaRepository.update(m.id, { isFeatured: newFeatured });
        }
      }

      return withCorrelationHeaders(
        NextResponse.json({ success: true, data: { ...standaloneProjectMedia, isFeatured } }),
        reqContext.requestId
      );
    }
  } catch (err: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: err.message }, { status: 400 }),
      reqContext.requestId
    );
  }
}
