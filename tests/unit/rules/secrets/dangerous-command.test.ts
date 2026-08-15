import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { dangerousCommandRule } from '../../../../src/rules/secrets/dangerous-command.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-104 dangerous-command rule', () => {
  it('flags a curl-pipe-to-shell pattern as critical', () => {
    const target = load('malicious/shell-pipe-to-sh.json');
    const findings = dangerousCommandRule.check(target, CTX);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-104');
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[0]?.message).toMatch(/pipe|download.*execut/i);
  });

  it('flags a plain opaque shell -c invocation as medium (no pipe pattern)', () => {
    const target = load('malicious/opaque-shell-command.json');
    const findings = dangerousCommandRule.check(target, CTX);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('medium');
  });

  it.each([
    'no-env.json',
    'env-var-reference.json',
    'http-remote-server.json',
    'multi-server-clean.json',
  ])('reports nothing for benign fixture %s (direct binary invocation, no shell)', (name) => {
    const target = load(`benign/${name}`);
    expect(dangerousCommandRule.check(target, CTX)).toEqual([]);
  });
});
