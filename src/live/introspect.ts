import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { StdioServerDef } from '../model/mcp-server-def.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../package-info.js';
import { toToolDefinition } from './to-tool-definition.js';

export const DEFAULT_LIVE_TIMEOUT_MS = 10_000;

export interface LiveIntrospectionOptions {
  readonly timeoutMs?: number;
}

export interface LiveIntrospectionSuccess {
  readonly ok: true;
  readonly serverName: string;
  readonly tools: readonly ToolDefinition[];
}

export interface LiveIntrospectionFailure {
  readonly ok: false;
  readonly serverName: string;
  readonly error: string;
}

export type LiveIntrospectionOutcome = LiveIntrospectionSuccess | LiveIntrospectionFailure;

/**
 * Connects to one stdio-launched MCP server, calls `tools/list`, and
 * disconnects — never anything else. This is guardmcp's only code path that
 * runs another program's code (spawning the server's launch command), so the
 * constraints here are deliberate and load-bearing (see
 * docs/planning/mcp-guard-plan.md §6 Faz 3, risk R3):
 *
 * - Opt-in only: the caller (`--live`) decides per-scan whether this runs at
 *   all; nothing here is reachable from a default `guardmcp scan`.
 * - Only `tools/list` is called — never `tools/call`. Discovering what a
 *   tool CLAIMS to do must never mean actually doing it.
 * - Environment is scrubbed: `StdioClientTransport` spawns with
 *   `getDefaultEnvironment()` as the base (an OS-appropriate safelist —
 *   PATH/HOME/etc., see the SDK's `client/stdio.js`), merged with only the
 *   `env` entries the server's own config declares — never this process's
 *   full `process.env`, which would otherwise hand a spawned server
 *   unrelated secrets it never asked for.
 * - Hard-bounded: both the SDK's own per-request timeout AND an outer
 *   `Promise.race` here enforce `timeoutMs`, so a server that hangs before
 *   ever reaching a request (e.g. during process spawn, before the SDK's own
 *   request-level timers start) still can't block a scan indefinitely.
 */
export async function introspectStdioServer(
  serverName: string,
  def: StdioServerDef,
  options: LiveIntrospectionOptions = {},
): Promise<LiveIntrospectionOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
  const transport = new StdioClientTransport({
    command: def.command,
    args: def.args ? [...def.args] : [],
    ...(def.env ? { env: def.env } : {}),
    // Piping (rather than the SDK default of "inherit") keeps a noisy
    // server's stderr out of guardmcp's own output; we only care about
    // tools/list, not the server's diagnostic logging.
    stderr: 'ignore',
  });
  const client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION });

  try {
    const tools = await withTimeout(fetchTools(client, transport, timeoutMs), timeoutMs);
    return { ok: true, serverName, tools: tools.map((tool) => toToolDefinition(serverName, tool)) };
  } catch (err) {
    return { ok: false, serverName, error: errorMessage(err) };
  } finally {
    // Ends the child process (SDK grace-kills it if it doesn't exit on its
    // own) regardless of whether introspection succeeded, timed out, or
    // errored — a scan must never leave orphaned server processes behind.
    await client.close().catch(() => {});
  }
}

async function fetchTools(
  client: Client,
  transport: StdioClientTransport,
  timeoutMs: number,
): Promise<Tool[]> {
  await client.connect(transport, { timeout: timeoutMs });
  const response = await client.listTools(undefined, { timeout: timeoutMs });
  return response.tools;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for the server to respond.`));
    }, timeoutMs);
    // unref() so this timer alone never keeps the Node process alive — the
    // CLI process should exit promptly once real work is done regardless of
    // whether this timer has fired yet.
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
