import { Developer, DeveloperStatus } from '@/src/domain/developers/entities';
import { DeveloperRepository, DeveloperListFilter } from '@/src/domain/repositories/developerRepository';
import { getDb } from '@/src/db/client';
import { developers, projects } from '@/src/db/schema';
import { eq, ne, and, or, ilike, asc, desc, notInArray, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export class DeveloperRepositoryPostgres implements DeveloperRepository {
  async create(data: Omit<Developer, 'id' | 'createdAt' | 'updatedAt'>): Promise<Developer> {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database not initialized. Check DATABASE_URL and PERSISTENCE_PROVIDER.');
    }

    const id = uuidv4();
    const now = new Date();
    const [inserted] = await db.insert(developers).values({
      id,
      name: data.name,
      slug: data.slug,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      websiteUrl: data.websiteUrl ?? null,
      status: (data.status as any) ?? 'DRAFT',
      featured: data.featured ?? false,
      createdAt: now,
      updatedAt: now,
    } as any).returning();

    return {
      id: inserted.id,
      name: inserted.name,
      slug: inserted.slug,
      shortDescription: inserted.shortDescription,
      description: inserted.description,
      websiteUrl: inserted.websiteUrl,
      status: inserted.status as DeveloperStatus,
      featured: inserted.featured,
      createdAt: inserted.createdAt,
      updatedAt: inserted.updatedAt,
    };
  }

  async update(id: string, data: Partial<Developer>): Promise<Developer> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const now = new Date();
    const updateValues: any = {
      updatedAt: now,
    };
    if (data.name !== undefined) updateValues.name = data.name;
    if (data.slug !== undefined) updateValues.slug = data.slug;
    if (data.shortDescription !== undefined) updateValues.shortDescription = data.shortDescription;
    if (data.description !== undefined) updateValues.description = data.description;
    if (data.websiteUrl !== undefined) updateValues.websiteUrl = data.websiteUrl;
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.featured !== undefined) updateValues.featured = data.featured;

    const [updated] = await db.update(developers)
      .set(updateValues)
      .where(eq(developers.id, id))
      .returning();

    if (!updated) return null as any;

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      shortDescription: updated.shortDescription,
      description: updated.description,
      websiteUrl: updated.websiteUrl,
      status: updated.status as DeveloperStatus,
      featured: updated.featured,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async findById(id: string): Promise<Developer | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return null;

    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const [row] = await db.select().from(developers).where(eq(developers.id, id)).limit(1);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      websiteUrl: row.websiteUrl,
      status: row.status as DeveloperStatus,
      featured: row.featured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async findBySlug(slug: string): Promise<Developer | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const [row] = await db.select().from(developers).where(eq(developers.slug, slug)).limit(1);
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      websiteUrl: row.websiteUrl,
      status: row.status as DeveloperStatus,
      featured: row.featured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async list(filter?: DeveloperListFilter): Promise<Developer[]> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const conditions: any[] = [];

    if (filter?.status) {
      conditions.push(eq(developers.status, filter.status));
    }
    if (filter?.featured !== undefined) {
      conditions.push(eq(developers.featured, filter.featured));
    }
    if (filter?.search) {
      const q = `%${filter.search}%`;
      conditions.push(or(ilike(developers.name, q), ilike(developers.slug, q)));
    }

    const rows = conditions.length > 0
      ? await db.select().from(developers).where(and(...conditions))
      : await db.select().from(developers);

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      websiteUrl: row.websiteUrl,
      status: row.status as DeveloperStatus,
      featured: row.featured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async findRelatedPublishedDevelopers(
    excludeDeveloperId: string,
    excludeSlugs: string[],
    limit = 3
  ): Promise<Developer[]> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const conditions: any[] = [eq(developers.status, 'PUBLISHED')];
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(excludeDeveloperId);
    if (isUuid) {
      conditions.push(ne(developers.id, excludeDeveloperId));
    }
    if (excludeSlugs.length > 0) {
      conditions.push(notInArray(developers.slug, excludeSlugs));
    }

    const publishedProjectCountExpr = sql<number>`count(${projects.id}) filter (where ${projects.isPublished} is not false)`;

    const rows = await db
      .select({
        id: developers.id,
        name: developers.name,
        slug: developers.slug,
        shortDescription: developers.shortDescription,
        description: developers.description,
        websiteUrl: developers.websiteUrl,
        status: developers.status,
        featured: developers.featured,
        createdAt: developers.createdAt,
        updatedAt: developers.updatedAt,
      })
      .from(developers)
      .leftJoin(
        projects,
        and(eq(projects.developerId, developers.id), eq(projects.isPublished, true))
      )
      .where(and(...conditions))
      .groupBy(developers.id)
      .orderBy(desc(publishedProjectCountExpr), desc(developers.featured), asc(developers.name))
      .limit(Math.max(1, limit));

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      shortDescription: row.shortDescription,
      description: row.description,
      websiteUrl: row.websiteUrl,
      status: row.status as DeveloperStatus,
      featured: row.featured,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const result = await db.delete(developers).where(eq(developers.id, id)).returning();
    return result.length > 0;
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const conditions = [eq(developers.slug, slug)];
    if (excludeId) {
      conditions.push(ne(developers.id, excludeId));
    }

    const [row] = await db.select({ id: developers.id }).from(developers).where(and(...conditions)).limit(1);
    return Boolean(row);
  }

  async findDuplicates(name: string, excludeId?: string): Promise<Developer[]> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database not initialized.');

    const all = await this.list();
    const normalize = (n: string) => n.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const targetNorm = normalize(name);

    return all.filter(d => {
      if (excludeId && d.id === excludeId) return false;
      return normalize(d.name) === targetNorm;
    });
  }
}
