import {
  ProjectConfigurationAvailability,
  ConfigurationAvailabilityStatus,
} from '../dto/newBookingDto';

export interface UpsertConfigurationAvailabilityInput {
  projectId: string;
  configurationId: string;
  availabilityStatus: ConfigurationAvailabilityStatus;
  availableFrom?: Date | null;
  lastVerifiedAt?: Date;
  updatedByStaffId?: string | null;
  updatedByStaffName?: string | null;
  source?: string | null;
  internalNotes?: string | null;
}

export interface NewBookingAvailabilityRepository {
  findAll(): Promise<ProjectConfigurationAvailability[]>;
  findByProjectId(projectId: string): Promise<ProjectConfigurationAvailability[]>;
  findByProjectIds(projectIds: string[]): Promise<ProjectConfigurationAvailability[]>;
  findByConfigurationId(configurationId: string): Promise<ProjectConfigurationAvailability | null>;
  findById(id: string): Promise<ProjectConfigurationAvailability | null>;
  create(data: Omit<ProjectConfigurationAvailability, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfigurationAvailability>;
  update(id: string, data: Partial<ProjectConfigurationAvailability>): Promise<ProjectConfigurationAvailability>;
  upsert(data: UpsertConfigurationAvailabilityInput): Promise<ProjectConfigurationAvailability>;
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

  async findByProjectIds(projectIds: string[]): Promise<ProjectConfigurationAvailability[]> {
    const set = new Set(projectIds);
    const results: ProjectConfigurationAvailability[] = [];
    for (const av of this.availabilities.values()) {
      if (set.has(av.projectId)) {
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
    if (data.projectId !== undefined && data.projectId !== existing.projectId) {
      throw new Error(
        `IntegrityError: Availability record ${id} belongs to project ${existing.projectId} and cannot be reassigned to ${data.projectId}.`
      );
    }
    if (data.configurationId !== undefined && data.configurationId !== existing.configurationId) {
      throw new Error(
        `IntegrityError: Availability record ${id} is bound to configuration ${existing.configurationId} and cannot be reassigned to ${data.configurationId}.`
      );
    }

    const updated: ProjectConfigurationAvailability = {
      ...existing,
      ...data,
      projectId: existing.projectId,
      configurationId: existing.configurationId,
      updatedAt: new Date(),
    };
    this.availabilities.set(id, updated);
    return updated;
  }

  async upsert(data: UpsertConfigurationAvailabilityInput): Promise<ProjectConfigurationAvailability> {
    const existing = await this.findByConfigurationId(data.configurationId);
    const now = new Date();
    if (existing) {
      if (existing.projectId !== data.projectId) {
        throw new Error(
          `IntegrityError: Configuration ${data.configurationId} belongs to project ${existing.projectId} and cannot be associated with ${data.projectId}.`
        );
      }
      const updated: ProjectConfigurationAvailability = {
        ...existing,
        availabilityStatus: data.availabilityStatus,
        availableFrom: data.availableFrom !== undefined ? data.availableFrom : existing.availableFrom,
        lastVerifiedAt: data.lastVerifiedAt ?? now,
        updatedByStaffId: data.updatedByStaffId !== undefined ? data.updatedByStaffId : existing.updatedByStaffId,
        updatedByStaffName: data.updatedByStaffName !== undefined ? data.updatedByStaffName : existing.updatedByStaffName,
        source: data.source !== undefined ? data.source : existing.source,
        internalNotes: data.internalNotes !== undefined ? data.internalNotes : existing.internalNotes,
        updatedAt: now,
      };
      this.availabilities.set(existing.id, updated);
      return updated;
    }

    const id = `nav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const created: ProjectConfigurationAvailability = {
      id,
      projectId: data.projectId,
      configurationId: data.configurationId,
      availabilityStatus: data.availabilityStatus,
      availableFrom: data.availableFrom ?? null,
      lastVerifiedAt: data.lastVerifiedAt ?? now,
      updatedByStaffId: data.updatedByStaffId ?? null,
      updatedByStaffName: data.updatedByStaffName ?? null,
      source: data.source ?? null,
      internalNotes: data.internalNotes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.availabilities.set(id, created);
    return created;
  }

  async delete(id: string): Promise<boolean> {
    return this.availabilities.delete(id);
  }
}
