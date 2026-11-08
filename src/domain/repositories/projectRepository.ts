import {
  Project,
  ProjectConfiguration,
  ProjectMedia,
  ProjectRera,
  Amenity,
  ProjectFaq,
  ProjectSeo,
  ProjectConsideration,
  ConsiderationSection,
} from "../projects/entities";

export interface ProjectFilterOptions {
  status?: string;
  lifecycleStatus?: string;
  developerId?: string;
  locationId?: string;
  propertyType?: string;
  featured?: boolean;
  isPublished?: boolean;
}

export interface ProjectRepository {
  create(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findByIds(ids: string[]): Promise<Project[]>;
  findBySlug(slug: string): Promise<Project | null>;
  findAll(): Promise<Project[]>;
  list(filter?: ProjectFilterOptions): Promise<Project[]>;
  findByDeveloperId(developerId: string): Promise<Project[]>;
  findByDeveloperIds(developerIds: string[]): Promise<Project[]>;
  findByLocationId(locationId: string): Promise<Project[]>;
  update(id: string, project: Partial<Project>): Promise<Project | null>;
  delete(id: string): Promise<boolean>;
}

export interface ProjectConfigurationRepository {
  findAll(): Promise<ProjectConfiguration[]>;
  findByProjectId(projectId: string): Promise<ProjectConfiguration[]>;
  findByProjectIds(projectIds: string[]): Promise<ProjectConfiguration[]>;
  findById(id: string): Promise<ProjectConfiguration | null>;
  create(config: Omit<ProjectConfiguration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConfiguration>;
  update(id: string, config: Partial<ProjectConfiguration>): Promise<ProjectConfiguration | null>;
  delete(id: string): Promise<boolean>;
  findDuplicates(projectId: string, name: string, excludeId?: string): Promise<ProjectConfiguration[]>;
}

export interface ProjectMediaRepository {
  findByProjectId(projectId: string): Promise<ProjectMedia[]>;
  findByProjectIds(projectIds: string[]): Promise<ProjectMedia[]>;
  findById(id: string): Promise<ProjectMedia | null>;
  findAll(filter?: { category?: string; isFeatured?: boolean }): Promise<ProjectMedia[]>;
  create(media: Omit<ProjectMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectMedia>;
  delete(id: string): Promise<boolean>;
  update(id: string, data: Partial<ProjectMedia>): Promise<ProjectMedia | null>;
}

export interface ProjectReraRepository {
  findByProjectId(projectId: string): Promise<ProjectRera | null>;
  findByProjectIds(projectIds: string[]): Promise<ProjectRera[]>;
  upsert(rera: Omit<ProjectRera, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectRera>;
  findAll(): Promise<ProjectRera[]>;
}

export interface AmenityRepository {
  findAll(): Promise<Amenity[]>;
  findById(id: string): Promise<Amenity | null>;
  findBySlug(slug: string): Promise<Amenity | null>;
  findByIds(ids: string[]): Promise<Amenity[]>;
  findByProjectId(projectId: string): Promise<{ amenity: Amenity; isFeatured: boolean; sortOrder: number }[]>;
  create(amenity: Omit<Amenity, 'id' | 'createdAt' | 'updatedAt'>): Promise<Amenity>;
  update(id: string, amenity: Partial<Amenity>): Promise<Amenity | null>;
  delete(id: string): Promise<boolean>;
  countProjectAssociations(amenityId: string): Promise<number>;
  associateWithProject(projectId: string, amenityId: string, isFeatured?: boolean, sortOrder?: number): Promise<void>;
  dissociateFromProject(projectId: string, amenityId: string): Promise<boolean>;
}

export interface ProjectFaqRepository {
  findByProjectId(projectId: string): Promise<ProjectFaq[]>;
  findById(id: string): Promise<ProjectFaq | null>;
  findAll(): Promise<ProjectFaq[]>;
  create(faq: Omit<ProjectFaq, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectFaq>;
  update(id: string, data: Partial<ProjectFaq>): Promise<ProjectFaq | null>;
  delete(id: string): Promise<boolean>;
}

export interface ProjectSeoRepository {
  findByProjectId(projectId: string): Promise<ProjectSeo | null>;
  upsert(seo: Omit<ProjectSeo, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectSeo>;
}

export interface ProjectConsiderationRepository {
  findByProjectId(projectId: string): Promise<ProjectConsideration[]>;
  findById(id: string): Promise<ProjectConsideration | null>;
  create(consideration: Omit<ProjectConsideration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConsideration>;
  update(id: string, data: Partial<ProjectConsideration>): Promise<ProjectConsideration | null>;
  delete(id: string): Promise<boolean>;
  reorder(projectId: string, section: ConsiderationSection, orderedIds: string[]): Promise<void>;
}

