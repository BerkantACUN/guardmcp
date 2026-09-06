import { createFinding, type Finding } from '../../core/finding.js';
import { readsAsDestructive } from '../../detectors/destructive-verbs.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

export const unconfirmedDestructiveOpRule: ToolRule = {
  id: 'MCPG-303',
  title: 'Destructive-sounding tool with no confirmation annotation',
  severity: 'medium',
  confidence: 'low', // name/description matching is a weak signal on its own
  category: 'scope',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-303.md',
  /** A destructive op with no confirmation lets a subverted intent execute unchecked. */
  owasp: ['MCP06'],

  check(tool, _allTools) {
    const looksDestructive = readsAsDestructive(tool.name) || readsAsDestructive(tool.description);
    if (!looksDestructive) return [];

    const annotations = tool.annotations;
    const honestlyFlagged = annotations?.destructiveHint === true;
    if (honestlyFlagged) return [];

    const noAnnotationsAtAll = annotations === undefined;
    const contradictsReadOnly = annotations?.readOnlyHint === true;
    if (!noAnnotationsAtAll && !contradictsReadOnly) return [];

    const reason = contradictsReadOnly
      ? 'is annotated readOnlyHint: true, which contradicts what it appears to do'
      : 'has no annotations at all, so a client has no signal to prompt for confirmation before calling it';

    const finding: Finding = createFinding({
      ruleId: unconfirmedDestructiveOpRule.id,
      severity: unconfirmedDestructiveOpRule.severity,
      confidence: unconfirmedDestructiveOpRule.confidence,
      message: `Tool "${tool.name}" on server "${tool.serverName}" looks destructive by name/description but ${reason}.`,
      remediation:
        'If the tool genuinely performs a destructive/irreversible action, set annotations.destructiveHint: true so clients can prompt for confirmation. If it is not actually destructive, rename it to avoid the ambiguity.',
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/annotations`,
    });

    return [finding];
  },
};
