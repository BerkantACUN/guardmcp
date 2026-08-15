import { describe, expect, it } from 'vitest';
import { ALL_RULES } from '../../../src/rules/registry.js';
import { ALL_TOOL_RULES } from '../../../src/rules/tool-registry.js';

describe('rule registries', () => {
  it('ALL_RULES has unique rule IDs', () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ALL_TOOL_RULES has unique rule IDs', () => {
    const ids = ALL_TOOL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no ID collisions between the two registries', () => {
    const ids = [...ALL_RULES.map((r) => r.id), ...ALL_TOOL_RULES.map((r) => r.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every rule has a non-empty docsUrl pointing at guardmcp docs', () => {
    for (const rule of [...ALL_RULES, ...ALL_TOOL_RULES]) {
      expect(rule.docsUrl).toMatch(/^https:\/\/github\.com\/BerkantACUN\/guardmcp\//);
    }
  });
});
