import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import {
  PropertySubmissionRepository,
  PropertySubmissionDomainError,
  isPersistenceUnavailableError,
} from '../src/domain/propertySubmission/repository.ts';
import {
  PropertySubmissionService,
  SubmissionReferenceLookup,
} from '../src/domain/propertySubmission/service.ts';
import {
  SubmissionMediaService,
  SubmissionImageValidationError,
  processSubmissionImageBuffer,
  isStorageUnavailableError,
} from '../src/domain/propertySubmission/mediaService.ts';
import {
  handleGetSubmissionMedia,
  handlePostSubmissionMedia,
  handlePatchSubmissionMediaCollection,
  handlePatchSubmissionMediaItem,
  handleDeleteSubmissionMediaItem,
} from '../src/domain/propertySubmission/mediaRouteHandlers.ts';
import {
  MAX_SUBMISSION_PHOTOS,
  MIN_SUBMISSION_PHOTOS,
  MAX_SUBMISSION_IMAGE_SIZE_BYTES,
  CANONICAL_AMENITY_SLUG_SET,
  isValidPersistedSubmissionPhotoUrl,
  validateSubmissionForSubmit,
} from '../src/domain/propertySubmission/validation.ts';
import {
  watermarkEngine,
  isMandatoryWatermarkCategory,
  isNeverWatermarkCategory,
} from '../src/domain/media/services/watermarkEngine.ts';
import {
  getStorageProvider,
  TestSandboxStorageProvider,
} from '../src/domain/media/storage/storageProvider.ts';

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
      background: { r: 210, g: 185, b: 140 },
    },
  });

  if (withExif) {
    img = img.withMetadata({
      exif: {
        IFD0: {
          Make: 'TestCameraCorp',
          Model: 'SecretGPSPhone',
          Copyright: 'SensitiveOwnerExif',
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

async function runPp06Tests() {
  console.log('=== STARTING PP-06 PROPERTY IMAGE MANAGEMENT TESTS ===\n');

  const envRef = process.env as Record<string, string | undefined>;
  const savedNodeEnv = envRef.NODE_ENV;
  const savedVercelEnv = envRef.VERCEL_ENV;
  const savedDatabaseUrl = envRef.DATABASE_URL;
  const savedMediaIsolated = envRef.MEDIA_TEST_ISOLATED;

  const sandboxRoot = path.join('/tmp/gh-media-test-sandbox/storage');

  try {
    envRef.NODE_ENV = 'test';
    envRef.MEDIA_TEST_ISOLATED = 'true';
    delete envRef.VERCEL_ENV;
    delete envRef.DATABASE_URL;

    // Clean sandbox storage directory before running
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

    const ownerId = 'cust_pp06_owner';
    const attackerId = 'cust_pp06_attacker';

    const makeAuthFn = (customerId: string) => async () => ({
      authorized: true,
      customerId,
    });
    const unauthFn = async () => ({
      authorized: false,
      statusCode: 401 as const,
      error: 'Customer authentication required.',
    });

    // =========================================================================
    // 1. MEDIA POLICY & URL VALIDATION
    // =========================================================================
    console.log('1. Testing Media Policy, Watermark Enforcement & URL Validation...');

    assert.equal(isMandatoryWatermarkCategory('PROPERTY', 'SUBMISSION'), true);
    assert.equal(isNeverWatermarkCategory('LOGO', 'SUBMISSION'), false);
    assert.equal(isNeverWatermarkCategory('AVATAR', 'SUBMISSION'), false);
    assert.equal(watermarkEngine.shouldWatermark('LOGO', 800, 600, { mode: 'OFF' }, 'SUBMISSION'), true);

    assert.equal(
      isValidPersistedSubmissionPhotoUrl(
        'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_1/med_1/public_wm.webp'
      ),
      true
    );
    assert.equal(
      isValidPersistedSubmissionPhotoUrl('/uploads/media/submission/sub_1/med_1/public_wm.webp'),
      true
    );
    assert.equal(isValidPersistedSubmissionPhotoUrl('data:image/jpeg;base64,/9j/4AAQ='), false);
    assert.equal(
      isValidPersistedSubmissionPhotoUrl('https://images.unsplash.com/photo-1600596542815-ffad4c1539a9'),
      false
    );
    assert.equal(
      isValidPersistedSubmissionPhotoUrl('https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_1/med_1/tour.mp4'),
      false
    );
    assert.equal(
      isValidPersistedSubmissionPhotoUrl('https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_1/med_1/doc.pdf'),
      false
    );
    console.log('  ✓ Mandatory SUBMISSION watermarking and strict persisted-image URL policy verified.\n');

    // =========================================================================
    // 2. SHARP IMAGE PROCESSING PIPELINE (EXIF STRIP, WATERMARK, SANITY)
    // =========================================================================
    console.log('2. Testing Sharp Processing Pipeline (EXIF strip, resize, WebP, watermark, rejections)...');

    const jpegWithExif = await createSampleImageBuffer('jpeg', 3200, 2400, true);
    const inputMeta = await sharp(jpegWithExif).metadata();
    assert.ok(inputMeta.exif, 'Input sample JPEG should carry EXIF metadata prior to processing');

    const processedJpeg = await processSubmissionImageBuffer(jpegWithExif, {
      filename: 'living-room.jpg',
      mimeType: 'image/jpeg',
    });
    assert.equal(processedJpeg.mimeType, 'image/webp');
    assert.equal(processedJpeg.watermarkApplied, true);
    assert.ok(processedJpeg.width <= 2560);
    assert.ok(processedJpeg.height <= 1920);
    const outMeta = await sharp(processedJpeg.buffer).metadata();
    assert.equal(outMeta.format, 'webp');
    assert.equal(outMeta.exif, undefined, 'EXIF metadata must be completely stripped in output');

    // Reject tiny image (< 64px)
    const tinyPng = await createSampleImageBuffer('png', 32, 32, false);
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(tinyPng, {
          filename: 'tiny.png',
          mimeType: 'image/png',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );

    // Reject spoofed file (PNG bytes claiming image/jpeg)
    const pngBytes = await createSampleImageBuffer('png', 200, 200, false);
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(pngBytes, {
          filename: 'fake.jpg',
          mimeType: 'image/jpeg',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );

    // Reject corrupt buffer
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), {
          filename: 'corrupt.jpg',
          mimeType: 'image/jpeg',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );

    // Reject SVG / MP4 / PDF MIME & extensions
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(Buffer.from('<svg></svg>'), {
          filename: 'vector.svg',
          mimeType: 'image/svg+xml',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]), {
          filename: 'video.mp4',
          mimeType: 'video/mp4',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(Buffer.from('%PDF-1.4\n'), {
          filename: 'brochure.pdf',
          mimeType: 'application/pdf',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 400
    );

    // Reject > 10 MB payload with 413
    const oversized = Buffer.alloc(MAX_SUBMISSION_IMAGE_SIZE_BYTES + 1024, 0xaa);
    await assert.rejects(
      () =>
        processSubmissionImageBuffer(oversized, {
          filename: 'huge.jpg',
          mimeType: 'image/jpeg',
        }),
      (err: unknown) => err instanceof SubmissionImageValidationError && err.statusCode === 413
    );

    console.log('  ✓ Sharp processing, EXIF stripping, size cap (413), and format/signature rejections verified.\n');

    // =========================================================================
    // 3. MULTIPART UPLOAD, STORAGE PERSISTENCE & GALLERY CRUD VIA HANDLERS
    // =========================================================================
    console.log('3. Testing Multipart Upload, Sandbox Persistence & Gallery CRUD via API Route Handlers...');

    const draft = await submissionService.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'APARTMENT',
        location: {
          city: 'Kolkata',
          locality: 'Ballygunge',
          address: '12 Ballygunge Circular Road',
          isCustomLocality: true,
        },
        details: {
          bedroomCount: 3,
          bathroomCount: 3,
          carpetArea: 1450,
          askingPrice: 18500000,
        },
      },
    });

    const routeDeps = {
      verifyAuth: makeAuthFn(ownerId),
      mediaService,
    };

    // 3a. Unauthenticated requests blocked with 401
    const unauthGetRes = await handleGetSubmissionMedia(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media`),
      draft.id,
      { verifyAuth: unauthFn, mediaService }
    );
    assert.equal(unauthGetRes.status, 401);

    // 3b. JSON POST to /media rejected with 415 Unsupported Media Type
    const jsonMediaPostRes = await handlePostSubmissionMedia(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://evil.example.com/photo.jpg' }),
      }),
      draft.id,
      routeDeps
    );
    assert.equal(jsonMediaPostRes.status, 415);

    // 3c. Upload JPEG, PNG, and WebP photos sequentially
    const jpgBuf = await createSampleImageBuffer('jpeg', 1200, 900, true);
    const pngBuf = await createSampleImageBuffer('png', 1000, 750, false);
    const webpBuf = await createSampleImageBuffer('webp', 1280, 720, false);

    const up1Res = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
        { buffer: jpgBuf, filename: 'living.jpg', mimeType: 'image/jpeg' },
        { category: 'LOGO', caption: 'Spacious Living Area' } // category bypass attempt must be sanitized!
      ),
      draft.id,
      routeDeps
    );
    assert.equal(up1Res.status, 201);
    const up1Json = await up1Res.json();
    assert.equal(up1Json.success, true);
    assert.equal(up1Json.asset.watermarkApplied, true);
    assert.equal(up1Json.asset.isFeatured, true, 'First uploaded image must be auto-featured');
    assert.notEqual(up1Json.asset.category, 'LOGO', 'LOGO watermark-bypass category must be sanitized');
    assert.ok(up1Json.asset.url.startsWith(`/uploads/media/submission/${draft.id}/`));

    // Confirm file actually exists in sandbox storage
    const storedFilePath1 = path.join(sandboxRoot, up1Json.asset.storageKey);
    const storedStat1 = await fs.stat(storedFilePath1);
    assert.ok(storedStat1.size > 0);

    const up2Res = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
        { buffer: pngBuf, filename: 'bedroom.png', mimeType: 'image/png' },
        { category: 'Master Bedroom', caption: 'Master Bedroom' }
      ),
      draft.id,
      routeDeps
    );
    assert.equal(up2Res.status, 201);
    const up2Json = await up2Res.json();
    assert.equal(up2Json.asset.isFeatured, false);

    const up3Res = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
        { buffer: webpBuf, filename: 'kitchen.webp', mimeType: 'image/webp' },
        { category: 'Kitchen', caption: 'Modular Kitchen' }
      ),
      draft.id,
      routeDeps
    );
    assert.equal(up3Res.status, 201);
    const up3Json = await up3Res.json();
    assert.equal(up3Json.photos.length, 3);

    // Verify property_submissions.payload.photos is synchronized atomically
    const syncedDraft = await submissionService.getSubmission(draft.id, ownerId);
    const syncedPhotos = (syncedDraft.payload as { photos?: unknown[] }).photos || [];
    assert.equal(syncedPhotos.length, 3);

    // 3d. Reorder photographs via PATCH /media
    const id1 = up1Json.asset.id as string;
    const id2 = up2Json.asset.id as string;
    const id3 = up3Json.asset.id as string;

    const reorderRes = await handlePatchSubmissionMediaCollection(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoIds: [id3, id1, id2] }),
      }),
      draft.id,
      routeDeps
    );
    assert.equal(reorderRes.status, 200);
    const reorderJson = await reorderRes.json();
    assert.deepEqual(
      reorderJson.photos.map((p: { id: string }) => p.id),
      [id3, id1, id2]
    );

    // Reject partial/mismatched reorder list
    const badReorderRes = await handlePatchSubmissionMediaCollection(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ photoIds: [id3, id1] }),
      }),
      draft.id,
      routeDeps
    );
    assert.equal(badReorderRes.status, 400);

    // 3e. Set cover + update metadata via PATCH /media/[mediaId]
    const setCoverRes = await handlePatchSubmissionMediaItem(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media/${id2}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          isFeatured: true,
          category: 'Balcony / View',
          caption: 'Sunlit Master Suite & Balcony',
        }),
      }),
      draft.id,
      id2,
      routeDeps
    );
    assert.equal(setCoverRes.status, 200);
    const setCoverJson = await setCoverRes.json();
    const featuredAfterPatch = setCoverJson.photos.filter((p: { isFeatured: boolean }) => p.isFeatured);
    assert.equal(featuredAfterPatch.length, 1);
    assert.equal(featuredAfterPatch[0].id, id2);
    assert.equal(featuredAfterPatch[0].category, 'Balcony / View');

    // 3f. Delete featured photo (id2) -> auto-promotes next cover & removes file from sandbox storage
    const storedFilePath2 = path.join(sandboxRoot, up2Json.asset.storageKey);
    await fs.stat(storedFilePath2); // Confirm present before delete

    const deleteRes = await handleDeleteSubmissionMediaItem(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media/${id2}`, {
        method: 'DELETE',
      }),
      draft.id,
      id2,
      routeDeps
    );
    assert.equal(deleteRes.status, 200);
    const deleteJson = await deleteRes.json();
    assert.equal(deleteJson.photos.length, 2);
    assert.equal(
      deleteJson.photos.some((p: { isFeatured: boolean }) => p.isFeatured),
      true,
      'Deleting featured cover photo must auto-promote another photo to cover'
    );

    // Confirm deleted object is removed from sandbox storage
    await assert.rejects(() => fs.stat(storedFilePath2));

    console.log('  ✓ Multipart upload, reorder, cover promotion, and storage cleanup verified.\n');

    // =========================================================================
    // 4. ATOMIC 15-PHOTO CAP, CONCURRENCY & COMPENSATING ROLLBACK
    // =========================================================================
    console.log('4. Testing 15-Photo Cap, Concurrent Race Protection & Storage Rollback...');

    // Currently draft has 2 photos (id3, id1). Upload 13 more to hit 15.
    for (let i = 3; i <= MAX_SUBMISSION_PHOTOS; i++) {
      const res = await handlePostSubmissionMedia(
        buildMultipartRequest(
          `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
          { buffer: pngBuf, filename: `photo-${i}.png`, mimeType: 'image/png' }
        ),
        draft.id,
        routeDeps
      );
      assert.equal(res.status, 201, `Upload #${i} should succeed`);
    }

    const listAtCap = await mediaService.listMedia(draft.id, ownerId);
    assert.equal(listAtCap.photos.length, MAX_SUBMISSION_PHOTOS);

    // 16th upload must fail 400 and leave zero orphan files in sandbox directory
    const sandboxDirFilesBefore16 = await fs.readdir(
      path.join(sandboxRoot, 'media', 'submission', draft.id)
    );
    const up16Res = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
        { buffer: pngBuf, filename: 'overflow-16.png', mimeType: 'image/png' }
      ),
      draft.id,
      routeDeps
    );
    assert.equal(up16Res.status, 400);
    const sandboxDirFilesAfter16 = await fs.readdir(
      path.join(sandboxRoot, 'media', 'submission', draft.id)
    );
    assert.equal(sandboxDirFilesAfter16.length, sandboxDirFilesBefore16.length);

    // Concurrency race test near cap on a second draft: 14 uploaded, 3 concurrent uploads -> max 1 succeeds, 2 rolled back cleanly
    const raceDraft = await submissionService.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'PLOT',
        location: {
          city: 'Kolkata',
          locality: 'New Town',
          address: 'Plot A-7',
          isCustomLocality: true,
        },
        details: { plotArea: 2160, askingPrice: 8500000 },
      },
    });

    for (let i = 1; i <= MAX_SUBMISSION_PHOTOS - 1; i++) {
      await mediaService.uploadMedia(raceDraft.id, ownerId, {
        buffer: pngBuf,
        filename: `race-seed-${i}.png`,
        mimeType: 'image/png',
      });
    }

    const concurrentAttempts = await Promise.allSettled([
      mediaService.uploadMedia(raceDraft.id, ownerId, {
        buffer: pngBuf,
        filename: 'race-a.png',
        mimeType: 'image/png',
      }),
      mediaService.uploadMedia(raceDraft.id, ownerId, {
        buffer: pngBuf,
        filename: 'race-b.png',
        mimeType: 'image/png',
      }),
      mediaService.uploadMedia(raceDraft.id, ownerId, {
        buffer: pngBuf,
        filename: 'race-c.png',
        mimeType: 'image/png',
      }),
    ]);

    const raceFulfilled = concurrentAttempts.filter((r) => r.status === 'fulfilled').length;
    const raceRejected = concurrentAttempts.filter((r) => r.status === 'rejected').length;
    assert.equal(raceFulfilled, 1, 'Exactly one concurrent upload may claim the 15th slot');
    assert.equal(raceRejected, 2, 'Overflow concurrent uploads must fail cleanly');

    const raceMediaAfter = await mediaService.listMedia(raceDraft.id, ownerId);
    assert.equal(raceMediaAfter.photos.length, MAX_SUBMISSION_PHOTOS);

    const raceStorageSubdirs = await fs.readdir(
      path.join(sandboxRoot, 'media', 'submission', raceDraft.id)
    );
    let existingStoredWebpCount = 0;
    for (const subdir of raceStorageSubdirs) {
      const candidateFile = path.join(
        sandboxRoot,
        'media',
        'submission',
        raceDraft.id,
        subdir,
        'public_wm.webp'
      );
      const exists = await fs
        .stat(candidateFile)
        .then(() => true)
        .catch(() => false);
      if (exists) existingStoredWebpCount += 1;
    }
    assert.equal(
      existingStoredWebpCount,
      MAX_SUBMISSION_PHOTOS,
      'Compensating rollback must delete storage objects for rejected concurrent uploads'
    );

    console.log('  ✓ 15-photo cap, concurrent race serialization & compensating storage cleanup verified.\n');

    // =========================================================================
    // 5. OWNERSHIP ISOLATION, STATUS LOCKING & SUBMISSION PHOTO HARDENING
    // =========================================================================
    console.log('5. Testing Cross-Customer Isolation, Status Locking & Minimum 3 Photo Enforcement...');

    const attackerDeps = {
      verifyAuth: makeAuthFn(attackerId),
      mediaService,
    };

    const attackerGet = await handleGetSubmissionMedia(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media`),
      draft.id,
      attackerDeps
    );
    assert.equal(attackerGet.status, 404);

    const attackerPost = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
        { buffer: pngBuf, filename: 'intruder.png', mimeType: 'image/png' }
      ),
      draft.id,
      attackerDeps
    );
    assert.equal(attackerPost.status, 404);

    const attackerDelete = await handleDeleteSubmissionMediaItem(
      new NextRequest(`http://localhost:3000/api/customer/submissions/${draft.id}/media/${id1}`, {
        method: 'DELETE',
      }),
      draft.id,
      id1,
      attackerDeps
    );
    assert.equal(attackerDelete.status, 404);

    // Minimum 3 photos enforcement on submission
    const underMinDraft = await submissionService.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: {
        propertyType: 'PLOT',
        location: {
          city: 'Kolkata',
          locality: 'Rajarhat',
          address: 'Plot B-12',
          isCustomLocality: true,
        },
        details: { plotArea: 1800, askingPrice: 7200000 },
        consent: { ownerDeclarationAccepted: true },
      },
    });
    for (let i = 1; i <= MIN_SUBMISSION_PHOTOS - 1; i++) {
      await mediaService.uploadMedia(underMinDraft.id, ownerId, {
        buffer: pngBuf,
        filename: `under-${i}.png`,
        mimeType: 'image/png',
      });
    }
    await assert.rejects(
      () => submissionService.submitForReview(underMinDraft.id, ownerId),
      (err: unknown) => err instanceof PropertySubmissionDomainError && err.statusCode === 400
    );

    // Upload 3rd photo -> submit succeeds -> gallery mutations blocked with 409
    await mediaService.uploadMedia(underMinDraft.id, ownerId, {
      buffer: pngBuf,
      filename: 'under-3.png',
      mimeType: 'image/png',
    });
    const submitted = await submissionService.submitForReview(underMinDraft.id, ownerId);
    assert.equal(submitted.submissionStatus, 'SUBMITTED');

    const postAfterSubmit = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${underMinDraft.id}/media`,
        { buffer: pngBuf, filename: 'late.png', mimeType: 'image/png' }
      ),
      underMinDraft.id,
      routeDeps
    );
    assert.equal(postAfterSubmit.status, 409);

    // Forged/Base64/external URL validation fails cleanly in submission validator
    const forgedSubmit = validateSubmissionForSubmit({
      listingType: 'RESALE',
      listingSource: 'OWNER',
      propertyType: 'PLOT',
      location: { city: 'Kolkata', locality: 'Rajarhat', address: 'Plot B-12', isCustomLocality: true },
      details: { plotArea: 1800, askingPrice: 7200000 },
      photos: [
        { id: 'f1', url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', category: 'Plot View', sortOrder: 0, isFeatured: true },
        { id: 'f2', url: 'https://images.unsplash.com/photo-1', category: 'Plot View', sortOrder: 1, isFeatured: false },
        { id: 'f3', url: 'https://evil.example.com/p.jpg', category: 'Plot View', sortOrder: 2, isFeatured: false },
      ],
      consent: { ownerDeclarationAccepted: true },
    });
    assert.equal(forgedSubmit.success, false);

    console.log('  ✓ Cross-customer 404, post-submit 409 locking, min-3 enforcement & forged photo rejection verified.\n');

    // =========================================================================
    // 6. FAIL-CLOSED DB & STORAGE UNAVAILABILITY (503 WITHOUT SECRET LEAK)
    // =========================================================================
    console.log('6. Testing Fail-Closed 503 Guard for DB and Storage Unavailability...');

    const storageProvider = getStorageProvider();
    assert.ok(storageProvider instanceof TestSandboxStorageProvider);

    const failClosedDbRepo = new PropertySubmissionRepository({ dbResolver: () => null });
    const failClosedDbMediaService = new SubmissionMediaService({ repo: failClosedDbRepo });
    await assert.rejects(
      () => failClosedDbMediaService.listMedia(draft.id, ownerId),
      (err: unknown) => isPersistenceUnavailableError(err) && err.statusCode === 503
    );

    const failingStorageMediaService = new SubmissionMediaService({
      repo,
      storageProviderResolver: () => {
        throw new Error('R2 credentials S3_SECRET_KEY=supersecret leaked endpoint https://secret.r2.dev');
      },
    });
    const storageFailCapFirstRes = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${draft.id}/media`,
        { buffer: pngBuf, filename: 'fail.png', mimeType: 'image/png' }
      ),
      draft.id,
      {
        verifyAuth: makeAuthFn(ownerId),
        mediaService: failingStorageMediaService,
      }
    );
    assert.equal(storageFailCapFirstRes.status, 400, 'Cap check enforces 15-photo limit before storage call');

    // On a fresh draft under cap, unavailable storage must return fail-closed 503
    const freshDraftForStorageFail = await submissionService.createDraft(ownerId, {
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: { propertyType: 'APARTMENT' },
    });
    await assert.rejects(
      () =>
        failingStorageMediaService.uploadMedia(freshDraftForStorageFail.id, ownerId, {
          buffer: pngBuf,
          filename: 'fail.png',
          mimeType: 'image/png',
        }),
      (err: unknown) => isStorageUnavailableError(err) && err.statusCode === 503
    );

    const storageFailFreshHttpRes = await handlePostSubmissionMedia(
      buildMultipartRequest(
        `http://localhost:3000/api/customer/submissions/${freshDraftForStorageFail.id}/media`,
        { buffer: pngBuf, filename: 'fail.png', mimeType: 'image/png' }
      ),
      freshDraftForStorageFail.id,
      {
        verifyAuth: makeAuthFn(ownerId),
        mediaService: failingStorageMediaService,
      }
    );
    assert.equal(storageFailFreshHttpRes.status, 503);
    const storageFailBody = await storageFailFreshHttpRes.json();
    assert.equal(storageFailBody.error.includes('supersecret'), false);
    assert.equal(storageFailBody.error.includes('S3_SECRET_KEY'), false);

    console.log('  ✓ Fail-closed 503 guards verified with zero secret leakage.\n');
    console.log('=== ALL PP-06 PROPERTY IMAGE MANAGEMENT TESTS PASSED ===');
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
  }
}

runPp06Tests().catch((err) => {
  console.error('PP-06 Test Suite Failed:', err);
  process.exit(1);
});
