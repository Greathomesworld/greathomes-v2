'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, RotateCcw, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { MapCoordinates, MapInstance } from '@/src/domain/locations/map/types';
import { cartoMapProvider } from '@/src/infrastructure/maps/carto/cartoProvider';
import {
  isValidCoordinate,
  resolveProjectCoordinates,
  CoordinateSource,
} from '@/src/domain/projects/viewModels/projectLocationViewModel';
import Link from 'next/link';

export interface AdminProjectPinMapProps {
  // Current project-level override inputs (string or number or null)
  projectLat: string | number | null;
  projectLng: string | number | null;
  // Selected Location master fallback info
  locationMaster: {
    id: string;
    name: string;
    type: string;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
  // Callback when user updates coordinates via map click or manual numeric typing
  onCoordinatesChange: (lat: number | null, lng: number | null) => void;
}

function formatCoordinates(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${latDir}, ${Math.abs(lng).toFixed(6)}° ${lngDir}`;
}

export function AdminProjectPinMap({
  projectLat,
  projectLng,
  locationMaster,
  onCoordinatesChange,
}: AdminProjectPinMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapInstance | null>(null);

  // Local state for numeric inputs (strings for typing ease)
  const [latInput, setLatInput] = useState<string>(
    projectLat !== null && projectLat !== undefined ? String(projectLat) : ''
  );
  const [lngInput, setLngInput] = useState<string>(
    projectLng !== null && projectLng !== undefined ? String(projectLng) : ''
  );
  const [inputError, setInputError] = useState<string | null>(null);

  // Sync inputs if props change externally
  useEffect(() => {
    setLatInput(projectLat !== null && projectLat !== undefined ? String(projectLat) : '');
    setLngInput(projectLng !== null && projectLng !== undefined ? String(projectLng) : '');
  }, [projectLat, projectLng]);

  // Resolve coordinate precedence
  const pLatNum = projectLat !== null && projectLat !== '' && projectLat !== undefined ? Number(projectLat) : null;
  const pLngNum = projectLng !== null && projectLng !== '' && projectLng !== undefined ? Number(projectLng) : null;
  
  const projCoords = isValidCoordinate(pLatNum, pLngNum) && pLatNum !== null && pLngNum !== null
    ? { latitude: pLatNum, longitude: pLngNum }
    : null;

  const resolved = resolveProjectCoordinates(projCoords, locationMaster);

  // Handle map initialization and click interaction
  useEffect(() => {
    if (!resolved.hasValidCoordinates || resolved.latitude === null || resolved.longitude === null || !mapContainerRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
      return;
    }

    const targetCoords = { latitude: resolved.latitude, longitude: resolved.longitude };

    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(targetCoords, 15);
      if (mapInstanceRef.current.setMarker) {
        mapInstanceRef.current.setMarker({
          id: `pin-${targetCoords.latitude}-${targetCoords.longitude}`,
          coordinates: targetCoords,
          title: resolved.source === 'PROJECT' ? 'Project Override Pin' : `${locationMaster?.name} (Location Master)`,
          category: 'PROJECT',
        });
      }
      return;
    }

    try {
      const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
      const instance = cartoMapProvider.createInteractiveMap({
        container: mapContainerRef.current,
        initialViewport: {
          center: targetCoords,
          zoom: 15,
        },
        marker: {
          id: `pin-${targetCoords.latitude}-${targetCoords.longitude}`,
          coordinates: targetCoords,
          title: resolved.source === 'PROJECT' ? 'Project Override Pin' : `${locationMaster?.name} (Location Master)`,
          category: 'PROJECT',
        },
        theme: isDark ? 'dark' : 'light',
        onClick: (clickCoords) => {
          // Sync inputs and emit callback with 6 decimal precision
          const roundedLat = parseFloat(clickCoords.latitude.toFixed(6));
          const roundedLng = parseFloat(clickCoords.longitude.toFixed(6));
          setLatInput(String(roundedLat));
          setLngInput(String(roundedLng));
          setInputError(null);
          onCoordinatesChange(roundedLat, roundedLng);
        },
      });
      mapInstanceRef.current = instance;
    } catch (err) {
      console.warn('Map initialization note:', err);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [resolved.latitude, resolved.longitude, resolved.hasValidCoordinates, resolved.source, locationMaster, onCoordinatesChange]);

  const handleManualInputChange = (newLatStr: string, newLngStr: string) => {
    setLatInput(newLatStr);
    setLngInput(newLngStr);

    if (newLatStr.trim() === '' && newLngStr.trim() === '') {
      setInputError(null);
      onCoordinatesChange(null, null);
      return;
    }

    if (newLatStr.trim() === '' || newLngStr.trim() === '') {
      setInputError('Both latitude and longitude are required to set a project pin override.');
      return;
    }

    const lat = Number(newLatStr);
    const lng = Number(newLngStr);

    if (isNaN(lat) || isNaN(lng)) {
      setInputError('Please enter valid numeric coordinate values.');
      return;
    }

    if (lat < -90 || lat > 90) {
      setInputError('Latitude must be between -90 and 90 degrees.');
      return;
    }

    if (lng < -180 || lng > 180) {
      setInputError('Longitude must be between -180 and 180 degrees.');
      return;
    }

    setInputError(null);
    onCoordinatesChange(lat, lng);
  };

  const handleResetToDefault = () => {
    setLatInput('');
    setLngInput('');
    setInputError(null);
    onCoordinatesChange(null, null);
  };

  return (
    <div className="bg-neutral-50 border border-neutral-200/80 rounded-xl p-4 space-y-4 font-body">
      {/* Header & Source Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200/60 pb-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-indigo-600 shrink-0" />
          <h4 className="text-xs font-bold text-neutral-800 uppercase tracking-wider font-display">
            Project Map Pin &amp; Coordinates Editor
          </h4>
        </div>

        <div className="flex items-center gap-2">
          {resolved.source === 'PROJECT' && (
            <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full uppercase font-mono tracking-wide flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-indigo-600" />
              Project Pin Override
            </span>
          )}
          {resolved.source === 'LOCATION' && (
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full uppercase font-mono tracking-wide flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-600" />
              Location Master Default
            </span>
          )}
          {resolved.source === 'NONE' && (
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full uppercase font-mono tracking-wide flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-amber-600" />
              No Coordinates Set
            </span>
          )}

          {resolved.source === 'PROJECT' && (
            <button
              type="button"
              onClick={handleResetToDefault}
              className="inline-flex items-center gap-1 text-xs font-bold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-300 px-2.5 py-1 rounded-lg transition-colors font-display"
              title="Remove project override and restore Location Master default"
            >
              <RotateCcw className="h-3 w-3 text-neutral-500" />
              Reset to Location Default
            </button>
          )}
        </div>
      </div>

      {/* Input controls & Location Reference */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Project Custom Coordinates Inputs */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-neutral-700">
            Project-Specific Coordinates (Override)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-neutral-500 block mb-0.5 font-medium">Latitude</span>
              <input
                type="text"
                placeholder="e.g. 22.572646"
                value={latInput}
                onChange={(e) => handleManualInputChange(e.target.value, lngInput)}
                className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-lg p-2 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <span className="text-[10px] text-neutral-500 block mb-0.5 font-medium">Longitude</span>
              <input
                type="text"
                placeholder="e.g. 88.363895"
                value={lngInput}
                onChange={(e) => handleManualInputChange(latInput, e.target.value)}
                className="w-full text-xs font-mono bg-white border border-neutral-300 rounded-lg p-2 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {inputError && (
            <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{inputError}</span>
            </div>
          )}

          <p className="text-[11px] text-neutral-500 leading-snug">
            Tip: Click anywhere on the map below to position the pin automatically.
          </p>
        </div>

        {/* Location Master Reference Box */}
        <div className="bg-white border border-neutral-200 rounded-xl p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-600">Selected Location Master</span>
            {locationMaster?.id && (
              <Link
                href={`/admin/locations/${locationMaster.id}/edit`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 inline-flex items-center gap-1 font-display"
              >
                <span>Edit Master</span>
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>

          {locationMaster ? (
            <div className="space-y-1">
              <p className="font-bold text-neutral-900 font-display">
                {locationMaster.name} <span className="text-neutral-500 text-[11px] font-normal">({locationMaster.type})</span>
              </p>
              <div className="flex items-center justify-between text-[11px] text-neutral-600 font-mono bg-neutral-50 p-2 rounded border border-neutral-100">
                <span>Master Fallback:</span>
                <span className="font-bold text-neutral-800">
                  {isValidCoordinate(locationMaster.latitude, locationMaster.longitude) &&
                  locationMaster.latitude !== null &&
                  locationMaster.longitude !== null
                    ? `${Number(locationMaster.latitude).toFixed(6)}, ${Number(locationMaster.longitude).toFixed(6)}`
                    : 'Unassigned'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-neutral-400 italic">No Location selected in Section 2 above.</p>
          )}
        </div>
      </div>

      {/* Interactive Map Canvas or Empty State */}
      {resolved.hasValidCoordinates && resolved.latitude !== null && resolved.longitude !== null ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-600 font-mono px-1">
            <span>Active Pin: {formatCoordinates(resolved.latitude, resolved.longitude)}</span>
            <span className="text-[11px] text-neutral-500">Click map to set project pin</span>
          </div>
          <div
            ref={mapContainerRef}
            className="w-full h-64 rounded-xl overflow-hidden border border-neutral-300 shadow-2xs bg-neutral-100 cursor-crosshair"
          />
        </div>
      ) : (
        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 text-center space-y-2">
          <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
            <AlertCircle className="h-4 w-4" />
          </div>
          <h5 className="text-xs font-bold text-amber-900 font-display">No Coordinates Available</h5>
          <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
            Neither a project-level coordinate override nor a valid Location Master fallback coordinate is set.
            Enter latitude and longitude above to set a project pin.
          </p>
        </div>
      )}
    </div>
  );
}
