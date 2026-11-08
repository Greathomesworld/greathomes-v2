import { eq, and, desc, sql } from 'drizzle-orm';
import { getDbReady } from '../../../db/client.ts';
import {
  customers,
  savedItems,
  recentlyViewed,
  customerPreferences,
  projectWatchlists,
  locationWatchlists,
  notifications,
} from '../../../db/schema.ts';
import {
  Customer,
  SavedItem,
  SavedItemResourceType,
  RecentlyViewed,
  CustomerPreferences,
  ProjectWatch,
  LocationWatch,
  Notification,
} from '../../../domain/customer/entities.ts';
import {
  CustomerRepository,
  CustomerListFilter,
  SavedItemRepository,
  RecentlyViewedRepository,
  CustomerPreferenceRepository,
  ProjectWatchRepository,
  LocationWatchRepository,
  NotificationRepository,
} from '../../../domain/customer/repositories/customerRepository.ts';

export class CustomerRepositoryPostgres implements CustomerRepository {
  async findById(id: string): Promise<Customer | null> {
    const db = await getDbReady();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);

    if (!row) return null;
    return this.mapCustomer(row);
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const db = await getDbReady();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(customers)
      .where(eq(sql`LOWER(${customers.email})`, email.toLowerCase().trim()))
      .limit(1);

    if (!row) return null;
    return this.mapCustomer(row);
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const db = await getDbReady();
    if (!db) return null;

    const digits = phone.replace(/\D/g, '');
    const right10 = digits.length >= 10 ? digits.slice(-10) : digits;
    if (!right10) return null;

    const [row] = await db
      .select()
      .from(customers)
      .where(sql`right(regexp_replace(coalesce(${customers.phone}, ''), '\\D', '', 'g'), 10) = ${right10}`)
      .limit(1);

    if (!row) return null;
    return this.mapCustomer(row);
  }

  async list(filter?: CustomerListFilter): Promise<{ items: Customer[]; total: number }> {
    const db = await getDbReady();
    if (!db) return { items: [], total: 0 };

    const conditions = [];
    if (filter?.status && filter.status !== 'ALL') {
      conditions.push(eq(customers.status, filter.status as any));
    }

    if (filter?.search && filter.search.trim()) {
      const q = `%${filter.search.trim().toLowerCase()}%`;
      if (filter.allowPiiSearch === false) {
        conditions.push(sql`LOWER(${customers.id}) LIKE ${q}`);
      } else {
        conditions.push(
          sql`(LOWER(coalesce(${customers.name}, '')) LIKE ${q} OR LOWER(coalesce(${customers.email}, '')) LIKE ${q} OR LOWER(coalesce(${customers.phone}, '')) LIKE ${q} OR LOWER(${customers.id}) LIKE ${q})`
        );
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(customers)
      .where(whereClause);

    const limit = Math.max(1, filter?.limit || 50);
    const offset = Math.max(0, filter?.offset || 0);

    const rows = await db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(desc(sql`coalesce(${customers.lastLoginAt}, ${customers.createdAt})`))
      .limit(limit)
      .offset(offset);

    return {
      items: rows.map((r) => this.mapCustomer(r)),
      total: Number(countRow?.count || 0),
    };
  }

  async create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Customer> {
    const db = await getDbReady();
    if (!db) throw new Error('Database instance unavailable');

    const id = data.id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    const [inserted] = await db
      .insert(customers)
      .values({
        id,
        email: data.email ? data.email.toLowerCase().trim() : null,
        phone: data.phone || null,
        name: data.name,
        passwordHash: data.passwordHash || null,
        avatarUrl: data.avatarUrl || null,
        status: data.status || 'ACTIVE',
        emailVerifiedAt: data.emailVerifiedAt || null,
        phoneVerifiedAt: data.phoneVerifiedAt || null,
        lastLoginAt: data.lastLoginAt || null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    return this.mapCustomer(inserted);
  }

  async update(id: string, data: Partial<Customer>): Promise<Customer | null> {
    const db = await getDbReady();
    if (!db) return null;

    const updateData: any = {
      updatedAt: new Date(),
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email ? data.email.toLowerCase().trim() : null;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
    if (data.passwordHash !== undefined) updateData.passwordHash = data.passwordHash;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.emailVerifiedAt !== undefined) updateData.emailVerifiedAt = data.emailVerifiedAt;
    if (data.phoneVerifiedAt !== undefined) updateData.phoneVerifiedAt = data.phoneVerifiedAt;
    if (data.lastLoginAt !== undefined) updateData.lastLoginAt = data.lastLoginAt;

    const [updated] = await db
      .update(customers)
      .set(updateData)
      .where(eq(customers.id, id))
      .returning();

    return updated ? this.mapCustomer(updated) : null;
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;

    const res = await db.delete(customers).where(eq(customers.id, id)).returning();
    return res.length > 0;
  }

  private mapCustomer(row: any): Customer {
    return {
      id: row.id,
      email: row.email,
      phone: row.phone,
      name: row.name,
      passwordHash: row.passwordHash,
      avatarUrl: row.avatarUrl,
      status: row.status,
      emailVerifiedAt: row.emailVerifiedAt ? new Date(row.emailVerifiedAt) : null,
      phoneVerifiedAt: row.phoneVerifiedAt ? new Date(row.phoneVerifiedAt) : null,
      lastLoginAt: row.lastLoginAt ? new Date(row.lastLoginAt) : null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export class SavedItemRepositoryPostgres implements SavedItemRepository {
  async findById(id: string): Promise<SavedItem | null> {
    const db = await getDbReady();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(savedItems)
      .where(eq(savedItems.id, id))
      .limit(1);

    return row ? this.mapSavedItem(row) : null;
  }

  async findByCustomerAndResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<SavedItem | null> {
    const db = await getDbReady();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(savedItems)
      .where(
        and(
          eq(savedItems.customerId, customerId),
          eq(savedItems.resourceType, resourceType),
          eq(savedItems.resourceId, resourceId)
        )
      )
      .limit(1);

    return row ? this.mapSavedItem(row) : null;
  }

  async listByCustomer(
    customerId: string,
    resourceType?: SavedItemResourceType
  ): Promise<SavedItem[]> {
    const db = await getDbReady();
    if (!db) return [];

    const conditions = [eq(savedItems.customerId, customerId)];
    if (resourceType) {
      conditions.push(eq(savedItems.resourceType, resourceType));
    }

    const rows = await db
      .select()
      .from(savedItems)
      .where(and(...conditions))
      .orderBy(desc(savedItems.createdAt));

    return rows.map((r) => this.mapSavedItem(r));
  }

  async create(data: Omit<SavedItem, 'id' | 'createdAt'> & { id?: string }): Promise<SavedItem> {
    const db = await getDbReady();
    if (!db) throw new Error('Database instance unavailable');

    const existing = await this.findByCustomerAndResource(
      data.customerId,
      data.resourceType,
      data.resourceId
    );
    if (existing) return existing;

    const id = data.id || `saved_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();

    const [inserted] = await db
      .insert(savedItems)
      .values({
        id,
        customerId: data.customerId,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        createdAt: now,
      } as any)
      .onConflictDoNothing()
      .returning();

    if (!inserted) {
      const row = await this.findByCustomerAndResource(
        data.customerId,
        data.resourceType,
        data.resourceId
      );
      if (row) return row;
    }

    return this.mapSavedItem(inserted);
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;

    const res = await db
      .delete(savedItems)
      .where(and(eq(savedItems.id, id), eq(savedItems.customerId, customerId)))
      .returning();

    return res.length > 0;
  }

  async deleteByResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;

    const res = await db
      .delete(savedItems)
      .where(
        and(
          eq(savedItems.customerId, customerId),
          eq(savedItems.resourceType, resourceType),
          eq(savedItems.resourceId, resourceId)
        )
      )
      .returning();

    return res.length > 0;
  }

  async isSaved(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean> {
    const row = await this.findByCustomerAndResource(customerId, resourceType, resourceId);
    return Boolean(row);
  }

  private mapSavedItem(row: any): SavedItem {
    return {
      id: row.id,
      customerId: row.customerId,
      resourceType: row.resourceType as SavedItemResourceType,
      resourceId: row.resourceId,
      createdAt: new Date(row.createdAt),
    };
  }
}

export class RecentlyViewedRepositoryPostgres implements RecentlyViewedRepository {
  async findByCustomerAndResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewed | null> {
    const db = await getDbReady();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(recentlyViewed)
      .where(
        and(
          eq(recentlyViewed.customerId, customerId),
          eq(recentlyViewed.resourceType, resourceType),
          eq(recentlyViewed.resourceId, resourceId)
        )
      )
      .limit(1);

    return row ? this.mapRecentlyViewed(row) : null;
  }

  async listByCustomer(customerId: string, limit: number = 20): Promise<RecentlyViewed[]> {
    const db = await getDbReady();
    if (!db) return [];

    const rows = await db
      .select()
      .from(recentlyViewed)
      .where(eq(recentlyViewed.customerId, customerId))
      .orderBy(desc(recentlyViewed.lastViewedAt))
      .limit(limit);

    return rows.map((r) => this.mapRecentlyViewed(r));
  }

  async recordView(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewed> {
    const db = await getDbReady();
    if (!db) throw new Error('Database instance unavailable');

    const existing = await this.findByCustomerAndResource(customerId, resourceType, resourceId);
    const now = new Date();

    if (existing) {
      const [updated] = await db
        .update(recentlyViewed)
        .set({
          lastViewedAt: now,
          viewCount: existing.viewCount + 1,
        } as any)
        .where(eq(recentlyViewed.id, existing.id))
        .returning();

      await this.pruneOldest(customerId, 20);
      return this.mapRecentlyViewed(updated);
    }

    const id = `view_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const [inserted] = await db
      .insert(recentlyViewed)
      .values({
        id,
        customerId,
        resourceType,
        resourceId,
        firstViewedAt: now,
        lastViewedAt: now,
        viewCount: 1,
      } as any)
      .returning();

    await this.pruneOldest(customerId, 20);
    return this.mapRecentlyViewed(inserted);
  }

  async clear(customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;

    const res = await db
      .delete(recentlyViewed)
      .where(eq(recentlyViewed.customerId, customerId))
      .returning();

    return res.length > 0;
  }

  async pruneOldest(customerId: string, maxItems: number = 20): Promise<void> {
    const db = await getDbReady();
    if (!db) return;

    const all = await db
      .select({ id: recentlyViewed.id })
      .from(recentlyViewed)
      .where(eq(recentlyViewed.customerId, customerId))
      .orderBy(desc(recentlyViewed.lastViewedAt));

    if (all.length > maxItems) {
      const toDelete = all.slice(maxItems).map((r) => r.id);
      for (const id of toDelete) {
        await db.delete(recentlyViewed).where(eq(recentlyViewed.id, id));
      }
    }
  }

  private mapRecentlyViewed(row: any): RecentlyViewed {
    return {
      id: row.id,
      customerId: row.customerId,
      resourceType: row.resourceType as SavedItemResourceType,
      resourceId: row.resourceId,
      firstViewedAt: new Date(row.firstViewedAt),
      lastViewedAt: new Date(row.lastViewedAt),
      viewCount: row.viewCount,
    };
  }
}

export class CustomerPreferenceRepositoryPostgres implements CustomerPreferenceRepository {
  async findByCustomerId(customerId: string): Promise<CustomerPreferences | null> {
    const db = await getDbReady();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(customerPreferences)
      .where(eq(customerPreferences.customerId, customerId))
      .limit(1);

    return row ? this.mapPreferences(row) : null;
  }

  async upsert(
    customerId: string,
    data: Partial<CustomerPreferences>
  ): Promise<CustomerPreferences> {
    const db = await getDbReady();
    if (!db) throw new Error('Database instance unavailable');

    const existing = await this.findByCustomerId(customerId);
    const now = new Date();

    if (existing) {
      const updateData: any = { updatedAt: now };
      if (data.preferredMode !== undefined) updateData.preferredMode = data.preferredMode;
      if (data.preferredLocations !== undefined) updateData.preferredLocations = data.preferredLocations;
      if (data.preferredBhk !== undefined) updateData.preferredBhk = data.preferredBhk;
      if (data.preferredPropertyTypes !== undefined) updateData.preferredPropertyTypes = data.preferredPropertyTypes;
      if (data.budgetMin !== undefined) updateData.budgetMin = data.budgetMin;
      if (data.budgetMax !== undefined) updateData.budgetMax = data.budgetMax;
      if (data.emailAlertsEnabled !== undefined) updateData.emailAlertsEnabled = data.emailAlertsEnabled;
      if (data.inAppAlertsEnabled !== undefined) updateData.inAppAlertsEnabled = data.inAppAlertsEnabled;
      if (data.newLaunchAlerts !== undefined) updateData.newLaunchAlerts = data.newLaunchAlerts;
      if (data.priceDropAlerts !== undefined) updateData.priceDropAlerts = data.priceDropAlerts;
      if (data.projectStatusAlerts !== undefined) updateData.projectStatusAlerts = data.projectStatusAlerts;
      if (data.reraAlerts !== undefined) updateData.reraAlerts = data.reraAlerts;
      if (data.priceChangeAlerts !== undefined) updateData.priceChangeAlerts = data.priceChangeAlerts;
      if (data.configurationAlerts !== undefined) updateData.configurationAlerts = data.configurationAlerts;
      if (data.locationAlerts !== undefined) updateData.locationAlerts = data.locationAlerts;
      if (data.resaleAlerts !== undefined) updateData.resaleAlerts = data.resaleAlerts;
      if (data.rentalAlerts !== undefined) updateData.rentalAlerts = data.rentalAlerts;
      if (data.marketingEmailsEnabled !== undefined) updateData.marketingEmailsEnabled = data.marketingEmailsEnabled;

      const [updated] = await db
        .update(customerPreferences)
        .set(updateData)
        .where(eq(customerPreferences.customerId, customerId))
        .returning();

      return this.mapPreferences(updated);
    }

    const id = `pref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const [inserted] = await db
      .insert(customerPreferences)
      .values({
        id,
        customerId,
        preferredMode: data.preferredMode || 'ALL',
        preferredLocations: data.preferredLocations || [],
        preferredBhk: data.preferredBhk || [],
        preferredPropertyTypes: data.preferredPropertyTypes || [],
        budgetMin: data.budgetMin !== undefined ? data.budgetMin : null,
        budgetMax: data.budgetMax !== undefined ? data.budgetMax : null,
        emailAlertsEnabled: data.emailAlertsEnabled !== undefined ? data.emailAlertsEnabled : true,
        inAppAlertsEnabled: data.inAppAlertsEnabled !== undefined ? data.inAppAlertsEnabled : true,
        newLaunchAlerts: data.newLaunchAlerts !== undefined ? data.newLaunchAlerts : true,
        priceDropAlerts: data.priceDropAlerts !== undefined ? data.priceDropAlerts : true,
        projectStatusAlerts: data.projectStatusAlerts !== undefined ? data.projectStatusAlerts : true,
        reraAlerts: data.reraAlerts !== undefined ? data.reraAlerts : true,
        priceChangeAlerts: data.priceChangeAlerts !== undefined ? data.priceChangeAlerts : true,
        configurationAlerts: data.configurationAlerts !== undefined ? data.configurationAlerts : true,
        locationAlerts: data.locationAlerts !== undefined ? data.locationAlerts : true,
        resaleAlerts: data.resaleAlerts !== undefined ? data.resaleAlerts : true,
        rentalAlerts: data.rentalAlerts !== undefined ? data.rentalAlerts : true,
        marketingEmailsEnabled: data.marketingEmailsEnabled !== undefined ? data.marketingEmailsEnabled : false,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    return this.mapPreferences(inserted);
  }

  private mapPreferences(row: any): CustomerPreferences {
    return {
      id: row.id,
      customerId: row.customerId,
      preferredMode: (row.preferredMode as any) || 'ALL',
      preferredLocations: Array.isArray(row.preferredLocations) ? row.preferredLocations : [],
      preferredBhk: Array.isArray(row.preferredBhk) ? row.preferredBhk : [],
      preferredPropertyTypes: Array.isArray(row.preferredPropertyTypes) ? row.preferredPropertyTypes : [],
      budgetMin: row.budgetMin ?? null,
      budgetMax: row.budgetMax ?? null,
      emailAlertsEnabled: row.emailAlertsEnabled ?? true,
      inAppAlertsEnabled: row.inAppAlertsEnabled ?? true,
      newLaunchAlerts: row.newLaunchAlerts ?? true,
      priceDropAlerts: row.priceDropAlerts ?? true,
      projectStatusAlerts: row.projectStatusAlerts ?? true,
      reraAlerts: row.reraAlerts ?? true,
      priceChangeAlerts: row.priceChangeAlerts ?? true,
      configurationAlerts: row.configurationAlerts ?? true,
      locationAlerts: row.locationAlerts ?? true,
      resaleAlerts: row.resaleAlerts ?? true,
      rentalAlerts: row.rentalAlerts ?? true,
      marketingEmailsEnabled: row.marketingEmailsEnabled ?? false,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export class ProjectWatchRepositoryPostgres implements ProjectWatchRepository {
  async findById(id: string): Promise<ProjectWatch | null> {
    const db = await getDbReady();
    if (!db) return null;
    const [row] = await db.select().from(projectWatchlists).where(eq(projectWatchlists.id, id)).limit(1);
    return row ? this.mapWatch(row) : null;
  }

  async findByCustomerAndProject(customerId: string, projectId: string): Promise<ProjectWatch | null> {
    const db = await getDbReady();
    if (!db) return null;
    const [row] = await db.select().from(projectWatchlists).where(
      and(
        eq(projectWatchlists.customerId, customerId),
        eq(projectWatchlists.projectId, projectId)
      )
    ).limit(1);
    return row ? this.mapWatch(row) : null;
  }

  async listByCustomer(customerId: string): Promise<ProjectWatch[]> {
    const db = await getDbReady();
    if (!db) return [];
    const rows = await db.select().from(projectWatchlists).where(eq(projectWatchlists.customerId, customerId));
    return rows.map(r => this.mapWatch(r));
  }

  async listByProject(projectId: string): Promise<ProjectWatch[]> {
    const db = await getDbReady();
    if (!db) return [];
    const rows = await db.select().from(projectWatchlists).where(
      and(
        eq(projectWatchlists.projectId, projectId),
        eq(projectWatchlists.enabled, true)
      )
    );
    return rows.map(r => this.mapWatch(r));
  }

  async create(data: Omit<ProjectWatch, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { id?: string; enabled?: boolean }): Promise<ProjectWatch> {
    const db = await getDbReady();
    if (!db) throw new Error('Database unavailable');
    const id = data.id || `pwtch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const [inserted] = await db.insert(projectWatchlists).values({
      id,
      customerId: data.customerId,
      projectId: data.projectId,
      enabled: data.enabled !== undefined ? data.enabled : true,
      createdAt: now,
      updatedAt: now,
      lastEvaluatedAt: null,
      lastAlertedAt: null,
    } as any).returning();
    return this.mapWatch(inserted);
  }

  async update(id: string, customerId: string, data: Partial<ProjectWatch>): Promise<ProjectWatch | null> {
    const db = await getDbReady();
    if (!db) return null;
    const updateData: any = { updatedAt: new Date() };
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.lastEvaluatedAt !== undefined) updateData.lastEvaluatedAt = data.lastEvaluatedAt;
    if (data.lastAlertedAt !== undefined) updateData.lastAlertedAt = data.lastAlertedAt;

    const [updated] = await db.update(projectWatchlists).set(updateData).where(
      and(
        eq(projectWatchlists.id, id),
        eq(projectWatchlists.customerId, customerId)
      )
    ).returning();
    return updated ? this.mapWatch(updated) : null;
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;
    const res = await db.delete(projectWatchlists).where(
      and(
        eq(projectWatchlists.id, id),
        eq(projectWatchlists.customerId, customerId)
      )
    ).returning();
    return res.length > 0;
  }

  async isWatched(customerId: string, projectId: string): Promise<boolean> {
    const watch = await this.findByCustomerAndProject(customerId, projectId);
    return watch ? watch.enabled : false;
  }

  private mapWatch(row: any): ProjectWatch {
    return {
      id: row.id,
      customerId: row.customerId,
      projectId: row.projectId,
      enabled: row.enabled,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastEvaluatedAt: row.lastEvaluatedAt ? new Date(row.lastEvaluatedAt) : null,
      lastAlertedAt: row.lastAlertedAt ? new Date(row.lastAlertedAt) : null,
    };
  }
}

export class LocationWatchRepositoryPostgres implements LocationWatchRepository {
  async findById(id: string): Promise<LocationWatch | null> {
    const db = await getDbReady();
    if (!db) return null;
    const [row] = await db.select().from(locationWatchlists).where(eq(locationWatchlists.id, id)).limit(1);
    return row ? this.mapWatch(row) : null;
  }

  async findByCustomerAndLocation(customerId: string, locationId: string): Promise<LocationWatch | null> {
    const db = await getDbReady();
    if (!db) return null;
    const [row] = await db.select().from(locationWatchlists).where(
      and(
        eq(locationWatchlists.customerId, customerId),
        eq(locationWatchlists.locationId, locationId)
      )
    ).limit(1);
    return row ? this.mapWatch(row) : null;
  }

  async listByCustomer(customerId: string): Promise<LocationWatch[]> {
    const db = await getDbReady();
    if (!db) return [];
    const rows = await db.select().from(locationWatchlists).where(eq(locationWatchlists.customerId, customerId));
    return rows.map(r => this.mapWatch(r));
  }

  async listByLocation(locationId: string): Promise<LocationWatch[]> {
    const db = await getDbReady();
    if (!db) return [];
    const rows = await db.select().from(locationWatchlists).where(
      and(
        eq(locationWatchlists.locationId, locationId),
        eq(locationWatchlists.enabled, true)
      )
    );
    return rows.map(r => this.mapWatch(r));
  }

  async create(data: Omit<LocationWatch, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { id?: string; enabled?: boolean }): Promise<LocationWatch> {
    const db = await getDbReady();
    if (!db) throw new Error('Database unavailable');
    const id = data.id || `lwtch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const [inserted] = await db.insert(locationWatchlists).values({
      id,
      customerId: data.customerId,
      locationId: data.locationId,
      enabled: data.enabled !== undefined ? data.enabled : true,
      createdAt: now,
      updatedAt: now,
      lastEvaluatedAt: null,
      lastAlertedAt: null,
    } as any).returning();
    return this.mapWatch(inserted);
  }

  async update(id: string, customerId: string, data: Partial<LocationWatch>): Promise<LocationWatch | null> {
    const db = await getDbReady();
    if (!db) return null;
    const updateData: any = { updatedAt: new Date() };
    if (data.enabled !== undefined) updateData.enabled = data.enabled;
    if (data.lastEvaluatedAt !== undefined) updateData.lastEvaluatedAt = data.lastEvaluatedAt;
    if (data.lastAlertedAt !== undefined) updateData.lastAlertedAt = data.lastAlertedAt;

    const [updated] = await db.update(locationWatchlists).set(updateData).where(
      and(
        eq(locationWatchlists.id, id),
        eq(locationWatchlists.customerId, customerId)
      )
    ).returning();
    return updated ? this.mapWatch(updated) : null;
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;
    const res = await db.delete(locationWatchlists).where(
      and(
        eq(locationWatchlists.id, id),
        eq(locationWatchlists.customerId, customerId)
      )
    ).returning();
    return res.length > 0;
  }

  async isWatched(customerId: string, locationId: string): Promise<boolean> {
    const watch = await this.findByCustomerAndLocation(customerId, locationId);
    return watch ? watch.enabled : false;
  }

  private mapWatch(row: any): LocationWatch {
    return {
      id: row.id,
      customerId: row.customerId,
      locationId: row.locationId,
      enabled: row.enabled,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      lastEvaluatedAt: row.lastEvaluatedAt ? new Date(row.lastEvaluatedAt) : null,
      lastAlertedAt: row.lastAlertedAt ? new Date(row.lastAlertedAt) : null,
    };
  }
}

export class NotificationRepositoryPostgres implements NotificationRepository {
  async findById(id: string): Promise<Notification | null> {
    const db = await getDbReady();
    if (!db) return null;
    const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
    return row ? this.mapNotification(row) : null;
  }

  async listByCustomer(customerId: string, options?: { limit?: number; offset?: number; isRead?: boolean }): Promise<Notification[]> {
    const db = await getDbReady();
    if (!db) return [];
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    
    let whereClause: any = eq(notifications.customerId, customerId);
    if (options?.isRead !== undefined) {
      whereClause = and(
        eq(notifications.customerId, customerId),
        eq(notifications.isRead, options.isRead)
      );
    }
    
    const rows = await db.select().from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit)
      .offset(offset);
      
    return rows.map(r => this.mapNotification(r));
  }

  async getUnreadCount(customerId: string): Promise<number> {
    const db = await getDbReady();
    if (!db) return 0;
    const [res] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(
      and(
        eq(notifications.customerId, customerId),
        eq(notifications.isRead, false)
      )
    );
    return res ? Number(res.count) : 0;
  }

  async create(data: Omit<Notification, 'id' | 'createdAt' | 'isRead'> & { id?: string; isRead?: boolean }): Promise<Notification> {
    const db = await getDbReady();
    if (!db) throw new Error('Database unavailable');
    const id = data.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const [inserted] = await db.insert(notifications).values({
      id,
      customerId: data.customerId,
      type: data.type,
      title: data.title,
      message: data.message,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      projectId: data.projectId || null,
      locationId: data.locationId || null,
      savedItemId: data.savedItemId || null,
      watchId: data.watchId || null,
      metadata: data.metadata || null,
      isRead: data.isRead !== undefined ? data.isRead : false,
      readAt: null,
      createdAt: now,
      expiresAt: data.expiresAt || null,
    } as any).returning();
    return this.mapNotification(inserted);
  }

  async markAsRead(id: string, customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;
    const res = await db.update(notifications).set({
      isRead: true,
      readAt: new Date()
    } as any).where(
      and(
        eq(notifications.id, id),
        eq(notifications.customerId, customerId)
      )
    ).returning();
    return res.length > 0;
  }

  async markAllAsRead(customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;
    await db.update(notifications).set({
      isRead: true,
      readAt: new Date()
    } as any).where(
      and(
        eq(notifications.customerId, customerId),
        eq(notifications.isRead, false)
      )
    );
    return true;
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const db = await getDbReady();
    if (!db) return false;
    const res = await db.delete(notifications).where(
      and(
        eq(notifications.id, id),
        eq(notifications.customerId, customerId)
      )
    ).returning();
    return res.length > 0;
  }

  async prune(customerId: string, daysRetention: number): Promise<number> {
    const db = await getDbReady();
    if (!db) return 0;
    const cutOff = new Date(Date.now() - daysRetention * 24 * 60 * 60 * 1000);
    const res = await db.delete(notifications).where(
      and(
        eq(notifications.customerId, customerId),
        sql`${notifications.createdAt} < ${cutOff}`
      )
    ).returning();
    return res.length;
  }

  private mapNotification(row: any): Notification {
    return {
      id: row.id,
      customerId: row.customerId,
      type: row.type,
      title: row.title,
      message: row.message,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      projectId: row.projectId,
      locationId: row.locationId,
      savedItemId: row.savedItemId,
      watchId: row.watchId,
      metadata: row.metadata,
      isRead: row.isRead,
      readAt: row.readAt ? new Date(row.readAt) : null,
      createdAt: new Date(row.createdAt),
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    };
  }
}
