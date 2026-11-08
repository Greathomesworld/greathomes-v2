import { eq, desc, asc, and, or, sql, gte, lte, ilike } from 'drizzle-orm';
import { getDbReady } from '@/src/db/client';
import { enquiries } from '@/src/db/schema';
import { EnquiryEntity, EnquiryPriority, EnquiryStatus } from '@/src/domain/enquiry/entities/enquiryEntity';
import { EnquiryRepository } from '@/src/domain/enquiry/repositories/enquiryRepository';
import { AdminEnquiryFilterDto, AdminEnquiryMetricsDto } from '@/src/domain/enquiry/dto/enquiryDto';

export class EnquiryRepositoryPostgres implements EnquiryRepository {
  async create(data: Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'priority'> & Partial<Pick<EnquiryEntity, 'status' | 'priority'>>): Promise<EnquiryEntity> {
    const db = await getDbReady();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const id = `enq_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const [row] = await db
      .insert(enquiries)
      .values({
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
        status: data.status || 'NEW',
        priority: data.priority || 'NORMAL',
        assignedTo: data.assignedTo,
        assignedToName: data.assignedToName,
        source: data.source,
        sourcePage: data.sourcePage,
        internalNotes: data.internalNotes,
        lastContactedAt: data.lastContactedAt ? new Date(data.lastContactedAt) : undefined,
        nextFollowUpAt: data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : undefined,
        siteVisitId: data.siteVisitId,
        metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
      } as any)
      .returning();

    return this.mapRowToEntity(row);
  }

  async findById(id: string): Promise<EnquiryEntity | null> {
    const db = await getDbReady();
    if (!db) return null;

    const rows = await db.select().from(enquiries).where(eq(enquiries.id, id));
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async update(id: string, data: Partial<Omit<EnquiryEntity, 'id' | 'createdAt' | 'updatedAt'>>): Promise<EnquiryEntity | null> {
    const db = await getDbReady();
    if (!db) return null;

    const valuesToUpdate: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.status !== undefined) valuesToUpdate.status = data.status;
    if (data.priority !== undefined) valuesToUpdate.priority = data.priority;
    if (data.customerId !== undefined) valuesToUpdate.customerId = data.customerId;
    if (data.visitorId !== undefined) valuesToUpdate.visitorId = data.visitorId;
    if (data.sessionId !== undefined) valuesToUpdate.sessionId = data.sessionId;
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

    const [updatedRow] = await db
      .update(enquiries)
      .set(valuesToUpdate)
      .where(eq(enquiries.id, id))
      .returning();

    if (!updatedRow) return null;
    return this.mapRowToEntity(updatedRow);
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;

    const res = await db.delete(enquiries).where(eq(enquiries.id, id)).returning();
    return res.length > 0;
  }

  async list(filter?: AdminEnquiryFilterDto): Promise<{ items: EnquiryEntity[]; total: number }> {
    const db = await getDbReady();
    if (!db) return { items: [], total: 0 };

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
      if (targetStatus === 'NEW') {
        conditions.push(or(eq(enquiries.status, 'NEW'), eq(enquiries.status, 'RECEIVED')));
      } else if (targetStatus === 'QUALIFIED') {
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
  }

  async getMetrics(): Promise<AdminEnquiryMetricsDto> {
    const db = await getDbReady();
    if (!db) {
      return {
        total: 0,
        newCount: 0,
        contactedCount: 0,
        qualifiedCount: 0,
        siteVisitsCount: 0,
        convertedCount: 0,
        lostCount: 0,
        closedCount: 0,
        urgentCount: 0,
      };
    }

    const [res] = await db
      .select({
        total: sql<number>`count(*)::int`,
        newCount: sql<number>`count(CASE WHEN ${enquiries.status} IN ('NEW', 'RECEIVED') THEN 1 END)::int`,
        contactedCount: sql<number>`count(CASE WHEN ${enquiries.status} = 'CONTACTED' THEN 1 END)::int`,
        qualifiedCount: sql<number>`count(CASE WHEN ${enquiries.status} IN ('QUALIFIED', 'IN_REVIEW') THEN 1 END)::int`,
        siteVisitsCount: sql<number>`count(CASE WHEN ${enquiries.status} IN ('SITE_VISIT_SCHEDULED', 'SITE_VISIT_COMPLETED') OR ${enquiries.requestSiteVisit} = true THEN 1 END)::int`,
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
      convertedCount: res?.convertedCount || 0,
      lostCount: res?.lostCount || 0,
      closedCount: res?.closedCount || 0,
      urgentCount: res?.urgentCount || 0,
    };
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
      metadata: parsedMetadata,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
