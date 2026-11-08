import { Place, NearbyPlace, PlaceCategory } from '../entities';
import { LatLng } from '../spatial/distance';

export interface NearbyPlaceQuery {
  origin: LatLng;
  radiusKm?: number;
  category?: PlaceCategory | PlaceCategory[];
  limit?: number;
}

export interface PlaceRepository {
  findAll(): Promise<Place[]>;
  findById(id: string): Promise<Place | null>;
  findByCategory(category: PlaceCategory): Promise<Place[]>;
  findNearby(query: NearbyPlaceQuery): Promise<NearbyPlace[]>;
  create(place: Omit<Place, 'id' | 'createdAt' | 'updatedAt'>): Promise<Place>;
}
