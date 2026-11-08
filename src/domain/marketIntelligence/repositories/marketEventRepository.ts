import { MarketEvent } from '../entities';
import { MarketEventType } from '../types';
import { getDb } from '../../../db/client';
import { marketEvents } from '../../../db/schema';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { ensureSeedData } from '../../../infrastructure/seed';
import { locationRepository } from '../../../infrastructure/repositories/locationProvider';
import { projectRepository } from '../../../infrastructure/repositories/projectProvider';

export interface MarketEventRepository {
  createEvent(data: Omit<MarketEvent, 'createdAt'>): Promise<MarketEvent>;
  getEventsForLocation(locationId: string, limit?: number): Promise<MarketEvent[]>;
  getEventsForLocations(locationIds: string[], limit?: number): Promise<MarketEvent[]>;
  getLatestEvents(limit?: number): Promise<MarketEvent[]>;
  findByFingerprint(locationId: string, eventType: MarketEventType, resourceId: string, fingerprint: string): Promise<MarketEvent | null>;
}

export class MarketEventRepositoryPostgres implements MarketEventRepository {
  private memoryEvents: MarketEvent[] = [];
  private memorySeeded = false;

  private async ensureMemoryEventsSeeded(): Promise<void> {
    if (this.memorySeeded) return;
    this.memorySeeded = true;
    try {
      await ensureSeedData();
      const allProjects = await projectRepository.findAll();
      const allLocations = await locationRepository.findAll();

      const rajarhat = allLocations.find(l => l.slug === 'rajarhat');
      const newTown = allLocations.find(l => l.slug === 'new-town');
      const kolkata = allLocations.find(l => l.slug === 'kolkata');

      const merlinRise = allProjects.find(p => p.slug === 'merlin-rise');
      const psOne10 = allProjects.find(p => p.slug === 'ps-one10');
      const siddhaHappyville = allProjects.find(p => p.slug === 'siddha-happyville');
      const merlinFourth = allProjects.find(p => p.slug === 'merlin-the-fourth');

      const baseDate = new Date('2026-10-05T10:00:00Z');
      const seedDefs: Array<{
        id: string;
        eventType: MarketEventType;
        resourceType: 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING' | 'LOCATION';
        resourceId: string;
        locationId: string;
        projectId: string | null;
        previousValue: string | null;
        newValue: string | null;
        metadata: Record<string, any> | null;
        daysAgo: number;
      }> = [];

      if (merlinRise && rajarhat) {
        seedDefs.push(
          {
            id: 'ev_seed_merlin_rise_rera',
            eventType: 'PROJECT_RERA_VERIFIED',
            resourceType: 'PROJECT',
            resourceId: merlinRise.id,
            locationId: rajarhat.id,
            projectId: merlinRise.id,
            previousValue: 'PROVIDED',
            newValue: 'VERIFIED',
            metadata: { reraStatus: 'VERIFIED' },
            daysAgo: 1,
          },
          {
            id: 'ev_seed_merlin_rise_config',
            eventType: 'PROJECT_CONFIGURATION_UPDATED',
            resourceType: 'PROJECT',
            resourceId: merlinRise.id,
            locationId: rajarhat.id,
            projectId: merlinRise.id,
            previousValue: null,
            newValue: '3 BHK',
            metadata: { bhkType: '3 BHK', priceBasis: 'CARPET_AREA' },
            daysAgo: 3,
          }
        );
      }

      if (psOne10 && newTown) {
        seedDefs.push(
          {
            id: 'ev_seed_ps_one10_rera',
            eventType: 'PROJECT_RERA_VERIFIED',
            resourceType: 'PROJECT',
            resourceId: psOne10.id,
            locationId: newTown.id,
            projectId: psOne10.id,
            previousValue: 'PROVIDED',
            newValue: 'VERIFIED',
            metadata: { reraStatus: 'VERIFIED' },
            daysAgo: 2,
          },
          {
            id: 'ev_seed_ps_one10_status',
            eventType: 'PROJECT_STATUS_CHANGED',
            resourceType: 'PROJECT',
            resourceId: psOne10.id,
            locationId: newTown.id,
            projectId: psOne10.id,
            previousValue: 'UNDER_CONSTRUCTION',
            newValue: 'READY_TO_MOVE',
            metadata: { status: 'READY_TO_MOVE' },
            daysAgo: 5,
          }
        );
      }

      if (siddhaHappyville && rajarhat) {
        seedDefs.push({
          id: 'ev_seed_siddha_published',
          eventType: 'PROJECT_PUBLISHED',
          resourceType: 'PROJECT',
          resourceId: siddhaHappyville.id,
          locationId: rajarhat.id,
          projectId: siddhaHappyville.id,
          previousValue: null,
          newValue: 'PUBLISHED',
          metadata: { status: siddhaHappyville.status },
          daysAgo: 4,
        });
      }

      if (merlinFourth && kolkata) {
        seedDefs.push({
          id: 'ev_seed_merlin_fourth_price',
          eventType: 'PROJECT_PRICE_CHANGED',
          resourceType: 'PROJECT',
          resourceId: merlinFourth.id,
          locationId: merlinFourth.locationId || kolkata.id,
          projectId: merlinFourth.id,
          previousValue: null,
          newValue: String(merlinFourth.startingPrice || ''),
          metadata: { priceBasis: 'CARPET_AREA' },
          daysAgo: 6,
        });
      }

      for (const item of seedDefs) {
        if (this.memoryEvents.some(e => e.id === item.id)) continue;
        const evDate = new Date(baseDate.getTime() - item.daysAgo * 24 * 60 * 60 * 1000);
        this.memoryEvents.push({
          id: item.id,
          eventType: item.eventType,
          resourceType: item.resourceType,
          resourceId: item.resourceId,
          locationId: item.locationId,
          projectId: item.projectId,
          previousValue: item.previousValue,
          newValue: item.newValue,
          changeFingerprint: `${item.eventType}_${item.resourceId}_${item.newValue || ''}`,
          metadata: item.metadata,
          eventDate: evDate,
          createdAt: evDate,
        });
      }
    } catch {
      // ignore seed fallback errors
    }
  }

  async createEvent(data: Omit<MarketEvent, 'createdAt'>): Promise<MarketEvent> {
    const db = getDb();
    const now = new Date();

    const event: MarketEvent = {
      ...data,
      createdAt: now,
    };

    if (db) {
      try {
        await db
          .insert(marketEvents)
          .values({
            id: data.id,
            eventType: data.eventType,
            resourceType: data.resourceType,
            resourceId: data.resourceId,
            locationId: data.locationId,
            projectId: data.projectId || null,
            previousValue: data.previousValue || null,
            newValue: data.newValue || null,
            changeFingerprint: data.changeFingerprint,
            metadata: data.metadata || null,
            eventDate: data.eventDate || now,
            createdAt: now,
          } as any)
          .onConflictDoNothing();
      } catch (err) {
        console.warn('Market event insert deduplicated or failed:', err);
      }
    } else {
      await this.ensureMemoryEventsSeeded();
      this.memoryEvents.unshift(event);
    }

    return event;
  }

  async getEventsForLocation(locationId: string, limit = 20): Promise<MarketEvent[]> {
    const db = getDb();
    if (!db) {
      await this.ensureMemoryEventsSeeded();
      return this.memoryEvents
        .filter(e => e.locationId === locationId)
        .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
        .slice(0, limit);
    }

    const rows = await db
      .select()
      .from(marketEvents)
      .where(eq(marketEvents.locationId, locationId))
      .orderBy(desc(marketEvents.eventDate), asc(marketEvents.id))
      .limit(limit);

    return rows.map(r => this.mapRowToEvent(r));
  }

  async getEventsForLocations(locationIds: string[], limit = 20): Promise<MarketEvent[]> {
    if (locationIds.length === 0) return [];
    const db = getDb();
    if (!db) {
      await this.ensureMemoryEventsSeeded();
      const idSet = new Set(locationIds);
      return this.memoryEvents
        .filter(e => idSet.has(e.locationId))
        .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
        .slice(0, limit);
    }

    const rows = await db
      .select()
      .from(marketEvents)
      .where(inArray(marketEvents.locationId, locationIds))
      .orderBy(desc(marketEvents.eventDate), asc(marketEvents.id))
      .limit(limit);

    return rows.map(r => this.mapRowToEvent(r));
  }

  async getLatestEvents(limit = 20): Promise<MarketEvent[]> {
    const db = getDb();
    if (!db) {
      await this.ensureMemoryEventsSeeded();
      return [...this.memoryEvents]
        .sort((a, b) => b.eventDate.getTime() - a.eventDate.getTime())
        .slice(0, limit);
    }

    const rows = await db
      .select()
      .from(marketEvents)
      .orderBy(desc(marketEvents.eventDate), asc(marketEvents.id))
      .limit(limit);

    return rows.map(r => this.mapRowToEvent(r));
  }

  async findByFingerprint(locationId: string, eventType: MarketEventType, resourceId: string, fingerprint: string): Promise<MarketEvent | null> {
    const db = getDb();
    if (!db) {
      await this.ensureMemoryEventsSeeded();
      return (
        this.memoryEvents.find(
          e =>
            e.locationId === locationId &&
            e.eventType === eventType &&
            e.resourceId === resourceId &&
            e.changeFingerprint === fingerprint
        ) || null
      );
    }

    const [row] = await db
      .select()
      .from(marketEvents)
      .where(
        and(
          eq(marketEvents.locationId, locationId),
          eq(marketEvents.eventType, eventType),
          eq(marketEvents.resourceId, resourceId),
          eq(marketEvents.changeFingerprint, fingerprint)
        )
      )
      .limit(1);

    if (!row) return null;
    return this.mapRowToEvent(row);
  }

  private mapRowToEvent(row: any): MarketEvent {
    return {
      id: row.id,
      eventType: row.eventType as MarketEventType,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      locationId: row.locationId,
      projectId: row.projectId || null,
      previousValue: row.previousValue || null,
      newValue: row.newValue || null,
      changeFingerprint: row.changeFingerprint,
      metadata: row.metadata || null,
      eventDate: new Date(row.eventDate),
      createdAt: new Date(row.createdAt),
    };
  }
}

export const marketEventRepository = new MarketEventRepositoryPostgres();
