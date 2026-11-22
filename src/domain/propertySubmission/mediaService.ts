import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import {
  getStorageProvider,
  getStorageProviderForAsset,
  StorageProvider,
} from '../media/storage/storageProvider.ts';
import { watermarkEngine, WatermarkOptions } from '../media/services/watermarkEngine.ts';
import { validateBinarySignature, validateFileMetadata } from '../../lib/fileSecurity.ts';
import { logger } from '../../lib/logger.ts';
import {
  mapMediaAssetToSubmissionPhoto,
  propertySubmissionRepository,
  PropertySubmissionDomainError,
  PropertySubmissionRepository,
  SubmissionMediaAssetRecord,
} from './repository.ts';
import {
  ALLOWED_SUBMISSION_IMAGE_MIMES,
  MAX_SUBMISSION_IMAGE_SIZE_BYTES,
  MAX_SUBMISSION_PHOTOS,
  normalizeSubmissionPhotoCategory,
  reorderSubmissionPhotosSchema,
  SubmissionPhotoItem,
  updateSubmissionPhotoMetadataSchema,
} from './validation.ts';

export const MIN_SUBMISSION_IMAGE_DIMENSION = 64;
export const MAX_SUBMISSION_IMAGE_DIMENSION = 12000;
export const MAX_SUBMISSION_OUTPUT_WIDTH = 2560;
export const MAX_SUBMISSION_OUTPUT_HEIGHT = 1920;

const EDITABLE_SUBMISSION_STATUSES: readonly string[] = ['DRAFT', 'CHANGES_REQUESTED'];

export interface StorageFailureDiagnostics {
  errorName: string;
  s3ErrorCode?: string;
  httpStatus?: number;
  operation: 'resolveStorage' | 'storage.put' | 'storage.delete';
  storageProvider: string;
  submissionId?: string;
}

export function extractSafeStorageErrorDiagnostics(
  err: unknown,
  context: {
    operation: 'resolveStorage' | 'storage.put' | 'storage.delete';
    storageProvider?: string;
    submissionId?: string;
  }
): StorageFailureDiagnostics {
  const errObj = err && typeof err === 'object' ? (err as Record<string, any>) : null;
  const rawName =
    err instanceof Error && typeof err.name === 'string' && err.name.trim()
      ? err.name.trim()
      : typeof errObj?.name === 'string' && errObj.name.trim()
        ? errObj.name.trim()
        : 'UnknownStorageError';

  const rawCode =
    typeof errObj?.Code === 'string' && errObj.Code.trim()
      ? errObj.Code.trim()
      : typeof errObj?.code === 'string' && errObj.code.trim()
        ? errObj.code.trim()
        : undefined;

  const rawStatus =
    typeof errObj?.$metadata?.httpStatusCode === 'number'
      ? errObj.$metadata.httpStatusCode
      : typeof errObj?.statusCode === 'number'
        ? errObj.statusCode
        : undefined;

  const configuredProvider = (process.env.STORAGE_PROVIDER || '').trim().toLowerCase();
  const safeProvider =
    context.storageProvider ||
    (configuredProvider === 's3' || configuredProvider === 'r2' || configuredProvider === 'local'
      ? configuredProvider
      : 'unknown');

  return {
    errorName: rawName.slice(0, 80),
    ...(rawCode ? { s3ErrorCode: rawCode.slice(0, 80) } : {}),
    ...(typeof rawStatus === 'number' ? { httpStatus: rawStatus } : {}),
    operation: context.operation,
    storageProvider: safeProvider,
    ...(context.submissionId ? { submissionId: context.submissionId } : {}),
  };
}

export function logStorageFailureDiagnostic(
  err: unknown,
  context: {
    operation: 'resolveStorage' | 'storage.put' | 'storage.delete';
    storageProvider?: string;
    submissionId?: string;
  }
): StorageFailureDiagnostics {
  const diagnostics = extractSafeStorageErrorDiagnostics(err, context);
  logger.error('[SubmissionMediaService] Storage operation failed', {
    action: 'SUBMISSION_MEDIA_STORAGE_FAILURE',
    resourceType: 'SUBMISSION',
    resourceId: diagnostics.submissionId,
    errorName: diagnostics.errorName,
    errorCode: diagnostics.s3ErrorCode || diagnostics.errorName,
    s3ErrorCode: diagnostics.s3ErrorCode,
    httpStatus: diagnostics.httpStatus,
    operation: diagnostics.operation,
    storageProvider: diagnostics.storageProvider,
    submissionId: diagnostics.submissionId,
  });
  return diagnostics;
}

export class SubmissionImageValidationError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'SubmissionImageValidationError';
    this.statusCode = statusCode;
  }
}

export class SubmissionStorageUnavailableError extends Error {
  public readonly statusCode: number = 503;
  public readonly code: string = 'STORAGE_UNAVAILABLE';
  public readonly diagnostics?: StorageFailureDiagnostics;

  constructor(
    message: string = 'Media storage service is temporarily unavailable. Please try again later.',
    diagnostics?: StorageFailureDiagnostics
  ) {
    super(message);
    this.name = 'SubmissionStorageUnavailableError';
    this.diagnostics = diagnostics;
  }
}

export function isStorageUnavailableError(
  err: unknown
): err is SubmissionStorageUnavailableError {
  if (err instanceof SubmissionStorageUnavailableError) return true;
  if (
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code?: unknown }).code === 'STORAGE_UNAVAILABLE'
  ) {
    return true;
  }
  return false;
}

export type WatermarkApplyFn = (
  buffer: Buffer,
  outputFormat?: 'webp' | 'avif' | 'jpeg',
  options?: WatermarkOptions & {
    quality?: number;
    effort?: number;
    smartSubsample?: boolean;
  }
) => Promise<Buffer>;

export interface ProcessedSubmissionImage {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/webp';
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  watermarkApplied: boolean;
}

export const DEFAULT_SUBMISSION_WEBP_EFFORT = 3;

function computeOrientedResizedDimensions(
  rawWidth: number,
  rawHeight: number,
  orientation: number | undefined,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  // EXIF orientations 5..8 rotate 90/270 degrees, swapping width and height
  const rotated = orientation !== undefined && orientation >= 5 && orientation <= 8;
  const orientedW = rotated ? rawHeight : rawWidth;
  const orientedH = rotated ? rawWidth : rawHeight;

  if (orientedW <= maxWidth && orientedH <= maxHeight) {
    return { width: orientedW, height: orientedH };
  }

  const scale = Math.min(maxWidth / orientedW, maxHeight / orientedH);
  return {
    width: Math.max(1, Math.round(orientedW * scale)),
    height: Math.max(1, Math.round(orientedH * scale)),
  };
}

export async function processSubmissionImageBuffer(
  buffer: Buffer,
  options?: {
    filename?: string;
    mimeType?: string;
    watermarkFn?: WatermarkApplyFn;
    skipPreValidation?: boolean;
    webpEffort?: number;
  }
): Promise<ProcessedSubmissionImage> {
  if (!buffer || buffer.length === 0) {
    throw new SubmissionImageValidationError('Uploaded image file is empty.', 400);
  }

  if (buffer.length > MAX_SUBMISSION_IMAGE_SIZE_BYTES) {
    throw new SubmissionImageValidationError(
      `Image file exceeds the maximum allowed size of ${Math.round(
        MAX_SUBMISSION_IMAGE_SIZE_BYTES / (1024 * 1024)
      )} MB.`,
      413
    );
  }

  const normalizedMime = (options?.mimeType || '').toLowerCase().trim();
  if (!options?.skipPreValidation) {
    if (
      normalizedMime &&
      !(ALLOWED_SUBMISSION_IMAGE_MIMES as readonly string[]).includes(normalizedMime)
    ) {
      throw new SubmissionImageValidationError(
        'Unsupported file format. Only JPEG, PNG, WebP, and AVIF images are permitted.',
        400
      );
    }

    if (options?.filename && normalizedMime) {
      const metaCheck = validateFileMetadata(options.filename, normalizedMime, buffer.length, {
        allowSvg: false,
        category: 'PROPERTY',
        entityType: 'SUBMISSION',
      });
      if (!metaCheck.valid || metaCheck.detectedType !== 'IMAGE') {
        throw new SubmissionImageValidationError(
          metaCheck.error || 'Only valid JPEG, PNG, WebP, or AVIF images are permitted.',
          400
        );
      }
    }

    if (normalizedMime) {
      const sigCheck = validateBinarySignature(buffer, normalizedMime);
      if (!sigCheck.valid) {
        throw new SubmissionImageValidationError(
          sigCheck.error || 'Uploaded file content does not match its declared image format.',
          400
        );
      }
    }
  }

  let inputMeta: sharp.Metadata;
  try {
    inputMeta = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 144_000_000,
    }).metadata();
  } catch {
    throw new SubmissionImageValidationError(
      'Uploaded image is corrupt, unreadable, or unsupported.',
      400
    );
  }

  const rawWidth = inputMeta.width || 0;
  const rawHeight = inputMeta.height || 0;
  if (
    rawWidth < MIN_SUBMISSION_IMAGE_DIMENSION ||
    rawHeight < MIN_SUBMISSION_IMAGE_DIMENSION
  ) {
    throw new SubmissionImageValidationError(
      `Image dimensions (${rawWidth}x${rawHeight}px) are too small. Minimum required dimensions are ${MIN_SUBMISSION_IMAGE_DIMENSION}x${MIN_SUBMISSION_IMAGE_DIMENSION}px.`,
      400
    );
  }

  if (
    rawWidth > MAX_SUBMISSION_IMAGE_DIMENSION ||
    rawHeight > MAX_SUBMISSION_IMAGE_DIMENSION
  ) {
    throw new SubmissionImageValidationError(
      `Image dimensions (${rawWidth}x${rawHeight}px) exceed maximum allowed ${MAX_SUBMISSION_IMAGE_DIMENSION}x${MAX_SUBMISSION_IMAGE_DIMENSION}px.`,
      400
    );
  }

  const webpEffort = options?.webpEffort ?? DEFAULT_SUBMISSION_WEBP_EFFORT;

  // Custom watermarkFn injection path (used by isolated unit tests)
  if (options?.watermarkFn) {
    const orientedBuffer = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 144_000_000,
    })
      .rotate()
      .resize({
        width: MAX_SUBMISSION_OUTPUT_WIDTH,
        height: MAX_SUBMISSION_OUTPUT_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();

    let watermarkedBuffer: Buffer;
    try {
      watermarkedBuffer = await options.watermarkFn(orientedBuffer, 'webp', {
        mode: 'ON',
        quality: 78,
        effort: webpEffort,
        smartSubsample: true,
      });
    } catch {
      throw new SubmissionImageValidationError(
        'Unable to apply mandatory image protection watermark. Upload rejected.',
        400
      );
    }

    if (!watermarkedBuffer || watermarkedBuffer.length === 0) {
      throw new SubmissionImageValidationError(
        'Processed image buffer is empty. Upload rejected.',
        400
      );
    }

    const finalMeta = await sharp(watermarkedBuffer).metadata();
    return {
      buffer: watermarkedBuffer,
      width: finalMeta.width || rawWidth,
      height: finalMeta.height || rawHeight,
      mimeType: 'image/webp',
      originalSizeBytes: buffer.length,
      optimizedSizeBytes: watermarkedBuffer.length,
      watermarkApplied: true,
    };
  }

  // Fast single-pass pipeline: decode -> EXIF auto-orient & strip metadata -> resize (<= 2560x1920)
  // -> composite cached official Great Homes watermark -> encode WebP once -> read output info.
  const targetDims = computeOrientedResizedDimensions(
    rawWidth,
    rawHeight,
    inputMeta.orientation,
    MAX_SUBMISSION_OUTPUT_WIDTH,
    MAX_SUBMISSION_OUTPUT_HEIGHT
  );

  let overlay: { input: Buffer; left: number; top: number; blend: 'over' };
  try {
    overlay = await watermarkEngine.getOfficialWatermarkComposite(
      targetDims.width,
      targetDims.height,
      { mode: 'ON' }
    );
  } catch {
    throw new SubmissionImageValidationError(
      'Unable to apply mandatory image protection watermark. Upload rejected.',
      400
    );
  }

  let outputData: Buffer;
  let outputInfo: sharp.OutputInfo;
  try {
    const rendered = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: 144_000_000,
    })
      .rotate()
      .resize({
        width: targetDims.width,
        height: targetDims.height,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .composite([overlay])
      .webp({
        quality: 78,
        effort: webpEffort,
        smartSubsample: true,
      })
      .toBuffer({ resolveWithObject: true });

    outputData = rendered.data;
    outputInfo = rendered.info;
  } catch {
    throw new SubmissionImageValidationError(
      'Unable to apply mandatory image protection watermark. Upload rejected.',
      400
    );
  }

  if (!outputData || outputData.length === 0) {
    throw new SubmissionImageValidationError(
      'Processed image buffer is empty. Upload rejected.',
      400
    );
  }

  return {
    buffer: outputData,
    width: outputInfo.width || targetDims.width,
    height: outputInfo.height || targetDims.height,
    mimeType: 'image/webp',
    originalSizeBytes: buffer.length,
    optimizedSizeBytes: outputData.length,
    watermarkApplied: true,
  };
}

export interface SubmissionMediaServiceOptions {
  repo?: PropertySubmissionRepository;
  storageProviderResolver?: () => StorageProvider;
  storageProviderForAssetResolver?: (providerName?: string) => StorageProvider;
  watermarkFn?: WatermarkApplyFn;
}

export class SubmissionMediaService {
  private readonly repo: PropertySubmissionRepository;
  private readonly resolveStorage: () => StorageProvider;
  private readonly resolveStorageForAsset: (providerName?: string) => StorageProvider;
  private readonly watermarkFn?: WatermarkApplyFn;

  constructor(options?: SubmissionMediaServiceOptions) {
    this.repo = options?.repo ?? propertySubmissionRepository;
    this.resolveStorage = options?.storageProviderResolver ?? (() => getStorageProvider());
    this.resolveStorageForAsset =
      options?.storageProviderForAssetResolver ??
      ((providerName?: string) => getStorageProviderForAsset(providerName));
    this.watermarkFn = options?.watermarkFn;
  }

  async listMedia(
    submissionId: string,
    customerId: string
  ): Promise<{ assets: SubmissionMediaAssetRecord[]; photos: SubmissionPhotoItem[] }> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const assets = await this.repo.listSubmissionMedia(submissionId, customerId.trim());
    return {
      assets,
      photos: assets.map(mapMediaAssetToSubmissionPhoto),
    };
  }

  async uploadMedia(
    submissionId: string,
    customerId: string,
    input: {
      buffer: Buffer;
      filename: string;
      mimeType: string;
      category?: string | null;
      caption?: string | null;
    }
  ): Promise<{
    asset: SubmissionMediaAssetRecord;
    assets: SubmissionMediaAssetRecord[];
    photos: SubmissionPhotoItem[];
  }> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const normalizedCustomerId = customerId.trim();

    // 1. Pre-flight check on metadata, MIME, size, and binary signature before DB/sharp
    if (!input.filename || !input.mimeType) {
      throw new SubmissionImageValidationError('Filename and image MIME type are required.', 400);
    }
    if (!input.buffer || input.buffer.length === 0) {
      throw new SubmissionImageValidationError('Uploaded image file is empty.', 400);
    }
    if (input.buffer.length > MAX_SUBMISSION_IMAGE_SIZE_BYTES) {
      throw new SubmissionImageValidationError(
        `Image size exceeds the ${Math.round(
          MAX_SUBMISSION_IMAGE_SIZE_BYTES / (1024 * 1024)
        )} MB limit.`,
        413
      );
    }

    const metaValidation = validateFileMetadata(
      input.filename,
      input.mimeType,
      input.buffer.length,
      {
        allowSvg: false,
        category: 'PROPERTY',
        entityType: 'SUBMISSION',
      }
    );
    if (!metaValidation.valid || metaValidation.detectedType !== 'IMAGE') {
      throw new SubmissionImageValidationError(
        metaValidation.error ||
          'Only valid property photographs (JPEG, PNG, WebP, AVIF) are permitted.',
        400
      );
    }

    const sigValidation = validateBinarySignature(input.buffer, input.mimeType);
    if (!sigValidation.valid) {
      throw new SubmissionImageValidationError(
        sigValidation.error || 'Image file signature does not match declared MIME type.',
        400
      );
    }

    // 2. Verify submission ownership, editable status, and pre-flight photo count limit
    const submission = await this.repo.getById(submissionId, normalizedCustomerId);
    if (!submission) {
      throw new PropertySubmissionDomainError('Submission not found or unauthorized', 404);
    }
    if (!EDITABLE_SUBMISSION_STATUSES.includes(submission.submissionStatus)) {
      throw new PropertySubmissionDomainError(
        `Cannot upload photographs for submission in status ${submission.submissionStatus}`,
        409
      );
    }

    const existingAssets = await this.repo.listSubmissionMedia(submissionId, normalizedCustomerId);
    if (existingAssets.length >= MAX_SUBMISSION_PHOTOS) {
      throw new PropertySubmissionDomainError(
        `Maximum ${MAX_SUBMISSION_PHOTOS} property photographs are permitted per submission.`,
        400
      );
    }

    // 3. Process image with Sharp: strip EXIF, resize, mandatory watermark, WebP encode
    const processed = await processSubmissionImageBuffer(input.buffer, {
      filename: metaValidation.sanitizedFilename || input.filename,
      mimeType: input.mimeType,
      watermarkFn: this.watermarkFn,
      skipPreValidation: true,
    });

    const assetId = `med_${uuidv4()}`;
    const storageKey = `media/submission/${submissionId}/${assetId}/public_wm.webp`;

    let storage: StorageProvider;
    try {
      storage = this.resolveStorage();
    } catch (resolveErr) {
      const diagnostics = logStorageFailureDiagnostic(resolveErr, {
        operation: 'resolveStorage',
        submissionId,
      });
      throw new SubmissionStorageUnavailableError(undefined, diagnostics);
    }

    let putResult;
    try {
      putResult = await storage.put(storageKey, processed.buffer, {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      });
    } catch (putErr) {
      const diagnostics = logStorageFailureDiagnostic(putErr, {
        operation: 'storage.put',
        storageProvider: storage.name,
        submissionId,
      });
      throw new SubmissionStorageUnavailableError(undefined, diagnostics);
    }

    const normalizedCategory = normalizeSubmissionPhotoCategory(input.category);
    const trimmedCaption =
      typeof input.caption === 'string' && input.caption.trim()
        ? input.caption.trim().slice(0, 200)
        : null;

    // 4. Persist atomically with DB cap lock; roll back uploaded object if DB persistence fails
    try {
      const result = await this.repo.addSubmissionMediaWithAtomicCap(
        submissionId,
        normalizedCustomerId,
        {
          id: assetId,
          filename: metaValidation.sanitizedFilename || 'photo.webp',
          mimeType: processed.mimeType,
          category: normalizedCategory,
          width: processed.width,
          height: processed.height,
          fileSizeBytes: processed.optimizedSizeBytes,
          storageProvider: putResult.provider,
          storageKey: putResult.key,
          url: putResult.url,
          originalUrl: putResult.url,
          thumbnailUrl: putResult.url,
          webpUrl: putResult.url,
          watermarkedUrl: putResult.url,
          watermarkApplied: true,
          caption: trimmedCaption,
          variants: {
            publicUrl: putResult.url,
            watermarkedWebp: putResult.url,
            webp: putResult.url,
            thumbnail: putResult.url,
            original: putResult.url,
          },
        },
        MAX_SUBMISSION_PHOTOS
      );

      return {
        asset: result.asset,
        assets: result.assets,
        photos: result.assets.map(mapMediaAssetToSubmissionPhoto),
      };
    } catch (dbErr) {
      // Compensating storage delete prevents orphan files when DB write or cap lock fails
      try {
        await storage.delete(putResult.key);
      } catch {
        // Ignore secondary cleanup error and preserve primary error
      }
      throw dbErr;
    }
  }

  async reorderMedia(
    submissionId: string,
    customerId: string,
    input: { photoIds: string[] }
  ): Promise<{ assets: SubmissionMediaAssetRecord[]; photos: SubmissionPhotoItem[] }> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const parsed = reorderSubmissionPhotosSchema.safeParse(input);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(', ') || 'Invalid reorder payload.';
      throw new PropertySubmissionDomainError(msg, 400);
    }

    const assets = await this.repo.reorderSubmissionMedia(
      submissionId,
      customerId.trim(),
      parsed.data.photoIds
    );
    return {
      assets,
      photos: assets.map(mapMediaAssetToSubmissionPhoto),
    };
  }

  async updateMediaMetadata(
    submissionId: string,
    customerId: string,
    mediaId: string,
    input: { isFeatured?: boolean; category?: string; caption?: string | null }
  ): Promise<{ assets: SubmissionMediaAssetRecord[]; photos: SubmissionPhotoItem[] }> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const parsed = updateSubmissionPhotoMetadataSchema.safeParse(input);
    if (!parsed.success) {
      const msg =
        parsed.error.issues.map((i) => i.message).join(', ') || 'Invalid photo update payload.';
      throw new PropertySubmissionDomainError(msg, 400);
    }

    const patch: { isFeatured?: boolean; category?: string; caption?: string | null } = {};
    if (parsed.data.isFeatured === true) {
      patch.isFeatured = true;
    }
    if (parsed.data.category !== undefined) {
      patch.category = normalizeSubmissionPhotoCategory(parsed.data.category);
    }
    if (parsed.data.caption !== undefined) {
      patch.caption = parsed.data.caption ? parsed.data.caption.trim() : null;
    }

    const assets = await this.repo.updateSubmissionMediaAsset(
      submissionId,
      customerId.trim(),
      mediaId,
      patch
    );
    return {
      assets,
      photos: assets.map(mapMediaAssetToSubmissionPhoto),
    };
  }

  async deleteMedia(
    submissionId: string,
    customerId: string,
    mediaId: string
  ): Promise<{ assets: SubmissionMediaAssetRecord[]; photos: SubmissionPhotoItem[] }> {
    if (!customerId || !customerId.trim()) {
      throw new PropertySubmissionDomainError('Authenticated customer identity is required.', 401);
    }
    const result = await this.repo.deleteSubmissionMediaAsset(
      submissionId,
      customerId.trim(),
      mediaId
    );

    if (result.remainingReferencesCount === 0 && result.deletedAsset.storageKey) {
      try {
        const storage = this.resolveStorageForAsset(result.deletedAsset.storageProvider);
        await storage.delete(result.deletedAsset.storageKey);
      } catch {
        // Storage cleanup failure must not fail already-committed DB removal
      }
    }

    return {
      assets: result.remainingAssets,
      photos: result.remainingAssets.map(mapMediaAssetToSubmissionPhoto),
    };
  }
}

export const submissionMediaService = new SubmissionMediaService();
