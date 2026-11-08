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
import { ProjectIntelligenceService } from '../services/projectIntelligenceService';
import {
  sortConfigurations,
  formatConfigurationArea,
  formatStartingPrice,
  PublicProjectConfigurationDto,
} from '../dto/projectDto';

async function runTypologiesAndFloorPlanAudit() {
  console.log('--- STARTING PROJECT TYPOLOGIES & FLOOR PLAN VERIFICATION AUDIT ---');

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

  // Setup prerequisites
  const city = await locRepo.create({
    name: 'Kolkata',
    slug: 'kolkata',
    type: 'CITY',
    status: 'PUBLISHED',
    featured: true,
  });

  const dev = await devRepo.create({
    name: 'Merlin Group',
    slug: 'merlin-group',
    status: 'PUBLISHED',
    shortDescription: 'Premier real estate developer in Eastern India',
    description: 'Leading real estate developer known for luxury and standard developments.',
    websiteUrl: 'https://merlingroup.example.com',
    featured: true,
  });

  // Project 1: Multi-plan configurations (Merlin Rise)
  const rise = await projectRepo.create({
    developerId: dev.id,
    locationId: city.id,
    name: 'Merlin Rise',
    slug: 'merlin-rise',
    propertyType: 'APARTMENT',
    status: 'UNDER_CONSTRUCTION',
    projectArea: '15 Acres',
    towerCount: 7,
    totalUnits: 1200,
    floors: 'G+27',
    possession: 'DEC_2027',
    isPublished: true,
  });

  const rise2Bhk = await configRepo.create({
    projectId: rise.id,
    name: '2 BHK Classic',
    bedroomCount: 2,
    carpetArea: 640,
    builtUpArea: 780,
    superBuiltUpArea: 950,
    price: 4800000,
    priceBasis: 'CARPET_AREA',
  });

  const rise3Bhk = await configRepo.create({
    projectId: rise.id,
    name: '3 BHK Grande',
    bedroomCount: 3,
    carpetArea: 890,
    builtUpArea: 1080,
    superBuiltUpArea: 1320,
    price: 6800000,
    priceBasis: 'CARPET_AREA',
  });

  // Add 2 floor plans for 2 BHK
  await mediaRepo.create({
    projectId: rise.id,
    configurationId: rise2Bhk.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://images.unsplash.com/floor-2bhk-a.jpg',
    altText: '2 BHK Type A Layout',
    caption: '2 BHK Type A - Compact 640 sq.ft.',
    sortOrder: 1,
    isFeatured: true,
  });

  await mediaRepo.create({
    projectId: rise.id,
    configurationId: rise2Bhk.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://images.unsplash.com/floor-2bhk-b.jpg',
    altText: '2 BHK Type B Layout',
    caption: '2 BHK Type B - Extended 665 sq.ft.',
    sortOrder: 2,
    isFeatured: false,
  });

  // Add 3 floor plans for 3 BHK
  await mediaRepo.create({
    projectId: rise.id,
    configurationId: rise3Bhk.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://images.unsplash.com/floor-3bhk-a.jpg',
    altText: '3 BHK Type A Layout',
    caption: '3 BHK Type A - Master Suite 890 sq.ft.',
    sortOrder: 1,
    isFeatured: true,
  });

  await mediaRepo.create({
    projectId: rise.id,
    configurationId: rise3Bhk.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://images.unsplash.com/floor-3bhk-b.jpg',
    altText: '3 BHK Type B Layout',
    caption: '3 BHK Type B - Corner Suite 915 sq.ft.',
    sortOrder: 2,
    isFeatured: false,
  });

  await mediaRepo.create({
    projectId: rise.id,
    configurationId: rise3Bhk.id,
    mediaType: 'IMAGE',
    category: 'FLOOR_PLANS',
    url: 'https://images.unsplash.com/floor-3bhk-c.jpg',
    altText: '3 BHK Type C Layout',
    caption: '3 BHK Type C - Deck Residence 930 sq.ft.',
    sortOrder: 3,
    isFeatured: false,
  });

  // Project 2: Zero floor plans project (Merlin Elements)
  const elements = await projectRepo.create({
    developerId: dev.id,
    locationId: city.id,
    name: 'Merlin Elements',
    slug: 'merlin-elements',
    propertyType: 'APARTMENT',
    status: 'NEW_LAUNCH',
    isPublished: true,
  });

  await configRepo.create({
    projectId: elements.id,
    name: '3 BHK Premium',
    bedroomCount: 3,
    carpetArea: 1050,
    price: 8900000,
    priceBasis: 'CARPET_AREA',
  });

  // 1. Test DTO mapping and floor plan isolation on Merlin Rise
  console.log('Testing Merlin Rise Public Project DTO mapping...');
  const riseDto = await service.getProjectBySlug('merlin-rise');
  assert.ok(riseDto, 'Merlin Rise DTO must exist');
  assert.equal(riseDto.configurations.length, 2, 'Must have 2 configurations');

  const config2BhkDto = riseDto.configurations.find(c => c.name === '2 BHK Classic');
  assert.ok(config2BhkDto, '2 BHK Classic must exist in DTO');
  assert.equal(config2BhkDto.floorPlans?.length, 2, '2 BHK must have exactly 2 floor plans');
  assert.equal(config2BhkDto.floorPlans[0].url, 'https://images.unsplash.com/floor-2bhk-a.jpg');
  assert.equal(config2BhkDto.floorPlans[1].url, 'https://images.unsplash.com/floor-2bhk-b.jpg');

  const config3BhkDto = riseDto.configurations.find(c => c.name === '3 BHK Grande');
  assert.ok(config3BhkDto, '3 BHK Grande must exist in DTO');
  assert.equal(config3BhkDto.floorPlans?.length, 3, '3 BHK must have exactly 3 floor plans');
  assert.equal(config3BhkDto.floorPlans[0].url, 'https://images.unsplash.com/floor-3bhk-a.jpg');
  assert.equal(config3BhkDto.floorPlans[2].url, 'https://images.unsplash.com/floor-3bhk-c.jpg');

  // Verify floor plans are strictly isolated (no cross-contamination between configurations)
  const all2BhkUrls = config2BhkDto.floorPlans.map(f => f.url);
  const all3BhkUrls = config3BhkDto.floorPlans.map(f => f.url);
  for (const url of all2BhkUrls) {
    assert.ok(!all3BhkUrls.includes(url), `2 BHK plan ${url} must not appear in 3 BHK`);
  }

  // 2. Test Zero Floor Plans Fallback on Merlin Elements
  console.log('Testing Zero Floor Plans fallback on Merlin Elements...');
  const elementsDto = await service.getProjectBySlug('merlin-elements');
  assert.ok(elementsDto, 'Merlin Elements DTO must exist');
  assert.equal(elementsDto.configurations.length, 1);
  assert.deepEqual(elementsDto.configurations[0].floorPlans, [], 'Floor plans must be empty array for zero floor plans');

  // 3. Test sortConfigurations utility function
  console.log('Testing sortConfigurations utility...');
  const unsorted: PublicProjectConfigurationDto[] = [
    {
      id: '4bhk',
      name: '4 BHK Sky Villa',
      bedroomCount: 4,
      price: 25000000,
      priceBasis: 'CARPET_AREA',
      effectivePricePerSqft: 12500,
      availability: 'AVAILABLE',
    },
    {
      id: 'studio',
      name: 'Studio Apartment',
      bedroomCount: null,
      price: 3200000,
      priceBasis: 'CARPET_AREA',
      effectivePricePerSqft: 8000,
      availability: 'AVAILABLE',
    },
    {
      id: '2bhk',
      name: '2 BHK Compact',
      bedroomCount: 2,
      price: 5200000,
      priceBasis: 'CARPET_AREA',
      effectivePricePerSqft: 7500,
      availability: 'AVAILABLE',
    },
    {
      id: '3bhk',
      name: '3 BHK Grande',
      bedroomCount: 3,
      price: 8500000,
      priceBasis: 'CARPET_AREA',
      effectivePricePerSqft: 8500,
      availability: 'AVAILABLE',
    },
    {
      id: 'penthouse',
      name: 'Penthouse Residence',
      bedroomCount: null,
      price: 45000000,
      priceBasis: 'CARPET_AREA',
      effectivePricePerSqft: 18000,
      availability: 'AVAILABLE',
    },
  ];

  const sorted = sortConfigurations(unsorted);
  assert.equal(sorted[0].name, '2 BHK Compact');
  assert.equal(sorted[1].name, '3 BHK Grande');
  assert.equal(sorted[2].name, '4 BHK Sky Villa');
  assert.equal(sorted[3].name, 'Studio Apartment');
  assert.equal(sorted[4].name, 'Penthouse Residence');
  console.log('Deterministic sorting order:', sorted.map(s => s.name).join(' -> '));

  // 4. Test formatConfigurationArea utility
  console.log('Testing formatConfigurationArea utility...');
  const carpetConfig: PublicProjectConfigurationDto = {
    id: 'c1',
    name: '3 BHK',
    bedroomCount: 3,
    carpetArea: 890,
    builtUpArea: 1080,
    superBuiltUpArea: 1320,
    price: 6800000,
    priceBasis: 'CARPET_AREA',
    effectivePricePerSqft: 7640,
    availability: 'AVAILABLE',
  };
  const carpetAreaResult = formatConfigurationArea(carpetConfig, { includeBasis: true });
  assert.equal(carpetAreaResult.areaDisplay, '890 sq.ft. (Carpet Area)');
  assert.equal(carpetAreaResult.basisDisplay, 'Carpet Area');

  const sbuConfig: PublicProjectConfigurationDto = {
    id: 'c2',
    name: '3 BHK SBU',
    bedroomCount: 3,
    carpetArea: 890,
    builtUpArea: 1080,
    superBuiltUpArea: 1320,
    price: 6800000,
    priceBasis: 'SUPER_BUILT_UP_AREA',
    effectivePricePerSqft: 5151,
    availability: 'AVAILABLE',
  };
  const sbuAreaResult = formatConfigurationArea(sbuConfig, { includeBasis: true });
  assert.equal(sbuAreaResult.areaDisplay, '1,320 sq.ft. (Super Built-up)');
  assert.equal(sbuAreaResult.basisDisplay, 'Super Built-up');

  // 5. Test formatStartingPrice utility
  console.log('Testing formatStartingPrice utility...');
  assert.equal(formatStartingPrice(6800000), '₹68 L onwards');
  assert.equal(formatStartingPrice(12500000), '₹1.25 Cr onwards');
  assert.equal(formatStartingPrice(17500000), '₹1.75 Cr onwards');
  assert.equal(formatStartingPrice(0), 'Price on Request');
  assert.equal(formatStartingPrice(null), 'Price on Request');

  console.log('✅ ALL TYPOLOGIES & FLOOR PLAN AUDIT CHECKS PASSED PERFECTLY!');
}

runTypologiesAndFloorPlanAudit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
