import { createFinding, type Finding } from '../../core/finding.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

// `s?` covers 3rd-person/plural prose forms ("Deletes a file"). The name is
// checked with underscores/hyphens normalized to spaces first — `\b` treats
// `_` as a word character, so "delete_record" has NO internal word boundary
// between "delete" and "_record" and would otherwise never match (a real
// bug caught by this rule's own test suite before it shipped).
const DESTRUCTIVE_TOOL =
  /\b(deletes?|removes?|drops?|truncates?|overwrites?|formats?|destroys?|purges?|wipes?)\b/i;

function normalizeIdentifier(value: string): string {
  return value.replace(/[_-]/g, ' ');
}

export const unconfirmedDestructiveOpRule: ToolRule = {
  id: 'MCPG-303',
  title: 'Destructive-sounding tool with no confirmation annotation',
  severity: 'medium',
  confidence: 'low', // name/description matching is a weak signal on its own
  category: 'scope',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-303.md',

  check(tool, _allTools) {
    const looksDestructive =
      DESTRUCTIVE_TOOL.test(normalizeIdentifier(tool.name)) ||
      DESTRUCTIVE_TOOL.test(tool.description);
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
