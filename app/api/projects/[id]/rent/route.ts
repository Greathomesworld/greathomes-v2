import { NextRequest, NextResponse } from 'next/server';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { verifyInternalStaff } from '@/src/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const listings = await rentalListingService.getPublicListingsForProject(id);
    return NextResponse.json({ success: true, count: listings.length, listings });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  const authResult = await verifyInternalStaff(req);
  if (!authResult.authorized) {
    return NextResponse.json({ success: false, error: authResult.error }, { status: authResult.status || 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json();
    const listing = await rentalListingService.createListing({
      ...body,
      projectId: id,
    });
    return NextResponse.json({ success: true, listing }, { status: 201 });
  } catch (err: any) {
    const status = err.name === 'ValidationError' ? 400 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
