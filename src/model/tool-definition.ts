/**
 * A tool as advertised by an MCP server's `tools/list` response. Unlike
 * ScanTarget (a config FILE with real line/column positions), tool
 * definitions come from a running server — there is no source file to point
 * a Finding at until Phase 3 wires up live introspection (see
 * docs/planning/mcp-guard-plan.md §6, Faz 3). Poisoning rules (MCPG-2xx) are
 * built and fully tested against this model now; the engine integration
 * that supplies real ToolDefinition[] from a live connection lands with
 * `--live` in Phase 3.
 */
export interface ToolDefinition {
  readonly serverName: string;
  readonly name: string;
  readonly description: string;
  readonly inputSchema?: {
    readonly properties?: Readonly<
      Record<string, { readonly type?: string; readonly description?: string }>
    >;
  };
}
