export type EnquiryContextType = 'PROJECT' | 'CONFIGURATION' | 'RESALE' | 'RENTAL' | 'GENERAL';

export type PreferredContactMethod = 'WHATSAPP' | 'PHONE' | 'EMAIL';

export type EnquiryStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'SITE_VISIT_SCHEDULED'
  | 'SITE_VISIT_COMPLETED'
  | 'NEGOTIATION'
  | 'CONVERTED'
  | 'LOST'
  | 'CLOSED'
  | 'RECEIVED' // Backward-compatible alias for NEW
  | 'IN_REVIEW'; // Backward-compatible alias for QUALIFIED

export type EnquiryPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const ENQUIRY_STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: 'New Enquiry',
  RECEIVED: 'New Enquiry',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  IN_REVIEW: 'Under Review',
  SITE_VISIT_SCHEDULED: 'Site Visit Scheduled',
  SITE_VISIT_COMPLETED: 'Site Visit Completed',
  NEGOTIATION: 'In Negotiation',
  CONVERTED: 'Converted',
  LOST: 'Lost',
  CLOSED: 'Closed',
};

export const ENQUIRY_PRIORITY_LABELS: Record<EnquiryPriority, string> = {
  LOW: 'Low Priority',
  NORMAL: 'Normal',
  HIGH: 'High Priority',
  URGENT: 'Urgent',
};

export const VALID_STATUS_TRANSITIONS: Record<string, EnquiryStatus[]> = {
  NEW: ['CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED', 'LOST', 'CLOSED'],
  RECEIVED: ['NEW', 'CONTACTED', 'QUALIFIED', 'SITE_VISIT_SCHEDULED', 'LOST', 'CLOSED'],
  CONTACTED: ['QUALIFIED', 'SITE_VISIT_SCHEDULED', 'NEGOTIATION', 'LOST', 'CLOSED'],
  QUALIFIED: ['SITE_VISIT_SCHEDULED', 'NEGOTIATION', 'CONVERTED', 'LOST', 'CLOSED'],
  IN_REVIEW: ['QUALIFIED', 'CONTACTED', 'SITE_VISIT_SCHEDULED', 'LOST', 'CLOSED'],
  SITE_VISIT_SCHEDULED: ['SITE_VISIT_COMPLETED', 'CONTACTED', 'NEGOTIATION', 'LOST', 'CLOSED'],
  SITE_VISIT_COMPLETED: ['QUALIFIED', 'NEGOTIATION', 'CONVERTED', 'LOST', 'CLOSED'],
  NEGOTIATION: ['CONVERTED', 'SITE_VISIT_SCHEDULED', 'LOST', 'CLOSED'],
  CONVERTED: ['CLOSED', 'NEGOTIATION'],
  LOST: ['NEW', 'CONTACTED'],
  CLOSED: ['NEW', 'CONTACTED'],
};

export function isValidEnquiryStatusTransition(current: EnquiryStatus, next: EnquiryStatus): boolean {
  if (current === next) return true;
  const allowed = VALID_STATUS_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export interface EnquiryEntity {
  id: string;
  contextType: EnquiryContextType;
  customerId?: string | null;
  visitorId?: string | null;
  sessionId?: string | null;

  // Referenced Project / Listing / Configuration Snapshot
  projectId?: string | null;
  projectSlug?: string | null;
  projectName?: string | null;
  configurationId?: string | null;

  listingId?: string | null;
  listingSlug?: string | null;
  listingTitle?: string | null;
  configuration?: string | null;
  propertyType?: string | null;
  priceDisplay?: string | null;
  locationName?: string | null;

  // Buyer Information (Strictly Staff-facing internally)
  buyerName: string;
  buyerPhone: string;
  buyerEmail?: string | null;
  preferredContact: PreferredContactMethod;
  requestSiteVisit: boolean;
  message?: string | null;

  // Operational & Admin Management Fields
  status: EnquiryStatus;
  priority: EnquiryPriority;
  assignedTo?: string | null;
  assignedToName?: string | null;
  source?: string | null;
  sourcePage?: string | null;
  internalNotes?: string | null;
  lastContactedAt?: Date | null;
  nextFollowUpAt?: Date | null;
  siteVisitId?: string | null;
  metadata?: Record<string, any> | null;

  createdAt: Date;
  updatedAt: Date;
}
