import { NextRequest, NextResponse } from 'next/server';
import {
  developerService,
  ValidationError,
  DuplicateSlugError,
  PotentialDuplicateError,
} from '@/src/domain/developers/services/developerService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { DeveloperStatus } from '@/src/domain/developers/entities';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const featuredParam = searchParams.get('featured');
    const sortParam = searchParams.get('sort') as any;
    const statusParam = searchParams.get('status') as DeveloperStatus | null;

    // Check if caller is authorized internal staff
    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    // Reject unapproved sort keys
    const allowedSorts = ['name:asc', 'name:desc', 'createdAt:desc', 'createdAt:asc'];
    if (sortParam && !allowedSorts.includes(sortParam)) {
      return NextResponse.json(
        { error: `Invalid sort field. Allowed sorts: ${allowedSorts.join(', ')}` },
        { status: 400 }
      );
    }

    const featured = featuredParam !== null ? featuredParam === 'true' : undefined;

    const result = await developerService.listPublicDevelopers({
      page: isNaN(page) ? 1 : page,
      limit: isNaN(limit) ? 10 : limit,
      featured,
      sort: sortParam,
      isInternalStaff,
      status: statusParam || undefined,
    });

    return NextResponse.json({
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error: any) {
    console.error('[Developers GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const { verifyStaffCapability } = await import('@/src/domain/auth/capabilities');
  const { isPersistenceUnavailableError } = await import('@/src/lib/persistenceGuard');
  const { auditService } = await import('@/src/domain/audit/auditService');
  // Authorization boundary: internal staff with developer.create capability only
  const auth = await verifyStaffCapability(request, 'developer.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: auth.error || 'Forbidden' },
      { status: auth.statusCode || auth.status || 401 }
    );
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  try {
    const allowPotentialDuplicate = request.nextUrl.searchParams.get('allowPotentialDuplicate') === 'true';

    const developer = await developerService.createDeveloper(body, {
      allowPotentialDuplicate,
    });

    await auditService.record(request, auth.staff ? { id: auth.staff.id, role: auth.role } : null, {
      action: 'CREATE_DEVELOPER',
      resourceType: 'DEVELOPER',
      resourceId: developer.id,
      success: true,
      metadata: { name: developer.name, slug: developer.slug },
    });

    return NextResponse.json(developer, { status: 201 });
  } catch (error: any) {
    if (isPersistenceUnavailableError(error)) {
      return NextResponse.json(
        { error: 'Developer service is temporarily unavailable.', code: 'PERSISTENCE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PotentialDuplicateError) {
      return NextResponse.json(
        {
          error: error.message,
          code: 'POTENTIAL_DUPLICATE',
          candidates: error.candidates.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
        },
        { status: 409 }
      );
    }
    console.error('[Developers POST] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
