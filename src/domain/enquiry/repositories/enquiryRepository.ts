import { EnquiryEntity, EnquiryPriority, EnquiryStatus } from '../entities/enquiryEntity';
import { AdminEnquiryFilterDto, AdminEnquiryMetricsDto } from '../dto/enquiryDto';

export interface EnquiryRepository {
  create(data: Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'priority'> & Partial<Pick<EnquiryEntity, 'status' | 'priority'>>): Promise<EnquiryEntity>;
  findById(id: string): Promise<EnquiryEntity | null>;
  list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }>;
  update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null>;
  delete(id: string): Promise<boolean>;
  getMetrics(): Promise<AdminEnquiryMetricsDto>;
}

const globalForEnquiries = globalThis as unknown as {
  __gh_mem_enquiries?: EnquiryEntity[];
};

function normalizeDigits(phone?: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

export class EnquiryRepositoryMemory implements EnquiryRepository {
  private get enquiries(): EnquiryEntity[] {
    if (!globalForEnquiries.__gh_mem_enquiries) {
      globalForEnquiries.__gh_mem_enquiries = [];
    }
    return globalForEnquiries.__gh_mem_enquiries;
  }

  private set enquiries(val: EnquiryEntity[]) {
    globalForEnquiries.__gh_mem_enquiries = val;
  }

  async create(data: Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'priority'> & Partial<Pick<EnquiryEntity, 'status' | 'priority'>>): Promise<EnquiryEntity> {
    const now = new Date();
    const id = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const enquiry: EnquiryEntity = {
      ...data,
      id,
      customerId: data.customerId ?? data.metadata?.customerId ?? null,
      visitorId: data.visitorId ?? data.metadata?.visitorId ?? null,
      sessionId: data.sessionId ?? data.metadata?.sessionId ?? null,
      status: data.status || 'NEW',
      priority: data.priority || 'NORMAL',
      createdAt: now,
      updatedAt: now,
    };
    this.enquiries.unshift(enquiry);
    return enquiry;
  }

  async findById(id: string): Promise<EnquiryEntity | null> {
    return this.enquiries.find(e => e.id === id) || null;
  }

  async update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null> {
    const index = this.enquiries.findIndex(e => e.id === id);
    if (index === -1) return null;

    const existing = this.enquiries[index];
    const updated: EnquiryEntity = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.enquiries[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const initialLen = this.enquiries.length;
    this.enquiries = this.enquiries.filter(e => e.id !== id);
    return this.enquiries.length < initialLen;
  }

  async list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    let result = [...this.enquiries];

    if (filter?.customerId) {
      result = result.filter(
        (e) => e.customerId === filter.customerId || e.metadata?.customerId === filter.customerId
      );
    }

    if (filter?.visitorId) {
      result = result.filter(
        (e) => e.visitorId === filter.visitorId || e.metadata?.visitorId === filter.visitorId
      );
    }

    if (filter?.buyerPhone) {
      const targetDigits = normalizeDigits(filter.buyerPhone);
      result = result.filter((e) => targetDigits && normalizeDigits(e.buyerPhone) === targetDigits);
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(e =>
        e.buyerName?.toLowerCase().includes(q) ||
        e.buyerPhone?.toLowerCase().includes(q) ||
        e.buyerEmail?.toLowerCase().includes(q) ||
        e.projectName?.toLowerCase().includes(q) ||
        e.listingTitle?.toLowerCase().includes(q) ||
        e.configuration?.toLowerCase().includes(q) ||
        e.locationName?.toLowerCase().includes(q)
      );
    }

    if (filter?.status && filter.status !== 'ALL') {
      const targetStatus = filter.status.toUpperCase();
      result = result.filter(e => {
        if (targetStatus === 'NEW') return e.status === 'NEW' || e.status === 'RECEIVED';
        if (targetStatus === 'QUALIFIED') return e.status === 'QUALIFIED' || e.status === 'IN_REVIEW';
        return e.status === targetStatus;
      });
    }

    if (filter?.priority && filter.priority !== 'ALL') {
      const targetPriority = filter.priority.toUpperCase();
      result = result.filter(e => e.priority === targetPriority);
    }

    if (filter?.contextType && filter.contextType !== 'ALL') {
      const targetContext = filter.contextType.toUpperCase();
      result = result.filter(e => e.contextType === targetContext);
    }

    if (filter?.assignedTo && filter.assignedTo !== 'ALL') {
      if (filter.assignedTo === 'UNASSIGNED') {
        result = result.filter(e => !e.assignedTo);
      } else if (filter.assignedTo === 'ASSIGNED') {
        result = result.filter(e => Boolean(e.assignedTo));
      } else {
        result = result.filter(e => e.assignedTo === filter.assignedTo || e.assignedToName === filter.assignedTo);
      }
    }

    if (filter?.dateRange && filter.dateRange !== 'ALL') {
      const now = new Date();
      if (filter.dateRange === 'TODAY') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        result = result.filter(e => new Date(e.createdAt) >= startOfDay);
      } else if (filter.dateRange === '7_DAYS') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        result = result.filter(e => new Date(e.createdAt) >= sevenDaysAgo);
      } else if (filter.dateRange === '30_DAYS') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        result = result.filter(e => new Date(e.createdAt) >= thirtyDaysAgo);
      }
    }

    const priorityWeight: Record<EnquiryPriority, number> = {
      URGENT: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1,
    };

    const sortBy = filter?.sortBy || 'createdAt';
    const sortOrder = filter?.sortOrder === 'asc' ? 1 : -1;

    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'priority') {
        comparison = (priorityWeight[a.priority] || 0) - (priorityWeight[b.priority] || 0);
      } else if (sortBy === 'updatedAt') {
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortBy === 'nextFollowUpAt') {
        const aDate = a.nextFollowUpAt ? new Date(a.nextFollowUpAt).getTime() : Infinity;
        const bDate = b.nextFollowUpAt ? new Date(b.nextFollowUpAt).getTime() : Infinity;
        comparison = aDate - bDate;
      } else if (sortBy === 'status') {
        comparison = (a.status || '').localeCompare(b.status || '');
      } else {
        comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      if (comparison !== 0) {
        return comparison * sortOrder;
      }
      return b.id.localeCompare(a.id);
    });

    const total = result.length;
    const page = Math.max(1, filter?.page || 1);
    const limit = Math.max(1, filter?.limit || 20);
    const start = (page - 1) * limit;
    const items = result.slice(start, start + limit);

    return { items, total };
  }

  async getMetrics(): Promise<AdminEnquiryMetricsDto> {
    const total = this.enquiries.length;
    let newCount = 0;
    let contactedCount = 0;
    let qualifiedCount = 0;
    let siteVisitsCount = 0;
    let convertedCount = 0;
    let lostCount = 0;
    let closedCount = 0;
    let urgentCount = 0;

    for (const e of this.enquiries) {
      if (e.status === 'NEW' || e.status === 'RECEIVED') newCount++;
      if (e.status === 'CONTACTED') contactedCount++;
      if (e.status === 'QUALIFIED' || e.status === 'IN_REVIEW') qualifiedCount++;
      if (e.status === 'SITE_VISIT_SCHEDULED' || e.status === 'SITE_VISIT_COMPLETED' || e.requestSiteVisit) siteVisitsCount++;
      if (e.status === 'CONVERTED') convertedCount++;
      if (e.status === 'LOST') lostCount++;
      if (e.status === 'CLOSED') closedCount++;
      if (e.priority === 'URGENT') urgentCount++;
    }

    return {
      total,
      newCount,
      contactedCount,
      qualifiedCount,
      siteVisitsCount,
      convertedCount,
      lostCount,
      closedCount,
      urgentCount,
    };
  }
}

import { EnquiryRepositoryPostgres } from '../../../infrastructure/repositories/postgres/enquiryRepositoryPostgres';
import { getDb } from '../../../db/client';
import { registerCustomerDeletionHook } from '../../customer/repositories/inMemoryCustomerRepository';

registerCustomerDeletionHook((customerId: string) => {
  if (globalForEnquiries.__gh_mem_enquiries) {
    for (const enq of globalForEnquiries.__gh_mem_enquiries) {
      if (enq.customerId === customerId) {
        enq.customerId = null;
      }
      if (enq.metadata?.customerId === customerId) {
        enq.metadata = { ...enq.metadata, customerId: null };
      }
    }
  }
});

/**
 * Mirrors PostgreSQL ON DELETE SET NULL foreign key behavior on enquiries(visitor_id) and enquiries(session_id)
 * when unlinked anonymous visitors or sessions are deleted in memory mode.
 */
export function unlinkEnquiryVisitorAttributionInMemory(
  visitorIds: Set<string>,
  sessionIds?: Set<string>
): void {
  if (!globalForEnquiries.__gh_mem_enquiries) return;
  for (const enq of globalForEnquiries.__gh_mem_enquiries) {
    if (enq.visitorId && visitorIds.has(enq.visitorId)) {
      enq.visitorId = null;
      if (enq.metadata && enq.metadata.visitorId && visitorIds.has(enq.metadata.visitorId)) {
        enq.metadata = { ...enq.metadata, visitorId: null };
      }
    }
    if (enq.sessionId && ((sessionIds && sessionIds.has(enq.sessionId)) || (enq.visitorId === null && !sessionIds))) {
      enq.sessionId = null;
      if (enq.metadata && enq.metadata.sessionId) {
        enq.metadata = { ...enq.metadata, sessionId: null };
      }
    }
  }
}

const pgEnquiryRepo = new EnquiryRepositoryPostgres();
const memEnquiryRepo = new EnquiryRepositoryMemory();

export const enquiryRepository: EnquiryRepository = new Proxy({} as EnquiryRepository, {
  get(_target, prop, receiver) {
    const usePg =
      process.env.PERSISTENCE_PROVIDER !== 'memory' && Boolean(getDb());
    const active = usePg ? pgEnquiryRepo : memEnquiryRepo;
    const val = Reflect.get(active, prop, receiver);
    return typeof val === 'function' ? val.bind(active) : val;
  },
});

