import type {
  ToolAnnotations,
  ToolDefinition,
  ToolInputProperty,
} from '../model/tool-definition.js';

/**
 * The shape of a single tool as returned by a real server's `tools/list`
 * (`@modelcontextprotocol/sdk`'s `ToolSchema`). Declared locally instead of
 * importing the SDK's inferred type so this mapper — and its unit tests —
 * stay decoupled from the SDK's exact type shape; only the fields the
 * poisoning/scope rules actually read are named here.
 */
export interface LiveTool {
  readonly name: string;
  readonly description?: string | undefined;
  readonly inputSchema?:
    | {
        // `object` rather than `Record<string, unknown>` — JSON Schema
        // property entries from the SDK's zod-inferred Tool type come
        // through as a nominal `object`, not an indexed record; mapProperty
        // casts internally since a plain-object shape is guaranteed here.
        readonly properties?: Readonly<Record<string, object>> | undefined;
      }
    | undefined;
  readonly annotations?:
    | {
        readonly readOnlyHint?: boolean | undefined;
        readonly destructiveHint?: boolean | undefined;
        readonly idempotentHint?: boolean | undefined;
        readonly openWorldHint?: boolean | undefined;
      }
    | undefined;
}

/**
 * Maps a live `tools/list` entry onto our internal ToolDefinition model, the
 * same shape the poisoning/scope ToolRules (MCPG-2xx/3xx) were built and
 * tested against in Phase 2. `description` defaults to `''` — the MCP spec
 * makes it optional, but every rule that reads it (hidden-instructions,
 * invisible-characters, suspicious-parameter) expects a string, not
 * undefined, and "no description" is itself worth scanning as empty text
 * rather than a special case.
 */
export function toToolDefinition(serverName: string, tool: LiveTool): ToolDefinition {
  return {
    serverName,
    name: tool.name,
    description: tool.description ?? '',
    ...(tool.inputSchema ? { inputSchema: { properties: mapProperties(tool.inputSchema) } } : {}),
    ...(tool.annotations ? { annotations: mapAnnotations(tool.annotations) } : {}),
  };
}

function mapProperties(
  inputSchema: NonNullable<LiveTool['inputSchema']>,
): Readonly<Record<string, ToolInputProperty>> {
  const properties = inputSchema.properties ?? {};
  const result: Record<string, ToolInputProperty> = {};
  for (const [key, value] of Object.entries(properties)) {
    result[key] = mapProperty(value as Record<string, unknown>);
  }
  return result;
}

/** JSON Schema properties are open-ended; we only surface the fields the
 * scope rules (MCPG-302 unrestricted-input-schema) actually check, and only
 * when they're the type each is declared as — a malformed/unexpected shape
 * from a hostile server just gets dropped rather than crashing the scan. */
function mapProperty(raw: Record<string, unknown>): ToolInputProperty {
  return {
    ...(typeof raw.type === 'string' ? { type: raw.type } : {}),
    ...(typeof raw.description === 'string' ? { description: raw.description } : {}),
    ...(Array.isArray(raw.enum) ? { enum: raw.enum } : {}),
    ...(typeof raw.pattern === 'string' ? { pattern: raw.pattern } : {}),
    ...(typeof raw.maxLength === 'number' ? { maxLength: raw.maxLength } : {}),
  };
}

function mapAnnotations(annotations: NonNullable<LiveTool['annotations']>): ToolAnnotations {
  return {
    ...(annotations.readOnlyHint !== undefined ? { readOnlyHint: annotations.readOnlyHint } : {}),
    ...(annotations.destructiveHint !== undefined
      ? { destructiveHint: annotations.destructiveHint }
      : {}),
    ...(annotations.idempotentHint !== undefined
      ? { idempotentHint: annotations.idempotentHint }
      : {}),
    ...(annotations.openWorldHint !== undefined
      ? { openWorldHint: annotations.openWorldHint }
      : {}),
  };
}
