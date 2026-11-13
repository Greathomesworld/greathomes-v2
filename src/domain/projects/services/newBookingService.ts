import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '../services/projectIntelligenceService';
import { newBookingAvailabilityRepository } from '../../../infrastructure/repositories/projectProvider';
import { NewBookingAvailabilityRepository } from '../repositories/newBookingRepository';
import {
  ConfigurationAvailabilityStatus,
  ProjectConfigurationAvailability,
  PublicNewBookingConfigurationDto,
  isValidConfigurationAvailabilityStatus,
  isPubliclyBookableAvailabilityStatus,
} from '../dto/newBookingDto';
import { calculateEffectivePricePerSqft } from '../dto/projectDto';
import { auditService } from '../../audit/auditService';
import type { RequestLike } from '../../audit/auditRequestContext';
import { revalidateProjectLifecyclePaths } from '@/src/lib/revalidateListingPaths';
import { isConfigurationPriceOnRequest } from '@/src/lib/priceUtils';

export interface SetAvailabilityContext {
  req?: RequestLike | null;
  staff?: { id?: string | null; role?: string | null } | null;
  availableFrom?: Date | null;
}

export class NewBookingService {
  constructor(
    private availabilityRepo: NewBookingAvailabilityRepository = newBookingAvailabilityRepository,
    private projectService = projectIntelligenceService
  ) {}

  /**
   * Retrieves only explicit, verified configuration availability override records for a project
   * directly from the availability repository without re-fetching project, configuration, or media DTOs.
   */
  async getProjectConfigurationAvailabilityRecords(
    projectId: string
  ): Promise<ProjectConfigurationAvailability[]> {
    if (!projectId) return [];
    return await this.availabilityRepo.findByProjectId(projectId);
  }

  async getPublicNewBookingConfigurations(projectId: string): Promise<PublicNewBookingConfigurationDto[]> {
    // 1. Verify project exists and is PUBLISHED and not SOLD_OUT
    const project = await this.projectService.getProjectById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }
    if (project.lifecycleStatus !== 'PUBLISHED' || project.status === 'SOLD_OUT') {
      return []; // Non-published or sold-out projects do not expose public new booking inventory
    }

    // 2. Get project configurations from project intelligence service (with PoR masking)
    const configurations = await this.projectService.getConfigurationsByProjectId(projectId, false);
    const availabilities = await this.availabilityRepo.findByProjectId(projectId);
    const availabilityMap = new Map<string, ProjectConfigurationAvailability>();
    for (const av of availabilities) {
      availabilityMap.set(av.configurationId, av);
    }

    const mediaList = await this.projectService.getMediaByProjectId(projectId);
    const mediaMap = new Map<string, string>();
    for (const m of mediaList) {
      mediaMap.set(m.id, m.url);
    }

    // 3. Compose public DTOs, failing closed to NOT_AVAILABLE and exposing only AVAILABLE | LIMITED | ON_REQUEST
    const result: PublicNewBookingConfigurationDto[] = [];
    for (const config of configurations) {
      const av = availabilityMap.get(config.id);
      const status: ConfigurationAvailabilityStatus = av ? av.availabilityStatus : 'NOT_AVAILABLE';
      if (!isPubliclyBookableAvailabilityStatus(status)) {
        continue;
      }

      const lastVerified = av ? new Date(av.lastVerifiedAt).toISOString() : new Date().toISOString();
      const isPor = isConfigurationPriceOnRequest(config, project);

      let effectiveRate = 0;
      if (!isPor) {
        try {
          effectiveRate = calculateEffectivePricePerSqft(config.price, config.priceBasis, {
            carpetArea: config.carpetArea,
            builtUpArea: config.builtUpArea,
            superBuiltUpArea: config.superBuiltUpArea,
          });
        } catch {
          effectiveRate = 0;
        }
      }

      const floorPlanUrl = config.floorPlanMediaId ? mediaMap.get(config.floorPlanMediaId) || null : null;

      result.push({
        id: av!.id,
        configurationId: config.id,
        name: config.name,
        bedroomCount: config.bedroomCount,
        carpetArea: config.carpetArea,
        builtUpArea: config.builtUpArea,
        superBuiltUpArea: config.superBuiltUpArea,
        price: isPor ? 0 : config.price,
        priceBasis: config.priceBasis,
        priceOnRequest: isPor,
        effectivePricePerSqft: isPor ? 0 : effectiveRate,
        availabilityStatus: status,
        lastVerifiedAt: lastVerified,
        floorPlanMediaId: config.floorPlanMediaId,
        floorPlanUrl,
      });
    }

    return result;
  }

  async setConfigurationAvailability(
    projectId: string,
    configurationId: string,
    status: ConfigurationAvailabilityStatus,
    source?: string,
    internalNotes?: string | null,
    context?: SetAvailabilityContext
  ): Promise<ProjectConfigurationAvailability> {
    if (!isValidConfigurationAvailabilityStatus(status)) {
      throw new ValidationError(
        `Invalid availability status '${String(status)}'. Allowed values: AVAILABLE, LIMITED, ON_REQUEST, SOLD_OUT, NOT_AVAILABLE.`
      );
    }

    const project = await this.projectService.getProjectById(projectId, true);
    if (!project) {
      throw new NotFoundError(`Project with id '${projectId}' not found.`);
    }

    if (isPubliclyBookableAvailabilityStatus(status)) {
      if (project.lifecycleStatus === 'ARCHIVED') {
        throw new ValidationError('Cannot mark a configuration as bookable on an ARCHIVED project.');
      }
      if (project.status === 'SOLD_OUT') {
        throw new ValidationError('Cannot mark a configuration as bookable on a SOLD_OUT project.');
      }
    }

    // Validate configuration belongs to project
    const configurations = await this.projectService.getConfigurationsByProjectId(projectId, true);
    const targetConfig = configurations.find(c => c.id === configurationId);
    if (!targetConfig) {
      throw new NotFoundError('Configuration does not belong to the specified project.');
    }

    const existing = await this.availabilityRepo.findByConfigurationId(configurationId);
    if (existing && existing.projectId !== projectId) {
      throw new ValidationError(
        `Configuration '${configurationId}' belongs to project '${existing.projectId}' and cannot be updated under project '${projectId}'.`
      );
    }
    const now = new Date();
    const resolvedSource = source?.trim() || existing?.source || 'MANUAL_STAFF_VERIFICATION';
    const resolvedNotes = internalNotes !== undefined ? internalNotes : existing?.internalNotes ?? null;
    const resolvedAvailableFrom =
      context?.availableFrom !== undefined ? context.availableFrom : existing?.availableFrom ?? null;

    const saved = await this.availabilityRepo.upsert({
      projectId,
      configurationId,
      availabilityStatus: status,
      availableFrom: resolvedAvailableFrom,
      lastVerifiedAt: now,
      updatedByStaffId: context?.staff?.id ?? existing?.updatedByStaffId ?? null,
      updatedByStaffName: existing?.updatedByStaffName ?? null,
      source: resolvedSource,
      internalNotes: resolvedNotes,
    });

    await auditService.record(
      context?.req ?? null,
      context?.staff
        ? { id: context.staff.id ?? null, role: context.staff.role ?? 'STAFF' }
        : { role: 'SYSTEM' },
      {
        action: 'STATUS_CHANGED',
        resourceType: 'PROJECT_CONFIGURATION',
        resourceId: configurationId,
        resourceLabel: `${project.name} · ${targetConfig.name}`,
        before: {
          availabilityStatus: existing?.availabilityStatus ?? 'NOT_AVAILABLE',
          internalNotes: existing?.internalNotes ?? null,
        },
        after: {
          availabilityStatus: saved.availabilityStatus,
          internalNotes: saved.internalNotes ?? null,
        },
        metadata: {
          subtype: 'NEW_BOOKING_AVAILABILITY',
          projectId,
          projectSlug: project.slug,
          availabilityRecordId: saved.id,
          source: resolvedSource,
        },
      }
    );

    await revalidateProjectLifecyclePaths({
      projectId,
      projectSlug: project.slug,
      bedroomCounts: targetConfig.bedroomCount != null ? [targetConfig.bedroomCount] : undefined,
    });

    return saved;
  }

  async getAvailabilityRecordById(id: string): Promise<ProjectConfigurationAvailability | null> {
    return await this.availabilityRepo.findById(id);
  }

  async deleteAvailabilityRecord(
    id: string,
    context?: SetAvailabilityContext & { expectedProjectId?: string }
  ): Promise<boolean> {
    const existing = await this.availabilityRepo.findById(id);
    if (!existing) return false;
    if (context?.expectedProjectId && existing.projectId !== context.expectedProjectId) {
      throw new NotFoundError('Availability record does not belong to the specified project.');
    }

    const deleted = await this.availabilityRepo.delete(id);
    if (!deleted) return false;

    const project = await this.projectService.getProjectById(existing.projectId, true).catch(() => null);

    await auditService.record(
      context?.req ?? null,
      context?.staff
        ? { id: context.staff.id ?? null, role: context.staff.role ?? 'STAFF' }
        : { role: 'SYSTEM' },
      {
        action: 'DELETE',
        resourceType: 'PROJECT_CONFIGURATION',
        resourceId: existing.configurationId,
        resourceLabel: project ? `${project.name} · Availability Override` : existing.configurationId,
        before: {
          availabilityStatus: existing.availabilityStatus,
          internalNotes: existing.internalNotes ?? null,
        },
        after: {
          availabilityStatus: 'NOT_AVAILABLE',
        },
        metadata: {
          subtype: 'NEW_BOOKING_AVAILABILITY_RESET',
          projectId: existing.projectId,
          projectSlug: project?.slug ?? null,
          availabilityRecordId: existing.id,
        },
      }
    );

    await revalidateProjectLifecyclePaths({
      projectId: existing.projectId,
      projectSlug: project?.slug ?? undefined,
    });

    return true;
  }
}

export const newBookingService = new NewBookingService();
