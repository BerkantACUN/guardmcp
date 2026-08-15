import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { hardcodedSecretRule } from '../../../../src/rules/secrets/hardcoded-secret.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

describe('MCPG-101 hardcoded-secret rule', () => {
  it('flags a GitHub token hardcoded in env', () => {
    const target = load('malicious/leaked-github-token.json');
    const findings = hardcodedSecretRule.check(target, CTX);

    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding?.ruleId).toBe('MCPG-101');
    expect(finding?.severity).toBe('critical');
    expect(finding?.confidence).toBe('high');
    expect(finding?.logicalPath).toBe('/mcpServers/example-server/env/GITHUB_TOKEN');
  });

  it('never puts the raw secret in the finding — evidence is redacted', () => {
    const target = load('malicious/leaked-github-token.json');
    const [finding] = hardcodedSecretRule.check(target, CTX);
    expect(finding?.evidence).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz12');
    expect(finding?.evidence).toContain('…');
  });

  it('locates the finding at the actual line/column of the value', () => {
    const target = load('malicious/leaked-github-token.json');
    const [finding] = hardcodedSecretRule.check(target, CTX);
    expect(finding?.location.line).toBe(7);
  });

  it('finds one finding per server when multiple servers each leak a secret', () => {
    const target = load('malicious/multiple-secrets.json');
    const findings = hardcodedSecretRule.check(target, CTX);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.logicalPath).sort()).toEqual([
      '/mcpServers/anthropic-bot/env/ANTHROPIC_API_KEY',
      '/mcpServers/aws-tool/env/AWS_ACCESS_KEY_ID',
    ]);
  });

  it('flags a secret passed as a CLI arg, not just via env', () => {
    const target = load('malicious/secret-in-args.json');
    const findings = hardcodedSecretRule.check(target, CTX);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.logicalPath).toBe('/mcpServers/cli-tool/args/1');
    expect(findings[0]?.evidence).not.toContain('IOSFODNN7EXAMPLE');
  });

  it.each([
    'no-env.json',
    'env-var-reference.json',
    'http-remote-server.json',
    'multi-server-clean.json',
    'short-generic-values.json',
  ])('reports nothing for benign fixture %s', (name) => {
    const target = load(`benign/${name}`);
    expect(hardcodedSecretRule.check(target, CTX)).toEqual([]);
  });
});
