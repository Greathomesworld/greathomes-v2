import { NextRequest, NextResponse } from 'next/server';
import {
  projectIntelligenceService,
  ValidationError,
  DuplicateSlugError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(request: NextRequest) {
  const { requestId } = extractRequestContext(request);
  try {
    await ensureSeedData();
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const featuredParam = searchParams.get('featured');
    const sortParam = searchParams.get('sort');
    const statusParam = searchParams.get('status') as any;
    const lifecycleStatusParam = searchParams.get('lifecycleStatus') as any;
    const developerIdParam = searchParams.get('developerId') || undefined;
    const locationIdParam = searchParams.get('locationId') || undefined;
    const propertyTypeParam = searchParams.get('propertyType') as any;

    // Check if caller is authorized internal staff
    const auth = await verifyInternalStaff(request);
    const isInternalStaff = auth.authorized;

    // Controlled sorting whitelist
    const allowedSorts = [
      'name:asc',
      'name:desc',
      'price:asc',
      'price:desc',
      'createdAt:desc',
      'createdAt:asc',
    ];
    if (sortParam && !allowedSorts.includes(sortParam)) {
      const errRes = NextResponse.json(
        { error: `Invalid sort field. Allowed sorts: ${allowedSorts.join(', ')}` },
        { status: 400 }
      );
      return withCorrelationHeaders(errRes, requestId);
    }

    const featured = featuredParam !== null && featuredParam !== undefined
      ? featuredParam === 'true'
      : undefined;

    const lifecycleStatus = (lifecycleStatusParam && lifecycleStatusParam !== 'ALL') ? lifecycleStatusParam : undefined;

    const result = await projectIntelligenceService.listProjects(
      {
        page: isNaN(page) ? 1 : page,
        limit: isNaN(limit) ? 10 : limit,
        featured,
        sort: sortParam || undefined,
        status: statusParam || undefined,
        lifecycleStatus,
        developerId: developerIdParam,
        locationId: locationIdParam,
        propertyType: propertyTypeParam || undefined,
      },
      isInternalStaff
    );

    const response = NextResponse.json({
      data: result.data,
      pagination: result.pagination,
    });
    response.headers.set('Cache-Control', isInternalStaff ? 'no-store, max-age=0' : 's-maxage=60, stale-while-revalidate=300');
    return withCorrelationHeaders(response, requestId);
  } catch (error: any) {
    const errRes = NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
    return withCorrelationHeaders(errRes, requestId);
  }
}

export async function POST(request: NextRequest) {
  // Authorization boundary: internal staff with project.create capability
  const auth = await verifyStaffCapability(request, 'project.create');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  try {
    await ensureSeedData();
    const body = await request.json();
    const project = await projectIntelligenceService.createProject(body, true);
    await auditService.record(request, auth.staff, {
      action: 'CREATE',
      resourceType: 'PROJECT',
      resourceId: project.id,
      resourceLabel: project.name,
      after: { name: project.name, slug: project.slug, status: project.status, lifecycleStatus: project.lifecycleStatus },
      success: true,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error: any) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateSlugError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
