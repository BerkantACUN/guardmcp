import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { unpinnedPackageRule } from '../../../../src/rules/secrets/unpinned-package.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-105 unpinned-package rule', () => {
  it('flags an npx-launched package with no version pin', () => {
    const target = load('malicious/unpinned-package.json');
    const findings = unpinnedPackageRule.check(target, CTX);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-105');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.logicalPath).toBe('/mcpServers/risky/args/1');
  });

  it('does not flag packages pinned to an explicit version', () => {
    const target = load('benign/pinned-package.json');
    expect(unpinnedPackageRule.check(target, CTX)).toEqual([]);
  });

  it.each(['no-env.json', 'http-remote-server.json'])(
    'reports nothing for benign fixture %s',
    (name) => {
      const target = load(`benign/${name}`);
      expect(unpinnedPackageRule.check(target, CTX)).toEqual([]);
    },
  );
});
