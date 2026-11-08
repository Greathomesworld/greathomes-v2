import { NextRequest, NextResponse } from 'next/server';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { LocationService } from '@/src/domain/locations/services/locationService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { getDb } from '@/src/db/client';
import {
  isPublicCanonicalLocation,
  getLocationEditorialTagline,
  getLocationFullDescription,
} from '@/src/domain/locations/locationRegionMapper';

const locationService = new LocationService(locationRepository);

export async function GET(request: NextRequest) {
  try {
    if (!getDb()) {
      await ensureSeedData();
    }
    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    const locations = await locationRepository.findAll();
    const filtered = isInternalStaff
      ? locations
      : locations.filter(l => isPublicCanonicalLocation(l));

    const publicLocations = filtered.map(l => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      type: l.type,
      parentId: l.parentId ?? null,
      description: getLocationFullDescription(l) ?? null,
      shortDescription: getLocationEditorialTagline(l) ?? null,
      latitude: l.latitude ?? null,
      longitude: l.longitude ?? null,
      featured: l.featured ?? false,
    }));

    const response = NextResponse.json(publicLocations);
    if (!isInternalStaff) {
      response.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    }
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyInternalStaff(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const data = await request.json();
    const location = await locationService.createLocation(data);
    return NextResponse.json(location, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
