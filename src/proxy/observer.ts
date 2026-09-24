import type { Finding } from '../core/finding.js';
import { type LiveTool, toToolDefinition } from '../live/to-tool-definition.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import type { ToolRule } from '../rules/poisoning/types.js';

export type Direction = 'client->server' | 'server->client';

export type MessageKind = 'request' | 'notification' | 'response' | 'error' | 'invalid';

/** One observed line of traffic. This is the JSONL record `--log` writes. */
export interface ProxyEvent {
  /** ISO-8601 time the line was observed. */
  readonly ts: string;
  readonly direction: Direction;
  readonly kind: MessageKind;
  /** For a response, the method of the request it answers. */
  readonly method?: string;
  readonly id?: string | number | null;
  /** Request-to-response latency; only on a response that matched a request. */
  readonly durationMs?: number;
  /** Size of the line on the wire, in bytes. */
  readonly bytes: number;
  /** Only on a `tools/list` response: what the rule catalog found in it. */
  readonly findings?: readonly Finding[];
  /** The parsed message. Absent on `invalid`. */
  readonly message?: unknown;
  /** Why the line was not a JSON-RPC message. Only on `invalid`. */
  readonly error?: string;
  /** The first bytes of an invalid line, so it can still be diagnosed. */
  readonly raw?: string;
}

export interface ObserverOptions {
  /** Used as `ToolDefinition.serverName`, i.e. in every finding's location. */
  readonly serverName: string;
  readonly toolRules: readonly ToolRule[];
  /** Injectable so durations are deterministic under test. */
  readonly now?: () => number;
}

interface PendingRequest {
  readonly method: string;
  readonly startedAt: number;
  readonly params: unknown;
}

const RAW_PREVIEW_LENGTH = 512;

/**
 * Turns lines of traffic into ProxyEvents: classifies each JSON-RPC message,
 * pairs responses with the requests they answer (in both directions — a
 * server can send `sampling/createMessage` to the client too), and runs the
 * tool rules over every `tools/list` result as it passes.
 *
 * Never throws on input. Anything a peer sends — truncated JSON, a bare
 * number, a tools list full of garbage — becomes an event, because the proxy
 * sits on a live session and must keep forwarding whatever happens here.
 */
export class ProxyObserver {
  private readonly pending = new Map<string, PendingRequest>();
  private readonly now: () => number;
  /** Tools accumulated across the pages of one paginated `tools/list`. */
  private tools: ToolDefinition[] = [];
  /** Findings already reported for the current listing, by fingerprint. */
  private reported = new Set<string>();

  constructor(private readonly options: ObserverOptions) {
    this.now = options.now ?? Date.now;
  }

  observe(direction: Direction, line: string): ProxyEvent[] {
    const bytes = Buffer.byteLength(line, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      return [this.invalid(direction, bytes, line, `malformed JSON: ${errorMessage(err)}`)];
    }
    // A JSON-RPC batch. Dropped from the MCP spec in 2025-06-18 but still
    // legal JSON-RPC 2.0, so older peers may send one.
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return [this.invalid(direction, bytes, line, 'empty batch')];
      return parsed.map((entry) => this.classify(direction, bytes, entry, line));
    }
    return [this.classify(direction, bytes, parsed, line)];
  }

  private classify(direction: Direction, bytes: number, msg: unknown, line: string): ProxyEvent {
    if (!isRecord(msg)) {
      return this.invalid(direction, bytes, line, 'not a JSON-RPC object');
    }
    const ts = new Date(this.now()).toISOString();
    const id = isValidId(msg.id) ? msg.id : undefined;

    if (typeof msg.method === 'string') {
      if (id === undefined || id === null) {
        return { ts, direction, kind: 'notification', method: msg.method, bytes, message: msg };
      }
      this.pending.set(pendingKey(direction, id), {
        method: msg.method,
        startedAt: this.now(),
        params: msg.params,
      });
      return { ts, direction, kind: 'request', method: msg.method, id, bytes, message: msg };
    }

    if ('result' in msg || 'error' in msg) {
      const kind: MessageKind = 'error' in msg ? 'error' : 'response';
      // A response travels the opposite way from its request.
      const key = id === undefined ? undefined : pendingKey(opposite(direction), id);
      const request = key === undefined ? undefined : this.pending.get(key);
      if (key !== undefined) this.pending.delete(key);

      const findings =
        kind === 'response' && request?.method === 'tools/list'
          ? this.scanToolsList(msg.result, request.params)
          : undefined;

      return {
        ts,
        direction,
        kind,
        ...(request ? { method: request.method } : {}),
        ...(id !== undefined ? { id } : {}),
        ...(request ? { durationMs: this.now() - request.startedAt } : {}),
        bytes,
        ...(findings ? { findings } : {}),
        message: msg,
      };
    }

    return this.invalid(direction, bytes, line, 'neither a request, notification nor response');
  }

  private scanToolsList(result: unknown, params: unknown): Finding[] {
    // A request without a cursor starts a fresh listing; one with a cursor
    // continues it.
    const isContinuation = isRecord(params) && typeof params.cursor === 'string';
    if (!isContinuation) {
      this.tools = [];
      this.reported = new Set();
    }

    const page = isRecord(result) && Array.isArray(result.tools) ? result.tools : [];
    const pageTools = page
      .filter((tool): tool is LiveTool => isRecord(tool) && typeof tool.name === 'string')
      .map((tool) => toToolDefinition(this.options.serverName, tool));
    this.tools.push(...pageTools);

    // Every tool so far is rescanned against the whole listing, not just the
    // new page: a rule comparing tools with each other (MCPG-203 shadowing)
    // must catch an impostor served on an earlier page than the tool it
    // names. Each finding is reported once per listing.
    return scanAgainst(this.tools, this.tools, this.options.toolRules).filter((finding) => {
      if (this.reported.has(finding.fingerprint)) return false;
      this.reported.add(finding.fingerprint);
      return true;
    });
  }

  private invalid(direction: Direction, bytes: number, line: string, error: string): ProxyEvent {
    return {
      ts: new Date(this.now()).toISOString(),
      direction,
      kind: 'invalid',
      bytes,
      error,
      raw: line.slice(0, RAW_PREVIEW_LENGTH),
    };
  }
}

function scanAgainst(
  tools: readonly ToolDefinition[],
  allTools: readonly ToolDefinition[],
  rules: readonly ToolRule[],
): Finding[] {
  const findings: Finding[] = [];
  for (const tool of tools) {
    for (const rule of rules) findings.push(...rule.check(tool, allTools));
  }
  return findings;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidId(value: unknown): value is string | number | null {
  return typeof value === 'string' || typeof value === 'number' || value === null;
}

/** `1` and `"1"` are different JSON-RPC ids, so the key keeps the type. */
function pendingKey(direction: Direction, id: string | number | null): string {
  return `${direction}\0${JSON.stringify(id)}`;
}

function opposite(direction: Direction): Direction {
  return direction === 'client->server' ? 'server->client' : 'client->server';
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
