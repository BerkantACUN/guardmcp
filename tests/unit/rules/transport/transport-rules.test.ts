import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { insecureTransportRule } from '../../../../src/rules/transport/insecure-transport.js';
import { ssrfReachableTargetRule } from '../../../../src/rules/transport/ssrf-reachable-target.js';
import { tlsVerificationDisabledRule } from '../../../../src/rules/transport/tls-verification-disabled.js';
import { unauthenticatedRemoteEndpointRule } from '../../../../src/rules/transport/unauthenticated-remote-endpoint.js';

const FIXTURES_ROOT = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const CTX = { cwd: FIXTURES_ROOT };

function load(relativeToFixtures: string) {
  return loadScanTarget(`${FIXTURES_ROOT}/${relativeToFixtures}`, FIXTURES_ROOT);
}

const BENIGN = [
  'no-env.json',
  'env-var-reference.json',
  'http-remote-server.json',
  'multi-server-clean.json',
];

describe('MCPG-401 insecure-transport rule', () => {
  it('flags a plain http:// URL to a non-loopback host', () => {
    const target = load('malicious/insecure-http-transport.json');
    const findings = insecureTransportRule.check(target, CTX);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-401');
    expect(findings[0]?.severity).toBe('high');
  });

  it('does not flag https:// (benign fixture already uses it)', () => {
    const target = load('benign/http-remote-server.json');
    expect(insecureTransportRule.check(target, CTX)).toEqual([]);
  });

  it.each(BENIGN)('reports nothing for benign fixture %s', (name) => {
    expect(insecureTransportRule.check(load(`benign/${name}`), CTX)).toEqual([]);
  });
});

describe('MCPG-402 tls-verification-disabled rule', () => {
  it('flags NODE_TLS_REJECT_UNAUTHORIZED=0', () => {
    const target = load('malicious/tls-verification-disabled.json');
    const findings = tlsVerificationDisabledRule.check(target, CTX);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-402');
    expect(findings[0]?.severity).toBe('critical');
  });

  it.each(BENIGN)('reports nothing for benign fixture %s', (name) => {
    expect(tlsVerificationDisabledRule.check(load(`benign/${name}`), CTX)).toEqual([]);
  });
});

describe('MCPG-403 ssrf-reachable-target rule', () => {
  it('flags a URL pointing at the cloud metadata address', () => {
    const target = load('malicious/ssrf-reachable-target.json');
    const findings = ssrfReachableTargetRule.check(target, CTX);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-403');
    expect(findings[0]?.severity).toBe('high');
  });

  it.each(BENIGN)('reports nothing for benign fixture %s', (name) => {
    expect(ssrfReachableTargetRule.check(load(`benign/${name}`), CTX)).toEqual([]);
  });
});

describe('MCPG-404 unauthenticated-remote-endpoint rule', () => {
  it('says nothing from the config alone — see unauthenticated-remote.test.ts', () => {
    // This used to assert a finding here. Measured against the official
    // registry, that was wrong two times in three: four of six advertised
    // endpoints answered 403 while carrying no static header, because MCP's
    // auth flow is OAuth and the token is obtained at runtime. The rule now
    // requires --live evidence; the behaviour is covered in full in
    // tests/unit/rules/transport/unauthenticated-remote.test.ts.
    const target = load('malicious/no-auth-remote-endpoint.json');
    expect(unauthenticatedRemoteEndpointRule.check(target, CTX)).toEqual([]);
  });

  it('does not flag an http-type server that has an Authorization header', () => {
    const target = load('benign/http-remote-server.json');
    expect(unauthenticatedRemoteEndpointRule.check(target, CTX)).toEqual([]);
  });

  it.each(['no-env.json', 'env-var-reference.json', 'multi-server-clean.json'])(
    'reports nothing for benign fixture %s (no http servers at all)',
    (name) => {
      expect(unauthenticatedRemoteEndpointRule.check(load(`benign/${name}`), CTX)).toEqual([]);
    },
  );
});
