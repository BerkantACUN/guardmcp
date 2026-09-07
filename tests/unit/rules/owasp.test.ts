import { describe, expect, it } from 'vitest';
import {
  OWASP_MCP_TAXONOMY_COMMIT,
  OWASP_MCP_TAXONOMY_NAME,
  OWASP_MCP_TAXONOMY_SOURCE_URL,
  OWASP_MCP_TAXONOMY_VERSION,
  OWASP_MCP_TOP_10,
  type OwaspMcpId,
  owaspEntry,
} from '../../../src/rules/owasp.js';
import { ALL_PROMPT_RULES } from '../../../src/rules/prompt-registry.js';
import { ALL_RULES } from '../../../src/rules/registry.js';
import { ALL_RESOURCE_RULES } from '../../../src/rules/resource-registry.js';
import { unboundedResourceTemplateRule } from '../../../src/rules/resources/unbounded-template.js';
import { ALL_TOOL_RULES } from '../../../src/rules/tool-registry.js';

describe('OWASP MCP Top 10 catalog', () => {
  it('contains exactly ten entries', () => {
    expect(OWASP_MCP_TOP_10).toHaveLength(10);
  });

  it('is ordered MCP01 through MCP10 with no gaps or duplicates', () => {
    const ids = OWASP_MCP_TOP_10.map((e) => e.id);
    const expected = Array.from({ length: 10 }, (_, i) => `MCP${String(i + 1).padStart(2, '0')}`);
    expect(ids).toEqual(expected);
  });

  it('gives every entry a non-empty title and an owasp.org reference URL', () => {
    for (const entry of OWASP_MCP_TOP_10) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.url).toMatch(/^https:\/\/owasp\.org\//);
    }
  });

  it('names the taxonomy and pins the version it was mapped against', () => {
    // The list is a v0.1 beta — pinning the version is what lets a consumer
    // tell a stale mapping from a current one when OWASP revises the list.
    expect(OWASP_MCP_TAXONOMY_NAME).toBe('OWASP-MCP-Top-10');
    expect(OWASP_MCP_TAXONOMY_VERSION).toMatch(/^\d+\.\d+/);
  });

  it('pins the exact spec revision the mapping was drafted against', () => {
    // A version string of "0.1" does not identify a reading: the beta moves
    // under that label. A commit sha is immutable, so a consumer can fetch
    // the exact ten categories this mapping was built from and settle any
    // disagreement mechanically instead of by argument.
    expect(OWASP_MCP_TAXONOMY_COMMIT).toMatch(/^[0-9a-f]{40}$/);
    expect(OWASP_MCP_TAXONOMY_SOURCE_URL).toContain(OWASP_MCP_TAXONOMY_COMMIT);
    expect(OWASP_MCP_TAXONOMY_SOURCE_URL).toMatch(
      /^https:\/\/github\.com\/OWASP\/www-project-mcp-top-10\/tree\//,
    );
  });

  it('resolves a known id to its entry', () => {
    expect(owaspEntry('MCP03').title).toBe('Tool Poisoning');
    expect(owaspEntry('MCP08').title).toBe('Lack of Audit and Telemetry');
  });
});

describe('rule-to-OWASP mapping', () => {
  const everyRule = [
    ...ALL_RULES,
    ...ALL_TOOL_RULES,
    ...ALL_PROMPT_RULES,
    ...ALL_RESOURCE_RULES,
    unboundedResourceTemplateRule,
  ];

  it('maps every shipped rule to at least one OWASP category', () => {
    const unmapped = everyRule.filter((r) => r.owasp.length === 0).map((r) => r.id);
    expect(unmapped).toEqual([]);
  });

  it('only references categories that exist in the catalog', () => {
    const known = new Set<string>(OWASP_MCP_TOP_10.map((e) => e.id));
    const dangling = everyRule.flatMap((r) =>
      r.owasp.filter((id) => !known.has(id)).map((id) => `${r.id} -> ${id}`),
    );
    expect(dangling).toEqual([]);
  });

  it('never lists the same category twice on one rule', () => {
    const dupes = everyRule
      .filter((r) => new Set<OwaspMcpId>(r.owasp).size !== r.owasp.length)
      .map((r) => r.id);
    expect(dupes).toEqual([]);
  });

  it('covers tool poisoning (MCP03) — the category guardmcp exists for', () => {
    const covering = everyRule.filter((r) => r.owasp.includes('MCP03'));
    expect(covering.length).toBeGreaterThan(0);
  });
});
