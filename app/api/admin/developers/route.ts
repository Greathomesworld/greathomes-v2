import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { developerService, ValidationError, DuplicateSlugError, PotentialDuplicateError } from '@/src/domain/developers/services/developerService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

export async function GET(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'developer.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 1000;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const result = await developerService.listPublicDevelopers({
      page,
      limit,
      isInternalStaff: true,
      status: status === 'ALL' ? undefined : (status as any),
      sort: 'name:asc',
    });

    // Client side filtering for search query if not handled natively by the repository list
    let filteredItems = result.items;
    if (search) {
      const q = search.toLowerCase();
      filteredItems = filteredItems.filter(
        item => item.name.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({
      items: filteredItems,
      pagination: {
        ...result.pagination,
        total: filteredItems.length !== result.items.length ? filteredItems.length : result.pagination.total,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'developer.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await req.json();
    const allowPotentialDuplicate = req.nextUrl.searchParams.get('allowPotentialDuplicate') === 'true';

    const developer = await developerService.createDeveloper(body, {
      allowPotentialDuplicate,
    });

    await auditService.record(req, auth.staff, {
      action: 'CREATE',
      resourceType: 'DEVELOPER',
      resourceId: developer.id,
      resourceLabel: developer.name,
      after: { name: developer.name, slug: developer.slug, status: developer.status },
      success: true,
    });

    const { revalidateDeveloperPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateDeveloperPaths({ slug: developer.slug });

    return NextResponse.json(developer, { status: 201 });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', message: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ error: 'DUPLICATE_SLUG', message: error.message }, { status: 409 });
    }
    if (error instanceof PotentialDuplicateError) {
      return NextResponse.json(
        {
          error: 'POTENTIAL_DUPLICATE',
          message: error.message,
          candidates: error.candidates.map(c => ({ id: c.id, name: c.name, slug: c.slug })),
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
