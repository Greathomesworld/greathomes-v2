import { NextRequest, NextResponse } from 'next/server';
import { newBookingService } from '@/src/domain/projects/services/newBookingService';
import { verifyInternalStaff } from '@/src/lib/auth';

interface RouteContext {
  params: Promise<{ id: string; availabilityId: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyInternalStaff(req);
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status });
    }

    const { availabilityId } = await context.params;
    const body = await req.json();
    const { availabilityStatus, source, internalNotes } = body;

    const existing = await newBookingService.getAvailabilityRecordById(availabilityId);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Availability record not found' }, { status: 404 });
    }

    const updated = await newBookingService.setConfigurationAvailability(
      existing.projectId,
      existing.configurationId,
      availabilityStatus || existing.availabilityStatus,
      source,
      internalNotes
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyInternalStaff(req);
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status });
    }

    const { availabilityId } = await context.params;
    const success = await newBookingService.deleteAvailabilityRecord(availabilityId);
    if (!success) {
      return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
