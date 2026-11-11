import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as unknown as { React: typeof React }).React = React;

import {
  ProjectRepositoryMemory,
  ProjectConfigurationRepositoryMemory,
  ProjectMediaRepositoryMemory,
  ProjectReraRepositoryMemory,
  AmenityRepositoryMemory,
  ProjectFaqRepositoryMemory,
} from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { DeveloperRepositoryMemory } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { LocationRepositoryMemory } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';
import {
  ProjectIntelligenceService,
  ValidationError,
} from '../services/projectIntelligenceService';
import {
  deriveProjectPricingSummary,
  toPublicProjectDto,
  getConfigurationCardAreaInfo,
  formatStartingPrice,
} from '../dto/projectDto';
import {
  isPositivePrice,
  isConfigurationPriceOnRequest,
  isProjectPriceOnRequest,
  comparePricesWithPorLast,
} from '../../../lib/priceUtils';
import { ProjectStructuredData } from '../../../components/projects/ProjectStructuredData';
import { NewBookingSection } from '../../../components/projects/NewBookingSection';

async function runPriceOnRequestSuite() {
  console.log('===================================================================');
  console.log('GREAT HOMES V2 — PHASE 4I-B PRICE ON REQUEST TEST SUITE');
  console.log('===================================================================\n');

  const projectRepo = new ProjectRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory(mediaRepo);
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();

  const service = new ProjectIntelligenceService(
    projectRepo,
    configRepo,
    mediaRepo,
    reraRepo,
    amenityRepo,
    faqRepo,
    devRepo,
    locRepo
  );

  const loc = await locRepo.create({
    name: 'Alipore',
    slug: 'alipore',
    type: 'AREA',
    status: 'PUBLISHED',
    featured: true,
  });

  const dev = await devRepo.create({
    name: 'Forum Group',
    slug: 'forum-group',
    shortDescription: 'Forum Group Luxury Developments',
    description: 'Luxury residential developer in Kolkata',
    websiteUrl: 'https://forumprojects.in',
    status: 'PUBLISHED',
    featured: true,
  });

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Fixed-price project + fixed-price configurations -> normal prices and rates
  // ---------------------------------------------------------------------------
  const proj1 = await service.createProject({
    developerId: dev.id,
    locationId: loc.id,
    name: 'Atmosphere Fixed',
    slug: 'atmosphere-fixed',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 9000000,
    priceOnRequest: false,
  });
  await service.createConfiguration(proj1.id, {
    name: '3 BHK Classic',
    bedroomCount: 3,
    carpetArea: 1000,
    builtUpArea: 1200,
    superBuiltUpArea: 1500,
    price: 10000000,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: false,
  });
  await service.createConfiguration(proj1.id, {
    name: '4 BHK Grand',
    bedroomCount: 4,
    carpetArea: 1600,
    builtUpArea: 1920,
    superBuiltUpArea: 2400,
    price: 16000000,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: false,
  });

  const pub1 = await service.getProjectById(proj1.id, false);
  assert.ok(pub1);
  assert.equal(pub1.priceOnRequest, false);
  assert.equal(pub1.pricing.priceOnRequest, false);
  assert.equal(pub1.pricing.startingPrice, 10000000);
  assert.equal(pub1.pricing.maximumPrice, 16000000);
  assert.equal(pub1.pricing.lowestEffectivePricePerSqft, 10000);
  assert.equal(pub1.startingPrice, 10000000);
  assert.equal(pub1.configurations.length, 2);
  assert.equal(pub1.configurations[0].price, 10000000);
  assert.equal(pub1.configurations[0].effectivePricePerSqft, 10000);
  assert.equal(pub1.configurations[0].priceOnRequest, false);
  console.log('✔ [Scenario 1] Fixed-price project + fixed-price configurations -> normal prices and rates');

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Project-level PoR with priced configurations -> public project and all
  // configurations show PoR; internal prices remain intact.
  // ---------------------------------------------------------------------------
  await service.updateProject(proj1.id, { priceOnRequest: true }, true);

  const pub2 = await service.getProjectById(proj1.id, false);
  assert.ok(pub2);
  assert.equal(pub2.priceOnRequest, true);
  assert.equal(pub2.pricing.priceOnRequest, true);
  assert.equal(pub2.pricing.startingPrice, null);
  assert.equal(pub2.pricing.maximumPrice, null);
  assert.equal(pub2.pricing.lowestEffectivePricePerSqft, null);
  assert.equal(pub2.startingPrice, undefined, 'Top-level startingPrice must not leak when project is PoR');
  assert.equal(pub2.manualStartingPrice, undefined, 'manualStartingPrice must not be exposed publicly');
  for (const cfg of pub2.configurations) {
    assert.equal(cfg.priceOnRequest, true);
    assert.equal(cfg.price, 0, 'Public configuration price must be masked as 0 when project is PoR');
    assert.equal(cfg.effectivePricePerSqft, 0, 'Public configuration rate must be masked as 0 when project is PoR');
  }

  // Staff view preserves internal prices and manualStartingPrice
  const staff2 = await service.getProjectById(proj1.id, true);
  assert.ok(staff2);
  assert.equal(staff2.priceOnRequest, true);
  assert.equal(staff2.manualStartingPrice, 9000000, 'Staff view must preserve internal manualStartingPrice');
  assert.equal(staff2.configurations[0].price, 10000000, 'Staff view must preserve internal configuration price');
  assert.equal(staff2.configurations[0].effectivePricePerSqft, 10000);
  assert.equal(staff2.configurations[1].price, 16000000);

  // Restore project-level PoR to false and confirm configuration prices return publicly
  await service.updateProject(proj1.id, { priceOnRequest: false }, true);
  const restoredPub1 = await service.getProjectById(proj1.id, false);
  assert.equal(restoredPub1?.pricing.startingPrice, 10000000);
  assert.equal(restoredPub1?.configurations[0].price, 10000000);
  console.log('✔ [Scenario 2] Project-level PoR masks all public prices & rates while preserving internal prices');

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Project-level PoR without configurations -> public project shows PoR;
  // internal startingPrice preserved if present.
  // ---------------------------------------------------------------------------
  const projNoConfigs = await service.createProject({
    developerId: dev.id,
    locationId: loc.id,
    name: 'Boutique PoR No Configs',
    slug: 'boutique-por-no-configs',
    status: 'NEW_LAUNCH',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'VILLA',
    startingPrice: 45000000,
    priceOnRequest: true,
  });

  const pubNoConfigs = await service.getProjectById(projNoConfigs.id, false);
  assert.ok(pubNoConfigs);
  assert.equal(pubNoConfigs.priceOnRequest, true);
  assert.equal(pubNoConfigs.pricing.priceOnRequest, true);
  assert.equal(pubNoConfigs.pricing.startingPrice, null);
  assert.equal(pubNoConfigs.startingPrice, undefined);
  assert.equal(formatStartingPrice(pubNoConfigs.pricing.startingPrice, pubNoConfigs.priceOnRequest), 'Price on Request');

  const staffNoConfigs = await service.getProjectById(projNoConfigs.id, true);
  assert.equal(staffNoConfigs?.manualStartingPrice, 45000000);
  console.log('✔ [Scenario 3] Project-level PoR without configurations shows PoR publicly and preserves internal startingPrice');

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Mixed project: 2 BHK priced, 3 BHK priced, 4 BHK PoR -> public project
  // starting price uses 2 BHK/3 BHK; 4 BHK shows PoR.
  // ---------------------------------------------------------------------------
  const projMixed = await service.createProject({
    developerId: dev.id,
    locationId: loc.id,
    name: 'Mixed Skyvillas',
    slug: 'mixed-skyvillas',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 5000000,
    priceOnRequest: false,
  });
  const cfg2Bhk = await service.createConfiguration(projMixed.id, {
    name: '2 BHK Luxury',
    bedroomCount: 2,
    carpetArea: 850,
    builtUpArea: 1020,
    superBuiltUpArea: 1250,
    price: 8500000,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: false,
  });
  const cfg3Bhk = await service.createConfiguration(projMixed.id, {
    name: '3 BHK Luxury',
    bedroomCount: 3,
    carpetArea: 1250,
    builtUpArea: 1500,
    superBuiltUpArea: 1850,
    price: 12500000,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: false,
  });
  const cfg4BhkPor = await service.createConfiguration(projMixed.id, {
    name: '4 BHK Penthouse',
    bedroomCount: 4,
    carpetArea: 2100,
    builtUpArea: 2500,
    superBuiltUpArea: 3100,
    price: 25200000,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: true,
  });

  const pubMixed = await service.getProjectById(projMixed.id, false);
  assert.ok(pubMixed);
  assert.equal(pubMixed.priceOnRequest, false);
  assert.equal(pubMixed.pricing.priceOnRequest, false);
  assert.equal(pubMixed.pricing.startingPrice, 8500000);
  assert.equal(pubMixed.pricing.maximumPrice, 12500000, 'Maximum price must exclude PoR 4 BHK');
  assert.equal(pubMixed.pricing.lowestEffectivePricePerSqft, 10000);
  const pub4Bhk = pubMixed.configurations.find(c => c.id === cfg4BhkPor.id);
  assert.ok(pub4Bhk);
  assert.equal(pub4Bhk.priceOnRequest, true);
  assert.equal(pub4Bhk.price, 0);
  assert.equal(pub4Bhk.effectivePricePerSqft, 0);
  console.log('✔ [Scenario 4] Mixed project (2 BHK & 3 BHK priced, 4 BHK PoR) derives summary from visible configurations only');

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Mixed project where lowest-priced configuration is PoR -> public
  // starting price uses lowest non-PoR configuration.
  // ---------------------------------------------------------------------------
  await service.updateConfiguration(cfg2Bhk.id, { priceOnRequest: true }, true, projMixed.id);
  const pubLowestPor = await service.getProjectById(projMixed.id, false);
  assert.ok(pubLowestPor);
  assert.equal(pubLowestPor.pricing.startingPrice, 12500000, 'Public starting price must use lowest non-PoR configuration (3 BHK)');
  assert.equal(pubLowestPor.pricing.maximumPrice, 12500000);
  assert.equal(pubLowestPor.startingPrice, 12500000);
  console.log('✔ [Scenario 5] Mixed project where lowest-priced configuration is PoR uses next lowest visible configuration');

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Mixed project where all configurations are marked PoR -> public
  // project summary becomes PoR and does NOT fall back to project.startingPrice.
  // ---------------------------------------------------------------------------
  await service.updateConfiguration(cfg3Bhk.id, { priceOnRequest: true }, true, projMixed.id);
  const pubAllConfigsPor = await service.getProjectById(projMixed.id, false);
  assert.ok(pubAllConfigsPor);
  assert.equal(pubAllConfigsPor.priceOnRequest, true, 'Project must become effectively PoR when all configurations are PoR');
  assert.equal(pubAllConfigsPor.pricing.priceOnRequest, true);
  assert.equal(pubAllConfigsPor.pricing.startingPrice, null, 'Must NOT fall back to project.startingPrice (5000000) when all configurations are PoR');
  assert.equal(pubAllConfigsPor.pricing.maximumPrice, null);
  assert.equal(pubAllConfigsPor.pricing.lowestEffectivePricePerSqft, null);
  assert.equal(pubAllConfigsPor.startingPrice, undefined);
  console.log('✔ [Scenario 6] Project with all configurations marked PoR becomes PoR and never falls back to project.startingPrice');

  // Restore 2 BHK & 3 BHK to fixed price for subsequent tests
  await service.updateConfiguration(cfg2Bhk.id, { priceOnRequest: false }, true, projMixed.id);
  await service.updateConfiguration(cfg3Bhk.id, { priceOnRequest: false }, true, projMixed.id);

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Creating a configuration with priceOnRequest = true and a reference
  // price -> reference price stored internally, hidden publicly.
  // ---------------------------------------------------------------------------
  const cfgPorWithRef = await service.createConfiguration(projMixed.id, {
    name: '5 BHK Presidential',
    bedroomCount: 5,
    carpetArea: 3000,
    builtUpArea: 3600,
    superBuiltUpArea: 4500,
    price: 45000000,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: true,
  });
  assert.equal(cfgPorWithRef.price, 45000000, 'Staff creation response preserves internal reference price');
  assert.equal(cfgPorWithRef.priceOnRequest, true);

  const publicConfigsList = await service.getConfigurationsByProjectId(projMixed.id, false);
  const pubCfgWithRef = publicConfigsList.find(c => c.id === cfgPorWithRef.id);
  assert.ok(pubCfgWithRef);
  assert.equal(pubCfgWithRef.priceOnRequest, true);
  assert.equal(pubCfgWithRef.price, 0, 'Public configuration response hides reference price');
  assert.equal(pubCfgWithRef.effectivePricePerSqft, 0);
  console.log('✔ [Scenario 7] Creating PoR configuration with reference price stores internally and hides publicly');

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Creating a configuration with priceOnRequest = true and no reference
  // price -> stored safely, displayed as PoR, never ₹0.
  // ---------------------------------------------------------------------------
  const cfgPorNoRef = await service.createConfiguration(projMixed.id, {
    name: 'Duplex Villa PoR No Price',
    bedroomCount: 5,
    carpetArea: 3400,
    builtUpArea: 4000,
    superBuiltUpArea: 5000,
    price: null,
    priceBasis: 'CARPET_AREA',
    priceOnRequest: true,
  });
  assert.equal(cfgPorNoRef.price, 0);
  assert.equal(cfgPorNoRef.effectivePricePerSqft, 0);
  assert.equal(cfgPorNoRef.priceOnRequest, true);

  const areaInfoNoRef = getConfigurationCardAreaInfo(cfgPorNoRef);
  assert.equal(areaInfoNoRef.rateDisplay, null, 'PoR configuration with 0 sentinel price must never produce a rateDisplay');

  const ssrPorHtml = renderToStaticMarkup(
    React.createElement(NewBookingSection, {
      configurations: [
        {
          id: cfgPorNoRef.id,
          configurationId: cfgPorNoRef.id,
          name: cfgPorNoRef.name,
          bedroomCount: cfgPorNoRef.bedroomCount,
          carpetArea: cfgPorNoRef.carpetArea,
          builtUpArea: cfgPorNoRef.builtUpArea,
          superBuiltUpArea: cfgPorNoRef.superBuiltUpArea,
          price: 0,
          priceBasis: 'CARPET_AREA',
          effectivePricePerSqft: 0,
          priceOnRequest: true,
          availabilityStatus: 'AVAILABLE',
          lastVerifiedAt: new Date().toISOString(),
        },
      ],
    })
  );
  assert.ok(ssrPorHtml.includes('Price on Request'), 'SSR must render Price on Request');
  assert.ok(!ssrPorHtml.includes('₹0'), 'SSR must never render ₹0');
  assert.ok(!ssrPorHtml.includes('Rate on Request'), 'SSR must not render Rate on Request for PoR configurations');
  console.log('✔ [Scenario 8] Creating PoR configuration without reference price stores safely as 0 and never renders ₹0');

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Editing an existing configuration to enable PoR -> existing price preserved.
  // ---------------------------------------------------------------------------
  const beforeEnablePor = await configRepo.findById(cfg2Bhk.id);
  assert.equal(beforeEnablePor?.price, 8500000);

  const enabledPorDto = await service.updateConfiguration(
    cfg2Bhk.id,
    { priceOnRequest: true },
    true,
    projMixed.id
  );
  assert.equal(enabledPorDto.priceOnRequest, true);
  assert.equal(enabledPorDto.price, 8500000, 'Existing internal price must remain preserved when enabling PoR');
  const storedAfterEnable = await configRepo.findById(cfg2Bhk.id);
  assert.equal(storedAfterEnable?.price, 8500000);
  console.log('✔ [Scenario 9] Editing an existing configuration to enable PoR preserves its internal price');

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Editing an existing PoR configuration to disable PoR -> requires valid price > 0.
  // ---------------------------------------------------------------------------
  // 10a: Disabling PoR on cfg2Bhk (which already has internal price 8500000) succeeds automatically
  const disabledPorWithExistingPrice = await service.updateConfiguration(
    cfg2Bhk.id,
    { priceOnRequest: false },
    true,
    projMixed.id
  );
  assert.equal(disabledPorWithExistingPrice.priceOnRequest, false);
  assert.equal(disabledPorWithExistingPrice.price, 8500000);

  // 10b: Disabling PoR on cfgPorNoRef (which has internal sentinel price 0) without providing a positive price must throw ValidationError
  await assert.rejects(
    async () => {
      await service.updateConfiguration(
        cfgPorNoRef.id,
        { priceOnRequest: false },
        true,
        projMixed.id
      );
    },
    ValidationError,
    'Disabling PoR when stored price is 0 must require a valid positive price'
  );

  // 10c: Disabling PoR on cfgPorNoRef while providing a valid positive price succeeds
  const disabledPorWithNewPrice = await service.updateConfiguration(
    cfgPorNoRef.id,
    { priceOnRequest: false, price: 38000000 },
    true,
    projMixed.id
  );
  assert.equal(disabledPorWithNewPrice.priceOnRequest, false);
  assert.equal(disabledPorWithNewPrice.price, 38000000);
  console.log('✔ [Scenario 10] Disabling PoR requires a valid positive price (> 0) and rejects 0/missing price');

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Editing configuration areas, priceBasis, and price still works (Phase 4H.2 regression check).
  // ---------------------------------------------------------------------------
  const updated6Fields = await service.updateConfiguration(
    cfg3Bhk.id,
    {
      name: '3 BHK Imperial Updated',
      bedroomCount: 3,
      carpetArea: 1300,
      builtUpArea: 1550,
      superBuiltUpArea: 1900,
      priceBasis: 'SUPER_BUILT_UP_AREA',
      price: 13300000,
    },
    true,
    projMixed.id
  );
  assert.equal(updated6Fields.name, '3 BHK Imperial Updated');
  assert.equal(updated6Fields.carpetArea, 1300);
  assert.equal(updated6Fields.builtUpArea, 1550);
  assert.equal(updated6Fields.superBuiltUpArea, 1900);
  assert.equal(updated6Fields.priceBasis, 'SUPER_BUILT_UP_AREA');
  assert.equal(updated6Fields.price, 13300000);
  assert.equal(updated6Fields.effectivePricePerSqft, 7000);
  console.log('✔ [Scenario 11] Phase 4H.2 regression check: editing areas, priceBasis, and price works seamlessly');

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Public getProjectById and getConfigurationsByProjectId do not leak hidden prices.
  // ---------------------------------------------------------------------------
  const pubCheck = await service.getProjectById(projMixed.id, false);
  assert.ok(pubCheck);
  const leaked4Bhk = pubCheck.configurations.find(c => c.id === cfg4BhkPor.id);
  const leaked5Bhk = pubCheck.configurations.find(c => c.id === cfgPorWithRef.id);
  assert.equal(leaked4Bhk?.price, 0);
  assert.equal(leaked4Bhk?.effectivePricePerSqft, 0);
  assert.equal(leaked5Bhk?.price, 0);
  assert.equal(leaked5Bhk?.effectivePricePerSqft, 0);

  const pubConfigsOnly = await service.getConfigurationsByProjectId(projMixed.id, false);
  const leaked4BhkDirect = pubConfigsOnly.find(c => c.id === cfg4BhkPor.id);
  assert.equal(leaked4BhkDirect?.price, 0);
  assert.equal(leaked4BhkDirect?.effectivePricePerSqft, 0);

  // Also test when entire project is marked PoR
  await service.updateProject(projMixed.id, { priceOnRequest: true }, true);
  const pubConfigsWhenProjPor = await service.getConfigurationsByProjectId(projMixed.id, false);
  for (const c of pubConfigsWhenProjPor) {
    assert.equal(c.priceOnRequest, true);
    assert.equal(c.price, 0, 'GET configurations on a PoR project must mask every configuration price for public callers');
    assert.equal(c.effectivePricePerSqft, 0);
  }
  await service.updateProject(projMixed.id, { priceOnRequest: false }, true);
  console.log('✔ [Scenario 12] Public project & configuration endpoints never leak hidden internal prices');

  // ---------------------------------------------------------------------------
  // SCENARIO 13: Budget filters do not match hidden PoR prices.
  // ---------------------------------------------------------------------------
  // Mark projNoConfigs (internal startingPrice 45,000,000, priceOnRequest=true) and verify budget filter excludes it
  const filteredByBudget = await service.listProjects(
    { minPrice: 1000000, maxPrice: 100000000 },
    false
  );
  const matchedPorProject = filteredByBudget.data.find(p => p.id === projNoConfigs.id);
  assert.equal(matchedPorProject, undefined, 'PoR project must never match minPrice/maxPrice budget filters');
  console.log('✔ [Scenario 13] Budget filters exclude hidden PoR prices');

  // ---------------------------------------------------------------------------
  // SCENARIO 14: Price sorting places PoR items last in both ascending and descending sorts.
  // ---------------------------------------------------------------------------
  const ascList = await service.listProjects(
    { sort: 'price:asc' },
    false
  );
  const descList = await service.listProjects(
    { sort: 'price:desc' },
    false
  );
  assert.equal(
    ascList.data[ascList.data.length - 1].id,
    projNoConfigs.id,
    'PoR project must sort last in price:asc'
  );
  assert.equal(
    descList.data[descList.data.length - 1].id,
    projNoConfigs.id,
    'PoR project must sort last in price:desc'
  );

  // Also verify comparePricesWithPorLast directly
  const sampleItems = [
    { id: 'por-1', price: 99000000, por: true },
    { id: 'high', price: 25000000, por: false },
    { id: 'por-zero', price: 0, por: false },
    { id: 'low', price: 8500000, por: false },
  ];
  const sortedSampleAsc = [...sampleItems].sort((a, b) =>
    comparePricesWithPorLast(a.price, b.price, 'asc', a.por, b.por)
  );
  assert.deepEqual(sortedSampleAsc.slice(0, 2).map(x => x.id), ['low', 'high']);
  const sortedSampleDesc = [...sampleItems].sort((a, b) =>
    comparePricesWithPorLast(a.price, b.price, 'desc', a.por, b.por)
  );
  assert.deepEqual(sortedSampleDesc.slice(0, 2).map(x => x.id), ['high', 'low']);
  console.log('✔ [Scenario 14] Price sorting places PoR items last in both ascending and descending sorts');

  // ---------------------------------------------------------------------------
  // SCENARIO 15: JSON-LD does not expose hidden prices.
  // ---------------------------------------------------------------------------
  const jsonLdPorHtml = renderToStaticMarkup(
    React.createElement(ProjectStructuredData, {
      project: pubNoConfigs,
    })
  );
  assert.ok(!jsonLdPorHtml.includes('AggregateOffer'), 'PoR project JSON-LD must omit AggregateOffer');
  assert.ok(!jsonLdPorHtml.includes('45000000'), 'PoR project JSON-LD must never leak internal startingPrice');

  const jsonLdMixedHtml = renderToStaticMarkup(
    React.createElement(ProjectStructuredData, {
      project: pubMixed,
    })
  );
  assert.ok(jsonLdMixedHtml.includes('AggregateOffer'), 'Mixed project with visible prices includes AggregateOffer');
  assert.ok(jsonLdMixedHtml.includes('8500000'), 'Mixed project JSON-LD includes visible lowPrice');
  assert.ok(!jsonLdMixedHtml.includes('25200000'), 'Mixed project JSON-LD must never leak PoR 4 BHK price (25200000)');
  console.log('✔ [Scenario 15] JSON-LD omits AggregateOffer for PoR projects and never exposes hidden PoR prices');

  console.log('\n===================================================================');
  console.log('ALL 15 PHASE 4I-B PRICE ON REQUEST SCENARIOS PASSED SUCCESSFULLY!');
  console.log('===================================================================');
}

runPriceOnRequestSuite().catch(err => {
  console.error('Price on Request Test Suite Failed:', err);
  process.exit(1);
});
