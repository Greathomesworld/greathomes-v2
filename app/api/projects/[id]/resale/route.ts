import { NextRequest, NextResponse } from 'next/server';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { verifyInternalStaff } from '@/src/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const listings = await resaleListingService.getPublicListingsForProject(id);
    return NextResponse.json({ success: true, data: listings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const authResult = await verifyInternalStaff(req);
    if (!authResult.authorized) {
      return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status });
    }

    const { id } = await context.params;
    const body = await req.json();

    const listing = await resaleListingService.createListing({
      ...body,
      projectId: id,
    });

    return NextResponse.json({ success: true, data: listing }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
