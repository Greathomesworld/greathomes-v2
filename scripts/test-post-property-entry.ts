import assert from 'node:assert/strict';
import { buildSelectableKolkataLocations } from '../src/domain/locations/locationOptions';
import {
  VISIBLE_WIZARD_STEPS,
  toVisibleStep,
  toInternalStep,
  clampVisibleInternalStep,
  resolvePage2EntryParams,
  deriveSubmissionSourceFromAccountType,
} from '../src/components/post-property/wizardStepMapping';
import { evaluateBeforeYouStartState } from '../src/components/post-property/AccountEligibilityPanel';

async function runTests() {
  console.log('=== STARTING POST PROPERTY PAGE 1 & PAGE 2 ENTRY & WIZARD TESTS ===');

  // 1. Shared Kolkata Location Options Helper
  {
    const rawLocations = [
      { id: 'state-wb', name: 'West Bengal', slug: 'west-bengal', type: 'STATE', status: 'ACTIVE', featured: true, parentId: null },
      { id: 'city-kol', name: 'Kolkata', slug: 'kolkata', type: 'CITY', status: 'ACTIVE', featured: true, parentId: 'state-wb' },
      { id: 'loc-newtown', name: 'New Town', slug: 'new-town', type: 'AREA', status: 'ACTIVE', featured: true, parentId: 'city-kol' },
      { id: 'loc-aa1', name: 'Action Area I', slug: 'action-area-1', type: 'NEIGHBOURHOOD', status: 'ACTIVE', featured: false, parentId: 'loc-newtown' },
      { id: 'loc-rajarhat', name: 'Rajarhat', slug: 'rajarhat', type: 'AREA', status: 'ACTIVE', featured: true, parentId: 'city-kol' },
    ];

    const selectable = buildSelectableKolkataLocations(rawLocations);
    assert.equal(selectable.length, 3, 'STATE and CITY rows must be excluded from selectable localities');
    assert.equal(selectable[0].id, 'loc-newtown', 'Featured localities sort first alphabetically');
    assert.equal(selectable[0].label, 'New Town');
    assert.equal(selectable[1].id, 'loc-rajarhat');
    assert.equal(selectable[1].label, 'Rajarhat');
    assert.equal(selectable[2].id, 'loc-aa1');
    assert.equal(selectable[2].label, 'Action Area I (New Town)', 'Sub-locality includes non-city parent disambiguation');
    console.log('✓ Shared Kolkata location options helper tests passed.');
  }

  // 2. Five-Step Visible Wizard Mapping (Internal Steps 2..6 <-> Visible Steps 1..5)
  {
    assert.equal(VISIBLE_WIZARD_STEPS.length, 5);
    assert.deepEqual(
      VISIBLE_WIZARD_STEPS.map((s) => ({ visibleStep: s.visibleStep, internalStep: s.internalStep, shortTitle: s.shortTitle })),
      [
        { visibleStep: 1, internalStep: 2, shortTitle: 'Location & Project' },
        { visibleStep: 2, internalStep: 3, shortTitle: 'Details & Pricing' },
        { visibleStep: 3, internalStep: 4, shortTitle: 'Photographs' },
        { visibleStep: 4, internalStep: 5, shortTitle: 'Authority / Consent' },
        { visibleStep: 5, internalStep: 6, shortTitle: 'Review & Submit' },
      ]
    );

    assert.equal(toVisibleStep(1), 1);
    assert.equal(toVisibleStep(2), 1);
    assert.equal(toVisibleStep(3), 2);
    assert.equal(toVisibleStep(4), 3);
    assert.equal(toVisibleStep(5), 4);
    assert.equal(toVisibleStep(6), 5);

    assert.equal(toInternalStep(1), 2);
    assert.equal(toInternalStep(2), 3);
    assert.equal(toInternalStep(3), 4);
    assert.equal(toInternalStep(4), 5);
    assert.equal(toInternalStep(5), 6);

    assert.equal(clampVisibleInternalStep(1), 2);
    assert.equal(clampVisibleInternalStep(2), 2);
    assert.equal(clampVisibleInternalStep(6), 6);
    console.log('✓ 5-step visible wizard to 6-step internal validation mapping tests passed.');
  }

  // 3. Page 1 -> Page 2 Query Parameter Resolution & Draft Precedence
  {
    // Valid new submission with catalog locationId
    const validCatalogEntry = resolvePage2EntryParams({
      listingType: 'RESALE',
      propertyType: 'APARTMENT',
      locationId: 'loc-rajarhat',
      locality: 'Rajarhat',
    });
    assert.equal(validCatalogEntry.requiresRedirectToPage1, false);
    assert.equal(validCatalogEntry.isDraftFlow, false);
    assert.equal(validCatalogEntry.listingType, 'RESALE');
    assert.equal(validCatalogEntry.propertyType, 'APARTMENT');
    assert.equal(validCatalogEntry.locationId, 'loc-rajarhat');
    assert.equal(validCatalogEntry.isCustomLocality, false);

    // Valid new submission with custom locality only
    const validCustomLocality = resolvePage2EntryParams({
      listingType: 'RENTAL',
      propertyType: 'INDEPENDENT_HOUSE',
      locality: 'custom',
    });
    assert.equal(validCustomLocality.requiresRedirectToPage1, false);
    assert.equal(validCustomLocality.isDraftFlow, false);
    assert.equal(validCustomLocality.listingType, 'RENTAL');
    assert.equal(validCustomLocality.propertyType, 'INDEPENDENT_HOUSE');
    assert.equal(validCustomLocality.locationId, null);
    assert.equal(validCustomLocality.isCustomLocality, true);

    // Missing required Page 1 selection -> redirect back to Page 1
    const missingSelection = resolvePage2EntryParams({
      listingType: 'RESALE',
      propertyType: null,
      locationId: 'loc-rajarhat',
    });
    assert.equal(missingSelection.requiresRedirectToPage1, true);

    // Existing draftId takes precedence even when query params are absent
    const draftResumeEntry = resolvePage2EntryParams({
      draftId: 'draft-12345',
      listingType: null,
      propertyType: null,
    });
    assert.equal(draftResumeEntry.requiresRedirectToPage1, false);
    assert.equal(draftResumeEntry.isDraftFlow, true);

    console.log('✓ Page 1 -> Page 2 query param resolution and draft precedence tests passed.');
  }

  // 4. Server-Verified Submission Source Derivation (Never Trust URL ?source=)
  {
    assert.equal(deriveSubmissionSourceFromAccountType('OWNER'), 'OWNER');
    assert.equal(deriveSubmissionSourceFromAccountType('LISTING_PARTNER'), 'PARTNER');
    assert.equal(deriveSubmissionSourceFromAccountType(null), 'OWNER');
    assert.equal(deriveSubmissionSourceFromAccountType(undefined), 'OWNER');
    console.log('✓ Server-verified submission source derivation tests passed.');
  }

  // 5. "Before You Start" Account Eligibility State Machine
  {
    // Unauthenticated visitor
    const unauth = evaluateBeforeYouStartState({
      authLoading: false,
      customer: null,
      partnerStatus: { checking: false, checked: false, eligible: false, status: null },
    });
    assert.equal(unauth.mode, 'UNAUTHENTICATED');
    assert.equal(unauth.canAccessWizard, false);

    // Authenticated customer with incomplete accountType
    const incomplete = evaluateBeforeYouStartState({
      authLoading: false,
      customer: { id: 'c1', accountType: null },
      partnerStatus: { checking: false, checked: false, eligible: false, status: null },
    });
    assert.equal(incomplete.mode, 'ACCOUNT_TYPE_INCOMPLETE');
    assert.equal(incomplete.canAccessWizard, false);

    // Eligible Property Owner
    const owner = evaluateBeforeYouStartState({
      authLoading: false,
      customer: { id: 'c1', accountType: 'OWNER' },
      partnerStatus: { checking: false, checked: false, eligible: false, status: null },
    });
    assert.equal(owner.mode, 'OWNER_ELIGIBLE');
    assert.equal(owner.canAccessWizard, true);

    // Active Listing Partner
    const activePartner = evaluateBeforeYouStartState({
      authLoading: false,
      customer: { id: 'c2', accountType: 'LISTING_PARTNER' },
      partnerStatus: { checking: false, checked: true, eligible: true, status: 'ACTIVE' },
    });
    assert.equal(activePartner.mode, 'PARTNER_ACTIVE_ELIGIBLE');
    assert.equal(activePartner.canAccessWizard, true);

    // Non-active Listing Partners (PENDING, REJECTED, SUSPENDED, REVOKED) must block wizard access
    for (const status of ['PENDING', 'REJECTED', 'SUSPENDED', 'REVOKED'] as const) {
      const blockedPartner = evaluateBeforeYouStartState({
        authLoading: false,
        customer: { id: 'c2', accountType: 'LISTING_PARTNER' },
        partnerStatus: { checking: false, checked: true, eligible: false, status },
      });
      assert.equal(blockedPartner.canAccessWizard, false, `Partner status ${status} must block wizard access`);
      assert.equal(blockedPartner.mode, `PARTNER_${status}`);
    }

    console.log('✓ "Before You Start" account eligibility state machine tests passed.');
  }

  console.log('=== ALL POST PROPERTY PAGE 1 & PAGE 2 ENTRY & WIZARD TESTS PASSED ===');
}

runTests().catch((err) => {
  console.error('Post Property Entry Test Execution Failed:', err);
  process.exit(1);
});

