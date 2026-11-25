'use client';

import { Suspense, useEffect, useRef } from 'react';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';

const DEFAULT_GA_MEASUREMENT_ID = 'G-4X3HD89F2M';
const GA_ID_PATTERN = /^G-[A-Z0-9]+$/i;

const EXCLUDED_PATH_PREFIXES = ['/admin', '/compression-gallery'];

function resolveMeasurementId(): string | null {
  const raw = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID).trim();
  return GA_ID_PATTERN.test(raw) ? raw : null;
}

function isExcludedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackGaEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
    return;
  }
  window.gtag('event', eventName, params || {});
}

function GoogleAnalyticsPageViewTracker({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedUrlRef = useRef<string | null>(null);
  const queryString = searchParams?.toString() ?? '';

  useEffect(() => {
    if (!pathname || isExcludedPath(pathname)) {
      return;
    }

    const pagePath = queryString ? `${pathname}?${queryString}` : pathname;
    if (lastTrackedUrlRef.current === pagePath) {
      return;
    }
    lastTrackedUrlRef.current = pagePath;

    // Ensure dataLayer & gtag queue exist even before gtag.js finishes downloading.
    // gtag.js expects the native `arguments` object (not a plain Array) in dataLayer.
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      };
    }

    window.gtag('event', 'page_view', {
      send_to: measurementId,
      page_path: pagePath,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [measurementId, pathname, queryString]);

  return null;
}

export function GoogleAnalytics() {
  const measurementId = resolveMeasurementId();
  if (!measurementId) {
    return null;
  }

  return (
    <>
      <Script
        id="ga4-gtag-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-gtag-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
      <Suspense fallback={null}>
        <GoogleAnalyticsPageViewTracker measurementId={measurementId} />
      </Suspense>
    </>
  );
}
