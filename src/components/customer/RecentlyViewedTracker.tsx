'use client';

import { useEffect, useRef } from 'react';
import { useCustomerAuth } from './CustomerAuthContext';
import { useVisitorTelemetry } from '../telemetry/VisitorTelemetryProvider';
import type { AreaBasisType, VisitorEventType } from '@/src/domain/visitorIntelligence/entities';

interface RecentlyViewedTrackerProps {
  resourceType: 'PROJECT' | 'RESALE_LISTING' | 'RENTAL_LISTING' | 'LOCATION' | 'DEVELOPER';
  resourceId: string;
  resourceSlug?: string;
  areaBasis?: AreaBasisType | null;
  metadata?: Record<string, any>;
}

export function RecentlyViewedTracker({
  resourceType,
  resourceId,
  resourceSlug,
  areaBasis,
  metadata,
}: RecentlyViewedTrackerProps) {
  const { customer } = useCustomerAuth();
  const { trackEvent } = useVisitorTelemetry();

  const customerId = customer?.id ?? null;
  const trackEventRef = useRef(trackEvent);
  trackEventRef.current = trackEvent;

  const metadataRef = useRef(metadata);
  metadataRef.current = metadata;

  useEffect(() => {
    if (!resourceId) return;

    const timer = setTimeout(() => {
      // 1. Always record first-party visitor telemetry event (anonymous + authenticated)
      const eventTypeMap: Record<string, VisitorEventType> = {
        PROJECT: 'PROJECT_VIEW',
        RESALE_LISTING: 'RESALE_LISTING_VIEW',
        RENTAL_LISTING: 'RENTAL_LISTING_VIEW',
        LOCATION: 'LOCATION_VIEW',
        DEVELOPER: 'DEVELOPER_VIEW',
      };
      const eventType = eventTypeMap[resourceType] || 'PAGE_VIEW';

      trackEventRef.current({
        eventType,
        entityType: resourceType,
        entityId: resourceId,
        entitySlug: resourceSlug,
        areaBasis: areaBasis || undefined,
        metadata: metadataRef.current || {},
      }).catch(() => {});

      // 2. Also record in customer account recently-viewed if authenticated
      if (
        customerId &&
        (resourceType === 'PROJECT' ||
          resourceType === 'RESALE_LISTING' ||
          resourceType === 'RENTAL_LISTING')
      ) {
        fetch('/api/customer/recently-viewed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceType, resourceId }),
        }).catch(() => {});
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [customerId, resourceType, resourceId, resourceSlug, areaBasis]);

  return null;
}
