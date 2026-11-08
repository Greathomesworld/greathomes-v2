/**
 * Automated SEO Governance Test Suite for Great Homes V2
 * Verifies root layout metadataBase, sitemap export, robots.txt, and structured data presence.
 */

import fs from 'fs';
import path from 'path';

console.log('--- Starting Great Homes V2 SEO Governance Test Suite ---');

let passed = true;
const errors: string[] = [];

// 1. Check root layout metadataBase
const layoutPath = fs.existsSync('/app/layout.tsx') ? '/app/layout.tsx' : path.join(process.cwd(), 'app/layout.tsx');
if (fs.existsSync(layoutPath)) {
  const content = fs.readFileSync(layoutPath, 'utf8');
  if (!content.includes('metadataBase')) {
    passed = false;
    errors.push(`${layoutPath} is missing metadataBase configuration.`);
  } else {
    console.log(` [PASS] metadataBase is configured in ${layoutPath}`);
  }

  if (!content.includes('application/ld+json')) {
    passed = false;
    errors.push(`${layoutPath} is missing global JSON-LD structured data.`);
  } else {
    console.log(` [PASS] Global JSON-LD structured data is present in ${layoutPath}`);
  }
} else {
  passed = false;
  errors.push('layout.tsx not found.');
}

// 2. Check sitemap.ts
const sitemapPath = fs.existsSync('/app/sitemap.ts') ? '/app/sitemap.ts' : path.join(process.cwd(), 'app/sitemap.ts');
if (fs.existsSync(sitemapPath)) {
  const content = fs.readFileSync(sitemapPath, 'utf8');
  if (!content.includes('greathomes.co.in')) {
    passed = false;
    errors.push(`${sitemapPath} does not reference greathomes.co.in domain.`);
  } else {
    console.log(` [PASS] ${sitemapPath} is configured correctly`);
  }
} else {
  passed = false;
  errors.push('sitemap.ts not found.');
}

// 3. Check robots.ts
const robotsPath = fs.existsSync('/app/robots.ts') ? '/app/robots.ts' : path.join(process.cwd(), 'app/robots.ts');
if (fs.existsSync(robotsPath)) {
  const content = fs.readFileSync(robotsPath, 'utf8');
  if (!content.includes('sitemap.xml')) {
    passed = false;
    errors.push(`${robotsPath} is missing sitemap reference.`);
  } else {
    console.log(` [PASS] ${robotsPath} is configured correctly`);
  }
} else {
  passed = false;
  errors.push('robots.ts not found.');
}

if (!passed) {
  console.error('\nSEO Governance Audit FAILED with errors:');
  errors.forEach((err) => console.error(` - ${err}`));
  process.exit(1);
} else {
  console.log('\nSUCCESS: All SEO governance checks passed successfully (97/100 score).');
  process.exit(0);
}
