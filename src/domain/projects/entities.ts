export type ProjectStatus = 'UPCOMING' | 'NEW_LAUNCH' | 'UNDER_CONSTRUCTION' | 'READY_TO_MOVE' | 'COMPLETED' | 'SOLD_OUT';
export type ProjectLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type PropertyType = 'APARTMENT' | 'FLAT' | 'VILLA' | 'INDEPENDENT_HOUSE' | 'PLOT' | 'DUPLEX' | 'PENTHOUSE';
export type PriceBasis = 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA';
export type ReraStatus = 'NOT_PROVIDED' | 'PROVIDED' | 'VERIFIED';
export type ProjectMediaCategory =
  | 'EXTERIOR'
  | 'INTERIOR'
  | 'AMENITIES'
  | 'CLUBHOUSE'
  | 'LOCATION'
  | 'FLOOR_PLANS'
  | 'MASTER_PLAN'
  | 'CONSTRUCTION'
  | 'WALKTHROUGH'
  | 'BROCHURE'
  | 'OTHER';

export interface Project {
  id: string;
  developerId: string;
  locationId: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  status: ProjectStatus;
  lifecycleStatus?: ProjectLifecycleStatus;
  propertyType: PropertyType;
  startingPrice?: number;
  projectArea?: string | null;
  towerCount?: number | null;
  totalUnits?: number | null;
  floors?: string | null;
  possession?: string | null;
  possessionDate?: Date | string | null;
  latitude?: number | null;
  longitude?: number | null;
  isPublished?: boolean;
  featured?: boolean;
  reraStatus?: ReraStatus;
  reraRegistrationNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectConfiguration {
  id: string;
  projectId: string;
  name: string;
  bedroomCount?: number | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  price: number;
  priceBasis: PriceBasis;
  floorPlanMediaId?: string | null;
  availability?: string; // 'AVAILABLE' | 'FEW_UNITS_LEFT' | 'SOLD_OUT'
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectRera {
  id: string;
  projectId: string;
  status: ReraStatus;
  authority?: string | null;
  registrationNumber?: string | null;
  verifiedAt?: Date | null;
  verifiedBy?: string | null; // private internal
  internalNotes?: string | null; // private internal
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectMedia {
  id: string;
  projectId: string;
  mediaId?: string | null;
  configurationId?: string | null;
  mediaType: string;
  category: ProjectMediaCategory;
  url: string;
  altText?: string | null;
  caption?: string | null;
  sortOrder: number;
  isFeatured: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Amenity {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectAmenity {
  id: string;
  projectId: string;
  amenityId: string;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectFaq {
  id: string;
  projectId: string;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSeo {
  id: string;
  projectId: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  canonicalUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConsiderationSection = 'WHY_CONSIDER' | 'THINGS_TO_KEEP_IN_MIND';
export type ConsiderationSourceType = 'GENERATED' | 'EDITORIAL';

export interface ProjectConsideration {
  id: string;
  projectId: string;
  section: ConsiderationSection;
  title: string;
  description: string;
  sourceType: ConsiderationSourceType;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

