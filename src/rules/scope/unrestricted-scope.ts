import { createFinding, type Finding } from '../../core/finding.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

/** A bare filesystem root — "give this tool the whole disk" — as opposed to
 * a real subdirectory. Matches both POSIX ("/") and Windows ("C:\", "C:/")
 * drive-root forms, plus an unqualified home-directory shorthand. */
const FILESYSTEM_ROOT = /^(\/|~|[A-Za-z]:[\\/]?)$/;

export const unrestrictedScopeRule: Rule = {
  id: 'MCPG-301',
  title: 'MCP server scoped to an entire filesystem root',
  severity: 'high',
  confidence: 'high',
  category: 'scope',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-301.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.args) continue;

      const rootArgIndex = def.args.findIndex((arg) => FILESYSTEM_ROOT.test(arg));
      if (rootArgIndex === -1) continue;

      const logicalPath = `/mcpServers/${serverName}/args/${rootArgIndex}`;
      const range = target.document.locate(['mcpServers', serverName, 'args', rootArgIndex]);
      findings.push(
        createFinding({
          ruleId: unrestrictedScopeRule.id,
          severity: unrestrictedScopeRule.severity,
          confidence: unrestrictedScopeRule.confidence,
          message: `"${serverName}" server is scoped to "${def.args[rootArgIndex]}" — an entire filesystem root/home directory rather than a specific project folder, giving it read/write reach far beyond what an MCP server typically needs.`,
          remediation:
            'Point the server at the narrowest directory that covers its actual job (a specific project folder), not a drive root or home directory.',
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
