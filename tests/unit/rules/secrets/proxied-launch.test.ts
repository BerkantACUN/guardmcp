import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { launchedPackageNames } from '../../../../src/registry/collect.js';
import type { PackageStatus } from '../../../../src/registry/npm.js';
import { dangerousCommandRule } from '../../../../src/rules/secrets/dangerous-command.js';
import { deprecatedPackageRule } from '../../../../src/rules/secrets/deprecated-package.js';
import { unpinnedPackageRule } from '../../../../src/rules/secrets/unpinned-package.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('launch rules see the server behind guardmcp proxy', () => {
  it('MCPG-105 reports the wrapped package, and an unpinned guardmcp itself', () => {
    const findings = unpinnedPackageRule.check(load('malicious/proxied-servers.json'), CTX);
    expect(findings.map((f) => f.logicalPath)).toEqual([
      '/mcpServers/global-install/args/6',
      '/mcpServers/via-npx/args/1',
      '/mcpServers/no-separator/args/4',
    ]);
    expect(findings[0]?.message).toContain('unpinned-mcp-server');
    expect(findings[0]?.location.line).toBeGreaterThan(1);
  });

  it('MCPG-104 reports a shell pipe behind the proxy, pointing at the script', () => {
    const [finding, ...rest] = dangerousCommandRule.check(
      load('malicious/proxied-servers.json'),
      CTX,
    );
    expect(rest).toEqual([]);
    expect(finding?.logicalPath).toBe('/mcpServers/via-node/args/5');
    expect(finding?.severity).toBe('critical');
  });

  it('MCPG-106 and the registry lookup ask about wrapped packages too', () => {
    const target = load('malicious/proxied-servers.json');
    expect(launchedPackageNames([target])).toEqual([
      '@scope/pinned-server',
      'guardmcp',
      'unpinned-mcp-server',
    ]);

    const status: PackageStatus = {
      name: 'unpinned-mcp-server',
      latestVersion: '2.0.0',
      deprecated: 'use something else',
      allVersionsDeprecated: true,
      deprecationIsGeneric: false,
      repositoryUrl: null,
    };
    const registry = new Map([[status.name, status]]);
    const findings = deprecatedPackageRule.check(target, { ...CTX, registry });
    expect(findings.map((f) => f.logicalPath)).toEqual(['/mcpServers/global-install/args/6']);
  });

  it('stays quiet on a pinned server behind the proxy, and on other tools named proxy', () => {
    const target = load('benign/proxied-pinned.json');
    expect(unpinnedPackageRule.check(target, CTX)).toEqual([]);
    expect(dangerousCommandRule.check(target, CTX)).toEqual([]);
  });
});

describe('audit rules see the server behind guardmcp proxy, once', () => {
  it('MCPG-602 reports the wrapped server’s bind flag and env exactly once each', async () => {
    const { exposedListenerRule } = await import('../../../../src/rules/audit/exposed-listener.js');
    const findings = exposedListenerRule.check(
      load('malicious/proxied-listener-and-silence.json'),
      CTX,
    );
    expect(findings.map((f) => f.logicalPath)).toEqual([
      '/mcpServers/bridge/args/7',
      '/mcpServers/bridge/env/MCP_HOST',
    ]);
  });

  it('MCPG-701 reports a switch passed to the wrapped server once, at its real index', async () => {
    const { telemetryDisabledRule } = await import(
      '../../../../src/rules/audit/telemetry-disabled.js'
    );
    const findings = telemetryDisabledRule.check(
      load('malicious/proxied-listener-and-silence.json'),
      CTX,
    );
    expect(findings.map((f) => f.logicalPath).sort()).toEqual([
      '/mcpServers/bridge/args/9',
      '/mcpServers/bridge/env/OTEL_SDK_DISABLED',
    ]);
  });
});
