/**
 * Places & Spatial Connectivity Domain Entities
 *
 * Defines canonical data contracts for verified Points of Interest (POIs),
 * categories, and spatial distance representations in Great Homes V2.
 */

import {
  DistanceCalculationMethod,
  RouteAvailabilityStatus,
  RoutingProviderId,
} from './routing/types';

export type PlaceCategory =
  | 'METRO'
  | 'AIRPORT'
  | 'TRANSIT'
  | 'EDUCATION'
  | 'HEALTHCARE'
  | 'COMMERCIAL'
  | 'RETAIL'
  | 'RECREATION'
  | 'LANDMARK';

export interface PlaceCategoryMeta {
  key: PlaceCategory;
  label: string;
  shortLabel: string;
  icon: string;
  description: string;
}

export const PLACE_CATEGORY_REGISTRY: Record<PlaceCategory, PlaceCategoryMeta> = {
  METRO: {
    key: 'METRO',
    label: 'Metro Stations',
    shortLabel: 'Metro',
    icon: 'train',
    description: 'Rapid transit and metro network stations',
  },
  AIRPORT: {
    key: 'AIRPORT',
    label: 'Airports',
    shortLabel: 'Airport',
    icon: 'plane',
    description: 'International and domestic aviation hubs',
  },
  TRANSIT: {
    key: 'TRANSIT',
    label: 'Transit & Mobility',
    shortLabel: 'Transit',
    icon: 'bus',
    description: 'Bus terminals, railway stations, and arterial corridors',
  },
  EDUCATION: {
    key: 'EDUCATION',
    label: 'Schools & Universities',
    shortLabel: 'Education',
    icon: 'graduation-cap',
    description: 'Accredited schools, colleges, and university campuses',
  },
  HEALTHCARE: {
    key: 'HEALTHCARE',
    label: 'Hospitals & Medical Care',
    shortLabel: 'Healthcare',
    icon: 'cross',
    description: 'Multispeciality hospitals, clinics, and medical centers',
  },
  COMMERCIAL: {
    key: 'COMMERCIAL',
    label: 'Business Hubs & IT Parks',
    shortLabel: 'Business',
    icon: 'building-2',
    description: 'Commercial districts, IT SEZs, and corporate business parks',
  },
  RETAIL: {
    key: 'RETAIL',
    label: 'Shopping & Retail Malls',
    shortLabel: 'Shopping',
    icon: 'shopping-bag',
    description: 'Shopping centers, malls, and premium retail destinations',
  },
  RECREATION: {
    key: 'RECREATION',
    label: 'Parks & Recreation',
    shortLabel: 'Recreation',
    icon: 'trees',
    description: 'Public parks, recreational zones, and ecological reserves',
  },
  LANDMARK: {
    key: 'LANDMARK',
    label: 'Civic Landmarks',
    shortLabel: 'Landmark',
    icon: 'landmark',
    description: 'Civic architectural landmarks and cultural points of interest',
  },
};

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  categoryDisplay: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  locality?: string | null;
  city: string;
  isVerified: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface NearbyPlace extends Place {
  /** Straight-line geodesic distance in kilometres (e.g. 2.4) */
  distanceKm: number;
  /** Formatted string representation (e.g. "2.4 km") */
  formattedDistance: string;
}

export interface NearbyPlaceDto {
  id: string;
  name: string;
  category: PlaceCategory;
  categoryDisplay: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  locality?: string | null;
  city: string;
  isVerified: boolean;
  /** Primary numeric distance in km (road distance when isRoadRouteAvailable is true, otherwise geodesic straight-line distance) */
  distanceKm: number;
  /** Primary formatted distance string (e.g. "3.8 km") */
  formattedDistance: string;
  /** Explicit distance calculation method: 'ROAD_ROUTE' | 'GEODESIC_STRAIGHT_LINE' | 'UNAVAILABLE' */
  distanceMetric?: DistanceCalculationMethod;
  /** Detailed route resolution status */
  routeStatus?: RouteAvailabilityStatus;
  /** True only when a verified road route was returned by the routing provider */
  isRoadRouteAvailable?: boolean;
  /** Verified road-route distance in km (strictly null when road route is unavailable) */
  routeDistanceKm?: number | null;
  /** Formatted road-route distance (strictly null when road route is unavailable) */
  formattedRouteDistance?: string | null;
  /** Estimated driving duration in minutes (strictly null when road route is unavailable) */
  estimatedDurationMinutes?: number | null;
  /** Estimated driving duration in seconds (strictly null when road route is unavailable) */
  estimatedDurationSeconds?: number | null;
  /** Formatted driving duration, e.g. "12 mins" (strictly null when road route is unavailable) */
  formattedDuration?: string | null;
  /** Verified straight-line geodesic distance in km (strictly separated from routeDistanceKm) */
  geodesicDistanceKm?: number | null;
  /** Formatted straight-line geodesic distance, e.g. "2.6 km" */
  formattedGeodesicDistance?: string | null;
  /** Routing provider that computed the route (or 'NONE') */
  routingProvider?: RoutingProviderId;
  /** Required provider attribution when road route is displayed */
  attribution?: string | null;
  /** Honest diagnostic/disclosure message when road route is unavailable */
  disclosureMessage?: string | null;
}
