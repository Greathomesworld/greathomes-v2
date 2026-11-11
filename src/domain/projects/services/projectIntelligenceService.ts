import {
  Project,
  ProjectConfiguration,
  ProjectMedia,
  ProjectRera,
  Amenity,
  ProjectFaq,
  ProjectStatus,
  ProjectLifecycleStatus,
  PropertyType,
  PriceBasis,
  ReraStatus,
  ProjectSeo,
  ProjectConsideration,
  ConsiderationSection,
} from "../entities";
import {
  ProjectRepository,
  ProjectConfigurationRepository,
  ProjectMediaRepository,
  ProjectReraRepository,
  AmenityRepository,
  ProjectFaqRepository,
  ProjectSeoRepository,
  ProjectConsiderationRepository,
  ProjectFilterOptions,
} from "../../repositories/projectRepository";
import { DeveloperRepository } from "../../repositories/developerRepository";
import { LocationRepository } from "../../repositories/locationRepository";
import { Location } from "../../locations/entities";
import {
  PublicProjectDto,
  PublicProjectConfigurationDto,
  toPublicProjectDto,
  calculateEffectivePricePerSqft,
  ValidationError,
} from "../dto/projectDto";
import { normalizeMediaPublicUrl } from "@/src/lib/mediaUtils";
import {
  parseIndianCurrencyPrice,
  parsePositiveAreaSqft,
  isConfigurationPriceOnRequest,
  comparePricesWithPorLast,
} from "@/src/lib/priceUtils";

export { ValidationError };

export class UnauthorizedError extends Error {
  status = 403;
  statusCode = 403;
  constructor(message = "Forbidden: Insufficient permissions for this operation") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class DuplicateSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateSlugError";
  }
}

export class DuplicateConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateConfigurationError";
  }
}

export interface CreateProjectInput {
  developerId: string;
  locationId: string;
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  status: ProjectStatus;
  lifecycleStatus?: ProjectLifecycleStatus;
  propertyType: PropertyType;
  startingPrice?: number;
  priceOnRequest?: boolean;
  projectArea?: string | null;
  towerCount?: number | null;
  totalUnits?: number | null;
  floors?: string | null;
  possession?: string | null;
  possessionDate?: Date | string | null;
  featured?: boolean;
  isPublished?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  reraStatus?: ReraStatus;
  reraRegistrationNumber?: string;
  reraAuthority?: string;
}

export interface UpdateProjectInput {
  developerId?: string;
  locationId?: string;
  name?: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  status?: ProjectStatus;
  lifecycleStatus?: ProjectLifecycleStatus;
  propertyType?: PropertyType;
  startingPrice?: number;
  priceOnRequest?: boolean;
  projectArea?: string | null;
  towerCount?: number | null;
  totalUnits?: number | null;
  floors?: string | null;
  possession?: string | null;
  possessionDate?: Date | string | null;
  featured?: boolean;
  isPublished?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  reraStatus?: ReraStatus;
  reraRegistrationNumber?: string;
}

export interface CreateConfigurationInput {
  name: string;
  bedroomCount?: number | null;
  carpetArea?: number | null;
  builtUpArea?: number | null;
  superBuiltUpArea?: number | null;
  price?: number | string | null;
  priceBasis: PriceBasis;
  priceOnRequest?: boolean;
  floorPlanMediaId?: string | null;
  availability?: string;
}

export interface ProjectFaqWithProject {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  developerName?: string | null;
  developerId?: string | null;
  locationName?: string | null;
  question: string;
  answer: string;
  sortOrder: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectListOptions {
  page?: number;
  limit?: number;
  status?: ProjectStatus;
  lifecycleStatus?: ProjectLifecycleStatus;
  developerId?: string;
  locationId?: string;
  propertyType?: PropertyType;
  featured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: string; // 'name:asc' | 'name:desc' | 'price:asc' | 'price:desc' | 'createdAt:desc' | 'createdAt:asc'
}

const VALID_PROPERTY_TYPES: PropertyType[] = [
  'APARTMENT',
  'FLAT',
  'VILLA',
  'INDEPENDENT_HOUSE',
  'PLOT',
  'DUPLEX',
  'PENTHOUSE',
];

const VALID_PROJECT_STATUSES: ProjectStatus[] = [
  'UPCOMING',
  'NEW_LAUNCH',
  'UNDER_CONSTRUCTION',
  'READY_TO_MOVE',
  'COMPLETED',
  'SOLD_OUT',
];

const VALID_PRICE_BASES: PriceBasis[] = [
  'CARPET_AREA',
  'BUILT_UP_AREA',
  'SUPER_BUILT_UP_AREA',
];

export class ProjectIntelligenceService {
  private seoRepository: ProjectSeoRepository;
  private considerationRepository: ProjectConsiderationRepository;

  constructor(
    private projectRepository: ProjectRepository,
    private configurationRepository: ProjectConfigurationRepository,
    private mediaRepository: ProjectMediaRepository,
    private reraRepository: ProjectReraRepository,
    private amenityRepository: AmenityRepository,
    private faqRepository: ProjectFaqRepository,
    private developerRepository: DeveloperRepository,
    private locationRepository: LocationRepository,
    seoRepository?: ProjectSeoRepository,
    considerationRepository?: ProjectConsiderationRepository
  ) {
    this.seoRepository = seoRepository || {
      findByProjectId: async () => null,
      upsert: async (seo: any) => ({
        id: 'mock-seo-id',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...seo,
      }),
    };
    this.considerationRepository = considerationRepository || {
      findByProjectId: async () => [],
      findById: async () => null,
      create: async (data: any) => ({ ...data, id: 'mock-id', createdAt: new Date(), updatedAt: new Date() }),
      update: async () => null,
      delete: async () => true,
      reorder: async () => {},
    };

    const configRepoWithMedia = this.configurationRepository as unknown as {
      setMediaRepository?: (mediaRepo: ProjectMediaRepository) => void;
    };
    if (typeof configRepoWithMedia.setMediaRepository === 'function') {
      configRepoWithMedia.setMediaRepository(this.mediaRepository);
    }
  }

  /**
   * Validates common project attributes.
   */
  private async validateProjectInput(
    data: CreateProjectInput | UpdateProjectInput,
    isUpdate = false,
    currentId?: string
  ): Promise<void> {
    if (!isUpdate || data.name !== undefined) {
      if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
        throw new ValidationError("Project name is required and cannot be empty.");
      }
    }

    if (!isUpdate || data.slug !== undefined) {
      if (!data.slug || typeof data.slug !== 'string') {
        throw new ValidationError("Slug is required.");
      }
      const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
      if (!slugRegex.test(data.slug)) {
        throw new ValidationError(
          "Invalid slug format. Must be lowercase alphanumeric words separated by single hyphens."
        );
      }

      const existingProject = await this.projectRepository.findBySlug(data.slug);
      if (existingProject && (!isUpdate || existingProject.id !== currentId)) {
        throw new DuplicateSlugError(`A project with slug '${data.slug}' already exists.`);
      }
    }

    if (!isUpdate || data.propertyType !== undefined) {
      if (!data.propertyType || !VALID_PROPERTY_TYPES.includes(data.propertyType)) {
        throw new ValidationError(
          `Invalid property type. Must be one of: ${VALID_PROPERTY_TYPES.join(', ')}`
        );
      }
    }

    if (!isUpdate || data.status !== undefined) {
      if (!data.status || !VALID_PROJECT_STATUSES.includes(data.status)) {
        throw new ValidationError(
          `Invalid project status. Must be one of: ${VALID_PROJECT_STATUSES.join(', ')}`
        );
      }
    }

    if (!isUpdate || data.developerId !== undefined) {
      if (!data.developerId) {
        throw new ValidationError("developerId is required.");
      }
      const developer = await this.developerRepository.findById(data.developerId);
      if (!developer) {
        throw new ValidationError(`Developer with id '${data.developerId}' does not exist.`);
      }
    }

    if (!isUpdate || data.locationId !== undefined) {
      if (!data.locationId) {
        throw new ValidationError("locationId is required.");
      }
      const location = await this.locationRepository.findById(data.locationId);
      if (!location) {
        throw new ValidationError(`Location with id '${data.locationId}' does not exist.`);
      }
    }

    if (data.startingPrice !== undefined && data.startingPrice !== null) {
      if (typeof data.startingPrice !== 'number' || data.startingPrice < 0) {
        throw new ValidationError("Starting price must be a non-negative number.");
      }
    }

    // Project-level coordinates validation
    const rawLat = data.latitude as unknown;
    const rawLng = data.longitude as unknown;
    const hasLat =
      rawLat !== undefined &&
      rawLat !== null &&
      !(typeof rawLat === 'string' && rawLat.trim() === '');
    const hasLng =
      rawLng !== undefined &&
      rawLng !== null &&
      !(typeof rawLng === 'string' && rawLng.trim() === '');

    if (hasLat !== hasLng) {
      throw new ValidationError("Both project latitude and longitude must be provided together.");
    }

    if (hasLat && hasLng) {
      if (
        typeof rawLat === 'boolean' ||
        typeof rawLng === 'boolean' ||
        typeof rawLat === 'object' ||
        typeof rawLng === 'object'
      ) {
        throw new ValidationError("Project coordinates must be valid numbers.");
      }
      const lat = Number(rawLat);
      const lng = Number(rawLng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new ValidationError("Project coordinates must be valid numbers.");
      }
      if (lat < -90 || lat > 90) {
        throw new ValidationError("Project latitude must be between -90 and 90 degrees.");
      }
      if (lng < -180 || lng > 180) {
        throw new ValidationError("Project longitude must be between -180 and 180 degrees.");
      }
      if (lat === 0 && lng === 0) {
        throw new ValidationError("Project coordinates cannot be (0, 0) Null Island.");
      }
    }
  }

  /**
   * Creates a new Project entity.
   */
  async createProject(
    data: CreateProjectInput,
    isInternalStaff = false
  ): Promise<Project> {
    await this.validateProjectInput(data, false);

    const isPublished = data.lifecycleStatus === 'PUBLISHED' || data.isPublished === true;
    const lifecycleStatus: ProjectLifecycleStatus =
      data.lifecycleStatus ?? (isPublished ? 'PUBLISHED' : 'DRAFT');

    const project = await this.projectRepository.create({
      developerId: data.developerId,
      locationId: data.locationId,
      name: data.name.trim(),
      slug: data.slug.trim().toLowerCase(),
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      status: data.status,
      lifecycleStatus,
      propertyType: data.propertyType,
      startingPrice: data.startingPrice,
      priceOnRequest: Boolean(data.priceOnRequest),
      projectArea: data.projectArea ?? null,
      towerCount: data.towerCount ?? null,
      totalUnits: data.totalUnits ?? null,
      floors: data.floors ?? null,
      possession: data.possession ?? null,
      possessionDate: data.possessionDate ?? null,
      latitude: data.latitude !== undefined && data.latitude !== null ? Number(data.latitude) : null,
      longitude: data.longitude !== undefined && data.longitude !== null ? Number(data.longitude) : null,
      isPublished: lifecycleStatus === 'PUBLISHED',
      featured: data.featured ?? false,
      reraStatus: data.reraStatus ?? 'NOT_PROVIDED',
      reraRegistrationNumber: data.reraRegistrationNumber,
    });

    // If RERA information provided, store in RERA repository
    if (data.reraStatus || data.reraRegistrationNumber) {
      await this.reraRepository.upsert({
        projectId: project.id,
        status: data.reraStatus ?? 'NOT_PROVIDED',
        authority: data.reraAuthority ?? (data.reraRegistrationNumber ? 'WBRERA' : null),
        registrationNumber: data.reraRegistrationNumber ?? null,
        verifiedAt: data.reraStatus === 'VERIFIED' ? new Date() : null,
      });
    }

    return project;
  }

  /**
   * Updates an existing project.
   */
  async updateProject(
    id: string,
    data: UpdateProjectInput,
    isInternalStaff = false
  ): Promise<Project> {
    const existing = await this.projectRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Project with id '${id}' not found`);
    }

    await this.validateProjectInput(data, true, id);

    const updatePayload: Partial<Project> = { ...data };
    if (data.priceOnRequest !== undefined) {
      updatePayload.priceOnRequest = Boolean(data.priceOnRequest);
    }
    if (data.lifecycleStatus) {
      updatePayload.isPublished = data.lifecycleStatus === 'PUBLISHED';
    } else if (data.isPublished !== undefined) {
      updatePayload.lifecycleStatus = data.isPublished ? 'PUBLISHED' : 'DRAFT';
    }

    const updated = await this.projectRepository.update(id, updatePayload);
    if (!updated) {
      throw new NotFoundError(`Project with id '${id}' not found`);
    }

    // Update RERA if provided
    if (data.reraStatus !== undefined || data.reraRegistrationNumber !== undefined) {
      const existingRera = await this.reraRepository.findByProjectId(id);
      await this.reraRepository.upsert({
        projectId: id,
        status: data.reraStatus ?? existingRera?.status ?? 'NOT_PROVIDED',
        authority: existingRera?.authority ?? 'WBRERA',
        registrationNumber: data.reraRegistrationNumber ?? existingRera?.registrationNumber ?? null,
        verifiedAt: data.reraStatus === 'VERIFIED' ? new Date() : existingRera?.verifiedAt ?? null,
      });
    }

    return updated;
  }

  /**
   * Resolves canonical location path ancestry (root -> leaf).
   */
  async resolveLocationPath(locationId: string): Promise<
    { id: string; name: string; slug: string; type: string; latitude?: number | null; longitude?: number | null }[]
  > {
    const path: { id: string; name: string; slug: string; type: string; latitude?: number | null; longitude?: number | null }[] = [];
    let currentId: string | null = locationId;

    while (currentId) {
      const loc: Location | null = await this.locationRepository.findById(currentId);
      if (!loc) break;
      path.unshift({
        id: loc.id,
        name: loc.name,
        slug: loc.slug,
        type: loc.type,
        latitude: loc.latitude ?? null,
        longitude: loc.longitude ?? null,
      });
      currentId = loc.parentId ?? null;
    }

    return path;
  }

  /**
   * Builds the bounded PublicProjectDto for a single project.
   */
  private async buildPublicProjectDto(
    project: Project,
    isInternalStaff = false
  ): Promise<PublicProjectDto | null> {
    const [developer, location, configurations, media, amenities, faqs, rera, considerations, devMedia] = await Promise.all([
      this.developerRepository.findById(project.developerId),
      this.locationRepository.findById(project.locationId),
      this.configurationRepository.findByProjectId(project.id),
      this.mediaRepository.findByProjectId(project.id),
      this.amenityRepository.findByProjectId(project.id),
      this.faqRepository.findByProjectId(project.id),
      this.reraRepository.findByProjectId(project.id),
      this.considerationRepository.findByProjectId(project.id),
      developerMediaRepository.findByDeveloperId(project.developerId).catch(() => []),
    ]);

    if (!developer) {
      console.warn(`[ProjectIntelligence] Data Inconsistency: Developer '${project.developerId}' not found for project '${project.id}' (${project.name}). Excluding from payload.`);
      return null;
    }

    if (!location) {
      console.warn(`[ProjectIntelligence] Data Inconsistency: Location '${project.locationId}' not found for project '${project.id}' (${project.name}). Excluding from payload.`);
      return null;
    }

    const locationPath = await this.resolveLocationPath(location.id);
    const devLogo = devMedia.find(m => (m.category || '').toUpperCase() === 'LOGO' && m.url && m.url.trim().length > 0);

    return toPublicProjectDto(
      project,
      {
        id: developer.id,
        name: developer.name,
        slug: developer.slug,
        logoUrl: devLogo ? normalizeMediaPublicUrl(devLogo.url.trim()) : null,
        shortDescription: developer.shortDescription ?? null,
        description: developer.description ?? null,
      },
      location,
      locationPath,
      configurations,
      media,
      amenities,
      faqs,
      rera,
      considerations,
      { includeInternalPricing: isInternalStaff }
    );
  }

  /**
   * Retrieves a project by ID with visibility enforcement.
   */
  async getProjectById(
    id: string,
    isInternalStaff = false
  ): Promise<PublicProjectDto | null> {
    const project = await this.projectRepository.findById(id);
    if (!project) return null;

    const isPublished = project.lifecycleStatus
      ? project.lifecycleStatus === 'PUBLISHED'
      : project.isPublished !== false;

    if (!isInternalStaff && !isPublished) {
      return null;
    }

    return this.buildPublicProjectDto(project, isInternalStaff);
  }

  /**
   * Retrieves a project by canonical slug with visibility enforcement.
   */
  async getProjectBySlug(
    slug: string,
    isInternalStaff = false
  ): Promise<PublicProjectDto | null> {
    const project = await this.projectRepository.findBySlug(slug);
    if (!project) return null;

    const isPublished = project.lifecycleStatus
      ? project.lifecycleStatus === 'PUBLISHED'
      : project.isPublished !== false;

    if (!isInternalStaff && !isPublished) {
      return null;
    }

    return this.buildPublicProjectDto(project, isInternalStaff);
  }

  /**
   * Lists projects with pagination, controlled sorting, and public filtering.
   */
  async listProjects(
    options: ProjectListOptions = {},
    isInternalStaff = false
  ): Promise<{
    data: PublicProjectDto[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(50, Math.max(1, options.limit || 10));

    const filter: ProjectFilterOptions = {
      status: options.status,
      developerId: options.developerId,
      locationId: options.locationId,
      propertyType: options.propertyType,
      featured: options.featured,
    };

    // Anonymous public users ONLY receive published projects
    if (!isInternalStaff) {
      filter.lifecycleStatus = 'PUBLISHED';
      filter.isPublished = true;
    } else if (options.lifecycleStatus) {
      filter.lifecycleStatus = options.lifecycleStatus;
    }

    const all = await this.projectRepository.list(filter);

    const validDtos: PublicProjectDto[] = [];
    for (const project of all) {
      const dto = await this.buildPublicProjectDto(project, isInternalStaff);
      if (dto) {
        if (options.minPrice !== undefined || options.maxPrice !== undefined) {
          if (dto.pricing.priceOnRequest || dto.pricing.startingPrice === null || dto.pricing.startingPrice <= 0) {
            continue;
          }
          if (options.minPrice !== undefined && dto.pricing.startingPrice < options.minPrice) {
            continue;
          }
          if (options.maxPrice !== undefined && dto.pricing.startingPrice > options.maxPrice) {
            continue;
          }
        }
        validDtos.push(dto);
      }
    }

    // Controlled sorting whitelist using resolved public pricing so PoR projects ALWAYS sort last
    // and never leak internal starting prices via sort order.
    const sort = options.sort || 'createdAt:desc';
    validDtos.sort((a, b) => {
      switch (sort) {
        case 'name:asc':
          return a.name.localeCompare(b.name);
        case 'name:desc':
          return b.name.localeCompare(a.name);
        case 'price:asc':
          return comparePricesWithPorLast(
            a.pricing.startingPrice,
            b.pricing.startingPrice,
            'asc',
            Boolean(a.pricing.priceOnRequest),
            Boolean(b.pricing.priceOnRequest)
          );
        case 'price:desc':
          return comparePricesWithPorLast(
            a.pricing.startingPrice,
            b.pricing.startingPrice,
            'desc',
            Boolean(a.pricing.priceOnRequest),
            Boolean(b.pricing.priceOnRequest)
          );
        case 'createdAt:asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'createdAt:desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    const total = validDtos.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginated = validDtos.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Paginates through all pages of listProjects (50 records per page) so callers
   * such as public sitemaps and location SEO eligibility checks never truncate at 50 records.
   */
  async listAllProjects(
    options: Omit<ProjectListOptions, 'page' | 'limit'> = {},
    isInternalStaff = false
  ): Promise<PublicProjectDto[]> {
    const collected: PublicProjectDto[] = [];
    let currentPage = 1;
    let totalPages = 1;

    do {
      const res = await this.listProjects(
        { ...options, page: currentPage, limit: 50 },
        isInternalStaff
      );
      collected.push(...res.data);
      totalPages = res.pagination.totalPages || 1;
      currentPage += 1;
    } while (currentPage <= totalPages);

    return collected;
  }

  /**
   * Creates a marketable project configuration with strong validation.
   */
  async createConfiguration(
    projectId: string,
    data: CreateConfigurationInput,
    isInternalStaff = true
  ): Promise<PublicProjectConfigurationDto> {
    if (!isInternalStaff) {
      throw new UnauthorizedError("Forbidden: Only authorized internal staff may create configurations.");
    }

    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with id '${projectId}' not found`);
    }

    // Validation
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
      throw new ValidationError("Configuration name is required");
    }

    const isPor = Boolean(data.priceOnRequest);
    const hasPriceInput =
      data.price !== undefined &&
      data.price !== null &&
      !(typeof data.price === 'string' && data.price.trim() === '') &&
      data.price !== 0 &&
      data.price !== '0';

    let parsedPrice = 0;
    if (hasPriceInput) {
      const candidate = parseIndianCurrencyPrice(data.price as unknown as string | number);
      if (candidate === null || candidate <= 0) {
        throw new ValidationError("Price must be a positive number greater than 0");
      }
      parsedPrice = candidate;
    } else if (!isPor) {
      throw new ValidationError("Price must be a positive number greater than 0");
    }

    if (!data.priceBasis || !VALID_PRICE_BASES.includes(data.priceBasis)) {
      throw new ValidationError(
        `Invalid price basis. Must be one of: ${VALID_PRICE_BASES.join(', ')}`
      );
    }

    const carpetArea = parsePositiveAreaSqft(data.carpetArea);
    if (carpetArea === null) {
      throw new ValidationError("Carpet area is mandatory and must be greater than 0");
    }

    let builtUpArea: number | undefined = undefined;
    if (
      data.builtUpArea !== undefined &&
      data.builtUpArea !== null &&
      !(typeof data.builtUpArea === 'string' && (data.builtUpArea as string).trim() === '')
    ) {
      const parsedBu = parsePositiveAreaSqft(data.builtUpArea);
      if (parsedBu === null) {
        throw new ValidationError("Built-up area must be greater than 0 if specified");
      }
      builtUpArea = parsedBu;
    }

    let superBuiltUpArea: number | undefined = undefined;
    if (
      data.superBuiltUpArea !== undefined &&
      data.superBuiltUpArea !== null &&
      !(typeof data.superBuiltUpArea === 'string' && (data.superBuiltUpArea as string).trim() === '')
    ) {
      const parsedSbu = parsePositiveAreaSqft(data.superBuiltUpArea);
      if (parsedSbu === null) {
        throw new ValidationError("Super built-up area must be greater than 0 if specified");
      }
      superBuiltUpArea = parsedSbu;
    }

    let bedroomCount: number | undefined = undefined;
    if (
      data.bedroomCount !== undefined &&
      data.bedroomCount !== null &&
      !(typeof data.bedroomCount === 'string' && (data.bedroomCount as string).trim() === '')
    ) {
      const parsedBhk = typeof data.bedroomCount === 'number' ? data.bedroomCount : Number(data.bedroomCount);
      if (!Number.isInteger(parsedBhk) || parsedBhk < 0) {
        throw new ValidationError("Bedroom count cannot be negative");
      }
      bedroomCount = parsedBhk;
    }

    // Verify required area exists for selected price basis
    if (data.priceBasis === 'BUILT_UP_AREA' && (!builtUpArea || builtUpArea <= 0)) {
      throw new ValidationError("Missing or invalid built-up area for BUILT_UP_AREA price basis");
    }
    if (data.priceBasis === 'SUPER_BUILT_UP_AREA' && (!superBuiltUpArea || superBuiltUpArea <= 0)) {
      throw new ValidationError("Missing or invalid super built-up area for SUPER_BUILT_UP_AREA price basis");
    }

    const effectiveRate =
      parsedPrice > 0
        ? calculateEffectivePricePerSqft(parsedPrice, data.priceBasis, {
            carpetArea,
            builtUpArea,
            superBuiltUpArea,
          })
        : 0;

    // Check for duplicate configurations (same normalized name in this project)
    const duplicates = await this.configurationRepository.findDuplicates(projectId, data.name);
    if (duplicates.length > 0) {
      throw new DuplicateConfigurationError(
        `Potential duplicate configuration detected: A configuration named '${data.name}' already exists in this project.`
      );
    }

    const configuration = await this.configurationRepository.create({
      projectId,
      name: data.name.trim(),
      bedroomCount,
      carpetArea,
      builtUpArea,
      superBuiltUpArea,
      price: parsedPrice,
      priceBasis: data.priceBasis,
      priceOnRequest: isPor,
      floorPlanMediaId: data.floorPlanMediaId,
      availability: data.availability ?? 'AVAILABLE',
    });

    return {
      id: configuration.id,
      name: configuration.name,
      bedroomCount: configuration.bedroomCount,
      carpetArea: configuration.carpetArea,
      builtUpArea: configuration.builtUpArea,
      superBuiltUpArea: configuration.superBuiltUpArea,
      price: configuration.price,
      priceBasis: configuration.priceBasis,
      priceOnRequest: Boolean(configuration.priceOnRequest),
      effectivePricePerSqft: effectiveRate,
      floorPlanMediaId: configuration.floorPlanMediaId,
      availability: configuration.availability ?? 'AVAILABLE',
    };
  }

  /**
   * Retrieves all configurations for a project.
   * Masks hidden prices and effective rates when `isInternalStaff` is false.
   */
  async getConfigurationsByProjectId(
    projectId: string,
    isInternalStaff = false
  ): Promise<PublicProjectConfigurationDto[]> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with id '${projectId}' not found`);
    }

    const configs = await this.configurationRepository.findByProjectId(projectId);
    return configs.map(c => {
      const isPorForPublic = isConfigurationPriceOnRequest(c, project);
      let effectiveRate = 0;
      if (typeof c.price === 'number' && Number.isFinite(c.price) && c.price > 0) {
        try {
          effectiveRate = calculateEffectivePricePerSqft(c.price, c.priceBasis, {
            carpetArea: c.carpetArea,
            builtUpArea: c.builtUpArea,
            superBuiltUpArea: c.superBuiltUpArea,
          });
        } catch (err: any) {
          if (!isPorForPublic) {
            console.warn(`[getConfigurationsByProjectId] Configuration '${c.name}' rate calculation warning: ${err.message}`);
          }
          effectiveRate = 0;
        }
      }

      const exposedPrice = isInternalStaff ? c.price : isPorForPublic ? 0 : c.price;
      const exposedRate = isInternalStaff ? effectiveRate : isPorForPublic ? 0 : effectiveRate;
      const exposedPor = isInternalStaff ? Boolean(c.priceOnRequest) : isPorForPublic;

      return {
        id: c.id,
        name: c.name,
        bedroomCount: c.bedroomCount,
        carpetArea: c.carpetArea,
        builtUpArea: c.builtUpArea,
        superBuiltUpArea: c.superBuiltUpArea,
        price: exposedPrice,
        priceBasis: c.priceBasis,
        priceOnRequest: exposedPor,
        effectivePricePerSqft: exposedRate,
        floorPlanMediaId: c.floorPlanMediaId,
        availability: c.availability ?? 'AVAILABLE',
      };
    });
  }

  /**
   * Retrieves all project configurations across all projects with canonical project metadata (admin-only).
   */
  async getAllConfigurationsWithProjects(): Promise<Array<{
    id: string;
    projectId: string;
    projectName: string;
    projectSlug: string;
    projectPriceOnRequest?: boolean;
    developerName?: string | null;
    locationName?: string | null;
    name: string;
    bedroomCount?: number | null;
    carpetArea?: number | null;
    builtUpArea?: number | null;
    superBuiltUpArea?: number | null;
    price: number;
    priceBasis: PriceBasis;
    priceOnRequest: boolean;
    effectivePricePerSqft: number;
    floorPlanMediaId?: string | null;
    floorPlanCount: number;
    hasFloorPlan: boolean;
    availability: string;
    createdAt: Date;
    updatedAt: Date;
  }>> {
    const [allConfigs, allProjects, allMedia, allDevs, allLocs] = await Promise.all([
      this.configurationRepository.findAll(),
      this.projectRepository.findAll(),
      this.mediaRepository.findAll({ category: 'FLOOR_PLANS' }).catch(() => []),
      this.developerRepository.list().catch(() => []),
      this.locationRepository.findAll().catch(() => []),
    ]);

    const projectMap = new Map<string, Project>();
    for (const p of allProjects) {
      projectMap.set(p.id, p);
    }

    const devMap = new Map<string, string>();
    for (const d of allDevs) {
      devMap.set(d.id, d.name);
    }

    const locMap = new Map<string, string>();
    for (const l of allLocs) {
      locMap.set(l.id, l.name);
    }

    const floorPlanCountByConfigId = new Map<string, number>();
    for (const m of allMedia) {
      if (m.configurationId) {
        const current = floorPlanCountByConfigId.get(m.configurationId) || 0;
        floorPlanCountByConfigId.set(m.configurationId, current + 1);
      }
    }

    return allConfigs.map(c => {
      const project = projectMap.get(c.projectId);
      let effectiveRate = 0;
      if (typeof c.price === 'number' && Number.isFinite(c.price) && c.price > 0) {
        try {
          effectiveRate = calculateEffectivePricePerSqft(c.price, c.priceBasis, {
            carpetArea: c.carpetArea,
            builtUpArea: c.builtUpArea,
            superBuiltUpArea: c.superBuiltUpArea,
          });
        } catch {
          effectiveRate = 0;
        }
      }

      const fpCount = (floorPlanCountByConfigId.get(c.id) || 0) + (c.floorPlanMediaId ? 1 : 0);

      return {
        id: c.id,
        projectId: c.projectId,
        projectName: project?.name || 'Unknown Project',
        projectSlug: project?.slug || '',
        projectPriceOnRequest: Boolean(project?.priceOnRequest),
        developerName: project?.developerId ? devMap.get(project.developerId) || null : null,
        locationName: project?.locationId ? locMap.get(project.locationId) || null : null,
        name: c.name,
        bedroomCount: c.bedroomCount ?? null,
        carpetArea: c.carpetArea ?? null,
        builtUpArea: c.builtUpArea ?? null,
        superBuiltUpArea: c.superBuiltUpArea ?? null,
        price: c.price,
        priceBasis: c.priceBasis,
        priceOnRequest: Boolean(c.priceOnRequest),
        effectivePricePerSqft: effectiveRate,
        floorPlanMediaId: c.floorPlanMediaId ?? null,
        floorPlanCount: fpCount,
        hasFloorPlan: fpCount > 0,
        availability: c.availability ?? 'AVAILABLE',
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
  }

  /**
   * Retrieves all media for a project.
   */
  async getMediaByProjectId(projectId: string): Promise<ProjectMedia[]> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundError(`Project with id '${projectId}' not found`);
    }
    const items = await this.mediaRepository.findByProjectId(projectId);
    return items.map((m) => ({
      ...m,
      url: normalizeMediaPublicUrl(m.url) || m.url,
    }));
  }

  /**
   * Checks data consistency for a project across its relational dependencies.
   */
  async checkConsistency(projectId: string): Promise<{
    isConsistent: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      return { isConsistent: false, issues: [`Project '${projectId}' does not exist.`] };
    }

    const developer = await this.developerRepository.findById(project.developerId);
    if (!developer) {
      issues.push(`Foreign key violation: Developer '${project.developerId}' not found.`);
    }

    const location = await this.locationRepository.findById(project.locationId);
    if (!location) {
      issues.push(`Foreign key violation: Location '${project.locationId}' not found.`);
    }

    const configs = await this.configurationRepository.findByProjectId(projectId);
    for (const c of configs) {
      if (c.priceOnRequest && (!c.price || c.price <= 0)) {
        // Price on Request configuration without an internal price is valid if required basis area exists
        if (!c.carpetArea || c.carpetArea <= 0) {
          issues.push(`Configuration '${c.name}' has invalid area/pricing: Missing or invalid carpet area`);
        } else if (c.priceBasis === 'BUILT_UP_AREA' && (!c.builtUpArea || c.builtUpArea <= 0)) {
          issues.push(`Configuration '${c.name}' has invalid area/pricing: Missing or invalid built-up area for BUILT_UP_AREA price basis`);
        } else if (c.priceBasis === 'SUPER_BUILT_UP_AREA' && (!c.superBuiltUpArea || c.superBuiltUpArea <= 0)) {
          issues.push(`Configuration '${c.name}' has invalid area/pricing: Missing or invalid super built-up area for SUPER_BUILT_UP_AREA price basis`);
        }
        continue;
      }
      try {
        calculateEffectivePricePerSqft(c.price, c.priceBasis, {
          carpetArea: c.carpetArea,
          builtUpArea: c.builtUpArea,
          superBuiltUpArea: c.superBuiltUpArea,
        });
      } catch (err: any) {
        issues.push(`Configuration '${c.name}' has invalid area/pricing: ${err.message}`);
      }
    }

    if (project.reraStatus === 'VERIFIED' && !project.reraRegistrationNumber) {
      issues.push(`RERA inconsistency: Project is marked VERIFIED but has no registration number.`);
    }

    return {
      isConsistent: issues.length === 0,
      issues,
    };
  }

  async updateConfiguration(
    id: string,
    data: Partial<ProjectConfiguration>,
    isInternalStaff = true,
    expectedProjectId?: string
  ): Promise<PublicProjectConfigurationDto> {
    if (!isInternalStaff) {
      throw new UnauthorizedError("Forbidden: Only authorized internal staff may update configurations.");
    }

    const existing = await this.configurationRepository.findById(id);
    if (!existing) throw new NotFoundError(`Configuration with id '${id}' not found`);

    if (expectedProjectId && existing.projectId !== expectedProjectId) {
      throw new ValidationError(`Configuration '${id}' does not belong to project '${expectedProjectId}'.`);
    }

    let normalizedName = existing.name;
    if (data.name !== undefined) {
      if (typeof data.name !== 'string' || !data.name.trim()) {
        throw new ValidationError("Configuration name is required");
      }
      normalizedName = data.name.trim();
    }

    const targetPriceOnRequest =
      data.priceOnRequest !== undefined
        ? Boolean(data.priceOnRequest)
        : Boolean(existing.priceOnRequest);

    let price = existing.price;
    if (data.price !== undefined) {
      const rawPrice = data.price as unknown;
      const isClearingPrice =
        rawPrice === null ||
        (typeof rawPrice === 'string' && rawPrice.trim() === '') ||
        rawPrice === 0 ||
        rawPrice === '0';

      if (isClearingPrice && targetPriceOnRequest) {
        // Preserve existing positive internal price unless none existed
        price = existing.price > 0 ? existing.price : 0;
      } else {
        const parsedPrice = parseIndianCurrencyPrice(rawPrice as string | number);
        if (parsedPrice === null || parsedPrice <= 0) {
          throw new ValidationError("Price must be a positive number greater than 0");
        }
        price = parsedPrice;
      }
    }

    if (!targetPriceOnRequest && (!price || !Number.isFinite(price) || price <= 0)) {
      throw new ValidationError(
        "A valid positive price is required before disabling Price on Request."
      );
    }

    let priceBasis = existing.priceBasis;
    if (data.priceBasis !== undefined) {
      if (!VALID_PRICE_BASES.includes(data.priceBasis)) {
        throw new ValidationError(`Invalid price basis. Must be one of: ${VALID_PRICE_BASES.join(', ')}`);
      }
      priceBasis = data.priceBasis;
    }

    let carpetArea = existing.carpetArea;
    if (data.carpetArea !== undefined) {
      const parsedCarpet = parsePositiveAreaSqft(data.carpetArea);
      if (parsedCarpet === null) {
        throw new ValidationError("Carpet area is mandatory and must be greater than 0.");
      }
      carpetArea = parsedCarpet;
    } else if (carpetArea === undefined || carpetArea === null || !Number.isFinite(carpetArea) || carpetArea <= 0) {
      throw new ValidationError("Carpet area is mandatory and must be greater than 0.");
    }

    let builtUpArea: number | undefined | null = existing.builtUpArea;
    if (data.builtUpArea !== undefined) {
      if (
        data.builtUpArea === null ||
        (typeof data.builtUpArea === 'string' && (data.builtUpArea as string).trim() === '')
      ) {
        builtUpArea = null;
      } else {
        const parsedBu = parsePositiveAreaSqft(data.builtUpArea);
        if (parsedBu === null) {
          throw new ValidationError("Built-up area must be greater than 0 if specified.");
        }
        builtUpArea = parsedBu;
      }
    }

    let superBuiltUpArea: number | undefined | null = existing.superBuiltUpArea;
    if (data.superBuiltUpArea !== undefined) {
      if (
        data.superBuiltUpArea === null ||
        (typeof data.superBuiltUpArea === 'string' && (data.superBuiltUpArea as string).trim() === '')
      ) {
        superBuiltUpArea = null;
      } else {
        const parsedSbu = parsePositiveAreaSqft(data.superBuiltUpArea);
        if (parsedSbu === null) {
          throw new ValidationError("Super built-up area must be greater than 0 if specified.");
        }
        superBuiltUpArea = parsedSbu;
      }
    }

    let bedroomCount: number | undefined | null = existing.bedroomCount;
    if (data.bedroomCount !== undefined) {
      if (
        data.bedroomCount === null ||
        (typeof data.bedroomCount === 'string' && (data.bedroomCount as string).trim() === '')
      ) {
        bedroomCount = null;
      } else {
        const parsedBhk = typeof data.bedroomCount === 'number' ? data.bedroomCount : Number(data.bedroomCount);
        if (!Number.isInteger(parsedBhk) || parsedBhk < 0) {
          throw new ValidationError("Bedroom count cannot be negative.");
        }
        bedroomCount = parsedBhk;
      }
    }

    if (priceBasis === 'BUILT_UP_AREA' && (!builtUpArea || builtUpArea <= 0)) {
      throw new ValidationError("Missing or invalid built-up area for BUILT_UP_AREA price basis");
    }
    if (priceBasis === 'SUPER_BUILT_UP_AREA' && (!superBuiltUpArea || superBuiltUpArea <= 0)) {
      throw new ValidationError("Missing or invalid super built-up area for SUPER_BUILT_UP_AREA price basis");
    }

    const areas = {
      carpetArea,
      builtUpArea: builtUpArea ?? undefined,
      superBuiltUpArea: superBuiltUpArea ?? undefined,
    };

    const effectiveRate =
      price > 0 ? calculateEffectivePricePerSqft(price, priceBasis, areas) : 0;

    if (data.name !== undefined && normalizedName.toLowerCase() !== existing.name.trim().toLowerCase()) {
      const duplicates = await this.configurationRepository.findDuplicates(existing.projectId, normalizedName, id);
      if (duplicates.length > 0) {
        throw new ValidationError(`A configuration named '${normalizedName}' already exists in this project.`);
      }
    }

    const updatePayload: Partial<ProjectConfiguration> = {
      ...data,
      name: normalizedName,
      price,
      priceBasis,
      priceOnRequest: targetPriceOnRequest,
      carpetArea,
    };
    if (data.builtUpArea !== undefined) {
      updatePayload.builtUpArea = (builtUpArea ?? null) as unknown as number | undefined;
    }
    if (data.superBuiltUpArea !== undefined) {
      updatePayload.superBuiltUpArea = (superBuiltUpArea ?? null) as unknown as number | undefined;
    }
    if (data.bedroomCount !== undefined) {
      updatePayload.bedroomCount = (bedroomCount ?? null) as unknown as number | undefined;
    }

    const updated = await this.configurationRepository.update(id, updatePayload);
    if (!updated) throw new NotFoundError(`Configuration with id '${id}' not found`);

    return {
      id: updated.id,
      name: updated.name,
      bedroomCount: updated.bedroomCount,
      carpetArea: updated.carpetArea,
      builtUpArea: updated.builtUpArea,
      superBuiltUpArea: updated.superBuiltUpArea,
      price: updated.price,
      priceBasis: updated.priceBasis,
      priceOnRequest: Boolean(updated.priceOnRequest),
      effectivePricePerSqft: effectiveRate,
      floorPlanMediaId: updated.floorPlanMediaId,
      availability: updated.availability ?? 'AVAILABLE',
    };
  }

  async deleteConfiguration(id: string, isInternalStaff = true, expectedProjectId?: string): Promise<boolean> {
    if (!isInternalStaff) {
      throw new UnauthorizedError("Forbidden: Only authorized internal staff may delete configurations.");
    }

    const existing = await this.configurationRepository.findById(id);
    if (!existing) throw new NotFoundError(`Configuration with id '${id}' not found`);

    if (expectedProjectId && existing.projectId !== expectedProjectId) {
      throw new ValidationError(`Configuration '${id}' does not belong to project '${expectedProjectId}'.`);
    }

    return await this.configurationRepository.delete(id);
  }

  async createMedia(projectId: string, data: Omit<ProjectMedia, 'id' | 'createdAt' | 'updatedAt'>, isInternalStaff = false): Promise<ProjectMedia> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    if (!data.url || !data.url.trim()) {
      throw new ValidationError("Media URL is required");
    }

    return await this.mediaRepository.create({
      projectId,
      mediaId: data.mediaId ?? (data as any).id ?? null,
      configurationId: data.configurationId || null,
      mediaType: data.mediaType || 'IMAGE',
      category: data.category,
      url: data.url.trim(),
      altText: data.altText || null,
      caption: data.caption || null,
      sortOrder: data.sortOrder ?? 0,
      isFeatured: data.isFeatured ?? false,
    });
  }

  async updateMedia(mediaId: string, data: Partial<ProjectMedia>, isInternalStaff = false): Promise<ProjectMedia> {
    const updated = await this.mediaRepository.update(mediaId, data);
    if (!updated) throw new NotFoundError(`Media with id '${mediaId}' not found`);
    return updated;
  }

  async deleteMedia(mediaId: string, isInternalStaff = false): Promise<boolean> {
    return await this.mediaRepository.delete(mediaId);
  }

  async createFaq(projectId: string, data: Omit<ProjectFaq, 'id' | 'createdAt' | 'updatedAt'>, isInternalStaff = false): Promise<ProjectFaq> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    if (!data.question || !data.question.trim()) {
      throw new ValidationError("FAQ question is required");
    }
    if (!data.answer || !data.answer.trim()) {
      throw new ValidationError("FAQ answer is required");
    }

    return await this.faqRepository.create({
      projectId,
      question: data.question.trim(),
      answer: data.answer.trim(),
      sortOrder: data.sortOrder ?? 0,
      isPublished: data.isPublished ?? true,
    });
  }

  async updateFaq(faqId: string, data: Partial<ProjectFaq>, isInternalStaff = false): Promise<ProjectFaq> {
    if (data.question !== undefined && (!data.question || !data.question.trim())) {
      throw new ValidationError("FAQ question cannot be empty");
    }
    if (data.answer !== undefined && (!data.answer || !data.answer.trim())) {
      throw new ValidationError("FAQ answer cannot be empty");
    }

    const updated = await this.faqRepository.update(faqId, data);
    if (!updated) throw new NotFoundError(`FAQ with id '${faqId}' not found`);
    return updated;
  }

  async deleteFaq(faqId: string, isInternalStaff = false): Promise<boolean> {
    return await this.faqRepository.delete(faqId);
  }

  async getFaqById(faqId: string): Promise<ProjectFaq | null> {
    return await this.faqRepository.findById(faqId);
  }

  /**
   * Retrieves all project FAQs across all projects enriched with canonical project metadata.
   */
  async getAllFaqsWithProjects(): Promise<ProjectFaqWithProject[]> {
    const [allFaqs, allProjects, allDevs, allLocs] = await Promise.all([
      this.faqRepository.findAll(),
      this.projectRepository.findAll(),
      this.developerRepository.list().catch(() => []),
      this.locationRepository.findAll().catch(() => []),
    ]);

    const projectMap = new Map<string, Project>();
    for (const p of allProjects) {
      projectMap.set(p.id, p);
    }

    const devMap = new Map<string, string>();
    for (const d of allDevs) {
      devMap.set(d.id, d.name);
    }

    const locMap = new Map<string, string>();
    for (const l of allLocs) {
      locMap.set(l.id, l.name);
    }

    return allFaqs.map(faq => {
      const project = projectMap.get(faq.projectId);
      return {
        id: faq.id,
        projectId: faq.projectId,
        projectName: project?.name || 'Unknown Project',
        projectSlug: project?.slug || '',
        developerName: project?.developerId ? devMap.get(project.developerId) || null : null,
        developerId: project?.developerId || null,
        locationName: project?.locationId ? locMap.get(project.locationId) || null : null,
        question: faq.question,
        answer: faq.answer,
        sortOrder: faq.sortOrder ?? 0,
        isPublished: faq.isPublished ?? true,
        createdAt: faq.createdAt,
        updatedAt: faq.updatedAt,
      };
    });
  }

  async getFaqCoverageAnalysis(): Promise<{
    summary: {
      totalPublishedProjects: number;
      projectsWithFaqs: number;
      projectsNeedingAttention: number;
      projectsWithNoFaqs: number;
    };
    projects: Array<{
      projectId: string;
      projectName: string;
      projectSlug: string;
      developerName: string | null;
      developerId: string | null;
      publishedFaqCount: number;
      draftFaqCount: number;
      coverageStatus: 'NO_FAQS' | 'NEEDS_ATTENTION' | 'GOOD_COVERAGE';
      missingTopics: string[];
      coveredTopics: string[];
      applicableTopicsCount: number;
      recommendedAction: string;
    }>;
  }> {
    const [allProjects, allFaqs, allDevs, allConfigs, allAmenities, allRera] = await Promise.all([
      this.projectRepository.findAll(),
      this.faqRepository.findAll(),
      this.developerRepository.list().catch(() => []),
      this.configurationRepository.findAll().catch(() => []),
      this.amenityRepository.findAll().catch(() => []),
      this.reraRepository.findAll().catch(() => []),
    ]);

    const devMap = new Map<string, string>();
    for (const d of allDevs) {
      devMap.set(d.id, d.name);
    }

    const configsByProject = new Map<string, any[]>();
    for (const c of allConfigs) {
      const list = configsByProject.get(c.projectId) || [];
      list.push(c);
      configsByProject.set(c.projectId, list);
    }

    const amenitiesByProject = new Map<string, any[]>();
    for (const a of allAmenities) {
      const list = amenitiesByProject.get(a.projectId) || [];
      list.push(a);
      amenitiesByProject.set(a.projectId, list);
    }

    const reraByProject = new Map<string, any>();
    for (const r of allRera) {
      reraByProject.set(r.projectId, r);
    }

    const faqsByProject = new Map<string, any[]>();
    for (const f of allFaqs) {
      const list = faqsByProject.get(f.projectId) || [];
      list.push(f);
      faqsByProject.set(f.projectId, list);
    }

    const publishedProjects = allProjects.filter(p => {
      const isPub = p.lifecycleStatus ? p.lifecycleStatus === 'PUBLISHED' : p.isPublished !== false;
      return isPub;
    });

    let projectsWithFaqsCount = 0;
    let projectsNeedingAttentionCount = 0;
    let projectsWithNoFaqsCount = 0;

    const projectAnalysis = publishedProjects.map(project => {
      const pFaqs = faqsByProject.get(project.id) || [];
      const publishedFaqs = pFaqs.filter(f => f.isPublished !== false);
      const draftFaqs = pFaqs.filter(f => f.isPublished === false);

      const hasDescription = Boolean(project.description || project.shortDescription);
      const hasConfigs = (configsByProject.get(project.id) || []).length > 0;
      const hasAmenities = (amenitiesByProject.get(project.id) || []).length > 0;
      const hasLocation = Boolean(project.locationId);
      const hasRera = Boolean(reraByProject.get(project.id) || project.reraRegistrationNumber);
      const hasPricing = Boolean(project.startingPrice || hasConfigs);
      const hasPossession = Boolean(project.possession || project.possessionDate);

      const combinedFaqText = publishedFaqs.map(f => `${f.question} ${f.answer}`.toLowerCase()).join(' ');

      const coveredTopics: string[] = [];
      const missingTopics: string[] = [];

      const checkTopic = (topicName: string, isApplicable: boolean, keywords: string[]) => {
        if (!isApplicable) return;
        const covered = keywords.some(kw => combinedFaqText.includes(kw));
        if (covered) {
          coveredTopics.push(topicName);
        } else {
          missingTopics.push(topicName);
        }
      };

      checkTopic('Overview & About', hasDescription, ['overview', 'about', 'project', 'what is', 'builder', 'developer']);
      checkTopic('Configurations & Sizes', hasConfigs, ['bhk', 'bedroom', 'apartment', 'configuration', 'unit', 'size', 'carpet area']);
      checkTopic('Amenities & Facilities', hasAmenities, ['amenity', 'amenities', 'clubhouse', 'pool', 'gym', 'sports', 'facility']);
      checkTopic('Location & Connectivity', hasLocation, ['location', 'connectivity', 'station', 'airport', 'road', 'distance', 'near']);
      checkTopic('RERA Approvals', hasRera, ['rera', 'approval', 'legal', 'registration', 'verified']);
      checkTopic('Pricing & Payment', hasPricing, ['price', 'pricing', 'payment', 'cost', 'sqft', 'budget']);
      checkTopic('Possession Schedule', hasPossession, ['possession', 'completion', 'move-in', 'handover', 'status']);

      const applicableCount = coveredTopics.length + missingTopics.length;

      let coverageStatus: 'NO_FAQS' | 'NEEDS_ATTENTION' | 'GOOD_COVERAGE' = 'GOOD_COVERAGE';
      let recommendedAction = 'Review published FAQ coverage';

      if (publishedFaqs.length === 0) {
        coverageStatus = 'NO_FAQS';
        projectsWithNoFaqsCount++;
        recommendedAction = 'Add baseline project FAQs (Overview, Configs, Location)';
      } else if (publishedFaqs.length < 5 || missingTopics.length > 0) {
        coverageStatus = 'NEEDS_ATTENTION';
        projectsNeedingAttentionCount++;
        recommendedAction = `Add missing FAQs for: ${missingTopics.slice(0, 3).join(', ')}`;
      } else {
        projectsWithFaqsCount++;
      }

      if (publishedFaqs.length > 0 && coverageStatus !== 'NO_FAQS' && coverageStatus !== 'NEEDS_ATTENTION') {
        projectsWithFaqsCount++;
      }

      const devName = project.developerId ? devMap.get(project.developerId) || null : null;

      return {
        projectId: project.id,
        projectName: project.name,
        projectSlug: project.slug,
        developerName: devName,
        developerId: project.developerId || null,
        publishedFaqCount: publishedFaqs.length,
        draftFaqCount: draftFaqs.length,
        coverageStatus,
        missingTopics,
        coveredTopics,
        applicableTopicsCount: applicableCount,
        recommendedAction,
      };
    });

    const statusPriority = { NO_FAQS: 0, NEEDS_ATTENTION: 1, GOOD_COVERAGE: 2 };
    projectAnalysis.sort((a, b) => {
      const pDiff = statusPriority[a.coverageStatus] - statusPriority[b.coverageStatus];
      if (pDiff !== 0) return pDiff;
      return a.projectName.localeCompare(b.projectName);
    });

    return {
      summary: {
        totalPublishedProjects: publishedProjects.length,
        projectsWithFaqs: projectAnalysis.filter(p => p.publishedFaqCount > 0).length,
        projectsNeedingAttention: projectsNeedingAttentionCount,
        projectsWithNoFaqs: projectsWithNoFaqsCount,
      },
      projects: projectAnalysis,
    };
  }

  async upsertRera(projectId: string, data: Partial<ProjectRera>, isInternalStaff = false): Promise<ProjectRera> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    const existingRera = await this.reraRepository.findByProjectId(projectId);
    const status = data.status ?? existingRera?.status ?? 'NOT_PROVIDED';

    if (status === 'VERIFIED' && !isInternalStaff) {
      throw new ValidationError("Unauthorized verification: Only authorized internal staff may mark RERA verified.");
    }

    return await this.reraRepository.upsert({
      projectId,
      status,
      authority: data.authority ?? existingRera?.authority ?? 'WBRERA',
      registrationNumber: data.registrationNumber ?? existingRera?.registrationNumber ?? null,
      verifiedAt: status === 'VERIFIED' ? (existingRera?.verifiedAt || new Date()) : null,
      verifiedBy: status === 'VERIFIED' ? (data.verifiedBy ?? existingRera?.verifiedBy ?? 'staff') : null,
      internalNotes: data.internalNotes !== undefined ? data.internalNotes : existingRera?.internalNotes ?? null,
    });
  }

  async getSeoByProjectId(projectId: string): Promise<ProjectSeo | null> {
    return await this.seoRepository.findByProjectId(projectId);
  }

  async upsertSeo(projectId: string, data: { metaTitle?: string | null; metaDescription?: string | null; canonicalUrl?: string | null }, isInternalStaff = false): Promise<ProjectSeo> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    return await this.seoRepository.upsert({
      projectId,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      canonicalUrl: data.canonicalUrl ?? null,
    });
  }

  async attachAmenity(projectId: string, amenityId: string, isFeatured = false, sortOrder = 0, isInternalStaff = false): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    await this.amenityRepository.associateWithProject(projectId, amenityId, isFeatured, sortOrder);
  }

  async removeAmenity(projectId: string, amenityId: string, isInternalStaff = false): Promise<boolean> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    return await this.amenityRepository.dissociateFromProject(projectId, amenityId);
  }

  async publishProject(id: string, isInternalStaff = false): Promise<Project> {
    const project = await this.projectRepository.findById(id);
    if (!project) throw new NotFoundError(`Project with id '${id}' not found`);

    const errors: string[] = [];
    if (!project.name || !project.name.trim()) errors.push("Project name is required.");
    if (!project.slug || !project.slug.trim()) errors.push("Project slug is required.");
    if (!project.developerId) errors.push("Developer association is required.");
    if (!project.locationId) errors.push("Location association is required.");

    const dev = await this.developerRepository.findById(project.developerId);
    if (!dev) errors.push(`Developer with id '${project.developerId}' does not exist.`);
    const loc = await this.locationRepository.findById(project.locationId);
    if (!loc) errors.push(`Location with id '${project.locationId}' does not exist.`);

    const configs = await this.configurationRepository.findByProjectId(id);
    if (configs.length === 0) {
      errors.push("Published project must have at least one configuration.");
    }

    const media = await this.mediaRepository.findByProjectId(id);
    if (media.length === 0) {
      errors.push("Published project must have at least one image/media asset.");
    }

    if (errors.length > 0) {
      throw new ValidationError(`Publication failed with errors: ${errors.join(' ')}`);
    }

    return await this.updateProject(id, { lifecycleStatus: 'PUBLISHED', isPublished: true }, isInternalStaff);
  }

  async getConsiderationsByProjectId(projectId: string): Promise<ProjectConsideration[]> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);
    return await this.considerationRepository.findByProjectId(projectId);
  }

  async createConsideration(
    projectId: string,
    data: { section: ConsiderationSection; title: string; description: string; sortOrder?: number; isVisible?: boolean },
    isInternalStaff = false
  ): Promise<ProjectConsideration> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    if (data.section !== 'WHY_CONSIDER' && data.section !== 'THINGS_TO_KEEP_IN_MIND') {
      throw new ValidationError("Invalid section. Must be WHY_CONSIDER or THINGS_TO_KEEP_IN_MIND");
    }

    const title = data.title ? data.title.trim() : '';
    const description = data.description ? data.description.trim() : '';

    if (!title) throw new ValidationError("Consideration title is required");
    if (title.length > 150) throw new ValidationError("Consideration title must be 150 characters or less");
    if (!description) throw new ValidationError("Consideration description is required");
    if (description.length > 1000) throw new ValidationError("Consideration description must be 1000 characters or less");

    const combined = `${title} ${description}`;
    const FORBIDDEN_INVESTMENT_PATTERNS = [
      /guaranteed\s+appreciation/i,
      /guaranteed\s+returns?/i,
      /\broi\b/i,
      /investment\s+score/i,
      /best\s+investment/i,
      /highest\s+appreciation/i,
      /future\s+price\s+prediction/i,
      /guaranteed\s+rental/i,
      /guaranteed\s+resale/i,
      /market\s+prediction/i,
      /ai\s+score/i,
    ];
    for (const pattern of FORBIDDEN_INVESTMENT_PATTERNS) {
      if (pattern.test(combined)) {
        throw new ValidationError(
          "Editorial content safety violation: Financial/investment guarantees, ROI claims, and speculative market predictions are strictly prohibited."
        );
      }
    }

    return await this.considerationRepository.create({
      projectId,
      section: data.section,
      title,
      description,
      sourceType: 'EDITORIAL',
      sortOrder: data.sortOrder ?? 0,
      isVisible: data.isVisible ?? true,
    });
  }

  async updateConsideration(
    id: string,
    data: { title?: string; description?: string; isVisible?: boolean; sortOrder?: number },
    isInternalStaff = false
  ): Promise<ProjectConsideration> {
    const existing = await this.considerationRepository.findById(id);
    if (!existing) throw new NotFoundError(`Consideration with id '${id}' not found`);

    const title = data.title !== undefined ? data.title.trim() : existing.title;
    const description = data.description !== undefined ? data.description.trim() : existing.description;

    if (!title) throw new ValidationError("Consideration title cannot be empty");
    if (title.length > 150) throw new ValidationError("Consideration title must be 150 characters or less");
    if (!description) throw new ValidationError("Consideration description cannot be empty");
    if (description.length > 1000) throw new ValidationError("Consideration description must be 1000 characters or less");

    const combined = `${title} ${description}`;
    const FORBIDDEN_INVESTMENT_PATTERNS = [
      /guaranteed\s+appreciation/i,
      /guaranteed\s+returns?/i,
      /\broi\b/i,
      /investment\s+score/i,
      /best\s+investment/i,
      /highest\s+appreciation/i,
      /future\s+price\s+prediction/i,
      /guaranteed\s+rental/i,
      /guaranteed\s+resale/i,
      /market\s+prediction/i,
      /ai\s+score/i,
    ];
    for (const pattern of FORBIDDEN_INVESTMENT_PATTERNS) {
      if (pattern.test(combined)) {
        throw new ValidationError(
          "Editorial content safety violation: Financial/investment guarantees, ROI claims, and speculative market predictions are strictly prohibited."
        );
      }
    }

    const updated = await this.considerationRepository.update(id, {
      title,
      description,
      isVisible: data.isVisible !== undefined ? data.isVisible : existing.isVisible,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
    });

    if (!updated) throw new NotFoundError(`Consideration with id '${id}' not found`);
    return updated;
  }

  async deleteConsideration(id: string, isInternalStaff = false): Promise<boolean> {
    const existing = await this.considerationRepository.findById(id);
    if (!existing) throw new NotFoundError(`Consideration with id '${id}' not found`);
    return await this.considerationRepository.delete(id);
  }

  async reorderConsiderations(
    projectId: string,
    section: ConsiderationSection,
    orderedIds: string[],
    isInternalStaff = false
  ): Promise<void> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) throw new NotFoundError(`Project with id '${projectId}' not found`);

    await this.considerationRepository.reorder(projectId, section, orderedIds);
  }
}

// Instantiate and export singleton
import {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
  projectReraRepository,
  amenityRepository,
  projectFaqRepository,
  projectSeoRepository,
  projectConsiderationRepository,
} from "../../../infrastructure/repositories/projectProvider";
import { developerRepository, developerMediaRepository } from "../../../infrastructure/repositories/developerProvider";
import { locationRepository } from "../../../infrastructure/repositories/locationProvider";

export const projectIntelligenceService = new ProjectIntelligenceService(
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
  projectReraRepository,
  amenityRepository,
  projectFaqRepository,
  developerRepository,
  locationRepository,
  projectSeoRepository,
  projectConsiderationRepository
);
