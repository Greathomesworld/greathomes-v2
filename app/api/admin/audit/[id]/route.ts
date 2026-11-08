import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { auditService } from '@/src/domain/audit/auditService';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyStaffCapability(req, 'audit.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  try {
    const { id } = await params;
    const log = await auditService.getById(id);

    if (!log) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Audit log entry not found.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: log,
    });
  } catch (err: any) {
    console.error('[API /admin/audit/[id]] Error retrieving audit log:', err);
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to retrieve audit log' },
      { status: 500 }
    );
  }
}

// Append-only security: explicitly reject write/modify methods
export async function POST() {
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED', message: 'Audit logs are append-only.' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED', message: 'Audit logs are append-only.' }, { status: 405 });
}

export async function PATCH() {
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED', message: 'Audit logs are append-only.' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'METHOD_NOT_ALLOWED', message: 'Audit logs are append-only.' }, { status: 405 });
}
