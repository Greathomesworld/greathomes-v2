import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { hasCapability } from '@/src/domain/auth/capabilities';
import { enquiryService, EnquiryNotFoundError, EnquiryValidationError } from '@/src/domain/enquiry/services/enquiryService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await verifyInternalStaff(req);
  if (!auth.authorized || !auth.role) {
    return NextResponse.json(
      { error: auth.error || 'Unauthorized' },
      { status: auth.statusCode || 401 }
    );
  }

  if (!hasCapability(auth.role, 'enquiry.assign') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
    return NextResponse.json(
      { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.assign'` },
      { status: 403 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await params;
    const body = await req.json();

    const updated = await enquiryService.updateEnquiry(id, {
      assignedTo: body.assignedTo ?? null,
      assignedToName: body.assignedToName ?? null,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof EnquiryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof EnquiryNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update assignment' }, { status: 500 });
  }
}
