import { projectIntelligenceService } from '../services/projectIntelligenceService';
import { newBookingAvailabilityRepository, NewBookingAvailabilityRepository } from '../repositories/newBookingRepository';
import {
  ConfigurationAvailabilityStatus,
  ProjectConfigurationAvailability,
  PublicNewBookingConfigurationDto,
} from '../dto/newBookingDto';
import { calculateEffectivePricePerSqft } from '../dto/projectDto';

export class NewBookingService {
  constructor(private availabilityRepo: NewBookingAvailabilityRepository = newBookingAvailabilityRepository) {}

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
    // 1. Verify project exists and is PUBLISHED
    const project = await projectIntelligenceService.getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    if (project.lifecycleStatus !== 'PUBLISHED') {
      return []; // Non-published projects do not expose public new booking inventory
    }

    // 2. Get project configurations from project intelligence service
    const configurations = await projectIntelligenceService.getConfigurationsByProjectId(projectId);
    const availabilities = await this.availabilityRepo.findByProjectId(projectId);
    const availabilityMap = new Map<string, ProjectConfigurationAvailability>();
    for (const av of availabilities) {
      availabilityMap.set(av.configurationId, av);
    }

    const mediaList = await projectIntelligenceService.getMediaByProjectId(projectId);
    const mediaMap = new Map<string, string>();
    for (const m of mediaList) {
      mediaMap.set(m.id, m.url);
    }

    // 3. Compose public DTOs
    const result: PublicNewBookingConfigurationDto[] = [];
    for (const config of configurations) {
      const av = availabilityMap.get(config.id);
      const status: ConfigurationAvailabilityStatus = av ? av.availabilityStatus : 'AVAILABLE'; // Default to AVAILABLE if unset
      const lastVerified = av ? av.lastVerifiedAt.toISOString() : new Date().toISOString();

      let effectiveRate = 0;
      try {
        effectiveRate = calculateEffectivePricePerSqft(config.price, config.priceBasis, {
          carpetArea: config.carpetArea,
          builtUpArea: config.builtUpArea,
          superBuiltUpArea: config.superBuiltUpArea,
        });
      } catch {
        effectiveRate = 0;
      }

      const floorPlanUrl = config.floorPlanMediaId ? mediaMap.get(config.floorPlanMediaId) || null : null;

      result.push({
        id: av ? av.id : `fallback_${config.id}`,
        configurationId: config.id,
        name: config.name,
        bedroomCount: config.bedroomCount,
        carpetArea: config.carpetArea,
        builtUpArea: config.builtUpArea,
        superBuiltUpArea: config.superBuiltUpArea,
        price: config.price,
        priceBasis: config.priceBasis,
        effectivePricePerSqft: effectiveRate,
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
    internalNotes?: string
  ): Promise<ProjectConfigurationAvailability> {
    // Validate configuration belongs to project
    const configurations = await projectIntelligenceService.getConfigurationsByProjectId(projectId);
    const configExists = configurations.some(c => c.id === configurationId);
    if (!configExists) {
      throw new Error('Configuration does not belong to the specified project.');
    }

    const existing = await this.availabilityRepo.findByConfigurationId(configurationId);
    if (existing) {
      return await this.availabilityRepo.update(existing.id, {
        availabilityStatus: status,
        lastVerifiedAt: new Date(),
        source: source || existing.source,
        internalNotes: internalNotes !== undefined ? internalNotes : existing.internalNotes,
      });
    } else {
      return await this.availabilityRepo.create({
        projectId,
        configurationId,
        availabilityStatus: status,
        lastVerifiedAt: new Date(),
        source: source || 'MANUAL_STAFF_VERIFICATION',
        internalNotes: internalNotes || null,
      });
    }
  }

  async getAvailabilityRecordById(id: string): Promise<ProjectConfigurationAvailability | null> {
    return await this.availabilityRepo.findById(id);
  }

  async deleteAvailabilityRecord(id: string): Promise<boolean> {
    return await this.availabilityRepo.delete(id);
  }
}

export const newBookingService = new NewBookingService();
