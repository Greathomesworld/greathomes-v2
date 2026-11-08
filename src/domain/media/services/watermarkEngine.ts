import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

export type WatermarkPosition =
  | 'BOTTOM_RIGHT'
  | 'BOTTOM_LEFT'
  | 'TOP_RIGHT'
  | 'TOP_LEFT'
  | 'CENTER';

export type WatermarkMode = 'AUTO' | 'ON' | 'OFF';

export interface WatermarkOptions {
  mode?: WatermarkMode;
  position?: WatermarkPosition;
  opacity?: number; // 0.1 to 1.0 (default 0.8)
  scale?: number; // fraction of image width, e.g. 0.18 (18%)
  marginRatio?: number; // margin from edges, e.g. 0.025 (2.5%)
  margin?: number; // baseline safe margin in px (default 24)
}

export const DEFAULT_WATERMARK_CONFIG: Required<WatermarkOptions> = {
  mode: 'AUTO',
  position: 'BOTTOM_RIGHT',
  opacity: 0.8,
  scale: 0.18, // 18% of image width
  marginRatio: 0.025, // 2.5% margin
  margin: 24,
};

// Official Great Homes watermark SVG asset uploaded to the workspace:
// viewBox="0 0 1404.75 310.499991", width="1873", height="414"
// Contains: Orange Great Homes G symbol + Great, dark charcoal Homes wordmark, and greathomes.co.in domain pill beneath.
export const OFFICIAL_WATERMARK_ASSET_PATH = 'public/assets/aistudio/GH_wm_17aa72b0.svg';
export const FALLBACK_WATERMARK_ASSET_PATH = 'public/assets/GH_watermark.svg';
export const OFFICIAL_LOGO_VIEWBOX_WIDTH = 1404.75;
export const OFFICIAL_LOGO_VIEWBOX_HEIGHT = 310.499991;
export const OFFICIAL_LOGO_ASPECT_RATIO =
  OFFICIAL_LOGO_VIEWBOX_WIDTH / OFFICIAL_LOGO_VIEWBOX_HEIGHT;

// Categories that MUST NEVER be watermarked under any circumstance (Server-Enforced)
export const NEVER_WATERMARK_CATEGORIES = [
  'LOGO',
  'DEVELOPER_LOGO',
  'BUILDER_LOGO',
  'PARTNER_LOGO',
  'COMPANY_LOGO',
  'BRAND_LOGO',
  'BRAND',
  'OFFICE',
  'EDITORIAL',
  'AVATAR',
  'PROFILE',
  'ICON',
  'FAVICON',
  'BROCHURE',
  'DOCUMENT',
  'WALKTHROUGH',
  'VIDEO',
] as const;

// Categories that MUST ALWAYS be watermarked when uploaded as raster images (Server-Enforced)
export const MANDATORY_WATERMARK_CATEGORIES = [
  'EXTERIOR',
  'INTERIOR',
  'AMENITIES',
  'CLUBHOUSE',
  'CONSTRUCTION',
  'ELEVATION',
  'OTHER',
  'GALLERY',
  'HERO',
  'FLOOR_PLANS',
  'FLOOR_PLAN',
  'MASTER_PLAN',
  'LOCATION',
  'LOCATION_MAP',
  'CONNECTIVITY_MAP',
  'BALCONY_VIEW',
  'LOBBY',
  'BEDROOM',
  'LIVING_ROOM',
  'KITCHEN',
  'BATHROOM',
] as const;

// Minimum physical image dimension required to composite a legible watermark safely
export const MIN_WATERMARK_IMAGE_WIDTH = 64;
export const MIN_WATERMARK_IMAGE_HEIGHT = 64;

/**
 * Server-enforced check: returns true if the category/entity/MIME must NEVER be watermarked.
 */
export function isNeverWatermarkCategory(
  category?: string,
  entityType?: string,
  mimeType?: string
): boolean {
  const normCat = (category || '').toUpperCase().trim();
  const normEntity = (entityType || '').toUpperCase().trim();
  const normMime = (mimeType || '').toLowerCase().trim();

  if (normMime === 'application/pdf' || normMime === 'image/svg+xml') {
    return true;
  }

  // Developer entity uploads (logos, brand assets, corporate identity) are never watermarked
  if (normEntity === 'DEVELOPER') {
    return true;
  }

  if ((NEVER_WATERMARK_CATEGORIES as readonly string[]).includes(normCat)) {
    return true;
  }

  return false;
}

/**
 * Server-enforced check: returns true if the category/entity requires mandatory Great Homes watermarking.
 */
export function isMandatoryWatermarkCategory(
  category?: string,
  entityType?: string,
  mimeType?: string
): boolean {
  if (isNeverWatermarkCategory(category, entityType, mimeType)) {
    return false;
  }

  const normCat = (category || 'OTHER').toUpperCase().trim();
  const normEntity = (entityType || 'PROJECT').toUpperCase().trim();

  if (normEntity === 'RESALE' || normEntity === 'RENTAL' || normEntity === 'PROJECT') {
    return true;
  }

  if ((MANDATORY_WATERMARK_CATEGORIES as readonly string[]).includes(normCat)) {
    return true;
  }

  return true;
}

export interface WatermarkGeometry {
  watermarkWidth: number;
  watermarkHeight: number;
  x: number;
  y: number;
  margin: number;
  availableWidth: number;
  availableHeight: number;
}

/**
 * Computes safe, non-clipping watermark dimensions and coordinates for any image aspect ratio
 * (landscape, portrait, square, ultrawide, or compact floor plans / location maps) while strictly
 * preserving the official Great Homes watermark aspect ratio.
 */
export function computeWatermarkGeometry(
  imgWidth: number,
  imgHeight: number,
  logoAspectRatio: number = OFFICIAL_LOGO_ASPECT_RATIO,
  options?: Partial<WatermarkOptions>
): WatermarkGeometry {
  const config: Required<WatermarkOptions> = {
    ...DEFAULT_WATERMARK_CONFIG,
    ...options,
  };

  const scale = Math.min(0.45, Math.max(0.08, config.scale));

  // Responsive edge margin: 2.5% of shorter dimension, bounded so small images still have safe inner space
  const minDim = Math.min(imgWidth, imgHeight);
  const rawMargin = Math.round(minDim * config.marginRatio);
  const maxSafeMargin = Math.max(4, Math.floor(minDim * 0.1));
  const margin = Math.min(maxSafeMargin, Math.max(6, rawMargin));

  // Safe inner bounding box where the watermark is allowed to live
  const availableWidth = Math.max(16, imgWidth - margin * 2);
  const availableHeight = Math.max(12, imgHeight - margin * 2);

  // Target width is proportional to image width, capped for ultra-res & compact images
  const minTargetWidth = Math.min(availableWidth, Math.max(48, Math.round(imgWidth * 0.14)));
  let watermarkWidth = Math.max(minTargetWidth, Math.min(560, Math.round(imgWidth * scale)));

  // Clamp width so it never exceeds 75% of available safe width (handles narrow portrait images & compact plans)
  const maxAllowedWidth = Math.max(16, Math.floor(availableWidth * 0.75));
  if (watermarkWidth > maxAllowedWidth) {
    watermarkWidth = maxAllowedWidth;
  }
  if (watermarkWidth > availableWidth) {
    watermarkWidth = availableWidth;
  }

  let watermarkHeight = Math.max(1, Math.round(watermarkWidth / logoAspectRatio));

  // Clamp height so it never exceeds 35% of available safe height (handles extreme panoramic/banner images)
  const maxAllowedHeight = Math.max(10, Math.floor(availableHeight * 0.35));
  if (watermarkHeight > maxAllowedHeight) {
    watermarkHeight = maxAllowedHeight;
    watermarkWidth = Math.max(1, Math.round(watermarkHeight * logoAspectRatio));
  }
  if (watermarkHeight > availableHeight) {
    watermarkHeight = availableHeight;
    watermarkWidth = Math.max(1, Math.round(watermarkHeight * logoAspectRatio));
  }
  if (watermarkWidth > availableWidth) {
    watermarkWidth = availableWidth;
    watermarkHeight = Math.max(1, Math.round(watermarkWidth / logoAspectRatio));
  }

  let x = margin;
  let y = margin;

  switch (config.position) {
    case 'TOP_LEFT':
      x = margin;
      y = margin;
      break;
    case 'TOP_RIGHT':
      x = imgWidth - watermarkWidth - margin;
      y = margin;
      break;
    case 'BOTTOM_LEFT':
      x = margin;
      y = imgHeight - watermarkHeight - margin;
      break;
    case 'CENTER':
      x = Math.round((imgWidth - watermarkWidth) / 2);
      y = Math.round((imgHeight - watermarkHeight) / 2);
      break;
    case 'BOTTOM_RIGHT':
    default:
      x = imgWidth - watermarkWidth - margin;
      y = imgHeight - watermarkHeight - margin;
      break;
  }

  // Final strict boundary clamp to guarantee zero clipping
  x = Math.max(margin, Math.min(x, imgWidth - watermarkWidth - margin));
  y = Math.max(margin, Math.min(y, imgHeight - watermarkHeight - margin));

  return {
    watermarkWidth,
    watermarkHeight,
    x,
    y,
    margin,
    availableWidth,
    availableHeight,
  };
}

let cachedOfficialWatermarkSvg: string | null = null;

/**
 * Loads and validates the official Great Homes watermark SVG from the central asset path.
 * Throws an error if the official watermark asset is missing or invalid.
 */
export function loadOfficialWatermarkSvg(): string {
  if (cachedOfficialWatermarkSvg) {
    return cachedOfficialWatermarkSvg;
  }

  const candidatePaths = [
    path.join(process.cwd(), OFFICIAL_WATERMARK_ASSET_PATH),
    path.join(process.cwd(), FALLBACK_WATERMARK_ASSET_PATH),
  ];

  for (const svgPath of candidatePaths) {
    if (fs.existsSync(svgPath)) {
      const content = fs.readFileSync(svgPath, 'utf8').trim();
      if (content.includes('<svg') && content.includes('</svg>')) {
        cachedOfficialWatermarkSvg = content;
        return cachedOfficialWatermarkSvg;
      }
    }
  }

  throw new Error(
    `Critical watermark error: Official Great Homes watermark SVG not found at ${OFFICIAL_WATERMARK_ASSET_PATH}.`
  );
}

export class WatermarkEngine {
  /**
   * Determines whether an image should be watermarked based on the canonical server-enforced media policy.
   * - Never-watermark categories (LOGO, DEVELOPER, BRAND, OFFICE, EDITORIAL, AVATAR, PDF, SVG) always return false.
   * - Mandatory-watermark categories (PROJECT/RESALE/RENTAL photos, FLOOR_PLANS, MASTER_PLAN, LOCATION) always return true
   *   regardless of client watermarkMode flags or compact floor plan dimensions.
   */
  shouldWatermark(
    category: string,
    width: number,
    height: number,
    options?: WatermarkOptions,
    entityType?: string,
    mimeType?: string
  ): boolean {
    if (isNeverWatermarkCategory(category, entityType, mimeType)) {
      return false;
    }

    if (width < 16 || height < 16) {
      return false;
    }

    // Server-enforced mandatory watermark policy overrides client OFF flags
    if (isMandatoryWatermarkCategory(category, entityType, mimeType)) {
      return true;
    }

    const mode = options?.mode || DEFAULT_WATERMARK_CONFIG.mode;
    if (mode === 'OFF') return false;
    return true;
  }

  /**
   * Loads the official Great Homes watermark SVG (`public/assets/aistudio/GH_wm_17aa72b0.svg`)
   * and rasterizes it cleanly at the exact target width/height with alpha transparency and opacity.
   */
  private async renderOfficialWatermarkBuffer(
    watermarkWidth: number,
    watermarkHeight: number,
    opacity: number
  ): Promise<Buffer> {
    const rawSvg = loadOfficialWatermarkSvg();
    const clampedOpacity = Math.min(1.0, Math.max(0.1, opacity));

    // Apply group opacity without altering proportions, colors, or artwork paths
    let svgToRender = rawSvg;
    if (clampedOpacity < 0.999) {
      svgToRender = rawSvg
        .replace(
          /<svg([^>]*)>/i,
          `<svg$1><g opacity="${clampedOpacity.toFixed(3)}">`
        )
        .replace(/<\/svg>\s*$/i, '</g></svg>');
    }

    const renderedPng = await sharp(Buffer.from(svgToRender, 'utf8'), { density: 144 })
      .resize({
        width: watermarkWidth,
        height: watermarkHeight,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    return renderedPng;
  }

  /**
   * Applies the official Great Homes watermark to an image buffer and encodes into the target format.
   * Executes strictly ONCE per image. If watermark rendering or compositing fails, throws an error
   * so an unwatermarked fallback is never stored for mandatory categories.
   */
  async applyWatermark(
    imageBuffer: Buffer,
    outputFormat: 'webp' | 'avif' | 'jpeg' = 'webp',
    options?: WatermarkOptions & { quality?: number }
  ): Promise<Buffer> {
    const config: Required<WatermarkOptions> = {
      ...DEFAULT_WATERMARK_CONFIG,
      ...options,
    };

    const metadata = await sharp(imageBuffer).metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;

    if (imgWidth < 16 || imgHeight < 16) {
      throw new Error(
        `Watermark processing rejected: image dimensions (${imgWidth}x${imgHeight}) are too small to watermark safely.`
      );
    }

    const geom = computeWatermarkGeometry(
      imgWidth,
      imgHeight,
      OFFICIAL_LOGO_ASPECT_RATIO,
      config
    );

    const watermarkPngBuffer = await this.renderOfficialWatermarkBuffer(
      geom.watermarkWidth,
      geom.watermarkHeight,
      config.opacity
    );

    let pipeline = sharp(imageBuffer).composite([
      {
        input: watermarkPngBuffer,
        left: geom.x,
        top: geom.y,
        blend: 'over',
      },
    ]);

    const quality = options?.quality;

    if (outputFormat === 'webp') {
      pipeline = pipeline.webp({ quality: quality ?? 85, effort: 4 });
    } else if (outputFormat === 'avif') {
      pipeline = pipeline.avif({ quality: quality ?? 80, effort: 4 });
    } else {
      pipeline = pipeline.jpeg({ quality: quality ?? 85, mozjpeg: true });
    }

    return await pipeline.toBuffer();
  }
}

export const watermarkEngine = new WatermarkEngine();
