import { locationService } from '../locations/services/locationService';
import { locationIntelligenceService } from '../marketIntelligence/services/locationIntelligenceService';
import { MetricScope } from '../marketIntelligence/types';
import { ensureSeedData } from '../../infrastructure/seed';
import {
  LocationComparisonDTO,
  LocationComparisonItemDTO,
  PriceBasisType,
} from './locationComparisonTypes';
import {
  validateLocationSlugs,
  validateHierarchyCompatibility,
} from './locationComparisonValidation';
import { buildLocationComparisonDTO } from './locationComparisonMapper';

export interface CompareLocationsResult {
  success: boolean;
  statusCode: number;
  data?: LocationComparisonDTO;
  error?: string;
}

export class LocationComparisonService {
  /**
   * Orchestrates the direct comparison of 2 to 4 residential locations.
   * Leverages authoritative LocationIntelligenceService and LocationService.
   * Guarantees strict basis isolation, factual snapshot references, and no predictive scoring.
   */
  async compareLocations(
    slugsInput: string[] | string,
    options?: { scope?: MetricScope; priceBasis?: PriceBasisType }
  ): Promise<CompareLocationsResult> {
    await ensureSeedData();
    const scope: MetricScope = options?.scope === 'DIRECT' ? 'DIRECT' : 'DESCENDANT';

    // 1. Validate slugs input
    const slugValidation = validateLocationSlugs(slugsInput);
    if (!slugValidation.valid || !slugValidation.deduplicatedSlugs) {
      return {
        success: false,
        statusCode: slugValidation.statusCode || 400,
        error: slugValidation.error || 'Invalid location slugs for comparison.',
      };
    }

    const slugs = slugValidation.deduplicatedSlugs;

    // 2. Resolve published locations
    const resolvedLocations = [];
    for (const slug of slugs) {
      const location = await locationService.resolveLocationBySlug(slug, { publishedOnly: true });
      if (!location) {
        return {
          success: false,
          statusCode: 404,
          error: `Location '${slug}' was not found or is not currently published.`,
        };
      }
      resolvedLocations.push(location);
    }

    // 3. Validate hierarchy compatibility
    const hierarchyValidation = validateHierarchyCompatibility(resolvedLocations);
    if (!hierarchyValidation.valid) {
      return {
        success: false,
        statusCode: hierarchyValidation.statusCode || 400,
        error: hierarchyValidation.error,
      };
    }

    // 4. Concurrently fetch authoritative location intelligence & historical snapshots
    const items: LocationComparisonItemDTO[] = [];

    await Promise.all(
      resolvedLocations.map(async (location) => {
        const [intel, history] = await Promise.all([
          locationIntelligenceService.getLocationIntelligence(location.slug, { scope }),
          locationIntelligenceService.getLocationHistory(location.id, scope),
        ]);

        if (intel) {
          items.push({
            id: intel.location.id,
            name: intel.location.name,
            slug: intel.location.slug,
            level: intel.location.level,
            levelDisplay: intel.location.levelDisplay,
            city: intel.location.city,
            district: intel.location.district,
            state: intel.location.state,
            breadcrumb: intel.location.breadcrumb,
            canonicalPath: intel.location.canonicalPath,
            description: intel.location.description || null,
            marketOverview: intel.marketOverview,
            supply: intel.supply,
            pricing: intel.pricing,
            rera: intel.rera,
            connectivity: intel.connectivity,
            recentActivity: intel.recentActivity,
            freshness: intel.freshness,
            historicalSnapshots: history || [],
          });
        }
      })
    );

    if (items.length < 2) {
      return {
        success: false,
        statusCode: 500,
        error: 'Failed to assemble intelligence for at least two locations.',
      };
    }

    // 5. Build canonical comparison DTO
    const comparisonDTO = buildLocationComparisonDTO(items, hierarchyValidation, scope);

    return {
      success: true,
      statusCode: 200,
      data: comparisonDTO,
    };
  }
}

export const locationComparisonService = new LocationComparisonService();
