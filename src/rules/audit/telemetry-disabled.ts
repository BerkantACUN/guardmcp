import { createFinding, type Finding } from '../../core/finding.js';
import { findTelemetrySwitches } from '../../detectors/telemetry-switches.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

/**
 * OWASP MCP08's own attack scenarios are all variations on the same shape:
 * something goes wrong, and the investigation finds nothing to look at
 * ("incident response teams reporting 'no data available'"). This rule
 * catches the moment that silence is configured, which is the last point at
 * which it is cheap to undo.
 *
 * It makes no claim about the server's intent. A developer silencing logs
 * to clean up local output is the common case — the finding is that the
 * setting survived into a committed config, where it now applies to
 * everyone who uses it.
 */
export const telemetryDisabledRule: Rule = {
  id: 'MCPG-701',
  title: 'Telemetry or logging disabled in MCP server launch environment',
  severity: 'medium',
  confidence: 'medium',
  category: 'audit',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-701.md',
  /** Configured silence is the mechanism behind MCP08's scenarios: an action
   * takes place and no record of it exists to review afterwards. */
  owasp: ['MCP08'],

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      // Only stdio servers carry an `env` block. A remote server's logging
      // is configured on the server side, out of this file's reach.
      if (!isStdioServerDef(def) || !def.env) continue;

      for (const match of findTelemetrySwitches(def.env)) {
        const range = target.document.locate(['mcpServers', serverName, 'env', match.key]);
        findings.push(
          createFinding({
            ruleId: telemetryDisabledRule.id,
            severity: telemetryDisabledRule.severity,
            confidence: match.confidence,
            message: `"${serverName}" server sets ${match.key}=${match.value} — ${match.label}. Anything this server does will leave no record of its own.`,
            remediation: `Remove ${match.key} from the committed config, or scope it to local development only. MCP08 exists because the cost of this setting is only ever paid later: when an action is questioned, the audit trail an investigation needs was never written.`,
            location: range
              ? {
                  file: target.relativePath,
                  line: range.line,
                  column: range.column,
                  endLine: range.endLine,
                  endColumn: range.endColumn,
                }
              : { file: target.relativePath, line: 1, column: 1 },
            logicalPath: `/mcpServers/${serverName}/env/${match.key}`,
            evidence: `${match.key}=${match.value}`,
          }),
        );
      }
    }

    return findings;
  },
};
