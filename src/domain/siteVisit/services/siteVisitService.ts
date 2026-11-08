import { getDb } from '@/src/db/client';
import { siteVisits, enquiries, projects, resaleListings, rentalListings } from '@/src/db/schema';
import { eq } from 'drizzle-orm';
import {
  SiteVisitEntity,
  SiteVisitStatus,
  SiteVisitType,
  SITE_VISIT_STATUS_LABELS,
  isValidSiteVisitTransition,
} from '../entities/siteVisitEntity';
import { CustomerSiteVisitDTO, AdminSiteVisitDTO } from '../dto/siteVisitDto';
import { siteVisitRepositoryPostgres } from '@/src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres';
import { enquiryRepository } from '@/src/domain/enquiry/repositories/enquiryRepository';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { auditService } from '../../audit/auditService';

function getActiveDb() {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') return null;
  return getDb();
}

export class SiteVisitService {
  private repository = siteVisitRepositoryPostgres;

  /**
   * Helper to map SiteVisitEntity to CustomerSiteVisitDTO.
   * Excludes staff notes, internal priority, and staff details.
   */
  async mapToCustomerDto(visit: SiteVisitEntity): Promise<CustomerSiteVisitDTO> {
    const db = getActiveDb();
    let propertyName: string | null = null;
    let propertySlug: string | null = null;
    let referenceNumber = `GH-ENQ-${visit.enquiryId.slice(-6).toUpperCase()}`;

    if (db) {
      // Try resolving enquiry details if available
      const [enq] = await db
        .select({
          id: enquiries.id,
          projectName: enquiries.projectName,
          projectSlug: enquiries.projectSlug,
          listingTitle: enquiries.listingTitle,
          listingSlug: enquiries.listingSlug,
          metadata: enquiries.metadata,
        })
        .from(enquiries)
        .where(eq(enquiries.id, visit.enquiryId))
        .limit(1);

      if (enq) {
        propertyName = enq.projectName || enq.listingTitle || null;
        propertySlug = enq.projectSlug || enq.listingSlug || null;
        if (enq.metadata) {
          try {
            const parsed = JSON.parse(enq.metadata);
            if (parsed.referenceNumber) referenceNumber = parsed.referenceNumber;
          } catch (e) {
            // ignore JSON parse error
          }
        }
      }

      if (!propertyName && visit.projectId) {
        const [p] = await db
          .select({ name: projects.name, slug: projects.slug })
          .from(projects)
          .where(eq(projects.id, visit.projectId))
          .limit(1);
        if (p) {
          propertyName = p.name;
          propertySlug = p.slug;
        }
      }
    } else {
      const enq = await enquiryRepository.findById(visit.enquiryId);
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
    const db = getActiveDb();
    let buyerName: string | null = null;
    let buyerPhone: string | null = null;
    let buyerEmail: string | null = null;

    if (db) {
      const [enq] = await db
        .select({
          buyerName: enquiries.buyerName,
          buyerPhone: enquiries.buyerPhone,
          buyerEmail: enquiries.buyerEmail,
        })
        .from(enquiries)
        .where(eq(enquiries.id, visit.enquiryId))
        .limit(1);

      if (enq) {
        buyerName = enq.buyerName;
        buyerPhone = enq.buyerPhone;
        buyerEmail = enq.buyerEmail;
      }
    } else {
      const enq = await enquiryRepository.findById(visit.enquiryId);
      if (enq) {
        buyerName = enq.buyerName;
        buyerPhone = enq.buyerPhone;
        buyerEmail = enq.buyerEmail || null;
      }
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
    },
    req?: any
  ): Promise<SiteVisitEntity> {
    const id = `sv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const visit = await this.repository.create({
      id,
      enquiryId,
      customerId: params.customerId || null,
      projectId: params.projectId || null,
      configurationId: params.configurationId || null,
      listingId: params.listingId || null,
      visitType: params.visitType || 'IN_PERSON',
      preferredDate: params.preferredDate,
      preferredTimeWindow: params.preferredTimeWindow,
      status: 'REQUESTED',
      buyerNote: params.buyerNote || null,
      staffNote: null,
      assignedTo: null,
      assignedToName: null,
      rescheduleReason: null,
      cancelReason: null,
      confirmedAt: null,
      completedAt: null,
      cancelledAt: null,
    });

    // Update enquiry siteVisitId and status
    const db = getActiveDb();
    if (db) {
      await db
        .update(enquiries)
        .set({
          siteVisitId: visit.id,
          status: 'SITE_VISIT_SCHEDULED',
          updatedAt: new Date(),
        } as any)
        .where(eq(enquiries.id, enquiryId));
    } else {
      await enquiryRepository.update(enquiryId, {
        siteVisitId: visit.id,
        status: 'SITE_VISIT_SCHEDULED',
      });
    }

    if (req) {
      await auditService.record(req, null, {
        action: 'CREATE_SITE_VISIT',
        resourceType: 'SITE_VISIT',
        resourceId: visit.id,
        success: true,
        metadata: { enquiryId, preferredDate: visit.preferredDate, visitType: visit.visitType },
      });
    }

    return visit;
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
      // Also update linked enquiry status to SITE_VISIT_COMPLETED
      const db = getActiveDb();
      if (db) {
        await db
          .update(enquiries)
          .set({ status: 'SITE_VISIT_COMPLETED', updatedAt: new Date() } as any)
          .where(eq(enquiries.id, visit.enquiryId));
      } else {
        await enquiryRepository.update(visit.enquiryId, {
          status: 'SITE_VISIT_COMPLETED',
        });
      }
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
