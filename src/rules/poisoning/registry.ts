import { hiddenInstructionsRule } from './hidden-instructions.js';
import { invisibleCharactersRule } from './invisible-characters.js';
import { suspiciousParameterRule } from './suspicious-parameter.js';
import { toolShadowingRule } from './tool-shadowing.js';
import type { ToolRule } from './types.js';

/**
 * Not yet wired into the CLI `scan` command — these need a real
 * ToolDefinition[] source, which only exists once Phase 3's `--live`
 * introspection can connect to a running MCP server and call `tools/list`.
 * Fully implemented and tested now so that wiring is the only remaining
 * step (see docs/planning/mcp-guard-plan.md §6, Faz 3, task 3.3).
 */
export const ALL_TOOL_RULES: readonly ToolRule[] = [
  hiddenInstructionsRule,
  invisibleCharactersRule,
  toolShadowingRule,
  suspiciousParameterRule,
];
