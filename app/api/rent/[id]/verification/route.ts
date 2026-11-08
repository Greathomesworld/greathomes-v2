import { NextRequest, NextResponse } from 'next/server';
import { rentalListingService } from '@/src/domain/projects/services/rentalService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const auth = await verifyStaffCapability(req, 'listing.manageVerification');
    const authManage = await verifyStaffCapability(req, 'MANAGE_RENTAL');
    if (!auth.authorized && !authManage.authorized) {
      return NextResponse.json({ success: false, error: auth.error || 'Unauthorized' }, { status: auth.status || 403 });
    }

    const { id } = await context.params;
    const { verificationStatus, verifiedBy } = await req.json();

    const listing = await rentalListingService.updateVerification(
      id,
      verificationStatus,
      verifiedBy || auth.role || 'Internal Staff'
    );
    const { revalidateRentalPaths } = await import('@/src/lib/revalidateListingPaths');
    revalidateRentalPaths({
      id: listing.id,
      slug: listing.slug,
      projectSlug: listing.project?.slug,
      locationSlug: listing.location?.slug ?? listing.project?.location?.slug,
    });
    return NextResponse.json({ success: true, listing, data: listing });
  } catch (err: any) {
    const status = err.name === 'NotFoundError' ? 404 : 500;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
