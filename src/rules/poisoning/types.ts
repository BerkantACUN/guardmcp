import type { Finding, SourceLocation } from '../../core/finding.js';
import type { Confidence, Severity } from '../../core/severity.js';
import type { ToolDefinition } from '../../model/tool-definition.js';
import type { OwaspMcpId } from '../owasp.js';

/**
 * A different shape than `Rule` (src/rules/types.ts) on purpose: these
 * operate on a live-introspected ToolDefinition, not a config file
 * ScanTarget — there's no JSONC document to position-locate against. The
 * CLI runs ToolRule[] alongside Rule[] whenever `--live` or `proxy` has
 * real ToolDefinition[] to give it.
 */
export interface ToolRule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly category: string;
  readonly docsUrl: string;
  /** OWASP MCP Top 10 categories this rule detects. Never empty — every
   * shipped rule maps to at least one, enforced by an invariant test. */
  readonly owasp: readonly OwaspMcpId[];
  check(tool: ToolDefinition, allTools: readonly ToolDefinition[]): readonly Finding[];
}

/** No source file exists for a live tool definition — `live:<server>/<tool>`
 * stands in as a stable, human-readable location. It is also what the
 * finding's fingerprint is built from, so it must not change between runs. */
export function toolLocation(tool: ToolDefinition): SourceLocation {
  return { file: `live:${tool.serverName}/${tool.name}`, line: 1, column: 1 };
}
