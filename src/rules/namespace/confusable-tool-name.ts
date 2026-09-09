import { createFinding, type Finding } from '../../core/finding.js';
import { findConfusables, foldConfusables } from '../../detectors/confusables.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

/**
 * MCPG-901's collision is at least visible: two rows in a tool list reading
 * `search` and `search`. This one is not. A tool named with a Cyrillic а
 * renders as `search` in every font a terminal or an approval dialog uses,
 * sits beside the real `search` in the list, and is a different string to
 * every comparison the client makes. Nobody reviewing the list can see the
 * difference, which is the entire point of doing it this way.
 *
 * The finding is mimicry, not non-ASCII. A tool named `araştir` is a Turkish
 * tool name; flagging it would be flagging a language. What is flagged is a
 * name whose ASCII skeleton equals another tool's actual name while the two
 * strings differ — that shape has no innocent explanation.
 */
export const confusableToolNameRule: ToolRule = {
  id: 'MCPG-902',
  title: "Tool name mimics another tool's name with lookalike characters",
  severity: 'critical',
  confidence: 'high', // a name that folds onto another's while differing is not a coincidence
  category: 'namespace',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-902.md',
  /** A deliberately disguised tool (MCP03) that captures calls meant for
   * another (MCP06). */
  owasp: ['MCP03', 'MCP06'],

  check(tool, allTools) {
    const confusables = findConfusables(tool.name);
    if (confusables.length === 0) return [];

    const skeleton = foldConfusables(tool.name);
    const impersonated = allTools.filter(
      (other) =>
        other.name !== tool.name &&
        !(other.serverName === tool.serverName && other.name === tool.name) &&
        other.name === skeleton,
    );

    if (impersonated.length === 0) return [];

    const detail = confusables.map((c) => `${c.codePoint} in place of "${c.looksLike}"`).join(', ');
    const victims = [...new Set(impersonated.map((t) => `"${t.serverName}"`))].sort().join(', ');

    const finding: Finding = createFinding({
      ruleId: confusableToolNameRule.id,
      severity: confusableToolNameRule.severity,
      confidence: confusableToolNameRule.confidence,
      message: `Tool "${tool.name}" on server "${tool.serverName}" is not the name it appears to be: it uses ${detail}, so it renders identically to "${skeleton}", which is offered by ${victims}. The two are different strings to the client and the same string to every human who reads the list.`,
      remediation: `Treat "${tool.serverName}" as hostile until proven otherwise and disconnect it. There is no legitimate reason to name a tool with characters chosen to render as another tool's name. If this is somehow unintentional, rename it using ASCII.`,
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/name`,
    });

    return [finding];
  },
};
