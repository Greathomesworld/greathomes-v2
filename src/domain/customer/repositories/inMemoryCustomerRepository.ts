import {
  Customer,
  SavedItem,
  SavedItemResourceType,
  RecentlyViewed,
  CustomerPreferences,
  ProjectWatch,
  LocationWatch,
  Notification,
} from '../entities.ts';
import {
  CustomerRepository,
  CustomerListFilter,
  SavedItemRepository,
  RecentlyViewedRepository,
  CustomerPreferenceRepository,
  ProjectWatchRepository,
  LocationWatchRepository,
  NotificationRepository,
} from './customerRepository.ts';

const globalForCustomerMem = globalThis as unknown as {
  __gh_mem_customers?: Map<string, Customer>;
  __gh_mem_saved_items?: Map<string, SavedItem>;
  __gh_mem_recently_viewed?: Map<string, RecentlyViewed>;
  __gh_mem_customer_prefs?: Map<string, CustomerPreferences>;
  __gh_mem_project_watches?: Map<string, ProjectWatch>;
  __gh_mem_location_watches?: Map<string, LocationWatch>;
  __gh_mem_notifications?: Map<string, Notification>;
  __gh_on_customer_deleted?: Array<(customerId: string) => Promise<void> | void>;
};

export function registerCustomerDeletionHook(fn: (customerId: string) => Promise<void> | void) {
  if (!globalForCustomerMem.__gh_on_customer_deleted) {
    globalForCustomerMem.__gh_on_customer_deleted = [];
  }
  globalForCustomerMem.__gh_on_customer_deleted.push(fn);
}

function normalizePhoneDigits(phone?: string | null): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private get customers(): Map<string, Customer> {
    if (!globalForCustomerMem.__gh_mem_customers) {
      globalForCustomerMem.__gh_mem_customers = new Map<string, Customer>();
    }
    return globalForCustomerMem.__gh_mem_customers;
  }

  async findById(id: string): Promise<Customer | null> {
    const c = this.customers.get(id);
    return c ? { ...c } : null;
  }

  async findByEmail(email: string): Promise<Customer | null> {
    const normalized = email.toLowerCase().trim();
    for (const c of this.customers.values()) {
      if (c.email && c.email.toLowerCase().trim() === normalized) {
        return { ...c };
      }
    }
    return null;
  }

  async findByPhone(phone: string): Promise<Customer | null> {
    const targetDigits = normalizePhoneDigits(phone);
    if (!targetDigits) return null;
    for (const c of this.customers.values()) {
      if (normalizePhoneDigits(c.phone) === targetDigits) {
        return { ...c };
      }
    }
    return null;
  }

  async list(filter?: CustomerListFilter): Promise<{ items: Customer[]; total: number }> {
    let list = Array.from(this.customers.values()).map((c) => ({ ...c }));

    if (filter?.status && filter.status !== 'ALL') {
      list = list.filter((c) => c.status === filter.status);
    }

    if (filter?.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim();
      if (filter.allowPiiSearch === false) {
        list = list.filter((c) => c.id.toLowerCase().includes(q));
      } else {
        const qDigits = normalizePhoneDigits(q);
        list = list.filter((c) => {
          const matchName = c.name?.toLowerCase().includes(q);
          const matchEmail = c.email?.toLowerCase().includes(q);
          const matchPhone =
            c.phone?.toLowerCase().includes(q) ||
            (qDigits.length >= 4 && normalizePhoneDigits(c.phone).includes(qDigits));
          const matchId = c.id.toLowerCase().includes(q);
          return Boolean(matchName || matchEmail || matchPhone || matchId);
        });
      }
    }

    list.sort((a, b) => {
      const aTime = (a.lastLoginAt || a.createdAt).getTime();
      const bTime = (b.lastLoginAt || b.createdAt).getTime();
      return bTime - aTime;
    });

    const total = list.length;
    const offset = Math.max(0, filter?.offset || 0);
    const limit = Math.max(1, filter?.limit || 50);
    return {
      items: list.slice(offset, offset + limit),
      total,
    };
  }

  async create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Customer> {
    const id = data.id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const customer: Customer = {
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
    };
    this.customers.set(id, customer);
    return { ...customer };
  }

  async update(id: string, data: Partial<Customer>): Promise<Customer | null> {
    const existing = this.customers.get(id);
    if (!existing) return null;
    const updated: Customer = {
      ...existing,
      ...data,
      email: data.email !== undefined ? (data.email ? data.email.toLowerCase().trim() : null) : existing.email,
      updatedAt: new Date(),
    };
    this.customers.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    const existed = this.customers.delete(id);
    if (existed) {
      // Cascade delete customer-owned records (saved items, recently viewed, preferences, watches, notifications)
      if (globalForCustomerMem.__gh_mem_saved_items) {
        for (const [k, v] of globalForCustomerMem.__gh_mem_saved_items.entries()) {
          if (v.customerId === id) globalForCustomerMem.__gh_mem_saved_items.delete(k);
        }
      }
      if (globalForCustomerMem.__gh_mem_recently_viewed) {
        for (const [k, v] of globalForCustomerMem.__gh_mem_recently_viewed.entries()) {
          if (v.customerId === id) globalForCustomerMem.__gh_mem_recently_viewed.delete(k);
        }
      }
      if (globalForCustomerMem.__gh_mem_customer_prefs) {
        globalForCustomerMem.__gh_mem_customer_prefs.delete(id);
      }
      if (globalForCustomerMem.__gh_mem_project_watches) {
        for (const [k, v] of globalForCustomerMem.__gh_mem_project_watches.entries()) {
          if (v.customerId === id) globalForCustomerMem.__gh_mem_project_watches.delete(k);
        }
      }
      if (globalForCustomerMem.__gh_mem_location_watches) {
        for (const [k, v] of globalForCustomerMem.__gh_mem_location_watches.entries()) {
          if (v.customerId === id) globalForCustomerMem.__gh_mem_location_watches.delete(k);
        }
      }
      if (globalForCustomerMem.__gh_mem_notifications) {
        for (const [k, v] of globalForCustomerMem.__gh_mem_notifications.entries()) {
          if (v.customerId === id) globalForCustomerMem.__gh_mem_notifications.delete(k);
        }
      }
      if (globalForCustomerMem.__gh_on_customer_deleted) {
        for (const hook of globalForCustomerMem.__gh_on_customer_deleted) {
          await hook(id);
        }
      }
    }
    return existed;
  }
}

export class InMemorySavedItemRepository implements SavedItemRepository {
  private get items(): Map<string, SavedItem> {
    if (!globalForCustomerMem.__gh_mem_saved_items) {
      globalForCustomerMem.__gh_mem_saved_items = new Map<string, SavedItem>();
    }
    return globalForCustomerMem.__gh_mem_saved_items;
  }

  async findById(id: string): Promise<SavedItem | null> {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async findByCustomerAndResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<SavedItem | null> {
    for (const item of this.items.values()) {
      if (
        item.customerId === customerId &&
        item.resourceType === resourceType &&
        item.resourceId === resourceId
      ) {
        return { ...item };
      }
    }
    return null;
  }

  async listByCustomer(customerId: string, resourceType?: SavedItemResourceType): Promise<SavedItem[]> {
    const results: SavedItem[] = [];
    for (const item of this.items.values()) {
      if (item.customerId === customerId) {
        if (!resourceType || item.resourceType === resourceType) {
          results.push({ ...item });
        }
      }
    }
    return results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async create(data: Omit<SavedItem, 'id' | 'createdAt'> & { id?: string }): Promise<SavedItem> {
    const existing = await this.findByCustomerAndResource(
      data.customerId,
      data.resourceType,
      data.resourceId
    );
    if (existing) {
      return existing;
    }
    const id = data.id || `saved_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const item: SavedItem = {
      id,
      customerId: data.customerId,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      createdAt: new Date(),
    };
    this.items.set(id, item);
    return { ...item };
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const item = this.items.get(id);
    if (item && item.customerId === customerId) {
      return this.items.delete(id);
    }
    return false;
  }

  async deleteByResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean> {
    for (const [id, item] of this.items.entries()) {
      if (
        item.customerId === customerId &&
        item.resourceType === resourceType &&
        item.resourceId === resourceId
      ) {
        this.items.delete(id);
        return true;
      }
    }
    return false;
  }

  async isSaved(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean> {
    const item = await this.findByCustomerAndResource(customerId, resourceType, resourceId);
    return Boolean(item);
  }
}

export class InMemoryRecentlyViewedRepository implements RecentlyViewedRepository {
  private get views(): Map<string, RecentlyViewed> {
    if (!globalForCustomerMem.__gh_mem_recently_viewed) {
      globalForCustomerMem.__gh_mem_recently_viewed = new Map<string, RecentlyViewed>();
    }
    return globalForCustomerMem.__gh_mem_recently_viewed;
  }

  async findByCustomerAndResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewed | null> {
    for (const v of this.views.values()) {
      if (
        v.customerId === customerId &&
        v.resourceType === resourceType &&
        v.resourceId === resourceId
      ) {
        return { ...v };
      }
    }
    return null;
  }

  async listByCustomer(customerId: string, limit: number = 20): Promise<RecentlyViewed[]> {
    const results: RecentlyViewed[] = [];
    for (const v of this.views.values()) {
      if (v.customerId === customerId) {
        results.push({ ...v });
      }
    }
    return results
      .sort((a, b) => b.lastViewedAt.getTime() - a.lastViewedAt.getTime())
      .slice(0, limit);
  }

  async recordView(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewed> {
    const existing = await this.findByCustomerAndResource(customerId, resourceType, resourceId);
    const now = new Date();
    if (existing) {
      const updated: RecentlyViewed = {
        ...existing,
        lastViewedAt: now,
        viewCount: existing.viewCount + 1,
      };
      this.views.set(existing.id, updated);
      await this.pruneOldest(customerId, 20);
      return { ...updated };
    }

    const id = `view_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const created: RecentlyViewed = {
      id,
      customerId,
      resourceType,
      resourceId,
      firstViewedAt: now,
      lastViewedAt: now,
      viewCount: 1,
    };
    this.views.set(id, created);
    await this.pruneOldest(customerId, 20);
    return { ...created };
  }

  async clear(customerId: string): Promise<boolean> {
    let cleared = false;
    for (const [id, v] of this.views.entries()) {
      if (v.customerId === customerId) {
        this.views.delete(id);
        cleared = true;
      }
    }
    return cleared;
  }

  async pruneOldest(customerId: string, maxItems: number = 20): Promise<void> {
    const userViews = await this.listByCustomer(customerId, 100);
    if (userViews.length > maxItems) {
      const toRemove = userViews.slice(maxItems);
      for (const item of toRemove) {
        this.views.delete(item.id);
      }
    }
  }
}

export class InMemoryCustomerPreferenceRepository implements CustomerPreferenceRepository {
  private get prefs(): Map<string, CustomerPreferences> {
    if (!globalForCustomerMem.__gh_mem_customer_prefs) {
      globalForCustomerMem.__gh_mem_customer_prefs = new Map<string, CustomerPreferences>();
    }
    return globalForCustomerMem.__gh_mem_customer_prefs;
  }

  async findByCustomerId(customerId: string): Promise<CustomerPreferences | null> {
    const p = this.prefs.get(customerId);
    return p ? { ...p } : null;
  }

  async upsert(customerId: string, data: Partial<CustomerPreferences>): Promise<CustomerPreferences> {
    const existing = this.prefs.get(customerId);
    const now = new Date();
    if (existing) {
      const updated: CustomerPreferences = {
        ...existing,
        ...data,
        updatedAt: now,
      };
      this.prefs.set(customerId, updated);
      return { ...updated };
    }

    const id = `pref_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const created: CustomerPreferences = {
      id,
      customerId,
      preferredMode: data.preferredMode || 'ALL',
      preferredLocations: data.preferredLocations || [],
      preferredBhk: data.preferredBhk || [],
      preferredPropertyTypes: data.preferredPropertyTypes || [],
      budgetMin: data.budgetMin !== undefined ? data.budgetMin : null,
      budgetMax: data.budgetMax !== undefined ? data.budgetMax : null,
      emailAlertsEnabled: data.emailAlertsEnabled ?? true,
      inAppAlertsEnabled: data.inAppAlertsEnabled ?? true,
      newLaunchAlerts: data.newLaunchAlerts ?? true,
      priceDropAlerts: data.priceDropAlerts ?? true,
      projectStatusAlerts: data.projectStatusAlerts ?? true,
      reraAlerts: data.reraAlerts ?? true,
      priceChangeAlerts: data.priceChangeAlerts ?? true,
      configurationAlerts: data.configurationAlerts ?? true,
      locationAlerts: data.locationAlerts ?? true,
      resaleAlerts: data.resaleAlerts ?? true,
      rentalAlerts: data.rentalAlerts ?? true,
      marketingEmailsEnabled: data.marketingEmailsEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    };
    this.prefs.set(customerId, created);
    return { ...created };
  }
}

export class InMemoryProjectWatchRepository implements ProjectWatchRepository {
  private get watches(): Map<string, ProjectWatch> {
    if (!globalForCustomerMem.__gh_mem_project_watches) {
      globalForCustomerMem.__gh_mem_project_watches = new Map<string, ProjectWatch>();
    }
    return globalForCustomerMem.__gh_mem_project_watches;
  }

  async findById(id: string): Promise<ProjectWatch | null> {
    const w = this.watches.get(id);
    return w ? { ...w } : null;
  }

  async findByCustomerAndProject(customerId: string, projectId: string): Promise<ProjectWatch | null> {
    for (const w of this.watches.values()) {
      if (w.customerId === customerId && w.projectId === projectId) {
        return { ...w };
      }
    }
    return null;
  }

  async listByCustomer(customerId: string): Promise<ProjectWatch[]> {
    const res: ProjectWatch[] = [];
    for (const w of this.watches.values()) {
      if (w.customerId === customerId) {
        res.push({ ...w });
      }
    }
    return res;
  }

  async listByProject(projectId: string): Promise<ProjectWatch[]> {
    const res: ProjectWatch[] = [];
    for (const w of this.watches.values()) {
      if (w.projectId === projectId && w.enabled) {
        res.push({ ...w });
      }
    }
    return res;
  }

  async create(data: Omit<ProjectWatch, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { id?: string; enabled?: boolean }): Promise<ProjectWatch> {
    const id = data.id || `pwtch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const created: ProjectWatch = {
      id,
      customerId: data.customerId,
      projectId: data.projectId,
      enabled: data.enabled !== undefined ? data.enabled : true,
      createdAt: now,
      updatedAt: now,
      lastEvaluatedAt: null,
      lastAlertedAt: null,
    };
    this.watches.set(id, created);
    return { ...created };
  }

  async update(id: string, customerId: string, data: Partial<ProjectWatch>): Promise<ProjectWatch | null> {
    const existing = this.watches.get(id);
    if (!existing || existing.customerId !== customerId) return null;
    const updated: ProjectWatch = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.watches.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const existing = this.watches.get(id);
    if (existing && existing.customerId === customerId) {
      return this.watches.delete(id);
    }
    return false;
  }

  async isWatched(customerId: string, projectId: string): Promise<boolean> {
    const watch = await this.findByCustomerAndProject(customerId, projectId);
    return watch ? watch.enabled : false;
  }
}

export class InMemoryLocationWatchRepository implements LocationWatchRepository {
  private get watches(): Map<string, LocationWatch> {
    if (!globalForCustomerMem.__gh_mem_location_watches) {
      globalForCustomerMem.__gh_mem_location_watches = new Map<string, LocationWatch>();
    }
    return globalForCustomerMem.__gh_mem_location_watches;
  }

  async findById(id: string): Promise<LocationWatch | null> {
    const w = this.watches.get(id);
    return w ? { ...w } : null;
  }

  async findByCustomerAndLocation(customerId: string, locationId: string): Promise<LocationWatch | null> {
    for (const w of this.watches.values()) {
      if (w.customerId === customerId && w.locationId === locationId) {
        return { ...w };
      }
    }
    return null;
  }

  async listByCustomer(customerId: string): Promise<LocationWatch[]> {
    const res: LocationWatch[] = [];
    for (const w of this.watches.values()) {
      if (w.customerId === customerId) {
        res.push({ ...w });
      }
    }
    return res;
  }

  async listByLocation(locationId: string): Promise<LocationWatch[]> {
    const res: LocationWatch[] = [];
    for (const w of this.watches.values()) {
      if (w.locationId === locationId && w.enabled) {
        res.push({ ...w });
      }
    }
    return res;
  }

  async create(data: Omit<LocationWatch, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { id?: string; enabled?: boolean }): Promise<LocationWatch> {
    const id = data.id || `lwtch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date();
    const created: LocationWatch = {
      id,
      customerId: data.customerId,
      locationId: data.locationId,
      enabled: data.enabled !== undefined ? data.enabled : true,
      createdAt: now,
      updatedAt: now,
      lastEvaluatedAt: null,
      lastAlertedAt: null,
    };
    this.watches.set(id, created);
    return { ...created };
  }

  async update(id: string, customerId: string, data: Partial<LocationWatch>): Promise<LocationWatch | null> {
    const existing = this.watches.get(id);
    if (!existing || existing.customerId !== customerId) return null;
    const updated: LocationWatch = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.watches.set(id, updated);
    return { ...updated };
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const existing = this.watches.get(id);
    if (existing && existing.customerId === customerId) {
      return this.watches.delete(id);
    }
    return false;
  }

  async isWatched(customerId: string, locationId: string): Promise<boolean> {
    const watch = await this.findByCustomerAndLocation(customerId, locationId);
    return watch ? watch.enabled : false;
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  private get notifications(): Map<string, Notification> {
    if (!globalForCustomerMem.__gh_mem_notifications) {
      globalForCustomerMem.__gh_mem_notifications = new Map<string, Notification>();
    }
    return globalForCustomerMem.__gh_mem_notifications;
  }

  async findById(id: string): Promise<Notification | null> {
    const n = this.notifications.get(id);
    return n ? { ...n } : null;
  }

  async listByCustomer(customerId: string, options?: { limit?: number; offset?: number; isRead?: boolean }): Promise<Notification[]> {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const list: Notification[] = [];
    
    for (const n of this.notifications.values()) {
      if (n.customerId === customerId) {
        if (options?.isRead !== undefined && n.isRead !== options.isRead) {
          continue;
        }
        list.push({ ...n });
      }
    }
    
    return list
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async getUnreadCount(customerId: string): Promise<number> {
    let count = 0;
    for (const n of this.notifications.values()) {
      if (n.customerId === customerId && !n.isRead) {
        count++;
      }
    }
    return count;
  }

  async create(data: Omit<Notification, 'id' | 'createdAt' | 'isRead'> & { id?: string; isRead?: boolean }): Promise<Notification> {
    const id = data.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const created: Notification = {
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
      createdAt: new Date(),
      expiresAt: data.expiresAt || null,
    };
    this.notifications.set(id, created);
    return { ...created };
  }

  async markAsRead(id: string, customerId: string): Promise<boolean> {
    const existing = this.notifications.get(id);
    if (existing && existing.customerId === customerId) {
      existing.isRead = true;
      existing.readAt = new Date();
      return true;
    }
    return false;
  }

  async markAllAsRead(customerId: string): Promise<boolean> {
    for (const n of this.notifications.values()) {
      if (n.customerId === customerId && !n.isRead) {
        n.isRead = true;
        n.readAt = new Date();
      }
    }
    return true;
  }

  async delete(id: string, customerId: string): Promise<boolean> {
    const existing = this.notifications.get(id);
    if (existing && existing.customerId === customerId) {
      return this.notifications.delete(id);
    }
    return false;
  }

  async prune(customerId: string, daysRetention: number): Promise<number> {
    const cutOff = Date.now() - daysRetention * 24 * 60 * 60 * 1000;
    let count = 0;
    for (const [id, n] of this.notifications.entries()) {
      if (n.customerId === customerId && n.createdAt.getTime() < cutOff) {
        this.notifications.delete(id);
        count++;
      }
    }
    return count;
  }
}
