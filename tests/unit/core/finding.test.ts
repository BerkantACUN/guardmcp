import { describe, expect, it } from 'vitest';
import { createFinding } from '../../../src/core/finding.js';

function baseInput() {
  return {
    ruleId: 'MCPG-101',
    severity: 'critical' as const,
    confidence: 'high' as const,
    message: 'Hardcoded token found.',
    remediation: 'Rotate it.',
    location: { file: 'config.json', line: 5, column: 20 },
    logicalPath: '/mcpServers/foo/env/GITHUB_TOKEN',
    evidence: 'ghp_…wxyz',
  };
}

describe('createFinding', () => {
  it('carries through the fields it was given', () => {
    const finding = createFinding(baseInput());
    expect(finding.ruleId).toBe('MCPG-101');
    expect(finding.severity).toBe('critical');
    expect(finding.location).toEqual({ file: 'config.json', line: 5, column: 20 });
  });

  it('produces a stable fingerprint for identical input', () => {
    const a = createFinding(baseInput());
    const b = createFinding(baseInput());
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('changes fingerprint when the ruleId differs', () => {
    const a = createFinding(baseInput());
    const b = createFinding({ ...baseInput(), ruleId: 'MCPG-102' });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('changes fingerprint when the logical path differs', () => {
    const a = createFinding(baseInput());
    const b = createFinding({ ...baseInput(), logicalPath: '/mcpServers/bar/env/GITHUB_TOKEN' });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('changes fingerprint when the redacted evidence differs (different secret, same slot)', () => {
    const a = createFinding(baseInput());
    const b = createFinding({ ...baseInput(), evidence: 'sk-a…nother' });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('keeps the SAME fingerprint when only line/column shift — the whole point of logical-path fingerprinting', () => {
    const a = createFinding(baseInput());
    const b = createFinding({
      ...baseInput(),
      location: { file: 'config.json', line: 41, column: 3 },
    });
    expect(a.fingerprint).toBe(b.fingerprint);
  });

  it('changes fingerprint when the file differs', () => {
    const a = createFinding(baseInput());
    const b = createFinding({
      ...baseInput(),
      location: { file: 'other-config.json', line: 5, column: 20 },
    });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});
