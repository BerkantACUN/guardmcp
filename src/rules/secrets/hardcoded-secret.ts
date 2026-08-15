import { createFinding, type Finding } from '../../core/finding.js';
import { findSecrets, redact } from '../../detectors/secret-patterns.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

const REMEDIATION =
  'Move this value to an environment variable or secret manager reference, then rotate the exposed credential — it must be treated as compromised once committed.';

export const hardcodedSecretRule: Rule = {
  id: 'MCPG-101',
  title: 'Hardcoded secret in MCP server config',
  severity: 'critical',
  confidence: 'high',
  category: 'secrets',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-101.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue; // HTTP servers have no env/args to leak secrets into

      if (def.env) {
        for (const [envKey, envValue] of Object.entries(def.env)) {
          for (const match of findSecrets(envValue)) {
            findings.push(
              buildFinding(
                target,
                `/mcpServers/${serverName}/env/${envKey}`,
                ['mcpServers', serverName, 'env', envKey],
                serverName,
                match.pattern.label,
                match.value,
              ),
            );
          }
        }
      }

      if (def.args) {
        def.args.forEach((arg, index) => {
          for (const match of findSecrets(arg)) {
            findings.push(
              buildFinding(
                target,
                `/mcpServers/${serverName}/args/${index}`,
                ['mcpServers', serverName, 'args', index],
                serverName,
                match.pattern.label,
                match.value,
              ),
            );
          }
        });
      }
    }

    return findings;
  },
};

function buildFinding(
  target: Parameters<Rule['check']>[0],
  logicalPath: string,
  jsonPath: (string | number)[],
  serverName: string,
  patternLabel: string,
  rawSecret: string,
): Finding {
  const range = target.document.locate(jsonPath);
  return createFinding({
    ruleId: hardcodedSecretRule.id,
    severity: hardcodedSecretRule.severity,
    confidence: hardcodedSecretRule.confidence,
    message: `Hardcoded ${patternLabel} found in "${serverName}" server config.`,
    remediation: REMEDIATION,
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
    evidence: redact(rawSecret),
  });
}
