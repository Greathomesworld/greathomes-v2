import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { selectHeroMedia } from '../src/components/projects/heroMediaSelection.ts';
import { ProjectMasterPlan } from '../src/components/projects/ProjectMasterPlan.tsx';
import { ProjectConstructionGallery } from '../src/components/projects/ProjectConstructionGallery.tsx';
import { ProjectFaqAccordion } from '../src/components/projects/ProjectFaqAccordion.tsx';

globalThis.React = React;

const rootDir = process.cwd();
const read = (relPath) => fs.readFileSync(path.join(rootDir, relPath), 'utf8');

async function runTests() {
  console.log('=== Great Homes V2 — Project Detail Page Batch 1 Verification Suite ===\n');

  // ---------------------------------------------------------------------------
  // 1. Configuration & Floor-Plan Enquiry Context Propagation
  // ---------------------------------------------------------------------------
  console.log('1. Testing Configuration-Card and Floor-Plan Enquiry Context Propagation...');
  const pageFile = read('app/projects/[slug]/page.tsx');
  const typologiesFile = read('src/components/projects/typologies/ProjectTypologiesSection.tsx');
  const gridFile = read('src/components/projects/typologies/ProjectConfigurationGrid.tsx');
  const cardFile = read('src/components/projects/typologies/ProjectConfigurationCard.tsx');
  const viewerFile = read('src/components/projects/ProjectFloorPlanViewer.tsx');
  const dialogFile = read('src/components/enquiry/GreatHomesEnquiryDialog.tsx');
  const dtoFile = read('src/domain/enquiry/dto/enquiryDto.ts');

  // Page passes projectSlug and locationName to both sections
  assert.ok(
    pageFile.includes('<ProjectConfigurationsSection') &&
      pageFile.includes('projectSlug={project.slug}') &&
      pageFile.includes('locationName={project.location.name}'),
    'page.tsx must pass projectSlug and locationName to ProjectConfigurationsSection and ProjectFloorPlanViewer'
  );

  // Typologies section forwards projectName, projectSlug, locationName to grid
  assert.ok(
    typologiesFile.includes('projectSlug?: string;') &&
      typologiesFile.includes('locationName?: string;') &&
      typologiesFile.includes('projectName={projectName}') &&
      typologiesFile.includes('projectSlug={projectSlug}') &&
      typologiesFile.includes('locationName={locationName}'),
    'ProjectTypologiesSection must accept and forward projectName, projectSlug, and locationName'
  );

  // Grid forwards projectName, projectSlug, locationName to card
  assert.ok(
    gridFile.includes('projectName={projectName}') &&
      gridFile.includes('projectSlug={projectSlug}') &&
      gridFile.includes('locationName={locationName}'),
    'ProjectConfigurationGrid must forward projectName, projectSlug, and locationName to ProjectConfigurationCard'
  );

  // Card passes projectSlug, projectName, locationName, and configurationId: config.id to openEnquiry
  assert.ok(
    cardFile.includes("contextType: 'PROJECT'") &&
      cardFile.includes('projectSlug,') &&
      cardFile.includes('projectName,') &&
      cardFile.includes('locationName,') &&
      cardFile.includes('configurationId: config.id'),
    'ProjectConfigurationCard must pass projectSlug, projectName, locationName, and configurationId: config.id to openEnquiry'
  );

  // FloorPlanViewer passes projectSlug, projectName, locationName, and configurationId: activeConfig.id to openEnquiry
  assert.ok(
    viewerFile.includes("contextType: 'PROJECT'") &&
      viewerFile.includes('projectSlug,') &&
      viewerFile.includes('projectName,') &&
      viewerFile.includes('locationName,') &&
      viewerFile.includes('configurationId: activeConfig.id'),
    'ProjectFloorPlanViewer must pass projectSlug, projectName, locationName, and configurationId: activeConfig.id to openEnquiry'
  );

  // DTO and Dialog support requestSiteVisit and configuration prefill
  assert.ok(
    dtoFile.includes('requestSiteVisit?: boolean;'),
    'PublicEnquiryContextDto must include optional requestSiteVisit?: boolean'
  );
  assert.ok(
    dialogFile.includes('contextData?.requestSiteVisit ?? true'),
    'GreatHomesEnquiryDialog must initialize requestSiteVisit from contextData.requestSiteVisit'
  );
  console.log('   ✓ Configuration-card and floor-plan enquiry context propagation verified.');

  // ---------------------------------------------------------------------------
  // 2. Mobile Navigation Layout & CTA Behaviour
  // ---------------------------------------------------------------------------
  console.log('2. Testing Mobile Navigation Layout and Sticky CTA Behaviour...');
  const mobileBottomNavFile = read('src/components/layout/MobileBottomNav.tsx');
  const mobileStickyCtaFile = read('src/components/projects/MobileStickyCta.tsx');

  // MobileBottomNav has explicit h-14 at bottom-0 on <md
  assert.ok(
    mobileBottomNavFile.includes('md:hidden fixed bottom-0 left-0 right-0 z-40 h-14'),
    'MobileBottomNav must have explicit h-14 (56px) height at bottom-0 on <md viewports'
  );

  // MobileStickyCta sits at bottom-14 on <md and md:bottom-0 on md..lg
  assert.ok(
    mobileStickyCtaFile.includes('fixed inset-x-0 bottom-14 md:bottom-0 z-40 lg:hidden'),
    'MobileStickyCta must use bottom-14 md:bottom-0 z-40 lg:hidden to avoid colliding with MobileBottomNav'
  );

  // Page main container has pb-36 md:pb-24 lg:pb-16 to prevent content clipping
  assert.ok(
    pageFile.includes('pb-36 md:pb-24 lg:pb-16'),
    'Project detail page main element must include pb-36 md:pb-24 lg:pb-16 bottom clearance'
  );

  // MobileStickyCta triggers openEnquiry directly when project.slug is available
  assert.ok(
    mobileStickyCtaFile.includes('openEnquiry({') &&
      mobileStickyCtaFile.includes('projectSlug: project.slug') &&
      mobileStickyCtaFile.includes('requestSiteVisit: requestVisit') &&
      mobileStickyCtaFile.includes("handleAction(true, 'contact-details')") &&
      mobileStickyCtaFile.includes('handleAction(false, targetSectionId)'),
    'MobileStickyCta must trigger openEnquiry with project.slug and distinct requestSiteVisit flags for Enquire vs Visit'
  );
  console.log('   ✓ MobileBottomNav and MobileStickyCta layout separation and enquiry triggers verified.');

  // ---------------------------------------------------------------------------
  // 3. Sticky ProjectSectionNavigation Positioning Relative to Header
  // ---------------------------------------------------------------------------
  console.log('3. Testing Sticky ProjectSectionNavigation Positioning...');
  const headerFile = read('src/components/layout/Header.tsx');
  const sectionNavFile = read('src/components/projects/ProjectSectionNavigation.tsx');

  assert.ok(
    headerFile.includes('sticky top-0 z-40') && headerFile.includes('h-16 sm:h-18'),
    'Global Header is sticky top-0 z-40 with height h-16 sm:h-18'
  );
  assert.ok(
    sectionNavFile.includes('sticky top-16 sm:top-18 z-30'),
    'ProjectSectionNavigation must use sticky top-16 sm:top-18 z-30 so it stays visible below Header'
  );
  assert.ok(
    sectionNavFile.includes('const yOffset = -132;') &&
      sectionNavFile.includes('window.scrollY + 150'),
    'ProjectSectionNavigation must account for combined Header + SectionNav sticky height in scroll offset and spy calculation'
  );
  console.log('   ✓ Sticky ProjectSectionNavigation positioning and scroll offset verified.');

  // ---------------------------------------------------------------------------
  // 4. Rules-of-Hooks Compliance & Empty-to-Populated Transitions
  // ---------------------------------------------------------------------------
  console.log('4. Testing Rules-of-Hooks Compliance across Empty-to-Populated Transitions...');
  const masterPlanFile = read('src/components/projects/ProjectMasterPlan.tsx');
  const constructionFile = read('src/components/projects/ProjectConstructionGallery.tsx');
  const faqFile = read('src/components/projects/ProjectFaqAccordion.tsx');

  // Verify no return statement appears before useState/useEffect in the component body
  for (const [name, content] of [
    ['ProjectMasterPlan.tsx', masterPlanFile],
    ['ProjectConstructionGallery.tsx', constructionFile],
    ['ProjectFaqAccordion.tsx', faqFile],
  ]) {
    const fnStart = content.indexOf('export function');
    assert.ok(fnStart !== -1, `${name} must have export function`);
    const body = content.slice(fnStart);
    const firstReturn = body.indexOf('return null;');
    const lastUseState = body.lastIndexOf('useState(');
    const lastUseEffect = body.lastIndexOf('useEffect(');
    assert.ok(firstReturn !== -1, `${name} should have early return for empty state`);
    assert.ok(
      lastUseState < firstReturn,
      `${name}: all useState calls must precede early return null`
    );
    if (lastUseEffect !== -1) {
      assert.ok(
        lastUseEffect < firstReturn,
        `${name}: all useEffect calls must precede early return null`
      );
    }
  }

  // Render components in empty state and populated state to verify clean execution
  const emptyMasterHtml = renderToStaticMarkup(
    React.createElement(ProjectMasterPlan, { mediaList: [], projectName: 'Test Project' })
  );
  assert.equal(emptyMasterHtml, '', 'ProjectMasterPlan with empty mediaList should render empty string');

  const populatedMasterHtml = renderToStaticMarkup(
    React.createElement(ProjectMasterPlan, {
      mediaList: [
        {
          id: 'mp-1',
          url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c',
          category: 'MASTER_PLAN',
          mediaType: 'IMAGE',
          caption: 'Master Layout',
          altText: null,
          sortOrder: 0,
          isFeatured: false,
        },
      ],
      projectName: 'Test Project',
    })
  );
  assert.ok(
    populatedMasterHtml.includes('id="master-plan-heading"') &&
      populatedMasterHtml.includes('Master Layout'),
    'ProjectMasterPlan with valid mediaList should render master-plan section'
  );

  const emptyConstructionHtml = renderToStaticMarkup(
    React.createElement(ProjectConstructionGallery, { mediaList: [], projectName: 'Test Project' })
  );
  assert.equal(emptyConstructionHtml, '', 'ProjectConstructionGallery with empty mediaList should render empty string');

  const populatedConstructionHtml = renderToStaticMarkup(
    React.createElement(ProjectConstructionGallery, {
      mediaList: [
        {
          id: 'con-1',
          url: 'https://images.unsplash.com/photo-1541888946425-d09bb18086f6',
          category: 'CONSTRUCTION',
          mediaType: 'IMAGE',
          caption: 'Tower A Progress',
          altText: null,
          sortOrder: 0,
          isFeatured: false,
        },
      ],
      projectName: 'Test Project',
    })
  );
  assert.ok(
    populatedConstructionHtml.includes('id="construction-heading"') &&
      populatedConstructionHtml.includes('Tower A Progress'),
    'ProjectConstructionGallery with valid mediaList should render construction-heading section'
  );

  const emptyFaqHtml = renderToStaticMarkup(
    React.createElement(ProjectFaqAccordion, { faqs: [] })
  );
  assert.equal(emptyFaqHtml, '', 'ProjectFaqAccordion with empty faqs should render empty string');

  const populatedFaqHtml = renderToStaticMarkup(
    React.createElement(ProjectFaqAccordion, {
      faqs: [
        { id: 'faq-1', question: 'What is the RERA number?', answer: 'WBRERA/P/KOL/2025/0001', sortOrder: 0 },
        { id: 'faq-2', question: 'When is possession?', answer: 'December 2027', sortOrder: 1 },
      ],
    })
  );
  assert.ok(
    populatedFaqHtml.includes('id="faq"') &&
      populatedFaqHtml.includes('What is the RERA number?') &&
      populatedFaqHtml.includes('WBRERA/P/KOL/2025/0001'),
    'ProjectFaqAccordion with valid faqs should render section#faq with first FAQ expanded'
  );
  console.log('   ✓ Rules-of-Hooks compliance and empty-to-populated rendering verified.');

  // ---------------------------------------------------------------------------
  // 5. Hero Media Index, Video Exclusions & Image Count Alignment
  // ---------------------------------------------------------------------------
  console.log('5. Testing Hero Media Selection, Index Alignment, and Video Exclusions...');

  // Synthetic case A: Pravya-like media array (excluded categories + video before featured EXTERIOR)
  const syntheticMedia = [
    {
      id: 'm-con',
      url: 'https://example.com/con.jpg',
      category: 'CONSTRUCTION',
      mediaType: 'IMAGE',
      caption: 'Construction',
      sortOrder: 0,
      isFeatured: false,
    },
    {
      id: 'm-fp',
      url: 'https://example.com/fp.jpg',
      category: 'FLOOR_PLANS',
      mediaType: 'IMAGE',
      caption: 'Floor plan',
      sortOrder: 1,
      isFeatured: false,
    },
    {
      id: 'm-vid',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      category: 'WALKTHROUGH',
      mediaType: 'VIDEO',
      caption: 'Walkthrough Video',
      sortOrder: 2,
      isFeatured: false,
    },
    {
      id: 'm-ext-featured',
      url: 'https://example.com/ext-featured.jpg',
      category: 'EXTERIOR',
      mediaType: 'IMAGE',
      caption: 'Featured Exterior',
      sortOrder: 3,
      isFeatured: true,
    },
    {
      id: 'm-amen',
      url: 'https://example.com/amen.jpg',
      category: 'AMENITIES',
      mediaType: 'IMAGE',
      caption: 'Clubhouse',
      sortOrder: 4,
      isFeatured: false,
    },
  ];

  const selection = selectHeroMedia(syntheticMedia);
  assert.equal(selection.suitableMediaList.length, 2, 'Only EXTERIOR and AMENITIES images should be in suitableMediaList');
  assert.equal(selection.heroMedia?.id, 'm-ext-featured', 'Featured EXTERIOR must be selected as heroMedia');
  assert.equal(
    selection.heroIndex,
    0,
    'heroIndex must be 0 (its index within suitableMediaList), NOT 3 (its index in raw mediaList)'
  );
  assert.equal(
    selection.suitableMediaList[selection.heroIndex].id,
    selection.heroMedia.id,
    'suitableMediaList[heroIndex] must match heroMedia'
  );

  // Synthetic case B: Empty media
  const emptySelection = selectHeroMedia([]);
  assert.equal(emptySelection.suitableMediaList.length, 0);
  assert.equal(emptySelection.heroMedia, null);
  assert.equal(emptySelection.heroIndex, -1);

  // Synthetic case C: Only excluded categories
  const excludedOnlySelection = selectHeroMedia([
    {
      id: 'm-mp',
      url: 'https://example.com/mp.jpg',
      category: 'MASTER_PLAN',
      mediaType: 'IMAGE',
      caption: 'MP',
      sortOrder: 0,
      isFeatured: true,
    },
  ]);
  assert.equal(excludedOnlySelection.suitableMediaList.length, 0);
  assert.equal(excludedOnlySelection.heroMedia, null);
  assert.equal(excludedOnlySelection.heroIndex, -1);

  // Verify against all published projects from live API
  const apiRes = await fetch('http://localhost:3000/api/projects?page=1&limit=50');
  assert.equal(apiRes.status, 200, 'GET /api/projects?page=1&limit=50 should return 200');
  const apiJson = await apiRes.json();
  const projects = apiJson.data || [];
  assert.ok(projects.length > 0, 'Expected published projects from /api/projects');

  for (const proj of projects) {
    const media = proj.media || [];
    const res = selectHeroMedia(media);
    if (res.suitableMediaList.length === 0) {
      assert.equal(res.heroMedia, null, `[${proj.slug}] heroMedia must be null when suitableMediaList is empty`);
      assert.equal(res.heroIndex, -1, `[${proj.slug}] heroIndex must be -1 when suitableMediaList is empty`);
    } else {
      assert.ok(
        res.heroIndex >= 0 && res.heroIndex < res.suitableMediaList.length,
        `[${proj.slug}] heroIndex (${res.heroIndex}) out of bounds for suitableMediaList (${res.suitableMediaList.length})`
      );
      assert.equal(
        res.suitableMediaList[res.heroIndex]?.id,
        res.heroMedia?.id,
        `[${proj.slug}] suitableMediaList[heroIndex] must equal heroMedia`
      );
      for (const item of res.suitableMediaList) {
        assert.ok(
          !['FLOOR_PLANS', 'MASTER_PLAN', 'CONSTRUCTION', 'WALKTHROUGH'].includes(item.category),
          `[${proj.slug}] suitableMediaList must not contain excluded category ${item.category}`
        );
        assert.notEqual(
          item.mediaType,
          'VIDEO',
          `[${proj.slug}] suitableMediaList must not contain VIDEO items`
        );
      }
    }
  }
  console.log(`   ✓ Hero media selection and index bounds verified across ${projects.length} live published projects.`);

  // ---------------------------------------------------------------------------
  // 6. Live SSR Project Detail Pages for Section Anchors & Hero Image Counts
  // ---------------------------------------------------------------------------
  console.log('6. Testing Live SSR Project Detail Pages for Section Anchors & Hero Image Counts...');
  const testSlugs = [
    'pravya',
    'merlin-rise',
    'merlin-elements',
    'antares',
    'sansara',
  ];

  for (const slug of testSlugs) {
    const res = await fetch(`http://localhost:3000/projects/${slug}`);
    assert.equal(res.status, 200, `GET /projects/${slug} must return 200`);
    const html = await res.text();

    // Extract sticky ProjectSectionNavigation links
    const navMatch = html.match(/<nav aria-label="Project section navigation" class="sticky top-16 sm:top-18 z-30[\s\S]*?<\/nav>/);
    assert.ok(navMatch, `[${slug}] ProjectSectionNavigation sticky container must render with top-16 sm:top-18 z-30`);

    const navHtml = navMatch[0];
    const hrefMatches = [...navHtml.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    assert.ok(hrefMatches.length > 0, `[${slug}] ProjectSectionNavigation must render at least one section link`);

    // Verify every nav href="#id" exists as id="..." in the page HTML and in strictly increasing DOM order
    let lastPos = -1;
    for (const targetId of hrefMatches) {
      const idAttr = `id="${targetId}"`;
      const pos = html.indexOf(idAttr);
      assert.ok(
        pos !== -1,
        `[${slug}] Nav link href="#${targetId}" has no matching element with ${idAttr} in rendered DOM`
      );
      assert.ok(
        pos > lastPos,
        `[${slug}] Section #${targetId} DOM position (${pos}) is out of order relative to previous nav item (${lastPos})`
      );
      lastPos = pos;
    }

    // Specific verification for pravya:
    // - #overview must exist (populated from shortDescription fallback)
    // - Hero counter must show "3 / 4" (featured EXTERIOR at suitableMediaList[2], NOT raw mediaList[3] "4 / 4")
    if (slug === 'pravya') {
      const cleanHtml = html.replace(/<!--\s*-->/g, '');
      assert.ok(
        hrefMatches.includes('overview') && html.includes('id="overview"'),
        '[pravya] #overview section and nav pill must render when shortDescription is present'
      );
      assert.ok(
        cleanHtml.includes('3 / 4') && !cleanHtml.includes('4 / 4'),
        '[pravya] Hero counter must render "3 / 4" (suitableMediaList index 2) and not "4 / 4" (raw mediaList index 3)'
      );
    }
  }
  console.log(`   ✓ All section navigation targets and DOM ordering verified across ${testSlugs.length} live project pages.`);

  console.log('\n=== ALL BATCH 1 TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch((err) => {
  console.error('\n❌ Batch 1 Verification Failed:', err);
  process.exit(1);
});
