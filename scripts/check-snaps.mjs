import { getDb } from '../src/db/client.js';
import { locationMarketSnapshots } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import { locationService } from '../src/domain/locations/services/locationService.js';
import { snapshotGenerationService } from '../src/domain/marketIntelligence/services/snapshotGenerationService.js';

async function checkSnapshots() {
  const loc = await locationService.resolveLocationBySlug('rajarhat', { publishedOnly: true });
  if (!loc) {
    console.log('Location not found');
    return;
  }
  const db = getDb();
  await snapshotGenerationService.generateSnapshot(loc.id, '2026-10-06');
  const snaps = await db.select().from(locationMarketSnapshots).where(eq(locationMarketSnapshots.locationId, loc.id));
  console.log('Snapshots count:', snaps.length);
}
checkSnapshots();
