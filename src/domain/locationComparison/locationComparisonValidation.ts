import { Location, LocationType } from '../locations/entities';

export interface LocationValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
  deduplicatedSlugs?: string[];
}

export interface HierarchyValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
  isSameHierarchyLevel: boolean;
  hierarchyLevels: string[];
  primaryLevel: string | null;
  scopeDescription: string;
}

const HIERARCHY_TIER_RANK: Record<LocationType, number> = {
  STATE: 1,
  DISTRICT: 2,
  CITY: 3,
  DISCOVERY_REGION: 4,
  AREA: 5,
  NEIGHBOURHOOD: 6,
};

/**
 * Validates and normalizes location slug parameters for comparison.
 */
export function validateLocationSlugs(slugsInput: string[] | string): LocationValidationResult {
  let rawSlugs: string[] = [];

  if (typeof slugsInput === 'string') {
    rawSlugs = slugsInput.split(',').map((s) => s.trim()).filter(Boolean);
  } else if (Array.isArray(slugsInput)) {
    rawSlugs = slugsInput.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean);
  }

  if (rawSlugs.length === 0) {
    return {
      valid: false,
      statusCode: 400,
      error: 'At least 2 locations are required for comparison (maximum 4).',
    };
  }

  if (rawSlugs.length > 4 && new Set(rawSlugs.map((s) => s.toLowerCase())).size > 4) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Cannot compare more than 4 locations simultaneously (maximum 4).',
    };
  }

  // Deduplicate deterministically preserving case-insensitive uniqueness
  const seen = new Set<string>();
  const deduplicatedSlugs: string[] = [];

  for (const slug of rawSlugs) {
    const normalized = slug.toLowerCase().trim();
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      deduplicatedSlugs.push(normalized);
    }
  }

  // Sort deterministically (alphabetically)
  deduplicatedSlugs.sort();

  if (deduplicatedSlugs.length < 2) {
    return {
      valid: false,
      statusCode: 400,
      error: 'At least 2 unique locations are required for comparison.',
    };
  }

  if (deduplicatedSlugs.length > 4) {
    return {
      valid: false,
      statusCode: 400,
      error: 'Cannot compare more than 4 locations simultaneously (maximum 4).',
    };
  }

  return {
    valid: true,
    deduplicatedSlugs,
  };
}

/**
 * Checks hierarchy compatibility across the resolved locations.
 * Prevents extreme cross-tier comparisons (e.g., STATE vs NEIGHBOURHOOD or AREA).
 */
export function validateHierarchyCompatibility(locations: Location[]): HierarchyValidationResult {
  if (locations.length === 0) {
    return {
      valid: false,
      statusCode: 400,
      error: 'No locations provided for hierarchy check.',
      isSameHierarchyLevel: false,
      hierarchyLevels: [],
      primaryLevel: null,
      scopeDescription: 'Empty locations list',
    };
  }

  const levels = Array.from(new Set(locations.map((l) => l.type)));
  const isSameHierarchyLevel = levels.length === 1;

  if (isSameHierarchyLevel) {
    const singleLevel = levels[0];
    return {
      valid: true,
      isSameHierarchyLevel: true,
      hierarchyLevels: levels,
      primaryLevel: singleLevel,
      scopeDescription: `All compared locations belong to the same hierarchy level (${singleLevel}). Metrics represent equivalent geographic bounds.`,
    };
  }

  // Check tier disparity
  const ranks = locations.map((l) => HIERARCHY_TIER_RANK[l.type] || 5);
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);

  // Incompatible if comparing broad regional level (STATE/DISTRICT) with micro level (AREA/NEIGHBOURHOOD)
  if (maxRank - minRank >= 3 || minRank <= 1) {
    const minLoc = locations.find((l) => HIERARCHY_TIER_RANK[l.type] === minRank)!;
    const maxLoc = locations.find((l) => HIERARCHY_TIER_RANK[l.type] === maxRank)!;
    return {
      valid: false,
      statusCode: 400,
      error: `Incompatible hierarchy comparison: Cannot compare high-level ${minLoc.type} ('${minLoc.name}') with local ${maxLoc.type} ('${maxLoc.name}'). Please compare entities within compatible geographic scopes.`,
      isSameHierarchyLevel: false,
      hierarchyLevels: levels,
      primaryLevel: null,
      scopeDescription: 'Incompatible hierarchy levels',
    };
  }

  return {
    valid: true,
    isSameHierarchyLevel: false,
    hierarchyLevels: levels,
    primaryLevel: null,
    scopeDescription: `Locations belong to different administrative tiers (${levels.join(' vs ')}). Metrics reflect their respective geographic boundaries.`,
  };
}
