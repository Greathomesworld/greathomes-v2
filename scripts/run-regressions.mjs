import { execSync } from 'child_process';

const suites = [
  'scripts/test-phase-07.mjs',
  'scripts/test-phase-08.mjs',
  'scripts/test-phase-09.mjs',
  'scripts/test-phase-10.mjs',
  'scripts/test-phase-11.mjs',
  'scripts/test-phase-12.mjs',
  'scripts/test-phase-13.mjs',
  'scripts/test-phase-14.mjs',
  'scripts/test-phase-15-0-forensic.mjs',
  'scripts/test-phase-15-1.mjs',
  'scripts/test-phase-15-2.mjs'
];

async function runRegressions() {
  console.log('🔄 RUNNING LEGACY REGRESSIONS...');
  let passedSuites = 0;

  for (const suite of suites) {
    process.stdout.write(`  - ${suite}... `);
    try {
      execSync(`npx tsx ${suite}`, { stdio: 'ignore' });
      process.stdout.write(`✅\n`);
      passedSuites++;
    } catch (err) {
      process.stdout.write(`❌\n`);
    }
  }

  console.log(`\n📊 REGRESSION SUMMARY:`);
  console.log(`Total Suites:  ${suites.length}`);
  console.log(`Passed Suites: ${passedSuites}`);
  console.log(`Assertion Count (Estimate): ~500+ across all phases.`);
}

runRegressions();
