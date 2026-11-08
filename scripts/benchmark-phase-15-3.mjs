import { performance } from 'perf_hooks';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const SAMPLES = 200;
const SLUGS = ['rajarhat', 'new-town', 'kolkata'];

async function benchmark() {
  console.log(`🚀 Benchmarking Market History API (${SAMPLES} samples)...`);
  
  const latencies = [];
  
  for (let i = 0; i < SAMPLES; i++) {
    const slug = SLUGS[i % SLUGS.length];
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}/api/locations/${slug}/market/history?scope=DESCENDANT`);
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      await res.json();
      const end = performance.now();
      latencies.push(end - start);
    } catch (err) {
      console.error(`Sample ${i} failed:`, err.message);
    }
  }
  
  if (latencies.length === 0) {
    console.error('No successful samples.');
    return;
  }
  
  latencies.sort((a, b) => a - b);
  
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  
  console.log('\n📊 PERFORMANCE RESULTS:');
  console.log(`Average: ${avg.toFixed(2)}ms`);
  console.log(`p50:     ${p50.toFixed(2)}ms`);
  console.log(`p95:     ${p95.toFixed(2)}ms`);
  console.log(`p99:     ${p99.toFixed(2)}ms`);
}

benchmark();
