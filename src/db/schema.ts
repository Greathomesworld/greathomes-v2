import { pgTable, serial, text, timestamp, uuid, pgEnum, decimal, boolean, integer, index, uniqueIndex, jsonb } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Enums
export const projectStatusEnum = pgEnum('project_status', ['UPCOMING', 'NEW_LAUNCH', 'UNDER_CONSTRUCTION', 'READY_TO_MOVE', 'COMPLETED', 'SOLD_OUT']);
export const projectLifecycleStatusEnum = pgEnum('project_lifecycle_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const propertyTypeEnum = pgEnum('property_type', ['APARTMENT', 'FLAT', 'VILLA', 'INDEPENDENT_HOUSE', 'PLOT', 'DUPLEX', 'PENTHOUSE']);
export const priceBasisEnum = pgEnum('price_basis', ['CARPET_AREA', 'BUILT_UP_AREA', 'SUPER_BUILT_UP_AREA']);
export const reraStatusEnum = pgEnum('rera_status', ['NOT_PROVIDED', 'PROVIDED', 'VERIFIED']);
export const locationTypeEnum = pgEnum('location_type', ['STATE', 'DISTRICT', 'CITY', 'DISCOVERY_REGION', 'AREA', 'NEIGHBOURHOOD']);
export const locationStatusEnum = pgEnum('location_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);
export const developerStatusEnum = pgEnum('developer_status', ['DRAFT', 'PUBLISHED', 'ARCHIVED']);

// Developers
export const developers = pgTable('developers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  shortDescription: text('short_description'),
  description: text('description'),
  websiteUrl: text('website_url'),
  status: developerStatusEnum('status').default('DRAFT').notNull(),
  featured: boolean('featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Developer Media
export const developerMedia = pgTable('developer_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  developerId: uuid('developer_id').references(() => developers.id).notNull(),
  mediaType: text('media_type').notNull(), // 'IMAGE'
  category: text('category').notNull(), // 'LOGO', 'BRAND', 'OFFICE', 'EDITORIAL'
  url: text('url').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Developer SEO
export const developerSeo = pgTable('developer_seo', {
  id: uuid('id').primaryKey().defaultRandom(),
  developerId: uuid('developer_id').references(() => developers.id).notNull(),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  canonicalUrl: text('canonical_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Locations
export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  type: locationTypeEnum('type').notNull(),
  parentId: uuid('parent_id').references((): any => locations.id),
  description: text('description'),
  shortDescription: text('short_description'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  // PostGIS spatial data placeholder
  geometry: text('geometry'), 
  status: locationStatusEnum('status').default('DRAFT').notNull(),
  featured: boolean('featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Projects
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  developerId: uuid('developer_id').references(() => developers.id).notNull(),
  locationId: uuid('location_id').references(() => locations.id).notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  shortDescription: text('short_description'),
  description: text('description'),
  status: projectStatusEnum('status').notNull(),
  lifecycleStatus: projectLifecycleStatusEnum('lifecycle_status').default('DRAFT').notNull(),
  propertyType: propertyTypeEnum('property_type').notNull(),
  startingPrice: decimal('starting_price', { precision: 19, scale: 4 }),
  priceOnRequest: boolean('price_on_request').default(false).notNull(),
  projectArea: text('project_area'),
  towerCount: integer('tower_count'),
  totalUnits: integer('total_units'),
  floors: text('floors'),
  possession: text('possession'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  featured: boolean('featured').default(false).notNull(),
  isPublished: boolean('is_published').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Configurations
export const projectConfigurations = pgTable('project_configurations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  name: text('name').notNull(),
  bedroomCount: integer('bedroom_count'),
  carpetArea: decimal('carpet_area', { precision: 12, scale: 2 }),
  builtUpArea: decimal('built_up_area', { precision: 12, scale: 2 }),
  superBuiltUpArea: decimal('super_built_up_area', { precision: 12, scale: 2 }),
  price: decimal('price', { precision: 19, scale: 4 }).notNull(),
  priceBasis: priceBasisEnum('price_basis').notNull(),
  priceOnRequest: boolean('price_on_request').default(false).notNull(),
  floorPlanMediaId: text('floor_plan_media_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project RERA
export const projectRera = pgTable('project_rera', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  status: reraStatusEnum('status').default('NOT_PROVIDED').notNull(),
  authority: text('authority'),
  registrationNumber: text('registration_number'),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: text('verified_by'),
  internalNotes: text('internal_notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Media
export const projectMedia = pgTable('project_media', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  mediaId: text('media_id'),
  configurationId: uuid('configuration_id').references(() => projectConfigurations.id, { onDelete: 'set null' }),
  mediaType: text('media_type').notNull(),
  category: text('category').notNull(),
  url: text('url').notNull(),
  altText: text('alt_text'),
  caption: text('caption'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Amenities
export const amenities = pgTable('amenities', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category').default('GENERAL').notNull(),
  icon: text('icon'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Amenities
export const projectAmenities = pgTable('project_amenities', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  amenityId: uuid('amenity_id').references(() => amenities.id).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project FAQs
export const projectFaqs = pgTable('project_faqs', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isPublished: boolean('is_published').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project SEO
export const projectSeo = pgTable('project_seo', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id).notNull(),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  canonicalUrl: text('canonical_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Considerations (Editorial Overrides & Intelligence)
export const projectConsiderations = pgTable('project_considerations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  section: text('section').notNull(), // 'WHY_CONSIDER' | 'THINGS_TO_KEEP_IN_MIND'
  title: text('title').notNull(),
  description: text('description').notNull(),
  sourceType: text('source_type').default('EDITORIAL').notNull(), // 'GENERATED' | 'EDITORIAL'
  sortOrder: integer('sort_order').default(0).notNull(),
  isVisible: boolean('is_visible').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_project_considerations_project_id').on(table.projectId),
  index('idx_project_considerations_section').on(table.section),
  index('idx_project_considerations_is_visible').on(table.isVisible),
]);

// Places
export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  categoryDisplay: text('category_display'),
  latitude: decimal('latitude', { precision: 9, scale: 6 }).notNull(),
  longitude: decimal('longitude', { precision: 9, scale: 6 }).notNull(),
  address: text('address'),
  locality: text('locality'),
  city: text('city').notNull(),
  isVerified: boolean('is_verified').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Resale Listings
export const resaleListings = pgTable('resale_listings', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  projectId: uuid('project_id').references(() => projects.id),
  propertyType: text('property_type').notNull(),
  configuration: text('configuration').notNull(),
  bedroomCount: integer('bedroom_count').notNull(),
  carpetArea: decimal('carpet_area', { precision: 12, scale: 2 }),
  builtUpArea: decimal('built_up_area', { precision: 12, scale: 2 }),
  superBuiltUpArea: decimal('super_built_up_area', { precision: 12, scale: 2 }),
  askingPrice: decimal('asking_price', { precision: 19, scale: 4 }).notNull(),
  furnishing: text('furnishing').notNull(),
  facing: text('facing').notNull(),
  floorCategory: text('floor_category').notNull(),
  possession: text('possession').notNull(),
  possessionDate: timestamp('possession_date'),
  description: text('description'),
  listingPartyType: text('listing_party_type').notNull(),
  listingPartyDisplayName: text('listing_party_display_name'),
  ownerName: text('owner_name'),
  ownerPhone: text('owner_phone'),
  ownerEmail: text('owner_email'),
  brokerName: text('broker_name'),
  brokerPhone: text('broker_phone'),
  brokerEmail: text('broker_email'),
  privatePhone: text('private_phone'),
  privateEmail: text('private_email'),
  internalNotes: text('internal_notes'),
  source: text('source'),
  crmId: text('crm_id'),
  lifecycleStatus: text('lifecycle_status').notNull(),
  verificationStatus: text('verification_status').notNull(),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: text('verified_by'),
  locationId: uuid('location_id').references(() => locations.id),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  geometry: text('geometry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Resale Listing Media
export const resaleListingMedia = pgTable('resale_listing_media', {
  id: text('id').primaryKey(),
  resaleListingId: text('resale_listing_id').references(() => resaleListings.id).notNull(),
  mediaType: text('media_type').notNull(),
  category: text('category').notNull(),
  url: text('url').notNull(),
  altText: text('alt_text'),
  caption: text('caption'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Resale Listing Amenities
export const resaleListingAmenities = pgTable('resale_listing_amenities', {
  id: text('id').primaryKey(),
  resaleListingId: text('resale_listing_id').references(() => resaleListings.id).notNull(),
  amenityId: uuid('amenity_id').references(() => amenities.id).notNull(),
});

// Rental Listings
export const rentalListings = pgTable('rental_listings', {
  id: text('id').primaryKey(),
  slug: text('slug'),
  projectId: uuid('project_id').references(() => projects.id),
  propertyType: text('property_type').notNull(),
  configuration: text('configuration').notNull(),
  bedroomCount: integer('bedroom_count').notNull(),
  carpetArea: decimal('carpet_area', { precision: 12, scale: 2 }),
  builtUpArea: decimal('built_up_area', { precision: 12, scale: 2 }),
  superBuiltUpArea: decimal('super_built_up_area', { precision: 12, scale: 2 }),
  monthlyRent: decimal('monthly_rent', { precision: 19, scale: 4 }).notNull(),
  maintenance: decimal('maintenance', { precision: 19, scale: 4 }),
  securityDeposit: decimal('security_deposit', { precision: 19, scale: 4 }),
  furnishing: text('furnishing').notNull(),
  facing: text('facing').notNull(),
  floorCategory: text('floor_category').notNull(),
  possession: text('possession').notNull(),
  availabilityDate: timestamp('availability_date'),
  leaseDuration: text('lease_duration'),
  noticePeriod: text('notice_period'),
  description: text('description'),
  listingPartyType: text('listing_party_type').notNull(),
  listingPartyDisplayName: text('listing_party_display_name'),
  ownerName: text('owner_name'),
  ownerPhone: text('owner_phone'),
  ownerEmail: text('owner_email'),
  brokerName: text('broker_name'),
  brokerPhone: text('broker_phone'),
  brokerEmail: text('broker_email'),
  privatePhone: text('private_phone'),
  privateEmail: text('private_email'),
  internalNotes: text('internal_notes'),
  source: text('source'),
  crmId: text('crm_id'),
  lifecycleStatus: text('lifecycle_status').notNull(),
  verificationStatus: text('verification_status').notNull(),
  verifiedAt: timestamp('verified_at'),
  verifiedBy: text('verified_by'),
  locationId: uuid('location_id').references(() => locations.id),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  geometry: text('geometry'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Rental Listing Media
export const rentalListingMedia = pgTable('rental_listing_media', {
  id: text('id').primaryKey(),
  rentalListingId: text('rental_listing_id').references(() => rentalListings.id).notNull(),
  mediaType: text('media_type').notNull(),
  category: text('category').notNull(),
  url: text('url').notNull(),
  altText: text('alt_text'),
  caption: text('caption'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Rental Listing Amenities
export const rentalListingAmenities = pgTable('rental_listing_amenities', {
  id: text('id').primaryKey(),
  rentalListingId: text('rental_listing_id').references(() => rentalListings.id).notNull(),
  amenityId: uuid('amenity_id').references(() => amenities.id).notNull(),
});

// Staff & Authorization
export const staffUsers = pgTable('staff_users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull(), // 'SUPER_ADMIN' | 'ADMIN' | 'CONTENT_MANAGER' | 'PROPERTY_MANAGER' | 'SALES'
  passwordHash: text('password_hash'),
  sessionVersion: integer('session_version').default(0).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_staff_users_email').on(table.email),
  index('idx_staff_users_role').on(table.role),
  index('idx_staff_users_enabled').on(table.enabled),
]);

// Enquiries
export const enquiries = pgTable('enquiries', {
  id: text('id').primaryKey(),
  contextType: text('context_type').notNull(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  visitorId: text('visitor_id').references(() => visitors.id, { onDelete: 'set null' }),
  sessionId: text('session_id').references(() => visitorSessions.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id),
  projectSlug: text('project_slug'),
  projectName: text('project_name'),
  configurationId: text('configuration_id'),
  listingId: text('listing_id'),
  listingSlug: text('listing_slug'),
  listingTitle: text('listing_title'),
  configuration: text('configuration'),
  propertyType: text('property_type'),
  priceDisplay: text('price_display'),
  locationName: text('location_name'),
  buyerName: text('buyer_name').notNull(),
  buyerPhone: text('buyer_phone').notNull(),
  buyerEmail: text('buyer_email'),
  preferredContact: text('preferred_contact').notNull(),
  requestSiteVisit: boolean('request_site_visit').default(false).notNull(),
  message: text('message'),
  status: text('status').notNull(),
  priority: text('priority').default('NORMAL').notNull(),
  assignedTo: text('assigned_to'),
  assignedToName: text('assigned_to_name'),
  source: text('source'),
  sourcePage: text('source_page'),
  internalNotes: text('internal_notes'),
  lastContactedAt: timestamp('last_contacted_at'),
  nextFollowUpAt: timestamp('next_follow_up_at'),
  siteVisitId: text('site_visit_id'),
  metadata: text('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_enquiries_status').on(table.status),
  index('idx_enquiries_priority').on(table.priority),
  index('idx_enquiries_context_type').on(table.contextType),
  index('idx_enquiries_customer_id').on(table.customerId),
  index('idx_enquiries_visitor_id').on(table.visitorId),
  index('idx_enquiries_session_id').on(table.sessionId),
  index('idx_enquiries_buyer_phone').on(table.buyerPhone),
  index('idx_enquiries_created_at').on(table.createdAt),
  index('idx_enquiries_updated_at').on(table.updatedAt),
  index('idx_enquiries_assigned_to').on(table.assignedTo),
  index('idx_enquiries_project_id').on(table.projectId),
  index('idx_enquiries_listing_id').on(table.listingId),
  index('idx_enquiries_next_follow_up_at').on(table.nextFollowUpAt),
]);

// Audit Logs & Administrative Accountability
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorStaffId: text('actor_staff_id').references(() => staffUsers.id, { onDelete: 'set null' }),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  resourceLabel: text('resource_label'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  requestId: text('request_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  before: jsonb('before'),
  after: jsonb('after'),
  metadata: jsonb('metadata'),
  success: boolean('success').default(true).notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_audit_logs_timestamp').on(table.timestamp),
  index('idx_audit_logs_actor_staff_id').on(table.actorStaffId),
  index('idx_audit_logs_resource_type').on(table.resourceType),
  index('idx_audit_logs_resource_id').on(table.resourceId),
  index('idx_audit_logs_action').on(table.action),
  index('idx_audit_logs_success').on(table.success),
  index('idx_audit_logs_request_id').on(table.requestId),
]);

// Unified Media Assets & Derivatives
export const mediaAssets = pgTable('media_assets', {
  id: text('id').primaryKey(),
  entityType: text('entity_type').notNull(), // 'PROJECT' | 'DEVELOPER' | 'RESALE' | 'RENTAL' | 'GENERAL'
  entityId: text('entity_id').notNull(),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  category: text('category').notNull(),
  mediaType: text('media_type').default('IMAGE').notNull(),
  width: integer('width').default(0).notNull(),
  height: integer('height').default(0).notNull(),
  fileSizeBytes: integer('file_size_bytes').default(0).notNull(),
  storageProvider: text('storage_provider').default('local').notNull(),
  storageKey: text('storage_key').notNull(),
  url: text('url').notNull(), // Canonical public URL
  originalUrl: text('original_url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  webpUrl: text('webp_url'),
  avifUrl: text('avif_url'),
  watermarkedUrl: text('watermarked_url'),
  watermarkApplied: boolean('watermark_applied').default(false).notNull(),
  altText: text('alt_text'),
  caption: text('caption'),
  sortOrder: integer('sort_order').default(0).notNull(),
  isFeatured: boolean('is_featured').default(false).notNull(),
  processingStatus: text('processing_status').default('READY').notNull(),
  variants: jsonb('variants'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_media_assets_entity').on(table.entityType, table.entityId),
  index('idx_media_assets_category').on(table.category),
  index('idx_media_assets_created').on(table.createdAt),
]);

// Customer Status Enum
export const customerStatusEnum = pgEnum('customer_status', ['ACTIVE', 'DISABLED', 'DELETED']);

// Customers (Authenticated buyer accounts)
export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  email: text('email'),
  phone: text('phone'),
  name: text('name').notNull(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  status: customerStatusEnum('status').default('ACTIVE').notNull(),
  emailVerifiedAt: timestamp('email_verified_at'),
  phoneVerifiedAt: timestamp('phone_verified_at'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('idx_customers_email_unique_non_null').on(sql`LOWER(${table.email})`).where(sql`${table.email} IS NOT NULL`),
  index('idx_customers_email').on(table.email),
  index('idx_customers_phone').on(table.phone),
  index('idx_customers_status').on(table.status),
]);

// Saved Items (Generic bounded saved residential resources)
export const savedItems = pgTable('saved_items', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  resourceType: text('resource_type').notNull(), // 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING'
  resourceId: text('resource_id').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_saved_items_customer').on(table.customerId),
  index('idx_saved_items_resource').on(table.resourceType, table.resourceId),
  index('idx_saved_items_created').on(table.createdAt),
]);

// Recently Viewed (Bounded 20 items per customer)
export const recentlyViewed = pgTable('recently_viewed', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  resourceType: text('resource_type').notNull(), // 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING'
  resourceId: text('resource_id').notNull(),
  firstViewedAt: timestamp('first_viewed_at').defaultNow().notNull(),
  lastViewedAt: timestamp('last_viewed_at').defaultNow().notNull(),
  viewCount: integer('view_count').default(1).notNull(),
}, (table) => [
  index('idx_recently_viewed_customer').on(table.customerId),
  index('idx_recently_viewed_last_viewed').on(table.lastViewedAt),
]);

// Customer Personalization Preferences
export const customerPreferences = pgTable('customer_preferences', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull().unique(),
  preferredMode: text('preferred_mode').default('ALL'),
  preferredLocations: jsonb('preferred_locations'),
  preferredBhk: jsonb('preferred_bhk'),
  preferredPropertyTypes: jsonb('preferred_property_types'),
  budgetMin: integer('budget_min'),
  budgetMax: integer('budget_max'),
  emailAlertsEnabled: boolean('email_alerts_enabled').default(true),
  inAppAlertsEnabled: boolean('in_app_alerts_enabled').default(true),
  newLaunchAlerts: boolean('new_launch_alerts').default(true),
  priceDropAlerts: boolean('price_drop_alerts').default(true),
  projectStatusAlerts: boolean('project_status_alerts').default(true),
  reraAlerts: boolean('rera_alerts').default(true),
  priceChangeAlerts: boolean('price_change_alerts').default(true),
  configurationAlerts: boolean('configuration_alerts').default(true),
  locationAlerts: boolean('location_alerts').default(true),
  resaleAlerts: boolean('resale_alerts').default(true),
  rentalAlerts: boolean('rental_alerts').default(true),
  marketingEmailsEnabled: boolean('marketing_emails_enabled').default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_customer_preferences_customer').on(table.customerId),
]);

// Project Watchlists
export const projectWatchlists = pgTable('project_watchlists', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastEvaluatedAt: timestamp('last_evaluated_at'),
  lastAlertedAt: timestamp('last_alerted_at'),
}, (table) => [
  index('idx_project_watchlists_customer').on(table.customerId),
  index('idx_project_watchlists_project').on(table.projectId),
  index('idx_project_watchlists_customer_project_unique').on(table.customerId, table.projectId),
]);

// Location Watchlists
export const locationWatchlists = pgTable('location_watchlists', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastEvaluatedAt: timestamp('last_evaluated_at'),
  lastAlertedAt: timestamp('last_alerted_at'),
}, (table) => [
  index('idx_location_watchlists_customer').on(table.customerId),
  index('idx_location_watchlists_location').on(table.locationId),
  index('idx_location_watchlists_customer_location_unique').on(table.customerId, table.locationId),
]);

// Notifications
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'cascade' }).notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  savedItemId: text('saved_item_id'),
  watchId: text('watch_id'),
  metadata: jsonb('metadata'),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
}, (table) => [
  index('idx_notifications_customer').on(table.customerId),
  index('idx_notifications_customer_created').on(table.customerId, table.createdAt),
  index('idx_notifications_customer_read_created').on(table.customerId, table.isRead, table.createdAt),
  index('idx_notifications_customer_type_created').on(table.customerId, table.type, table.createdAt),
]);

// Alert Delivery Attempts
export const alertDeliveryAttempts = pgTable('alert_delivery_attempts', {
  id: text('id').primaryKey(),
  notificationId: text('notification_id').references(() => notifications.id, { onDelete: 'cascade' }).notNull(),
  channel: text('channel').notNull(),
  status: text('status').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  lastAttemptAt: timestamp('last_attempt_at'),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_alert_delivery_notification').on(table.notificationId),
  index('idx_alert_delivery_status').on(table.status),
]);

// Location Market Snapshots
export const locationMarketSnapshots = pgTable('location_market_snapshots', {
  id: text('id').primaryKey(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  snapshotDate: text('snapshot_date').notNull(), // YYYY-MM-DD
  projectCount: integer('project_count').default(0).notNull(),
  publishedProjectCount: integer('published_project_count').default(0).notNull(),
  newLaunchCount: integer('new_launch_count').default(0).notNull(),
  underConstructionCount: integer('under_construction_count').default(0).notNull(),
  readyToMoveCount: integer('ready_to_move_count').default(0).notNull(),
  completedProjectCount: integer('completed_project_count').default(0).notNull(),
  soldOutProjectCount: integer('sold_out_project_count').default(0).notNull(),
  resaleListingCount: integer('resale_listing_count').default(0).notNull(),
  rentalListingCount: integer('rental_listing_count').default(0).notNull(),
  configurationCounts: jsonb('configuration_counts'),
  priceMetrics: jsonb('price_metrics'),
  reraMetrics: jsonb('rera_metrics'),
  dataFreshness: jsonb('data_freshness'),
  source: text('source').default('GREAT_HOMES_DB').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_snapshots_location').on(table.locationId),
  index('idx_snapshots_date').on(table.snapshotDate),
  index('idx_snapshots_location_date_unique').on(table.locationId, table.snapshotDate),
]);

// Market Events
export const marketEvents = pgTable('market_events', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }).notNull(),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  previousValue: text('previous_value'),
  newValue: text('new_value'),
  changeFingerprint: text('change_fingerprint').notNull(),
  metadata: jsonb('metadata'),
  eventDate: timestamp('event_date').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_market_events_location').on(table.locationId),
  index('idx_market_events_type').on(table.eventType),
  index('idx_market_events_resource').on(table.resourceType, table.resourceId),
  index('idx_market_events_date').on(table.eventDate),
  index('idx_market_events_unique_fingerprint').on(table.locationId, table.eventType, table.resourceId, table.changeFingerprint),
]);

// Data Quality Issues
export const dataQualityIssues = pgTable('data_quality_issues', {
  id: text('id').primaryKey(),
  severity: text('severity').notNull(), // 'CRITICAL' | 'WARNING' | 'INFO'
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  field: text('field'),
  code: text('code').notNull(),
  message: text('message').notNull(),
  detectedAt: timestamp('detected_at').defaultNow().notNull(),
}, (table) => [
  index('idx_data_quality_severity').on(table.severity),
  index('idx_data_quality_code').on(table.code),
  index('idx_data_quality_entity').on(table.entityType, table.entityId),
]);

// Editorial Articles (Phase 16)
export const editorialArticles = pgTable('editorial_articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull(), // 'PROJECT_REVIEW' | 'BUYING_GUIDE' | 'LOCATION_GUIDE' | 'DEVELOPER_STORY' | 'MARKET_GUIDE'
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  excerpt: text('excerpt').notNull(),
  body: text('body').notNull(),
  status: text('status').default('DRAFT').notNull(), // 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'ARCHIVED'
  authorName: text('author_name').default('Great Homes Editorial Team').notNull(),
  authorRole: text('author_role').default('Editorial Team'),
  publishedAt: timestamp('published_at'),
  featuredImage: text('featured_image'),
  seoTitle: text('seo_title'),
  seoDescription: text('seo_description'),
  canonicalUrl: text('canonical_url'),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  developerId: uuid('developer_id').references(() => developers.id, { onDelete: 'set null' }),
  locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
  readingTimeMinutes: integer('reading_time_minutes').default(5).notNull(),
  contentVersion: integer('content_version').default(1).notNull(),
  factCheckStatus: text('fact_check_status').default('NOT_REVIEWED').notNull(), // 'NOT_REVIEWED' | 'REVIEWED' | 'NEEDS_UPDATE'
  structuredSections: jsonb('structured_sections'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_editorial_articles_type').on(table.type),
  index('idx_editorial_articles_slug').on(table.slug),
  index('idx_editorial_articles_status').on(table.status),
  index('idx_editorial_articles_project').on(table.projectId),
  index('idx_editorial_articles_developer').on(table.developerId),
  index('idx_editorial_articles_location').on(table.locationId),
]);

// Site Visits (Phase 17)
export const siteVisits = pgTable('site_visits', {
  id: text('id').primaryKey(),
  enquiryId: text('enquiry_id').references(() => enquiries.id, { onDelete: 'cascade' }).notNull(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
  configurationId: text('configuration_id'),
  listingId: text('listing_id'),
  visitType: text('visit_type').default('IN_PERSON').notNull(),
  preferredDate: text('preferred_date').notNull(),
  preferredTimeWindow: text('preferred_time_window').notNull(),
  status: text('status').default('REQUESTED').notNull(),
  buyerNote: text('buyer_note'),
  staffNote: text('staff_note'),
  assignedTo: text('assigned_to'),
  assignedToName: text('assigned_to_name'),
  rescheduleReason: text('reschedule_reason'),
  cancelReason: text('cancel_reason'),
  confirmedAt: timestamp('confirmed_at'),
  completedAt: timestamp('completed_at'),
  cancelledAt: timestamp('cancelled_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_site_visits_enquiry').on(table.enquiryId),
  index('idx_site_visits_customer').on(table.customerId),
  index('idx_site_visits_project').on(table.projectId),
  index('idx_site_visits_listing').on(table.listingId),
  index('idx_site_visits_status').on(table.status),
  index('idx_site_visits_date').on(table.preferredDate),
  index('idx_site_visits_created').on(table.createdAt),
]);

// Visitor & Customer 360 Intelligence
export const visitors = pgTable('visitors', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  linkedAt: timestamp('linked_at'),
  sessionCount: integer('session_count').default(1).notNull(),
  firstUtmSource: text('first_utm_source'),
  firstUtmMedium: text('first_utm_medium'),
  firstUtmCampaign: text('first_utm_campaign'),
  firstUtmTerm: text('first_utm_term'),
  firstUtmContent: text('first_utm_content'),
  firstReferrerUrl: text('first_referrer_url'),
  firstLandingPath: text('first_landing_path'),
  lastLandingPath: text('last_landing_path'),
  deviceClass: text('device_class').default('UNKNOWN').notNull(),
  browserFamily: text('browser_family'),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_visitors_customer_id').on(table.customerId),
  index('idx_visitors_last_seen_at').on(table.lastSeenAt),
  index('idx_visitors_first_seen_at').on(table.firstSeenAt),
  index('idx_visitors_utm_source').on(table.firstUtmSource),
]);

export const visitorSessions = pgTable('visitor_sessions', {
  id: text('id').primaryKey(),
  visitorId: text('visitor_id').references(() => visitors.id, { onDelete: 'cascade' }).notNull(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  utmTerm: text('utm_term'),
  utmContent: text('utm_content'),
  referrerUrl: text('referrer_url'),
  entryPath: text('entry_path'),
  exitPath: text('exit_path'),
  deviceClass: text('device_class').default('UNKNOWN').notNull(),
  browserFamily: text('browser_family'),
  ipHash: text('ip_hash'),
  pageViewCount: integer('page_view_count').default(0).notNull(),
  eventCount: integer('event_count').default(0).notNull(),
  durationSeconds: integer('duration_seconds').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_visitor_sessions_visitor_id').on(table.visitorId),
  index('idx_visitor_sessions_customer_id').on(table.customerId),
  index('idx_visitor_sessions_started_at').on(table.startedAt),
  index('idx_visitor_sessions_last_activity').on(table.lastActivityAt),
]);

export const visitorEvents = pgTable('visitor_events', {
  id: text('id').primaryKey(),
  visitorId: text('visitor_id').references(() => visitors.id, { onDelete: 'cascade' }).notNull(),
  sessionId: text('session_id').references(() => visitorSessions.id, { onDelete: 'cascade' }).notNull(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  pagePath: text('page_path'),
  pageTitle: text('page_title'),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  entitySlug: text('entity_slug'),
  areaBasis: text('area_basis'),
  durationSeconds: integer('duration_seconds'),
  clientEventId: text('client_event_id'),
  metadata: jsonb('metadata'),
  occurredAt: timestamp('occurred_at').defaultNow().notNull(),
}, (table) => [
  index('idx_visitor_events_visitor_occurred').on(table.visitorId, table.occurredAt),
  index('idx_visitor_events_customer_occurred').on(table.customerId, table.occurredAt),
  index('idx_visitor_events_session_occurred').on(table.sessionId, table.occurredAt),
  index('idx_visitor_events_type_occurred').on(table.eventType, table.occurredAt),
  index('idx_visitor_events_entity').on(table.entityType, table.entityId),
  uniqueIndex('uq_visitor_events_visitor_client_event').on(table.visitorId, table.clientEventId),
]);

// Customer Partner Profiles
export const customerPartnerProfiles = pgTable('customer_partner_profiles', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'restrict' }).notNull().unique(),
  status: text('status').default('PENDING').notNull(), // 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
  approvedByStaffId: text('approved_by_staff_id').references(() => staffUsers.id, { onDelete: 'set null' }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  suspensionReason: text('suspension_reason'),
  revocationReason: text('revocation_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_customer_partner_profiles_status').on(table.status),
  index('idx_customer_partner_profiles_customer').on(table.customerId),
]);

// Customer Partner Audit History
export const customerPartnerAuditHistory = pgTable('customer_partner_audit_history', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').references(() => customers.id, { onDelete: 'restrict' }).notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  actingStaffUserId: text('acting_staff_user_id').references(() => staffUsers.id, { onDelete: 'set null' }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_customer_partner_audit_customer').on(table.customerId),
  index('idx_customer_partner_audit_created').on(table.createdAt),
]);

// Property Submissions
export const propertySubmissions = pgTable('property_submissions', {
  id: text('id').primaryKey(),
  submitterCustomerId: text('submitter_customer_id').references(() => customers.id, { onDelete: 'restrict' }).notNull(),
  listingType: text('listing_type').notNull(), // 'RESALE' | 'RENTAL'
  listingSource: text('listing_source').notNull(), // 'OWNER' | 'PARTNER'
  submissionStatus: text('submission_status').default('DRAFT').notNull(), // 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWAL_REQUESTED' | 'WITHDRAWN'
  resaleListingId: text('resale_listing_id').references(() => resaleListings.id, { onDelete: 'restrict' }),
  rentalListingId: text('rental_listing_id').references(() => rentalListings.id, { onDelete: 'restrict' }),
  payload: jsonb('payload').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('uq_submission_id_customer').on(table.id, table.submitterCustomerId),
  index('idx_property_submissions_customer').on(table.submitterCustomerId),
  index('idx_property_submissions_status').on(table.submissionStatus),
  index('idx_property_submissions_source').on(table.listingSource),
  index('idx_property_submissions_resale').on(table.resaleListingId),
  index('idx_property_submissions_rental').on(table.rentalListingId),
  uniqueIndex('uq_resale_listing_submission').on(table.resaleListingId).where(sql`resale_listing_id IS NOT NULL`),
  uniqueIndex('uq_rental_listing_submission').on(table.rentalListingId).where(sql`rental_listing_id IS NOT NULL`),
]);

// Property Submission Reviews
export const propertySubmissionReviews = pgTable('property_submission_reviews', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').references(() => propertySubmissions.id, { onDelete: 'restrict' }).notNull(),
  staffUserId: text('staff_user_id').references(() => staffUsers.id, { onDelete: 'set null' }),
  eventType: text('event_type').notNull(),
  previousStatus: text('previous_status'),
  newStatus: text('new_status').notNull(),
  internalNote: text('internal_note'),
  submitterFeedback: text('submitter_feedback'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_property_submission_reviews_submission').on(table.submissionId),
  index('idx_property_submission_reviews_staff').on(table.staffUserId),
]);

// Partner Attestations
export const partnerAttestations = pgTable('partner_attestations', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull(),
  partnerCustomerId: text('partner_customer_id').notNull(),
  attestationVersion: text('attestation_version').default('v1.0').notNull(),
  declarationText: text('declaration_text').notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_partner_attestations_submission').on(table.submissionId),
  index('idx_partner_attestations_partner').on(table.partnerCustomerId),
]);


