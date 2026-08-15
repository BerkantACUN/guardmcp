import { describe, expect, it } from 'vitest';
import { runScan } from '../../../src/core/engine.js';
import { createFinding } from '../../../src/core/finding.js';
import type { ScanTarget } from '../../../src/model/scan-target.js';
import type { Rule } from '../../../src/rules/types.js';

function stubTarget(relativePath: string): ScanTarget {
  return {
    kind: 'config-file',
    filePath: relativePath,
    relativePath,
    document: { getValue: () => ({}), locate: () => undefined },
    config: {},
  };
}

function ruleThatAlwaysFindsOne(id: string): Rule {
  return {
    id,
    title: id,
    severity: 'low',
    confidence: 'high',
    category: 'test',
    docsUrl: 'https://example.com',
    check: (target) => [
      createFinding({
        ruleId: id,
        severity: 'low',
        confidence: 'high',
        message: 'stub finding',
        remediation: 'n/a',
        location: { file: target.relativePath, line: 1, column: 1 },
        logicalPath: '/stub',
      }),
    ],
  };
}

describe('runScan', () => {
  it('runs every rule against every target', () => {
    const targets = [stubTarget('a.json'), stubTarget('b.json')];
    const rules = [ruleThatAlwaysFindsOne('R1'), ruleThatAlwaysFindsOne('R2')];

    const result = runScan(targets, rules, { cwd: '.' });

    expect(result.targetsScanned).toBe(2);
    expect(result.findings).toHaveLength(4); // 2 targets x 2 rules
  });

  it('returns no findings when there are no targets', () => {
    const result = runScan([], [ruleThatAlwaysFindsOne('R1')], { cwd: '.' });
    expect(result.findings).toEqual([]);
    expect(result.targetsScanned).toBe(0);
  });

  it('returns no findings when there are no rules', () => {
    const result = runScan([stubTarget('a.json')], [], { cwd: '.' });
    expect(result.findings).toEqual([]);
  });
});
