import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { propertySubmissionService } from '@/src/domain/propertySubmission/service';
import { handleListCustomerSubmissions } from '@/src/domain/propertySubmission/customerSubmissionRouteHandlers';
import {
  isPersistenceUnavailableError,
  PropertySubmissionDomainError,
} from '@/src/domain/propertySubmission/repository';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(req: NextRequest) {
  return await handleListCustomerSubmissions(req);
}

export async function POST(req: NextRequest) {
  const { requestId } = extractRequestContext(req);
  const auth = await verifyCustomerAuth(req);

  if (!auth.authorized || !auth.customerId) {
    const response = NextResponse.json(
      { success: false, error: auth.error || 'Customer authentication required.' },
      { status: auth.statusCode || 401 }
    );
    return withCorrelationHeaders(response, requestId);
  }

  try {
    const body = await req.json();
    const rawPayload =
      body?.payload && typeof body.payload === 'object'
        ? { ...(body.payload as Record<string, unknown>) }
        : undefined;

    if (rawPayload && Array.isArray(rawPayload.photos) && rawPayload.photos.length > 0) {
      const response = NextResponse.json(
        {
          success: false,
          error:
            'Direct photo URLs or inline images cannot be submitted during draft creation. Upload photographs via /api/customer/submissions/[id]/media.',
        },
        { status: 400 }
      );
      return withCorrelationHeaders(response, requestId);
    }
    if (rawPayload) {
      delete rawPayload.photos;
    }

    const draft = await propertySubmissionService.createDraft(auth.customerId, {
      listingType: body.listingType,
      listingSource: body.listingSource,
      payload: rawPayload,
    });

    const response = NextResponse.json({ success: true, submission: draft }, { status: 201 });
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
    const errMsg = err instanceof Error ? err.message : 'Failed to create property submission draft.';
    const isForbidden =
      errMsg.includes('partner profile') || errMsg.includes('ACTIVE');
    const status =
      err instanceof PropertySubmissionDomainError
        ? err.statusCode
        : isForbidden
          ? 403
          : 400;
    const fieldErrors =
      err instanceof PropertySubmissionDomainError ? err.fieldErrors : undefined;
    const response = NextResponse.json(
      fieldErrors ? { success: false, error: errMsg, fieldErrors } : { success: false, error: errMsg },
      { status }
    );
    return withCorrelationHeaders(response, requestId);
  }
}
