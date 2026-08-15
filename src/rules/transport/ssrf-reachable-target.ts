import { createFinding, type Finding } from '../../core/finding.js';
import { isPrivateOrMetadataHost } from '../../detectors/url-risk.js';
import { isHttpServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

export const ssrfReachableTargetRule: Rule = {
  id: 'MCPG-403',
  title: 'MCP server URL points at a private or cloud-metadata address',
  severity: 'high',
  confidence: 'high',
  category: 'transport',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-403.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;

      let parsed: URL;
      try {
        parsed = new URL(def.url);
      } catch {
        continue;
      }

      if (!isPrivateOrMetadataHost(parsed.hostname)) continue;

      const logicalPath = `/mcpServers/${serverName}/url`;
      const range = target.document.locate(['mcpServers', serverName, 'url']);
      findings.push(
        createFinding({
          ruleId: ssrfReachableTargetRule.id,
          severity: ssrfReachableTargetRule.severity,
          confidence: ssrfReachableTargetRule.confidence,
          message: `"${serverName}" server URL targets ${parsed.hostname}, a private-network or cloud-metadata address — a config that looks like it talks to an external API but actually reaches internal infrastructure is a classic SSRF pattern.`,
          remediation:
            'Point the server at its real public endpoint. If internal access is genuinely intended, confirm that deliberately and document why — this pattern is otherwise indistinguishable from a config tampered with to pivot into your internal network.',
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
