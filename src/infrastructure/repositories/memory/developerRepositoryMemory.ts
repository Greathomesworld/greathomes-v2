import { Developer } from "@/src/domain/developers/entities";
import { DeveloperMedia } from "@/src/domain/developers/media";
import { DeveloperRepository, DeveloperMediaRepository, DeveloperListFilter } from "@/src/domain/repositories/developerRepository";
import { v4 as uuidv4 } from 'uuid';

export class DeveloperMediaRepositoryMemory implements DeveloperMediaRepository {
  private mediaList: DeveloperMedia[] = [];

  async findByDeveloperId(developerId: string): Promise<DeveloperMedia[]> {
    return this.mediaList.filter(m => m.developerId === developerId);
  }

  async findByDeveloperIds(developerIds: string[], category?: string): Promise<DeveloperMedia[]> {
    const set = new Set(developerIds);
    return this.mediaList.filter(m => set.has(m.developerId) && (!category || m.category === category));
  }

  async findById(id: string): Promise<DeveloperMedia | null> {
    return this.mediaList.find(m => m.id === id) || null;
  }

  async findAll(filter?: { category?: string; isFeatured?: boolean }): Promise<DeveloperMedia[]> {
    let result = [...this.mediaList];
    if (filter?.category) result = result.filter(m => m.category === filter.category);
    if (filter?.isFeatured !== undefined) result = result.filter(m => m.isFeatured === filter.isFeatured);
    return result;
  }

  async create(data: Omit<DeveloperMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperMedia> {
    const item: DeveloperMedia = {
      ...data,
      id: uuidv4(),
      sortOrder: data.sortOrder ?? 0,
      isFeatured: data.isFeatured ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.mediaList.push(item);
    return item;
  }

  async update(id: string, data: Partial<DeveloperMedia>): Promise<DeveloperMedia | null> {
    const index = this.mediaList.findIndex(m => m.id === id);
    if (index === -1) return null;
    this.mediaList[index] = {
      ...this.mediaList[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.mediaList[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.mediaList.findIndex(m => m.id === id);
    if (index === -1) return false;
    this.mediaList.splice(index, 1);
    return true;
  }
}

export class DeveloperRepositoryMemory implements DeveloperRepository {
  private developers: Developer[] = [];

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async create(data: Omit<Developer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Developer> {
    const developer: Developer = {
      ...data,
      id: uuidv4(),
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      websiteUrl: data.websiteUrl ?? null,
      featured: data.featured ?? false,
      status: data.status ?? 'DRAFT',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.developers.push(developer);
    return developer;
  }

  async findById(id: string): Promise<Developer | null> {
    return this.developers.find(d => d.id === id) || null;
  }

  async findBySlug(slug: string): Promise<Developer | null> {
    return this.developers.find(d => d.slug === slug) || null;
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    return this.developers.some(d => d.slug === slug && d.id !== excludeId);
  }

  async list(filter?: DeveloperListFilter): Promise<Developer[]> {
    let result = [...this.developers];

    if (filter?.status) {
      result = result.filter(d => d.status === filter.status);
    }
    if (filter?.featured !== undefined) {
      result = result.filter(d => d.featured === filter.featured);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(d => d.name.toLowerCase().includes(q) || d.slug.includes(q));
    }

    return result;
  }

  async findDuplicates(name: string, excludeId?: string): Promise<Developer[]> {
    const targetNormalized = this.normalizeName(name);
    return this.developers.filter(d => {
      if (excludeId && d.id === excludeId) return false;
      return this.normalizeName(d.name) === targetNormalized;
    });
  }

  async update(id: string, data: Partial<Developer>): Promise<Developer | null> {
    const index = this.developers.findIndex(d => d.id === id);
    if (index === -1) return null;

    this.developers[index] = {
      ...this.developers[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.developers[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.developers.findIndex(d => d.id === id);
    if (index === -1) return false;
    this.developers.splice(index, 1);
    return true;
  }

  // Helper for test cleanup
  clear(): void {
    this.developers = [];
  }
}

export class DeveloperSeoRepositoryMemory implements DeveloperSeoRepository {
  private items: DeveloperSeo[] = [];

  async findByDeveloperId(developerId: string): Promise<DeveloperSeo | null> {
    return this.items.find(i => i.developerId === developerId) || null;
  }

  async upsert(data: Omit<DeveloperSeo, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeveloperSeo> {
    const existingIndex = this.items.findIndex(i => i.developerId === data.developerId);
    if (existingIndex >= 0) {
      this.items[existingIndex] = {
        ...this.items[existingIndex],
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        canonicalUrl: data.canonicalUrl,
        updatedAt: new Date(),
      };
      return this.items[existingIndex];
    }
    const item: DeveloperSeo = {
      id: uuidv4(),
      developerId: data.developerId,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      canonicalUrl: data.canonicalUrl,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.items.push(item);
    return item;
  }

  async deleteByDeveloperId(developerId: string): Promise<boolean> {
    const beforeCount = this.items.length;
    this.items = this.items.filter(i => i.developerId !== developerId);
    return this.items.length < beforeCount;
  }
}

import { DeveloperRepositoryPostgres } from '../postgres/developerRepositoryPostgres';
import { DeveloperMediaRepositoryPostgres, DeveloperSeoRepositoryPostgres } from '../postgres/projectRepositoryPostgres';
import { DeveloperSeo, DeveloperSeoRepository } from '@/src/domain/repositories/developerRepository';

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

const g = globalThis as unknown as {
  __ghDeveloperRepo?: DeveloperRepository;
  __ghDeveloperMediaRepo?: DeveloperMediaRepository;
  __ghDeveloperSeoRepo?: DeveloperSeoRepository;
};

if (!g.__ghDeveloperRepo) {
  g.__ghDeveloperRepo = usePostgres ? new DeveloperRepositoryPostgres() : new DeveloperRepositoryMemory();
}
if (!g.__ghDeveloperMediaRepo) {
  g.__ghDeveloperMediaRepo = usePostgres ? new DeveloperMediaRepositoryPostgres() : new DeveloperMediaRepositoryMemory();
}
if (!g.__ghDeveloperSeoRepo) {
  g.__ghDeveloperSeoRepo = usePostgres ? new DeveloperSeoRepositoryPostgres() : new DeveloperSeoRepositoryMemory();
}

export const developerRepository: DeveloperRepository = g.__ghDeveloperRepo;
export const developerMediaRepository: DeveloperMediaRepository = g.__ghDeveloperMediaRepo;
export const developerSeoRepository: DeveloperSeoRepository = g.__ghDeveloperSeoRepo;

