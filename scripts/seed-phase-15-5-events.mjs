import { getDb } from '../src/db/client';
import { locations, projects, marketEvents } from '../src/db/schema';
import { eq, inArray } from 'drizzle-orm';

async function seedPhase155Events() {
  console.log('Seeding Phase 15.5 Market Events into PostgreSQL...');
  const db = getDb();
  if (!db) {
    console.error('Database connection not available');
    process.exit(1);
  }

  const targetSlugs = ['rajarhat', 'new-town', 'salt-lake', 'em-bypass'];
  const locRows = await db.select().from(locations).where(inArray(locations.slug, targetSlugs));
  console.log(`Found ${locRows.length} target locations`);

  const locMap = new Map(locRows.map(l => [l.slug, l]));

  for (const slug of targetSlugs) {
    const loc = locMap.get(slug);
    if (!loc) continue;

    // Get published projects for this location
    const projRows = await db
      .select()
      .from(projects)
      .where(eq(projects.locationId, loc.id))
      .limit(5);

    console.log(`Location ${loc.name} (${loc.slug}) has ${projRows.length} projects`);

    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    const sampleEvents = [];

    if (projRows.length > 0) {
      const p1 = projRows[0];
      sampleEvents.push({
        id: `ev_${loc.slug}_rera_${p1.id.substring(0, 8)}`,
        eventType: 'PROJECT_RERA_VERIFIED',
        resourceType: 'PROJECT',
        resourceId: p1.id,
        locationId: loc.id,
        projectId: p1.id,
        previousValue: 'PROVIDED',
        newValue: 'VERIFIED',
        changeFingerprint: `RERA_VERIFIED_${p1.id}_202610`,
        metadata: { reraStatus: 'VERIFIED', registrationNumber: 'WBRERA/P/KOL/2023/000123' },
        eventDate: new Date(now.getTime() - 2 * oneDay),
      });

      sampleEvents.push({
        id: `ev_${loc.slug}_config_${p1.id.substring(0, 8)}`,
        eventType: 'PROJECT_CONFIGURATION_ADDED',
        resourceType: 'PROJECT',
        resourceId: p1.id,
        locationId: loc.id,
        projectId: p1.id,
        previousValue: null,
        newValue: '3 BHK',
        changeFingerprint: `CONFIG_ADDED_${p1.id}_3BHK`,
        metadata: { bhkType: '3 BHK', unitType: 'APARTMENT' },
        eventDate: new Date(now.getTime() - 5 * oneDay),
      });

      sampleEvents.push({
        id: `ev_${loc.slug}_status_${p1.id.substring(0, 8)}`,
        eventType: 'PROJECT_STATUS_CHANGED',
        resourceType: 'PROJECT',
        resourceId: p1.id,
        locationId: loc.id,
        projectId: p1.id,
        previousValue: 'NEW_LAUNCH',
        newValue: 'UNDER_CONSTRUCTION',
        changeFingerprint: `STATUS_CHANGED_${p1.id}_UNDER_CONSTRUCTION`,
        metadata: { previousStatus: 'NEW_LAUNCH', newStatus: 'UNDER_CONSTRUCTION' },
        eventDate: new Date(now.getTime() - 10 * oneDay),
      });
    }

    if (projRows.length > 1) {
      const p2 = projRows[1];
      sampleEvents.push({
        id: `ev_${loc.slug}_pub_${p2.id.substring(0, 8)}`,
        eventType: 'PROJECT_PUBLISHED',
        resourceType: 'PROJECT',
        resourceId: p2.id,
        locationId: loc.id,
        projectId: p2.id,
        previousValue: 'DRAFT',
        newValue: 'PUBLISHED',
        changeFingerprint: `PROJECT_PUBLISHED_${p2.id}`,
        metadata: { status: 'PUBLISHED' },
        eventDate: new Date(now.getTime() - 15 * oneDay),
      });

      sampleEvents.push({
        id: `ev_${loc.slug}_poss_${p2.id.substring(0, 8)}`,
        eventType: 'PROJECT_POSSESSION_UPDATED',
        resourceType: 'PROJECT',
        resourceId: p2.id,
        locationId: loc.id,
        projectId: p2.id,
        previousValue: null,
        newValue: 'Dec 2027',
        changeFingerprint: `POSSESSION_UPDATED_${p2.id}_2027`,
        metadata: { possessionDate: '2027-12-31' },
        eventDate: new Date(now.getTime() - 20 * oneDay),
      });
    }

    // Add resale and rental market events
    sampleEvents.push({
      id: `ev_${loc.slug}_resale_list`,
      eventType: 'RESALE_LISTING_PUBLISHED',
      resourceType: 'RESALE_LISTING',
      resourceId: `resale_${loc.slug}_sample_1`,
      locationId: loc.id,
      projectId: projRows[0]?.id || null,
      previousValue: null,
      newValue: 'PUBLISHED',
      changeFingerprint: `RESALE_PUB_${loc.slug}_sample_1`,
      metadata: { bhkType: '2 BHK', priceBasis: 'CARPET_AREA' },
      eventDate: new Date(now.getTime() - 7 * oneDay),
    });

    sampleEvents.push({
      id: `ev_${loc.slug}_rental_list`,
      eventType: 'RENTAL_LISTING_PUBLISHED',
      resourceType: 'RENTAL_LISTING',
      resourceId: `rental_${loc.slug}_sample_1`,
      locationId: loc.id,
      projectId: projRows[0]?.id || null,
      previousValue: null,
      newValue: 'PUBLISHED',
      changeFingerprint: `RENTAL_PUB_${loc.slug}_sample_1`,
      metadata: { bhkType: '3 BHK' },
      eventDate: new Date(now.getTime() - 12 * oneDay),
    });

    for (const ev of sampleEvents) {
      await db
        .insert(marketEvents)
        .values({
          id: ev.id,
          eventType: ev.eventType,
          resourceType: ev.resourceType,
          resourceId: ev.resourceId,
          locationId: ev.locationId,
          projectId: ev.projectId,
          previousValue: ev.previousValue,
          newValue: ev.newValue,
          changeFingerprint: ev.changeFingerprint,
          metadata: ev.metadata,
          eventDate: ev.eventDate,
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }

  console.log('Phase 15.5 Market Events seeded successfully!');
}

seedPhase155Events().catch(console.error);
