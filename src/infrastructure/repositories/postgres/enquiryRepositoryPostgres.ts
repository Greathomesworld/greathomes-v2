import { eq, desc, asc, and, or, sql, gte, ilike, inArray } from 'drizzle-orm';
import { getDbReady } from '@/src/db/client';
import { enquiries, siteVisits } from '@/src/db/schema';
import { EnquiryEntity, EnquiryPriority, EnquiryStatus } from '@/src/domain/enquiry/entities/enquiryEntity';
import {
  AtomicRequirementsUpdatePayload,
  AtomicRequirementsUpdateResult,
  EnquiryCreateInput,
  EnquiryRepository,
  IdempotentEnquiryCreateResult,
  IdempotentEnquirySiteVisitInput,
} from '@/src/domain/enquiry/repositories/enquiryRepository';
import { AdminEnquiryFilterDto, AdminEnquiryMetricsDto } from '@/src/domain/enquiry/dto/enquiryDto';
import {
  PersistenceUnavailableError,
  runWithPersistenceGuard,
} from '@/src/lib/persistenceGuard';

export type EnquiryDbResolver = () => Promise<ReturnType<typeof getDbReady>> | ReturnType<typeof getDbReady>;

function isUniqueConstraintError(err: any): boolean {
  if (!err) return false;
  return err?.code === '23505' || err?.cause?.code === '23505';
}

export class EnquiryRepositoryPostgres implements EnquiryRepository {
  constructor(private readonly dbResolver: EnquiryDbResolver = getDbReady) {}

  private async requireDb() {
    let db: Awaited<ReturnType<typeof getDbReady>> = null;
    try {
      db = await this.dbResolver();
    } catch {
      throw new PersistenceUnavailableError(
        'Enquiry persistence is temporarily unavailable. Please try again later.'
      );
    }
    if (!db) {
      throw new PersistenceUnavailableError(
        'Enquiry persistence is temporarily unavailable. PostgreSQL connection is not configured.'
      );
    }
    return db;
  }

  private buildInsertValues(
    id: string,
    data: EnquiryCreateInput,
    overrideStatus?: EnquiryStatus
  ): Record<string, any> {
    return {
      id,
      contextType: data.contextType,
      customerId: data.customerId ?? data.metadata?.customerId ?? null,
      visitorId: data.visitorId ?? data.metadata?.visitorId ?? null,
      sessionId: data.sessionId ?? data.metadata?.sessionId ?? null,
      projectId: data.projectId,
      projectSlug: data.projectSlug,
      projectName: data.projectName,
      configurationId: data.configurationId,
      listingId: data.listingId,
      listingSlug: data.listingSlug,
      listingTitle: data.listingTitle,
      configuration: data.configuration,
      propertyType: data.propertyType,
      priceDisplay: data.priceDisplay,
      locationName: data.locationName,
      buyerName: data.buyerName,
      buyerPhone: data.buyerPhone,
      buyerEmail: data.buyerEmail,
      preferredContact: data.preferredContact,
      requestSiteVisit: data.requestSiteVisit ?? false,
      message: data.message,
      status: overrideStatus || data.status || 'NEW',
      priority: data.priority || 'NORMAL',
      assignedTo: data.assignedTo,
      assignedToName: data.assignedToName,
      source: data.source,
      sourcePage: data.sourcePage,
      internalNotes: data.internalNotes,
      lastContactedAt: data.lastContactedAt ? new Date(data.lastContactedAt) : undefined,
      nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
      siteVisitId: data.siteVisitId,
      idempotencyKey: data.idempotencyKey ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
    };
  }

  private async resolveExistingByIdempotencyKey(
    runner: any,
    idempotencyKey: string
  ): Promise<IdempotentEnquiryCreateResult | null> {
    const existingRows = await runner
      .select()
      .from(enquiries)
      .where(eq(enquiries.idempotencyKey, idempotencyKey))
      .limit(1);

    if (!existingRows || existingRows.length === 0) {
      return null;
    }

    const existing = this.mapRowToEntity(existingRows[0]);
    let siteVisitInfo: { id: string; status: string } | null = null;

    if (existing.siteVisitId) {
      const svRows = await runner
        .select({ id: siteVisits.id, status: siteVisits.status })
        .from(siteVisits)
        .where(eq(siteVisits.id, existing.siteVisitId))
        .limit(1);

      if (svRows && svRows.length > 0) {
        siteVisitInfo = { id: svRows[0].id, status: svRows[0].status };
      } else {
        siteVisitInfo = { id: existing.siteVisitId, status: 'REQUESTED' };
      }
    }

    return {
      enquiry: existing,
      created: false,
      siteVisit: siteVisitInfo,
    };
  }

  async create(data: EnquiryCreateInput): Promise<EnquiryEntity> {
    const db = await this.requireDb();
    const id = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    return await runWithPersistenceGuard(
      'Enquiry',
      async () => {
        const [row] = await db
          .insert(enquiries)
          .values(this.buildInsertValues(id, data) as any)
          .returning();

        return this.mapRowToEntity(row);
      },
      isUniqueConstraintError
    );
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<EnquiryEntity | null> {
    if (!idempotencyKey) return null;
    const db = await this.requireDb();

    return await runWithPersistenceGuard('Enquiry', async () => {
      const rows = await db
        .select()
        .from(enquiries)
        .where(eq(enquiries.idempotencyKey, idempotencyKey))
        .limit(1);
      if (rows.length === 0) return null;
      return this.mapRowToEntity(rows[0]);
    });
  }

  async createIdempotent(
    data: EnquiryCreateInput,
    options?: {
      siteVisit?: IdempotentEnquirySiteVisitInput | null;
    }
  ): Promise<IdempotentEnquiryCreateResult> {
    const db = await this.requireDb();

    return await runWithPersistenceGuard('Enquiry', async () => {
      try {
        return await db.transaction(async (tx: any) => {
          const id = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const values = this.buildInsertValues(
            id,
            data,
            options?.siteVisit ? 'SITE_VISIT_SCHEDULED' : undefined
          );

          let insertedRows: any[];
          if (data.idempotencyKey) {
            insertedRows = await tx
              .insert(enquiries)
              .values(values as any)
              .onConflictDoNothing({
                target: enquiries.idempotencyKey,
                where: sql`${enquiries.idempotencyKey} IS NOT NULL`,
              })
              .returning();
          } else {
            insertedRows = await tx
              .insert(enquiries)
              .values(values as any)
              .returning();
          }

          if (!insertedRows || insertedRows.length === 0) {
            if (data.idempotencyKey) {
              const existing = await this.resolveExistingByIdempotencyKey(tx, data.idempotencyKey);
              if (existing) return existing;
            }
            throw new Error('Enquiry idempotency conflict occurred without retrievable existing record.');
          }

          let row = insertedRows[0];
          let siteVisitInfo: { id: string; status: string } | null = null;

          if (options?.siteVisit) {
            const svId = `sv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            await tx.insert(siteVisits).values({
              id: svId,
              enquiryId: row.id,
              customerId: row.customerId || null,
              projectId: row.projectId || null,
              configurationId: row.configurationId || null,
              listingId: row.listingId || null,
              visitType: options.siteVisit.visitType || 'IN_PERSON',
              preferredDate: options.siteVisit.preferredDate,
              preferredTimeWindow: options.siteVisit.preferredTimeWindow,
              status: 'REQUESTED',
              buyerNote: options.siteVisit.buyerNote || row.message || null,
              staffNote: null,
              assignedTo: null,
              assignedToName: null,
              rescheduleReason: null,
              cancelReason: null,
              confirmedAt: null,
              completedAt: null,
              cancelledAt: null,
            } as any);

            const [updatedRow] = await tx
              .update(enquiries)
              .set({
                siteVisitId: svId,
                status: 'SITE_VISIT_SCHEDULED',
                updatedAt: new Date(),
              } as any)
              .where(eq(enquiries.id, row.id))
              .returning();

            if (updatedRow) {
              row = updatedRow;
            }
            siteVisitInfo = { id: svId, status: 'REQUESTED' };
          }

          return {
            enquiry: this.mapRowToEntity(row),
            created: true,
            siteVisit: siteVisitInfo,
          };
        });
      } catch (err: any) {
        if (isUniqueConstraintError(err) && data.idempotencyKey) {
          const existing = await this.resolveExistingByIdempotencyKey(db, data.idempotencyKey);
          if (existing) return existing;
        }
        throw err;
      }
    });
  }

  async findById(id: string): Promise<EnquiryEntity | null> {
    const db = await this.requireDb();
    return await runWithPersistenceGuard('Enquiry', async () => {
      const rows = await db.select().from(enquiries).where(eq(enquiries.id, id));
      if (rows.length === 0) return null;
      return this.mapRowToEntity(rows[0]);
    });
  }

  async update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null> {
    const db = await this.requireDb();

    const valuesToUpdate: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) valuesToUpdate.status = data.status;
    if (data.priority !== undefined) valuesToUpdate.priority = data.priority;
    if (data.customerId !== undefined) valuesToUpdate.customerId = data.customerId;
    if (data.visitorId !== undefined) valuesToUpdate.visitorId = data.visitorId;
    if (data.sessionId !== undefined) valuesToUpdate.sessionId = data.sessionId;
    if (data.configuration !== undefined) valuesToUpdate.configuration = data.configuration;
    if (data.propertyType !== undefined) valuesToUpdate.propertyType = data.propertyType;
    if (data.message !== undefined) valuesToUpdate.message = data.message;
    if (data.assignedTo !== undefined) valuesToUpdate.assignedTo = data.assignedTo;
    if (data.assignedToName !== undefined) valuesToUpdate.assignedToName = data.assignedToName;
    if (data.internalNotes !== undefined) valuesToUpdate.internalNotes = data.internalNotes;
    if (data.lastContactedAt !== undefined) {
      valuesToUpdate.lastContactedAt = data.lastContactedAt ? new Date(data.lastContactedAt) : null;
    }
    if (data.nextFollowUpAt !== undefined) {
      valuesToUpdate.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }
    if (data.siteVisitId !== undefined) valuesToUpdate.siteVisitId = data.siteVisitId;
    if (data.requestSiteVisit !== undefined) valuesToUpdate.requestSiteVisit = data.requestSiteVisit;
    if (data.metadata !== undefined) {
      valuesToUpdate.metadata = data.metadata ? JSON.stringify(data.metadata) : null;
    }

    return await runWithPersistenceGuard('Enquiry', async () => {
      const [updatedRow] = await db
        .update(enquiries)
        .set(valuesToUpdate)
        .where(eq(enquiries.id, id))
        .returning();

      if (!updatedRow) return null;
      return this.mapRowToEntity(updatedRow);
    });
  }

  async rotateContinuationTokenAtomic(
    id: string,
    evaluator: (locked: EnquiryEntity) => { eligible: boolean; nextMetadata?: Record<string, any> }
  ): Promise<{ updated: EnquiryEntity | null; rotated: boolean }> {
    const db = await this.requireDb();

    return await runWithPersistenceGuard('Enquiry', async () => {
      return await db.transaction(async (tx: any) => {
        const baseQuery = tx.select().from(enquiries).where(eq(enquiries.id, id)).limit(1);
        const rows =
          typeof (baseQuery as any)?.for === 'function'
            ? await (baseQuery as any).for('update')
            : await baseQuery;
        if (!rows || rows.length === 0) {
          return { updated: null, rotated: false };
        }

        const lockedEntity = this.mapRowToEntity(rows[0]);
        const decision = evaluator(lockedEntity);
        if (!decision.eligible || !decision.nextMetadata) {
          return { updated: lockedEntity, rotated: false };
        }

        const [updatedRow] = await tx
          .update(enquiries)
          .set({
            metadata: JSON.stringify(decision.nextMetadata),
            updatedAt: new Date(),
          } as any)
          .where(eq(enquiries.id, id))
          .returning();

        if (!updatedRow) {
          return { updated: null, rotated: false };
        }
        return { updated: this.mapRowToEntity(updatedRow), rotated: true };
      });
    });
  }

  async updateBuyerRequirementsAtomic(
    id: string,
    allowedStatuses: EnquiryStatus[],
    evaluator: (locked: EnquiryEntity) => AtomicRequirementsUpdatePayload
  ): Promise<AtomicRequirementsUpdateResult> {
    const db = await this.requireDb();

    return await runWithPersistenceGuard('Enquiry', async () => {
      return await db.transaction(async (tx: any) => {
        const baseQuery = tx.select().from(enquiries).where(eq(enquiries.id, id)).limit(1);
        const rows =
          typeof (baseQuery as any)?.for === 'function'
            ? await (baseQuery as any).for('update')
            : await baseQuery;
        if (!rows || rows.length === 0) {
          return { outcome: 'NOT_FOUND' as const };
        }

        const lockedEntity = this.mapRowToEntity(rows[0]);
        if (!allowedStatuses.includes(lockedEntity.status)) {
          return { outcome: 'STATE_LOCKED' as const, currentStatus: lockedEntity.status };
        }

        const patch = evaluator(lockedEntity);
        const valuesToUpdate: Record<string, any> = {
          metadata: JSON.stringify(patch.metadata),
          updatedAt: new Date(),
        };
        if (patch.configuration !== undefined) valuesToUpdate.configuration = patch.configuration;
        if (patch.propertyType !== undefined) valuesToUpdate.propertyType = patch.propertyType;
        if (patch.message !== undefined) valuesToUpdate.message = patch.message;
        if (patch.requestSiteVisit !== undefined) valuesToUpdate.requestSiteVisit = patch.requestSiteVisit;

        const [updatedRow] = await tx
          .update(enquiries)
          .set(valuesToUpdate)
          .where(and(eq(enquiries.id, id), inArray(enquiries.status, allowedStatuses)))
          .returning();

        if (!updatedRow) {
          return { outcome: 'STATE_LOCKED' as const, currentStatus: lockedEntity.status };
        }

        return { outcome: 'UPDATED' as const, enquiry: this.mapRowToEntity(updatedRow) };
      });
    });
  }

  async delete(id: string): Promise<boolean> {
    const db = await this.requireDb();
    return await runWithPersistenceGuard('Enquiry', async () => {
      const res = await db.delete(enquiries).where(eq(enquiries.id, id)).returning();
      return res.length > 0;
    });
  }

  async list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    const db = await this.requireDb();
    return await runWithPersistenceGuard('Enquiry', async () => {

    const conditions = [];

    if (filter?.customerId) {
      conditions.push(eq(enquiries.customerId, filter.customerId));
    }

    if (filter?.visitorId) {
      conditions.push(eq(enquiries.visitorId, filter.visitorId));
    }

    if (filter?.buyerPhone) {
      const digits = filter.buyerPhone.replace(/\D/g, '').slice(-10);
      if (digits.length === 10) {
        conditions.push(
          sql`right(regexp_replace(coalesce(${enquiries.buyerPhone}, ''), '\\D', '', 'g'), 10) = ${digits}`
        );
      }
    }

    if (filter?.search) {
      const searchPattern = `%${filter.search.trim()}%`;
      conditions.push(
        or(
          ilike(enquiries.buyerName, searchPattern),
          ilike(enquiries.buyerPhone, searchPattern),
          ilike(enquiries.buyerEmail, searchPattern),
          ilike(enquiries.projectName, searchPattern),
          ilike(enquiries.listingTitle, searchPattern),
          ilike(enquiries.configuration, searchPattern),
          ilike(enquiries.locationName, searchPattern)
        )
      );
    }

    if (filter?.status && filter.status !== 'ALL') {
      const targetStatus = filter.status.toUpperCase();
      if (targetStatus === 'NEW' || targetStatus === 'RECEIVED') {
        conditions.push(or(eq(enquiries.status, 'NEW'), eq(enquiries.status, 'RECEIVED')));
      } else if (targetStatus === 'QUALIFIED' || targetStatus === 'IN_REVIEW') {
        conditions.push(or(eq(enquiries.status, 'QUALIFIED'), eq(enquiries.status, 'IN_REVIEW')));
      } else {
        conditions.push(eq(enquiries.status, targetStatus));
      }
    }

    if (filter?.priority && filter.priority !== 'ALL') {
      conditions.push(eq(enquiries.priority, filter.priority.toUpperCase()));
    }

    if (filter?.contextType && filter.contextType !== 'ALL') {
      conditions.push(eq(enquiries.contextType, filter.contextType.toUpperCase()));
    }

    if (filter?.assignedTo && filter.assignedTo !== 'ALL') {
      if (filter.assignedTo === 'UNASSIGNED') {
        conditions.push(sql`${enquiries.assignedTo} IS NULL`);
      } else if (filter.assignedTo === 'ASSIGNED') {
        conditions.push(sql`${enquiries.assignedTo} IS NOT NULL`);
      } else {
        conditions.push(
          or(
            eq(enquiries.assignedTo, filter.assignedTo),
            eq(enquiries.assignedToName, filter.assignedTo)
          )
        );
      }
    }

    if (filter?.dateRange && filter.dateRange !== 'ALL') {
      const now = new Date();
      if (filter.dateRange === 'TODAY') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        conditions.push(gte(enquiries.createdAt, startOfDay));
      } else if (filter.dateRange === '7_DAYS') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        conditions.push(gte(enquiries.createdAt, sevenDaysAgo));
      } else if (filter.dateRange === '30_DAYS') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        conditions.push(gte(enquiries.createdAt, thirtyDaysAgo));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count query
    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(enquiries)
      .where(whereClause);

    const total = countResult?.count || 0;

    // Build sorting
    const sortBy = filter?.sortBy || 'createdAt';
    const isAsc = filter?.sortOrder === 'asc';

    let orderExpr;
    if (sortBy === 'priority') {
      orderExpr = isAsc
        ? sql`CASE ${enquiries.priority} WHEN 'LOW' THEN 1 WHEN 'NORMAL' THEN 2 WHEN 'HIGH' THEN 3 WHEN 'URGENT' THEN 4 ELSE 2 END ASC`
        : sql`CASE ${enquiries.priority} WHEN 'URGENT' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'NORMAL' THEN 2 WHEN 'LOW' THEN 1 ELSE 2 END DESC`;
    } else if (sortBy === 'updatedAt') {
      orderExpr = isAsc ? asc(enquiries.updatedAt) : desc(enquiries.updatedAt);
    } else if (sortBy === 'nextFollowUpAt') {
      orderExpr = isAsc ? asc(enquiries.nextFollowUpAt) : desc(enquiries.nextFollowUpAt);
    } else if (sortBy === 'status') {
      orderExpr = isAsc ? asc(enquiries.status) : desc(enquiries.status);
    } else {
      orderExpr = isAsc ? asc(enquiries.createdAt) : desc(enquiries.createdAt);
    }

    const page = Math.max(1, filter?.page || 1);
    const limit = Math.max(1, filter?.limit || 20);
    const offset = (page - 1) * limit;

    const rows = await db
      .select()
      .from(enquiries)
      .where(whereClause)
      .orderBy(orderExpr, desc(enquiries.id))
      .limit(limit)
      .offset(offset);

      return {
        items: rows.map(r => this.mapRowToEntity(r)),
        total,
      };
    });
  }

  async getMetrics(): Promise<AdminEnquiryMetricsDto> {
    const db = await this.requireDb();

    return await runWithPersistenceGuard('Enquiry', async () => {
      const [res] = await db
        .select({
          total: sql<number>`count(*)::int`,
          newCount: sql<number>`count(CASE WHEN ${enquiries.status} IN ('NEW', 'RECEIVED') THEN 1 END)::int`,
          contactedCount: sql<number>`count(CASE WHEN ${enquiries.status} = 'CONTACTED' THEN 1 END)::int`,
          qualifiedCount: sql<number>`count(CASE WHEN ${enquiries.status} IN ('QUALIFIED', 'IN_REVIEW') THEN 1 END)::int`,
          siteVisitsCount: sql<number>`count(CASE WHEN ${enquiries.status} IN ('SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED') OR ${enquiries.siteVisitId} IS NOT NULL THEN 1 END)::int`,
          siteVisitInterestCount: sql<number>`count(CASE WHEN ${enquiries.requestSiteVisit} = true AND ${enquiries.siteVisitId} IS NULL AND ${enquiries.status} NOT IN ('SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED') THEN 1 END)::int`,
          convertedCount: sql<number>`count(CASE WHEN ${enquiries.status} = 'CONVERTED' THEN 1 END)::int`,
          lostCount: sql<number>`count(CASE WHEN ${enquiries.status} = 'LOST' THEN 1 END)::int`,
          closedCount: sql<number>`count(CASE WHEN ${enquiries.status} = 'CLOSED' THEN 1 END)::int`,
          urgentCount: sql<number>`count(CASE WHEN ${enquiries.priority} = 'URGENT' THEN 1 END)::int`,
        })
        .from(enquiries);

      return {
        total: res?.total || 0,
        newCount: res?.newCount || 0,
        contactedCount: res?.contactedCount || 0,
        qualifiedCount: res?.qualifiedCount || 0,
        siteVisitsCount: res?.siteVisitsCount || 0,
        siteVisitInterestCount: res?.siteVisitInterestCount || 0,
        convertedCount: res?.convertedCount || 0,
        lostCount: res?.lostCount || 0,
        closedCount: res?.closedCount || 0,
        urgentCount: res?.urgentCount || 0,
      };
    });
  }

  private mapRowToEntity(row: any): EnquiryEntity {
    let parsedMetadata: Record<string, any> | undefined = undefined;
    if (row.metadata) {
      try {
        parsedMetadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch {
        parsedMetadata = undefined;
      }
    }

    return {
      id: row.id,
      contextType: row.contextType as any,
      customerId: row.customerId ?? parsedMetadata?.customerId ?? null,
      visitorId: row.visitorId ?? parsedMetadata?.visitorId ?? null,
      sessionId: row.sessionId ?? parsedMetadata?.sessionId ?? null,
      projectId: row.projectId ?? undefined,
      projectSlug: row.projectSlug ?? undefined,
      projectName: row.projectName ?? undefined,
      configurationId: row.configurationId ?? undefined,
      listingId: row.listingId ?? undefined,
      listingSlug: row.listingSlug ?? undefined,
      listingTitle: row.listingTitle ?? undefined,
      configuration: row.configuration ?? undefined,
      propertyType: row.propertyType ?? undefined,
      priceDisplay: row.priceDisplay ?? undefined,
      locationName: row.locationName ?? undefined,
      buyerName: row.buyerName,
      buyerPhone: row.buyerPhone,
      buyerEmail: row.buyerEmail ?? undefined,
      preferredContact: row.preferredContact as any,
      requestSiteVisit: row.requestSiteVisit,
      message: row.message ?? undefined,
      status: row.status as EnquiryStatus,
      priority: (row.priority as EnquiryPriority) || 'NORMAL',
      assignedTo: row.assignedTo ?? undefined,
      assignedToName: row.assignedToName ?? undefined,
      source: row.source ?? undefined,
      sourcePage: row.sourcePage ?? undefined,
      internalNotes: row.internalNotes ?? undefined,
      lastContactedAt: row.lastContactedAt ? new Date(row.lastContactedAt) : undefined,
      nextFollowUpAt: row.nextFollowUpAt ? new Date(row.nextFollowUpAt) : undefined,
      siteVisitId: row.siteVisitId ?? undefined,
      idempotencyKey: row.idempotencyKey ?? null,
      metadata: parsedMetadata,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
