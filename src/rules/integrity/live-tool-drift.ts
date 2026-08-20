import { createFinding, type Finding } from '../../core/finding.js';
import { serverKey } from '../../model/server-key.js';
import { computeToolsHash } from '../../pin/tools-hash.js';
import type { Rule } from '../types.js';

/**
 * Compares a server's REAL current tools (from `--live` introspection)
 * against what `guardmcp pin --live` last recorded. This is the rug-pull
 * MCPG-501 can't catch: an unpinned `npx some-mcp-server` launch command
 * can stay byte-identical while a new publish under the same tag silently
 * ships a tool whose description or input schema now does something the
 * user never approved. Only fires when BOTH the server was pinned with
 * `--live` (a toolsHash exists) AND this scan also used `--live` (so we
 * have something real to compare against) — otherwise silent, not a false
 * "changed" signal from missing data.
 */
export const liveToolDriftRule: Rule = {
  id: 'MCPG-502',
  title: "Server's live tool definitions changed since they were last pinned",
  severity: 'critical',
  confidence: 'high',
  category: 'integrity',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-502.md',

  check(target, ctx) {
    if (!ctx.lock || !ctx.liveTools) return [];
    const servers = target.config.mcpServers ?? {};
    const findings: Finding[] = [];

    for (const serverName of Object.keys(servers)) {
      const key = serverKey(target.relativePath, serverName);
      const pinned = ctx.lock.servers[key];
      if (!pinned?.toolsHash) continue;

      const liveTools = ctx.liveTools.get(key);
      if (!liveTools) continue;

      const currentHash = computeToolsHash(liveTools);
      if (currentHash === pinned.toolsHash) continue;

      findings.push(
        createFinding({
          ruleId: liveToolDriftRule.id,
          severity: liveToolDriftRule.severity,
          confidence: liveToolDriftRule.confidence,
          message: `"${serverName}" server's real tool definitions (name/description/input schema) differ from what was pinned — a tool now does something different from what was reviewed and approved. This is the exact signature of a rug-pull attack.`,
          remediation: `Run "guardmcp scan --live --format json" to see the current tool list and diff it against what you expect. If the change is legitimate (a real upgrade you reviewed), re-pin with "guardmcp pin --live". If not, stop using this server and rotate anything it had access to — its behavior is no longer what was approved.`,
          location: { file: `live:${serverName}`, line: 1, column: 1 },
          logicalPath: `/mcpServers/${serverName}`,
          evidence: currentHash,
        }),
      );
    }

    return findings;
  },
};
