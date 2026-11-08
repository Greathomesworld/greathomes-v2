import { AuditAction } from './auditActions';
import { AuditResource } from './auditResources';
import { StaffRole } from '../auth/authorizationBoundary';

export interface AuditLogEntity {
  id: string;
  actorStaffId: string | null;
  actorRole: StaffRole | string;
  action: AuditAction | string;
  resourceType: AuditResource | string;
  resourceId: string | null;
  resourceLabel: string | null;
  timestamp: Date;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  metadata: Record<string, any> | null;
  success: boolean;
  failureReason: string | null;
  createdAt: Date;
}

export interface CreateAuditLogDto {
  actorStaffId?: string | null;
  actorRole: StaffRole | string;
  action: AuditAction | string;
  resourceType: AuditResource | string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
  metadata?: Record<string, any> | null;
  changes?: Record<string, any> | null;
  success?: boolean;
  failureReason?: string | null;
}

export interface AuditFilterDto {
  page?: number;
  pageSize?: number;
  search?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorStaffId?: string;
  success?: boolean | string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
}
