import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
} from '@/src/infrastructure/repositories/projectProvider';
import { MediaAsset, mediaRepository } from '@/src/domain/media/repositories/mediaRepository';
import { mediaProcessingService } from '@/src/domain/media/services/mediaProcessingService';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

/**
 * Helper to resolve the full floor plan gallery list for a configuration,
 * sorted with Primary first, followed by sortOrder ASC and createdAt ASC.
 */
async function getConfigurationFloorPlanGallery(projectId: string, configId: string, primaryMediaId?: string | null) {
  const allProjectMedia = await projectMediaRepository.findByProjectId(projectId);
  const configMedia = allProjectMedia.filter(
    (pm) => pm.configurationId === configId && pm.category === 'FLOOR_PLANS'
  );

  // Map each project_media record to its underlying MediaAsset where possible
  const galleryItems = await Promise.all(
    configMedia.map(async (pm) => {
      const targetId = pm.mediaId || pm.id;
      let asset: MediaAsset | null = null;
      if (targetId) {
        asset = await mediaRepository.findById(targetId);
      }
      const isPrimary = Boolean(
        (primaryMediaId && (targetId === primaryMediaId || pm.id === primaryMediaId)) || pm.isFeatured
      );
      return {
        id: pm.id,
        projectMediaId: pm.id,
        mediaId: targetId,
        projectId: pm.projectId,
        configurationId: pm.configurationId,
        url: asset?.url || pm.url,
        thumbnailUrl: asset?.thumbnailUrl || pm.url,
        webpUrl: asset?.webpUrl,
        avifUrl: asset?.avifUrl,
        watermarkedUrl: asset?.watermarkedUrl,
        altText: pm.altText || asset?.altText || null,
        caption: pm.caption || asset?.caption || null,
        sortOrder: pm.sortOrder ?? 0,
        isFeatured: isPrimary,
        isPrimary,
        width: asset?.width ?? 0,
        height: asset?.height ?? 0,
        fileSizeBytes: asset?.fileSizeBytes ?? 0,
        mimeType: asset?.mimeType || 'image/webp',
        createdAt: pm.createdAt,
      };
    })
  );

  // Sort: Primary first, then sortOrder ASC, then createdAt ASC
  galleryItems.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return galleryItems;
}

/**
 * GET /api/projects/[id]/configurations/[configId]/floor-plan
 * Retrieves all floor plan gallery items for a configuration.
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string; configId: string }> }
) {
  const reqContext = extractRequestContext(req);
  try {
    const { id: projectId, configId } = await props.params;

    let project = await projectRepository.findById(projectId);
    if (!project) {
      project = await projectRepository.findBySlug(projectId);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Project '${projectId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    const config = await projectConfigurationRepository.findById(configId);
    if (!config) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Configuration '${configId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    if (config.projectId !== project.id) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: `Configuration '${configId}' does not belong to project '${project.id}'.` },
          { status: 400 }
        ),
        reqContext.requestId
      );
    }

    const gallery = await getConfigurationFloorPlanGallery(project.id, config.id, config.floorPlanMediaId);

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        primaryMediaId: config.floorPlanMediaId,
        floorPlans: gallery,
        total: gallery.length,
        configuration: config,
      }),
      reqContext.requestId
    );
  } catch (err: any) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: err.message || 'Failed to retrieve floor plan gallery.' }, { status: 500 }),
      reqContext.requestId
    );
  }
}

/**
 * POST /api/projects/[id]/configurations/[configId]/floor-plan
 * Uploads, processes, and associates single or batch floor plans to a ProjectConfiguration.
 */
export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string; configId: string }> }
) {
  const reqContext = extractRequestContext(req);
  let auth = await verifyStaffCapability(req, 'MANAGE_CONFIGURATIONS');
  if (!auth.authorized) {
    auth = await verifyStaffCapability(req, 'MANAGE_MEDIA');
  }
  if (!auth.authorized) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 }),
      reqContext.requestId
    );
  }

  try {
    const { id: projectId, configId } = await props.params;

    let project = await projectRepository.findById(projectId);
    if (!project) {
      project = await projectRepository.findBySlug(projectId);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Project '${projectId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    let config = await projectConfigurationRepository.findById(configId);
    if (!config) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Configuration '${configId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    if (config.projectId !== project.id) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: `Configuration '${configId}' does not belong to project '${project.id}'.` },
          { status: 400 }
        ),
        reqContext.requestId
      );
    }

    const contentType = req.headers.get('content-type') || '';
    const filesToProcess: { fileBuffer: Buffer; filename: string; mimeType: string; altText?: string; caption?: string }[] = [];
    let watermarkMode: any = 'AUTO';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      watermarkMode = formData.get('watermarkMode') || 'AUTO';
      const altText = (formData.get('altText') as string) || undefined;
      const caption = (formData.get('caption') as string) || undefined;

      // Extract all file attachments (handles single 'file' or multiple 'files')
      const formFiles = [...formData.getAll('files'), ...formData.getAll('file')].filter(
        (f): f is File => f instanceof File && f.size > 0
      );

      if (formFiles.length === 0) {
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: 'No files provided in multipart form data.' }, { status: 400 }),
          reqContext.requestId
        );
      }

      for (const file of formFiles) {
        const arrayBuffer = await file.arrayBuffer();
        filesToProcess.push({
          fileBuffer: Buffer.from(arrayBuffer),
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          altText,
          caption,
        });
      }
    } else {
      // JSON body (single or array of base64 files)
      const body = await req.json();
      watermarkMode = body.watermarkMode || 'AUTO';

      const rawItems = Array.isArray(body.files) ? body.files : [body];
      for (const item of rawItems) {
        if (!item.fileBase64 && !item.data) continue;
        const filename = item.filename || `${config.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-floor-plan.png`;
        const mimeType = item.mimeType || 'image/png';
        const base64Str = (item.fileBase64 || item.data).replace(/^data:image\/[a-z]+;base64,/, '');
        filesToProcess.push({
          fileBuffer: Buffer.from(base64Str, 'base64'),
          filename,
          mimeType,
          altText: item.altText || undefined,
          caption: item.caption || undefined,
        });
      }

      if (filesToProcess.length === 0) {
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: 'No valid file content or base64 provided.' }, { status: 400 }),
          reqContext.requestId
        );
      }
    }

    // Existing gallery items to determine primary status and sortOrder offset
    const existingGallery = await getConfigurationFloorPlanGallery(project.id, config.id, config.floorPlanMediaId);
    let currentPrimaryMediaId = config.floorPlanMediaId;
    let nextSortOrder = existingGallery.length > 0 ? Math.max(...existingGallery.map((g) => g.sortOrder)) + 1 : 0;

    const uploadedAssets: MediaAsset[] = [];
    const results: { filename: string; success: boolean; mediaId?: string; error?: string }[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const item = filesToProcess[i];
      try {
        const processed = await mediaProcessingService.processUpload(
          item.fileBuffer,
          item.filename,
          item.mimeType,
          'FLOOR_PLANS',
          'PROJECT',
          project.id,
          { mode: watermarkMode }
        );

        const now = new Date().toISOString();
        // First uploaded plan becomes Primary IF configuration currently has no floor plan attached
        const isPrimaryForNewItem = !currentPrimaryMediaId && i === 0;

        const mediaAsset: MediaAsset = {
          id: processed.id,
          entityType: 'PROJECT',
          entityId: project.id,
          filename: processed.filename,
          mimeType: processed.mimeType,
          category: 'FLOOR_PLANS',
          mediaType: item.mimeType === 'application/pdf' ? 'DOCUMENT' : 'IMAGE',
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
          altText: item.altText || `${project.name} - ${config.name} Floor Plan`,
          caption: item.caption || `${config.name} Floor Plan Layout`,
          sortOrder: isPrimaryForNewItem ? 0 : nextSortOrder++,
          isFeatured: isPrimaryForNewItem,
          processingStatus: processed.processingStatus,
          variants: processed.variants,
          createdAt: now,
          updatedAt: now,
        };

        const saved = await mediaRepository.create(mediaAsset);
        uploadedAssets.push(saved);

        await projectMediaRepository.create({
          projectId: project.id,
          mediaId: saved.id,
          configurationId: config.id,
          mediaType: saved.mediaType || 'IMAGE',
          category: 'FLOOR_PLANS',
          url: saved.url,
          altText: saved.altText ?? null,
          caption: saved.caption ?? null,
          sortOrder: mediaAsset.sortOrder,
          isFeatured: isPrimaryForNewItem,
        });

        if (isPrimaryForNewItem) {
          currentPrimaryMediaId = saved.id;
          config = (await projectConfigurationRepository.update(config.id, {
            floorPlanMediaId: saved.id,
          })) || config;
        }

        results.push({ filename: item.filename, success: true, mediaId: saved.id });
      } catch (fileErr: any) {
        console.error(`Error processing file ${item.filename}:`, fileErr);
        results.push({ filename: item.filename, success: false, error: fileErr.message || 'Processing failed' });
      }
    }

    // Record audit log
    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'CONFIGURATION_FLOOR_PLAN_UPLOAD',
        resourceType: 'CONFIGURATION_FLOOR_PLAN',
        resourceId: config.id,
        resourceLabel: `${project.name} - ${config.name} Floor Plans`,
        before: { floorPlanMediaId: config.floorPlanMediaId },
        after: { floorPlanMediaId: currentPrimaryMediaId, uploadedCount: uploadedAssets.length },
        metadata: {
          projectId: project.id,
          configId: config.id,
          uploadedCount: uploadedAssets.length,
          batchResults: results,
        },
        success: uploadedAssets.length > 0,
      }
    );

    const updatedGallery = await getConfigurationFloorPlanGallery(project.id, config.id, config.floorPlanMediaId);

    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: uploadedAssets.length > 0,
          batchResults: results,
          uploadedAssets,
          primaryMediaId: config.floorPlanMediaId,
          floorPlans: updatedGallery,
          configuration: config,
        },
        { status: 201 }
      ),
      reqContext.requestId
    );
  } catch (error: any) {
    console.error('Floor plan upload error:', error);
    const status = error.message?.includes('validation') ? 400 : 500;
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: error.message || 'Floor plan upload failed' }, { status }),
      reqContext.requestId
    );
  }
}

/**
 * PATCH /api/projects/[id]/configurations/[configId]/floor-plan
 * Manages gallery controls: SET_PRIMARY or REORDER.
 */
export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string; configId: string }> }
) {
  const reqContext = extractRequestContext(req);
  let auth = await verifyStaffCapability(req, 'MANAGE_CONFIGURATIONS');
  if (!auth.authorized) {
    auth = await verifyStaffCapability(req, 'MANAGE_MEDIA');
  }
  if (!auth.authorized) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 }),
      reqContext.requestId
    );
  }

  try {
    const { id: projectId, configId } = await props.params;

    let project = await projectRepository.findById(projectId);
    if (!project) {
      project = await projectRepository.findBySlug(projectId);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Project '${projectId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    let config = await projectConfigurationRepository.findById(configId);
    if (!config) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Configuration '${configId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    if (config.projectId !== project.id) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: `Configuration '${configId}' does not belong to project '${project.id}'.` },
          { status: 400 }
        ),
        reqContext.requestId
      );
    }

    const body = await req.json();
    const action = (body.action || '').toUpperCase();

    const allPm = await projectMediaRepository.findByProjectId(project.id);
    const configPm = allPm.filter((pm) => pm.configurationId === config.id && pm.category === 'FLOOR_PLANS');

    if (action === 'SET_PRIMARY') {
      const targetMediaId = body.mediaId || body.projectMediaId;
      if (!targetMediaId) {
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: 'Target mediaId is required to set primary floor plan.' }, { status: 400 }),
          reqContext.requestId
        );
      }

      // Verify target media belongs to this configuration and project
      const targetPm = configPm.find((pm) => pm.id === targetMediaId || pm.mediaId === targetMediaId);
      if (!targetPm) {
        return withCorrelationHeaders(
          NextResponse.json(
            { success: false, error: `Media asset '${targetMediaId}' not found in configuration '${config.id}' floor plans.` },
            { status: 400 }
          ),
          reqContext.requestId
        );
      }

      const resolvedPrimaryId = targetPm.mediaId || targetPm.id;

      // Update configuration.floorPlanMediaId
      config = (await projectConfigurationRepository.update(config.id, {
        floorPlanMediaId: resolvedPrimaryId,
      })) || config;

      // Update project_media records for this configuration
      for (const pm of configPm) {
        const isTarget = pm.id === targetPm.id || pm.mediaId === resolvedPrimaryId;
        if (pm.isFeatured !== isTarget) {
          await projectMediaRepository.update(pm.id, { isFeatured: isTarget });
        }
      }

      // Audit logging
      await auditService.record(
        req,
        auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
        {
          action: 'CONFIGURATION_FLOOR_PLAN_PRIMARY_CHANGED',
          resourceType: 'CONFIGURATION_FLOOR_PLAN',
          resourceId: config.id,
          resourceLabel: `${project.name} - ${config.name} Floor Plan Primary Changed`,
          before: { primaryMediaId: config.floorPlanMediaId },
          after: { primaryMediaId: resolvedPrimaryId },
          metadata: {
            projectId: project.id,
            configId: config.id,
            newPrimaryMediaId: resolvedPrimaryId,
          },
          success: true,
        }
      );

      const updatedGallery = await getConfigurationFloorPlanGallery(project.id, config.id, config.floorPlanMediaId);

      return withCorrelationHeaders(
        NextResponse.json({
          success: true,
          message: 'Primary floor plan updated successfully.',
          primaryMediaId: config.floorPlanMediaId,
          floorPlans: updatedGallery,
          configuration: config,
        }),
        reqContext.requestId
      );
    }

    if (action === 'REORDER') {
      const items: { mediaId: string; sortOrder: number }[] = body.items || [];
      if (!Array.isArray(items) || items.length === 0) {
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: 'Array of items with mediaId and sortOrder required.' }, { status: 400 }),
          reqContext.requestId
        );
      }

      for (const item of items) {
        const pmMatch = configPm.find((pm) => pm.id === item.mediaId || pm.mediaId === item.mediaId);
        if (pmMatch) {
          await projectMediaRepository.update(pmMatch.id, { sortOrder: item.sortOrder });
        }
      }

      // Audit logging
      await auditService.record(
        req,
        auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
        {
          action: 'CONFIGURATION_FLOOR_PLAN_REORDER',
          resourceType: 'CONFIGURATION_FLOOR_PLAN',
          resourceId: config.id,
          resourceLabel: `${project.name} - ${config.name} Floor Plan Reordered`,
          before: null,
          after: { reorderedCount: items.length },
          metadata: {
            projectId: project.id,
            configId: config.id,
            reorderedItems: items,
          },
          success: true,
        }
      );

      const updatedGallery = await getConfigurationFloorPlanGallery(project.id, config.id, config.floorPlanMediaId);

      return withCorrelationHeaders(
        NextResponse.json({
          success: true,
          message: 'Floor plan order updated successfully.',
          primaryMediaId: config.floorPlanMediaId,
          floorPlans: updatedGallery,
          configuration: config,
        }),
        reqContext.requestId
      );
    }

    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: `Unsupported PATCH action '${action}'. Use 'SET_PRIMARY' or 'REORDER'.` }, { status: 400 }),
      reqContext.requestId
    );
  } catch (error: any) {
    console.error('Floor plan PATCH error:', error);
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: error.message || 'Floor plan update failed.' }, { status: 500 }),
      reqContext.requestId
    );
  }
}

/**
 * DELETE /api/projects/[id]/configurations/[configId]/floor-plan
 * Deletes or unlinks a specific floor plan from a configuration gallery with automatic primary promotion.
 */
export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string; configId: string }> }
) {
  const reqContext = extractRequestContext(req);
  let auth = await verifyStaffCapability(req, 'MANAGE_CONFIGURATIONS');
  if (!auth.authorized) {
    auth = await verifyStaffCapability(req, 'MANAGE_MEDIA');
  }
  if (!auth.authorized) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 401 }),
      reqContext.requestId
    );
  }

  try {
    const { id: projectId, configId } = await props.params;

    let project = await projectRepository.findById(projectId);
    if (!project) {
      project = await projectRepository.findBySlug(projectId);
    }
    if (!project) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Project '${projectId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    let config = await projectConfigurationRepository.findById(configId);
    if (!config) {
      return withCorrelationHeaders(
        NextResponse.json({ success: false, error: `Configuration '${configId}' not found.` }, { status: 404 }),
        reqContext.requestId
      );
    }

    if (config.projectId !== project.id) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: `Configuration '${configId}' does not belong to project '${project.id}'.` },
          { status: 400 }
        ),
        reqContext.requestId
      );
    }

    // Determine target mediaId to delete
    const searchParams = req.nextUrl.searchParams;
    let targetMediaId = searchParams.get('mediaId') || searchParams.get('projectMediaId');

    if (!targetMediaId) {
      try {
        const body = await req.json();
        targetMediaId = body.mediaId || body.projectMediaId;
      } catch {
        // Fallback to current primary floor plan
        targetMediaId = config.floorPlanMediaId;
      }
    }

    if (!targetMediaId && config.floorPlanMediaId) {
      targetMediaId = config.floorPlanMediaId;
    }

    if (!targetMediaId) {
      return withCorrelationHeaders(
        NextResponse.json({ success: true, message: 'No floor plan is attached to delete.' }),
        reqContext.requestId
      );
    }

    const allPm = await projectMediaRepository.findByProjectId(project.id);
    const configPm = allPm.filter((pm) => pm.configurationId === config.id && pm.category === 'FLOOR_PLANS');

    const targetPm = configPm.find((pm) => pm.id === targetMediaId || pm.mediaId === targetMediaId);
    const resolvedTargetMediaId = targetPm?.mediaId || targetMediaId;

    const isPrimaryTarget = Boolean(
      (config.floorPlanMediaId && (config.floorPlanMediaId === targetMediaId || config.floorPlanMediaId === resolvedTargetMediaId)) ||
        targetPm?.isFeatured
    );

    // Remaining items after deletion
    const remainingPm = configPm.filter((pm) => pm.id !== targetPm?.id && pm.mediaId !== resolvedTargetMediaId);
    remainingPm.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    let newPrimaryMediaId: string | null = config.floorPlanMediaId;

    if (isPrimaryTarget) {
      if (remainingPm.length > 0) {
        // Promote next remaining plan to primary
        const nextPrimaryPm = remainingPm[0];
        newPrimaryMediaId = nextPrimaryPm.mediaId || nextPrimaryPm.id;
        config = (await projectConfigurationRepository.update(config.id, {
          floorPlanMediaId: newPrimaryMediaId,
        })) || config;

        await projectMediaRepository.update(nextPrimaryPm.id, { isFeatured: true });
      } else {
        // No plans remain
        newPrimaryMediaId = null;
        config = (await projectConfigurationRepository.update(config.id, {
          floorPlanMediaId: null,
        })) || config;
      }
    }

    // Delete target project_media association
    if (targetPm) {
      await projectMediaRepository.delete(targetPm.id);
    }

    // Safe deletion check on underlying MediaAsset
    let deletedUnderlyingAsset = false;
    if (resolvedTargetMediaId) {
      try {
        const allConfigs = await projectConfigurationRepository.findByProjectId(project.id);
        const referencedByOtherConfig = allConfigs.some(
          (c) => c.id !== config.id && c.floorPlanMediaId === resolvedTargetMediaId
        );
        const refCheck = await mediaRepository.checkReferenced(resolvedTargetMediaId);

        if (!referencedByOtherConfig && !refCheck.referenced) {
          await mediaRepository.delete(resolvedTargetMediaId);
          deletedUnderlyingAsset = true;
        }
      } catch (cleanErr) {
        console.warn('Notice safe underlying media cleanup skipped:', cleanErr);
      }
    }

    // Record audit log
    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'CONFIGURATION_FLOOR_PLAN_DELETE',
        resourceType: 'CONFIGURATION_FLOOR_PLAN',
        resourceId: config.id,
        resourceLabel: `${project.name} - ${config.name} Floor Plan Deleted`,
        before: { primaryMediaId: config.floorPlanMediaId, deletedMediaId: resolvedTargetMediaId },
        after: { primaryMediaId: newPrimaryMediaId },
        metadata: {
          projectId: project.id,
          configId: config.id,
          deletedMediaId: resolvedTargetMediaId,
          promotedNewPrimaryMediaId: isPrimaryTarget ? newPrimaryMediaId : null,
          deletedUnderlyingAsset,
        },
        success: true,
      }
    );

    const updatedGallery = await getConfigurationFloorPlanGallery(project.id, config.id, config.floorPlanMediaId);

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        message: 'Floor plan removed successfully.',
        primaryMediaId: config.floorPlanMediaId,
        floorPlans: updatedGallery,
        configuration: config,
        deletedUnderlyingAsset,
      }),
      reqContext.requestId
    );
  } catch (error: any) {
    console.error('Floor plan delete error:', error);
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: error.message || 'Floor plan delete failed.' }, { status: 500 }),
      reqContext.requestId
    );
  }
}
