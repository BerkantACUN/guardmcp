import type { ScanTarget } from '../model/scan-target.js';
import { serverKey } from '../model/server-key.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import { computeDefinitionHash } from './definition-hash.js';
import { LOCK_FILE_VERSION, type LockFile } from './lockfile-schema.js';
import { computeToolsHash } from './tools-hash.js';

/**
 * Pure assembly of a LockFile from already-loaded targets and (optionally)
 * already-introspected live tools — no I/O here. `guardmcp pin`
 * (cli/commands/pin.ts) is the boundary that does the real reading/
 * connecting and hands the results in.
 */
export function buildLockFile(
  targets: readonly ScanTarget[],
  liveToolsByServerKey: ReadonlyMap<string, readonly ToolDefinition[]> | undefined,
  generatedAt: string,
): LockFile {
  const servers: Record<string, { definitionHash: string; toolsHash?: string }> = {};

  for (const target of targets) {
    const entries = target.config.mcpServers ?? {};
    for (const [serverName, def] of Object.entries(entries)) {
      const key = serverKey(target.relativePath, serverName);
      const liveTools = liveToolsByServerKey?.get(key);
      servers[key] = {
        definitionHash: computeDefinitionHash(def),
        ...(liveTools ? { toolsHash: computeToolsHash(liveTools) } : {}),
      };
    }
  }

  return { version: LOCK_FILE_VERSION, generatedAt, servers };
}
