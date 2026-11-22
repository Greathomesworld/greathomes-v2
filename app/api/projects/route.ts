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
import { getDb } from '@/src/db/client';
import { getProjectOptionsForLocation } from '@/src/domain/postProperty/page1Data';

function hasStaffAuthCandidate(request: NextRequest): boolean {
  if (request.headers.get('authorization')) return true;
  if (request.headers.get('x-staff-test-token')) return true;
  const cookie = request.headers.get('cookie') || '';
  return cookie.includes('gh_staff_session=');
}

export async function GET(request: NextRequest) {
  const { requestId } = extractRequestContext(request);
  try {
    const searchParams = request.nextUrl.searchParams;
    const fieldsParam = searchParams.get('fields');
    const locationIdParam = searchParams.get('locationId') || undefined;
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Lightweight public dropdown option mode (skips full DTO hydration, configs, media, amenities, RERA)
    if (fieldsParam === 'minimal') {
      const clampedLimit = Math.min(100, Math.max(1, isNaN(limit) ? 50 : limit));
      const data = await getProjectOptionsForLocation(locationIdParam, clampedLimit);
      const response = NextResponse.json({
        data,
        pagination: {
          total: data.length,
          page: 1,
          limit: clampedLimit,
          totalPages: 1,
        },
      });
      response.headers.set(
        'Cache-Control',
        'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
      );
      return withCorrelationHeaders(response, requestId);
    }

    if (!getDb()) {
      await ensureSeedData();
    }
    const page = parseInt(searchParams.get('page') || '1', 10);
    const featuredParam = searchParams.get('featured');
    const sortParam = searchParams.get('sort');
    const statusParam = searchParams.get('status') as any;
    const lifecycleStatusParam = searchParams.get('lifecycleStatus') as any;
    const developerIdParam = searchParams.get('developerId') || undefined;
    const propertyTypeParam = searchParams.get('propertyType') as any;
    const rawSearch = searchParams.get('search') ?? searchParams.get('q');
    const search = rawSearch && rawSearch.trim().length > 0 ? rawSearch.trim() : undefined;

    // Check if caller is authorized internal staff (fast-skip when no staff credentials exist)
    let isInternalStaff = false;
    if (hasStaffAuthCandidate(request)) {
      const auth = await verifyInternalStaff(request);
      isInternalStaff = auth.authorized;
    }

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
        search,
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
