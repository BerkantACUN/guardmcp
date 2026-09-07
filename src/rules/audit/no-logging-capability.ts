import { createFinding, type Finding } from '../../core/finding.js';
import { readsAsDestructive } from '../../detectors/destructive-verbs.js';
import { serverKey } from '../../model/server-key.js';
import type { ToolDefinition } from '../../model/tool-definition.js';
import type { Rule } from '../types.js';

/**
 * MCP08 observed at the protocol instead of inferred from a config file.
 *
 * A server declares its capabilities at `initialize`. `logging` means "I can
 * send log messages to the client" — it is the channel through which a server
 * reports what it did. A server without it can still act; it simply has no way
 * to say so, and a client has nowhere to collect a record from.
 *
 * Deliberately NOT reported for every server that lacks logging. Plenty of
 * read-only servers legitimately have nothing to report, and flagging them all
 * would repeat the mistake MCPG-404 was rewritten to undo: a rule that fires on
 * everything carries no information. The finding is the COMBINATION — this
 * server can change things, and nothing it changes can be reported.
 */
function canChangeSomething(tool: ToolDefinition): boolean {
  if (tool.annotations?.destructiveHint === true) return true;
  // An explicit readOnlyHint is the server telling us it cannot; take it at
  // its word here. MCPG-303 is the rule for a name that contradicts it.
  if (tool.annotations?.readOnlyHint === true) return false;
  return readsAsDestructive(tool.name) || readsAsDestructive(tool.description);
}

export const noLoggingCapabilityRule: Rule = {
  id: 'MCPG-702',
  title: 'Server can change things but declares no logging capability',
  severity: 'medium',
  confidence: 'high', // both halves are observed at initialize and tools/list
  category: 'audit',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-702.md',
  /** Actions occur and no record of them can be produced. */
  owasp: ['MCP08'],

  check(target, ctx) {
    const capabilities = ctx.capabilitiesByServerKey;
    const liveTools = ctx.liveTools;
    // No `--live`, no evidence. A config file says nothing about what a
    // server declares at initialize.
    if (!capabilities || !liveTools) return [];

    const findings: Finding[] = [];

    for (const serverName of Object.keys(target.config.mcpServers ?? {})) {
      const key = serverKey(target.relativePath, serverName);
      const declared = capabilities.get(key);
      if (!declared) continue; // never reached, or connection failed
      if (declared.logging !== undefined) continue; // it can report; nothing to say

      const mutating = (liveTools.get(key) ?? []).filter(canChangeSomething);
      if (mutating.length === 0) continue;

      const range = target.document.locate(['mcpServers', serverName]);
      findings.push(
        createFinding({
          ruleId: noLoggingCapabilityRule.id,
          severity: noLoggingCapabilityRule.severity,
          confidence: noLoggingCapabilityRule.confidence,
          message: `"${serverName}" advertises ${mutating.length} tool(s) that change things (e.g. "${mutating[0]?.name}") but declared no "logging" capability at initialize — it has no channel to report what it did, so a client has nowhere to collect a record from.`,
          remediation:
            'If you maintain the server, declare the `logging` capability and emit a notification per tool call. If you do not, treat this server as unauditable: whatever it does will have to be reconstructed from the client side, if at all — which is the position MCP08 exists to warn about.',
          location: range
            ? {
                file: target.relativePath,
                line: range.line,
                column: range.column,
                endLine: range.endLine,
                endColumn: range.endColumn,
              }
            : { file: target.relativePath, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}`,
        }),
      );
    }

    return findings;
  },
};
