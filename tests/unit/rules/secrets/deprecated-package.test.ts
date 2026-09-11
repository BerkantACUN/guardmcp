import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import type { PackageStatus } from '../../../../src/registry/npm.js';
import { deprecatedPackageRule } from '../../../../src/rules/secrets/deprecated-package.js';
import type { ScanContext } from '../../../../src/rules/types.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

const NPM_DEFAULT =
  'Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.';

function status(name: string, over: Partial<PackageStatus> = {}): PackageStatus {
  return {
    name,
    latestVersion: '1.0.0',
    deprecated: null,
    allVersionsDeprecated: false,
    deprecationIsGeneric: false,
    repositoryUrl: null,
    ...over,
  };
}

function ctxWith(statuses: PackageStatus[]): ScanContext {
  return { cwd: FIXTURES_ROOT, registry: new Map(statuses.map((s) => [s.name, s])) };
}

/**
 * Found by measurement rather than by imagination: four archived reference
 * servers were pulling ~214k installs a week, every one marked deprecated on
 * npm, every one carrying npm's stock "contact support" text, and their repo
 * stating plainly that no security guarantees are provided. Nothing told the
 * people installing them. This rule does.
 */
describe('MCPG-106 deprecated-package rule', () => {
  it('flags a launched package the registry marks deprecated', () => {
    const target = load('malicious/deprecated-package.json');
    const findings = deprecatedPackageRule.check(
      target,
      ctxWith([
        status('@modelcontextprotocol/server-postgres', {
          deprecated: NPM_DEFAULT,
          allVersionsDeprecated: true,
          deprecationIsGeneric: true,
        }),
      ]),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-106');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.logicalPath).toBe('/mcpServers/postgres/args/1');
  });

  it('quotes the registry message, because that is the only guidance the user will ever see', () => {
    const target = load('malicious/deprecated-package.json');
    const [finding] = deprecatedPackageRule.check(
      target,
      ctxWith([
        status('@modelcontextprotocol/server-github', {
          deprecated: 'Superseded by github/github-mcp-server',
        }),
      ]),
    );
    expect(finding?.message).toContain('Superseded by github/github-mcp-server');
  });

  it('says so when the message is npm boilerplate that names no replacement', () => {
    // "Contact npm support" is a dead end; the finding has to say that rather
    // than pass the text along as though it were advice.
    const target = load('malicious/deprecated-package.json');
    const [finding] = deprecatedPackageRule.check(
      target,
      ctxWith([
        status('@modelcontextprotocol/server-postgres', {
          deprecated: NPM_DEFAULT,
          deprecationIsGeneric: true,
        }),
      ]),
    );
    expect(finding?.remediation).toMatch(/names no replacement|no replacement/i);
  });

  it('matches the package by name even when the launch spec carries a version', () => {
    // "@scope/name@2025.4.8" in the config, "@scope/name" in the registry.
    const target = load('malicious/deprecated-package.json');
    const findings = deprecatedPackageRule.check(
      target,
      ctxWith([status('@modelcontextprotocol/server-github', { deprecated: 'gone' })]),
    );
    expect(findings.map((f) => f.logicalPath)).toEqual(['/mcpServers/github/args/1']);
  });

  it('leaves a healthy package alone', () => {
    const target = load('malicious/deprecated-package.json');
    expect(
      deprecatedPackageRule.check(
        target,
        ctxWith([status('@modelcontextprotocol/server-filesystem')]),
      ),
    ).toEqual([]);
  });

  it('stays silent about a package the registry was not asked about', () => {
    // Absent from the map means "unknown", not "fine" — and unknown is
    // reported as nothing, because a finding needs evidence.
    const target = load('malicious/deprecated-package.json');
    expect(deprecatedPackageRule.check(target, ctxWith([]))).toEqual([]);
  });

  it('stays silent when the registry was never consulted at all', () => {
    // No --registry flag: the context has no map, and the rule must not
    // invent one or reach for the network itself.
    const target = load('malicious/deprecated-package.json');
    expect(deprecatedPackageRule.check(target, { cwd: FIXTURES_ROOT })).toEqual([]);
  });

  it('ignores servers that are not launched from a package', () => {
    const target = load('benign/http-remote-server.json');
    expect(
      deprecatedPackageRule.check(target, ctxWith([status('anything', { deprecated: 'x' })])),
    ).toEqual([]);
  });
});
