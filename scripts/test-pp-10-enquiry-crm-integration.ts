import assert from 'node:assert/strict';
import { PropertySubmissionRepository } from '../src/domain/propertySubmission/repository.ts';
import { enquiryService, EnquiryValidationError } from '../src/domain/enquiry/services/enquiryService.ts';
import { enquiryRepository } from '../src/domain/enquiry/repositories/enquiryRepository.ts';
import { notificationService } from '../src/domain/customer/services/notificationService.ts';
import { notificationRepository } from '../src/domain/customer/repositories/index.ts';
import { hasCapability } from '../src/domain/auth/capabilityModel.ts';
import { resaleListingRepository } from '../src/domain/projects/repositories/resaleRepository.ts';
import { rentalListingRepository } from '../src/domain/projects/repositories/rentalRepository.ts';
import { siteVisitRepository } from '../src/infrastructure/repositories/postgres/siteVisitRepositoryPostgres.ts';

(process.env as any).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';
resaleListingRepository.enableTestMemoryPersistence(true);
rentalListingRepository.enableTestMemoryPersistence(true);
enquiryRepository.enableTestMemoryPersistence(true);
siteVisitRepository.enableTestMemoryPersistence(true);

async function runPP10Tests() {
  console.log('=============================================================');
  console.log('=== GREAT HOMES V2 — PP-10 ENQUIRY & CRM INTEGRATION TEST ===');
  console.log('=============================================================');

  const subRepo = PropertySubmissionRepository.createForTesting();
  const staffAdmin = 'staff_admin_pp10';
  const staffRole = 'ADMIN';

  await subRepo.setMemoryPartnerProfileForTesting('cust_partner_resale', 'ACTIVE');
  await subRepo.setMemoryPartnerProfileForTesting('cust_partner_rental', 'ACTIVE');

  // --------------------------------------------------------------------------
  // SCENARIO 1: Setup Verified Submissions (Owner Resale, Owner Rental, Partner Resale, Partner Rental)
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 1] Setting up published test listings for PP-10...');

  // 1A: Owner-submitted Resale
  const subOwnerResale = await subRepo.createDraft({
    submitterCustomerId: 'cust_owner_resale',
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: {
      listingPurpose: 'RESALE',
      propertyType: 'APARTMENT',
      askingPrice: 8500000,
      bedroomCount: 3,
      configuration: '3 BHK',
      submitterName: 'Rohan Sharma',
      submitterPhone: '9876543210',
      submitterEmail: 'rohan.sharma@example.com',
      description: 'Luxury South Kolkata resale apartment with open balcony.',
      details: {
        askingPrice: 8500000,
        bedroomCount: 3,
        carpetArea: 1350,
        superBuiltUpArea: 1650,
      },
    },
  });
  for (let i = 1; i <= 3; i++) {
    await subRepo.addSubmissionMediaWithAtomicCap(subOwnerResale.id, 'cust_owner_resale', {
      id: `med_resale_${i}`,
      filename: `photo_${i}.jpg`,
      mimeType: 'image/jpeg',
      category: 'HALL',
      storageProvider: 's3',
      storageKey: `key_resale_${i}`,
      url: `https://example.com/resale_${i}.jpg`,
      originalUrl: `https://example.com/resale_${i}.jpg`,
      width: 1920,
      height: 1080,
      fileSizeBytes: 2048,
      watermarkApplied: true,
    });
  }
  await subRepo.submitForReview(subOwnerResale.id, 'cust_owner_resale', subOwnerResale.payload as any);
  await subRepo.approveSubmission(subOwnerResale.id, staffAdmin, staffRole, { internalNote: 'Verified documents.', contactConfirmed: true });
  const pubOwnerResale = await subRepo.publishSubmission(subOwnerResale.id, staffAdmin, staffRole);
  const ownerResaleListingId = pubOwnerResale.listingId!;
  console.log(`✓ Published Owner Resale Listing: ${ownerResaleListingId}`);

  // 1B: Owner-submitted Rental
  const subOwnerRental = await subRepo.createDraft({
    submitterCustomerId: 'cust_owner_rental',
    listingType: 'RENTAL',
    listingSource: 'OWNER',
    payload: {
      listingPurpose: 'RENTAL',
      propertyType: 'APARTMENT',
      monthlyRent: 45000,
      bedroomCount: 2,
      configuration: '2 BHK',
      submitterName: 'Priya Mukherjee',
      submitterPhone: '9830012345',
      submitterEmail: 'priya.m@example.com',
      description: 'Fully furnished 2 BHK for rent in Salt Lake Sector V.',
      details: {
        monthlyRent: 45000,
        bedroomCount: 2,
        carpetArea: 950,
        superBuiltUpArea: 1200,
      },
    },
  });
  for (let i = 1; i <= 3; i++) {
    await subRepo.addSubmissionMediaWithAtomicCap(subOwnerRental.id, 'cust_owner_rental', {
      id: `med_rent_${i}`,
      filename: `photo_r_${i}.jpg`,
      mimeType: 'image/jpeg',
      category: 'LIVING_ROOM',
      storageProvider: 's3',
      storageKey: `key_rent_${i}`,
      url: `https://example.com/rent_${i}.jpg`,
      originalUrl: `https://example.com/rent_${i}.jpg`,
      width: 1920,
      height: 1080,
      fileSizeBytes: 2048,
      watermarkApplied: true,
    });
  }
  await subRepo.submitForReview(subOwnerRental.id, 'cust_owner_rental', subOwnerRental.payload as any);
  await subRepo.approveSubmission(subOwnerRental.id, staffAdmin, staffRole, { internalNote: 'Owner verified.', contactConfirmed: true });
  const pubOwnerRental = await subRepo.publishSubmission(subOwnerRental.id, staffAdmin, staffRole);
  const ownerRentalListingId = pubOwnerRental.listingId!;
  console.log(`✓ Published Owner Rental Listing: ${ownerRentalListingId}`);

  // 1C: Partner-submitted Resale
  const subPartnerResale = await subRepo.createDraft({
    submitterCustomerId: 'cust_partner_resale',
    listingType: 'RESALE',
    listingSource: 'PARTNER',
    payload: {
      listingPurpose: 'RESALE',
      propertyType: 'APARTMENT',
      askingPrice: 12000000,
      bedroomCount: 4,
      configuration: '4 BHK',
      submitterName: 'Great Realty Partners',
      submitterPhone: '9831198311',
      submitterEmail: 'partner@greatrealty.in',
      description: 'Exclusive partner listing in New Town Action Area I.',
      details: {
        askingPrice: 12000000,
        bedroomCount: 4,
        carpetArea: 1850,
        superBuiltUpArea: 2250,
      },
    },
  });
  for (let i = 1; i <= 3; i++) {
    await subRepo.addSubmissionMediaWithAtomicCap(subPartnerResale.id, 'cust_partner_resale', {
      id: `med_presale_${i}`,
      filename: `photo_pr_${i}.jpg`,
      mimeType: 'image/jpeg',
      category: 'BALCONY',
      storageProvider: 's3',
      storageKey: `key_presale_${i}`,
      url: `https://example.com/presale_${i}.jpg`,
      originalUrl: `https://example.com/presale_${i}.jpg`,
      width: 1920,
      height: 1080,
      fileSizeBytes: 2048,
      watermarkApplied: true,
    });
  }
  await subRepo.submitForReview(subPartnerResale.id, 'cust_partner_resale', subPartnerResale.payload as any);
  await subRepo.approveSubmission(subPartnerResale.id, staffAdmin, staffRole, { internalNote: 'Partner mandate verified.', contactConfirmed: true });
  const pubPartnerResale = await subRepo.publishSubmission(subPartnerResale.id, staffAdmin, staffRole);
  const partnerResaleListingId = pubPartnerResale.listingId!;
  console.log(`✓ Published Partner Resale Listing: ${partnerResaleListingId}`);

  // 1D: Partner-submitted Rental
  const subPartnerRental = await subRepo.createDraft({
    submitterCustomerId: 'cust_partner_rental',
    listingType: 'RENTAL',
    listingSource: 'PARTNER',
    payload: {
      listingPurpose: 'RENTAL',
      propertyType: 'APARTMENT',
      monthlyRent: 35000,
      bedroomCount: 2,
      configuration: '2 BHK',
      submitterName: 'Great Realty Partners',
      submitterPhone: '9831198311',
      submitterEmail: 'partner@greatrealty.in',
      description: 'Partner managed rental near Rajarhat.',
      details: {
        monthlyRent: 35000,
        bedroomCount: 2,
        carpetArea: 900,
        superBuiltUpArea: 1150,
      },
    },
  });
  for (let i = 1; i <= 3; i++) {
    await subRepo.addSubmissionMediaWithAtomicCap(subPartnerRental.id, 'cust_partner_rental', {
      id: `med_prent_${i}`,
      filename: `photo_prent_${i}.jpg`,
      mimeType: 'image/jpeg',
      category: 'BEDROOM',
      storageProvider: 's3',
      storageKey: `key_prent_${i}`,
      url: `https://example.com/prent_${i}.jpg`,
      originalUrl: `https://example.com/prent_${i}.jpg`,
      width: 1920,
      height: 1080,
      fileSizeBytes: 2048,
      watermarkApplied: true,
    });
  }
  await subRepo.submitForReview(subPartnerRental.id, 'cust_partner_rental', subPartnerRental.payload as any);
  await subRepo.approveSubmission(subPartnerRental.id, staffAdmin, staffRole, { internalNote: 'Partner rental verified.', contactConfirmed: true });
  const pubPartnerRental = await subRepo.publishSubmission(subPartnerRental.id, staffAdmin, staffRole);
  const partnerRentalListingId = pubPartnerRental.listingId!;
  console.log(`✓ Published Partner Rental Listing: ${partnerRentalListingId}`);

  // --------------------------------------------------------------------------
  // SCENARIO 2: Public Enquiry on Published Owner Resale Property
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 2] Testing public enquiry on published Owner Resale property...');
  const enq1Res = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Amitabh Sen',
    phone: '9830099999',
    email: 'amitabh.sen@example.com',
    message: 'I am interested in scheduling an inspection this Saturday.',
    source: 'WEB_PORTAL',
    sourcePage: `/resale/${ownerResaleListingId}`,
  });

  assert.equal(enq1Res.success, true);
  assert.ok(enq1Res.enquiryId);
  assert.match(enq1Res.referenceNumber, /^GH-ENQ-\d+$/);

  const enq1Entity = await enquiryRepository.findById(enq1Res.enquiryId);
  assert.ok(enq1Entity);
  assert.equal(enq1Entity.contextType, 'RESALE');
  assert.equal(enq1Entity.listingId, ownerResaleListingId);
  assert.equal(enq1Entity.buyerName, 'Amitabh Sen');
  assert.equal(enq1Entity.buyerPhone, '+919830099999');
  assert.equal(enq1Entity.status, 'NEW');
  assert.equal(enq1Entity.priority, 'NORMAL');
  assert.equal(enq1Entity.metadata?.listingSource, 'OWNER_SUBMITTED_PROPERTY');
  assert.equal(enq1Entity.metadata?.listingPartyType, 'OWNER');
  console.log(`✓ Owner Resale Enquiry created: ${enq1Entity.id} (Ref: ${enq1Res.referenceNumber})`);

  // --------------------------------------------------------------------------
  // SCENARIO 3: Public Enquiry on Published Owner Rental Property
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 3] Testing public enquiry on published Owner Rental property...');
  const enq2Res = await enquiryService.submitEnquiry({
    contextType: 'RENTAL',
    listingId: ownerRentalListingId,
    name: 'Sunita Das',
    phone: '+91 98311 22334',
    email: 'sunita.das@example.com',
    message: 'What is the security deposit and move-in date?',
    source: 'WEB_PORTAL',
  });

  assert.equal(enq2Res.success, true);
  const enq2Entity = await enquiryRepository.findById(enq2Res.enquiryId);
  assert.ok(enq2Entity);
  assert.equal(enq2Entity.contextType, 'RENTAL');
  assert.equal(enq2Entity.listingId, ownerRentalListingId);
  assert.equal(enq2Entity.buyerPhone, '+919831122334');
  assert.match(enq2Entity.priceDisplay || '', /month/i);
  assert.equal(enq2Entity.metadata?.listingSource, 'OWNER_SUBMITTED_PROPERTY');
  assert.equal(enq2Entity.metadata?.listingPartyType, 'OWNER');
  console.log(`✓ Owner Rental Enquiry created: ${enq2Entity.id} with monthly pricing`);

  // --------------------------------------------------------------------------
  // SCENARIO 4: Public Enquiry on Published Partner Resale Property
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 4] Testing public enquiry on published Partner Resale property...');
  const enq3Res = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: partnerResaleListingId,
    name: 'Debashis Roy',
    phone: '09832233445',
    email: 'debashis.roy@example.com',
    source: 'WEB_PORTAL',
  });

  assert.equal(enq3Res.success, true);
  const enq3Entity = await enquiryRepository.findById(enq3Res.enquiryId);
  assert.ok(enq3Entity);
  assert.equal(enq3Entity.contextType, 'RESALE');
  assert.equal(enq3Entity.listingId, partnerResaleListingId);
  assert.equal(enq3Entity.buyerPhone, '+919832233445');
  assert.equal(enq3Entity.metadata?.listingSource, 'PARTNER_SUBMITTED_PROPERTY');
  assert.equal(enq3Entity.metadata?.listingPartyType, 'PARTNER');
  console.log(`✓ Partner Resale Enquiry created: ${enq3Entity.id} with PARTNER attribution`);

  // --------------------------------------------------------------------------
  // SCENARIO 5: Public Enquiry on Published Partner Rental Property
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 5] Testing public enquiry on published Partner Rental property...');
  const enq4Res = await enquiryService.submitEnquiry({
    contextType: 'RENTAL',
    listingId: partnerRentalListingId,
    name: 'Kavita Ghosh',
    phone: '9833344556',
    email: 'kavita.ghosh@example.com',
    source: 'WEB_PORTAL',
  });

  assert.equal(enq4Res.success, true);
  const enq4Entity = await enquiryRepository.findById(enq4Res.enquiryId);
  assert.ok(enq4Entity);
  assert.equal(enq4Entity.contextType, 'RENTAL');
  assert.equal(enq4Entity.listingId, partnerRentalListingId);
  assert.equal(enq4Entity.metadata?.listingSource, 'PARTNER_SUBMITTED_PROPERTY');
  assert.equal(enq4Entity.metadata?.listingPartyType, 'PARTNER');
  console.log(`✓ Partner Rental Enquiry created: ${enq4Entity.id} with PARTNER attribution`);

  // --------------------------------------------------------------------------
  // SCENARIO 6: Message Handling (Omitted vs Provided)
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 6] Testing optional buyer message handling...');
  const enqNoMsg = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Arup Pal',
    phone: '9834455667',
  });
  const entityNoMsg = await enquiryRepository.findById(enqNoMsg.enquiryId);
  assert.equal(entityNoMsg?.message, null);
  console.log('✓ Omitted message successfully handled as null.');

  // --------------------------------------------------------------------------
  // SCENARIO 7: Phone Normalization and Validation
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 7] Testing phone normalization & validation...');
  assert.equal(enquiryService.normalizePhone('9876543210'), '+919876543210');
  assert.equal(enquiryService.normalizePhone('+91 98765 43210'), '+919876543210');
  assert.equal(enquiryService.normalizePhone('09876543210'), '+919876543210');
  assert.equal(enquiryService.normalizePhone('91-98765-43210'), '+919876543210');

  await assert.rejects(
    async () => enquiryService.submitEnquiry({
      contextType: 'RESALE',
      listingId: ownerResaleListingId,
      name: 'Invalid Phone Tester',
      phone: '12345',
    }),
    (err: any) => err instanceof EnquiryValidationError && /10-digit mobile number/.test(err.message)
  );

  await assert.rejects(
    async () => enquiryService.submitEnquiry({
      contextType: 'RESALE',
      listingId: ownerResaleListingId,
      name: 'Alpha Phone Tester',
      phone: 'abcdefghij',
    }),
    (err: any) => err instanceof EnquiryValidationError
  );
  console.log('✓ Phone normalization and rejection of invalid numbers passed.');

  // --------------------------------------------------------------------------
  // SCENARIO 8: Property Reference & Availability Validation
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 8] Testing rejection of enquiry on invalid / unavailable properties...');
  // Non-existent listing
  await assert.rejects(
    async () => enquiryService.submitEnquiry({
      contextType: 'RESALE',
      listingId: 'non_existent_resale_listing_xyz',
      name: 'Missing Property Tester',
      phone: '9835566778',
    }),
    (err: any) => err instanceof EnquiryValidationError && /not available for enquiry/.test(err.message)
  );

  // Unpublished (Draft) listing: create a draft and try to enquire
  const draftSub = await subRepo.createDraft({
    submitterCustomerId: 'cust_draft_only',
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: {
      listingPurpose: 'RESALE',
      propertyType: 'APARTMENT',
      askingPrice: 5000000,
      bedroomCount: 2,
    },
  });
  await assert.rejects(
    async () => enquiryService.submitEnquiry({
      contextType: 'RESALE',
      listingId: draftSub.id,
      name: 'Draft Enquirer',
      phone: '9836677889',
    }),
    (err: any) => err instanceof EnquiryValidationError
  );

  // Deactivated listing
  console.log('Deactivating Owner Resale listing...');
  await subRepo.deactivateListing(subOwnerResale.id, staffAdmin, staffRole, 'Temporary pause for owner travel');
  const deactivatedListing = await resaleListingRepository.findById(ownerResaleListingId);
  assert.equal(deactivatedListing?.lifecycleStatus, 'PAUSED');

  await assert.rejects(
    async () => enquiryService.submitEnquiry({
      contextType: 'RESALE',
      listingId: ownerResaleListingId,
      name: 'Deactivated Enquirer',
      phone: '9837788990',
    }),
    (err: any) => err instanceof EnquiryValidationError && /not available for enquiry/.test(err.message)
  );
  console.log('✓ Enquiries on unpublished and deactivated listings are strictly rejected.');

  // Reactivate listing
  console.log('Reactivating Owner Resale listing...');
  await subRepo.reactivateListing(subOwnerResale.id, staffAdmin, staffRole);
  const reactivatedListing = await resaleListingRepository.findById(ownerResaleListingId);
  assert.equal(reactivatedListing?.lifecycleStatus, 'PUBLISHED');

  const enqReactivated = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Reactivated Enquirer',
    phone: '9837788990',
  });
  assert.equal(enqReactivated.success, true);
  console.log('✓ Enquiry succeeds immediately after reactivation.');

  // --------------------------------------------------------------------------
  // SCENARIO 9: Customer Identity Verification & Anti-Spoofing
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 9] Testing customer identity verification...');
  // Authenticated customer
  const authCustomerEnq = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Verified Customer',
    phone: '9838899001',
    customerId: 'cust_real_session_789',
  });
  const authEntity = await enquiryRepository.findById(authCustomerEnq.enquiryId);
  assert.equal(authEntity?.customerId, 'cust_real_session_789');

  // Customer querying their own enquiries
  const customerList = await enquiryService.getCustomerEnquiries('cust_real_session_789');
  assert.equal(customerList.length, 1);
  assert.equal(customerList[0].id, authCustomerEnq.enquiryId);

  // Customer cannot see other customers' enquiries
  const otherCustomerList = await enquiryService.getCustomerEnquiries('cust_stranger_999');
  assert.equal(otherCustomerList.length, 0);
  console.log('✓ Customer identity verification and scoped self-service confirmed.');

  // --------------------------------------------------------------------------
  // SCENARIO 10: Deduplication Logic (30-second window)
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 10] Testing deduplication within 30-second window...');
  const dupPhone = '9839900112';
  const firstSubmission = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Dedupe Tester',
    phone: dupPhone,
  });

  // Second submission for EXACT same listing within 30 seconds
  const secondSubmission = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Dedupe Tester Again',
    phone: dupPhone,
  });

  assert.equal(secondSubmission.enquiryId, firstSubmission.enquiryId);
  assert.equal(secondSubmission.referenceNumber, firstSubmission.referenceNumber);
  assert.match(secondSubmission.message, /already been received/i);

  // But an enquiry by the SAME phone for a DIFFERENT listing must be allowed
  const differentListingEnq = await enquiryService.submitEnquiry({
    contextType: 'RENTAL',
    listingId: ownerRentalListingId,
    name: 'Dedupe Tester Cross Property',
    phone: dupPhone,
  });

  assert.notEqual(differentListingEnq.enquiryId, firstSubmission.enquiryId);
  console.log('✓ Duplicate submission prevented for same property; separate property enquiry allowed.');

  // --------------------------------------------------------------------------
  // SCENARIO 11: Privacy Controls (No Private Phone/Email Leaks)
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 11] Testing privacy controls (Zero PII leakage)...');
  // Response returned to client
  assert.equal((authCustomerEnq as any).ownerPhone, undefined);
  assert.equal((authCustomerEnq as any).ownerEmail, undefined);
  assert.equal((authCustomerEnq as any).submitterPhone, undefined);
  assert.equal((authCustomerEnq as any).submitterEmail, undefined);

  // Enquiry entity
  assert.equal((authEntity as any).ownerPhone, undefined);
  assert.equal((authEntity as any).ownerEmail, undefined);
  assert.equal(authEntity?.metadata?.ownerPhone, undefined);
  assert.equal(authEntity?.metadata?.ownerEmail, undefined);
  assert.equal(authEntity?.metadata?.internalNote, undefined);
  assert.equal(authEntity?.metadata?.internalNotes, undefined);
  console.log('✓ Submitter/Owner private contact details and internal notes strictly protected.');

  // --------------------------------------------------------------------------
  // SCENARIO 12: In-App Customer Notification Hook
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 12] Testing non-blocking transactional notification hook...');
  const notifCustomerId = 'cust_notif_target_456';
  const notifEnqRes = await enquiryService.submitEnquiry({
    contextType: 'RESALE',
    listingId: ownerResaleListingId,
    name: 'Notification Tester',
    phone: '9840011223',
    customerId: notifCustomerId,
  });

  const customerNotifs = await notificationRepository.listByCustomer(notifCustomerId);
  assert.ok(customerNotifs.length > 0);
  const enquiryNotif = customerNotifs.find((n) => n.metadata?.enquiryId === notifEnqRes.enquiryId);
  assert.ok(enquiryNotif);
  assert.equal(enquiryNotif?.title, 'Enquiry Received');
  assert.match(enquiryNotif?.message || '', new RegExp(notifEnqRes.referenceNumber));
  console.log(`✓ Customer in-app notification successfully triggered: ${enquiryNotif?.id}`);

  // --------------------------------------------------------------------------
  // SCENARIO 13: CRM Pipeline Stages and Transition Validation
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 13] Testing CRM lead pipeline progression...');
  const pipelineEnq = await enquiryRepository.findById(enq1Res.enquiryId);
  assert.ok(pipelineEnq);
  assert.equal(pipelineEnq.status, 'NEW');

  // Stage 1: NEW -> CONTACTED
  const step1 = await enquiryService.updateEnquiry(pipelineEnq.id, {
    status: 'CONTACTED',
    internalNotes: 'Contacted buyer on WhatsApp. Requested budget confirmation.',
  });
  assert.equal(step1.status, 'CONTACTED');
  assert.equal(step1.internalNotes, 'Contacted buyer on WhatsApp. Requested budget confirmation.');

  // Stage 2: CONTACTED -> QUALIFIED
  const step2 = await enquiryService.updateEnquiry(pipelineEnq.id, {
    status: 'QUALIFIED',
    priority: 'HIGH',
    assignedTo: 'staff_sales_01',
    assignedToName: 'Subir Banerjee (Senior Advisor)',
  });
  assert.equal(step2.status, 'QUALIFIED');
  assert.equal(step2.priority, 'HIGH');
  assert.equal(step2.assignedTo, 'staff_sales_01');

  // Stage 3: QUALIFIED -> SITE_VISIT_SCHEDULED
  const step3 = await enquiryService.updateEnquiry(pipelineEnq.id, {
    status: 'SITE_VISIT_SCHEDULED',
    requestSiteVisit: true,
  });
  assert.equal(step3.status, 'SITE_VISIT_SCHEDULED');

  // Stage 4: SITE_VISIT_SCHEDULED -> SITE_VISIT_COMPLETED
  const step4 = await enquiryService.updateEnquiry(pipelineEnq.id, {
    status: 'SITE_VISIT_COMPLETED',
  });
  assert.equal(step4.status, 'SITE_VISIT_COMPLETED');

  // Stage 5: SITE_VISIT_COMPLETED -> NEGOTIATION
  const step5 = await enquiryService.updateEnquiry(pipelineEnq.id, {
    status: 'NEGOTIATION',
    internalNotes: 'Buyer made an offer of 82 Lakhs. Owner reviewing.',
  });
  assert.equal(step5.status, 'NEGOTIATION');

  // Stage 6: NEGOTIATION -> CONVERTED
  const step6 = await enquiryService.updateEnquiry(pipelineEnq.id, {
    status: 'CONVERTED',
    internalNotes: 'Deal finalized at 83.5 Lakhs. Token received.',
  });
  assert.equal(step6.status, 'CONVERTED');

  // Invalid transition test: CONVERTED -> QUALIFIED is not permitted
  await assert.rejects(
    async () => enquiryService.updateEnquiry(pipelineEnq.id, { status: 'QUALIFIED' }),
    (err: any) => err instanceof EnquiryValidationError && /Invalid status transition/.test(err.message)
  );
  console.log('✓ CRM lead pipeline states and transition guards verified successfully.');

  // --------------------------------------------------------------------------
  // SCENARIO 14: CRM Metric Aggregation and KPI Buckets
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 14] Testing CRM KPI metric aggregation...');
  const metrics = await enquiryService.getMetrics();
  assert.ok(metrics.total >= 5);
  assert.ok(metrics.convertedCount >= 1);
  console.log(`✓ Total enquiries: ${metrics.total}, Converted: ${metrics.convertedCount}, New: ${metrics.newCount}`);

  // --------------------------------------------------------------------------
  // SCENARIO 15: Capability & RBAC Checks
  // --------------------------------------------------------------------------
  console.log('\n[Scenario 15] Testing RBAC authorization capabilities...');
  assert.ok(hasCapability('ADMIN', 'submission.approve'));
  assert.ok(hasCapability('ADMIN', 'submission.publish'));
  assert.ok(hasCapability('VERIFICATION_EXECUTIVE', 'submission.approve'));
  assert.ok(hasCapability('VERIFICATION_EXECUTIVE', 'submission.reject'));
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.publish'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.approve'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.reject'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.publish'), false);
  assert.equal(hasCapability('SALES_EXECUTIVE', 'submission.publish'), false);
  assert.equal(hasCapability('CUSTOMER' as any, 'submission.approve'), false);
  console.log('✓ Capability model enforces strict staff role boundaries.');

  console.log('\n=============================================================');
  console.log('=== ALL PP-10 ENQUIRY & CRM INTEGRATION TESTS PASSED 100% ===');
  console.log('=============================================================');
}

runPP10Tests().catch((err) => {
  console.error('\n❌ PP-10 test suite failed:', err);
  process.exit(1);
});
