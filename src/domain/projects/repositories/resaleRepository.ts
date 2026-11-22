import {
  ResaleListing,
  ResaleListingMedia,
  ResaleListingAmenity,
} from '../entities/resaleEntities';
import { Amenity } from '../entities';
import { amenityRepository } from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { getDb } from '../../../db/client';
import {
  PersistenceUnavailableError,
  isStrictTestEnvironment,
  resolveGuardedPersistenceBackend,
} from '../../../lib/persistenceGuard';
import { ResaleListingRepositoryPostgres } from '../../../infrastructure/repositories/postgres/resaleRepositoryPostgres';

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
  const isPlotWithArea =
    l.propertyType === 'PLOT' && typeof l.plotArea === 'number' && Number.isFinite(l.plotArea) && l.plotArea > 0;
  return hasConfig || hasBedrooms || isPlotWithArea;
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

const globalForResale = globalThis as unknown as {
  __gh_mem_resale_listings?: ResaleListing[];
  __gh_mem_resale_media?: ResaleListingMedia[];
  __gh_mem_resale_amenities?: ResaleListingAmenity[];
};

export class ResaleListingRepositoryMemory implements ResaleListingRepository {
  private get listings(): ResaleListing[] {
    if (!globalForResale.__gh_mem_resale_listings) {
      globalForResale.__gh_mem_resale_listings = [];
    }
    return globalForResale.__gh_mem_resale_listings;
  }
  private set listings(val: ResaleListing[]) {
    globalForResale.__gh_mem_resale_listings = val;
  }

  private get mediaList(): ResaleListingMedia[] {
    if (!globalForResale.__gh_mem_resale_media) {
      globalForResale.__gh_mem_resale_media = [];
    }
    return globalForResale.__gh_mem_resale_media;
  }
  private set mediaList(val: ResaleListingMedia[]) {
    globalForResale.__gh_mem_resale_media = val;
  }

  private get listingAmenities(): ResaleListingAmenity[] {
    if (!globalForResale.__gh_mem_resale_amenities) {
      globalForResale.__gh_mem_resale_amenities = [];
    }
    return globalForResale.__gh_mem_resale_amenities;
  }
  private set listingAmenities(val: ResaleListingAmenity[]) {
    globalForResale.__gh_mem_resale_amenities = val;
  }

  private amenitiesStore: Amenity[] = [];

  constructor(amenitiesStore: Amenity[] = []) {
    const provider = (process.env.PERSISTENCE_PROVIDER || '').trim().toLowerCase();
    if (!isStrictTestEnvironment() || provider === 'postgres') {
      throw new PersistenceUnavailableError(
        'ResaleListingRepositoryMemory is strictly restricted to isolated test execution (NODE_ENV=test).'
      );
    }
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
          const areaA = a.carpetArea ?? a.plotArea ?? -1;
          const areaB = b.carpetArea ?? b.plotArea ?? -1;
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

  async create(data: Omit<ResaleListing, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<ResaleListing> {
    const now = new Date();
    const id = data.id || `resale_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

export interface GuardedResaleRepositoryOptions {
  allowTestMemoryPersistence?: boolean;
  dbResolver?: () => ReturnType<typeof getDb>;
  amenitiesStore?: Amenity[];
}

export class GuardedResaleListingRepository implements ResaleListingRepository {
  private allowTestMemoryPersistence: boolean;
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private readonly amenitiesStore: Amenity[];
  private pgRepo: ResaleListingRepositoryPostgres | null = null;
  private memRepo: ResaleListingRepositoryMemory | null = null;

  constructor(options?: GuardedResaleRepositoryOptions) {
    this.allowTestMemoryPersistence = Boolean(options?.allowTestMemoryPersistence);
    this.dbResolver = options?.dbResolver ?? (() => getDb());
    this.amenitiesStore = options?.amenitiesStore ?? [];
  }

  static createForTesting(
    options?: Omit<GuardedResaleRepositoryOptions, 'allowTestMemoryPersistence'>
  ): GuardedResaleListingRepository {
    if (!isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory resale test repository construction is strictly restricted to NODE_ENV=test.'
      );
    }
    return new GuardedResaleListingRepository({
      ...options,
      allowTestMemoryPersistence: true,
    });
  }

  enableTestMemoryPersistence(enabled: boolean = true): void {
    if (enabled && !isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory resale persistence is permitted only in an explicit test environment (NODE_ENV=test).'
      );
    }
    this.allowTestMemoryPersistence = enabled;
    if (!enabled) {
      this.memRepo = null;
    }
  }

  clearMemoryForTesting(): void {
    if (!isStrictTestEnvironment() || !this.allowTestMemoryPersistence) {
      throw new PersistenceUnavailableError(
        'Clearing in-memory resale state requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    globalForResale.__gh_mem_resale_listings = [];
    globalForResale.__gh_mem_resale_media = [];
    globalForResale.__gh_mem_resale_amenities = [];
  }

  private resolveDelegate(): ResaleListingRepository {
    const backend = resolveGuardedPersistenceBackend({
      domain: 'Resale listing',
      allowTestMemoryPersistence: this.allowTestMemoryPersistence,
      dbResolver: this.dbResolver,
    });

    if (backend.mode === 'postgres') {
      if (!this.pgRepo) {
        this.pgRepo = new ResaleListingRepositoryPostgres(this.dbResolver);
      }
      return this.pgRepo;
    }

    if (!this.memRepo) {
      this.memRepo = new ResaleListingRepositoryMemory(this.amenitiesStore);
    }
    return this.memRepo;
  }

  findById(id: string): Promise<ResaleListing | null> {
    return this.resolveDelegate().findById(id);
  }
  findBySlug(slug: string): Promise<ResaleListing | null> {
    return this.resolveDelegate().findBySlug(slug);
  }
  findBySlugOrId(identifier: string): Promise<ResaleListing | null> {
    return this.resolveDelegate().findBySlugOrId(identifier);
  }
  findByProjectId(projectId: string): Promise<ResaleListing[]> {
    return this.resolveDelegate().findByProjectId(projectId);
  }
  findPublishedByProjectId(projectId: string): Promise<ResaleListing[]> {
    return this.resolveDelegate().findPublishedByProjectId(projectId);
  }
  findAll(filter?: ResaleFilterOptions): Promise<ResaleListing[]> {
    return this.resolveDelegate().findAll(filter);
  }
  countAndFacetsForProject(
    projectId: string,
    filter?: ResaleFilterOptions
  ): Promise<ProjectResaleInventoryFacets> {
    return this.resolveDelegate().countAndFacetsForProject(projectId, filter);
  }
  create(
    data: Omit<ResaleListing, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<ResaleListing> {
    return this.resolveDelegate().create(data);
  }
  update(id: string, data: Partial<ResaleListing>): Promise<ResaleListing> {
    return this.resolveDelegate().update(id, data);
  }
  delete(id: string): Promise<boolean> {
    return this.resolveDelegate().delete(id);
  }
  findMediaByListingId(listingId: string): Promise<ResaleListingMedia[]> {
    return this.resolveDelegate().findMediaByListingId(listingId);
  }
  findMediaByListingIds(listingIds: string[]): Promise<ResaleListingMedia[]> {
    return this.resolveDelegate().findMediaByListingIds(listingIds);
  }
  addMedia(
    data: Omit<ResaleListingMedia, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ResaleListingMedia> {
    return this.resolveDelegate().addMedia(data);
  }
  removeMedia(mediaId: string): Promise<boolean> {
    return this.resolveDelegate().removeMedia(mediaId);
  }
  updateMedia(
    mediaId: string,
    data: Partial<ResaleListingMedia>
  ): Promise<ResaleListingMedia | null> {
    return this.resolveDelegate().updateMedia(mediaId, data);
  }
  findAmenitiesByListingId(listingId: string): Promise<Amenity[]> {
    return this.resolveDelegate().findAmenitiesByListingId(listingId);
  }
  associateAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    return this.resolveDelegate().associateAmenity(resaleListingId, amenityId);
  }
  removeAmenity(resaleListingId: string, amenityId: string): Promise<void> {
    return this.resolveDelegate().removeAmenity(resaleListingId, amenityId);
  }
}

export const resaleListingRepository = new GuardedResaleListingRepository();

