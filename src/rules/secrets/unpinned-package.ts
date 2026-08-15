import { createFinding, type Finding } from '../../core/finding.js';
import { isPinnedPackageSpec } from '../../detectors/package-spec.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

/** Runners whose first non-flag argument is an installable package spec.
 * `pnpm dlx <pkg>` follows the same idea but needs its own arg-shift
 * handling (dlx is arg[0], not the command) — deferred to a follow-up. */
const PACKAGE_RUNNERS = new Set(['npx', 'bunx', 'uvx']);

export const unpinnedPackageRule: Rule = {
  id: 'MCPG-105',
  title: 'Unpinned package version in MCP server launch command',
  severity: 'medium',
  confidence: 'medium',
  category: 'secrets',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-105.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.args) continue;
      if (!PACKAGE_RUNNERS.has(def.command)) continue;

      const specIndex = def.args.findIndex((arg) => !arg.startsWith('-'));
      if (specIndex === -1) continue;
      const spec = def.args[specIndex];
      if (spec === undefined || isPinnedPackageSpec(spec)) continue;

      const logicalPath = `/mcpServers/${serverName}/args/${specIndex}`;
      const range = target.document.locate(['mcpServers', serverName, 'args', specIndex]);
      findings.push(
        createFinding({
          ruleId: unpinnedPackageRule.id,
          severity: unpinnedPackageRule.severity,
          confidence: unpinnedPackageRule.confidence,
          message: `"${serverName}" server launches "${spec}" without a pinned version — every run may fetch a different, unreviewed release.`,
          remediation: `Pin to a specific version: "${spec}@<version>". A publish under the same "latest"/unpinned tag can silently change what code runs on your machine — this is exactly the "rug pull" supply-chain risk MCP config scanning exists to catch.`,
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
