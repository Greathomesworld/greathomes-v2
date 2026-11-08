import {
  RentalListing,
  RentalListingMedia,
  RentalListingAmenity,
} from '../entities/rentalEntities';
import { Amenity } from '../entities';
import { amenityRepository } from '../../../infrastructure/repositories/memory/projectRepositoryMemory';

export type RentalSortOption = 'newest' | 'rent_asc' | 'rent_desc' | 'area_desc';

export interface RentalListingFilter {
  projectId?: string;
  lifecycleStatus?: string;
  verificationStatus?: string;
  listingPartyType?: string;
  bedroomCount?: number;
  minRent?: number;
  maxRent?: number;
  propertyType?: string;
  furnishing?: string;
  floorCategory?: string;
  facing?: string;
  possession?: string;
  onlyEligiblePublic?: boolean;
  sortBy?: RentalSortOption;
  limit?: number;
  offset?: number;
}

export interface ProjectRentalInventoryFacets {
  totalEligibleCount: number;
  filteredCount: number;
  verifiedCount: number;
  availableBhkCounts: number[];
  availableFurnishings?: string[];
  availableFloorCategories?: string[];
  availablePossessions?: string[];
  minRent: number | null;
  maxRent: number | null;
}

function isEligibleRentalEntity(l: RentalListing): boolean {
  if (l.lifecycleStatus !== 'PUBLISHED') return false;
  if (typeof l.monthlyRent !== 'number' || !Number.isFinite(l.monthlyRent) || l.monthlyRent <= 0) return false;
  const hasConfig = typeof l.configuration === 'string' && l.configuration.trim().length > 0;
  const hasBedrooms = typeof l.bedroomCount === 'number' && Number.isFinite(l.bedroomCount) && l.bedroomCount > 0;
  return hasConfig || hasBedrooms;
}

export interface RentalListingRepository {
  findById(id: string): Promise<RentalListing | null>;
  findBySlug(slug: string): Promise<RentalListing | null>;
  findBySlugOrId(identifier: string): Promise<RentalListing | null>;
  findByProjectId(projectId: string): Promise<RentalListing[]>;
  findPublishedByProjectId(projectId: string): Promise<RentalListing[]>;
  findAll(filter?: RentalListingFilter): Promise<RentalListing[]>;
  countAndFacetsForProject(projectId: string, filter?: RentalListingFilter): Promise<ProjectRentalInventoryFacets>;
  create(data: Omit<RentalListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListing>;
  update(id: string, data: Partial<RentalListing>): Promise<RentalListing>;
  delete(id: string): Promise<boolean>;

  // Media
  findMediaByListingId(listingId: string): Promise<RentalListingMedia[]>;
  findMediaByListingIds(listingIds: string[]): Promise<RentalListingMedia[]>;
  addMedia(data: Omit<RentalListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListingMedia>;
  removeMedia(mediaId: string): Promise<boolean>;
  updateMedia(mediaId: string, data: Partial<RentalListingMedia>): Promise<RentalListingMedia | null>;

  // Amenities
  findAmenitiesByListingId(listingId: string): Promise<Amenity[]>;
  associateAmenity(rentalListingId: string, amenityId: string): Promise<void>;
  removeAmenity(rentalListingId: string, amenityId: string): Promise<void>;
}

export class RentalListingRepositoryMemory implements RentalListingRepository {
  private listings: RentalListing[] = [];
  private mediaList: RentalListingMedia[] = [];
  private listingAmenities: RentalListingAmenity[] = [];
  private amenitiesStore: Amenity[] = [];

  constructor(amenitiesStore: Amenity[] = []) {
    this.amenitiesStore = amenitiesStore;
  }

  async findById(id: string): Promise<RentalListing | null> {
    return this.listings.find(l => l.id === id) || null;
  }

  async findBySlug(slug: string): Promise<RentalListing | null> {
    return this.listings.find(l => l.slug === slug) || null;
  }

  async findBySlugOrId(identifier: string): Promise<RentalListing | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    return this.listings.find(l => l.id === trimmed) || this.listings.find(l => l.slug === trimmed) || null;
  }

  async findByProjectId(projectId: string): Promise<RentalListing[]> {
    return this.listings.filter(l => l.projectId === projectId);
  }

  async findPublishedByProjectId(projectId: string): Promise<RentalListing[]> {
    return this.listings.filter(l => l.projectId === projectId && l.lifecycleStatus === 'PUBLISHED');
  }

  private applyFilterAndSort(items: RentalListing[], filter?: RentalListingFilter): RentalListing[] {
    let result = [...items];
    if (filter) {
      if (filter.projectId) {
        result = result.filter(l => l.projectId === filter.projectId);
      }
      if (filter.onlyEligiblePublic) {
        result = result.filter(isEligibleRentalEntity);
      }
      if (filter.lifecycleStatus) {
        result = result.filter(l => l.lifecycleStatus === filter.lifecycleStatus);
      }
      if (filter.verificationStatus) {
        result = result.filter(l => l.verificationStatus === filter.verificationStatus);
      }
      if (filter.listingPartyType) {
        result = result.filter(l => l.listingPartyType === filter.listingPartyType);
      }
      if (filter.bedroomCount !== undefined) {
        result = result.filter(l => l.bedroomCount === filter.bedroomCount);
      }
      if (filter.minRent !== undefined) {
        result = result.filter(l => l.monthlyRent >= filter.minRent!);
      }
      if (filter.maxRent !== undefined) {
        result = result.filter(l => l.monthlyRent <= filter.maxRent!);
      }
      if (filter.propertyType) {
        result = result.filter(l => l.propertyType === filter.propertyType);
      }
      if (filter.furnishing) {
        result = result.filter(l => l.furnishing === filter.furnishing);
      }
      if (filter.floorCategory) {
        result = result.filter(l => l.floorCategory === filter.floorCategory);
      }
      if (filter.facing) {
        result = result.filter(l => l.facing === filter.facing);
      }
      if (filter.possession) {
        if (filter.possession === 'READY') {
          result = result.filter(l => l.possession === 'READY' || (l.possession as string) === 'READY_TO_MOVE');
        } else {
          result = result.filter(l => l.possession === filter.possession);
        }
      }

      const sortBy = filter.sortBy || 'newest';
      result.sort((a, b) => {
        if (sortBy === 'rent_asc') {
          if (a.monthlyRent !== b.monthlyRent) return a.monthlyRent - b.monthlyRent;
        } else if (sortBy === 'rent_desc') {
          if (a.monthlyRent !== b.monthlyRent) return b.monthlyRent - a.monthlyRent;
        } else if (sortBy === 'area_desc') {
          const areaA = a.carpetArea ?? -1;
          const areaB = b.carpetArea ?? -1;
          if (areaA !== areaB) return areaB - areaA;
        }
        const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });
    }
    return result;
  }

  async findAll(filter?: RentalListingFilter): Promise<RentalListing[]> {
    let result = this.applyFilterAndSort(this.listings, filter);
    if (filter?.offset !== undefined && filter.offset > 0) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit !== undefined && filter.limit >= 0) {
      result = result.slice(0, filter.limit);
    }
    return result;
  }

  async countAndFacetsForProject(projectId: string, filter?: RentalListingFilter): Promise<ProjectRentalInventoryFacets> {
    const baseEligible = this.listings.filter(
      l => l.projectId === projectId && isEligibleRentalEntity(l)
    );
    const totalEligibleCount = baseEligible.length;
    const verifiedCount = baseEligible.filter(l => l.verificationStatus === 'VERIFIED').length;
    const bhkSet = new Set<number>();
    const furnishSet = new Set<string>();
    const floorSet = new Set<string>();
    const possessionSet = new Set<string>();
    let minRent: number | null = null;
    let maxRent: number | null = null;

    for (const item of baseEligible) {
      if (typeof item.bedroomCount === 'number' && Number.isFinite(item.bedroomCount) && item.bedroomCount > 0) {
        bhkSet.add(item.bedroomCount);
      }
      if (item.furnishing) furnishSet.add(item.furnishing);
      if (item.floorCategory) floorSet.add(item.floorCategory);
      if (item.possession) {
        possessionSet.add((item.possession as string) === 'READY_TO_MOVE' ? 'READY' : item.possession);
      }
      if (minRent === null || item.monthlyRent < minRent) minRent = item.monthlyRent;
      if (maxRent === null || item.monthlyRent > maxRent) maxRent = item.monthlyRent;
    }

    const availableBhkCounts = Array.from(bhkSet).sort((a, b) => a - b);

    const filteredItems = this.applyFilterAndSort(baseEligible, {
      ...filter,
      projectId,
      lifecycleStatus: 'PUBLISHED',
      onlyEligiblePublic: true,
    });

    return {
      totalEligibleCount,
      filteredCount: filteredItems.length,
      verifiedCount,
      availableBhkCounts,
      availableFurnishings: Array.from(furnishSet),
      availableFloorCategories: Array.from(floorSet),
      availablePossessions: Array.from(possessionSet),
      minRent,
      maxRent,
    };
  }

  async create(data: Omit<RentalListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListing> {
    const now = new Date();
    const id = `rent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const listing: RentalListing = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.listings.push(listing);
    return listing;
  }

  async update(id: string, data: Partial<RentalListing>): Promise<RentalListing> {
    const index = this.listings.findIndex(l => l.id === id);
    if (index === -1) {
      throw new Error(`Rental listing ${id} not found.`);
    }
    const updated: RentalListing = {
      ...this.listings[index],
      ...data,
      updatedAt: new Date(),
    };
    this.listings[index] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const index = this.listings.findIndex(l => l.id === id);
    if (index === -1) return false;
    this.listings.splice(index, 1);
    this.mediaList = this.mediaList.filter(m => m.rentalListingId !== id);
    this.listingAmenities = this.listingAmenities.filter(la => la.rentalListingId !== id);
    return true;
  }

  async findMediaByListingId(listingId: string): Promise<RentalListingMedia[]> {
    return this.mediaList.filter(m => m.rentalListingId === listingId);
  }

  async findMediaByListingIds(listingIds: string[]): Promise<RentalListingMedia[]> {
    const set = new Set(listingIds);
    return this.mediaList.filter(m => set.has(m.rentalListingId));
  }

  async addMedia(data: Omit<RentalListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<RentalListingMedia> {
    const now = new Date();
    const id = `rmed_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const media: RentalListingMedia = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.mediaList.push(media);
    return media;
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    const index = this.mediaList.findIndex(m => m.id === mediaId);
    if (index === -1) return false;
    this.mediaList.splice(index, 1);
    return true;
  }

  async updateMedia(mediaId: string, data: Partial<RentalListingMedia>): Promise<RentalListingMedia | null> {
    const index = this.mediaList.findIndex(m => m.id === mediaId);
    if (index === -1) return null;
    this.mediaList[index] = {
      ...this.mediaList[index],
      ...data,
      updatedAt: new Date(),
    };
    return this.mediaList[index];
  }

  async findAmenitiesByListingId(listingId: string): Promise<Amenity[]> {
    const links = this.listingAmenities.filter(la => la.rentalListingId === listingId);
    const amenityIds = links.map(l => l.amenityId);
    if (amenityIds.length === 0) return [];
    if (this.amenitiesStore.length > 0) {
      const set = new Set(amenityIds);
      return this.amenitiesStore.filter(a => set.has(a.id));
    }
    return amenityRepository.findByIds(amenityIds);
  }

  async associateAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    if (!this.listingAmenities.some(la => la.rentalListingId === rentalListingId && la.amenityId === amenityId)) {
      this.listingAmenities.push({
        id: `lam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        rentalListingId,
        amenityId,
      });
    }
  }

  async removeAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    this.listingAmenities = this.listingAmenities.filter(
      la => !(la.rentalListingId === rentalListingId && la.amenityId === amenityId)
    );
  }
}

import { RentalListingRepositoryPostgres } from '../../../infrastructure/repositories/postgres/rentalRepositoryPostgres';

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

export const rentalListingRepository: RentalListingRepository = usePostgres
  ? new RentalListingRepositoryPostgres()
  : new RentalListingRepositoryMemory();
