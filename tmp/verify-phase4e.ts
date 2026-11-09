import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import {
  getCompressionProfileForCategory,
  MediaProcessingService,
  isSingleDerivativeWatermarkedAsset,
} from '../src/domain/media/services/mediaProcessingService';
import { StorageProvider, StoragePutOptions, StoragePutResult } from '../src/domain/media/storage/storageProvider';

class MockStorageProvider implements StorageProvider {
  readonly name = 's3' as const;
  uploadedFiles = new Map<string, { buffer: Buffer; options: StoragePutOptions }>();

  async put(key: string, buffer: Buffer, options: StoragePutOptions): Promise<StoragePutResult> {
    this.uploadedFiles.set(key, { buffer, options });
    return {
      key,
      url: `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/${key}`,
      provider: 's3',
      sizeBytes: buffer.length,
    };
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    await this.put(key, buffer, { contentType });
    return this.getPublicUrl(key);
  }

  async replace(key: string, buffer: Buffer, contentType: string): Promise<string> {
    return this.upload(key, buffer, contentType);
  }

  async delete(key: string): Promise<boolean> {
    this.uploadedFiles.delete(key);
    return true;
  }

  async exists(key: string): Promise<boolean> {
    return this.uploadedFiles.has(key);
  }

  async read(key: string): Promise<Buffer | null> {
    return this.uploadedFiles.get(key)?.buffer || null;
  }

  getPublicUrl(key: string): string {
    return `https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/${key}`;
  }

  async getSignedUrl(key: string): Promise<string> {
    return this.getPublicUrl(key);
  }
}

async function runPhase4ETests() {
  console.log('=====================================================');
  console.log('GREAT HOMES V2 — PHASE 4E VALIDATION SUITE');
  console.log('=====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  // 1. Logo Categories Unit Tests
  console.log('--- TEST 1: Logo Classification in getCompressionProfileForCategory ---');
  const logoCategories = [
    'LOGO',
    'BRAND',
    'DEVELOPER_LOGO',
    'BUILDER_LOGO',
    'PARTNER_LOGO',
    'COMPANY_LOGO',
    'BRAND_LOGO',
  ];

  for (const cat of logoCategories) {
    // Test without 2nd argument (default isLogo = false)
    const profDefault = getCompressionProfileForCategory(cat);
    assert(
      profDefault.quality === 90 &&
      profDefault.effort === 6 &&
      profDefault.alphaQuality === 100 &&
      profDefault.smartSubsample === true &&
      profDefault.lossless === false,
      `Category '${cat}' (without isLogo arg) -> Q90, Effort 6, alphaQuality 100, Lossy`
    );

    // Test with explicit isLogo = true
    const profTrue = getCompressionProfileForCategory(cat, true);
    assert(
      profTrue.quality === 90 && profTrue.alphaQuality === 100,
      `Category '${cat}' (with isLogo=true) -> Q90, alphaQuality 100`
    );

    // Test with explicit isLogo = false
    const profFalse = getCompressionProfileForCategory(cat, false);
    assert(
      profFalse.quality === 90 && profFalse.alphaQuality === 100,
      `Category '${cat}' (with isLogo=false) -> Q90, alphaQuality 100 (recognized directly)`
    );
  }

  // 2. Non-Logo Categories Unit Tests (Must preserve existing profiles)
  console.log('\n--- TEST 2: Non-Logo Category Profiles Preserved ---');
  const nonLogoCases: [string, number][] = [
    ['HERO', 82],
    ['HOMEPAGE_HERO', 82],
    ['BANNER', 82],
    ['FEATURED', 82],
    ['FLOOR_PLAN', 82],
    ['FLOOR_PLANS', 82],
    ['MASTER_PLAN', 82],
    ['LOCATION', 85],
    ['LOCATION_MAP', 85],
    ['CONNECTIVITY_MAP', 85],
    ['PROPERTY_PHOTO', 78],
    ['EXTERIOR', 78],
    ['INTERIOR', 78],
    ['AMENITIES', 78],
    ['CONSTRUCTION_UPDATE', 78],
    ['OTHER', 78],
  ];

  for (const [cat, expectedQ] of nonLogoCases) {
    const prof = getCompressionProfileForCategory(cat);
    assert(
      prof.quality === expectedQ && prof.effort === 6 && prof.smartSubsample === true,
      `Category '${cat}' -> Q${expectedQ}, Effort 6, smartSubsample: true`
    );
  }

  // 3. Pipeline B2 Live Upload with Oversized BRAND Raster Logo
  console.log('\n--- TEST 3: Pipeline B2 Live Upload with BRAND Raster Logo ---');
  const mockStorage = new MockStorageProvider();
  const service = new MediaProcessingService();

  // Generate an oversized 2000x1200 RGBA PNG with alpha transparency
  const transparentPngBuffer = await sharp({
    create: {
      width: 2000,
      height: 1200,
      channels: 4,
      background: { r: 255, g: 120, b: 0, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();

  console.log(`  Source BRAND PNG: 2000x1200 RGBA (${transparentPngBuffer.length} bytes)`);

  const brandResult = await service.processUpload(
    transparentPngBuffer,
    'developer-brand-logo.png',
    'image/png',
    'BRAND',
    'DEVELOPER',
    'dev-123'
  );

  assert(brandResult.watermarkApplied === false, 'BRAND asset watermarkApplied is false');
  assert(brandResult.mimeType === 'image/webp', `BRAND output mimeType is 'image/webp'`);
  assert(brandResult.width <= 1600 && brandResult.height <= 1600, `BRAND dimensions capped at 1600px max (actual: ${brandResult.width}x${brandResult.height})`);
  assert(brandResult.width === 1600, `BRAND aspect ratio preserved: width scaled from 2000 to 1600`);
  assert(brandResult.height === 960, `BRAND aspect ratio preserved: height scaled from 1200 to 960`);

  // Verify stored buffer properties with Sharp
  const storageProvider = (await import('../src/domain/media/storage/storageProvider')).getStorageProvider();
  const storedBuffer = await storageProvider.read(brandResult.storageKey);
  assert(!!storedBuffer, 'BRAND object uploaded and readable via storageProvider.read()');
  if (storedBuffer) {
    const sharpMeta = await sharp(storedBuffer).metadata();
    assert(sharpMeta.format === 'webp', 'Stored asset is valid WebP');
    assert(sharpMeta.hasAlpha === true, 'Stored WebP preserves alpha transparency channel');
    assert(sharpMeta.width === 1600 && sharpMeta.height === 960, 'Sharp confirms dimensions 1600x960');
    // Clean up test file
    await storageProvider.delete(brandResult.storageKey);
  }

  // 4. Test DEVELOPER_LOGO Live Upload
  console.log('\n--- TEST 4: Pipeline B2 Live Upload with DEVELOPER_LOGO ---');
  const devLogoResult = await service.processUpload(
    transparentPngBuffer,
    'builder-logo.png',
    'image/png',
    'DEVELOPER_LOGO',
    'DEVELOPER',
    'dev-456'
  );
  assert(devLogoResult.watermarkApplied === false, 'DEVELOPER_LOGO watermarkApplied is false');
  assert(devLogoResult.width === 1600 && devLogoResult.height === 960, 'DEVELOPER_LOGO clamped to 1600px');

  // 5. Test SVG & PDF Preservation
  console.log('\n--- TEST 5: SVG and PDF Integrity Unchanged ---');
  const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="green"/></svg>`;
  const svgBuffer = Buffer.from(sampleSvg, 'utf-8');
  const svgResult = await service.processUpload(
    svgBuffer,
    'brand-logo.svg',
    'image/svg+xml',
    'BRAND',
    'DEVELOPER',
    'dev-789'
  );
  assert(svgResult.mimeType === 'image/svg+xml', 'SVG logo mimeType preserved as image/svg+xml');
  assert(svgResult.watermarkApplied === false, 'SVG logo watermarkApplied is false');

  const samplePdf = Buffer.from('%PDF-1.4 sample pdf content for brochure verification %%EOF', 'utf-8');
  const pdfResult = await service.processUpload(
    samplePdf,
    'project-brochure.pdf',
    'application/pdf',
    'BROCHURE',
    'PROJECT',
    'proj-101'
  );
  assert(pdfResult.mimeType === 'application/pdf', 'PDF mimeType preserved as application/pdf');
  assert(pdfResult.watermarkApplied === false, 'PDF watermarkApplied is false');
  assert(pdfResult.optimizedSizeBytes === samplePdf.length, 'PDF content uncompressed/untouched');

  // 6. Test Single-Derivative / Replacement Safeguards
  console.log('\n--- TEST 6: Single-Derivative & Replacement Safeguards ---');
  const isSingle1 = isSingleDerivativeWatermarkedAsset({
    watermarkApplied: true,
    storageKey: 'projects/proj-1/photos/public_wm.webp',
  });
  assert(isSingle1 === true, 'Single-derivative asset correctly identified via storageKey');

  const isSingle2 = isSingleDerivativeWatermarkedAsset({
    watermarkApplied: true,
    originalUrl: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/projects/proj-1/photos/public_wm.webp',
    watermarkedUrl: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/projects/proj-1/photos/public_wm.webp',
  });
  assert(isSingle2 === true, 'Single-derivative asset correctly identified when originalUrl === watermarkedUrl');

  console.log('\n=====================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('=====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4ETests().catch((err) => {
  console.error('Test execution failed with error:', err);
  process.exit(1);
});
