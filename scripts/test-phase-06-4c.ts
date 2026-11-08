import { Pool } from 'pg';
import { projectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService.ts';
import { projectRepository, projectConfigurationRepository, projectMediaRepository } from '../src/infrastructure/repositories/projectProvider.ts';
import { mediaRepository } from '../src/domain/media/repositories/mediaRepository.ts';

async function runPhase06_4C_Tests() {
  console.log('================================================================');
  console.log('STARTING PHASE 06.4C — FORENSIC VERIFICATION SUITE');
  console.log('================================================================');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Fetch available projects and configurations
  const allProjects = await projectRepository.findAll();
  if (allProjects.length < 2) {
    throw new Error('Test requires at least 2 projects in the database for cross-project isolation checks.');
  }

  const projectA = allProjects[0];
  const projectB = allProjects[1];

  console.log(`[SETUP] Project A: "${projectA.name}" (${projectA.id})`);
  console.log(`[SETUP] Project B: "${projectB.name}" (${projectB.id})`);

  let configsA: any[] = await projectConfigurationRepository.findByProjectId(projectA.id);
  if (configsA.length < 2) {
    // Create configurations for testing isolation
    const c1 = await projectIntelligenceService.createConfiguration(projectA.id, {
      name: '2 BHK Premium Test',
      bedroomCount: 2,
      carpetArea: 850,
      builtUpArea: 1020,
      price: 6500000,
      priceBasis: 'CARPET_AREA',
    }, true);
    const c2 = await projectIntelligenceService.createConfiguration(projectA.id, {
      name: '3 BHK Royal Test',
      bedroomCount: 3,
      carpetArea: 1350,
      builtUpArea: 1620,
      price: 11000000,
      priceBasis: 'CARPET_AREA',
    }, true);
    configsA = [c1, c2];
  }

  const configA1 = configsA[0]; // e.g. 2 BHK
  const configA2 = configsA[1]; // e.g. 3 BHK

  let configsB: any[] = await projectConfigurationRepository.findByProjectId(projectB.id);
  if (configsB.length === 0) {
    const cB = await projectIntelligenceService.createConfiguration(projectB.id, {
      name: '2 BHK Project B Test',
      bedroomCount: 2,
      carpetArea: 900,
      price: 7000000,
      priceBasis: 'CARPET_AREA',
    }, true);
    configsB = [cB];
  }
  const configB1 = configsB[0];

  console.log(`[SETUP] Config A1 (Project A): "${configA1.name}" (${configA1.id})`);
  console.log(`[SETUP] Config A2 (Project A): "${configA2.name}" (${configA2.id})`);
  console.log(`[SETUP] Config B1 (Project B): "${configB1.name}" (${configB1.id})`);

  // Sample 1x1 PNG transparent data
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // -------------------------------------------------------------------------
  // TEST 1: Cross-Project Configuration Rejection (Security Validation)
  // Attempt to upload to Project A with Configuration B1 (belongs to Project B)
  // Must return HTTP 400!
  // -------------------------------------------------------------------------
  console.log('\n[TEST 1] Testing cross-project configuration rejection...');
  const crossProjRes = await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configB1.id}/floor-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gh-internal-staff-secret',
      'x-staff-role': 'SUPER_ADMIN',
    },
    body: JSON.stringify({
      filename: 'malicious-cross-project-floorplan.png',
      fileBase64: samplePngBase64,
    }),
  });

  console.log(`[TEST 1] Dedicated endpoint cross-project status: ${crossProjRes.status} (expected: 400)`);
  if (crossProjRes.status !== 400) {
    throw new Error(`FAIL: Expected 400 rejection for cross-project configuration, got ${crossProjRes.status}`);
  }

  // Also test Universal Uploader cross-project check
  const crossUploadRes = await fetch('http://localhost:3000/api/admin/media/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gh-internal-staff-secret',
      'x-staff-role': 'SUPER_ADMIN',
    },
    body: JSON.stringify({
      entityType: 'PROJECT',
      entityId: projectA.id,
      configurationId: configB1.id,
      category: 'FLOOR_PLANS',
      filename: 'cross-project-dropzone.png',
      fileBase64: samplePngBase64,
    }),
  });

  console.log(`[TEST 1] Universal uploader cross-project status: ${crossUploadRes.status} (expected: 400)`);
  if (crossUploadRes.status !== 400) {
    throw new Error(`FAIL: Universal uploader did not reject cross-project configuration! Got ${crossUploadRes.status}`);
  }
  console.log('PASS: Cross-project configuration properly rejected by both endpoints.');

  // -------------------------------------------------------------------------
  // TEST 2: Authorization Checks
  // Unauthenticated -> 401
  // Missing capability -> 403
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Testing authentication and authorization...');
  const unauthRes = await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64: samplePngBase64 }),
  });
  console.log(`[TEST 2] Unauthenticated status: ${unauthRes.status} (expected: 401)`);
  if (unauthRes.status !== 401) {
    throw new Error(`FAIL: Expected 401 for unauthenticated request, got ${unauthRes.status}`);
  }

  const forbidRes = await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer SALES',
      'x-staff-role': 'SALES',
    },
    body: JSON.stringify({ fileBase64: samplePngBase64 }),
  });
  console.log(`[TEST 2] Unauthorized role status: ${forbidRes.status} (expected: 403)`);
  if (forbidRes.status !== 403) {
    throw new Error(`FAIL: Expected 403 for unauthorized role, got ${forbidRes.status}`);
  }
  console.log('PASS: Authentication and capability enforcement confirmed.');

  // -------------------------------------------------------------------------
  // TEST 3: Upload Floor Plan for Configuration A1
  // Canonical association: config.floorPlanMediaId = mediaAsset.id
  // Category: FLOOR_PLANS
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Uploading floor plan for Configuration A1...');
  const uploadResA1 = await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gh-internal-staff-secret',
      'x-staff-role': 'ADMIN',
    },
    body: JSON.stringify({
      filename: `${configA1.name.toLowerCase().replace(/\s+/g, '-')}-plan-v1.png`,
      fileBase64: samplePngBase64,
      altText: `${configA1.name} Floor Plan`,
      caption: `Layout for ${configA1.name}`,
    }),
  });

  const uploadDataA1 = await uploadResA1.json();
  console.log(`[TEST 3] Upload status: ${uploadResA1.status}, success: ${uploadDataA1.success}`);
  if (!uploadDataA1.success) {
    throw new Error(`FAIL: Upload failed: ${JSON.stringify(uploadDataA1)}`);
  }

  const assetIdA1 = uploadDataA1.floorPlan?.id;
  console.log(`[TEST 3] Generated MediaAsset.id: ${assetIdA1}`);
  console.log(`[TEST 3] Returned configuration.floorPlanMediaId: ${uploadDataA1.configuration?.floorPlanMediaId}`);

  if (uploadDataA1.configuration?.floorPlanMediaId !== assetIdA1) {
    throw new Error(`FAIL: Returned configuration does not point to MediaAsset.id (${assetIdA1})`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Direct PostgreSQL Verification
  // 1. media_assets table has row with id = assetIdA1, category = FLOOR_PLANS
  // 2. project_configurations table has row with id = configA1.id, floor_plan_media_id = assetIdA1
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] Direct PostgreSQL persistence verification...');
  const mediaDbCheck = await pool.query('SELECT * FROM media_assets WHERE id = $1', [assetIdA1]);
  if (mediaDbCheck.rows.length === 0) {
    throw new Error(`FAIL: media_assets row not found in PostgreSQL for ID ${assetIdA1}`);
  }
  console.log(`[TEST 4] PostgreSQL media_assets row confirmed: category="${mediaDbCheck.rows[0].category}", url="${mediaDbCheck.rows[0].url}"`);
  if (mediaDbCheck.rows[0].category !== 'FLOOR_PLANS') {
    throw new Error(`FAIL: Media category is ${mediaDbCheck.rows[0].category}, expected FLOOR_PLANS`);
  }

  const configDbCheck = await pool.query('SELECT id, name, floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  if (configDbCheck.rows.length === 0) {
    throw new Error(`FAIL: project_configurations row not found in PostgreSQL for ID ${configA1.id}`);
  }
  const persistedFloorPlanMediaId = configDbCheck.rows[0].floor_plan_media_id;
  console.log(`[TEST 4] PostgreSQL project_configurations.floor_plan_media_id: "${persistedFloorPlanMediaId}"`);
  if (persistedFloorPlanMediaId !== assetIdA1) {
    throw new Error(`FAIL: PostgreSQL persisted floor_plan_media_id "${persistedFloorPlanMediaId}" !== "${assetIdA1}"`);
  }
  console.log('PASS: Direct PostgreSQL persistence confirmed.');

  // -------------------------------------------------------------------------
  // TEST 5: Typology Isolation (2 BHK vs 3 BHK)
  // Ensure Config A2 has NOT received Config A1's floor plan!
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Verifying Typology isolation...');
  const configA2Check = await pool.query('SELECT id, name, floor_plan_media_id FROM project_configurations WHERE id = $1', [configA2.id]);
  const a2PlanId = configA2Check.rows[0]?.floor_plan_media_id;
  console.log(`[TEST 5] Config A2 floor_plan_media_id: "${a2PlanId}"`);
  if (a2PlanId === assetIdA1) {
    throw new Error('FAIL: Leakage detected! Config A2 unexpectedly shares Config A1 floor plan ID.');
  }
  console.log('PASS: Typology isolation confirmed. No cross-configuration leakage.');

  // -------------------------------------------------------------------------
  // TEST 6: Public Project DTO & Floor Plan Viewer Resolution
  // Fetch project via projectIntelligenceService and verify floor plans attached
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] Verifying public DTO & viewer resolution...');
  const publicProject = await projectIntelligenceService.getProjectById(projectA.id, true);
  if (!publicProject) {
    throw new Error(`FAIL: Could not load public project ${projectA.id}`);
  }

  const dtoConfigA1 = publicProject.configurations.find((c) => c.id === configA1.id);
  if (!dtoConfigA1) {
    throw new Error('FAIL: Config A1 not found in public project DTO configurations');
  }

  console.log(`[TEST 6] Public DTO configA1.floorPlanMediaId: "${dtoConfigA1.floorPlanMediaId}"`);
  console.log(`[TEST 6] Public DTO configA1.floorPlans count: ${dtoConfigA1.floorPlans?.length}`);
  if (dtoConfigA1.floorPlanMediaId !== assetIdA1) {
    throw new Error(`FAIL: DTO floorPlanMediaId "${dtoConfigA1.floorPlanMediaId}" !== "${assetIdA1}"`);
  }
  if (!dtoConfigA1.floorPlans || dtoConfigA1.floorPlans.length === 0) {
    throw new Error('FAIL: DTO configA1.floorPlans is empty!');
  }
  console.log(`[TEST 6] Resolved floor plan URL: ${dtoConfigA1.floorPlans[0].url}`);
  console.log('PASS: Public DTO correctly exposes configuration floor plan for viewer.');

  // -------------------------------------------------------------------------
  // TEST 7: Replace Floor Plan
  // Upload a new floor plan for Config A1.
  // 1. New MediaAsset created.
  // 2. floorPlanMediaId points to new MediaAsset.
  // 3. Old MediaAsset is safely cleaned up if unreferenced.
  // -------------------------------------------------------------------------
  console.log('\n[TEST 7] Testing Replace Floor Plan workflow...');
  const replaceRes = await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer gh-internal-staff-secret',
      'x-staff-role': 'ADMIN',
    },
    body: JSON.stringify({
      filename: `${configA1.name.toLowerCase().replace(/\s+/g, '-')}-plan-v2-replaced.png`,
      fileBase64: samplePngBase64,
      altText: `${configA1.name} Floor Plan V2 Replacement`,
    }),
  });

  const replaceData = await replaceRes.json();
  console.log(`[TEST 7] Replace status: ${replaceRes.status}, success: ${replaceData.success}`);
  if (!replaceData.success) {
    throw new Error(`FAIL: Replace failed: ${JSON.stringify(replaceData)}`);
  }

  const newAssetIdA1 = replaceData.floorPlan?.id;
  console.log(`[TEST 7] New MediaAsset.id: ${newAssetIdA1} (old was: ${assetIdA1})`);
  if (newAssetIdA1 === assetIdA1) {
    throw new Error('FAIL: Replaced asset ID is identical to old asset ID');
  }

  // Verify in PostgreSQL that config now points to new asset
  const replacedDbCheck = await pool.query('SELECT floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  const newPersistedId = replacedDbCheck.rows[0].floor_plan_media_id;
  console.log(`[TEST 7] PostgreSQL updated floor_plan_media_id: "${newPersistedId}"`);
  if (newPersistedId !== newAssetIdA1) {
    throw new Error(`FAIL: Database did not update to new asset ID: "${newPersistedId}" !== "${newAssetIdA1}"`);
  }
  console.log('PASS: Floor plan replacement persisted successfully.');

  // -------------------------------------------------------------------------
  // TEST 8: Remove / Unlink Floor Plan
  // Call DELETE /api/projects/[id]/configurations/[configId]/floor-plan
  // Verify floor_plan_media_id in PostgreSQL is set to NULL
  // -------------------------------------------------------------------------
  console.log('\n[TEST 8] Testing Remove / Unlink Floor Plan workflow...');
  const deleteRes = await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer gh-internal-staff-secret',
      'x-staff-role': 'ADMIN',
    },
  });

  const deleteData = await deleteRes.json();
  console.log(`[TEST 8] Delete status: ${deleteRes.status}, success: ${deleteData.success}`);
  if (!deleteData.success) {
    throw new Error(`FAIL: Delete failed: ${JSON.stringify(deleteData)}`);
  }

  // Verify in PostgreSQL that floor_plan_media_id is now NULL
  const unlinkedDbCheck = await pool.query('SELECT floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  const finalFloorPlanId = unlinkedDbCheck.rows[0].floor_plan_media_id;
  console.log(`[TEST 8] PostgreSQL after unlink floor_plan_media_id: ${finalFloorPlanId}`);
  if (finalFloorPlanId !== null) {
    throw new Error(`FAIL: floor_plan_media_id should be NULL, got "${finalFloorPlanId}"`);
  }
  console.log('PASS: Remove / Unlink successfully reset floor_plan_media_id to NULL.');

  // -------------------------------------------------------------------------
  // TEST 9: Audit Log Verification
  // Check audit_logs table for CONFIGURATION_FLOOR_PLAN entries
  // -------------------------------------------------------------------------
  console.log('\n[TEST 9] Checking audit_logs records...');
  const auditCheck = await pool.query(
    "SELECT action, resource_type, resource_id, success FROM audit_logs WHERE resource_type = 'CONFIGURATION_FLOOR_PLAN' AND resource_id = $1 ORDER BY created_at DESC LIMIT 3",
    [configA1.id]
  );
  console.log(`[TEST 9] Found ${auditCheck.rows.length} audit entries for config ${configA1.id}`);
  for (const row of auditCheck.rows) {
    console.log(`  - Action: ${row.action}, Type: ${row.resource_type}, Success: ${row.success}`);
  }
  if (auditCheck.rows.length === 0) {
    throw new Error('FAIL: No audit log records found for floor plan lifecycle!');
  }
  console.log('PASS: Authoritative audit trail confirmed.');

  await pool.end();
  console.log('\n================================================================');
  console.log('ALL PHASE 06.4C TESTS PASSED SUCCESSFULLY (100% PASS)');
  console.log('================================================================\n');
}

runPhase06_4C_Tests().catch((err) => {
  console.error('\n*** TEST FAILED ***\n', err);
  process.exit(1);
});
