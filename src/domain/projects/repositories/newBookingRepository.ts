import {
  ProjectConfigurationAvailability,
  ConfigurationAvailabilityStatus,
  PublicNewBookingConfigurationDto,
} from '../dto/newBookingDto';
import { ProjectConfiguration } from '../entities';

export interface NewBookingAvailabilityRepository {
  findAll(): Promise<ProjectConfigurationAvailability[]>;
  findByProjectId(projectId: string): Promise<ProjectConfigurationAvailability[]>;
  findByConfigurationId(configurationId: string): Promise<ProjectConfigurationAvailability | null>;
  findById(id: string): Promise<ProjectConfigurationAvailability | null>;
  create(data: Omit<ProjectConfigurationAvailability, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfigurationAvailability>;
  update(id: string, data: Partial<ProjectConfigurationAvailability>): Promise<ProjectConfigurationAvailability>;
  delete(id: string): Promise<boolean>;
}

export class NewBookingAvailabilityRepositoryMemory implements NewBookingAvailabilityRepository {
  private availabilities: Map<string, ProjectConfigurationAvailability> = new Map();

  async findAll(): Promise<ProjectConfigurationAvailability[]> {
    return Array.from(this.availabilities.values());
  }

  async findByProjectId(projectId: string): Promise<ProjectConfigurationAvailability[]> {
    const results: ProjectConfigurationAvailability[] = [];
    for (const av of this.availabilities.values()) {
      if (av.projectId === projectId) {
        results.push(av);
      }
    }
    return results;
  }

  async findByConfigurationId(configurationId: string): Promise<ProjectConfigurationAvailability | null> {
    for (const av of this.availabilities.values()) {
      if (av.configurationId === configurationId) {
        return av;
      }
    }
    return null;
  }

  async findById(id: string): Promise<ProjectConfigurationAvailability | null> {
    return this.availabilities.get(id) || null;
  }

  async create(data: Omit<ProjectConfigurationAvailability, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfigurationAvailability> {
    // Prevent duplicate current-state availability for the same configuration
    const existing = await this.findByConfigurationId(data.configurationId);
    if (existing) {
      throw new Error(`Conflict: Configuration ${data.configurationId} already has an availability record.`);
    }

    const id = `nav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();
    const newAv: ProjectConfigurationAvailability = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.availabilities.set(id, newAv);
    return newAv;
  }

  async update(id: string, data: Partial<ProjectConfigurationAvailability>): Promise<ProjectConfigurationAvailability> {
    const existing = this.availabilities.get(id);
    if (!existing) {
      throw new Error(`Availability record ${id} not found.`);
    }

    const updated: ProjectConfigurationAvailability = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.availabilities.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.availabilities.delete(id);
  }
}

export const newBookingAvailabilityRepository = new NewBookingAvailabilityRepositoryMemory();
