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

import { eq } from 'drizzle-orm';
import { locations as locationsTable } from '@/src/db/schema';

const locationService = new LocationService(locationRepository);

const EXCLUDED_MINIMAL_TYPES = new Set(['STATE', 'CITY', 'DISTRICT']);

function hasStaffAuthCandidate(request: NextRequest): boolean {
  if (request.headers.get('authorization')) return true;
  if (request.headers.get('x-staff-test-token')) return true;
  const cookie = request.headers.get('cookie') || '';
  return cookie.includes('gh_staff_session=');
}

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    if (!db) {
      await ensureSeedData();
    }

    const fieldsParam = request.nextUrl.searchParams.get('fields');
    const isMinimal = fieldsParam === 'minimal';

    let isInternalStaff = false;
    if (hasStaffAuthCandidate(request)) {
      const auth = await verifyInternalStaff(request);
      isInternalStaff = auth.authorized;
    }

    if (isMinimal && !isInternalStaff) {
      let rawRows: Array<{
        id: string;
        name: string;
        slug: string;
        type: string;
        parentId?: string | null;
        status?: string;
        featured?: boolean;
      }>;

      if (db) {
        rawRows = await db
          .select({
            id: locationsTable.id,
            name: locationsTable.name,
            slug: locationsTable.slug,
            type: locationsTable.type,
            parentId: locationsTable.parentId,
            status: locationsTable.status,
            featured: locationsTable.featured,
          })
          .from(locationsTable)
          .where(eq(locationsTable.status, 'PUBLISHED'));
      } else {
        rawRows = await locationRepository.findAll();
      }

      const minimalLocations = rawRows
        .filter(
          (l) =>
            isPublicCanonicalLocation(l as any) &&
            !EXCLUDED_MINIMAL_TYPES.has(String(l.type || '').toUpperCase())
        )
        .map((l) => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          type: l.type,
          parentId: l.parentId ?? null,
          featured: Boolean(l.featured),
        }));

      const response = NextResponse.json(minimalLocations);
      response.headers.set(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=600'
      );
      return response;
    }

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
    console.error('[Locations GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { verifyStaffCapability } = await import('@/src/domain/auth/capabilities');
  const { isPersistenceUnavailableError } = await import('@/src/lib/persistenceGuard');
  const { auditService } = await import('@/src/domain/audit/auditService');
  const auth = await verifyStaffCapability(request, 'location.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  let data: any;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  try {
    await ensureSeedData();
    const location = await locationService.createLocation(data);
    await auditService.record(request, auth.staff ? { id: auth.staff.id, role: auth.role } : null, {
      action: 'CREATE_LOCATION',
      resourceType: 'LOCATION',
      resourceId: location.id,
      success: true,
      metadata: { name: location.name, slug: location.slug },
    });
    return NextResponse.json(location, { status: 201 });
  } catch (e: any) {
    if (isPersistenceUnavailableError(e)) {
      return NextResponse.json(
        { error: 'Location service is temporarily unavailable.', code: 'PERSISTENCE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    if (e?.name === 'ValidationError' || e?.name === 'LocationValidationError' || e?.statusCode === 400) {
      return NextResponse.json({ error: e.message || 'Invalid location data.' }, { status: 400 });
    }
    if (e?.name === 'DuplicateSlugError' || e?.statusCode === 409) {
      return NextResponse.json({ error: e.message || 'Location already exists.' }, { status: 409 });
    }
    console.error('[Locations POST] Unexpected error:', e?.message || 'Unknown error');
    return NextResponse.json({ error: 'Failed to create location.' }, { status: 500 });
  }
}
