import { createFinding, type Finding } from '../../core/finding.js';
import { findImperativePhrases } from '../../detectors/imperative-phrases.js';
import { type ResourceRule, resourceLocation, resourceTextFields } from './types.js';

/** MCPG-201/205's signal on the resource surface. A resource description is
 * read by the model when it decides what context to pull in, so a directive
 * planted there acts before any content is fetched. */
export const resourceHiddenInstructionsRule: ResourceRule = {
  id: 'MCPG-207',
  title: 'Hidden instruction in resource metadata (prompt injection)',
  severity: 'critical',
  confidence: 'medium',
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-207.md',
  owasp: ['MCP03', 'MCP10'],

  check(resource, _all) {
    const findings: Finding[] = [];

    for (const field of resourceTextFields(resource)) {
      const matches = findImperativePhrases(field.text);
      if (matches.length === 0) continue;

      findings.push(
        createFinding({
          ruleId: resourceHiddenInstructionsRule.id,
          severity: resourceHiddenInstructionsRule.severity,
          confidence: resourceHiddenInstructionsRule.confidence,
          // Never quotes the matched phrase — a report echoing an injected
          // instruction is a re-injection vector. Same as MCPG-201/205.
          message: `Resource "${resource.name}" on server "${resource.serverName}" has a ${field.where} containing ${matches.length} instruction-like phrase(s) — language directed at the model rather than describing what the resource holds.`,
          remediation:
            'Read the resource metadata outside any AI context. A resource description exists to say what the data is; it has no reason to instruct the model to ignore prior context, withhold information, or read a named file.',
          location: resourceLocation(resource),
          logicalPath: field.logicalPath,
        }),
      );
    }

    return findings;
  },
};
