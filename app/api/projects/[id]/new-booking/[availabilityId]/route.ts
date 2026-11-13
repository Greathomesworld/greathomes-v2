import { NextRequest, NextResponse } from 'next/server';
import { newBookingService } from '@/src/domain/projects/services/newBookingService';
import {
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { isValidConfigurationAvailabilityStatus } from '@/src/domain/projects/dto/newBookingDto';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';

interface RouteContext {
  params: Promise<{ id: string; availabilityId: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyStaffCapability(req, 'MANAGE_CONFIGURATIONS');
    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Forbidden' },
        { status: authResult.status || authResult.statusCode || 401 }
      );
    }

    const { id, availabilityId } = await context.params;
    const body = await req.json();
    const { availabilityStatus, source, internalNotes } = body || {};

    const existing = await newBookingService.getAvailabilityRecordById(availabilityId);
    if (!existing || existing.projectId !== id) {
      return NextResponse.json({ success: false, error: 'Availability record not found' }, { status: 404 });
    }

    const nextStatus = availabilityStatus !== undefined ? availabilityStatus : existing.availabilityStatus;
    if (!isValidConfigurationAvailabilityStatus(nextStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid availabilityStatus '${String(nextStatus)}'. Allowed: AVAILABLE, LIMITED, ON_REQUEST, SOLD_OUT, NOT_AVAILABLE.`,
        },
        { status: 400 }
      );
    }

    const updated = await newBookingService.setConfigurationAvailability(
      existing.projectId,
      existing.configurationId,
      nextStatus,
      source,
      internalNotes,
      {
        req,
        staff: authResult.staff
          ? { id: authResult.staff.id, role: authResult.role || authResult.staff.role }
          : { role: authResult.role || 'ADMIN' },
      }
    );

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof NotFoundError || error?.name === 'NotFoundError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError || error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update availability record' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyStaffCapability(req, 'MANAGE_CONFIGURATIONS');
    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Forbidden' },
        { status: authResult.status || authResult.statusCode || 401 }
      );
    }

    const { id, availabilityId } = await context.params;
    const existing = await newBookingService.getAvailabilityRecordById(availabilityId);
    if (!existing || existing.projectId !== id) {
      return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
    }

    const success = await newBookingService.deleteAvailabilityRecord(availabilityId, {
      expectedProjectId: id,
      req,
      staff: authResult.staff
        ? { id: authResult.staff.id, role: authResult.role || authResult.staff.role }
        : { role: authResult.role || 'ADMIN' },
    });
    if (!success) {
      return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: true });
  } catch (error: any) {
    if (error instanceof NotFoundError || error?.name === 'NotFoundError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to delete availability record' },
      { status: 500 }
    );
  }
}
