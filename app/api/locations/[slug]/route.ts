import { NextRequest, NextResponse } from 'next/server';
import { locationService } from '@/src/domain/locations/services/locationService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { LOCATION_LEVEL_DISPLAY_NAMES } from '@/src/domain/projects/viewModels/projectLocationViewModel';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    await ensureSeedData();
    const { slug } = await context.params;

    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    const location = await locationService.resolveLocationBySlug(slug, {
      publishedOnly: !isInternalStaff,
    });

    if (!location) {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      );
    }

    if (!isInternalStaff && location.status !== 'PUBLISHED') {
      return NextResponse.json(
        { error: 'Location not found' },
        { status: 404 }
      );
    }

    // Resolve ancestry path
    const path = await locationService.getLocationPath(location.id, {
      publishedOnly: !isInternalStaff,
    });

    // Resolve child locations
    const children = await locationService.getChildLocations(location.id, {
      publishedOnly: !isInternalStaff,
    });

    const levelDisplay = LOCATION_LEVEL_DISPLAY_NAMES[location.type] || location.type;

    // Public sanitized DTO (zero admin notes, zero CRM IDs)
    const publicDto = {
      id: location.id,
      name: location.name,
      slug: location.slug,
      type: location.type,
      levelDisplay,
      status: location.status,
      canonicalUrl: `/locations/${location.slug}`,
      canonicalPath: `/locations/${path.map(p => p.slug).join('/')}`,
      description: location.description ?? null,
      shortDescription: location.shortDescription ?? null,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      featured: location.featured,
      path: path.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        type: p.type,
        levelDisplay: LOCATION_LEVEL_DISPLAY_NAMES[p.type] || p.type,
        href: `/locations/${p.slug}`,
      })),
      children: children.map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        type: c.type,
        levelDisplay: LOCATION_LEVEL_DISPLAY_NAMES[c.type] || c.type,
        href: `/locations/${c.slug}`,
      })),
    };

    return NextResponse.json(publicDto);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
