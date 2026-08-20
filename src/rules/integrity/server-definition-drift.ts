import { createFinding, type Finding } from '../../core/finding.js';
import { serverKey } from '../../model/server-key.js';
import { computeDefinitionHash } from '../../pin/definition-hash.js';
import type { Rule } from '../types.js';

/**
 * Compares each server's current launch definition (command/args/url —
 * see pin/definition-hash.ts) against what `guardmcp pin` last recorded in
 * `.mcpguard-lock.json`. A server that was pinned and then quietly changed
 * WITHOUT re-pinning is the cheapest rug-pull vector there is: nothing
 * about the config's own contents looks obviously wrong the way a
 * hardcoded secret does, because the "before" state is only known via the
 * lock file, not the file itself. Silent (no finding) for any server
 * that was never pinned — this rule only fires on DRIFT, not absence.
 */
export const serverDefinitionDriftRule: Rule = {
  id: 'MCPG-501',
  title: 'Server definition changed since it was last pinned',
  severity: 'high',
  confidence: 'high',
  category: 'integrity',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-501.md',

  check(target, ctx) {
    if (!ctx.lock) return [];
    const servers = target.config.mcpServers ?? {};
    const findings: Finding[] = [];

    for (const [serverName, def] of Object.entries(servers)) {
      const key = serverKey(target.relativePath, serverName);
      const pinned = ctx.lock.servers[key];
      if (!pinned) continue;

      const currentHash = computeDefinitionHash(def);
      if (currentHash === pinned.definitionHash) continue;

      const range = target.document.locate(['mcpServers', serverName]);
      findings.push(
        createFinding({
          ruleId: serverDefinitionDriftRule.id,
          severity: serverDefinitionDriftRule.severity,
          confidence: serverDefinitionDriftRule.confidence,
          message: `"${serverName}" server's launch definition (command/args/url) has changed since it was last pinned — this is exactly what a config-level rug-pull looks like.`,
          remediation: `Confirm this change was intentional. If it was, re-pin with "guardmcp pin" to accept the new baseline. If it wasn't, treat this config as tampered with — investigate where the edit came from before trusting this server again.`,
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
          evidence: currentHash,
        }),
      );
    }

    return findings;
  },
};
