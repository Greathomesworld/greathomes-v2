import { Pool } from 'pg';
import { projectIntelligenceService } from '../src/domain/projects/services/projectIntelligenceService.ts';
import {
  projectRepository,
  projectConfigurationRepository,
  projectMediaRepository,
} from '../src/infrastructure/repositories/projectProvider.ts';

async function runPhase06_4E_Tests() {
  console.log('================================================================');
  console.log('STARTING PHASE 06.4E — MULTI-IMAGE FLOOR PLAN GALLERY TEST SUITE');
  console.log('================================================================');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // 1. Fetch available projects and configurations
  const allProjects = await projectRepository.findAll();
  if (allProjects.length < 2) {
    throw new Error('Test requires at least 2 projects in database for cross-project isolation checks.');
  }

  const projectA = allProjects[0];
  const projectB = allProjects[1];

  console.log(`[SETUP] Project A: "${projectA.name}" (${projectA.id})`);
  console.log(`[SETUP] Project B: "${projectB.name}" (${projectB.id})`);

  let configsA: any[] = await projectConfigurationRepository.findByProjectId(projectA.id);
  if (configsA.length === 0) {
    const c1 = await projectIntelligenceService.createConfiguration(
      projectA.id,
      {
        name: '3 BHK Multi-Plan Suite',
        bedroomCount: 3,
        carpetArea: 1450,
        builtUpArea: 1720,
        price: 12500000,
        priceBasis: 'CARPET_AREA',
      },
      true
    );
    configsA = [c1];
  }

  const configA1 = configsA[0];

  let configsB: any[] = await projectConfigurationRepository.findByProjectId(projectB.id);
  if (configsB.length === 0) {
    const cB = await projectIntelligenceService.createConfiguration(
      projectB.id,
      {
        name: '2 BHK Project B Suite',
        bedroomCount: 2,
        carpetArea: 950,
        price: 7500000,
        priceBasis: 'CARPET_AREA',
      },
      true
    );
    configsB = [cB];
  }
  const configB1 = configsB[0];

  console.log(`[SETUP] Config A1 (Project A): "${configA1.name}" (${configA1.id})`);
  console.log(`[SETUP] Config B1 (Project B): "${configB1.name}" (${configB1.id})`);

  // Sample base64 1x1 valid PNG images
  const samplePngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // -------------------------------------------------------------------------
  // TEST 1: Cross-Project Isolation Protection
  // Attempting to upload or mutate floor plan for Config B1 under Project A endpoint
  // -------------------------------------------------------------------------
  console.log('\n[TEST 1] Testing cross-project configuration isolation...');
  const crossProjRes = await fetch(
    `http://localhost:3000/api/projects/${projectA.id}/configurations/${configB1.id}/floor-plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer SUPER_ADMIN',
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({ fileBase64: samplePngBase64 }),
    }
  );

  console.log(`[TEST 1] Dedicated endpoint cross-project status: ${crossProjRes.status} (expected: 400)`);
  if (crossProjRes.status !== 400) {
    throw new Error(`FAIL: Expected 400 rejection for cross-project configuration, got ${crossProjRes.status}`);
  }
  console.log('PASS: Cross-project configuration properly rejected with 400 Bad Request.');

  // Clean existing floor plan attachments for clean test state
  await pool.query("DELETE FROM project_media WHERE project_id = $1 AND category = 'FLOOR_PLANS'", [projectA.id]);
  await pool.query('UPDATE project_configurations SET floor_plan_media_id = NULL WHERE project_id = $1', [projectA.id]);

  // -------------------------------------------------------------------------
  // TEST 2: Single Floor Plan Upload (Initial Plan -> Automatically becomes Primary)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Uploading Plan 1 (Ground Layout)...');
  const uploadRes1 = await fetch(
    `http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer SUPER_ADMIN',
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({
        filename: 'ground-layout.png',
        altText: `${configA1.name} Ground Layout`,
        fileBase64: samplePngBase64,
      }),
    }
  );

  const uploadData1 = await uploadRes1.json();
  console.log(`[TEST 2] Upload 1 status: ${uploadRes1.status}, success: ${uploadData1.success}`);
  if (!uploadData1.success || !uploadData1.uploadedAssets?.[0]?.id) {
    throw new Error(`FAIL: Upload 1 failed: ${JSON.stringify(uploadData1)}`);
  }

  const plan1Id = uploadData1.uploadedAssets[0].id;
  console.log(`[TEST 2] Plan 1 MediaAsset.id: ${plan1Id}`);
  console.log(`[TEST 2] Returned primaryMediaId: ${uploadData1.primaryMediaId}`);

  if (uploadData1.primaryMediaId !== plan1Id) {
    throw new Error(`FAIL: First uploaded plan should automatically become primary! Expected "${plan1Id}", got "${uploadData1.primaryMediaId}"`);
  }

  // Verify in PostgreSQL
  const dbCheck1 = await pool.query('SELECT floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  if (dbCheck1.rows[0].floor_plan_media_id !== plan1Id) {
    throw new Error(`FAIL: PostgreSQL project_configurations.floor_plan_media_id "${dbCheck1.rows[0].floor_plan_media_id}" !== "${plan1Id}"`);
  }
  console.log('PASS: Initial floor plan upload automatically became Primary in PostgreSQL.');

  // -------------------------------------------------------------------------
  // TEST 3: Batch Multi-Image Upload (Additional Plans remain Secondary)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Uploading Plans 2 & 3 in batch (First Floor & 3D Isometric)...');
  const uploadRes2 = await fetch(
    `http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer SUPER_ADMIN',
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({
        files: [
          { filename: 'first-floor.png', altText: `${configA1.name} First Floor`, fileBase64: samplePngBase64 },
          { filename: '3d-isometric.png', altText: `${configA1.name} 3D Layout`, fileBase64: samplePngBase64 },
        ],
      }),
    }
  );

  const uploadData2 = await uploadRes2.json();
  console.log(`[TEST 3] Batch upload status: ${uploadRes2.status}, success: ${uploadData2.success}`);
  if (!uploadData2.success || uploadData2.uploadedAssets.length !== 2) {
    throw new Error(`FAIL: Batch upload failed: ${JSON.stringify(uploadData2)}`);
  }

  const plan2Id = uploadData2.uploadedAssets[0].id;
  const plan3Id = uploadData2.uploadedAssets[1].id;
  console.log(`[TEST 3] Plan 2 MediaAsset.id: ${plan2Id}`);
  console.log(`[TEST 3] Plan 3 MediaAsset.id: ${plan3Id}`);

  // Primary MUST remain Plan 1!
  if (uploadData2.primaryMediaId !== plan1Id) {
    throw new Error(`FAIL: Primary floor plan should NOT change when additional plans are uploaded! Expected "${plan1Id}", got "${uploadData2.primaryMediaId}"`);
  }

  // PostgreSQL check for 3 gallery items
  const pmDbCheck = await pool.query(
    "SELECT id, media_id, is_featured, sort_order FROM project_media WHERE configuration_id = $1 AND category = 'FLOOR_PLANS' ORDER BY sort_order ASC",
    [configA1.id]
  );
  console.log(`[TEST 3] Found ${pmDbCheck.rows.length} floor plan items in PostgreSQL project_media.`);
  if (pmDbCheck.rows.length !== 3) {
    throw new Error(`FAIL: Expected 3 floor plan items in project_media, found ${pmDbCheck.rows.length}`);
  }
  console.log('PASS: Batch multi-image upload successfully added secondary plans without overwriting primary.');

  // -------------------------------------------------------------------------
  // TEST 4: Public DTO & Floor Plan Viewer Resolution
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] Verifying Public DTO floorPlans array...');
  const publicProject = await projectIntelligenceService.getProjectById(projectA.id, true);
  const dtoConfigA1 = publicProject?.configurations.find((c) => c.id === configA1.id);

  if (!dtoConfigA1 || !dtoConfigA1.floorPlans) {
    throw new Error('FAIL: Public DTO configA1 or floorPlans array missing!');
  }

  console.log(`[TEST 4] dtoConfigA1.floorPlans count: ${dtoConfigA1.floorPlans.length}`);
  if (dtoConfigA1.floorPlans.length !== 3) {
    throw new Error(`FAIL: Expected 3 floor plans in public DTO, got ${dtoConfigA1.floorPlans.length}`);
  }

  const firstDtoPlanId = dtoConfigA1.floorPlans[0].mediaId || dtoConfigA1.floorPlans[0].id;
  if (firstDtoPlanId !== plan1Id) {
    throw new Error(`FAIL: Primary plan should be first in public DTO array! Expected "${plan1Id}", got "${firstDtoPlanId}"`);
  }
  console.log('PASS: Public DTO correctly exposes all 3 gallery floor plans with Primary first.');

  // -------------------------------------------------------------------------
  // TEST 5: Set Plan 2 as Primary (PATCH action = SET_PRIMARY)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Setting Plan 2 as Primary Layout...');
  const patchPrimaryRes = await fetch(
    `http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer SUPER_ADMIN',
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({
        action: 'SET_PRIMARY',
        mediaId: plan2Id,
      }),
    }
  );

  const patchPrimaryData = await patchPrimaryRes.json();
  console.log(`[TEST 5] Set primary status: ${patchPrimaryRes.status}, success: ${patchPrimaryData.success}`);
  if (!patchPrimaryData.success || patchPrimaryData.primaryMediaId !== plan2Id) {
    throw new Error(`FAIL: Set primary failed: ${JSON.stringify(patchPrimaryData)}`);
  }

  // PostgreSQL verification
  const dbCheckPrimary = await pool.query('SELECT floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  if (dbCheckPrimary.rows[0].floor_plan_media_id !== plan2Id) {
    throw new Error(`FAIL: PostgreSQL floor_plan_media_id is "${dbCheckPrimary.rows[0].floor_plan_media_id}", expected "${plan2Id}"`);
  }
  console.log('PASS: Primary floor plan successfully updated to Plan 2 in PostgreSQL.');

  // -------------------------------------------------------------------------
  // TEST 6: Reorder Floor Plans (PATCH action = REORDER)
  // Order: Plan 3 (sort 0), Plan 2 (sort 1), Plan 1 (sort 2)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] Reordering floor plans (3 -> 2 -> 1)...');
  const patchReorderRes = await fetch(
    `http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer SUPER_ADMIN',
        'x-staff-role': 'SUPER_ADMIN',
      },
      body: JSON.stringify({
        action: 'REORDER',
        items: [
          { mediaId: plan3Id, sortOrder: 0 },
          { mediaId: plan2Id, sortOrder: 1 },
          { mediaId: plan1Id, sortOrder: 2 },
        ],
      }),
    }
  );

  const patchReorderData = await patchReorderRes.json();
  console.log(`[TEST 6] Reorder status: ${patchReorderRes.status}, success: ${patchReorderData.success}`);
  if (!patchReorderData.success) {
    throw new Error(`FAIL: Reorder failed: ${JSON.stringify(patchReorderData)}`);
  }
  console.log('PASS: Reordering persisted successfully.');

  // -------------------------------------------------------------------------
  // TEST 7: Delete Primary Floor Plan (Plan 2) -> Automatic Promotion of Next Plan
  // -------------------------------------------------------------------------
  console.log('\n[TEST 7] Deleting Primary Plan 2 (verifying automatic promotion)...');
  const deletePrimaryRes = await fetch(
    `http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan?mediaId=${plan2Id}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: 'Bearer SUPER_ADMIN',
        'x-staff-role': 'SUPER_ADMIN',
      },
    }
  );

  const deletePrimaryData = await deletePrimaryRes.json();
  console.log(`[TEST 7] Delete primary status: ${deletePrimaryRes.status}, success: ${deletePrimaryData.success}`);
  if (!deletePrimaryData.success) {
    throw new Error(`FAIL: Delete primary failed: ${JSON.stringify(deletePrimaryData)}`);
  }

  // Next plan in sortOrder is Plan 3 (sortOrder 0). Verify Plan 3 is now primary!
  const dbCheckPromoted = await pool.query('SELECT floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  const newPrimaryId = dbCheckPromoted.rows[0].floor_plan_media_id;
  console.log(`[TEST 7] PostgreSQL new floor_plan_media_id after primary deletion: "${newPrimaryId}" (expected "${plan3Id}")`);

  if (newPrimaryId !== plan3Id) {
    throw new Error(`FAIL: Automatic promotion failed! Expected "${plan3Id}", got "${newPrimaryId}"`);
  }
  console.log('PASS: Deleting primary plan automatically promoted next remaining plan (Plan 3) to Primary.');

  // -------------------------------------------------------------------------
  // TEST 8: Delete Remaining Plans until Empty -> Reset to NULL
  // -------------------------------------------------------------------------
  console.log('\n[TEST 8] Deleting remaining Plan 1 and Plan 3...');
  await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan?mediaId=${plan1Id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer SUPER_ADMIN', 'x-staff-role': 'SUPER_ADMIN' },
  });

  await fetch(`http://localhost:3000/api/projects/${projectA.id}/configurations/${configA1.id}/floor-plan?mediaId=${plan3Id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer SUPER_ADMIN', 'x-staff-role': 'SUPER_ADMIN' },
  });

  const dbCheckEmpty = await pool.query('SELECT floor_plan_media_id FROM project_configurations WHERE id = $1', [configA1.id]);
  console.log(`[TEST 8] Final floor_plan_media_id after deleting all plans: ${dbCheckEmpty.rows[0].floor_plan_media_id}`);

  if (dbCheckEmpty.rows[0].floor_plan_media_id !== null) {
    throw new Error(`FAIL: floor_plan_media_id should be NULL when all plans are deleted, got "${dbCheckEmpty.rows[0].floor_plan_media_id}"`);
  }
  console.log('PASS: Deleting all floor plans cleanly reset floor_plan_media_id to NULL.');

  // -------------------------------------------------------------------------
  // TEST 9: Audit Log Verification
  // -------------------------------------------------------------------------
  console.log('\n[TEST 9] Checking audit_logs records...');
  const auditCheck = await pool.query(
    "SELECT action, resource_type, resource_id, success FROM audit_logs WHERE resource_type = 'CONFIGURATION_FLOOR_PLAN' AND resource_id = $1 ORDER BY created_at DESC LIMIT 10",
    [configA1.id]
  );

  console.log(`[TEST 9] Found ${auditCheck.rows.length} audit entries for config ${configA1.id}`);
  for (const row of auditCheck.rows) {
    console.log(`  - Action: ${row.action}, Type: ${row.resource_type}, Success: ${row.success}`);
  }

  if (auditCheck.rows.length === 0) {
    throw new Error('FAIL: No audit log records found for floor plan lifecycle!');
  }
  console.log('PASS: Authoritative audit trail verified.');

  await pool.end();
  console.log('\n================================================================');
  console.log('ALL PHASE 06.4E TESTS PASSED SUCCESSFULLY (100% PASS)');
  console.log('================================================================\n');
}

runPhase06_4E_Tests().catch((err) => {
  console.error('\n*** TEST FAILED ***\n', err);
  process.exit(1);
});
