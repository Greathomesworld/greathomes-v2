import { EnquiryContextType, EnquiryPriority, EnquiryStatus, PreferredContactMethod } from '../entities/enquiryEntity';

export interface CreateEnquiryRequestDto {
  contextType: EnquiryContextType;

  // Reference slugs / identifiers
  projectId?: string;
  projectSlug?: string;
  listingId?: string;
  listingSlug?: string;
  configurationId?: string;

  // Buyer Details
  name: string;
  phone: string;
  email?: string;
  preferredContact?: PreferredContactMethod;
  requestSiteVisit?: boolean;
  message?: string;

  // Buyer Requirements (Phase 17)
  budgetMin?: number;
  budgetMax?: number;
  preferredBhk?: string;
  propertyType?: string;
  preferredLocationId?: string;
  purchaseTimeline?: 'IMMEDIATE' | 'WITHIN_3_MONTHS' | '3_TO_6_MONTHS' | '6_TO_12_MONTHS' | 'MORE_THAN_12_MONTHS' | 'NOT_DECIDED';
  purpose?: 'SELF_USE' | 'FAMILY_USE' | 'OTHER';

  // Site Visit Request (Phase 17)
  preferredDate?: string;
  preferredTimeWindow?: string;
  visitType?: 'IN_PERSON' | 'VIRTUAL';
  buyerNote?: string;

  // Customer & Visitor linkage
  customerId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;

  // Source attribution & consent
  source?: string;
  sourcePage?: string;
  marketingConsent?: boolean;
}

export interface PublicEnquiryContextDto {
  contextType: EnquiryContextType;
  title: string;
  subtitle?: string;
  projectId?: string;
  projectName?: string;
  projectSlug?: string;
  listingId?: string;
  listingSlug?: string;
  configuration?: string;
  propertyType?: string;
  priceDisplay?: string;
  locationName?: string;
  configurationId?: string;
  requestSiteVisit?: boolean;
  preferredContact?: PreferredContactMethod;
  sourcePage?: string;
  inquiryIntent?: 'STANDARD' | 'REQUEST_SPECS';
}

export interface CreateEnquiryResponseDto {
  success: boolean;
  message: string;
  enquiryId?: string;
  referenceNumber?: string;
  siteVisitId?: string;
  siteVisitStatus?: string;
}

export interface CustomerEnquiryDto {
  id: string;
  referenceNumber: string;
  contextType: EnquiryContextType;
  propertyName?: string | null;
  propertySlug?: string | null;
  listingSlug?: string | null;
  configuration?: string | null;
  priceDisplay?: string | null;
  locationName?: string | null;
  status: EnquiryStatus;
  statusLabel: string;
  message?: string | null;
  siteVisitId?: string | null;
  siteVisitStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminEnquiryFilterDto {
  search?: string;
  status?: string;
  priority?: string;
  contextType?: string;
  assignedTo?: string;
  customerId?: string;
  visitorId?: string;
  buyerPhone?: string;
  dateRange?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AdminEnquiryMetricsDto {
  total: number;
  newCount: number;
  contactedCount: number;
  qualifiedCount: number;
  siteVisitsCount: number;
  convertedCount: number;
  lostCount: number;
  closedCount: number;
  urgentCount: number;
}

export interface UpdateEnquiryRequestDto {
  status?: EnquiryStatus;
  priority?: EnquiryPriority;
  customerId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  internalNotes?: string | null;
  lastContactedAt?: string | Date | null;
  nextFollowUpAt?: string | Date | null;
  siteVisitId?: string | null;
  requestSiteVisit?: boolean;
}
