import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { unrestrictedScopeRule } from '../../../../src/rules/scope/unrestricted-scope.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-301 unrestricted-scope rule', () => {
  it('flags a server whose argument is the filesystem root', () => {
    const target = load('malicious/unrestricted-filesystem-scope.json');
    const findings = unrestrictedScopeRule.check(target, CTX);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-301');
    expect(findings[0]?.severity).toBe('high');
  });

  it.each([
    'no-env.json',
    'env-var-reference.json',
    'http-remote-server.json',
    'multi-server-clean.json',
  ])('reports nothing for benign fixture %s (scoped to a real subdirectory)', (name) => {
    expect(unrestrictedScopeRule.check(load(`benign/${name}`), CTX)).toEqual([]);
  });
});
