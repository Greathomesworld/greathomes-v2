import { auditLogRepository, AuditLogRepositoryPostgres } from '@/src/infrastructure/repositories/postgres/auditLogRepositoryPostgres';
import { AuditLogEntity, CreateAuditLogDto, AuditFilterDto } from './auditTypes';
import { extractRequestContext, RequestLike } from './auditRequestContext';
import { isTestIsolationActive, readSandboxJson, writeSandboxJson, TEST_AUDIT_FILE } from '@/src/lib/testIsolationContext';

export class AuditService {
  private repository = auditLogRepository;

  async record(
    req: RequestLike | null,
    staff: { id?: string | null; role?: string | null } | null,
    data: Omit<CreateAuditLogDto, 'actorStaffId' | 'actorRole'>
  ): Promise<AuditLogEntity> {
    const actorStaffId = staff?.id || null;
    const actorRole = staff?.role || 'SYSTEM';

    let requestId: string | null = null;
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    if (req) {
      const ctx = extractRequestContext(req);
      requestId = ctx.requestId;
      ipAddress = ctx.ipAddress;
      userAgent = ctx.userAgent;
    }

    const metadata = data.metadata || (data.changes ? { changes: data.changes } : null);

    if (isTestIsolationActive(req as any)) {
      const logs = readSandboxJson<AuditLogEntity[]>(TEST_AUDIT_FILE, []);
      const now = new Date();
      const entry: AuditLogEntity = {
        id: `audit_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        actorStaffId,
        actorRole,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId || null,
        resourceLabel: data.resourceLabel || null,
        timestamp: now,
        before: data.before ?? null,
        after: data.after ?? null,
        metadata: metadata ?? null,
        requestId: data.requestId || requestId,
        ipAddress: data.ipAddress || ipAddress,
        userAgent: data.userAgent || userAgent,
        success: data.success !== undefined ? data.success : true,
        failureReason: data.failureReason || null,
        createdAt: now,
      };
      logs.unshift(entry);
      writeSandboxJson(TEST_AUDIT_FILE, logs);
      return entry;
    }

    try {
      return await this.repository.create({
        ...data,
        metadata,
        actorStaffId,
        actorRole,
        requestId: data.requestId || requestId,
        ipAddress: data.ipAddress || ipAddress,
        userAgent: data.userAgent || userAgent,
      });
    } catch (err: any) {
      console.error('[AuditService] Failed to record audit log:', err);
      throw err;
    }
  }

  async recordSystem(data: CreateAuditLogDto): Promise<AuditLogEntity> {
    if (isTestIsolationActive()) {
      const logs = readSandboxJson<AuditLogEntity[]>(TEST_AUDIT_FILE, []);
      const now = new Date();
      const entry: AuditLogEntity = {
        id: `audit_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        actorStaffId: data.actorStaffId || null,
        actorRole: data.actorRole || 'SYSTEM',
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId || null,
        resourceLabel: data.resourceLabel || null,
        timestamp: now,
        before: data.before ?? null,
        after: data.after ?? null,
        metadata: data.metadata ?? null,
        requestId: data.requestId || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        success: data.success !== undefined ? data.success : true,
        failureReason: data.failureReason || null,
        createdAt: now,
      };
      logs.unshift(entry);
      writeSandboxJson(TEST_AUDIT_FILE, logs);
      return entry;
    }
    return await this.repository.create({
      ...data,
      actorStaffId: data.actorStaffId || null,
      actorRole: data.actorRole || 'SYSTEM',
    });
  }

  async getById(id: string): Promise<AuditLogEntity | null> {
    if (isTestIsolationActive()) {
      const logs = readSandboxJson<AuditLogEntity[]>(TEST_AUDIT_FILE, []);
      const found = logs.find((l) => l.id === id);
      if (found) return found;
    }
    return await this.repository.findById(id);
  }

  async list(filter?: AuditFilterDto): Promise<{ items: AuditLogEntity[]; total: number }> {
    if (isTestIsolationActive()) {
      let logs = readSandboxJson<AuditLogEntity[]>(TEST_AUDIT_FILE, []);
      if (filter?.resourceType) {
        logs = logs.filter((l) => l.resourceType === filter.resourceType);
      }
      if (filter?.resourceId) {
        logs = logs.filter((l) => l.resourceId === filter.resourceId);
      }
      if (filter?.action) {
        logs = logs.filter((l) => l.action === filter.action);
      }
      if (filter?.actorStaffId) {
        logs = logs.filter((l) => l.actorStaffId === filter.actorStaffId);
      }
      if (filter?.success !== undefined) {
        logs = logs.filter((l) => l.success === filter.success);
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        logs = logs.filter(
          (l) =>
            (l.resourceLabel && l.resourceLabel.toLowerCase().includes(q)) ||
            (l.resourceId && l.resourceId.toLowerCase().includes(q)) ||
            (l.action && l.action.toLowerCase().includes(q))
        );
      }
      const page = filter?.page || 1;
      const pageSize = filter?.pageSize || 25;
      const start = (page - 1) * pageSize;
      return {
        items: logs.slice(start, start + pageSize),
        total: logs.length,
      };
    }
    return await this.repository.list(filter);
  }
}

export const auditService = new AuditService();
