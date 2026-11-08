import { Location } from "../../../domain/locations/entities";
import { LocationRepository } from "../../../domain/repositories/locationRepository";
import { v4 as uuidv4 } from 'uuid';

export class LocationRepositoryMemory implements LocationRepository {
  private locations: Location[] = [];

  async create(data: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location> {
    const location: Location = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.locations.push(location);
    return location;
  }

  async findById(id: string): Promise<Location | null> {
    return this.locations.find(l => l.id === id) || null;
  }

  async findByIds(ids: string[]): Promise<Location[]> {
    const set = new Set(ids);
    return this.locations.filter(l => set.has(l.id));
  }

  async findBySlug(slug: string): Promise<Location | null> {
    return this.locations.find(l => l.slug === slug) || null;
  }

  async findAll(): Promise<Location[]> {
    return this.locations;
  }

  async findByParentId(parentId: string): Promise<Location[]> {
    return this.locations.filter(l => l.parentId === parentId);
  }

  async update(id: string, data: Partial<Location>): Promise<Location | null> {
    const index = this.locations.findIndex(l => l.id === id);
    if (index === -1) return null;
    this.locations[index] = { ...this.locations[index], ...data, updatedAt: new Date() };
    return this.locations[index];
  }

  async delete(id: string): Promise<boolean> {
    const index = this.locations.findIndex(l => l.id === id);
    if (index === -1) return false;
    this.locations.splice(index, 1);
    return true;
  }
}

import { LocationRepositoryPostgres } from '../postgres/locationRepositoryPostgres';

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

const g = globalThis as unknown as { __ghLocationRepo?: LocationRepository };
if (!g.__ghLocationRepo) {
  g.__ghLocationRepo = usePostgres ? new LocationRepositoryPostgres() : new LocationRepositoryMemory();
}

export const locationRepository: LocationRepository = g.__ghLocationRepo;
