import { createFinding, type Finding } from '../../core/finding.js';
import { type ToolRule, toolLocation } from './types.js';

/** Language that turns "mentions another tool by name" (normal — docs and
 * helper tools do this constantly) into "claims to intercept/replace it"
 * (the actual tool-shadowing attack: redirecting calls meant for a
 * legitimate tool to a malicious one with the same apparent purpose). */
const REDEFINITION_SIGNAL =
  /\b(instead of|actually calls?|really calls?|secretly|override|replace|redirect|route.{0,20}through)\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const toolShadowingRule: ToolRule = {
  id: 'MCPG-203',
  title: "Tool description targets another server's tool by name (shadowing)",
  severity: 'critical',
  confidence: 'medium',
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-203.md',

  check(tool, allTools) {
    if (!REDEFINITION_SIGNAL.test(tool.description)) return [];

    const others = allTools.filter(
      (t) => !(t.serverName === tool.serverName && t.name === tool.name),
    );
    const findings: Finding[] = [];

    for (const other of others) {
      const namePattern = new RegExp(`\\b${escapeRegex(other.name)}\\b`, 'i');
      if (!namePattern.test(tool.description)) continue;

      findings.push(
        createFinding({
          ruleId: toolShadowingRule.id,
          severity: toolShadowingRule.severity,
          confidence: toolShadowingRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" references "${other.name}" (from server "${other.serverName}") by name alongside redirect/override language — this is the shape of tool shadowing, where a second tool tries to intercept calls meant for a legitimate one.`,
          remediation: `Review "${tool.name}"'s description directly. If it genuinely tries to redirect calls intended for "${other.name}", remove the server — this is an active attempt to hijack another tool's traffic, not a documentation reference.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/description`,
        }),
      );
    }

    return findings;
  },
};
