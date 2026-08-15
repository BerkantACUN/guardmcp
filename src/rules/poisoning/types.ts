import type { Finding, SourceLocation } from '../../core/finding.js';
import type { Confidence, Severity } from '../../core/severity.js';
import type { ToolDefinition } from '../../model/tool-definition.js';

/**
 * A different shape than `Rule` (src/rules/types.ts) on purpose: these
 * operate on a live-introspected ToolDefinition, not a config file
 * ScanTarget — there's no JSONC document to position-locate against. The
 * engine wires ToolRule[] in alongside Rule[] once Phase 3's `--live`
 * introspection can supply real ToolDefinition[].
 */
export interface ToolRule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly category: string;
  readonly docsUrl: string;
  check(tool: ToolDefinition, allTools: readonly ToolDefinition[]): readonly Finding[];
}

/** No source file exists for a live tool definition — `live:<server>/<tool>`
 * stands in as a stable, human-readable location until Phase 3 can attach a
 * real transcript/session reference. */
export function toolLocation(tool: ToolDefinition): SourceLocation {
  return { file: `live:${tool.serverName}/${tool.name}`, line: 1, column: 1 };
}
