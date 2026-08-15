import { describe, expect, it } from 'vitest';
import { filterRules } from '../../../src/core/rule-filter.js';
import type { Rule } from '../../../src/rules/types.js';

function stubRule(id: string): Rule {
  return {
    id,
    title: id,
    severity: 'medium',
    confidence: 'medium',
    category: 'test',
    docsUrl: 'https://example.com',
    check: () => [],
  };
}

const ALL = [stubRule('MCPG-101'), stubRule('MCPG-102'), stubRule('MCPG-401')];

describe('filterRules', () => {
  it('returns all rules when no filters are given', () => {
    expect(filterRules(ALL, { only: [], ignore: [] })).toEqual(ALL);
  });

  it('"only" restricts to exactly the named rules', () => {
    const result = filterRules(ALL, { only: ['MCPG-101', 'MCPG-401'], ignore: [] });
    expect(result.map((r) => r.id)).toEqual(['MCPG-101', 'MCPG-401']);
  });

  it('"ignore" excludes the named rules', () => {
    const result = filterRules(ALL, { only: [], ignore: ['MCPG-102'] });
    expect(result.map((r) => r.id)).toEqual(['MCPG-101', 'MCPG-401']);
  });

  it('"ignore" wins when a rule ID appears in both "only" and "ignore"', () => {
    const result = filterRules(ALL, { only: ['MCPG-101', 'MCPG-102'], ignore: ['MCPG-102'] });
    expect(result.map((r) => r.id)).toEqual(['MCPG-101']);
  });

  it('throws a clear error when "only" names a rule ID that does not exist', () => {
    expect(() => filterRules(ALL, { only: ['MCPG-999'], ignore: [] })).toThrow(/MCPG-999/);
  });
});
