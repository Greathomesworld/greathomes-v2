import {
  RentalListing,
  RentalListingMedia,
  RentalListingAmenity,
} from '../entities/rentalEntities';
import { Amenity } from '../entities';
import { amenityRepository } from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { getDb } from '../../../db/client';
import {
  PersistenceUnavailableError,
  isStrictTestEnvironment,
  resolveGuardedPersistenceBackend,
} from '../../../lib/persistenceGuard';
import { RentalListingRepositoryPostgres } from '../../../infrastructure/repositories/postgres/rentalRepositoryPostgres';

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
  const isPlotWithArea =
    l.propertyType === 'PLOT' && typeof l.plotArea === 'number' && Number.isFinite(l.plotArea) && l.plotArea > 0;
  return hasConfig || hasBedrooms || isPlotWithArea;
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

const globalForRental = globalThis as unknown as {
  __gh_mem_rental_listings?: RentalListing[];
  __gh_mem_rental_media?: RentalListingMedia[];
  __gh_mem_rental_amenities?: RentalListingAmenity[];
};

export class RentalListingRepositoryMemory implements RentalListingRepository {
  private get listings(): RentalListing[] {
    if (!globalForRental.__gh_mem_rental_listings) {
      globalForRental.__gh_mem_rental_listings = [];
    }
    return globalForRental.__gh_mem_rental_listings;
  }
  private set listings(val: RentalListing[]) {
    globalForRental.__gh_mem_rental_listings = val;
  }

  private get mediaList(): RentalListingMedia[] {
    if (!globalForRental.__gh_mem_rental_media) {
      globalForRental.__gh_mem_rental_media = [];
    }
    return globalForRental.__gh_mem_rental_media;
  }
  private set mediaList(val: RentalListingMedia[]) {
    globalForRental.__gh_mem_rental_media = val;
  }

  private get listingAmenities(): RentalListingAmenity[] {
    if (!globalForRental.__gh_mem_rental_amenities) {
      globalForRental.__gh_mem_rental_amenities = [];
    }
    return globalForRental.__gh_mem_rental_amenities;
  }
  private set listingAmenities(val: RentalListingAmenity[]) {
    globalForRental.__gh_mem_rental_amenities = val;
  }

  private amenitiesStore: Amenity[] = [];

  constructor(amenitiesStore: Amenity[] = []) {
    const provider = (process.env.PERSISTENCE_PROVIDER || '').trim().toLowerCase();
    if (!isStrictTestEnvironment() || provider === 'postgres') {
      throw new PersistenceUnavailableError(
        'RentalListingRepositoryMemory is strictly restricted to isolated test execution (NODE_ENV=test).'
      );
    }
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

  async create(data: Omit<RentalListing, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<RentalListing> {
    const now = new Date();
    const id = data.id || `rent_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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

export interface GuardedRentalRepositoryOptions {
  allowTestMemoryPersistence?: boolean;
  dbResolver?: () => ReturnType<typeof getDb>;
  amenitiesStore?: Amenity[];
}

export class GuardedRentalListingRepository implements RentalListingRepository {
  private allowTestMemoryPersistence: boolean;
  private readonly dbResolver: () => ReturnType<typeof getDb>;
  private readonly amenitiesStore: Amenity[];
  private pgRepo: RentalListingRepositoryPostgres | null = null;
  private memRepo: RentalListingRepositoryMemory | null = null;

  constructor(options?: GuardedRentalRepositoryOptions) {
    this.allowTestMemoryPersistence = Boolean(options?.allowTestMemoryPersistence);
    this.dbResolver = options?.dbResolver ?? (() => getDb());
    this.amenitiesStore = options?.amenitiesStore ?? [];
  }

  static createForTesting(
    options?: Omit<GuardedRentalRepositoryOptions, 'allowTestMemoryPersistence'>
  ): GuardedRentalListingRepository {
    if (!isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory rental test repository construction is strictly restricted to NODE_ENV=test.'
      );
    }
    return new GuardedRentalListingRepository({
      ...options,
      allowTestMemoryPersistence: true,
    });
  }

  enableTestMemoryPersistence(enabled: boolean = true): void {
    if (enabled && !isStrictTestEnvironment()) {
      throw new PersistenceUnavailableError(
        'In-memory rental persistence is permitted only in an explicit test environment (NODE_ENV=test).'
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
        'Clearing in-memory rental state requires NODE_ENV=test and explicit test memory activation.'
      );
    }
    globalForRental.__gh_mem_rental_listings = [];
    globalForRental.__gh_mem_rental_media = [];
    globalForRental.__gh_mem_rental_amenities = [];
  }

  private resolveDelegate(): RentalListingRepository {
    const backend = resolveGuardedPersistenceBackend({
      domain: 'Rental listing',
      allowTestMemoryPersistence: this.allowTestMemoryPersistence,
      dbResolver: this.dbResolver,
    });

    if (backend.mode === 'postgres') {
      if (!this.pgRepo) {
        this.pgRepo = new RentalListingRepositoryPostgres(this.dbResolver);
      }
      return this.pgRepo;
    }

    if (!this.memRepo) {
      this.memRepo = new RentalListingRepositoryMemory(this.amenitiesStore);
    }
    return this.memRepo;
  }

  findById(id: string): Promise<RentalListing | null> {
    return this.resolveDelegate().findById(id);
  }
  findBySlug(slug: string): Promise<RentalListing | null> {
    return this.resolveDelegate().findBySlug(slug);
  }
  findBySlugOrId(identifier: string): Promise<RentalListing | null> {
    return this.resolveDelegate().findBySlugOrId(identifier);
  }
  findByProjectId(projectId: string): Promise<RentalListing[]> {
    return this.resolveDelegate().findByProjectId(projectId);
  }
  findPublishedByProjectId(projectId: string): Promise<RentalListing[]> {
    return this.resolveDelegate().findPublishedByProjectId(projectId);
  }
  findAll(filter?: RentalListingFilter): Promise<RentalListing[]> {
    return this.resolveDelegate().findAll(filter);
  }
  countAndFacetsForProject(
    projectId: string,
    filter?: RentalListingFilter
  ): Promise<ProjectRentalInventoryFacets> {
    return this.resolveDelegate().countAndFacetsForProject(projectId, filter);
  }
  create(
    data: Omit<RentalListing, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<RentalListing> {
    return this.resolveDelegate().create(data);
  }
  update(id: string, data: Partial<RentalListing>): Promise<RentalListing> {
    return this.resolveDelegate().update(id, data);
  }
  delete(id: string): Promise<boolean> {
    return this.resolveDelegate().delete(id);
  }
  findMediaByListingId(listingId: string): Promise<RentalListingMedia[]> {
    return this.resolveDelegate().findMediaByListingId(listingId);
  }
  findMediaByListingIds(listingIds: string[]): Promise<RentalListingMedia[]> {
    return this.resolveDelegate().findMediaByListingIds(listingIds);
  }
  addMedia(
    data: Omit<RentalListingMedia, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<RentalListingMedia> {
    return this.resolveDelegate().addMedia(data);
  }
  removeMedia(mediaId: string): Promise<boolean> {
    return this.resolveDelegate().removeMedia(mediaId);
  }
  updateMedia(
    mediaId: string,
    data: Partial<RentalListingMedia>
  ): Promise<RentalListingMedia | null> {
    return this.resolveDelegate().updateMedia(mediaId, data);
  }
  findAmenitiesByListingId(listingId: string): Promise<Amenity[]> {
    return this.resolveDelegate().findAmenitiesByListingId(listingId);
  }
  associateAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    return this.resolveDelegate().associateAmenity(rentalListingId, amenityId);
  }
  removeAmenity(rentalListingId: string, amenityId: string): Promise<void> {
    return this.resolveDelegate().removeAmenity(rentalListingId, amenityId);
  }
}

export const rentalListingRepository = new GuardedRentalListingRepository();

