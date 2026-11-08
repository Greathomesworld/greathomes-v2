import { propertyDiscoveryService } from '../src/domain/projects/services/propertyDiscoveryService';
import { projectRepository } from '../src/infrastructure/repositories/projectProvider';
import { ensureSeedData } from '../src/infrastructure/seed';
import { formatProjectStatus } from '../src/components/discovery/formatters';

async function runTests() {
  console.log('=== GREAT HOMES V2 — PART 3 TEST SUITE: STAGE DISCOVERY & FILTERING ===\n');
  await ensureSeedData();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`, details ? details : '');
      failed++;
    }
  }

  // 1. Truthful Database Counts
  const publishedProjects = await projectRepository.list({ isPublished: true });
  console.log(`Total Published Projects: ${publishedProjects.length}`);

  const counts: Record<string, number> = {
    UPCOMING: publishedProjects.filter(p => p.status === 'UPCOMING').length,
    NEW_LAUNCH: publishedProjects.filter(p => p.status === 'NEW_LAUNCH').length,
    UNDER_CONSTRUCTION: publishedProjects.filter(p => p.status === 'UNDER_CONSTRUCTION').length,
    READY_TO_MOVE: publishedProjects.filter(p => p.status === 'READY_TO_MOVE').length,
    COMPLETED: publishedProjects.filter(p => p.status === 'COMPLETED').length,
    SOLD_OUT: publishedProjects.filter(p => p.status === 'SOLD_OUT').length,
  };
  console.log('Published Stage Counts:', counts);

  assert(counts.UNDER_CONSTRUCTION > 0, 'Database contains UNDER_CONSTRUCTION projects');
  assert(counts.READY_TO_MOVE > 0, 'Database contains READY_TO_MOVE projects');
  assert(counts.UPCOMING > 0, 'Database contains UPCOMING projects');
  assert(counts.NEW_LAUNCH === 0, 'Database contains exactly 0 NEW_LAUNCH projects (verifying critical zero-count requirement)');

  // 2. Discover Projects Filter by Stage: UNDER_CONSTRUCTION
  const ucRes = await propertyDiscoveryService.discoverProjects({ stage: 'UNDER_CONSTRUCTION' });
  assert(ucRes.data.length === counts.UNDER_CONSTRUCTION, `discoverProjects({ stage: 'UNDER_CONSTRUCTION' }) returns exactly ${counts.UNDER_CONSTRUCTION} projects (${ucRes.data.length} found)`);
  assert(ucRes.data.every(p => p.status === 'UNDER_CONSTRUCTION'), 'All returned projects have status === "UNDER_CONSTRUCTION"');

  // 3. Discover Projects Filter by Stage: READY_TO_MOVE
  const rtmRes = await propertyDiscoveryService.discoverProjects({ stage: 'READY_TO_MOVE' });
  assert(rtmRes.data.length === counts.READY_TO_MOVE, `discoverProjects({ stage: 'READY_TO_MOVE' }) returns exactly ${counts.READY_TO_MOVE} projects (${rtmRes.data.length} found)`);
  assert(rtmRes.data.every(p => p.status === 'READY_TO_MOVE'), 'All returned projects have status === "READY_TO_MOVE"');

  // 4. Discover Projects Filter by Stage: UPCOMING
  const upRes = await propertyDiscoveryService.discoverProjects({ stage: 'UPCOMING' });
  assert(upRes.data.length === counts.UPCOMING, `discoverProjects({ stage: 'UPCOMING' }) returns exactly ${counts.UPCOMING} projects (${upRes.data.length} found)`);
  assert(upRes.data.every(p => p.status === 'UPCOMING'), 'All returned projects have status === "UPCOMING"');

  // 5. Discover Projects Filter by Stage: NEW_LAUNCH (Critical truthful zero condition)
  const nlRes = await propertyDiscoveryService.discoverProjects({ stage: 'NEW_LAUNCH' });
  assert(nlRes.data.length === 0, 'discoverProjects({ stage: "NEW_LAUNCH" }) returns honest 0 projects (no fabrication)');

  // 6. Case and whitespace normalization
  const norm1 = await propertyDiscoveryService.discoverProjects({ stage: 'under_construction' });
  assert(norm1.data.length === counts.UNDER_CONSTRUCTION, 'Normalizes lowercase "under_construction"');

  const norm2 = await propertyDiscoveryService.discoverProjects({ stage: 'Ready to Move' });
  assert(norm2.data.length === counts.READY_TO_MOVE, 'Normalizes string with spaces "Ready to Move"');

  // 7. Combined Stage + Location or Bedroom filter
  const combined = await propertyDiscoveryService.discoverProjects({ stage: 'UNDER_CONSTRUCTION', bedroomCount: 3 });
  assert(combined.data.length > 0 && combined.data.every(p => p.bhkSummary.includes(3)), 'Stage filter combines accurately with bedroomCount filter');

  // 8. Formatter utility verification
  assert(formatProjectStatus('NEW_LAUNCH') === 'New Launch', 'formatProjectStatus("NEW_LAUNCH") === "New Launch"');
  assert(formatProjectStatus('UNDER_CONSTRUCTION') === 'Under Construction', 'formatProjectStatus("UNDER_CONSTRUCTION") === "Under Construction"');
  assert(formatProjectStatus('READY_TO_MOVE') === 'Ready to Move', 'formatProjectStatus("READY_TO_MOVE") === "Ready to Move"');
  assert(formatProjectStatus('UPCOMING') === 'Upcoming', 'formatProjectStatus("UPCOMING") === "Upcoming"');

  console.log(`\n=== TEST SUMMARY: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
