import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { shadowServerRule } from '../../../../src/rules/audit/shadow-server.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));

function load(rel: string, scope: 'project' | 'global' | 'explicit') {
  return loadScanTarget(`${FIXTURES_ROOT}/${rel}`, FIXTURES_ROOT, scope);
}

const PROJECT_SERVERS = new Set(['team-docs']);

describe('MCPG-601 shadow-server rule', () => {
  it('flags a user-level server the project never declared', () => {
    const findings = shadowServerRule.check(load('shadow/global.json', 'global'), {
      cwd: FIXTURES_ROOT,
      projectServers: PROJECT_SERVERS,
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-601');
    expect(findings[0]?.logicalPath).toBe('/mcpServers/personal-scratch');
    expect(findings[0]?.severity).toBe('low');
  });

  it('does not flag a user-level server the project also declares', () => {
    const findings = shadowServerRule.check(load('shadow/global.json', 'global'), {
      cwd: FIXTURES_ROOT,
      projectServers: PROJECT_SERVERS,
    });
    expect(findings.map((f) => f.logicalPath)).not.toContain('/mcpServers/team-docs');
  });

  it('never flags anything in the project config itself', () => {
    // The project's own servers ARE the reviewed set — they cannot be shadow.
    expect(
      shadowServerRule.check(load('shadow/project.json', 'project'), {
        cwd: FIXTURES_ROOT,
        projectServers: PROJECT_SERVERS,
      }),
    ).toEqual([]);
  });

  it('stays silent when there is no project config to be outside of', () => {
    // Scanning a personal machine with no project config present: every
    // server is "not in the project", which would make the rule pure noise.
    expect(
      shadowServerRule.check(load('shadow/global.json', 'global'), { cwd: FIXTURES_ROOT }),
    ).toEqual([]);
    expect(
      shadowServerRule.check(load('shadow/global.json', 'global'), {
        cwd: FIXTURES_ROOT,
        projectServers: new Set<string>(),
      }),
    ).toEqual([]);
  });

  it('stays silent for explicitly-passed files, whose scope is unknown', () => {
    expect(
      shadowServerRule.check(load('shadow/global.json', 'explicit'), {
        cwd: FIXTURES_ROOT,
        projectServers: PROJECT_SERVERS,
      }),
    ).toEqual([]);
  });

  it('explains the governance consequence, not just the difference', () => {
    const [finding] = shadowServerRule.check(load('shadow/global.json', 'global'), {
      cwd: FIXTURES_ROOT,
      projectServers: PROJECT_SERVERS,
    });
    expect(finding?.message).toMatch(/personal-scratch/);
    expect(finding?.remediation).toMatch(/review|declare|governance|team/i);
  });

  it('maps to OWASP MCP09', () => {
    expect(shadowServerRule.owasp).toEqual(['MCP09']);
  });
});
