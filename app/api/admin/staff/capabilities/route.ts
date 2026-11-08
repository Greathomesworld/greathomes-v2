import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffCapability, getAllCapabilities, ROLE_CAPABILITIES } from '@/src/domain/auth/capabilities';
import { ALLOWED_STAFF_ROLES } from '@/src/domain/auth/authorizationBoundary';

export async function GET(req: NextRequest) {
  const auth = await verifyStaffCapability(req, 'staff.read');
  if (!auth.authorized) {
    return NextResponse.json(
      { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  return NextResponse.json({
    roles: ALLOWED_STAFF_ROLES,
    capabilities: getAllCapabilities(),
    roleMatrix: ROLE_CAPABILITIES,
  });
}
