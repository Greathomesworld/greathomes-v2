import {
  ResaleListing,
  ResaleLifecycleStatus,
  ResaleVerificationStatus,
  ListingPartyType,
  FurnishingStatus,
  FacingDirection,
  FloorCategory,
  PossessionStatus,
} from '../entities/resaleEntities';
import {
  PublicResaleListingDto,
  AdminResaleListingDto,
} from '../dto/resaleDto';
import {
  ResaleListingRepository,
  ResaleFilterOptions,
  ProjectResaleInventoryFacets,
  resaleListingRepository as defaultResaleRepo,
} from '../repositories/resaleRepository';
import { projectIntelligenceService } from './projectIntelligenceService';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { isValidCoordinate } from '../viewModels/projectLocationViewModel';
import {
  ResaleListingDetailViewModel,
  toResaleListingDetailViewModel,
} from '../viewModels/listingDetailViewModel';
import { getEligibleResaleListings } from '../viewModels/projectSectionEligibility';
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

export const KNOWN_TEST_RESALE_LISTING_IDS = new Set([
  'resale-neon-1792051107365',
  'resale-neon-1792051200892',
  'resale-neon-1792052286973',
  'resale-neon-1792052686463',
  'resale_1792051107365_tjg6s',
  'resale_1792051200892_d7nps',
  'resale_1792052286974_bb9ik',
  'resale_1792052686463_l0ku2',
]);

export function isKnownTestResaleListing(
  itemOrIdentifier?: { id?: string | null; slug?: string | null } | string | null
): boolean {
  if (!itemOrIdentifier) return false;
  if (typeof itemOrIdentifier === 'string') {
    const val = itemOrIdentifier.trim();
    return KNOWN_TEST_RESALE_LISTING_IDS.has(val) || /^resale-neon-\d+$/i.test(val);
  }
  const id = typeof itemOrIdentifier.id === 'string' ? itemOrIdentifier.id.trim() : '';
  const slug = typeof itemOrIdentifier.slug === 'string' ? itemOrIdentifier.slug.trim() : '';
  return (
    KNOWN_TEST_RESALE_LISTING_IDS.has(id) ||
    KNOWN_TEST_RESALE_LISTING_IDS.has(slug) ||
    /^resale-neon-\d+$/i.test(id) ||
    /^resale-neon-\d+$/i.test(slug)
  );
}

export function isVerifiedPublicResaleListing(listing?: {
  id?: string | null;
  slug?: string | null;
  lifecycleStatus?: string | null;
  verificationStatus?: string | null;
  isVerified?: boolean | null;
} | null): boolean {
  if (!listing) return false;
  if (isKnownTestResaleListing(listing)) return false;
  if (listing.lifecycleStatus && listing.lifecycleStatus !== 'PUBLISHED') return false;
  return listing.verificationStatus === 'VERIFIED' || listing.isVerified === true;
}

export function isPublishedUnverifiedPublicResaleListing(listing?: {
  id?: string | null;
  slug?: string | null;
  lifecycleStatus?: string | null;
  verificationStatus?: string | null;
  isVerified?: boolean | null;
} | null): boolean {
  if (!listing) return false;
  if (isKnownTestResaleListing(listing)) return false;
  if (listing.lifecycleStatus && listing.lifecycleStatus !== 'PUBLISHED') return false;
  return listing.verificationStatus !== 'VERIFIED' && listing.isVerified !== true;
}

export interface PaginatedProjectResaleResult {
  items: PublicResaleListingDto[];
  facets: ProjectResaleInventoryFacets;
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

const VALID_LIFECYCLE_TRANSITIONS: Record<ResaleLifecycleStatus, ResaleLifecycleStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
  UNDER_REVIEW: ['APPROVED', 'DRAFT', 'SUBMITTED'],
  APPROVED: ['PUBLISHED', 'DRAFT'],
  PUBLISHED: ['PAUSED', 'SOLD_RENTED', 'ARCHIVED'],
  PAUSED: ['PUBLISHED', 'SOLD_RENTED', 'ARCHIVED'],
  SOLD_RENTED: ['ARCHIVED'],
  ARCHIVED: ['DRAFT'],
};

export class ResaleListingService {
  constructor(
    private repo: ResaleListingRepository = defaultResaleRepo,
    private projService: any = projectIntelligenceService
  ) {}

  private isProjectPublished(proj: any): boolean {
    if (!proj) return false;
    const isPub = proj.lifecycleStatus ? proj.lifecycleStatus === 'PUBLISHED' : proj.isPublished === true;
    return isPub && proj.isPublished !== false;
  }

  async getPublicListingBySlugOrId(identifier: string): Promise<PublicResaleListingDto | null> {
    if (!identifier || typeof identifier !== 'string') return null;
    const trimmed = identifier.trim();
    if (!trimmed || isKnownTestResaleListing(trimmed)) return null;
    const listing = await this.repo.findBySlugOrId(trimmed);
    if (!listing || listing.lifecycleStatus !== 'PUBLISHED' || isKnownTestResaleListing(listing)) return null;

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

  async getPublicListingDetailBySlugOrId(identifier: string): Promise<ResaleListingDetailViewModel | null> {
    const publicDto = await this.getPublicListingBySlugOrId(identifier);
    if (!publicDto) return null;
    return toResaleListingDetailViewModel(publicDto);
  }

  async getPublicListingBySlug(slug: string): Promise<PublicResaleListingDto | null> {
    if (!slug || isKnownTestResaleListing(slug)) return null;
    const listing = await this.repo.findBySlug(slug);
    if (!listing || listing.lifecycleStatus !== 'PUBLISHED' || isKnownTestResaleListing(listing)) return null;
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

  async getPublicListingDetailBySlug(slug: string): Promise<ResaleListingDetailViewModel | null> {
    const publicDto = await this.getPublicListingBySlug(slug);
    if (!publicDto) return null;
    return toResaleListingDetailViewModel(publicDto);
  }

  async getPublicListingById(id: string): Promise<PublicResaleListingDto | null> {
    if (!id || isKnownTestResaleListing(id)) return null;
    const listing = await this.repo.findById(id);
    if (!listing || listing.lifecycleStatus !== 'PUBLISHED' || isKnownTestResaleListing(listing)) return null;
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
      const proj = await this.projService.getProjectById(projectId, includeUnpublished);
      if (!proj) return null;
      let location = proj.location || null;
      if (!location && proj.locationId) {
        location = await locationRepository.findById(proj.locationId);
      }
      const mediaList = Array.isArray(proj.media) ? proj.media : [];
      const featuredMedia = mediaList.find((m: any) => m?.isFeatured && m?.url) || mediaList.find((m: any) => m?.url);
      const configs = Array.isArray(proj.configurations) ? proj.configurations : [];
      const bhks = Array.from(
        new Set<number>(
          configs
            .map((c: any) => c?.bedroomCount)
            .filter((b: any): b is number => typeof b === 'number' && b > 0)
        )
      ).sort((a, b) => a - b);
      const startingPrice = proj.pricing?.startingPrice ?? proj.startingPrice ?? null;

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
        shortDescription: proj.shortDescription ?? proj.description ?? null,
        reraVerified: proj.rera?.status === 'VERIFIED' || proj.reraVerified === true,
        featuredImageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? proj.featuredImageUrl ?? null),
        bhkSummary: bhks,
        startingPrice: typeof startingPrice === 'number' ? startingPrice : null,
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

    const imageMedia = mediaList.filter(
      m =>
        m &&
        typeof m.url === 'string' &&
        m.url.trim().length > 0 &&
        (m.mediaType || 'IMAGE').toUpperCase() !== 'VIDEO' &&
        (m.category || '').toUpperCase() !== 'WALKTHROUGH'
    );
    const featuredMedia = imageMedia.find(m => m.isFeatured) || imageMedia[0] || null;
    const bhks = Array.from(
      new Set<number>(
        configs
          .map(c => c.bedroomCount)
          .filter((b): b is number => typeof b === 'number' && b > 0)
      )
    ).sort((a, b) => a - b);
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
      shortDescription: proj.shortDescription ?? proj.description ?? null,
      reraVerified: rera?.status === 'VERIFIED' || proj.reraStatus === 'VERIFIED',
      featuredImageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? null),
      bhkSummary: bhks,
      startingPrice,
    };
  }

  private async buildPublicDto(
    listing: ResaleListing,
    preloadedProjectDto?: {
      id: string;
      name: string;
      slug: string;
      location?: { id: string; name: string; slug: string; type: any } | null;
      developerName?: string | null;
      developerSlug?: string | null;
      status?: string | null;
      shortDescription?: string | null;
      reraVerified?: boolean;
      featuredImageUrl?: string | null;
      bhkSummary?: number[];
      startingPrice?: number | null;
    } | null,
    preloadedOptions?: {
      locationDto?: { id: string; name: string; slug: string; type: any } | null;
      mediaList?: any[];
      amenitiesList?: any[];
      skipAmenities?: boolean;
    }
  ): Promise<PublicResaleListingDto> {
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
    }
    if (!locationDto && projectDto?.location) {
      locationDto = projectDto.location;
    }

    const [mediaList, amenitiesList] = await Promise.all([
      preloadedOptions?.mediaList
        ? Promise.resolve(preloadedOptions.mediaList)
        : this.repo.findMediaByListingId(listing.id),
      preloadedOptions?.amenitiesList
        ? Promise.resolve(preloadedOptions.amenitiesList)
        : preloadedOptions?.skipAmenities
          ? Promise.resolve([])
          : this.repo.findAmenitiesByListingId(listing.id),
    ]);

    const listingPartyLabel = listing.listingPartyType === 'OWNER' ? 'Owner Listed' : 'Listing Partner';

    return {
      id: listing.id,
      slug: listing.slug ?? null,
      project: projectDto,
      location: locationDto,
      propertyType: listing.propertyType,
      configuration: listing.configuration,
      bedroomCount: listing.bedroomCount,
      carpetArea: listing.carpetArea ?? null,
      builtUpArea: listing.builtUpArea ?? null,
      superBuiltUpArea: listing.superBuiltUpArea ?? null,
      askingPrice: listing.askingPrice,
      furnishing: listing.furnishing,
      facing: listing.facing,
      floorCategory: listing.floorCategory,
      possession: listing.possession,
      possessionDate: listing.possessionDate ? listing.possessionDate.toISOString() : null,
      description: listing.description ?? null,
      listingParty: {
        type: listing.listingPartyType,
        label: listingPartyLabel,
      },
      isVerified: listing.verificationStatus === 'VERIFIED',
      verifiedAt: listing.verifiedAt ? listing.verifiedAt.toISOString() : null,
      media: mediaList
        .filter((m: any) => m && typeof m.url === 'string' && m.url.trim().length > 0 && (m.mediaType || 'IMAGE').toUpperCase() !== 'VIDEO' && (m.category || '').toUpperCase() !== 'WALKTHROUGH')
        .map((m: any) => ({
          id: m.id,
          mediaType: m.mediaType,
          category: m.category,
          url: normalizeMediaPublicUrl(m.url) || m.url,
          altText: m.altText ?? null,
          caption: m.caption ?? null,
          sortOrder: m.sortOrder,
          isFeatured: m.isFeatured,
        })),
      amenities: amenitiesList.map((a: any) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
        category: a.category,
        icon: a.icon ?? null,
      })),
      createdAt: listing.createdAt.toISOString(),
      updatedAt: listing.updatedAt.toISOString(),
    };
  }

  private async buildAdminDto(listing: ResaleListing): Promise<AdminResaleListingDto> {
    const publicDto = await this.buildPublicDto(listing);
    return {
      ...publicDto,
      projectId: listing.projectId,
      locationId: listing.locationId ?? null,
      latitude: listing.latitude ?? null,
      longitude: listing.longitude ?? null,
      geometry: listing.geometry ?? null,
      location: publicDto.location || publicDto.project?.location || null,
      listingPartyType: listing.listingPartyType,
      listingPartyDisplayName: listing.listingPartyDisplayName ?? null,
      ownerName: listing.ownerName ?? null,
      ownerPhone: listing.ownerPhone ?? null,
      ownerEmail: listing.ownerEmail ?? null,
      brokerName: listing.brokerName ?? null,
      brokerPhone: listing.brokerPhone ?? null,
      brokerEmail: listing.brokerEmail ?? null,
      privatePhone: listing.privatePhone ?? null,
      privateEmail: listing.privateEmail ?? null,
      internalNotes: listing.internalNotes ?? null,
      source: listing.source ?? null,
      crmId: listing.crmId ?? null,
      lifecycleStatus: listing.lifecycleStatus,
      verificationStatus: listing.verificationStatus,
      verifiedAt: listing.verifiedAt ? listing.verifiedAt.toISOString() : null,
      verifiedBy: listing.verifiedBy ?? null,
    };
  }

  async createListing(data: {
    projectId?: string | null;
    locationId?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geometry?: string | null;
    propertyType: any;
    configuration: string;
    bedroomCount: number;
    carpetArea?: number | null;
    builtUpArea?: number | null;
    superBuiltUpArea?: number | null;
    askingPrice: number;
    furnishing: FurnishingStatus;
    facing: FacingDirection;
    floorCategory: FloorCategory;
    possession: PossessionStatus;
    possessionDate?: Date | null;
    description?: string | null;
    listingPartyType: ListingPartyType;
    listingPartyDisplayName?: string | null;
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
  }): Promise<AdminResaleListingDto> {
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

    // 2. Validate asking price
    if (!data.askingPrice || typeof data.askingPrice !== 'number' || data.askingPrice <= 0) {
      throw new ValidationError('Asking price must be a positive number.');
    }

    // 3. Validate bedroom count & configuration
    if (data.bedroomCount === undefined || data.bedroomCount < 0) {
      throw new ValidationError('Bedroom count must be a non-negative number.');
    }
    if (!data.configuration || data.configuration.trim().length === 0) {
      throw new ValidationError('Configuration is required.');
    }

    // 4. Validate listing party type
    if (!['OWNER', 'LISTING_PARTNER'].includes(data.listingPartyType)) {
      throw new ValidationError('Invalid listing party type. Must be OWNER or LISTING_PARTNER.');
    }

    // 5. Generate unique slug for newly created listing
    const generatedSlug = await generateNewListingSlug({
      projectName,
      projectSlug,
      locationName,
      locationSlug,
      bedroomCount: data.bedroomCount,
      listingType: 'resale',
      checkExists: async (s) => Boolean(await this.repo.findBySlug(s)),
    });

    const createPayload = {
      projectId: data.projectId ?? null,
      locationId: locationIdToSave,
      latitude: latToSave,
      longitude: lngToSave,
      geometry: geomToSave,
      propertyType: data.propertyType,
      configuration: data.configuration.trim(),
      bedroomCount: data.bedroomCount,
      carpetArea: data.carpetArea ?? null,
      builtUpArea: data.builtUpArea ?? null,
      superBuiltUpArea: data.superBuiltUpArea ?? null,
      askingPrice: data.askingPrice,
      furnishing: data.furnishing || 'SEMI_FURNISHED',
      facing: data.facing || 'NORTH',
      floorCategory: data.floorCategory || 'MID_FLOOR',
      possession: data.possession || 'READY',
      possessionDate: data.possessionDate ?? null,
      description: data.description ?? null,
      listingPartyType: data.listingPartyType,
      listingPartyDisplayName: data.listingPartyDisplayName ?? null,
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
    };

    let listing;
    try {
      listing = await this.repo.create({
        slug: generatedSlug,
        ...createPayload,
      });
    } catch (err: any) {
      const isCollision =
        (err?.code || err?.parent?.code || err?.cause?.code) === '23505' &&
        (err?.constraint || err?.parent?.constraint || err?.cause?.constraint) === 'uq_resale_listings_slug_not_null';

      if (isCollision) {
        const retrySlug = await generateNewListingSlug({
          projectName,
          projectSlug,
          locationName,
          locationSlug,
          bedroomCount: data.bedroomCount,
          listingType: 'resale',
          checkExists: async (s) => Boolean(await this.repo.findBySlug(s)),
        });
        listing = await this.repo.create({
          slug: retrySlug,
          ...createPayload,
        });
      } else {
        throw err;
      }
    }

    return await this.buildAdminDto(listing);
  }

  async updateListing(id: string, data: Partial<ResaleListing>): Promise<AdminResaleListingDto> {
    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Resale listing ${id} not found.`);
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

    if (data.askingPrice !== undefined && (typeof data.askingPrice !== 'number' || data.askingPrice <= 0)) {
      throw new ValidationError('Asking price must be a positive number.');
    }

    const normalizedPossessionDate =
      data.possessionDate !== undefined
        ? data.possessionDate
          ? data.possessionDate instanceof Date
            ? data.possessionDate
            : new Date(data.possessionDate as any)
          : null
        : existing.possessionDate;

    const updated = await this.repo.update(id, {
      ...data,
      possessionDate: normalizedPossessionDate,
      locationId: locationIdToSave,
      latitude: latToSave,
      longitude: lngToSave,
      geometry: geomToSave,
    });
    return await this.buildAdminDto(updated);
  }

  async transitionLifecycle(id: string, newStatus: ResaleLifecycleStatus): Promise<AdminResaleListingDto> {
    const listing = await this.repo.findById(id);
    if (!listing) {
      throw new NotFoundError(`Resale listing ${id} not found.`);
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

  async setVerificationStatus(
    id: string,
    status: ResaleVerificationStatus,
    verifiedBy: string
  ): Promise<AdminResaleListingDto> {
    const listing = await this.repo.findById(id);
    if (!listing) {
      throw new NotFoundError(`Resale listing ${id} not found.`);
    }

    const updated = await this.repo.update(id, {
      verificationStatus: status,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      verifiedBy: status === 'VERIFIED' ? verifiedBy : null,
    });
    return await this.buildAdminDto(updated);
  }


  async getAdminListingById(id: string): Promise<AdminResaleListingDto | null> {
    const listing = await this.repo.findById(id);
    if (!listing) return null;
    return await this.buildAdminDto(listing);
  }

  async getPublicListingsForProject(projectId: string): Promise<PublicResaleListingDto[]> {
    const [published, projectDto] = await Promise.all([
      this.repo.findPublishedByProjectId(projectId),
      this.resolveProjectDto(projectId),
    ]);
    const valid = published.filter(l => !isKnownTestResaleListing(l));
    return Promise.all(valid.map(l => this.buildPublicDto(l, projectDto)));
  }

  async getPaginatedPublicListingsForProject(
    projectId: string,
    options?: {
      filter?: ResaleFilterOptions;
      page?: number;
      pageSize?: number;
    }
  ): Promise<PaginatedProjectResaleResult> {
    const pageSize = Math.max(1, options?.pageSize ?? 9);
    const requestedPage = Math.max(1, options?.page ?? 1);
    const baseFilter: ResaleFilterOptions = {
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

    const nonTestEntities = pageEntities.filter(e => !isKnownTestResaleListing(e));
    const rawDtos = await Promise.all(
      nonTestEntities.map(entity => this.buildPublicDto(entity, projectDto))
    );

    const items = getEligibleResaleListings(rawDtos, projectId);

    return {
      items,
      facets,
      page,
      pageSize,
      totalPages,
    };
  }

  async listAdminListings(filter?: any): Promise<AdminResaleListingDto[]> {
    const list = await this.repo.findAll(filter);
    const result: AdminResaleListingDto[] = [];
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

  async deleteListing(id: string): Promise<boolean> {
    this.invalidatePublishedCache();
    return await this.repo.delete(id);
  }

  async listPublicListings(
    filter?: ResaleFilterOptions & {
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
  ): Promise<PublicResaleListingDto[]> {
    const { skipAmenities, preloadedContext, ...repoFilter } = filter || {};
    const hasRepoFilterKeys = Object.keys(repoFilter).length > 0;
    const rawList = hasRepoFilterKeys
      ? await this.repo.findAll({ ...repoFilter, lifecycleStatus: 'PUBLISHED' })
      : await this.getPublishedListingsRaw();
    let list = rawList.filter(l => !isKnownTestResaleListing(l));
    if (preloadedContext?.allowedLocationIds && preloadedContext.projectMap) {
      const allowed = preloadedContext.allowedLocationIds;
      list = list.filter(l => {
        const directLocId = (l as any).locationId;
        const projLocId = l.projectId ? preloadedContext.projectMap?.get(l.projectId)?.locationId : null;
        return Boolean((projLocId && allowed.has(projLocId)) || (directLocId && allowed.has(directLocId)));
      });
    }
    if (list.length === 0) return [];

    // If custom projService is injected in unit tests, use standard buildPublicDto path
    if (this.projService !== projectIntelligenceService) {
      const result: PublicResaleListingDto[] = [];
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
      const arr = mediaByListing.get(m.resaleListingId) || [];
      arr.push(m);
      mediaByListing.set(m.resaleListingId, arr);
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
        new Set<number>(
          pConfigs
            .map((c: any) => c.bedroomCount)
            .filter((b: any): b is number => typeof b === 'number' && b > 0)
        )
      ).sort((a, b) => a - b);
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
        shortDescription: proj.shortDescription ?? proj.description ?? null,
        reraVerified: rera?.status === 'VERIFIED' || proj.reraStatus === 'VERIFIED',
        featuredImageUrl: normalizeMediaPublicUrl(featuredMedia?.url ?? null),
        bhkSummary: bhks,
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

  async findMediaByListingId(listingId: string) {
    return await this.repo.findMediaByListingId(listingId);
  }

  async addMedia(listingId: string, mediaData: any) {
    return await this.repo.addMedia({ resaleListingId: listingId, ...mediaData });
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

export const resaleListingService = new ResaleListingService();
