import { createFinding, type Finding } from '../../core/finding.js';
import { findExposedListeners } from '../../detectors/exposed-listener.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

/**
 * A stdio entry normally means "a process only this client talks to". When
 * the same entry starts the server listening on 0.0.0.0, it has also started
 * a network service: anyone who can reach the machine can reach the server,
 * with whatever credentials its `env` hands it — and nothing in the client's
 * config view says so.
 *
 * That is the config-visible form of OWASP MCP09. The server is not
 * unregistered on this machine, but to the network it is exactly the
 * unreviewed, unmonitored endpoint MCP09 describes, and the measurements the
 * category cites (servers found bound to 0.0.0.0 and reachable) begin with a
 * setting like this one.
 */
export const exposedListenerRule: Rule = {
  id: 'MCPG-602',
  title: 'MCP server launched listening on every network interface',
  severity: 'medium',
  confidence: 'high',
  category: 'governance',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-602.md',
  /** A server reachable from the network that its owner configured as a
   * local tool is the config-side origin of a shadow MCP endpoint. */
  owasp: ['MCP09'],

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue;

      for (const match of findExposedListeners(def.command, def.args, def.env)) {
        const path = ['mcpServers', serverName, match.field, match.key];
        const range = target.document.locate(path);
        findings.push(
          createFinding({
            ruleId: exposedListenerRule.id,
            severity: exposedListenerRule.severity,
            confidence: match.confidence,
            message: `"${serverName}" server ${match.label} (${match.text}). Anything that can reach this machine over the network can reach the server — and act with the credentials it was started with — not only the MCP client that launched it.`,
            remediation:
              'Bind to loopback instead (127.0.0.1 or localhost; for Docker, publish as 127.0.0.1:<port>:<port>). If the server genuinely has to be reachable from other hosts, run it as a remote server behind authentication and TLS, registered and monitored like any other service, rather than as a local tool that happens to listen publicly.',
            location: range
              ? {
                  file: target.relativePath,
                  line: range.line,
                  column: range.column,
                  endLine: range.endLine,
                  endColumn: range.endColumn,
                }
              : { file: target.relativePath, line: 1, column: 1 },
            logicalPath: `/${path.join('/')}`,
            evidence: match.text,
          }),
        );
      }
    }

    return findings;
  },
};
