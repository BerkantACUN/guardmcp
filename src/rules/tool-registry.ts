import { hiddenInstructionsRule } from './poisoning/hidden-instructions.js';
import { invisibleCharactersRule } from './poisoning/invisible-characters.js';
import { suspiciousParameterRule } from './poisoning/suspicious-parameter.js';
import { toolShadowingRule } from './poisoning/tool-shadowing.js';
import type { ToolRule } from './poisoning/types.js';
import { unconfirmedDestructiveOpRule } from './scope/unconfirmed-destructive-op.js';
import { unrestrictedInputSchemaRule } from './scope/unrestricted-input-schema.js';

/**
 * Rules operating on a live-introspected ToolDefinition rather than a config
 * ScanTarget — not yet wired into the CLI `scan` command (no real
 * ToolDefinition[] source exists until Phase 3's `--live` introspection
 * connects to a running server and calls tools/list). Fully implemented and
 * tested now; see docs/planning/mcp-guard-plan.md §6, Faz 3, task 3.3.
 */
export const ALL_TOOL_RULES: readonly ToolRule[] = [
  hiddenInstructionsRule,
  invisibleCharactersRule,
  toolShadowingRule,
  suspiciousParameterRule,
  unrestrictedInputSchemaRule,
  unconfirmedDestructiveOpRule,
];
