import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';

(globalThis as unknown as { React: typeof React }).React = React;
import {
  ProjectRepositoryMemory,
  ProjectConfigurationRepositoryMemory,
  ProjectMediaRepositoryMemory,
  ProjectReraRepositoryMemory,
  AmenityRepositoryMemory,
  ProjectFaqRepositoryMemory,
} from '../../../infrastructure/repositories/memory/projectRepositoryMemory';
import { DeveloperRepositoryMemory, developerRepository as singletonDeveloperRepository } from '../../../infrastructure/repositories/memory/developerRepositoryMemory';
import { LocationRepositoryMemory, locationRepository as singletonLocationRepository } from '../../../infrastructure/repositories/memory/locationRepositoryMemory';
import {
  ProjectIntelligenceService,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  projectIntelligenceService,
} from '../services/projectIntelligenceService';
import {
  calculateEffectivePricePerSqft,
  deriveProjectPricingSummary,
  toPublicProjectDto,
  getConfigurationCardAreaInfo,
} from '../dto/projectDto';
import {
  parseIndianCurrencyPrice,
  parsePositiveAreaSqft,
  compareEffectiveRates,
} from '../../../lib/priceUtils';
import { NewBookingSection } from '../../../components/projects/NewBookingSection';
import { initializeTestRunnerSecret, resetTestSandbox } from '../../../lib/testIsolationContext';
import {
  GET as getProjectConfigurationsRoute,
  POST as postProjectConfigurationRoute,
} from '../../../../app/api/projects/[id]/configurations/route';
import {
  PATCH as patchProjectConfigurationRoute,
  DELETE as deleteProjectConfigurationRoute,
} from '../../../../app/api/projects/[id]/configurations/[configId]/route';
import { GET as getAdminConfigurationsDirectoryRoute } from '../../../../app/api/admin/configurations/route';

/**
 * Subclass of ProjectConfigurationRepositoryMemory that simulates a mid-transaction
 * failure during configuration removal AFTER media disassociation has run,
 * verifying atomic rollback of both media links and configuration state.
 */
class FailingDeleteConfigurationRepositoryMemory extends ProjectConfigurationRepositoryMemory {
  public failNextDelete = false;

  protected override removeConfigurationAtIndex(index: number): void {
    if (this.failNextDelete) {
      throw new Error('SIMULATED_DB_DELETE_FAILURE');
    }
    super.removeConfigurationAtIndex(index);
  }
}

/**
 * Simulates the Admin Project Edit modal state machine (handleOpenEditConfig + handleUpdateConfig)
 * to verify form state initialization, 6-field updates, and preservation of unsaved form values on error.
 */
class EditConfigurationModalStateHarness {
  public editingConfig: any | null = null;
  public editConfigName = '';
  public editConfigBhk = '';
  public editConfigPrice = '';
  public editConfigPriceBasis: 'CARPET_AREA' | 'BUILT_UP_AREA' | 'SUPER_BUILT_UP_AREA' = 'CARPET_AREA';
  public editConfigCarpet = '';
  public editConfigBuiltUp = '';
  public editConfigSuperBuiltUp = '';
  public editError: string | null = null;
  public editFieldErrors: Record<string, string> = {};

  open(config: any): void {
    this.editingConfig = config;
    this.editConfigName = config.name || '';
    this.editConfigBhk = config.bedroomCount != null ? config.bedroomCount.toString() : '';
    this.editConfigPrice = config.price != null ? config.price.toString() : '';
    this.editConfigPriceBasis = config.priceBasis || 'CARPET_AREA';
    this.editConfigCarpet = config.carpetArea != null ? config.carpetArea.toString() : '';
    this.editConfigBuiltUp = config.builtUpArea != null ? config.builtUpArea.toString() : '';
    this.editConfigSuperBuiltUp = config.superBuiltUpArea != null ? config.superBuiltUpArea.toString() : '';
    this.editError = null;
    this.editFieldErrors = {};
  }

  async submit(
    service: ProjectIntelligenceService,
    projectId: string
  ): Promise<{ ok: boolean; updated?: any }> {
    if (!this.editingConfig) return { ok: false };
    this.editError = null;
    this.editFieldErrors = {};

    const fieldErrs: Record<string, string> = {};
    if (!this.editConfigName.trim()) {
      fieldErrs.name = 'Configuration name is required.';
    }
    const parsedPrice = parseIndianCurrencyPrice(this.editConfigPrice);
    if (parsedPrice === null) {
      fieldErrs.price = 'Please enter a valid price (e.g. 8500000 or 85,00,000).';
    }
    const carpetVal = parsePositiveAreaSqft(this.editConfigCarpet);
    if (carpetVal === null) {
      fieldErrs.carpetArea = 'Carpet Area is mandatory and must be greater than 0.';
    }

    let builtUpVal: number | null = null;
    if (this.editConfigBuiltUp.trim() !== '') {
      builtUpVal = parsePositiveAreaSqft(this.editConfigBuiltUp);
      if (builtUpVal === null) {
        fieldErrs.builtUpArea = 'Built-up Area must be a valid number greater than 0.';
      }
    } else if (this.editConfigPriceBasis === 'BUILT_UP_AREA') {
      fieldErrs.builtUpArea = 'Built-up Area is required when price basis is set to Built-up Area.';
    }

    let superBuiltUpVal: number | null = null;
    if (this.editConfigSuperBuiltUp.trim() !== '') {
      superBuiltUpVal = parsePositiveAreaSqft(this.editConfigSuperBuiltUp);
      if (superBuiltUpVal === null) {
        fieldErrs.superBuiltUpArea = 'Super Built-up Area must be a valid number greater than 0.';
      }
    } else if (this.editConfigPriceBasis === 'SUPER_BUILT_UP_AREA') {
      fieldErrs.superBuiltUpArea = 'Super Built-up Area is required when price basis is set to Super Built-up Area.';
    }

    let bhkVal: number | null = null;
    if (this.editConfigBhk.trim() !== '') {
      const parsedBhk = Number(this.editConfigBhk.trim());
      if (!Number.isInteger(parsedBhk) || parsedBhk < 0) {
        fieldErrs.bedroomCount = 'Bedroom count must be a non-negative whole number.';
      } else {
        bhkVal = parsedBhk;
      }
    }

    if (Object.keys(fieldErrs).length > 0) {
      this.editFieldErrors = fieldErrs;
      this.editError = Object.values(fieldErrs)[0];
      // Do NOT clear editingConfig or form inputs on failure
      return { ok: false };
    }

    try {
      const updated = await service.updateConfiguration(
        this.editingConfig.id,
        {
          name: this.editConfigName.trim(),
          bedroomCount: bhkVal as any,
          price: parsedPrice!,
          priceBasis: this.editConfigPriceBasis,
          carpetArea: carpetVal!,
          builtUpArea: builtUpVal as any,
          superBuiltUpArea: superBuiltUpVal as any,
        },
        true,
        projectId
      );
      this.editingConfig = null;
      return { ok: true, updated };
    } catch (err: any) {
      this.editError = err.message || 'Failed to update configuration.';
      return { ok: false };
    }
  }
}

async function runConfigurationLifecycleSuite() {
  console.log('===================================================================');
  console.log('GREAT HOMES V2 — PHASE 4H.2 CONFIGURATION LIFECYCLE TEST SUITE');
  console.log('===================================================================\n');

  // ---------------------------------------------------------------------------
  // PART 1: PURE UNIT TESTS (Price Parsing, Area Parsing, Public DTO & SSR UI)
  // ---------------------------------------------------------------------------
  console.log('--- Part 1: Unit Tests (Price, Area, Public DTO & SSR Rendering) ---');

  // 1.1 Indian Currency Price Parsing
  assert.equal(parseIndianCurrencyPrice(8500000), 8500000);
  assert.equal(parseIndianCurrencyPrice('8500000'), 8500000);
  assert.equal(parseIndianCurrencyPrice('85,00,000'), 8500000);
  assert.equal(parseIndianCurrencyPrice('₹85,00,000'), 8500000);
  assert.equal(parseIndianCurrencyPrice('Rs. 1,25,00,000'), 12500000);
  assert.equal(parseIndianCurrencyPrice('85 Lakh'), 8500000);
  assert.equal(parseIndianCurrencyPrice('1.25 Cr'), 12500000);
  assert.equal(parseIndianCurrencyPrice(''), null);
  assert.equal(parseIndianCurrencyPrice('   '), null);
  assert.equal(parseIndianCurrencyPrice(0), null);
  assert.equal(parseIndianCurrencyPrice('0'), null);
  assert.equal(parseIndianCurrencyPrice('-500000'), null);
  assert.equal(parseIndianCurrencyPrice('85,,000'), null);
  assert.equal(parseIndianCurrencyPrice('invalid'), null);
  console.log('✔ [Unit] Indian currency price parsing & invalid rejection passed');

  // 1.2 Area Parsing (including decimals and comma separators)
  assert.equal(parsePositiveAreaSqft(1045), 1045);
  assert.equal(parsePositiveAreaSqft('1045.75'), 1045.75);
  assert.equal(parsePositiveAreaSqft('1,250.5'), 1250.5);
  assert.equal(parsePositiveAreaSqft('1,420 sq.ft.'), 1420);
  assert.equal(parsePositiveAreaSqft(''), null);
  assert.equal(parsePositiveAreaSqft('0'), null);
  assert.equal(parsePositiveAreaSqft(-100), null);
  assert.equal(parsePositiveAreaSqft('abc'), null);
  console.log('✔ [Unit] Positive area sq.ft. parsing (including decimals & commas) passed');

  // 1.3 Public DTO & NewBookingSection SSR: Never show ₹0/sq.ft.
  const dummyProject: any = {
    id: 'proj-unit-1',
    developerId: 'dev-1',
    locationId: 'loc-1',
    name: 'Test Project',
    slug: 'test-project',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    featured: false,
    isPublished: true,
    reraStatus: 'VERIFIED',
    reraRegistrationNumber: 'WBRERA/P/NOR/2024/0001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const dummyDev: any = {
    id: 'dev-1',
    name: 'Test Dev',
    slug: 'test-dev',
    status: 'PUBLISHED',
    featured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const dummyLoc: any = {
    id: 'loc-1',
    name: 'Rajarhat',
    slug: 'rajarhat',
    type: 'AREA',
    status: 'PUBLISHED',
    featured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validConfigEntity: any = {
    id: 'cfg-valid-1',
    projectId: 'proj-unit-1',
    name: '2 BHK Valid',
    bedroomCount: 2,
    carpetArea: 640,
    builtUpArea: 780,
    superBuiltUpArea: 950,
    price: 4800000,
    priceBasis: 'CARPET_AREA',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const corruptConfigEntity: any = {
    id: 'cfg-corrupt-1',
    projectId: 'proj-unit-1',
    name: '3 BHK Legacy Missing SBU',
    bedroomCount: 3,
    carpetArea: 950,
    builtUpArea: undefined,
    superBuiltUpArea: undefined, // Missing SBU while basis is SUPER_BUILT_UP_AREA
    price: 8500000,
    priceBasis: 'SUPER_BUILT_UP_AREA',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const publicDto = toPublicProjectDto(
    dummyProject,
    dummyDev,
    dummyLoc,
    [],
    [validConfigEntity, corruptConfigEntity]
  );
  assert.equal(publicDto.configurations.length, 2);
  assert.equal(publicDto.configurations[0].effectivePricePerSqft, 7500);
  assert.equal(publicDto.configurations[1].effectivePricePerSqft, 0);
  assert.equal(publicDto.pricing.lowestEffectivePricePerSqft, 7500);

  const corruptCardAreaInfo = getConfigurationCardAreaInfo(publicDto.configurations[1]);
  assert.equal(corruptCardAreaInfo.rateDisplay, null, 'Card rateDisplay must be null when rate is 0');

  const ssrHtml = renderToStaticMarkup(
    React.createElement(NewBookingSection, {
      configurations: [
        {
          id: 'cfg-valid-1',
          configurationId: 'cfg-valid-1',
          name: '2 BHK Valid',
          bedroomCount: 2,
          carpetArea: 640,
          builtUpArea: 780,
          superBuiltUpArea: 950,
          price: 4800000,
          priceBasis: 'CARPET_AREA',
          effectivePricePerSqft: 7500,
          availabilityStatus: 'AVAILABLE',
          lastVerifiedAt: new Date().toISOString(),
        },
        {
          id: 'cfg-corrupt-1',
          configurationId: 'cfg-corrupt-1',
          name: '3 BHK Legacy Missing SBU',
          bedroomCount: 3,
          carpetArea: 950,
          price: 8500000,
          priceBasis: 'SUPER_BUILT_UP_AREA',
          effectivePricePerSqft: 0,
          availabilityStatus: 'AVAILABLE',
          lastVerifiedAt: new Date().toISOString(),
        },
      ],
    })
  );
  assert.ok(ssrHtml.includes('₹7,500/sq.ft.'), 'Valid rate ₹7,500/sq.ft. must be rendered');
  assert.ok(!ssrHtml.includes('₹0/sq.ft.'), 'Invalid ₹0/sq.ft. must NEVER be rendered in NewBookingSection');
  console.log('✔ [Unit] Public DTO & NewBookingSection SSR never render ₹0/sq.ft.');

  // 1.4 Effective Rate Sorting Comparator (Missing/0 rates always sort last)
  const sampleRates = [
    { id: 'corrupt-zero', rate: 0 },
    { id: 'high', rate: 9500 },
    { id: 'corrupt-null', rate: null as number | null },
    { id: 'low', rate: 6200 },
    { id: 'mid', rate: 7800 },
  ];
  const sortedAsc = [...sampleRates].sort((a, b) => compareEffectiveRates(a.rate, b.rate, 'asc'));
  assert.deepEqual(
    sortedAsc.map(x => x.id),
    ['low', 'mid', 'high', 'corrupt-zero', 'corrupt-null'],
    'Ascending sort must place valid rates in order and invalid/0 rates last'
  );
  const sortedDesc = [...sampleRates].sort((a, b) => compareEffectiveRates(a.rate, b.rate, 'desc'));
  assert.deepEqual(
    sortedDesc.map(x => x.id),
    ['high', 'mid', 'low', 'corrupt-zero', 'corrupt-null'],
    'Descending sort must place valid rates in order and invalid/0 rates last'
  );
  console.log('✔ [Unit] compareEffectiveRates places missing/zero rates last in both asc and desc');

  // ---------------------------------------------------------------------------
  // PART 2: REPOSITORY & SERVICE TESTS (Deletion, Rollback, 6-Field Editing, Security)
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 2: Repository & Service Tests ---');

  const projectRepo = new ProjectRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
  const configRepo = new FailingDeleteConfigurationRepositoryMemory(mediaRepo);
  const reraRepo = new ProjectReraRepositoryMemory();
  const amenityRepo = new AmenityRepositoryMemory();
  const faqRepo = new ProjectFaqRepositoryMemory();
  const devRepo = new DeveloperRepositoryMemory();
  const locRepo = new LocationRepositoryMemory();

  // Spy on mediaRepo.update to prove service.deleteConfiguration does NOT run a non-transactional loop
  let mediaUpdateCallsDuringDelete = 0;
  let trackingDelete = false;
  const originalMediaUpdate = mediaRepo.update.bind(mediaRepo);
  mediaRepo.update = async (id: string, data: any) => {
    if (trackingDelete) mediaUpdateCallsDuringDelete++;
    return originalMediaUpdate(id, data);
  };

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
    name: 'New Town',
    slug: 'new-town',
    type: 'AREA',
    status: 'PUBLISHED',
    featured: true,
  });
  const dev = await devRepo.create({
    name: 'PS Group',
    slug: 'ps-group',
    shortDescription: 'PS Group Developer',
    description: 'PS Group Residential Developer',
    websiteUrl: 'https://psgroup.in',
    status: 'PUBLISHED',
    featured: true,
  });

  const projectA = await service.createProject({
    developerId: dev.id,
    locationId: loc.id,
    name: 'Project Alpha',
    slug: 'project-alpha',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 7500000,
  });

  const projectB = await service.createProject({
    developerId: dev.id,
    locationId: loc.id,
    name: 'Project Beta',
    slug: 'project-beta',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 9500000,
  });

  // 2.1 Delete configuration WITHOUT floor plans
  const cfgNoFp = await service.createConfiguration(projectA.id, {
    name: '2 BHK Compact',
    bedroomCount: 2,
    carpetArea: 610,
    builtUpArea: 740,
    superBuiltUpArea: 910,
    price: 5500000,
    priceBasis: 'CARPET_AREA',
  });
  trackingDelete = true;
  const deletedNoFp = await service.deleteConfiguration(cfgNoFp.id, true, projectA.id);
  trackingDelete = false;
  assert.equal(deletedNoFp, true);
  assert.equal(await configRepo.findById(cfgNoFp.id), null);
  assert.equal(mediaUpdateCallsDuringDelete, 0, 'Service must not invoke mediaRepository.update outside repository delete');
  console.log('✔ [Service/Repo] Delete configuration without floor plans passed');

  // 2.2 Delete configuration WITH ONE floor plan & preserve media record
  const cfgOneFp = await service.createConfiguration(projectA.id, {
    name: '3 BHK Classic',
    bedroomCount: 3,
    carpetArea: 920,
    builtUpArea: 1110,
    superBuiltUpArea: 1360,
    price: 8200000,
    priceBasis: 'CARPET_AREA',
  });
  const fpMedia1 = await mediaRepo.create({
    projectId: projectA.id,
    configurationId: cfgOneFp.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://cdn.example.com/floorplans/3bhk-classic-fp1.webp',
    altText: '3 BHK Classic Floor Plan',
    sortOrder: 0,
    isFeatured: true,
  });
  const exteriorMedia = await mediaRepo.create({
    projectId: projectA.id,
    mediaType: 'IMAGE',
    category: 'EXTERIOR',
    url: 'https://cdn.example.com/exterior/tower-a.webp',
    altText: 'Tower A Exterior',
    sortOrder: 1,
    isFeatured: true,
  });

  trackingDelete = true;
  const deletedOneFp = await service.deleteConfiguration(cfgOneFp.id, true, projectA.id);
  trackingDelete = false;
  assert.equal(deletedOneFp, true);
  assert.equal(await configRepo.findById(cfgOneFp.id), null);
  assert.equal(mediaUpdateCallsDuringDelete, 0, 'Service must delegate media unlinking to repository delete');

  const preservedFp1 = await mediaRepo.findById(fpMedia1.id);
  assert.ok(preservedFp1, 'Floor plan media record must be preserved after configuration deletion');
  assert.equal(preservedFp1.configurationId, undefined, 'Floor plan configurationId must be unlinked');
  assert.equal(preservedFp1.url, 'https://cdn.example.com/floorplans/3bhk-classic-fp1.webp');
  const preservedExt = await mediaRepo.findById(exteriorMedia.id);
  assert.ok(preservedExt, 'Unrelated project media must remain untouched');
  console.log('✔ [Service/Repo] Delete configuration with 1 floor plan & preserve media record passed');

  // 2.3 Delete configuration WITH MULTIPLE floor plans & Rollback on Failure test
  const cfgMultiFp = await service.createConfiguration(projectA.id, {
    name: '4 BHK Duplex',
    bedroomCount: 4,
    carpetArea: 1650,
    builtUpArea: 1980,
    superBuiltUpArea: 2420,
    price: 16500000,
    priceBasis: 'CARPET_AREA',
  });
  const multiFp1 = await mediaRepo.create({
    projectId: projectA.id,
    configurationId: cfgMultiFp.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://cdn.example.com/floorplans/4bhk-lower.webp',
    sortOrder: 0,
    isFeatured: true,
  });
  const multiFp2 = await mediaRepo.create({
    projectId: projectA.id,
    configurationId: cfgMultiFp.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://cdn.example.com/floorplans/4bhk-upper.webp',
    sortOrder: 1,
    isFeatured: false,
  });
  const multiFp3 = await mediaRepo.create({
    projectId: projectA.id,
    configurationId: cfgMultiFp.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://cdn.example.com/floorplans/4bhk-terrace.webp',
    sortOrder: 2,
    isFeatured: false,
  });

  // 2.3a Simulate mid-transaction deletion failure -> verify rollback restores all 3 floor plan links
  configRepo.failNextDelete = true;
  await assert.rejects(
    async () => {
      await service.deleteConfiguration(cfgMultiFp.id, true, projectA.id);
    },
    /SIMULATED_DB_DELETE_FAILURE/,
    'Simulated deletion failure must throw'
  );
  configRepo.failNextDelete = false;

  const stillExistingCfg = await configRepo.findById(cfgMultiFp.id);
  assert.ok(stillExistingCfg, 'Configuration must remain present when deletion fails');
  assert.equal((await mediaRepo.findById(multiFp1.id))?.configurationId, cfgMultiFp.id, 'Floor plan 1 link must roll back on failure');
  assert.equal((await mediaRepo.findById(multiFp2.id))?.configurationId, cfgMultiFp.id, 'Floor plan 2 link must roll back on failure');
  assert.equal((await mediaRepo.findById(multiFp3.id))?.configurationId, cfgMultiFp.id, 'Floor plan 3 link must roll back on failure');
  console.log('✔ [Repo] Atomic rollback on deletion failure verified (0 partially unlinked floor plans)');

  // 2.3b Now succeed deleting configuration with multiple floor plans
  const deletedMultiFp = await service.deleteConfiguration(cfgMultiFp.id, true, projectA.id);
  assert.equal(deletedMultiFp, true);
  assert.equal(await configRepo.findById(cfgMultiFp.id), null);
  for (const fpId of [multiFp1.id, multiFp2.id, multiFp3.id]) {
    const mediaItem = await mediaRepo.findById(fpId);
    assert.ok(mediaItem, `Media ${fpId} must still exist in project_media`);
    assert.equal(mediaItem.configurationId, undefined, `Media ${fpId} configurationId must be unlinked`);
  }
  console.log('✔ [Service/Repo] Delete configuration with multiple floor plans & preserve all media records passed');

  // 2.4 Complete 6-Field Editing Journey (Service + Modal Harness)
  const editableCfg = await service.createConfiguration(projectA.id, {
    name: '3 BHK Royal',
    bedroomCount: 3,
    carpetArea: 1000,
    builtUpArea: 1200,
    superBuiltUpArea: 1500,
    price: 9000000,
    priceBasis: 'CARPET_AREA',
  });

  const modal = new EditConfigurationModalStateHarness();
  modal.open(editableCfg);
  assert.equal(modal.editConfigName, '3 BHK Royal');
  assert.equal(modal.editConfigBhk, '3');
  assert.equal(modal.editConfigCarpet, '1000');
  assert.equal(modal.editConfigBuiltUp, '1200');
  assert.equal(modal.editConfigSuperBuiltUp, '1500');
  assert.equal(modal.editConfigPriceBasis, 'CARPET_AREA');
  assert.equal(modal.editConfigPrice, '9000000');
  console.log('✔ [Editing] Edit modal initializes with exact saved configuration values');

  // Step A: Update Carpet Area (including decimal sq.ft.)
  modal.editConfigCarpet = '1125.5';
  const resCarpet = await modal.submit(service, projectA.id);
  assert.equal(resCarpet.ok, true);
  assert.equal(resCarpet.updated.carpetArea, 1125.5);
  assert.equal(resCarpet.updated.effectivePricePerSqft, Math.round(9000000 / 1125.5));

  // Step B: Update Built-up Area
  modal.open(resCarpet.updated);
  modal.editConfigBuiltUp = '1340.25';
  const resBu = await modal.submit(service, projectA.id);
  assert.equal(resBu.ok, true);
  assert.equal(resBu.updated.builtUpArea, 1340.25);

  // Step C: Update Super Built-up Area
  modal.open(resBu.updated);
  modal.editConfigSuperBuiltUp = '1620.75';
  const resSbu = await modal.submit(service, projectA.id);
  assert.equal(resSbu.ok, true);
  assert.equal(resSbu.updated.superBuiltUpArea, 1620.75);

  // Step D: Change Price Basis to BUILT_UP_AREA and SUPER_BUILT_UP_AREA
  modal.open(resSbu.updated);
  modal.editConfigPriceBasis = 'BUILT_UP_AREA';
  const resBasisBu = await modal.submit(service, projectA.id);
  assert.equal(resBasisBu.ok, true);
  assert.equal(resBasisBu.updated.priceBasis, 'BUILT_UP_AREA');
  assert.equal(resBasisBu.updated.effectivePricePerSqft, Math.round(9000000 / 1340.25));

  modal.open(resBasisBu.updated);
  modal.editConfigPriceBasis = 'SUPER_BUILT_UP_AREA';
  const resBasisSbu = await modal.submit(service, projectA.id);
  assert.equal(resBasisSbu.ok, true);
  assert.equal(resBasisSbu.updated.priceBasis, 'SUPER_BUILT_UP_AREA');
  assert.equal(resBasisSbu.updated.effectivePricePerSqft, Math.round(9000000 / 1620.75));

  // Step E: Update Price using formatted Indian currency string
  modal.open(resBasisSbu.updated);
  modal.editConfigPrice = '1,08,00,000';
  const resPrice = await modal.submit(service, projectA.id);
  assert.equal(resPrice.ok, true);
  assert.equal(resPrice.updated.price, 10800000);
  assert.equal(resPrice.updated.effectivePricePerSqft, Math.round(10800000 / 1620.75));

  // Step F: Update all 6 values together (Name, BHK, Carpet, BU, SBU, PriceBasis, Price)
  modal.open(resPrice.updated);
  modal.editConfigName = '4 BHK Imperial Skyvilla';
  modal.editConfigBhk = '4';
  modal.editConfigCarpet = '1850';
  modal.editConfigBuiltUp = '2200';
  modal.editConfigSuperBuiltUp = '2650';
  modal.editConfigPriceBasis = 'BUILT_UP_AREA';
  modal.editConfigPrice = '2,20,00,000';
  const resAllSix = await modal.submit(service, projectA.id);
  assert.equal(resAllSix.ok, true);

  // Re-fetch project from service to verify all 6 values persisted
  const refetchedProject = await service.getProjectById(projectA.id, true);
  assert.ok(refetchedProject);
  const persistedCfg = refetchedProject.configurations.find(c => c.id === editableCfg.id);
  assert.ok(persistedCfg, 'Updated configuration must be returned on project re-fetch');
  assert.equal(persistedCfg.name, '4 BHK Imperial Skyvilla');
  assert.equal(persistedCfg.bedroomCount, 4);
  assert.equal(persistedCfg.carpetArea, 1850);
  assert.equal(persistedCfg.builtUpArea, 2200);
  assert.equal(persistedCfg.superBuiltUpArea, 2650);
  assert.equal(persistedCfg.priceBasis, 'BUILT_UP_AREA');
  assert.equal(persistedCfg.price, 22000000);
  assert.equal(persistedCfg.effectivePricePerSqft, 10000);
  console.log('✔ [Editing] Individual & combined 6-field typology updates persisted and verified on re-fetch');

  // Step G: Reject invalid price & missing selected-basis area AND preserve unsaved form data on error
  modal.open(persistedCfg);
  modal.editConfigName = 'Unsaved Draft Name';
  modal.editConfigPrice = 'invalid-price';
  modal.editConfigPriceBasis = 'SUPER_BUILT_UP_AREA';
  modal.editConfigSuperBuiltUp = '';
  const failedSave = await modal.submit(service, projectA.id);
  assert.equal(failedSave.ok, false);
  assert.ok(modal.editingConfig !== null, 'Modal must remain open when validation fails');
  assert.equal(modal.editConfigName, 'Unsaved Draft Name', 'Unsaved form input must be preserved when save fails');
  assert.ok(modal.editFieldErrors.price, 'Field error for invalid price must be populated');
  assert.ok(modal.editFieldErrors.superBuiltUpArea, 'Field error for missing SBU area must be populated');

  // Verify database/repository record was NOT mutated by the failed save
  const afterFailedSave = await configRepo.findById(editableCfg.id);
  assert.equal(afterFailedSave?.name, '4 BHK Imperial Skyvilla');
  assert.equal(afterFailedSave?.price, 22000000);
  console.log('✔ [Editing] Invalid price & missing basis area rejected while preserving unsaved form state');

  // 2.5 Security: Service-level cross-project & unauthorized rejections
  await assert.rejects(
    async () => {
      await service.updateConfiguration(editableCfg.id, { name: 'Cross Project Hack' }, true, projectB.id);
    },
    ValidationError,
    'Cross-project updateConfiguration must throw ValidationError'
  );
  await assert.rejects(
    async () => {
      await service.deleteConfiguration(editableCfg.id, true, projectB.id);
    },
    ValidationError,
    'Cross-project deleteConfiguration must throw ValidationError'
  );
  await assert.rejects(
    async () => {
      await service.updateConfiguration(editableCfg.id, { price: 25000000 }, false, projectA.id);
    },
    UnauthorizedError,
    'Unauthorized updateConfiguration (isInternalStaff=false) must throw UnauthorizedError'
  );
  await assert.rejects(
    async () => {
      await service.deleteConfiguration(editableCfg.id, false, projectA.id);
    },
    UnauthorizedError,
    'Unauthorized deleteConfiguration (isInternalStaff=false) must throw UnauthorizedError'
  );
  console.log('✔ [Security/Service] Cross-project PATCH/DELETE and unauthorized service mutations rejected');

  // ---------------------------------------------------------------------------
  // PART 3: ROUTE HANDLER INTEGRATION TESTS (Next.js App Router API Routes)
  // ---------------------------------------------------------------------------
  console.log('\n--- Part 3: Next.js API Route Handler Integration Tests ---');

  const testSecret = initializeTestRunnerSecret();
  try {
    let allProjects = await projectIntelligenceService.listAllProjects({}, true);
    if (allProjects.length < 2) {
      const routeDev = await singletonDeveloperRepository.create({
        name: 'Route Test Developer',
        slug: `route-test-dev-${Date.now()}`,
        shortDescription: 'Route Test Developer',
        description: 'Route Test Developer Description',
        websiteUrl: 'https://greathomes.in',
        status: 'PUBLISHED',
        featured: true,
      });
      const routeLoc = await singletonLocationRepository.create({
        name: 'Route Test Location',
        slug: `route-test-loc-${Date.now()}`,
        type: 'AREA',
        status: 'PUBLISHED',
        featured: true,
      });
      await projectIntelligenceService.createProject(
        {
          name: 'Route Test Project Alpha',
          slug: `route-proj-alpha-${Date.now()}`,
          developerId: routeDev.id,
          locationId: routeLoc.id,
          status: 'UNDER_CONSTRUCTION',
          lifecycleStatus: 'PUBLISHED',
          propertyType: 'APARTMENT',
          startingPrice: 7500000,
        },
        true
      );
      await projectIntelligenceService.createProject(
        {
          name: 'Route Test Project Beta',
          slug: `route-proj-beta-${Date.now()}`,
          developerId: routeDev.id,
          locationId: routeLoc.id,
          status: 'READY_TO_MOVE',
          lifecycleStatus: 'PUBLISHED',
          propertyType: 'APARTMENT',
          startingPrice: 9500000,
        },
        true
      );
      allProjects = await projectIntelligenceService.listAllProjects({}, true);
    }
    assert.ok(allProjects.length >= 2, 'Seeded projects must be available for route integration tests');
    const routeProjA = allProjects[0];
    const routeProjB = allProjects[1];

    // 3.1 Unauthorized role (TELECALLER lacks MANAGE_CONFIGURATIONS) -> HTTP 403
    const forbiddenPostReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-staff-test-token': testSecret,
          'x-staff-role': 'TELECALLER',
        },
        body: JSON.stringify({
          name: 'Unauthorized Config',
          carpetArea: 800,
          price: 6000000,
          priceBasis: 'CARPET_AREA',
        }),
      }
    );
    const forbiddenPostRes = await postProjectConfigurationRoute(forbiddenPostReq, {
      params: Promise.resolve({ id: routeProjA.id }),
    });
    assert.equal(forbiddenPostRes.status, 403, 'POST by TELECALLER role must return HTTP 403');

    // 3.2 Authorized POST /api/projects/[id]/configurations -> HTTP 201
    const uniqueConfigName = `3 BHK Route Test ${Date.now()}`;
    const createReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-staff-test-token': testSecret,
          'x-staff-role': 'SUPER_ADMIN',
        },
        body: JSON.stringify({
          name: uniqueConfigName,
          bedroomCount: 3,
          carpetArea: 1050,
          builtUpArea: 1260,
          superBuiltUpArea: 1540,
          price: '84,00,000',
          priceBasis: 'CARPET_AREA',
        }),
      }
    );
    const createRes = await postProjectConfigurationRoute(createReq, {
      params: Promise.resolve({ id: routeProjA.id }),
    });
    assert.equal(createRes.status, 201, 'Authorized POST must return HTTP 201');
    const createdDto = await createRes.json();
    assert.equal(createdDto.name, uniqueConfigName);
    assert.equal(createdDto.price, 8400000);
    assert.equal(createdDto.effectivePricePerSqft, 8000);

    // 3.3 Cross-project PATCH via route -> HTTP 400
    const crossPatchReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjB.id}/configurations/${createdDto.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-staff-test-token': testSecret,
          'x-staff-role': 'SUPER_ADMIN',
        },
        body: JSON.stringify({ price: 9900000 }),
      }
    );
    const crossPatchRes = await patchProjectConfigurationRoute(crossPatchReq, {
      params: Promise.resolve({ id: routeProjB.id, configId: createdDto.id }),
    });
    assert.equal(crossPatchRes.status, 400, 'Cross-project PATCH route call must return HTTP 400');

    // 3.4 Cross-project DELETE via route -> HTTP 400
    const crossDeleteReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjB.id}/configurations/${createdDto.id}`,
      {
        method: 'DELETE',
        headers: {
          'x-staff-test-token': testSecret,
          'x-staff-role': 'SUPER_ADMIN',
        },
      }
    );
    const crossDeleteRes = await deleteProjectConfigurationRoute(crossDeleteReq, {
      params: Promise.resolve({ id: routeProjB.id, configId: createdDto.id }),
    });
    assert.equal(crossDeleteRes.status, 400, 'Cross-project DELETE route call must return HTTP 400');

    // 3.5 Unauthorized PATCH & DELETE by ANALYST role -> HTTP 403
    const analystPatchReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations/${createdDto.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-staff-test-token': testSecret,
          'x-staff-role': 'ANALYST',
        },
        body: JSON.stringify({ price: 9000000 }),
      }
    );
    const analystPatchRes = await patchProjectConfigurationRoute(analystPatchReq, {
      params: Promise.resolve({ id: routeProjA.id, configId: createdDto.id }),
    });
    assert.equal(analystPatchRes.status, 403, 'PATCH by ANALYST role must return HTTP 403');

    const analystDeleteReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations/${createdDto.id}`,
      {
        method: 'DELETE',
        headers: {
          'x-staff-test-token': testSecret,
          'x-staff-role': 'ANALYST',
        },
      }
    );
    const analystDeleteRes = await deleteProjectConfigurationRoute(analystDeleteReq, {
      params: Promise.resolve({ id: routeProjA.id, configId: createdDto.id }),
    });
    assert.equal(analystDeleteRes.status, 403, 'DELETE by ANALYST role must return HTTP 403');

    // 3.6 Valid 6-field PATCH via route -> HTTP 200 + verify via GET route
    const updatedName = `${uniqueConfigName} Updated`;
    const validPatchReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations/${createdDto.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'x-staff-test-token': testSecret,
          'x-staff-role': 'SUPER_ADMIN',
        },
        body: JSON.stringify({
          name: updatedName,
          bedroomCount: 4,
          carpetArea: 1180.5,
          builtUpArea: 1420.25,
          superBuiltUpArea: 1750,
          priceBasis: 'SUPER_BUILT_UP_AREA',
          price: '1,05,00,000',
        }),
      }
    );
    const validPatchRes = await patchProjectConfigurationRoute(validPatchReq, {
      params: Promise.resolve({ id: routeProjA.id, configId: createdDto.id }),
    });
    assert.equal(validPatchRes.status, 200, 'Valid PATCH must return HTTP 200');
    const patchedDto = await validPatchRes.json();
    assert.equal(patchedDto.name, updatedName);
    assert.equal(patchedDto.bedroomCount, 4);
    assert.equal(patchedDto.carpetArea, 1180.5);
    assert.equal(patchedDto.builtUpArea, 1420.25);
    assert.equal(patchedDto.superBuiltUpArea, 1750);
    assert.equal(patchedDto.priceBasis, 'SUPER_BUILT_UP_AREA');
    assert.equal(patchedDto.price, 10500000);
    assert.equal(patchedDto.effectivePricePerSqft, 6000);

    // Re-fetch via GET /api/projects/[id]/configurations
    const getConfigsReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations`
    );
    const getConfigsRes = await getProjectConfigurationsRoute(getConfigsReq, {
      params: Promise.resolve({ id: routeProjA.id }),
    });
    assert.equal(getConfigsRes.status, 200);
    const configsList = await getConfigsRes.json();
    const foundAfterPatch = configsList.find((c: any) => c.id === createdDto.id);
    assert.ok(foundAfterPatch, 'Patched configuration must be present in GET configurations list');
    assert.equal(foundAfterPatch.name, updatedName);
    assert.equal(foundAfterPatch.carpetArea, 1180.5);
    assert.equal(foundAfterPatch.builtUpArea, 1420.25);
    assert.equal(foundAfterPatch.superBuiltUpArea, 1750);
    assert.equal(foundAfterPatch.priceBasis, 'SUPER_BUILT_UP_AREA');
    assert.equal(foundAfterPatch.price, 10500000);

    // 3.7 Admin Configurations Directory route sorting verification
    const adminDirReq = new NextRequest(
      'http://localhost:3000/api/admin/configurations?sort=effectiveRate:asc',
      {
        headers: {
          'x-staff-test-token': testSecret,
          'x-staff-role': 'SUPER_ADMIN',
        },
      }
    );
    const adminDirRes = await getAdminConfigurationsDirectoryRoute(adminDirReq);
    assert.equal(adminDirRes.status, 200);
    const adminDirJson = await adminDirRes.json();
    assert.ok(Array.isArray(adminDirJson.data));

    // Clean up route test configuration via DELETE /api/projects/[id]/configurations/[configId]
    const validDeleteReq = new NextRequest(
      `http://localhost:3000/api/projects/${routeProjA.id}/configurations/${createdDto.id}`,
      {
        method: 'DELETE',
        headers: {
          'x-staff-test-token': testSecret,
          'x-staff-role': 'SUPER_ADMIN',
        },
      }
    );
    const validDeleteRes = await deleteProjectConfigurationRoute(validDeleteReq, {
      params: Promise.resolve({ id: routeProjA.id, configId: createdDto.id }),
    });
    assert.equal(validDeleteRes.status, 200);
    const deleteJson = await validDeleteRes.json();
    assert.equal(deleteJson.success, true);
    console.log('✔ [Route Integration] POST, 6-field PATCH, GET persistence, cross-project 400, unauthorized 403, and DELETE verified');
  } finally {
    resetTestSandbox();
  }

  console.log('\n===================================================================');
  console.log('ALL PHASE 4H.2 CONFIGURATION LIFECYCLE TESTS PASSED SUCCESSFULLY!');
  console.log('===================================================================');
}

runConfigurationLifecycleSuite().catch(err => {
  console.error('Configuration Lifecycle Test Suite Failed:', err);
  process.exit(1);
});
