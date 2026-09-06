import { createFinding, type Finding } from '../../core/finding.js';
import { findUnicodeAnomalies } from '../../detectors/unicode-anomalies.js';
import { type ResourceRule, resourceLocation, resourceTextFields } from './types.js';

const KIND_LABEL: Record<string, string> = {
  'zero-width': 'zero-width/invisible character(s)',
  'bidi-override': 'bidirectional text override character(s)',
  'html-comment': 'an HTML comment',
};

/** Deterministic, so high confidence. The resource NAME matters as much as
 * the description here: the name is what a human sees when approving or
 * picking a resource, and a bidi override can make it render as something
 * other than what it is. */
export const invisibleResourceContentRule: ResourceRule = {
  id: 'MCPG-208',
  title: 'Invisible or obfuscated content in resource metadata',
  severity: 'high',
  confidence: 'high',
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-208.md',
  owasp: ['MCP03'],

  check(resource, _all) {
    const findings: Finding[] = [];

    for (const field of resourceTextFields(resource)) {
      const anomalies = findUnicodeAnomalies(field.text);
      if (anomalies.length === 0) continue;

      const kinds = [...new Set(anomalies.map((a) => KIND_LABEL[a.kind] ?? a.kind))];

      findings.push(
        createFinding({
          ruleId: invisibleResourceContentRule.id,
          severity: invisibleResourceContentRule.severity,
          confidence: invisibleResourceContentRule.confidence,
          message: `Resource "${resource.name}" on server "${resource.serverName}" has a ${field.where} containing ${kinds.join(', ')} — content that renders differently than it is stored, so what a reviewer sees is not what the model receives.`,
          remediation:
            'Inspect the raw bytes of the resource metadata rather than a rendered view. These characters have no legitimate purpose in a resource name or description; treat them as evidence of tampering.',
          location: resourceLocation(resource),
          logicalPath: field.logicalPath,
        }),
      );
    }

    return findings;
  },
};
