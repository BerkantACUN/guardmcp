import type { ScanTargetScope } from '../model/scan-target.js';

/**
 * What is actually installed, as opposed to what is wrong with it.
 *
 * MCP09 (Shadow MCP Servers) is a governance problem before it is a security
 * one: you cannot review a server you do not know you have. `guardmcp scan`
 * answers "is any of this dangerous"; this answers "what is any of this",
 * which is the question someone with no security concern will still ask —
 * and the reason they run the tool at all.
 */
export interface ServerSurfaces {
  readonly tools: readonly string[];
  readonly prompts: readonly string[];
  readonly resources: readonly string[];
}

export interface ServerEntry {
  readonly name: string;
  readonly transport: 'stdio' | 'http';
  /** The launch command for stdio, or the endpoint URL for a remote server. */
  readonly launch: string;
  /** Present only when live introspection succeeded for this server. Absent
   * and `error` absent means introspection was never attempted. */
  readonly surfaces?: ServerSurfaces;
  /** Why introspection failed, when it was attempted and did not work. */
  readonly error?: string;
}

export interface ConfigEntry {
  readonly relativePath: string;
  readonly scope: ScanTargetScope;
  readonly servers: readonly ServerEntry[];
}

export interface Inventory {
  readonly configs: readonly ConfigEntry[];
  /** Whether `--live` was used. Distinguishes "this server advertises no
   * tools" from "we never asked" — the difference an inventory exists to
   * make unambiguous. */
  readonly live: boolean;
}

export interface InventoryTotals {
  readonly configs: number;
  readonly servers: number;
  readonly tools: number;
  readonly prompts: number;
  readonly resources: number;
}

export function inventoryTotals(inventory: Inventory): InventoryTotals {
  let servers = 0;
  let tools = 0;
  let prompts = 0;
  let resources = 0;

  for (const config of inventory.configs) {
    servers += config.servers.length;
    for (const server of config.servers) {
      tools += server.surfaces?.tools.length ?? 0;
      prompts += server.surfaces?.prompts.length ?? 0;
      resources += server.surfaces?.resources.length ?? 0;
    }
  }

  return { configs: inventory.configs.length, servers, tools, prompts, resources };
}
