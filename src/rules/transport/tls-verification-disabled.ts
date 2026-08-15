import { createFinding, type Finding } from '../../core/finding.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

const DANGEROUS_ARG_FLAGS = new Set(['--insecure', '-k', '--no-check-certificate']);

export const tlsVerificationDisabledRule: Rule = {
  id: 'MCPG-402',
  title: 'TLS certificate verification disabled',
  severity: 'critical',
  confidence: 'high',
  category: 'transport',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-402.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue;

      if (def.env?.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
        findings.push(
          buildFinding(
            target,
            serverName,
            ['mcpServers', serverName, 'env', 'NODE_TLS_REJECT_UNAUTHORIZED'],
            `/mcpServers/${serverName}/env/NODE_TLS_REJECT_UNAUTHORIZED`,
            'sets NODE_TLS_REJECT_UNAUTHORIZED=0, disabling TLS certificate validation for the entire Node.js process',
          ),
        );
      }

      if (def.env?.PYTHONHTTPSVERIFY === '0') {
        findings.push(
          buildFinding(
            target,
            serverName,
            ['mcpServers', serverName, 'env', 'PYTHONHTTPSVERIFY'],
            `/mcpServers/${serverName}/env/PYTHONHTTPSVERIFY`,
            'sets PYTHONHTTPSVERIFY=0, disabling TLS certificate validation for the Python process',
          ),
        );
      }

      const args = def.args ?? [];
      const flagIndex = args.findIndex((arg) => DANGEROUS_ARG_FLAGS.has(arg));
      if (flagIndex !== -1) {
        findings.push(
          buildFinding(
            target,
            serverName,
            ['mcpServers', serverName, 'args', flagIndex],
            `/mcpServers/${serverName}/args/${flagIndex}`,
            `passes ${args[flagIndex]}, disabling TLS certificate validation for its own requests`,
          ),
        );
      }
    }

    return findings;
  },
};

function buildFinding(
  target: Parameters<Rule['check']>[0],
  serverName: string,
  jsonPath: (string | number)[],
  logicalPath: string,
  reason: string,
): Finding {
  const range = target.document.locate(jsonPath);
  return createFinding({
    ruleId: tlsVerificationDisabledRule.id,
    severity: tlsVerificationDisabledRule.severity,
    confidence: tlsVerificationDisabledRule.confidence,
    message: `"${serverName}" server ${reason} — this makes the server (and MCP traffic it handles) vulnerable to man-in-the-middle interception.`,
    remediation:
      'Remove the setting and fix the underlying certificate problem instead (install the correct CA, use a valid cert) — never disable verification as a workaround.',
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
  });
}
