import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth, CustomerAuthResult } from '../customer/customerAuth.ts';
import {
  propertySubmissionService,
  PropertySubmissionService,
} from './service.ts';
import {
  isPersistenceUnavailableError,
  PropertySubmissionDomainError,
} from './repository.ts';
import { extractRequestContext, withCorrelationHeaders } from '../../lib/requestContext.ts';

export interface CustomerSubmissionRouteDependencies {
  authVerifier?: (req: NextRequest) => Promise<CustomerAuthResult>;
  service?: PropertySubmissionService;
}

export async function handleListCustomerSubmissions(
  req: NextRequest,
  deps?: CustomerSubmissionRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.authVerifier ?? verifyCustomerAuth;
  const service = deps?.service ?? propertySubmissionService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const url = new URL(req.url);
    const statusParam = url.searchParams.get('status') || undefined;
    const pageParam = url.searchParams.get('page');
    const limitParam = url.searchParams.get('limit');
    const compactParam = url.searchParams.get('compact');
    const compact = compactParam === '1' || compactParam === 'true';

    const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 12;

    const result = await service.getCustomerSubmissionsPaginated(auth.customerId, {
      status: statusParam,
      page: Number.isFinite(page) && page >= 1 ? page : 1,
      limit: Number.isFinite(limit) && limit >= 1 ? limit : 12,
      compact,
    });

    const responseBody: Record<string, unknown> = {
      success: true,
      items: result.items,
      pagination: result.pagination,
      countsByStatus: result.countsByStatus,
    };
    if (!compact) {
      responseBody.submissions = result.submissions;
    }

    const response = NextResponse.json(responseBody);
    response.headers.set('Cache-Control', 'no-store, max-age=0');
    return withCorrelationHeaders(response, requestId);
  } catch (err: unknown) {
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
    const status = err instanceof PropertySubmissionDomainError ? err.statusCode : 500;
    const message =
      err instanceof PropertySubmissionDomainError
        ? err.message
        : 'Failed to load property submissions.';
    const response = NextResponse.json({ success: false, error: message }, { status });
    return withCorrelationHeaders(response, requestId);
  }
}

export async function handleGetCustomerSubmissionDetail(
  req: NextRequest,
  submissionId: string,
  deps?: CustomerSubmissionRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.authVerifier ?? verifyCustomerAuth;
  const service = deps?.service ?? propertySubmissionService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const detail = await service.getCustomerSubmissionDetail(submissionId, auth.customerId);
    const response = NextResponse.json({
      success: true,
      submission: detail.submission,
      summary: {
        id: detail.id,
        referenceId: detail.referenceId,
        listingType: detail.listingType,
        listingSource: detail.listingSource,
        propertyType: detail.propertyType,
        submissionStatus: detail.submissionStatus,
        statusLabel: detail.statusLabel,
        title: detail.title,
        city: detail.city,
        locality: detail.locality,
        locationId: detail.locationId,
        projectId: detail.projectId,
        projectName: detail.projectName,
        configuration: detail.configuration,
        priceLabel: detail.priceLabel,
        coverPhotoUrl: detail.coverPhotoUrl,
        photoCount: detail.photoCount,
        version: detail.version,
        resaleListingId: detail.resaleListingId,
        rentalListingId: detail.rentalListingId,
        publishedListingSlug: detail.publishedListingSlug,
        createdAt: detail.createdAt,
        updatedAt: detail.updatedAt,
        submittedAt: detail.submittedAt,
        reviewedAt: detail.reviewedAt,
        approvedAt: detail.approvedAt,
        publishedAt: detail.publishedAt,
        deactivatedAt: detail.deactivatedAt,
        withdrawnAt: detail.withdrawnAt,
        lastActivityAt: detail.lastActivityAt,
        nextAction: detail.nextAction,
      },
      photos: detail.photos,
      reviews: detail.reviews,
      changeRequests: detail.changeRequests,
      latestFeedback: detail.latestFeedback,
      activityTimeline: detail.activityTimeline,
      permissions: detail.permissions,
      nextAction: detail.nextAction,
    });
    return withCorrelationHeaders(response, requestId);
  } catch (err: unknown) {
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
    const status = err instanceof PropertySubmissionDomainError ? err.statusCode : 404;
    const errMsg = err instanceof Error ? err.message : 'Submission not found.';
    const response = NextResponse.json({ success: false, error: errMsg }, { status });
    return withCorrelationHeaders(response, requestId);
  }
}

export async function handleWithdrawCustomerSubmission(
  req: NextRequest,
  submissionId: string,
  deps?: CustomerSubmissionRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.authVerifier ?? verifyCustomerAuth;
  const service = deps?.service ?? propertySubmissionService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const withdrawn = await service.withdraw(submissionId, auth.customerId);
    const detail = await service.getCustomerSubmissionDetail(submissionId, auth.customerId);

    const response = NextResponse.json({
      success: true,
      submission: withdrawn,
      summary: detail,
      message: 'Your property submission has been withdrawn and removed from the verification queue.',
    });
    return withCorrelationHeaders(response, requestId);
  } catch (err: unknown) {
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
    const errMsg = err instanceof Error ? err.message : 'Failed to withdraw property submission.';
    const isNotFound = errMsg.includes('not found');
    const status =
      err instanceof PropertySubmissionDomainError
        ? err.statusCode
        : isNotFound
        ? 404
        : 409;
    const response = NextResponse.json({ success: false, error: errMsg }, { status });
    return withCorrelationHeaders(response, requestId);
  }
}

export async function handleListCustomerChangeRequests(
  req: NextRequest,
  submissionId: string,
  deps?: CustomerSubmissionRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.authVerifier ?? verifyCustomerAuth;
  const service = deps?.service ?? propertySubmissionService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const changeRequests = await service.listCustomerChangeRequests(submissionId, auth.customerId);
    return withCorrelationHeaders(
      NextResponse.json({ success: true, changeRequests }),
      requestId
    );
  } catch (err: unknown) {
    if (isPersistenceUnavailableError(err)) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Property submission service is temporarily unavailable. Please try again later.',
          },
          { status: 503 }
        ),
        requestId
      );
    }
    const status = err instanceof PropertySubmissionDomainError ? err.statusCode : 400;
    const message = err instanceof Error ? err.message : 'Failed to load change requests.';
    return withCorrelationHeaders(NextResponse.json({ success: false, error: message }, { status }), requestId);
  }
}

export async function handleCreateCustomerChangeRequest(
  req: NextRequest,
  submissionId: string,
  deps?: CustomerSubmissionRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.authVerifier ?? verifyCustomerAuth;
  const service = deps?.service ?? propertySubmissionService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const changeRequest = await service.createChangeRequest(submissionId, auth.customerId, body);
    return withCorrelationHeaders(
      NextResponse.json({ success: true, changeRequest }, { status: 201 }),
      requestId
    );
  } catch (err: unknown) {
    if (isPersistenceUnavailableError(err)) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: 'Property submission service is temporarily unavailable. Please try again later.',
          },
          { status: 503 }
        ),
        requestId
      );
    }
    const status = err instanceof PropertySubmissionDomainError ? err.statusCode : 400;
    const message = err instanceof Error ? err.message : 'Failed to create change request.';
    const fieldErrors = err instanceof PropertySubmissionDomainError ? err.fieldErrors : undefined;
    return withCorrelationHeaders(
      NextResponse.json(
        fieldErrors ? { success: false, error: message, fieldErrors } : { success: false, error: message },
        { status }
      ),
      requestId
    );
  }
}

