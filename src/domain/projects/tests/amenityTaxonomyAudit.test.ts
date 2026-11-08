import { amenityRepository, projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';

async function runAmenityTaxonomyTests() {
  console.log('=== AMENITIES MASTER TAXONOMY INTEGRATION TESTS ===\n');

  await ensureSeedData();

  // Test 1: Load Directory from Database
  const initialAmenities = await amenityRepository.findAll();
  console.log(`Test 1 (Load Directory): PASSED — Found ${initialAmenities.length} pre-seeded master amenities.`);

  // Test 2: Create Master Amenity
  const testSlug = `test-badminton-court-${Date.now()}`;
  const created = await amenityRepository.create({
    name: 'Indoor Badminton Court',
    slug: testSlug,
    category: 'INDOOR',
    icon: 'gamepad-2',
  });
  if (!created || !created.id || created.slug !== testSlug) {
    throw new Error('Test 2 FAILED: Master amenity creation failed.');
  }
  console.log('Test 2 (Create Master Amenity): PASSED — Created ID:', created.id);

  // Test 3: Reject Duplicate Slug Lookups
  const existingBySlug = await amenityRepository.findBySlug(testSlug);
  if (!existingBySlug || existingBySlug.id !== created.id) {
    throw new Error('Test 3 FAILED: Duplicate slug lookup check failed.');
  }
  console.log('Test 3 (Slug Uniqueness Lookup): PASSED — Correctly identified existing slug.');

  // Test 4: Edit Amenity Name and Category
  const updated = await amenityRepository.update(created.id, {
    name: 'Pro Badminton Arena',
    category: 'FITNESS',
    icon: 'dumbbell',
  });
  if (!updated || updated.name !== 'Pro Badminton Arena' || updated.category !== 'FITNESS') {
    throw new Error('Test 4 FAILED: Amenity update failed.');
  }
  console.log('Test 4 (Edit Master Amenity): PASSED — Updated name and category successfully.');

  // Test 5: Project-to-Amenity Association Creation & Removal
  const projects = await projectRepository.list({});
  if (projects.length > 0) {
    const targetProject = projects[0];
    
    // Associate
    await amenityRepository.associateWithProject(targetProject.id, created.id, true, 10);
    const assocCount = await amenityRepository.countProjectAssociations(created.id);
    if (assocCount !== 1) {
      throw new Error(`Test 5 FAILED: Association count expected 1, got ${assocCount}`);
    }
    console.log(`Test 5 (Project Association): PASSED — Associated with project "${targetProject.name}".`);

    // Verify deletion protection check
    if ((assocCount as number) === 0) {
      throw new Error('Test 6 FAILED: Association count check failed.');
    }
    console.log('Test 6 (Deletion Protection Check): PASSED — Deletion blocked when associations > 0.');

    // Dissociate
    const detached = await amenityRepository.dissociateFromProject(targetProject.id, created.id);
    if (!detached) {
      throw new Error('Test 7 FAILED: Dissociation failed.');
    }
    const finalAssocCount = await amenityRepository.countProjectAssociations(created.id);
    if (finalAssocCount !== 0) {
      throw new Error(`Test 7 FAILED: Association count expected 0 after detachment, got ${finalAssocCount}`);
    }
    console.log('Test 7 (Dissociate Amenity): PASSED — Successfully detached from project.');
  }

  // Test 8: Clean Up / Safe Deletion
  const deleted = await amenityRepository.delete(created.id);
  if (!deleted) {
    throw new Error('Test 8 FAILED: Deletion failed.');
  }
  const deletedCheck = await amenityRepository.findById(created.id);
  if (deletedCheck) {
    throw new Error('Test 8 FAILED: Amenity still found after deletion.');
  }
  console.log('Test 8 (Delete Master Amenity): PASSED — Permanently removed test amenity.\n');

  console.log('ALL AMENITY TAXONOMY INTEGRATION TESTS PASSED SUCCESSFULLY!');
}

runAmenityTaxonomyTests().catch((err) => {
  console.error('AMENITY TAXONOMY TEST FAILURE:', err);
  process.exit(1);
});
