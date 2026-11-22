import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import {
  PropertySubmissionRepository,
  PropertySubmissionDomainError,
} from '../src/domain/propertySubmission/repository.ts';
import {
  PropertySubmissionService,
  SubmissionReferenceLookup,
} from '../src/domain/propertySubmission/service.ts';
import {
  SubmissionMediaService,
  SubmissionImageValidationError,
  processSubmissionImageBuffer,
  extractSafeStorageErrorDiagnostics,
  isStorageUnavailableError,
} from '../src/domain/propertySubmission/mediaService.ts';
import {
  handleGetSubmissionMedia,
  handlePostSubmissionMedia,
  handleDeleteSubmissionMediaItem,
} from '../src/domain/propertySubmission/mediaRouteHandlers.ts';
import {
  MAX_SUBMISSION_PHOTOS,
  CANONICAL_AMENITY_SLUG_SET,
} from '../src/domain/propertySubmission/validation.ts';
import {
  parsePhotoUploadXhrResponse,
  shouldShowPhotoGalleryEmptyState,
  getUploadFileIdentityKey,
  isDuplicateUploadQueueFile,
  PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE,
} from '../src/components/post-property/PostPropertyWizard.tsx';

async function createSampleImageBuffer(
  format: 'png' | 'jpeg' | 'webp',
  width = 800,
  height = 600,
  withExif = false
): Promise<Buffer> {
  let img = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 195, g: 165, b: 135 },
    },
  });

  if (withExif) {
    img = img.withMetadata({
      exif: {
        IFD0: {
          Make: 'PrivateCameraMaker',
          Model: 'PrivatePhoneModel',
          Copyright: 'PrivateOwnerExifTag',
        },
      },
    });
  }

  if (format === 'png') return img.png().toBuffer();
  if (format === 'webp') return img.webp().toBuffer();
  return img.jpeg({ quality: 88 }).toBuffer();
}

function buildMultipartRequest(
  url: string,
  fileField: { buffer: Buffer; filename: string; mimeType: string },
  extraFields?: Record<string, string>
): NextRequest {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(fileField.buffer)], { type: fileField.mimeType });
  formData.append('file', blob, fileField.filename);
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) {
      formData.append(k, v);
    }
  }
  return new NextRequest(url, {
    method: 'POST',
    body: formData,
  });
}

async function runPp11PhotoUploadRemediationTests() {
  console.log('=== STARTING PP-11 PHOTO UPLOAD REMEDIATION REGRESSION SUITE ===\n');

  const envRef = process.env as Record<string, string | undefined>;
  const savedNodeEnv = envRef.NODE_ENV;
  const savedVercelEnv = envRef.VERCEL_ENV;
  const savedDatabaseUrl = envRef.DATABASE_URL;
  const savedMediaIsolated = envRef.MEDIA_TEST_ISOLATED;
  const savedAppletId = envRef.APPLET_ID;
  const savedScopedWorkaround = envRef.MEDIA_ERROR_SCOPED_500_WORKAROUND;
  const savedNginxPassthrough = envRef.NGINX_API_503_PASSTHROUGH;

  const sandboxRoot = path.join('/tmp/gh-media-test-sandbox/storage');

  try {
    envRef.NODE_ENV = 'test';
    envRef.MEDIA_TEST_ISOLATED = 'true';
    delete envRef.VERCEL_ENV;
    delete envRef.DATABASE_URL;
    delete envRef.MEDIA_ERROR_SCOPED_500_WORKAROUND;
    delete envRef.NGINX_API_503_PASSTHROUGH;

    await fs.rm(sandboxRoot, { recursive: true, force: true });

    const referenceLookup: SubmissionReferenceLookup = {
      async findProjectById() {
        return null;
      },
      async findLocationById() {
        return null;
      },
      async listAmenityIdentifiers() {
        return new Set(CANONICAL_AMENITY_SLUG_SET);
      },
    };

    const repo = PropertySubmissionRepository.createForTesting({ dbResolver: () => null });
    repo.clearMemoryForTesting();
    const submissionService = new PropertySubmissionService(repo, referenceLookup);
    const mediaService = new SubmissionMediaService({ repo });

    const ownerId = 'cust_pp11_owner';
    const otherCustomerId = 'cust_pp11_other';

    const makeAuthFn = (customerId: string) => async () => ({
      authorized: true,
      customerId,
    });
    const unauthFn = async () => ({
      authorized: false,
      statusCode: 401 as const,
      error: 'Customer authentication required.',
    });

    const sampleJpeg = await createSampleImageBuffer('jpeg', 1200, 900, true);
    const samplePng = await createSampleImageBuffer('png', 640, 480, false);

    // =========================================================================
    // TEST 1, 2, 3 & 13: STORAGE FAILURE STRUCTURED JSON, 503 PRESERVATION,
    // SCOPED 500 WORKAROUND, SAFE DIAGNOSTICS & ZERO ORPHAN DB RECORDS
    // =========================================================================
    console.log('1–3 & 13. Testing Storage Failure JSON, 503 Preservation, Scoped 500 Workaround & No Orphan DB Records...');

    const draft1 = await submissionService.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: { propertyType: 'APARTMENT' },
    });

    const simulatedS3Error = Object.assign(
      new Error('Access denied for S3_SECRET_ACCESS_KEY=topsecret123 at https://secret-endpoint.r2.cloudflarestorage.com'),
      {
        name: 'NoSuchBucket',
        Code: 'NoSuchBucket',
        $metadata: { httpStatusCode: 404 },
      }
    );

    const diag = extractSafeStorageErrorDiagnostics(simulatedS3Error, {
      operation: 'storage.put',
      storageProvider: 's3',
      submissionId: draft1.id,
    });
    assert.equal(diag.errorName, 'NoSuchBucket');
    assert.equal(diag.s3ErrorCode, 'NoSuchBucket');
    assert.equal(diag.httpStatus, 404);
    assert.equal(diag.operation, 'storage.put');
    assert.equal(diag.storageProvider, 's3');
    assert.equal(diag.submissionId, draft1.id);
    assert.equal(JSON.stringify(diag).includes('topsecret123'), false);
    assert.equal(JSON.stringify(diag).includes('secret-endpoint'), false);

    const failingStorageService = new SubmissionMediaService({
      repo,
      storageProviderResolver: () => ({
        name: 's3',
        async put() {
          throw simulatedS3Error;
        },
        async upload() {
          throw simulatedS3Error;
        },
        async replace() {
          throw simulatedS3Error;
        },
        async delete() {
          return false;
        },
        async exists() {
          return false;
        },
        async read() {
          return null;
        },
        getPublicUrl(k: string) {
          return k;
        },
        async getSignedUrl(k: string) {
          return k;
        },
      }),
    });

    // (2) HTTP 503 preserved where Nginx interception is fixed (useScoped500Workaround: false)
    const res503 = await handlePostSubmissionMedia(
      buildMultipartRequest(`http://localhost:3000/api/customer/submissions/${draft1.id}/media`, {
        buffer: samplePng,
        filename: 'room-1.png',
        mimeType: 'image/png',
      }),
      draft1.id,
      {
        verifyAuth: makeAuthFn(ownerId),
        mediaService: failingStorageService,
        useScoped500Workaround: false,
      }
    );
    assert.equal(res503.status, 503);
    assert.ok(res503.headers.get('content-type')?.includes('application/json'));
    const body503 = await res503.json();
    assert.equal(body503.success, false);
    assert.equal(body503.code, 'STORAGE_UNAVAILABLE');
    assert.equal(typeof body503.error, 'string');
    assert.equal(body503.error.includes('topsecret123'), false);

    // (3) Scoped HTTP 500 workaround works when required (useScoped500Workaround: true)
    const res500 = await handlePostSubmissionMedia(
      buildMultipartRequest(`http://localhost:3000/api/customer/submissions/${draft1.id}/media`, {
        buffer: samplePng,
        filename: 'room-1.png',
        mimeType: 'image/png',
      }),
      draft1.id,
      {
        verifyAuth: makeAuthFn(ownerId),
        mediaService: failingStorageService,
        useScoped500Workaround: true,
      }
    );
    assert.equal(res500.status, 500);
    assert.ok(res500.headers.get('content-type')?.includes('application/json'));
    const body500 = await res500.json();
    assert.equal(body500.success, false);
    assert.equal(body500.code, 'STORAGE_UNAVAILABLE');
    assert.equal(typeof body500.error, 'string');
    assert.equal(body500.error.includes('topsecret123'), false);

    // (13) Storage failure does not create orphan database records
    const afterStorageFailureList = await mediaService.listMedia(draft1.id, ownerId);
    assert.equal(afterStorageFailureList.assets.length, 0);
    assert.equal(afterStorageFailureList.photos.length, 0);

    console.log('  ✓ Storage failure structured JSON, 503 preservation, scoped 500 workaround, safe diagnostics & zero orphan DB records verified.\n');

    // =========================================================================
    // TEST 4, 5 & 6: FRONTEND XHR RESPONSE PARSING (HTML 200, MALFORMED 200,
    // EMPTY BODY, 4XX, 5XX, AND VALID 201 SUCCESS)
    // =========================================================================
    console.log('4–6. Testing Frontend XHR Response Parser across HTML 200, Malformed 200, Empty, 4xx, 5xx & 201 Success...');

    // (4) HTTP 200 + HTML warmup page is treated as failure
    const html200Outcome = parsePhotoUploadXhrResponse({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      responseText: '<!DOCTYPE html><html><head><title>Warming up...</title></head><body>Please wait</body></html>',
    });
    assert.equal(html200Outcome.ok, false);
    if (!html200Outcome.ok) {
      assert.equal(html200Outcome.code, 'HTML_OR_WARMUP_RESPONSE');
      assert.equal(html200Outcome.errorMessage, PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE);
      assert.equal(html200Outcome.errorMessage.includes('(200)'), false);
    }

    // HTML body even if Content-Type header was omitted
    const htmlNoHeaderOutcome = parsePhotoUploadXhrResponse({
      status: 200,
      contentType: null,
      responseText: '<!doctype html><html><body>Warmup</body></html>',
    });
    assert.equal(htmlNoHeaderOutcome.ok, false);
    if (!htmlNoHeaderOutcome.ok) {
      assert.equal(htmlNoHeaderOutcome.code, 'HTML_OR_WARMUP_RESPONSE');
      assert.equal(htmlNoHeaderOutcome.errorMessage, PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE);
    }

    // (5) HTTP 200 + malformed JSON is treated as failure
    const malformed200Outcome = parsePhotoUploadXhrResponse({
      status: 200,
      contentType: 'application/json',
      responseText: '{"success": true, "photos": [invalid json',
    });
    assert.equal(malformed200Outcome.ok, false);
    if (!malformed200Outcome.ok) {
      assert.equal(malformed200Outcome.code, 'MALFORMED_JSON_RESPONSE');
      assert.equal(malformed200Outcome.errorMessage, PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE);
    }

    // Empty response body is treated as failure
    const empty200Outcome = parsePhotoUploadXhrResponse({
      status: 200,
      contentType: 'application/json',
      responseText: '   ',
    });
    assert.equal(empty200Outcome.ok, false);
    if (!empty200Outcome.ok) {
      assert.equal(empty200Outcome.code, 'EMPTY_RESPONSE_BODY');
      assert.equal(empty200Outcome.errorMessage, PHOTO_UPLOAD_SERVICE_UNAVAILABLE_MESSAGE);
    }

    // HTTP 200 with JSON missing success/photos array is treated as failure
    const incomplete200Outcome = parsePhotoUploadXhrResponse({
      status: 200,
      contentType: 'application/json',
      responseText: JSON.stringify({ status: 'ok' }),
    });
    assert.equal(incomplete200Outcome.ok, false);

    // HTTP 4xx structured JSON
    const err400Outcome = parsePhotoUploadXhrResponse({
      status: 400,
      contentType: 'application/json',
      responseText: JSON.stringify({
        success: false,
        error: 'Image dimensions (32x32px) are too small.',
      }),
    });
    assert.equal(err400Outcome.ok, false);
    if (!err400Outcome.ok) {
      assert.equal(err400Outcome.errorMessage, 'Image dimensions (32x32px) are too small.');
    }

    // HTTP 5xx structured JSON with STORAGE_UNAVAILABLE
    const err500Outcome = parsePhotoUploadXhrResponse({
      status: 500,
      contentType: 'application/json',
      responseText: JSON.stringify(body500),
    });
    assert.equal(err500Outcome.ok, false);
    if (!err500Outcome.ok) {
      assert.equal(err500Outcome.code, 'STORAGE_UNAVAILABLE');
      assert.equal(err500Outcome.isTemporaryUnavailable, true);
    }

    // (6) HTTP 201 + valid JSON updates the gallery
    const validUploadRes = await handlePostSubmissionMedia(
      buildMultipartRequest(`http://localhost:3000/api/customer/submissions/${draft1.id}/media`, {
        buffer: samplePng,
        filename: 'living-room.png',
        mimeType: 'image/png',
      }),
      draft1.id,
      {
        verifyAuth: makeAuthFn(ownerId),
        mediaService,
      }
    );
    assert.equal(validUploadRes.status, 201);
    const validUploadText = await validUploadRes.text();
    const valid201Outcome = parsePhotoUploadXhrResponse({
      status: validUploadRes.status,
      contentType: validUploadRes.headers.get('content-type'),
      responseText: validUploadText,
    });
    assert.equal(valid201Outcome.ok, true);
    if (valid201Outcome.ok) {
      assert.equal(valid201Outcome.photos.length, 1);
      assert.equal(valid201Outcome.photos[0].isFeatured, true);
    }

    console.log('  ✓ XHR response parser verified across HTML 200, malformed 200, empty body, 4xx, 5xx, and valid 201 JSON.\n');

    // =========================================================================
    // TEST 7, 8, 9 & 10: UPLOAD QUEUE EMPTY STATE & DUPLICATE FILE PROTECTION
    // =========================================================================
    console.log('7–10. Testing Empty State Visibility Conditions & Duplicate File Selection Protection...');

    // (8) Empty state is hidden when queue contains uploading or failed files
    assert.equal(shouldShowPhotoGalleryEmptyState(0, 1), false);
    assert.equal(shouldShowPhotoGalleryEmptyState(0, 4), false);
    assert.equal(shouldShowPhotoGalleryEmptyState(2, 1), false);
    assert.equal(shouldShowPhotoGalleryEmptyState(3, 0), false);

    // (9) Empty state appears ONLY when gallery and queue are both empty
    assert.equal(shouldShowPhotoGalleryEmptyState(0, 0), true);

    // (10) Duplicate file selection is prevented for uploading or failed queue items
    const fileA = {
      name: 'kitchen.jpg',
      size: 245000,
      lastModified: 1700000001000,
      type: 'image/jpeg',
    };
    const fileAIdentical = {
      name: 'kitchen.jpg',
      size: 245000,
      lastModified: 1700000001000,
      type: 'image/jpeg',
    };
    // Genuinely different files that happen to share the same filename
    const fileASameNameDifferentSize = {
      name: 'kitchen.jpg',
      size: 312000,
      lastModified: 1700000001000,
      type: 'image/jpeg',
    };
    const fileASameNameDifferentTimestamp = {
      name: 'kitchen.jpg',
      size: 245000,
      lastModified: 1700000099000,
      type: 'image/jpeg',
    };

    assert.equal(getUploadFileIdentityKey(fileA), getUploadFileIdentityKey(fileAIdentical));
    assert.notEqual(
      getUploadFileIdentityKey(fileA),
      getUploadFileIdentityKey(fileASameNameDifferentSize)
    );
    assert.notEqual(
      getUploadFileIdentityKey(fileA),
      getUploadFileIdentityKey(fileASameNameDifferentTimestamp)
    );

    const activeQueueWithFailedItem = [{ file: fileA, status: 'error' as const }];
    const activeQueueWithUploadingItem = [{ file: fileA, status: 'uploading' as const }];

    assert.equal(isDuplicateUploadQueueFile(fileAIdentical, activeQueueWithFailedItem), true);
    assert.equal(isDuplicateUploadQueueFile(fileAIdentical, activeQueueWithUploadingItem), true);
    assert.equal(
      isDuplicateUploadQueueFile(fileASameNameDifferentSize, activeQueueWithFailedItem),
      false,
      'Different file with same filename but different size must not be blocked'
    );
    assert.equal(
      isDuplicateUploadQueueFile(fileASameNameDifferentTimestamp, activeQueueWithFailedItem),
      false,
      'Different file with same filename but different lastModified must not be blocked'
    );
    assert.equal(
      isDuplicateUploadQueueFile(fileAIdentical, [], [fileA]),
      true,
      'Duplicate within the same selection batch must be blocked'
    );

    console.log('  ✓ Empty-state condition and duplicate file identity protection verified.\n');

    // =========================================================================
    // TEST 11 & 12: RETRY REUSES SUBMISSION ID & PRODUCES EXACTLY ONE RECORD + OBJECT
    // =========================================================================
    console.log('11–12. Testing Retry Submission ID Reuse & Single Media Record / Storage Object Creation...');

    const retryDraft = await submissionService.createDraft(ownerId, {
      listingType: 'RENTAL',
      listingSource: 'OWNER',
      payload: { propertyType: 'APARTMENT' },
    });
    const initialSubmissionId = retryDraft.id;

    // Simulate first attempt failing due to transient storage error
    await assert.rejects(
      () =>
        failingStorageService.uploadMedia(initialSubmissionId, ownerId, {
          buffer: samplePng,
          filename: 'retry-photo.png',
          mimeType: 'image/png',
        }),
      (err: unknown) => isStorageUnavailableError(err)
    );

    // Verify zero records exist after failed first attempt
    const afterFailedAttempt = await mediaService.listMedia(initialSubmissionId, ownerId);
    assert.equal(afterFailedAttempt.assets.length, 0);

    // Retry reuses existing submissionId via updateDraft (like syncDraftWithServer when submissionId is set)
    const updatedDraftBeforeRetry = await submissionService.updateDraft(
      initialSubmissionId,
      ownerId,
      {
        payload: { propertyType: 'APARTMENT' },
      }
    );
    assert.equal(updatedDraftBeforeRetry.id, initialSubmissionId);

    // Retry upload succeeds against real sandbox storage
    const retrySuccess = await mediaService.uploadMedia(initialSubmissionId, ownerId, {
      buffer: samplePng,
      filename: 'retry-photo.png',
      mimeType: 'image/png',
      category: 'Interior',
      caption: 'Retried living room',
    });
    assert.equal(retrySuccess.assets.length, 1);
    assert.equal(retrySuccess.photos.length, 1);

    const retryStorageSubdirs = await fs.readdir(
      path.join(sandboxRoot, 'media', 'submission', initialSubmissionId)
    );
    assert.equal(
      retryStorageSubdirs.length,
      1,
      'Successful retry must produce exactly one storage object directory'
    );

    console.log('  ✓ Retry submissionId reuse and single DB record + single storage object verified.\n');

    // =========================================================================
    // TEST 14, 15, 16, 17 & 18: MAGIC BYTES, EXIF STRIP, RESIZE, WATERMARK,
    // OWNERSHIP AUTHORIZATION & 15-PHOTO CAP
    // =========================================================================
    console.log('14–18. Testing Magic-Byte Validation, EXIF Stripping, Resize, Watermark, Ownership & 15-Photo Cap...');

    // (14) Magic-byte validation rejects spoofed payload
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(Buffer.from('not-an-image-payload'), {
          filename: 'spoof.jpg',
          mimeType: 'image/jpeg',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );

    // (15 & 16) EXIF stripping, resizing (<= 2560x1920), and watermarking
    const largeExifJpeg = await createSampleImageBuffer('jpeg', 3000, 2200, true);
    const preMeta = await sharp(largeExifJpeg).metadata();
    assert.ok(preMeta.exif, 'Pre-processed JPEG must contain EXIF');
    const processed = await processSubmissionImageBuffer(largeExifJpeg, {
      filename: 'large-exif.jpg',
      mimeType: 'image/jpeg',
    });
    assert.equal(processed.watermarkApplied, true);
    assert.equal(processed.mimeType, 'image/webp');
    assert.ok(processed.width <= 2560);
    assert.ok(processed.height <= 1920);
    const postMeta = await sharp(processed.buffer).metadata();
    assert.equal(postMeta.exif, undefined, 'EXIF must be stripped after processing');

    // (17) Customer ownership and authorization
    const unauthRes = await handleGetSubmissionMedia(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${initialSubmissionId}/media`),
      initialSubmissionId,
      { verifyAuth: unauthFn, mediaService }
    );
    assert.equal(unauthRes.status, 401);

    const idorGetRes = await handleGetSubmissionMedia(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${initialSubmissionId}/media`),
      initialSubmissionId,
      { verifyAuth: makeAuthFn(otherCustomerId), mediaService }
    );
    assert.equal(idorGetRes.status, 404);

    const idorDeleteRes = await handleDeleteSubmissionMediaItem(
      new NextRequest(
        `http://localhost:3000/api/customer/submissions/${initialSubmissionId}/media/${retrySuccess.asset.id}`,
        { method: 'DELETE' }
      ),
      initialSubmissionId,
      retrySuccess.asset.id,
      { verifyAuth: makeAuthFn(otherCustomerId), mediaService }
    );
    assert.equal(idorDeleteRes.status, 404);

    // (18) 15-photo cap enforcement
    for (let i = 2; i <= MAX_SUBMISSION_PHOTOS; i++) {
      await mediaService.uploadMedia(initialSubmissionId, ownerId, {
        buffer: samplePng,
        filename: `cap-photo-${i}.png`,
        mimeType: 'image/png',
      });
    }
    const atCapList = await mediaService.listMedia(initialSubmissionId, ownerId);
    assert.equal(atCapList.photos.length, MAX_SUBMISSION_PHOTOS);

    await assert.rejects(
      () =>
        mediaService.uploadMedia(initialSubmissionId, ownerId, {
          buffer: samplePng,
          filename: 'overflow-16.png',
          mimeType: 'image/png',
        }),
      (err: unknown) => err instanceof PropertySubmissionDomainError && err.statusCode === 400
    );

    console.log('  ✓ Magic-byte validation, EXIF strip, resize, watermark, ownership isolation & 15-photo cap verified.\n');
    console.log('=== ALL 18 PP-11 PHOTO UPLOAD REMEDIATION REGRESSION TESTS PASSED ===');
  } finally {
    await fs.rm(sandboxRoot, { recursive: true, force: true }).catch(() => {});
    if (savedNodeEnv !== undefined) envRef.NODE_ENV = savedNodeEnv;
    else delete envRef.NODE_ENV;
    if (savedVercelEnv !== undefined) envRef.VERCEL_ENV = savedVercelEnv;
    else delete envRef.VERCEL_ENV;
    if (savedDatabaseUrl !== undefined) envRef.DATABASE_URL = savedDatabaseUrl;
    else delete envRef.DATABASE_URL;
    if (savedMediaIsolated !== undefined) envRef.MEDIA_TEST_ISOLATED = savedMediaIsolated;
    else delete envRef.MEDIA_TEST_ISOLATED;
    if (savedAppletId !== undefined) envRef.APPLET_ID = savedAppletId;
    else delete envRef.APPLET_ID;
    if (savedScopedWorkaround !== undefined)
      envRef.MEDIA_ERROR_SCOPED_500_WORKAROUND = savedScopedWorkaround;
    else delete envRef.MEDIA_ERROR_SCOPED_500_WORKAROUND;
    if (savedNginxPassthrough !== undefined)
      envRef.NGINX_API_503_PASSTHROUGH = savedNginxPassthrough;
    else delete envRef.NGINX_API_503_PASSTHROUGH;
  }
}

runPp11PhotoUploadRemediationTests().catch((err) => {
  console.error('PP-11 Photo Upload Remediation Test Suite Failed:', err);
  process.exit(1);
});
