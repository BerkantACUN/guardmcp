/**
 * A prompt template as advertised by an MCP server's `prompts/list`.
 *
 * Prompts are the surface guardmcp was blind to until now, and they are
 * arguably a softer target than tools: a tool description is *supposed* to be
 * descriptive, so imperative language in one stands out. A prompt IS
 * instructions by design — hiding a directive among them is less conspicuous,
 * and the model reads the description when deciding which prompt to offer.
 *
 * Only `prompts/list` metadata is modelled. The rendered message body would
 * require `prompts/get`, which means invoking the prompt with arguments —
 * outside the "discover, never execute" line drawn in live/introspect.ts.
 */
export interface PromptArgumentDefinition {
  readonly name: string;
  readonly description?: string;
}

export interface PromptDefinition {
  readonly serverName: string;
  readonly name: string;
  readonly description: string;
  readonly arguments: readonly PromptArgumentDefinition[];
}
