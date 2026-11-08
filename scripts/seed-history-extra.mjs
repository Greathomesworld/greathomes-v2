import { getDb } from '../src/db/client.js';
import { locations, locationMarketSnapshots } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

async function seedExtraHistory() {
  const db = getDb();
  if (!db) throw new Error('DB NOT CONFIGURED');

  const locs = await db.select().from(locations).where(eq(locations.status, 'PUBLISHED'));
  console.log(`🌱 Seeding extra history for ${locs.length} locations...`);

  for (const loc of locs) {
    console.log(`   - ${loc.slug}`);
    for (let i = 1; i <= 10; i++) {
      const date = `2026-09-${String(i).padStart(2, '0')}`;
      const id = `extra_snap_${loc.id}_${date}`.replace(/-/g, '_');
      
      try {
        await db.insert(locationMarketSnapshots).values({
          id,
          locationId: loc.id,
          snapshotDate: date,
          projectCount: 10 + i,
          publishedProjectCount: 10 + i,
          resaleListingCount: 20 + i * 2,
          rentalListingCount: 15 + i,
          configurationCounts: {
            bhk1Count: i,
            bhk2Count: i * 2,
            bhk3Count: i * 3,
            bhk4Count: i,
            bhk5PlusCount: 0,
            otherCount: 0
          },
          priceMetrics: [
            {
              priceBasis: 'CARPET_AREA',
              sampleCount: 10,
              avgRatePerSqft: 7000 + i * 100,
              maxRatePerSqft: 8000 + i * 100,
              minRatePerSqft: 6000 + i * 100,
              medianRatePerSqft: 7000 + i * 100
            },
            {
              priceBasis: 'BUILT_UP_AREA',
              sampleCount: 5,
              avgRatePerSqft: 6000 + i * 80,
              maxRatePerSqft: 7000 + i * 80,
              minRatePerSqft: 5000 + i * 80,
              medianRatePerSqft: 6000 + i * 80
            }
          ],
          reraMetrics: {
            totalProjects: 10 + i,
            providedProjects: 5 + i,
            verifiedProjects: 5,
            verifiedPercentage: 50,
            notProvidedProjects: 0
          },
          dataFreshness: {
            dataAsOf: new Date().toISOString(),
            sourceType: 'GREAT_HOMES_DB',
            sourceLabel: 'Seed Script',
            freshnessStatus: 'CURRENT'
          }
        }).onConflictDoNothing();
      } catch (e) {
        // Ignore duplicate errors if re-running
      }
    }
  }
  console.log('✅ Extra history seeded.');
  process.exit(0);
}

seedExtraHistory().catch(err => {
  console.error(err);
  process.exit(1);
});
