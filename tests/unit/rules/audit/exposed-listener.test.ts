import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { exposedListenerRule } from '../../../../src/rules/audit/exposed-listener.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-602 exposed-listener rule', () => {
  it('flags every launch setting that listens on all interfaces', () => {
    const findings = exposedListenerRule.check(load('malicious/exposed-listener.json'), CTX);

    expect(findings.map((f) => f.logicalPath)).toEqual([
      '/mcpServers/http-bridge/args/2',
      '/mcpServers/search/env/MCP_HOST',
      '/mcpServers/container/args/4',
    ]);
    for (const finding of findings) {
      expect(finding.ruleId).toBe('MCPG-602');
      expect(finding.severity).toBe('medium');
      expect(finding.location.line).toBeGreaterThan(1);
    }
  });

  it('says who can reach the server and how to fix it', () => {
    const [finding] = exposedListenerRule.check(load('malicious/exposed-listener.json'), CTX);
    expect(finding?.message).toMatch(/network/);
    expect(finding?.evidence).toBe('--host 0.0.0.0');
    expect(finding?.remediation).toMatch(/127\.0\.0\.1/);
  });

  it('marks the Docker default-bind case as medium confidence', () => {
    const findings = exposedListenerRule.check(load('malicious/exposed-listener.json'), CTX);
    expect(findings.at(-1)?.confidence).toBe('medium');
  });

  it('does not fire on loopback binds', () => {
    expect(exposedListenerRule.check(load('benign/loopback-listener.json'), CTX)).toEqual([]);
  });

  it.each(['no-env.json', 'http-remote-server.json', 'pinned-package.json'])(
    'does not fire on %s',
    (file) => {
      expect(exposedListenerRule.check(load(`benign/${file}`), CTX)).toEqual([]);
    },
  );
});
