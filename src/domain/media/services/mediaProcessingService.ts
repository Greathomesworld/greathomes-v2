import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { getStorageProvider } from '../storage/storageProvider';
import {
  watermarkEngine,
  WatermarkOptions,
  isNeverWatermarkCategory,
  isMandatoryWatermarkCategory,
} from './watermarkEngine';
import {
  validateFileMetadata,
  validateBinarySignature,
  validateAndSanitizeSvgBuffer,
} from '@/src/lib/fileSecurity';

export interface MediaVariantSet {
  original: string;
  thumbnail: string;
  webp?: string;
  avif?: string;
  fallbackJpg?: string;
  watermarkedWebp?: string;
  watermarkedAvif?: string;
  watermarkedJpg?: string;
  publicUrl: string; // Canonical public URL (watermarked WebP for property photos, clean SVG/WebP for logos)
}

export type MediaProfile = 'PHOTO' | 'LOGO' | 'FLOOR_PLAN' | 'MASTER_PLAN' | 'DOCUMENT';

export interface ProcessedMediaResult {
  id: string;
  filename: string;
  mimeType: string;
  category: string;
  profile: MediaProfile;
  width: number;
  height: number;
  originalSizeBytes: number;
  optimizedSizeBytes: number;
  watermarkApplied: boolean;
  storageProvider: 'local' | 's3';
  storageKey: string;
  variants: MediaVariantSet;
  processingStatus: 'READY' | 'FAILED';
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'inside';
  format?: 'webp' | 'avif' | 'jpeg' | 'png';
  quality?: number;
}

export interface CompressionProfile {
  quality: number;
  effort: number;
  smartSubsample: boolean;
  alphaQuality?: number;
  lossless?: boolean;
}

export const FLOOR_PLAN_CATEGORIES = [
  'FLOOR_PLANS',
  'FLOOR_PLAN',
  'MASTER_PLAN',
] as const;

export const LOCATION_MAP_CATEGORIES = [
  'LOCATION',
  'LOCATION_MAP',
  'CONNECTIVITY_MAP',
] as const;

export const HERO_CATEGORIES = [
  'HERO',
  'HOMEPAGE_HERO',
  'BANNER',
  'FEATURED',
] as const;

/**
 * Resolves the canonical, server-enforced compression profile for each media category.
 * Approved in Great Homes V2 Phase 4A/4B.
 */
export function getCompressionProfileForCategory(
  category: string,
  isLogo: boolean = false
): CompressionProfile {
  const normCat = (category || 'OTHER').toUpperCase().trim();

  const isLogoCategory =
    isLogo ||
    normCat === 'LOGO' ||
    normCat.endsWith('_LOGO') ||
    normCat === 'BRAND';

  // Raster Developer Logos & Identity Assets: Q90, Effort 6, alphaQuality: 100, Lossy
  if (isLogoCategory) {
    return {
      quality: 90,
      effort: 6,
      smartSubsample: true,
      alphaQuality: 100,
      lossless: false,
    };
  }

  // Location Maps & Connectivity Guides: Q85, Effort 6, smartSubsample: true
  if ((LOCATION_MAP_CATEGORIES as readonly string[]).includes(normCat)) {
    return {
      quality: 85,
      effort: 6,
      smartSubsample: true,
    };
  }

  // Architectural Floor Plans & CAD Layouts: Q82, Effort 6, smartSubsample: true
  if ((FLOOR_PLAN_CATEGORIES as readonly string[]).includes(normCat)) {
    return {
      quality: 82,
      effort: 6,
      smartSubsample: true,
    };
  }

  // Homepage Hero & Major Elevation Visuals: Q82, Effort 6, smartSubsample: true
  if ((HERO_CATEGORIES as readonly string[]).includes(normCat)) {
    return {
      quality: 82,
      effort: 6,
      smartSubsample: true,
    };
  }

  // Standard Property Photographs (Exterior, Interior, Amenities, Resale/Rental Photos): Q78, Effort 6, smartSubsample: true
  return {
    quality: 78,
    effort: 6,
    smartSubsample: true,
  };
}

/**
 * Checks whether an existing media asset is a single-derivative watermarked WebP asset
 * that does NOT retain a separate unwatermarked original file in storage.
 * Used to prevent double-watermarking during reprocess requests.
 */
export function isSingleDerivativeWatermarkedAsset(asset: {
  watermarkApplied?: boolean;
  url?: string;
  originalUrl?: string;
  watermarkedUrl?: string;
  storageKey?: string;
}): boolean {
  if (!asset.watermarkApplied) return false;
  const orig = (asset.originalUrl || '').trim();
  const wm = (asset.watermarkedUrl || asset.url || '').trim();
  const key = (asset.storageKey || '').trim();

  if (!orig) return true;
  if (orig === wm) return true;
  if (orig.endsWith('/public_wm.webp') || orig.endsWith('public_wm.webp')) return true;
  if (key.endsWith('/public_wm.webp') || key.endsWith('public_wm.webp')) return true;
  return false;
}

export class MediaProcessingService {
  getProfileForCategory(category: string, mimeType: string = 'image/jpeg'): MediaProfile {
    const normMime = (mimeType || '').toLowerCase().trim();
    if (normMime === 'application/pdf') return 'DOCUMENT';
    const normCat = (category || 'OTHER').toUpperCase().trim();
    if (normCat === 'LOGO' || normCat.endsWith('_LOGO') || normCat === 'BRAND' || normMime === 'image/svg+xml') {
      return 'LOGO';
    }
    if (normCat === 'FLOOR_PLANS' || normCat === 'FLOOR_PLAN') {
      return 'FLOOR_PLAN';
    }
    if (normCat === 'MASTER_PLAN') {
      return 'MASTER_PLAN';
    }
    return 'PHOTO';
  }
  /**
   * Processes an uploaded media buffer according to the canonical Great Homes media policy:
   * 1. PDF Documents (BROCHURE, PDF FLOOR_PLANS): stored untouched as PDF, never watermarked.
   * 2. Logos & Identity Assets (LOGO, BRAND, OFFICE, EDITORIAL, DEVELOPER):
   *    - SVG: validated, sanitized, stored as vector .svg (logo.svg), never watermarked.
   *    - Raster (PNG/WebP/JPG): transparency & aspect ratio preserved, stored as clean logo.webp, never watermarked.
   * 3. Property Photographs, Floor Plans, Master Plans, Location Maps, Resale & Rental Photos:
   *    - Decoded in memory, auto-oriented, watermarked ONCE with the official Great Homes watermark SVG,
   *      encoded as WebP, and stored ONLY as a single permanent object (`public_wm.webp`).
   *    - Never stores duplicate unwatermarked originals, AVIFs, or fallback JPEGs.
   */
  async processUpload(
    buffer: Buffer,
    filename: string,
    mimeType: string,
    category: string = 'OTHER',
    entityType: string = 'PROJECT',
    entityId: string = 'general',
    watermarkOptions?: WatermarkOptions
  ): Promise<ProcessedMediaResult> {
    const normalizedCategory = (category || 'OTHER').toUpperCase().trim();
    const normalizedEntityType = (entityType || 'PROJECT').toUpperCase().trim();
    const normalizedMime = (mimeType || '').toLowerCase().trim();

    // 1. Validate file extension, MIME type, size, and category-specific SVG rules
    const validation = validateFileMetadata(filename, normalizedMime, buffer.length, {
      category: normalizedCategory,
      entityType: normalizedEntityType,
    });
    if (!validation.valid) {
      throw new Error(`Media validation failed: ${validation.error}`);
    }

    // 2. Validate binary magic signature against declared MIME type
    const sigValidation = validateBinarySignature(buffer, normalizedMime);
    if (!sigValidation.valid) {
      throw new Error(`Media validation failed: ${sigValidation.error}`);
    }

    const assetId = uuidv4();
    const sanitizedName = validation.sanitizedFilename || 'asset';
    const storage = getStorageProvider();
    const baseKey = `media/${normalizedEntityType.toLowerCase()}/${entityId}/${assetId}`;

    const profile = this.getProfileForCategory(normalizedCategory, normalizedMime);

    // 3. PIPELINE A: PDF Documents (Brochures, PDF Floor Plans)
    if (validation.detectedType === 'DOCUMENT' || normalizedMime === 'application/pdf') {
      const origKey = `${baseKey}/original_${sanitizedName}`;
      const origResult = await storage.put(origKey, buffer, {
        contentType: 'application/pdf',
        isImmutableOriginal: true,
      });

      return {
        id: assetId,
        filename: sanitizedName,
        mimeType: 'application/pdf',
        category: normalizedCategory,
        profile: 'DOCUMENT',
        width: 0,
        height: 0,
        originalSizeBytes: buffer.length,
        optimizedSizeBytes: buffer.length,
        watermarkApplied: false,
        storageProvider: storage.name,
        storageKey: origResult.key,
        variants: {
          original: origResult.url,
          thumbnail: origResult.url,
          publicUrl: origResult.url,
        },
        processingStatus: 'READY',
      };
    }

    // 4. PIPELINE B: Logos & Brand Identity Assets (Never Watermarked)
    if (
      validation.detectedType === 'SVG_LOGO' ||
      normalizedMime === 'image/svg+xml' ||
      isNeverWatermarkCategory(normalizedCategory, normalizedEntityType, normalizedMime)
    ) {
      // Case B1: Vector SVG Logo
      if (normalizedMime === 'image/svg+xml' || sanitizedName.toLowerCase().endsWith('.svg')) {
        const svgValidation = validateAndSanitizeSvgBuffer(buffer);
        if (!svgValidation.valid || !svgValidation.sanitizedBuffer) {
          throw new Error(`Media validation failed: ${svgValidation.error || 'Invalid SVG logo.'}`);
        }

        const svgKey = `${baseKey}/logo.svg`;
        const svgResult = await storage.put(svgKey, svgValidation.sanitizedBuffer, {
          contentType: 'image/svg+xml',
          cacheControl: 'public, max-age=31536000, immutable',
        });

        const svgFilename = sanitizedName.toLowerCase().endsWith('.svg')
          ? sanitizedName
          : `${sanitizedName}.svg`;

        return {
          id: assetId,
          filename: svgFilename,
          mimeType: 'image/svg+xml',
          category: normalizedCategory,
          profile: 'LOGO',
          width: svgValidation.width || 400,
          height: svgValidation.height || 120,
          originalSizeBytes: buffer.length,
          optimizedSizeBytes: svgValidation.sanitizedBuffer.length,
          watermarkApplied: false,
          storageProvider: storage.name,
          storageKey: svgResult.key,
          variants: {
            original: svgResult.url,
            thumbnail: svgResult.url,
            publicUrl: svgResult.url,
          },
          processingStatus: 'READY',
        };
      }

      // Case B2: Raster Logo / Identity Asset (PNG, WebP, JPEG, AVIF) -> Clean unwatermarked WebP preserving alpha
      let metadata: sharp.Metadata;
      try {
        metadata = await sharp(buffer, { failOn: 'error' }).metadata();
      } catch {
        throw new Error('Media validation failed: Corrupt or unreadable raster logo image.');
      }

      const rawWidth = metadata.width || 0;
      const rawHeight = metadata.height || 0;
      if (rawWidth < 8 || rawHeight < 8) {
        throw new Error('Media validation failed: Logo dimensions are invalid.');
      }

      const isLogo =
        normalizedCategory === 'LOGO' ||
        normalizedCategory.endsWith('_LOGO') ||
        normalizedCategory === 'BRAND';
      const maxDim = isLogo ? 1600 : 2560;
      const logoProfile = getCompressionProfileForCategory(normalizedCategory, true);

      const cleanLogoBuffer = await sharp(buffer)
        .rotate()
        .resize({
          width: maxDim,
          height: maxDim,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: logoProfile.quality,
          alphaQuality: logoProfile.alphaQuality ?? 100,
          lossless: false,
          effort: logoProfile.effort,
          smartSubsample: logoProfile.smartSubsample,
        })
        .toBuffer();

      const finalMeta = await sharp(cleanLogoBuffer).metadata();
      const finalWidth = finalMeta.width || rawWidth;
      const finalHeight = finalMeta.height || rawHeight;

      const logoKey = `${baseKey}/logo.webp`;
      const logoResult = await storage.put(logoKey, cleanLogoBuffer, {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      });

      return {
        id: assetId,
        filename: sanitizedName,
        mimeType: 'image/webp',
        category: normalizedCategory,
        profile: 'LOGO',
        width: finalWidth,
        height: finalHeight,
        originalSizeBytes: buffer.length,
        optimizedSizeBytes: cleanLogoBuffer.length,
        watermarkApplied: false,
        storageProvider: storage.name,
        storageKey: logoResult.key,
        variants: {
          original: logoResult.url,
          thumbnail: logoResult.url,
          webp: logoResult.url,
          publicUrl: logoResult.url,
        },
        processingStatus: 'READY',
      };
    }

    // 5. PIPELINE C: Eligible Property Photographs, Floor Plans, Master Plans, Location Maps, Resale & Rental Photos
    // Server-enforced mandatory watermark + single permanent WebP object (`public_wm.webp`)
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, { failOn: 'error' }).metadata();
    } catch {
      throw new Error('Media validation failed: Corrupt or unreadable image buffer.');
    }

    const rawWidth = metadata.width || 0;
    const rawHeight = metadata.height || 0;
    if (rawWidth < 16 || rawHeight < 16) {
      throw new Error(
        `Media validation failed: Image dimensions (${rawWidth}x${rawHeight}) are too small. Minimum supported is 16x16px.`
      );
    }

    const maxMasterWidth = 2560;
    const maxMasterHeight = 1920;

    // Decode & orient in memory only (never persisted unwatermarked)
    const orientedMasterBuffer = await sharp(buffer)
      .rotate()
      .resize({
        width: maxMasterWidth,
        height: maxMasterHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toBuffer();

    const masterMeta = await sharp(orientedMasterBuffer).metadata();
    const finalWidth = masterMeta.width || rawWidth;
    const finalHeight = masterMeta.height || rawHeight;

    const compressionProfile = getCompressionProfileForCategory(normalizedCategory, false);

    // Enforce mandatory watermark regardless of client watermarkOptions.mode
    const mustWatermark = isMandatoryWatermarkCategory(
      normalizedCategory,
      normalizedEntityType,
      normalizedMime
    );

    if (!mustWatermark) {
      throw new Error(
        `Media policy error: Category '${normalizedCategory}' did not match a valid processing pipeline.`
      );
    }

    // Composite official Great Homes watermark ONCE and encode directly to WebP.
    // If watermarking fails, this throws and rejects the upload safely (no unwatermarked fallback).
    const watermarkedWebpBuffer = await watermarkEngine.applyWatermark(
      orientedMasterBuffer,
      'webp',
      {
        ...watermarkOptions,
        mode: 'ON',
        quality: compressionProfile.quality,
        effort: compressionProfile.effort,
        smartSubsample: compressionProfile.smartSubsample,
      }
    );

    // Upload ONLY the final watermarked WebP object (`public_wm.webp`) to permanent storage
    const wmWebpKey = `${baseKey}/public_wm.webp`;
    const wmWebpResult = await storage.put(wmWebpKey, watermarkedWebpBuffer, {
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const variants: MediaVariantSet = {
      publicUrl: wmWebpResult.url,
      watermarkedWebp: wmWebpResult.url,
      webp: wmWebpResult.url,
      thumbnail: wmWebpResult.url,
      original: wmWebpResult.url,
    };

    return {
      id: assetId,
      filename: sanitizedName,
      mimeType: 'image/webp',
      category: normalizedCategory,
      profile,
      width: finalWidth,
      height: finalHeight,
      originalSizeBytes: buffer.length,
      optimizedSizeBytes: watermarkedWebpBuffer.length,
      watermarkApplied: true,
      storageProvider: storage.name,
      storageKey: wmWebpResult.key,
      variants,
      processingStatus: 'READY',
    };
  }

  /**
   * Transforms an image buffer on-demand with custom resize/crop/format options.
   */
  async transformImage(buffer: Buffer, options: ImageTransformOptions): Promise<Buffer> {
    let pipeline = sharp(buffer).rotate();

    if (options.width || options.height) {
      pipeline = pipeline.resize({
        width: options.width,
        height: options.height,
        fit: options.fit || 'inside',
        withoutEnlargement: true,
      });
    }

    const quality = options.quality || 78;
    switch (options.format) {
      case 'avif':
        pipeline = pipeline.avif({ quality, effort: 4 });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        pipeline = pipeline.png({ quality });
        break;
      case 'webp':
      default:
        pipeline = pipeline.webp({ quality, effort: 6, smartSubsample: true });
        break;
    }

    return await pipeline.toBuffer();
  }

  /**
   * Reprocesses an existing unwatermarked source buffer with updated watermark settings.
   * Note: Route handlers must first check `isSingleDerivativeWatermarkedAsset(asset)` and reject
   * reprocessing on already-watermarked single-derivative assets to prevent double watermarking.
   */
  async reprocessMedia(
    originalBuffer: Buffer,
    filename: string,
    mimeType: string,
    category: string,
    entityType: string,
    entityId: string,
    watermarkOptions?: WatermarkOptions
  ): Promise<ProcessedMediaResult> {
    return this.processUpload(
      originalBuffer,
      filename,
      mimeType,
      category,
      entityType,
      entityId,
      watermarkOptions
    );
  }
}

export const mediaProcessingService = new MediaProcessingService();
