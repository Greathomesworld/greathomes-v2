export type CustomerPreferenceDto = any;
export type RecentlyViewedDto = any;
export type SavedItemDto = any;

export type VisitorDeviceClass = 'MOBILE' | 'TABLET' | 'DESKTOP' | 'UNKNOWN';

/**
 * Canonical Area Basis values in Great Homes V2.
 * Carpet, Built-Up, and Super Built-Up area bases must never be mixed in analytics or comparisons.
 */
export type AreaBasisType = 'CARPET' | 'BUILT_UP' | 'SUPER_BUILT_UP';

export const VISITOR_EVENT_TYPES = [
  'PAGE_VIEW',
  'PROJECT_VIEW',
  'RESALE_LISTING_VIEW',
  'RENTAL_LISTING_VIEW',
  'LOCATION_VIEW',
  'DEVELOPER_VIEW',
  'SEARCH_EXECUTED',
  'FILTER_APPLIED',
  'ITEM_SAVED',
  'ITEM_UNSAVED',
  'PROJECT_WATCHED',
  'PROJECT_UNWATCHED',
  'LOCATION_WATCHED',
  'LOCATION_UNWATCHED',
  'COMPARE_ADDED',
  'COMPARE_REMOVED',
  'COMPARE_VIEWED',
  'ENQUIRY_MODAL_OPENED',
  'ENQUIRY_STEP_COMPLETED',
  'ENQUIRY_SUBMITTED',
  'SITE_VISIT_REQUESTED',
  'BROCHURE_CLICKED',
  'BROCHURE_MODAL_OPENED',
  'BROCHURE_REQUEST_SUBMITTED',
  'BROCHURE_DOWNLOAD_INITIATED',
  'OTP_REQUESTED',
  'OTP_VERIFIED',
  'PROFILE_COMPLETED',
  'PREFERENCES_UPDATED',
] as const;

export type VisitorEventType = (typeof VISITOR_EVENT_TYPES)[number];

export type VisitorEntityType =
  | 'PROJECT'
  | 'RESALE_LISTING'
  | 'RENTAL_LISTING'
  | 'LOCATION'
  | 'DEVELOPER'
  | 'PAGE'
  | 'SEARCH'
  | 'COMPARISON'
  | 'ENQUIRY'
  | 'SITE_VISIT';

export interface VisitorEntity {
  id: string;
  customerId: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  linkedAt: Date | null;
  sessionCount: number;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
  firstUtmTerm: string | null;
  firstUtmContent: string | null;
  firstReferrerUrl: string | null;
  firstLandingPath: string | null;
  lastLandingPath: string | null;
  deviceClass: VisitorDeviceClass;
  browserFamily: string | null;
  ipHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorSessionEntity {
  id: string;
  visitorId: string;
  customerId: string | null;
  startedAt: Date;
  lastActivityAt: Date;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  referrerUrl: string | null;
  entryPath: string | null;
  exitPath: string | null;
  deviceClass: VisitorDeviceClass;
  browserFamily: string | null;
  ipHash: string | null;
  pageViewCount: number;
  eventCount: number;
  durationSeconds: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface VisitorEventEntity {
  id: string;
  visitorId: string;
  sessionId: string;
  customerId: string | null;
  eventType: VisitorEventType;
  pagePath: string | null;
  pageTitle: string | null;
  entityType: VisitorEntityType | null;
  entityId: string | null;
  entitySlug: string | null;
  areaBasis: AreaBasisType | null;
  durationSeconds: number | null;
  clientEventId: string | null;
  metadata: Record<string, any> | null;
  occurredAt: Date;
}

export interface IngestTelemetryEventInput {
  visitorId?: string;
  sessionId?: string;
  eventType: VisitorEventType;
  pagePath?: string;
  pageTitle?: string;
  referrerUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  entityType?: VisitorEntityType | null;
  entityId?: string | null;
  entitySlug?: string | null;
  areaBasis?: AreaBasisType | null;
  durationSeconds?: number | null;
  clientEventId?: string | null;
  deviceClass?: VisitorDeviceClass;
  metadata?: Record<string, any> | null;
}

/**
 * Explainable, factual behavioral signal indicator (never a speculative 0-100 score).
 */
export interface EvidenceIndicatorDto {
  code:
    | 'OTP_VERIFIED_MOBILE'
    | 'REPEATED_VIEWS'
    | 'SAVED_PROPERTY'
    | 'WATCHED_LOCATION'
    | 'PROPERTY_COMPARISON'
    | 'ENQUIRY_SUBMITTED'
    | 'ENQUIRY_STARTED_UNSUBMITTED'
    | 'SITE_VISIT_REQUESTED'
    | 'RETURNING_VISITOR';
  label: string;
  detail: string;
  tone: 'emerald' | 'amber' | 'slate';
}

export interface CustomerIntentSummaryDto {
  explicitChoices: {
    preferredMode: string;
    preferredLocations: string[];
    preferredBhk: string[];
    preferredPropertyTypes: string[];
    budgetMin: number | null;
    budgetMax: number | null;
    savedResourcesCount: number;
    watchedLocations: string[];
    watchedProjects: string[];
  };
  observedSignals: {
    mostViewedLocations: Array<{ name: string; count: number }>;
    mostSearchedBhk: Array<{ bhk: string; count: number }>;
    mostViewedPropertyTypes: Array<{ propertyType: string; count: number }>;
    observedPriceRange: {
      minPrice: number | null;
      maxPrice: number | null;
    };
    areaBasisBreakdown: Array<{
      areaBasis: AreaBasisType;
      eventCount: number;
      minSqft: number | null;
      maxSqft: number | null;
    }>;
    comparisonCount: number;
    repeatedPropertyViews: Array<{
      entityType: string;
      entityId: string;
      title: string;
      slug: string | null;
      viewCount: number;
      lastViewedAt: string;
    }>;
  };
  evidenceIndicators: EvidenceIndicatorDto[];
}

export interface AttributionSummaryDto {
  firstTouch: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrerUrl: string | null;
    landingPath: string | null;
    firstSeenAt: string;
  };
  latestTouch: {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrerUrl: string | null;
    landingPath: string | null;
    lastSeenAt: string;
  };
  totalSessions: number;
  linkedVisitorIds: string[];
  devicesUsed: VisitorDeviceClass[];
}

export interface CustomerTimelineItemDto {
  id: string;
  occurredAt: string;
  category:
    | 'PROPERTY_VIEWS'
    | 'SEARCH_FILTERS'
    | 'SHORTLIST_COMPARE'
    | 'ENQUIRIES_VISITS'
    | 'AUTH_SESSION';
  eventType: string;
  title: string;
  subtitle: string | null;
  entityType: string | null;
  entityId: string | null;
  entitySlug: string | null;
  areaBasis: AreaBasisType | null;
  visitorId: string | null;
  sessionId: string | null;
  isPreAuthAnonymous: boolean;
  metadata?: Record<string, any>;
}

export interface CustomerEnquirySummaryDto {
  id: string;
  referenceNumber: string;
  contextType: string;
  propertyName: string;
  propertySlug: string | null;
  configuration: string | null;
  priceDisplay: string | null;
  locationName: string | null;
  status: string;
  statusLabel: string;
  priority: string;
  assignedTo: string | null;
  assignedToName: string | null;
  nextFollowUpAt: string | null;
  requestSiteVisit: boolean;
  siteVisitId: string | null;
  message?: string | null;
  createdAt: string;
  associationType:
    | 'VERIFIED_CUSTOMER_SESSION'
    | 'VERIFIED_VISITOR_LINEAGE'
    | 'PHONE_MATCH_CANDIDATE';
  associationReason: string;
}

export interface CustomerSiteVisitSummaryDto {
  id: string;
  enquiryId: string;
  projectId: string | null;
  projectName: string;
  visitType: string;
  status: string;
  preferredDate: string;
  preferredTimeWindow: string;
  confirmedDate: string | null;
  confirmedTimeWindow: string | null;
  assignedStaffName: string | null;
  createdAt: string;
}

export interface CustomerDirectoryItemDto {
  id: string;
  name: string;
  phone: string | null;
  email: string;
  status: string;
  createdAt: string;
  lastActiveAt: string;
  linkedVisitorCount: number;
  sessionCount: number;
  propertyViewCount: number;
  savedCount: number;
  watchedProjectsCount: number;
  watchedLocationsCount: number;
  enquiryCount: number;
  siteVisitCount: number;
  preferredMode: string;
  preferredLocations: string[];
  preferredBhk: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  firstTouchSource: string | null;
  evidenceIndicators: EvidenceIndicatorDto[];
}

export interface Customer360ProfileDto {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string;
    phoneMasked: string | null;
    emailMasked: string | null;
    piiRedacted: boolean;
    status: string;
    createdAt: string;
    lastActiveAt: string;
  };
  summaryCounts: {
    sessions: number;
    propertyViews: number;
    searchesAndFilters: number;
    comparisons: number;
    savedItems: number;
    watchedProjects: number;
    watchedLocations: number;
    verifiedEnquiries: number;
    phoneMatchedEnquiryCandidates: number;
    siteVisits: number;
  };
  attribution: AttributionSummaryDto;
  intent: CustomerIntentSummaryDto;
  preferences: CustomerPreferenceDto;
  savedItems: SavedItemDto[];
  watchedProjects: any[];
  watchedLocations: any[];
  recentlyViewed: RecentlyViewedDto[];
  verifiedEnquiries: CustomerEnquirySummaryDto[];
  phoneMatchedEnquiryCandidates: CustomerEnquirySummaryDto[];
  siteVisits: CustomerSiteVisitSummaryDto[];
  linkedVisitors: Array<{
    id: string;
    firstSeenAt: string;
    lastSeenAt: string;
    linkedAt: string | null;
    sessionCount: number;
    firstUtmSource: string | null;
    firstUtmMedium: string | null;
    firstUtmCampaign: string | null;
    firstLandingPath: string | null;
    deviceClass: VisitorDeviceClass;
    browserFamily: string | null;
  }>;
  sessions: Array<{
    id: string;
    visitorId: string;
    startedAt: string;
    lastActivityAt: string;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    referrerUrl: string | null;
    entryPath: string | null;
    exitPath: string | null;
    deviceClass: VisitorDeviceClass;
    browserFamily: string | null;
    pageViewCount: number;
    eventCount: number;
    durationSeconds: number;
  }>;
  timeline: CustomerTimelineItemDto[];
}

export interface VisitorIntelligenceOverviewDto {
  kpis: {
    totalVisitors: number;
    anonymousVisitors: number;
    authenticatedVisitors: number;
    returningVisitors: number;
    totalCustomers: number;
    totalSessions: number;
    totalPropertyViews: number;
    totalSearches: number;
    totalShortlists: number;
    totalComparisons: number;
    customersWithEnquiries: number;
    customersWithSiteVisits: number;
  };
  funnel: Array<{
    stage: string;
    label: string;
    count: number;
    conversionRateFromPrevious: number;
    conversionRateFromTop: number;
  }>;
  topViewedProjects: Array<{
    entityId: string;
    title: string;
    slug: string | null;
    views: number;
    uniqueVisitors: number;
  }>;
  topViewedListings: Array<{
    entityId: string;
    entityType: string;
    title: string;
    slug: string | null;
    views: number;
    uniqueVisitors: number;
  }>;
  topLocations: Array<{
    locationId: string;
    name: string;
    slug: string | null;
    views: number;
    uniqueVisitors: number;
  }>;
  topSearchFilters: Array<{
    label: string;
    count: number;
  }>;
  trafficSources: Array<{
    source: string;
    medium: string;
    visitors: number;
    authenticatedCustomers: number;
  }>;
  deviceBreakdown: Array<{
    deviceClass: VisitorDeviceClass;
    count: number;
    percentage: number;
  }>;
}

export interface CustomerDirectoryFilterDto {
  search?: string;
  hasEnquiry?: boolean;
  hasSiteVisit?: boolean;
  hasSavedItems?: boolean;
  preferredLocation?: string;
  preferredBhk?: string;
  activeWithinDays?: number;
  status?: string;
  sortBy?: 'lastActiveAt' | 'createdAt' | 'enquiryCount' | 'propertyViewCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface VisitorDetailDto {
  visitor: {
    id: string;
    customerId: string | null;
    firstSeenAt: string;
    lastSeenAt: string;
    linkedAt: string | null;
    sessionCount: number;
    firstUtmSource: string | null;
    firstUtmMedium: string | null;
    firstUtmCampaign: string | null;
    firstReferrerUrl: string | null;
    firstLandingPath: string | null;
    lastLandingPath: string | null;
    deviceClass: VisitorDeviceClass;
    browserFamily: string | null;
  };
  linkedCustomer: {
    id: string;
    name: string;
    phoneMasked: string | null;
  } | null;
  sessions: Array<{
    id: string;
    startedAt: string;
    lastActivityAt: string;
    entryPath: string | null;
    exitPath: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    deviceClass: VisitorDeviceClass;
    browserFamily: string | null;
    pageViewCount: number;
    eventCount: number;
    durationSeconds: number;
  }>;
  events: Array<{
    id: string;
    sessionId: string;
    eventType: VisitorEventType;
    pagePath: string | null;
    pageTitle: string | null;
    entityType: string | null;
    entityId: string | null;
    entitySlug: string | null;
    areaBasis: AreaBasisType | null;
    durationSeconds: number | null;
    metadata: Record<string, any> | null;
    occurredAt: string;
  }>;
  enquiries: CustomerEnquirySummaryDto[];
}
