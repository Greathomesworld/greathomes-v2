export type SiteVisitType = 'IN_PERSON' | 'VIRTUAL';

export type SiteVisitStatus =
  | 'REQUESTED'
  | 'CONFIRMED'
  | 'RESCHEDULE_REQUESTED'
  | 'RESCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export const SITE_VISIT_STATUS_LABELS: Record<SiteVisitStatus, string> = {
  REQUESTED: 'Request Received',
  CONFIRMED: 'Visit Confirmed',
  RESCHEDULE_REQUESTED: 'Reschedule Requested',
  RESCHEDULED: 'Rescheduled',
  COMPLETED: 'Visit Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No Show',
};

export const VALID_SITE_VISIT_TRANSITIONS: Record<SiteVisitStatus, SiteVisitStatus[]> = {
  REQUESTED: ['CONFIRMED', 'RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED'],
  CONFIRMED: ['RESCHEDULE_REQUESTED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  RESCHEDULE_REQUESTED: ['RESCHEDULED', 'CONFIRMED', 'CANCELLED'],
  RESCHEDULED: ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [],
  CANCELLED: ['REQUESTED'],
  NO_SHOW: ['RESCHEDULE_REQUESTED', 'REQUESTED'],
};

export function isValidSiteVisitTransition(current: SiteVisitStatus, next: SiteVisitStatus): boolean {
  if (current === next) return true;
  const allowed = VALID_SITE_VISIT_TRANSITIONS[current] || [];
  return allowed.includes(next);
}

export interface SiteVisitEntity {
  id: string;
  enquiryId: string;
  customerId?: string | null;
  projectId?: string | null;
  configurationId?: string | null;
  listingId?: string | null;
  visitType: SiteVisitType;
  preferredDate: string; // YYYY-MM-DD
  preferredTimeWindow: string; // 'MORNING', 'AFTERNOON', 'EVENING' or '09:00–12:00', '12:00–15:00', '15:00–18:00', '18:00–20:00'
  status: SiteVisitStatus;
  buyerNote?: string | null;
  staffNote?: string | null;
  assignedTo?: string | null;
  assignedToName?: string | null;
  rescheduleReason?: string | null;
  cancelReason?: string | null;
  confirmedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
