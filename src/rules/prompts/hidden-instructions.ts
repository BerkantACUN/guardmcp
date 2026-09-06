import { createFinding, type Finding } from '../../core/finding.js';
import { findImperativePhrases } from '../../detectors/imperative-phrases.js';
import { type PromptRule, promptLocation, promptTextFields } from './types.js';

/**
 * MCPG-201 catches this in a tool description. A prompt is the softer target
 * of the two: a tool description is meant to be descriptive, so imperative
 * language in one is already odd — whereas a prompt IS instructions by
 * design, and a directive hidden among them reads as if it belongs.
 *
 * Only `prompts/list` metadata is examined. The rendered message body would
 * require `prompts/get`, which means invoking the prompt — see the
 * discover-never-execute constraint in live/introspect.ts.
 */
export const promptHiddenInstructionsRule: PromptRule = {
  id: 'MCPG-205',
  title: 'Hidden instruction in prompt metadata (prompt injection)',
  severity: 'critical',
  confidence: 'medium', // pattern-matched natural language, same basis as MCPG-201
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-205.md',
  /** Poisoned prompt metadata both smuggles instructions (MCP03) and
   * redirects what the model was asked to do (MCP06). */
  owasp: ['MCP03', 'MCP06'],

  check(prompt, _allPrompts) {
    const findings: Finding[] = [];

    for (const field of promptTextFields(prompt)) {
      const matches = findImperativePhrases(field.text);
      if (matches.length === 0) continue;

      findings.push(
        createFinding({
          ruleId: promptHiddenInstructionsRule.id,
          severity: promptHiddenInstructionsRule.severity,
          confidence: promptHiddenInstructionsRule.confidence,
          // Deliberately does NOT quote the matched phrase — a report that
          // echoes an injected instruction is itself a re-injection vector
          // when an agent reads the report. Same rule as MCPG-201.
          message: `Prompt "${prompt.name}" on server "${prompt.serverName}" has a ${field.where} containing ${matches.length} instruction-like phrase(s) (override/hide-from-user/read-a-specific-file directives) — language aimed at the model rather than at the person choosing the prompt.`,
          remediation:
            'Read the prompt metadata directly, outside any AI context (a plain text viewer, not a chat that would act on it). A prompt template legitimately contains instructions for the task; it has no reason to contain instructions about ignoring prior context, withholding information from the user, or reading a named file.',
          location: promptLocation(prompt),
          logicalPath: field.logicalPath,
        }),
      );
    }

    return findings;
  },
};
