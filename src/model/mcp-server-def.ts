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
  type: z.literal('http').optional(),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const McpServerDefSchema = z.union([StdioServerDefSchema, HttpServerDefSchema]);

export const McpConfigFileSchema = z.object({
  mcpServers: z.record(z.string(), McpServerDefSchema).optional(),
});

export type StdioServerDef = z.infer<typeof StdioServerDefSchema>;
export type HttpServerDef = z.infer<typeof HttpServerDefSchema>;
export type McpServerDef = z.infer<typeof McpServerDefSchema>;
export type McpConfigFile = z.infer<typeof McpConfigFileSchema>;

export function isStdioServerDef(def: McpServerDef): def is StdioServerDef {
  return 'command' in def;
}
