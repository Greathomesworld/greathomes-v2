import { eq, desc, asc, and, or, sql, ilike, gte, lte } from 'drizzle-orm';
import { getDbReady } from '@/src/db/client';
import { auditLogs, staffUsers } from '@/src/db/schema';
import { AuditLogEntity, CreateAuditLogDto, AuditFilterDto } from '@/src/domain/audit/auditTypes';
import { AuditRepository } from '@/src/domain/audit/auditRepository';
import { sanitizeAuditPayload } from '@/src/domain/audit/auditSanitizer';

const globalForAudit = globalThis as unknown as {
  __gh_mem_audit_logs?: AuditLogEntity[];
};

function getMemAuditLogs(): AuditLogEntity[] {
  if (!globalForAudit.__gh_mem_audit_logs) {
    globalForAudit.__gh_mem_audit_logs = [];
  }
  return globalForAudit.__gh_mem_audit_logs;
}

async function getActiveAuditDb() {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') return null;
  return await getDbReady();
}

export class AuditLogRepositoryPostgres implements AuditRepository {
  private mapToEntity(row: any): AuditLogEntity {
    return {
      id: row.id,
      actorStaffId: row.actorStaffId || row.actor_staff_id || null,
      actorRole: row.actorRole || row.actor_role || 'SYSTEM',
      action: row.action || 'UNKNOWN',
      resourceType: row.resourceType || row.resource_type || 'UNKNOWN',
      resourceId: row.resourceId || row.resource_id || null,
      resourceLabel: row.resourceLabel || row.resource_label || null,
      timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
      requestId: row.requestId || row.request_id || null,
      ipAddress: row.ipAddress || row.ip_address || null,
      userAgent: row.userAgent || row.user_agent || null,
      before: row.before ? sanitizeAuditPayload(row.before) : null,
      after: row.after ? sanitizeAuditPayload(row.after) : null,
      metadata: row.metadata ? sanitizeAuditPayload(row.metadata) : null,
      success: row.success ?? true,
      failureReason: row.failureReason || row.failure_reason || null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    };
  }

  async create(data: CreateAuditLogDto): Promise<AuditLogEntity> {
    const db = await getActiveAuditDb();
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    let safeResourceId: string | null = data.resourceId || null;
    const metadata: Record<string, any> = { ...(data.metadata || {}) };

    if (safeResourceId && (safeResourceId.startsWith('http://') || safeResourceId.startsWith('https://') || safeResourceId.includes('.xml'))) {
      if (!metadata.url && !metadata.feedPath) {
        if (safeResourceId.includes('.xml')) {
          metadata.feedPath = safeResourceId;
        } else {
          metadata.url = safeResourceId;
        }
      }
      safeResourceId = null;
    }

    const sanitizedBefore = data.before ? sanitizeAuditPayload(data.before) : null;
    const sanitizedAfter = data.after ? sanitizeAuditPayload(data.after) : null;
    const sanitizedMetadata = Object.keys(metadata).length > 0 ? sanitizeAuditPayload(metadata) : null;

    if (!db) {
      const entity: AuditLogEntity = {
        id,
        actorStaffId: data.actorStaffId || null,
        actorRole: data.actorRole,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: safeResourceId,
        resourceLabel: data.resourceLabel || null,
        timestamp: now,
        requestId: data.requestId || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        before: sanitizedBefore,
        after: sanitizedAfter,
        metadata: sanitizedMetadata,
        success: data.success ?? true,
        failureReason: data.failureReason || null,
        createdAt: now,
      };
      getMemAuditLogs().unshift(entity);
      return entity;
    }

    let validActorStaffId = data.actorStaffId || null;
    if (validActorStaffId) {
      try {
        const staffRow = await db
          .select({ id: staffUsers.id })
          .from(staffUsers)
          .where(eq(staffUsers.id, validActorStaffId))
          .limit(1);
        if (staffRow.length === 0) {
          validActorStaffId = null;
        }
      } catch {
        validActorStaffId = null;
      }
    }

    const [row] = await db
      .insert(auditLogs)
      .values({
        id,
        actorStaffId: validActorStaffId,
        actorRole: data.actorRole,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: safeResourceId,
        resourceLabel: data.resourceLabel || null,
        timestamp: now,
        requestId: data.requestId || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        before: sanitizedBefore,
        after: sanitizedAfter,
        metadata: sanitizedMetadata,
        success: data.success ?? true,
        failureReason: data.failureReason || null,
        createdAt: now,
      } as any)
      .returning();

    return this.mapToEntity(row);
  }

  async findById(id: string): Promise<AuditLogEntity | null> {
    const db = await getActiveAuditDb();
    if (!db) {
      return getMemAuditLogs().find((a) => a.id === id) || null;
    }

    const [row] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, id))
      .limit(1);

    if (!row) return null;
    return this.mapToEntity(row);
  }

  async list(filter?: AuditFilterDto): Promise<{ items: AuditLogEntity[]; total: number }> {
    const db = await getActiveAuditDb();
    if (!db) {
      let list = [...getMemAuditLogs()];
      if (filter?.action && filter.action !== 'ALL') list = list.filter((a) => a.action === filter.action);
      if (filter?.resourceType && filter.resourceType !== 'ALL') list = list.filter((a) => a.resourceType === filter.resourceType);
      if (filter?.resourceId) list = list.filter((a) => a.resourceId === filter.resourceId);
      if (filter?.actorStaffId) list = list.filter((a) => a.actorStaffId === filter.actorStaffId);
      const page = Number(filter?.page) || 1;
      const pageSize = Number(filter?.pageSize) || 25;
      const offset = (page - 1) * pageSize;
      return {
        items: list.slice(offset, offset + pageSize),
        total: list.length,
      };
    }

    const conditions = [];

    if (filter?.action && filter.action !== 'ALL') {
      conditions.push(eq(auditLogs.action, filter.action));
    }

    if (filter?.resourceType && filter.resourceType !== 'ALL') {
      conditions.push(eq(auditLogs.resourceType, filter.resourceType));
    }

    if (filter?.resourceId) {
      conditions.push(eq(auditLogs.resourceId, filter.resourceId));
    }

    if (filter?.actorStaffId) {
      conditions.push(eq(auditLogs.actorStaffId, filter.actorStaffId));
    }

    if (filter?.success !== undefined && filter.success !== 'ALL') {
      const isSuccess = filter.success === true || filter.success === 'true';
      conditions.push(eq(auditLogs.success, isSuccess));
    }

    if (filter?.search) {
      const q = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(auditLogs.action, q),
          ilike(auditLogs.resourceType, q),
          ilike(auditLogs.resourceLabel, q),
          ilike(auditLogs.actorRole, q),
          ilike(auditLogs.requestId, q)
        )
      );
    }

    if (filter?.from) {
      const fromDate = new Date(filter.from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(auditLogs.timestamp, fromDate));
      }
    }

    if (filter?.to) {
      const toDate = new Date(filter.to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(auditLogs.timestamp, toDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(whereClause);

    const total = countResult?.count ?? 0;

    const page = Number(filter?.page) || 1;
    const pageSize = Number(filter?.pageSize) || 25;
    const offset = (page - 1) * pageSize;

    const sortOrder = filter?.sort === 'oldest' ? asc(auditLogs.timestamp) : desc(auditLogs.timestamp);

    const rows = await db
      .select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(sortOrder)
      .limit(pageSize)
      .offset(offset);

    return {
      items: rows.map(this.mapToEntity),
      total,
    };
  }
}

export const auditLogRepository = new AuditLogRepositoryPostgres();
