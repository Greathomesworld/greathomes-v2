
import { 
  ProjectDiscoveryCardDto,
  DiscoveryResponse,
} from '../dto/discoveryDto';
import { projectRepository, projectConfigurationRepository } from '../../../infrastructure/repositories/projectProvider';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { deriveProjectPricingSummary } from '../dto/projectDto';
import { 
  customerPreferenceRepository,
  savedItemRepository,
  recentlyViewedRepository,
} from '../../customer/repositories/index';

export interface RecommendationFilters {
  limit?: number;
  customerId?: string;
}

export class RecommendationService {
  /**
   * Deterministic recommendation scoring engine.
   * Higher score is better.
   */
  async getRecommendations(filters: RecommendationFilters): Promise<ProjectDiscoveryCardDto[]> {
    const limit = Math.min(20, filters.limit || 5);
    const allProjects = await projectRepository.list({ isPublished: true });
    const projectIds = allProjects.map(p => p.id);
    const allConfigs = projectIds.length > 0 && typeof projectConfigurationRepository.findByProjectIds === 'function'
      ? await projectConfigurationRepository.findByProjectIds(projectIds)
      : await projectConfigurationRepository.findAll();
    const configsByProject = new Map<string, typeof allConfigs>();
    for (const c of allConfigs) {
      const list = configsByProject.get(c.projectId) || [];
      list.push(c);
      configsByProject.set(c.projectId, list);
    }

    // 1. Get user signals if authenticated
    let preferences: any = null;
    let history: any[] = [];
    
    if (filters.customerId) {
        preferences = await customerPreferenceRepository.findByCustomerId(filters.customerId);
        history = await recentlyViewedRepository.listByCustomer(filters.customerId);
    }

    // 2. Score projects
    const scoredProjects = allProjects.map(proj => {
        let score = 0;
        const reasons: string[] = [];
        const configs = configsByProject.get(proj.id) || [];
        const pricing = deriveProjectPricingSummary(proj, configs);

        // Signal: Preferred Location Match
        if (preferences?.preferredLocations?.includes(proj.locationId)) {
            score += 5;
            reasons.push("Matches your preferred location");
        }

        // Signal: Budget Match (never match hidden PoR price)
        if (preferences?.budgetMax && !pricing.priceOnRequest && pricing.startingPrice && pricing.startingPrice <= preferences.budgetMax) {
            score += 3;
            reasons.push("Within your budget");
        }

        // Signal: Recently viewed / Saved items (higher weight)
        if (history.some(h => h.resourceId === proj.id)) {
            score += 8;
            reasons.push("Based on your viewing history");
        }

        return { proj, pricing, score, reasons };
    });

    // 3. Sort by score DESC, then createdAt DESC
    scoredProjects.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.proj.createdAt).getTime() - new Date(a.proj.createdAt).getTime();
    });

    // 4. Map to DTOs
    const recommendations: ProjectDiscoveryCardDto[] = [];
    for (const item of scoredProjects.slice(0, limit)) {
        const { proj, pricing, reasons } = item;
        const loc = await locationRepository.findById(proj.locationId);
        
        recommendations.push({
            type: 'PROJECT',
            id: proj.id,
            name: proj.name,
            slug: proj.slug,
            developer: null, // Should be fetched from devRepo if needed
            location: loc ? { id: loc.id, name: loc.name, slug: loc.slug, type: loc.type } : null,
            startingPrice: pricing.startingPrice,
            priceOnRequest: Boolean(pricing.priceOnRequest),
            propertyTypes: proj.propertyType ? [proj.propertyType] : [],
            bhkSummary: [], // Could be fetched from configs
            reraVerified: false, // Could be fetched from reraRepository
            featuredImageUrl: null, 
            recommendationReason: reasons.length > 0 ? reasons[0] : "Explore this project"
        });
    }

    return recommendations;
  }
}

export const recommendationService = new RecommendationService();
