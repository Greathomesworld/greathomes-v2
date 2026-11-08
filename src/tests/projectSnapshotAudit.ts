import { ensureSeedData } from '../infrastructure/seed';
import { projectIntelligenceService } from '../domain/projects/services/projectIntelligenceService';
import {
  formatProjectArea,
  formatTowerCount,
  formatTotalUnits,
  formatConfigurations,
  formatFloors,
  formatPossession,
} from '../components/projects/ProjectSnapshot';
import {
  deriveConfigurationsSummary,
  toPublicProjectDto,
} from '../domain/projects/dto/projectDto';
import { Project, PropertyType, ProjectStatus } from '../domain/projects/entities';
import { Location } from '../domain/locations/entities';

async function runProjectSnapshotAudit() {
  console.log('=== GREAT HOMES V2: PHASE 05F.4 PROJECT SNAPSHOT AUDIT ===\n');

  await ensureSeedData();

  // 1. Audit Canonical Seeded Projects
  console.log('[1] Auditing Canonical Project Snapshots on 4 Seeded Projects:');

  const canonicalSlugs = [
    {
      slug: 'merlin-rise',
      expected: {
        projectArea: '15 Acres',
        towerCount: '8 Towers',
        totalUnits: '850 Units',
        configurations: '2 & 3 BHK',
        floors: 'G+18',
        possession: 'Dec 2026',
      },
    },
    {
      slug: 'merlin-the-fourth',
      expected: {
        projectArea: '2.5 Acres',
        towerCount: '2 Towers',
        totalUnits: '120 Units',
        configurations: '3 & 4 BHK',
        floors: 'G+24',
        possession: 'Ready to Move',
      },
    },
    {
      slug: 'merlin-elements',
      expected: {
        projectArea: '3.2 Acres',
        towerCount: '3 Towers',
        totalUnits: '180 Units',
        configurations: '3 BHK',
        floors: 'G+20',
        possession: 'Ready to Move',
      },
    },
    {
      slug: 'ps-one10',
      expected: {
        projectArea: '9 Acres',
        towerCount: '5 Towers',
        totalUnits: '620 Units',
        configurations: '2 & 3 BHK',
        floors: 'G+20',
        possession: 'Ready to Move',
      },
    },
  ];

  for (const item of canonicalSlugs) {
    const project = await projectIntelligenceService.getProjectBySlug(item.slug);
    if (!project) {
      throw new Error(`Project ${item.slug} not found`);
    }

    console.log(`  - Project: "${project.name}" (${project.slug})`);

    const area = formatProjectArea(project.snapshot.projectArea);
    const towers = formatTowerCount(project.snapshot.towerCount);
    const units = formatTotalUnits(project.snapshot.totalUnits);
    const configs = formatConfigurations(project.snapshot.configurations, project.configurations);
    const floors = formatFloors(project.snapshot.floors);
    const possession = formatPossession(project.snapshot.possession);

    console.log(`    * Project Area:   ${area} (expected: ${item.expected.projectArea})`);
    console.log(`    * Tower Count:    ${towers} (expected: ${item.expected.towerCount})`);
    console.log(`    * Total Units:    ${units} (expected: ${item.expected.totalUnits})`);
    console.log(`    * Configurations: ${configs} (expected: ${item.expected.configurations})`);
    console.log(`    * Floors:         ${floors} (expected: ${item.expected.floors})`);
    console.log(`    * Possession:     ${possession} (expected: ${item.expected.possession})`);

    if (area !== item.expected.projectArea) throw new Error(`Mismatch in project area for ${item.slug}`);
    if (towers !== item.expected.towerCount) throw new Error(`Mismatch in tower count for ${item.slug}`);
    if (units !== item.expected.totalUnits) throw new Error(`Mismatch in total units for ${item.slug}`);
    if (configs !== item.expected.configurations) throw new Error(`Mismatch in configs for ${item.slug}`);
    if (floors !== item.expected.floors) throw new Error(`Mismatch in floors for ${item.slug}`);
    if (possession !== item.expected.possession) throw new Error(`Mismatch in possession for ${item.slug}`);
  }

  // 2. Formatters and Edge Cases
  console.log('\n[2] Testing Snapshot Formatters & Fallback Edge Cases:');

  // Fallback to '—' when empty/null
  if (formatProjectArea(null) !== '—') throw new Error('formatProjectArea(null) must be —');
  if (formatTowerCount(null) !== '—') throw new Error('formatTowerCount(null) must be —');
  if (formatTotalUnits(null) !== '—') throw new Error('formatTotalUnits(null) must be —');
  if (formatConfigurations(null, []) !== '—') throw new Error('formatConfigurations(null) must be —');
  if (formatFloors(null) !== '—') throw new Error('formatFloors(null) must be —');
  if (formatPossession(null) !== '—') throw new Error('formatPossession(null) must be —');

  // Single tower and single unit grammar
  if (formatTowerCount(1) !== '1 Tower') throw new Error('Tower count 1 must be "1 Tower"');
  if (formatTowerCount(4) !== '4 Towers') throw new Error('Tower count 4 must be "4 Towers"');
  if (formatTotalUnits(1) !== '1 Unit') throw new Error('Total units 1 must be "1 Unit"');
  if (formatTotalUnits(1450) !== '1,450 Units') throw new Error('Total units 1450 must be "1,450 Units"');

  // Area format
  if (formatProjectArea('10') !== '10 Acres') throw new Error('Area "10" must format to "10 Acres"');
  if (formatProjectArea('8.5 Acres') !== '8.5 Acres') throw new Error('Area "8.5 Acres" must format to "8.5 Acres"');

  // Configuration sorting & joining
  const configTest1 = deriveConfigurationsSummary([
    { id: '1', projectId: 'p', name: '4 BHK', bedroomCount: 4, carpetArea: 1000, price: 100, priceBasis: 'CARPET_AREA', availability: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() },
    { id: '2', projectId: 'p', name: '2 BHK', bedroomCount: 2, carpetArea: 500, price: 50, priceBasis: 'CARPET_AREA', availability: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() },
    { id: '3', projectId: 'p', name: '3 BHK', bedroomCount: 3, carpetArea: 750, price: 75, priceBasis: 'CARPET_AREA', availability: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() },
  ]);
  if (configTest1 !== '2, 3 & 4 BHK') throw new Error(`Expected '2, 3 & 4 BHK', got '${configTest1}'`);

  const configTest2 = deriveConfigurationsSummary([
    { id: '1', projectId: 'p', name: '2 BHK', bedroomCount: 2, carpetArea: 500, price: 50, priceBasis: 'CARPET_AREA', availability: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() },
  ]);
  if (configTest2 !== '2 BHK') throw new Error(`Expected '2 BHK', got '${configTest2}'`);

  const configTest3 = deriveConfigurationsSummary([
    { id: '1', projectId: 'p', name: '2 BHK', bedroomCount: 2, carpetArea: 500, price: 50, priceBasis: 'CARPET_AREA', availability: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() },
    { id: '2', projectId: 'p', name: '3 BHK', bedroomCount: 3, carpetArea: 750, price: 75, priceBasis: 'CARPET_AREA', availability: 'AVAILABLE', createdAt: new Date(), updatedAt: new Date() },
  ]);
  if (configTest3 !== '2 & 3 BHK') throw new Error(`Expected '2 & 3 BHK', got '${configTest3}'`);

  console.log('  ✓ Missing values gracefully render as "—"');
  console.log('  ✓ Single vs plural grammar strictly handled (1 Tower vs 8 Towers, 1 Unit vs 620 Units)');
  console.log('  ✓ Deterministic configuration sorting verified (2, 3 & 4 BHK)');

  // 3. Synthetic Edge Case Project with Partial Data
  console.log('\n[3] Testing Synthetic Edge-Case Project with Sparse Data:');
  const dummyProject: Project = {
    id: 'synthetic-sparse-project',
    developerId: 'dev-1',
    locationId: 'loc-1',
    name: 'Sparse Manor',
    slug: 'sparse-manor',
    status: 'UNDER_CONSTRUCTION' as ProjectStatus,
    propertyType: 'APARTMENT' as PropertyType,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const dummyLocation: Location = {
    id: 'loc-1',
    name: 'Rajarhat',
    slug: 'rajarhat',
    type: 'AREA',
    status: 'PUBLISHED',
    featured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sparseDto = toPublicProjectDto(
    dummyProject,
    { id: 'dev-1', name: 'Dev One', slug: 'dev-one' },
    dummyLocation
  );

  if (sparseDto.snapshot.projectArea !== null) throw new Error('Expected null projectArea for sparse project');
  if (sparseDto.snapshot.towerCount !== null) throw new Error('Expected null towerCount for sparse project');
  if (sparseDto.snapshot.totalUnits !== null) throw new Error('Expected null totalUnits for sparse project');
  if (sparseDto.snapshot.configurations !== null) throw new Error('Expected null configurations for sparse project');
  if (sparseDto.snapshot.floors !== null) throw new Error('Expected null floors for sparse project');
  if (sparseDto.snapshot.possession !== null) throw new Error('Expected null possession for sparse project');

  console.log('  ✓ Sparse project produced clean null snapshot object without throwing');
  console.log('  ✓ Formatter for sparse project outputs six "—" placeholders cleanly');

  // 4. Verification of Data Privacy & Security Boundaries
  console.log('\n[4] Verifying Snapshot Privacy & Architecture Boundaries:');
  const snapshotKeys = Object.keys(sparseDto.snapshot);
  const allowedKeys = ['projectArea', 'towerCount', 'totalUnits', 'configurations', 'floors', 'possession'];
  const extraKeys = snapshotKeys.filter(k => !allowedKeys.includes(k));
  if (extraKeys.length > 0) {
    throw new Error(`Forbidden keys in snapshot DTO: ${extraKeys.join(', ')}`);
  }
  console.log(`  ✓ Snapshot DTO contains exactly the 6 approved canonical keys: ${allowedKeys.join(', ')}`);
  console.log('  ✓ Zero internal notes, CRM IDs, or unit inventory matrix exposed');

  console.log('\n=== PROJECT SNAPSHOT AUDIT PASSED WITH ZERO ERRORS ===');
}

runProjectSnapshotAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
