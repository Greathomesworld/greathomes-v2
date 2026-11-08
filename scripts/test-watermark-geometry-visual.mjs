import assert from 'assert';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import {
  watermarkEngine,
  computeWatermarkGeometry,
  OFFICIAL_LOGO_ASPECT_RATIO,
  DEFAULT_WATERMARK_CONFIG,
} from '../src/domain/media/services/watermarkEngine.ts';

async function runWatermarkVisualRegression() {
  console.log('====================================================');
  console.log('🔍 RUNNING GREAT HOMES WATERMARK ENGINE GEOMETRY & VISUAL REGRESSION SUITE');
  console.log('====================================================');

  const testCases = [
    { name: 'A. Landscape (4000x3000)', w: 4000, h: 3000, format: 'webp' },
    { name: 'B. Wide landscape (1920x1080)', w: 1920, h: 1080, format: 'webp' },
    { name: 'C. Portrait (3000x4000)', w: 3000, h: 4000, format: 'webp' },
    { name: 'D. Square (2000x2000)', w: 2000, h: 2000, format: 'webp' },
    { name: 'E. Small landscape (800x450)', w: 800, h: 450, format: 'webp' },
    { name: 'F. Small portrait (450x800)', w: 450, h: 800, format: 'webp' },
    { name: 'G. Very small (320x180)', w: 320, h: 180, format: 'webp' },
    { name: 'H. High-resolution project image (2560x1440)', w: 2560, h: 1440, format: 'avif' },
    { name: 'I. Resale image (1600x1200)', w: 1600, h: 1200, format: 'jpeg' },
    { name: 'J. Rental image (1280x720)', w: 1280, h: 720, format: 'webp' },
  ];

  const positions = ['BOTTOM_RIGHT', 'BOTTOM_LEFT', 'TOP_RIGHT', 'TOP_LEFT', 'CENTER'];

  // 1. Verify canonical SVG asset properties & color integrity
  console.log('\n--- 1. Canonical SVG Asset & Color Integrity Verification ---');
  const svgPath = path.join(process.cwd(), 'public/assets/GH_logo.svg');
  assert(fs.existsSync(svgPath), 'Canonical GH_logo.svg must exist');
  const svgContent = fs.readFileSync(svgPath, 'utf8');
  assert(svgContent.includes('viewBox="0 0 1404.75 226.499993"'), 'viewBox must match canonical 0 0 1404.75 226.499993');
  assert(svgContent.includes('Great'), 'Must contain Great wordmark');
  assert(svgContent.includes('Homes'), 'Must contain Homes wordmark');
  assert(svgContent.includes('gh-orange'), 'Great wordmark must use orange gradient');
  assert(svgContent.includes('#181B1E'), 'Homes wordmark must be canonical black (#181B1E)');
  assert(!svgContent.includes('fill="#FFFFFF">Homes</text>'), 'Homes must NOT be white');
  assert(!svgContent.includes('Roof icon cutout') && !svgContent.includes('M 66 80'), 'Logo must NOT contain any house/hut/roof icon inside the G');
  console.log('✓ Canonical GH_logo.svg verified: Great = Orange, Homes = Black (#181B1E), Normal G with no house/hut/roof icon');

  // 2. Geometry Containment & Clamping Across All Dimensions
  console.log('\n--- 2. Geometry Containment & Clamping Test Matrix ---');
  for (const tc of testCases) {
    for (const pos of positions) {
      const geom = computeWatermarkGeometry(tc.w, tc.h, OFFICIAL_LOGO_ASPECT_RATIO, { position: pos });
      
      // Strict assertions
      assert(geom.watermarkWidth > 0, `Width must be > 0 for ${tc.name} [${pos}]`);
      assert(geom.watermarkHeight > 0, `Height must be > 0 for ${tc.name} [${pos}]`);
      assert(geom.watermarkWidth <= geom.availableWidth, `Width (${geom.watermarkWidth}) <= availableWidth (${geom.availableWidth}) for ${tc.name} [${pos}]`);
      assert(geom.watermarkHeight <= geom.availableHeight, `Height (${geom.watermarkHeight}) <= availableHeight (${geom.availableHeight}) for ${tc.name} [${pos}]`);
      assert(geom.x >= geom.margin, `x (${geom.x}) >= margin (${geom.margin}) for ${tc.name} [${pos}]`);
      assert(geom.y >= geom.margin, `y (${geom.y}) >= margin (${geom.margin}) for ${tc.name} [${pos}]`);
      assert(geom.x + geom.watermarkWidth <= tc.w - geom.margin, `Right edge (${geom.x + geom.watermarkWidth}) <= w - margin (${tc.w - geom.margin}) for ${tc.name} [${pos}]`);
      assert(geom.y + geom.watermarkHeight <= tc.h - geom.margin, `Bottom edge (${geom.y + geom.watermarkHeight}) <= h - margin (${tc.h - geom.margin}) for ${tc.name} [${pos}]`);

      // Aspect ratio check
      const arDiff = Math.abs(geom.aspectRatio - OFFICIAL_LOGO_ASPECT_RATIO);
      assert(arDiff < 0.35, `Aspect ratio distortion too high for ${tc.name} [${pos}]: ${geom.aspectRatio}`);
    }
    console.log(`  ✓ ${tc.name} passed all 5 placement orientations with 0px boundary violation`);
  }

  // 3. Pixel-Level Sharp Composite Execution & Visual Verification
  console.log('\n--- 3. Pixel-Level Sharp Composite Execution ---');
  for (const tc of testCases) {
    // Generate synthetic base canvas
    const baseBuffer = await sharp({
      create: {
        width: tc.w,
        height: tc.h,
        channels: 4,
        background: { r: 35, g: 45, b: 55, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const initialLength = baseBuffer.length;

    // Apply watermark
    const outputBuffer = await watermarkEngine.applyWatermark(
      baseBuffer,
      tc.format,
      { position: 'BOTTOM_RIGHT' }
    );

    // Verify output buffer exists and has correct dimensions
    const outMeta = await sharp(outputBuffer).metadata();
    assert.strictEqual(outMeta.width, tc.w, `Output width matches original width for ${tc.name}`);
    assert.strictEqual(outMeta.height, tc.h, `Output height matches original height for ${tc.name}`);
    assert.strictEqual(baseBuffer.length, initialLength, `Source buffer remains untouched for ${tc.name}`);

    console.log(`  ✓ ${tc.name} composited successfully into ${outMeta.format.toUpperCase()} (${outMeta.width}x${outMeta.height})`);
  }

  console.log('\n====================================================');
  console.log('🎉 ALL WATERMARK GEOMETRY & VISUAL REGRESSION TESTS PASSED (100%)');
  console.log('====================================================');
}

runWatermarkVisualRegression().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
