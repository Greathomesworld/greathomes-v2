import assert from 'assert';
import { marketIntelligenceDashboardService } from '../src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService.js';

async function runForensicAudit() {
  console.log('------------------------------------------------------------');
  console.log('GREAT HOMES V2 — PHASE 15.6 FORENSIC AUDIT & SECURITY AUDIT');
  console.log('------------------------------------------------------------');

  const dto = await marketIntelligenceDashboardService.getDashboardData();

  // 1. Check for prohibited terms in DTO data
  const dtoStr = JSON.stringify(dto).toLowerCase();
  const prohibitedTerms = [
    'best location', 'top location', 'winner', '#1 location', 'most investable',
    'best investment', 'high growth', 'fastest growing', 'undervalued', 'overvalued',
    'strong buy', 'buy now', 'expected appreciation', 'predicted price', 'investment score',
    'location score', 'market score'
  ];

  for (const term of prohibitedTerms) {
    assert.strictEqual(dtoStr.includes(term), false, `Forensic Audit: Prohibited term "${term}" must not appear in dashboard DTO`);
    console.log(`[PASS] Prohibited term check absent: "${term}"`);
  }

  // 2. Privacy & Boundary Audit
  assert.strictEqual(dtoStr.includes('ownerphone'), false, 'Privacy: ownerPhone absent');
  assert.strictEqual(dtoStr.includes('owneremail'), false, 'Privacy: ownerEmail absent');
  assert.strictEqual(dtoStr.includes('brokerphone'), false, 'Privacy: brokerPhone absent');
  assert.strictEqual(dtoStr.includes('database_url'), false, 'Privacy: database credentials absent');
  console.log('[PASS] Privacy & sensitive data boundaries strictly enforced.');

  console.log('------------------------------------------------------------');
  console.log('PHASE 15.6 FORENSIC AUDIT PASSED SUCCESSFULLY.');
  console.log('------------------------------------------------------------');
}

runForensicAudit().catch(err => {
  console.error('Forensic audit failed:', err);
  process.exit(1);
});
