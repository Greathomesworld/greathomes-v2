import { ComparisonMode, ProjectComparisonDto, ResaleComparisonDto, RentalComparisonDto } from '../entities';
import { projectIntelligenceService } from '../../projects/services/projectIntelligenceService';
import { resaleListingService } from '../../projects/services/resaleService';
import { rentalService } from '../../projects/services/rentalService';
import { ensureSeedData } from '../../../infrastructure/seed';

export class ComparisonService {
  /**
   * Validates and resolves Project comparison DTOs for an array of project IDs (max 4).
   */
  async compareProjects(ids: string[]): Promise<ProjectComparisonDto[]> {
    if (!ids || ids.length === 0) return [];
    await ensureSeedData();
    const uniqueIds = Array.from(new Set(ids)).slice(0, 4);

    const dtos: ProjectComparisonDto[] = [];

    for (const id of uniqueIds) {
      try {
        const pubDto =
          (await projectIntelligenceService.getProjectById(id, false)) ||
          (await projectIntelligenceService.getProjectBySlug(id, false));

        if (!pubDto || pubDto.lifecycleStatus === 'DRAFT' || pubDto.lifecycleStatus === 'ARCHIVED') {
          dtos.push({
            id,
            slug: '',
            name: 'Project no longer available',
            developer: { id: '', name: '—', slug: '' },
            location: { id: '', name: '—', slug: '', type: '' },
            status: 'UNAVAILABLE',
            stage: 'UNAVAILABLE',
            startingPrice: null,
            startingPriceDisplay: '—',
            priceBasis: null,
            projectArea: null,
            towerCount: null,
            totalUnits: null,
            configurationsSummary: null,
            floors: null,
            possession: null,
            reraStatus: 'NOT_PROVIDED',
            reraRegistrationNumber: null,
            hasVerifiedReraBadge: false,
            amenities: [],
            snapshot: { projectArea: null, towerCount: null, totalUnits: null, configurations: null, floors: null, possession: null },
            isAvailable: false,
            unavailableReason: 'PROJECT_UNAVAILABLE',
          });
          continue;
        }

        const startingPrice = pubDto.pricing.startingPrice;

        dtos.push({
          id: pubDto.id,
          slug: pubDto.slug,
          name: pubDto.name,
          developer: pubDto.developer,
          location: { id: pubDto.location.id, name: pubDto.location.name, slug: pubDto.location.slug, type: pubDto.location.type },
          status: pubDto.status,
          stage: pubDto.status,
          startingPrice,
          startingPriceDisplay: startingPrice ? this.formatCurrency(startingPrice) : 'Price on request',
          priceBasis: pubDto.pricing.priceBasis,
          projectArea: pubDto.projectArea || null,
          towerCount: pubDto.towerCount || null,
          totalUnits: pubDto.totalUnits || null,
          configurationsSummary: pubDto.configurationsSummary || null,
          floors: pubDto.floors || null,
          possession: pubDto.possession || null,
          reraStatus: pubDto.rera.status,
          reraRegistrationNumber: pubDto.rera.registrationNumber || null,
          hasVerifiedReraBadge: pubDto.rera.hasVerifiedReraBadge,
          amenities: pubDto.amenities.map(a => ({ id: a.id, name: a.name, category: a.category })),
          snapshot: pubDto.snapshot,
          isAvailable: true,
          thumbnailUrl: pubDto.media[0]?.url || null,
        });
      } catch {
        dtos.push({
          id,
          slug: '',
          name: 'Project no longer available',
          developer: { id: '', name: '—', slug: '' },
          location: { id: '', name: '—', slug: '', type: '' },
          status: 'UNAVAILABLE',
          stage: 'UNAVAILABLE',
          startingPrice: null,
          startingPriceDisplay: '—',
          priceBasis: null,
          projectArea: null,
          towerCount: null,
          totalUnits: null,
          configurationsSummary: null,
          floors: null,
          possession: null,
          reraStatus: 'NOT_PROVIDED',
          reraRegistrationNumber: null,
          hasVerifiedReraBadge: false,
          amenities: [],
          snapshot: { projectArea: null, towerCount: null, totalUnits: null, configurations: null, floors: null, possession: null },
          isAvailable: false,
          unavailableReason: 'PROJECT_UNAVAILABLE',
        });
      }
    }

    return dtos;
  }

  /**
   * Validates and resolves Resale comparison DTOs for an array of resale listing IDs (max 4).
   */
  async compareResale(ids: string[]): Promise<ResaleComparisonDto[]> {
    if (!ids || ids.length === 0) return [];
    await ensureSeedData();
    const uniqueIds = Array.from(new Set(ids)).slice(0, 4);

    const dtos: ResaleComparisonDto[] = [];
    for (const id of uniqueIds) {
      try {
        const listing =
          (await resaleListingService.getPublicListingById(id)) ||
          (await resaleListingService.getPublicListingBySlug(id));
        if (!listing) {
          dtos.push({
            id,
            slug: '',
            title: 'Listing no longer available',
            propertyType: 'APARTMENT',
            configuration: '—',
            locationName: '—',
            askingPrice: 0,
            askingPriceDisplay: '—',
            furnishing: 'UNFURNISHED',
            floorCategory: 'MID_FLOOR',
            amenities: [],
            verificationStatus: 'UNVERIFIED',
            listingPartyType: 'Owner Listed',
            isAvailable: false,
            unavailableReason: 'LISTING_UNAVAILABLE',
          });
          continue;
        }

        const askingPrice = Number(listing.askingPrice) || 0;
        dtos.push({
          id: listing.id,
          slug: listing.slug || '',
          title: `${listing.configuration} Resale Home`,
          propertyType: listing.propertyType,
          configuration: listing.configuration || '—',
          locationName: listing.project?.location?.name || listing.location?.name || 'Location',
          projectName: listing.project?.name || null,
          carpetArea: listing.carpetArea || null,
          builtUpArea: listing.builtUpArea || null,
          superBuiltUpArea: listing.superBuiltUpArea || null,
          askingPrice,
          askingPriceDisplay: this.formatCurrency(askingPrice),
          furnishing: listing.furnishing || 'UNFURNISHED',
          facing: listing.facing || null,
          floorCategory: listing.floorCategory || 'MID_FLOOR',
          possessionStatus: listing.possession || null,
          amenities: listing.amenities?.map(a => a.name) || [],
          verificationStatus: listing.isVerified ? 'VERIFIED' : 'UNVERIFIED',
          listingPartyType: listing.listingParty?.label || 'Owner Listed',
          isAvailable: true,
          thumbnailUrl: listing.media?.[0]?.url || null,
        });
      } catch {
        dtos.push({
          id,
          slug: '',
          title: 'Listing no longer available',
          propertyType: 'APARTMENT',
          configuration: '—',
          locationName: '—',
          askingPrice: 0,
          askingPriceDisplay: '—',
          furnishing: 'UNFURNISHED',
          floorCategory: 'MID_FLOOR',
          amenities: [],
          verificationStatus: 'UNVERIFIED',
          listingPartyType: 'Owner Listed',
          isAvailable: false,
          unavailableReason: 'LISTING_UNAVAILABLE',
        });
      }
    }

    return dtos;
  }

  /**
   * Validates and resolves Rental comparison DTOs for an array of rental listing IDs (max 4).
   */
  async compareRental(ids: string[]): Promise<RentalComparisonDto[]> {
    if (!ids || ids.length === 0) return [];
    await ensureSeedData();
    const uniqueIds = Array.from(new Set(ids)).slice(0, 4);

    const dtos: RentalComparisonDto[] = [];
    for (const id of uniqueIds) {
      try {
        const listing =
          (await rentalService.getPublicListingById(id)) ||
          (await rentalService.getPublicListingBySlug(id));
        if (!listing) {
          dtos.push({
            id,
            slug: '',
            title: 'Rental no longer available',
            propertyType: 'APARTMENT',
            configuration: '—',
            locationName: '—',
            monthlyRent: 0,
            monthlyRentDisplay: '—',
            furnishing: 'UNFURNISHED',
            floorCategory: 'MID_FLOOR',
            availabilityStatus: 'UNAVAILABLE',
            amenities: [],
            verificationStatus: 'UNVERIFIED',
            isAvailable: false,
            unavailableReason: 'RENTAL_UNAVAILABLE',
          });
          continue;
        }

        const monthlyRent = Number(listing.monthlyRent) || 0;
        dtos.push({
          id: listing.id,
          slug: listing.slug || '',
          title: `${listing.configuration} Rental Home`,
          propertyType: listing.propertyType,
          configuration: listing.configuration || '—',
          locationName: listing.project?.location?.name || listing.location?.name || 'Location',
          projectName: listing.project?.name || null,
          carpetArea: listing.carpetArea || null,
          builtUpArea: listing.builtUpArea || null,
          superBuiltUpArea: listing.superBuiltUpArea || null,
          monthlyRent,
          monthlyRentDisplay: `₹${monthlyRent.toLocaleString('en-IN')} /mo`,
          maintenance: listing.maintenance ? Number(listing.maintenance) : null,
          securityDeposit: listing.securityDeposit ? Number(listing.securityDeposit) : null,
          furnishing: listing.furnishing || 'UNFURNISHED',
          facing: listing.facing || null,
          floorCategory: listing.floorCategory || 'MID_FLOOR',
          availabilityStatus: 'AVAILABLE',
          amenities: listing.amenities?.map(a => a.name) || [],
          verificationStatus: listing.isVerified ? 'VERIFIED' : 'UNVERIFIED',
          isAvailable: true,
          thumbnailUrl: listing.media?.[0]?.url || null,
        });
      } catch {
        dtos.push({
          id,
          slug: '',
          title: 'Rental no longer available',
          propertyType: 'APARTMENT',
          configuration: '—',
          locationName: '—',
          monthlyRent: 0,
          monthlyRentDisplay: '—',
          furnishing: 'UNFURNISHED',
          floorCategory: 'MID_FLOOR',
          availabilityStatus: 'UNAVAILABLE',
          amenities: [],
          verificationStatus: 'UNVERIFIED',
          isAvailable: false,
          unavailableReason: 'RENTAL_UNAVAILABLE',
        });
      }
    }

    return dtos;
  }

  private formatCurrency(val: any): string {
    if (!val) return 'Price on Request';
    const num = Number(val);
    if (isNaN(num)) return val.toString();
    if (num >= 10000000) {
      return `₹${(num / 10000000).toFixed(2)} Cr`;
    }
    if (num >= 100000) {
      return `₹${(num / 100000).toFixed(2)} Lakh`;
    }
    return `₹${num.toLocaleString('en-IN')}`;
  }
}

export const comparisonService = new ComparisonService();
