const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runBenchmark() {
  console.log('====================================================');
  console.log('⚡ BENCHMARKING PHASE 15.4 LOCATION COMPARISON');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('====================================================\n');

  const scenarios = [
    { label: '2 Locations (Rajarhat vs New Town)', url: `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town` },
    { label: '3 Locations (Rajarhat, New Town, Salt Lake)', url: `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town,salt-lake` },
    { label: '4 Locations (Rajarhat, New Town, Salt Lake, EM Bypass)', url: `${BASE_URL}/api/compare/locations?locations=rajarhat,new-town,salt-lake,em-bypass` },
  ];

  const overallLatencies = [];

  for (const scenario of scenarios) {
    console.log(`Benchmarking ${scenario.label} (50 iterations)...`);
    const latencies = [];

    // Warm-up
    await fetch(scenario.url);

    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const res = await fetch(scenario.url);
      const elapsed = performance.now() - t0;
      if (res.status === 200) {
        latencies.push(elapsed);
        overallLatencies.push(elapsed);
      }
    }

    latencies.sort((a, b) => a - b);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.50)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`  - Mean: ${avg.toFixed(2)}ms | p50: ${p50.toFixed(2)}ms | p95: ${p95.toFixed(2)}ms | p99: ${p99.toFixed(2)}ms\n`);
  }

  overallLatencies.sort((a, b) => a - b);
  const totalAvg = overallLatencies.reduce((a, b) => a + b, 0) / overallLatencies.length;
  const overallP50 = overallLatencies[Math.floor(overallLatencies.length * 0.50)];
  const overallP95 = overallLatencies[Math.floor(overallLatencies.length * 0.95)];
  const overallP99 = overallLatencies[Math.floor(overallLatencies.length * 0.99)];

  console.log('====================================================');
  console.log('🏁 OVERALL BENCHMARK RESULTS (150 SAMPLES):');
  console.log(`  - Mean Average Latency: ${totalAvg.toFixed(2)}ms`);
  console.log(`  - p50 (Median Latency): ${overallP50.toFixed(2)}ms`);
  console.log(`  - p95 Latency:          ${overallP95.toFixed(2)}ms`);
  console.log(`  - p99 Latency:          ${overallP99.toFixed(2)}ms`);
  console.log('====================================================');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
