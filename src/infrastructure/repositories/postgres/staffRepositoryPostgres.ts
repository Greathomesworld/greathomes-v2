import { eq, desc, asc, and, or, sql, ilike } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { staffUsers } from '@/src/db/schema';
import { StaffUserEntity } from '@/src/domain/auth/entities/staffUserEntity';
import { StaffRepository } from '@/src/domain/auth/repositories/staffRepository';
import { StaffFilterDto } from '@/src/domain/auth/dto/staffDto';
import { StaffRole } from '@/src/domain/auth/authorizationBoundary';

export class StaffRepositoryPostgres implements StaffRepository {
  async findById(id: string): Promise<StaffUserEntity | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .select()
      .from(staffUsers)
      .where(eq(staffUsers.id, id))
      .limit(1);

    if (!row) return null;
    return this.mapToEntity(row);
  }

  async findByEmail(email: string): Promise<StaffUserEntity | null> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .select()
      .from(staffUsers)
      .where(eq(sql`LOWER(${staffUsers.email})`, email.toLowerCase().trim()))
      .limit(1);

    if (!row) return null;
    return this.mapToEntity(row);
  }

  async list(filter?: StaffFilterDto): Promise<{ items: StaffUserEntity[]; total: number }> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const conditions = [];

    if (filter?.role && filter.role !== 'ALL') {
      conditions.push(eq(staffUsers.role, filter.role));
    }

    if (filter?.enabled !== undefined && filter.enabled !== 'ALL') {
      conditions.push(eq(staffUsers.enabled, filter.enabled));
    }

    if (filter?.search) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(staffUsers.name, q),
          ilike(staffUsers.email, q),
          ilike(staffUsers.role, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(staffUsers)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    const page = filter?.page || 1;
    const limit = filter?.limit || 50;
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(staffUsers)
      .where(whereClause)
      .orderBy(desc(staffUsers.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map(this.mapToEntity),
      total,
    };
  }

  async create(
    data: Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<StaffUserEntity> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const id = data.id || `staff_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date();

    const [row] = await db
      .insert(staffUsers)
      .values({
        id,
        email: data.email.toLowerCase().trim(),
        name: data.name.trim(),
        role: data.role,
        passwordHash: data.passwordHash || null,
        sessionVersion: data.sessionVersion ?? 0,
        enabled: data.enabled !== undefined ? data.enabled : true,
        avatarUrl: data.avatarUrl || null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    return this.mapToEntity(row);
  }

  async update(
    id: string,
    data: Partial<Omit<StaffUserEntity, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<StaffUserEntity> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const updatePayload: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.email !== undefined) updatePayload.email = data.email.toLowerCase().trim();
    if (data.role !== undefined) updatePayload.role = data.role;
    if (data.passwordHash !== undefined) updatePayload.passwordHash = data.passwordHash;
    if (data.sessionVersion !== undefined) updatePayload.sessionVersion = data.sessionVersion;
    if (data.enabled !== undefined) updatePayload.enabled = data.enabled;
    if (data.avatarUrl !== undefined) updatePayload.avatarUrl = data.avatarUrl;

    const [row] = await db
      .update(staffUsers)
      .set(updatePayload)
      .where(eq(staffUsers.id, id))
      .returning();

    if (!row) {
      throw new Error(`Staff with id '${id}' not found`);
    }

    return this.mapToEntity(row);
  }

  async delete(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const result = await db.delete(staffUsers).where(eq(staffUsers.id, id));
    return true;
  }

  async countActiveSuperAdmins(): Promise<number> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(staffUsers)
      .where(and(eq(staffUsers.role, 'SUPER_ADMIN'), eq(staffUsers.enabled, true)));

    return row?.count ?? 0;
  }

  private mapToEntity(row: any): StaffUserEntity {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role as StaffRole,
      passwordHash: row.passwordHash ?? null,
      sessionVersion: row.sessionVersion ?? 0,
      enabled: row.enabled,
      avatarUrl: row.avatarUrl,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
