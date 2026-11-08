import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { locationService } from '@/src/domain/locations/services/locationService';
import { locationRepository } from '@/src/infrastructure/repositories/locationProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'location.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const location = await locationRepository.findById(params.id);
    if (!location) {
      return NextResponse.json({ error: 'NOT_FOUND', message: 'Location not found' }, { status: 404 });
    }

    return NextResponse.json(location);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'location.update');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();
    const updated = await locationService.updateLocation(params.id, body);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: error.message || 'Validation error occurred' },
      { status: 400 }
    );
  }
}
