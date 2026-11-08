import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { locationService } from '@/src/domain/locations/services/locationService';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const location = await locationRepository.findById(params.id);
    if (!location) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Location not found' }, { status: 404 });
    }

    const fields: Record<string, string> = {};

    // 1. Slug validation
    if (!location.slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location.slug)) {
      fields.slug = 'A URL-safe canonical slug is required for publication.';
    }

    // 2. Parent must be published check
    if (location.parentId) {
      const parent = await locationRepository.findById(location.parentId);
      if (!parent) {
        fields.parentId = 'Parent location reference is invalid.';
      } else if (parent.status !== 'PUBLISHED') {
        fields.parentId = `Parent location '${parent.name}' must be published first.`;
      }
    }

    // 3. Coordinates validation for AREA and NEIGHBOURHOOD
    if (['AREA', 'NEIGHBOURHOOD'].includes(location.type)) {
      if (location.latitude === null || location.latitude === undefined) {
        fields.latitude = `Latitude is required for public mapping of ${location.type.toLowerCase()} locations.`;
      }
      if (location.longitude === null || location.longitude === undefined) {
        fields.longitude = `Longitude is required for public mapping of ${location.type.toLowerCase()} locations.`;
      }
    }

    if (Object.keys(fields).length > 0) {
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Location cannot be published due to missing/invalid content.',
          fields,
        },
        { status: 400 }
      );
    }

    const updated = await locationService.updateLocation(params.id, { status: 'PUBLISHED' });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
