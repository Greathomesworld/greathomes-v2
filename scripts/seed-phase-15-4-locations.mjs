import { getDb } from '../src/db/client.js';
import { locations, locationMarketSnapshots, projects, resaleListings, rentalListings } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

async function seedLocations() {
  const db = getDb();
  if (!db) throw new Error('DB NOT CONFIGURED');

  const [kolkata] = await db.select().from(locations).where(eq(locations.slug, 'kolkata'));
  if (!kolkata) throw new Error('Kolkata not found');

  const additionalLocs = [
    {
      id: '5f9a12cd-8b3e-48a1-9a72-b883017a1111',
      name: 'Salt Lake',
      slug: 'salt-lake',
      type: 'AREA',
      parentId: kolkata.id,
      description: 'Planned residential satellite township with established sectors, IT corridors, and lush green open spaces.',
      shortDescription: 'Established satellite township in East Kolkata',
      status: 'PUBLISHED',
      featured: true,
    },
    {
      id: '6a0b23de-9c4f-59b2-0b83-c994128b2222',
      name: 'EM Bypass',
      slug: 'em-bypass',
      type: 'AREA',
      parentId: kolkata.id,
      description: 'Major arterial corridor connecting North and South Kolkata with luxury high-rises and healthcare infrastructure.',
      shortDescription: 'High-speed arterial residential corridor',
      status: 'PUBLISHED',
      featured: true,
    }
  ];

  for (const loc of additionalLocs) {
    await db.insert(locations).values(loc).onConflictDoNothing();

    // Insert historical market snapshots
    for (let i = 1; i <= 6; i++) {
      const date = `2026-09-${String(i).padStart(2, '0')}`;
      const snapId = `snap_${loc.slug}_${date}`.replace(/-/g, '_');
      await db.insert(locationMarketSnapshots).values({
        id: snapId,
        locationId: loc.id,
        snapshotDate: date,
        projectCount: loc.slug === 'salt-lake' ? 18 + i : 22 + i,
        publishedProjectCount: loc.slug === 'salt-lake' ? 18 + i : 22 + i,
        resaleListingCount: loc.slug === 'salt-lake' ? 35 + i * 2 : 28 + i * 2,
        rentalListingCount: loc.slug === 'salt-lake' ? 24 + i : 19 + i,
        configurationCounts: {
          bhk1Count: 5 + i,
          bhk2Count: 15 + i * 2,
          bhk3Count: 25 + i * 2,
          bhk4Count: 8 + i,
          bhk5PlusCount: 2,
          otherCount: 0
        },
        priceMetrics: [
          {
            priceBasis: 'CARPET_AREA',
            sampleCount: 15,
            avgRatePerSqft: loc.slug === 'salt-lake' ? 9200 + i * 80 : 8800 + i * 90,
            maxRatePerSqft: loc.slug === 'salt-lake' ? 12000 + i * 80 : 11500 + i * 90,
            minRatePerSqft: loc.slug === 'salt-lake' ? 7500 + i * 80 : 7100 + i * 90,
            medianRatePerSqft: loc.slug === 'salt-lake' ? 9000 + i * 80 : 8600 + i * 90
          },
          {
            priceBasis: 'BUILT_UP_AREA',
            sampleCount: 10,
            avgRatePerSqft: loc.slug === 'salt-lake' ? 7600 + i * 70 : 7200 + i * 75,
            maxRatePerSqft: loc.slug === 'salt-lake' ? 9800 + i * 70 : 9400 + i * 75,
            minRatePerSqft: loc.slug === 'salt-lake' ? 6200 + i * 70 : 5800 + i * 75,
            medianRatePerSqft: loc.slug === 'salt-lake' ? 7400 + i * 70 : 7000 + i * 75
          },
          {
            priceBasis: 'SUPER_BUILT_UP_AREA',
            sampleCount: 12,
            avgRatePerSqft: loc.slug === 'salt-lake' ? 6100 + i * 60 : 5800 + i * 65,
            maxRatePerSqft: loc.slug === 'salt-lake' ? 7900 + i * 60 : 7600 + i * 65,
            minRatePerSqft: loc.slug === 'salt-lake' ? 4900 + i * 60 : 4700 + i * 65,
            medianRatePerSqft: loc.slug === 'salt-lake' ? 5900 + i * 60 : 5600 + i * 65
          }
        ],
        reraMetrics: {
          totalProjects: loc.slug === 'salt-lake' ? 18 + i : 22 + i,
          verifiedProjects: loc.slug === 'salt-lake' ? 14 + i : 18 + i,
          providedProjects: 3,
          notProvidedProjects: 1,
          verifiedPercentage: 78
        },
        dataFreshness: {
          dataAsOf: new Date().toISOString(),
          sourceType: 'GREAT_HOMES_DB',
          sourceLabel: 'Market Snapshot Engine',
          freshnessStatus: 'CURRENT'
        }
      }).onConflictDoNothing();
    }
  }

  console.log('✅ Salt Lake and EM Bypass seeded successfully.');
  process.exit(0);
}

seedLocations().catch(err => {
  console.error(err);
  process.exit(1);
});
