import { createHash } from 'node:crypto';
import { getDb } from '@/src/db/client';
import { enquiries, siteVisits } from '@/src/db/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { SiteVisitEntity, SiteVisitStatus, SiteVisitType } from '@/src/domain/siteVisit/entities/siteVisitEntity';
import { registerCustomerDeletionHook } from '@/src/domain/customer/repositories/inMemoryCustomerRepository';
import {
  isStrictTestEnvironment,
  PersistenceUnavailableError,
  resolveGuardedPersistenceBackend,
  runWithPersistenceGuard,
} from '@/src/lib/persistenceGuard';

export class SiteVisitEnquiryNotFoundError extends Error {
  readonly code = 'ENQUIRY_NOT_FOUND';
  readonly statusCode = 404;

  constructor(enquiryId: string) {
    super(`Parent enquiry '${enquiryId}' was not found for site visit scheduling.`);
    this.name = 'SiteVisitEnquiryNotFoundError';
  }
}

export function isSiteVisitEnquiryNotFoundError(err: unknown): err is SiteVisitEnquiryNotFoundError {
  return (
    err instanceof SiteVisitEnquiryNotFoundError ||
    (typeof err === 'object' &&
      err !== null &&
      (err as { code?: unknown }).code === 'ENQUIRY_NOT_FOUND')
  );
}

export interface CreateStandaloneSiteVisitOptions {
  id?: string;
  idempotencyKey: string;
  enquiryId: string;
  customerId?: string | null;
  projectId?: string | null;
  configurationId?: string | null;
  listingId?: string | null;
  visitType: SiteVisitType;
  preferredDate: string;
  preferredTimeWindow: string;
  buyerNote?: string | null;
}

export interface CreateStandaloneSiteVisitResult {
  siteVisit: SiteVisitEntity;
  created: boolean;
}

export interface SiteVisitRepository {
  create(data: Omit<SiteVisitEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SiteVisitEntity>;
  createStandaloneTransactional(
    options: CreateStandaloneSiteVisitOptions,
    enquiryUpdater?: (enquiryId: string, visitId: string) => Promise<boolean>
  ): Promise<CreateStandaloneSiteVisitResult>;
  findById(id: string): Promise<SiteVisitEntity | null>;
  findByEnquiryId(enquiryId: string): Promise<SiteVisitEntity | null>;
  findByCustomerId(customerId: string): Promise<SiteVisitEntity[]>;
  listAdmin(options?: {
    status?: SiteVisitStatus;
    projectId?: string;
    listingId?: string;
    assignedTo?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SiteVisitEntity[]; total: number }>;
  update(id: string, updates: Partial<SiteVisitEntity>): Promise<SiteVisitEntity | null>;
  list(options?: { limit?: number; offset?: number }): Promise<SiteVisitEntity[]>;
}

const globalForSiteVisits = globalThis as unknown as {
  __gh_mem_site_visits?: Map<string, SiteVisitEntity>;
  __gh_mem_site_visit_idem?: Map<string, string>;
  __gh_mem_site_visit_locks?: Map<string, Promise<CreateStandaloneSiteVisitResult>>;
};

function assertSiteVisitMemoryAllowed(): void {
  if (!isStrictTestEnvironment()) {
    throw new PersistenceUnavailableError(
      'In-memory site visit persistence is strictly restricted to NODE_ENV=test.'
    );
  }
  const provider = (process.env.PERSISTENCE_PROVIDER || '').trim().toLowerCase();
  if (provider === 'postgres') {
    throw new PersistenceUnavailableError(
      'In-memory site visit repository cannot be used when PERSISTENCE_PROVIDER=postgres.'
    );
  }
}

function getMemSiteVisits(): Map<string, SiteVisitEntity> {
  assertSiteVisitMemoryAllowed();
  if (!globalForSiteVisits.__gh_mem_site_visits) {
    globalForSiteVisits.__gh_mem_site_visits = new Map<string, SiteVisitEntity>();
  }
  return globalForSiteVisits.__gh_mem_site_visits;
}

function getMemSiteVisitIdem(): Map<string, string> {
  assertSiteVisitMemoryAllowed();
  if (!globalForSiteVisits.__gh_mem_site_visit_idem) {
    globalForSiteVisits.__gh_mem_site_visit_idem = new Map<string, string>();
  }
  return globalForSiteVisits.__gh_mem_site_visit_idem;
}

function getMemSiteVisitLocks(): Map<string, Promise<CreateStandaloneSiteVisitResult>> {
  assertSiteVisitMemoryAllowed();
  if (!globalForSiteVisits.__gh_mem_site_visit_locks) {
    globalForSiteVisits.__gh_mem_site_visit_locks = new Map<string, Promise<CreateStandaloneSiteVisitResult>>();
  }
  return globalForSiteVisits.__gh_mem_site_visit_locks;
}

registerCustomerDeletionHook((customerId: string) => {
  if (!isStrictTestEnvironment() || !globalForSiteVisits.__gh_mem_site_visits) return;
  const store = globalForSiteVisits.__gh_mem_site_visits;
  for (const [id, v] of store.entries()) {
    if (v.customerId === customerId) {
      store.set(id, { ...v, customerId: null });
    }
  }
});

export function isMissingSiteVisitsRelationError(err: any): boolean {
  if (!err) return false;
  const code = err?.code || err?.cause?.code;
  if (code === '42P01') return true;
  const msg = String(err?.message || err?.cause?.message || '');
  return msg.includes('42P01') || (msg.includes('relation') && msg.includes('site_visits') && msg.includes('does not exist'));
}

function isUniqueConstraintError(err: any): boolean {
  if (!err) return false;
  return err?.code === '23505' || err?.cause?.code === '23505';
}

export function deriveDeterministicSiteVisitId(idempotencyKey: string): string {
  const digest = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 24);
  return `sv_${digest}`;
}

export class SiteVisitRepositoryMemory implements SiteVisitRepository {
  constructor() {
    assertSiteVisitMemoryAllowed();
  }

  async create(data: Omit<SiteVisitEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SiteVisitEntity> {
    assertSiteVisitMemoryAllowed();
    const visitId = data.id || `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const store = getMemSiteVisits();
    const existingById = store.get(visitId);
    if (existingById) {
      const dupErr: any = new Error('Duplicate site visit id.');
      dupErr.code = '23505';
      throw dupErr;
    }

    const now = new Date();
    const entity: SiteVisitEntity = {
      ...data,
      id: visitId,
      customerId: data.customerId || null,
      projectId: data.projectId || null,
      configurationId: data.configurationId || null,
      listingId: data.listingId || null,
      buyerNote: data.buyerNote || null,
      staffNote: data.staffNote || null,
      assignedTo: data.assignedTo || (data as any).assignedStaffId || null,
      assignedToName: data.assignedToName || (data as any).assignedStaffName || null,
      rescheduleReason: data.rescheduleReason || null,
      cancelReason: data.cancelReason || null,
      confirmedAt: data.confirmedAt || null,
      completedAt: data.completedAt || null,
      cancelledAt: data.cancelledAt || null,
      createdAt: now,
      updatedAt: now,
    };
    store.set(entity.id, entity);
    return { ...entity };
  }

  async createStandaloneTransactional(
    options: CreateStandaloneSiteVisitOptions,
    enquiryUpdater?: (enquiryId: string, visitId: string) => Promise<boolean>
  ): Promise<CreateStandaloneSiteVisitResult> {
    assertSiteVisitMemoryAllowed();
    // Lock at the parent enquiry level so concurrent requests with different idempotency keys
    // for the same enquiry and slot are strictly serialized (mirroring SELECT ... FOR UPDATE on enquiries).
    const lockKey = `enq:${options.enquiryId}`;
    const locks = getMemSiteVisitLocks();

    const execute = async (): Promise<CreateStandaloneSiteVisitResult> => {
      const store = getMemSiteVisits();
      const idemMap = getMemSiteVisitIdem();

      if (options.idempotencyKey) {
        const existingId = idemMap.get(options.idempotencyKey);
        if (existingId) {
          const existing = store.get(existingId);
          if (existing) {
            return { siteVisit: { ...existing }, created: false };
          }
        }
      }

      for (const v of store.values()) {
        if (
          v.enquiryId === options.enquiryId &&
          v.status !== 'CANCELLED' &&
          v.preferredDate === options.preferredDate &&
          v.preferredTimeWindow === options.preferredTimeWindow &&
          v.visitType === options.visitType
        ) {
          if (options.idempotencyKey) {
            idemMap.set(options.idempotencyKey, v.id);
          }
          return { siteVisit: { ...v }, created: false };
        }
      }

      const visitId =
        options.id ||
        (options.idempotencyKey
          ? deriveDeterministicSiteVisitId(options.idempotencyKey)
          : `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

      const existingById = store.get(visitId);
      if (existingById) {
        return { siteVisit: { ...existingById }, created: false };
      }

      const created = await this.create({
        id: visitId,
        enquiryId: options.enquiryId,
        customerId: options.customerId || null,
        projectId: options.projectId || null,
        configurationId: options.configurationId || null,
        listingId: options.listingId || null,
        visitType: options.visitType || 'IN_PERSON',
        preferredDate: options.preferredDate,
        preferredTimeWindow: options.preferredTimeWindow,
        status: 'REQUESTED',
        buyerNote: options.buyerNote || null,
        staffNote: null,
        assignedTo: null,
        assignedToName: null,
        rescheduleReason: null,
        cancelReason: null,
        confirmedAt: null,
        completedAt: null,
        cancelledAt: null,
      });

      try {
        if (enquiryUpdater) {
          const updatedOk = await enquiryUpdater(options.enquiryId, created.id);
          if (!updatedOk) {
            throw new SiteVisitEnquiryNotFoundError(options.enquiryId);
          }
        }
        if (options.idempotencyKey) {
          idemMap.set(options.idempotencyKey, created.id);
        }
        return { siteVisit: created, created: true };
      } catch (err) {
        // Atomic rollback in memory mode when parent enquiry update fails
        store.delete(created.id);
        if (options.idempotencyKey) {
          idemMap.delete(options.idempotencyKey);
        }
        throw err;
      }
    };

    const prev = locks.get(lockKey) ?? Promise.resolve(null as unknown as CreateStandaloneSiteVisitResult);
    const next = prev.catch(() => null as unknown as CreateStandaloneSiteVisitResult).then(() => execute());
    locks.set(lockKey, next);
    try {
      return await next;
    } finally {
      if (locks.get(lockKey) === next) {
        locks.delete(lockKey);
      }
    }
  }

  async findById(id: string): Promise<SiteVisitEntity | null> {
    assertSiteVisitMemoryAllowed();
    const found = getMemSiteVisits().get(id);
    return found ? { ...found } : null;
  }

  async findByEnquiryId(enquiryId: string): Promise<SiteVisitEntity | null> {
    assertSiteVisitMemoryAllowed();
    for (const v of getMemSiteVisits().values()) {
      if (v.enquiryId === enquiryId) return { ...v };
    }
    return null;
  }

  async findByCustomerId(customerId: string): Promise<SiteVisitEntity[]> {
    assertSiteVisitMemoryAllowed();
    const list = Array.from(getMemSiteVisits().values()).filter((v) => v.customerId === customerId);
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listAdmin(options?: {
    status?: SiteVisitStatus;
    projectId?: string;
    listingId?: string;
    assignedTo?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SiteVisitEntity[]; total: number }> {
    assertSiteVisitMemoryAllowed();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    let list = Array.from(getMemSiteVisits().values());
    if (options?.status) list = list.filter((v) => v.status === options.status);
    if (options?.projectId) list = list.filter((v) => v.projectId === options.projectId);
    if (options?.listingId) list = list.filter((v) => v.listingId === options.listingId);
    if (options?.assignedTo) list = list.filter((v) => v.assignedTo === options.assignedTo);
    if (options?.fromDate) list = list.filter((v) => v.preferredDate >= options.fromDate!);
    if (options?.toDate) list = list.filter((v) => v.preferredDate <= options.toDate!);
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: list.slice(offset, offset + limit).map((v) => ({ ...v })),
      total: list.length,
    };
  }

  async update(id: string, updates: Partial<SiteVisitEntity>): Promise<SiteVisitEntity | null> {
    assertSiteVisitMemoryAllowed();
    const store = getMemSiteVisits();
    const existing = store.get(id);
    if (!existing) return null;
    const updated: SiteVisitEntity = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    store.set(id, updated);
    return { ...updated };
  }

  async list(options?: { limit?: number; offset?: number }): Promise<SiteVisitEntity[]> {
    assertSiteVisitMemoryAllowed();
    const res = await this.listAdmin(options);
    return res.items;
  }
}

export class SiteVisitRepositoryPostgres implements SiteVisitRepository {
  private readonly enquiryLocks = new Map<string, Promise<CreateStandaloneSiteVisitResult>>();

  constructor(private readonly dbResolver: () => ReturnType<typeof getDb> = getDb) {}

  private requireDb() {
    let db: ReturnType<typeof getDb> = null;
    try {
      db = this.dbResolver();
    } catch {
      throw new PersistenceUnavailableError(
        'Site visit persistence is temporarily unavailable. Please try again later.'
      );
    }
    if (!db) {
      throw new PersistenceUnavailableError(
        'Site visit persistence is temporarily unavailable. PostgreSQL connection is not configured.'
      );
    }
    return db;
  }

  async create(data: Omit<SiteVisitEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SiteVisitEntity> {
    return runWithPersistenceGuard('Site visit', async () => {
      const db = this.requireDb();
      const visitId = data.id || `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const [created] = await db.insert(siteVisits).values({
        id: visitId,
        enquiryId: data.enquiryId,
        customerId: data.customerId || null,
        projectId: data.projectId || null,
        configurationId: data.configurationId || null,
        listingId: data.listingId || null,
        visitType: data.visitType,
        preferredDate: data.preferredDate,
        preferredTimeWindow: data.preferredTimeWindow,
        status: data.status,
        buyerNote: data.buyerNote || null,
        staffNote: data.staffNote || null,
        assignedTo: data.assignedTo || null,
        assignedToName: data.assignedToName || null,
        rescheduleReason: data.rescheduleReason || null,
        cancelReason: data.cancelReason || null,
        confirmedAt: data.confirmedAt || null,
        completedAt: data.completedAt || null,
        cancelledAt: data.cancelledAt || null,
      } as any).returning();

      return this.mapToEntity(created);
    });
  }

  private findMatchingActiveSlotRow(
    rows: any[] | null | undefined,
    options: CreateStandaloneSiteVisitOptions
  ): any | null {
    if (!Array.isArray(rows)) return null;
    return (
      rows.find(
        (r: any) =>
          r.status !== 'CANCELLED' &&
          r.preferredDate === options.preferredDate &&
          r.preferredTimeWindow === options.preferredTimeWindow &&
          (r.visitType || 'IN_PERSON') === (options.visitType || 'IN_PERSON')
      ) || null
    );
  }

  async createStandaloneTransactional(
    options: CreateStandaloneSiteVisitOptions
  ): Promise<CreateStandaloneSiteVisitResult> {
    const lockKey = `enq:${options.enquiryId}`;
    const prev =
      this.enquiryLocks.get(lockKey) ??
      Promise.resolve(null as unknown as CreateStandaloneSiteVisitResult);
    const next = prev
      .catch(() => null as unknown as CreateStandaloneSiteVisitResult)
      .then(() => this.executeStandaloneTransaction(options));
    this.enquiryLocks.set(lockKey, next);
    try {
      return await next;
    } finally {
      if (this.enquiryLocks.get(lockKey) === next) {
        this.enquiryLocks.delete(lockKey);
      }
    }
  }

  private async executeStandaloneTransaction(
    options: CreateStandaloneSiteVisitOptions
  ): Promise<CreateStandaloneSiteVisitResult> {
    const deterministicVisitId =
      options.id ||
      (options.idempotencyKey
        ? deriveDeterministicSiteVisitId(options.idempotencyKey)
        : `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

    try {
      const db = this.requireDb();
      return await db.transaction(async (tx: any) => {
        // 1. Verify parent enquiry exists AND acquire a row-level lock (SELECT ... FOR UPDATE)
        //    so concurrent transactions across processes targeting the same enquiry (even with
        //    different client idempotency keys) serialize before checking active slots.
        const baseEnqQuery = tx
          .select()
          .from(enquiries)
          .where(eq(enquiries.id, options.enquiryId))
          .limit(1);
        const enqRows =
          typeof (baseEnqQuery as any)?.for === 'function'
            ? await (baseEnqQuery as any).for('update')
            : await baseEnqQuery;
        const enq = enqRows?.[0];
        if (!enq) {
          throw new SiteVisitEnquiryNotFoundError(options.enquiryId);
        }

        // 2. Check if deterministic site visit ID already exists
        const existingByIdRows = await tx
          .select()
          .from(siteVisits)
          .where(eq(siteVisits.id, deterministicVisitId))
          .limit(1);
        if (existingByIdRows?.[0]) {
          return {
            siteVisit: this.mapToEntity(existingByIdRows[0]),
            created: false,
          };
        }

        // 3. Check if an active (non-CANCELLED) matching site visit already exists for this enquiry & slot
        const existingForEnquiryRows = await tx
          .select()
          .from(siteVisits)
          .where(eq(siteVisits.enquiryId, options.enquiryId));
        const matchingSlot = this.findMatchingActiveSlotRow(existingForEnquiryRows, options);
        if (matchingSlot) {
          return {
            siteVisit: this.mapToEntity(matchingSlot),
            created: false,
          };
        }

        // 4. Insert site visit row with ON CONFLICT DO NOTHING (handles both primary key and
        //    partial unique index uq_site_visits_active_enquiry_slot)
        const insertBuilder = tx
          .insert(siteVisits)
          .values({
            id: deterministicVisitId,
            enquiryId: options.enquiryId,
            customerId: options.customerId || enq.customerId || null,
            projectId: options.projectId || enq.projectId || null,
            configurationId: options.configurationId || enq.configurationId || null,
            listingId: options.listingId || enq.listingId || null,
            visitType: options.visitType || 'IN_PERSON',
            preferredDate: options.preferredDate,
            preferredTimeWindow: options.preferredTimeWindow,
            status: 'REQUESTED',
            buyerNote: options.buyerNote || enq.message || null,
            staffNote: null,
            assignedTo: enq.assignedTo || null,
            assignedToName: enq.assignedToName || null,
            rescheduleReason: null,
            cancelReason: null,
            confirmedAt: null,
            completedAt: null,
            cancelledAt: null,
          } as any);

        const insertedRows =
          typeof (insertBuilder as any)?.onConflictDoNothing === 'function'
            ? await (insertBuilder as any).onConflictDoNothing().returning()
            : await insertBuilder.returning();

        const createdRow = insertedRows?.[0];
        if (!createdRow) {
          // Concurrent winner inserted either the same deterministic ID or the same active slot
          const winnerByIdRows = await tx
            .select()
            .from(siteVisits)
            .where(eq(siteVisits.id, deterministicVisitId))
            .limit(1);
          if (winnerByIdRows?.[0]) {
            return {
              siteVisit: this.mapToEntity(winnerByIdRows[0]),
              created: false,
            };
          }
          const winnerEnqRows = await tx
            .select()
            .from(siteVisits)
            .where(eq(siteVisits.enquiryId, options.enquiryId));
          const winnerSlot = this.findMatchingActiveSlotRow(winnerEnqRows, options);
          if (winnerSlot) {
            return {
              siteVisit: this.mapToEntity(winnerSlot),
              created: false,
            };
          }
          throw new Error('Failed to insert or resolve concurrent site visit record.');
        }

        // 5. Update parent enquiry inside the SAME transaction
        const updatedEnqRows = await tx
          .update(enquiries)
          .set({
            siteVisitId: createdRow.id,
            status: 'SITE_VISIT_SCHEDULED',
            requestSiteVisit: true,
            updatedAt: new Date(),
          } as any)
          .where(eq(enquiries.id, options.enquiryId))
          .returning({ id: enquiries.id });

        if (!updatedEnqRows || updatedEnqRows.length === 0) {
          throw new Error('Failed to update parent enquiry with site visit reference.');
        }

        return {
          siteVisit: this.mapToEntity(createdRow),
          created: true,
        };
      });
    } catch (err: any) {
      if (isSiteVisitEnquiryNotFoundError(err)) {
        throw err;
      }
      if (isUniqueConstraintError(err)) {
        const existingById = await this.findById(deterministicVisitId);
        if (existingById) {
          return {
            siteVisit: existingById,
            created: false,
          };
        }
        const db = this.requireDb();
        const enquiryRows = await db
          .select()
          .from(siteVisits)
          .where(eq(siteVisits.enquiryId, options.enquiryId));
        const matchingSlot = this.findMatchingActiveSlotRow(enquiryRows, options);
        if (matchingSlot) {
          return {
            siteVisit: this.mapToEntity(matchingSlot),
            created: false,
          };
        }
      }
      throw new PersistenceUnavailableError(
        'Site visit persistence is temporarily unavailable. Please try again later.'
      );
    }
  }

  async findById(id: string): Promise<SiteVisitEntity | null> {
    return runWithPersistenceGuard('Site visit', async () => {
      const db = this.requireDb();
      try {
        const [found] = await db.select().from(siteVisits).where(eq(siteVisits.id, id)).limit(1);
        return found ? this.mapToEntity(found) : null;
      } catch (err: any) {
        if (isMissingSiteVisitsRelationError(err)) {
          return null;
        }
        throw err;
      }
    });
  }

  async findByEnquiryId(enquiryId: string): Promise<SiteVisitEntity | null> {
    return runWithPersistenceGuard('Site visit', async () => {
      const db = this.requireDb();
      try {
        const [found] = await db.select().from(siteVisits).where(eq(siteVisits.enquiryId, enquiryId)).limit(1);
        return found ? this.mapToEntity(found) : null;
      } catch (err: any) {
        if (isMissingSiteVisitsRelationError(err)) {
          return null;
        }
        throw err;
      }
    });
  }

  async findByCustomerId(customerId: string): Promise<SiteVisitEntity[]> {
    return runWithPersistenceGuard('Site visit', async () => {
      const db = this.requireDb();
      try {
        const rows = await db
          .select()
          .from(siteVisits)
          .where(eq(siteVisits.customerId, customerId))
          .orderBy(desc(siteVisits.createdAt));

        return rows.map((r) => this.mapToEntity(r));
      } catch (err: any) {
        if (isMissingSiteVisitsRelationError(err)) {
          return [];
        }
        throw err;
      }
    });
  }

  async listAdmin(options?: {
    status?: SiteVisitStatus;
    projectId?: string;
    listingId?: string;
    assignedTo?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SiteVisitEntity[]; total: number }> {
    return runWithPersistenceGuard('Site visit', async () => {
      const db = this.requireDb();
      const limit = options?.limit || 50;
      const offset = options?.offset || 0;

      try {
        let query = db.select().from(siteVisits).$dynamic();
        const conditions = [];

        if (options?.status) {
          conditions.push(eq(siteVisits.status, options.status));
        }
        if (options?.projectId) {
          conditions.push(eq(siteVisits.projectId, options.projectId));
        }
        if (options?.listingId) {
          conditions.push(eq(siteVisits.listingId, options.listingId));
        }
        if (options?.assignedTo) {
          conditions.push(eq(siteVisits.assignedTo, options.assignedTo));
        }
        if (options?.fromDate) {
          conditions.push(gte(siteVisits.preferredDate, options.fromDate));
        }
        if (options?.toDate) {
          conditions.push(lte(siteVisits.preferredDate, options.toDate));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }

        const rows = await query
          .orderBy(desc(siteVisits.createdAt))
          .limit(limit)
          .offset(offset);

        const [countResult] = await db
          .select({ count: sql<number>`count(*)` })
          .from(siteVisits);

        return {
          items: rows.map((r) => this.mapToEntity(r)),
          total: Number(countResult?.count || rows.length),
        };
      } catch (err: any) {
        if (isMissingSiteVisitsRelationError(err)) {
          return { items: [], total: 0 };
        }
        throw err;
      }
    });
  }

  async update(id: string, updates: Partial<SiteVisitEntity>): Promise<SiteVisitEntity | null> {
    return runWithPersistenceGuard('Site visit', async () => {
      const db = this.requireDb();
      const [updated] = await db
        .update(siteVisits)
        .set({
          ...updates,
          updatedAt: new Date(),
        } as any)
        .where(eq(siteVisits.id, id))
        .returning();

      return updated ? this.mapToEntity(updated) : null;
    });
  }

  private mapToEntity(row: any): SiteVisitEntity {
    return {
      id: row.id,
      enquiryId: row.enquiryId,
      customerId: row.customerId || null,
      projectId: row.projectId || null,
      configurationId: row.configurationId || null,
      listingId: row.listingId || null,
      visitType: row.visitType as SiteVisitType,
      preferredDate: row.preferredDate,
      preferredTimeWindow: row.preferredTimeWindow,
      status: row.status as SiteVisitStatus,
      buyerNote: row.buyerNote || null,
      staffNote: row.staffNote || null,
      assignedTo: row.assignedTo || null,
      assignedToName: row.assignedToName || null,
      rescheduleReason: row.rescheduleReason || null,
      cancelReason: row.cancelReason || null,
      confirmedAt: row.confirmedAt ? new Date(row.confirmedAt) : null,
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
      cancelledAt: row.cancelledAt ? new Date(row.cancelledAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async list(options?: { limit?: number; offset?: number }): Promise<SiteVisitEntity[]> {
    const res = await this.listAdmin(options);
    return res.items;
  }
}

export interface GuardedSiteVisitRepositoryOptions {
  allowTestMemoryPersistence?: boolean;
  dbResolver?: () => ReturnType<typeof getDb>;
}

export class GuardedSiteVisitRepository implements SiteVisitRepository {
  private allowTestMemoryPersistence: boolean;
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private pgRepo: SiteVisitRepositoryPostgres | null = null;
  private memRepo: SiteVisitRepositoryMemory | null = null;

  constructor(options?: GuardedSiteVisitRepositoryOptions) {
    this.allowTestMemoryPersistence = Boolean(options?.allowTestMemoryPersistence);
    this.dbResolver = options?.dbResolver ?? (() => getDb());
  }

  static createForTesting(
    options?: Omit<GuardedSiteVisitRepositoryOptions, 'allowTestMemoryPersistence'>
  ): GuardedSiteVisitRepository {
    if (!isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory site visit test repository construction is strictly restricted to NODE_ENV=test.'
      );
    }
    return new GuardedSiteVisitRepository({
      ...options,
      allowTestMemoryPersistence: true,
    });
  }

  enableTestMemoryPersistence(enabled: boolean = true): void {
    if (enabled && !isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory site visit persistence is permitted only in an explicit test environment (NODE_ENV=test).'
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
        'Clearing in-memory site visit state requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    globalForSiteVisits.__gh_mem_site_visits = new Map();
    globalForSiteVisits.__gh_mem_site_visit_idem = new Map();
    globalForSiteVisits.__gh_mem_site_visit_locks = new Map();
  }

  private resolveDelegate(): SiteVisitRepository {
    const backend = resolveGuardedPersistenceBackend({
      domain: 'Site visit',
      allowTestMemoryPersistence: this.allowTestMemoryPersistence,
      dbResolver: this.dbResolver,
    });

    if (backend.mode === 'postgres') {
      if (!this.pgRepo) {
        this.pgRepo = new SiteVisitRepositoryPostgres(this.dbResolver);
      }
      return this.pgRepo;
    }

    if (!this.memRepo) {
      this.memRepo = new SiteVisitRepositoryMemory();
    }
    return this.memRepo;
  }

  async create(
    data: Omit<SiteVisitEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<SiteVisitEntity> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().create(data);
    });
  }

  async createStandaloneTransactional(
    options: CreateStandaloneSiteVisitOptions,
    enquiryUpdater?: (enquiryId: string, visitId: string) => Promise<boolean>
  ): Promise<CreateStandaloneSiteVisitResult> {
    try {
      return await this.resolveDelegate().createStandaloneTransactional(options, enquiryUpdater);
    } catch (err) {
      if (isSiteVisitEnquiryNotFoundError(err)) {
        throw err;
      }
      if (err instanceof PersistenceUnavailableError) {
        throw err;
      }
      throw new PersistenceUnavailableError(
        'Site visit persistence is temporarily unavailable. Please try again later.'
      );
    }
  }

  async findById(id: string): Promise<SiteVisitEntity | null> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().findById(id);
    });
  }

  async findByEnquiryId(enquiryId: string): Promise<SiteVisitEntity | null> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().findByEnquiryId(enquiryId);
    });
  }

  async findByCustomerId(customerId: string): Promise<SiteVisitEntity[]> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().findByCustomerId(customerId);
    });
  }

  async listAdmin(options?: {
    status?: SiteVisitStatus;
    projectId?: string;
    listingId?: string;
    assignedTo?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: SiteVisitEntity[]; total: number }> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().listAdmin(options);
    });
  }

  async update(id: string, updates: Partial<SiteVisitEntity>): Promise<SiteVisitEntity | null> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().update(id, updates);
    });
  }

  async list(options?: { limit?: number; offset?: number }): Promise<SiteVisitEntity[]> {
    return runWithPersistenceGuard('Site visit', async () => {
      return await this.resolveDelegate().list(options);
    });
  }
}

export const siteVisitRepository = new GuardedSiteVisitRepository();
export const siteVisitRepositoryPostgres = siteVisitRepository;


