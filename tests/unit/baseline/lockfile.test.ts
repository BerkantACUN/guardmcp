import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyBaseline, loadBaseline } from '../../../src/baseline/lockfile.js';
import { createFinding } from '../../../src/core/finding.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-baseline-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function finding(fingerprintSeed: string) {
  return createFinding({
    ruleId: 'MCPG-101',
    severity: 'critical',
    confidence: 'high',
    message: 'stub',
    remediation: 'stub',
    location: { file: 'a.json', line: 1, column: 1 },
    logicalPath: `/stub/${fingerprintSeed}`,
  });
}

describe('loadBaseline', () => {
  it('loads a set of fingerprints from a baseline file', () => {
    const path = join(dir, 'baseline.json');
    writeFileSync(path, JSON.stringify({ version: '1', fingerprints: ['aaaa1111', 'bbbb2222'] }));
    const baseline = loadBaseline(path);
    expect(baseline.has('aaaa1111')).toBe(true);
    expect(baseline.has('cccc3333')).toBe(false);
  });

  it('throws a clear error for a malformed baseline file', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, JSON.stringify({ not: 'a baseline' }));
    expect(() => loadBaseline(path)).toThrow();
  });
});

describe('applyBaseline', () => {
  it('drops findings whose fingerprint is in the baseline', () => {
    const known = finding('known');
    const fresh = finding('fresh');
    const baseline = new Set([known.fingerprint]);

    const result = applyBaseline([known, fresh], baseline);
    expect(result).toEqual([fresh]);
  });

  it('returns everything unchanged when the baseline is empty', () => {
    const findings = [finding('a'), finding('b')];
    expect(applyBaseline(findings, new Set())).toEqual(findings);
  });
});
