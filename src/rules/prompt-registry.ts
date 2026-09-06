import { promptHiddenInstructionsRule } from './prompts/hidden-instructions.js';
import { invisiblePromptContentRule } from './prompts/invisible-prompt-content.js';
import type { PromptRule } from './prompts/types.js';

/**
 * Rules over live-introspected prompt templates. Like ToolRules these only
 * run under `--live`: a config file says which servers exist, never what
 * prompts they advertise.
 */
export const ALL_PROMPT_RULES: readonly PromptRule[] = [
  promptHiddenInstructionsRule,
  invisiblePromptContentRule,
];
