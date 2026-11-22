import { NextRequest, NextResponse } from 'next/server';
import { verifyInternalStaff, type AuthResult as StaffAuthResult } from '../auth/authorizationBoundary';
import { hasCapability } from '../auth/capabilities';
import type { StaffCapability } from '../auth/capabilityModel';
import { propertySubmissionService, PropertySubmissionService } from './service';
import { extractRequestContext, withCorrelationHeaders } from '../../lib/requestContext';
import { PropertySubmissionDomainError, isPersistenceUnavailableError } from './repository';

export interface StaffRouteDependencies {
  verifyStaff?: (req: NextRequest) => Promise<StaffAuthResult>;
  service?: PropertySubmissionService;
}

export function handleStaffErrorResponse(
  err: unknown,
  requestId: string,
  fallbackMessage: string
): NextResponse {
  if (isPersistenceUnavailableError(err)) {
    const response = NextResponse.json(
      {
        success: false,
        error: 'Property submission service is temporarily unavailable. Please try again later.',
      },
      { status: 503 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  if (err instanceof PropertySubmissionDomainError) {
    const response = NextResponse.json(
      err.fieldErrors
        ? { success: false, error: err.message, fieldErrors: err.fieldErrors }
        : { success: false, error: err.message },
      { status: err.statusCode }
    );
    return withCorrelationHeaders(response, requestId);
  }

  const message = err instanceof Error ? err.message : fallbackMessage;
  console.error('Staff Route Error:', err);
  const response = NextResponse.json({ success: false, error: message }, { status: 500 });
  return withCorrelationHeaders(response, requestId);
}

function forbiddenCapabilityResponse(role: string, capability: StaffCapability, requestId: string): NextResponse {
  return withCorrelationHeaders(
    NextResponse.json(
      { success: false, error: `Forbidden: role '${role}' lacks capability '${capability}'.` },
      { status: 403 }
    ),
    requestId
  );
}

async function authenticateStaff(
  req: NextRequest,
  requestId: string,
  deps?: StaffRouteDependencies
): Promise<
  | {
      ok: true;
      staffId: string;
      role: NonNullable<StaffAuthResult['role']>;
      service: PropertySubmissionService;
      response?: NextResponse;
    }
  | {
      ok: false;
      response: NextResponse;
      staffId?: string;
      role?: NonNullable<StaffAuthResult['role']>;
      service?: PropertySubmissionService;
    }
> {
  const verifyStaff = deps?.verifyStaff ?? verifyInternalStaff;
  const service = deps?.service ?? propertySubmissionService;

  const auth = await verifyStaff(req);
  if (!auth.authorized || !auth.role || !auth.staff) {
    return {
      ok: false,
      response: withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: auth.error || 'Staff authentication required.' },
          { status: auth.statusCode || 401 }
        ),
        requestId
      ),
    };
  }

  return {
    ok: true,
    staffId: auth.staff.id,
    role: auth.role,
    service,
  };
}

export async function handleListStaffSubmissions(
  req: NextRequest,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;

  if (!hasCapability(authResult.role, 'submission.read')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.read', requestId);
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') || undefined;
  const propertyType = searchParams.get('propertyType') || undefined;
  const listingPurpose = searchParams.get('listingPurpose') || undefined;
  const listingSource = searchParams.get('listingSource') || undefined;
  const assignedReviewerId = searchParams.get('assignedReviewerId') || undefined;
  const search = searchParams.get('search') || undefined;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  try {
    const result = await authResult.service.listSubmissionsForStaff({
      status,
      propertyType,
      listingPurpose,
      listingSource,
      assignedReviewerId,
      search,
      page: Number.isFinite(page) && page > 0 ? page : 1,
      limit: Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 20,
    });

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        ...result,
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to list property submissions for staff.');
  }
}

export async function handleGetStaffSubmissionDetail(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;

  if (!hasCapability(authResult.role, 'submission.read')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.read', requestId);
  }

  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const detail = await authResult.service.getSubmissionDetailForStaff(submissionId);
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        ...detail,
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to retrieve submission detail for staff.');
  }
}

async function parseJsonBody(
  req: NextRequest,
  requestId: string
): Promise<
  | { ok: true; body: Record<string, any>; response?: NextResponse }
  | { ok: false; response: NextResponse; body?: Record<string, any> }
> {
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object') {
      return {
        ok: false,
        response: withCorrelationHeaders(
          NextResponse.json({ success: false, error: 'JSON object request body required.' }, { status: 400 }),
          requestId
        ),
      };
    }
    return { ok: true, body: parsed as Record<string, any> };
  } catch {
    return {
      ok: false,
      response: withCorrelationHeaders(
        NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 }),
        requestId
      ),
    };
  }
}

export async function handleStaffSubmissionAction(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;

  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }),
      requestId
    );
  }

  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.body;

  const action = body?.action;
  if (!action || typeof action !== 'string') {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Review action type is required.' }, { status: 400 }),
      requestId
    );
  }

  const { staffId, role, service } = authResult;

  try {
    let result: unknown;
    switch (action) {
      case 'START_REVIEW':
        if (!hasCapability(role, 'submission.review')) {
          return forbiddenCapabilityResponse(role, 'submission.review', requestId);
        }
        result = await service.startReview(submissionId, staffId, role);
        break;

      case 'UPDATE_CHECKLIST':
        if (!hasCapability(role, 'submission.review')) {
          return forbiddenCapabilityResponse(role, 'submission.review', requestId);
        }
        result = await service.updateChecklist(submissionId, staffId, role, {
          checklist:
            body.checklist && typeof body.checklist === 'object' ? body.checklist : undefined,
          contactConfirmed:
            typeof body.contactConfirmed === 'boolean' ? body.contactConfirmed : undefined,
        });
        break;

      case 'EDIT_CURATED':
        if (!hasCapability(role, 'submission.editCurated')) {
          return forbiddenCapabilityResponse(role, 'submission.editCurated', requestId);
        }
        result = await service.editCuratedData(submissionId, staffId, role, body.curated ?? body);
        break;

      case 'REQUEST_CHANGES':
        if (!hasCapability(role, 'submission.requestChanges')) {
          return forbiddenCapabilityResponse(role, 'submission.requestChanges', requestId);
        }
        if (!body.submitterFeedback || typeof body.submitterFeedback !== 'string' || !body.submitterFeedback.trim()) {
          return withCorrelationHeaders(
            NextResponse.json(
              {
                success: false,
                error: 'Customer-visible correction feedback (submitterFeedback) is required when requesting changes.',
              },
              { status: 400 }
            ),
            requestId
          );
        }
        result = await service.requestChanges(submissionId, staffId, role, {
          submitterFeedback: body.submitterFeedback.trim(),
          internalNote: typeof body.internalNote === 'string' ? body.internalNote.trim() : undefined,
          checklist: body.checklist,
        });
        break;

      case 'ADD_NOTE':
        if (!hasCapability(role, 'submission.manageNotes')) {
          return forbiddenCapabilityResponse(role, 'submission.manageNotes', requestId);
        }
        if (!body.internalNote || typeof body.internalNote !== 'string' || !body.internalNote.trim()) {
          return withCorrelationHeaders(
            NextResponse.json({ success: false, error: 'Internal note text is required.' }, { status: 400 }),
            requestId
          );
        }
        result = await service.addInternalNote(submissionId, staffId, role, body.internalNote.trim());
        break;

      case 'ASSIGN_REVIEWER':
        if (!hasCapability(role, 'submission.assign')) {
          return forbiddenCapabilityResponse(role, 'submission.assign', requestId);
        }
        if (!body.assignedReviewerId || typeof body.assignedReviewerId !== 'string') {
          return withCorrelationHeaders(
            NextResponse.json({ success: false, error: 'Assigned reviewer ID is required.' }, { status: 400 }),
            requestId
          );
        }
        result = await service.assignReviewer(submissionId, staffId, role, body.assignedReviewerId.trim());
        break;

      case 'APPROVE':
        if (!hasCapability(role, 'submission.approve')) {
          return forbiddenCapabilityResponse(role, 'submission.approve', requestId);
        }
        result = await service.approveSubmission(submissionId, staffId, role, {
          contactConfirmed:
            typeof body.contactConfirmed === 'boolean' ? body.contactConfirmed : undefined,
          checklist:
            body.checklist && typeof body.checklist === 'object' ? body.checklist : undefined,
          internalNote: typeof body.internalNote === 'string' ? body.internalNote : undefined,
          submitterFeedback:
            typeof body.submitterFeedback === 'string' ? body.submitterFeedback : undefined,
        });
        break;

      case 'REJECT':
        if (!hasCapability(role, 'submission.reject')) {
          return forbiddenCapabilityResponse(role, 'submission.reject', requestId);
        }
        result = await service.rejectSubmission(submissionId, staffId, role, {
          reason: typeof body.reason === 'string' ? body.reason : '',
          internalNote: typeof body.internalNote === 'string' ? body.internalNote : undefined,
        });
        break;

      case 'PUBLISH':
        if (!hasCapability(role, 'submission.publish')) {
          return forbiddenCapabilityResponse(role, 'submission.publish', requestId);
        }
        result = await service.publishSubmission(submissionId, staffId, role);
        break;

      case 'DEACTIVATE':
        if (!hasCapability(role, 'submission.deactivate')) {
          return forbiddenCapabilityResponse(role, 'submission.deactivate', requestId);
        }
        result = await service.deactivateListing(
          submissionId,
          staffId,
          role,
          typeof body.reason === 'string' ? body.reason : '',
          typeof body.internalNote === 'string' ? body.internalNote : undefined
        );
        break;

      case 'REACTIVATE':
        if (!hasCapability(role, 'submission.reactivate')) {
          return forbiddenCapabilityResponse(role, 'submission.reactivate', requestId);
        }
        result = await service.reactivateListing(submissionId, staffId, role);
        break;

      case 'OVERRIDE':
        if (role !== 'SUPER_ADMIN' || !hasCapability(role, 'submission.override')) {
          return forbiddenCapabilityResponse(role, 'submission.override', requestId);
        }
        result = await service.overrideSubmission(submissionId, staffId, role, body);
        break;

      case 'RESOLVE_DUPLICATE':
        if (!hasCapability(role, 'submission.resolveDuplicate')) {
          return forbiddenCapabilityResponse(role, 'submission.resolveDuplicate', requestId);
        }
        if (!body.flagId || typeof body.flagId !== 'string') {
          return withCorrelationHeaders(
            NextResponse.json({ success: false, error: 'Duplicate flagId is required.' }, { status: 400 }),
            requestId
          );
        }
        result = await service.resolveDuplicateFlag(
          submissionId,
          body.flagId.trim(),
          staffId,
          role,
          body
        );
        break;

      case 'RESOLVE_CHANGE_REQUEST': {
        const reqType = typeof body.requestType === 'string' ? body.requestType.toUpperCase() : '';
        const neededCap: StaffCapability =
          reqType === 'REMOVAL' ? 'submission.resolveRemoval' : 'submission.resolveCorrection';
        if (
          reqType === 'REMOVAL'
            ? !hasCapability(role, 'submission.resolveRemoval')
            : reqType === 'CORRECTION'
              ? !hasCapability(role, 'submission.resolveCorrection')
              : !hasCapability(role, 'submission.resolveCorrection') &&
                !hasCapability(role, 'submission.resolveRemoval')
        ) {
          return forbiddenCapabilityResponse(role, neededCap, requestId);
        }
        if (!body.requestId || typeof body.requestId !== 'string') {
          return withCorrelationHeaders(
            NextResponse.json({ success: false, error: 'Change request ID is required.' }, { status: 400 }),
            requestId
          );
        }
        result = await service.resolveChangeRequest(
          submissionId,
          body.requestId.trim(),
          staffId,
          role,
          body
        );
        break;
      }

      default:
        return withCorrelationHeaders(
          NextResponse.json({ success: false, error: `Unknown review action: "${action}"` }, { status: 400 }),
          requestId
        );
    }

    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        ...(typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {}),
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to execute staff review action.');
  }
}

export async function handleApproveStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.approve')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.approve', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }

  let body: Record<string, any> = {};
  try {
    body = (await req.json()) || {};
  } catch {
    body = {};
  }

  try {
    const result = await authResult.service.approveSubmission(submissionId, authResult.staffId, authResult.role, {
      contactConfirmed: typeof body.contactConfirmed === 'boolean' ? body.contactConfirmed : undefined,
      checklist: body.checklist && typeof body.checklist === 'object' ? body.checklist : undefined,
      internalNote: typeof body.internalNote === 'string' ? body.internalNote : undefined,
      submitterFeedback: typeof body.submitterFeedback === 'string' ? body.submitterFeedback : undefined,
    });
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to approve submission.');
  }
}

export async function handleRejectStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.reject')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.reject', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }
  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await authResult.service.rejectSubmission(submissionId, authResult.staffId, authResult.role, {
      reason: typeof parsedBody.body.reason === 'string' ? parsedBody.body.reason : '',
      internalNote: typeof parsedBody.body.internalNote === 'string' ? parsedBody.body.internalNote : undefined,
    });
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to reject submission.');
  }
}

export async function handlePublishStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.publish')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.publish', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }

  try {
    const result = await authResult.service.publishSubmission(submissionId, authResult.staffId, authResult.role);
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to publish submission.');
  }
}

export async function handleDeactivateStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.deactivate')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.deactivate', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }
  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await authResult.service.deactivateListing(
      submissionId,
      authResult.staffId,
      authResult.role,
      typeof parsedBody.body.reason === 'string' ? parsedBody.body.reason : '',
      typeof parsedBody.body.internalNote === 'string' ? parsedBody.body.internalNote : undefined
    );
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to deactivate listing.');
  }
}

export async function handleReactivateStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.reactivate')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.reactivate', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }

  try {
    const result = await authResult.service.reactivateListing(submissionId, authResult.staffId, authResult.role);
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to reactivate listing.');
  }
}

export async function handleEditCuratedStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.editCurated')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.editCurated', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }
  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await authResult.service.editCuratedData(
      submissionId,
      authResult.staffId,
      authResult.role,
      parsedBody.body.curated ?? parsedBody.body
    );
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to update curated submission data.');
  }
}

export async function handleOverrideStaffSubmission(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (authResult.role !== 'SUPER_ADMIN' || !hasCapability(authResult.role, 'submission.override')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.override', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  if (!submissionId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }), requestId);
  }
  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await authResult.service.overrideSubmission(
      submissionId,
      authResult.staffId,
      authResult.role,
      parsedBody.body
    );
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to execute Super Admin override.');
  }
}

export async function handleResolveDuplicateFlag(
  req: NextRequest,
  rawSubmissionId: string,
  rawFlagId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;
  if (!hasCapability(authResult.role, 'submission.resolveDuplicate')) {
    return forbiddenCapabilityResponse(authResult.role, 'submission.resolveDuplicate', requestId);
  }
  const submissionId = rawSubmissionId?.trim();
  const flagId = rawFlagId?.trim();
  if (!submissionId || !flagId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission or flag identifier.' }, { status: 400 }), requestId);
  }
  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const result = await authResult.service.resolveDuplicateFlag(
      submissionId,
      flagId,
      authResult.staffId,
      authResult.role,
      parsedBody.body
    );
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to resolve duplicate flag.');
  }
}

export async function handleResolveChangeRequest(
  req: NextRequest,
  rawSubmissionId: string,
  rawRequestId: string,
  deps?: StaffRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const authResult = await authenticateStaff(req, requestId, deps);
  if (!authResult.ok) return authResult.response;

  const submissionId = rawSubmissionId?.trim();
  const changeRequestId = rawRequestId?.trim();
  if (!submissionId || !changeRequestId) {
    return withCorrelationHeaders(NextResponse.json({ success: false, error: 'Invalid submission or change request identifier.' }, { status: 400 }), requestId);
  }
  const parsedBody = await parseJsonBody(req, requestId);
  if (!parsedBody.ok) return parsedBody.response;

  const reqType = typeof parsedBody.body.requestType === 'string' ? parsedBody.body.requestType.toUpperCase() : '';
  if (
    reqType === 'REMOVAL'
      ? !hasCapability(authResult.role, 'submission.resolveRemoval')
      : reqType === 'CORRECTION'
        ? !hasCapability(authResult.role, 'submission.resolveCorrection')
        : !hasCapability(authResult.role, 'submission.resolveCorrection') &&
          !hasCapability(authResult.role, 'submission.resolveRemoval')
  ) {
    return forbiddenCapabilityResponse(
      authResult.role,
      reqType === 'REMOVAL' ? 'submission.resolveRemoval' : 'submission.resolveCorrection',
      requestId
    );
  }

  try {
    const result = await authResult.service.resolveChangeRequest(
      submissionId,
      changeRequestId,
      authResult.staffId,
      authResult.role,
      parsedBody.body
    );
    return withCorrelationHeaders(NextResponse.json({ ...result, success: true }), requestId);
  } catch (err: unknown) {
    return handleStaffErrorResponse(err, requestId, 'Failed to resolve change request.');
  }
}

