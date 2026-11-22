import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '@/src/domain/customer/customerAuth';
import { propertySubmissionService } from '@/src/domain/propertySubmission/service';
import { handleGetCustomerSubmissionDetail } from '@/src/domain/propertySubmission/customerSubmissionRouteHandlers';
import {
  isPersistenceUnavailableError,
  PropertySubmissionDomainError,
} from '@/src/domain/propertySubmission/repository';
import {
  MAX_SUBMISSION_PHOTOS,
  photoItemSchema,
} from '@/src/domain/propertySubmission/validation';
import { extractRequestContext, withCorrelationHeaders } from '@/src/lib/requestContext';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return await handleGetCustomerSubmissionDetail(req, id);
}

export async function PUT(
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
    const body = await req.json();
    const rawPayload =
      body?.payload && typeof body.payload === 'object'
        ? { ...(body.payload as Record<string, unknown>) }
        : {};

    if (rawPayload.photos !== undefined) {
      if (!Array.isArray(rawPayload.photos)) {
        return withCorrelationHeaders(
          NextResponse.json(
            { success: false, error: 'Invalid photos payload format.' },
            { status: 400 }
          ),
          requestId
        );
      }
      if (rawPayload.photos.length > MAX_SUBMISSION_PHOTOS) {
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
      for (const item of rawPayload.photos) {
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
      delete rawPayload.photos;
    }

    const ifMatchHeader = req.headers.get('if-match')?.replace(/^W\//i, '').replace(/"/g, '').trim();
    const headerVersion =
      ifMatchHeader && /^\d+$/.test(ifMatchHeader) ? Number.parseInt(ifMatchHeader, 10) : undefined;
    const expectedVersion =
      typeof body?.expectedVersion === 'number' && Number.isInteger(body.expectedVersion)
        ? body.expectedVersion
        : headerVersion;

    const updated = await propertySubmissionService.updateDraft(id, auth.customerId, {
      payload: rawPayload,
      expectedVersion,
    });
    const response = NextResponse.json({ success: true, submission: updated });
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
    const errMsg = err instanceof Error ? err.message : 'Failed to update submission draft.';
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
