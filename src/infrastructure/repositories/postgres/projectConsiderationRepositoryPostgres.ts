import { eq, and, asc, inArray } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { projectConsiderations } from '@/src/db/schema';
import {
  ProjectConsideration,
  ConsiderationSection,
  ConsiderationSourceType,
} from '@/src/domain/projects/entities';
import { ProjectConsiderationRepository } from '@/src/domain/repositories/projectRepository';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProjectConsiderationRepositoryPostgres implements ProjectConsiderationRepository {
  private mapRowToEntity(row: any): ProjectConsideration {
    return {
      id: row.id,
      projectId: row.projectId,
      section: row.section as ConsiderationSection,
      title: row.title,
      description: row.description,
      sourceType: row.sourceType as ConsiderationSourceType,
      sortOrder: row.sortOrder ?? 0,
      isVisible: row.isVisible ?? true,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
    };
  }

  async findByProjectId(projectId: string): Promise<ProjectConsideration[]> {
    const db = getDb();
    const rows = await db
      .select()
      .from(projectConsiderations)
      .where(eq(projectConsiderations.projectId, projectId))
      .orderBy(asc(projectConsiderations.sortOrder), asc(projectConsiderations.createdAt));

    return rows.map(r => this.mapRowToEntity(r));
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectConsideration[]> {
    const validIds = Array.from(new Set(projectIds.filter(id => UUID_REGEX.test(id))));
    if (validIds.length === 0) return [];
    const db = getDb();
    const rows = await db
      .select()
      .from(projectConsiderations)
      .where(inArray(projectConsiderations.projectId, validIds))
      .orderBy(asc(projectConsiderations.sortOrder), asc(projectConsiderations.createdAt));

    return rows.map(r => this.mapRowToEntity(r));
  }

  async findById(id: string): Promise<ProjectConsideration | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(projectConsiderations)
      .where(eq(projectConsiderations.id, id));

    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async create(data: Omit<ProjectConsideration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProjectConsideration> {
    const db = getDb();
    const [inserted] = await db
      .insert(projectConsiderations)
      .values({
        projectId: data.projectId,
        section: data.section,
        title: data.title,
        description: data.description,
        sourceType: data.sourceType || 'EDITORIAL',
        sortOrder: data.sortOrder ?? 0,
        isVisible: data.isVisible ?? true,
      } as any)
      .returning();

    return this.mapRowToEntity(inserted);
  }

  async update(id: string, data: Partial<ProjectConsideration>): Promise<ProjectConsideration | null> {
    const db = getDb();
    const payload: any = { updatedAt: new Date() };

    if (data.section !== undefined) payload.section = data.section;
    if (data.title !== undefined) payload.title = data.title;
    if (data.description !== undefined) payload.description = data.description;
    if (data.sourceType !== undefined) payload.sourceType = data.sourceType;
    if (data.sortOrder !== undefined) payload.sortOrder = data.sortOrder;
    if (data.isVisible !== undefined) payload.isVisible = data.isVisible;

    const [updated] = await db
      .update(projectConsiderations)
      .set(payload)
      .where(eq(projectConsiderations.id, id))
      .returning();

    if (!updated) return null;
    return this.mapRowToEntity(updated);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(projectConsiderations)
      .where(eq(projectConsiderations.id, id))
      .returning();

    return result.length > 0;
  }

  async reorder(projectId: string, section: ConsiderationSection, orderedIds: string[]): Promise<void> {
    const db = getDb();
    for (let index = 0; index < orderedIds.length; index++) {
      const id = orderedIds[index];
      await db
        .update(projectConsiderations)
        .set({ sortOrder: index, updatedAt: new Date() } as any)
        .where(
          and(
            eq(projectConsiderations.id, id),
            eq(projectConsiderations.projectId, projectId),
            eq(projectConsiderations.section, section)
          )
        );
    }
  }
}
