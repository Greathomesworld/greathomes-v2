import assert from 'assert';
import { fetchHtml } from './test-utils.mjs'; // Assuming a test-utils exists

async function runRedesignTests() {
  console.log('--- RUNNING REDESIGN ASSERTIONS ---');
  const { html } = await fetchHtml('/');

  // Hero Assertions
  assert(html.includes('Find a place'), 'Hero headline missing');
  assert(html.includes('GreatHomesIllustration'), 'Hero illustration missing');
  
  // Pillars Assertions
  assert(html.includes('New Launch'), 'Pillars missing');
  
  // Spotlight Assertions
  assert(html.includes('Project Spotlight'), 'Spotlight missing');

  console.log('✅ ALL REDESIGN ASSERTIONS PASSED');
}

runRedesignTests().catch(console.error);
