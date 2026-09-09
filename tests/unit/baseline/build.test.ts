import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBaseline, serializeBaseline } from '../../../src/baseline/build.js';
import { loadBaseline } from '../../../src/baseline/lockfile.js';
import { createFinding } from '../../../src/core/finding.js';

function finding(seed: string, over: Partial<Parameters<typeof createFinding>[0]> = {}) {
  return createFinding({
    ruleId: 'MCPG-101',
    severity: 'critical',
    confidence: 'high',
    message: `Hardcoded token in ${seed}`,
    remediation: 'Move it to an environment variable.',
    location: { file: 'mcp.json', line: 3, column: 5 },
    logicalPath: `/mcpServers/${seed}/env/TOKEN`,
    ...over,
  });
}

/**
 * A baseline is a list of accepted risks. The `--baseline` flag has always
 * been able to read one, but nothing could write one and fingerprints are not
 * printed anywhere, so in practice the flag was unusable. These cover the
 * missing half.
 */
describe('buildBaseline', () => {
  it('records one entry per finding', () => {
    const baseline = buildBaseline([finding('a'), finding('b')]);
    expect(baseline.entries).toHaveLength(2);
  });

  it('carries enough context for a reviewer to see what is being accepted', () => {
    // A file of opaque hashes cannot be reviewed in a pull request, and a
    // baseline nobody can review is how a real finding gets silently accepted.
    const entry = buildBaseline([finding('github')]).entries[0];

    expect(entry?.ruleId).toBe('MCPG-101');
    expect(entry?.severity).toBe('critical');
    expect(entry?.logicalPath).toBe('/mcpServers/github/env/TOKEN');
    expect(entry?.message).toContain('github');
    expect(entry?.fingerprint).toHaveLength(16);
  });

  it('does not record the same finding twice', () => {
    const one = finding('a');
    expect(buildBaseline([one, one]).entries).toHaveLength(1);
  });

  it('orders entries so the file diffs cleanly between runs', () => {
    // Scan order depends on filesystem traversal. An unstable order turns
    // every regeneration into a whole-file diff.
    const clock = () => new Date('2026-01-01T00:00:00.000Z');
    const forward = buildBaseline([finding('a'), finding('b'), finding('c')], clock);
    const reverse = buildBaseline([finding('c'), finding('b'), finding('a')], clock);

    expect(serializeBaseline(forward)).toBe(serializeBaseline(reverse));
  });

  it('omits nothing about severity, so a baseline full of criticals is visible', () => {
    const mixed = buildBaseline([
      finding('a', { severity: 'low' }),
      finding('b', { severity: 'critical' }),
    ]);
    expect(mixed.entries.map((e) => e.severity).sort()).toEqual(['critical', 'low']);
  });
});

describe('a written baseline can be read back', () => {
  it('round-trips through loadBaseline', () => {
    const dir = mkdtempSync(join(tmpdir(), 'guardmcp-baseline-rt-'));
    try {
      const known = finding('known');
      const path = join(dir, 'baseline.json');
      writeFileSync(path, serializeBaseline(buildBaseline([known])));

      expect(loadBaseline(path).has(known.fingerprint)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still reads a legacy file that only has a fingerprint array', () => {
    // The old shape was documented and wired; anything already written by
    // hand against it must keep working.
    const dir = mkdtempSync(join(tmpdir(), 'guardmcp-baseline-legacy-'));
    try {
      const path = join(dir, 'legacy.json');
      writeFileSync(path, JSON.stringify({ version: '1', fingerprints: ['aaaa1111'] }));

      expect(loadBaseline(path).has('aaaa1111')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
