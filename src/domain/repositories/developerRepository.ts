import { Developer, DeveloperStatus } from "../developers/entities";
import { DeveloperMedia } from "../developers/media";

export interface DeveloperListFilter {
  status?: DeveloperStatus;
  featured?: boolean;
  search?: string;
}

export interface DeveloperRepository {
  create(data: Omit<Developer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Developer>;
  update(id: string, data: Partial<Developer>): Promise<Developer | null>;
  findById(id: string): Promise<Developer | null>;
  findBySlug(slug: string): Promise<Developer | null>;
  list(filter?: DeveloperListFilter): Promise<Developer[]>;
  delete(id: string): Promise<boolean>;
  existsBySlug(slug: string, excludeId?: string): Promise<boolean>;
  findDuplicates(name: string, excludeId?: string): Promise<Developer[]>;
  findRelatedPublishedDevelopers?(excludeDeveloperId: string, excludeSlugs: string[], limit: number): Promise<Developer[]>;
}

export interface DeveloperMediaRepository {
  findByDeveloperId(developerId: string): Promise<DeveloperMedia[]>;
  findByDeveloperIds(developerIds: string[], category?: string): Promise<DeveloperMedia[]>;
  findById(id: string): Promise<DeveloperMedia | null>;
  findAll(filter?: { category?: string; isFeatured?: boolean }): Promise<DeveloperMedia[]>;
  create(data: Omit<DeveloperMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperMedia>;
  update(id: string, data: Partial<DeveloperMedia>): Promise<DeveloperMedia | null>;
  delete(id: string): Promise<boolean>;
}

export interface DeveloperSeo {
  id: string;
  developerId: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperSeoRepository {
  findByDeveloperId(developerId: string): Promise<DeveloperSeo | null>;
  upsert(data: Omit<DeveloperSeo, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperSeo>;
  deleteByDeveloperId?(developerId: string): Promise<boolean>;
}


