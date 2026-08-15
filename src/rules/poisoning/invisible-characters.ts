import { createFinding, type Finding } from '../../core/finding.js';
import { findUnicodeAnomalies } from '../../detectors/unicode-anomalies.js';
import { type ToolRule, toolLocation } from './types.js';

const KIND_LABEL: Record<string, string> = {
  'zero-width': 'zero-width/invisible character(s)',
  'bidi-override': 'bidirectional text override character(s)',
  'html-comment': 'an HTML comment',
};

export const invisibleCharactersRule: ToolRule = {
  id: 'MCPG-202',
  title: 'Invisible or obfuscated content in tool description',
  severity: 'high',
  confidence: 'high', // deterministic: these characters have no legitimate reason to appear in a tool description
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-202.md',

  check(tool, _allTools) {
    const anomalies = findUnicodeAnomalies(tool.description);
    if (anomalies.length === 0) return [];

    const kinds = [...new Set(anomalies.map((a) => KIND_LABEL[a.kind] ?? a.kind))];

    const finding: Finding = createFinding({
      ruleId: invisibleCharactersRule.id,
      severity: invisibleCharactersRule.severity,
      confidence: invisibleCharactersRule.confidence,
      // Not quoting the hidden content itself — same rationale as MCPG-201.
      message: `Tool "${tool.name}" on server "${tool.serverName}" has a description containing ${kinds.join(', ')} — content invisible to a human reading it normally, but fully visible to the LLM that receives the raw text.`,
      remediation:
        'Inspect the raw description bytes (not a rendered view) for hidden content. Invisible/directional characters and HTML comments have no legitimate reason to appear in a tool description; treat their presence as evidence of tampering.',
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/description`,
    });

    return [finding];
  },
};
