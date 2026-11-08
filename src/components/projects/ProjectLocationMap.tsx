'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, MapPinOff, Plus, Minus, RotateCcw, ShieldCheck, AlertCircle } from 'lucide-react';
import { MapCoordinates, MapInstance, MapMarker } from '@/src/domain/locations/map/types';
import { cartoMapProvider } from '@/src/infrastructure/maps/carto/cartoProvider';
import {
  isValidCoordinate,
  CoordinateSource,
  ProjectLocationStatus,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';

export interface ProjectLocationMapProps {
  coordinates: MapCoordinates | null;
  projectName: string;
  locationName: string;
  locationStatus?: ProjectLocationStatus;
  coordinateSource?: CoordinateSource;
  nearbyMarkers?: MapMarker[];
  className?: string;
}

/**
 * Formats decimal coordinates into standard geographic display (e.g. "22.5958° N, 88.4632° E").
 * Returns empty string if coordinates are missing or invalid.
 */
export function formatCoordinates(lat?: number | null, lng?: number | null): string | null {
  if (
    lat === null ||
    lat === undefined ||
    lng === null ||
    lng === undefined ||
    !isValidCoordinate(lat, lng)
  ) {
    return null;
  }
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

export function ProjectLocationMap({
  coordinates,
  projectName,
  locationName,
  locationStatus,
  coordinateSource,
  nearbyMarkers,
  className = '',
}: ProjectLocationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [currentZoom, setCurrentZoom] = useState<number>(15);

  const isLocalityReference =
    coordinateSource === 'LOCATION' && locationStatus !== 'APPROXIMATE_LOCATION';
  const isApproximateProject = locationStatus === 'APPROXIMATE_LOCATION';
  const isApproximate = isApproximateProject || isLocalityReference;
  const defaultZoom = isApproximate ? 13 : 15;
  const markerTitle = isLocalityReference
    ? locationName
    : isApproximateProject
      ? `${locationName} (Approximate Locality)`
      : projectName;

  const lat = coordinates?.latitude ?? null;
  const lng = coordinates?.longitude ?? null;
  const hasValidCoords =
    lat !== null &&
    lng !== null &&
    isValidCoordinate(lat, lng);

  const nearbyMarkersRef = useRef<MapMarker[] | undefined>(nearbyMarkers);
  nearbyMarkersRef.current = nearbyMarkers;

  const nearbyMarkersKey = JSON.stringify(
    (nearbyMarkers || []).map((m) => [
      m.id,
      m.coordinates?.latitude ?? null,
      m.coordinates?.longitude ?? null,
      m.title ?? '',
    ])
  );

  const handleRecenter = useCallback(() => {
    if (mapInstanceRef.current && hasValidCoords && lat !== null && lng !== null) {
      mapInstanceRef.current.setCenter({ latitude: lat, longitude: lng }, 15);
      setCurrentZoom(15);
    }
  }, [lat, lng, hasValidCoords]);

  const handleZoomIn = useCallback(() => {
    if (mapInstanceRef.current) {
      const nextZoom = Math.min(18, currentZoom + 1);
      mapInstanceRef.current.setZoom(nextZoom);
      setCurrentZoom(nextZoom);
    }
  }, [currentZoom]);

  const handleZoomOut = useCallback(() => {
    if (mapInstanceRef.current) {
      const nextZoom = Math.max(11, currentZoom - 1);
      mapInstanceRef.current.setZoom(nextZoom);
      setCurrentZoom(nextZoom);
    }
  }, [currentZoom]);

  const handleRetry = useCallback(() => {
    setMapStatus('loading');
    if (mapContainerRef.current && hasValidCoords && lat !== null && lng !== null) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
      try {
        const centerCoords = { latitude: lat, longitude: lng };
        const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
        const instance = cartoMapProvider.createInteractiveMap({
          container: mapContainerRef.current,
          initialViewport: {
            center: centerCoords,
            zoom: defaultZoom,
          },
          marker: {
            id: `project-${lat}-${lng}`,
            coordinates: centerCoords,
            title: markerTitle,
            category: 'PROJECT',
          },
          nearbyMarkers: nearbyMarkersRef.current,
          theme: isDark ? 'dark' : 'light',
          onLoad: () => {
            setMapStatus('ready');
          },
          onError: () => {
            setMapStatus('error');
          },
          onViewportChange: (vp) => {
            setCurrentZoom(vp.zoom);
          },
        });
        mapInstanceRef.current = instance;
      } catch {
        setMapStatus('error');
      }
    }
  }, [lat, lng, hasValidCoords, markerTitle, defaultZoom, nearbyMarkersKey]);

  useEffect(() => {
    if (!hasValidCoords || lat === null || lng === null || !mapContainerRef.current) {
      return;
    }

    let isMounted = true;
    setMapStatus('loading');

    // Clean up any stale map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }

    try {
      const centerCoords = { latitude: lat, longitude: lng };
      const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      const instance = cartoMapProvider.createInteractiveMap({
        container: mapContainerRef.current,
        initialViewport: {
          center: centerCoords,
          zoom: defaultZoom,
        },
        marker: {
          id: `project-${lat}-${lng}`,
          coordinates: centerCoords,
          title: markerTitle,
          category: 'PROJECT',
        },
        nearbyMarkers: nearbyMarkersRef.current,
        theme: isDark ? 'dark' : 'light',
        onLoad: () => {
          if (isMounted) setMapStatus('ready');
        },
        onError: () => {
          if (isMounted) setMapStatus('error');
        },
        onViewportChange: (vp) => {
          if (isMounted) setCurrentZoom(vp.zoom);
        },
      });

      mapInstanceRef.current = instance;
    } catch {
      if (isMounted) setMapStatus('error');
    }

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [lat, lng, hasValidCoords, markerTitle, defaultZoom, nearbyMarkersKey]);

  // Case B: Null / Missing / Invalid coordinates
  if (!hasValidCoords || !coordinates) {
    return (
      <div
        role="region"
        aria-label="Map location unavailable"
        className={`w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9] min-h-[280px] rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] flex flex-col items-center justify-center p-6 text-center overflow-hidden ${className}`}
      >
        <div className="w-12 h-12 rounded-full bg-[var(--color-foreground)]/[0.04] border border-[var(--color-border)] flex items-center justify-center mb-3 text-[var(--color-foreground)]/40">
          <MapPinOff className="w-5 h-5" aria-hidden="true" />
        </div>
        <h3 className="font-display font-medium text-sm text-[var(--color-foreground)]">
          Map location unavailable
        </h3>
        <p className="text-xs text-[var(--color-foreground)]/60 max-w-sm mt-1 leading-relaxed">
          We&apos;re currently verifying the exact project location for {projectName} in {locationName}.
        </p>
      </div>
    );
  }

  const { latitude, longitude } = coordinates;
  const formattedCoords = formatCoordinates(latitude, longitude);

  // Case C: Provider Failure (Valid Coordinates, but CARTO failed)
  if (mapStatus === 'error') {
    return (
      <div
        role="region"
        aria-label="Interactive map unavailable"
        className={`relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9] min-h-[280px] rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] flex flex-col items-center justify-center p-6 text-center overflow-hidden ${className}`}
      >
        <div className="w-12 h-12 rounded-full bg-[#E85D3F]/10 border border-[#E85D3F]/20 flex items-center justify-center mb-3 text-[#E85D3F]">
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
        </div>
        <h3 className="font-display font-semibold text-sm text-[var(--color-foreground)]">
          Map unavailable
        </h3>
        <p className="text-xs text-[var(--color-foreground)]/65 max-w-sm mt-1 leading-relaxed">
          The project location is verified, but the interactive map could not be loaded.
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-[var(--color-border)] text-xs font-mono text-[var(--color-foreground)]/80">
          <MapPin className="w-3.5 h-3.5 text-[#E85D3F]" />
          <span>{formattedCoords}</span>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="mt-4 min-h-[40px] px-4 py-2 rounded-lg bg-[var(--color-foreground)]/5 hover:bg-[var(--color-foreground)]/10 text-xs font-display font-medium text-[var(--color-foreground)] transition-colors inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Retry Loading Map</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={`Interactive map showing the location of ${projectName} in ${locationName}`}
      data-map-container="true"
      data-map-provider="CARTO"
      className={`relative w-full aspect-[4/3] sm:aspect-[16/10] md:aspect-[16/9] min-h-[280px] rounded-xl border border-[var(--color-border)] bg-[#FAFAF8] overflow-hidden shadow-2xs ${className}`}
    >
      {/* Interactive CARTO Canvas/Tile Mount Target */}
      <div
        ref={mapContainerRef}
        className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing select-none"
      />

      {/* Loading Overlay */}
      {mapStatus === 'loading' && (
        <div 
          aria-hidden="true"
          className="absolute inset-0 bg-[#FAFAF8]/85 backdrop-blur-xs flex flex-col items-center justify-center z-20 transition-opacity duration-300"
        >
          <div className="w-8 h-8 rounded-full border-2 border-[var(--color-border)] border-t-[#E85D3F] animate-spin mb-2" />
          <span className="text-xs font-display font-medium text-[var(--color-foreground)]/70">
            Loading map…
          </span>
        </div>
      )}

      {/* Top Floating Badge: Location & Coordinates (Safe area bounded on mobile) */}
      <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 z-10 flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-none max-w-[calc(100%-100px)]">
        <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-white/95 backdrop-blur-sm border border-[var(--color-border)] shadow-xs pointer-events-auto min-w-0">
          <MapPin className="w-3.5 h-3.5 text-[#E85D3F] shrink-0" aria-hidden="true" />
          <span className="text-xs font-display font-semibold text-[#111111] truncate">
            {locationName}
          </span>
        </div>

        <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-[var(--color-border)] text-[11px] font-mono text-[var(--color-foreground)]/80 pointer-events-auto shadow-xs">
          <span>{formattedCoords}</span>
        </div>
      </div>

      {/* Top Right Floating Controls: Zoom & Recenter with 40-44px touch targets on mobile */}
      <div 
        aria-label="Map Controls"
        className="absolute top-2.5 sm:top-3 right-2.5 sm:right-3 z-10 flex flex-col gap-1.5 pointer-events-auto"
      >
        <div className="flex flex-col rounded-lg bg-white/95 backdrop-blur-sm border border-[var(--color-border)] shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom in map"
            className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/[0.06] active:bg-[var(--color-foreground)]/[0.1] transition-colors border-b border-[var(--color-border)]/50 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom out map"
            className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-[var(--color-foreground)]/80 hover:text-[var(--color-foreground)] hover:bg-[var(--color-foreground)]/[0.06] active:bg-[var(--color-foreground)]/[0.1] transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
          >
            <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleRecenter}
          aria-label="Recenter map on project"
          title="Recenter on project"
          className="w-10 h-10 sm:w-8 sm:h-8 rounded-lg bg-white/95 backdrop-blur-sm border border-[var(--color-border)] shadow-xs flex items-center justify-center text-[var(--color-foreground)]/80 hover:text-[#E85D3F] hover:bg-[var(--color-foreground)]/[0.06] active:bg-[var(--color-foreground)]/[0.1] transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#E85D3F]"
        >
          <RotateCcw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </div>

      {/* Bottom Floating Badge: Coordinate Precision Status */}
      <div className="absolute bottom-2.5 sm:bottom-3 right-2.5 sm:right-3 z-10 pointer-events-none hidden sm:block">
        {isLocalityReference ? (
          <div
            data-location-status="LOCALITY_REFERENCE_MAP"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-sm border border-[var(--color-border)] text-[11px] font-medium text-[#111111]/80 shadow-xs"
          >
            <MapPin className="w-3.5 h-3.5 text-[#E85D3F]" aria-hidden="true" />
            <span>Locality Reference Map ({locationName})</span>
          </div>
        ) : isApproximateProject ? (
          <div
            data-location-status="APPROXIMATE_LOCATION"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/95 backdrop-blur-sm border border-amber-300/80 text-[11px] font-medium text-amber-800 shadow-xs"
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>Approximate Locality Map ({locationName}) — Exact Site Pending</span>
          </div>
        ) : (
          <div
            data-location-status="VERIFIED_PROJECT_LOCATION"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/90 backdrop-blur-sm border border-[var(--color-border)] text-[11px] font-medium text-[#218C5A] shadow-xs"
          >
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Verified Project Pinpoint</span>
          </div>
        )}
      </div>
    </div>
  );
}
