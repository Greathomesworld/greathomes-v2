import { NextRequest, NextResponse } from 'next/server';
import { verifyCustomerAuth } from '../customer/customerAuth.ts';
import {
  isPersistenceUnavailableError,
  PropertySubmissionDomainError,
} from './repository.ts';
import {
  isStorageUnavailableError,
  SubmissionImageValidationError,
  submissionMediaService,
  SubmissionMediaService,
} from './mediaService.ts';
import {
  MAX_SUBMISSION_IMAGE_SIZE_BYTES,
  MAX_SUBMISSION_PHOTOS,
  MIN_SUBMISSION_PHOTOS,
} from './validation.ts';
import { extractRequestContext, withCorrelationHeaders } from '../../lib/requestContext.ts';

export interface MediaRouteDependencies {
  verifyAuth?: typeof verifyCustomerAuth;
  mediaService?: SubmissionMediaService;
  useScoped500Workaround?: boolean;
}

export interface MediaErrorResponseOptions {
  useScoped500Workaround?: boolean;
}

const PRE_BUFFER_CONTENT_LENGTH_CAP = MAX_SUBMISSION_IMAGE_SIZE_BYTES + 512 * 1024; // 10 MB file + multipart boundary overhead

export function shouldUseScoped500Workaround(options?: MediaErrorResponseOptions): boolean {
  if (typeof options?.useScoped500Workaround === 'boolean') {
    return options.useScoped500Workaround;
  }
  if (process.env.NGINX_API_503_PASSTHROUGH === 'true') {
    return false;
  }
  if (process.env.MEDIA_ERROR_SCOPED_500_WORKAROUND === 'false') {
    return false;
  }
  if (process.env.MEDIA_ERROR_SCOPED_500_WORKAROUND === 'true') {
    return true;
  }
  // When running behind the AI Studio container Nginx reverse proxy (where error_page 502 503 504 = /warmup.html
  // is owned by the external container runtime and intercepts upstream 503 into HTTP 200 HTML),
  // use the narrowly scoped HTTP 500 workaround outside unit test runs so structured JSON reaches the browser.
  if (process.env.NODE_ENV !== 'test' && Boolean(process.env.APPLET_ID)) {
    return true;
  }
  return false;
}

export function sanitizeSubmissionRouteId(rawId: string | undefined | null): string | null {
  if (!rawId || typeof rawId !== 'string') return null;
  const trimmed = rawId.trim();
  if (!trimmed || trimmed.length > 120) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

export function handleMediaErrorResponse(
  err: unknown,
  requestId: string,
  fallbackMessage: string,
  options?: MediaErrorResponseOptions
): NextResponse {
  if (isStorageUnavailableError(err) || isPersistenceUnavailableError(err)) {
    const errorCode = isStorageUnavailableError(err)
      ? 'STORAGE_UNAVAILABLE'
      : 'PERSISTENCE_UNAVAILABLE';
    const status = shouldUseScoped500Workaround(options) ? 500 : 503;
    const response = NextResponse.json(
      {
        success: false,
        code: errorCode,
        error:
          'Property media service is temporarily unavailable. Please try again later.',
      },
      { status }
    );
    return withCorrelationHeaders(response, requestId);
  }

  if (err instanceof SubmissionImageValidationError) {
    const response = NextResponse.json(
      { success: false, error: err.message },
      { status: err.statusCode }
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

  const response = NextResponse.json(
    { success: false, error: fallbackMessage },
    { status: 500 }
  );
  return withCorrelationHeaders(response, requestId);
}

export async function handleGetSubmissionMedia(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: MediaRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.verifyAuth ?? verifyCustomerAuth;
  const mediaService = deps?.mediaService ?? submissionMediaService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  const submissionId = sanitizeSubmissionRouteId(rawSubmissionId);
  if (!submissionId) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const result = await mediaService.listMedia(submissionId, auth.customerId);
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        assets: result.assets,
        photos: result.photos,
        minPhotos: MIN_SUBMISSION_PHOTOS,
        maxPhotos: MAX_SUBMISSION_PHOTOS,
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleMediaErrorResponse(err, requestId, 'Failed to load submission photographs.', {
      useScoped500Workaround: deps?.useScoped500Workaround,
    });
  }
}

export async function handlePostSubmissionMedia(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: MediaRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.verifyAuth ?? verifyCustomerAuth;
  const mediaService = deps?.mediaService ?? submissionMediaService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  const submissionId = sanitizeSubmissionRouteId(rawSubmissionId);
  if (!submissionId) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }),
      requestId
    );
  }

  const contentType = (req.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('multipart/form-data')) {
    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: false,
          error:
            'Photographs must be uploaded as multipart/form-data binary files. JSON URL payloads are rejected.',
        },
        { status: 415 }
      ),
      requestId
    );
  }

  const rawContentLength = req.headers.get('content-length');
  if (rawContentLength) {
    const parsedLength = Number(rawContentLength);
    if (Number.isFinite(parsedLength) && parsedLength > PRE_BUFFER_CONTENT_LENGTH_CAP) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: `Image payload exceeds the maximum allowed size of ${Math.round(
              MAX_SUBMISSION_IMAGE_SIZE_BYTES / (1024 * 1024)
            )} MB.`,
          },
          { status: 413 }
        ),
        requestId
      );
    }
  }

  try {
    const formData = await req.formData();
    const fileEntry = formData.get('file');
    if (!fileEntry || typeof fileEntry === 'string') {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'A binary image file field ("file") is required.' },
          { status: 400 }
        ),
        requestId
      );
    }

    const file = fileEntry as File;
    if (file.size <= 0) {
      return withCorrelationHeaders(
        NextResponse.json(
          { success: false, error: 'Uploaded image file cannot be empty.' },
          { status: 400 }
        ),
        requestId
      );
    }
    if (file.size > MAX_SUBMISSION_IMAGE_SIZE_BYTES) {
      return withCorrelationHeaders(
        NextResponse.json(
          {
            success: false,
            error: `Image file exceeds the maximum allowed size of ${Math.round(
              MAX_SUBMISSION_IMAGE_SIZE_BYTES / (1024 * 1024)
            )} MB.`,
          },
          { status: 413 }
        ),
        requestId
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const categoryEntry = formData.get('category');
    const captionEntry = formData.get('caption');

    const result = await mediaService.uploadMedia(submissionId, auth.customerId, {
      buffer,
      filename: file.name || 'photograph.jpg',
      mimeType: file.type || '',
      category: typeof categoryEntry === 'string' ? categoryEntry : undefined,
      caption: typeof captionEntry === 'string' ? captionEntry : undefined,
    });

    return withCorrelationHeaders(
      NextResponse.json(
        {
          success: true,
          asset: result.asset,
          photos: result.photos,
          minPhotos: MIN_SUBMISSION_PHOTOS,
          maxPhotos: MAX_SUBMISSION_PHOTOS,
        },
        { status: 201 }
      ),
      requestId
    );
  } catch (err: unknown) {
    return handleMediaErrorResponse(
      err,
      requestId,
      'Failed to process and upload photograph.',
      {
        useScoped500Workaround: deps?.useScoped500Workaround,
      }
    );
  }
}

export async function handlePatchSubmissionMediaCollection(
  req: NextRequest,
  rawSubmissionId: string,
  deps?: MediaRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.verifyAuth ?? verifyCustomerAuth;
  const mediaService = deps?.mediaService ?? submissionMediaService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  const submissionId = sanitizeSubmissionRouteId(rawSubmissionId);
  if (!submissionId) {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid submission identifier.' }, { status: 400 }),
      requestId
    );
  }

  let body: { photoIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const result = await mediaService.reorderMedia(submissionId, auth.customerId, {
      photoIds: Array.isArray(body?.photoIds) ? (body.photoIds as string[]) : [],
    });
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        assets: result.assets,
        photos: result.photos,
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleMediaErrorResponse(err, requestId, 'Failed to reorder submission photographs.', {
      useScoped500Workaround: deps?.useScoped500Workaround,
    });
  }
}

export async function handlePatchSubmissionMediaItem(
  req: NextRequest,
  rawSubmissionId: string,
  rawMediaId: string,
  deps?: MediaRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.verifyAuth ?? verifyCustomerAuth;
  const mediaService = deps?.mediaService ?? submissionMediaService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  const submissionId = sanitizeSubmissionRouteId(rawSubmissionId);
  const mediaId = sanitizeSubmissionRouteId(rawMediaId);
  if (!submissionId || !mediaId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Invalid submission or photograph identifier.' },
        { status: 400 }
      ),
      requestId
    );
  }

  let body: { isFeatured?: boolean; category?: string; caption?: string | null };
  try {
    body = await req.json();
  } catch {
    return withCorrelationHeaders(
      NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400 }),
      requestId
    );
  }

  try {
    const result = await mediaService.updateMediaMetadata(
      submissionId,
      auth.customerId,
      mediaId,
      {
        isFeatured: body?.isFeatured,
        category: body?.category,
        caption: body?.caption,
      }
    );
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        assets: result.assets,
        photos: result.photos,
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleMediaErrorResponse(err, requestId, 'Failed to update photograph settings.', {
      useScoped500Workaround: deps?.useScoped500Workaround,
    });
  }
}

export async function handleDeleteSubmissionMediaItem(
  req: NextRequest,
  rawSubmissionId: string,
  rawMediaId: string,
  deps?: MediaRouteDependencies
): Promise<NextResponse> {
  const { requestId } = extractRequestContext(req);
  const verifyAuth = deps?.verifyAuth ?? verifyCustomerAuth;
  const mediaService = deps?.mediaService ?? submissionMediaService;

  const auth = await verifyAuth(req);
  if (!auth.authorized || !auth.customerId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: auth.error || 'Customer authentication required.' },
        { status: auth.statusCode || 401 }
      ),
      requestId
    );
  }

  const submissionId = sanitizeSubmissionRouteId(rawSubmissionId);
  const mediaId = sanitizeSubmissionRouteId(rawMediaId);
  if (!submissionId || !mediaId) {
    return withCorrelationHeaders(
      NextResponse.json(
        { success: false, error: 'Invalid submission or photograph identifier.' },
        { status: 400 }
      ),
      requestId
    );
  }

  try {
    const result = await mediaService.deleteMedia(submissionId, auth.customerId, mediaId);
    return withCorrelationHeaders(
      NextResponse.json({
        success: true,
        assets: result.assets,
        photos: result.photos,
      }),
      requestId
    );
  } catch (err: unknown) {
    return handleMediaErrorResponse(err, requestId, 'Failed to delete photograph.', {
      useScoped500Workaround: deps?.useScoped500Workaround,
    });
  }
}
