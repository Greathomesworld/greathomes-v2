import { getDb } from '@/src/db/client';
import { siteVisits } from '@/src/db/schema';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import { SiteVisitEntity, SiteVisitStatus, SiteVisitType } from '@/src/domain/siteVisit/entities/siteVisitEntity';
import { registerCustomerDeletionHook } from '@/src/domain/customer/repositories/inMemoryCustomerRepository';

const globalForSiteVisits = globalThis as unknown as {
  __gh_mem_site_visits?: Map<string, SiteVisitEntity>;
};

function getMemSiteVisits(): Map<string, SiteVisitEntity> {
  if (!globalForSiteVisits.__gh_mem_site_visits) {
    globalForSiteVisits.__gh_mem_site_visits = new Map<string, SiteVisitEntity>();
  }
  return globalForSiteVisits.__gh_mem_site_visits;
}

registerCustomerDeletionHook((customerId: string) => {
  const store = getMemSiteVisits();
  for (const [id, v] of store.entries()) {
    if (v.customerId === customerId) {
      store.set(id, { ...v, customerId: null });
    }
  }
});

function getActiveDb() {
  if (process.env.PERSISTENCE_PROVIDER === 'memory') return null;
  return getDb();
}

export function isMissingSiteVisitsRelationError(err: any): boolean {
  if (!err) return false;
  const code = err?.code || err?.cause?.code;
  if (code === '42P01') return true;
  const msg = String(err?.message || err?.cause?.message || '');
  return msg.includes('42P01') || (msg.includes('relation') && msg.includes('site_visits') && msg.includes('does not exist'));
}

export class SiteVisitRepositoryPostgres {
  async create(data: Omit<SiteVisitEntity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SiteVisitEntity> {
    const db = getActiveDb();
    const visitId = data.id || `sv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!db) {
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
      getMemSiteVisits().set(entity.id, entity);
      return { ...entity };
    }

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
  }

  async findById(id: string): Promise<SiteVisitEntity | null> {
    const db = getActiveDb();
    if (!db) {
      const found = getMemSiteVisits().get(id);
      return found ? { ...found } : null;
    }

    try {
      const [found] = await db.select().from(siteVisits).where(eq(siteVisits.id, id)).limit(1);
      return found ? this.mapToEntity(found) : null;
    } catch (err: any) {
      if (isMissingSiteVisitsRelationError(err)) {
        return null;
      }
      throw err;
    }
  }

  async findByEnquiryId(enquiryId: string): Promise<SiteVisitEntity | null> {
    const db = getActiveDb();
    if (!db) {
      for (const v of getMemSiteVisits().values()) {
        if (v.enquiryId === enquiryId) return { ...v };
      }
      return null;
    }

    try {
      const [found] = await db.select().from(siteVisits).where(eq(siteVisits.enquiryId, enquiryId)).limit(1);
      return found ? this.mapToEntity(found) : null;
    } catch (err: any) {
      if (isMissingSiteVisitsRelationError(err)) {
        return null;
      }
      throw err;
    }
  }

  async findByCustomerId(customerId: string): Promise<SiteVisitEntity[]> {
    const db = getActiveDb();
    if (!db) {
      const list = Array.from(getMemSiteVisits().values()).filter((v) => v.customerId === customerId);
      return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }

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
    const db = getActiveDb();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    if (!db) {
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
  }

  async update(id: string, updates: Partial<SiteVisitEntity>): Promise<SiteVisitEntity | null> {
    const db = getActiveDb();
    if (!db) {
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

    const [updated] = await db
      .update(siteVisits)
      .set({
        ...updates,
        updatedAt: new Date(),
      } as any)
      .where(eq(siteVisits.id, id))
      .returning();

    return updated ? this.mapToEntity(updated) : null;
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

export const siteVisitRepositoryPostgres = new SiteVisitRepositoryPostgres();
export const siteVisitRepository = siteVisitRepositoryPostgres;

