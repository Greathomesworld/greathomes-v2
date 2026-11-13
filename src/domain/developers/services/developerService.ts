import { Developer, DeveloperStatus } from "../entities";
import { DeveloperRepository, DeveloperListFilter } from "../../repositories/developerRepository";
import { ProjectRepository } from "../../repositories/projectRepository";
import { LocationRepository } from "../../repositories/locationRepository";
import { Location } from "../../locations/entities";
import { Project } from "../../projects/entities";
import {
  PublicDeveloperDto,
  PublicProjectDto,
  toPublicDeveloperDto,
  toPublicProjectDto,
} from "../dto/developerDto";
import { normalizeMediaPublicUrl } from "@/src/lib/mediaUtils";
import { deriveProjectPricingSummary } from "../../projects/dto/projectDto";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
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

export class PotentialDuplicateError extends Error {
  constructor(message: string, public readonly candidates: Developer[]) {
    super(message);
    this.name = "PotentialDuplicateError";
  }
}

export interface CreateDeveloperInput {
  name: string;
  slug: string;
  shortDescription?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  status?: DeveloperStatus;
  featured?: boolean;
}

export interface UpdateDeveloperInput {
  name?: string;
  slug?: string;
  shortDescription?: string | null;
  description?: string | null;
  websiteUrl?: string | null;
  status?: DeveloperStatus;
  featured?: boolean;
}

/**
 * Known smoke test developers generated during automated test suites.
 * Excluded strictly from public discovery, statistics, and directory listings.
 */
export const KNOWN_TEST_DEVELOPER_SLUGS = new Set([
  'neon-dev-1792051107022',
  'neon-dev-1792051200677',
  'neon-dev-1792052686285',
  'neon-dev-1792052286779',
]);

export function isKnownTestDeveloperSlug(slug?: string | null): boolean {
  if (!slug || typeof slug !== 'string') return false;
  const trimmed = slug.trim();
  return KNOWN_TEST_DEVELOPER_SLUGS.has(trimmed) || /^neon-dev-\d+$/i.test(trimmed);
}

export class DeveloperService {
  constructor(
    private developerRepository: DeveloperRepository,
    private projectRepository: ProjectRepository,
    private locationRepository: LocationRepository
  ) {}

  /**
   * Slug format validator: lowercase alphanumeric words separated by single hyphens.
   */
  private isValidSlug(slug: string): boolean {
    const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    return Boolean(slug) && slugRegex.test(slug) && slug.length <= 100;
  }

  /**
   * Website URL validator: must be valid http or https URL.
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Cleans text to prevent unsafe markup.
   */
  private sanitizeText(text: string | null | undefined): string | null {
    if (!text) return null;
    return text.replace(/<[^>]*>?/gm, '').trim();
  }

  /**
   * Checks for likely duplicate developers based on normalized name.
   */
  async findDuplicateCandidates(name: string, excludeId?: string): Promise<Developer[]> {
    if (!name || !name.trim()) return [];
    return this.developerRepository.findDuplicates(name.trim(), excludeId);
  }

  /**
   * Creates a new Developer entity with full business validations.
   */
  async createDeveloper(
    data: CreateDeveloperInput,
    options?: { allowPotentialDuplicate?: boolean }
  ): Promise<Developer> {
    // 1. Required Name validation
    if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
      throw new ValidationError("Developer name is required and cannot be empty");
    }
    const cleanName = data.name.trim();

    // 2. Slug validation
    if (!data.slug || typeof data.slug !== 'string' || !this.isValidSlug(data.slug.trim())) {
      throw new ValidationError(
        "Invalid slug format. Slug must be lowercase alphanumeric characters separated by single hyphens (e.g., 'merlin-group')"
      );
    }
    const cleanSlug = data.slug.trim();

    // 3. Slug uniqueness
    const slugExists = await this.developerRepository.existsBySlug(cleanSlug);
    if (slugExists) {
      throw new DuplicateSlugError(`Slug '${cleanSlug}' is already in use by another developer`);
    }

    // 4. Duplicate developer detection (Flagging)
    const duplicates = await this.findDuplicateCandidates(cleanName);
    if (duplicates.length > 0 && !options?.allowPotentialDuplicate) {
      throw new PotentialDuplicateError(
        `Potential duplicate developer detected matching name '${cleanName}'. Review existing record before proceeding.`,
        duplicates
      );
    }

    // 5. Status validation
    const status: DeveloperStatus = data.status || 'DRAFT';
    const allowedStatuses: DeveloperStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
    if (!allowedStatuses.includes(status)) {
      throw new ValidationError(`Invalid developer status '${status}'. Must be one of: ${allowedStatuses.join(', ')}`);
    }

    // 6. Website URL validation
    let cleanWebsiteUrl: string | null = null;
    if (data.websiteUrl) {
      const trimmedUrl = data.websiteUrl.trim();
      if (trimmedUrl) {
        if (!this.isValidUrl(trimmedUrl)) {
          throw new ValidationError("Invalid website URL. Must be a valid HTTP or HTTPS URL.");
        }
        cleanWebsiteUrl = trimmedUrl;
      }
    }

    return this.developerRepository.create({
      name: cleanName,
      slug: cleanSlug,
      shortDescription: this.sanitizeText(data.shortDescription),
      description: this.sanitizeText(data.description),
      websiteUrl: cleanWebsiteUrl,
      status,
      featured: Boolean(data.featured),
    });
  }

  /**
   * Updates an existing Developer entity.
   */
  async updateDeveloper(id: string, data: UpdateDeveloperInput): Promise<Developer> {
    const existing = await this.developerRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Developer with id '${id}' not found`);
    }

    const updates: Partial<Developer> = {};

    if (data.name !== undefined) {
      if (!data.name || !data.name.trim()) {
        throw new ValidationError("Developer name cannot be empty");
      }
      updates.name = data.name.trim();
    }

    if (data.slug !== undefined) {
      const cleanSlug = data.slug.trim();
      if (!this.isValidSlug(cleanSlug)) {
        throw new ValidationError("Invalid slug format.");
      }
      const slugExists = await this.developerRepository.existsBySlug(cleanSlug, id);
      if (slugExists) {
        throw new DuplicateSlugError(`Slug '${cleanSlug}' is already in use by another developer`);
      }
      updates.slug = cleanSlug;
    }

    if (data.status !== undefined) {
      const allowedStatuses: DeveloperStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
      if (!allowedStatuses.includes(data.status)) {
        throw new ValidationError(`Invalid status '${data.status}'.`);
      }
      updates.status = data.status;
    }

    if (data.websiteUrl !== undefined) {
      if (data.websiteUrl === null || data.websiteUrl.trim() === '') {
        updates.websiteUrl = null;
      } else {
        const trimmed = data.websiteUrl.trim();
        if (!this.isValidUrl(trimmed)) {
          throw new ValidationError("Invalid website URL.");
        }
        updates.websiteUrl = trimmed;
      }
    }

    if (data.shortDescription !== undefined) {
      updates.shortDescription = this.sanitizeText(data.shortDescription);
    }
    if (data.description !== undefined) {
      updates.description = this.sanitizeText(data.description);
    }
    if (data.featured !== undefined) {
      updates.featured = Boolean(data.featured);
    }

    const updated = await this.developerRepository.update(id, updates);
    if (!updated) {
      throw new NotFoundError(`Developer with id '${id}' not found`);
    }
    return updated;
  }

  /**
   * Archives a developer by transitioning status to 'ARCHIVED'.
   */
  async archiveDeveloper(id: string): Promise<Developer> {
    const existing = await this.developerRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Developer with id '${id}' not found`);
    }
    const updated = await this.developerRepository.update(id, { status: 'ARCHIVED' });
    if (!updated) throw new NotFoundError(`Developer with id '${id}' not found`);
    return updated;
  }

  /**
   * Deletes a developer profile using a PROTECTED DELETE strategy.
   * If there are associated projects, deletion is blocked.
   * If there are no projects, we delete associated media and SEO records, and then delete the developer.
   */
  async deleteDeveloper(id: string): Promise<boolean> {
    const dev = await this.developerRepository.findById(id);
    if (!dev) {
      throw new NotFoundError(`Developer with id '${id}' not found`);
    }

    // 1. Check for associated projects
    const associatedProjects = await this.projectRepository.findByDeveloperId(id);
    if (associatedProjects.length > 0) {
      throw new ValidationError(`Cannot delete developer '${dev.name}' because they have associated projects. Please delete or reassign all projects first.`);
    }

    // 2. Cascade delete dependent developer_media records
    const media = await developerMediaRepository.findByDeveloperId(id);
    for (const item of media) {
      await developerMediaRepository.delete(item.id);
    }

    // 3. Cascade delete dependent developer_seo records
    if (process.env.PERSISTENCE_PROVIDER === 'postgres') {
      const { getDb } = await import('@/src/db/client');
      const { developerSeo } = await import('@/src/db/schema');
      const { eq } = await import('drizzle-orm');
      const db = getDb();
      if (db) {
        await db.delete(developerSeo).where(eq(developerSeo.developerId, id));
      }
    }

    // 4. Finally, delete the developer
    return this.developerRepository.delete(id);
  }

  /**
   * Retrieves raw Developer entity by ID (internal use).
   */
  async getDeveloperById(id: string): Promise<Developer | null> {
    return this.developerRepository.findById(id);
  }

  /**
   * Retrieves raw Developer entity by slug (internal use).
   */
  async getDeveloperBySlug(slug: string): Promise<Developer | null> {
    return this.developerRepository.findBySlug(slug);
  }

  /**
   * Resolves cover image URL from a project's media items.
   * Never uses another project's image; returns null if no authentic image exists.
   */
  private resolveProjectCoverImageUrl(projMedia: { category: string; url: string; isFeatured: boolean; sortOrder: number }[]): string | null {
    const cover = projMedia
      .filter(m => (m.category === 'EXTERIOR' || m.category === 'ELEVATION') && m.url && m.url.trim().length > 0)
      .sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      })[0];

    if (cover) {
      return normalizeMediaPublicUrl(cover.url);
    }

    const fallback = projMedia
      .filter(m => m.category !== 'FLOOR_PLANS' && m.category !== 'BROCHURE' && m.url && m.url.trim().length > 0)
      .sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.sortOrder - b.sortOrder;
      })[0];

    return fallback ? normalizeMediaPublicUrl(fallback.url) : null;
  }

  /**
   * Derives published projects and distinct locations for a developer using a single batched location lookup.
   */
  private async getPublishedProjectsAndLocations(developerId: string): Promise<{
    publishedProjects: Project[];
    locationsMap: Map<string, Location>;
  }> {
    const allProjects = await this.projectRepository.findByDeveloperId(developerId);

    // Filter projects according to public visibility:
    // isPublished must not be false, and lifecycleStatus must not be DRAFT or ARCHIVED
    const publishedProjects = allProjects.filter(
      p => p.isPublished !== false && p.lifecycleStatus !== 'DRAFT' && p.lifecycleStatus !== 'ARCHIVED'
    );

    const locationIds = Array.from(new Set(publishedProjects.map(p => p.locationId).filter(Boolean)));
    const locationsMap = new Map<string, Location>();

    if (locationIds.length > 0) {
      const locs = await this.locationRepository.findByIds(locationIds);
      for (const loc of locs) {
        locationsMap.set(loc.id, loc);
      }
    }

    return { publishedProjects, locationsMap };
  }

  /**
   * Validates and normalizes a developer canonical URL.
   * Allows https://www.greathomes.co.in/developers/[slug], https://greathomes.co.in/developers/[slug], or relative /developers/[slug].
   * Normalizes to canonical https://www.greathomes.co.in/developers/[slug].
   */
  public validateAndNormalizeCanonicalUrl(rawUrl: string | null | undefined): string | null {
    if (rawUrl === null || rawUrl === undefined) return null;
    const trimmed = String(rawUrl).trim();
    if (!trimmed) return null;

    const validDeveloperPathRegex = /^\/developers\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;

    if (trimmed.startsWith('/')) {
      if (trimmed.startsWith('//') || trimmed.includes('?') || trimmed.includes('#') || trimmed.includes('..')) {
        throw new ValidationError(
          "Invalid canonical URL. Relative canonical path must match '/developers/[slug]'."
        );
      }
      const match = trimmed.match(validDeveloperPathRegex);
      if (!match) {
        throw new ValidationError(
          "Invalid canonical URL. Relative canonical path must match '/developers/[slug]'."
        );
      }
      return `https://www.greathomes.co.in/developers/${match[1]}`;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new ValidationError(
        "Invalid canonical URL. Must be a valid Great Homes URL (https://www.greathomes.co.in/developers/[slug]) or relative path (/developers/[slug])."
      );
    }

    if (
      parsed.protocol !== 'https:' ||
      (parsed.hostname !== 'www.greathomes.co.in' && parsed.hostname !== 'greathomes.co.in') ||
      parsed.port !== '' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw new ValidationError(
        "Invalid canonical URL. Only 'https://www.greathomes.co.in/developers/[slug]' without query parameters or fragments is allowed."
      );
    }

    const match = parsed.pathname.match(validDeveloperPathRegex);
    if (!match) {
      throw new ValidationError(
        "Invalid canonical URL path. Path must match '/developers/[slug]'."
      );
    }

    return `https://www.greathomes.co.in/developers/${match[1]}`;
  }

  /**
   * Validates and normalizes developer SEO input fields on the server side.
   */
  public validateDeveloperSeoInput(data: {
    metaTitle?: string | null;
    metaDescription?: string | null;
    canonicalUrl?: string | null;
  }): {
    metaTitle: string | null;
    metaDescription: string | null;
    canonicalUrl: string | null;
  } {
    const cleanTitle = data.metaTitle ? this.sanitizeText(data.metaTitle) : null;
    if (cleanTitle && cleanTitle.length > 60) {
      throw new ValidationError(
        `Meta title cannot exceed 60 characters (received ${cleanTitle.length} characters).`
      );
    }

    const cleanDescription = data.metaDescription ? this.sanitizeText(data.metaDescription) : null;
    if (cleanDescription && cleanDescription.length > 160) {
      throw new ValidationError(
        `Meta description cannot exceed 160 characters (received ${cleanDescription.length} characters).`
      );
    }

    const cleanCanonicalUrl = this.validateAndNormalizeCanonicalUrl(data.canonicalUrl);

    return {
      metaTitle: cleanTitle && cleanTitle.length > 0 ? cleanTitle : null,
      metaDescription: cleanDescription && cleanDescription.length > 0 ? cleanDescription : null,
      canonicalUrl: cleanCanonicalUrl,
    };
  }

  /**
   * Retrieves SEO metadata for a developer.
   */
  async getDeveloperSeo(developerId: string) {
    return developerSeoRepository.findByDeveloperId(developerId);
  }

  /**
   * Upserts SEO metadata for a developer with strict server-side validation.
   */
  async upsertDeveloperSeo(
    developerId: string,
    data: { metaTitle?: string | null; metaDescription?: string | null; canonicalUrl?: string | null }
  ) {
    const validated = this.validateDeveloperSeoInput(data);
    return developerSeoRepository.upsert({
      developerId,
      metaTitle: validated.metaTitle,
      metaDescription: validated.metaDescription,
      canonicalUrl: validated.canonicalUrl,
    });
  }

  /**
   * Resolves a public Developer DTO by ID.
   * By default, returns only if PUBLISHED and not a known test developer, unless isInternalStaff is true.
   */
  async getPublicDeveloperDtoById(id: string, isInternalStaff = false): Promise<PublicDeveloperDto | null> {
    const developer = await this.developerRepository.findById(id);
    if (!developer) return null;

    if (!isInternalStaff && (developer.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(developer.slug))) {
      return null;
    }

    const [
      { publishedProjects, locationsMap },
      media,
      seoRecord
    ] = await Promise.all([
      this.getPublishedProjectsAndLocations(developer.id),
      developerMediaRepository.findByDeveloperId(developer.id),
      developerSeoRepository.findByDeveloperId(developer.id),
    ]);

    const logo = media.find(m => m.category === 'LOGO' && m.url && m.url.trim().length > 0);
    const resolvedLogo = logo ? normalizeMediaPublicUrl(logo.url.trim()) : null;
    return toPublicDeveloperDto(developer, publishedProjects, locationsMap, resolvedLogo, seoRecord);
  }

  /**
   * Resolves developer context for an already-published project detail page.
   * Excludes archived, draft, and known test developers from public exposure.
   */
  async getDeveloperProfileForProject(developerId: string): Promise<PublicDeveloperDto | null> {
    const developer = await this.developerRepository.findById(developerId);
    if (
      !developer ||
      developer.status === 'ARCHIVED' ||
      isKnownTestDeveloperSlug(developer.slug)
    ) {
      return null;
    }

    const [
      { publishedProjects, locationsMap },
      media,
      seoRecord
    ] = await Promise.all([
      this.getPublishedProjectsAndLocations(developer.id),
      developerMediaRepository.findByDeveloperId(developer.id),
      developerSeoRepository.findByDeveloperId(developer.id),
    ]);

    const logo = media.find(m => m.category === 'LOGO' && m.url && m.url.trim().length > 0);
    const resolvedLogo = logo ? normalizeMediaPublicUrl(logo.url.trim()) : null;
    return toPublicDeveloperDto(developer, publishedProjects, locationsMap, resolvedLogo, seoRecord);
  }

  /**
   * Resolves a public Developer DTO by slug.
   * By default, returns only if PUBLISHED and not a known test developer, unless isInternalStaff is true.
   */
  async getPublicDeveloperDtoBySlug(slug: string, isInternalStaff = false): Promise<PublicDeveloperDto | null> {
    const developer = await this.developerRepository.findBySlug(slug);
    if (!developer) return null;

    if (!isInternalStaff && (developer.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(developer.slug))) {
      return null;
    }

    const [
      { publishedProjects, locationsMap },
      media,
      seoRecord
    ] = await Promise.all([
      this.getPublishedProjectsAndLocations(developer.id),
      developerMediaRepository.findByDeveloperId(developer.id),
      developerSeoRepository.findByDeveloperId(developer.id),
    ]);

    const logo = media.find(m => m.category === 'LOGO' && m.url && m.url.trim().length > 0);
    const resolvedLogo = logo ? normalizeMediaPublicUrl(logo.url.trim()) : null;
    return toPublicDeveloperDto(developer, publishedProjects, locationsMap, resolvedLogo, seoRecord);
  }

  /**
   * Resolves the complete Developer Profile bundle (developer DTO, published projects with cover media,
   * and related developers) in 6–7 bounded, scoped SQL queries without N+1 loops or broad table scans.
   */
  async getDeveloperProfileBundleBySlug(
    slug: string,
    isInternalStaff = false
  ): Promise<{
    developer: PublicDeveloperDto;
    projects: PublicProjectDto[];
    relatedDevelopers: PublicDeveloperDto[];
  } | null> {
    // Query 1: Fetch target developer by slug
    const developer = await this.developerRepository.findBySlug(slug);
    if (!developer) return null;

    if (!isInternalStaff && (developer.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(developer.slug))) {
      return null;
    }

    // Queries 2 & 3 (parallel): Fetch developer SEO record and top 3 related published developers
    const [seoRecord, relatedEntities] = await Promise.all([
      developerSeoRepository.findByDeveloperId(developer.id),
      this.developerRepository.findRelatedPublishedDevelopers
        ? this.developerRepository.findRelatedPublishedDevelopers(
            developer.id,
            Array.from(KNOWN_TEST_DEVELOPER_SLUGS),
            3
          )
        : Promise.resolve(null),
    ]);

    // If using in-memory repository without findRelatedPublishedDevelopers, fall back to separate calls
    if (!relatedEntities) {
      const [devDto, projects, relatedDevelopers] = await Promise.all([
        this.getPublicDeveloperDtoBySlug(slug, isInternalStaff),
        this.getDeveloperPublicProjects(developer.id, isInternalStaff),
        this.getRelatedDevelopers(developer.id, 3),
      ]);
      if (!devDto) return null;
      return { developer: devDto, projects, relatedDevelopers };
    }

    const targetDevIds = [developer.id, ...relatedEntities.map(d => d.id)];

    // Queries 4 & 5 (parallel): Scoped batch lookup of projects and LOGO media for only these 4 developers
    const [scopedProjects, scopedLogos] = await Promise.all([
      this.projectRepository.findByDeveloperIds(targetDevIds),
      developerMediaRepository.findByDeveloperIds(targetDevIds, 'LOGO'),
    ]);

    const publishedProjectsByDevId = new Map<string, Project[]>();
    const neededLocationIds = new Set<string>();

    for (const p of scopedProjects) {
      if (p.isPublished !== false && p.lifecycleStatus !== 'DRAFT' && p.lifecycleStatus !== 'ARCHIVED') {
        const list = publishedProjectsByDevId.get(p.developerId) || [];
        list.push(p);
        publishedProjectsByDevId.set(p.developerId, list);
        if (p.locationId) {
          neededLocationIds.add(p.locationId);
        }
      }
    }

    const devPublishedProjects = publishedProjectsByDevId.get(developer.id) || [];
    const devProjectIds = devPublishedProjects.map(p => p.id);

    // Queries 6 & 7 (parallel): Scoped batch lookup of distinct locations, project media, and configs for this developer's projects
    const [scopedLocations, devProjectsMedia, devProjectsConfigs] = await Promise.all([
      neededLocationIds.size > 0
        ? this.locationRepository.findByIds(Array.from(neededLocationIds))
        : Promise.resolve([]),
      devProjectIds.length > 0
        ? projectMediaRepository.findByProjectIds(devProjectIds)
        : Promise.resolve([]),
      devProjectIds.length > 0 && typeof projectConfigurationRepository.findByProjectIds === 'function'
        ? projectConfigurationRepository.findByProjectIds(devProjectIds)
        : Promise.resolve([]),
    ]);

    const locationsMap = new Map<string, Location>();
    for (const loc of scopedLocations) {
      locationsMap.set(loc.id, loc);
    }

    const configsByProjectId = new Map<string, typeof devProjectsConfigs>();
    for (const c of devProjectsConfigs) {
      const list = configsByProjectId.get(c.projectId) || [];
      list.push(c);
      configsByProjectId.set(c.projectId, list);
    }

    const logoByDevId = new Map<string, string>();
    for (const m of scopedLogos) {
      if (m.category === 'LOGO' && m.url && m.url.trim().length > 0 && !logoByDevId.has(m.developerId)) {
        const resolved = normalizeMediaPublicUrl(m.url.trim());
        if (resolved) {
          logoByDevId.set(m.developerId, resolved);
        }
      }
    }

    const developerDto = toPublicDeveloperDto(
      developer,
      devPublishedProjects,
      locationsMap,
      logoByDevId.get(developer.id) || null,
      seoRecord
    );

    const mediaListByProjectId = new Map<string, typeof devProjectsMedia>();
    for (const m of devProjectsMedia) {
      const list = mediaListByProjectId.get(m.projectId) || [];
      list.push(m);
      mediaListByProjectId.set(m.projectId, list);
    }

    const projectDtos: PublicProjectDto[] = devPublishedProjects.map(project => {
      const projMedia = mediaListByProjectId.get(project.id) || [];
      const projConfigs = configsByProjectId.get(project.id) || [];
      const pricing = deriveProjectPricingSummary(project, projConfigs);
      const coverUrl = this.resolveProjectCoverImageUrl(projMedia);
      return toPublicProjectDto(
        project,
        { id: developer.id, name: developer.name, slug: developer.slug },
        locationsMap.get(project.locationId),
        coverUrl,
        pricing.startingPrice,
        pricing.priceOnRequest
      );
    });

    const relatedDeveloperDtos: PublicDeveloperDto[] = relatedEntities.map(relDev => {
      const relProjects = publishedProjectsByDevId.get(relDev.id) || [];
      return toPublicDeveloperDto(
        relDev,
        relProjects,
        locationsMap,
        logoByDevId.get(relDev.id) || null,
        null
      );
    });

    return {
      developer: developerDto,
      projects: projectDtos,
      relatedDevelopers: relatedDeveloperDtos,
    };
  }

  /**
   * Lists public developers with controlled sorting and pagination.
   * Only PUBLISHED developers are exposed publicly unless isInternalStaff is true.
   * Batches project, location, and media queries to eliminate N+1 database queries.
   */
  async listPublicDevelopers(options: {
    page?: number;
    limit?: number;
    featured?: boolean;
    sort?: 'name:asc' | 'name:desc' | 'createdAt:desc' | 'createdAt:asc';
    isInternalStaff?: boolean;
    status?: DeveloperStatus;
  }): Promise<{
    items: PublicDeveloperDto[];
    pagination: {
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const maxLimit = options.isInternalStaff ? 10000 : 100;
    const limit = Math.min(maxLimit, Math.max(1, options.limit || 10));

    // Public discovery only exposes PUBLISHED
    const statusFilter: DeveloperStatus | undefined = options.isInternalStaff
      ? options.status
      : 'PUBLISHED';

    const filter: DeveloperListFilter = {
      status: statusFilter,
      featured: options.featured,
    };

    let all = await this.developerRepository.list(filter);

    // Strictly exclude known test fixture records from public discovery
    if (!options.isInternalStaff) {
      all = all.filter(d => !KNOWN_TEST_DEVELOPER_SLUGS.has(d.slug));
    }

    // Controlled sorting whitelist
    const sort = options.sort || 'name:asc';
    all.sort((a, b) => {
      switch (sort) {
        case 'name:asc':
          return a.name.localeCompare(b.name);
        case 'name:desc':
          return b.name.localeCompare(a.name);
        case 'createdAt:desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'createdAt:asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        default:
          return a.name.localeCompare(b.name);
      }
    });

    const total = all.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedDevelopers = all.slice((page - 1) * limit, page * limit);
    const paginatedDevIds = paginatedDevelopers.map(d => d.id);

    // Scoped batch queries for only the paginated developers' projects, logos, and locations
    const [scopedProjects, scopedMedia] = await Promise.all([
      paginatedDevIds.length > 0
        ? this.projectRepository.findByDeveloperIds(paginatedDevIds)
        : Promise.resolve([]),
      paginatedDevIds.length > 0
        ? developerMediaRepository.findByDeveloperIds(paginatedDevIds, 'LOGO')
        : Promise.resolve([]),
    ]);

    const publishedProjectsByDevId = new Map<string, Project[]>();
    const neededLocationIds = new Set<string>();
    for (const p of scopedProjects) {
      if (p.isPublished !== false && p.lifecycleStatus !== 'DRAFT' && p.lifecycleStatus !== 'ARCHIVED' && p.developerId) {
        const list = publishedProjectsByDevId.get(p.developerId) || [];
        list.push(p);
        publishedProjectsByDevId.set(p.developerId, list);
        if (p.locationId) {
          neededLocationIds.add(p.locationId);
        }
      }
    }

    const scopedLocations = neededLocationIds.size > 0
      ? await this.locationRepository.findByIds(Array.from(neededLocationIds))
      : [];

    const locationsMap = new Map<string, Location>();
    for (const loc of scopedLocations) {
      locationsMap.set(loc.id, loc);
    }

    const logoByDevId = new Map<string, string>();
    for (const m of scopedMedia) {
      if (m.category === 'LOGO' && m.url && !logoByDevId.has(m.developerId)) {
        const resolved = normalizeMediaPublicUrl(m.url);
        if (resolved) {
          logoByDevId.set(m.developerId, resolved);
        }
      }
    }

    const items: PublicDeveloperDto[] = [];
    for (const dev of paginatedDevelopers) {
      const devProjects = publishedProjectsByDevId.get(dev.id) || [];
      const resolvedLogo = logoByDevId.get(dev.id) || null;
      items.push(toPublicDeveloperDto(dev, devProjects, locationsMap, resolvedLogo));
    }

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Calculates dynamic aggregate statistics for the public developer directory.
   * Excludes test developers and unpublished projects.
   */
  async getDirectoryStatistics(): Promise<{
    totalDevelopers: number;
    activeDevelopers: number;
    totalProjects: number;
    totalLocations: number;
  }> {
    const all = await this.developerRepository.list({ status: 'PUBLISHED' });
    const eligibleDevelopers = all.filter(d => !KNOWN_TEST_DEVELOPER_SLUGS.has(d.slug));
    const eligibleDevIds = new Set(eligibleDevelopers.map(d => d.id));

    const allProjects = await this.projectRepository.findAll();
    const publishedProjects = allProjects.filter(
      p => p.isPublished !== false && p.developerId && eligibleDevIds.has(p.developerId)
    );

    const devIdsWithProjects = new Set(publishedProjects.map(p => p.developerId));
    const distinctLocationIds = new Set(publishedProjects.map(p => p.locationId).filter(Boolean));

    return {
      totalDevelopers: eligibleDevelopers.length,
      activeDevelopers: devIdsWithProjects.size,
      totalProjects: publishedProjects.length,
      totalLocations: distinctLocationIds.size,
    };
  }

  /**
   * Resolves public projects for a developer.
   * Enforces bounded developer shape, test-developer exclusion, and RERA VERIFIED rule.
   */
  async getDeveloperPublicProjects(
    developerId: string,
    isInternalStaff = false
  ): Promise<PublicProjectDto[]> {
    const developer = await this.developerRepository.findById(developerId);
    if (!developer) {
      throw new NotFoundError(`Developer with id '${developerId}' not found`);
    }

    if (!isInternalStaff && (developer.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(developer.slug))) {
      throw new NotFoundError(`Developer with id '${developerId}' is not published`);
    }

    const { publishedProjects, locationsMap } = await this.getPublishedProjectsAndLocations(developer.id);
    const projectIds = publishedProjects.map(p => p.id);
    const [scopedMedia, scopedConfigs] = await Promise.all([
      projectIds.length > 0
        ? projectMediaRepository.findByProjectIds(projectIds)
        : Promise.resolve([]),
      projectIds.length > 0 && typeof projectConfigurationRepository.findByProjectIds === 'function'
        ? projectConfigurationRepository.findByProjectIds(projectIds)
        : Promise.resolve([]),
    ]);

    const configsByProjectId = new Map<string, typeof scopedConfigs>();
    for (const c of scopedConfigs) {
      const list = configsByProjectId.get(c.projectId) || [];
      list.push(c);
      configsByProjectId.set(c.projectId, list);
    }

    const mediaByProjectId = new Map<string, string>();
    const mediaListByProj = new Map<string, typeof scopedMedia>();
    for (const m of scopedMedia) {
      const list = mediaListByProj.get(m.projectId) || [];
      list.push(m);
      mediaListByProj.set(m.projectId, list);
    }

    for (const project of publishedProjects) {
      const projMedia = mediaListByProj.get(project.id) || [];
      const coverUrl = this.resolveProjectCoverImageUrl(projMedia);
      if (coverUrl) {
        mediaByProjectId.set(project.id, coverUrl);
      }
    }

    return publishedProjects.map(project => {
      const projConfigs = configsByProjectId.get(project.id) || [];
      const pricing = deriveProjectPricingSummary(project, projConfigs);
      return toPublicProjectDto(
        project,
        { id: developer.id, name: developer.name, slug: developer.slug },
        locationsMap.get(project.locationId),
        mediaByProjectId.get(project.id) || null,
        pricing.startingPrice,
        pricing.priceOnRequest
      );
    });
  }

  /**
   * Retrieves related published developers for cross-discovery on the developer profile page.
   * Excludes the current developer and known test records.
   * Prioritizes developers with published projects and featured partners using scoped queries.
   */
  async getRelatedDevelopers(currentDeveloperId: string, limit = 3): Promise<PublicDeveloperDto[]> {
    if (this.developerRepository.findRelatedPublishedDevelopers) {
      const relatedEntities = await this.developerRepository.findRelatedPublishedDevelopers(
        currentDeveloperId,
        Array.from(KNOWN_TEST_DEVELOPER_SLUGS),
        limit
      );
      if (relatedEntities.length === 0) return [];

      const relIds = relatedEntities.map(d => d.id);
      const [relProjects, relLogos] = await Promise.all([
        this.projectRepository.findByDeveloperIds(relIds),
        developerMediaRepository.findByDeveloperIds(relIds, 'LOGO'),
      ]);

      const publishedByDevId = new Map<string, Project[]>();
      const neededLocIds = new Set<string>();
      for (const p of relProjects) {
        if (p.isPublished !== false && p.lifecycleStatus !== 'DRAFT' && p.lifecycleStatus !== 'ARCHIVED') {
          const list = publishedByDevId.get(p.developerId) || [];
          list.push(p);
          publishedByDevId.set(p.developerId, list);
          if (p.locationId) neededLocIds.add(p.locationId);
        }
      }

      const locs = neededLocIds.size > 0
        ? await this.locationRepository.findByIds(Array.from(neededLocIds))
        : [];
      const locationsMap = new Map<string, Location>(locs.map(l => [l.id, l]));

      const logoByDevId = new Map<string, string>();
      for (const m of relLogos) {
        if (m.category === 'LOGO' && m.url && !logoByDevId.has(m.developerId)) {
          const resolved = normalizeMediaPublicUrl(m.url);
          if (resolved) logoByDevId.set(m.developerId, resolved);
        }
      }

      return relatedEntities.map(dev =>
        toPublicDeveloperDto(
          dev,
          publishedByDevId.get(dev.id) || [],
          locationsMap,
          logoByDevId.get(dev.id) || null
        )
      );
    }

    const listRes = await this.listPublicDevelopers({
      limit: 25,
      isInternalStaff: false,
    });

    const otherDevs = listRes.items.filter(
      d => d.id !== currentDeveloperId && !KNOWN_TEST_DEVELOPER_SLUGS.has(d.slug)
    );

    otherDevs.sort((a, b) => {
      if (b.projectCount !== a.projectCount) {
        return b.projectCount - a.projectCount;
      }
      if (a.featured !== b.featured) {
        return a.featured ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    return otherDevs.slice(0, limit);
  }
}

import {
  developerRepository,
  developerMediaRepository,
  developerSeoRepository,
} from "@/src/infrastructure/repositories/developerProvider";
import { projectRepository, projectMediaRepository, projectConfigurationRepository } from "@/src/infrastructure/repositories/projectProvider";
import { locationRepository } from "@/src/infrastructure/repositories/locationProvider";

export const developerService = new DeveloperService(
  developerRepository,
  projectRepository,
  locationRepository
);

