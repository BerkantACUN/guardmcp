import { describe, expect, it } from 'vitest';
import { createFinding } from '../../../../src/core/finding.js';
import { formatHuman } from '../../../../src/report/formatters/human.js';

describe('formatHuman', () => {
  it('reports cleanly when there are no findings', () => {
    const output = formatHuman({ findings: [], targetsScanned: 3 });
    expect(output).toMatchInlineSnapshot(`"✔ No findings across 3 scanned file(s)."`);
  });

  it('formats findings grouped by file, with severity/position/evidence/remediation', () => {
    const output = formatHuman({
      targetsScanned: 2,
      findings: [
        createFinding({
          ruleId: 'MCPG-101',
          severity: 'critical',
          confidence: 'high',
          message: 'Hardcoded GitHub token found in "example" server config.',
          remediation: 'Rotate the token and use an env var reference.',
          location: { file: '.mcp.json', line: 7, column: 25 },
          logicalPath: '/mcpServers/example/env/GITHUB_TOKEN',
          evidence: 'ghp_…yz12',
        }),
        createFinding({
          ruleId: 'MCPG-105',
          severity: 'medium',
          confidence: 'medium',
          message: 'Unpinned package version.',
          remediation: 'Pin to an exact version.',
          location: { file: '.vscode/mcp.json', line: 3, column: 10 },
          logicalPath: '/mcpServers/other/args/1',
        }),
      ],
    });

    expect(output).toMatchInlineSnapshot(`
      ".mcp.json
        CRITICAL  MCPG-101  Hardcoded GitHub token found in "example" server config.
          7:25  ghp_…yz12
          Fix: Rotate the token and use an env var reference.

      .vscode/mcp.json
        MEDIUM  MCPG-105  Unpinned package version.
          3:10
          Fix: Pin to an exact version.

      1 critical, 1 medium — 2 finding(s) across 2 file(s)"
    `);
  });

  it('groups multiple findings from the same file under one header instead of repeating it', () => {
    const finding = (line: number) =>
      createFinding({
        ruleId: 'MCPG-101',
        severity: 'critical',
        confidence: 'high',
        message: 'stub',
        remediation: 'stub',
        location: { file: '.mcp.json', line, column: 1 },
        logicalPath: `/stub/${line}`,
      });

    const output = formatHuman({ targetsScanned: 1, findings: [finding(3), finding(9)] });

    expect(output.match(/\.mcp\.json/g)).toHaveLength(1);
    expect(output).toContain('3:1');
    expect(output).toContain('9:1');
  });
});
