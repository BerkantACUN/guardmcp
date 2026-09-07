import { createFinding, type Finding } from '../../core/finding.js';
import { isHttpServerDef } from '../../model/mcp-server-def.js';
import { serverKey } from '../../model/server-key.js';
import type { Rule } from '../types.js';

const AUTH_HEADER_NAMES = new Set([
  'authorization',
  'x-api-key',
  'x-auth-token',
  'apikey',
  'api-key',
  'cookie',
]);

function hasAuthHeader(headers: Record<string, string> | undefined): boolean {
  if (!headers) return false;
  return Object.keys(headers).some((name) => AUTH_HEADER_NAMES.has(name.toLowerCase()));
}

/**
 * Only reports what was actually observed.
 *
 * The original form of this rule read the config alone: a remote server with
 * no Authorization header was called unauthenticated. Measured against the
 * official registry on 2026-09-07, that was wrong two times in three — of six
 * advertised endpoints probed with no credentials, FOUR answered 403. They
 * enforce access control while carrying no static header, because MCP's own
 * authorization flow is OAuth: the client obtains a token at runtime and the
 * config holds nothing.
 *
 * A config file cannot answer this question, so the rule no longer asks it of
 * one. Under `--live` it does not have to guess: if guardmcp connected with no
 * credentials and listed the server's tools, the endpoint is open, and that is
 * an observation rather than a supposition.
 */
export const unauthenticatedRemoteEndpointRule: Rule = {
  id: 'MCPG-404',
  title: 'Remote MCP endpoint answered an unauthenticated client',
  severity: 'medium',
  confidence: 'high', // evidence, not inference: we connected and it served us
  category: 'transport',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-404.md',
  /** A remote endpoint with no auth is the entry itself. */
  owasp: ['MCP07'],

  check(target, ctx) {
    // No `--live` means no evidence. A config file shows what credentials are
    // configured, never what the far end enforces, and reporting on that
    // difference is how a scanner earns being switched off.
    const liveTools = ctx.liveTools;
    if (!liveTools) return [];

    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;
      if (hasAuthHeader(def.headers)) continue;

      // Absent from the live map means the connection did not succeed — a
      // 401/403 looks exactly like this from here, and that is auth working.
      if (!liveTools.has(serverKey(target.relativePath, serverName))) continue;

      const logicalPath = `/mcpServers/${serverName}`;
      const range = target.document.locate(['mcpServers', serverName]);
      findings.push(
        createFinding({
          ruleId: unauthenticatedRemoteEndpointRule.id,
          severity: unauthenticatedRemoteEndpointRule.severity,
          confidence: unauthenticatedRemoteEndpointRule.confidence,
          message: `"${serverName}" served its tool list to guardmcp over an unauthenticated connection — no credentials were sent and none were required. Anyone who can reach this URL can use this server.`,
          remediation:
            'If the endpoint is meant to be public, nothing needs fixing — record that decision so the next reviewer does not have to rediscover it. Otherwise put it behind authentication: MCP supports an OAuth flow, or configure a static Authorization/API-key header for this server.',
          location: range
            ? {
                file: target.relativePath,
                line: range.line,
                column: range.column,
                endLine: range.endLine,
                endColumn: range.endColumn,
              }
            : { file: target.relativePath, line: 1, column: 1 },
          logicalPath,
        }),
      );
    }

    return findings;
  },
};
