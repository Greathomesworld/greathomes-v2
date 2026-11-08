import { Location, LocationType, LocationStatus } from "../entities";
import { LocationRepository } from "../../repositories/locationRepository";
import { locationRepository as defaultLocationRepo } from "../../../infrastructure/repositories/memory/locationRepositoryMemory";
import { isPublicCanonicalLocation } from "../locationRegionMapper";

/**
 * Standard registry of known location aliases.
 * Maps alias/alternate slugs to the authoritative canonical slug.
 */
export const LOCATION_ALIASES: Record<string, string> = {
  'newtown': 'new-town',
  'new-town-kolkata': 'new-town',
  'rajarhat-main-road': 'rajarhat',
  'rajarhat-chowmatha': 'rajarhat',
  'calcutta': 'kolkata',
  'greater-kolkata': 'kolkata',
};

export interface DuplicateLocationFlag {
  type: 'SAME_SLUG' | 'SAME_NAME_SAME_PARENT' | 'CYCLE_DETECTED' | 'INVALID_HIERARCHY';
  locationId: string;
  locationName: string;
  locationSlug: string;
  conflictingId?: string;
  details: string;
}

export interface DuplicateAuditReport {
  scannedCount: number;
  duplicateCount: number;
  flags: DuplicateLocationFlag[];
}

export class LocationService {
  private typeOrder: Record<LocationType, number> = {
    'STATE': 1,
    'DISTRICT': 2,
    'CITY': 3,
    'DISCOVERY_REGION': 4,
    'AREA': 5,
    'NEIGHBOURHOOD': 6,
  };

  constructor(private locationRepository: LocationRepository = defaultLocationRepo) {}

  /**
   * Validates whether a child location type can legally descend from a parent location type.
   * Prevents upward hierarchies, inverted relationships, and cycles.
   * Supports real data that safely skips optional intermediate tiers (e.g. AREA directly under CITY).
   */
  validateParentChild(childType: LocationType, parentType: LocationType): boolean {
    const parentOrder = this.typeOrder[parentType];
    const childOrder = this.typeOrder[childType];

    // Child must be strictly lower in the hierarchy than parent
    if (childOrder <= parentOrder) {
      return false;
    }

    switch (parentType) {
      case 'STATE':
        // State can parent District, City, or Area
        return ['DISTRICT', 'CITY', 'DISCOVERY_REGION', 'AREA'].includes(childType);
      case 'DISTRICT':
        // District can parent City, Region, or Area
        return ['CITY', 'DISCOVERY_REGION', 'AREA'].includes(childType);
      case 'CITY':
        // City can parent Region or Area
        return ['DISCOVERY_REGION', 'AREA'].includes(childType);
      case 'DISCOVERY_REGION':
        // Region can parent Area
        return childType === 'AREA';
      case 'AREA':
        // Area can parent Neighbourhood
        return childType === 'NEIGHBOURHOOD';
      case 'NEIGHBOURHOOD':
        // Terminal leaf level: cannot parent any sub-tier
        return false;
      default:
        return false;
    }
  }

  async checkCircularHierarchy(id: string, parentId: string): Promise<boolean> {
    if (id === parentId) return true;
    let currentId: string | undefined | null = parentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === id) return true;
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const parentLoc = await this.locationRepository.findById(currentId);
      if (!parentLoc) break;
      currentId = parentLoc.parentId;
    }
    return false;
  }

  async createLocation(data: Omit<Location, 'id' | 'createdAt' | 'updatedAt'>): Promise<Location> {
    // Validate slug
    if (!data.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug)) {
      throw new Error("Invalid slug format. Must be URL-safe lowercase alphanumeric words.");
    }

    // Validate slug uniqueness
    const existing = await this.locationRepository.findBySlug(data.slug);
    if (existing) throw new Error("Slug must be unique");

    // Validate coordinates
    if (data.latitude !== undefined && data.latitude !== null) {
      if (data.latitude < -90 || data.latitude > 90) throw new Error("Latitude must be between -90 and 90");
    }
    if (data.longitude !== undefined && data.longitude !== null) {
      if (data.longitude < -180 || data.longitude > 180) throw new Error("Longitude must be between -180 and 180");
    }

    // Validate hierarchy
    if (data.parentId) {
      const parent = await this.locationRepository.findById(data.parentId);
      if (!parent) throw new Error("Parent location not found");

      const isValid = this.validateParentChild(data.type, parent.type);
      if (!isValid) {
        throw new Error(`Invalid hierarchy: ${data.type} cannot be a child of ${parent.type}`);
      }
    }

    return this.locationRepository.create(data);
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location> {
    const existing = await this.locationRepository.findById(id);
    if (!existing) throw new Error("Location not found");

    const updates: Partial<Location> = {};

    if (data.name !== undefined) {
      if (!data.name || !data.name.trim()) throw new Error("Location name cannot be empty");
      updates.name = data.name.trim();
    }

    if (data.slug !== undefined) {
      const cleanSlug = data.slug.trim();
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
        throw new Error("Invalid slug format. Must be URL-safe lowercase alphanumeric words.");
      }
      const slugExists = await this.locationRepository.findBySlug(cleanSlug);
      if (slugExists && slugExists.id !== id) {
        throw new Error(`Slug '${cleanSlug}' is already in use`);
      }
      updates.slug = cleanSlug;
    }

    if (data.type !== undefined) {
      updates.type = data.type;
    }

    // Coordinates validation
    if (data.latitude !== undefined) {
      if (data.latitude !== null && (data.latitude < -90 || data.latitude > 90)) {
        throw new Error("Latitude must be between -90 and 90");
      }
      updates.latitude = data.latitude;
    }
    if (data.longitude !== undefined) {
      if (data.longitude !== null && (data.longitude < -180 || data.longitude > 180)) {
        throw new Error("Longitude must be between -180 and 180");
      }
      updates.longitude = data.longitude;
    }

    const type = data.type || existing.type;
    const parentId = data.parentId !== undefined ? data.parentId : existing.parentId;

    if (parentId) {
      if (id === parentId) {
        throw new Error("Location cannot parent itself");
      }
      const isCircular = await this.checkCircularHierarchy(id, parentId);
      if (isCircular) {
        throw new Error("Circular hierarchy detected");
      }

      const parent = await this.locationRepository.findById(parentId);
      if (!parent) throw new Error("Parent location not found");

      const isValid = this.validateParentChild(type, parent.type);
      if (!isValid) {
        throw new Error(`Invalid hierarchy: ${type} cannot be a child of ${parent.type}`);
      }
      updates.parentId = parentId;
    } else if (data.parentId === null) {
      updates.parentId = null;
    }

    if (data.description !== undefined) updates.description = data.description;
    if (data.shortDescription !== undefined) updates.shortDescription = data.shortDescription;
    if (data.featured !== undefined) updates.featured = Boolean(data.featured);
    if (data.status !== undefined) updates.status = data.status;

    const updated = await this.locationRepository.update(id, updates);
    if (!updated) throw new Error("Location not found for update");
    return updated;
  }

  /**
   * Resolves the canonical ancestor path for a location with cycle protection
   * and publication status filtering.
   */
  async getLocationPath(id: string, options?: { publishedOnly?: boolean }): Promise<Location[]> {
    const path: Location[] = [];
    let currentId: string | undefined | null = id;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) {
        // Cycle detected: prevent infinite recursion
        console.warn(`[LocationService] Corrupted hierarchy cycle detected at location ID: ${currentId}`);
        break;
      }
      visited.add(currentId);

      const location = await this.locationRepository.findById(currentId);
      if (!location) break;

      // In public contexts, if an ancestor is not PUBLISHED or is a test fixture, do not expose it
      if (options?.publishedOnly && !isPublicCanonicalLocation(location)) {
        break;
      }

      path.unshift(location);
      currentId = location.parentId;
    }
    return path;
  }

  /**
   * Resolves a location by its slug or recognized alias.
   * Respects publication status and canonical public filter when publishedOnly option is enabled.
   */
  async resolveLocationBySlug(
    slug: string,
    options?: { publishedOnly?: boolean }
  ): Promise<Location | null> {
    const normalizedSlug = slug.toLowerCase().trim();
    let location = await this.locationRepository.findBySlug(normalizedSlug);

    // If direct lookup fails, check alias registry
    if (!location) {
      const canonicalSlug = LOCATION_ALIASES[normalizedSlug];
      if (canonicalSlug) {
        location = await this.locationRepository.findBySlug(canonicalSlug);
      }
    }

    if (!location) return null;

    if (options?.publishedOnly && !isPublicCanonicalLocation(location)) {
      return null;
    }

    return location;
  }

  /**
   * Audits all persisted locations for duplicates and hierarchy corruption
   * without mutating or silently merging data.
   */
  async detectDuplicates(): Promise<DuplicateAuditReport> {
    const all = await this.locationRepository.findAll();
    const flags: DuplicateLocationFlag[] = [];

    const slugMap = new Map<string, Location>();
    const parentNameMap = new Map<string, Location>();

    for (const loc of all) {
      // 1. Slug collisions
      const lowerSlug = loc.slug.toLowerCase();
      if (slugMap.has(lowerSlug)) {
        const conflict = slugMap.get(lowerSlug)!;
        flags.push({
          type: 'SAME_SLUG',
          locationId: loc.id,
          locationName: loc.name,
          locationSlug: loc.slug,
          conflictingId: conflict.id,
          details: `Duplicate slug detected with location ${conflict.name} (${conflict.id})`,
        });
      } else {
        slugMap.set(lowerSlug, loc);
      }

      // 2. Same name under same parent
      const parentKey = `${loc.parentId || 'ROOT'}::${loc.name.toLowerCase().trim()}`;
      if (parentNameMap.has(parentKey)) {
        const conflict = parentNameMap.get(parentKey)!;
        flags.push({
          type: 'SAME_NAME_SAME_PARENT',
          locationId: loc.id,
          locationName: loc.name,
          locationSlug: loc.slug,
          conflictingId: conflict.id,
          details: `Duplicate name under parent ${loc.parentId || 'ROOT'} with location ${conflict.id}`,
        });
      } else {
        parentNameMap.set(parentKey, loc);
      }

      // 3. Hierarchy cycle / invalid check
      if (loc.parentId) {
        if (loc.parentId === loc.id) {
          flags.push({
            type: 'CYCLE_DETECTED',
            locationId: loc.id,
            locationName: loc.name,
            locationSlug: loc.slug,
            details: `Self-referential parent detected (parentId === id)`,
          });
        }
      }
    }

    return {
      scannedCount: all.length,
      duplicateCount: flags.length,
      flags,
    };
  }

  /**
   * Returns child locations for a given parent ID, respecting publication status.
   */
  async getChildLocations(parentId: string, options?: { publishedOnly?: boolean }): Promise<Location[]> {
    const children = await this.locationRepository.findByParentId(parentId);
    if (options?.publishedOnly) {
      return children.filter(c => isPublicCanonicalLocation(c));
    }
    return children;
  }
}

export const locationService = new LocationService();
