import { getDb } from '../../../db/client.ts';
import { auditLogs } from '../../../db/schema.ts';
import { sanitizeAuditPayload } from '../../../domain/audit/auditSanitizer.ts';
import { AuditLogEntity, CreateAuditLogDto, AuditFilterDto } from '../../../domain/audit/auditTypes.ts';
import { auditLogRepository } from '../../../infrastructure/repositories/postgres/auditLogRepositoryPostgres.ts';

export interface AuditRepositoryData {
  actorStaffId?: string | null;
  actorRole?: string;
  action: string;
  resourceType?: string;
  entityType?: string;
  resourceId?: string | number | null;
  entityId?: string | number | null;
  resourceLabel?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  success?: boolean;
  failureReason?: string | null;
}

export class PostgresAuditRepository {
  /**
   * Safely creates an audit log entry.
   * Ensures that URLs and non-numeric strings are NEVER converted to NaN or fake integer IDs.
   * Preserves genuine numeric entity IDs, while storing non-entity targets (like URLs) in metadata.
   */
  async create(data: AuditRepositoryData): Promise<AuditLogEntity> {
    const db = getDb();
    if (!db) {
      throw new Error('PostgreSQL database instance is unavailable. Persistence is required for audit logs.');
    }

    const action = data.action || 'UNKNOWN';
    const resourceType = data.resourceType || data.entityType || 'UNKNOWN';
    const rawId = data.resourceId ?? data.entityId;

    let safeResourceId: string | null = null;
    const metadata: Record<string, any> = { ...(data.metadata || {}) };

    if (rawId !== null && rawId !== undefined) {
      const idStr = String(rawId).trim();

      // Check if it is a URL or URI
      if (idStr.startsWith('http://') || idStr.startsWith('https://') || idStr.startsWith('/') || idStr.includes('.xml') || idStr.includes('.html')) {
        // A URL is not a database entity ID. Store in metadata if not already present.
        safeResourceId = null;
        if (!metadata.url && !metadata.feedPath) {
          if (action.includes('SITEMAP') || idStr.endsWith('.xml')) {
            metadata.feedPath = idStr;
          } else {
            metadata.url = idStr;
          }
        }
      } else if (/^\d+$/.test(idStr)) {
        // Genuine numeric ID
        safeResourceId = idStr;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idStr) || idStr.startsWith('proj_') || idStr.startsWith('dev_') || idStr.startsWith('loc_') || idStr.startsWith('staff_') || idStr.startsWith('enq_') || idStr.startsWith('media_')) {
        // UUID or canonical prefixed entity ID
        safeResourceId = idStr;
      } else {
        // Other non-numeric string: do NOT parse as integer (which would yield NaN)
        // Store as text resourceId if valid identifier, else store in metadata
        if (idStr.length <= 64 && !idStr.includes(' ')) {
          safeResourceId = idStr;
        } else {
          safeResourceId = null;
          if (!metadata.targetIdentifier) {
            metadata.targetIdentifier = idStr;
          }
        }
      }
    }

    const sanitizedBefore = data.before ? sanitizeAuditPayload(data.before) : null;
    const sanitizedAfter = data.after ? sanitizeAuditPayload(data.after) : null;
    const sanitizedMetadata = Object.keys(metadata).length > 0 ? sanitizeAuditPayload(metadata) : null;

    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    const [row] = await db
      .insert(auditLogs)
      .values({
        id,
        actorStaffId: data.actorStaffId || null,
        actorRole: data.actorRole || 'SYSTEM',
        action,
        resourceType,
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

    return {
      id: row.id,
      actorStaffId: row.actorStaffId || null,
      actorRole: row.actorRole,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId || null,
      resourceLabel: row.resourceLabel || null,
      timestamp: row.timestamp ? new Date(row.timestamp) : new Date(),
      requestId: row.requestId || null,
      ipAddress: row.ipAddress || null,
      userAgent: row.userAgent || null,
      before: row.before ? sanitizeAuditPayload(row.before) : null,
      after: row.after ? sanitizeAuditPayload(row.after) : null,
      metadata: row.metadata ? sanitizeAuditPayload(row.metadata) : null,
      success: row.success ?? true,
      failureReason: row.failureReason || null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    };
  }

  async findById(id: string): Promise<AuditLogEntity | null> {
    return auditLogRepository.findById(id);
  }

  async list(filter?: AuditFilterDto): Promise<{ items: AuditLogEntity[]; total: number }> {
    return auditLogRepository.list(filter);
  }
}

export const postgresAuditRepository = new PostgresAuditRepository();
