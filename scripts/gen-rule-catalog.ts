/**
 * Regenerates the rule table in docs/rules/README.md.
 *
 * Usage: npm run docs:rules              (writes)
 *        npm run docs:rules -- --check   (fails if stale)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withCatalog } from './rule-catalog.js';

const path = fileURLToPath(new URL('../docs/rules/README.md', import.meta.url));
const current = readFileSync(path, 'utf-8');
const updated = withCatalog(current);

if (process.argv.includes('--check')) {
  if (updated !== current) {
    console.error('docs/rules/README.md is out of date. Run: npm run docs:rules');
    process.exit(1);
  }
  console.log('Rule catalog is up to date.');
} else {
  writeFileSync(path, updated, 'utf-8');
  console.log('Rule catalog regenerated.');
}
