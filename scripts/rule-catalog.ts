/**
 * Builds the rule table in docs/rules/README.md from the rule registries.
 *
 * The table was hand-written and stopped at MCPG-502 while the registries
 * grew to more than thirty rules — every rule added since was shipped,
 * documented in its own file, and missing from the catalog that links them.
 * Generated from code, it cannot fall behind again: the test in
 * tests/unit/docs/rule-catalog.test.ts fails when the file is stale.
 */
import type { Severity } from '../src/core/severity.js';
import { ALL_PROMPT_RULES } from '../src/rules/prompt-registry.js';
import { ALL_RULES } from '../src/rules/registry.js';
import { ALL_RESOURCE_RULES } from '../src/rules/resource-registry.js';
import { unboundedResourceTemplateRule } from '../src/rules/resources/unbounded-template.js';
import { ALL_TOOL_RULES } from '../src/rules/tool-registry.js';

export const CATALOG_START = '<!-- CATALOG:START -->';
export const CATALOG_END = '<!-- CATALOG:END -->';

interface CatalogRule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly category: string;
}

/**
 * Config rules that read more than the config file. Keyed by what the rule
 * reads from ScanContext (`lock`, `liveTools`, `registry`, ...), checked when
 * this was written; the catalog test fails if an id here stops existing.
 */
export const CONFIG_RULE_REQUIREMENTS: Readonly<Record<string, string>> = {
  'MCPG-106': '`--registry`',
  'MCPG-404': '`--live`',
  'MCPG-501': 'lock file (`guardmcp pin`)',
  'MCPG-502': 'lock file + `--live`',
  'MCPG-601': 'auto-discovery (project + machine-wide configs)',
  'MCPG-702': '`--live`',
};

/** Everything that runs on a live-introspected surface needs `--live`. */
const LIVE_RULES: readonly CatalogRule[] = [
  ...ALL_TOOL_RULES,
  ...ALL_PROMPT_RULES,
  ...ALL_RESOURCE_RULES,
  unboundedResourceTemplateRule,
];

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function byId(a: CatalogRule, b: CatalogRule): number {
  return a.id.localeCompare(b.id, 'en', { numeric: true });
}

export function buildCatalog(): string {
  const rows = [
    ...ALL_RULES.map((rule) => ({ rule, needs: CONFIG_RULE_REQUIREMENTS[rule.id] ?? '—' })),
    ...LIVE_RULES.map((rule) => ({ rule, needs: '`--live`' })),
  ]
    .sort((a, b) => byId(a.rule, b.rule))
    .map(
      ({ rule, needs }) =>
        `| [${rule.id}](./${rule.id}.md) | ${rule.title.replace(/\|/g, '\\|')} | ${SEVERITY_LABEL[rule.severity]} | ${capitalize(rule.category)} | ${needs} |`,
    );

  return [
    CATALOG_START,
    '',
    `${rows.length} rules. Severity is each rule's nominal level; a few (MCPG-104, for one) report some findings lower or higher depending on what they matched.`,
    '',
    '| ID | Title | Severity | Category | Needs |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '"Needs" is what a scan must be given for the rule to run at all; `—` means the config file alone. Generated from the rule registries by `npm run docs:rules` — do not edit this table by hand.',
    '',
    CATALOG_END,
  ].join('\n');
}

/** Replaces the generated block in `document`, or throws if its markers are missing. */
export function withCatalog(document: string): string {
  const start = document.indexOf(CATALOG_START);
  const end = document.indexOf(CATALOG_END);
  if (start === -1 || end === -1) {
    throw new Error(
      `docs/rules/README.md is missing the ${CATALOG_START} / ${CATALOG_END} markers.`,
    );
  }
  return document.slice(0, start) + buildCatalog() + document.slice(end + CATALOG_END.length);
}
