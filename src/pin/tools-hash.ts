import { createHash } from 'node:crypto';
import type { ToolDefinition } from '../model/tool-definition.js';

/**
 * A stable hash of a server's REAL advertised tools (name, description,
 * and input property names/types/constraints) — this is what actually
 * catches a rug pull. `computeDefinitionHash` alone can't: an unpinned
 * `npx some-mcp-server` launch command stays byte-identical release after
 * release while a new publish under the same tag silently ships tools that
 * do something different.
 *
 * Hashes a JSON-serialized canonical form rather than concatenating raw
 * field values with delimiter bytes — `tool.name`/`tool.description` are
 * attacker-controlled (they come straight from a live server's tools/list
 * response, the exact payload MCPG-201 already treats as hostile), and a
 * delimiter-join scheme is NOT collision-resistant against content that can
 * legally contain the delimiter itself: `[{name:'a', description:'b\0c'}]`
 * and `[{name:'a\0b', description:'c'}]` hashed to the byte-identical input
 * under an earlier '\0'-joined version of this function, defeating MCPG-502
 * outright for a server willing to embed a NUL byte in its own metadata.
 * JSON.stringify's own string escaping makes each field's boundary
 * unambiguous regardless of its content, closing that class of collision.
 */
export function computeToolsHash(tools: readonly ToolDefinition[]): string {
  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  const canonical = sorted.map((tool) => ({
    name: tool.name,
    description: tool.description,
    properties: propertySignature(tool),
    annotations: tool.annotations,
  }));
  const hash = createHash('sha256');
  hash.update(JSON.stringify(canonical));
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Includes every field MCPG-302 (unrestricted-input-schema) actually reads
 * — type, enum, pattern, maxLength — not just `type`, so a rug-pull that
 * quietly drops a `pattern`/`enum` constraint while keeping the same
 * `type` still registers as tool drift here too.
 */
function propertySignature(tool: ToolDefinition): ReadonlyArray<Record<string, unknown>> {
  const properties = tool.inputSchema?.properties ?? {};
  return Object.keys(properties)
    .sort()
    .map((key) => {
      const prop = properties[key];
      return {
        key,
        type: prop?.type,
        enum: prop?.enum,
        pattern: prop?.pattern,
        maxLength: prop?.maxLength,
      };
    });
}
