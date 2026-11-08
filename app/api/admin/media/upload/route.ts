import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { mediaProcessingService } from '@/src/domain/media/services/mediaProcessingService';
import {
  mediaRepository,
  MediaAsset,
  getTestEntityMediaStore,
  saveTestEntityMediaStore,
} from '@/src/domain/media/repositories/mediaRepository';
import { getStorageProvider } from '@/src/domain/media/storage/storageProvider';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';
import { isTestIsolationActive } from '@/src/lib/testIsolationContext';

export async function POST(req: NextRequest) {
  const reqContext = extractRequestContext(req);

  // 1. Authorization check
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
    const contentType = req.headers.get('content-type') || '';
    let filename = '';
    let mimeType = '';
    let category = 'OTHER';
    let entityType: any = 'PROJECT';
    let entityId = 'general';
    let altText: string | null = null;
    let caption: string | null = null;
    let sortOrder = 0;
    let isFeatured = false;
    let watermarkMode: any = 'AUTO';
    let configurationId: string | null = null;
    let fileBuffer: Buffer | null = null;
    let updatedConfiguration: any = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      if (!file) {
        return withCorrelationHeaders(
          NextResponse.json(
            { success: false, error: 'No file provided in multipart form data.' },
            { status: 400 }
          ),
          reqContext.requestId
        );
      }

      filename = file.name;
      mimeType = file.type || (filename.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream');
      category = (formData.get('category') as string) || 'OTHER';
      entityType = ((formData.get('entityType') as string) || 'PROJECT').toUpperCase();
      entityId = (formData.get('entityId') as string) || 'general';
      configurationId = (formData.get('configurationId') as string) || null;
      altText = (formData.get('altText') as string) || null;
      caption = (formData.get('caption') as string) || null;
      sortOrder = parseInt((formData.get('sortOrder') as string) || '0', 10);
      isFeatured = formData.get('isFeatured') === 'true';
      watermarkMode = formData.get('watermarkMode') || 'AUTO';

      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
    } else {
      // JSON payload with base64 data
      const body = await req.json();
      if (!body.fileBase64 && !body.data) {
        return withCorrelationHeaders(
          NextResponse.json(
            { success: false, error: 'No file content or base64 provided.' },
            { status: 400 }
          ),
          reqContext.requestId
        );
      }

      filename = body.filename || 'upload.jpg';
      mimeType = body.mimeType || (filename.toLowerCase().endsWith('.svg') ? 'image/svg+xml' : 'image/jpeg');
      category = body.category || 'OTHER';
      entityType = (body.entityType || 'PROJECT').toUpperCase();
      entityId = body.entityId || 'general';
      configurationId = body.configurationId || null;
      altText = body.altText || null;
      caption = body.caption || null;
      sortOrder = body.sortOrder || 0;
      isFeatured = Boolean(body.isFeatured);
      watermarkMode = body.watermarkMode || 'AUTO';

      const base64Str = (body.fileBase64 || body.data).replace(/^data:[a-zA-Z0-9/+.-]+;base64,/, '');
      fileBuffer = Buffer.from(base64Str, 'base64');
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Empty file buffer received.' },
          { status: 400 }
        ),
        reqContext.requestId
      );
    }

    const testIsolated = isTestIsolationActive(req);

    // Server-side validation of project and configuration identity if configurationId is supplied
    let targetProject: any = null;
    let targetConfig: any = null;
    if (!testIsolated && entityType === 'PROJECT' && entityId && entityId !== 'general') {
      const { projectRepository, projectConfigurationRepository } = await import(
        '@/src/infrastructure/repositories/projectProvider'
      );
      targetProject = await projectRepository.findById(entityId);
      if (!targetProject) {
        targetProject = await projectRepository.findBySlug(entityId);
      }
      if (!targetProject && configurationId) {
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: `Project '${entityId}' not found.` }, { status: 404 }),
          reqContext.requestId
        );
      }
      if (configurationId) {
        targetConfig = await projectConfigurationRepository.findById(configurationId);
        if (!targetConfig) {
          return withCorrelationHeaders(
            NextResponse.json({ success: false, error: `Configuration '${configurationId}' not found.` }, { status: 404 }),
            reqContext.requestId
          );
        }
        if (targetProject && targetConfig.projectId !== targetProject.id) {
          return withCorrelationHeaders(
            NextResponse.json(
              { success: false, error: `Configuration '${configurationId}' does not belong to project '${targetProject.id}'.` },
              { status: 400 }
            ),
            reqContext.requestId
          );
        }
      }
    }

    // Process through the canonical image optimization, SVG sanitization & watermarking pipeline
    const processed = await mediaProcessingService.processUpload(
      fileBuffer,
      filename,
      mimeType,
      category,
      entityType,
      entityId,
      { mode: watermarkMode }
    );

    const now = new Date().toISOString();
    const mediaAsset: MediaAsset = {
      id: processed.id,
      entityType,
      entityId,
      filename: processed.filename,
      mimeType: processed.mimeType,
      category: processed.category,
      mediaType: processed.mimeType === 'application/pdf' ? 'DOCUMENT' : 'IMAGE',
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
      altText,
      caption,
      sortOrder,
      isFeatured,
      processingStatus: processed.processingStatus,
      variants: processed.variants,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await mediaRepository.create(mediaAsset);

    let createdProjectMedia: any = null;
    let createdDeveloperMedia: any = null;
    let createdResaleMedia: any = null;
    let createdRentalMedia: any = null;

    if (testIsolated) {
      // Isolated test sandbox entity linking (never touches live Neon PostgreSQL tables)
      const entityStore = getTestEntityMediaStore();
      if (entityType === 'DEVELOPER') {
        const validCategories = ['LOGO', 'BRAND', 'OFFICE', 'EDITORIAL'];
        const devCategory = validCategories.includes(category.toUpperCase())
          ? category.toUpperCase()
          : 'BRAND';
        createdDeveloperMedia = {
          id: `devmedia_test_${saved.id}`,
          developerId: entityId,
          mediaType: 'IMAGE',
          category: devCategory,
          url: saved.url,
          sortOrder: saved.sortOrder ?? 0,
          isFeatured: saved.isFeatured ?? false,
          createdAt: now,
          updatedAt: now,
        };
        entityStore.developerMedia.push(createdDeveloperMedia);
      } else if (entityType === 'PROJECT') {
        createdProjectMedia = {
          id: `projmedia_test_${saved.id}`,
          projectId: entityId,
          mediaId: saved.id,
          configurationId: configurationId || null,
          mediaType: saved.mediaType,
          category: saved.category,
          url: saved.url,
          altText: saved.altText ?? null,
          caption: saved.caption ?? null,
          sortOrder: saved.sortOrder ?? 0,
          isFeatured: saved.category === 'BROCHURE' ? false : isFeatured,
          createdAt: now,
          updatedAt: now,
        };
        entityStore.projectMedia.push(createdProjectMedia);
      } else if (entityType === 'RESALE') {
        const validResaleCategories = [
          'EXTERIOR',
          'INTERIOR',
          'FLOOR_PLAN',
          'BALCONY_VIEW',
          'LOBBY',
          'AMENITIES',
          'OTHER',
        ];
        const normCat = (category || 'INTERIOR').toUpperCase();
        const resaleCat =
          normCat === 'FLOOR_PLANS'
            ? 'FLOOR_PLAN'
            : validResaleCategories.includes(normCat)
            ? normCat
            : 'OTHER';
        if (isFeatured) {
          for (const m of entityStore.resaleMedia) {
            if (m.resaleListingId === entityId) m.isFeatured = false;
          }
        }
        createdResaleMedia = {
          id: `rmedia_test_${saved.id}`,
          resaleListingId: entityId,
          mediaId: saved.id,
          mediaType: 'IMAGE',
          category: resaleCat,
          url: saved.url,
          altText: saved.altText ?? undefined,
          caption: saved.caption ?? undefined,
          sortOrder: saved.sortOrder ?? 0,
          isFeatured: saved.isFeatured ?? false,
          createdAt: now,
          updatedAt: now,
        };
        entityStore.resaleMedia.push(createdResaleMedia);
      } else if (entityType === 'RENTAL') {
        const validRentalCategories = [
          'EXTERIOR',
          'INTERIOR',
          'FLOOR_PLAN',
          'BALCONY_VIEW',
          'LOBBY',
          'AMENITIES',
          'OTHER',
        ];
        const normCat = (category || 'INTERIOR').toUpperCase();
        const rentalCat =
          normCat === 'FLOOR_PLANS'
            ? 'FLOOR_PLAN'
            : validRentalCategories.includes(normCat)
            ? normCat
            : 'OTHER';
        if (isFeatured) {
          for (const m of entityStore.rentalMedia) {
            if (m.rentalListingId === entityId) m.isFeatured = false;
          }
        }
        createdRentalMedia = {
          id: `rmed_test_${saved.id}`,
          rentalListingId: entityId,
          mediaId: saved.id,
          mediaType: 'IMAGE',
          category: rentalCat,
          url: saved.url,
          altText: saved.altText ?? undefined,
          caption: saved.caption ?? undefined,
          sortOrder: saved.sortOrder ?? 0,
          isFeatured: saved.isFeatured ?? false,
          createdAt: now,
          updatedAt: now,
        };
        entityStore.rentalMedia.push(createdRentalMedia);
      }
      saveTestEntityMediaStore(entityStore);
    } else {
      // Production entity linking
      // A. If entityType is DEVELOPER, automatically link to developer_media
      if (entityType === 'DEVELOPER' && entityId && entityId !== 'general') {
        const { developerMediaRepository, developerRepository } = await import(
          '@/src/infrastructure/repositories/developerProvider'
        );
        const dev = await developerRepository.findById(entityId);
        if (dev) {
          const validCategories = ['LOGO', 'BRAND', 'OFFICE', 'EDITORIAL'];
          const devCategory = validCategories.includes(category.toUpperCase())
            ? category.toUpperCase()
            : 'BRAND';
          createdDeveloperMedia = await developerMediaRepository.create({
            developerId: entityId,
            mediaType: 'IMAGE',
            category: devCategory as any,
            url: saved.url,
            sortOrder: saved.sortOrder ?? 0,
            isFeatured: saved.isFeatured ?? false,
          });
        }
      }

      // B. If entityType is PROJECT, automatically link to project_media
      if (entityType === 'PROJECT' && entityId && entityId !== 'general') {
        const { projectIntelligenceService } = await import(
          '@/src/domain/projects/services/projectIntelligenceService'
        );
        const {
          projectRepository,
          projectMediaRepository,
          projectConfigurationRepository,
        } = await import('@/src/infrastructure/repositories/projectProvider');

        let project = await projectRepository.findById(entityId);
        if (!project) {
          project = await projectRepository.findBySlug(entityId);
        }

        if (project) {
          const validCategories = [
            'EXTERIOR',
            'INTERIOR',
            'AMENITIES',
            'CLUBHOUSE',
            'LOCATION',
            'FLOOR_PLANS',
            'MASTER_PLAN',
            'CONSTRUCTION',
            'WALKTHROUGH',
            'BROCHURE',
            'OTHER',
          ];
          const normalizedCategory = (category || 'OTHER').toUpperCase();
          const projectCategory = validCategories.includes(normalizedCategory)
            ? normalizedCategory
            : 'OTHER';

          const existingProjectMedia = await projectMediaRepository.findByProjectId(project.id);
          const previousBrochures =
            projectCategory === 'BROCHURE'
              ? existingProjectMedia.filter(
                  (m) => (m.category || '').toUpperCase() === 'BROCHURE'
                )
              : [];

          if (isFeatured && projectCategory !== 'BROCHURE') {
            try {
              for (const m of existingProjectMedia) {
                if (m.isFeatured) {
                  await projectMediaRepository.update(m.id, { isFeatured: false });
                }
              }
            } catch (featErr) {
              console.error('Error resetting existing featured project media:', featErr);
            }
          }

          createdProjectMedia = await projectIntelligenceService.createMedia(
            project.id,
            {
              projectId: project.id,
              mediaId: saved.id,
              configurationId: configurationId || null,
              mediaType: saved.mediaType || (projectCategory === 'BROCHURE' ? 'DOCUMENT' : 'IMAGE'),
              category: projectCategory as any,
              url: saved.url,
              altText: saved.altText ?? (projectCategory === 'BROCHURE' ? saved.filename : null),
              caption: saved.caption ?? (projectCategory === 'BROCHURE' ? saved.filename : null),
              sortOrder: saved.sortOrder ?? 0,
              isFeatured: projectCategory === 'BROCHURE' ? false : isFeatured,
            },
            true
          );

          // Failure-safe brochure replacement
          if (
            projectCategory === 'BROCHURE' &&
            createdProjectMedia &&
            createdProjectMedia.id &&
            previousBrochures.length > 0
          ) {
            const storage = getStorageProvider();
            const allProjects = await projectRepository.findAll();

            for (const prev of previousBrochures) {
              if (prev.id === createdProjectMedia.id) continue;
              try {
                await projectMediaRepository.delete(prev.id);

                let referencedByOtherProject = false;
                for (const otherProj of allProjects) {
                  if (otherProj.id === project.id) continue;
                  const otherMedia = await projectMediaRepository.findByProjectId(otherProj.id);
                  if (
                    otherMedia.some(
                      (om) =>
                        (prev.mediaId && (om.mediaId === prev.mediaId || om.id === prev.mediaId)) ||
                        (prev.url && om.url === prev.url)
                    )
                  ) {
                    referencedByOtherProject = true;
                    break;
                  }
                }

                if (prev.mediaId && prev.mediaId !== saved.id && !referencedByOtherProject) {
                  const refCheck = await mediaRepository.checkReferenced(prev.mediaId);
                  if (!refCheck.referenced) {
                    const prevAsset = await mediaRepository.findById(prev.mediaId);
                    await mediaRepository.delete(prev.mediaId);
                    const oldKey =
                      prevAsset?.storageKey ||
                      (prev.url.startsWith('/uploads/')
                        ? prev.url.replace(/^\/uploads\//, '')
                        : '');
                    if (oldKey) {
                      await storage.delete(oldKey).catch(() => false);
                    }
                  }
                }
              } catch (cleanBrochureErr) {
                console.warn('Safe cleanup of replaced project brochure skipped:', cleanBrochureErr);
              }
            }
          }

          // Link floorPlanMediaId on the configuration if applicable
          if (configurationId && projectCategory === 'FLOOR_PLANS') {
            try {
              const config = await projectConfigurationRepository.findById(configurationId);
              if (config) {
                const oldMediaId = config.floorPlanMediaId;
                updatedConfiguration = await projectConfigurationRepository.update(configurationId, {
                  floorPlanMediaId: saved.id,
                });

                if (oldMediaId && oldMediaId !== saved.id) {
                  try {
                    const allConfigs = await projectConfigurationRepository.findByProjectId(project.id);
                    const referencedByOtherConfig = allConfigs.some(
                      (c) => c.id !== config.id && c.floorPlanMediaId === oldMediaId
                    );
                    const refCheck = await mediaRepository.checkReferenced(oldMediaId);
                    if (!referencedByOtherConfig && !refCheck.referenced) {
                      await mediaRepository.delete(oldMediaId);
                      await projectMediaRepository.delete(oldMediaId);
                    }
                  } catch (cleanErr) {
                    console.warn('Safe cleanup of replaced media skipped:', cleanErr);
                  }
                }
              }
            } catch (cfgErr) {
              console.error('Error linking floor plan to configuration:', cfgErr);
            }
          }

          try {
            if (project.slug) {
              revalidatePath(`/projects/${project.slug}`);
            }
            revalidatePath('/projects');
            revalidatePath('/');
          } catch {
            // Non-blocking in non-Next contexts
          }
        }
      }

      // C. If entityType is RESALE, automatically link to resale_listing_media
      if (entityType === 'RESALE' && entityId && entityId !== 'general') {
        const { resaleListingRepository } = await import(
          '@/src/domain/projects/repositories/resaleRepository'
        );
        const listing = await resaleListingRepository.findBySlugOrId(entityId);
        const targetListingId = listing ? listing.id : entityId;

        const validResaleCategories = [
          'EXTERIOR',
          'INTERIOR',
          'FLOOR_PLAN',
          'BALCONY_VIEW',
          'LOBBY',
          'AMENITIES',
          'OTHER',
        ];
        const normCat = (category || 'INTERIOR').toUpperCase();
        const resaleCat =
          normCat === 'FLOOR_PLANS'
            ? 'FLOOR_PLAN'
            : validResaleCategories.includes(normCat)
            ? normCat
            : 'OTHER';

        if (listing) {
          if (isFeatured) {
            const existingMedia = await resaleListingRepository.findMediaByListingId(targetListingId);
            for (const m of existingMedia) {
              if (m.isFeatured) {
                await resaleListingRepository.updateMedia(m.id, { isFeatured: false });
              }
            }
          }

          createdResaleMedia = await resaleListingRepository.addMedia({
            resaleListingId: targetListingId,
            mediaType: 'IMAGE',
            category: resaleCat as any,
            url: saved.url,
            altText: saved.altText ?? undefined,
            caption: saved.caption ?? undefined,
            sortOrder: saved.sortOrder ?? 0,
            isFeatured: saved.isFeatured ?? false,
          });

          const { revalidateResalePaths } = await import('@/src/lib/revalidateListingPaths');
          const { resaleListingService } = await import('@/src/domain/projects/services/resaleService');
          const adminDto = await resaleListingService.getAdminListingById(listing.id).catch(() => null);
          revalidateResalePaths({
            id: listing.id,
            slug: listing.slug,
            projectSlug: adminDto?.project?.slug,
            locationSlug: adminDto?.location?.slug ?? adminDto?.project?.location?.slug,
          });
        }
      }

      // D. If entityType is RENTAL, automatically link to rental_listing_media
      if (entityType === 'RENTAL' && entityId && entityId !== 'general') {
        const { rentalListingRepository } = await import(
          '@/src/domain/projects/repositories/rentalRepository'
        );
        const listing = await rentalListingRepository.findBySlugOrId(entityId);
        const targetListingId = listing ? listing.id : entityId;

        const validRentalCategories = [
          'EXTERIOR',
          'INTERIOR',
          'FLOOR_PLAN',
          'BALCONY_VIEW',
          'LOBBY',
          'AMENITIES',
          'OTHER',
        ];
        const normCat = (category || 'INTERIOR').toUpperCase();
        const rentalCat =
          normCat === 'FLOOR_PLANS'
            ? 'FLOOR_PLAN'
            : validRentalCategories.includes(normCat)
            ? normCat
            : 'OTHER';

        if (listing) {
          if (isFeatured) {
            const existingMedia = await rentalListingRepository.findMediaByListingId(targetListingId);
            for (const m of existingMedia) {
              if (m.isFeatured) {
                await rentalListingRepository.updateMedia(m.id, { isFeatured: false });
              }
            }
          }

          createdRentalMedia = await rentalListingRepository.addMedia({
            rentalListingId: targetListingId,
            mediaType: 'IMAGE',
            category: rentalCat as any,
            url: saved.url,
            altText: saved.altText ?? undefined,
            caption: saved.caption ?? undefined,
            sortOrder: saved.sortOrder ?? 0,
            isFeatured: saved.isFeatured ?? false,
          });

          const { revalidateRentalPaths } = await import('@/src/lib/revalidateListingPaths');
          const { rentalListingService } = await import('@/src/domain/projects/services/rentalService');
          const adminDto = await rentalListingService.getAdminListingById(listing.id).catch(() => null);
          revalidateRentalPaths({
            id: listing.id,
            slug: listing.slug,
            projectSlug: adminDto?.project?.slug,
            locationSlug: adminDto?.location?.slug ?? adminDto?.project?.location?.slug,
          });
        }
      }
    }

    // If marked as featured, update entity featured pointer
    if (isFeatured) {
      await mediaRepository.setFeatured(saved.id, entityType, entityId);
    }

    // Record audit log
    await auditService.record(
      req,
      auth.staff ? { id: auth.staff.id, role: auth.staff.role } : null,
      {
        action: 'CREATE',
        resourceType: 'MEDIA',
        resourceId: saved.id,
        resourceLabel: saved.filename,
        before: null,
        after: {
          id: saved.id,
          filename: saved.filename,
          url: saved.url,
          category: saved.category,
        },
        metadata: {
          filename: saved.filename,
          entityType: saved.entityType,
          entityId: saved.entityId,
          category: saved.category,
          watermarkApplied: saved.watermarkApplied,
        },
        success: true,
      }
    );

    const response = NextResponse.json(
      {
        success: true,
        data: {
          ...saved,
          projectMedia: createdProjectMedia,
          developerMedia: createdDeveloperMedia,
          resaleMedia: createdResaleMedia,
          rentalMedia: createdRentalMedia,
          configuration: updatedConfiguration,
        },
        media: saved,
        projectMedia: createdProjectMedia,
        developerMedia: createdDeveloperMedia,
        resaleMedia: createdResaleMedia,
        rentalMedia: createdRentalMedia,
        configuration: updatedConfiguration,
      },
      { status: 201 }
    );

    return withCorrelationHeaders(response, reqContext.requestId);
  } catch (error: any) {
    console.error('Media upload error:', error);
    const isValidation =
      error.message?.includes('validation') ||
      error.message?.includes('Security violation') ||
      error.message?.includes('Malformed SVG');
    const status = isValidation ? 400 : 500;
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: error.message || 'Media upload failed' },
        { status }
      ),
      reqContext.requestId
    );
  }
}
