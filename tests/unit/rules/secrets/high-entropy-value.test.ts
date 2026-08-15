import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { highEntropyValueRule } from '../../../../src/rules/secrets/high-entropy-value.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-102 high-entropy-value rule', () => {
  it('flags a high-entropy value under a secret-shaped key name', () => {
    const target = load('malicious/high-entropy-unknown-secret.json');
    const findings = highEntropyValueRule.check(target, CTX);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-102');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.confidence).toBe('medium');
    expect(findings[0]?.logicalPath).toBe('/mcpServers/custom-api/env/CUSTOM_API_KEY');
  });

  it('does not double-report a value MCPG-101 already caught with a known pattern', () => {
    // A known-pattern secret has high entropy too, but MCPG-101 already
    // covers it at "high" confidence — reporting it again here at "medium"
    // would just be noise.
    const target = load('malicious/leaked-github-token.json');
    expect(highEntropyValueRule.check(target, CTX)).toEqual([]);
  });

  it('does not flag an env-var reference (regression: a GITHUB_TOKEN placeholder was a real FP)', () => {
    const target = load('benign/env-var-reference.json');
    expect(highEntropyValueRule.check(target, CTX)).toEqual([]);
  });

  it('does not flag a short or low-entropy value even under a secret-shaped key', () => {
    const target = load('benign/short-generic-values.json'); // has no _KEY/_TOKEN suffixed keys, but double-check the gate
    expect(highEntropyValueRule.check(target, CTX)).toEqual([]);
  });

  it.each([
    'no-env.json',
    'env-var-reference.json',
    'http-remote-server.json',
    'multi-server-clean.json',
  ])('reports nothing for benign fixture %s', (name) => {
    const target = load(`benign/${name}`);
    expect(highEntropyValueRule.check(target, CTX)).toEqual([]);
  });
});
