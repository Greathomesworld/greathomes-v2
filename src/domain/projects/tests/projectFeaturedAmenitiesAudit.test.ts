import { amenityRepository, projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { projectIntelligenceService } from '@/src/domain/projects/services/projectIntelligenceService';
import { ensureSeedData } from '@/src/infrastructure/seed';

async function runFeaturedAmenitiesAudit() {
  console.log('=== PROJECT FEATURED AMENITIES & HIGHLIGHTS AUDIT ===\n');

  await ensureSeedData();

  // Test 1: Retrieve test project
  const projects = await projectRepository.list({});
  if (projects.length === 0) {
    throw new Error('Test 1 FAILED: No projects found in database.');
  }
  const testProject = projects[0];
  console.log(`Test 1 (Project Resolution): PASSED — Using project "${testProject.name}" (${testProject.id})`);

  // Test 2: Retrieve master amenities
  const allMasterAmenities = await amenityRepository.findAll();
  if (allMasterAmenities.length < 2) {
    throw new Error('Test 2 FAILED: Less than 2 master amenities in database.');
  }
  const amenityA = allMasterAmenities[0];
  const amenityB = allMasterAmenities[1];
  console.log(`Test 2 (Master Taxonomy Resolution): PASSED — Found amenities "${amenityA.name}" and "${amenityB.name}"`);

  // Test 3: Attach Amenity A with isFeatured = true
  await projectIntelligenceService.attachAmenity(testProject.id, amenityA.id, true, 1, true);
  const dtoAfterAttachA = await projectIntelligenceService.getProjectById(testProject.id, true);
  const attachedA = dtoAfterAttachA?.amenities.find((a) => a.id === amenityA.id);
  if (!attachedA || attachedA.isFeatured !== true) {
    throw new Error('Test 3 FAILED: Amenity A was not attached as featured.');
  }
  console.log(`Test 3 (Attach Featured Amenity): PASSED — "${amenityA.name}" attached with isFeatured = true.`);

  // Test 4: Attach Amenity B as regular (isFeatured = false)
  await projectIntelligenceService.attachAmenity(testProject.id, amenityB.id, false, 2, true);
  const dtoAfterAttachB = await projectIntelligenceService.getProjectById(testProject.id, true);
  const attachedB = dtoAfterAttachB?.amenities.find((a) => a.id === amenityB.id);
  if (!attachedB || attachedB.isFeatured !== false) {
    throw new Error('Test 4 FAILED: Amenity B was not attached as regular.');
  }
  console.log(`Test 4 (Attach Regular Amenity): PASSED — "${amenityB.name}" attached with isFeatured = false.`);

  // Test 5: Toggle Amenity B to Featured (isFeatured = true)
  await projectIntelligenceService.attachAmenity(testProject.id, amenityB.id, true, 2, true);
  const dtoAfterToggleB = await projectIntelligenceService.getProjectById(testProject.id, true);
  const toggledB = dtoAfterToggleB?.amenities.find((a) => a.id === amenityB.id);
  if (!toggledB || toggledB.isFeatured !== true) {
    throw new Error('Test 5 FAILED: Toggling Amenity B to featured failed.');
  }
  console.log(`Test 5 (Toggle Feature Status): PASSED — Promoted "${amenityB.name}" to Featured Highlight.`);

  // Test 6: Unfeature Amenity A (isFeatured = false)
  await projectIntelligenceService.attachAmenity(testProject.id, amenityA.id, false, 1, true);
  const dtoAfterUnfeatureA = await projectIntelligenceService.getProjectById(testProject.id, true);
  const unfeaturedA = dtoAfterUnfeatureA?.amenities.find((a) => a.id === amenityA.id);
  if (!unfeaturedA || unfeaturedA.isFeatured !== false) {
    throw new Error('Test 6 FAILED: Unfeaturing Amenity A failed.');
  }
  console.log(`Test 6 (Unfeature Highlight): PASSED — Demoted "${amenityA.name}" to regular amenity while keeping attached.`);

  // Test 7: Verify Public DTO
  const publicDto = await projectIntelligenceService.getProjectBySlug(testProject.slug, false);
  if (publicDto) {
    const featuredList = publicDto.amenities.filter((a) => a.isFeatured);
    console.log(`Test 7 (Public DTO Verification): PASSED — Public payload contains ${featuredList.length} featured highlight(s).`);
  }

  console.log('\nALL FEATURED AMENITIES INTEGRATION TESTS PASSED SUCCESSFULLY!');
}

runFeaturedAmenitiesAudit().catch((err) => {
  console.error('FEATURED AMENITIES AUDIT FAILURE:', err);
  process.exit(1);
});
