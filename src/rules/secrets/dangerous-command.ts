import { createFinding, type Finding } from '../../core/finding.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

const SHELL_INTERPRETERS = new Set([
  'sh',
  'bash',
  'zsh',
  'cmd',
  'cmd.exe',
  'powershell',
  'powershell.exe',
  'pwsh',
  'pwsh.exe',
]);
const SHELL_FLAG = /^(-c|\/c|-command|--command)$/i;
/** A download piped straight into an interpreter — fetch-and-execute with no
 * review step in between. This is the shape of a supply-chain "curl | sh"
 * installer, whether or not it's actually malicious. */
const PIPE_TO_INTERPRETER = /\|\s*(sh|bash|zsh|python3?|node|powershell|pwsh)\b/i;

function basename(commandPath: string): string {
  const segments = commandPath.replace(/\\/g, '/').split('/');
  return (segments[segments.length - 1] ?? commandPath).toLowerCase();
}

export const dangerousCommandRule: Rule = {
  id: 'MCPG-104',
  title: 'MCP server launched via an opaque or dangerous shell invocation',
  // Nominal/worst-case severity for this rule's listing (`guardmcp rules`);
  // individual findings are scored critical or medium per-instance below,
  // since "shell -c" alone is a smell but "curl | sh" inside it is an
  // actual fetch-and-execute pattern.
  severity: 'critical',
  confidence: 'high',
  category: 'secrets',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-104.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def)) continue;
      if (!SHELL_INTERPRETERS.has(basename(def.command))) continue;

      const args = def.args ?? [];
      const flagIndex = args.findIndex((arg) => SHELL_FLAG.test(arg));
      if (flagIndex === -1) continue; // shell invoked with no -c: unusual, out of scope for now

      const scriptIndex = flagIndex + 1;
      const script = args[scriptIndex] ?? args.slice(flagIndex + 1).join(' ');
      const isPipeToInterpreter = PIPE_TO_INTERPRETER.test(script);

      const logicalPath = `/mcpServers/${serverName}/args/${scriptIndex}`;
      const range = target.document.locate(['mcpServers', serverName, 'args', scriptIndex]);
      const location = range
        ? {
            file: target.relativePath,
            line: range.line,
            column: range.column,
            endLine: range.endLine,
            endColumn: range.endColumn,
          }
        : { file: target.relativePath, line: 1, column: 1 };

      findings.push(
        createFinding({
          ruleId: dangerousCommandRule.id,
          severity: isPipeToInterpreter ? 'critical' : 'medium',
          confidence: dangerousCommandRule.confidence,
          message: isPipeToInterpreter
            ? `"${serverName}" server's launch command downloads and executes a remote script in one step (pipe to an interpreter) — the code that runs is whatever the remote host serves at scan/run time, not what you reviewed.`
            : `"${serverName}" server is launched through a shell (${def.command} ${args[flagIndex]}) instead of invoking the binary directly — harder to audit than a plain command, and a place secrets/flags can hide inside a single opaque string.`,
          remediation: isPipeToInterpreter
            ? 'Download the installer, review it, then run it as a separate step — never pipe an unreviewed remote script straight into an interpreter as part of a server launch command.'
            : 'Invoke the target binary directly (command + args array) instead of wrapping it in a shell -c string, so the actual command being run is visible without executing anything.',
          location,
          logicalPath,
        }),
      );
    }

    return findings;
  },
};
