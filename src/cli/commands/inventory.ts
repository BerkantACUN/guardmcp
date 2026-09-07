import { resolveScanTargets } from '../../discovery/resolve-targets.js';
import { formatInventoryHuman, formatInventoryJson } from '../../inventory/format.js';
import type { ConfigEntry, Inventory, ServerEntry } from '../../inventory/model.js';
import { DEFAULT_LIVE_TIMEOUT_MS } from '../../live/introspect.js';
import { runLiveIntrospection } from '../../live/scan-live.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import { serverKey } from '../../model/server-key.js';
import { EXIT_CODES } from '../exit-codes.js';

export type InventoryFormat = 'human' | 'json';

export interface InventoryCommandOptions {
  readonly paths: readonly string[];
  readonly cwd: string;
  readonly format: InventoryFormat;
  readonly live?: boolean;
  readonly liveTimeoutMs?: number;
  /** See live/connect-policy.ts — off by default on purpose. */
  readonly allowUnsafeRemote?: boolean;
  readonly globalConfigPaths?: readonly string[];
  readonly stdout: (text: string) => void;
  readonly stderr: (line: string) => void;
}

/**
 * Answers "what MCP servers do I have, and what do they expose?" — not "is
 * any of it dangerous". Deliberately never exits non-zero on content: an
 * inventory reports, it does not judge, so it can be run by someone with no
 * security question at all.
 */
export async function runInventoryCommand(options: InventoryCommandOptions): Promise<number> {
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? [],
  );
  for (const warning of warnings) {
    options.stderr(`⚠ ${warning}`);
  }
  if (targets.length === 0 && hadCandidates) {
    options.stderr('No MCP config file could be loaded — see warnings above.');
    return EXIT_CODES.toolError;
  }

  const live = options.live === true;
  const introspection = live
    ? await runLiveIntrospection(targets, {
        timeoutMs: options.liveTimeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS,
        ...(options.allowUnsafeRemote === true ? { allowUnsafeRemote: true } : {}),
      })
    : undefined;

  if (introspection) {
    options.stderr(
      `ℹ --live: connected to ${introspection.toolsByServerKey.size}/${introspection.serversAttempted} server(s).`,
    );
  }

  const configs: ConfigEntry[] = targets.map((target) => ({
    relativePath: target.relativePath,
    scope: target.scope,
    servers: Object.entries(target.config.mcpServers ?? {}).map(([name, def]): ServerEntry => {
      const stdio = isStdioServerDef(def);
      const base = {
        name,
        transport: (stdio ? 'stdio' : 'http') as ServerEntry['transport'],
        launch: stdio ? [def.command, ...(def.args ?? [])].join(' ') : (def.url ?? '(no url)'),
      };
      if (!introspection) return base;

      const key = serverKey(target.relativePath, name);
      const error = introspection.errorsByServerKey.get(key);
      if (error !== undefined) return { ...base, error };

      const tools = introspection.toolsByServerKey.get(key);
      if (!tools) return base; // never attempted (remote server under --live)

      return {
        ...base,
        surfaces: {
          tools: tools.map((t) => t.name),
          prompts: (introspection.promptsByServerKey.get(key) ?? []).map((p) => p.name),
          resources: (introspection.resourcesByServerKey.get(key) ?? []).map((r) => r.name),
        },
      };
    }),
  }));

  const inventory: Inventory = { configs, live };
  options.stdout(
    options.format === 'json' ? formatInventoryJson(inventory) : formatInventoryHuman(inventory),
  );
  return EXIT_CODES.clean;
}
