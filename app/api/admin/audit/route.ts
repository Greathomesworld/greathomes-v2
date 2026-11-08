import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { auditService } from '@/src/domain/audit/auditService';
import { enterTestIsolationForRequest } from '@/src/lib/testIsolationContext';

export async function GET(req: NextRequest) {
  enterTestIsolationForRequest(req);
  const auth = await verifyStaffCapability(req, 'audit.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.status || auth.statusCode || 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get('page')) || 1;
    const pageSize = Math.min(Number(searchParams.get('pageSize')) || 25, 100);
    const search = searchParams.get('search') || undefined;
    const action = searchParams.get('action') || undefined;
    const resourceType = searchParams.get('resourceType') || undefined;
    const resourceId = searchParams.get('resourceId') || undefined;
    const actorStaffId = searchParams.get('actorStaffId') || undefined;
    const successParam = searchParams.get('success');
    const success = successParam === 'true' ? true : successParam === 'false' ? false : undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const sort = (searchParams.get('sort') as 'newest' | 'oldest') || 'newest';

    const result = await auditService.list({
      page,
      pageSize,
      search,
      action,
      resourceType,
      resourceId,
      actorStaffId,
      success,
      from,
      to,
      sort,
    });

    return NextResponse.json({
      success: true,
      data: result.items,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / pageSize),
      },
    });
  } catch (err: any) {
    console.error('[API /admin/audit] Error listing audit logs:', err);
    return NextResponse.json(
      { error: 'INTERNAL_SERVER_ERROR', message: err.message || 'Failed to list audit logs' },
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
