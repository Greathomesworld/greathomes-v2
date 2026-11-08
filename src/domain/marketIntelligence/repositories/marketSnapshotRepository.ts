import { LocationMarketSnapshot } from '../entities';
import { getDb } from '../../../db/client';
import { locationMarketSnapshots } from '../../../db/schema';
import { eq, and, desc } from 'drizzle-orm';

export interface MarketSnapshotRepository {
  createSnapshot(data: Omit<LocationMarketSnapshot, 'createdAt' | 'updatedAt'>): Promise<LocationMarketSnapshot>;
  getLatestSnapshot(locationId: string): Promise<LocationMarketSnapshot | null>;
  getSnapshotByDate(locationId: string, snapshotDate: string): Promise<LocationMarketSnapshot | null>;
  getSnapshotsForLocation(locationId: string, limit?: number): Promise<LocationMarketSnapshot[]>;
  getPreviousSnapshot(locationId: string, beforeDate: string): Promise<LocationMarketSnapshot | null>;
  deleteSnapshot(id: string): Promise<boolean>;
}

export class MarketSnapshotRepositoryPostgres implements MarketSnapshotRepository {
  async createSnapshot(data: Omit<LocationMarketSnapshot, 'createdAt' | 'updatedAt'>): Promise<LocationMarketSnapshot> {
    const db = getDb();
    const now = new Date();

    const snapshot: LocationMarketSnapshot = {
      ...data,
      createdAt: now,
      updatedAt: now,
    };

    if (db) {
      await db
        .insert(locationMarketSnapshots)
        .values({
          id: data.id,
          locationId: data.locationId,
          snapshotDate: data.snapshotDate,
          projectCount: data.projectCount,
          publishedProjectCount: data.publishedProjectCount,
          newLaunchCount: data.newLaunchCount,
          underConstructionCount: data.underConstructionCount,
          readyToMoveCount: data.readyToMoveCount,
          completedProjectCount: data.completedProjectCount,
          soldOutProjectCount: data.soldOutProjectCount,
          resaleListingCount: data.resaleListingCount,
          rentalListingCount: data.rentalListingCount,
          configurationCounts: data.configurationCounts as any,
          priceMetrics: data.priceMetrics as any,
          reraMetrics: data.reraMetrics as any,
          dataFreshness: data.dataFreshness as any,
          source: data.source || 'GREAT_HOMES_DB',
          createdAt: now,
          updatedAt: now,
        } as any)
        .onConflictDoUpdate({
          target: [locationMarketSnapshots.locationId, locationMarketSnapshots.snapshotDate],
          set: {
            projectCount: data.projectCount,
            publishedProjectCount: data.publishedProjectCount,
            newLaunchCount: data.newLaunchCount,
            underConstructionCount: data.underConstructionCount,
            readyToMoveCount: data.readyToMoveCount,
            completedProjectCount: data.completedProjectCount,
            soldOutProjectCount: data.soldOutProjectCount,
            resaleListingCount: data.resaleListingCount,
            rentalListingCount: data.rentalListingCount,
            configurationCounts: data.configurationCounts as any,
            priceMetrics: data.priceMetrics as any,
            reraMetrics: data.reraMetrics as any,
            dataFreshness: data.dataFreshness as any,
            updatedAt: now,
          } as any,
        });
    }

    return snapshot;
  }

  async getLatestSnapshot(locationId: string): Promise<LocationMarketSnapshot | null> {
    const db = getDb();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(locationMarketSnapshots)
      .where(eq(locationMarketSnapshots.locationId, locationId))
      .orderBy(desc(locationMarketSnapshots.snapshotDate))
      .limit(1);

    if (!row) return null;
    return this.mapRowToSnapshot(row);
  }

  async getSnapshotByDate(locationId: string, snapshotDate: string): Promise<LocationMarketSnapshot | null> {
    const db = getDb();
    if (!db) return null;

    const [row] = await db
      .select()
      .from(locationMarketSnapshots)
      .where(
        and(
          eq(locationMarketSnapshots.locationId, locationId),
          eq(locationMarketSnapshots.snapshotDate, snapshotDate)
        )
      )
      .limit(1);

    if (!row) return null;
    return this.mapRowToSnapshot(row);
  }

  async getSnapshotsForLocation(locationId: string, limit = 12): Promise<LocationMarketSnapshot[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db
      .select()
      .from(locationMarketSnapshots)
      .where(eq(locationMarketSnapshots.locationId, locationId))
      .orderBy(desc(locationMarketSnapshots.snapshotDate))
      .limit(limit);

    return rows.map(r => this.mapRowToSnapshot(r));
  }

  async getPreviousSnapshot(locationId: string, beforeDate: string): Promise<LocationMarketSnapshot | null> {
    const db = getDb();
    if (!db) return null;

    const snapshots = await this.getSnapshotsForLocation(locationId, 50);
    const prev = snapshots.find(s => s.snapshotDate < beforeDate);
    return prev || null;
  }

  async deleteSnapshot(id: string): Promise<boolean> {
    const db = getDb();
    if (!db) return false;

    await db.delete(locationMarketSnapshots).where(eq(locationMarketSnapshots.id, id));
    return true;
  }

  private mapRowToSnapshot(row: any): LocationMarketSnapshot {
    return {
      id: row.id,
      locationId: row.locationId,
      snapshotDate: row.snapshotDate,
      projectCount: row.projectCount,
      publishedProjectCount: row.publishedProjectCount,
      newLaunchCount: row.newLaunchCount,
      underConstructionCount: row.underConstructionCount,
      readyToMoveCount: row.readyToMoveCount,
      completedProjectCount: row.completedProjectCount,
      soldOutProjectCount: row.soldOutProjectCount,
      resaleListingCount: row.resaleListingCount,
      rentalListingCount: row.rentalListingCount,
      configurationCounts: row.configurationCounts || { bhk1Count: 0, bhk2Count: 0, bhk3Count: 0, bhk4Count: 0, bhk5PlusCount: 0, otherCount: 0 },
      priceMetrics: row.priceMetrics || [],
      reraMetrics: row.reraMetrics || { verifiedProjects: 0, providedProjects: 0, notProvidedProjects: 0, totalProjects: 0, verifiedPercentage: 0 },
      dataFreshness: row.dataFreshness || { dataAsOf: row.createdAt.toISOString(), lastCalculatedAt: row.createdAt.toISOString(), freshnessStatus: 'UNKNOWN', sourceType: 'GREAT_HOMES_DB', sourceLabel: 'Great Homes' },
      source: row.source || 'GREAT_HOMES_DB',
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}

export const marketSnapshotRepository = new MarketSnapshotRepositoryPostgres();
