import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import {
  staffService,
  StaffNotFoundError,
  ValidationError,
  SelfEscalationError,
  SelfDisableError,
  LastSuperAdminError,
} from '@/src/domain/auth/services/staffService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(req, 'staff.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const staff = await staffService.getStaffById(id);
    if (!staff) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: `Staff member with ID '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: staff });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(req, 'staff.update');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    const body = await req.json();

    const updated = await staffService.updateStaff(id, body, auth.staff);
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof StaffNotFoundError) {
      return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
    }
    if (error instanceof SelfEscalationError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    if (error instanceof SelfDisableError) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: error.message }, { status: 400 });
    }
    if (error instanceof LastSuperAdminError) {
      return NextResponse.json({ error: 'CONFLICT', message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(req, 'staff.disable');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await props.params;
    await staffService.deleteStaff(id, auth.staff);
    return NextResponse.json({ success: true, message: 'Staff member deleted' });
  } catch (error: any) {
    if (error instanceof StaffNotFoundError) {
      return NextResponse.json({ error: 'NOT_FOUND', message: error.message }, { status: 404 });
    }
    if (error instanceof LastSuperAdminError) {
      return NextResponse.json({ error: 'CONFLICT', message: error.message }, { status: 409 });
    }
    if (error instanceof SelfDisableError) {
      return NextResponse.json({ error: 'BAD_REQUEST', message: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
