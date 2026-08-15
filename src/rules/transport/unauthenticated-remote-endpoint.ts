import { createFinding, type Finding } from '../../core/finding.js';
import { isHttpServerDef } from '../../model/mcp-server-def.js';
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

export const unauthenticatedRemoteEndpointRule: Rule = {
  id: 'MCPG-404',
  title: 'Remote MCP endpoint with no visible authentication',
  severity: 'medium',
  confidence: 'medium', // auth could legitimately live elsewhere (mTLS, network policy) — heuristic, not certain
  category: 'transport',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-404.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;
      if (hasAuthHeader(def.headers)) continue;

      const logicalPath = `/mcpServers/${serverName}`;
      const range = target.document.locate(['mcpServers', serverName]);
      findings.push(
        createFinding({
          ruleId: unauthenticatedRemoteEndpointRule.id,
          severity: unauthenticatedRemoteEndpointRule.severity,
          confidence: unauthenticatedRemoteEndpointRule.confidence,
          message: `"${serverName}" is a remote HTTP MCP server with no Authorization/API-key header configured — if this endpoint is not otherwise access-controlled (mTLS, network policy), anyone who can reach it can use it.`,
          remediation:
            'Add an Authorization or API-key header, or confirm the endpoint enforces access control by other means and note that explicitly.',
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
