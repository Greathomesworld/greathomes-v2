import { marketIntelligenceDashboardService } from '../src/domain/marketIntelligence/dashboard/marketIntelligenceDashboardService.js';

async function runBenchmark() {
  console.log('------------------------------------------------------------');
  console.log('GREAT HOMES V2 — PHASE 15.6 PERFORMANCE BENCHMARK');
  console.log('------------------------------------------------------------');

  const iterations = 10;
  const latencies = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await marketIntelligenceDashboardService.getDashboardData({
      locationSlug: 'kolkata',
      scope: 'DESCENDANT',
      basis: 'CARPET_AREA'
    });
    const end = performance.now();
    latencies.push(end - start);
  }

  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / iterations;
  const p50 = latencies[Math.floor(iterations * 0.5)];
  const p95 = latencies[Math.floor(iterations * 0.95)] || latencies[latencies.length - 1];
  const p99 = latencies[Math.floor(iterations * 0.99)] || latencies[latencies.length - 1];

  console.log(`Benchmark Results (${iterations} runs):`);
  console.log(`Average: ${avg.toFixed(2)} ms`);
  console.log(`p50:     ${p50.toFixed(2)} ms`);
  console.log(`p95:     ${p95.toFixed(2)} ms`);
  console.log(`p99:     ${p99.toFixed(2)} ms`);
  console.log('------------------------------------------------------------');
  console.log('PHASE 15.6 PERFORMANCE BENCHMARK COMPLETED.');
  console.log('------------------------------------------------------------');
}

runBenchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
