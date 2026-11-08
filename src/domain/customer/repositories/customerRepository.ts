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

export interface CustomerListFilter {
  search?: string;
  allowPiiSearch?: boolean;
  status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED' | 'ALL';
  limit?: number;
  offset?: number;
}

export interface CustomerRepository {
  findById(id: string): Promise<Customer | null>;
  findByEmail(email: string): Promise<Customer | null>;
  findByPhone(phone: string): Promise<Customer | null>;
  list(filter?: CustomerListFilter): Promise<{ items: Customer[]; total: number }>;
  create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Customer>;
  update(id: string, data: Partial<Customer>): Promise<Customer | null>;
  delete(id: string): Promise<boolean>;
}

export interface SavedItemRepository {
  findById(id: string): Promise<SavedItem | null>;
  findByCustomerAndResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<SavedItem | null>;
  listByCustomer(customerId: string, resourceType?: SavedItemResourceType): Promise<SavedItem[]>;
  create(data: Omit<SavedItem, 'id' | 'createdAt'> & { id?: string }): Promise<SavedItem>;
  delete(id: string, customerId: string): Promise<boolean>;
  deleteByResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean>;
  isSaved(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean>;
}

export interface RecentlyViewedRepository {
  findByCustomerAndResource(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewed | null>;
  listByCustomer(customerId: string, limit?: number): Promise<RecentlyViewed[]>;
  recordView(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewed>;
  clear(customerId: string): Promise<boolean>;
  pruneOldest(customerId: string, maxItems: number): Promise<void>;
}

export interface CustomerPreferenceRepository {
  findByCustomerId(customerId: string): Promise<CustomerPreferences | null>;
  upsert(customerId: string, data: Partial<CustomerPreferences>): Promise<CustomerPreferences>;
}

export interface ProjectWatchRepository {
  findById(id: string): Promise<ProjectWatch | null>;
  findByCustomerAndProject(customerId: string, projectId: string): Promise<ProjectWatch | null>;
  listByCustomer(customerId: string): Promise<ProjectWatch[]>;
  listByProject(projectId: string): Promise<ProjectWatch[]>;
  create(data: Omit<ProjectWatch, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { id?: string; enabled?: boolean }): Promise<ProjectWatch>;
  update(id: string, customerId: string, data: Partial<ProjectWatch>): Promise<ProjectWatch | null>;
  delete(id: string, customerId: string): Promise<boolean>;
  isWatched(customerId: string, projectId: string): Promise<boolean>;
}

export interface LocationWatchRepository {
  findById(id: string): Promise<LocationWatch | null>;
  findByCustomerAndLocation(customerId: string, locationId: string): Promise<LocationWatch | null>;
  listByCustomer(customerId: string): Promise<LocationWatch[]>;
  listByLocation(locationId: string): Promise<LocationWatch[]>;
  create(data: Omit<LocationWatch, 'id' | 'createdAt' | 'updatedAt' | 'enabled'> & { id?: string; enabled?: boolean }): Promise<LocationWatch>;
  update(id: string, customerId: string, data: Partial<LocationWatch>): Promise<LocationWatch | null>;
  delete(id: string, customerId: string): Promise<boolean>;
  isWatched(customerId: string, locationId: string): Promise<boolean>;
}

export interface NotificationRepository {
  findById(id: string): Promise<Notification | null>;
  listByCustomer(customerId: string, options?: { limit?: number; offset?: number; isRead?: boolean }): Promise<Notification[]>;
  getUnreadCount(customerId: string): Promise<number>;
  create(data: Omit<Notification, 'id' | 'createdAt' | 'isRead'> & { id?: string; isRead?: boolean }): Promise<Notification>;
  markAsRead(id: string, customerId: string): Promise<boolean>;
  markAllAsRead(customerId: string): Promise<boolean>;
  delete(id: string, customerId: string): Promise<boolean>;
  prune(customerId: string, daysRetention: number): Promise<number>;
}
