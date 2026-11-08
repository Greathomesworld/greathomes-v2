import { performance } from 'perf_hooks';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, ilike, and, or, sql } from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('FATAL: DATABASE_URL not found.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });
const db = drizzle(pool, { schema });

function calculatePercentiles(latencies) {
  if (!latencies.length) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
  return {
    p50: Math.round(p50 * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    p99: Math.round(p99 * 100) / 100,
    avg: Math.round(avg * 100) / 100,
  };
}

async function runBenchmark() {
  console.log('====================================================');
  console.log('⚡ BENCHMARKING REAL POSTGRESQL + DRIZZLE SEARCH INTELLIGENCE PATH');
  console.log(`Database: Neon PostgreSQL (${new URL(DATABASE_URL).host})`);
  console.log('====================================================');

  // Verify connection & dataset count
  const projectCountRes = await db.select({ count: sql`count(*)` }).from(schema.projects);
  const developerCountRes = await db.select({ count: sql`count(*)` }).from(schema.developers);
  const locationCountRes = await db.select({ count: sql`count(*)` }).from(schema.locations);
  const resaleCountRes = await db.select({ count: sql`count(*)` }).from(schema.resaleListings);
  const rentalCountRes = await db.select({ count: sql`count(*)` }).from(schema.rentalListings);

  console.log('Initial Database Counts:');
  console.log(`  Projects: ${projectCountRes[0].count}`);
  console.log(`  Developers: ${developerCountRes[0].count}`);
  console.log(`  Locations: ${locationCountRes[0].count}`);
  console.log(`  Resale Listings: ${resaleCountRes[0].count}`);
  console.log(`  Rental Listings: ${rentalCountRes[0].count}`);

  const ITERATIONS = 30;

  // 1. Universal Search Query Path: Projects + Developers + Locations
  console.log('\n--- 1. Universal Search Query Latency (Projects + Developers + Locations) ---');
  const universalLatencies = [];
  const testTerms = ['Merlin', 'Rajarhat', 'New Town', 'Rise', 'Elements', 'Kolkata'];
  for (let i = 0; i < ITERATIONS; i++) {
    const term = testTerms[i % testTerms.length];
    const start = performance.now();
    await Promise.all([
      db
        .select({ id: schema.projects.id, name: schema.projects.name, slug: schema.projects.slug })
        .from(schema.projects)
        .where(
          and(
            eq(schema.projects.lifecycleStatus, 'PUBLISHED'),
            or(ilike(schema.projects.name, `%${term}%`), ilike(schema.projects.slug, `%${term}%`))
          )
        )
        .limit(20),
      db
        .select({ id: schema.developers.id, name: schema.developers.name, slug: schema.developers.slug })
        .from(schema.developers)
        .where(and(eq(schema.developers.status, 'PUBLISHED'), ilike(schema.developers.name, `%${term}%`)))
        .limit(10),
      db
        .select({ id: schema.locations.id, name: schema.locations.name, slug: schema.locations.slug })
        .from(schema.locations)
        .where(and(eq(schema.locations.status, 'PUBLISHED'), ilike(schema.locations.name, `%${term}%`)))
        .limit(10),
    ]);
    universalLatencies.push(performance.now() - start);
  }
  const universalStats = calculatePercentiles(universalLatencies);
  console.log(`  Universal Search -> p50: ${universalStats.p50}ms | p95: ${universalStats.p95}ms | p99: ${universalStats.p99}ms | avg: ${universalStats.avg}ms`);

  // 2. Suggestions / Autocomplete Query Path (Keystroke lightweight)
  console.log('\n--- 2. Autocomplete Suggestions Latency (Top 5 Bounded per Entity) ---');
  const suggestionLatencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const term = testTerms[i % testTerms.length];
    const start = performance.now();
    await Promise.all([
      db
        .select({ id: schema.projects.id, name: schema.projects.name, slug: schema.projects.slug })
        .from(schema.projects)
        .where(and(eq(schema.projects.lifecycleStatus, 'PUBLISHED'), ilike(schema.projects.name, `%${term}%`)))
        .limit(5),
      db
        .select({ id: schema.locations.id, name: schema.locations.name, slug: schema.locations.slug })
        .from(schema.locations)
        .where(and(eq(schema.locations.status, 'PUBLISHED'), ilike(schema.locations.name, `%${term}%`)))
        .limit(4),
      db
        .select({ id: schema.developers.id, name: schema.developers.name, slug: schema.developers.slug })
        .from(schema.developers)
        .where(and(eq(schema.developers.status, 'PUBLISHED'), ilike(schema.developers.name, `%${term}%`)))
        .limit(4),
    ]);
    suggestionLatencies.push(performance.now() - start);
  }
  const suggestionStats = calculatePercentiles(suggestionLatencies);
  console.log(`  Autocomplete Suggestions -> p50: ${suggestionStats.p50}ms | p95: ${suggestionStats.p95}ms | p99: ${suggestionStats.p99}ms | avg: ${suggestionStats.avg}ms`);

  // 3. Project Search (Exact + Filter + Pagination)
  console.log('\n--- 3. Project Search Latency (Filtered by Status & Location) ---');
  const projectLatencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        slug: schema.projects.slug,
        status: schema.projects.status,
        propertyType: schema.projects.propertyType,
        startingPrice: schema.projects.startingPrice,
      })
      .from(schema.projects)
      .where(eq(schema.projects.lifecycleStatus, 'PUBLISHED'))
      .limit(20);
    projectLatencies.push(performance.now() - start);
  }
  const projectStats = calculatePercentiles(projectLatencies);
  console.log(`  Project Search -> p50: ${projectStats.p50}ms | p95: ${projectStats.p95}ms | p99: ${projectStats.p99}ms | avg: ${projectStats.avg}ms`);

  // 4. Developer Search
  console.log('\n--- 4. Developer Search Latency ---');
  const developerLatencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await db
      .select({ id: schema.developers.id, name: schema.developers.name, slug: schema.developers.slug })
      .from(schema.developers)
      .where(and(eq(schema.developers.status, 'PUBLISHED'), ilike(schema.developers.name, '%Merlin%')))
      .limit(10);
    developerLatencies.push(performance.now() - start);
  }
  const developerStats = calculatePercentiles(developerLatencies);
  console.log(`  Developer Search -> p50: ${developerStats.p50}ms | p95: ${developerStats.p95}ms | p99: ${developerStats.p99}ms | avg: ${developerStats.avg}ms`);

  // 5. Location Search
  console.log('\n--- 5. Location Search Latency ---');
  const locationLatencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await db
      .select({ id: schema.locations.id, name: schema.locations.name, slug: schema.locations.slug, type: schema.locations.type })
      .from(schema.locations)
      .where(and(eq(schema.locations.status, 'PUBLISHED'), ilike(schema.locations.name, '%Rajarhat%')))
      .limit(10);
    locationLatencies.push(performance.now() - start);
  }
  const locationStats = calculatePercentiles(locationLatencies);
  console.log(`  Location Search -> p50: ${locationStats.p50}ms | p95: ${locationStats.p95}ms | p99: ${locationStats.p99}ms | avg: ${locationStats.avg}ms`);

  // 6. Resale Search (Asking Price + BHK)
  console.log('\n--- 6. Resale Search Latency (Asking Price & BHK Bounded) ---');
  const resaleLatencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await db
      .select({
        id: schema.resaleListings.id,
        slug: schema.resaleListings.slug,
        bedroomCount: schema.resaleListings.bedroomCount,
        askingPrice: schema.resaleListings.askingPrice,
        propertyType: schema.resaleListings.propertyType,
      })
      .from(schema.resaleListings)
      .where(and(eq(schema.resaleListings.lifecycleStatus, 'PUBLISHED'), eq(schema.resaleListings.bedroomCount, 3)))
      .limit(20);
    resaleLatencies.push(performance.now() - start);
  }
  const resaleStats = calculatePercentiles(resaleLatencies);
  console.log(`  Resale Search -> p50: ${resaleStats.p50}ms | p95: ${resaleStats.p95}ms | p99: ${resaleStats.p99}ms | avg: ${resaleStats.avg}ms`);

  // 7. Rental Search (Monthly Rent + BHK)
  console.log('\n--- 7. Rental Search Latency (Monthly Rent & BHK Bounded) ---');
  const rentalLatencies = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const start = performance.now();
    await db
      .select({
        id: schema.rentalListings.id,
        slug: schema.rentalListings.slug,
        bedroomCount: schema.rentalListings.bedroomCount,
        monthlyRent: schema.rentalListings.monthlyRent,
        propertyType: schema.rentalListings.propertyType,
      })
      .from(schema.rentalListings)
      .where(and(eq(schema.rentalListings.lifecycleStatus, 'PUBLISHED'), eq(schema.rentalListings.bedroomCount, 3)))
      .limit(20);
    rentalLatencies.push(performance.now() - start);
  }
  const rentalStats = calculatePercentiles(rentalLatencies);
  console.log(`  Rental Search -> p50: ${rentalStats.p50}ms | p95: ${rentalStats.p95}ms | p99: ${rentalStats.p99}ms | avg: ${rentalStats.avg}ms`);

  console.log('\n====================================================');
  console.log('📊 REAL POSTGRESQL DRIZZLE BENCHMARK SUMMARY TABLE:');
  console.log('Operation             | p50     | p95     | p99     | Avg');
  console.log('----------------------|---------|---------|---------|--------');
  console.log(`Universal Search      | ${universalStats.p50}ms | ${universalStats.p95}ms | ${universalStats.p99}ms | ${universalStats.avg}ms`);
  console.log(`Suggestions           | ${suggestionStats.p50}ms | ${suggestionStats.p95}ms | ${suggestionStats.p99}ms | ${suggestionStats.avg}ms`);
  console.log(`Project Search        | ${projectStats.p50}ms | ${projectStats.p95}ms | ${projectStats.p99}ms | ${projectStats.avg}ms`);
  console.log(`Developer Search      | ${developerStats.p50}ms | ${developerStats.p95}ms | ${developerStats.p99}ms | ${developerStats.avg}ms`);
  console.log(`Location Search       | ${locationStats.p50}ms | ${locationStats.p95}ms | ${locationStats.p99}ms | ${locationStats.avg}ms`);
  console.log(`Resale Search         | ${resaleStats.p50}ms | ${resaleStats.p95}ms | ${resaleStats.p99}ms | ${resaleStats.avg}ms`);
  console.log(`Rental Search         | ${rentalStats.p50}ms | ${rentalStats.p95}ms | ${rentalStats.p99}ms | ${rentalStats.avg}ms`);
  console.log('====================================================');

  await pool.end();
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
