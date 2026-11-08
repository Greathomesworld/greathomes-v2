/**
 * Map Provider Abstraction Contract
 *
 * Provider-agnostic domain contracts for Great Homes V2 Location & Connectivity.
 * Enables interchangeable providers (CARTO, Google Maps, Mapbox) without tight
 * coupling or leaking third-party SDK dependencies into application domain logic.
 */

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface MapViewport {
  center: MapCoordinates;
  zoom: number;
  pitch?: number;
  bearing?: number;
}

export interface MapMarker {
  id: string;
  coordinates: MapCoordinates;
  title?: string;
  category?: 'PROJECT' | 'METRO' | 'AIRPORT' | 'TRANSIT' | 'SCHOOL' | 'HOSPITAL' | 'SHOPPING' | 'LANDMARK';
  icon?: string;
  zIndex?: number;
}

export type MapProviderType = 'CARTO' | 'GOOGLE_MAPS' | 'MAPBOX';

export interface StaticMapOptions {
  center: MapCoordinates;
  zoom: number;
  width: number;
  height: number;
  markers?: MapMarker[];
  retina?: boolean;
}

export interface InteractiveMapConfig {
  container: HTMLElement;
  initialViewport: MapViewport;
  marker?: MapMarker | null;
  nearbyMarkers?: MapMarker[];
  theme?: 'light' | 'dark';
  minZoom?: number;
  maxZoom?: number;
  onViewportChange?: (viewport: MapViewport) => void;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  onClick?: (coords: MapCoordinates) => void;
}

export interface MapInstance {
  setCenter(coordinates: MapCoordinates, zoom?: number): void;
  setZoom(zoom: number): void;
  getZoom(): number;
  getCenter(): MapCoordinates;
  setMarker?(marker: MapMarker | null): void;
  resize(): void;
  destroy(): void;
}

/**
 * Interface defining the contract for any map provider.
 * Actual provider implementations (e.g. CartoMapProvider) will implement this interface.
 */
export interface MapProvider {
  readonly id: string;
  readonly providerType: MapProviderType;
  
  /**
   * Generates a secure URL for static image rendering.
   */
  getStaticMapUrl?(options: StaticMapOptions): string;

  /**
   * Validates coordinate bounds against provider-specific boundaries.
   */
  validateCoordinates?(coords: MapCoordinates): boolean;

  /**
   * Mounts and initializes an interactive map instance.
   */
  createInteractiveMap?(config: InteractiveMapConfig): MapInstance;

  /**
   * Resolves tile URL for given tile coordinates and zoom.
   */
  getTileUrl?(x: number, y: number, z: number, options?: { theme?: 'light' | 'dark'; retina?: boolean }): string;

  /**
   * Returns provider legal attribution string.
   */
  getAttribution?(): string;
}
