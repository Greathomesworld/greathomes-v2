import assert from 'node:assert/strict';
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
  DuplicateSlugError,
  DuplicateConfigurationError,
  NotFoundError,
} from '../services/projectIntelligenceService';
import { calculateEffectivePricePerSqft, deriveProjectPricingSummary } from '../dto/projectDto';

async function runProjectIntelligenceTests() {
  console.log('Running Project Intelligence Core Foundation Tests...');

  const projectRepo = new ProjectRepositoryMemory();
  const configRepo = new ProjectConfigurationRepositoryMemory();
  const mediaRepo = new ProjectMediaRepositoryMemory();
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

  // Setup prerequisites: Location hierarchy & Developer
  const state = await locRepo.create({
    name: 'West Bengal',
    slug: 'west-bengal',
    type: 'STATE',
    status: 'PUBLISHED',
    featured: true,
  });

  const city = await locRepo.create({
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    parentId: state.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const area = await locRepo.create({
    name: 'Rajarhat',
    slug: 'rajarhat',
    type: 'AREA',
    parentId: city.id,
    status: 'PUBLISHED',
    featured: true,
  });

  const developer = await devRepo.create({
    name: 'Merlin Group',
    slug: 'merlin-group',
    shortDescription: 'Leading real estate developer',
    description: 'Premier developer with over 3 decades of experience.',
    websiteUrl: 'https://merlingroup.com',
    status: 'PUBLISHED',
    featured: true,
  });

  // 1. Create Valid Project
  const project1 = await service.createProject({
    developerId: developer.id,
    locationId: area.id,
    name: 'Merlin Rise',
    slug: 'merlin-rise',
    shortDescription: 'East Kolkata sports enclave',
    description: '15-acre sports themed residential project',
    status: 'UNDER_CONSTRUCTION',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 4800000,
    featured: true,
    reraStatus: 'VERIFIED',
    reraRegistrationNumber: 'WBRERA/P/NOR/2023/000123',
  });

  assert.ok(project1.id, 'Project should have an ID');
  assert.equal(project1.name, 'Merlin Rise');
  assert.equal(project1.slug, 'merlin-rise');
  assert.equal(project1.lifecycleStatus, 'PUBLISHED');
  console.log('✔ 1. Project creation passed');

  // 2. Reject empty name
  await assert.rejects(
    async () => {
      await service.createProject({
        developerId: developer.id,
        locationId: area.id,
        name: '   ',
        slug: 'empty-name',
        status: 'UNDER_CONSTRUCTION',
        propertyType: 'APARTMENT',
      });
    },
    ValidationError,
    'Should reject empty project name'
  );
  console.log('✔ 2. Required name validation passed');

  // 3. Reject invalid slug format
  await assert.rejects(
    async () => {
      await service.createProject({
        developerId: developer.id,
        locationId: area.id,
        name: 'Invalid Slug Project',
        slug: 'INVALID SLUG WITH SPACES',
        status: 'UNDER_CONSTRUCTION',
        propertyType: 'APARTMENT',
      });
    },
    ValidationError,
    'Should reject uppercase or spaced slug'
  );
  console.log('✔ 3. Slug format validation passed');

  // 4. Reject duplicate slug
  await assert.rejects(
    async () => {
      await service.createProject({
        developerId: developer.id,
        locationId: area.id,
        name: 'Duplicate Rise',
        slug: 'merlin-rise',
        status: 'UNDER_CONSTRUCTION',
        propertyType: 'APARTMENT',
      });
    },
    DuplicateSlugError,
    'Should reject duplicate slug'
  );
  console.log('✔ 4. Duplicate slug rejection passed');

  // 5. Reject non-existent developer ID
  await assert.rejects(
    async () => {
      await service.createProject({
        developerId: 'non-existent-dev-999',
        locationId: area.id,
        name: 'Ghost Builder Project',
        slug: 'ghost-project',
        status: 'UNDER_CONSTRUCTION',
        propertyType: 'APARTMENT',
      });
    },
    ValidationError,
    'Should reject invalid developerId'
  );
  console.log('✔ 5. Foreign developer check passed');

  // 6. Reject non-existent location ID
  await assert.rejects(
    async () => {
      await service.createProject({
        developerId: developer.id,
        locationId: 'non-existent-loc-999',
        name: 'Ghost Location Project',
        slug: 'ghost-loc-project',
        status: 'UNDER_CONSTRUCTION',
        propertyType: 'APARTMENT',
      });
    },
    ValidationError,
    'Should reject invalid locationId'
  );
  console.log('✔ 6. Foreign location check passed');

  // 7. Calculate effective price per sq ft pure unit math
  const rateCarpet = calculateEffectivePricePerSqft(4800000, 'CARPET_AREA', { carpetArea: 640 });
  assert.equal(rateCarpet, 7500, 'Effective rate should be price / carpet area (4800000 / 640 = 7500)');

  const rateBuiltUp = calculateEffectivePricePerSqft(4800000, 'BUILT_UP_AREA', { builtUpArea: 800 });
  assert.equal(rateBuiltUp, 6000, 'Effective rate should be price / builtUp area (4800000 / 800 = 6000)');

  // Missing required area throws error
  assert.throws(
    () => {
      calculateEffectivePricePerSqft(4800000, 'CARPET_AREA', { carpetArea: null });
    },
    ValidationError,
    'Should throw ValidationError if carpet area is missing when priceBasis is CARPET_AREA'
  );
  console.log('✔ 7. Effective rate derivation & basis validation passed');

  // 8. Create configurations for Project
  const config1 = await service.createConfiguration(project1.id, {
    name: '2 BHK Classic',
    bedroomCount: 2,
    carpetArea: 640,
    builtUpArea: 780,
    superBuiltUpArea: 950,
    price: 4800000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });

  assert.equal(config1.effectivePricePerSqft, 7500);
  assert.equal(config1.price, 4800000);

  const config2 = await service.createConfiguration(project1.id, {
    name: '3 BHK Grande',
    bedroomCount: 3,
    carpetArea: 890,
    builtUpArea: 1080,
    superBuiltUpArea: 1320,
    price: 6800000,
    priceBasis: 'CARPET_AREA',
    availability: 'AVAILABLE',
  });
  console.log('✔ 8. Configuration creation passed');

  // 9. Duplicate configuration detection
  await assert.rejects(
    async () => {
      await service.createConfiguration(project1.id, {
        name: '2 BHK Classic',
        carpetArea: 650,
        price: 4900000,
        priceBasis: 'CARPET_AREA',
      });
    },
    DuplicateConfigurationError,
    'Should reject duplicate configuration name within same project'
  );
  console.log('✔ 9. Duplicate configuration detection passed');

  // 10. Pricing summary derivation: lowest typology price takes precedence over manual project starting price
  const projectWithHigherManualPrice = { ...project1, startingPrice: 5700000 };
  const rawConfigs = await configRepo.findByProjectId(project1.id);
  const summary = deriveProjectPricingSummary(projectWithHigherManualPrice, rawConfigs);
  assert.equal(summary.startingPrice, 4800000, 'Typology minimum (48L) must override higher manual project price (57L)');
  assert.equal(summary.maximumPrice, 6800000);
  assert.equal(summary.lowestEffectivePricePerSqft, 7500);
  console.log('✔ 10. Pricing summary derivation (typology minimum precedence over manual project price) passed');

  // 11. RERA VERIFIED badge enforcement
  const publicDto = await service.getProjectById(project1.id);
  assert.ok(publicDto);
  assert.equal(publicDto.rera.hasVerifiedReraBadge, true, 'VERIFIED rera status must yield hasVerifiedReraBadge: true');

  // Create project with PROVIDED RERA status (not verified)
  const projectProvided = await service.createProject({
    developerId: developer.id,
    locationId: area.id,
    name: 'Merlin Elements',
    slug: 'merlin-elements',
    status: 'COMPLETED',
    lifecycleStatus: 'PUBLISHED',
    propertyType: 'APARTMENT',
    startingPrice: 9200000,
    reraStatus: 'PROVIDED',
    reraRegistrationNumber: 'WBRERA/P/KOL/2022/000789',
  });

  const publicDtoProvided = await service.getProjectById(projectProvided.id);
  assert.ok(publicDtoProvided);
  assert.equal(
    publicDtoProvided.rera.hasVerifiedReraBadge,
    false,
    'PROVIDED RERA status must NOT yield hasVerifiedReraBadge: true'
  );
  assert.equal(publicDtoProvided.rera.registrationNumber, 'WBRERA/P/KOL/2022/000789');
  console.log('✔ 11. Strict RERA VERIFIED badge rule verified');

  // 12. Public vs Staff Visibility
  const draftProject = await service.createProject({
    developerId: developer.id,
    locationId: area.id,
    name: 'Secret Villa Draft',
    slug: 'secret-villa-draft',
    status: 'UPCOMING',
    lifecycleStatus: 'DRAFT',
    propertyType: 'VILLA',
    startingPrice: 25000000,
  });

  // Anonymous user should NOT see draft project
  const anonFind = await service.getProjectById(draftProject.id, false);
  assert.equal(anonFind, null, 'Anonymous public user must not see DRAFT project by id');

  const anonSlugFind = await service.getProjectBySlug('secret-villa-draft', false);
  assert.equal(anonSlugFind, null, 'Anonymous public user must not see DRAFT project by slug');

  // Internal staff CAN see draft project
  const staffFind = await service.getProjectById(draftProject.id, true);
  assert.ok(staffFind, 'Internal staff must be able to view DRAFT project');
  console.log('✔ 12. Public visibility enforcement passed');

  // 13. Location Hierarchy Path Resolution
  assert.ok(publicDto.location.path);
  assert.equal(publicDto.location.path.length, 3);
  assert.equal(publicDto.location.path[0].name, 'West Bengal');
  assert.equal(publicDto.location.path[1].name, 'Kolkata');
  assert.equal(publicDto.location.path[2].name, 'Rajarhat');
  console.log('✔ 13. Location hierarchy path resolution passed');

  // 14. Bounded Developer Shape
  assert.deepEqual(Object.keys(publicDto.developer).sort(), ['description', 'id', 'logoUrl', 'name', 'shortDescription', 'slug']);
  console.log('✔ 14. Bounded developer shape verified');

  // 15. Consistency check
  const consistency = await service.checkConsistency(project1.id);
  assert.equal(consistency.isConsistent, true);
  assert.equal(consistency.issues.length, 0);
  console.log('✔ 15. Project relational consistency check passed');

  console.log('All Project Intelligence Foundation Tests Passed Successfully! 🎉');
}

runProjectIntelligenceTests().catch(err => {
  console.error('Test failure:', err);
  process.exit(1);
});
