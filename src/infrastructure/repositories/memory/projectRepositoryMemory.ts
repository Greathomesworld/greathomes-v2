import {
  Project,
  ProjectConfiguration,
  ProjectMedia,
  ProjectRera,
  Amenity,
  ProjectAmenity,
  ProjectFaq,
  ProjectSeo,
} from "../../../domain/projects/entities";
import {
  ProjectRepository,
  ProjectFilterOptions,
  ProjectConfigurationRepository,
  ProjectMediaRepository,
  ProjectReraRepository,
  AmenityRepository,
  ProjectFaqRepository,
  ProjectSeoRepository,
} from "../../../domain/repositories/projectRepository";
import { v4 as uuidv4 } from 'uuid';

export class ProjectRepositoryMemory implements ProjectRepository {
  private projects: Project[] = [];

  async create(data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
    const project: Project = {
      ...data,
      id: uuidv4(),
      priceOnRequest: Boolean(data.priceOnRequest),
      lifecycleStatus: data.lifecycleStatus ?? (data.isPublished === false ? 'DRAFT' : 'PUBLISHED'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.projects.push(project);
    return project;
  }

  async findById(id: string): Promise<Project | null> {
    return this.projects.find(p => p.id === id) || null;
  }

  async findByIds(ids: string[]): Promise<Project[]> {
    const set = new Set(ids);
    return this.projects.filter(p => set.has(p.id));
  }

  async findBySlug(slug: string): Promise<Project | null> {
    return this.projects.find(p => p.slug.toLowerCase() === slug.toLowerCase()) || null;
  }

  async findAll(): Promise<Project[]> {
    return [...this.projects];
  }

  async list(filter?: ProjectFilterOptions): Promise<Project[]> {
    let result = [...this.projects];

    if (filter) {
      if (filter.status) {
        result = result.filter(p => p.status === filter.status);
      }
      if (filter.lifecycleStatus) {
        result = result.filter(p => {
          const effectiveLifecycle = p.lifecycleStatus ?? (p.isPublished === false ? 'DRAFT' : 'PUBLISHED');
          return effectiveLifecycle === filter.lifecycleStatus;
        });
      }
      if (filter.developerId) {
        result = result.filter(p => p.developerId === filter.developerId);
      }
      if (filter.locationId) {
        result = result.filter(p => p.locationId === filter.locationId);
      }
      if (filter.propertyType) {
        result = result.filter(p => p.propertyType === filter.propertyType);
      }
      if (filter.featured !== undefined) {
        result = result.filter(p => Boolean(p.featured) === filter.featured);
      }
      if (filter.isPublished !== undefined) {
        result = result.filter(p => {
          const isPub = p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false;
          return isPub === filter.isPublished;
        });
      }
    }

    return result;
  }

  async findByDeveloperId(developerId: string): Promise<Project[]> {
    return this.projects.filter(p => p.developerId === developerId);
  }

  async findByDeveloperIds(developerIds: string[]): Promise<Project[]> {
    const set = new Set(developerIds);
    return this.projects.filter(p => set.has(p.developerId));
  }

  async findByLocationId(locationId: string): Promise<Project[]> {
    return this.projects.filter(p => p.locationId === locationId);
  }

  async update(id: string, data: Partial<Project>): Promise<Project | null> {
    const index = this.projects.findIndex(p => p.id === id);
    if (index === -1) return null;
    const existing = this.projects[index];
    this.projects[index] = {
      ...existing,
      ...data,
      priceOnRequest: data.priceOnRequest !== undefined ? Boolean(data.priceOnRequest) : Boolean(existing.priceOnRequest),
      updatedAt: new Date(),
    };
    return this.projects[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.projects.findIndex(p => p.id === id);
    if (index === -1) return false;
    this.projects.splice(index, 1);
    return true;
  }
}

export class ProjectConfigurationRepositoryMemory implements ProjectConfigurationRepository {
  private configurations: ProjectConfiguration[] = [];
  private mediaRepo?: ProjectMediaRepositoryMemory;

  constructor(mediaRepo?: ProjectMediaRepositoryMemory) {
    this.mediaRepo = mediaRepo;
  }

  setMediaRepository(mediaRepo: ProjectMediaRepositoryMemory): void {
    this.mediaRepo = mediaRepo;
  }

  private resolveMediaRepository(): ProjectMediaRepositoryMemory | undefined {
    if (this.mediaRepo) return this.mediaRepo;
    const globalRef = globalThis as unknown as { __ghProjectMediaRepo?: unknown };
    if (globalRef.__ghProjectMediaRepo instanceof ProjectMediaRepositoryMemory) {
      return globalRef.__ghProjectMediaRepo;
    }
    return undefined;
  }

  async findAll(): Promise<ProjectConfiguration[]> {
    return [...this.configurations];
  }

  async findByProjectId(projectId: string): Promise<ProjectConfiguration[]> {
    return this.configurations.filter(c => c.projectId === projectId);
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectConfiguration[]> {
    const set = new Set(projectIds);
    return this.configurations.filter(c => set.has(c.projectId));
  }

  async findById(id: string): Promise<ProjectConfiguration | null> {
    return this.configurations.find(c => c.id === id) || null;
  }

  async create(data: Omit<ProjectConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfiguration> {
    const config: ProjectConfiguration = {
      ...data,
      id: uuidv4(),
      priceOnRequest: Boolean(data.priceOnRequest),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.configurations.push(config);
    return config;
  }

  async update(id: string, data: Partial<ProjectConfiguration>): Promise<ProjectConfiguration | null> {
    const index = this.configurations.findIndex(c => c.id === id);
    if (index === -1) return null;

    const existing = this.configurations[index];
    const updated: ProjectConfiguration = {
      ...existing,
      ...data,
      priceOnRequest: data.priceOnRequest !== undefined ? Boolean(data.priceOnRequest) : Boolean(existing.priceOnRequest),
      carpetArea: data.carpetArea !== undefined ? (data.carpetArea ?? undefined) : existing.carpetArea,
      builtUpArea: data.builtUpArea !== undefined ? (data.builtUpArea ?? undefined) : existing.builtUpArea,
      superBuiltUpArea:
        data.superBuiltUpArea !== undefined ? (data.superBuiltUpArea ?? undefined) : existing.superBuiltUpArea,
      bedroomCount: data.bedroomCount !== undefined ? (data.bedroomCount ?? undefined) : existing.bedroomCount,
      updatedAt: new Date(),
    };

    this.configurations[index] = updated;
    return updated;
  }

  protected removeConfigurationAtIndex(index: number): void {
    this.configurations.splice(index, 1);
  }

  async delete(id: string): Promise<boolean> {
    const index = this.configurations.findIndex(c => c.id === id);
    if (index === -1) return false;

    const targetConfig = this.configurations[index];
    const mediaRepo = this.resolveMediaRepository();
    const snapshots = mediaRepo ? mediaRepo.snapshotByConfigurationId(id) : [];

    try {
      if (mediaRepo) {
        mediaRepo.disassociateConfiguration(id);
      }
      this.removeConfigurationAtIndex(index);
      return true;
    } catch (err) {
      if (mediaRepo && snapshots.length > 0) {
        mediaRepo.restoreConfigurationSnapshots(snapshots);
      }
      if (!this.configurations.some(c => c.id === targetConfig.id)) {
        this.configurations.splice(index, 0, targetConfig);
      }
      throw err;
    }
  }

  async findDuplicates(projectId: string, name: string, excludeId?: string): Promise<ProjectConfiguration[]> {
    const normalized = name.trim().toLowerCase();
    return this.configurations.filter(
      c => c.projectId === projectId && c.id !== excludeId && c.name.trim().toLowerCase() === normalized
    );
  }
}

export class ProjectMediaRepositoryMemory implements ProjectMediaRepository {
  private mediaList: ProjectMedia[] = [];

  snapshotByConfigurationId(
    configurationId: string
  ): Array<{ id: string; configurationId?: string | null; updatedAt: Date }> {
    return this.mediaList
      .filter(m => m.configurationId === configurationId)
      .map(m => ({
        id: m.id,
        configurationId: m.configurationId,
        updatedAt: m.updatedAt,
      }));
  }

  disassociateConfiguration(configurationId: string): number {
    let count = 0;
    const now = new Date();
    for (let i = 0; i < this.mediaList.length; i++) {
      if (this.mediaList[i].configurationId === configurationId) {
        this.mediaList[i] = {
          ...this.mediaList[i],
          configurationId: undefined,
          updatedAt: now,
        };
        count++;
      }
    }
    return count;
  }

  restoreConfigurationSnapshots(
    snapshots: Array<{ id: string; configurationId?: string | null; updatedAt: Date }>
  ): void {
    const map = new Map(snapshots.map(s => [s.id, s]));
    for (let i = 0; i < this.mediaList.length; i++) {
      const snap = map.get(this.mediaList[i].id);
      if (snap) {
        this.mediaList[i] = {
          ...this.mediaList[i],
          configurationId: snap.configurationId ?? undefined,
          updatedAt: snap.updatedAt,
        };
      }
    }
  }

  async findByProjectId(projectId: string): Promise<ProjectMedia[]> {
    return this.mediaList.filter(m => m.projectId === projectId);
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectMedia[]> {
    const set = new Set(projectIds);
    return this.mediaList.filter(m => set.has(m.projectId));
  }

  async findById(id: string): Promise<ProjectMedia | null> {
    return this.mediaList.find(m => m.id === id) || null;
  }

  async findAll(filter?: { category?: string; isFeatured?: boolean }): Promise<ProjectMedia[]> {
    let result = [...this.mediaList];
    if (filter?.category) result = result.filter(m => m.category === filter.category);
    if (filter?.isFeatured !== undefined) result = result.filter(m => m.isFeatured === filter.isFeatured);
    return result;
  }

  async create(data: Omit<ProjectMedia, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ProjectMedia> {
    const item: ProjectMedia = {
      ...data,
      id: data.id || uuidv4(),
      mediaId: data.mediaId || data.id || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.mediaList.push(item);
    return item;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.mediaList.findIndex(m => m.id === id || m.mediaId === id);
    if (index === -1) return false;
    this.mediaList.splice(index, 1);
    return true;
  }

  async update(id: string, data: Partial<ProjectMedia>): Promise<ProjectMedia | null> {
    const index = this.mediaList.findIndex(m => m.id === id || m.mediaId === id);
    if (index === -1) return null;
    this.mediaList[index] = {
      ...this.mediaList[index],
      ...data,
      configurationId: data.configurationId === null ? undefined : (data.configurationId !== undefined ? data.configurationId : this.mediaList[index].configurationId),
      updatedAt: new Date(),
    };
    return this.mediaList[index];
  }
}

export class ProjectReraRepositoryMemory implements ProjectReraRepository {
  private reraRecords: ProjectRera[] = [];

  async findByProjectId(projectId: string): Promise<ProjectRera | null> {
    return this.reraRecords.find(r => r.projectId === projectId) || null;
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectRera[]> {
    const set = new Set(projectIds);
    return this.reraRecords.filter(r => set.has(r.projectId));
  }

  async findAll(): Promise<ProjectRera[]> {
    return [...this.reraRecords];
  }

  async upsert(data: Omit<ProjectRera, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectRera> {
    const index = this.reraRecords.findIndex(r => r.projectId === data.projectId);
    if (index !== -1) {
      this.reraRecords[index] = {
        ...this.reraRecords[index],
        ...data,
        updatedAt: new Date(),
      };
      return this.reraRecords[index];
    }
    const item: ProjectRera = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.reraRecords.push(item);
    return item;
  }
}

export class AmenityRepositoryMemory implements AmenityRepository {
  private amenities: Amenity[] = [];
  private projectAmenities: ProjectAmenity[] = [];

  async findAll(): Promise<Amenity[]> {
    return [...this.amenities];
  }

  async findById(id: string): Promise<Amenity | null> {
    return this.amenities.find(a => a.id === id) || null;
  }

  async findBySlug(slug: string): Promise<Amenity | null> {
    return this.amenities.find(a => a.slug.toLowerCase() === slug.toLowerCase()) || null;
  }

  async findByIds(ids: string[]): Promise<Amenity[]> {
    const set = new Set(ids);
    return this.amenities.filter(a => set.has(a.id));
  }

  async findByProjectId(projectId: string): Promise<{ amenity: Amenity; isFeatured: boolean; sortOrder: number }[]> {
    const links = this.projectAmenities.filter(pa => pa.projectId === projectId);
    const result: { amenity: Amenity; isFeatured: boolean; sortOrder: number }[] = [];

    for (const link of links) {
      const amenity = this.amenities.find(a => a.id === link.amenityId);
      if (amenity) {
        result.push({
          amenity,
          isFeatured: link.isFeatured,
          sortOrder: link.sortOrder,
        });
      }
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findByProjectIds(projectIds: string[]): Promise<Map<string, { amenity: Amenity; isFeatured: boolean; sortOrder: number }[]>> {
    const result = new Map<string, { amenity: Amenity; isFeatured: boolean; sortOrder: number }[]>();
    if (projectIds.length === 0) return result;
    const set = new Set(projectIds);
    const amenityMap = new Map(this.amenities.map(a => [a.id, a]));

    for (const link of this.projectAmenities) {
      if (!set.has(link.projectId)) continue;
      const amenity = amenityMap.get(link.amenityId);
      if (!amenity) continue;
      const list = result.get(link.projectId) || [];
      list.push({
        amenity,
        isFeatured: link.isFeatured,
        sortOrder: link.sortOrder,
      });
      result.set(link.projectId, list);
    }

    for (const [projId, list] of result.entries()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
      result.set(projId, list);
    }

    return result;
  }

  async create(data: Omit<Amenity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Amenity> {
    const amenity: Amenity = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.amenities.push(amenity);
    return amenity;
  }

  async update(id: string, data: Partial<Amenity>): Promise<Amenity | null> {
    const index = this.amenities.findIndex(a => a.id === id);
    if (index === -1) return null;
    this.amenities[index] = {
      ...this.amenities[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.amenities[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.amenities.findIndex(a => a.id === id);
    if (index === -1) return false;
    this.amenities.splice(index, 1);
    this.projectAmenities = this.projectAmenities.filter(pa => pa.amenityId !== id);
    return true;
  }

  async countProjectAssociations(amenityId: string): Promise<number> {
    return this.projectAmenities.filter(pa => pa.amenityId === amenityId).length;
  }

  async associateWithProject(
    projectId: string,
    amenityId: string,
    isFeatured = false,
    sortOrder = 0
  ): Promise<void> {
    const existing = this.projectAmenities.find(
      pa => pa.projectId === projectId && pa.amenityId === amenityId
    );
    if (existing) {
      existing.isFeatured = isFeatured;
      existing.sortOrder = sortOrder;
      existing.updatedAt = new Date();
      return;
    }
    this.projectAmenities.push({
      id: uuidv4(),
      projectId,
      amenityId,
      isFeatured,
      sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  async dissociateFromProject(projectId: string, amenityId: string): Promise<boolean> {
    const index = this.projectAmenities.findIndex(
      pa => pa.projectId === projectId && pa.amenityId === amenityId
    );
    if (index === -1) return false;
    this.projectAmenities.splice(index, 1);
    return true;
  }
}

export class ProjectFaqRepositoryMemory implements ProjectFaqRepository {
  private faqs: ProjectFaq[] = [];

  async findByProjectId(projectId: string): Promise<ProjectFaq[]> {
    return this.faqs
      .filter(f => f.projectId === projectId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectFaq[]> {
    if (projectIds.length === 0) return [];
    const set = new Set(projectIds);
    return this.faqs
      .filter(f => set.has(f.projectId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async findById(id: string): Promise<ProjectFaq | null> {
    return this.faqs.find(f => f.id === id) || null;
  }

  async findAll(): Promise<ProjectFaq[]> {
    return [...this.faqs].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async create(data: Omit<ProjectFaq, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectFaq> {
    const item: ProjectFaq = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.faqs.push(item);
    return item;
  }

  async update(id: string, data: Partial<ProjectFaq>): Promise<ProjectFaq | null> {
    const index = this.faqs.findIndex(f => f.id === id);
    if (index === -1) return null;
    this.faqs[index] = {
      ...this.faqs[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.faqs[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.faqs.findIndex(f => f.id === id);
    if (index === -1) return false;
    this.faqs.splice(index, 1);
    return true;
  }
}

export class ProjectSeoRepositoryMemory implements ProjectSeoRepository {
  private seoRecords: ProjectSeo[] = [];

  async findByProjectId(projectId: string): Promise<ProjectSeo | null> {
    return this.seoRecords.find(s => s.projectId === projectId) || null;
  }

  async upsert(data: Omit<ProjectSeo, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectSeo> {
    const index = this.seoRecords.findIndex(s => s.projectId === data.projectId);
    if (index !== -1) {
      this.seoRecords[index] = {
        ...this.seoRecords[index],
        ...data,
        updatedAt: new Date(),
      };
      return this.seoRecords[index];
    }
    const item: ProjectSeo = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.seoRecords.push(item);
    return item;
  }
}

import {
  ProjectRepositoryPostgres,
  ProjectConfigurationRepositoryPostgres,
  ProjectMediaRepositoryPostgres,
  ProjectReraRepositoryPostgres,
  AmenityRepositoryPostgres,
  ProjectFaqRepositoryPostgres,
  ProjectSeoRepositoryPostgres,
} from '../postgres/projectRepositoryPostgres';

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

const g = globalThis as unknown as {
  __ghProjectRepo?: ProjectRepository;
  __ghProjectConfigRepo?: ProjectConfigurationRepository;
  __ghProjectMediaRepo?: ProjectMediaRepository;
  __ghProjectReraRepo?: ProjectReraRepository;
  __ghAmenityRepo?: AmenityRepository;
  __ghProjectFaqRepo?: ProjectFaqRepository;
  __ghProjectSeoRepo?: ProjectSeoRepository;
};

if (!g.__ghProjectRepo) {
  g.__ghProjectRepo = usePostgres ? new ProjectRepositoryPostgres() : new ProjectRepositoryMemory();
}
if (!g.__ghProjectConfigRepo) {
  g.__ghProjectConfigRepo = usePostgres ? new ProjectConfigurationRepositoryPostgres() : new ProjectConfigurationRepositoryMemory();
}
if (!g.__ghProjectMediaRepo) {
  g.__ghProjectMediaRepo = usePostgres ? new ProjectMediaRepositoryPostgres() : new ProjectMediaRepositoryMemory();
}
if (!g.__ghProjectReraRepo) {
  g.__ghProjectReraRepo = usePostgres ? new ProjectReraRepositoryPostgres() : new ProjectReraRepositoryMemory();
}
if (!g.__ghAmenityRepo) {
  g.__ghAmenityRepo = usePostgres ? new AmenityRepositoryPostgres() : new AmenityRepositoryMemory();
}
if (!g.__ghProjectFaqRepo) {
  g.__ghProjectFaqRepo = usePostgres ? new ProjectFaqRepositoryPostgres() : new ProjectFaqRepositoryMemory();
}
if (!g.__ghProjectSeoRepo) {
  g.__ghProjectSeoRepo = usePostgres ? new ProjectSeoRepositoryPostgres() : new ProjectSeoRepositoryMemory();
}

export const projectRepository: ProjectRepository = g.__ghProjectRepo;
export const projectConfigurationRepository: ProjectConfigurationRepository = g.__ghProjectConfigRepo;
export const projectMediaRepository: ProjectMediaRepository = g.__ghProjectMediaRepo;
export const projectReraRepository: ProjectReraRepository = g.__ghProjectReraRepo;
export const amenityRepository: AmenityRepository = g.__ghAmenityRepo;
export const projectFaqRepository: ProjectFaqRepository = g.__ghProjectFaqRepo;
export const projectSeoRepository: ProjectSeoRepository = g.__ghProjectSeoRepo;
