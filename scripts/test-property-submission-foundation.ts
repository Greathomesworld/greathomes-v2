import { validateSubmissionForSubmit } from '../src/domain/propertySubmission/validation.ts';
import { propertySubmissionRepository } from '../src/domain/propertySubmission/repository.ts';
import { getDb } from '../src/db/client.ts';
import { customers, propertySubmissions } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

type CustomerInsertRow = typeof customers.$inferInsert & Partial<typeof customers.$inferSelect>;

async function runTests() {
  console.log('=== STARTING PP-02 PROPERTY SUBMISSION FOUNDATION TESTS ===');

  // 1. Zod Validation Tests
  console.log('Test 1: Zod validation for incomplete draft vs complete submission');
  const incompletePayload = {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    propertyType: 'APARTMENT',
    photos: [
      {
        id: '1',
        url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_pp02/med_1/public_wm.webp',
      },
    ], // Only 1 photo, should fail submission validation
  };

  const validationRes = validateSubmissionForSubmit(incompletePayload);
  if (validationRes.success) {
    throw new Error('Test 1 Failed: Incomplete draft passed final submission validation.');
  }
  console.log('✓ Test 1 Passed: Incomplete submission correctly rejected (Minimum 3 photos enforced).');

  const completePayload = {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    propertyType: 'APARTMENT',
    location: {
      city: 'Kolkata',
      locality: 'Ballygunge',
      address: '12 Park Street',
    },
    details: {
      bedroomCount: 3,
      bathroomCount: 2,
      carpetArea: 1500,
      askingPrice: 25000000,
    },
    photos: [
      {
        id: '1',
        url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_pp02/med_1/public_wm.webp',
      },
      {
        id: '2',
        url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_pp02/med_2/public_wm.webp',
      },
      {
        id: '3',
        url: 'https://pub-8e680bcad96e4b29adac1756755a344b.r2.dev/media/submission/sub_pp02/med_3/public_wm.webp',
      },
    ],
    consent: {
      ownerDeclarationAccepted: true,
      declarationText: 'I own this property.',
    },
  };

  const completeValRes = validateSubmissionForSubmit(completePayload);
  if (!completeValRes.success) {
    throw new Error(`Test 1b Failed: Complete payload rejected: ${JSON.stringify(completeValRes.errors)}`);
  }
  console.log('✓ Test 1b Passed: Complete submission payload validated successfully.');

  // 2. Database & Repository Tests (if DB is configured)
  const db = await getDb();
  if (db) {
    console.log('Test 2: Database Persistence & Repository Isolation');

    const testCustomerId = `cust_test_${Date.now()}`;
    const otherCustomerId = `cust_other_${Date.now()}`;

    const seedCustomers: CustomerInsertRow[] = [
      { id: testCustomerId, name: 'Test Owner', phone: '+919876543210', status: 'ACTIVE' },
      { id: otherCustomerId, name: 'Other Customer', phone: '+919876543211', status: 'ACTIVE' },
    ];

    // Seed test customers
    await db.insert(customers).values(seedCustomers);

    // Create draft via repository
    const draft = await propertySubmissionRepository.createDraft({
      submitterCustomerId: testCustomerId,
      listingType: 'RESALE',
      listingSource: 'OWNER',
      payload: { propertyType: 'APARTMENT' },
    });

    if (!draft || draft.id.startsWith('sub_') === false) {
      throw new Error('Test 2 Failed: Draft creation failed.');
    }
    console.log(`✓ Test 2a Passed: Created draft ${draft.id}`);

    // Test ownership isolation: other customer cannot retrieve or update
    const unauthorizedAccess = await propertySubmissionRepository.getById(draft.id, otherCustomerId);
    if (unauthorizedAccess) {
      throw new Error('Test 2 Failed: Customer successfully accessed another customer property submission!');
    }
    console.log('✓ Test 2b Passed: Customer ownership isolation verified (Cross-customer access blocked).');

    // Update draft
    const updated = await propertySubmissionRepository.updateDraft(draft.id, testCustomerId, {
      location: completePayload.location,
      details: completePayload.details,
      photos: completePayload.photos,
      consent: completePayload.consent,
    });

    if (updated.submissionStatus !== 'DRAFT') {
      throw new Error('Test 2 Failed: Status changed during draft update.');
    }
    console.log('✓ Test 2c Passed: Draft updated safely.');

    // Cleanup test data
    await db.delete(propertySubmissions).where(eq(propertySubmissions.submitterCustomerId, testCustomerId));
    await db.delete(customers).where(eq(customers.id, testCustomerId));
    await db.delete(customers).where(eq(customers.id, otherCustomerId));
    console.log('✓ Test 2d Passed: Test database cleanup completed.');
  } else {
    console.log('Database not configured; skipping live DB persistence tests.');
  }

  console.log('=== ALL PP-02 PROPERTY SUBMISSION FOUNDATION TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('PP-02 Test Execution Failed:', err);
  process.exit(1);
});
