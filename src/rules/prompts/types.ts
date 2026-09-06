import type { Finding, SourceLocation } from '../../core/finding.js';
import type { Confidence, Severity } from '../../core/severity.js';
import type { PromptDefinition } from '../../model/prompt-definition.js';
import type { OwaspMcpId } from '../owasp.js';

/**
 * A rule over a live-introspected prompt template, the third MCP surface
 * (after config files and tools). Same contract as ToolRule: pure, no I/O,
 * given the full set so a rule can compare across servers if it needs to.
 */
export interface PromptRule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly category: string;
  readonly docsUrl: string;
  readonly owasp: readonly OwaspMcpId[];
  check(prompt: PromptDefinition, allPrompts: readonly PromptDefinition[]): readonly Finding[];
}

/** No source file exists for a live prompt — `live:<server>/prompts/<name>`
 * stands in, matching the convention toolLocation() established. */
export function promptLocation(prompt: PromptDefinition): SourceLocation {
  return { file: `live:${prompt.serverName}/prompts/${prompt.name}`, line: 1, column: 1 };
}

/** Every model-readable text field a prompt exposes through `prompts/list`,
 * paired with the logical path a finding should point at. Both rules below
 * walk exactly this set — the prompt's own description is the obvious field,
 * and the argument descriptions are the ones nobody reads. */
export function promptTextFields(
  prompt: PromptDefinition,
): readonly { readonly text: string; readonly logicalPath: string; readonly where: string }[] {
  const base = `/prompts/${prompt.serverName}/${prompt.name}`;
  return [
    { text: prompt.description, logicalPath: `${base}/description`, where: 'description' },
    ...prompt.arguments.map((arg) => ({
      text: arg.description ?? '',
      logicalPath: `${base}/arguments/${arg.name}/description`,
      where: `"${arg.name}" argument description`,
    })),
  ];
}
