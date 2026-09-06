/**
 * Regenerates the OWASP MCP Top 10 coverage table in README.md from the rule
 * registries, between the OWASP:START/OWASP:END markers.
 *
 * Generated rather than hand-written so the table cannot drift from the code:
 * adding a rule and forgetting to document its category is the exact kind of
 * quiet inaccuracy that makes a coverage claim worthless.
 *
 * Usage: npm run docs:owasp        (writes)
 *        npm run docs:owasp -- --check   (fails if stale — used in CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  OWASP_MCP_TAXONOMY_COMMIT,
  OWASP_MCP_TAXONOMY_SOURCE_URL,
  OWASP_MCP_TOP_10,
} from '../src/rules/owasp.js';
import { ALL_PROMPT_RULES } from '../src/rules/prompt-registry.js';
import { ALL_RULES } from '../src/rules/registry.js';
import { ALL_RESOURCE_RULES } from '../src/rules/resource-registry.js';
import { ALL_TOOL_RULES } from '../src/rules/tool-registry.js';

const START = '<!-- OWASP:START -->';
const END = '<!-- OWASP:END -->';

const readmePath = fileURLToPath(new URL('../README.md', import.meta.url));

const everyRule = [...ALL_RULES, ...ALL_TOOL_RULES, ...ALL_PROMPT_RULES, ...ALL_RESOURCE_RULES];

function buildTable(): string {
  const rows = OWASP_MCP_TOP_10.map((entry) => {
    const rules = everyRule
      .filter((rule) => rule.owasp.includes(entry.id))
      .map((rule) => rule.id)
      .sort();
    const covered = rules.length > 0 ? `\`${rules.join('`, `')}\`` : '—';
    const mark = rules.length > 0 ? '✅' : '·';
    return `| ${mark} | [**${entry.id}**](${entry.url}) | ${entry.title} | ${covered} |`;
  });

  const coveredCount = OWASP_MCP_TOP_10.filter((entry) =>
    everyRule.some((rule) => rule.owasp.includes(entry.id)),
  ).length;

  return [
    START,
    '',
    `**${coveredCount} of 10** OWASP MCP Top 10 categories have at least one rule.`,
    '',
    '| | Category | Risk | guardmcp rules |',
    '|---|---|---|---|',
    ...rows,
    '',
    `Mapped against [\`${OWASP_MCP_TAXONOMY_COMMIT.slice(0, 7)}\`](${OWASP_MCP_TAXONOMY_SOURCE_URL}) of the OWASP list.`,
    'The list is a v0.1 beta that moves under its own label, and independent tools have already',
    'ended up with numbering that does not line up — so the SARIF taxonomy pins the exact commit',
    'this mapping was drafted against (`taxonomies[0].properties.specCommit`), which makes a',
    'disagreement about a category settleable by fetching that tree rather than by argument.',
    '',
    'Every finding carries its OWASP category in the SARIF output — as a first-class',
    '[`taxonomies`](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317841)',
    'entry with per-rule `relationships`, plus `properties.tags` so the categories show up as',
    "filter chips in GitHub's Code Scanning UI.",
    '',
    END,
  ].join('\n');
}

const table = buildTable();
const readme = readFileSync(readmePath, 'utf-8');

const startIdx = readme.indexOf(START);
const endIdx = readme.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  console.error(`README.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}

const updated = readme.slice(0, startIdx) + table + readme.slice(endIdx + END.length);

if (process.argv.includes('--check')) {
  if (updated !== readme) {
    console.error('README OWASP table is out of date. Run: npm run docs:owasp');
    process.exit(1);
  }
  console.log('README OWASP table is up to date.');
} else {
  writeFileSync(readmePath, updated, 'utf-8');
  console.log('README OWASP table regenerated.');
}
