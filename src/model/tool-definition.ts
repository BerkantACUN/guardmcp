/**
 * A tool as advertised by an MCP server's `tools/list` response. Unlike
 * ScanTarget (a config FILE with real line/column positions), tool
 * definitions come from a running server, so there is no source file to
 * point a Finding at: findings use a `live:<server>/<tool>` location instead
 * (see rules/poisoning/types.ts). Filled from `tools/list` by `--live`
 * (live/to-tool-definition.ts) and by `guardmcp proxy`.
 */
export interface ToolInputProperty {
  readonly type?: string;
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly pattern?: string;
  readonly maxLength?: number;
  /**
   * The spec's `x-mcp-header` extension (2026-07-28): when present, this
   * parameter's value is mirrored into an outgoing `Mcp-Param-<value>` HTTP
   * header on the Streamable HTTP transport, so network intermediaries can
   * route on it. Which also means every intermediary can read it — see
   * MCPG-801/802.
   */
  readonly xMcpHeader?: string;
}

/** Per the MCP spec's tool annotation fields — hints about a tool's effects
 * that a client can use to decide whether to prompt for confirmation. */
export interface ToolAnnotations {
  readonly readOnlyHint?: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint?: boolean;
}

export interface ToolDefinition {
  readonly serverName: string;
  /** The identifier the MODEL calls. */
  readonly name: string;
  /** The optional human-readable label a CLIENT displays instead of `name`.
   * Two different audiences read two different fields, which is exactly what
   * MCPG-803 exists to check. */
  readonly title?: string;
  readonly description: string;
  readonly inputSchema?: {
    readonly properties?: Readonly<Record<string, ToolInputProperty>>;
  };
  readonly annotations?: ToolAnnotations;
}
