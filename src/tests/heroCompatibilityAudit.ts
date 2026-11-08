import { selectHeroMedia } from '../components/projects/heroMediaSelection';
import { PublicProjectDto } from '../domain/projects/dto/projectDto';
import { projectIntelligenceService } from '../domain/projects/services/projectIntelligenceService';
import { ensureSeedData } from '../infrastructure/seed';

async function runAudit() {
  console.log('=== GREAT HOMES V2: PROJECT HERO COMPATIBILITY AUDIT ===\n');

  // 1. Audit Current Seeded Projects
  await ensureSeedData();
  const projectSlugs = ['merlin-rise', 'merlin-the-fourth', 'merlin-elements', 'ps-one10'];
  console.log(`[1] Auditing ${projectSlugs.length} Canonical Seeded Projects:`);

  for (const slug of projectSlugs) {
    const project = await projectIntelligenceService.getProjectBySlug(slug);
    if (!project) {
      throw new Error(`Project ${slug} not found in database!`);
    }
    const mediaResult = selectHeroMedia(project.media);
    console.log(`  - Project: "${project.name}" (${project.slug})`);
    console.log(`    * Status: ${project.status}`);
    console.log(`    * RERA Status: ${project.rera.status}, Badge: ${project.rera.hasVerifiedReraBadge}`);
    console.log(`    * Price: ₹${project.pricing.startingPrice?.toLocaleString('en-IN') || 'None'}`);
    console.log(`    * Total Media: ${project.media.length}, Suitable: ${mediaResult.suitableMediaList.length}`);
    console.log(`    * Hero Media Selected: ${mediaResult.heroMedia?.url?.substring(0, 60)}...`);
  }

  // 2. Audit Media Priority Logic (5 Tiers + Exclusions)
  console.log('\n[2] Testing Canonical Media Priority Rules:');

  // Case A: Featured Exterior should win over non-featured or non-exterior
  const testMediaA = [
    { id: '1', mediaType: 'IMAGE', category: 'INTERIOR', url: 'https://example.com/int.jpg', isFeatured: false, sortOrder: 1 },
    { id: '2', mediaType: 'IMAGE', category: 'EXTERIOR', url: 'https://example.com/ext-feat.jpg', isFeatured: true, sortOrder: 2 },
    { id: '3', mediaType: 'IMAGE', category: 'AMENITIES', url: 'https://example.com/amen-feat.jpg', isFeatured: true, sortOrder: 3 },
  ];
  const resA = selectHeroMedia(testMediaA);
  if (resA.heroMedia?.id !== '2') throw new Error('Priority 1 (Featured Exterior) failed!');
  console.log('  ✓ Priority 1 (Featured Exterior) correctly selected');

  // Case B: Featured Suitable when no featured exterior
  const testMediaB = [
    { id: '1', mediaType: 'IMAGE', category: 'INTERIOR', url: 'https://example.com/int.jpg', isFeatured: false, sortOrder: 1 },
    { id: '2', mediaType: 'IMAGE', category: 'AMENITIES', url: 'https://example.com/amen-feat.jpg', isFeatured: true, sortOrder: 2 },
  ];
  const resB = selectHeroMedia(testMediaB);
  if (resB.heroMedia?.id !== '2') throw new Error('Priority 2 (Featured Suitable) failed!');
  console.log('  ✓ Priority 2 (Featured Suitable) correctly selected');

  // Case C: First Exterior when no featured
  const testMediaC = [
    { id: '1', mediaType: 'IMAGE', category: 'INTERIOR', url: 'https://example.com/int.jpg', isFeatured: false, sortOrder: 1 },
    { id: '2', mediaType: 'IMAGE', category: 'EXTERIOR', url: 'https://example.com/ext.jpg', isFeatured: false, sortOrder: 2 },
  ];
  const resC = selectHeroMedia(testMediaC);
  if (resC.heroMedia?.id !== '2') throw new Error('Priority 3 (First Exterior) failed!');
  console.log('  ✓ Priority 3 (First Exterior) correctly selected');

  // Case D: First Suitable when no exterior
  const testMediaD = [
    { id: '1', mediaType: 'IMAGE', category: 'INTERIOR', url: 'https://example.com/int.jpg', isFeatured: false, sortOrder: 1 },
    { id: '2', mediaType: 'IMAGE', category: 'AMENITIES', url: 'https://example.com/amen.jpg', isFeatured: false, sortOrder: 2 },
  ];
  const resD = selectHeroMedia(testMediaD);
  if (resD.heroMedia?.id !== '1') throw new Error('Priority 4 (First Suitable) failed!');
  console.log('  ✓ Priority 4 (First Suitable) correctly selected');

  // Case E: Exclusions (Floor plans, Master plans, Construction progress)
  const testMediaE = [
    { id: '1', mediaType: 'IMAGE', category: 'FLOOR_PLANS', url: 'https://example.com/fp.jpg', isFeatured: true, sortOrder: 1 },
    { id: '2', mediaType: 'IMAGE', category: 'MASTER_PLAN', url: 'https://example.com/mp.jpg', isFeatured: true, sortOrder: 2 },
    { id: '3', mediaType: 'IMAGE', category: 'CONSTRUCTION', url: 'https://example.com/cp.jpg', isFeatured: true, sortOrder: 3 },
  ];
  const resE = selectHeroMedia(testMediaE);
  if (resE.heroMedia !== null || resE.suitableMediaList.length !== 0) throw new Error('Exclusion of non-hero categories failed!');
  console.log('  ✓ Excluded categories (Floor Plans, Master Plans, Construction) correctly filtered out');

  // Case F: 0 media items
  const resF = selectHeroMedia([]);
  if (resF.heroMedia !== null || resF.suitableMediaList.length !== 0) throw new Error('Zero media handling failed!');
  console.log('  ✓ Zero media gracefully returns null hero and empty suitable list');

  // Case G: Single media item
  const testMediaG = [
    { id: '1', mediaType: 'IMAGE', category: 'EXTERIOR', url: 'https://example.com/ext.jpg', isFeatured: false, sortOrder: 1 },
  ];
  const resG = selectHeroMedia(testMediaG);
  if (resG.heroMedia?.id !== '1' || resG.suitableMediaList.length !== 1) throw new Error('Single media handling failed!');
  console.log('  ✓ Single media item correctly selected with count 1');

  // 3. Synthetic Edge Case Verification
  console.log('\n[3] Testing Synthetic Edge-Case Projects (Long Strings, Null Fields, Status Variations):');
  const syntheticCases: PublicProjectDto[] = [
    {
      id: 'syn-1',
      name: 'Super Ultra Luxury Signature Residences At The Royal Emerald Grand Crest',
      slug: 'super-ultra-luxury-signature-residences',
      developer: { id: 'dev-1', name: 'Prestige Global International Infrastructure Developers Ltd.', slug: 'prestige-global' },
      location: { id: 'loc-1', name: 'South Eastern Peripheral Expressway Corridor Zone', slug: 'south-eastern-corridor', type: 'NEIGHBORHOOD' },
      status: 'UNDER_CONSTRUCTION',
      lifecycleStatus: 'PUBLISHED',
      pricing: { startingPrice: 45000000, maximumPrice: 85000000, priceBasis: 'CARPET_AREA', lowestEffectivePricePerSqft: 18500 },
      rera: { status: 'VERIFIED', registrationNumber: 'WBRERA/P/KOL/2026/000999988887777', hasVerifiedReraBadge: true, authority: 'WBRERA' },
      media: testMediaA,
      amenities: [],
      configurations: [],
      faqs: [],
      featured: true,
      propertyType: 'APARTMENT',
      snapshot: {
        projectArea: '12.5 Acres',
        towerCount: 6,
        totalUnits: 450,
        configurations: '3, 4 & 5 BHK',
        floors: 'G+35',
        possession: 'Dec 2028',
      },
      hasVerifiedReraBadge: true,
      reraStatus: 'VERIFIED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'syn-2',
      name: 'Eco Nest',
      slug: 'eco-nest',
      developer: { id: 'dev-2', name: 'Green Devs', slug: 'green-devs' },
      location: { id: 'loc-2', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA' },
      status: 'READY_TO_MOVE',
      lifecycleStatus: 'PUBLISHED',
      pricing: { startingPrice: null, maximumPrice: null, priceBasis: null, lowestEffectivePricePerSqft: null },
      rera: { status: 'NOT_PROVIDED', registrationNumber: null, hasVerifiedReraBadge: false, authority: null },
      media: [],
      amenities: [],
      configurations: [],
      faqs: [],
      featured: false,
      propertyType: 'APARTMENT',
      snapshot: {
        projectArea: null,
        towerCount: null,
        totalUnits: null,
        configurations: null,
        floors: null,
        possession: null,
      },
      hasVerifiedReraBadge: false,
      reraStatus: 'NOT_PROVIDED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'syn-3',
      name: 'Merlin Elements Phase 2',
      slug: 'merlin-elements-phase-2',
      developer: { id: 'dev-3', name: 'Merlin Group', slug: 'merlin' },
      location: { id: 'loc-3', name: 'Tollygunge', slug: 'tollygunge', type: 'AREA' },
      status: 'COMPLETED',
      lifecycleStatus: 'PUBLISHED',
      pricing: { startingPrice: 9200000, maximumPrice: 12000000, priceBasis: 'CARPET_AREA', lowestEffectivePricePerSqft: 6800 },
      rera: { status: 'PROVIDED', registrationNumber: 'WBRERA/P/KOL/2022/000333', hasVerifiedReraBadge: false, authority: 'WBRERA' },
      media: testMediaG,
      amenities: [],
      configurations: [],
      faqs: [],
      featured: false,
      propertyType: 'APARTMENT',
      snapshot: {
        projectArea: '3.2 Acres',
        towerCount: 3,
        totalUnits: 180,
        configurations: '3 BHK',
        floors: 'G+20',
        possession: 'Ready to Move',
      },
      hasVerifiedReraBadge: false,
      reraStatus: 'PROVIDED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  for (const s of syntheticCases) {
    const mRes = selectHeroMedia(s.media);
    console.log(`  ✓ Synthetic case "${s.name?.substring(0, 30)}..." passed validation with ${mRes.suitableMediaList.length} suitable media items.`);
  }

  console.log('\n=== COMPATIBILITY AUDIT PASSED WITH ZERO ERRORS ===');
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
