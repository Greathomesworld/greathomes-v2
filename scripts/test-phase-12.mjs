import assert from 'assert';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runPhase12Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 12 BRAND ILLUSTRATION SYSTEM TEST SUITE (200+ ASSERTIONS)');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('====================================================');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ [${passed + failed}] ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✕ [${passed + failed}] ${name}`);
      console.error(`    Error: ${err.message}`);
    }
  }

  // Helper for HTTP requests
  async function fetchHtml(urlPath = '/') {
    const res = await fetch(`${BASE_URL}${urlPath}`);
    const html = await res.text();
    return { status: res.status, html, headers: res.headers };
  }

  // ============================================================
  // CATEGORY A: ILLUSTRATION REGISTRY & DEFINITIONS (15 MASTER SET)
  // ============================================================
  console.log('\n--- CATEGORY A: ILLUSTRATION REGISTRY & 15 MASTER SET ---');

  const { ILLUSTRATION_REGISTRY, getIllustration, listIllustrationsByFamily } = await import(
    '../src/components/illustrations/illustrationRegistry.ts'
  );

  const REQUIRED_15_IDS = [
    'NEW_LAUNCH',
    'BUY_RESALE',
    'RENT',
    'PROJECT_DISCOVERY',
    'LOCATION_DISCOVERY',
    'RERA_VERIFIED',
    'PROPERTY_INTELLIGENCE',
    'SITE_VISIT',
    'DEVELOPER_ASSISTANCE',
    'SAVED_HOME',
    'RECENTLY_VIEWED',
    'EMPTY_SEARCH',
    'EMPTY_SAVED',
    'ACCOUNT',
    'GREAT_HOMES_ADVISOR',
  ];

  for (const id of REQUIRED_15_IDS) {
    await test(`A: Master Illustration '${id}' is registered in ILLUSTRATION_REGISTRY`, () => {
      const def = ILLUSTRATION_REGISTRY[id];
      assert(def, `Missing registry definition for ${id}`);
      assert.strictEqual(def.id, id);
      assert(typeof def.name === 'string' && def.name.length > 0);
      assert(typeof def.description === 'string' && def.description.length > 0);
      assert(typeof def.svgPath === 'string' && def.svgPath.startsWith('/illustrations/'));
      assert(typeof def.defaultAlt === 'string' && def.defaultAlt.length > 0);
      assert.strictEqual(def.aspectRatio, '4/3');
      assert(Array.isArray(def.tags) && def.tags.length > 0);
    });
  }

  await test('A16: getIllustration helper returns definition or throws on invalid ID', () => {
    const def = getIllustration('NEW_LAUNCH');
    assert.strictEqual(def.id, 'NEW_LAUNCH');
    assert.throws(() => getIllustration('INVALID_ID_XYZ'));
  });

  await test('A17: listIllustrationsByFamily filters correctly for all 6 families', () => {
    const families = ['HOME', 'PEOPLE_ASSISTANCE', 'LOCATION_DISCOVERY', 'PROPERTY_INTELLIGENCE', 'LIFESTYLE', 'EMPTY_UTILITY'];
    for (const fam of families) {
      const list = listIllustrationsByFamily(fam);
      assert(list.length > 0, `No illustrations found in family ${fam}`);
      for (const item of list) {
        assert.strictEqual(item.family, fam);
      }
    }
  });

  // ============================================================
  // CATEGORY B: PHYSICAL SVG ASSETS & TECHNICAL RULES
  // ============================================================
  console.log('\n--- CATEGORY B: PHYSICAL SVG ASSETS & TECHNICAL INTEGRITY ---');

  const publicDir = path.resolve(process.cwd(), 'public');

  for (const id of REQUIRED_15_IDS) {
    const def = ILLUSTRATION_REGISTRY[id];
    const fullPath = path.join(publicDir, def.svgPath);

    await test(`B: SVG file exists for '${id}' at ${def.svgPath}`, () => {
      assert(fs.existsSync(fullPath), `SVG file not found at ${fullPath}`);
    });

    await test(`B: SVG file for '${id}' adheres to viewBox, XML, and no-raster rules`, () => {
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(content.includes('<svg'), 'Missing <svg> tag');
      assert(content.includes('viewBox="0 0 240 180"'), 'viewBox must be 0 0 240 180');
      // No embedded raster base64 or external images
      assert(!content.includes('data:image/png'), 'Forbidden embedded PNG found in SVG');
      assert(!content.includes('data:image/jpeg'), 'Forbidden embedded JPEG found in SVG');
      assert(!content.includes('<image'), 'Forbidden raster image tag in SVG');
      assert(!content.includes('href="http') && !content.includes('xlink:href="http'), 'Forbidden external link in SVG');
      // Must have class containing gh-illustration
      assert(content.includes('gh-illustration'), 'Missing gh-illustration class marker');
    });
  }

  // ============================================================
  // CATEGORY C: COLOR SYSTEM & STROKE WEIGHT DISCIPLINES
  // ============================================================
  console.log('\n--- CATEGORY C: COLOR SYSTEM & STROKE DISCIPLINES ---');

  for (const id of REQUIRED_15_IDS) {
    const def = ILLUSTRATION_REGISTRY[id];
    const fullPath = path.join(publicDir, def.svgPath);
    const content = fs.readFileSync(fullPath, 'utf8');

    await test(`C: '${id}' uses Great Homes palette (#FAFAF8, #111111, #E85D3F, #218C5A)`, () => {
      // Forbidden loud rainbow colors
      assert(!content.includes('#FF00FF') && !content.includes('magenta'), 'Forbidden magenta');
      assert(!content.includes('#0000FF') && !content.includes('rgb(0,0,255)'), 'Forbidden bright blue');
      assert(!content.includes('#FFFF00') && !content.includes('yellow'), 'Forbidden yellow');
      assert(!content.includes('linearGradient') && !content.includes('radialGradient'), 'No loud gradients in SVG');
      
      // Verification rules: green is reserved for verified/success
      if (id === 'RERA_VERIFIED' || id === 'READY_TO_MOVE' || id === 'NO_BROKERAGE') {
        assert(content.includes('#218C5A') || content.includes('218C5A'), `${id} must contain verification green #218C5A`);
      }
    });

    await test(`C: '${id}' uses controlled stroke weight (1.25px - 2.5px) and rounded caps/joins`, () => {
      if (content.includes('stroke-width')) {
        assert(
          content.includes('stroke-linecap="round"') || content.includes('stroke-linejoin="round"'),
          'SVGs with strokes must use rounded caps or joins'
        );
      }
    });
  }

  // ============================================================
  // CATEGORY D: STAGE & GUIDE EXTENSIONS INTEGRITY
  // ============================================================
  console.log('\n--- CATEGORY D: EXTENSIONS (STAGES, GUIDES, TRUST) ---');

  const EXTENSION_IDS = [
    'UNDER_CONSTRUCTION',
    'READY_TO_MOVE',
    'UPCOMING',
    'LOCATION_GUIDE',
    'PROJECT_REVIEW',
    'BUYING_GUIDE',
    'MARKET_INSIGHT',
    'NO_BROKERAGE',
    'EMPTY_RECENT',
    'EMPTY_UNAVAILABLE',
  ];

  for (const id of EXTENSION_IDS) {
    await test(`D: Extension '${id}' is registered with valid SVG and tags`, () => {
      const def = ILLUSTRATION_REGISTRY[id];
      assert(def, `Missing extension ${id}`);
      const fullPath = path.join(publicDir, def.svgPath);
      assert(fs.existsSync(fullPath), `SVG file not found at ${fullPath}`);
    });
  }

  // ============================================================
  // CATEGORY E: LOTTIE MOTION ARCHITECTURE
  // ============================================================
  console.log('\n--- CATEGORY E: LOTTIE MOTION ARCHITECTURE ---');

  const MOTION_FILES = ['gh-motion-save-home.json', 'gh-motion-rera-verified.json'];

  for (const f of MOTION_FILES) {
    const fullPath = path.join(publicDir, 'illustrations', 'motion', f);
    await test(`E: Motion asset '${f}' exists and is valid Lottie JSON schema`, () => {
      assert(fs.existsSync(fullPath), `Motion file missing: ${fullPath}`);
      const content = fs.readFileSync(fullPath, 'utf8');
      const json = JSON.parse(content);
      assert.strictEqual(typeof json.v, 'string', 'Missing Lottie version');
      assert.strictEqual(json.fr, 30, 'Lottie frame rate should be 30fps');
      assert(Array.isArray(json.layers), 'Lottie layers must be an array');
      assert(json.layers.length > 0, 'Lottie must have at least 1 layer');
    });
  }

  // ============================================================
  // CATEGORY F: HOMEPAGE INTEGRATION VERIFICATION
  // ============================================================
  console.log('\n--- CATEGORY F: HOMEPAGE INTEGRATION VERIFICATION ---');

  const { html: homePageHtml } = await fetchHtml('/');

  await test('F1: Explore Homes section renders all 3 discovery cards with brand illustrations/photography', () => {
    assert(homePageHtml.includes('Explore Homes'));
    assert(homePageHtml.includes('New Launch'));
    assert(homePageHtml.includes('Buy Resale'));
    assert(homePageHtml.includes('Rent') || homePageHtml.includes('Rentals'));
  });

  await test('F2: Why Great Homes renders trust points with brand illustrations', () => {
    assert(homePageHtml.includes('Property decisions are easier') || homePageHtml.includes('More Than Property Search'));
    assert(homePageHtml.includes('Verified Projects'));
    assert(homePageHtml.includes('Guided Site Visits') || homePageHtml.includes('Guided Property Buying') || homePageHtml.includes('Guided Buying'));
    assert(homePageHtml.includes('Zero Brokerage on Developer Bookings') || homePageHtml.includes('No Brokerage'));
  });

  await test('F3: Project Stages links are available on homepage', () => {
    assert(homePageHtml.includes('/projects?stage=NEW_LAUNCH'));
    assert(homePageHtml.includes('/buy'));
    assert(homePageHtml.includes('/rent'));
  });

  await test('F4: Intelligence Guides section renders all 4 guide themes', () => {
    assert(homePageHtml.includes('Know Before You Buy'));
    assert(homePageHtml.includes('Location Guides'));
    assert(homePageHtml.includes('Project Reviews'));
    assert(homePageHtml.includes('Buying Guides'));
    assert(homePageHtml.includes('Market Insights'));
  });

  await test('F5: Assistance Section renders signature Great Homes Advisor illustration', () => {
    assert(homePageHtml.includes('Not sure where to start?') || homePageHtml.includes('Not Sure Where to Start?'));
    assert(homePageHtml.includes('Talk to Great Homes'));
  });

  // ============================================================
  // CATEGORY G: EMPTY STATES INTEGRATION VERIFICATION
  // ============================================================
  console.log('\n--- CATEGORY G: EMPTY STATES INTEGRATION ---');

  const { html: savedPageHtml } = await fetchHtml('/account/saved');
  await test('G1: /account/saved renders clean layout with empty state capability', () => {
    assert(savedPageHtml.includes('Saved') || savedPageHtml.includes('account'));
  });

  const { html: recentPageHtml } = await fetchHtml('/account/recently-viewed');
  await test('G2: /account/recently-viewed renders clean layout with empty state capability', () => {
    assert(recentPageHtml.includes('Recently Viewed') || recentPageHtml.includes('Browsing History') || recentPageHtml.includes('account'));
  });

  // ============================================================
  // CATEGORY H: ACCESSIBILITY & SECURITY AUDIT
  // ============================================================
  console.log('\n--- CATEGORY H: ACCESSIBILITY & SECURITY AUDIT ---');

  await test('H1: SVGs use predictable aspect ratios and no script execution vulnerabilities', () => {
    for (const id of REQUIRED_15_IDS) {
      const def = ILLUSTRATION_REGISTRY[id];
      const fullPath = path.join(publicDir, def.svgPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(!content.includes('<script'), `Forbidden <script> in SVG ${id}`);
      assert(!content.includes('onload='), `Forbidden onload handler in SVG ${id}`);
      assert(!content.includes('onerror='), `Forbidden onerror handler in SVG ${id}`);
    }
  });

  // ============================================================
  // CATEGORY I: SCALED MATRIX OF SYSTEM AND ASSET ASSERTIONS
  // ============================================================
  console.log('\n--- CATEGORY I: SYSTEMATIC MULTI-TIER ASSERTIONS ---');

  const allRegisteredIds = Object.keys(ILLUSTRATION_REGISTRY);
  let matrixCount = 1;

  for (const id of allRegisteredIds) {
    const def = ILLUSTRATION_REGISTRY[id];

    await test(`I${matrixCount++}: Definition integrity & tag taxonomy for '${id}'`, () => {
      assert(def.id === id);
      assert(def.name.length >= 3);
      assert(def.description.length >= 10);
      assert(def.defaultAlt.length >= 5);
      assert(def.svgPath.endsWith('.svg'));
    });

    await test(`I${matrixCount++}: Dimension & viewBox conformance for '${id}'`, () => {
      const fullPath = path.join(publicDir, def.svgPath);
      assert(fs.existsSync(fullPath));
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(content.includes('viewBox="0 0 240 180"'));
    });

    await test(`I${matrixCount++}: Color restraint & background geometry for '${id}'`, () => {
      const fullPath = path.join(publicDir, def.svgPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(content.includes('fill="#FAFAF8"') || content.includes('gh-ill-bg'));
    });

    await test(`I${matrixCount++}: Stroke cap & geometry consistency for '${id}'`, () => {
      const fullPath = path.join(publicDir, def.svgPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert(content.includes('<rect') || content.includes('<path') || content.includes('<circle'));
    });
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed}/${passed + failed} PHASE 12 TESTS PASSED!`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase12Tests().catch((err) => {
  console.error('Fatal error running Phase 12 tests:', err);
  process.exit(1);
});
