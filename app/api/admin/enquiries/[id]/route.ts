import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff } from '@/src/domain/auth/authorizationBoundary';
import { hasCapability } from '@/src/domain/auth/capabilities';
import { enquiryService, EnquiryNotFoundError, EnquiryValidationError } from '@/src/domain/enquiry/services/enquiryService';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { auditService } from '@/src/domain/audit/auditService';

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
    console.error('[Admin Enquiry Detail GET] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to fetch enquiry' },
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

  const canMutateAnyEnquiryField =
    hasCapability(auth.role, 'enquiry.update') ||
    hasCapability(auth.role, 'MANAGE_ENQUIRIES') ||
    hasCapability(auth.role, 'enquiry.changeStatus') ||
    hasCapability(auth.role, 'enquiry.assign') ||
    hasCapability(auth.role, 'enquiry.manageNotes') ||
    hasCapability(auth.role, 'enquiry.manageFollowUp') ||
    hasCapability(auth.role, 'enquiry.manageSiteVisit');

  if (!canMutateAnyEnquiryField) {
    return NextResponse.json(
      { error: `Forbidden: role '${auth.role}' does not have permission to update enquiries` },
      { status: 403 }
    );
  }

  try {
    await ensureSeedData();
    const { id } = await params;
    const body = await req.json();

    // Check specific capability requirements based on payload
    if (body.status !== undefined && !hasCapability(auth.role, 'enquiry.changeStatus') && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.changeStatus'` },
        { status: 403 }
      );
    }

    if ((body.assignedTo !== undefined || body.assignedToName !== undefined) && !hasCapability(auth.role, 'enquiry.assign') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.assign'` },
        { status: 403 }
      );
    }

    if (body.priority !== undefined && !hasCapability(auth.role, 'enquiry.update') && !hasCapability(auth.role, 'MANAGE_ENQUIRIES')) {
      return NextResponse.json(
        { error: `Forbidden: role '${auth.role}' does not have capability 'enquiry.update'` },
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
    await auditService.record(req, auth.staff ? { id: auth.staff.id, role: auth.role } : null, {
      action: 'UPDATE_ENQUIRY',
      resourceType: 'ENQUIRY',
      resourceId: id,
      success: true,
      metadata: {
        updatedFields: Object.keys(body || {}),
        status: body?.status,
      },
    });
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
    console.error('[Admin Enquiry Detail PATCH] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to update enquiry' },
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
    await auditService.record(req, auth.staff ? { id: auth.staff.id, role: auth.role } : null, {
      action: 'DELETE_ENQUIRY',
      resourceType: 'ENQUIRY',
      resourceId: id,
      success: Boolean(deleted),
    });

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
    console.error('[Admin Enquiry Detail DELETE] Unexpected error:', error?.message || 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to delete enquiry' },
      { status: 500 }
    );
  }
}
