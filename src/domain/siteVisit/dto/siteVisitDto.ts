import { SiteVisitType, SiteVisitStatus } from '../entities/siteVisitEntity';

export interface CustomerSiteVisitDTO {
  id: string;
  enquiryId: string;
  referenceNumber: string;
  propertyName?: string | null;
  propertySlug?: string | null;
  projectId?: string | null;
  listingId?: string | null;
  visitType: SiteVisitType;
  preferredDate: string;
  preferredTimeWindow: string;
  status: SiteVisitStatus;
  statusLabel: string;
  buyerNote?: string | null;
  rescheduleReason?: string | null;
  cancelReason?: string | null;
  confirmedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSiteVisitDTO extends CustomerSiteVisitDTO {
  customerId?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  buyerEmail?: string | null;
  staffNote?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
}
