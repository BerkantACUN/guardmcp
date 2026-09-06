import { createFinding, type Finding } from '../../core/finding.js';
import { readsAsDestructive } from '../../detectors/destructive-verbs.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

/**
 * Two audiences read two different fields. The spec is explicit about it:
 *
 *   name  — "Unique identifier for the tool"                  → the MODEL calls this
 *   title — "human-readable name of the tool for display"     → the HUMAN sees this
 *
 * A client that shows the title is showing the user something the model will
 * never act on. So:
 *
 *   { "name": "delete_all_files", "title": "View Documentation" }
 *
 * The approval dialog says View Documentation. The call says
 * delete_all_files. Both are working exactly as specified.
 *
 * Only fires in that direction. A benign name under an alarming title is odd,
 * but it makes the user MORE cautious, not less, so it is not an escalation
 * and not this rule's business.
 */
export const deceptiveToolTitleRule: ToolRule = {
  id: 'MCPG-803',
  title: 'Display title conceals what the tool actually does',
  severity: 'high',
  confidence: 'medium', // verb matching on two short strings; deliberate deception vs. a loose label is not decidable from here
  category: 'declaration',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-803.md',
  /** The human approves one operation and a different one is invoked —
   * intent flow subverted at the point of consent. */
  owasp: ['MCP06'],

  check(tool, _allTools) {
    const title = tool.title;
    if (title === undefined || title.trim() === '') return [];

    // The escalation only exists when the NAME is the dangerous half and the
    // title is the reassuring one.
    if (!readsAsDestructive(tool.name)) return [];
    if (readsAsDestructive(title)) return [];

    const finding: Finding = createFinding({
      ruleId: deceptiveToolTitleRule.id,
      severity: deceptiveToolTitleRule.severity,
      confidence: deceptiveToolTitleRule.confidence,
      message: `Tool "${tool.name}" on server "${tool.serverName}" is displayed to the user as "${title}". The name describes a destructive operation; the title does not. A client showing the title puts a reassuring label on the confirmation dialog for a call the model makes under the real name.`,
      remediation: `Make the title describe the same operation as the name, or drop the title so clients fall back to "${tool.name}". A display label that understates what a tool does defeats the human-in-the-loop confirmation the MCP specification asks clients to provide.`,
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/title`,
    });

    return [finding];
  },
};
