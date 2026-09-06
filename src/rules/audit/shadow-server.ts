import { createFinding, type Finding } from '../../core/finding.js';
import type { Rule } from '../types.js';

/**
 * OWASP MCP09 is about MCP instances "that operate outside the
 * organization's formal security governance". Most of its detection guidance
 * is network-side — unregistered hosts, unknown certificates, anomalous
 * outbound traffic — which a config scanner cannot see.
 *
 * What a config scanner CAN see is the slice named by "agents invoking
 * unknown ... MCP endpoints": a server that this machine will load into the
 * same session as the project's servers, with the same reach, that the
 * project itself never declared. That is the governance gap in the one form
 * that is visible from disk.
 *
 * Reported at `low` on purpose. A personal server is not a vulnerability —
 * it is an inventory fact, and the finding is that nobody but its owner
 * knows it is there. Silent unless a project config actually took part in
 * the scan, so running guardmcp on a laptop with no project open does not
 * turn every personal tool into a finding.
 */
export const shadowServerRule: Rule = {
  id: 'MCPG-601',
  title: 'MCP server active outside the project’s declared configuration',
  severity: 'low',
  confidence: 'medium',
  category: 'governance',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-601.md',
  /** A server running alongside reviewed ones without having been reviewed
   * is the config-visible form of a shadow deployment. */
  owasp: ['MCP09'],

  check(target, ctx) {
    // Only a machine-wide config can hold something the project does not
    // know about. The project's own file IS the reviewed set, and an
    // explicitly-named file carries no scope we can reason from.
    if (target.scope !== 'global') return [];

    const projectServers = ctx.projectServers;
    if (!projectServers || projectServers.size === 0) return [];

    const findings: Finding[] = [];
    for (const serverName of Object.keys(target.config.mcpServers ?? {})) {
      if (projectServers.has(serverName)) continue;

      const range = target.document.locate(['mcpServers', serverName]);
      findings.push(
        createFinding({
          ruleId: shadowServerRule.id,
          severity: shadowServerRule.severity,
          confidence: shadowServerRule.confidence,
          message: `"${serverName}" is configured machine-wide but is not declared in this project's config — it loads alongside the project's servers, with the same reach, without having been reviewed with them.`,
          remediation: `If the project needs it, declare it in the project config so it is reviewed and pinned like the rest. If it is personal tooling, that is fine — but be aware it sees the same context as project servers do, and nobody reviewing this repository can tell it is there.`,
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
