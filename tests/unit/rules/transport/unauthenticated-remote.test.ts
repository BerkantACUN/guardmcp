import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { serverKey } from '../../../../src/model/server-key.js';
import type { ToolDefinition } from '../../../../src/model/tool-definition.js';
import { unauthenticatedRemoteEndpointRule } from '../../../../src/rules/transport/unauthenticated-remote-endpoint.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const load = (rel: string) => loadScanTarget(`${FIXTURES}/${rel}`, FIXTURES);

const OPEN_TOOLS: readonly ToolDefinition[] = [
  { serverName: 'open-remote', name: 't', description: '' },
];

/**
 * Measured against the official registry on 2026-09-07: of six advertised
 * remote endpoints probed with no credentials, FOUR answered 403. They enforce
 * access control while carrying no static header, because MCP's own
 * authorization flow is OAuth — the client obtains a token at runtime and the
 * config holds nothing.
 *
 * A rule that called those four "unauthenticated" was wrong two times in
 * three. So it no longer guesses from the config at all.
 */
describe('MCPG-404 without --live', () => {
  it('says nothing, because a config file cannot show whether an endpoint enforces auth', () => {
    const findings = unauthenticatedRemoteEndpointRule.check(
      load('malicious/no-auth-remote-endpoint.json'),
      {
        cwd: FIXTURES,
      },
    );
    expect(findings).toEqual([]);
  });
});

describe('MCPG-404 with --live', () => {
  const target = load('malicious/no-auth-remote-endpoint.json');
  const key = serverKey(target.relativePath, 'open-remote');

  it('reports an endpoint we actually reached with no credentials', () => {
    const findings = unauthenticatedRemoteEndpointRule.check(target, {
      cwd: FIXTURES,
      liveTools: new Map([[key, OPEN_TOOLS]]),
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.confidence).toBe('high');
    // The message must state the evidence, not a supposition.
    expect(findings[0]?.message).toMatch(/served its tool list|no credentials were sent/i);
    expect(findings[0]?.message).not.toMatch(/if this endpoint is not/i);
  });

  it('says nothing when the endpoint refused us — that is auth working', () => {
    // --live ran (liveTools present) but this server is absent from it: the
    // connection failed, which is what a 401/403 looks like from here.
    const findings = unauthenticatedRemoteEndpointRule.check(target, {
      cwd: FIXTURES,
      liveTools: new Map(),
    });
    expect(findings).toEqual([]);
  });

  it('says nothing when the config already carries credentials', () => {
    const withAuth = load('benign/http-remote-server.json');
    const authKey = serverKey(
      withAuth.relativePath,
      Object.keys(withAuth.config.mcpServers ?? {})[0] ?? '',
    );
    expect(
      unauthenticatedRemoteEndpointRule.check(withAuth, {
        cwd: FIXTURES,
        liveTools: new Map([[authKey, OPEN_TOOLS]]),
      }),
    ).toEqual([]);
  });

  it('never fires for a stdio server', () => {
    const stdio = load('malicious/leaked-github-token.json');
    expect(
      unauthenticatedRemoteEndpointRule.check(stdio, { cwd: FIXTURES, liveTools: new Map() }),
    ).toEqual([]);
  });
});
