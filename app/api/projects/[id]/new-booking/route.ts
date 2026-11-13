import { NextRequest, NextResponse } from 'next/server';
import { newBookingService } from '@/src/domain/projects/services/newBookingService';
import {
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { isValidConfigurationAvailabilityStatus } from '@/src/domain/projects/dto/newBookingDto';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const configs = await newBookingService.getPublicNewBookingConfigurations(id);
    return NextResponse.json({ success: true, data: configs });
  } catch (error: any) {
    if (error instanceof NotFoundError || error?.name === 'NotFoundError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load New Booking availability' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyStaffCapability(req, 'MANAGE_CONFIGURATIONS');
    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error || 'Forbidden' },
        { status: authResult.status || authResult.statusCode || 401 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const { configurationId, availabilityStatus, source, internalNotes, availableFrom } = body || {};

    if (!configurationId || !availabilityStatus) {
      return NextResponse.json(
        { success: false, error: 'configurationId and availabilityStatus are required' },
        { status: 400 }
      );
    }

    if (!isValidConfigurationAvailabilityStatus(availabilityStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid availabilityStatus '${String(availabilityStatus)}'. Allowed: AVAILABLE, LIMITED, ON_REQUEST, SOLD_OUT, NOT_AVAILABLE.`,
        },
        { status: 400 }
      );
    }

    const parsedAvailableFrom =
      availableFrom === null || availableFrom === ''
        ? null
        : availableFrom !== undefined
          ? new Date(availableFrom)
          : undefined;

    if (parsedAvailableFrom instanceof Date && Number.isNaN(parsedAvailableFrom.getTime())) {
      return NextResponse.json(
        { success: false, error: 'availableFrom must be a valid ISO date string' },
        { status: 400 }
      );
    }

    const record = await newBookingService.setConfigurationAvailability(
      id,
      configurationId,
      availabilityStatus,
      source,
      internalNotes,
      {
        req,
        staff: authResult.staff
          ? { id: authResult.staff.id, role: authResult.role || authResult.staff.role }
          : { role: authResult.role || 'ADMIN' },
        availableFrom: parsedAvailableFrom,
      }
    );

    return NextResponse.json({ success: true, data: record }, { status: 201 });
  } catch (error: any) {
    if (error instanceof NotFoundError || error?.name === 'NotFoundError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError || error?.name === 'ValidationError') {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (typeof error?.message === 'string' && error.message.includes('Conflict')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to update configuration availability' },
      { status: 500 }
    );
  }
}
