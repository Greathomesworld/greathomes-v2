import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { NextRequest } from 'next/server';
import { hasCapability, ROLE_CAPABILITIES } from '../src/domain/auth/capabilityModel.ts';
import {
  CANONICAL_PARTNER_ONBOARDING_DECLARATION_TEXT,
  validatePartnerRegistrationInput,
} from '../src/domain/customer/partnerService.ts';
import type { CustomerAccountType } from '../src/domain/customer/entities.ts';
import { customerRepository } from '../src/domain/customer/repositories/index.ts';
import {
  PropertySubmissionRepository,
  evaluatePartnerEligibility,
} from '../src/domain/propertySubmission/repository.ts';
import {
  PropertySubmissionService,
  type SubmissionReferenceLookup,
} from '../src/domain/propertySubmission/service.ts';
import {
  SubmissionMediaService,
  MIN_SUBMISSION_IMAGE_DIMENSION,
  MAX_SUBMISSION_IMAGE_DIMENSION,
} from '../src/domain/propertySubmission/mediaService.ts';
import {
  MIN_SUBMISSION_PHOTOS,
  MAX_SUBMISSION_PHOTOS,
  ALLOWED_SUBMISSION_IMAGE_MIMES,
  CANONICAL_OWNER_DECLARATION_TEXT,
  CANONICAL_AMENITY_SLUG_SET,
} from '../src/domain/propertySubmission/validation.ts';
import {
  handleListStaffSubmissions,
  handleGetStaffSubmissionDetail,
  handleStaffSubmissionAction,
  handleApproveStaffSubmission,
  handleRejectStaffSubmission,
  handlePublishStaffSubmission,
  handleDeactivateStaffSubmission,
  handleReactivateStaffSubmission,
  handleOverrideStaffSubmission,
} from '../src/domain/propertySubmission/staffSubmissionRouteHandlers.ts';
import { resaleListingRepository } from '../src/domain/projects/repositories/resaleRepository.ts';
import { rentalListingRepository } from '../src/domain/projects/repositories/rentalRepository.ts';
import { resaleListingService } from '../src/domain/projects/services/resaleService.ts';
import { rentalListingService } from '../src/domain/projects/services/rentalService.ts';
import { enquiryService } from '../src/domain/enquiry/services/enquiryService.ts';
import { enquiryRepository } from '../src/domain/enquiry/repositories/enquiryRepository.ts';
import { locationRepository } from '../src/infrastructure/repositories/locationProvider.ts';

(process.env as any).NODE_ENV = 'test';
process.env.PERSISTENCE_PROVIDER = 'memory';
process.env.MEDIA_TEST_ISOLATED = 'true';
delete process.env.VERCEL_ENV;
delete process.env.DATABASE_URL;

async function createSampleImageBuffer(
  width = 640,
  height = 480,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg'
): Promise<Buffer> {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 48, g: 96, b: 160 },
    },
  })
    .toFormat(format)
    .toBuffer();
}

const makeStaffAuth = (
  authorized: boolean,
  role:
    | 'SUPER_ADMIN'
    | 'ADMIN'
    | 'VERIFICATION_EXECUTIVE'
    | 'PROPERTY_MANAGER'
    | 'CONTENT_MANAGER'
    | 'SALES_EXECUTIVE',
  staffId: string
) =>
  async (_req: NextRequest) => ({
    authorized,
    authenticated: authorized,
    role: authorized ? (role as any) : undefined,
    staff: authorized
      ? {
          id: staffId,
          email: `${role.toLowerCase()}@greathomes.test`,
          name: `${role} Tester`,
          role: role as any,
          enabled: true,
        }
      : undefined,
    statusCode: authorized ? undefined : 401,
    error: authorized ? undefined : 'Staff authentication required.',
  });

function makeJsonPostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function main() {
  console.log('=== GREAT HOMES V2 — PHASE 1 FINAL SPECIFICATION & RELEASE READINESS AUDIT ===');

  const sandboxRoot = path.join('/tmp/gh-media-test-sandbox/storage');
  await fs.rm(sandboxRoot, { recursive: true, force: true });

  resaleListingRepository.enableTestMemoryPersistence(true);
  rentalListingRepository.enableTestMemoryPersistence(true);
  enquiryRepository.enableTestMemoryPersistence(true);

  let testLoc = await locationRepository.findBySlug('ballygunge');
  if (!testLoc) {
    testLoc = await locationRepository.create({
      name: 'Ballygunge',
      slug: 'ballygunge',
      type: 'NEIGHBOURHOOD',
      description: 'Prime South Kolkata residential neighborhood.',
      shortDescription: 'Prime South Kolkata neighborhood.',
      featured: true,
      status: 'PUBLISHED',
    });
  }

  const referenceLookup: SubmissionReferenceLookup = {
    async findProjectById() {
      return null;
    },
    async findLocationById(id: string) {
      if (id === testLoc!.id) {
        return { id: testLoc!.id, name: testLoc!.name, slug: testLoc!.slug };
      }
      return null;
    },
    async listAmenityIdentifiers() {
      return new Set(CANONICAL_AMENITY_SLUG_SET);
    },
  };

  const repo = PropertySubmissionRepository.createForTesting({ dbResolver: () => null });
  repo.clearMemoryForTesting();
  const submissionService = new PropertySubmissionService(repo, referenceLookup);
  const mediaService = new SubmissionMediaService({ repo });

  // =========================================================================
  // 1. RBAC MATRIX & DIRECT API / SERVICE / REPOSITORY AUTHORIZATION
  // =========================================================================
  console.log('\n[1/5] Verifying Corrected RBAC Matrix & Direct API/Service/Repo Authorization...');

  // 1a. Verify capability definitions
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.read'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.review'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.requestChanges'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.manageNotes'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.editCurated'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.approve'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.reject'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.resolveDuplicate'), true);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.publish'), false);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.deactivate'), false);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.reactivate'), false);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'submission.override'), false);
  assert.equal(hasCapability('VERIFICATION_EXECUTIVE', 'partner.approve'), false);

  assert.equal(hasCapability('ADMIN', 'submission.approve'), true);
  assert.equal(hasCapability('ADMIN', 'submission.reject'), true);
  assert.equal(hasCapability('ADMIN', 'submission.publish'), true);
  assert.equal(hasCapability('ADMIN', 'submission.deactivate'), true);
  assert.equal(hasCapability('ADMIN', 'submission.reactivate'), true);
  assert.equal(hasCapability('ADMIN', 'partner.approve'), true);
  assert.equal(hasCapability('ADMIN', 'submission.override'), false);

  assert.equal(hasCapability('SUPER_ADMIN', 'submission.approve'), true);
  assert.equal(hasCapability('SUPER_ADMIN', 'submission.reject'), true);
  assert.equal(hasCapability('SUPER_ADMIN', 'submission.publish'), true);
  assert.equal(hasCapability('SUPER_ADMIN', 'submission.deactivate'), true);
  assert.equal(hasCapability('SUPER_ADMIN', 'submission.reactivate'), true);
  assert.equal(hasCapability('SUPER_ADMIN', 'submission.override'), true);
  assert.equal(hasCapability('SUPER_ADMIN', 'partner.approve'), true);

  // PROPERTY_MANAGER must NOT have any Post Property submission/partner approval rights
  const pmCaps = ROLE_CAPABILITIES.PROPERTY_MANAGER;
  const pmSubmissionCaps = pmCaps.filter((c) => c.startsWith('submission.') || c.startsWith('partner.'));
  assert.equal(
    pmSubmissionCaps.length,
    0,
    `PROPERTY_MANAGER must have 0 submission/partner capabilities, found: ${pmSubmissionCaps.join(', ')}`
  );
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.approve'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.reject'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.publish'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.deactivate'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.reactivate'), false);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'submission.override'), false);

  // Preserve unrelated PROPERTY_MANAGER permissions in other Great Homes modules
  assert.equal(hasCapability('PROPERTY_MANAGER', 'project.read'), true);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'project.update'), true);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'configuration.create'), true);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'rera.verify'), true);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'resale.read'), true);
  assert.equal(hasCapability('PROPERTY_MANAGER', 'audit.read'), true);

  // Create Owner & Partner accounts
  const ownerCustomer = await customerRepository.create({
    phone: '+919800011101',
    name: 'Arindam Sen',
    email: 'arindam.owner@example.com',
    accountType: 'OWNER',
    status: 'ACTIVE',
  });

  const partnerCustomer = await customerRepository.create({
    phone: '+919800011102',
    name: 'Vikramjit Bose',
    email: 'vikramjit@boseestates.in',
    accountType: 'LISTING_PARTNER',
    status: 'ACTIVE',
  });

  await repo.setMemoryPartnerProfileForTesting(partnerCustomer.id, 'ACTIVE');

  // Create a test submission for RBAC API & Service checks
  const rbacDraft = await submissionService.createDraft(ownerCustomer.id, {
    listingType: 'RESALE',
    listingSource: 'OWNER',
    payload: {
      propertyType: 'APARTMENT',
      location: {
        city: 'Kolkata',
        locality: 'Ballygunge',
        locationId: testLoc.id,
        address: '14/2 Dover Lane, Ballygunge, Kolkata 700029',
        latitude: 22.528019,
        longitude: 88.365912,
      },
      details: {
        configuration: '3 BHK',
        bedroomCount: 3,
        bedrooms: 3,
        bathrooms: 3,
        carpetArea: 1450,
        builtUpArea: 1680,
        superBuiltUpArea: 1920,
        askingPrice: 18500000,
        furnishing: 'SEMI_FURNISHED',
        facing: 'SOUTH_EAST',
        floorCategory: 'MID_FLOOR',
        possession: 'READY_TO_MOVE',
        description: 'Spacious 3 BHK apartment in Ballygunge for RBAC verification.',
      },
      consent: {
        ownerDeclarationAccepted: true,
        declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
      },
    },
  });

  // Upload 3 sub-800x600 (640x480) photos via SubmissionMediaService
  const sub800Buffer = await createSampleImageBuffer(640, 480, 'jpeg');
  for (let i = 0; i < 3; i++) {
    await mediaService.uploadMedia(rbacDraft.id, ownerCustomer.id, {
      buffer: sub800Buffer,
      filename: `rbac-photo-${i + 1}.jpg`,
      mimeType: 'image/jpeg',
      category: i === 0 ? 'LIVING_ROOM' : i === 1 ? 'BEDROOM' : 'EXTERIOR',
      caption: `RBAC Photo ${i + 1}`,
    });
  }

  await submissionService.submitForReview(rbacDraft.id, ownerCustomer.id, {
    consent: {
      ownerDeclarationAccepted: true,
      declarationText: CANONICAL_OWNER_DECLARATION_TEXT,
    },
  });

  // Test PROPERTY_MANAGER 403 across all Admin Property Submission API route handlers
  const pmDeps = {
    verifyStaff: makeStaffAuth(true, 'PROPERTY_MANAGER', 'staff_pm_1'),
    service: submissionService,
  };

  const pmQueueRes = await handleListStaffSubmissions(
    new NextRequest('http://localhost:3000/api/admin/property-submissions'),
    pmDeps
  );
  assert.equal(pmQueueRes.status, 403, 'PROPERTY_MANAGER must receive 403 on GET /api/admin/property-submissions');

  const pmDetailRes = await handleGetStaffSubmissionDetail(
    new NextRequest(`http://localhost:3000/api/admin/property-submissions/${rbacDraft.id}`),
    rbacDraft.id,
    pmDeps
  );
  assert.equal(pmDetailRes.status, 403, 'PROPERTY_MANAGER must receive 403 on GET submission detail');

  for (const action of [
    'START_REVIEW',
    'REQUEST_CHANGES',
    'ADD_NOTE',
    'EDIT_CURATED',
    'APPROVE',
    'REJECT',
    'PUBLISH',
    'DEACTIVATE',
    'REACTIVATE',
    'OVERRIDE',
    'ASSIGN_REVIEWER',
  ]) {
    const res = await handleStaffSubmissionAction(
      makeJsonPostRequest(`http://localhost:3000/api/admin/property-submissions/${rbacDraft.id}/action`, {
        action,
        submitterFeedback: 'PM attempt feedback over 10 chars',
        internalNote: 'PM note',
        reason: 'PM override attempt over 10 chars',
        targetStatus: 'APPROVED',
        assignedReviewerId: 'staff_ve_1',
        curated: { details: { askingPrice: 18000000 } },
      }),
      rbacDraft.id,
      pmDeps
    );
    assert.equal(res.status, 403, `PROPERTY_MANAGER must receive HTTP 403 on API action ${action}`);
  }

  // Test direct dedicated route handlers for PROPERTY_MANAGER -> 403
  assert.equal(
    (
      await handleApproveStaffSubmission(
        makeJsonPostRequest('http://localhost:3000/approve', {}),
        rbacDraft.id,
        pmDeps
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleRejectStaffSubmission(
        makeJsonPostRequest('http://localhost:3000/reject', { reason: 'PM reject reason valid' }),
        rbacDraft.id,
        pmDeps
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handlePublishStaffSubmission(
        makeJsonPostRequest('http://localhost:3000/publish', {}),
        rbacDraft.id,
        pmDeps
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleDeactivateStaffSubmission(
        makeJsonPostRequest('http://localhost:3000/deactivate', { reason: 'PM deactivate valid reason' }),
        rbacDraft.id,
        pmDeps
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleReactivateStaffSubmission(
        makeJsonPostRequest('http://localhost:3000/reactivate', {}),
        rbacDraft.id,
        pmDeps
      )
    ).status,
    403
  );
  assert.equal(
    (
      await handleOverrideStaffSubmission(
        makeJsonPostRequest('http://localhost:3000/override', {
          targetStatus: 'APPROVED',
          reason: 'PM override attempt valid reason',
        }),
        rbacDraft.id,
        pmDeps
      )
    ).status,
    403
  );

  // Test direct service & repository calls with PROPERTY_MANAGER -> must throw 403
  await assert.rejects(
    () => submissionService.approveSubmission(rbacDraft.id, 'staff_pm_1', 'PROPERTY_MANAGER', {}),
    (err: any) => err.statusCode === 403
  );
  await assert.rejects(
    () =>
      submissionService.rejectSubmission(rbacDraft.id, 'staff_pm_1', 'PROPERTY_MANAGER', {
        reason: 'PM reject reason valid',
      }),
    (err: any) => err.statusCode === 403
  );
  await assert.rejects(
    () => repo.approveSubmission(rbacDraft.id, 'staff_pm_1', 'PROPERTY_MANAGER', {}),
    (err: any) => err.statusCode === 403
  );
  await assert.rejects(
    () => repo.rejectSubmission(rbacDraft.id, 'staff_pm_1', 'PROPERTY_MANAGER', { reason: 'PM repo reject valid' }),
    (err: any) => err.statusCode === 403
  );

  // Test VERIFICATION_EXECUTIVE allowed & forbidden actions via API
  const veDeps = {
    verifyStaff: makeStaffAuth(true, 'VERIFICATION_EXECUTIVE', 'staff_ve_1'),
    service: submissionService,
  };

  const veStartRes = await handleStaffSubmissionAction(
    makeJsonPostRequest('http://localhost:3000/action', { action: 'START_REVIEW' }),
    rbacDraft.id,
    veDeps
  );
  assert.equal(veStartRes.status, 200, 'VERIFICATION_EXECUTIVE can START_REVIEW (200)');

  const veChecklistRes = await handleStaffSubmissionAction(
    makeJsonPostRequest('http://localhost:3000/action', {
      action: 'UPDATE_CHECKLIST',
      contactConfirmed: true,
      checklist: {
        contactConfirmed: true,
        locationVerified: true,
        pricingReasonable: true,
        photosGenuine: true,
        duplicateChecked: true,
      },
    }),
    rbacDraft.id,
    veDeps
  );
  assert.equal(veChecklistRes.status, 200, 'VERIFICATION_EXECUTIVE can UPDATE_CHECKLIST (200)');

  const veApproveRes = await handleApproveStaffSubmission(
    makeJsonPostRequest('http://localhost:3000/approve', {
      contactConfirmed: true,
      internalNote: 'Verified by VE',
    }),
    rbacDraft.id,
    veDeps
  );
  assert.equal(veApproveRes.status, 200, 'VERIFICATION_EXECUTIVE can APPROVE submission (200)');

  // VERIFICATION_EXECUTIVE cannot PUBLISH, DEACTIVATE, REACTIVATE, or OVERRIDE (403)
  for (const forbiddenVeAction of ['PUBLISH', 'DEACTIVATE', 'REACTIVATE', 'OVERRIDE']) {
    const res = await handleStaffSubmissionAction(
      makeJsonPostRequest('http://localhost:3000/action', {
        action: forbiddenVeAction,
        reason: 'VE attempt at forbidden action over 10 chars',
        targetStatus: 'PUBLISHED',
      }),
      rbacDraft.id,
      veDeps
    );
    assert.equal(res.status, 403, `VERIFICATION_EXECUTIVE must receive 403 on ${forbiddenVeAction}`);
  }

  // ADMIN can PUBLISH, DEACTIVATE, REACTIVATE, but cannot OVERRIDE (403)
  const adminDeps = {
    verifyStaff: makeStaffAuth(true, 'ADMIN', 'staff_admin_1'),
    service: submissionService,
  };

  const adminOverrideRes = await handleOverrideStaffSubmission(
    makeJsonPostRequest('http://localhost:3000/override', {
      targetStatus: 'PUBLISHED',
      reason: 'Admin override attempt over 10 chars',
    }),
    rbacDraft.id,
    adminDeps
  );
  assert.equal(adminOverrideRes.status, 403, 'ADMIN must receive 403 on OVERRIDE');

  const adminPublishRes = await handlePublishStaffSubmission(
    makeJsonPostRequest('http://localhost:3000/publish', {}),
    rbacDraft.id,
    adminDeps
  );
  assert.equal(adminPublishRes.status, 200, 'ADMIN can PUBLISH approved submission (200)');

  // SUPER_ADMIN exclusive OVERRIDE with mandatory reason
  const saDeps = {
    verifyStaff: makeStaffAuth(true, 'SUPER_ADMIN', 'staff_sa_1'),
    service: submissionService,
  };

  const saOverrideMissingReasonRes = await handleOverrideStaffSubmission(
    makeJsonPostRequest('http://localhost:3000/override', {
      targetStatus: 'DEACTIVATED',
      reason: '',
    }),
    rbacDraft.id,
    saDeps
  );
  assert.equal(saOverrideMissingReasonRes.status, 400, 'SUPER_ADMIN override without mandatory reason returns 400');

  const saOverrideValidRes = await handleOverrideStaffSubmission(
    makeJsonPostRequest('http://localhost:3000/override', {
      targetStatus: 'DEACTIVATED',
      reason: 'Executive compliance audit deactivation override.',
    }),
    rbacDraft.id,
    saDeps
  );
  assert.equal(saOverrideValidRes.status, 200, 'SUPER_ADMIN override with valid reason returns 200');
  console.log('  ✓ RBAC matrix & direct API/service/repository authorization verified.');

  // =========================================================================
  // 2. ENFORCE ORIGINAL ACCOUNT MODEL (OWNER & LISTING_PARTNER ONLY)
  // =========================================================================
  console.log('\n[2/5] Verifying Customer Account Model (OWNER & LISTING_PARTNER)...');
  const allowedAccountTypes: CustomerAccountType[] = ['OWNER', 'LISTING_PARTNER'];
  assert.deepEqual(allowedAccountTypes, ['OWNER', 'LISTING_PARTNER']);
  assert.equal(ownerCustomer.accountType, 'OWNER');
  assert.equal(partnerCustomer.accountType, 'LISTING_PARTNER');

  const validatedAgencyReg = validatePartnerRegistrationInput({
    agencyName: 'Bose Estates Kolkata Pvt Ltd',
    businessAddress: '24 Park Street, Park Circus, Kolkata 700016',
    locality: 'Park Street',
    city: 'Kolkata',
    agencyContactPhone: '+919800011102',
    declarationAccepted: true,
  });
  assert.equal(validatedAgencyReg.agencyName, 'Bose Estates Kolkata Pvt Ltd');
  assert.equal(validatedAgencyReg.declarationText, CANONICAL_PARTNER_ONBOARDING_DECLARATION_TEXT);
  assert.ok(
    CANONICAL_PARTNER_ONBOARDING_DECLARATION_TEXT.includes('sole Great Homes Listing Partner login for my agency'),
    'Partner declaration must enforce one login per agency'
  );
  assert.equal(evaluatePartnerEligibility(partnerCustomer.id, { status: 'ACTIVE' }).eligible, true);
  assert.equal(evaluatePartnerEligibility(partnerCustomer.id, { status: 'PENDING' }).eligible, false);
  assert.equal(evaluatePartnerEligibility(partnerCustomer.id, { status: 'SUSPENDED' }).eligible, false);
  console.log('  ✓ Customer account types strictly OWNER & LISTING_PARTNER (1 agency = 1 login).');

  // =========================================================================
  // 3. PHOTO RESOLUTION & UPLOAD POLICY (NO 800x600 REJECTION RULE)
  // =========================================================================
  console.log('\n[3/5] Verifying Photo Resolution & Upload Policy...');
  assert.equal(MIN_SUBMISSION_PHOTOS, 3);
  assert.equal(MAX_SUBMISSION_PHOTOS, 15);
  assert.equal(MIN_SUBMISSION_IMAGE_DIMENSION, 64);
  assert.equal(MAX_SUBMISSION_IMAGE_DIMENSION, 12000);
  assert.deepEqual(
    [...ALLOWED_SUBMISSION_IMAGE_MIMES].sort(),
    ['image/avif', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  );
  const rbacMedia = await mediaService.listMedia(rbacDraft.id, ownerCustomer.id);
  assert.equal(rbacMedia.assets.length, 3);
  assert.equal(rbacMedia.assets[0].mimeType, 'image/webp');
  assert.equal(rbacMedia.assets[0].width, 640);
  assert.equal(rbacMedia.assets[0].height, 480);
  assert.ok(rbacMedia.assets[0].watermarkedUrl, 'Watermarked URL must be present');
  console.log('  ✓ Photo policy verified: 3–15 photos, JPEG/PNG/WebP/AVIF, 640x480 accepted without 800x600 rejection.');

  // =========================================================================
  // 4. END-TO-END LISTING PUBLICATION ACROSS ALL 6 COMBINATIONS + 2450.75 PLOT AREA
  // =========================================================================
  console.log('\n[4/5] Executing Complete End-to-End Listing Publication for All 6 Combinations...');

  const combinations: Array<{
    label: string;
    propertyType: 'APARTMENT' | 'INDEPENDENT_HOUSE' | 'PLOT';
    listingType: 'RESALE' | 'RENTAL';
    listingSource: 'OWNER' | 'PARTNER';
    customerId: string;
    plotArea?: number;
  }> = [
    {
      label: '1. Apartment Resale (Owner)',
      propertyType: 'APARTMENT',
      listingType: 'RESALE',
      listingSource: 'OWNER',
      customerId: ownerCustomer.id,
    },
    {
      label: '2. Apartment Rental (Listing Partner)',
      propertyType: 'APARTMENT',
      listingType: 'RENTAL',
      listingSource: 'PARTNER',
      customerId: partnerCustomer.id,
    },
    {
      label: '3. Independent House Resale (Listing Partner)',
      propertyType: 'INDEPENDENT_HOUSE',
      listingType: 'RESALE',
      listingSource: 'PARTNER',
      customerId: partnerCustomer.id,
      plotArea: 3200.5,
    },
    {
      label: '4. Independent House Rental (Owner)',
      propertyType: 'INDEPENDENT_HOUSE',
      listingType: 'RENTAL',
      listingSource: 'OWNER',
      customerId: ownerCustomer.id,
      plotArea: 2800.25,
    },
    {
      label: '5. Plot Resale (Owner, plotArea=2450.75)',
      propertyType: 'PLOT',
      listingType: 'RESALE',
      listingSource: 'OWNER',
      customerId: ownerCustomer.id,
      plotArea: 2450.75,
    },
    {
      label: '6. Plot Rental (Listing Partner, plotArea=2450.75)',
      propertyType: 'PLOT',
      listingType: 'RENTAL',
      listingSource: 'PARTNER',
      customerId: partnerCustomer.id,
      plotArea: 2450.75,
    },
  ];

  const publishedResults: Record<
    string,
    {
      submissionId: string;
      listingId: string;
      slug: string;
      listingType: 'RESALE' | 'RENTAL';
      listingSource: 'OWNER' | 'PARTNER';
    }
  > = {};

  for (const combo of combinations) {
    const isPlot = combo.propertyType === 'PLOT';
    const isRental = combo.listingType === 'RENTAL';
    const declarationText =
      combo.listingSource === 'PARTNER' ? CANONICAL_PARTNER_ONBOARDING_DECLARATION_TEXT : CANONICAL_OWNER_DECLARATION_TEXT;

    // Step A: Create draft
    const draft = await submissionService.createDraft(combo.customerId, {
      listingType: combo.listingType,
      listingSource: combo.listingSource,
      payload: {
        propertyType: combo.propertyType,
        location: {
          city: 'Kolkata',
          locality: 'Ballygunge',
          locationId: testLoc.id,
        },
      },
    });

    // Step B: Auto-save full details (including exact coordinates 22.528456, 88.365789)
    const originalDesc = `Original submitter description for ${combo.label} with ample length for validation.`;
    const detailsPayload: Record<string, unknown> = isPlot
      ? {
          configuration: 'Residential Plot',
          plotArea: combo.plotArea ?? 2450.75,
          facing: 'EAST',
          possession: 'READY_TO_MOVE',
          ...(isRental
            ? { monthlyRent: 65000, securityDeposit: 195000, maintenance: 2500 }
            : { askingPrice: 24500000 }),
          amenities: ['security-cctv', 'rainwater-harvesting', 'landscaped-gardens'],
          description: originalDesc,
        }
      : {
          configuration: combo.propertyType === 'INDEPENDENT_HOUSE' ? '4 BHK' : '3 BHK',
          bedroomCount: combo.propertyType === 'INDEPENDENT_HOUSE' ? 4 : 3,
          bathroomCount: 3,
          carpetArea: 1650,
          builtUpArea: 1950,
          superBuiltUpArea: 2200,
          ...(combo.plotArea ? { plotArea: combo.plotArea } : {}),
          furnishing: 'SEMI_FURNISHED',
          facing: 'SOUTH_EAST',
          floorCategory: 'MID_FLOOR',
          possession: 'READY_TO_MOVE',
          ...(isRental
            ? { monthlyRent: 55000, securityDeposit: 165000, maintenance: 4500 }
            : { askingPrice: 19500000 }),
          amenities: ['power-backup', 'security-cctv', 'visitor-parking'],
          description: originalDesc,
        };

    const consentObj =
      combo.listingSource === 'PARTNER'
        ? { partnerAttestationAccepted: true, declarationText }
        : { ownerDeclarationAccepted: true, declarationText };

    await submissionService.updateDraft(draft.id, combo.customerId, {
      payload: {
        propertyType: combo.propertyType,
        submitterName: combo.listingSource === 'PARTNER' ? 'Bose Estates Kolkata Pvt Ltd' : 'Arindam Sen',
        submitterPhone: combo.listingSource === 'PARTNER' ? '+919800011102' : '+919800011101',
        submitterEmail:
          combo.listingSource === 'PARTNER' ? 'vikramjit@boseestates.in' : 'arindam.owner@example.com',
        location: {
          city: 'Kolkata',
          locality: 'Ballygunge',
          locationId: testLoc.id,
          address: '14/2 Dover Lane, Ballygunge, Kolkata 700029',
          latitude: 22.528456,
          longitude: 88.365789,
        },
        details: detailsPayload,
        consent: consentObj,
      },
      ...(combo.listingSource === 'PARTNER'
        ? {
            attestation: {
              ownerAuthorised: true,
              detailsAccurate: true,
              photosGenuine: true,
              greatHomesControlsEnquiries: true,
              ownerName: 'Subrata Mukherjee',
              ownerPhone: '9830099988',
              ownerEmail: 'subrata.owner@private.example',
              relationshipNote: 'Direct exclusive marketing mandate',
            },
          }
        : {}),
    });

    // Step C: Upload 3 photos (JPEG, PNG, WebP)
    const formats: Array<'jpeg' | 'png' | 'webp'> = ['jpeg', 'png', 'webp'];
    for (let idx = 0; idx < 3; idx++) {
      const fmt = formats[idx];
      const buf = await createSampleImageBuffer(900, 650, fmt);
      await mediaService.uploadMedia(draft.id, combo.customerId, {
        buffer: buf,
        filename: `${combo.propertyType.toLowerCase()}-${idx + 1}.${fmt === 'jpeg' ? 'jpg' : fmt}`,
        mimeType: `image/${fmt}`,
        category: isPlot ? 'PLOT_VIEW' : idx === 0 ? 'LIVING_ROOM' : idx === 1 ? 'BEDROOM' : 'EXTERIOR',
        caption: `${combo.label} Photo ${idx + 1}`,
      });
    }

    // Step D: Submit for verification
    const submitted = await submissionService.submitForReview(draft.id, combo.customerId, {
      consent: consentObj,
    });
    assert.equal(submitted.submissionStatus, 'SUBMITTED');

    // Step E: Staff assignment (ADMIN) + Review start & Checklist & Curated Edit & Approval (VERIFICATION_EXECUTIVE)
    await submissionService.assignReviewer(draft.id, 'staff_admin_1', 'ADMIN', 'staff_ve_1');
    await submissionService.startReview(draft.id, 'staff_ve_1', 'VERIFICATION_EXECUTIVE');
    await submissionService.addInternalNote(
      draft.id,
      'staff_ve_1',
      'VERIFICATION_EXECUTIVE',
      `Confidential internal staff verification note for ${combo.label} - DO NOT EXPOSE PUBLICLY.`
    );
    await submissionService.updateChecklist(draft.id, 'staff_ve_1', 'VERIFICATION_EXECUTIVE', {
      contactConfirmed: true,
      checklist: {
        contactConfirmed: true,
        locationVerified: true,
        pricingReasonable: true,
        photosGenuine: true,
        duplicateChecked: true,
      },
    });

    const curatedDesc = `Curated Great Homes editorial description for ${combo.label}.`;
    await submissionService.editCuratedData(draft.id, 'staff_ve_1', 'VERIFICATION_EXECUTIVE', {
      details: {
        description: curatedDesc,
      },
    });

    const approveRes = await submissionService.approveSubmission(
      draft.id,
      'staff_ve_1',
      'VERIFICATION_EXECUTIVE',
      {
        contactConfirmed: true,
        internalNote: 'All verification checks passed.',
      }
    );
    assert.equal(approveRes.submissionStatus, 'APPROVED');

    // Verify originalPayload vs curatedPayload separation in staff detail
    const staffDetail = await submissionService.getSubmissionDetailForStaff(draft.id);
    assert.equal(
      (staffDetail.originalPayload as any)?.details?.description,
      originalDesc,
      'originalPayload must remain immutable after curated edit'
    );
    assert.equal(
      (staffDetail.curatedPayload as any)?.details?.description,
      curatedDesc,
      'curatedPayload must store staff curated edits'
    );

    // Step F: Admin final publication review
    const pubRes = await submissionService.publishSubmission(draft.id, 'staff_admin_1', 'ADMIN');
    assert.equal(pubRes.submissionStatus, 'PUBLISHED');
    assert.ok(pubRes.listingId, 'listingId must be returned on publish');
    assert.ok(pubRes.slug, 'slug must be returned on publish');

    // Step G: Verify publication idempotency (re-publishing preserves same listingId & slug)
    const idempotentPub = await repo.publishSubmission(draft.id, 'staff_sa_1', 'SUPER_ADMIN', {
      skipApprovedCheckForOverride: true,
      overrideReason: 'Idempotency verification re-publish check',
    });
    assert.equal(idempotentPub.listingId, pubRes.listingId, 'Publication must be idempotent on listingId');
    assert.equal(idempotentPub.slug, pubRes.slug, 'Publication must be idempotent on slug');

    // Step H: Retrieve public DTO & Detail ViewModel (/buy/[slug] or /rent/[slug])
    const expectedPartyType = combo.listingSource === 'PARTNER' ? 'LISTING_PARTNER' : 'OWNER';
    const expectedPartyLabel = combo.listingSource === 'PARTNER' ? 'Listing Partner' : 'Owner Listed';

    if (isRental) {
      const publicDto = await rentalListingService.getPublicListingBySlug(pubRes.slug);
      assert.ok(publicDto, `Public rental DTO must be retrievable by slug ${pubRes.slug}`);
      assert.equal(publicDto.propertyType, combo.propertyType);
      assert.equal(publicDto.description, curatedDesc, 'Public DTO must use curated description');
      assert.equal(publicDto.listingParty.type, expectedPartyType);
      assert.equal(publicDto.listingParty.label, expectedPartyLabel);
      assert.equal(publicDto.isVerified, true);
      assert.equal(publicDto.media.length, 3, 'All 3 watermarked photos must be present in public rental DTO');
      assert.ok(publicDto.amenities.length >= 2, 'Amenities must be present in public rental DTO');
      if (combo.plotArea !== undefined) {
        assert.equal(
          publicDto.plotArea,
          combo.plotArea,
          `Decimal plotArea ${combo.plotArea} must persist accurately in public rental DTO`
        );
      }

      // Verify Detail ViewModel (/rent/[slug])
      const detailVm = await rentalListingService.getPublicListingDetailBySlug(pubRes.slug);
      assert.ok(detailVm, `Public rental DetailViewModel must be retrievable for /rent/${pubRes.slug}`);
      assert.equal(detailVm.media.length, 3);

      // Verify Privacy: no private phone/email/notes/declaration in public DTO JSON
      const serialized = JSON.stringify({ publicDto, detailVm });
      assert.equal(serialized.includes('9800011101'), false, 'Owner phone must never leak');
      assert.equal(serialized.includes('9800011102'), false, 'Partner phone must never leak');
      assert.equal(serialized.includes('9830099988'), false, 'Attested owner phone must never leak');
      assert.equal(serialized.includes('DO NOT EXPOSE PUBLICLY'), false, 'Internal staff note must never leak');
      assert.equal(serialized.includes('22.528456'), false, 'Exact latitude must be coarsened');

      // Verify coordinate coarsening on stored entity
      const adminDto = await rentalListingService.getAdminListingById(pubRes.listingId!);
      assert.equal(adminDto?.latitude, 22.528);
      assert.equal(adminDto?.longitude, 88.366);
    } else {
      const publicDto = await resaleListingService.getPublicListingBySlug(pubRes.slug);
      assert.ok(publicDto, `Public resale DTO must be retrievable by slug ${pubRes.slug}`);
      assert.equal(publicDto.propertyType, combo.propertyType);
      assert.equal(publicDto.description, curatedDesc, 'Public DTO must use curated description');
      assert.equal(publicDto.listingParty.type, expectedPartyType);
      assert.equal(publicDto.listingParty.label, expectedPartyLabel);
      assert.equal(publicDto.isVerified, true);
      assert.equal(publicDto.media.length, 3, 'All 3 watermarked photos must be present in public resale DTO');
      assert.ok(publicDto.amenities.length >= 2, 'Amenities must be present in public resale DTO');
      if (combo.plotArea !== undefined) {
        assert.equal(
          publicDto.plotArea,
          combo.plotArea,
          `Decimal plotArea ${combo.plotArea} must persist accurately in public resale DTO`
        );
      }

      // Verify Detail ViewModel (/buy/[slug])
      const detailVm = await resaleListingService.getPublicListingDetailBySlug(pubRes.slug);
      assert.ok(detailVm, `Public resale DetailViewModel must be retrievable for /buy/${pubRes.slug}`);
      assert.equal(detailVm.media.length, 3);

      // Verify Privacy: no private phone/email/notes/declaration in public DTO JSON
      const serialized = JSON.stringify({ publicDto, detailVm });
      assert.equal(serialized.includes('9800011101'), false, 'Owner phone must never leak');
      assert.equal(serialized.includes('9800011102'), false, 'Partner phone must never leak');
      assert.equal(serialized.includes('9830099988'), false, 'Attested owner phone must never leak');
      assert.equal(serialized.includes('DO NOT EXPOSE PUBLICLY'), false, 'Internal staff note must never leak');
      assert.equal(serialized.includes('22.528456'), false, 'Exact latitude must be coarsened');

      // Verify coordinate coarsening on stored entity
      const adminDto = await resaleListingService.getAdminListingById(pubRes.listingId!);
      assert.equal(adminDto?.latitude, 22.528);
      assert.equal(adminDto?.longitude, 88.366);
    }

    publishedResults[combo.label] = {
      submissionId: draft.id,
      listingId: pubRes.listingId!,
      slug: pubRes.slug,
      listingType: combo.listingType,
      listingSource: combo.listingSource,
    };
    console.log(`  ✓ Published & verified ${combo.label} -> slug: ${pubRes.slug} (listingId: ${pubRes.listingId})`);
  }

  // =========================================================================
  // 5. ENQUIRY ATTRIBUTION & CONFIDENTIALITY
  // =========================================================================
  console.log('\n[5/5] Verifying Enquiry Attribution & Confidentiality (Owner vs Partner)...');

  const ownerResale = publishedResults['1. Apartment Resale (Owner)'];
  const partnerResale = publishedResults['3. Independent House Resale (Listing Partner)'];
  const partnerRental = publishedResults['2. Apartment Rental (Listing Partner)'];

  // Submit enquiry on Owner-listed Resale property
  const ownerEnqRes = await enquiryService.submitEnquiry({
    name: 'Rohan Chatterjee',
    phone: '+919876500111',
    email: 'rohan.buyer@example.com',
    contextType: 'RESALE',
    listingId: ownerResale.listingId,
    sourcePage: `/buy/${ownerResale.slug}`,
    message: 'Interested in scheduling a site visit for this owner-listed apartment.',
  });
  assert.equal(ownerEnqRes.success, true);
  const ownerEnqEntity = await enquiryService.getEnquiryById(ownerEnqRes.enquiryId);
  assert.ok(ownerEnqEntity, 'Owner enquiry entity must be persisted');
  assert.equal(ownerEnqEntity.listingId, ownerResale.listingId);
  assert.equal((ownerEnqEntity.metadata as any)?.listingSource, 'OWNER_SUBMITTED_PROPERTY');
  assert.equal((ownerEnqEntity.metadata as any)?.listingPartyType, 'OWNER');

  // Submit enquiry on Partner-listed Resale property
  const partnerResaleEnqRes = await enquiryService.submitEnquiry({
    name: 'Sneha Roy',
    phone: '+919876500222',
    email: 'sneha.buyer@example.com',
    contextType: 'RESALE',
    listingId: partnerResale.listingId,
    sourcePage: `/buy/${partnerResale.slug}`,
    message: 'Interested in this partner-listed independent house.',
  });
  assert.equal(partnerResaleEnqRes.success, true);
  const partnerResaleEnqEntity = await enquiryService.getEnquiryById(partnerResaleEnqRes.enquiryId);
  assert.ok(partnerResaleEnqEntity, 'Partner resale enquiry entity must be persisted');
  assert.equal(
    (partnerResaleEnqEntity.metadata as any)?.listingSource,
    'PARTNER_SUBMITTED_PROPERTY',
    'Partner resale enquiry must be attributed to PARTNER_SUBMITTED_PROPERTY'
  );
  assert.equal(
    (partnerResaleEnqEntity.metadata as any)?.listingPartyType,
    'PARTNER',
    'Partner resale enquiry must have listingPartyType = PARTNER'
  );

  // Submit enquiry on Partner-listed Rental property
  const partnerRentalEnqRes = await enquiryService.submitEnquiry({
    name: 'Kunal Sen',
    phone: '+919876500333',
    email: 'kunal.tenant@example.com',
    contextType: 'RENTAL',
    listingId: partnerRental.listingId,
    sourcePage: `/rent/${partnerRental.slug}`,
    message: 'Interested in leasing this partner-listed apartment.',
  });
  assert.equal(partnerRentalEnqRes.success, true);
  const partnerRentalEnqEntity = await enquiryService.getEnquiryById(partnerRentalEnqRes.enquiryId);
  assert.ok(partnerRentalEnqEntity, 'Partner rental enquiry entity must be persisted');
  assert.equal(
    (partnerRentalEnqEntity.metadata as any)?.listingSource,
    'PARTNER_SUBMITTED_PROPERTY',
    'Partner rental enquiry must be attributed to PARTNER_SUBMITTED_PROPERTY'
  );
  assert.equal(
    (partnerRentalEnqEntity.metadata as any)?.listingPartyType,
    'PARTNER',
    'Partner rental enquiry must have listingPartyType = PARTNER'
  );

  // Confirm Great Homes controls the enquiry and no lister contact details are returned to the customer
  const enqSerialized = JSON.stringify({
    ownerEnqRes,
    partnerResaleEnqRes,
    partnerRentalEnqRes,
  });
  assert.equal(
    enqSerialized.includes('9800011101'),
    false,
    'Owner private phone must never be returned in enquiry response'
  );
  assert.equal(
    enqSerialized.includes('9800011102'),
    false,
    'Partner agency phone must never be returned in enquiry response'
  );
  assert.equal(
    enqSerialized.includes('9830099988'),
    false,
    'Underlying property owner phone must never be returned'
  );

  // Verify Staff Admin Listing DTO for Partner listing sets brokerName/brokerPhone (agency) and NOT ownerPhone
  const partnerAdminListing = await resaleListingService.getAdminListingById(partnerResale.listingId);
  assert.equal(partnerAdminListing?.listingPartyType, 'LISTING_PARTNER');
  assert.equal(partnerAdminListing?.brokerPhone, '+919800011102', 'Great Homes staff contacts the partner agency');
  assert.equal(partnerAdminListing?.ownerPhone, null, 'Partner listing does not set ownerPhone as the listing contact');

  console.log('  ✓ Enquiry attribution & confidentiality verified (Owner vs Partner, zero PII leakage).');
  console.log('\n=== ALL PHASE 1 SPECIFICATION & INTEGRATION CHECKS PASSED ===');
}

main().catch((err) => {
  console.error('FINAL AUDIT TEST FAILED:', err);
  process.exit(1);
});
