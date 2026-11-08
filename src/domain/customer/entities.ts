export type CustomerStatus = 'ACTIVE' | 'DISABLED' | 'DELETED';

export interface Customer {
  id: string;
  email?: string | null;
  phone?: string | null;
  name: string;
  passwordHash?: string | null;
  avatarUrl?: string | null;
  status: CustomerStatus;
  emailVerifiedAt?: Date | null;
  phoneVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerDto {
  id: string;
  email?: string | null;
  phone?: string | null;
  name: string;
  avatarUrl?: string | null;
  status: CustomerStatus;
  createdAt: string;
}

export type SavedItemResourceType = 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING';

export interface SavedItem {
  id: string;
  customerId: string;
  resourceType: SavedItemResourceType;
  resourceId: string;
  createdAt: Date;
}

export interface SavedItemSummary {
  id: string;
  title: string;
  subtitle?: string;
  slug: string;
  url: string;
  imageUrl?: string;
  priceDisplay?: string;
  locationName?: string;
  developerName?: string;
  stageOrStatus?: string;
  isAvailable: boolean;
  unavailableReason?: string;
}

export interface SavedItemDto {
  id: string;
  resourceType: SavedItemResourceType;
  resourceId: string;
  savedAt: string;
  resource: SavedItemSummary;
}

export interface RecentlyViewed {
  id: string;
  customerId: string;
  resourceType: SavedItemResourceType;
  resourceId: string;
  firstViewedAt: Date;
  lastViewedAt: Date;
  viewCount: number;
}

export interface RecentlyViewedDto {
  id: string;
  resourceType: SavedItemResourceType;
  resourceId: string;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
  resource: SavedItemSummary;
}

export interface CustomerPreferences {
  id: string;
  customerId: string;
  preferredMode: 'ALL' | 'PROJECTS' | 'BUY' | 'RENT';
  preferredLocations: string[]; // Canonical location IDs / names
  preferredBhk: number[];
  preferredPropertyTypes: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  emailAlertsEnabled?: boolean;
  inAppAlertsEnabled?: boolean;
  newLaunchAlerts?: boolean;
  priceDropAlerts?: boolean;
  projectStatusAlerts?: boolean;
  reraAlerts?: boolean;
  priceChangeAlerts?: boolean;
  configurationAlerts?: boolean;
  locationAlerts?: boolean;
  resaleAlerts?: boolean;
  rentalAlerts?: boolean;
  marketingEmailsEnabled?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerPreferencesDto {
  preferredMode: 'ALL' | 'PROJECTS' | 'BUY' | 'RENT';
  preferredLocations: string[];
  preferredBhk: number[];
  preferredPropertyTypes: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  emailAlertsEnabled: boolean;
  inAppAlertsEnabled: boolean;
  newLaunchAlerts: boolean;
  priceDropAlerts: boolean;
  projectStatusAlerts: boolean;
  reraAlerts: boolean;
  priceChangeAlerts: boolean;
  configurationAlerts: boolean;
  locationAlerts: boolean;
  resaleAlerts: boolean;
  rentalAlerts: boolean;
  marketingEmailsEnabled: boolean;
  updatedAt: string;
}

export interface RegisterDto {
  name: string;
  email?: string | null;
  password?: string;
  phone?: string;
}

export interface LoginDto {
  email: string;
  password?: string;
}

export interface UpdateCustomerProfileDto {
  name?: string;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface UpdateCustomerPreferencesDto {
  preferredMode?: 'ALL' | 'PROJECTS' | 'BUY' | 'RENT';
  preferredLocations?: string[];
  preferredBhk?: number[];
  preferredPropertyTypes?: string[];
  budgetMin?: number | null;
  budgetMax?: number | null;
  emailAlertsEnabled?: boolean;
  inAppAlertsEnabled?: boolean;
  newLaunchAlerts?: boolean;
  priceDropAlerts?: boolean;
  projectStatusAlerts?: boolean;
  reraAlerts?: boolean;
  priceChangeAlerts?: boolean;
  configurationAlerts?: boolean;
  locationAlerts?: boolean;
  resaleAlerts?: boolean;
  rentalAlerts?: boolean;
  marketingEmailsEnabled?: boolean;
}

export interface ProjectWatch {
  id: string;
  customerId: string;
  projectId: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastEvaluatedAt?: Date | null;
  lastAlertedAt?: Date | null;
}

export interface ProjectWatchDto {
  id: string;
  projectId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  project?: SavedItemSummary;
}

export interface LocationWatch {
  id: string;
  customerId: string;
  locationId: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastEvaluatedAt?: Date | null;
  lastAlertedAt?: Date | null;
}

export interface LocationWatchDto {
  id: string;
  locationId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  locationName: string;
  locationSlug: string;
  locationType: string;
}

export type NotificationType =
  | 'PROJECT_STATUS_CHANGED'
  | 'PROJECT_RERA_VERIFIED'
  | 'PROJECT_RERA_STATUS_CHANGED'
  | 'PROJECT_PRICE_CHANGED'
  | 'PROJECT_CONFIGURATION_ADDED'
  | 'PROJECT_CONFIGURATION_UPDATED'
  | 'PROJECT_POSSESSION_UPDATED'
  | 'PROJECT_INFORMATION_UPDATED'
  | 'NEW_PROJECT_IN_WATCHED_LOCATION'
  | 'NEW_LAUNCH_IN_WATCHED_LOCATION'
  | 'RESALE_PRICE_CHANGED'
  | 'RESALE_STATUS_CHANGED'
  | 'RENT_PRICE_CHANGED'
  | 'RENT_STATUS_CHANGED'
  | 'LISTING_BECAME_UNAVAILABLE';

export interface Notification {
  id: string;
  customerId: string;
  type: string;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  projectId?: string | null;
  locationId?: string | null;
  savedItemId?: string | null;
  watchId?: string | null;
  metadata?: any;
  isRead: boolean;
  readAt?: Date | null;
  createdAt: Date;
  expiresAt?: Date | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  message: string;
  resourceType: string;
  resourceId: string;
  projectId?: string | null;
  locationId?: string | null;
  isRead: boolean;
  createdAt: string;
  metadata?: any;
}

export interface AlertDeliveryAttempt {
  id: string;
  notificationId: string;
  channel: 'IN_APP' | 'EMAIL';
  status: 'PENDING' | 'SENT' | 'FAILED';
  attempts: number;
  lastAttemptAt?: Date | null;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonalizedDiscoveryDto {
  hasPreferences: boolean;
  recommendedProjects: SavedItemSummary[];
  recommendedResale: SavedItemSummary[];
  recommendedRentals: SavedItemSummary[];
  rationale: string;
}
