import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import {
  staffService,
  ValidationError,
  DuplicateEmailError,
  SelfEscalationError,
} from '@/src/domain/auth/services/staffService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

export async function GET(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'staff.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { searchParams } = req.nextUrl;
    const search = searchParams.get('search') || undefined;
    const role = (searchParams.get('role') as any) || undefined;
    const enabledParam = searchParams.get('enabled');
    const enabled = enabledParam !== null && enabledParam !== undefined
      ? enabledParam === 'true'
        ? true
        : enabledParam === 'false'
        ? false
        : 'ALL'
      : undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const result = await staffService.listStaff({
      search,
      role,
      enabled,
      page,
      limit,
    });

    const activeSuperAdminCount = await staffService.countActiveSuperAdmins();

    return NextResponse.json({
      data: result.items,
      total: result.total,
      page,
      limit,
      totalPages: Math.ceil(result.total / limit),
      activeSuperAdminCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'staff.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();

    const created = await staffService.createStaff(body, auth.staff);
    await auditService.record(req, auth.staff, {
      action: 'CREATE',
      resourceType: 'STAFF',
      resourceId: created.id,
      resourceLabel: created.email,
      after: { email: created.email, name: created.name, role: created.role, enabled: created.enabled },
      success: true,
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateEmailError) {
      return NextResponse.json({ error: 'DUPLICATE_EMAIL', message: error.message }, { status: 409 });
    }
    if (error instanceof SelfEscalationError) {
      return NextResponse.json({ error: 'FORBIDDEN', message: error.message }, { status: 403 });
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
