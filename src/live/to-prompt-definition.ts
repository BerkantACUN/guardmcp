import type { PromptArgumentDefinition, PromptDefinition } from '../model/prompt-definition.js';

/** The shape of one entry in a real server's `prompts/list` response —
 * narrowed to the fields rules read, so a server sending extra fields (or
 * omitting optional ones) cannot break the mapping.
 *
 * Optional fields are written `?: T | undefined` rather than `?: T` because
 * this project runs with `exactOptionalPropertyTypes`, and the SDK's own
 * Prompt type declares them that way — narrowing here would reject the very
 * values this function exists to accept. */
export interface RawPromptArgument {
  readonly name: string;
  readonly description?: string | undefined;
  /** Accepted because real `prompts/list` responses carry it, but not
   * mapped: whether an argument is required says nothing about whether its
   * description is carrying an injected instruction. */
  readonly required?: boolean | undefined;
}

export interface RawPrompt {
  readonly name: string;
  readonly description?: string | undefined;
  readonly arguments?: readonly RawPromptArgument[] | undefined;
}

export function toPromptDefinition(serverName: string, prompt: RawPrompt): PromptDefinition {
  return {
    serverName,
    name: prompt.name,
    // Rules scan description text unconditionally; normalising the absent
    // case here means no rule needs its own undefined guard.
    description: prompt.description ?? '',
    arguments: (prompt.arguments ?? []).map(toArgument),
  };
}

function toArgument(arg: RawPromptArgument): PromptArgumentDefinition {
  return {
    name: arg.name,
    ...(arg.description !== undefined ? { description: arg.description } : {}),
  };
}
