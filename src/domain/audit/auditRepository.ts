import { AuditLogEntity, CreateAuditLogDto, AuditFilterDto } from './auditTypes';

export interface AuditRepository {
  create(data: CreateAuditLogDto): Promise<AuditLogEntity>;
  findById(id: string): Promise<AuditLogEntity | null>;
  list(filter?: AuditFilterDto): Promise<{ items: AuditLogEntity[]; total: number }>;
}
