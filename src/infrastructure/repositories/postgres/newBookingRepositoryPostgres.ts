import { eq, inArray, asc } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import {
  projectConfigurationAvailabilities,
  projectConfigurations,
  staffUsers,
} from '@/src/db/schema';
import {
  ConfigurationAvailabilityStatus,
  ProjectConfigurationAvailability,
} from '@/src/domain/projects/dto/newBookingDto';
import {
  NewBookingAvailabilityRepository,
  UpsertConfigurationAvailabilityInput,
} from '@/src/domain/projects/repositories/newBookingRepository';

const isUuid = (str: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

export class NewBookingAvailabilityRepositoryPostgres implements NewBookingAvailabilityRepository {
  private requireDb() {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database instance is unavailable for New Booking availability.');
    }
    return db;
  }

  private async assertConfigurationBelongsToProject(
    executor: Pick<ReturnType<NewBookingAvailabilityRepositoryPostgres['requireDb']>, 'select'>,
    projectId: string,
    configurationId: string
  ): Promise<void> {
    if (!isUuid(projectId) || !isUuid(configurationId)) {
      throw new Error(
        `IntegrityError: Invalid project (${projectId}) or configuration (${configurationId}) identifier.`
      );
    }

    const configRows = await executor
      .select({
        id: projectConfigurations.id,
        projectId: projectConfigurations.projectId,
      })
      .from(projectConfigurations)
      .where(eq(projectConfigurations.id, configurationId))
      .limit(1);

    if (configRows.length === 0) {
      throw new Error(`IntegrityError: Configuration ${configurationId} does not exist.`);
    }

    if (configRows[0].projectId !== projectId) {
      throw new Error(
        `IntegrityError: Configuration ${configurationId} belongs to project ${configRows[0].projectId} and cannot be associated with project ${projectId}.`
      );
    }
  }

  private mapRow(row: {
    availability: typeof projectConfigurationAvailabilities.$inferSelect;
    staffName: string | null;
  }): ProjectConfigurationAvailability {
    const a = row.availability;
    return {
      id: a.id,
      projectId: a.projectId,
      configurationId: a.configurationId,
      availabilityStatus: a.availabilityStatus as ConfigurationAvailabilityStatus,
      availableFrom: a.availableFrom ? new Date(a.availableFrom) : null,
      lastVerifiedAt: new Date(a.lastVerifiedAt),
      updatedByStaffId: a.updatedByStaffId ?? null,
      updatedByStaffName: row.staffName ?? null,
      source: a.source ?? null,
      internalNotes: a.internalNotes ?? null,
      createdAt: new Date(a.createdAt),
      updatedAt: new Date(a.updatedAt),
    };
  }

  async findAll(): Promise<ProjectConfigurationAvailability[]> {
    const db = this.requireDb();
    const rows = await db
      .select({
        availability: projectConfigurationAvailabilities,
        staffName: staffUsers.name,
      })
      .from(projectConfigurationAvailabilities)
      .leftJoin(staffUsers, eq(projectConfigurationAvailabilities.updatedByStaffId, staffUsers.id))
      .orderBy(asc(projectConfigurationAvailabilities.createdAt));

    return rows.map((r) => this.mapRow(r));
  }

  async findByProjectId(projectId: string): Promise<ProjectConfigurationAvailability[]> {
    if (!isUuid(projectId)) return [];
    const db = this.requireDb();
    const rows = await db
      .select({
        availability: projectConfigurationAvailabilities,
        staffName: staffUsers.name,
      })
      .from(projectConfigurationAvailabilities)
      .leftJoin(staffUsers, eq(projectConfigurationAvailabilities.updatedByStaffId, staffUsers.id))
      .where(eq(projectConfigurationAvailabilities.projectId, projectId))
      .orderBy(asc(projectConfigurationAvailabilities.createdAt));

    return rows.map((r) => this.mapRow(r));
  }

  async findByProjectIds(projectIds: string[]): Promise<ProjectConfigurationAvailability[]> {
    const validIds = Array.from(new Set(projectIds.filter(isUuid)));
    if (validIds.length === 0) return [];
    const db = this.requireDb();
    const rows = await db
      .select({
        availability: projectConfigurationAvailabilities,
        staffName: staffUsers.name,
      })
      .from(projectConfigurationAvailabilities)
      .leftJoin(staffUsers, eq(projectConfigurationAvailabilities.updatedByStaffId, staffUsers.id))
      .where(inArray(projectConfigurationAvailabilities.projectId, validIds));

    return rows.map((r) => this.mapRow(r));
  }

  async findByConfigurationId(configurationId: string): Promise<ProjectConfigurationAvailability | null> {
    if (!isUuid(configurationId)) return null;
    const db = this.requireDb();
    const rows = await db
      .select({
        availability: projectConfigurationAvailabilities,
        staffName: staffUsers.name,
      })
      .from(projectConfigurationAvailabilities)
      .leftJoin(staffUsers, eq(projectConfigurationAvailabilities.updatedByStaffId, staffUsers.id))
      .where(eq(projectConfigurationAvailabilities.configurationId, configurationId))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async findById(id: string): Promise<ProjectConfigurationAvailability | null> {
    if (!isUuid(id)) return null;
    const db = this.requireDb();
    const rows = await db
      .select({
        availability: projectConfigurationAvailabilities,
        staffName: staffUsers.name,
      })
      .from(projectConfigurationAvailabilities)
      .leftJoin(staffUsers, eq(projectConfigurationAvailabilities.updatedByStaffId, staffUsers.id))
      .where(eq(projectConfigurationAvailabilities.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRow(rows[0]);
  }

  async create(
    data: Omit<ProjectConfigurationAvailability, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ProjectConfigurationAvailability> {
    const db = this.requireDb();
    await this.assertConfigurationBelongsToProject(db, data.projectId, data.configurationId);

    const existing = await this.findByConfigurationId(data.configurationId);
    if (existing) {
      throw new Error(`Conflict: Configuration ${data.configurationId} already has an availability record.`);
    }

    const now = new Date();
    const insertValues = {
      projectId: data.projectId,
      configurationId: data.configurationId,
      availabilityStatus: data.availabilityStatus,
      availableFrom: data.availableFrom ?? null,
      lastVerifiedAt: data.lastVerifiedAt ?? now,
      updatedByStaffId: data.updatedByStaffId ?? null,
      source: data.source ?? null,
      internalNotes: data.internalNotes ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof projectConfigurationAvailabilities.$inferInsert;

    const [inserted] = await db
      .insert(projectConfigurationAvailabilities)
      .values(insertValues)
      .returning();

    const hydrated = await this.findById(inserted.id);
    if (!hydrated) {
      throw new Error('Failed to retrieve newly created availability record.');
    }
    return hydrated;
  }

  async update(
    id: string,
    data: Partial<ProjectConfigurationAvailability>
  ): Promise<ProjectConfigurationAvailability> {
    const db = this.requireDb();
    if (!isUuid(id)) {
      throw new Error(`Availability record ${id} not found.`);
    }

    const existing = await this.findById(id);
    if (!existing) {
      throw new Error(`Availability record ${id} not found.`);
    }
    if (data.projectId !== undefined && data.projectId !== existing.projectId) {
      throw new Error(
        `IntegrityError: Availability record ${id} belongs to project ${existing.projectId} and cannot be reassigned to project ${data.projectId}.`
      );
    }
    if (data.configurationId !== undefined && data.configurationId !== existing.configurationId) {
      throw new Error(
        `IntegrityError: Availability record ${id} is bound to configuration ${existing.configurationId} and cannot be reassigned to configuration ${data.configurationId}.`
      );
    }

    const updateSet: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (data.availabilityStatus !== undefined) updateSet.availabilityStatus = data.availabilityStatus;
    if (data.availableFrom !== undefined) updateSet.availableFrom = data.availableFrom;
    if (data.lastVerifiedAt !== undefined) updateSet.lastVerifiedAt = data.lastVerifiedAt;
    if (data.updatedByStaffId !== undefined) updateSet.updatedByStaffId = data.updatedByStaffId;
    if (data.source !== undefined) updateSet.source = data.source;
    if (data.internalNotes !== undefined) updateSet.internalNotes = data.internalNotes;

    const [updated] = await db
      .update(projectConfigurationAvailabilities)
      .set(updateSet)
      .where(eq(projectConfigurationAvailabilities.id, id))
      .returning();

    if (!updated) {
      throw new Error(`Availability record ${id} not found.`);
    }

    const hydrated = await this.findById(updated.id);
    if (!hydrated) {
      throw new Error(`Availability record ${id} not found after update.`);
    }
    return hydrated;
  }

  async upsert(data: UpsertConfigurationAvailabilityInput): Promise<ProjectConfigurationAvailability> {
    const db = this.requireDb();
    const now = new Date();
    const lastVerifiedAt = data.lastVerifiedAt ?? now;

    const insertValues = {
      projectId: data.projectId,
      configurationId: data.configurationId,
      availabilityStatus: data.availabilityStatus,
      availableFrom: data.availableFrom ?? null,
      lastVerifiedAt,
      updatedByStaffId: data.updatedByStaffId ?? null,
      source: data.source ?? null,
      internalNotes: data.internalNotes ?? null,
      createdAt: now,
      updatedAt: now,
    } as unknown as typeof projectConfigurationAvailabilities.$inferInsert;

    // Never include projectId or configurationId in conflictUpdateSet: ownership is immutable.
    const conflictUpdateSet: Record<string, unknown> = {
      availabilityStatus: data.availabilityStatus,
      lastVerifiedAt,
      updatedByStaffId: data.updatedByStaffId ?? null,
      updatedAt: now,
    };
    if (data.availableFrom !== undefined) conflictUpdateSet.availableFrom = data.availableFrom;
    if (data.source !== undefined) conflictUpdateSet.source = data.source;
    if (data.internalNotes !== undefined) conflictUpdateSet.internalNotes = data.internalNotes;

    const [saved] = await db.transaction(async (tx) => {
      await this.assertConfigurationBelongsToProject(tx, data.projectId, data.configurationId);

      const existingRows = await tx
        .select({
          id: projectConfigurationAvailabilities.id,
          projectId: projectConfigurationAvailabilities.projectId,
        })
        .from(projectConfigurationAvailabilities)
        .where(eq(projectConfigurationAvailabilities.configurationId, data.configurationId))
        .limit(1);

      if (existingRows.length > 0 && existingRows[0].projectId !== data.projectId) {
        throw new Error(
          `IntegrityError: Configuration ${data.configurationId} availability record belongs to project ${existingRows[0].projectId} and cannot be reassigned to project ${data.projectId}.`
        );
      }

      return await tx
        .insert(projectConfigurationAvailabilities)
        .values(insertValues)
        .onConflictDoUpdate({
          target: projectConfigurationAvailabilities.configurationId,
          set: conflictUpdateSet,
        })
        .returning();
    });

    const hydrated = await this.findById(saved.id);
    if (!hydrated) {
      throw new Error('Failed to load upserted availability record.');
    }
    return hydrated;
  }

  async delete(id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const db = this.requireDb();
    const deleted = await db
      .delete(projectConfigurationAvailabilities)
      .where(eq(projectConfigurationAvailabilities.id, id))
      .returning({ id: projectConfigurationAvailabilities.id });
    return deleted.length > 0;
  }
}
