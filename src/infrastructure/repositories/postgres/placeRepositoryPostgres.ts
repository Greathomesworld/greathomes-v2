import { eq } from 'drizzle-orm';
import { getDb } from '@/src/db/client';
import { places } from '@/src/db/schema';
import { Place, NearbyPlace, PlaceCategory, PLACE_CATEGORY_REGISTRY } from '@/src/domain/places/entities';
import { PlaceRepository, NearbyPlaceQuery } from '@/src/domain/places/repositories/placeRepository';
import { calculateGeodesicDistanceKm, formatDistanceKm } from '@/src/domain/places/spatial/distance';

export class PlaceRepositoryPostgres implements PlaceRepository {
  /**
   * Generates the canonical PostGIS SQL query for nearby places with straight-line distance.
   */
  static getPostGisNearbyQuerySql(): string {
    return `
      SELECT 
        id,
        name,
        category,
        latitude,
        longitude,
        address,
        locality,
        city,
        is_verified,
        ROUND((ST_Distance(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint($originLng, $originLat), 4326)::geography
        ) / 1000.0)::numeric, 1) AS distance_km
      FROM places
      WHERE is_verified = true
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
          ST_SetSRID(ST_MakePoint($originLng, $originLat), 4326)::geography,
          $radiusMeters
        )
      ORDER BY distance_km ASC
      LIMIT $limit;
    `.trim();
  }

  async findAll(): Promise<Place[]> {
    const db = getDb();
    if (!db) return [];

    let rows = await db.select().from(places);
    if (rows.length < 10) {
      await this.seedDefaultVerifiedPlaces();
      rows = await db.select().from(places);
    }
    return rows.map(r => this.mapRowToEntity(r));
  }

  private async seedDefaultVerifiedPlaces(): Promise<void> {
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

    for (const item of defaultPlaces) {
      try {
        await this.create({
          name: item.name,
          category: item.category,
          categoryDisplay: PLACE_CATEGORY_REGISTRY[item.category]?.label || item.category,
          latitude: item.latitude,
          longitude: item.longitude,
          locality: item.locality,
          city: item.city,
          isVerified: true,
        });
      } catch (e) {
        // ignore individual duplicate key errors if present
      }
    }
  }

  async findById(id: string): Promise<Place | null> {
    const db = getDb();
    if (!db) return null;

    const rows = await db.select().from(places).where(eq(places.id, id));
    if (rows.length === 0) return null;
    return this.mapRowToEntity(rows[0]);
  }

  async findByCategory(category: PlaceCategory): Promise<Place[]> {
    const db = getDb();
    if (!db) return [];

    const rows = await db.select().from(places).where(eq(places.category, category));
    return rows.map(r => this.mapRowToEntity(r));
  }

  async findNearby(query: NearbyPlaceQuery): Promise<NearbyPlace[]> {
    const { origin, radiusKm = 15, category, limit = 20 } = query;
    const allPlaces = await this.findAll();

    const categoriesFilter = category
      ? Array.isArray(category)
        ? category
        : [category]
      : null;

    const nearbyList: NearbyPlace[] = [];

    for (const place of allPlaces) {
      if (categoriesFilter && !categoriesFilter.includes(place.category)) {
        continue;
      }

      const distanceKm = calculateGeodesicDistanceKm(origin, {
        latitude: place.latitude,
        longitude: place.longitude,
      });

      if (distanceKm === null) continue;

      if (distanceKm <= radiusKm) {
        nearbyList.push({
          ...place,
          distanceKm,
          formattedDistance: formatDistanceKm(distanceKm),
        });
      }
    }

    nearbyList.sort((a, b) => a.distanceKm - b.distanceKm);
    return nearbyList.slice(0, limit);
  }

  async create(data: Omit<Place, 'id' | 'createdAt' | 'updatedAt'>): Promise<Place> {
    const db = getDb();
    if (!db) throw new Error('PostgreSQL database instance is unavailable.');

    const [row] = await db
      .insert(places)
      .values({
        name: data.name,
        category: data.category,
        categoryDisplay: data.categoryDisplay || PLACE_CATEGORY_REGISTRY[data.category]?.label || data.category,
        latitude: data.latitude.toString(),
        longitude: data.longitude.toString(),
        address: data.address,
        locality: data.locality,
        city: data.city,
        isVerified: data.isVerified ?? true,
      } as any)
      .returning();

    return this.mapRowToEntity(row);
  }

  private mapRowToEntity(row: any): Place {
    const category = row.category as PlaceCategory;
    return {
      id: row.id,
      name: row.name,
      category,
      categoryDisplay: row.categoryDisplay || PLACE_CATEGORY_REGISTRY[category]?.label || row.category,
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      address: row.address ?? undefined,
      locality: row.locality ?? undefined,
      city: row.city,
      isVerified: row.isVerified,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
