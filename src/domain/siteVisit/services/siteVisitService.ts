import { createHash } from 'node:crypto';
import {
  SiteVisitEntity,
  SiteVisitStatus,
  SiteVisitType,
  SITE_VISIT_STATUS_LABELS,
  isValidSiteVisitTransition,
} from '../entities/siteVisitEntity';
import { CustomerSiteVisitDTO, AdminSiteVisitDTO } from '../dto/siteVisitDto';
import {
  siteVisitRepository,
  SiteVisitRepository,
} from '@/src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres';
import { enquiryRepository, EnquiryRepository } from '@/src/domain/enquiry/repositories/enquiryRepository';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { auditService } from '../../audit/auditService';

const SITE_VISIT_IDEMPOTENCY_BUCKET_MS = 30_000;

export function deriveSiteVisitIdempotencyKey(params: {
  enquiryId: string;
  customerId?: string | null;
  visitType: SiteVisitType;
  preferredDate: string;
  preferredTimeWindow: string;
  clientKey?: string | null;
  nowMs?: number;
}): string {
  const actorScope = params.customerId
    ? `customer:${params.customerId.trim()}`
    : `enquiry:${params.enquiryId.trim()}`;
  const trimmedClientKey = params.clientKey?.trim();
  const entropyScope =
    trimmedClientKey && trimmedClientKey.length >= 4 && trimmedClientKey.length <= 128
      ? `client:${trimmedClientKey}`
      : `bucket:${Math.floor((params.nowMs ?? Date.now()) / SITE_VISIT_IDEMPOTENCY_BUCKET_MS)}`;

  const payload = [
    actorScope,
    params.enquiryId.trim(),
    params.visitType,
    params.preferredDate.trim(),
    params.preferredTimeWindow.trim().toUpperCase(),
    entropyScope,
  ].join('|');

  const digest = createHash('sha256').update(payload).digest('hex');
  return `sv_idem_${digest}`;
}

export class SiteVisitService {
  constructor(
    private readonly repository: SiteVisitRepository = siteVisitRepository,
    private readonly enquiriesRepo: EnquiryRepository = enquiryRepository
  ) {}

  /**
   * Helper to map SiteVisitEntity to CustomerSiteVisitDTO.
   * Excludes staff notes, internal priority, and staff details.
   */
  async mapToCustomerDto(visit: SiteVisitEntity): Promise<CustomerSiteVisitDTO> {
    let propertyName: string | null = null;
    let propertySlug: string | null = null;
    let referenceNumber = `GH-ENQ-${visit.enquiryId.slice(-6).toUpperCase()}`;

    const enq = await this.enquiriesRepo.findById(visit.enquiryId);
    if (enq) {
      propertyName = enq.projectName || enq.listingTitle || null;
      propertySlug = enq.projectSlug || enq.listingSlug || null;
      if (enq.metadata?.referenceNumber) {
        referenceNumber = enq.metadata.referenceNumber;
      }
    }
    if (!propertyName && visit.projectId) {
      const p = await projectRepository.findById(visit.projectId);
      if (p) {
        propertyName = p.name;
        propertySlug = p.slug;
      }
    }

    return {
      id: visit.id,
      enquiryId: visit.enquiryId,
      referenceNumber,
      propertyName,
      propertySlug,
      projectId: visit.projectId,
      listingId: visit.listingId,
      visitType: visit.visitType,
      preferredDate: visit.preferredDate,
      preferredTimeWindow: visit.preferredTimeWindow,
      status: visit.status,
      statusLabel: SITE_VISIT_STATUS_LABELS[visit.status] || visit.status,
      buyerNote: visit.buyerNote,
      rescheduleReason: visit.rescheduleReason,
      cancelReason: visit.cancelReason,
      confirmedAt: visit.confirmedAt ? visit.confirmedAt.toISOString() : null,
      completedAt: visit.completedAt ? visit.completedAt.toISOString() : null,
      cancelledAt: visit.cancelledAt ? visit.cancelledAt.toISOString() : null,
      createdAt: visit.createdAt.toISOString(),
      updatedAt: visit.updatedAt.toISOString(),
    };
  }

  /**
   * Helper to map SiteVisitEntity to AdminSiteVisitDTO.
   * Includes internal notes and staff assignment.
   */
  async mapToAdminDto(visit: SiteVisitEntity): Promise<AdminSiteVisitDTO> {
    const customerDto = await this.mapToCustomerDto(visit);
    let buyerName: string | null = null;
    let buyerPhone: string | null = null;
    let buyerEmail: string | null = null;

    const enq = await this.enquiriesRepo.findById(visit.enquiryId);
    if (enq) {
      buyerName = enq.buyerName;
      buyerPhone = enq.buyerPhone;
      buyerEmail = enq.buyerEmail || null;
    }

    return {
      ...customerDto,
      customerId: visit.customerId,
      buyerName,
      buyerPhone,
      buyerEmail,
      staffNote: visit.staffNote,
      assignedTo: visit.assignedTo,
      assignedToName: visit.assignedToName,
    };
  }

  /**
   * Create a new Site Visit request for an existing enquiry with atomic parent enquiry update
   * and durable server-derived idempotency. Returns both the entity and whether it was newly created.
   */
  async createSiteVisitWithMeta(
    enquiryId: string,
    params: {
      customerId?: string | null;
      projectId?: string | null;
      configurationId?: string | null;
      listingId?: string | null;
      visitType: SiteVisitType;
      preferredDate: string;
      preferredTimeWindow: string;
      buyerNote?: string | null;
      idempotencyKey?: string | null;
    },
    req?: any
  ): Promise<{ siteVisit: SiteVisitEntity; created: boolean }> {
    const headerKey =
      typeof req?.headers?.get === 'function' ? req.headers.get('x-idempotency-key') : null;
    const idempotencyKey = deriveSiteVisitIdempotencyKey({
      enquiryId,
      customerId: params.customerId || null,
      visitType: params.visitType || 'IN_PERSON',
      preferredDate: params.preferredDate,
      preferredTimeWindow: params.preferredTimeWindow,
      clientKey: params.idempotencyKey || headerKey || null,
    });

    const result = await this.repository.createStandaloneTransactional(
      {
        idempotencyKey,
        enquiryId,
        customerId: params.customerId || null,
        projectId: params.projectId || null,
        configurationId: params.configurationId || null,
        listingId: params.listingId || null,
        visitType: params.visitType || 'IN_PERSON',
        preferredDate: params.preferredDate,
        preferredTimeWindow: params.preferredTimeWindow,
        buyerNote: params.buyerNote || null,
      },
      async (targetEnquiryId, visitId) => {
        const updated = await this.enquiriesRepo.update(targetEnquiryId, {
          siteVisitId: visitId,
          status: 'SITE_VISIT_SCHEDULED',
          requestSiteVisit: true,
        });
        return Boolean(updated);
      }
    );

    if (result.created && req) {
      await auditService.record(req, null, {
        action: 'CREATE_SITE_VISIT',
        resourceType: 'SITE_VISIT',
        resourceId: result.siteVisit.id,
        success: true,
        metadata: {
          enquiryId,
          preferredDate: result.siteVisit.preferredDate,
          visitType: result.siteVisit.visitType,
        },
      });
    }

    return result;
  }

  /**
   * Create a new Site Visit request for an existing enquiry.
   */
  async createSiteVisit(
    enquiryId: string,
    params: {
      customerId?: string | null;
      projectId?: string | null;
      configurationId?: string | null;
      listingId?: string | null;
      visitType: SiteVisitType;
      preferredDate: string;
      preferredTimeWindow: string;
      buyerNote?: string | null;
      idempotencyKey?: string | null;
    },
    req?: any
  ): Promise<SiteVisitEntity> {
    const { siteVisit } = await this.createSiteVisitWithMeta(enquiryId, params, req);
    return siteVisit;
  }

  /**
   * Customer retrieves their own site visits.
   */
  async getCustomerSiteVisits(customerId: string): Promise<CustomerSiteVisitDTO[]> {
    const visits = await this.repository.findByCustomerId(customerId);
    return Promise.all(visits.map((v) => this.mapToCustomerDto(v)));
  }

  /**
   * Customer requests a date/time reschedule.
   */
  async customerRequestReschedule(
    customerId: string,
    visitId: string,
    newDate: string,
    newTimeWindow: string,
    reason?: string,
    req?: any
  ): Promise<CustomerSiteVisitDTO | null> {
    const visit = await this.repository.findById(visitId);
    if (!visit || visit.customerId !== customerId) return null;

    if (!isValidSiteVisitTransition(visit.status, 'RESCHEDULE_REQUESTED')) {
      throw new Error(`Cannot request reschedule for visit in state '${visit.status}'`);
    }

    const updated = await this.repository.update(visitId, {
      preferredDate: newDate,
      preferredTimeWindow: newTimeWindow,
      rescheduleReason: reason || 'Customer requested date change',
      status: 'RESCHEDULE_REQUESTED',
    });

    if (!updated) return null;

    if (req) {
      await auditService.record(req, null, {
        action: 'RESCHEDULE_REQUEST_SITE_VISIT',
        resourceType: 'SITE_VISIT',
        resourceId: updated.id,
        success: true,
        metadata: { newDate, newTimeWindow, reason },
      });
    }

    return this.mapToCustomerDto(updated);
  }

  /**
   * Customer cancels site visit.
   */
  async customerCancelVisit(
    customerId: string,
    visitId: string,
    reason?: string,
    req?: any
  ): Promise<CustomerSiteVisitDTO | null> {
    const visit = await this.repository.findById(visitId);
    if (!visit || visit.customerId !== customerId) return null;

    if (!isValidSiteVisitTransition(visit.status, 'CANCELLED')) {
      throw new Error(`Cannot cancel visit in state '${visit.status}'`);
    }

    const updated = await this.repository.update(visitId, {
      status: 'CANCELLED',
      cancelReason: reason || 'Customer cancelled request',
      cancelledAt: new Date(),
    });

    if (!updated) return null;

    if (req) {
      await auditService.record(req, null, {
        action: 'CANCEL_SITE_VISIT',
        resourceType: 'SITE_VISIT',
        resourceId: updated.id,
        success: true,
        metadata: { reason },
      });
    }

    return this.mapToCustomerDto(updated);
  }

  /**
   * Admin lists all site visits with filters.
   */
  async listAdminSiteVisits(options?: {
    status?: SiteVisitStatus;
    projectId?: string;
    listingId?: string;
    assignedTo?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: AdminSiteVisitDTO[]; total: number }> {
    const { items, total } = await this.repository.listAdmin(options);
    const dtoItems = await Promise.all(items.map((item) => this.mapToAdminDto(item)));
    return { items: dtoItems, total };
  }

  /**
   * Admin retrieves a single site visit by ID.
   */
  async getAdminSiteVisitById(id: string): Promise<AdminSiteVisitDTO | null> {
    const visit = await this.repository.findById(id);
    if (!visit) return null;
    return this.mapToAdminDto(visit);
  }

  /**
   * Admin updates site visit status (e.g. CONFIRMED, RESCHEDULED, COMPLETED, CANCELLED, NO_SHOW).
   */
  async updateAdminStatus(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    visitId: string,
    nextStatus: SiteVisitStatus,
    notes?: string
  ): Promise<AdminSiteVisitDTO | null> {
    const visit = await this.repository.findById(visitId);
    if (!visit) return null;

    if (!isValidSiteVisitTransition(visit.status, nextStatus)) {
      throw new Error(`Invalid site visit status transition from '${visit.status}' to '${nextStatus}'`);
    }

    const updates: Partial<SiteVisitEntity> = {
      status: nextStatus,
    };

    if (notes) updates.staffNote = notes;

    if (nextStatus === 'CONFIRMED') {
      updates.confirmedAt = new Date();
    } else if (nextStatus === 'COMPLETED') {
      updates.completedAt = new Date();
      // Also update linked enquiry status to SITE_VISIT_COMPLETED via guarded repository
      await this.enquiriesRepo.update(visit.enquiryId, {
        status: 'SITE_VISIT_COMPLETED',
      });
    } else if (nextStatus === 'CANCELLED') {
      updates.cancelledAt = new Date();
    }

    const updated = await this.repository.update(visitId, updates);
    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'UPDATE_SITE_VISIT_STATUS',
      resourceType: 'SITE_VISIT',
      resourceId: updated.id,
      success: true,
      metadata: { previousStatus: visit.status, newStatus: nextStatus, notes },
    });

    return this.mapToAdminDto(updated);
  }

  /**
   * Admin assigns staff to a site visit.
   */
  async assignStaff(
    staff: { id?: string | null; role?: string | null } | null,
    req: any,
    visitId: string,
    staffId: string,
    staffName: string
  ): Promise<AdminSiteVisitDTO | null> {
    const updated = await this.repository.update(visitId, {
      assignedTo: staffId,
      assignedToName: staffName,
    });

    if (!updated) return null;

    await auditService.record(req, staff, {
      action: 'ASSIGN_SITE_VISIT_STAFF',
      resourceType: 'SITE_VISIT',
      resourceId: updated.id,
      success: true,
      metadata: { assignedTo: staffId, assignedToName: staffName },
    });

    return this.mapToAdminDto(updated);
  }
}

export const siteVisitService = new SiteVisitService();

