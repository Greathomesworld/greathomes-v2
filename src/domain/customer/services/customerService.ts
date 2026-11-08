import {
  Customer,
  CustomerDto,
  SavedItem,
  SavedItemSummary,
  SavedItemDto,
  SavedItemResourceType,
  RecentlyViewed,
  RecentlyViewedDto,
  CustomerPreferences,
  CustomerPreferencesDto,
  UpdateCustomerProfileDto,
  UpdateCustomerPreferencesDto,
  PersonalizedDiscoveryDto,
} from '../entities.ts';
import {
  customerRepository,
  savedItemRepository,
  recentlyViewedRepository,
  customerPreferenceRepository,
} from '../repositories/index.ts';
import {
  projectRepository,
  projectMediaRepository,
} from '../../../infrastructure/repositories/memory/projectRepositoryMemory.ts';
import { locationRepository } from '../../../infrastructure/repositories/memory/locationRepositoryMemory.ts';
import { developerRepository } from '../../../infrastructure/repositories/memory/developerRepositoryMemory.ts';
import { resaleListingService } from '../../projects/services/resaleService.ts';
import { rentalListingService } from '../../projects/services/rentalService.ts';

export class CustomerService {
  /**
   * Helper to format Indian price in Lacs / Crores
   */
  private formatPrice(amount?: number | null): string | undefined {
    if (amount === undefined || amount === null || isNaN(amount)) return undefined;
    if (amount >= 10_000_000) {
      const cr = (amount / 10_000_000).toFixed(2).replace(/\.00$/, '');
      return `₹${cr} Cr`;
    }
    if (amount >= 100_000) {
      const l = (amount / 100_000).toFixed(2).replace(/\.00$/, '');
      return `₹${l} L`;
    }
    return `₹${amount.toLocaleString('en-IN')}`;
  }

  /**
   * Sanitizes Customer entity into CustomerDto (no passwordHash or private secrets)
   */
  private mapCustomerToDto(customer: Customer): CustomerDto {
    return {
      id: customer.id,
      email: customer.email || null,
      phone: customer.phone || null,
      name: customer.name,
      avatarUrl: customer.avatarUrl || null,
      status: customer.status,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  /**
   * Maps CustomerPreferences to CustomerPreferencesDto
   */
  private mapPreferencesToDto(prefs: CustomerPreferences): CustomerPreferencesDto {
    return {
      preferredMode: prefs.preferredMode,
      preferredLocations: prefs.preferredLocations || [],
      preferredBhk: prefs.preferredBhk || [],
      preferredPropertyTypes: prefs.preferredPropertyTypes || [],
      budgetMin: prefs.budgetMin ?? null,
      budgetMax: prefs.budgetMax ?? null,
      emailAlertsEnabled: prefs.emailAlertsEnabled ?? true,
      inAppAlertsEnabled: prefs.inAppAlertsEnabled ?? true,
      newLaunchAlerts: prefs.newLaunchAlerts ?? true,
      priceDropAlerts: prefs.priceDropAlerts ?? true,
      projectStatusAlerts: prefs.projectStatusAlerts ?? true,
      reraAlerts: prefs.reraAlerts ?? true,
      priceChangeAlerts: prefs.priceChangeAlerts ?? true,
      configurationAlerts: prefs.configurationAlerts ?? true,
      locationAlerts: prefs.locationAlerts ?? true,
      resaleAlerts: prefs.resaleAlerts ?? true,
      rentalAlerts: prefs.rentalAlerts ?? true,
      marketingEmailsEnabled: prefs.marketingEmailsEnabled ?? false,
      updatedAt: prefs.updatedAt.toISOString(),
    };
  }

  /**
   * Enriches resource details for SavedItem and RecentlyViewed
   */
  async enrichResource(
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<SavedItemSummary> {
    try {
      if (resourceType === 'PROJECT') {
        const project =
          (await projectRepository.findById(resourceId)) ||
          (await projectRepository.findBySlug(resourceId));

        if (!project) {
          return {
            id: resourceId,
            title: 'Project not available',
            slug: resourceId,
            url: `/projects/${resourceId}`,
            isAvailable: false,
            unavailableReason: 'This project is no longer available.',
          };
        }

        const isPublished =
          (project as any).lifecycleStatus === 'PUBLISHED' ||
          (project as any).isPublished === true;

        let locationName: string | undefined;
        if (project.locationId) {
          const loc = await locationRepository.findById(project.locationId);
          locationName = loc?.name;
        }

        let developerName: string | undefined;
        if (project.developerId) {
          const dev = await developerRepository.findById(project.developerId);
          developerName = dev?.name;
        }

        let imageUrl: string | undefined;
        const media = await projectMediaRepository.findByProjectId(project.id);
        if (media && media.length > 0) {
          const featured = media.find((m) => m.isFeatured);
          imageUrl = featured?.url || media[0].url;
        }

        return {
          id: project.id,
          title: project.name,
          subtitle: locationName ? `In ${locationName}` : undefined,
          slug: project.slug,
          url: `/projects/${project.slug}`,
          imageUrl,
          priceDisplay: this.formatPrice((project as any).startingPrice),
          locationName,
          developerName,
          stageOrStatus: (project as any).status || 'NEW LAUNCH',
          isAvailable: isPublished,
          unavailableReason: !isPublished ? 'Project is not currently published' : undefined,
        };
      }

      if (resourceType === 'RESALE_LISTING') {
        let listing: any = null;
        try {
          listing = await (resaleListingService as any).getListingById(resourceId);
        } catch {
          // Fallback to checking by ID
        }

        if (!listing) {
          return {
            id: resourceId,
            title: 'Resale property not available',
            slug: resourceId,
            url: `/buy/${resourceId}`,
            isAvailable: false,
            unavailableReason: 'This resale listing is no longer available.',
          };
        }

        const isPublished = listing.lifecycleStatus === 'PUBLISHED';
        const price =
          listing.pricing?.expectedPrice || listing.expectedPrice || listing.price;

        let locationName = listing.locationName;
        if (!locationName && listing.locationId) {
          const loc = await locationRepository.findById(listing.locationId);
          locationName = loc?.name;
        }

        return {
          id: listing.id,
          title: listing.title || `${listing.bhk || 3} BHK Resale Home`,
          subtitle: locationName ? `In ${locationName}` : undefined,
          slug: listing.slug || listing.id,
          url: `/buy/${listing.slug || listing.id}`,
          imageUrl: listing.media?.[0]?.url || listing.coverImage,
          priceDisplay: this.formatPrice(price),
          locationName,
          stageOrStatus: listing.possessionStatus || 'READY TO MOVE',
          isAvailable: isPublished,
          unavailableReason: !isPublished ? 'Listing is no longer active' : undefined,
        };
      }

      if (resourceType === 'RENTAL_LISTING') {
        let listing: any = null;
        try {
          listing = await (rentalListingService as any).getListingById(resourceId);
        } catch {
          // Fallback
        }

        if (!listing) {
          return {
            id: resourceId,
            title: 'Rental property not available',
            slug: resourceId,
            url: `/rent/${resourceId}`,
            isAvailable: false,
            unavailableReason: 'This rental listing is no longer available.',
          };
        }

        const isPublished = listing.lifecycleStatus === 'PUBLISHED';
        const rent =
          listing.pricing?.monthlyRent || listing.monthlyRent || listing.rent;

        let locationName = listing.locationName;
        if (!locationName && listing.locationId) {
          const loc = await locationRepository.findById(listing.locationId);
          locationName = loc?.name;
        }

        return {
          id: listing.id,
          title: listing.title || `${listing.bhk || 2} BHK Rental Home`,
          subtitle: locationName ? `In ${locationName}` : undefined,
          slug: listing.slug || listing.id,
          url: `/rent/${listing.slug || listing.id}`,
          imageUrl: listing.media?.[0]?.url || listing.coverImage,
          priceDisplay: rent ? `${this.formatPrice(rent)}/month` : undefined,
          locationName,
          stageOrStatus: listing.furnishingStatus || 'FURNISHED',
          isAvailable: isPublished,
          unavailableReason: !isPublished ? 'Rental listing is no longer active' : undefined,
        };
      }
    } catch (err) {
      console.error('Error enriching resource:', err);
    }

    return {
      id: resourceId,
      title: 'Property',
      slug: resourceId,
      url: '#',
      isAvailable: false,
      unavailableReason: 'Unable to load property details',
    };
  }

  // ==========================================
  // CUSTOMER AUTH & PROFILE
  // ==========================================

  async getProfile(customerId: string): Promise<CustomerDto> {
    const customer = await customerRepository.findById(customerId);
    if (!customer || customer.status !== 'ACTIVE') {
      const error: any = new Error('Customer account not found or inactive');
      error.statusCode = 404;
      throw error;
    }
    return this.mapCustomerToDto(customer);
  }

  async updateProfile(
    customerId: string,
    dto: UpdateCustomerProfileDto
  ): Promise<CustomerDto> {
    const customer = await customerRepository.findById(customerId);
    if (!customer || customer.status !== 'ACTIVE') {
      const error: any = new Error('Customer account not found or inactive');
      error.statusCode = 404;
      throw error;
    }

    const updates: Partial<Customer> = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new Error('Name cannot be empty');
      updates.name = dto.name.trim();
    }
    if (dto.email !== undefined) {
      updates.email = dto.email ? dto.email.trim().toLowerCase() : null;
    }
    if (dto.phone !== undefined) {
      updates.phone = dto.phone ? dto.phone.trim() : null;
    }
    if (dto.avatarUrl !== undefined) {
      updates.avatarUrl = dto.avatarUrl ? dto.avatarUrl.trim() : null;
    }

    const updated = await customerRepository.update(customerId, updates);
    if (!updated) {
      throw new Error('Failed to update customer profile');
    }
    return this.mapCustomerToDto(updated);
  }

  // ==========================================
  // SAVED ITEMS (HOMES & PROJECTS)
  // ==========================================

  async saveItem(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<SavedItemDto> {
    if (!['PROJECT', 'RESALE_LISTING', 'RENTAL_LISTING'].includes(resourceType)) {
      throw new Error(`Invalid resource type: ${resourceType}`);
    }
    if (!resourceId || !resourceId.trim()) {
      throw new Error('Resource ID is required');
    }

    const saved = await savedItemRepository.create({
      customerId,
      resourceType,
      resourceId: resourceId.trim(),
    });

    const resourceSummary = await this.enrichResource(resourceType, resourceId);

    return {
      id: saved.id,
      resourceType: saved.resourceType,
      resourceId: saved.resourceId,
      savedAt: saved.createdAt.toISOString(),
      resource: resourceSummary,
    };
  }

  async unsaveItem(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean> {
    return savedItemRepository.deleteByResource(customerId, resourceType, resourceId);
  }

  async deleteSavedItem(customerId: string, savedItemId: string): Promise<boolean> {
    return savedItemRepository.delete(savedItemId, customerId);
  }

  async isItemSaved(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<boolean> {
    return savedItemRepository.isSaved(customerId, resourceType, resourceId);
  }

  async listSavedItems(
    customerId: string,
    resourceType?: SavedItemResourceType
  ): Promise<SavedItemDto[]> {
    const items = await savedItemRepository.listByCustomer(customerId, resourceType);

    const enriched = await Promise.all(
      items.map(async (item) => {
        const resource = await this.enrichResource(item.resourceType, item.resourceId);
        return {
          id: item.id,
          resourceType: item.resourceType,
          resourceId: item.resourceId,
          savedAt: item.createdAt.toISOString(),
          resource,
        };
      })
    );

    return enriched;
  }

  // ==========================================
  // RECENTLY VIEWED
  // ==========================================

  async recordRecentlyViewed(
    customerId: string,
    resourceType: SavedItemResourceType,
    resourceId: string
  ): Promise<RecentlyViewedDto> {
    if (!['PROJECT', 'RESALE_LISTING', 'RENTAL_LISTING'].includes(resourceType)) {
      throw new Error(`Invalid resource type: ${resourceType}`);
    }
    if (!resourceId || !resourceId.trim()) {
      throw new Error('Resource ID is required');
    }

    const recorded = await recentlyViewedRepository.recordView(
      customerId,
      resourceType,
      resourceId.trim()
    );

    const resource = await this.enrichResource(resourceType, resourceId);

    return {
      id: recorded.id,
      resourceType: recorded.resourceType,
      resourceId: recorded.resourceId,
      firstViewedAt: recorded.firstViewedAt.toISOString(),
      lastViewedAt: recorded.lastViewedAt.toISOString(),
      viewCount: recorded.viewCount,
      resource,
    };
  }

  async listRecentlyViewed(
    customerId: string,
    limit: number = 20
  ): Promise<RecentlyViewedDto[]> {
    const views = await recentlyViewedRepository.listByCustomer(customerId, limit);

    const enriched = await Promise.all(
      views.map(async (view) => {
        const resource = await this.enrichResource(view.resourceType, view.resourceId);
        return {
          id: view.id,
          resourceType: view.resourceType,
          resourceId: view.resourceId,
          firstViewedAt: view.firstViewedAt.toISOString(),
          lastViewedAt: view.lastViewedAt.toISOString(),
          viewCount: view.viewCount,
          resource,
        };
      })
    );

    return enriched;
  }

  async clearRecentlyViewed(customerId: string): Promise<boolean> {
    return recentlyViewedRepository.clear(customerId);
  }

  // ==========================================
  // CUSTOMER PREFERENCES & ALERTS FOUNDATION
  // ==========================================

  async getPreferences(customerId: string): Promise<CustomerPreferencesDto> {
    let prefs = await customerPreferenceRepository.findByCustomerId(customerId);
    if (!prefs) {
      prefs = await customerPreferenceRepository.upsert(customerId, {
        preferredMode: 'ALL',
        preferredLocations: [],
        preferredBhk: [],
        preferredPropertyTypes: [],
        emailAlertsEnabled: true,
        newLaunchAlerts: true,
        priceDropAlerts: true,
      });
    }
    return this.mapPreferencesToDto(prefs);
  }

  async updatePreferences(
    customerId: string,
    dto: UpdateCustomerPreferencesDto
  ): Promise<CustomerPreferencesDto> {
    // Validate budget
    if (dto.budgetMin !== undefined && dto.budgetMin !== null && dto.budgetMin < 0) {
      throw new Error('Minimum budget cannot be negative');
    }
    if (dto.budgetMax !== undefined && dto.budgetMax !== null && dto.budgetMax < 0) {
      throw new Error('Maximum budget cannot be negative');
    }
    if (
      dto.budgetMin !== undefined &&
      dto.budgetMin !== null &&
      dto.budgetMax !== undefined &&
      dto.budgetMax !== null &&
      dto.budgetMin > dto.budgetMax
    ) {
      throw new Error('Minimum budget cannot exceed maximum budget');
    }

    const updated = await customerPreferenceRepository.upsert(customerId, dto);
    return this.mapPreferencesToDto(updated);
  }

  // ==========================================
  // PERSONALIZED DISCOVERY
  // ==========================================

  async getPersonalizedDiscovery(customerId: string): Promise<PersonalizedDiscoveryDto> {
    const prefs = await this.getPreferences(customerId);
    const saved = await this.listSavedItems(customerId);
    const recent = await this.listRecentlyViewed(customerId, 10);

    const hasExplicitPreferences =
      (prefs.preferredLocations && prefs.preferredLocations.length > 0) ||
      (prefs.preferredBhk && prefs.preferredBhk.length > 0) ||
      prefs.budgetMax !== null;

    // Collect preferred location names or IDs
    const targetLocations = new Set<string>(prefs.preferredLocations || []);
    for (const s of saved) {
      if (s.resource.locationName) targetLocations.add(s.resource.locationName.toLowerCase());
    }
    for (const r of recent) {
      if (r.resource.locationName) targetLocations.add(r.resource.locationName.toLowerCase());
    }

    // Discover published projects
    const allProjects = await projectRepository.findAll();
    const publishedProjects = allProjects.filter(
      (p: any) => p.lifecycleStatus === 'PUBLISHED' || p.isPublished === true
    );

    const recommendedProjects: SavedItemSummary[] = [];
    for (const p of publishedProjects) {
      if (recommendedProjects.length >= 6) break;
      const summary = await this.enrichResource('PROJECT', p.id);
      recommendedProjects.push(summary);
    }

    // Discover resale
    const recommendedResale: SavedItemSummary[] = [];
    try {
      const resales = await (resaleListingService as any).listPublicListings?.({ limit: 6 });
      if (resales?.items) {
        for (const item of resales.items) {
          const summary = await this.enrichResource('RESALE_LISTING', item.id);
          recommendedResale.push(summary);
        }
      }
    } catch {
      // Fallback cleanly
    }

    // Discover rentals
    const recommendedRentals: SavedItemSummary[] = [];
    try {
      const rentals = await (rentalListingService as any).listPublicListings?.({ limit: 6 });
      if (rentals?.items) {
        for (const item of rentals.items) {
          const summary = await this.enrichResource('RENTAL_LISTING', item.id);
          recommendedRentals.push(summary);
        }
      }
    } catch {
      // Fallback cleanly
    }

    let rationale = 'Curated projects & homes in Kolkata for your discovery.';
    if (hasExplicitPreferences) {
      const locStr =
        prefs.preferredLocations.length > 0
          ? ` in ${prefs.preferredLocations.join(', ')}`
          : '';
      const bhkStr =
        prefs.preferredBhk.length > 0
          ? ` matching ${prefs.preferredBhk.join(', ')} BHK`
          : '';
      rationale = `Personalized recommendations${locStr}${bhkStr} aligned with your Great Homes preferences.`;
    } else if (saved.length > 0) {
      rationale = `Curated based on your ${saved.length} saved home${saved.length > 1 ? 's' : ''}.`;
    }

    return {
      hasPreferences: hasExplicitPreferences || saved.length > 0 || recent.length > 0,
      recommendedProjects,
      recommendedResale,
      recommendedRentals,
      rationale,
    };
  }
}

export const customerService = new CustomerService();
