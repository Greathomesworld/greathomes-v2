import assert from 'node:assert/strict';
import { PropertySubmissionRepository } from '../src/domain/propertySubmission/repository.ts';
import { hasCapability } from '../src/domain/auth/capabilityModel.ts';
import { resaleListingRepository } from '../src/domain/projects/repositories/resaleRepository.ts';
import { rentalListingRepository } from '../src/domain/projects/repositories/rentalRepository.ts';

(process.env as any).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';
resaleListingRepository.enableTestMemoryPersistence(true);
rentalListingRepository.enableTestMemoryPersistence(true);

async function runPP09Tests() {
  console.log('=== STARTING PP-09 APPROVAL & PUBLICATION TESTS ===');

  const testRepo = PropertySubmissionRepository.createForTesting();

  // 1. Test RBAC capabilities for approval, publication, deactivation
  console.log('Test 1: Verifying staff capability model for PP-09...');
  const adminRole = 'ADMIN';
  const verifExecRole = 'VERIFICATION_EXECUTIVE';
  const propMgrRole = 'PROPERTY_MANAGER';
  const salesRole = 'SALES_EXECUTIVE';

  assert.ok(hasCapability(adminRole, 'submission.approve'));
  assert.ok(hasCapability(adminRole, 'submission.publish'));
  assert.ok(hasCapability(verifExecRole, 'submission.approve'));
  assert.ok(hasCapability(verifExecRole, 'submission.reject'));
  assert.equal(hasCapability(verifExecRole, 'submission.publish'), false);
  assert.equal(hasCapability(propMgrRole, 'submission.approve'), false);
  assert.equal(hasCapability(propMgrRole, 'submission.reject'), false);
  assert.equal(hasCapability(propMgrRole, 'submission.publish'), false);
  assert.equal(hasCapability(salesRole, 'submission.publish'), false);
  console.log('✓ Capability verification passed.');

  // 2. Test workflow
  console.log('Test 2: Testing workflow: Draft -> Media -> Submit -> Approve -> Publish -> Deactivate -> Reactivate...');
  const testCustomerId = 'cust_test_09';
  const testStaffId = 'staff_admin_01';

  const payloadData = {
    listingPurpose: 'RESALE',
    propertyType: 'APARTMENT',
    submitterName: 'Test Owner',
    submitterPhone: '9876543210',
    submitterEmail: 'owner@example.com',
    location: {
      city: 'Kolkata',
      locality: 'Ballygunge',
      pinCode: '700019',
      fullAddress: '12 Ballygunge Circular Road, Kolkata',
    },
    details: {
      bedroomCount: 3,
      bathroomCount: 2,
      carpetArea: 1200,
      superBuiltUpArea: 1550,
      askingPrice: 12500000,
      floorCategory: 'MID_FLOOR',
      furnishing: 'SEMI_FURNISHED',
      facing: 'EAST',
      possession: 'READY_TO_MOVE',
    },
  };

  const newSub = await testRepo.createDraft({
    submitterCustomerId: testCustomerId,
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: payloadData,
  });

  const subId = newSub.id;
  console.log(`Created test submission ID: ${subId}`);

  // Add 3 media assets with required width & height
  await testRepo.addSubmissionMediaWithAtomicCap(subId, testCustomerId, {
    id: 'med_1',
    filename: 'photo1.jpg',
    mimeType: 'image/jpeg',
    category: 'HALL',
    storageProvider: 's3',
    storageKey: 'key1',
    url: 'https://example.com/1.jpg',
    originalUrl: 'https://example.com/1.jpg',
    width: 1920,
    height: 1080,
    fileSizeBytes: 1024,
    watermarkApplied: true,
  });
  await testRepo.addSubmissionMediaWithAtomicCap(subId, testCustomerId, {
    id: 'med_2',
    filename: 'photo2.jpg',
    mimeType: 'image/jpeg',
    category: 'BEDROOM',
    storageProvider: 's3',
    storageKey: 'key2',
    url: 'https://example.com/2.jpg',
    originalUrl: 'https://example.com/2.jpg',
    width: 1920,
    height: 1080,
    fileSizeBytes: 1024,
    watermarkApplied: true,
  });
  await testRepo.addSubmissionMediaWithAtomicCap(subId, testCustomerId, {
    id: 'med_3',
    filename: 'photo3.jpg',
    mimeType: 'image/jpeg',
    category: 'KITCHEN',
    storageProvider: 's3',
    storageKey: 'key3',
    url: 'https://example.com/3.jpg',
    originalUrl: 'https://example.com/3.jpg',
    width: 1920,
    height: 1080,
    fileSizeBytes: 1024,
    watermarkApplied: true,
  });

  // Submit for review with payload
  await testRepo.submitForReview(subId, testCustomerId, payloadData);
  console.log('✓ Submitted for review.');

  // Approve submission
  const approvalRes = await testRepo.approveSubmission(subId, testStaffId, 'ADMIN', { internalNote: 'Verified', contactConfirmed: true });
  console.log(`✓ Approval status: ${approvalRes.submissionStatus}`);
  assert.equal(approvalRes.submissionStatus, 'APPROVED');

  // Publish submission
  const publishRes = await testRepo.publishSubmission(subId, testStaffId, 'ADMIN');
  console.log(`✓ Publication status: ${publishRes.submissionStatus}, Listing ID: ${publishRes.listingId}`);
  assert.equal(publishRes.submissionStatus, 'PUBLISHED');

  // Deactivate listing
  const deactRes = await testRepo.deactivateListing(subId, testStaffId, 'ADMIN', 'Suspended');
  console.log(`✓ Deactivation status: ${deactRes.submissionStatus}`);
  assert.equal(deactRes.submissionStatus, 'DEACTIVATED');

  // Reactivate listing
  const reactRes = await testRepo.reactivateListing(subId, testStaffId, 'ADMIN');
  console.log(`✓ Reactivation status: ${reactRes.submissionStatus}`);
  assert.equal(reactRes.submissionStatus, 'PUBLISHED');

  console.log('=== ALL PP-09 TESTS COMPLETED SUCCESSFULLY ===');
}

runPP09Tests().catch((err) => {
  console.error('PP-09 test failed:', err);
  process.exit(1);
});
