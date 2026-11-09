import type { StaffRole } from './roles';

export type StaffCapability =
  // Dashboard
  | 'dashboard.read'
  | 'VIEW_DASHBOARD'

  // Developers
  | 'developer.read'
  | 'developer.create'
  | 'developer.update'
  | 'developer.archive'
  | 'developer.delete'
  | 'MANAGE_DEVELOPERS'

  // Locations
  | 'location.read'
  | 'location.create'
  | 'location.update'
  | 'location.archive'
  | 'MANAGE_LOCATIONS'

  // Projects
  | 'project.read'
  | 'project.create'
  | 'project.update'
  | 'project.publish'
  | 'project.archive'
  | 'MANAGE_PROJECTS'

  // Configurations / Typologies
  | 'configuration.read'
  | 'configuration.create'
  | 'configuration.update'
  | 'configuration.archive'
  | 'MANAGE_CONFIGURATIONS'

  // RERA
  | 'rera.read'
  | 'rera.verify'
  | 'rera.revoke'
  | 'MANAGE_RERA'

  // Media
  | 'media.read'
  | 'media.create'
  | 'media.update'
  | 'media.delete'
  | 'media.manageHero'
  | 'media.manageFeatured'
  | 'MANAGE_MEDIA'

  // Amenities
  | 'amenity.read'
  | 'amenity.create'
  | 'amenity.update'
  | 'amenity.delete'

  // FAQ
  | 'faq.read'
  | 'faq.create'
  | 'faq.update'
  | 'faq.delete'

  // SEO
  | 'seo.read'
  | 'seo.create'
  | 'seo.update'
  | 'seo.publish'
  | 'MANAGE_SEO'

  // Resale Listings
  | 'resale.read'
  | 'resale.create'
  | 'resale.update'
  | 'resale.submit'
  | 'resale.review'
  | 'resale.approve'
  | 'resale.publish'
  | 'resale.archive'
  | 'resale.manageMedia'
  | 'resale.manageAmenities'
  | 'resale.manageVerification'
  | 'MANAGE_RESALE'

  // Rental Listings
  | 'rental.read'
  | 'rental.create'
  | 'rental.update'
  | 'rental.submit'
  | 'rental.review'
  | 'rental.approve'
  | 'rental.publish'
  | 'rental.archive'
  | 'rental.manageMedia'
  | 'rental.manageAmenities'
  | 'rental.manageVerification'
  | 'MANAGE_RENTAL'

  // Generic Listing Aliases (Phase 06.5 compatibility)
  | 'listing.read'
  | 'listing.create'
  | 'listing.update'
  | 'listing.submit'
  | 'listing.review'
  | 'listing.approve'
  | 'listing.publish'
  | 'listing.pause'
  | 'listing.archive'
  | 'listing.manageMedia'
  | 'listing.manageAmenities'
  | 'listing.manageVerification'

  // Enquiries
  | 'enquiry.read'
  | 'enquiry.create'
  | 'enquiry.update'
  | 'enquiry.assign'
  | 'enquiry.changeStatus'
  | 'enquiry.manageNotes'
  | 'enquiry.manageFollowUp'
  | 'enquiry.manageSiteVisit'
  | 'enquiry.delete'
  | 'VIEW_ENQUIRIES'
  | 'MANAGE_ENQUIRIES'

  // Staff / Authorization
  | 'staff.read'
  | 'staff.create'
  | 'staff.update'
  | 'staff.disable'
  | 'staff.assignRole'
  | 'staff.managePermissions'
  | 'MANAGE_STAFF'

  // Audit Logs
  | 'audit.read'

  // Visitor & Customer 360 Intelligence
  | 'customer_intelligence.read'
  | 'customer_intelligence.pii';

const ALL_RESALE_CAPS: StaffCapability[] = [
  'resale.read',
  'resale.create',
  'resale.update',
  'resale.submit',
  'resale.review',
  'resale.approve',
  'resale.publish',
  'resale.archive',
  'resale.manageMedia',
  'resale.manageAmenities',
  'resale.manageVerification',
  'MANAGE_RESALE',
];

const ALL_RENTAL_CAPS: StaffCapability[] = [
  'rental.read',
  'rental.create',
  'rental.update',
  'rental.submit',
  'rental.review',
  'rental.approve',
  'rental.publish',
  'rental.archive',
  'rental.manageMedia',
  'rental.manageAmenities',
  'rental.manageVerification',
  'MANAGE_RENTAL',
];

const ALL_LISTING_CAPS: StaffCapability[] = [
  'listing.read',
  'listing.create',
  'listing.update',
  'listing.submit',
  'listing.review',
  'listing.approve',
  'listing.publish',
  'listing.pause',
  'listing.archive',
  'listing.manageMedia',
  'listing.manageAmenities',
  'listing.manageVerification',
];

const ALL_ENQUIRY_CAPS: StaffCapability[] = [
  'VIEW_ENQUIRIES',
  'MANAGE_ENQUIRIES',
  'enquiry.read',
  'enquiry.create',
  'enquiry.update',
  'enquiry.assign',
  'enquiry.changeStatus',
  'enquiry.manageNotes',
  'enquiry.manageFollowUp',
  'enquiry.manageSiteVisit',
  'enquiry.delete',
];

const ALL_CAPABILITIES_LIST: StaffCapability[] = [
  'dashboard.read',
  'VIEW_DASHBOARD',
  'developer.read',
  'developer.create',
  'developer.update',
  'developer.archive',
  'developer.delete',
  'MANAGE_DEVELOPERS',
  'location.read',
  'location.create',
  'location.update',
  'location.archive',
  'MANAGE_LOCATIONS',
  'project.read',
  'project.create',
  'project.update',
  'project.publish',
  'project.archive',
  'MANAGE_PROJECTS',
  'configuration.read',
  'configuration.create',
  'configuration.update',
  'configuration.archive',
  'MANAGE_CONFIGURATIONS',
  'rera.read',
  'rera.verify',
  'rera.revoke',
  'MANAGE_RERA',
  'media.read',
  'media.create',
  'media.update',
  'media.delete',
  'media.manageHero',
  'media.manageFeatured',
  'MANAGE_MEDIA',
  'amenity.read',
  'amenity.create',
  'amenity.update',
  'amenity.delete',
  'faq.read',
  'faq.create',
  'faq.update',
  'faq.delete',
  'seo.read',
  'seo.create',
  'seo.update',
  'seo.publish',
  'MANAGE_SEO',
  ...ALL_RESALE_CAPS,
  ...ALL_RENTAL_CAPS,
  ...ALL_LISTING_CAPS,
  ...ALL_ENQUIRY_CAPS,
  'staff.read',
  'staff.create',
  'staff.update',
  'staff.disable',
  'staff.assignRole',
  'staff.managePermissions',
  'MANAGE_STAFF',
  'audit.read',
  'customer_intelligence.read',
  'customer_intelligence.pii',
];

export const ROLE_CAPABILITIES: Record<StaffRole, StaffCapability[]> = {
  SUPER_ADMIN: ALL_CAPABILITIES_LIST,
  ADMIN: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'developer.read',
    'developer.create',
    'developer.update',
    'developer.archive',
    'developer.delete',
    'MANAGE_DEVELOPERS',
    'location.read',
    'location.create',
    'location.update',
    'location.archive',
    'MANAGE_LOCATIONS',
    'project.read',
    'project.create',
    'project.update',
    'project.publish',
    'project.archive',
    'MANAGE_PROJECTS',
    'configuration.read',
    'configuration.create',
    'configuration.update',
    'configuration.archive',
    'MANAGE_CONFIGURATIONS',
    'rera.read',
    'rera.verify',
    'rera.revoke',
    'MANAGE_RERA',
    'media.read',
    'media.create',
    'media.update',
    'media.delete',
    'media.manageHero',
    'media.manageFeatured',
    'MANAGE_MEDIA',
    'amenity.read',
    'amenity.create',
    'amenity.update',
    'amenity.delete',
    'faq.read',
    'faq.create',
    'faq.update',
    'faq.delete',
    'seo.read',
    'seo.create',
    'seo.update',
    'seo.publish',
    'MANAGE_SEO',
    ...ALL_RESALE_CAPS,
    ...ALL_RENTAL_CAPS,
    ...ALL_LISTING_CAPS,
    ...ALL_ENQUIRY_CAPS,
    'staff.read',
    'audit.read',
    'customer_intelligence.read',
    'customer_intelligence.pii',
  ],
  CONTENT_MANAGER: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'developer.read',
    'developer.create',
    'developer.update',
    'MANAGE_DEVELOPERS',
    'location.read',
    'location.create',
    'location.update',
    'MANAGE_LOCATIONS',
    'project.read',
    'project.create',
    'project.update',
    'project.publish',
    'MANAGE_PROJECTS',
    'configuration.read',
    'configuration.create',
    'configuration.update',
    'MANAGE_CONFIGURATIONS',
    'media.read',
    'media.create',
    'media.update',
    'media.delete',
    'media.manageHero',
    'media.manageFeatured',
    'MANAGE_MEDIA',
    'amenity.read',
    'amenity.create',
    'amenity.update',
    'amenity.delete',
    'faq.read',
    'faq.create',
    'faq.update',
    'faq.delete',
    'seo.read',
    'seo.create',
    'seo.update',
    'seo.publish',
    'MANAGE_SEO',
    'rera.read',
    'resale.read',
    'resale.manageMedia',
    'rental.read',
    'rental.manageMedia',
    'listing.read',
    'listing.manageMedia',
    'VIEW_ENQUIRIES',
    'enquiry.read',
    'audit.read',
  ],
  PROPERTY_MANAGER: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'developer.read',
    'location.read',
    'location.update',
    'project.read',
    'project.create',
    'project.update',
    'project.publish',
    'project.archive',
    'MANAGE_PROJECTS',
    'configuration.read',
    'configuration.create',
    'configuration.update',
    'configuration.archive',
    'MANAGE_CONFIGURATIONS',
    'rera.read',
    'rera.verify',
    'rera.revoke',
    'MANAGE_RERA',
    'media.read',
    'media.create',
    'media.update',
    'media.delete',
    'media.manageHero',
    'media.manageFeatured',
    'MANAGE_MEDIA',
    'amenity.read',
    'amenity.create',
    'amenity.update',
    'amenity.delete',
    'faq.read',
    'faq.create',
    'faq.update',
    'faq.delete',
    ...ALL_RESALE_CAPS,
    ...ALL_RENTAL_CAPS,
    ...ALL_LISTING_CAPS,
    'VIEW_ENQUIRIES',
    'enquiry.read',
    'audit.read',
  ],
  SALES_MANAGER: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'project.read',
    'configuration.read',
    'developer.read',
    'location.read',
    'media.read',
    'resale.read',
    'resale.create',
    'resale.update',
    'resale.submit',
    'resale.review',
    'rental.read',
    'rental.create',
    'rental.update',
    'rental.submit',
    'rental.review',
    'listing.read',
    'listing.create',
    'listing.update',
    'listing.submit',
    'listing.review',
    'VIEW_ENQUIRIES',
    'MANAGE_ENQUIRIES',
    'enquiry.read',
    'enquiry.create',
    'enquiry.update',
    'enquiry.assign',
    'enquiry.changeStatus',
    'enquiry.manageNotes',
    'enquiry.manageFollowUp',
    'enquiry.manageSiteVisit',
    'customer_intelligence.read',
    'customer_intelligence.pii',
  ],
  SALES_EXECUTIVE: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'project.read',
    'configuration.read',
    'developer.read',
    'location.read',
    'media.read',
    'resale.read',
    'resale.create',
    'resale.update',
    'resale.submit',
    'rental.read',
    'rental.create',
    'rental.update',
    'rental.submit',
    'listing.read',
    'listing.create',
    'listing.update',
    'listing.submit',
    'VIEW_ENQUIRIES',
    'enquiry.read',
    'enquiry.create',
    'enquiry.update',
    'enquiry.changeStatus',
    'enquiry.manageNotes',
    'enquiry.manageFollowUp',
    'enquiry.manageSiteVisit',
    'customer_intelligence.read',
    'customer_intelligence.pii',
  ],
  TELECALLER: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'project.read',
    'configuration.read',
    'developer.read',
    'location.read',
    'resale.read',
    'rental.read',
    'listing.read',
    'VIEW_ENQUIRIES',
    'enquiry.read',
    'enquiry.create',
    'enquiry.changeStatus',
    'enquiry.manageNotes',
    'enquiry.manageFollowUp',
    // Telecaller has calling and follow-up permissions, but explicitly lacks enquiry.assign,
    // bulk export, site-visit reassignment, and customer_intelligence.pii full export.
  ],
  SALES: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'project.read',
    'configuration.read',
    'developer.read',
    'location.read',
    'media.read',
    'resale.read',
    'resale.create',
    'resale.update',
    'resale.submit',
    'rental.read',
    'rental.create',
    'rental.update',
    'rental.submit',
    'listing.read',
    'listing.create',
    'listing.update',
    'listing.submit',
    'VIEW_ENQUIRIES',
    'MANAGE_ENQUIRIES',
    'enquiry.read',
    'enquiry.create',
    'enquiry.update',
    'enquiry.assign',
    'enquiry.changeStatus',
    'enquiry.manageNotes',
    'enquiry.manageFollowUp',
    'enquiry.manageSiteVisit',
    'customer_intelligence.read',
    'customer_intelligence.pii',
  ],
  ANALYST: [
    'dashboard.read',
    'VIEW_DASHBOARD',
    'project.read',
    'configuration.read',
    'developer.read',
    'location.read',
    'resale.read',
    'rental.read',
    'listing.read',
    'customer_intelligence.read',
  ],
};

export function getAllCapabilities(): StaffCapability[] {
  return [...ALL_CAPABILITIES_LIST];
}

export function getRoleCapabilities(role: StaffRole): StaffCapability[] {
  if (role === 'SUPER_ADMIN') {
    return ALL_CAPABILITIES_LIST;
  }
  return ROLE_CAPABILITIES[role] || [];
}

export function hasCapability(role: StaffRole, capability: StaffCapability): boolean {
  if (role === 'SUPER_ADMIN') return true;

  const caps = getRoleCapabilities(role);
  if (caps.includes(capability)) return true;

  // Cross-alias checks for legacy & specialized capabilities
  if (capability === 'dashboard.read' && caps.includes('VIEW_DASHBOARD')) return true;
  if (capability === 'VIEW_DASHBOARD' && caps.includes('dashboard.read')) return true;

  if (capability.startsWith('listing.')) {
    const sub = capability.replace('listing.', '');
    if (caps.includes(`resale.${sub}` as StaffCapability) || caps.includes(`rental.${sub}` as StaffCapability)) {
      return true;
    }
  }

  if (capability.startsWith('resale.') || capability.startsWith('rental.')) {
    const sub = capability.replace(/^(resale|rental)\./, '');
    if (caps.includes(`listing.${sub}` as StaffCapability)) {
      return true;
    }
  }

  return false;
}

export function hasAnyCapability(role: StaffRole, capabilities: StaffCapability[]): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return capabilities.some((cap) => hasCapability(role, cap));
}

export function hasAllCapabilities(role: StaffRole, capabilities: StaffCapability[]): boolean {
  if (role === 'SUPER_ADMIN') return true;
  return capabilities.every((cap) => hasCapability(role, cap));
}

export function assertCapability(role: StaffRole, capability: StaffCapability): void {
  if (!hasCapability(role, capability)) {
    throw new Error(`Forbidden: role '${role}' does not have capability '${capability}'`);
  }
}

export interface StaffSessionContext {
  authenticated: boolean;
  role: StaffRole;
  displayName: string;
  capabilities: StaffCapability[];
}
