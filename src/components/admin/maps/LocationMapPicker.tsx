'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  MapPin,
  MapPinOff,
  Navigation,
  Plus,
  Minus,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  X,
} from 'lucide-react';
import { cartoMapProvider } from '@/src/infrastructure/maps/carto/cartoProvider';
import { MapCoordinates, MapInstance } from '@/src/domain/locations/map/types';
import { isValidCoordinate } from '@/src/domain/projects/viewModels/projectLocationViewModel';

export interface CanonicalLocationOption {
  id: string;
  name: string;
  slug: string;
  type?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface LocationMapPickerProps {
  locationId: string;
  latitude: number | null;
  longitude: number | null;
  onChangeLocation: (locationId: string) => void;
  onChangeCoordinates: (coords: { latitude: number | null; longitude: number | null }) => void;
  locations: CanonicalLocationOption[];
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
}

const DEFAULT_KOLKATA_CENTER: MapCoordinates = {
  latitude: 22.572646,
  longitude: 88.363895,
};

function formatCoordsDisplay(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}

export function LocationMapPicker({
  locationId,
  latitude,
  longitude,
  onChangeLocation,
  onChangeCoordinates,
  locations,
  disabled = false,
  required = true,
  error,
}: LocationMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);

  const [latInput, setLatInput] = useState<string>(latitude !== null ? latitude.toString() : '');
  const [lngInput, setLngInput] = useState<string>(longitude !== null ? longitude.toString() : '');
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [zoomLevel, setZoomLevel] = useState<number>(14);
  const [coordValidationError, setCoordValidationError] = useState<string | null>(null);

  // Sync manual input state when external props change
  useEffect(() => {
    setLatInput(latitude !== null ? latitude.toString() : '');
    setLngInput(longitude !== null ? longitude.toString() : '');
  }, [latitude, longitude]);

  const selectedLocation = useMemo(() => {
    return locations.find((l) => l.id === locationId) || null;
  }, [locations, locationId]);

  const hasPoint = latitude !== null && longitude !== null && isValidCoordinate(latitude, longitude);

  // Determine initial center
  const initialCenter: MapCoordinates = useMemo(() => {
    if (hasPoint && latitude !== null && longitude !== null) {
      return { latitude, longitude };
    }
    if (selectedLocation?.latitude && selectedLocation?.longitude && isValidCoordinate(selectedLocation.latitude, selectedLocation.longitude)) {
      return { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude };
    }
    return DEFAULT_KOLKATA_CENTER;
  }, [hasPoint, latitude, longitude, selectedLocation]);

  // Mount CARTO Interactive Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }

    setMapStatus('loading');

    try {
      const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      const instance = cartoMapProvider.createInteractiveMap({
        container: mapContainerRef.current,
        initialViewport: {
          center: initialCenter,
          zoom: hasPoint ? 15 : 13,
        },
        marker: hasPoint && latitude !== null && longitude !== null
          ? {
              id: 'standalone-listing-pin',
              coordinates: { latitude, longitude },
              title: selectedLocation?.name || 'Listing Point',
              category: 'PROJECT',
            }
          : null,
        theme: isDark ? 'dark' : 'light',
        onLoad: () => {
          setMapStatus('ready');
        },
        onError: () => {
          setMapStatus('error');
        },
        onViewportChange: (vp) => {
          setZoomLevel(vp.zoom);
        },
        onClick: (coords) => {
          if (disabled) return;
          const roundedLat = parseFloat(coords.latitude.toFixed(6));
          const roundedLng = parseFloat(coords.longitude.toFixed(6));
          setLatInput(roundedLat.toString());
          setLngInput(roundedLng.toString());
          setCoordValidationError(null);
          onChangeCoordinates({ latitude: roundedLat, longitude: roundedLng });

          if (mapInstanceRef.current?.setMarker) {
            mapInstanceRef.current.setMarker({
              id: 'standalone-listing-pin',
              coordinates: { latitude: roundedLat, longitude: roundedLng },
              title: selectedLocation?.name || 'Listing Point',
              category: 'PROJECT',
            });
          }
        },
      });

      mapInstanceRef.current = instance;
    } catch (err) {
      console.error('Failed to create interactive CARTO map:', err);
      setMapStatus('error');
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, []); // Mount once on init

  // Update marker and center when coordinates prop changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (hasPoint && latitude !== null && longitude !== null) {
      if (mapInstanceRef.current.setMarker) {
        mapInstanceRef.current.setMarker({
          id: 'standalone-listing-pin',
          coordinates: { latitude, longitude },
          title: selectedLocation?.name || 'Listing Point',
          category: 'PROJECT',
        });
      }
    } else {
      if (mapInstanceRef.current.setMarker) {
        mapInstanceRef.current.setMarker(null);
      }
    }
  }, [hasPoint, latitude, longitude, selectedLocation]);

  const handleManualCoordinateChange = useCallback(
    (newLatStr: string, newLngStr: string) => {
      setLatInput(newLatStr);
      setLngInput(newLngStr);

      const trimmedLat = newLatStr.trim();
      const trimmedLng = newLngStr.trim();

      if (!trimmedLat && !trimmedLng) {
        setCoordValidationError(null);
        onChangeCoordinates({ latitude: null, longitude: null });
        if (mapInstanceRef.current?.setMarker) {
          mapInstanceRef.current.setMarker(null);
        }
        return;
      }

      if (!trimmedLat || !trimmedLng) {
        setCoordValidationError('Both latitude and longitude must be provided together.');
        return;
      }

      const parsedLat = parseFloat(trimmedLat);
      const parsedLng = parseFloat(trimmedLng);

      if (isNaN(parsedLat) || isNaN(parsedLng)) {
        setCoordValidationError('Coordinates must be valid numbers.');
        return;
      }

      if (!isValidCoordinate(parsedLat, parsedLng)) {
        setCoordValidationError('Latitude must be between -90 and 90, and longitude between -180 and 180.');
        return;
      }

      setCoordValidationError(null);
      onChangeCoordinates({ latitude: parsedLat, longitude: parsedLng });

      if (mapInstanceRef.current) {
        mapInstanceRef.current.setCenter({ latitude: parsedLat, longitude: parsedLng }, 15);
        if (mapInstanceRef.current.setMarker) {
          mapInstanceRef.current.setMarker({
            id: 'standalone-listing-pin',
            coordinates: { latitude: parsedLat, longitude: parsedLng },
            title: selectedLocation?.name || 'Listing Point',
            category: 'PROJECT',
          });
        }
      }
    },
    [onChangeCoordinates, selectedLocation]
  );

  const handleClearCoordinates = useCallback(() => {
    setLatInput('');
    setLngInput('');
    setCoordValidationError(null);
    onChangeCoordinates({ latitude: null, longitude: null });
    if (mapInstanceRef.current?.setMarker) {
      mapInstanceRef.current.setMarker(null);
    }
  }, [onChangeCoordinates]);

  const handleCenterOnLocation = useCallback(() => {
    if (!selectedLocation) return;
    const locCenter: MapCoordinates =
      selectedLocation.latitude && selectedLocation.longitude && isValidCoordinate(selectedLocation.latitude, selectedLocation.longitude)
        ? { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude }
        : DEFAULT_KOLKATA_CENTER;

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(locCenter, 14);
    }
  }, [selectedLocation]);

  const handleRecenterPin = useCallback(() => {
    if (hasPoint && latitude !== null && longitude !== null && mapInstanceRef.current) {
      mapInstanceRef.current.setCenter({ latitude, longitude }, 15);
    } else {
      handleCenterOnLocation();
    }
  }, [hasPoint, latitude, longitude, handleCenterOnLocation]);

  const handleZoomIn = useCallback(() => {
    if (mapInstanceRef.current) {
      const nextZoom = Math.min(18, zoomLevel + 1);
      mapInstanceRef.current.setZoom(nextZoom);
      setZoomLevel(nextZoom);
    }
  }, [zoomLevel]);

  const handleZoomOut = useCallback(() => {
    if (mapInstanceRef.current) {
      const nextZoom = Math.max(11, zoomLevel - 1);
      mapInstanceRef.current.setZoom(nextZoom);
      setZoomLevel(nextZoom);
    }
  }, [zoomLevel]);

  return (
    <div className="space-y-4 font-body">
      {/* 1. Canonical Location Selector */}
      <div>
        <label className="block text-xs font-semibold text-neutral-800 font-display mb-1.5">
          Canonical Location Taxonomy {required && <span className="text-terracotta">*</span>}
        </label>
        <select
          value={locationId}
          disabled={disabled}
          onChange={(e) => {
            const newLocId = e.target.value;
            onChangeLocation(newLocId);
            const found = locations.find((l) => l.id === newLocId);
            if (found?.latitude && found?.longitude && isValidCoordinate(found.latitude, found.longitude) && !hasPoint) {
              mapInstanceRef.current?.setCenter({ latitude: found.latitude, longitude: found.longitude }, 14);
            }
          }}
          className={`w-full px-3 py-2 bg-white border rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900 transition-colors ${
            error && !locationId ? 'border-rose-400 bg-rose-50/30' : 'border-neutral-300'
          }`}
        >
          <option value="">-- Select Canonical Location --</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name} {loc.type ? `(${loc.type.replace('_', ' ')})` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-neutral-500 font-body mt-1">
          Mandatory for standalone marketplace residences. Binds the listing to Kolkata's canonical location hierarchy.
        </p>
      </div>

      {/* 2. Coordinates Input & Status Strip */}
      <div className="bg-neutral-50/80 border border-neutral-200/90 rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-terracotta" />
            <span className="text-xs font-bold text-neutral-900 font-display uppercase tracking-wider">
              Private Geographic Coordinates
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasPoint ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                {formatCoordsDisplay(latitude!, longitude!)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                <MapPinOff className="h-3.5 w-3.5 text-neutral-400" />
                No custom coordinates (uses location centroid)
              </span>
            )}
            {hasPoint && !disabled && (
              <button
                type="button"
                onClick={handleClearCoordinates}
                className="text-xs text-neutral-500 hover:text-rose-600 flex items-center gap-1 ml-2 font-medium transition-colors"
                title="Clear Coordinates"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 font-display mb-1">
              Latitude (WGS84, -90 to +90)
            </label>
            <input
              type="number"
              step="any"
              min="-90"
              max="90"
              disabled={disabled}
              placeholder="e.g. 22.572646"
              value={latInput}
              onChange={(e) => handleManualCoordinateChange(e.target.value, lngInput)}
              className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 font-display mb-1">
              Longitude (WGS84, -180 to +180)
            </label>
            <input
              type="number"
              step="any"
              min="-180"
              max="180"
              disabled={disabled}
              placeholder="e.g. 88.363895"
              value={lngInput}
              onChange={(e) => handleManualCoordinateChange(latInput, e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-sm text-neutral-800 font-body focus:ring-2 focus:ring-neutral-900"
            />
          </div>
        </div>

        {coordValidationError && (
          <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200/80 px-2.5 py-1.5 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{coordValidationError}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-neutral-500 font-body pt-1">
          <span className="flex items-center gap-1">
            <HelpCircle className="h-3 w-3 text-neutral-400" />
            Coordinates remain strictly confidential and are never exposed in public DTOs.
          </span>
          {selectedLocation && (
            <button
              type="button"
              onClick={handleCenterOnLocation}
              className="text-xs text-terracotta hover:text-neutral-900 font-medium underline transition-colors"
            >
              Center on {selectedLocation.name}
            </button>
          )}
        </div>
      </div>

      {/* 3. Interactive CARTO Map Picker Container */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-display text-neutral-600 px-1">
          <span>Click on map to drop or reposition pin</span>
          <span className="text-neutral-400">CARTO Voyager Tiles · Zoom {zoomLevel}</span>
        </div>

        <div className="relative w-full h-[320px] rounded-xl overflow-hidden border border-neutral-300 bg-neutral-100 shadow-2xs">
          <div ref={mapContainerRef} className="w-full h-full cursor-crosshair" />

          {/* Floating Map Controls */}
          <div className="absolute top-3 right-3 z-20 flex flex-col gap-1.5 bg-white/95 rounded-lg shadow-sm border border-neutral-200/80 p-1">
            <button
              type="button"
              onClick={handleZoomIn}
              className="w-8 h-8 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
              title="Zoom In"
              aria-label="Zoom in"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleZoomOut}
              className="w-8 h-8 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
              title="Zoom Out"
              aria-label="Zoom out"
            >
              <Minus className="h-4 w-4" />
            </button>
            <div className="h-px bg-neutral-200 my-0.5" />
            <button
              type="button"
              onClick={handleRecenterPin}
              className="w-8 h-8 flex items-center justify-center text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100 rounded transition-colors"
              title={hasPoint ? 'Recenter on Pin' : 'Center on Location'}
              aria-label="Recenter map"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Map Loading State */}
          {mapStatus === 'loading' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/70 backdrop-blur-2xs pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-xs text-xs font-medium text-neutral-600">
                <div className="w-3.5 h-3.5 border-2 border-terracotta border-t-transparent rounded-full animate-spin" />
                Loading CARTO Basemap...
              </div>
            </div>
          )}

          {/* Map Error State */}
          {mapStatus === 'error' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-100/90 p-4 text-center">
              <div className="max-w-xs space-y-2">
                <AlertCircle className="h-6 w-6 text-neutral-400 mx-auto" />
                <p className="text-xs text-neutral-600 font-body">
                  CARTO tile service unavailable. You can still enter coordinates manually in the fields above.
                </p>
              </div>
            </div>
          )}

          {/* Bottom helper pill */}
          <div className="absolute bottom-2 right-2 z-10 bg-white/90 backdrop-blur-xs text-[11px] font-medium text-neutral-700 px-2.5 py-1 rounded-md border border-neutral-200/80 shadow-2xs pointer-events-none">
            {hasPoint ? 'Pin Placed · Click to adjust' : 'Click map to place pin'}
          </div>
        </div>
      </div>
    </div>
  );
}
