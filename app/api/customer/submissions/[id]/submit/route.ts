import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { propertySubmissionService } from '@/src/domain/propertySubmission/service';
import {
  isPersistenceUnavailableError,
  PropertySubmissionDomainError,
} from '@/src/domain/propertySubmission/repository';
import {
  MAX_SUBMISSION_PHOTOS,
  photoItemSchema,
} from '@/src/domain/propertySubmission/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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
    const { id } = await context.params;
    let bodyPayload: Record<string, unknown> | undefined = undefined;
    try {
      const body = await req.json();
      if (body?.payload && typeof body.payload === 'object') {
        bodyPayload = { ...(body.payload as Record<string, unknown>) };
        if (bodyPayload.photos !== undefined) {
          if (!Array.isArray(bodyPayload.photos)) {
            return withCorrelationHeaders(
              NextResponse.json(
                { success: false, error: 'Invalid photos payload format.' },
                { status: 400 }
              ),
              requestId
            );
          }
          if (bodyPayload.photos.length > MAX_SUBMISSION_PHOTOS) {
            return withCorrelationHeaders(
              NextResponse.json(
                {
                  success: false,
                  error: `Maximum ${MAX_SUBMISSION_PHOTOS} property photographs are permitted.`,
                },
                { status: 400 }
              ),
              requestId
            );
          }
          for (const item of bodyPayload.photos) {
            const parsedPhoto = photoItemSchema.safeParse(item);
            if (!parsedPhoto.success) {
              return withCorrelationHeaders(
                NextResponse.json(
                  {
                    success: false,
                    error:
                      parsedPhoto.error.issues[0]?.message ||
                      'Only server-uploaded Great Homes photographs are permitted.',
                  },
                  { status: 400 }
                ),
                requestId
              );
            }
          }
          delete bodyPayload.photos;
        }
      }
    } catch {
      // Optional payload override
    }

    const submitted = await propertySubmissionService.submitForReview(
      id,
      auth.customerId,
      bodyPayload
    );

    const response = NextResponse.json({
      success: true,
      submission: submitted,
      message:
        'Property submission received for verification. Your listing is under review by Great Homes and is not yet publicly published.',
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
    const errMsg = err instanceof Error ? err.message : 'Submission validation failed.';
    const isNotFound = errMsg.includes('not found');
    const isForbidden = errMsg.includes('partner profile') || errMsg.includes('ACTIVE');
    const status =
      err instanceof PropertySubmissionDomainError
        ? err.statusCode
        : isNotFound
          ? 404
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
