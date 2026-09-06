import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Prompt, Resource, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { StdioServerDef } from '../model/mcp-server-def.js';
import type { PromptDefinition } from '../model/prompt-definition.js';
import type { ResourceDefinition } from '../model/resource-definition.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../package-info.js';
import { toPromptDefinition } from './to-prompt-definition.js';
import { toResourceDefinition } from './to-resource-definition.js';
import { toToolDefinition } from './to-tool-definition.js';

export const DEFAULT_LIVE_TIMEOUT_MS = 10_000;

export interface LiveIntrospectionOptions {
  readonly timeoutMs?: number;
}

export interface LiveIntrospectionSuccess {
  readonly ok: true;
  readonly serverName: string;
  readonly tools: readonly ToolDefinition[];
  /** Empty when the server declares no `prompts` capability — which is the
   * common case, and is not an error. */
  readonly prompts: readonly PromptDefinition[];
  /** Empty when the server declares no `resources` capability. */
  readonly resources: readonly ResourceDefinition[];
}

export interface LiveIntrospectionFailure {
  readonly ok: false;
  readonly serverName: string;
  readonly error: string;
}

export type LiveIntrospectionOutcome = LiveIntrospectionSuccess | LiveIntrospectionFailure;

/**
 * Connects to one stdio-launched MCP server, calls `tools/list` (plus
 * `prompts/list` and `resources/list` when the server declares those
 * capabilities), and disconnects — never anything else. This is guardmcp's
 * only code path that
 * runs another program's code (spawning the server's launch command), so the
 * constraints here are deliberate and load-bearing (see
 * docs/planning/mcp-guard-plan.md §6 Faz 3, risk R3):
 *
 * - Opt-in only: the caller (`--live`) decides per-scan whether this runs at
 *   all; nothing here is reachable from a default `guardmcp scan`.
 * - Only the LIST methods are called — never `tools/call`, and never
 *   `prompts/get`. Discovering what a tool or prompt CLAIMS to do must never
 *   mean actually doing it. That line is why prompt scanning covers the
 *   `prompts/list` metadata (name, description, argument descriptions) and
 *   not the rendered message body, and why resource scanning covers a
 *   resource's URI and description but never calls `resources/read` — a
 *   resource is exactly the thing you least want to fetch from a server you
 *   are scanning because you do not trust it.
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
    // Discarding (rather than the SDK default of "inherit") keeps a noisy
    // server's stderr out of guardmcp's own output; we only care about
    // tools/list, not the server's diagnostic logging. Deliberately NOT
    // 'pipe': piping without a listener draining the stream risks a
    // full-buffer hang if a server writes a lot to stderr — 'ignore' has no
    // such risk since the OS just discards the writes.
    stderr: 'ignore',
  });
  const client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION });

  try {
    const surfaces = await withTimeout(fetchSurfaces(client, transport, timeoutMs), timeoutMs);
    return {
      ok: true,
      serverName,
      tools: surfaces.tools.map((tool) => toToolDefinition(serverName, tool)),
      prompts: surfaces.prompts.map((prompt) => toPromptDefinition(serverName, prompt)),
      resources: surfaces.resources.map((resource) => toResourceDefinition(serverName, resource)),
    };
  } catch (err) {
    return { ok: false, serverName, error: errorMessage(err) };
  } finally {
    // Ends the child process (SDK grace-kills it if it doesn't exit on its
    // own) regardless of whether introspection succeeded, timed out, or
    // errored — a scan must never leave orphaned server processes behind.
    await client.close().catch(() => {});
  }
}

async function fetchSurfaces(
  client: Client,
  transport: StdioClientTransport,
  timeoutMs: number,
): Promise<{ tools: Tool[]; prompts: Prompt[]; resources: Resource[] }> {
  await client.connect(transport, { timeout: timeoutMs });
  const toolsResponse = await client.listTools(undefined, { timeout: timeoutMs });

  // Ask for prompts only if the server said it has them. `prompts/list`
  // against a server that declares no `prompts` capability is a
  // "method not found" error, and an ordinary tools-only server — the
  // overwhelming majority — would otherwise come back as a failed scan.
  const capabilities = client.getServerCapabilities();
  const prompts = capabilities?.prompts
    ? (await client.listPrompts(undefined, { timeout: timeoutMs })).prompts
    : [];
  const resources = capabilities?.resources
    ? (await client.listResources(undefined, { timeout: timeoutMs })).resources
    : [];

  return { tools: toolsResponse.tools, prompts, resources };
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
