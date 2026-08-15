import { createFinding, type Finding } from '../../core/finding.js';
import { findImperativePhrases } from '../../detectors/imperative-phrases.js';
import { type ToolRule, toolLocation } from './types.js';

export const hiddenInstructionsRule: ToolRule = {
  id: 'MCPG-201',
  title: 'Hidden instruction in tool description (prompt injection / tool poisoning)',
  severity: 'critical',
  confidence: 'medium', // pattern-matched natural language, not a deterministic signal like MCPG-202's invisible chars
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-201.md',

  check(tool, _allTools) {
    const matches = findImperativePhrases(tool.description);
    if (matches.length === 0) return [];

    const finding: Finding = createFinding({
      ruleId: hiddenInstructionsRule.id,
      severity: hiddenInstructionsRule.severity,
      confidence: hiddenInstructionsRule.confidence,
      // Deliberately does NOT quote the matched phrase: a report that echoes
      // the injected instruction back verbatim is itself a re-injection
      // vector if the report is ever read by an LLM (e.g. fed into an agent
      // for triage). The pattern's regex source is a safe, generic label.
      message: `Tool "${tool.name}" on server "${tool.serverName}" has a description containing ${matches.length} instruction-like phrase(s) (e.g. override/hide-from-user/pre-tool-call directives) — the kind of language used to smuggle instructions to the LLM through a field the human operator doesn't typically read closely.`,
      remediation:
        'Review the tool description directly, outside any AI context (a plain text viewer, not a chat that would execute it). If the server is untrusted, remove it. If you maintain the server, keep descriptions purely descriptive — no imperative language directed at the calling model.',
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/description`,
    });

    return [finding];
  },
};
