import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { verifyStaffCapability, hasCapability } from '@/src/domain/auth/capabilities';
import { enquiryService } from '@/src/domain/enquiry/services/enquiryService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(req: NextRequest) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized || !auth.role) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  if (!hasCapability(auth.role, 'VIEW_ENQUIRIES') && !hasCapability(auth.role, 'enquiry.read')) {
    return NextResponse.json(
      { error: `Forbidden: role '${auth.role}' does not have capability 'VIEW_ENQUIRIES'` },
      { status: 403 }
    );
  }

  try {
    await ensureSeedData();
    const { searchParams } = new URL(req.url);

    const search = searchParams.get('search') || undefined;
    const status = searchParams.get('status') || undefined;
    const priority = searchParams.get('priority') || undefined;
    const contextType = searchParams.get('contextType') || undefined;
    const assignedTo = searchParams.get('assignedTo') || undefined;
    const dateRange = searchParams.get('dateRange') || undefined;
    const sortBy = searchParams.get('sortBy') || undefined;
    const sortOrder = (searchParams.get('sortOrder') as 'asc' | 'desc') || undefined;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await enquiryService.getEnquiries({
      search,
      status,
      priority,
      contextType,
      assignedTo,
      dateRange,
      sortBy,
      sortOrder,
      page,
      limit,
    });

    const totalPages = Math.ceil(result.total / limit);

    return NextResponse.json({
      data: result.items,
      total: result.total,
      page,
      limit,
      totalPages,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to list enquiries' },
      { status: 500 }
    );
  }
}
