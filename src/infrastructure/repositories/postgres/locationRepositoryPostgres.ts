import { Location, LocationType, LocationStatus } from '@/src/domain/locations/entities';
import { LocationRepository } from '@/src/domain/repositories/locationRepository';
import { getDb } from '@/src/db/client';
import { locations } from '@/src/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export class LocationRepositoryPostgres implements LocationRepository {
  private allCache: { data: Location[]; byId: Map<string, Location>; bySlug: Map<string, Location>; expiresAt: number } | null = null;
  private inflightAll: Promise<Location[]> | null = null;

  private invalidateCache() {
    this.allCache = null;
    this.inflightAll = null;
  }

  private async getCachedAll(): Promise<{ data: Location[]; byId: Map<string, Location>; bySlug: Map<string, Location> }> {
    const now = Date.now();
    if (this.allCache && this.allCache.expiresAt > now) {
      return this.allCache;
    }

    if (!this.inflightAll) {
      const db = getDb();
      if (!db) throw new Error('PostgreSQL database not initialized.');
      this.inflightAll = db
        .select()
        .from(locations)
        .then(rows => rows.map(r => this.mapRow(r)))
        .finally(() => {
          this.inflightAll = null;
        });
    }

    const data = await this.inflightAll;
    const byId = new Map<string, Location>();
    const bySlug = new Map<string, Location>();
    for (const loc of data) {
      byId.set(loc.id, loc);
      bySlug.set(loc.slug.toLowerCase(), loc);
    }
    this.allCache = { data, byId, bySlug, expiresAt: Date.now() + 3_000 };
    return this.allCache;
  }

  async create(data: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const id = uuidv4();
    const now = new Date();
    const [inserted] = await db.insert(locations).values({
      id,
      name: data.name,
      slug: data.slug,
      type: data.type as any,
      parentId: data.parentId ?? null,
      description: data.description ?? null,
      shortDescription: data.shortDescription ?? null,
      latitude: data.latitude !== undefined && data.latitude !== null ? data.latitude.toString() : null,
      longitude: data.longitude !== undefined && data.longitude !== null ? data.longitude.toString() : null,
      status: (data.status as any) ?? 'DRAFT',
      featured: data.featured ?? false,
      createdAt: now,
      updatedAt: now,
    } as any).returning();

    this.invalidateCache();
    return this.mapRow(inserted);
  }

  async findById(id: string): Promise<Location | null> {
    if (!isUuid(id)) return null;
    const cache = await this.getCachedAll();
    return cache.byId.get(id) || null;
  }

  async findByIds(ids: string[]): Promise<Location[]> {
    const validIds = Array.from(new Set(ids.filter(isUuid)));
    if (validIds.length === 0) return [];
    const cache = await this.getCachedAll();
    return validIds.map(id => cache.byId.get(id)).filter((l): l is Location => Boolean(l));
  }

  async findBySlug(slug: string): Promise<Location | null> {
    const cache = await this.getCachedAll();
    return cache.bySlug.get(slug.toLowerCase().trim()) || null;
  }

  async findAll(): Promise<Location[]> {
    const cache = await this.getCachedAll();
    return cache.data;
  }

  async findByParentId(parentId: string): Promise<Location[]> {
    if (!isUuid(parentId)) return [];
    const cache = await this.getCachedAll();
    return cache.data.filter(l => l.parentId === parentId);
  }

  async update(id: string, data: Partial<Location>): Promise<Location | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const now = new Date();
    const updateValues: any = { updatedAt: now };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.slug !== undefined) updateValues.slug = data.slug;
    if (data.type !== undefined) updateValues.type = data.type;
    if (data.parentId !== undefined) updateValues.parentId = data.parentId;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.shortDescription !== undefined) updateValues.shortDescription = data.shortDescription;
    if (data.latitude !== undefined) updateValues.latitude = data.latitude !== null ? data.latitude.toString() : null;
    if (data.longitude !== undefined) updateValues.longitude = data.longitude !== null ? data.longitude.toString() : null;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.featured !== undefined) updateValues.featured = data.featured;

    const [updated] = await db.update(locations)
      .set(updateValues)
      .where(eq(locations.id, id))
      .returning();

    this.invalidateCache();
    return updated ? this.mapRow(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const result = await db.delete(locations).where(eq(locations.id, id)).returning();
    this.invalidateCache();
    return result.length > 0;
  }

  private mapRow(row: any): Location {
    const lat = row.latitude !== null && row.latitude !== undefined ? parseFloat(row.latitude) : null;
    const lng = row.longitude !== null && row.longitude !== undefined ? parseFloat(row.longitude) : null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type as LocationType,
      parentId: row.parentId || undefined,
      description: row.description || undefined,
      shortDescription: row.shortDescription || undefined,
      latitude: !isNaN(lat!) ? lat : null,
      longitude: !isNaN(lng!) ? lng : null,
      geometry: row.geometry || undefined,
      status: row.status as LocationStatus,
      featured: row.featured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
