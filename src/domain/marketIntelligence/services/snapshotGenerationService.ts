import { LocationMarketSnapshot } from '../entities';
import { marketSnapshotRepository } from '../repositories/marketSnapshotRepository';
import { marketIntelligenceService } from './marketIntelligenceService';
import { buildFreshnessInfo } from '../metrics';

export class SnapshotGenerationService {
  /**
   * Generates or updates a deterministic LocationMarketSnapshot for a given location and snapshot date (YYYY-MM-DD).
   * Enforces idempotency via database unique constraint on (location_id, snapshot_date).
   */
  async generateSnapshot(locationId: string, snapshotDate?: string): Promise<LocationMarketSnapshot> {
    const dateStr = snapshotDate || new Date().toISOString().split('T')[0];

    const supply = await marketIntelligenceService.getSupplyMetrics(locationId, 'DESCENDANT');
    const priceMetrics = await marketIntelligenceService.getPriceMetrics(locationId, 'DESCENDANT');
    const reraMetrics = await marketIntelligenceService.getReraCoverage(locationId, 'DESCENDANT');

    const freshness = buildFreshnessInfo(new Date(), 'Great Homes Database Aggregation Engine');

    const id = `snap_${locationId}_${dateStr}`.replace(/-/g, '_');

    const snapshot = await marketSnapshotRepository.createSnapshot({
      id,
      locationId,
      snapshotDate: dateStr,
      projectCount: supply.totalProjects,
      publishedProjectCount: supply.publishedProjects,
      newLaunchCount: supply.newLaunchProjects,
      underConstructionCount: supply.underConstructionProjects,
      readyToMoveCount: supply.readyToMoveProjects,
      completedProjectCount: supply.completedProjects,
      soldOutProjectCount: supply.soldOutProjects,
      resaleListingCount: supply.resaleListingsCount,
      rentalListingCount: supply.rentalListingsCount,
      configurationCounts: supply.configurationDistribution,
      priceMetrics,
      reraMetrics,
      dataFreshness: freshness,
      source: 'GREAT_HOMES_DB',
    });

    return snapshot;
  }
}

export const snapshotGenerationService = new SnapshotGenerationService();
