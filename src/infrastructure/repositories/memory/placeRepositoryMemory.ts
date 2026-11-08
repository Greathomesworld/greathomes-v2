import { v4 as uuidv4 } from 'uuid';
import { Place, NearbyPlace, PlaceCategory, PLACE_CATEGORY_REGISTRY } from '../../../domain/places/entities';
import { PlaceRepository, NearbyPlaceQuery } from '../../../domain/places/repositories/placeRepository';
import { calculateGeodesicDistanceKm, formatDistanceKm } from '../../../domain/places/spatial/distance';

export class PlaceRepositoryMemory implements PlaceRepository {
  private places: Place[] = [];

  constructor() {
    this.seedDefaultVerifiedPlaces();
  }

  async findAll(): Promise<Place[]> {
    return [...this.places];
  }

  async findById(id: string): Promise<Place | null> {
    return this.places.find(p => p.id === id) || null;
  }

  async findByCategory(category: PlaceCategory): Promise<Place[]> {
    return this.places.filter(p => p.category === category);
  }

  async findNearby(query: NearbyPlaceQuery): Promise<NearbyPlace[]> {
    const { origin, radiusKm = 15, category, limit = 20 } = query;

    const categoriesFilter = category
      ? Array.isArray(category)
        ? category
        : [category]
      : null;

    const nearbyList: NearbyPlace[] = [];

    for (const place of this.places) {
      if (categoriesFilter && !categoriesFilter.includes(place.category)) {
        continue;
      }

      const distanceKm = calculateGeodesicDistanceKm(origin, {
        latitude: place.latitude,
        longitude: place.longitude,
      });

      if (distanceKm === null) {
        continue;
      }

      if (distanceKm <= radiusKm) {
        nearbyList.push({
          ...place,
          distanceKm,
          formattedDistance: formatDistanceKm(distanceKm),
        });
      }
    }

    // Sort by distance in ascending order (closest first)
    nearbyList.sort((a, b) => a.distanceKm - b.distanceKm);

    return nearbyList.slice(0, limit);
  }

  async create(data: Omit<Place, 'id' | 'createdAt' | 'updatedAt'>): Promise<Place> {
    const place: Place = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.places.push(place);
    return place;
  }

  private seedDefaultVerifiedPlaces(): void {
    const defaultPlaces: Array<{
      name: string;
      category: PlaceCategory;
      latitude: number;
      longitude: number;
      locality: string;
      city: string;
    }> = [
      {
        name: 'Netaji Subhash Chandra Bose International Airport (CCU)',
        category: 'AIRPORT',
        latitude: 22.6547,
        longitude: 88.4467,
        locality: 'Dum Dum / Rajarhat Road',
        city: 'Kolkata',
      },
      {
        name: 'Chinar Park Metro Station',
        category: 'METRO',
        latitude: 22.6250,
        longitude: 88.4410,
        locality: 'Rajarhat Main Road',
        city: 'Kolkata',
      },
      {
        name: 'Salt Lake Sector V Metro Station',
        category: 'METRO',
        latitude: 22.5760,
        longitude: 88.4328,
        locality: 'Sector V',
        city: 'Kolkata',
      },
      {
        name: 'Karunamoyee Central Bus Terminus',
        category: 'TRANSIT',
        latitude: 22.5867,
        longitude: 88.4208,
        locality: 'Salt Lake',
        city: 'Kolkata',
      },
      {
        name: 'City Centre 2 Rajarhat',
        category: 'RETAIL',
        latitude: 22.6288,
        longitude: 88.4485,
        locality: 'Rajarhat',
        city: 'Kolkata',
      },
      {
        name: 'Axis Mall New Town',
        category: 'RETAIL',
        latitude: 22.5855,
        longitude: 88.4592,
        locality: 'Action Area I',
        city: 'Kolkata',
      },
      {
        name: 'Tata Medical Center',
        category: 'HEALTHCARE',
        latitude: 22.5835,
        longitude: 88.4899,
        locality: 'Action Area II',
        city: 'Kolkata',
      },
      {
        name: 'Apollo Multispeciality Hospitals',
        category: 'HEALTHCARE',
        latitude: 22.5682,
        longitude: 88.4045,
        locality: 'EM Bypass / Salt Lake',
        city: 'Kolkata',
      },
      {
        name: 'Bhagirathi Neotia Woman & Child Care Centre',
        category: 'HEALTHCARE',
        latitude: 22.5788,
        longitude: 88.4635,
        locality: 'Action Area I',
        city: 'Kolkata',
      },
      {
        name: 'DPS New Town (Delhi Public School)',
        category: 'EDUCATION',
        latitude: 22.5855,
        longitude: 88.4735,
        locality: 'Action Area I',
        city: 'Kolkata',
      },
      {
        name: 'The Newtown School',
        category: 'EDUCATION',
        latitude: 22.5815,
        longitude: 88.4655,
        locality: 'Action Area I',
        city: 'Kolkata',
      },
      {
        name: "St. Xavier's University New Town",
        category: 'EDUCATION',
        latitude: 22.5975,
        longitude: 88.4905,
        locality: 'Action Area III',
        city: 'Kolkata',
      },
      {
        name: 'DLF IT Park New Town',
        category: 'COMMERCIAL',
        latitude: 22.5801,
        longitude: 88.4552,
        locality: 'Action Area I',
        city: 'Kolkata',
      },
      {
        name: 'Ecospace Business Park',
        category: 'COMMERCIAL',
        latitude: 22.5840,
        longitude: 88.4760,
        locality: 'Action Area II',
        city: 'Kolkata',
      },
      {
        name: 'TCS Gitanjali Park SEZ',
        category: 'COMMERCIAL',
        latitude: 22.5772,
        longitude: 88.4789,
        locality: 'Action Area II',
        city: 'Kolkata',
      },
      {
        name: 'Eco Park (New Town)',
        category: 'RECREATION',
        latitude: 22.6022,
        longitude: 88.4674,
        locality: 'Major Arterial Road',
        city: 'Kolkata',
      },
      {
        name: 'Biswa Bangla Gate (Kolkata Gate)',
        category: 'LANDMARK',
        latitude: 22.5878,
        longitude: 88.4682,
        locality: 'Action Area I',
        city: 'Kolkata',
      },
      {
        name: "Mother's Wax Museum",
        category: 'LANDMARK',
        latitude: 22.6015,
        longitude: 88.4645,
        locality: 'Action Area II',
        city: 'Kolkata',
      },
    ];

    const now = new Date();
    for (const item of defaultPlaces) {
      const meta = PLACE_CATEGORY_REGISTRY[item.category];
      this.places.push({
        id: uuidv4(),
        name: item.name,
        category: item.category,
        categoryDisplay: meta?.label || item.category,
        latitude: item.latitude,
        longitude: item.longitude,
        locality: item.locality,
        city: item.city,
        isVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

import { PlaceRepositoryPostgres } from '../postgres/placeRepositoryPostgres';

const usePostgres = process.env.PERSISTENCE_PROVIDER === 'postgres';
if (usePostgres && !process.env.DATABASE_URL) {
  throw new Error('FATAL: PERSISTENCE_PROVIDER=postgres requires DATABASE_URL.');
}

export const placeRepository: PlaceRepository = usePostgres
  ? new PlaceRepositoryPostgres()
  : new PlaceRepositoryMemory();
