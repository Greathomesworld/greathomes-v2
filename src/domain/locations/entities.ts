export type LocationType = 'STATE' | 'DISTRICT' | 'CITY' | 'DISCOVERY_REGION' | 'AREA' | 'NEIGHBOURHOOD';
export type LocationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface Location {
  id: string;
  name: string;
  slug: string;
  type: LocationType;
  parentId?: string | null;
  description?: string | null;
  shortDescription?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  geometry?: string | null;
  status: LocationStatus;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
}
