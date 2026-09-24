import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG_RULE_REQUIREMENTS, withCatalog } from '../../../scripts/rule-catalog.js';
import { ALL_PROMPT_RULES } from '../../../src/rules/prompt-registry.js';
import { ALL_RULES } from '../../../src/rules/registry.js';
import { ALL_RESOURCE_RULES } from '../../../src/rules/resource-registry.js';
import { unboundedResourceTemplateRule } from '../../../src/rules/resources/unbounded-template.js';
import { ALL_TOOL_RULES } from '../../../src/rules/tool-registry.js';

const DOCS = fileURLToPath(new URL('../../../docs/rules/', import.meta.url));
const catalog = readFileSync(`${DOCS}README.md`, 'utf-8');
const everyRule = [
  ...ALL_RULES,
  ...ALL_TOOL_RULES,
  ...ALL_PROMPT_RULES,
  ...ALL_RESOURCE_RULES,
  unboundedResourceTemplateRule,
];

describe('docs/rules/README.md', () => {
  it('matches the rule registries (run `npm run docs:rules` if this fails)', () => {
    expect(catalog).toBe(withCatalog(catalog));
  });

  it('has a page for every rule it links to', () => {
    const missing = everyRule.map((rule) => rule.id).filter((id) => !existsSync(`${DOCS}${id}.md`));
    expect(missing).toEqual([]);
  });

  it('lists requirements only for rules that exist and read the config alone otherwise', () => {
    const configIds = new Set(ALL_RULES.map((rule) => rule.id));
    expect(Object.keys(CONFIG_RULE_REQUIREMENTS).filter((id) => !configIds.has(id))).toEqual([]);
  });

  it('points each rule at the page its docsUrl names', () => {
    for (const rule of everyRule) {
      expect(rule.docsUrl.endsWith(`/docs/rules/${rule.id}.md`)).toBe(true);
    }
  });
});
