import { performance } from 'perf_hooks';
import { getDb } from '../src/db/client.js';
import { marketIntelligenceService } from '../src/domain/marketIntelligence/services/marketIntelligenceService.js';
import { marketEventService } from '../src/domain/marketIntelligence/services/marketEventService.js';
import { locationComparisonService } from '../src/domain/locationComparison/locationComparisonService.js';
import { marketIntelligenceDashboardService } from '../src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService.js';

async function runBenchmark() {
  console.log('============================================================');
  console.log('GREAT HOMES V2 — PHASE 15.7 PERFORMANCE BENCHMARK');
  console.log('============================================================');

  const iterations = 50;
  const timings = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await marketIntelligenceDashboardService.getDashboardData();
    const end = performance.now();
    timings.push(end - start);
  }

  timings.sort((a, b) => a - b);
  const avg = timings.reduce((sum, t) => sum + t, 0) / timings.length;
  const p50 = timings[Math.floor(timings.length * 0.5)];
  const p95 = timings[Math.floor(timings.length * 0.95)];
  const p99 = timings[Math.floor(timings.length * 0.99)];

  console.log(`Iterations: ${iterations}`);
  console.log(`Average:    ${avg.toFixed(2)}ms`);
  console.log(`p50:        ${p50.toFixed(2)}ms`);
  console.log(`p95:        ${p95.toFixed(2)}ms`);
  console.log(`p99:        ${p99.toFixed(2)}ms`);

  console.log('------------------------------------------------------------');
  console.log('BENCHMARK EVALUATION:');
  if (p95 < 1000) {
    console.log('✅ PERFORMANCE BENCHMARK PASSED (p95 < 1000ms)');
  } else {
    console.log('⚠️ PERFORMANCE OBSERVATION (p95 >= 1000ms)');
  }
  console.log('============================================================');
}

runBenchmark().catch(console.error);
