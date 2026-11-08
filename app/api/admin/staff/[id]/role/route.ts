import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import {
  staffService,
  StaffNotFoundError,
  ValidationError,
  SelfEscalationError,
  LastSuperAdminError,
} from '@/src/domain/auth/services/staffService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(req, 'staff.assignRole');
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

    if (!body.role) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'Field "role" is required' },
        { status: 400 }
      );
    }

    const existing = await staffService.getStaffById(id);
    const updated = await staffService.updateStaffRole(id, body.role, auth.staff);
    await auditService.record(req, auth.staff, {
      action: 'ROLE_CHANGED',
      resourceType: 'STAFF',
      resourceId: id,
      resourceLabel: updated.email,
      before: existing ? { role: existing.role } : null,
      after: { role: updated.role },
      success: true,
    });
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
    if (error instanceof LastSuperAdminError) {
      return NextResponse.json({ error: 'CONFLICT', message: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
