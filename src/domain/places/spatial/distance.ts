import { isValidCoordinate } from '../../projects/viewModels/projectLocationViewModel';

export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Calculates straight-line geodesic distance between two geographic coordinates
 * in kilometres on the WGS84 sphere (Earth mean radius = 6371.0 km).
 *
 * Matches PostGIS ST_Distance(geography, geography) / 1000.0 within 0.3%.
 * Returns null if either coordinate set is invalid or out-of-range.
 */
export function calculateGeodesicDistanceKm(
  coord1: LatLng | null | undefined,
  coord2: LatLng | null | undefined
): number | null {
  if (!coord1 || !coord2) return null;

  if (
    !isValidCoordinate(coord1.latitude, coord1.longitude) ||
    !isValidCoordinate(coord2.latitude, coord2.longitude)
  ) {
    return null;
  }

  const R = 6371.0; // Mean Earth radius in kilometres
  const dLat = ((coord2.latitude - coord1.latitude) * Math.PI) / 180.0;
  const dLon = ((coord2.longitude - coord1.longitude) * Math.PI) / 180.0;
  const lat1 = (coord1.latitude * Math.PI) / 180.0;
  const lat2 = (coord2.latitude * Math.PI) / 180.0;

  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2.0) * Math.sin(dLon / 2.0);

  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  const distance = R * c;

  // Round to exactly one decimal place
  return Math.round(distance * 10) / 10;
}

/**
 * Formats a distance in kilometres for presentation.
 * Example: 2.4 -> "2.4 km", 0.5 -> "0.5 km"
 */
export function formatDistanceKm(distanceKm: number | null | undefined): string {
  if (distanceKm === null || distanceKm === undefined || isNaN(distanceKm)) {
    return '—';
  }
  return `${distanceKm.toFixed(1)} km`;
}
