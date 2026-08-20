import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../src/discovery/index.js';
import { hardcodedSecretRule } from '../../../src/rules/secrets/hardcoded-secret.js';

const FIXTURES = fileURLToPath(new URL('../../fixtures/configs', import.meta.url));

describe('VS Code "servers"-key config (regression: was silently scanning zero servers)', () => {
  it('loadScanTarget normalizes "servers" into the config.mcpServers the rest of the app expects', () => {
    const target = loadScanTarget(`${FIXTURES}/malicious/vscode-servers-key.json`, FIXTURES);
    expect(target.config.mcpServers?.['example-server']).toBeDefined();
  });

  it('a rule actually finds the secret in a VS Code-style config', () => {
    const target = loadScanTarget(`${FIXTURES}/malicious/vscode-servers-key.json`, FIXTURES);
    const findings = hardcodedSecretRule.check(target, { cwd: FIXTURES });
    expect(findings).toHaveLength(1);
  });

  it('resolves a real line/column against the actual on-disk "servers" root, not a 1:1 fallback', () => {
    const target = loadScanTarget(`${FIXTURES}/malicious/vscode-servers-key.json`, FIXTURES);
    const [finding] = hardcodedSecretRule.check(target, { cwd: FIXTURES });
    expect(finding?.location.line).toBeGreaterThan(1);
  });
});
