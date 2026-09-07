import { createFinding, type Finding } from '../../core/finding.js';
import { findUnicodeAnomalies } from '../../detectors/unicode-anomalies.js';
import { type PromptRule, promptLocation, promptTextFields } from './types.js';

const KIND_LABEL: Record<string, string> = {
  'zero-width': 'zero-width/invisible character(s)',
  'bidi-override': 'bidirectional text override character(s)',
  'html-comment': 'an HTML comment',
  'terminal-control':
    'terminal control/ANSI escape sequence(s), which change what a terminal shows without changing what the model reads',
};

/** The MCPG-202 signal, applied to the prompt surface. Deterministic rather
 * than heuristic: none of these characters has a legitimate reason to appear
 * in prompt metadata, which is why confidence is high where MCPG-205's is
 * medium. */
export const invisiblePromptContentRule: PromptRule = {
  id: 'MCPG-206',
  title: 'Invisible or obfuscated content in prompt metadata',
  severity: 'high',
  confidence: 'high',
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-206.md',
  /** Invisible characters are how the poisoning is delivered unseen. */
  owasp: ['MCP03'],

  check(prompt, _allPrompts) {
    const findings: Finding[] = [];

    for (const field of promptTextFields(prompt)) {
      const anomalies = findUnicodeAnomalies(field.text);
      if (anomalies.length === 0) continue;

      const kinds = [...new Set(anomalies.map((a) => KIND_LABEL[a.kind] ?? a.kind))];

      findings.push(
        createFinding({
          ruleId: invisiblePromptContentRule.id,
          severity: invisiblePromptContentRule.severity,
          confidence: invisiblePromptContentRule.confidence,
          // Not quoting the hidden content — same rationale as MCPG-202.
          message: `Prompt "${prompt.name}" on server "${prompt.serverName}" has a ${field.where} containing ${kinds.join(', ')} — content invisible to a human reading it normally, but fully visible to the model that receives the raw text.`,
          remediation:
            'Inspect the raw bytes of the prompt metadata, not a rendered view. Invisible/directional characters and HTML comments have no legitimate reason to appear here; treat their presence as evidence of tampering rather than as a formatting quirk.',
          location: promptLocation(prompt),
          logicalPath: field.logicalPath,
        }),
      );
    }

    return findings;
  },
};
