import {
  ResaleListing,
  ResaleListingMedia,
  ResaleListingAmenity,
} from '../entities/resaleEntities';
import { Project } from '../entities';
import { Location } from '../../locations/entities';
import { Amenity } from '../entities';
import { amenityRepository } from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import {
  PublicResaleListingDto,
  AdminResaleListingDto,
  PublicResaleListingMediaDto,
  PublicResaleListingAmenityDto,
} from '../dto/resaleDto';

export type ResaleSortOption = 'newest' | 'price_asc' | 'price_desc' | 'area_desc';

export interface ResaleFilterOptions {
  projectId?: string;
  propertyType?: string;
  lifecycleStatus?: string;
  verificationStatus?: string;
  listingPartyType?: string;
  minPrice?: number;
  maxPrice?: number;
  bedroomCount?: number;
  furnishing?: string;
  floorCategory?: string;
  facing?: string;
  possession?: string;
  onlyEligiblePublic?: boolean;
  sortBy?: ResaleSortOption;
  limit?: number;
  offset?: number;
}

export interface ProjectResaleInventoryFacets {
  totalEligibleCount: number;
  filteredCount: number;
  verifiedCount: number;
  availableBhkCounts: number[];
  availableFurnishings?: string[];
  availableFloorCategories?: string[];
  availablePossessions?: string[];
  minPrice: number | null;
  maxPrice: number | null;
}

function isEligibleResaleEntity(l: ResaleListing): boolean {
  if (l.lifecycleStatus !== 'PUBLISHED') return false;
  if (typeof l.askingPrice !== 'number' || !Number.isFinite(l.askingPrice) || l.askingPrice <= 0) return false;
  const hasConfig = typeof l.configuration === 'string' && l.configuration.trim().length > 0;
  const hasBedrooms = typeof l.bedroomCount === 'number' && Number.isFinite(l.bedroomCount) && l.bedroomCount > 0;
  return hasConfig || hasBedrooms;
}

export interface ResaleListingRepository {
  findById(id: string): Promise<ResaleListing | null>;
  findBySlug(slug: string): Promise<ResaleListing | null>;
  findBySlugOrId(identifier: string): Promise<ResaleListing | null>;
  findByProjectId(projectId: string): Promise<ResaleListing[]>;
  findPublishedByProjectId(projectId: string): Promise<ResaleListing[]>;
  findAll(filter?: ResaleFilterOptions): Promise<ResaleListing[]>;
  countAndFacetsForProject(projectId: string, filter?: ResaleFilterOptions): Promise<ProjectResaleInventoryFacets>;
  create(data: Omit<ResaleListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListing>;
  update(id: string, data: Partial<ResaleListing>): Promise<ResaleListing>;
  delete(id: string): Promise<boolean>;

  // Media
  findMediaByListingId(listingId: string): Promise<ResaleListingMedia[]>;
  findMediaByListingIds(listingIds: string[]): Promise<ResaleListingMedia[]>;
  addMedia(data: Omit<ResaleListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListingMedia>;
  removeMedia(mediaId: string): Promise<boolean>;
  updateMedia(mediaId: string, data: Partial<ResaleListingMedia>): Promise<ResaleListingMedia | null>;

  // Amenities
  findAmenitiesByListingId(listingId: string): Promise<Amenity[]>;
  associateAmenity(resaleListingId: string, amenityId: string): Promise<void>;
  removeAmenity(resaleListingId: string, amenityId: string): Promise<void>;
}

export class ResaleListingRepositoryMemory implements ResaleListingRepository {
  private listings: ResaleListing[] = [];
  private mediaList: ResaleListingMedia[] = [];
  private listingAmenities: ResaleListingAmenity[] = [];
  private amenitiesStore: Amenity[] = [];

  constructor(amenitiesStore: Amenity[] = []) {
    this.amenitiesStore = amenitiesStore;
  }

  async findById(id: string): Promise<ResaleListing | null> {
    return this.listings.find(l => l.id === id) || null;
  }

  async findBySlug(slug: string): Promise<ResaleListing | null> {
    return this.listings.find(l => l.slug === slug) || null;
  }

  async findBySlugOrId(identifier: string): Promise<ResaleListing | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();
    if (!trimmed) return null;
    return this.listings.find(l => l.id === trimmed) || this.listings.find(l => l.slug === trimmed) || null;
  }

  async findByProjectId(projectId: string): Promise<ResaleListing[]> {
    return this.listings.filter(l => l.projectId === projectId);
  }

  async findPublishedByProjectId(projectId: string): Promise<ResaleListing[]> {
    return this.listings.filter(
      l => l.projectId === projectId && l.lifecycleStatus === 'PUBLISHED'
    );
  }

  private applyFilterAndSort(items: ResaleListing[], filter?: ResaleFilterOptions): ResaleListing[] {
    let result = [...items];
    if (filter) {
      if (filter.projectId) {
        result = result.filter(l => l.projectId === filter.projectId);
      }
      if (filter.onlyEligiblePublic) {
        result = result.filter(isEligibleResaleEntity);
      }
      if (filter.propertyType) {
        result = result.filter(l => l.propertyType === filter.propertyType);
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
      if (filter.minPrice !== undefined) {
        result = result.filter(l => l.askingPrice >= filter.minPrice!);
      }
      if (filter.maxPrice !== undefined) {
        result = result.filter(l => l.askingPrice <= filter.maxPrice!);
      }

      const sortBy = filter.sortBy || 'newest';
      result.sort((a, b) => {
        if (sortBy === 'price_asc') {
          if (a.askingPrice !== b.askingPrice) return a.askingPrice - b.askingPrice;
        } else if (sortBy === 'price_desc') {
          if (a.askingPrice !== b.askingPrice) return b.askingPrice - a.askingPrice;
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

  async findAll(filter?: ResaleFilterOptions): Promise<ResaleListing[]> {
    let result = this.applyFilterAndSort(this.listings, filter);
    if (filter?.offset !== undefined && filter.offset > 0) {
      result = result.slice(filter.offset);
    }
    if (filter?.limit !== undefined && filter.limit >= 0) {
      result = result.slice(0, filter.limit);
    }
    return result;
  }

  async countAndFacetsForProject(projectId: string, filter?: ResaleFilterOptions): Promise<ProjectResaleInventoryFacets> {
    const baseEligible = this.listings.filter(
      l => l.projectId === projectId && isEligibleResaleEntity(l)
    );
    const totalEligibleCount = baseEligible.length;
    const verifiedCount = baseEligible.filter(l => l.verificationStatus === 'VERIFIED').length;
    const bhkSet = new Set<number>();
    const furnishSet = new Set<string>();
    const floorSet = new Set<string>();
    const possessionSet = new Set<string>();
    let minPrice: number | null = null;
    let maxPrice: number | null = null;

    for (const item of baseEligible) {
      if (typeof item.bedroomCount === 'number' && Number.isFinite(item.bedroomCount) && item.bedroomCount > 0) {
        bhkSet.add(item.bedroomCount);
      }
      if (item.furnishing) furnishSet.add(item.furnishing);
      if (item.floorCategory) floorSet.add(item.floorCategory);
      if (item.possession) {
        possessionSet.add((item.possession as string) === 'READY_TO_MOVE' ? 'READY' : item.possession);
      }
      if (minPrice === null || item.askingPrice < minPrice) minPrice = item.askingPrice;
      if (maxPrice === null || item.askingPrice > maxPrice) maxPrice = item.askingPrice;
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
      minPrice,
      maxPrice,
    };
  }

  async create(data: Omit<ResaleListing, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListing> {
    const now = new Date();
    const id = `resale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const listing: ResaleListing = {
      ...data,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.listings.push(listing);
    return listing;
  }

  async update(id: string, data: Partial<ResaleListing>): Promise<ResaleListing> {
    const index = this.listings.findIndex(l => l.id === id);
    if (index === -1) {
      throw new Error(`Resale listing ${id} not found.`);
    }
    const updated: ResaleListing = {
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
    this.mediaList = this.mediaList.filter(m => m.resaleListingId !== id);
    this.listingAmenities = this.listingAmenities.filter(la => la.resaleListingId !== id);
    return true;
  }

  async findMediaByListingId(listingId: string): Promise<ResaleListingMedia[]> {
    return this.mediaList.filter(m => m.resaleListingId === listingId);
  }

  async findMediaByListingIds(listingIds: string[]): Promise<ResaleListingMedia[]> {
    const set = new Set(listingIds);
    return this.mediaList.filter(m => set.has(m.resaleListingId));
  }

  async addMedia(data: Omit<ResaleListingMedia, 'id' | 'createdAt' | 'updatedAt'>): Promise<ResaleListingMedia> {
    const now = new Date();
    const id = `rmedia_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const media: ResaleListingMedia = {
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

  async updateMedia(mediaId: string, data: Partial<ResaleListingMedia>): Promise<ResaleListingMedia | null> {
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
    const links = this.listingAmenities.filter(la => la.resaleListingId === listingId);
    const amenityIds = links.map(l => l.amenityId);
    if (amenityIds.length === 0) return [];
    if (this.amenitiesStore.length > 0) {
      const set = new Set(amenityIds);
      return this.amenitiesStore.filter(a => set.has(a.id));
    }
    return amenityRepository.findByIds(amenityIds);
  }

  async associateAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    if (!this.listingAmenities.some(la => la.resaleListingId === resaleListingId && la.amenityId === amenityId)) {
      this.listingAmenities.push({
        id: `lam_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        resaleListingId,
        amenityId,
      });
    }
  }

  async removeAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    this.listingAmenities = this.listingAmenities.filter(
      la => !(la.resaleListingId === resaleListingId && la.amenityId === amenityId)
    );
  }
}

import { ResaleListingRepositoryPostgres } from '../../../infrastructure/repositories/postgres/resaleRepositoryPostgres';

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

export const resaleListingRepository: ResaleListingRepository = usePostgres
  ? new ResaleListingRepositoryPostgres()
  : new ResaleListingRepositoryMemory();
