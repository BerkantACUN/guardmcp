import { describe, expect, it } from 'vitest';
import { createFinding } from '../../../../src/core/finding.js';
import { formatJson } from '../../../../src/report/formatters/json.js';

describe('formatJson', () => {
  it('produces a stable, versioned, parseable JSON document', () => {
    const output = formatJson({
      targetsScanned: 1,
      findings: [
        createFinding({
          ruleId: 'MCPG-101',
          severity: 'critical',
          confidence: 'high',
          message: 'Hardcoded token.',
          remediation: 'Rotate it.',
          location: { file: '.mcp.json', line: 7, column: 25 },
          logicalPath: '/mcpServers/example/env/GITHUB_TOKEN',
          evidence: 'ghp_…yz12',
        }),
      ],
    });

    const parsed = JSON.parse(output);
    expect(parsed.version).toBe('1');
    expect(parsed.targetsScanned).toBe(1);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0]).toMatchObject({
      ruleId: 'MCPG-101',
      severity: 'critical',
      confidence: 'high',
      logicalPath: '/mcpServers/example/env/GITHUB_TOKEN',
      evidence: 'ghp_…yz12',
    });
    expect(parsed.findings[0].fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is pretty-printed (human-diffable, not minified)', () => {
    const output = formatJson({ targetsScanned: 0, findings: [] });
    expect(output).toContain('\n');
  });

  it('serializes an empty result cleanly', () => {
    const parsed = JSON.parse(formatJson({ targetsScanned: 5, findings: [] }));
    expect(parsed.findings).toEqual([]);
    expect(parsed.targetsScanned).toBe(5);
  });
});
