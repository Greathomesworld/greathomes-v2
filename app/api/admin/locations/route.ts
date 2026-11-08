import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { locationService } from '@/src/domain/locations/services/locationService';
import { locationSeoService } from '@/src/domain/locations/services/locationSeoService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'location.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { searchParams } = req.nextUrl;
    const type = searchParams.get('type') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const evaluated = await locationSeoService.evaluateAllLocationsForAdmin();
    let filtered = evaluated.map(entry => ({
      ...entry.location,
      publishedProjectCount: entry.publishedProjectCount,
      publishedChildCount: entry.publishedChildCount,
      seoEligibility: entry.seoEligibility,
    }));

    if (type && type !== 'ALL') {
      filtered = filtered.filter(l => l.type === type);
    }
    if (status && status !== 'ALL') {
      filtered = filtered.filter(l => l.status === status);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        l => l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      items: filtered,
      total: filtered.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'location.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();
    const location = await locationService.createLocation(body);
    return NextResponse.json(location, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: error.message || 'Invalid location data' },
      { status: 400 }
    );
  }
}
