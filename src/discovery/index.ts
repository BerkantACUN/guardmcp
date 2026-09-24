import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  McpConfigFileShapeSchema,
  type McpServerDef,
  McpServerDefSchema,
  normalizeRawConfig,
} from '../model/mcp-server-def.js';
import type { ScanTarget, ScanTargetScope } from '../model/scan-target.js';
import { type JsoncDocument, parseJsoncDocument } from '../parsers/jsonc-document.js';

export class ScanTargetLoadError extends Error {
  constructor(
    public readonly filePath: string,
    cause: unknown,
  ) {
    super(`Failed to load MCP config at ${filePath}: ${errorMessage(cause)}`, { cause });
    this.name = 'ScanTargetLoadError';
  }
}

/**
 * Reads, parses (JSONC — comments/trailing commas are legal in some
 * clients' configs), and schema-validates one config file into a ScanTarget.
 * Throws ScanTargetLoadError on any failure; the CLI layer decides whether
 * to skip-and-warn or abort (see cli/commands/scan.ts).
 */
export function loadScanTarget(
  filePath: string,
  cwd: string,
  scope: ScanTargetScope = 'explicit',
): ScanTarget {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new ScanTargetLoadError(filePath, err);
  }

  const rawDocument = parseJsoncDocument(text);
  const raw = rawDocument.getValue();
  const normalized = normalizeRawConfig(raw);

  const result = McpConfigFileShapeSchema.safeParse(normalized);
  if (!result.success) {
    throw new ScanTargetLoadError(filePath, result.error);
  }

  // Each server on its own: one entry in a shape guardmcp does not know (a
  // transport it has never seen, a typo) is skipped with a warning, and every
  // other server in the file is still scanned. Failing the file instead let a
  // single unfamiliar entry hide a hardcoded token three entries down.
  const mcpServers: Record<string, McpServerDef> = {};
  const skippedServers: string[] = [];
  for (const [name, entry] of Object.entries(result.data.mcpServers ?? {})) {
    const parsed = McpServerDefSchema.safeParse(entry);
    if (parsed.success) {
      mcpServers[name] = parsed.data;
    } else {
      skippedServers.push(
        `Skipped server "${name}" in ${filePath}: it has neither a "command" to launch nor a "url" to connect to.`,
      );
    }
  }

  // VS Code's mcp.json roots servers under "servers", not "mcpServers" (see
  // normalizeRawConfig). Rules address positions via `locate(['mcpServers',
  // ...])` uniformly — this wrapper transparently retries under the actual
  // on-disk root key so every client's real line/column still resolves,
  // instead of every VS Code finding silently falling back to 1:1.
  const rootKeyOnDisk =
    typeof raw === 'object' && raw !== null && 'servers' in raw ? 'servers' : 'mcpServers';
  const document: JsoncDocument = {
    getValue: () => rawDocument.getValue(),
    locate: (path) => {
      if (path[0] === 'mcpServers' && rootKeyOnDisk !== 'mcpServers') {
        return rawDocument.locate([rootKeyOnDisk, ...path.slice(1)]);
      }
      return rawDocument.locate(path);
    },
  };

  return {
    kind: 'config-file',
    scope,
    filePath,
    relativePath: relative(cwd, filePath) || filePath,
    document,
    config: result.data.mcpServers === undefined ? {} : { mcpServers },
    ...(skippedServers.length > 0 ? { skippedServers } : {}),
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export { discoverGlobalConfigPaths } from './locators/global.js';
export { discoverProjectConfigPaths } from './locators/project.js';
