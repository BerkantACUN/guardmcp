import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OWASP_MCP_TOP_10 } from '../../../src/rules/owasp.js';
import { ALL_PROMPT_RULES } from '../../../src/rules/prompt-registry.js';
import { ALL_RULES } from '../../../src/rules/registry.js';
import { ALL_RESOURCE_RULES } from '../../../src/rules/resource-registry.js';
import { unboundedResourceTemplateRule } from '../../../src/rules/resources/unbounded-template.js';
import { ALL_TOOL_RULES } from '../../../src/rules/tool-registry.js';

/**
 * A security scanner that overstates its own coverage has a credibility
 * problem, not a documentation problem — the README shipped "19 rules" while
 * the registry held 17. These tests make the claim answer to the code.
 */
const readme = readFileSync(fileURLToPath(new URL('../../../README.md', import.meta.url)), 'utf-8');
const ruleCount =
  ALL_RULES.length +
  ALL_TOOL_RULES.length +
  ALL_PROMPT_RULES.length +
  ALL_RESOURCE_RULES.length +
  1;

describe('README claims match the code', () => {
  it('states the real rule count everywhere it is mentioned', () => {
    const claims = [...readme.matchAll(/(\d+) rules/g)].map((m) => Number(m[1]));

    expect(claims.length).toBeGreaterThan(0);
    for (const claimed of claims) {
      expect(claimed).toBe(ruleCount);
    }
  });

  it('mentions every category the rules actually use', () => {
    // The prose used to say "nine categories" over a table of ten rows, and
    // nothing checked it. Counting is the wrong thing to pin: the table
    // groups for readability (tool vs prompt poisoning share one category in
    // code) so its row count will never equal the code's. What matters is
    // that a category cannot be added without being documented at all.
    const categories = new Set(
      [...ALL_RULES, ...ALL_TOOL_RULES, ...ALL_PROMPT_RULES, ...ALL_RESOURCE_RULES].map(
        (rule) => rule.category,
      ),
    );
    const haystack = readme.toLowerCase();

    for (const category of categories) {
      expect(haystack, `category "${category}" is undocumented`).toContain(category);
    }
  });

  it('documents every rule id that the registries actually ship', () => {
    const owaspBlock = readme.slice(
      readme.indexOf('<!-- OWASP:START -->'),
      readme.indexOf('<!-- OWASP:END -->'),
    );
    const documented = new Set([...owaspBlock.matchAll(/MCPG-\d+/g)].map((m) => m[0]));
    const shipped = [
      ...ALL_RULES,
      ...ALL_TOOL_RULES,
      ...ALL_PROMPT_RULES,
      ...ALL_RESOURCE_RULES,
      unboundedResourceTemplateRule,
    ].map((r) => r.id);

    expect(shipped.filter((id) => !documented.has(id))).toEqual([]);
  });

  it('lists every OWASP category in the coverage table, covered or not', () => {
    for (const entry of OWASP_MCP_TOP_10) {
      expect(readme).toContain(`**${entry.id}**`);
    }
  });
});
