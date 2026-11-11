import { 
  PropertyDiscoveryCardDto,
  DiscoveryPagination,
  DiscoveryResponse,
  ProjectDiscoveryCardDto,
  ResaleDiscoveryCardDto,
  RentDiscoveryCardDto,
  BoundedLocation,
  BoundedProject,
  SearchResultDto
} from '../dto/discoveryDto';
import { PublicProjectDto, calculateEffectivePricePerSqft, deriveProjectPricingSummary } from '../dto/projectDto';
import { isConfigurationPriceOnRequest, comparePricesWithPorLast } from '@/src/lib/priceUtils';
import { PropertyType } from '../entities';
import { resaleListingService, isKnownTestResaleListing } from './resaleService';
import { rentalListingService, isKnownTestRentalListing } from './rentalService';
import { projectRepository, projectConfigurationRepository, projectMediaRepository, projectReraRepository } from '../../../infrastructure/repositories/projectProvider';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { developerRepository } from '../../../infrastructure/repositories/developerProvider';
import { newBookingAvailabilityRepository } from '../repositories/newBookingRepository';
import { isValidCoordinate, resolveProjectCoordinates } from '../viewModels/projectLocationViewModel';
import { calculateGeodesicDistanceKm, formatDistanceKm } from '../../places/spatial/distance';
import { normalizeMediaPublicUrl } from '@/src/lib/mediaUtils';
import { isKnownTestDeveloperSlug } from '../../developers/services/developerService';
export { calculateGeodesicDistanceKm, formatDistanceKm };

export interface DiscoveryFilters {
  location?: string; // slug
  scope?: 'DIRECT' | 'DESCENDANT';
  bedroomCount?: number;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  inventoryType?: string; // NEW_BOOKING, RESALE, RENT
  furnishing?: string;
  stage?: string; // UPCOMING, NEW_LAUNCH, UNDER_CONSTRUCTION, READY_TO_MOVE, COMPLETED, SOLD_OUT
  sort?: string; // RECOMMENDED, PRICE_ASC, PRICE_DESC, NEWEST
  query?: string;
}

export class PropertyDiscoveryService {
  private locationTreeCache = new Map<string, { data: Set<string>; expiresAt: number }>();
  private referenceMapsCache: {
    data: {
      devMap: Map<string, any>;
      locMap: Map<string, any>;
      configMap: Map<string, any>;
      configsByProject: Map<string, any[]>;
      mediaByProject: Map<string, any[]>;
      reraByProject: Map<string, any>;
      projectMap: Map<string, any>;
      projectsList: any[];
      locs: any[];
    };
    expiresAt: number;
  } | null = null;

  private async getLocationScopeIds(
    locationSlug: string,
    scope: 'DIRECT' | 'DESCENDANT' = 'DESCENDANT',
    preloadedLocs?: any[]
  ): Promise<Set<string>> {
    const cleanSlug = locationSlug.toLowerCase().trim();
    const cacheKey = `${cleanSlug}::${scope}`;
    const isPg = Boolean(process.env.DATABASE_URL && process.env.PERSISTENCE_PROVIDER === 'postgres');
    const now = Date.now();
    if (isPg) {
      const cached = this.locationTreeCache.get(cacheKey);
      if (cached && cached.expiresAt > now) return cached.data;
    }

    const locs = preloadedLocs || (await locationRepository.findAll());
    const target = locs.find(
      (l: any) => l.slug.toLowerCase() === cleanSlug || l.name.toLowerCase() === cleanSlug
    );
    if (!target) return new Set();

    const ids = new Set<string>([target.id]);
    if (scope === 'DIRECT') {
      if (isPg) {
        this.locationTreeCache.set(cacheKey, { data: ids, expiresAt: now + 5_000 });
      }
      return ids;
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const loc of locs) {
        if (loc.parentId && ids.has(loc.parentId) && !ids.has(loc.id)) {
          ids.add(loc.id);
          changed = true;
        }
      }
    }
    if (isPg) {
      this.locationTreeCache.set(cacheKey, { data: ids, expiresAt: now + 5_000 });
    }
    return ids;
  }

  private async getLocationTree(locationSlug: string): Promise<Set<string>> {
    return this.getLocationScopeIds(locationSlug, 'DESCENDANT');
  }

  private inflightReferenceMaps: Promise<any> | null = null;

  public async getReferenceMaps() {
    const isPg = Boolean(process.env.DATABASE_URL && process.env.PERSISTENCE_PROVIDER === 'postgres');
    const now = Date.now();
    if (isPg && this.referenceMapsCache && this.referenceMapsCache.expiresAt > now) {
      return this.referenceMapsCache.data;
    }
    if (isPg && this.inflightReferenceMaps) {
      return this.inflightReferenceMaps;
    }

    const loadMaps = async () => {
      const [projectsList, devs, locs, configs, mediaList, reras] = await Promise.all([
        projectRepository.findAll(),
        developerRepository.list(),
        locationRepository.findAll(),
        projectConfigurationRepository.findAll(),
        projectMediaRepository.findAll(),
        projectReraRepository.findAll(),
      ]);

      const devMap = new Map(devs.map(d => [d.id, d]));
      const locMap = new Map(locs.map(l => [l.id, l]));
      const configMap = new Map(configs.map(c => [c.id, c]));
      const configsByProject = new Map<string, typeof configs>();
      for (const c of configs) {
        const list = configsByProject.get(c.projectId) || [];
        list.push(c);
        configsByProject.set(c.projectId, list);
      }
      const mediaByProject = new Map<string, typeof mediaList>();
      for (const m of mediaList) {
        const list = mediaByProject.get(m.projectId) || [];
        list.push(m);
        mediaByProject.set(m.projectId, list);
      }
      const reraByProject = new Map(reras.map(r => [r.projectId, r]));
      const projectMap = new Map(projectsList.map(p => [p.id, p]));

      const result = { devMap, locMap, configMap, configsByProject, mediaByProject, reraByProject, projectMap, projectsList, locs };
      if (isPg) {
        this.referenceMapsCache = { data: result, expiresAt: Date.now() + 3_000 };
      }
      return result;
    };

    if (isPg) {
      this.inflightReferenceMaps = loadMaps().finally(() => {
        this.inflightReferenceMaps = null;
      });
      return this.inflightReferenceMaps;
    }

    return loadMaps();
  }

  private isProjectPublishedEligible(proj: any, devMap?: Map<string, any>): boolean {
    if (!proj || !proj.id || !proj.name || !proj.slug) return false;
    if (/^neon-proj-\d+$/i.test(proj.slug)) return false;
    if (devMap && proj.developerId) {
      const dev = devMap.get(proj.developerId);
      if (dev && (dev.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(dev.slug))) {
        return false;
      }
    }
    if (proj.lifecycleStatus) {
      return proj.lifecycleStatus === 'PUBLISHED' && proj.isPublished !== false;
    }
    return proj.isPublished === true;
  }

  private matchesKeywordQuery(
    rawQuery: string,
    matchedLocIds: Set<string>,
    fields: {
      locationId?: string | null;
      locationName?: string | null;
      locationSlug?: string | null;
      projectName?: string | null;
      projectSlug?: string | null;
      developerName?: string | null;
      configuration?: string | null;
      bedroomCount?: number | null;
      propertyType?: string | null;
      slug?: string | null;
      description?: string | null;
    }
  ): boolean {
    const q = rawQuery.toLowerCase().trim();
    if (!q) return true;

    if (fields.locationId && matchedLocIds.has(fields.locationId)) {
      return true;
    }

    const bhkText =
      typeof fields.bedroomCount === 'number' && fields.bedroomCount > 0
        ? `${fields.bedroomCount} bhk ${fields.bedroomCount}bhk`
        : '';
    const propTypeText = (fields.propertyType || '').replace(/_/g, ' ').toLowerCase();

    const searchableHaystack = [
      fields.locationName,
      fields.locationSlug,
      fields.projectName,
      fields.projectSlug,
      fields.developerName,
      fields.configuration,
      bhkText,
      propTypeText,
      fields.slug,
      fields.description,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (searchableHaystack.includes(q)) return true;

    const tokens = q.split(/\s+/).filter(t => t.length >= 2);
    if (tokens.length > 1) {
      return tokens.every(token => searchableHaystack.includes(token));
    }

    return false;
  }

  private assembleBoundedProject(
    proj: any,
    maps: Awaited<ReturnType<PropertyDiscoveryService['getReferenceMaps']>>
  ): BoundedProject | null {
    if (!proj) return null;
    const dev = proj.developerId ? maps.devMap.get(proj.developerId) : null;
    if (dev && (dev.status !== 'PUBLISHED' || isKnownTestDeveloperSlug(dev.slug))) {
      return null;
    }
    const loc = proj.locationId ? maps.locMap.get(proj.locationId) : null;
    const boundedLoc = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
    const configs = maps.configsByProject.get(proj.id) || [];
    const media = (maps.mediaByProject.get(proj.id) || []).filter(
      m =>
        m &&
        typeof m.url === 'string' &&
        m.url.trim().length > 0 &&
        (m.mediaType || '').toUpperCase() !== 'VIDEO' &&
        (m.category || '').toUpperCase() !== 'WALKTHROUGH'
    );
    const rera = maps.reraByProject.get(proj.id) || null;

    const featuredImg = media.find(m => m.isFeatured) || media[0];
    const propertyTypes = proj.propertyType ? [proj.propertyType] : [];
    const bhkSet = new Set<number>();
    for (const c of configs) {
      const b = Number(c.bedroomCount);
      if (!Number.isNaN(b) && b > 0) {
        bhkSet.add(b);
      }
    }
    const bhks: number[] = Array.from(bhkSet).sort((a, b) => a - b);
    
    const pricing = deriveProjectPricingSummary(proj, configs);

    return {
      id: proj.id,
      name: proj.name,
      slug: proj.slug,
      developer: dev ? { id: dev.id, name: dev.name, slug: dev.slug } : null,
      location: boundedLoc,
      startingPrice: pricing.startingPrice,
      priceOnRequest: Boolean(pricing.priceOnRequest),
      propertyTypes,
      bhkSummary: bhks,
      reraVerified: rera ? (rera.status === 'VERIFIED') : (proj.reraStatus === 'VERIFIED'),
      featuredImageUrl: featuredImg ? normalizeMediaPublicUrl(featuredImg.url) : null,
      status: proj.status
    };
  }

  async discoverProjects(filters: DiscoveryFilters, page: number = 1, pageSize: number = 20): Promise<DiscoveryResponse<ProjectDiscoveryCardDto>> {
    const maps = await this.getReferenceMaps();
    let projects = maps.projectsList.filter(p => this.isProjectPublishedEligible(p, maps.devMap));
    
    // Stage filter (UPCOMING, NEW_LAUNCH, UNDER_CONSTRUCTION, READY_TO_MOVE, COMPLETED, SOLD_OUT)
    if (filters.stage) {
      const normalizedStage = filters.stage.trim().toUpperCase().replace(/[\s-]+/g, '_');
      projects = projects.filter(p => p.status === normalizedStage);
    }

    if (filters.location) {
      const allowedLocationIds = await this.getLocationScopeIds(
        filters.location,
        filters.scope || 'DESCENDANT',
        maps.locs
      );
      if (allowedLocationIds.size > 0) {
        projects = projects.filter(p => p.locationId && allowedLocationIds.has(p.locationId));
      } else {
        projects = [];
      }
    }

    const q = filters.query ? filters.query.toLowerCase().trim() : '';
    const matchedLocIds = q ? await this.getLocationScopeIds(q, 'DESCENDANT', maps.locs) : new Set<string>();

    const results: ProjectDiscoveryCardDto[] = [];
    for (const proj of projects) {
      const bp = this.assembleBoundedProject(proj, maps);
      if (!bp) continue;

      if (q) {
        const projConfigs = maps.configsByProject.get(proj.id) || [];
        const configSummary = [
          ...projConfigs.map(c => c.name),
          ...bp.bhkSummary.map(b => `${b} bhk ${b}bhk`),
        ].join(' ');
        const matched = this.matchesKeywordQuery(q, matchedLocIds, {
          locationId: proj.locationId,
          locationName: bp.location?.name,
          locationSlug: bp.location?.slug,
          projectName: bp.name,
          projectSlug: bp.slug,
          developerName: bp.developer?.name,
          configuration: configSummary,
          propertyType: proj.propertyType,
          description: proj.shortDescription || proj.description,
        });
        if (!matched) continue;
      }

      if (filters.bedroomCount !== undefined && !bp.bhkSummary.includes(filters.bedroomCount)) continue;
      if (filters.propertyType && !bp.propertyTypes.includes(filters.propertyType as PropertyType)) continue;
      if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
        if (bp.priceOnRequest || !bp.startingPrice || bp.startingPrice <= 0) continue;
        if (filters.minPrice !== undefined && bp.startingPrice < filters.minPrice) continue;
        if (filters.maxPrice !== undefined && bp.startingPrice > filters.maxPrice) continue;
      }

      results.push({
        id: proj.id,
        type: 'PROJECT' as const,
        name: bp.name,
        slug: bp.slug,
        developer: bp.developer,
        location: bp.location,
        propertyTypes: bp.propertyTypes,
        bhkSummary: bp.bhkSummary,
        startingPrice: bp.startingPrice,
        priceOnRequest: bp.priceOnRequest,
        reraVerified: bp.reraVerified,
        featuredImageUrl: bp.featuredImageUrl,
        status: proj.status,
      });
    }

    // Sort deterministically
    const sort = filters.sort?.toUpperCase() || 'RECOMMENDED';
    if (sort === 'PRICE_ASC') {
      results.sort((a, b) => comparePricesWithPorLast(a.startingPrice, b.startingPrice, 'asc') || a.id.localeCompare(b.id));
    } else if (sort === 'PRICE_DESC') {
      results.sort((a, b) => comparePricesWithPorLast(a.startingPrice, b.startingPrice, 'desc') || a.id.localeCompare(b.id));
    } else if (sort === 'NEWEST') {
      results.sort((a, b) => b.id.localeCompare(a.id));
    } else {
      // RECOMMENDED: RERA verified first, then has startingPrice, then id
      results.sort((a, b) => {
        if (a.reraVerified !== b.reraVerified) return a.reraVerified ? -1 : 1;
        return comparePricesWithPorLast(a.startingPrice, b.startingPrice, 'asc') || a.id.localeCompare(b.id);
      });
    }

    return this.paginate(results, page, pageSize);
  }

  async discoverBuy(filters: DiscoveryFilters, page: number = 1, pageSize: number = 20): Promise<DiscoveryResponse<PropertyDiscoveryCardDto>> {
    const results: PropertyDiscoveryCardDto[] = [];
    const maps = await this.getReferenceMaps();

    let allowedLocationIds: Set<string> | null = null;
    if (filters.location) {
      allowedLocationIds = await this.getLocationScopeIds(
        filters.location,
        filters.scope || 'DESCENDANT',
        maps.locs
      );
    }

    const q = filters.query ? filters.query.toLowerCase().trim() : '';
    const matchedLocIds = q ? await this.getLocationScopeIds(q, 'DESCENDANT', maps.locs) : new Set<string>();

    if (!filters.inventoryType || filters.inventoryType === 'NEW_BOOKING') {
      const allAvail = await newBookingAvailabilityRepository.findAll();
      for (const av of allAvail) {
        if (av.availabilityStatus === 'NOT_AVAILABLE') continue;
        const config = maps.configMap.get(av.configurationId);
        if (!config || config.price === null) continue;
        
        const proj = maps.projectMap.get(config.projectId);
        if (!proj || !this.isProjectPublishedEligible(proj, maps.devMap)) continue;

        const isPor = isConfigurationPriceOnRequest(config, proj);
        if (allowedLocationIds && (!proj.locationId || !allowedLocationIds.has(proj.locationId))) continue;
        if (filters.bedroomCount !== undefined && config.bedroomCount !== filters.bedroomCount) continue;
        if (filters.propertyType && proj.propertyType !== filters.propertyType) continue;
        if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
          if (isPor) continue;
          if (filters.minPrice !== undefined && config.price < filters.minPrice) continue;
          if (filters.maxPrice !== undefined && config.price > filters.maxPrice) continue;
        }

        const bp = this.assembleBoundedProject(proj, maps);
        if (!bp) continue;

        if (q) {
          const matched = this.matchesKeywordQuery(q, matchedLocIds, {
            locationId: proj.locationId,
            locationName: bp.location?.name,
            locationSlug: bp.location?.slug,
            projectName: bp.name,
            projectSlug: bp.slug,
            developerName: bp.developer?.name,
            configuration: config.name,
            bedroomCount: config.bedroomCount,
            propertyType: proj.propertyType,
          });
          if (!matched) continue;
        }

        let effPrice = 0;
        if (!isPor) {
          try {
            effPrice = calculateEffectivePricePerSqft(config.price, config.priceBasis, {
              carpetArea: config.carpetArea,
              builtUpArea: config.builtUpArea,
              superBuiltUpArea: config.superBuiltUpArea,
            });
          } catch {
            effPrice = 0;
          }
        }

        results.push({
          id: av.id,
          type: 'NEW_BOOKING',
          project: bp,
          configurationName: config.name,
          bedroomCount: config.bedroomCount,
          carpetArea: config.carpetArea,
          price: isPor ? 0 : config.price,
          priceOnRequest: isPor,
          priceBasis: config.priceBasis,
          effectivePricePerSqft: isPor ? 0 : effPrice,
          availabilityStatus: av.availabilityStatus,
          reraVerified: bp.reraVerified,
          featuredImageUrl: bp.featuredImageUrl
        });
      }
    }

    if (!filters.inventoryType || filters.inventoryType === 'RESALE') {
      const resale = await resaleListingService.listPublicListings({
        skipAmenities: true,
        preloadedContext: { ...maps, allowedLocationIds: allowedLocationIds || undefined },
      });
      for (const r of resale) {
        if (isKnownTestResaleListing(r)) continue;
        if (filters.bedroomCount !== undefined && r.bedroomCount !== filters.bedroomCount) continue;
        if (filters.propertyType && r.propertyType !== filters.propertyType) continue;
        if (filters.minPrice !== undefined && r.askingPrice < filters.minPrice) continue;
        if (filters.maxPrice !== undefined && r.askingPrice > filters.maxPrice) continue;

        const rProjectId = (r as any).projectId || r.project?.id || null;
        const rLocationId = (r as any).locationId || r.location?.id || null;
        const rVerificationStatus = (r as any).verificationStatus || (r.isVerified ? 'VERIFIED' : 'UNVERIFIED');

        let passLoc = true;
        let bp = null;
        let cardLocation = null;
        if (rProjectId) {
          const proj = maps.projectMap.get(rProjectId);
          if (!proj || !this.isProjectPublishedEligible(proj, maps.devMap)) continue;
          bp = this.assembleBoundedProject(proj, maps);
          if (!bp) continue;
          if (allowedLocationIds) {
            const projLocMatch = Boolean(bp.location?.id && allowedLocationIds.has(bp.location.id));
            const directLocMatch = Boolean(rLocationId && allowedLocationIds.has(rLocationId));
            if (!projLocMatch && !directLocMatch) {
              passLoc = false;
            }
          }
          cardLocation = bp.location;
        } else {
          if (allowedLocationIds) {
            if (!rLocationId || !allowedLocationIds.has(rLocationId)) {
              passLoc = false;
            }
          }
          if (rLocationId) {
            const loc = maps.locMap.get(rLocationId);
            cardLocation = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
          }
        }

        if (!passLoc) continue;

        if (q) {
          const matched = this.matchesKeywordQuery(q, matchedLocIds, {
            locationId: cardLocation?.id ?? rLocationId,
            locationName: cardLocation?.name,
            locationSlug: cardLocation?.slug,
            projectName: bp?.name,
            projectSlug: bp?.slug,
            developerName: bp?.developer?.name,
            configuration: r.configuration,
            bedroomCount: r.bedroomCount,
            propertyType: r.propertyType,
            slug: r.slug,
            description: r.description,
          });
          if (!matched) continue;
        }

        results.push({
          id: r.id,
          slug: r.slug,
          type: 'RESALE' as const,
          project: bp,
          propertyType: r.propertyType as PropertyType,
          configuration: r.configuration,
          bedroomCount: r.bedroomCount,
          carpetArea: r.carpetArea,
          askingPrice: r.askingPrice,
          furnishing: r.furnishing,
          floorCategory: r.floorCategory,
          listingPartyLabel: r.listingParty.label,
          verificationStatus: rVerificationStatus,
          location: cardLocation,
          featuredImageUrl: normalizeMediaPublicUrl(r.media.find(m => m.isFeatured)?.url || r.media[0]?.url || null)
        });
      }
    }

    // Sort deterministically
    const sort = filters.sort?.toUpperCase() || 'RECOMMENDED';
    const getItemPrice = (item: PropertyDiscoveryCardDto): number | null => {
      if (item.type === 'NEW_BOOKING') return item.priceOnRequest ? null : item.price;
      if (item.type === 'RESALE') return item.askingPrice;
      return null;
    };

    if (sort === 'PRICE_ASC') {
      results.sort((a, b) => comparePricesWithPorLast(getItemPrice(a), getItemPrice(b), 'asc') || a.id.localeCompare(b.id));
    } else if (sort === 'PRICE_DESC') {
      results.sort((a, b) => comparePricesWithPorLast(getItemPrice(a), getItemPrice(b), 'desc') || a.id.localeCompare(b.id));
    } else if (sort === 'NEWEST') {
      results.sort((a, b) => b.id.localeCompare(a.id));
    } else {
      // RECOMMENDED: verified status first, then stable id
      results.sort((a, b) => {
        const aVerified = a.type === 'NEW_BOOKING' ? a.reraVerified : ('verificationStatus' in a ? (a as any).verificationStatus === 'VERIFIED' : false);
        const bVerified = b.type === 'NEW_BOOKING' ? b.reraVerified : ('verificationStatus' in b ? (b as any).verificationStatus === 'VERIFIED' : false);
        if (aVerified !== bVerified) return aVerified ? -1 : 1;
        return comparePricesWithPorLast(getItemPrice(a), getItemPrice(b), 'asc') || a.id.localeCompare(b.id);
      });
    }

    return this.paginate(results, page, pageSize);
  }

  async discoverRent(filters: DiscoveryFilters, page: number = 1, pageSize: number = 20): Promise<DiscoveryResponse<RentDiscoveryCardDto>> {
    const results: RentDiscoveryCardDto[] = [];
    const maps = await this.getReferenceMaps();

    let allowedLocationIds: Set<string> | null = null;
    if (filters.location) {
      allowedLocationIds = await this.getLocationScopeIds(
        filters.location,
        filters.scope || 'DESCENDANT',
        maps.locs
      );
    }

    const q = filters.query ? filters.query.toLowerCase().trim() : '';
    const matchedLocIds = q ? await this.getLocationScopeIds(q, 'DESCENDANT', maps.locs) : new Set<string>();

    const rent = await rentalListingService.listPublicListings({
      skipAmenities: true,
      preloadedContext: { ...maps, allowedLocationIds: allowedLocationIds || undefined },
    });

    for (const r of rent) {
      if (isKnownTestRentalListing(r)) continue;
      if (filters.bedroomCount !== undefined && r.bedroomCount !== filters.bedroomCount) continue;
      if (filters.propertyType && r.propertyType !== filters.propertyType) continue;
      if (filters.minPrice !== undefined && r.monthlyRent < filters.minPrice) continue;
      if (filters.maxPrice !== undefined && r.monthlyRent > filters.maxPrice) continue;
      if (filters.furnishing && r.furnishing !== filters.furnishing) continue;

      const rProjectId = r.projectId || r.project?.id || null;
      const rLocationId = (r as any).locationId || r.location?.id || null;
      const rVerificationStatus = r.verificationStatus || (r.isVerified ? 'VERIFIED' : 'UNVERIFIED');

      let passLoc = true;
      let bp = null;
      let cardLocation = null;
      if (rProjectId) {
        const proj = maps.projectMap.get(rProjectId);
        if (!proj || !this.isProjectPublishedEligible(proj, maps.devMap)) continue;
        bp = this.assembleBoundedProject(proj, maps);
        if (!bp) continue;
        if (allowedLocationIds) {
          const projLocMatch = Boolean(bp.location?.id && allowedLocationIds.has(bp.location.id));
          const directLocMatch = Boolean(rLocationId && allowedLocationIds.has(rLocationId));
          if (!projLocMatch && !directLocMatch) {
            passLoc = false;
          }
        }
        cardLocation = bp.location;
      } else {
        if (allowedLocationIds) {
          if (!rLocationId || !allowedLocationIds.has(rLocationId)) {
            passLoc = false;
          }
        }
        if (rLocationId) {
          const loc = maps.locMap.get(rLocationId);
          cardLocation = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
        }
      }

      if (!passLoc) continue;

      if (q) {
        const matched = this.matchesKeywordQuery(q, matchedLocIds, {
          locationId: cardLocation?.id ?? rLocationId,
          locationName: cardLocation?.name,
          locationSlug: cardLocation?.slug,
          projectName: bp?.name,
          projectSlug: bp?.slug,
          developerName: bp?.developer?.name,
          configuration: r.configuration,
          bedroomCount: r.bedroomCount,
          propertyType: r.propertyType,
          slug: r.slug,
          description: r.description,
        });
        if (!matched) continue;
      }

      results.push({
        id: r.id,
        slug: r.slug,
        type: 'RENT' as const,
        project: bp,
        propertyType: r.propertyType as PropertyType,
        configuration: r.configuration,
        bedroomCount: r.bedroomCount,
        carpetArea: r.carpetArea,
        monthlyRent: r.monthlyRent,
        maintenance: r.maintenance,
        securityDeposit: r.securityDeposit,
        furnishing: r.furnishing,
        floorCategory: r.floorCategory,
        listingPartyLabel: r.listingParty.label,
        verificationStatus: rVerificationStatus,
        location: cardLocation,
        featuredImageUrl: normalizeMediaPublicUrl(r.media.find(m => m.isFeatured)?.url || r.media[0]?.url || null)
      });
    }

    // Sort deterministically
    const sort = filters.sort?.toUpperCase() || 'RECOMMENDED';
    if (sort === 'PRICE_ASC') {
      results.sort((a, b) => a.monthlyRent - b.monthlyRent);
    } else if (sort === 'PRICE_DESC') {
      results.sort((a, b) => b.monthlyRent - a.monthlyRent);
    } else if (sort === 'NEWEST') {
      results.sort((a, b) => b.id.localeCompare(a.id));
    } else {
      // RECOMMENDED: verified status first, then monthly rent
      results.sort((a, b) => {
        const aVerified = a.verificationStatus === 'VERIFIED';
        const bVerified = b.verificationStatus === 'VERIFIED';
        if (aVerified !== bVerified) return aVerified ? -1 : 1;
        return a.monthlyRent - b.monthlyRent;
      });
    }

    return this.paginate(results, page, pageSize);
  }

  async getFilterOptions(): Promise<{
    locations: { id: string; name: string; slug: string; type: string }[];
  }> {
    const locs = await locationRepository.findAll();
    return {
      locations: locs.filter(l => l.status === 'PUBLISHED').map(l => ({ id: l.id, name: l.name, slug: l.slug, type: l.type }))
    };
  }

  /**
   * Computes descendant published project counts for a list of location IDs in memory
   * using the shared reference maps (0 extra database queries).
   */
  async getScopedProjectCountsByLocationIds(locationIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (locationIds.length === 0) return counts;

    const maps = await this.getReferenceMaps();
    const eligibleProjects = maps.projectsList.filter(p => this.isProjectPublishedEligible(p, maps.devMap));

    const directByLocId = new Map<string, number>();
    for (const p of eligibleProjects) {
      if (p.locationId) {
        directByLocId.set(p.locationId, (directByLocId.get(p.locationId) || 0) + 1);
      }
    }

    const childrenByParent = new Map<string, string[]>();
    for (const loc of maps.locs) {
      if (loc.parentId && loc.status === 'PUBLISHED') {
        const list = childrenByParent.get(loc.parentId) || [];
        list.push(loc.id);
        childrenByParent.set(loc.parentId, list);
      }
    }

    for (const rootId of locationIds) {
      let total = 0;
      const visited = new Set<string>([rootId]);
      const queue = [rootId];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        total += directByLocId.get(curr) || 0;
        const children = childrenByParent.get(curr) || [];
        for (const ch of children) {
          if (!visited.has(ch)) {
            visited.add(ch);
            queue.push(ch);
          }
        }
      }
      counts.set(rootId, total);
    }

    return counts;
  }

  async search(query: string): Promise<SearchResultDto[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const maps = await this.getReferenceMaps();
    const results: SearchResultDto[] = [];

    for (const p of maps.projectsList) {
      if (p.isPublished && p.name.toLowerCase().includes(q)) {
        const dev = p.developerId ? maps.devMap.get(p.developerId) : null;
        results.push({
          type: 'PROJECT',
          id: p.id,
          name: p.name,
          slug: p.slug,
          subtitle: dev ? dev.name : null
        });
      }
    }

    const { isKnownTestDeveloperSlug } = await import('../../developers/services/developerService');
    const developers = await developerRepository.list();
    for (const d of developers) {
      if (d.status === 'PUBLISHED' && !isKnownTestDeveloperSlug(d.slug) && d.name.toLowerCase().includes(q)) {
        results.push({
          type: 'DEVELOPER',
          id: d.id,
          name: d.name,
          slug: d.slug,
          subtitle: 'Developer'
        });
      }
    }

    for (const l of maps.locs) {
      if (l.status === 'PUBLISHED' && l.name.toLowerCase().includes(q)) {
        results.push({
          type: 'LOCATION',
          id: l.id,
          name: l.name,
          slug: l.slug,
          subtitle: l.type
        });
      }
    }

    return results.slice(0, 10);
  }

  /**
   * Resolves ancestor location IDs (from immediate location up to root) for deterministic
   * geographic proximity & region matching.
   */
  private getLocationAncestryIds(
    locationId: string | null | undefined,
    locMap: Map<string, { id: string; parentId?: string | null; type?: string }>
  ): string[] {
    if (!locationId) return [];
    const chain: string[] = [];
    const visited = new Set<string>();
    let currId: string | null | undefined = locationId;
    while (currId && !visited.has(currId)) {
      visited.add(currId);
      const node = locMap.get(currId);
      if (!node) break;
      chain.push(node.id);
      currId = node.parentId;
    }
    return chain;
  }

  /**
   * Batch 2 Part E: "More Projects by This Developer"
   * Returns eligible published projects belonging to the same developer,
   * strictly excluding the current project and deduplicating by ID and slug.
   */
  async getDeveloperOtherProjects(
    developerId: string,
    excludeProjectId: string,
    excludeProjectSlug?: string,
    limit = 12,
    preloadedMaps?: Awaited<ReturnType<PropertyDiscoveryService['getReferenceMaps']>>
  ): Promise<ProjectDiscoveryCardDto[]> {
    if (!developerId) return [];
    const maps = preloadedMaps || (await this.getReferenceMaps());

    const seenIds = new Set<string>([excludeProjectId]);
    const seenSlugs = new Set<string>(excludeProjectSlug ? [excludeProjectSlug.toLowerCase()] : []);
    const results: ProjectDiscoveryCardDto[] = [];

    for (const proj of maps.projectsList) {
      if (!this.isProjectPublishedEligible(proj)) continue;
      if (proj.developerId !== developerId) continue;
      if (seenIds.has(proj.id) || seenSlugs.has(proj.slug.toLowerCase())) continue;

      const bp = this.assembleBoundedProject(proj, maps);
      if (!bp) continue;

      seenIds.add(proj.id);
      seenSlugs.add(proj.slug.toLowerCase());

      results.push({
        id: proj.id,
        type: 'PROJECT',
        name: bp.name,
        slug: bp.slug,
        developer: bp.developer,
        location: bp.location,
        propertyTypes: bp.propertyTypes,
        bhkSummary: bp.bhkSummary,
        startingPrice: bp.startingPrice,
        priceOnRequest: bp.priceOnRequest,
        reraVerified: bp.reraVerified,
        featuredImageUrl: bp.featuredImageUrl,
        status: proj.status,
      });
    }

    results.sort((a, b) => {
      if (a.reraVerified !== b.reraVerified) return a.reraVerified ? -1 : 1;
      const cmp = comparePricesWithPorLast(a.startingPrice, b.startingPrice, 'asc');
      if (cmp !== 0) return cmp;
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, limit);
  }

  /**
   * Batch 2 Part F: "Projects You May Also Like"
   * Deterministic, data-backed cross-developer project recommendation engine.
   * Excludes the current project and any project IDs/slugs already displayed in
   * "More Projects by This Developer".
   * Scores candidates by:
   * - Cross-developer diversity preference
   * - Locality / parent region / geodesic proximity
   * - Property type match
   * - Overlapping BHK configurations
   * - Comparable starting price band
   * - Construction status & RERA verification
   */
  async getRelatedProjectsForProject(
    currentProject: PublicProjectDto,
    options?: {
      excludeProjectIds?: string[];
      excludeProjectSlugs?: string[];
      limit?: number;
      preloadedMaps?: Awaited<ReturnType<PropertyDiscoveryService['getReferenceMaps']>>;
    }
  ): Promise<ProjectDiscoveryCardDto[]> {
    if (!currentProject || !currentProject.id) return [];
    const limit = options?.limit ?? 8;
    const maps = options?.preloadedMaps || (await this.getReferenceMaps());

    const seenIds = new Set<string>([
      currentProject.id,
      ...(options?.excludeProjectIds || []),
    ]);
    const seenSlugs = new Set<string>([
      currentProject.slug.toLowerCase(),
      ...(options?.excludeProjectSlugs || []).map(s => s.toLowerCase()),
    ]);

    const currentBhkSet = new Set<number>(
      (currentProject.configurations || [])
        .map(c => c.bedroomCount)
        .filter((b): b is number => typeof b === 'number' && b > 0)
    );
    const currentCarpetAreas = (currentProject.configurations || [])
      .map(c => c.carpetArea)
      .filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0);
    const currentPrice = currentProject.pricing?.startingPrice ?? currentProject.startingPrice ?? null;
    const currentAncestry = this.getLocationAncestryIds(currentProject.location?.id, maps.locMap);
    // Immediate locality and parent region/area (excluding root STATE)
    const currentSubCityAncestors = new Set(
      currentAncestry.filter(id => {
        const node = maps.locMap.get(id);
        return node && node.type !== 'STATE' && node.type !== 'CITY' && node.type !== 'DISTRICT';
      })
    );

    const currentCoords = resolveProjectCoordinates(currentProject, currentProject.location);

    interface ScoredCandidate {
      card: ProjectDiscoveryCardDto;
      score: number;
      isOtherDeveloper: boolean;
      priceDelta: number;
    }

    const scored: ScoredCandidate[] = [];

    for (const proj of maps.projectsList) {
      if (!this.isProjectPublishedEligible(proj)) continue;
      if (seenIds.has(proj.id) || seenSlugs.has(proj.slug.toLowerCase())) continue;

      const bp = this.assembleBoundedProject(proj, maps);
      if (!bp) continue;

      seenIds.add(proj.id);
      seenSlugs.add(proj.slug.toLowerCase());

      const isOtherDeveloper = proj.developerId !== currentProject.developer?.id;
      let score = 0;
      const reasons: string[] = [];

      // 1. Geographic proximity (Locality / corridor / geodesic distance)
      const candAncestry = this.getLocationAncestryIds(proj.locationId, maps.locMap);
      const isSameLocality = Boolean(
        proj.locationId && currentProject.location?.id && proj.locationId === currentProject.location.id
      );
      const sharesSubCityRegion = candAncestry.some(id => currentSubCityAncestors.has(id));

      let distanceKm: number | null = null;
      const candLoc = proj.locationId ? maps.locMap.get(proj.locationId) : null;
      const candCoords = resolveProjectCoordinates(proj, candLoc);
      if (
        currentCoords.canComputeExactProjectDistance &&
        currentCoords.latitude !== null &&
        currentCoords.longitude !== null &&
        candCoords.canComputeExactProjectDistance &&
        candCoords.latitude !== null &&
        candCoords.longitude !== null
      ) {
        const computedDist = calculateGeodesicDistanceKm(
          { latitude: currentCoords.latitude, longitude: currentCoords.longitude },
          { latitude: candCoords.latitude, longitude: candCoords.longitude }
        );
        // Prevent distinct projects from appearing to have 0 km distance if they share identical coordinates
        if (computedDist !== null && computedDist > 0) {
          distanceKm = computedDist;
        }
      }

      if (isSameLocality) {
        score += 38;
        reasons.push(`In ${bp.location?.name || currentProject.location.name}`);
      } else if (sharesSubCityRegion || (distanceKm !== null && distanceKm <= 8)) {
        score += 24;
        reasons.push(distanceKm !== null ? `${formatDistanceKm(distanceKm)} away` : 'Nearby Corridor');
      } else if (distanceKm !== null && distanceKm <= 15) {
        score += 12;
      }

      // 2. Overlapping BHK configurations
      const matchingBhks = bp.bhkSummary.filter(b => currentBhkSet.has(b));
      if (matchingBhks.length > 0) {
        score += 22;
        if (reasons.length === 0) {
          reasons.push(`${matchingBhks.join(', ')} BHK Options`);
        }
      }

      // 3. Comparable starting price band
      let priceDelta = Number.MAX_SAFE_INTEGER;
      if (currentPrice && currentPrice > 0 && bp.startingPrice && bp.startingPrice > 0) {
        priceDelta = Math.abs(bp.startingPrice - currentPrice);
        const ratio = priceDelta / currentPrice;
        if (ratio <= 0.35) {
          score += 18;
          if (reasons.length === 0) {
            reasons.push('Comparable Budget');
          }
        } else if (ratio <= 0.6) {
          score += 9;
        }
      }

      // 4. Area compatibility across configurations
      const candConfigs = maps.configsByProject.get(proj.id) || [];
      if (currentCarpetAreas.length > 0 && candConfigs.length > 0) {
        const hasCompatibleArea = candConfigs.some(
          cc =>
            typeof cc.carpetArea === 'number' &&
            cc.carpetArea > 0 &&
            currentCarpetAreas.some(ca => Math.abs(cc.carpetArea! - ca) / ca <= 0.25)
        );
        if (hasCompatibleArea) {
          score += 14;
        }
      }

      // 5. Property type & construction status match
      if (proj.propertyType && proj.propertyType === currentProject.propertyType) {
        score += 12;
      }
      if (proj.status && proj.status === currentProject.status) {
        score += 6;
      }

      // 6. RERA verification bonus
      if (bp.reraVerified) {
        score += 8;
      }

      // Only include candidates that match at least one meaningful attribute
      if (score <= 0) continue;

      scored.push({
        card: {
          id: proj.id,
          type: 'PROJECT',
          name: bp.name,
          slug: bp.slug,
          developer: bp.developer,
          location: bp.location,
          propertyTypes: bp.propertyTypes,
          bhkSummary: bp.bhkSummary,
          startingPrice: bp.startingPrice,
          reraVerified: bp.reraVerified,
          featuredImageUrl: bp.featuredImageUrl,
          status: proj.status,
          recommendationReason: reasons[0] || undefined,
          distanceKm,
          formattedDistance: distanceKm !== null ? formatDistanceKm(distanceKm) : null,
        },
        score,
        isOtherDeveloper,
        priceDelta,
      });
    }

    scored.sort((a, b) => {
      // Prefer cross-developer projects first
      if (a.isOtherDeveloper !== b.isOtherDeveloper) {
        return a.isOtherDeveloper ? -1 : 1;
      }
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.card.reraVerified !== b.card.reraVerified) {
        return a.card.reraVerified ? -1 : 1;
      }
      if (a.priceDelta !== b.priceDelta) {
        return a.priceDelta - b.priceDelta;
      }
      return a.card.name.localeCompare(b.card.name);
    });

    return scored.slice(0, limit).map(s => s.card);
  }

  /**
   * Batch 2 Part G / Phase 3.3: Nearby Resale & Rental Property Discovery
   * Finds eligible published resale and rental listings near the current project's
   * resolved coordinates, strictly excluding any listings belonging to the current project
   * or already displayed in the current project's resale/rental sections.
   *
   * Relevance ranking priority:
   * 1. Geographic proximity (same locality + geodesic distance)
   * 2. Matching BHK/configuration
   * 3. Budget or rental range compatibility
   * 4. Area compatibility
   * 5. Furnishing and property type
   * 6. Verification status
   */
  async getNearbyListingsForProject(
    currentProject: PublicProjectDto,
    options?: {
      excludeResaleIds?: string[];
      excludeRentalIds?: string[];
      maxDistanceKm?: number;
      limit?: number;
      preloadedMaps?: Awaited<ReturnType<PropertyDiscoveryService['getReferenceMaps']>>;
    }
  ): Promise<{
    nearbyResale: ResaleDiscoveryCardDto[];
    nearbyRental: RentDiscoveryCardDto[];
  }> {
    if (!currentProject || !currentProject.id) {
      return { nearbyResale: [], nearbyRental: [] };
    }

    const currentCoords = resolveProjectCoordinates(currentProject, currentProject.location);
    if (
      !currentCoords.canComputeExactProjectDistance ||
      currentCoords.latitude === null ||
      currentCoords.longitude === null
    ) {
      return { nearbyResale: [], nearbyRental: [] };
    }

    const origin = {
      latitude: currentCoords.latitude,
      longitude: currentCoords.longitude,
    };
    const maxDistanceKm = options?.maxDistanceKm ?? 15;
    const limit = options?.limit ?? 6;

    const [maps, publishedResale, publishedRental] = await Promise.all([
      options?.preloadedMaps ? Promise.resolve(options.preloadedMaps) : this.getReferenceMaps(),
      resaleListingService.listAdminListings({ lifecycleStatus: 'PUBLISHED' }),
      rentalListingService.getAllListingsAdmin({ lifecycleStatus: 'PUBLISHED' }),
    ]);

    const resolveListingCoords = (listing: {
      latitude?: number | null;
      longitude?: number | null;
      projectId?: string | null;
      locationId?: string | null;
    }): { latitude: number; longitude: number } | null => {
      const listLat =
        listing.latitude !== undefined && listing.latitude !== null ? Number(listing.latitude) : null;
      const listLng =
        listing.longitude !== undefined && listing.longitude !== null ? Number(listing.longitude) : null;
      if (isValidCoordinate(listLat, listLng) && listLat !== null && listLng !== null) {
        return { latitude: listLat, longitude: listLng };
      }

      if (listing.projectId) {
        const proj = maps.projectMap.get(listing.projectId);
        if (proj) {
          const projLoc = proj.locationId ? maps.locMap.get(proj.locationId) : null;
          const resolvedProj = resolveProjectCoordinates(proj, projLoc);
          if (
            resolvedProj.canComputeExactProjectDistance &&
            resolvedProj.latitude !== null &&
            resolvedProj.longitude !== null
          ) {
            return { latitude: resolvedProj.latitude, longitude: resolvedProj.longitude };
          }
        }
      }

      return null;
    };

    const currentBhks = new Set(
      (currentProject.configurations || [])
        .map(c => c.bedroomCount)
        .filter((b): b is number => typeof b === 'number' && b > 0)
    );
    const currentCarpetAreas = (currentProject.configurations || [])
      .map(c => c.carpetArea)
      .filter((a): a is number => typeof a === 'number' && Number.isFinite(a) && a > 0);
    const projBasePrice = currentProject.pricing?.startingPrice || currentProject.startingPrice || 0;

    const isAreaCompatible = (area?: number | null): boolean => {
      if (typeof area !== 'number' || !Number.isFinite(area) || area <= 0) return false;
      if (currentCarpetAreas.length === 0) return false;
      return currentCarpetAreas.some(ca => Math.abs(area - ca) / ca <= 0.25);
    };

    const excludedResaleIds = new Set<string>(options?.excludeResaleIds || []);
    const nearbyResale: ResaleDiscoveryCardDto[] = [];

    for (const r of publishedResale) {
      if (!r || !r.id || excludedResaleIds.has(r.id) || isKnownTestResaleListing(r)) continue;
      if (r.lifecycleStatus !== 'PUBLISHED') continue;
      // Never include listings belonging to the current project in Nearby
      if (r.projectId && r.projectId === currentProject.id) continue;
      if (!r.configuration || typeof r.askingPrice !== 'number' || r.askingPrice <= 0) continue;

      let bp: BoundedProject | null = null;
      let cardLocation: BoundedLocation | null = null;

      if (r.projectId) {
        const proj = maps.projectMap.get(r.projectId);
        if (!proj || !this.isProjectPublishedEligible(proj)) continue;
        bp = this.assembleBoundedProject(proj, maps);
        cardLocation = bp ? bp.location : null;
      } else if (r.locationId) {
        const loc = maps.locMap.get(r.locationId);
        cardLocation = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
      }

      const coords = resolveListingCoords(r);
      if (!coords) continue;

      const rawDistanceKm = calculateGeodesicDistanceKm(origin, coords);
      if (!Number.isFinite(rawDistanceKm) || rawDistanceKm === null || rawDistanceKm > maxDistanceKm) continue;
      // Prevent distinct project listings from displaying 0.0 km distance if they share identical coordinates
      const distanceKm = rawDistanceKm > 0 ? rawDistanceKm : undefined;

      excludedResaleIds.add(r.id);
      nearbyResale.push({
        id: r.id,
        slug: r.slug,
        type: 'RESALE',
        project: bp,
        propertyType: r.propertyType as PropertyType,
        configuration: r.configuration,
        bedroomCount: r.bedroomCount,
        carpetArea: r.carpetArea ?? r.builtUpArea ?? null,
        askingPrice: r.askingPrice,
        furnishing: r.furnishing,
        floorCategory: r.floorCategory,
        listingPartyLabel: r.listingParty.label,
        verificationStatus: r.verificationStatus,
        location: cardLocation,
        featuredImageUrl: r.media.find(m => m.isFeatured)?.url || r.media[0]?.url || null,
        distanceKm,
        formattedDistance: distanceKm !== undefined ? formatDistanceKm(distanceKm) : undefined,
      });
    }

    // Phase 3.3 Resale relevance priority:
    // 1. Geographic proximity, 2. Matching BHK, 3. Budget range, 4. Area compatibility, 5. Furnishing & property type, 6. Verification
    const computeResaleRelevanceScore = (item: ResaleDiscoveryCardDto): number => {
      let score = 0;
      // 1. Geographic proximity
      if (item.location?.id && currentProject.location?.id && item.location.id === currentProject.location.id) {
        score += 40;
      }
      const dist = item.distanceKm ?? 999;
      if (dist <= 2.5) score += 35;
      else if (dist <= 6.0) score += 25;
      else if (dist <= 10.0) score += 15;
      else if (dist <= 15.0) score += 8;

      // 2. Matching BHK/configuration
      if (currentBhks.has(item.bedroomCount)) score += 25;

      // 3. Budget range compatibility
      if (projBasePrice > 0 && item.askingPrice > 0) {
        const ratio = Math.abs(item.askingPrice - projBasePrice) / projBasePrice;
        if (ratio <= 0.35) score += 18;
        else if (ratio <= 0.6) score += 10;
      }

      // 4. Area compatibility
      if (isAreaCompatible(item.carpetArea)) score += 14;

      // 5. Furnishing & property type
      if (item.propertyType && item.propertyType === currentProject.propertyType) score += 10;
      if (item.furnishing === 'FULLY_FURNISHED' || item.furnishing === 'SEMI_FURNISHED') score += 5;

      // 6. Verification status & photography
      if (item.verificationStatus === 'VERIFIED') score += 12;
      if (item.featuredImageUrl) score += 4;

      return score;
    };

    nearbyResale.sort((a, b) => {
      const scoreDiff = computeResaleRelevanceScore(b) - computeResaleRelevanceScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const distDiff = (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      if (Math.abs(distDiff) > 0.05) return distDiff;
      return a.askingPrice - b.askingPrice;
    });

    const excludedRentalIds = new Set<string>(options?.excludeRentalIds || []);
    const nearbyRental: RentDiscoveryCardDto[] = [];

    for (const r of publishedRental) {
      if (!r || !r.id || excludedRentalIds.has(r.id) || isKnownTestRentalListing(r)) continue;
      if (r.lifecycleStatus !== 'PUBLISHED') continue;
      // Never include listings belonging to the current project in Nearby
      if (r.projectId && r.projectId === currentProject.id) continue;
      if (!r.configuration || typeof r.monthlyRent !== 'number' || r.monthlyRent <= 0) continue;

      let bp: BoundedProject | null = null;
      let cardLocation: BoundedLocation | null = null;

      if (r.projectId) {
        const proj = maps.projectMap.get(r.projectId);
        if (!proj || !this.isProjectPublishedEligible(proj)) continue;
        bp = this.assembleBoundedProject(proj, maps);
        cardLocation = bp ? bp.location : null;
      } else if (r.locationId) {
        const loc = maps.locMap.get(r.locationId);
        cardLocation = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
      }

      const coords = resolveListingCoords(r);
      if (!coords) continue;

      const rawDistanceKm = calculateGeodesicDistanceKm(origin, coords);
      if (!Number.isFinite(rawDistanceKm) || rawDistanceKm === null || rawDistanceKm > maxDistanceKm) continue;
      // Prevent distinct project listings from displaying 0.0 km distance if they share identical coordinates
      const distanceKm = rawDistanceKm > 0 ? rawDistanceKm : undefined;

      excludedRentalIds.add(r.id);
      nearbyRental.push({
        id: r.id,
        slug: r.slug,
        type: 'RENT',
        project: bp,
        propertyType: r.propertyType as PropertyType,
        configuration: r.configuration,
        bedroomCount: r.bedroomCount,
        carpetArea: r.carpetArea ?? r.builtUpArea ?? null,
        monthlyRent: r.monthlyRent,
        maintenance: r.maintenance,
        securityDeposit: r.securityDeposit,
        furnishing: r.furnishing,
        floorCategory: r.floorCategory,
        listingPartyLabel: r.listingParty.label,
        verificationStatus: r.verificationStatus,
        location: cardLocation,
        featuredImageUrl: r.media.find(m => m.isFeatured)?.url || r.media[0]?.url || null,
        distanceKm,
        formattedDistance: distanceKm !== undefined ? formatDistanceKm(distanceKm) : undefined,
      });
    }

    // Estimate target monthly rent benchmark (~0.25% of project starting price per month when available)
    const targetMonthlyRent = projBasePrice > 0 ? Math.round((projBasePrice * 0.03) / 12) : 0;

    // Phase 3.3 Rental relevance priority:
    // 1. Geographic proximity, 2. Matching BHK, 3. Rental range, 4. Area compatibility, 5. Furnishing & property type, 6. Verification
    const computeRentalRelevanceScore = (item: RentDiscoveryCardDto): number => {
      let score = 0;
      // 1. Geographic proximity
      if (item.location?.id && currentProject.location?.id && item.location.id === currentProject.location.id) {
        score += 40;
      }
      const dist = item.distanceKm ?? 999;
      if (dist <= 2.5) score += 35;
      else if (dist <= 6.0) score += 25;
      else if (dist <= 10.0) score += 15;
      else if (dist <= 15.0) score += 8;

      // 2. Matching BHK/configuration
      if (currentBhks.has(item.bedroomCount)) score += 25;

      // 3. Rental range compatibility
      if (targetMonthlyRent > 0 && item.monthlyRent > 0) {
        const ratio = Math.abs(item.monthlyRent - targetMonthlyRent) / targetMonthlyRent;
        if (ratio <= 0.4) score += 16;
        else if (ratio <= 0.7) score += 8;
      }

      // 4. Area compatibility
      if (isAreaCompatible(item.carpetArea)) score += 14;

      // 5. Furnishing & property type
      if (item.propertyType && item.propertyType === currentProject.propertyType) score += 10;
      if (item.furnishing === 'FULLY_FURNISHED' || item.furnishing === 'SEMI_FURNISHED') score += 6;

      // 6. Verification status & photography
      if (item.verificationStatus === 'VERIFIED') score += 12;
      if (item.featuredImageUrl) score += 4;

      return score;
    };

    nearbyRental.sort((a, b) => {
      const scoreDiff = computeRentalRelevanceScore(b) - computeRentalRelevanceScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      const distDiff = (a.distanceKm ?? 999) - (b.distanceKm ?? 999);
      if (Math.abs(distDiff) > 0.05) return distDiff;
      return a.monthlyRent - b.monthlyRent;
    });

    return {
      nearbyResale: nearbyResale.slice(0, limit),
      nearbyRental: nearbyRental.slice(0, limit),
    };
  }

  /**
   * Unified single-pass discovery bundle for the Project Detail Page.
   * Reuses a single reference map snapshot to prevent N+1 queries across:
   * - More Projects by This Developer
   * - Projects You May Also Like
   * - Nearby Resale Properties
   * - Nearby Rental Properties
   */
  async getProjectDetailDiscoveryBundle(
    currentProject: PublicProjectDto,
    options?: {
      excludeResaleIds?: string[];
      excludeRentalIds?: string[];
      maxDistanceKm?: number;
      limit?: number;
    }
  ): Promise<{
    developerProjects: ProjectDiscoveryCardDto[];
    relatedProjects: ProjectDiscoveryCardDto[];
    nearbyResale: ResaleDiscoveryCardDto[];
    nearbyRental: RentDiscoveryCardDto[];
  }> {
    const maps = await this.getReferenceMaps();

    const developerProjects = await this.getDeveloperOtherProjects(
      currentProject.developer?.id,
      currentProject.id,
      currentProject.slug,
      12,
      maps
    );

    const developerProjectIds = developerProjects.map(p => p.id);
    const developerProjectSlugs = developerProjects.map(p => p.slug);

    const [relatedProjects, nearby] = await Promise.all([
      this.getRelatedProjectsForProject(currentProject, {
        excludeProjectIds: developerProjectIds,
        excludeProjectSlugs: developerProjectSlugs,
        limit: options?.limit ?? 8,
        preloadedMaps: maps,
      }),
      this.getNearbyListingsForProject(currentProject, {
        excludeResaleIds: options?.excludeResaleIds,
        excludeRentalIds: options?.excludeRentalIds,
        maxDistanceKm: options?.maxDistanceKm ?? 15,
        limit: options?.limit ?? 6,
        preloadedMaps: maps,
      }),
    ]);

    return {
      developerProjects,
      relatedProjects,
      nearbyResale: nearby.nearbyResale,
      nearbyRental: nearby.nearbyRental,
    };
  }

  async getBatch2DiscoveryForProject(
    currentProject: PublicProjectDto,
    options?: {
      excludeResaleIds?: string[];
      excludeRentalIds?: string[];
      maxDistanceKm?: number;
      limit?: number;
    }
  ) {
    return this.getProjectDetailDiscoveryBundle(currentProject, options);
  }

  /**
   * Unified Discovery Bundle for Individual Resale & Rental Detail Pages (/buy/[slug] & /rent/[slug])
   *
   * Returns:
   * - similarResale (when mode === 'RESALE')
   * - similarRental (when mode === 'RENTAL')
   * - relatedProjects (other PUBLISHED projects in the same locality / corridor)
   * - locationInfo (verified public locality metadata)
   */
  async getListingDetailDiscoveryBundle(params: {
    mode: 'RESALE' | 'RENTAL';
    listingId: string;
    listingSlug?: string | null;
    projectId?: string | null;
    locationId?: string | null;
    bedroomCount: number;
    propertyType: string;
    priceOrRent: number;
    limit?: number;
  }): Promise<{
    similarResale: ResaleDiscoveryCardDto[];
    similarRental: RentDiscoveryCardDto[];
    relatedProjects: ProjectDiscoveryCardDto[];
    locationInfo: {
      id: string;
      name: string;
      slug: string;
      shortDescription: string | null;
      description: string | null;
    } | null;
  }> {
    const limit = params.limit ?? 6;
    const maps = await this.getReferenceMaps();

    // Resolve effective location ID from standalone locationId or parent project locationId
    let effectiveLocationId = params.locationId || null;
    if (!effectiveLocationId && params.projectId) {
      const parentProj = maps.projectMap.get(params.projectId);
      if (parentProj?.locationId) {
        effectiveLocationId = parentProj.locationId;
      }
    }

    const locEntity = effectiveLocationId ? maps.locMap.get(effectiveLocationId) : null;
    const locationInfo = locEntity
      ? {
          id: locEntity.id,
          name: locEntity.name,
          slug: locEntity.slug,
          shortDescription: locEntity.shortDescription ?? null,
          description: locEntity.description ?? null,
        }
      : null;

    const currentAncestry = this.getLocationAncestryIds(effectiveLocationId, maps.locMap);
    const currentSubCityAncestors = new Set(
      currentAncestry.filter(id => {
        const node = maps.locMap.get(id);
        return node && node.type !== 'STATE' && node.type !== 'CITY' && node.type !== 'DISTRICT';
      })
    );

    const similarResale: ResaleDiscoveryCardDto[] = [];
    const similarRental: RentDiscoveryCardDto[] = [];

    if (params.mode === 'RESALE') {
      const publishedResale = await resaleListingService.listAdminListings({
        lifecycleStatus: 'PUBLISHED',
      });

      const scoredResale: { card: ResaleDiscoveryCardDto; score: number; priceDelta: number }[] = [];

      for (const r of publishedResale) {
        if (!r || !r.id || isKnownTestResaleListing(r)) continue;
        if (r.id === params.listingId) continue;
        if (params.listingSlug && r.slug && r.slug === params.listingSlug) continue;
        if (r.lifecycleStatus !== 'PUBLISHED') continue;
        if (!r.configuration || typeof r.askingPrice !== 'number' || r.askingPrice <= 0) continue;

        let bp: BoundedProject | null = null;
        let cardLocation: BoundedLocation | null = null;

        if (r.projectId) {
          const proj = maps.projectMap.get(r.projectId);
          if (!proj || !this.isProjectPublishedEligible(proj)) continue;
          bp = this.assembleBoundedProject(proj, maps);
          cardLocation = bp ? bp.location : null;
        } else if (r.locationId) {
          const loc = maps.locMap.get(r.locationId);
          cardLocation = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
        }

        let score = 0;
        // 1. Same Project
        if (params.projectId && r.projectId && r.projectId === params.projectId) {
          score += 65;
        }
        // 2. Same Locality / Corridor
        const candidateLocId = cardLocation?.id || r.locationId || null;
        if (effectiveLocationId && candidateLocId) {
          if (candidateLocId === effectiveLocationId) {
            score += 45;
          } else {
            const candAncestry = this.getLocationAncestryIds(candidateLocId, maps.locMap);
            if (candAncestry.some(id => currentSubCityAncestors.has(id))) {
              score += 22;
            }
          }
        }
        // 3. Matching BHK & Property Type
        if (r.bedroomCount === params.bedroomCount) {
          score += 28;
        } else if (Math.abs(r.bedroomCount - params.bedroomCount) === 1) {
          score += 10;
        }
        if (r.propertyType === params.propertyType) {
          score += 10;
        }
        // 4. Similar Price Band
        const priceDelta =
          params.priceOrRent > 0
            ? Math.abs(r.askingPrice - params.priceOrRent) / params.priceOrRent
            : 1;
        if (priceDelta <= 0.25) score += 20;
        else if (priceDelta <= 0.5) score += 10;

        // 5. Verification & Media
        if (r.verificationStatus === 'VERIFIED') score += 12;
        const featuredImg = normalizeMediaPublicUrl(
          r.media.find(m => m.isFeatured)?.url || r.media[0]?.url || null
        );
        if (featuredImg) score += 5;

        scoredResale.push({
          card: {
            id: r.id,
            slug: r.slug,
            type: 'RESALE',
            project: bp,
            propertyType: r.propertyType as PropertyType,
            configuration: r.configuration,
            bedroomCount: r.bedroomCount,
            carpetArea: r.carpetArea ?? r.builtUpArea ?? null,
            askingPrice: r.askingPrice,
            furnishing: r.furnishing,
            floorCategory: r.floorCategory,
            listingPartyLabel: r.listingParty.label,
            verificationStatus: r.verificationStatus,
            location: cardLocation,
            featuredImageUrl: featuredImg,
          },
          score,
          priceDelta,
        });
      }

      scoredResale.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.priceDelta !== b.priceDelta) return a.priceDelta - b.priceDelta;
        return a.card.askingPrice - b.card.askingPrice;
      });

      similarResale.push(...scoredResale.slice(0, limit).map(s => s.card));
    } else {
      const publishedRental = await rentalListingService.getAllListingsAdmin({
        lifecycleStatus: 'PUBLISHED',
      });

      const scoredRental: { card: RentDiscoveryCardDto; score: number; rentDelta: number }[] = [];

      for (const r of publishedRental) {
        if (!r || !r.id || isKnownTestRentalListing(r)) continue;
        if (r.id === params.listingId) continue;
        if (params.listingSlug && r.slug && r.slug === params.listingSlug) continue;
        if (r.lifecycleStatus !== 'PUBLISHED') continue;
        if (!r.configuration || typeof r.monthlyRent !== 'number' || r.monthlyRent <= 0) continue;

        let bp: BoundedProject | null = null;
        let cardLocation: BoundedLocation | null = null;

        if (r.projectId) {
          const proj = maps.projectMap.get(r.projectId);
          if (!proj || !this.isProjectPublishedEligible(proj)) continue;
          bp = this.assembleBoundedProject(proj, maps);
          cardLocation = bp ? bp.location : null;
        } else if (r.locationId) {
          const loc = maps.locMap.get(r.locationId);
          cardLocation = loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null;
        }

        let score = 0;
        // 1. Same Project
        if (params.projectId && r.projectId && r.projectId === params.projectId) {
          score += 65;
        }
        // 2. Same Locality / Corridor
        const candidateLocId = cardLocation?.id || r.locationId || null;
        if (effectiveLocationId && candidateLocId) {
          if (candidateLocId === effectiveLocationId) {
            score += 45;
          } else {
            const candAncestry = this.getLocationAncestryIds(candidateLocId, maps.locMap);
            if (candAncestry.some(id => currentSubCityAncestors.has(id))) {
              score += 22;
            }
          }
        }
        // 3. Matching BHK & Property Type
        if (r.bedroomCount === params.bedroomCount) {
          score += 28;
        } else if (Math.abs(r.bedroomCount - params.bedroomCount) === 1) {
          score += 10;
        }
        if (r.propertyType === params.propertyType) {
          score += 10;
        }
        // 4. Similar Rent Band
        const rentDelta =
          params.priceOrRent > 0
            ? Math.abs(r.monthlyRent - params.priceOrRent) / params.priceOrRent
            : 1;
        if (rentDelta <= 0.25) score += 20;
        else if (rentDelta <= 0.5) score += 10;

        // 5. Verification & Media
        if (r.verificationStatus === 'VERIFIED') score += 12;
        const featuredImg = normalizeMediaPublicUrl(
          r.media.find(m => m.isFeatured)?.url || r.media[0]?.url || null
        );
        if (featuredImg) score += 5;

        scoredRental.push({
          card: {
            id: r.id,
            slug: r.slug,
            type: 'RENT',
            project: bp,
            propertyType: r.propertyType as PropertyType,
            configuration: r.configuration,
            bedroomCount: r.bedroomCount,
            carpetArea: r.carpetArea ?? r.builtUpArea ?? null,
            monthlyRent: r.monthlyRent,
            maintenance: r.maintenance,
            securityDeposit: r.securityDeposit,
            furnishing: r.furnishing,
            floorCategory: r.floorCategory,
            listingPartyLabel: r.listingParty.label,
            verificationStatus: r.verificationStatus,
            location: cardLocation,
            featuredImageUrl: featuredImg,
          },
          score,
          rentDelta,
        });
      }

      scoredRental.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.rentDelta !== b.rentDelta) return a.rentDelta - b.rentDelta;
        return a.card.monthlyRent - b.card.monthlyRent;
      });

      similarRental.push(...scoredRental.slice(0, limit).map(s => s.card));
    }

    // Other Projects in This Location
    const scoredProjects: { card: ProjectDiscoveryCardDto; score: number }[] = [];
    for (const proj of maps.projectsList) {
      if (!this.isProjectPublishedEligible(proj)) continue;
      if (params.projectId && proj.id === params.projectId) continue;

      const bp = this.assembleBoundedProject(proj, maps);
      if (!bp) continue;

      let score = 0;
      if (effectiveLocationId && proj.locationId) {
        if (proj.locationId === effectiveLocationId) {
          score += 50;
        } else {
          const projAncestry = this.getLocationAncestryIds(proj.locationId, maps.locMap);
          if (projAncestry.some(id => currentSubCityAncestors.has(id))) {
            score += 25;
          }
        }
      }
      if (bp.reraVerified) score += 10;
      if (bp.featuredImageUrl) score += 5;

      const projConfigs = maps.configsByProject.get(proj.id) || [];
      if (projConfigs.some(c => c.bedroomCount === params.bedroomCount)) {
        score += 15;
      }

      scoredProjects.push({
        card: {
          id: bp.id,
          type: 'PROJECT',
          name: bp.name,
          slug: bp.slug,
          developer: bp.developer,
          location: bp.location,
          startingPrice: bp.startingPrice,
          propertyTypes: bp.propertyTypes,
          bhkSummary: bp.bhkSummary,
          reraVerified: bp.reraVerified,
          featuredImageUrl: bp.featuredImageUrl,
          status: proj.status,
        },
        score,
      });
    }

    scoredProjects.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.card.name.localeCompare(b.card.name);
    });

    return {
      similarResale,
      similarRental,
      relatedProjects: scoredProjects.slice(0, limit).map(s => s.card),
      locationInfo,
    };
  }

  private paginate<T>(items: T[], page: number, pageSize: number): DiscoveryResponse<T> {
    const total = items.length;
    const totalPages = Math.ceil(total / pageSize);
    const p = Math.max(1, Math.min(page, totalPages || 1));
    const start = (p - 1) * pageSize;
    const data = items.slice(start, start + pageSize);

    return {
      data,
      pagination: {
        page: p,
        pageSize,
        total,
        totalCount: total,
        totalPages
      }
    };
  }
}

export const propertyDiscoveryService = new PropertyDiscoveryService();
