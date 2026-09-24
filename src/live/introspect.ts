import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  Prompt,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { HttpServerDef, StdioServerDef } from '../model/mcp-server-def.js';
import type { PromptDefinition } from '../model/prompt-definition.js';
import type {
  ResourceDefinition,
  ResourceTemplateDefinition,
} from '../model/resource-definition.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from '../package-info.js';
import { refuseRemoteConnection } from './connect-policy.js';
import { toPromptDefinition } from './to-prompt-definition.js';
import { toResourceDefinition, toResourceTemplateDefinition } from './to-resource-definition.js';
import { toToolDefinition } from './to-tool-definition.js';

export const DEFAULT_LIVE_TIMEOUT_MS = 10_000;

export interface LiveIntrospectionOptions {
  readonly timeoutMs?: number;
  /** Dial endpoints guardmcp would otherwise refuse — private/metadata
   * addresses, and cleartext http carrying credentials. See
   * live/connect-policy.ts for why the default is to refuse. */
  readonly allowUnsafeRemote?: boolean;
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
  /** Resource TEMPLATES, e.g. `file:///{path}` — a resource whose target the
   * caller fills in, so what it can reach is bounded by the template rather
   * than by a fixed URI. Empty when the server declares no `resources`
   * capability or advertises none. */
  readonly resourceTemplates: readonly ResourceTemplateDefinition[];
  /** What the server said it supports at `initialize`. MCPG-702 reads
   * `logging` from it: a server with no logging capability has no channel to
   * report what it did, which is MCP08 at the protocol level rather than
   * inferred from a config file. */
  readonly capabilities: ServerCapabilities | undefined;
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
/**
 * The SDK is loaded on first connection, not at start-up. Importing it builds
 * the whole protocol's schema set, which every guardmcp invocation paid for —
 * `--version`, a static `scan`, `proxy` — although only `--live`, `pin
 * --live` and `inventory --live` ever connect to anything.
 */
let sdk:
  | Promise<{
      readonly Client: typeof Client;
      readonly StdioClientTransport: typeof StdioClientTransport;
      readonly StreamableHTTPClientTransport: typeof StreamableHTTPClientTransport;
    }>
  | undefined;

function loadSdk() {
  sdk ??= Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js'),
    import('@modelcontextprotocol/sdk/client/streamableHttp.js'),
  ]).then(([client, stdio, http]) => ({
    Client: client.Client,
    StdioClientTransport: stdio.StdioClientTransport,
    StreamableHTTPClientTransport: http.StreamableHTTPClientTransport,
  }));
  return sdk;
}

export async function introspectStdioServer(
  serverName: string,
  def: StdioServerDef,
  options: LiveIntrospectionOptions = {},
): Promise<LiveIntrospectionOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
  const { StdioClientTransport } = await loadSdk();
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
  return introspectOverTransport(serverName, transport, timeoutMs);
}

/**
 * Connects to a REMOTE MCP server over Streamable HTTP.
 *
 * Refuses before dialling anything the connect policy rejects — see
 * live/connect-policy.ts. `--live` is the point where a static finding
 * becomes an action this process takes, so the endpoints MCPG-401 and
 * MCPG-403 exist to warn about are exactly the ones guardmcp must not
 * quietly connect to on the config's say-so.
 */
export async function introspectHttpServer(
  serverName: string,
  def: HttpServerDef,
  options: LiveIntrospectionOptions = {},
): Promise<LiveIntrospectionOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;

  const refusal = refuseRemoteConnection(def.url, def.headers, options.allowUnsafeRemote === true);
  if (refusal) {
    return { ok: false, serverName, error: `refused to connect — ${refusal.reason}` };
  }

  const { StreamableHTTPClientTransport } = await loadSdk();
  const transport = new StreamableHTTPClientTransport(new URL(def.url), {
    // The config's own headers are forwarded so an authenticated server can
    // be introspected at all. They are never echoed into output; see
    // report/sanitize.ts and the redaction in the secret rules.
    ...(def.headers ? { requestInit: { headers: { ...def.headers } } } : {}),
  });

  return introspectOverTransport(serverName, transport, timeoutMs);
}

/**
 * The two transports guardmcp dials. Declared as a union rather than the
 * SDK's own `Transport` interface: the concrete classes declare
 * `sessionId: string | undefined` where the interface declares
 * `sessionId?: string`, which this project's `exactOptionalPropertyTypes`
 * correctly treats as incompatible. Naming the classes keeps that honest
 * instead of casting the difference away.
 */
type DialledTransport = StdioClientTransport | StreamableHTTPClientTransport;

/** The half that does not care which transport it was handed. */
async function introspectOverTransport(
  serverName: string,
  transport: DialledTransport,
  timeoutMs: number,
): Promise<LiveIntrospectionOutcome> {
  const { Client } = await loadSdk();
  const client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION });

  try {
    const surfaces = await withTimeout(fetchSurfaces(client, transport, timeoutMs), timeoutMs);
    return {
      ok: true,
      serverName,
      tools: surfaces.tools.map((tool) => toToolDefinition(serverName, tool)),
      prompts: surfaces.prompts.map((prompt) => toPromptDefinition(serverName, prompt)),
      resources: surfaces.resources.map((resource) => toResourceDefinition(serverName, resource)),
      resourceTemplates: surfaces.resourceTemplates.map((template) =>
        toResourceTemplateDefinition(serverName, template),
      ),
      capabilities: surfaces.capabilities,
    };
  } catch (err) {
    return { ok: false, serverName, error: errorMessage(err) };
  } finally {
    // For stdio this ends the child process (the SDK grace-kills it if it
    // doesn't exit on its own); for HTTP it closes the session. Either way a
    // scan must never leave something running behind it.
    await client.close().catch(() => {});
  }
}

async function fetchSurfaces(
  client: Client,
  transport: DialledTransport,
  timeoutMs: number,
): Promise<{
  tools: Tool[];
  prompts: Prompt[];
  resources: Resource[];
  resourceTemplates: ResourceTemplate[];
  capabilities: ServerCapabilities | undefined;
}> {
  // Cast narrowed to this one call. The SDK's Transport interface declares
  // `sessionId?: string` while StreamableHTTPClientTransport declares
  // `sessionId: string | undefined`; under this project's
  // exactOptionalPropertyTypes those are genuinely different types, and the
  // mismatch is upstream's, not ours. Casting here rather than loosening the
  // whole signature keeps the discrepancy visible and contained.
  await client.connect(transport as Transport, { timeout: timeoutMs });
  const tools = await listAllPages('tools/list', async (cursor) => {
    const page = await client.listTools(cursor ? { cursor } : undefined, { timeout: timeoutMs });
    return { items: page.tools, nextCursor: page.nextCursor };
  });

  // Ask for prompts only if the server said it has them. `prompts/list`
  // against a server that declares no `prompts` capability is a
  // "method not found" error, and an ordinary tools-only server — the
  // overwhelming majority — would otherwise come back as a failed scan.
  const capabilities = client.getServerCapabilities();
  const prompts = capabilities?.prompts
    ? await listAllPages('prompts/list', async (cursor) => {
        const page = await client.listPrompts(cursor ? { cursor } : undefined, {
          timeout: timeoutMs,
        });
        return { items: page.prompts, nextCursor: page.nextCursor };
      })
    : [];
  const resources = capabilities?.resources
    ? await listAllPages('resources/list', async (cursor) => {
        const page = await client.listResources(cursor ? { cursor } : undefined, {
          timeout: timeoutMs,
        });
        return { items: page.resources, nextCursor: page.nextCursor };
      })
    : [];
  // Templates live behind the same capability, but a server may advertise
  // resources and no templates (or the reverse), so a failure here must not
  // lose the resources we already have.
  const resourceTemplates = capabilities?.resources
    ? await listAllPages('resources/templates/list', async (cursor) => {
        const page = await client.listResourceTemplates(cursor ? { cursor } : undefined, {
          timeout: timeoutMs,
        });
        return { items: page.resourceTemplates, nextCursor: page.nextCursor };
      }).catch(() => [])
    : [];

  return { tools, prompts, resources, resourceTemplates, capabilities };
}

/** Far beyond any real server's listing, well short of an endless one. */
export const MAX_LIST_PAGES = 100;

/**
 * Follows `nextCursor` until the listing ends.
 *
 * Reading only the first page let a server keep anything it liked out of the
 * scan by serving it on page two — while clients, which do follow the
 * cursor, hand it to the model. The whole listing is what a client sees, so
 * the whole listing is what gets scanned and pinned.
 *
 * A server that never stops paginating (a repeated cursor, or more pages
 * than any listing needs) fails the introspection with a message rather
 * than returning what it has: a partial listing reported as complete is the
 * gap this exists to close.
 */
export async function listAllPages<T>(
  method: string,
  fetchPage: (
    cursor: string | undefined,
  ) => Promise<{ readonly items: readonly T[]; readonly nextCursor?: string | undefined }>,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (result.nextCursor === undefined) return items;
    if (seen.has(result.nextCursor)) {
      throw new Error(`${method} returned a cursor it had already returned; listing never ends.`);
    }
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error(`${method} still had more pages after ${MAX_LIST_PAGES}; listing never ends.`);
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
