import { NextRequest, NextResponse } from 'next/server';
import { newBookingService } from '@/src/domain/projects/services/newBookingService';
import { verifyInternalStaff } from '@/src/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const configs = await newBookingService.getPublicNewBookingConfigurations(id);
    return NextResponse.json({ success: true, data: configs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyInternalStaff(req);
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status });
    }

    const { id } = await context.params;
    const body = await req.json();
    const { configurationId, availabilityStatus, source, internalNotes } = body;

    if (!configurationId || !availabilityStatus) {
      return NextResponse.json({ success: false, error: 'configurationId and availabilityStatus are required' }, { status: 400 });
    }

    const record = await newBookingService.setConfigurationAvailability(
      id,
      configurationId,
      availabilityStatus,
      source,
      internalNotes
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: any) {
    if (error.message.includes('Conflict')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
