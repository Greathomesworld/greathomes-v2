'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import type { IngestTelemetryEventInput } from '@/src/domain/visitorIntelligence/entities';

interface VisitorTelemetryContextValue {
  visitorId: string | null;
  sessionId: string | null;
  optedOut: boolean;
  trackEvent: (event: IngestTelemetryEventInput) => Promise<void>;
  setOptOut: (optOut: boolean) => Promise<void>;
}

const VisitorTelemetryContext = createContext<VisitorTelemetryContextValue>({
  visitorId: null,
  sessionId: null,
  optedOut: false,
  trackEvent: async () => {},
  setOptOut: async () => {},
});

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isBrowserPrivacyOptOut(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as any;
  if (nav?.doNotTrack === '1' || nav?.globalPrivacyControl === true) {
    return true;
  }
  const cookieVal = readCookie('gh_telemetry_opt_out');
  return cookieVal === '1' || cookieVal === 'true';
}

function RouteTelemetryObserver({
  optedOut,
  trackEvent,
}: {
  optedOut: boolean;
  trackEvent: (event: IngestTelemetryEventInput) => Promise<void>;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPathRef = useRef<string | null>(null);
  const pageEnterTimestampRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!pathname || pathname.startsWith('/admin')) return;
    if (isBrowserPrivacyOptOut() || optedOut) return;

    const searchStr = searchParams?.toString() ? `?${searchParams.toString()}` : '';
    const fullKey = `${pathname}${searchStr}`;
    if (lastTrackedPathRef.current === fullKey) return;

    const now = Date.now();
    const prevDurationSeconds = lastTrackedPathRef.current
      ? Math.max(1, Math.round((now - pageEnterTimestampRef.current) / 1000))
      : undefined;

    lastTrackedPathRef.current = fullKey;
    pageEnterTimestampRef.current = now;

    trackEvent({
      eventType: 'PAGE_VIEW',
      pagePath: pathname,
      durationSeconds: prevDurationSeconds,
      clientEventId: `PAGE_VIEW:${fullKey}:${Math.floor(now / 5000)}`,
    });

    if (
      searchParams &&
      (pathname === '/projects' || pathname === '/buy' || pathname === '/rent' || pathname === '/locations')
    ) {
      const q = searchParams.get('q') || searchParams.get('search') || '';
      const location = searchParams.get('location') || searchParams.get('locality') || '';
      const bhk = searchParams.get('bhk') || searchParams.get('bedrooms') || '';
      const propertyType = searchParams.get('propertyType') || searchParams.get('type') || '';
      const areaBasis = searchParams.get('areaBasis') as any;

      if (q || location || bhk || propertyType) {
        trackEvent({
          eventType: q ? 'SEARCH_EXECUTED' : 'FILTER_APPLIED',
          pagePath: pathname,
          entityType: 'SEARCH',
          areaBasis: ['CARPET', 'BUILT_UP', 'SUPER_BUILT_UP'].includes(areaBasis)
            ? areaBasis
            : undefined,
          clientEventId: `SEARCH:${fullKey}:${Math.floor(now / 5000)}`,
          metadata: {
            query: q || null,
            location: location || null,
            bhk: bhk || null,
            propertyType: propertyType || null,
          },
        });
      }
    }
  }, [pathname, searchParams, optedOut, trackEvent]);

  return null;
}

export function VisitorTelemetryProvider({ children }: { children: React.ReactNode }) {
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState<boolean>(false);

  useEffect(() => {
    const initialOptOut = isBrowserPrivacyOptOut();
    setOptedOut(initialOptOut);
    if (!initialOptOut) {
      setVisitorId(readCookie('gh_visitor_id'));
      setSessionId(readCookie('gh_session_id'));
    }
  }, []);

  const trackEvent = useCallback(
    async (event: IngestTelemetryEventInput) => {
      if (typeof window === 'undefined') return;
      if (isBrowserPrivacyOptOut() || optedOut) return;
      const currentPath = event.pagePath || window.location.pathname;
      if (currentPath.startsWith('/admin')) return;

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const payload: IngestTelemetryEventInput = {
          visitorId: readCookie('gh_visitor_id') || visitorId || undefined,
          sessionId: readCookie('gh_session_id') || sessionId || undefined,
          clientEventId:
            event.clientEventId ||
            (event.metadata?.query
              ? `${event.eventType}:${currentPath}:q_${encodeURIComponent(String(event.metadata.query).trim().toLowerCase())}:${Math.floor(Date.now() / 2000)}`
              : event.metadata?.filterKey
              ? `${event.eventType}:${currentPath}:fk_${encodeURIComponent(String(event.metadata.filterKey))}_${encodeURIComponent(String(event.metadata.filterValue || ''))}:${Math.floor(Date.now() / 2000)}`
              : `${event.eventType}:${currentPath}:${event.entityId || ''}:${Math.floor(Date.now() / 2000)}`),
          pagePath: currentPath,
          pageTitle: event.pageTitle || document.title || undefined,
          referrerUrl: event.referrerUrl ?? (document.referrer || undefined),
          utmSource: event.utmSource ?? (urlParams.get('utm_source') || undefined),
          utmMedium: event.utmMedium ?? (urlParams.get('utm_medium') || undefined),
          utmCampaign: event.utmCampaign ?? (urlParams.get('utm_campaign') || undefined),
          utmTerm: event.utmTerm ?? (urlParams.get('utm_term') || undefined),
          utmContent: event.utmContent ?? (urlParams.get('utm_content') || undefined),
          ...event,
        };

        const res = await fetch('/api/telemetry/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.visitorId) setVisitorId(data.visitorId);
          if (data?.sessionId) setSessionId(data.sessionId);
        }
      } catch {
        // Non-blocking telemetry
      }
    },
    [optedOut, sessionId, visitorId]
  );

  const setOptOut = useCallback(async (nextOptOut: boolean) => {
    setOptedOut(nextOptOut);
    if (nextOptOut) {
      setVisitorId(null);
      setSessionId(null);
    }
    try {
      const res = await fetch('/api/telemetry/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'SET_OPT_OUT', optOut: nextOptOut }),
      });
      if (res.ok && !nextOptOut) {
        setVisitorId(readCookie('gh_visitor_id'));
        setSessionId(readCookie('gh_session_id'));
      }
    } catch {
      // Non-blocking
    }
  }, []);

  return (
    <VisitorTelemetryContext.Provider
      value={{
        visitorId,
        sessionId,
        optedOut,
        trackEvent,
        setOptOut,
      }}
    >
      <React.Suspense fallback={null}>
        <RouteTelemetryObserver optedOut={optedOut} trackEvent={trackEvent} />
      </React.Suspense>
      {children}
    </VisitorTelemetryContext.Provider>
  );
}

export function useVisitorTelemetry() {
  return useContext(VisitorTelemetryContext);
}
