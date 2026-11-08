import { NextRequest, NextResponse } from 'next/server';
import { resaleListingService } from '@/src/domain/projects/services/resaleService';
import { verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { revalidateResalePaths } from '@/src/lib/revalidateListingPaths';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    await ensureSeedData();
    const { id } = await context.params;
    const body = await req.json();
    const { action, status, verifiedBy } = body;

    if (action === 'transition') {
      // Map lifecycle status to specific capability
      let requiredCap: any = 'listing.update';
      if (status === 'SUBMITTED') requiredCap = 'listing.submit';
      else if (status === 'UNDER_REVIEW') requiredCap = 'listing.review';
      else if (status === 'APPROVED') requiredCap = 'listing.approve';
      else if (status === 'PUBLISHED') requiredCap = 'listing.publish';
      else if (status === 'PAUSED') requiredCap = 'listing.pause';
      else if (status === 'ARCHIVED' || status === 'SOLD_RENTED') requiredCap = 'listing.archive';

      const authSpecific = await verifyStaffCapability(req, requiredCap);

      if (!authSpecific.authorized) {
        return NextResponse.json(
          { success: false, error: authSpecific.error || 'Unauthorized for this lifecycle transition' },
          { status: authSpecific.status || 403 }
        );
      }

      const result = await resaleListingService.transitionLifecycle(id, status);
      revalidateResalePaths({
        id: result.id,
        slug: result.slug,
        projectSlug: result.project?.slug,
        locationSlug: result.location?.slug ?? result.project?.location?.slug,
      });
      return NextResponse.json({ success: true, data: result });
    } else if (action === 'verify') {
      const authVerify = await verifyStaffCapability(req, 'listing.manageVerification');

      if (!authVerify.authorized) {
        return NextResponse.json(
          { success: false, error: authVerify.error || 'Unauthorized to manage verification' },
          { status: authVerify.status || 403 }
        );
      }

      const result = await resaleListingService.setVerificationStatus(
        id,
        status,
        verifiedBy || authVerify.role || 'Internal Staff'
      );
      revalidateResalePaths({
        id: result.id,
        slug: result.slug,
        projectSlug: result.project?.slug,
        locationSlug: result.location?.slug ?? result.project?.location?.slug,
      });
      return NextResponse.json({ success: true, data: result });
    } else {
      return NextResponse.json({ success: false, error: 'Invalid action. Must be "transition" or "verify".' }, { status: 400 });
    }
  } catch (error: any) {
    const status = error.name === 'NotFoundError' ? 404 : error.name === 'InvalidLifecycleTransitionError' ? 400 : 400;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
