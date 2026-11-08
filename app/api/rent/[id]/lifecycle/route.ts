import { NextRequest, NextResponse } from 'next/server';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { revalidateRentalPaths } from '@/src/lib/revalidateListingPaths';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const { id } = await context.params;
    const { lifecycleStatus } = await req.json();

    let requiredCap: any = 'listing.update';
    if (lifecycleStatus === 'SUBMITTED') requiredCap = 'listing.submit';
    else if (lifecycleStatus === 'UNDER_REVIEW') requiredCap = 'listing.review';
    else if (lifecycleStatus === 'APPROVED') requiredCap = 'listing.approve';
    else if (lifecycleStatus === 'PUBLISHED') requiredCap = 'listing.publish';
    else if (lifecycleStatus === 'PAUSED') requiredCap = 'listing.pause';
    else if (lifecycleStatus === 'ARCHIVED' || lifecycleStatus === 'SOLD_RENTED') requiredCap = 'listing.archive';

    const auth = await verifyStaffCapability(req, requiredCap);
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 403 });
    }

    const listing = await rentalListingService.transitionLifecycle(id, lifecycleStatus);
    revalidateRentalPaths({
      id: listing.id,
      slug: listing.slug,
      projectSlug: listing.project?.slug,
      locationSlug: listing.location?.slug ?? listing.project?.location?.slug,
    });
    return NextResponse.json({ success: true, listing, data: listing });
  } catch (err: any) {
    const status = err.name === 'InvalidLifecycleTransitionError' ? 400 : err.name === 'NotFoundError' ? 404 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
