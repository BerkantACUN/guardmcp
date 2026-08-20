import { createHash } from 'node:crypto';
import type { ToolDefinition } from '../model/tool-definition.js';

/**
 * A stable hash of a server's REAL advertised tools (name, description,
 * and input property names/types) — this is what actually catches a rug
 * pull. `computeDefinitionHash` alone can't: an unpinned `npx
 * some-mcp-server` launch command stays byte-identical while a new publish
 * under the same tag silently ships tools that do something different.
 * Sorted by tool name first, so hash stability doesn't depend on a
 * server's `tools/list` response ordering.
 */
export function computeToolsHash(tools: readonly ToolDefinition[]): string {
  const hash = createHash('sha256');
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  for (const tool of sorted) {
    hash.update(tool.name);
    hash.update('\0');
    hash.update(tool.description);
    hash.update('\0');
    hash.update(propertySignature(tool));
    // Record-separator between tools — without it, [{name:"x",desc:"y"}]
    // and [{name:"xy",desc:""}] (impossible in practice, but the point of
    // a delimiter is not depending on that) would hash identically.
    hash.update('\x1e');
  }
  return `sha256:${hash.digest('hex')}`;
}

function propertySignature(tool: ToolDefinition): string {
  const properties = tool.inputSchema?.properties ?? {};
  return Object.keys(properties)
    .sort()
    .map((key) => `${key}:${properties[key]?.type ?? ''}`)
    .join(',');
}
