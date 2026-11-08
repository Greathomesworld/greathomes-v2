import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { hasCapability } from '@/src/domain/auth/capabilities';
import { enquiryService, EnquiryNotFoundError, EnquiryValidationError } from '@/src/domain/enquiry/services/enquiryService';
import { ensureSeedData } from '@/src/infrastructure/seed';

export async function GET(
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

  if (!hasCapability(auth.role, 'VIEW_ENQUIRIES') && !hasCapability(auth.role, 'enquiry.read')) {
    return NextResponse.json(
      { error: `Forbidden: role '${auth.role}' does not have capability 'VIEW_ENQUIRIES'` },
      { status: 403 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await params;
    const enquiry = await enquiryService.getEnquiryById(id);

    if (!enquiry) {
      return NextResponse.json(
        { error: `Enquiry with ID '${id}' not found.` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      data: enquiry,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch enquiry' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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

  try {
    await ensureSeedData();
    const { id } = await params;
    const body = await req.json();

    // Check specific capability requirements based on payload
    if (body.status && !hasCapability(auth.role, 'enquiry.changeStatus') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.changeStatus'` },
        { status: 403 }
      );
    }

    if (body.assignedTo !== undefined && !hasCapability(auth.role, 'enquiry.assign') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.assign'` },
        { status: 403 }
      );
    }

    if (body.internalNotes !== undefined && !hasCapability(auth.role, 'enquiry.manageNotes') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.manageNotes'` },
        { status: 403 }
      );
    }

    if ((body.lastContactedAt !== undefined || body.nextFollowUpAt !== undefined) && !hasCapability(auth.role, 'enquiry.manageFollowUp') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.manageFollowUp'` },
        { status: 403 }
      );
    }

    if ((body.siteVisitId !== undefined || body.requestSiteVisit !== undefined) && !hasCapability(auth.role, 'enquiry.manageSiteVisit') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.manageSiteVisit'` },
        { status: 403 }
      );
    }

    const updated = await enquiryService.updateEnquiry(id, body);
    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    if (error instanceof EnquiryValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }
    if (error instanceof EnquiryNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update enquiry' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

  if (!hasCapability(auth.role, 'enquiry.delete') && auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
    return NextResponse.json(
      { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.delete'` },
      { status: 403 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await params;
    const deleted = await enquiryService.deleteEnquiry(id);

    return NextResponse.json({
      success: deleted,
    });
  } catch (error: any) {
    if (error instanceof EnquiryNotFoundError) {
      return NextResponse.json(
        { error: error.message },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to delete enquiry' },
      { status: 500 }
    );
  }
}
