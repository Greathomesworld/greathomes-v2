import {
  RentalListing,
  RentalLifecycleStatus,
  RentalVerificationStatus,
  ListingPartyType,
  FurnishingStatus,
  FacingDirection,
  FloorCategory,
  PossessionStatus,
  PropertyType,
} from '../entities/rentalEntities';
import {
  PublicRentalListingDto,
  AdminRentalListingDto,
} from '../dto/rentalDto';
import {
  RentalListingRepository,
  RentalListingFilter,
  ProjectRentalInventoryFacets,
  rentalListingRepository as defaultRentalRepo,
} from '../repositories/rentalRepository';
import { projectIntelligenceService } from './projectIntelligenceService';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { isValidCoordinate } from '../viewModels/projectLocationViewModel';
import {
  RentalListingDetailViewModel,
  toRentalListingDetailViewModel,
} from '../viewModels/listingDetailViewModel';
import { getEligibleRentalListings } from '../viewModels/projectSectionEligibility';
import { generateNewListingSlug } from './listingSlugGenerator';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';
import {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
  projectReraRepository,
} from '../../../infrastructure/repositories/projectProvider';
import { developerRepository } from '../../../infrastructure/repositories/developerProvider';
import { isKnownTestDeveloperSlug } from '../../developers/services/developerService';

export const KNOWN_TEST_RENTAL_LISTING_IDS = new Set([
  'rental-neon-1792051107380',
  'rental-neon-1792051200906',
  'rental-neon-1792052286984',
  'rent_1792051107381_y74t9',
  'rent_1792051200906_pss7b',
  'rent_1792052286984_nn92m',
]);

export function isKnownTestRentalListing(
  itemOrIdentifier?: { id?: string | null; slug?: string | null } | string | null
): boolean {
  if (!itemOrIdentifier) return false;
  if (typeof itemOrIdentifier === 'string') {
    const val = itemOrIdentifier.trim();
    return KNOWN_TEST_RENTAL_LISTING_IDS.has(val) || /^rental-neon-\d+$/i.test(val);
  }
  const id = typeof itemOrIdentifier.id === 'string' ? itemOrIdentifier.id.trim() : '';
  const slug = typeof itemOrIdentifier.slug === 'string' ? itemOrIdentifier.slug.trim() : '';
  return (
    KNOWN_TEST_RENTAL_LISTING_IDS.has(id) ||
    KNOWN_TEST_RENTAL_LISTING_IDS.has(slug) ||
    /^rental-neon-\d+$/i.test(id) ||
    /^rental-neon-\d+$/i.test(slug)
  );
}

export function isVerifiedPublicRentalListing(listing?: {
  id?: string | null;
  slug?: string | null;
  lifecycleStatus?: string | null;
  verificationStatus?: string | null;
  isVerified?: boolean | null;
} | null): boolean {
  if (!listing) return false;
  if (isKnownTestRentalListing(listing)) return false;
  if (listing.lifecycleStatus && listing.lifecycleStatus !== 'PUBLISHED') return false;
  return listing.verificationStatus === 'VERIFIED' || listing.isVerified === true;
}

export function isPublishedUnverifiedPublicRentalListing(listing?: {
  id?: string | null;
  slug?: string | null;
  lifecycleStatus?: string | null;
  verificationStatus?: string | null;
  isVerified?: boolean | null;
} | null): boolean {
  if (!listing) return false;
  if (isKnownTestRentalListing(listing)) return false;
  if (listing.lifecycleStatus && listing.lifecycleStatus !== 'PUBLISHED') return false;
  return listing.verificationStatus !== 'VERIFIED' && listing.isVerified !== true;
}

export interface PaginatedProjectRentalResult {
  items: PublicRentalListingDto[];
  facets: ProjectRentalInventoryFacets;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class InvalidLifecycleTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidLifecycleTransitionError';
  }
}

const VALID_LIFECYCLE_TRANSITIONS: Record<RentalLifecycleStatus, RentalLifecycleStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
  UNDER_REVIEW: ['APPROVED', 'DRAFT', 'SUBMITTED'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['PAUSED', 'SOLD_RENTED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'SOLD_RENTED', 'ARCHIVED'],
  SOLD_RENTED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export class RentalService {
  constructor(
    private repo: RentalListingRepository = defaultRentalRepo,
    private projService: any = projectIntelligenceService
  ) {}

  private isProjectPublished(proj: any): boolean {
    if (!proj) return false;
    const isPub = proj.lifecycleStatus ? proj.lifecycleStatus === 'PUBLISHED' : proj.isPublished === true;
    return isPub && proj.isPublished !== false;
  }

  async getPublicListingBySlugOrId(identifier: string): Promise<PublicRentalListingDto | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();
    if (!trimmed || isKnownTestRentalListing(trimmed)) return null;
    const listing = await this.repo.findBySlugOrId(trimmed);
    if (!listing || listing.lifecycleStatus !== 'PUBLISHED' || isKnownTestRentalListing(listing)) return null;

    let preloadedProjectDto = null;
    if (listing.projectId) {
      if (this.projService !== projectIntelligenceService) {
        const parentProj = await this.projService.getProjectById(listing.projectId, false);
        if (!parentProj || parentProj.lifecycleStatus !== 'PUBLISHED') return null;
      } else {
        preloadedProjectDto = await this.resolveProjectDto(listing.projectId, false);
        if (!preloadedProjectDto) return null;
      }
    }

    return await this.buildPublicDto(listing, preloadedProjectDto);
  }

  async getPublicListingDetailBySlugOrId(identifier: string): Promise<RentalListingDetailViewModel | null> {
    const publicDto = await this.getPublicListingBySlugOrId(identifier);
    if (!publicDto) return null;
    return toRentalListingDetailViewModel(publicDto);
  }

  async getPublicListingBySlug(slug: string): Promise<PublicRentalListingDto | null> {
    if (!slug || isKnownTestRentalListing(slug)) return null;
    const listing = await this.repo.findBySlug(slug);
    if (!listing || listing.lifecycleStatus !== 'PUBLISHED' || isKnownTestRentalListing(listing)) return null;

    let preloadedProjectDto = null;
    if (listing.projectId) {
      if (this.projService !== projectIntelligenceService) {
        const parentProj = await this.projService.getProjectById(listing.projectId, false);
        if (!parentProj || parentProj.lifecycleStatus !== 'PUBLISHED') return null;
      } else {
        preloadedProjectDto = await this.resolveProjectDto(listing.projectId, false);
        if (!preloadedProjectDto) return null;
      }
    }

    return await this.buildPublicDto(listing, preloadedProjectDto);
  }

  async getPublicListingDetailBySlug(slug: string): Promise<RentalListingDetailViewModel | null> {
    const publicDto = await this.getPublicListingBySlug(slug);
    if (!publicDto) return null;
    return toRentalListingDetailViewModel(publicDto);
  }

  async getPublicListingById(id: string): Promise<PublicRentalListingDto | null> {
    if (!id || isKnownTestRentalListing(id)) return null;
    const listing = await this.repo.findById(id);
    if (!listing || listing.lifecycleStatus !== 'PUBLISHED' || isKnownTestRentalListing(listing)) return null;

    let preloadedProjectDto = null;
    if (listing.projectId) {
      if (this.projService !== projectIntelligenceService) {
        const parentProj = await this.projService.getProjectById(listing.projectId, false);
        if (!parentProj || parentProj.lifecycleStatus !== 'PUBLISHED') return null;
      } else {
        preloadedProjectDto = await this.resolveProjectDto(listing.projectId, false);
        if (!preloadedProjectDto) return null;
      }
    }

    return await this.buildPublicDto(listing, preloadedProjectDto);
  }

  private async resolveProjectDto(projectId: string, includeUnpublished = true) {
    if (this.projService !== projectIntelligenceService) {
      const proj = await this.projService.getProjectById(projectId, true);
      if (!proj) return null;
      let location = proj.location || null;
      if (!location && proj.locationId) {
        location = await locationRepository.findById(proj.locationId);
      }

      const configs: any[] = Array.isArray(proj.configurations) ? proj.configurations : [];
      const bhks = Array.from(
        new Set(
          configs
            .map(c => c.bedroomCount)
            .filter((b): b is number => typeof b === 'number' && b > 0)
        )
      ).sort((a, b) => a - b);
      const bhkSummary = bhks.length > 0 ? `${bhks.join(' & ')} BHK` : null;

      const mediaList: any[] = Array.isArray(proj.media) ? proj.media : [];
      const featuredMedia =
        mediaList.find(m => m.isFeatured && (m.mediaType || 'IMAGE') === 'IMAGE') ||
        mediaList.find(m => (m.mediaType || 'IMAGE') === 'IMAGE') ||
        null;

      return {
        id: proj.id,
        name: proj.name,
        slug: proj.slug,
        location: location
          ? { id: location.id, name: location.name, slug: location.slug, type: location.type }
          : null,
        developerName: proj.developer?.name ?? null,
        developerSlug: proj.developer?.slug ?? null,
        status: proj.status ?? null,
        shortDescription: proj.shortDescription ?? null,
        reraVerified: Boolean(proj.reraVerified || proj.rera?.status === 'VERIFIED'),
        featuredImageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? proj.featuredImageUrl ?? null),
        bhkSummary,
        startingPrice: proj.pricing?.startingPrice ?? proj.startingPrice ?? null,
      };
    }

    const proj = await projectRepository.findById(projectId);
    if (!proj) return null;
    if (!includeUnpublished && !this.isProjectPublished(proj)) return null;

    const [location, dev, mediaList, configs, rera] = await Promise.all([
      proj.locationId ? locationRepository.findById(proj.locationId) : Promise.resolve(null),
      proj.developerId ? developerRepository.findById(proj.developerId) : Promise.resolve(null),
      projectMediaRepository.findByProjectId(projectId),
      projectConfigurationRepository.findByProjectId(projectId),
      projectReraRepository.findByProjectId(projectId),
    ]);

    if (!includeUnpublished && dev && (dev.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(dev.slug))) {
      return null;
    }

    const bhks = Array.from(
      new Set(
        configs
          .map(c => c.bedroomCount)
          .filter((b): b is number => typeof b === 'number' && b > 0)
      )
    ).sort((a, b) => a - b);
    const bhkSummary = bhks.length > 0 ? `${bhks.join(' & ')} BHK` : null;

    const imageMedia = mediaList.filter(
      m =>
        m &&
        typeof m.url === 'string' &&
        m.url.trim().length > 0 &&
        (m.mediaType || 'IMAGE').toUpperCase() !== 'VIDEO' &&
        (m.category || '').toUpperCase() !== 'WALKTHROUGH'
    );
    const featuredMedia = imageMedia.find(m => m.isFeatured) || imageMedia[0] || null;
    const validPrices = configs.map(c => c.price).filter((p): p is number => typeof p === 'number' && p > 0);
    const startingPrice =
      validPrices.length > 0
        ? Math.min(...validPrices)
        : typeof proj.startingPrice === 'number' && proj.startingPrice > 0
          ? proj.startingPrice
          : null;

    return {
      id: proj.id,
      name: proj.name,
      slug: proj.slug,
      location: location
        ? { id: location.id, name: location.name, slug: location.slug, type: location.type }
        : null,
      developerName: dev?.name ?? null,
      developerSlug: dev?.slug ?? null,
      status: proj.status ?? null,
      shortDescription: proj.shortDescription ?? null,
      reraVerified: Boolean(rera?.status === 'VERIFIED' || proj.reraStatus === 'VERIFIED'),
      featuredImageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? null),
      bhkSummary,
      startingPrice,
    };
  }

  private async buildPublicDto(
    listing: RentalListing,
    preloadedProjectDto?: {
      id: string;
      name: string;
      slug: string;
      location: { id: string; name: string; slug: string; type: any } | null;
      developerName?: string | null;
      developerSlug?: string | null;
      status?: string | null;
      shortDescription?: string | null;
      reraVerified?: boolean;
      featuredImageUrl?: string | null;
      bhkSummary?: string | null;
      startingPrice?: number | null;
    } | null,
    preloadedOptions?: {
      locationDto?: { id: string; name: string; slug: string; type: any } | null;
      mediaList?: any[];
      amenitiesList?: any[];
      skipAmenities?: boolean;
    }
  ): Promise<PublicRentalListingDto> {
    let projectDto = null;
    let locationDto = preloadedOptions?.locationDto ?? null;
    if (listing.projectId) {
      if (preloadedProjectDto && preloadedProjectDto.id === listing.projectId) {
        projectDto = preloadedProjectDto;
      } else {
        projectDto = await this.resolveProjectDto(listing.projectId);
      }
    }

    if (!locationDto && listing.locationId) {
      const loc = await locationRepository.findById(listing.locationId);
      if (loc) {
        locationDto = { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type };
      }
    } else if (!locationDto && projectDto?.location) {
      locationDto = projectDto.location;
    }

    const [amenities, media] = await Promise.all([
      preloadedOptions?.amenitiesList
        ? Promise.resolve(preloadedOptions.amenitiesList)
        : preloadedOptions?.skipAmenities
          ? Promise.resolve([])
          : this.repo.findAmenitiesByListingId(listing.id),
      preloadedOptions?.mediaList
        ? Promise.resolve(preloadedOptions.mediaList)
        : this.repo.findMediaByListingId(listing.id),
    ]);

    const listingPartyLabel = listing.listingPartyType === 'OWNER' ? 'Owner Listed' : 'Listing Partner';

    return {
      id: listing.id,
      slug: listing.slug ?? null,
      projectId: listing.projectId ?? null,
      project: projectDto,
      location: locationDto,
      propertyType: listing.propertyType,
      configuration: listing.configuration,
      bedroomCount: listing.bedroomCount,
      carpetArea: listing.carpetArea ?? null,
      builtUpArea: listing.builtUpArea ?? null,
      superBuiltUpArea: listing.superBuiltUpArea ?? null,

      monthlyRent: listing.monthlyRent,
      maintenance: listing.maintenance ?? null,
      securityDeposit: listing.securityDeposit ?? null,

      furnishing: listing.furnishing,
      facing: listing.facing,
      floorCategory: listing.floorCategory,
      possession: listing.possession,
      availabilityDate: listing.availabilityDate ? listing.availabilityDate.toISOString() : null,
      leaseDuration: listing.leaseDuration ?? null,
      noticePeriod: listing.noticePeriod ?? null,
      description: listing.description ?? null,

      listingParty: {
        type: listing.listingPartyType,
        label: listingPartyLabel,
      },

      verificationStatus: listing.verificationStatus,
      isVerified: listing.verificationStatus === 'VERIFIED',
      verifiedAt: listing.verifiedAt ? listing.verifiedAt.toISOString() : null,

      amenities: amenities.map((a: any) => ({ id: a.id, name: a.name, category: a.category })),
      media: media
        .filter((m: any) => m && typeof m.url === 'string' && m.url.trim().length > 0 && (m.mediaType || 'IMAGE').toUpperCase() !== 'VIDEO' && (m.category || '').toUpperCase() !== 'WALKTHROUGH')
        .map((m: any) => ({
          id: m.id,
          category: m.category,
          url: normalizeMediaPublicUrl(m.url) || m.url,
          altText: m.altText ?? null,
          caption: m.caption ?? null,
          sortOrder: m.sortOrder,
          isFeatured: m.isFeatured,
        })),

      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    };
  }

  private async buildAdminDto(listing: RentalListing): Promise<AdminRentalListingDto> {
    const publicDto = await this.buildPublicDto(listing);
    return {
      ...publicDto,
      locationId: listing.locationId ?? null,
      latitude: listing.latitude ?? null,
      longitude: listing.longitude ?? null,
      geometry: listing.geometry ?? null,
      location: publicDto.location || publicDto.project?.location || null,
      lifecycleStatus: listing.lifecycleStatus,
      internalNotes: listing.internalNotes ?? null,
      source: listing.source ?? null,
      crmId: listing.crmId ?? null,
      verifiedBy: listing.verifiedBy ?? null,
      ownerName: listing.ownerName ?? null,
      ownerPhone: listing.ownerPhone ?? null,
      ownerEmail: listing.ownerEmail ?? null,
      brokerName: listing.brokerName ?? null,
      brokerPhone: listing.brokerPhone ?? null,
      brokerEmail: listing.brokerEmail ?? null,
      privatePhone: listing.privatePhone ?? null,
      privateEmail: listing.privateEmail ?? null,
    };
  }


  async getAdminListingById(id: string): Promise<AdminRentalListingDto | null> {
    const listing = await this.repo.findById(id);
    if (!listing) return null;
    return this.buildAdminDto(listing);
  }

  async getPublicListingsForProject(projectId: string): Promise<PublicRentalListingDto[]> {
    const [listings, projectDto] = await Promise.all([
      this.repo.findPublishedByProjectId(projectId),
      this.resolveProjectDto(projectId),
    ]);
    const valid = listings.filter(l => !isKnownTestRentalListing(l));
    return Promise.all(valid.map(l => this.buildPublicDto(l, projectDto)));
  }

  async getPaginatedPublicListingsForProject(
    projectId: string,
    options?: {
      filter?: RentalListingFilter;
      page?: number;
      pageSize?: number;
    }
  ): Promise<PaginatedProjectRentalResult> {
    const pageSize = Math.max(1, options?.pageSize ?? 9);
    const requestedPage = Math.max(1, options?.page ?? 1);
    const baseFilter: RentalListingFilter = {
      ...(options?.filter || {}),
      projectId,
      lifecycleStatus: 'PUBLISHED',
      onlyEligiblePublic: true,
    };

    const [facets, projectDto] = await Promise.all([
      this.repo.countAndFacetsForProject(projectId, baseFilter),
      this.resolveProjectDto(projectId),
    ]);
    const totalPages = Math.max(1, Math.ceil(facets.filteredCount / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * pageSize;

    const pageEntities = await this.repo.findAll({
      ...baseFilter,
      limit: pageSize,
      offset,
    });

    const nonTestEntities = pageEntities.filter(e => !isKnownTestRentalListing(e));
    const rawDtos = await Promise.all(
      nonTestEntities.map(entity => this.buildPublicDto(entity, projectDto))
    );

    const items = getEligibleRentalListings(rawDtos, projectId);

    return {
      items,
      facets,
      page,
      pageSize,
      totalPages,
    };
  }

  async getAllListingsAdmin(filter?: any): Promise<AdminRentalListingDto[]> {
    const listings = await this.repo.findAll(filter);
    const dtos: AdminRentalListingDto[] = [];
    for (const l of listings) {
      dtos.push(await this.buildAdminDto(l));
    }
    return dtos;
  }

  async createListing(data: {
    projectId?: string | null;
    locationId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geometry?: string | null;
    propertyType: PropertyType;
    configuration: string;
    bedroomCount: number;
    carpetArea?: number | null;
    builtUpArea?: number | null;
    superBuiltUpArea?: number | null;
    monthlyRent: number;
    maintenance?: number | null;
    securityDeposit?: number | null;
    furnishing: FurnishingStatus;
    facing?: FacingDirection;
    floorCategory?: FloorCategory;
    possession?: PossessionStatus;
    availabilityDate?: Date | null;
    leaseDuration?: string | null;
    noticePeriod?: string | null;
    description?: string | null;
    listingPartyType: ListingPartyType;
    ownerName?: string | null;
    ownerPhone?: string | null;
    ownerEmail?: string | null;
    brokerName?: string | null;
    brokerPhone?: string | null;
    brokerEmail?: string | null;
    privatePhone?: string | null;
    privateEmail?: string | null;
    internalNotes?: string | null;
    source?: string | null;
    crmId?: string | null;
  }): Promise<AdminRentalListingDto> {
    let locationIdToSave: string | null = null;
    let latToSave: number | null = null;
    let lngToSave: number | null = null;
    let geomToSave: string | null = null;
    let projectName: string | null = null;
    let projectSlug: string | null = null;
    let locationName: string | null = null;
    let locationSlug: string | null = null;

    if (data.projectId) {
      const project = await this.projService.getProjectById(data.projectId, true);
      if (!project) {
        throw new ValidationError(`Project with id '${data.projectId}' does not exist.`);
      }
      projectName = project.name;
      projectSlug = project.slug;
      if (project.locationId) {
        const loc = await locationRepository.findById(project.locationId);
        if (loc) {
          locationName = loc.name;
          locationSlug = loc.slug;
        }
      }
      locationIdToSave = null;
      latToSave = null;
      lngToSave = null;
      geomToSave = null;
    } else {
      if (!data.locationId) {
        throw new ValidationError('Standalone listings require a valid canonical location.');
      }
      const loc = await locationRepository.findById(data.locationId);
      if (!loc) {
        throw new ValidationError(`Canonical location with id '${data.locationId}' does not exist.`);
      }
      locationIdToSave = data.locationId;
      locationName = loc.name;
      locationSlug = loc.slug;

      const hasLat = data.latitude !== undefined && data.latitude !== null;
      const hasLng = data.longitude !== undefined && data.longitude !== null;

      if ((hasLat && !hasLng) || (!hasLat && hasLng)) {
        throw new ValidationError('Both latitude and longitude must be provided together.');
      }

      if (hasLat && hasLng) {
        const numLat = Number(data.latitude);
        const numLng = Number(data.longitude);
        if (!isValidCoordinate(numLat, numLng)) {
          throw new ValidationError('Latitude must be between -90 and 90, and longitude between -180 and 180.');
        }
        latToSave = numLat;
        lngToSave = numLng;
        geomToSave = `POINT(${numLng} ${numLat})`;
      }
    }

    if (!data.monthlyRent || typeof data.monthlyRent !== 'number' || data.monthlyRent <= 0) {
      throw new ValidationError('Monthly rent must be a positive number.');
    }

    if (data.maintenance !== undefined && data.maintenance !== null && data.maintenance < 0) {
      throw new ValidationError('Maintenance cannot be negative.');
    }
    if (data.securityDeposit !== undefined && data.securityDeposit !== null && data.securityDeposit < 0) {
      throw new ValidationError('Security deposit cannot be negative.');
    }

    if (data.bedroomCount === undefined || data.bedroomCount < 0) {
      throw new ValidationError('Bedroom count must be a non-negative number.');
    }

    // Generate unique slug for newly created rental listing
    const generatedSlug = await generateNewListingSlug({
      projectName,
      projectSlug,
      locationName,
      locationSlug,
      bedroomCount: data.bedroomCount,
      listingType: 'rental',
      checkExists: async (s) => Boolean(await this.repo.findBySlug(s)),
    });

    const createRentalPayload = {
      projectId: data.projectId ?? null,
      locationId: locationIdToSave,
      latitude: latToSave,
      longitude: lngToSave,
      geometry: geomToSave,
      propertyType: data.propertyType,
      configuration: data.configuration,
      bedroomCount: data.bedroomCount,
      carpetArea: data.carpetArea ?? null,
      builtUpArea: data.builtUpArea ?? null,
      superBuiltUpArea: data.superBuiltUpArea ?? null,
      monthlyRent: data.monthlyRent,
      maintenance: data.maintenance ?? null,
      securityDeposit: data.securityDeposit ?? null,
      furnishing: data.furnishing || 'SEMI_FURNISHED',
      facing: data.facing ?? 'UNKNOWN',
      floorCategory: data.floorCategory ?? 'MID_FLOOR',
      possession: data.possession ?? 'READY',
      availabilityDate: data.availabilityDate ? new Date(data.availabilityDate) : null,
      leaseDuration: data.leaseDuration ?? null,
      noticePeriod: data.noticePeriod ?? null,
      description: data.description ?? null,
      listingPartyType: data.listingPartyType,
      ownerName: data.ownerName ?? null,
      ownerPhone: data.ownerPhone ?? null,
      ownerEmail: data.ownerEmail ?? null,
      brokerName: data.brokerName ?? null,
      brokerPhone: data.brokerPhone ?? null,
      brokerEmail: data.brokerEmail ?? null,
      privatePhone: data.privatePhone ?? null,
      privateEmail: data.privateEmail ?? null,
      internalNotes: data.internalNotes ?? null,
      source: data.source ?? null,
      crmId: data.crmId ?? null,
      lifecycleStatus: 'DRAFT' as const,
      verificationStatus: 'UNVERIFIED' as const,
      verifiedAt: null,
      verifiedBy: null,
    };

    let listing;
    try {
      listing = await this.repo.create({
        slug: generatedSlug,
        ...createRentalPayload,
      });
    } catch (err: any) {
      const isCollision =
        (err?.code || err?.parent?.code || err?.cause?.code) === '23505' &&
        (err?.constraint || err?.parent?.constraint || err?.cause?.constraint) === 'uq_rental_listings_slug_not_null';

      if (isCollision) {
        const retrySlug = await generateNewListingSlug({
          projectName,
          projectSlug,
          locationName,
          locationSlug,
          bedroomCount: data.bedroomCount,
          listingType: 'rental',
          checkExists: async (s) => Boolean(await this.repo.findBySlug(s)),
        });
        listing = await this.repo.create({
          slug: retrySlug,
          ...createRentalPayload,
        });
      } else {
        throw err;
      }
    }

    return await this.buildAdminDto(listing);
  }

  async updateListing(id: string, data: Partial<RentalListing>): Promise<AdminRentalListingDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Rental listing ${id} not found.`);
    }

    const effectiveProjectId = data.projectId !== undefined ? data.projectId : existing.projectId;
    let locationIdToSave = existing.locationId ?? null;
    let latToSave = existing.latitude ?? null;
    let lngToSave = existing.longitude ?? null;
    let geomToSave = existing.geometry ?? null;

    if (effectiveProjectId) {
      const project = await this.projService.getProjectById(effectiveProjectId, true);
      if (!project) {
        throw new ValidationError(`Project with id '${effectiveProjectId}' does not exist.`);
      }
      locationIdToSave = null;
      latToSave = null;
      lngToSave = null;
      geomToSave = null;
    } else {
      if (data.locationId !== undefined) {
        if (!data.locationId) {
          throw new ValidationError('Standalone listings require a valid canonical location.');
        }
        const loc = await locationRepository.findById(data.locationId);
        if (!loc) {
          throw new ValidationError(`Canonical location with id '${data.locationId}' does not exist.`);
        }
        locationIdToSave = data.locationId;
      } else if (!existing.locationId && !existing.projectId) {
        throw new ValidationError('Standalone listings require a valid canonical location.');
      }

      const latProvided = data.latitude !== undefined;
      const lngProvided = data.longitude !== undefined;

      if (latProvided || lngProvided) {
        const nextLat = latProvided ? data.latitude : existing.latitude;
        const nextLng = lngProvided ? data.longitude : existing.longitude;

        if ((nextLat === null || nextLat === undefined) && (nextLng === null || nextLng === undefined)) {
          latToSave = null;
          lngToSave = null;
          geomToSave = null;
        } else if (nextLat === null || nextLat === undefined || nextLng === null || nextLng === undefined) {
          throw new ValidationError('Both latitude and longitude must be provided together.');
        } else {
          const numLat = Number(nextLat);
          const numLng = Number(nextLng);
          if (!isValidCoordinate(numLat, numLng)) {
            throw new ValidationError('Latitude must be between -90 and 90, and longitude between -180 and 180.');
          }
          latToSave = numLat;
          lngToSave = numLng;
          geomToSave = `POINT(${numLng} ${numLat})`;
        }
      }
    }

    if (data.monthlyRent !== undefined && (typeof data.monthlyRent !== 'number' || data.monthlyRent <= 0)) {
      throw new ValidationError('Monthly rent must be a positive number.');
    }

    const normalizedAvailabilityDate =
      data.availabilityDate !== undefined
        ? data.availabilityDate
          ? data.availabilityDate instanceof Date
            ? data.availabilityDate
            : new Date(data.availabilityDate as any)
          : null
        : existing.availabilityDate;

    const updated = await this.repo.update(id, {
      ...data,
      availabilityDate: normalizedAvailabilityDate,
      locationId: locationIdToSave,
      latitude: latToSave,
      longitude: lngToSave,
      geometry: geomToSave,
    });
    return await this.buildAdminDto(updated);
  }

  async transitionLifecycle(id: string, newStatus: RentalLifecycleStatus): Promise<AdminRentalListingDto> {
    const listing = await this.repo.findById(id);
    if (!listing) {
      throw new NotFoundError(`Rental listing ${id} not found.`);
    }

    const currentStatus = listing.lifecycleStatus;
    const allowed = VALID_LIFECYCLE_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new InvalidLifecycleTransitionError(
        `Invalid lifecycle transition from '${currentStatus}' to '${newStatus}'.`
      );
    }

    const updated = await this.repo.update(id, { lifecycleStatus: newStatus });
    return await this.buildAdminDto(updated);
  }

  async updateVerification(
    id: string,
    status: RentalVerificationStatus,
    verifiedBy: string
  ): Promise<AdminRentalListingDto> {
    const listing = await this.repo.findById(id);
    if (!listing) {
      throw new NotFoundError(`Rental listing ${id} not found.`);
    }

    const verifiedAt = status === 'VERIFIED' ? new Date() : listing.verifiedAt;
    const updated = await this.repo.update(id, {
      verificationStatus: status,
      verifiedAt,
      verifiedBy,
    });

    return await this.buildAdminDto(updated);
  }

  async listAdminListings(filter?: any): Promise<AdminRentalListingDto[]> {
    const list = await this.repo.findAll(filter);
    const result: AdminRentalListingDto[] = [];
    for (const l of list) {
      result.push(await this.buildAdminDto(l));
    }
    return result;
  }

  private pgPublishedCache: { data: any[]; expiresAt: number } | null = null;
  private inflightPublished: Promise<any[]> | null = null;

  public invalidatePublishedCache() {
    this.pgPublishedCache = null;
    this.inflightPublished = null;
  }

  public async getPublishedListingsRaw(): Promise<any[]> {
    const isPg =
      this.projService === projectIntelligenceService &&
      Boolean(process.env.DATABASE_URL && process.env.PERSISTENCE_PROVIDER === 'postgres');
    const now = Date.now();
    if (isPg && this.pgPublishedCache && this.pgPublishedCache.expiresAt > now) {
      return this.pgPublishedCache.data;
    }
    if (isPg && this.inflightPublished) {
      return this.inflightPublished;
    }
    const load = async () => {
      const rows = await this.repo.findAll({ lifecycleStatus: 'PUBLISHED' });
      if (isPg) {
        this.pgPublishedCache = { data: rows, expiresAt: Date.now() + 3_000 };
      }
      return rows;
    };
    if (isPg) {
      this.inflightPublished = load().finally(() => {
        this.inflightPublished = null;
      });
      return this.inflightPublished;
    }
    return load();
  }

  async listPublicListings(
    filter?: RentalListingFilter & {
      skipAmenities?: boolean;
      preloadedContext?: {
        projectMap?: Map<string, any>;
        devMap?: Map<string, any>;
        locMap?: Map<string, any>;
        mediaByProject?: Map<string, any[]>;
        configsByProject?: Map<string, any[]>;
        reraByProject?: Map<string, any>;
        allowedLocationIds?: Set<string>;
      };
    }
  ): Promise<PublicRentalListingDto[]> {
    const { skipAmenities, preloadedContext, ...repoFilter } = filter || {};
    const hasRepoFilterKeys = Object.keys(repoFilter).length > 0;
    const rawList = hasRepoFilterKeys
      ? await this.repo.findAll({ ...repoFilter, lifecycleStatus: 'PUBLISHED' })
      : await this.getPublishedListingsRaw();
    let list = rawList.filter(l => !isKnownTestRentalListing(l));
    if (preloadedContext?.allowedLocationIds && preloadedContext.projectMap) {
      const allowed = preloadedContext.allowedLocationIds;
      list = list.filter(l => {
        const directLocId = (l as any).locationId;
        const projLocId = l.projectId ? preloadedContext.projectMap?.get(l.projectId)?.locationId : null;
        return Boolean((projLocId && allowed.has(projLocId)) || (directLocId && allowed.has(directLocId)));
      });
    }
    if (list.length === 0) return [];

    if (this.projService !== projectIntelligenceService) {
      const result: PublicRentalListingDto[] = [];
      for (const l of list) {
        result.push(await this.buildPublicDto(l));
      }
      return result;
    }

    const listingIds = list.map(l => l.id);
    const projectIds = Array.from(new Set(list.map(l => l.projectId).filter((id): id is string => Boolean(id))));

    const [
      allListingMedia,
      projs,
      projMedia,
      projConfigs,
      projReras,
      locs,
      devs,
    ] = await Promise.all([
      typeof this.repo.findMediaByListingIds === 'function'
        ? this.repo.findMediaByListingIds(listingIds)
        : Promise.all(listingIds.map(id => this.repo.findMediaByListingId(id))).then(arr => arr.flat()),
      preloadedContext?.projectMap
        ? Promise.resolve(Array.from(preloadedContext.projectMap.values()))
        : projectIds.length > 0 && typeof projectRepository.findByIds === 'function'
          ? projectRepository.findByIds(projectIds)
          : Promise.all(projectIds.map(id => projectRepository.findById(id))).then(arr => arr.filter(Boolean)),
      preloadedContext?.mediaByProject
        ? Promise.resolve(null)
        : projectIds.length > 0
          ? projectMediaRepository.findByProjectIds(projectIds)
          : Promise.resolve([]),
      preloadedContext?.configsByProject
        ? Promise.resolve(null)
        : projectIds.length > 0 && typeof projectConfigurationRepository.findByProjectIds === 'function'
          ? projectConfigurationRepository.findByProjectIds(projectIds)
          : Promise.resolve([]),
      preloadedContext?.reraByProject
        ? Promise.resolve(null)
        : projectIds.length > 0 && typeof projectReraRepository.findByProjectIds === 'function'
          ? projectReraRepository.findByProjectIds(projectIds)
          : Promise.resolve([]),
      preloadedContext?.locMap
        ? Promise.resolve(null)
        : locationRepository.findAll(),
      preloadedContext?.devMap
        ? Promise.resolve(null)
        : projectIds.length > 0
          ? developerRepository.list()
          : Promise.resolve([]),
    ]);

    const projectMap = preloadedContext?.projectMap || new Map((projs as any[]).map(p => [p.id, p]));
    const locMap = preloadedContext?.locMap || new Map((locs || []).map(l => [l.id, l]));
    const devMap = preloadedContext?.devMap || new Map((devs || []).map(d => [d.id, d]));

    const mediaByProject = preloadedContext?.mediaByProject || new Map<string, any[]>();
    if (!preloadedContext?.mediaByProject && projMedia) {
      for (const m of projMedia) {
        const arr = mediaByProject.get(m.projectId) || [];
        arr.push(m);
        mediaByProject.set(m.projectId, arr);
      }
    }

    const configsByProject = preloadedContext?.configsByProject || new Map<string, any[]>();
    if (!preloadedContext?.configsByProject && projConfigs) {
      for (const c of projConfigs) {
        const arr = configsByProject.get(c.projectId) || [];
        arr.push(c);
        configsByProject.set(c.projectId, arr);
      }
    }

    const reraByProject =
      preloadedContext?.reraByProject || new Map((projReras || []).map(r => [r.projectId, r]));

    const mediaByListing = new Map<string, any[]>();
    for (const m of allListingMedia) {
      const arr = mediaByListing.get(m.rentalListingId) || [];
      arr.push(m);
      mediaByListing.set(m.rentalListingId, arr);
    }

    const projectDtoCache = new Map<string, any>();
    for (const pid of projectIds) {
      const proj = projectMap.get(pid);
      if (!proj || !this.isProjectPublished(proj)) {
        projectDtoCache.set(pid, null);
        continue;
      }
      const dev = proj.developerId ? devMap.get(proj.developerId) : null;
      if (dev && (dev.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(dev.slug))) {
        projectDtoCache.set(pid, null);
        continue;
      }
      const loc = proj.locationId ? locMap.get(proj.locationId) : null;
      const pMedia = (mediaByProject.get(pid) || []).filter(
        (m: any) =>
          m &&
          typeof m.url === 'string' &&
          m.url.trim().length > 0 &&
          (m.mediaType || 'IMAGE').toUpperCase() !== 'VIDEO' &&
          (m.category || '').toUpperCase() !== 'WALKTHROUGH'
      );
      const featuredMedia = pMedia.find((m: any) => m.isFeatured) || pMedia[0] || null;
      const pConfigs = configsByProject.get(pid) || [];
      const bhks = Array.from(
        new Set(
          pConfigs
            .map((c: any) => c.bedroomCount)
            .filter((b: any): b is number => typeof b === 'number' && b > 0)
        )
      ).sort((a, b) => a - b);
      const bhkSummary = bhks.length > 0 ? `${bhks.join(' & ')} BHK` : null;
      const validPrices = pConfigs
        .map((c: any) => c.price)
        .filter((p: any): p is number => typeof p === 'number' && p > 0);
      const startingPrice =
        validPrices.length > 0
          ? Math.min(...validPrices)
          : typeof proj.startingPrice === 'number' && proj.startingPrice > 0
            ? proj.startingPrice
            : null;
      const rera = reraByProject.get(pid);

      projectDtoCache.set(pid, {
        id: proj.id,
        name: proj.name,
        slug: proj.slug,
        location: loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null,
        developerName: dev?.name ?? null,
        developerSlug: dev?.slug ?? null,
        status: proj.status ?? null,
        shortDescription: proj.shortDescription ?? null,
        reraVerified: Boolean(rera?.status === 'VERIFIED' || proj.reraStatus === 'VERIFIED'),
        featuredImageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? null),
        bhkSummary,
        startingPrice,
      });
    }

    const eligibleListings = list.filter(l => {
      if (l.projectId) {
        return Boolean(projectDtoCache.get(l.projectId));
      }
      return true;
    });

    return Promise.all(
      eligibleListings.map(l => {
        const preloadedProj = l.projectId ? projectDtoCache.get(l.projectId) : null;
        const loc = l.locationId ? locMap.get(l.locationId) : null;
        const locationDto = loc
          ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type }
          : preloadedProj?.location || null;
        return this.buildPublicDto(l, preloadedProj, {
          locationDto,
          mediaList: mediaByListing.get(l.id) || [],
          skipAmenities: Boolean(skipAmenities),
        });
      })
    );
  }

  async deleteListing(id: string): Promise<boolean> {
    return await this.repo.delete(id);
  }

  async findMediaByListingId(listingId: string) {
    const items = await this.repo.findMediaByListingId(listingId);
    return items.map((m: any) => ({
      ...m,
      url: normalizeMediaPublicUrl(m.url) || m.url,
    }));
  }

  async addMedia(listingId: string, mediaData: any) {
    return await this.repo.addMedia({ rentalListingId: listingId, ...mediaData });
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    return await this.repo.removeMedia(mediaId);
  }

  async updateMedia(mediaId: string, data: any) {
    return await this.repo.updateMedia(mediaId, data);
  }

  async findAmenitiesByListingId(listingId: string) {
    return await this.repo.findAmenitiesByListingId(listingId);
  }

  async associateAmenity(listingId: string, amenityId: string) {
    return await this.repo.associateAmenity(listingId, amenityId);
  }

  async removeAmenity(listingId: string, amenityId: string) {
    return await this.repo.removeAmenity(listingId, amenityId);
  }
}

export const rentalListingService = new RentalService();
export const rentalService = rentalListingService;
