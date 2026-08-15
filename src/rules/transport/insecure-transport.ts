import { createFinding, type Finding } from '../../core/finding.js';
import { isLoopbackHost } from '../../detectors/url-risk.js';
import { isHttpServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

export const insecureTransportRule: Rule = {
  id: 'MCPG-401',
  title: 'Unencrypted (http://) MCP server transport',
  severity: 'high',
  confidence: 'high',
  category: 'transport',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-401.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isHttpServerDef(def)) continue;

      let parsed: URL;
      try {
        parsed = new URL(def.url);
      } catch {
        continue; // malformed URL is a different concern, not this rule's
      }

      if (parsed.protocol !== 'http:') continue;
      if (isLoopbackHost(parsed.hostname)) continue; // local dev servers are expected to be plain http

      const logicalPath = `/mcpServers/${serverName}/url`;
      const range = target.document.locate(['mcpServers', serverName, 'url']);
      findings.push(
        createFinding({
          ruleId: insecureTransportRule.id,
          severity: insecureTransportRule.severity,
          confidence: insecureTransportRule.confidence,
          message: `"${serverName}" server connects over unencrypted HTTP (${parsed.hostname}) — traffic, including any Authorization header, is readable/tamperable by anyone on the network path.`,
          remediation: 'Use https:// for any non-loopback MCP server endpoint.',
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
