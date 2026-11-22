import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { locationService } from '@/src/domain/locations/services/locationService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await verifyStaffCapability(req, 'location.archive');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
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
