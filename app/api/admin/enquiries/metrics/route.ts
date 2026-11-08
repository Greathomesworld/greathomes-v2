import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { hasCapability } from '@/src/domain/auth/capabilities';
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
    const metrics = await enquiryService.getMetrics();
    return NextResponse.json({
      data: metrics,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get enquiry metrics' },
      { status: 500 }
    );
  }
}
