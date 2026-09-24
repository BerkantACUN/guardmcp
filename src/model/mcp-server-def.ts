import { z } from 'zod';

/**
 * Phase 1 scope: the config shape used by `.mcp.json` (Claude Code project
 * scope) and VS Code's `mcp.json` — a stdio launcher (command/args/env) or an
 * HTTP/SSE remote. Per-client format adapters (Claude Desktop's nested shape,
 * Cursor, Windsurf) land in Phase 2 (see docs/planning/mcp-guard-plan.md §6).
 */
export const StdioServerDefSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const HttpServerDefSchema = z.object({
  // Any transport label. Clients write "http", "sse", "streamable-http",
  // "streamableHttp" for the same kind of entry; accepting only "http" made
  // one such entry fail the whole file, so every other server in it — and
  // the secrets in them — went unscanned.
  type: z.string().optional(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const McpServerDefSchema = z.union([StdioServerDefSchema, HttpServerDefSchema]);

export const McpConfigFileSchema = z.object({
  mcpServers: z.record(z.string(), McpServerDefSchema).optional(),
});

/** The file's shape before each server is checked on its own: see
 * discovery/index.ts, which validates entries one by one so that a single
 * entry guardmcp cannot read is skipped rather than hiding the rest. */
export const McpConfigFileShapeSchema = z.object({
  mcpServers: z.record(z.string(), z.unknown()).optional(),
});

export type StdioServerDef = z.infer<typeof StdioServerDefSchema>;
export type HttpServerDef = z.infer<typeof HttpServerDefSchema>;
export type McpServerDef = z.infer<typeof McpServerDefSchema>;
export type McpConfigFile = z.infer<typeof McpConfigFileSchema>;

export function isStdioServerDef(def: McpServerDef): def is StdioServerDef {
  return 'command' in def;
}

export function isHttpServerDef(def: McpServerDef): def is HttpServerDef {
  return 'url' in def;
}

/**
 * Every MCP client we scan uses "mcpServers" as the root key EXCEPT VS
 * Code, which uses "servers" (see code.visualstudio.com/docs/agents/
 * reference/mcp-configuration). Parsing a VS Code mcp.json against a
 * schema that only recognizes "mcpServers" doesn't fail — it just silently
 * finds zero servers, since the field is optional. That's a much worse bug
 * than a crash: `guardmcp scan .vscode/mcp.json` on a real VS Code config
 * would report "no findings" while never having looked at anything.
 * Normalizing here means every downstream consumer only ever sees
 * `mcpServers` and doesn't need to know this quirk exists.
 */
export function normalizeRawConfig(raw: unknown): { mcpServers?: unknown } {
  if (typeof raw !== 'object' || raw === null) return {};
  const obj = raw as Record<string, unknown>;
  if (obj.mcpServers !== undefined) return { mcpServers: obj.mcpServers };
  if (obj.servers !== undefined) return { mcpServers: obj.servers };
  return {};
}
