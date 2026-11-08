import { MarketEvent } from '../entities';
import { MarketEventType } from '../types';
import { marketEventRepository } from '../repositories/marketEventRepository';

export class MarketEventService {
  /**
   * Records a factual market event with deterministic deduplication by changeFingerprint.
   */
  async recordEvent(params: {
    eventType: MarketEventType;
    resourceType: 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING' | 'LOCATION';
    resourceId: string;
    locationId: string;
    projectId?: string | null;
    previousValue?: string | null;
    newValue?: string | null;
    changeFingerprint?: string;
    metadata?: Record<string, any> | null;
  }): Promise<MarketEvent> {
    const fingerprint =
      params.changeFingerprint ||
      `${params.eventType}_${params.resourceId}_${params.previousValue || ''}_${params.newValue || ''}`;

    const existing = await marketEventRepository.findByFingerprint(
      params.locationId,
      params.eventType,
      params.resourceId,
      fingerprint
    );

    if (existing) return existing;

    const id = `ev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return await marketEventRepository.createEvent({
      id,
      eventType: params.eventType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      locationId: params.locationId,
      projectId: params.projectId || null,
      previousValue: params.previousValue || null,
      newValue: params.newValue || null,
      changeFingerprint: fingerprint,
      metadata: params.metadata || null,
      eventDate: new Date(),
    });
  }

  async getEventsForLocation(locationId: string, limit = 20): Promise<MarketEvent[]> {
    return await marketEventRepository.getEventsForLocation(locationId, limit);
  }

  async getEventsForLocations(locationIds: string[], limit = 20): Promise<MarketEvent[]> {
    return await marketEventRepository.getEventsForLocations(locationIds, limit);
  }

  async getLatestEvents(limit = 20): Promise<MarketEvent[]> {
    return await marketEventRepository.getLatestEvents(limit);
  }
}

export const marketEventService = new MarketEventService();
