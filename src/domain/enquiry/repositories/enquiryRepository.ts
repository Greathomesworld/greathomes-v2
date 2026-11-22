import { EnquiryEntity, EnquiryPriority, EnquiryStatus } from '../entities/enquiryEntity';
import { AdminEnquiryFilterDto, AdminEnquiryMetricsDto } from '../dto/enquiryDto';
import { siteVisitRepository } from '../../../infrastructure/repositories/postgres/siteVisitRepositoryPostgres';
import { EnquiryRepositoryPostgres } from '../../../infrastructure/repositories/postgres/enquiryRepositoryPostgres';
import { getDb } from '../../../db/client';
import { registerCustomerDeletionHook } from '../../customer/repositories/inMemoryCustomerRepository';
import {
  isStrictTestEnvironment,
  PersistenceUnavailableError,
  resolveGuardedPersistenceBackend,
  runWithPersistenceGuard,
} from '../../../lib/persistenceGuard';

export type EnquiryCreateInput = Omit<
  EnquiryEntity,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'priority'
> &
  Partial<Pick<EnquiryEntity, 'status' | 'priority'>>;

export interface IdempotentEnquirySiteVisitInput {
  visitType: 'IN_PERSON' | 'VIRTUAL';
  preferredDate: string;
  preferredTimeWindow: string;
  buyerNote?: string | null;
}

export interface IdempotentEnquiryCreateResult {
  enquiry: EnquiryEntity;
  created: boolean;
  siteVisit?: {
    id: string;
    status: string;
  } | null;
}

export interface AtomicRequirementsUpdatePayload {
  metadata: Record<string, any>;
  configuration?: string | null;
  propertyType?: string | null;
  message?: string | null;
  requestSiteVisit?: boolean;
}

export type AtomicRequirementsUpdateResult =
  | { outcome: 'UPDATED'; enquiry: EnquiryEntity }
  | { outcome: 'NOT_FOUND' }
  | { outcome: 'STATE_LOCKED'; currentStatus: EnquiryStatus };

export interface EnquiryRepository {
  create(data: EnquiryCreateInput): Promise<EnquiryEntity>;
  createIdempotent(
    data: EnquiryCreateInput,
    options?: {
      siteVisit?: IdempotentEnquirySiteVisitInput | null;
    }
  ): Promise<IdempotentEnquiryCreateResult>;
  findByIdempotencyKey(idempotencyKey: string): Promise<EnquiryEntity | null>;
  findById(id: string): Promise<EnquiryEntity | null>;
  list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }>;
  update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null>;
  rotateContinuationTokenAtomic?(
    id: string,
    evaluator: (locked: EnquiryEntity) => { eligible: boolean; nextMetadata?: Record<string, any> }
  ): Promise<{ updated: EnquiryEntity | null; rotated: boolean }>;
  updateBuyerRequirementsAtomic?(
    id: string,
    allowedStatuses: EnquiryStatus[],
    evaluator: (locked: EnquiryEntity) => AtomicRequirementsUpdatePayload
  ): Promise<AtomicRequirementsUpdateResult>;
  delete(id: string): Promise<boolean>;
  getMetrics(): Promise<AdminEnquiryMetricsDto>;
}

const globalForEnquiries = globalThis as unknown as {
  __gh_mem_enquiries?: EnquiryEntity[];
};

function assertEnquiryMemoryAllowed(): void {
  if (!isStrictTestEnvironment()) {
    throw new PersistenceUnavailableError(
      'In-memory enquiry persistence is strictly restricted to NODE_ENV=test.'
    );
  }
  const provider = (process.env.PERSISTENCE_PROVIDER || '').trim().toLowerCase();
  if (provider === 'postgres') {
    throw new PersistenceUnavailableError(
      'In-memory enquiry repository cannot be used when PERSISTENCE_PROVIDER=postgres.'
    );
  }
}

function normalizeDigits(phone?: string | null): string {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

export class EnquiryRepositoryMemory implements EnquiryRepository {
  constructor() {
    assertEnquiryMemoryAllowed();
  }

  private get enquiries(): EnquiryEntity[] {
    assertEnquiryMemoryAllowed();
    if (!globalForEnquiries.__gh_mem_enquiries) {
      globalForEnquiries.__gh_mem_enquiries = [];
    }
    return globalForEnquiries.__gh_mem_enquiries;
  }

  private set enquiries(val: EnquiryEntity[]) {
    assertEnquiryMemoryAllowed();
    globalForEnquiries.__gh_mem_enquiries = val;
  }

  async create(data: EnquiryCreateInput): Promise<EnquiryEntity> {
    assertEnquiryMemoryAllowed();
    if (data.idempotencyKey) {
      const existing = this.enquiries.find((e) => e.idempotencyKey === data.idempotencyKey);
      if (existing) {
        const dupErr: any = new Error('Duplicate enquiry idempotency key.');
        dupErr.code = '23505';
        throw dupErr;
      }
    }

    const now = new Date();
    const id = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const enquiry: EnquiryEntity = {
      ...data,
      id,
      customerId: data.customerId ?? data.metadata?.customerId ?? null,
      visitorId: data.visitorId ?? data.metadata?.visitorId ?? null,
      sessionId: data.sessionId ?? data.metadata?.sessionId ?? null,
      idempotencyKey: data.idempotencyKey ?? null,
      status: data.status || 'NEW',
      priority: data.priority || 'NORMAL',
      createdAt: now,
      updatedAt: now,
    };
    this.enquiries.unshift(enquiry);
    return enquiry;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<EnquiryEntity | null> {
    assertEnquiryMemoryAllowed();
    if (!idempotencyKey) return null;
    return this.enquiries.find((e) => e.idempotencyKey === idempotencyKey) || null;
  }

  async createIdempotent(
    data: EnquiryCreateInput,
    options?: {
      siteVisit?: IdempotentEnquirySiteVisitInput | null;
    }
  ): Promise<IdempotentEnquiryCreateResult> {
    assertEnquiryMemoryAllowed();
    if (data.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(data.idempotencyKey);
      if (existing) {
        let existingSiteVisit: { id: string; status: string } | null = null;
        if (existing.siteVisitId) {
          const sv = await siteVisitRepository.findById(existing.siteVisitId);
          existingSiteVisit = {
            id: existing.siteVisitId,
            status: sv?.status || 'REQUESTED',
          };
        }
        return {
          enquiry: existing,
          created: false,
          siteVisit: existingSiteVisit,
        };
      }
    }

    const createdEnquiry = await this.create(data);
    let siteVisitInfo: { id: string; status: string } | null = null;

    if (options?.siteVisit) {
      try {
        const svId = `sv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const visit = await siteVisitRepository.create({
          id: svId,
          enquiryId: createdEnquiry.id,
          customerId: createdEnquiry.customerId || null,
          projectId: createdEnquiry.projectId || null,
          configurationId: createdEnquiry.configurationId || null,
          listingId: createdEnquiry.listingId || null,
          visitType: options.siteVisit.visitType || 'IN_PERSON',
          preferredDate: options.siteVisit.preferredDate,
          preferredTimeWindow: options.siteVisit.preferredTimeWindow,
          status: 'REQUESTED',
          buyerNote: options.siteVisit.buyerNote || createdEnquiry.message || null,
          staffNote: null,
          assignedTo: null,
          assignedToName: null,
          rescheduleReason: null,
          cancelReason: null,
          confirmedAt: null,
          completedAt: null,
          cancelledAt: null,
        });
        await this.update(createdEnquiry.id, {
          siteVisitId: visit.id,
          status: 'SITE_VISIT_SCHEDULED',
        });
        createdEnquiry.siteVisitId = visit.id;
        createdEnquiry.status = 'SITE_VISIT_SCHEDULED';
        siteVisitInfo = { id: visit.id, status: visit.status };
      } catch (err) {
        // Roll back created enquiry in memory on transactional site-visit failure
        await this.delete(createdEnquiry.id);
        throw err;
      }
    }

    return {
      enquiry: createdEnquiry,
      created: true,
      siteVisit: siteVisitInfo,
    };
  }

  async findById(id: string): Promise<EnquiryEntity | null> {
    assertEnquiryMemoryAllowed();
    return this.enquiries.find(e => e.id === id) || null;
  }

  async update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null> {
    assertEnquiryMemoryAllowed();
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

  async rotateContinuationTokenAtomic(
    id: string,
    evaluator: (locked: EnquiryEntity) => { eligible: boolean; nextMetadata?: Record<string, any> }
  ): Promise<{ updated: EnquiryEntity | null; rotated: boolean }> {
    assertEnquiryMemoryAllowed();
    const index = this.enquiries.findIndex(e => e.id === id);
    if (index === -1) return { updated: null, rotated: false };

    const existing = this.enquiries[index];
    const decision = evaluator(existing);
    if (!decision.eligible || !decision.nextMetadata) {
      return { updated: existing, rotated: false };
    }

    const updated: EnquiryEntity = {
      ...existing,
      metadata: decision.nextMetadata,
      updatedAt: new Date(),
    };
    this.enquiries[index] = updated;
    return { updated, rotated: true };
  }

  async updateBuyerRequirementsAtomic(
    id: string,
    allowedStatuses: EnquiryStatus[],
    evaluator: (locked: EnquiryEntity) => AtomicRequirementsUpdatePayload
  ): Promise<AtomicRequirementsUpdateResult> {
    assertEnquiryMemoryAllowed();
    const index = this.enquiries.findIndex(e => e.id === id);
    if (index === -1) return { outcome: 'NOT_FOUND' };

    const existing = this.enquiries[index];
    if (!allowedStatuses.includes(existing.status)) {
      return { outcome: 'STATE_LOCKED', currentStatus: existing.status };
    }

    const patch = evaluator(existing);
    const updated: EnquiryEntity = {
      ...existing,
      metadata: patch.metadata,
      ...(patch.configuration !== undefined ? { configuration: patch.configuration } : {}),
      ...(patch.propertyType !== undefined ? { propertyType: patch.propertyType } : {}),
      ...(patch.message !== undefined ? { message: patch.message } : {}),
      ...(patch.requestSiteVisit !== undefined ? { requestSiteVisit: patch.requestSiteVisit } : {}),
      updatedAt: new Date(),
    };
    this.enquiries[index] = updated;
    return { outcome: 'UPDATED', enquiry: updated };
  }

  async delete(id: string): Promise<boolean> {
    assertEnquiryMemoryAllowed();
    const initialLen = this.enquiries.length;
    this.enquiries = this.enquiries.filter(e => e.id !== id);
    return this.enquiries.length < initialLen;
  }

  async list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    assertEnquiryMemoryAllowed();
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
        if (targetStatus === 'NEW' || targetStatus === 'RECEIVED') {
          return e.status === 'NEW' || e.status === 'RECEIVED';
        }
        if (targetStatus === 'QUALIFIED' || targetStatus === 'IN_REVIEW') {
          return e.status === 'QUALIFIED' || e.status === 'IN_REVIEW';
        }
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
    assertEnquiryMemoryAllowed();
    const total = this.enquiries.length;
    let newCount = 0;
    let contactedCount = 0;
    let qualifiedCount = 0;
    let siteVisitsCount = 0;
    let siteVisitInterestCount = 0;
    let convertedCount = 0;
    let lostCount = 0;
    let closedCount = 0;
    let urgentCount = 0;

    for (const e of this.enquiries) {
      if (e.status === 'NEW' || e.status === 'RECEIVED') newCount++;
      if (e.status === 'CONTACTED') contactedCount++;
      if (e.status === 'QUALIFIED' || e.status === 'IN_REVIEW') qualifiedCount++;
      const isScheduledOrCompleted =
        e.status === 'SITE_VISIT_SCHEDULED' ||
        e.status === 'SITE_VISIT_COMPLETED' ||
        Boolean(e.siteVisitId);
      if (isScheduledOrCompleted) {
        siteVisitsCount++;
      } else if (e.requestSiteVisit) {
        siteVisitInterestCount++;
      }
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
      siteVisitInterestCount,
      convertedCount,
      lostCount,
      closedCount,
      urgentCount,
    };
  }
}

registerCustomerDeletionHook((customerId: string) => {
  if (!isStrictTestEnvironment()) return;
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
  if (!isStrictTestEnvironment() || !globalForEnquiries.__gh_mem_enquiries) return;
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

export interface GuardedEnquiryRepositoryOptions {
  allowTestMemoryPersistence?: boolean;
  dbResolver?: () => ReturnType<typeof getDb>;
}

export class GuardedEnquiryRepository implements EnquiryRepository {
  private allowTestMemoryPersistence: boolean;
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private pgRepo: EnquiryRepositoryPostgres | null = null;
  private memRepo: EnquiryRepositoryMemory | null = null;

  constructor(options?: GuardedEnquiryRepositoryOptions) {
    this.allowTestMemoryPersistence = Boolean(options?.allowTestMemoryPersistence);
    this.dbResolver = options?.dbResolver ?? (() => getDb());
  }

  static createForTesting(
    options?: Omit<GuardedEnquiryRepositoryOptions, 'allowTestMemoryPersistence'>
  ): GuardedEnquiryRepository {
    if (!isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory enquiry test repository construction is strictly restricted to NODE_ENV=test.'
      );
    }
    return new GuardedEnquiryRepository({
      ...options,
      allowTestMemoryPersistence: true,
    });
  }

  enableTestMemoryPersistence(enabled: boolean = true): void {
    if (enabled && !isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory enquiry persistence is permitted only in an explicit test environment (NODE_ENV=test).'
      );
    }
    this.allowTestMemoryPersistence = enabled;
    if (!enabled) {
      this.memRepo = null;
    }
  }

  clearMemoryForTesting(): void {
    if (!isStrictTestEnvironment() || !this.allowTestMemoryPersistence) {
      throw new PersistenceUnavailableError(
        'Clearing in-memory enquiry state requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    globalForEnquiries.__gh_mem_enquiries = [];
  }

  private resolveDelegate(): EnquiryRepository {
    const backend = resolveGuardedPersistenceBackend({
      domain: 'Enquiry',
      allowTestMemoryPersistence: this.allowTestMemoryPersistence,
      dbResolver: this.dbResolver,
    });

    if (backend.mode === 'postgres') {
      if (!this.pgRepo) {
        this.pgRepo = new EnquiryRepositoryPostgres(async () => this.dbResolver());
      }
      return this.pgRepo;
    }

    if (!this.memRepo) {
      this.memRepo = new EnquiryRepositoryMemory();
    }
    return this.memRepo;
  }

  create(data: EnquiryCreateInput): Promise<EnquiryEntity> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().create(data));
  }

  createIdempotent(
    data: EnquiryCreateInput,
    options?: {
      siteVisit?: IdempotentEnquirySiteVisitInput | null;
    }
  ): Promise<IdempotentEnquiryCreateResult> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().createIdempotent(data, options));
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<EnquiryEntity | null> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().findByIdempotencyKey(idempotencyKey));
  }

  findById(id: string): Promise<EnquiryEntity | null> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().findById(id));
  }

  list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().list(filter));
  }

  update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().update(id, data));
  }

  rotateContinuationTokenAtomic(
    id: string,
    evaluator: (locked: EnquiryEntity) => { eligible: boolean; nextMetadata?: Record<string, any> }
  ): Promise<{ updated: EnquiryEntity | null; rotated: boolean }> {
    return runWithPersistenceGuard('Enquiry', () => {
      const delegate = this.resolveDelegate();
      if (typeof delegate.rotateContinuationTokenAtomic === 'function') {
        return delegate.rotateContinuationTokenAtomic(id, evaluator);
      }
      return delegate.findById(id).then(async (existing) => {
        if (!existing) return { updated: null, rotated: false };
        const decision = evaluator(existing);
        if (!decision.eligible || !decision.nextMetadata) {
          return { updated: existing, rotated: false };
        }
        const updated = await delegate.update(id, { metadata: decision.nextMetadata });
        return { updated, rotated: Boolean(updated) };
      });
    });
  }

  updateBuyerRequirementsAtomic(
    id: string,
    allowedStatuses: EnquiryStatus[],
    evaluator: (locked: EnquiryEntity) => AtomicRequirementsUpdatePayload
  ): Promise<AtomicRequirementsUpdateResult> {
    return runWithPersistenceGuard('Enquiry', () => {
      const delegate = this.resolveDelegate();
      if (typeof delegate.updateBuyerRequirementsAtomic === 'function') {
        return delegate.updateBuyerRequirementsAtomic(id, allowedStatuses, evaluator);
      }
      return delegate.findById(id).then(async (existing) => {
        if (!existing) return { outcome: 'NOT_FOUND' as const };
        if (!allowedStatuses.includes(existing.status)) {
          return { outcome: 'STATE_LOCKED' as const, currentStatus: existing.status };
        }
        const patch = evaluator(existing);
        const updated = await delegate.update(id, patch);
        if (!updated) return { outcome: 'NOT_FOUND' as const };
        return { outcome: 'UPDATED' as const, enquiry: updated };
      });
    });
  }

  delete(id: string): Promise<boolean> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().delete(id));
  }

  getMetrics(): Promise<AdminEnquiryMetricsDto> {
    return runWithPersistenceGuard('Enquiry', () => this.resolveDelegate().getMetrics());
  }
}

export const enquiryRepository = new GuardedEnquiryRepository();


