import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Project-scoped MCP config locations. Phase 1 only — OS-wide discovery
 * across Claude Desktop / Cursor / Windsurf / VS Code lands in Phase 2
 * (docs/planning/mcp-guard-plan.md §6, task 2.1), since each has a different
 * per-OS path and format adapter.
 */
export function discoverProjectConfigPaths(cwd: string): string[] {
  const candidates = [join(cwd, '.mcp.json'), join(cwd, '.vscode', 'mcp.json')];
  return candidates.filter((path) => existsSync(path));
}
