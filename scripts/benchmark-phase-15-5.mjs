const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

async function runBenchmark() {
  console.log('====================================================');
  console.log('⚡ BENCHMARKING PHASE 15.5 MARKET TIMELINE & ACTIVITY');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('====================================================\n');

  async function benchmarkScenario(name, url, iterations = 50) {
    process.stdout.write(`Benchmarking ${name} (${iterations} iterations)...`);
    const latencies = [];

    // Warmup
    await fetch(url);
    await fetch(url);

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const res = await fetch(url);
      const end = performance.now();
      if (res.status === 200) {
        latencies.push(end - start);
      }
    }

    latencies.sort((a, b) => a - b);
    const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log(`\n  - Mean: ${mean.toFixed(2)}ms | p50: ${p50.toFixed(2)}ms | p95: ${p95.toFixed(2)}ms | p99: ${p99.toFixed(2)}ms`);
    return { mean, p50, p95, p99, latencies };
  }

  const s1 = await benchmarkScenario(
    'Rajarhat Market Activity (DESCENDANT)',
    `${BASE_URL}/api/locations/rajarhat/activity?scope=DESCENDANT`,
    50
  );

  const s2 = await benchmarkScenario(
    'New Town Market Activity (DIRECT)',
    `${BASE_URL}/api/locations/new-town/activity?scope=DIRECT`,
    50
  );

  const s3 = await benchmarkScenario(
    'Location Detail Page Activity Stream',
    `${BASE_URL}/locations/rajarhat/activity`,
    50
  );

  const allLatencies = [...s1.latencies, ...s2.latencies, ...s3.latencies];
  allLatencies.sort((a, b) => a - b);
  const overallMean = allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length;
  const overallP50 = allLatencies[Math.floor(allLatencies.length * 0.5)];
  const overallP95 = allLatencies[Math.floor(allLatencies.length * 0.95)];
  const overallP99 = allLatencies[Math.floor(allLatencies.length * 0.99)];

  console.log('\n====================================================');
  console.log(`🏁 OVERALL BENCHMARK RESULTS (150 SAMPLES):`);
  console.log(`  - Mean Average Latency: ${overallMean.toFixed(2)}ms`);
  console.log(`  - p50 (Median Latency): ${overallP50.toFixed(2)}ms`);
  console.log(`  - p95 Latency:          ${overallP95.toFixed(2)}ms`);
  console.log(`  - p99 Latency:          ${overallP99.toFixed(2)}ms`);
  console.log('====================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
