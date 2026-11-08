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
    const updated = await locationService.updateLocation(params.id, { status: 'ARCHIVED' });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: error.message || 'Failed to archive location' },
      { status: 400 }
    );
  }
}
