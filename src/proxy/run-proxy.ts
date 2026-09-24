import { spawn } from 'node:child_process';
import { createWriteStream, openSync, type WriteStream, writeFileSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import type { Readable, Writable } from 'node:stream';
import pc from 'picocolors';
import type { Finding } from '../core/finding.js';
import { formatSarif } from '../report/formatters/sarif.js';
import { sanitizeForDisplay } from '../report/sanitize.js';
import type { ToolRule } from '../rules/poisoning/types.js';
import { ALL_TOOL_RULES } from '../rules/tool-registry.js';
import { formatEventLine, formatFindingLines } from './format.js';
import { LineSplitter } from './line-splitter.js';
import { type Direction, type ProxyEvent, ProxyObserver } from './observer.js';

/** The shell's own convention for "the command could not be run". */
export const EXIT_SPAWN_FAILED = 127;

/** Forwarded to the wrapped server rather than acted on by the proxy. */
export const FORWARDED_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

export interface ProxyOptions {
  readonly command: string;
  readonly args: readonly string[];
  /** Names the server in findings (`live:<serverName>/<tool>`). */
  readonly serverName: string;
  /** What the MCP client writes — process.stdin in the CLI. */
  readonly input: Readable;
  /** Where the server's replies go — process.stdout in the CLI. */
  readonly output: Writable;
  /** Human-readable traffic and findings. Never touches `output`. */
  readonly stderr: (line: string) => void;
  /** Append every message as a JSONL record here instead of logging it to stderr. */
  readonly logPath?: string;
  /** On exit, write every distinct finding of the session here as SARIF. */
  readonly sarifPath?: string;
  readonly toolRules?: readonly ToolRule[];
  /** Where SIGINT/SIGTERM/SIGHUP arrive — `process` in the CLI. */
  readonly signals?: NodeJS.EventEmitter;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => number;
}

/**
 * Sits between an MCP client and a stdio MCP server: spawns the server,
 * forwards bytes in both directions exactly as received, and reports each
 * JSON-RPC message on the side. `tools/list` results are run through the tool
 * rule catalog as they pass, so a poisoned tool is flagged at the moment the
 * client receives it — including one a server only starts serving mid-session,
 * which a one-off `scan --live` would never see.
 *
 * Forwarding never depends on observation: the byte stream is piped
 * straight through, and the observer works on a copy. Resolves with the
 * server's own exit code (128 + signal number when it was killed by a
 * signal), so the proxy is invisible to whatever launched it.
 */
export async function runProxy(options: ProxyOptions): Promise<number> {
  const toolRules = options.toolRules ?? ALL_TOOL_RULES;
  const signals = options.signals ?? process;
  // Opened before the server is spawned so a bad path is a usage error, not
  // a session that silently logs nothing.
  const log: WriteStream | undefined = options.logPath
    ? createWriteStream('', { fd: openSync(options.logPath, 'a') })
    : undefined;

  const observer = new ProxyObserver({
    serverName: options.serverName,
    toolRules,
    ...(options.now ? { now: options.now } : {}),
  });
  const findingsByFingerprint = new Map<string, Finding>();

  const report = (event: ProxyEvent): void => {
    if (log) {
      log.write(`${JSON.stringify(event)}\n`);
    } else {
      options.stderr(formatEventLine(event));
    }
    // Findings reach stderr even with --log: a poisoned tool is the one
    // thing a user watching the terminal must not miss.
    for (const line of formatFindingLines(event)) options.stderr(line);
    for (const finding of event.findings ?? []) {
      findingsByFingerprint.set(finding.fingerprint, finding);
    }
  };

  const tap = (direction: Direction) => {
    const splitter = new LineSplitter(undefined, (partial) =>
      report({
        ts: new Date((options.now ?? Date.now)()).toISOString(),
        direction,
        kind: 'invalid',
        bytes: Buffer.byteLength(partial, 'utf8'),
        error: 'line exceeds the observation limit; forwarded but not inspected',
      }),
    );
    const observe = (lines: readonly string[]) => {
      for (const line of lines) {
        // Observation is best-effort by design. Whatever goes wrong here, the
        // bytes have already been forwarded and the session carries on.
        try {
          for (const event of observer.observe(direction, line)) report(event);
        } catch (err) {
          options.stderr(pc.yellow(`[guardmcp proxy] could not inspect a message: ${String(err)}`));
        }
      }
    };
    return {
      onData: (chunk: Buffer | string) => observe(splitter.push(chunk)),
      flush: () => observe(splitter.flush()),
    };
  };

  const child = spawn(options.command, [...options.args], {
    stdio: ['pipe', 'pipe', 'inherit'],
    env: options.env ?? process.env,
  });
  options.stderr(
    pc.dim(
      `[guardmcp proxy] wrapping ${sanitizeForDisplay([options.command, ...options.args].join(' '))}`,
    ),
  );

  const clientTap = tap('client->server');
  const serverTap = tap('server->client');

  // The server may exit before the client stops writing; a write into its
  // closed stdin is expected then, not a proxy failure.
  child.stdin.on('error', () => {});
  options.input.pipe(child.stdin);
  options.input.on('data', clientTap.onData);
  child.stdout.pipe(options.output, { end: false });
  child.stdout.on('data', serverTap.onData);

  const forward = (signal: NodeJS.Signals) => () => {
    child.kill(signal);
  };
  const handlers = FORWARDED_SIGNALS.map((signal) => [signal, forward(signal)] as const);
  for (const [signal, handler] of handlers) signals.on(signal, handler);

  const exitCode = await new Promise<number>((resolve) => {
    let settled = false;
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      options.stderr(
        pc.red(
          `[guardmcp proxy] could not start "${sanitizeForDisplay(options.command)}": ${sanitizeForDisplay(err.message)}`,
        ),
      );
      resolve(EXIT_SPAWN_FAILED);
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      resolve(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 1));
    });
  });

  for (const [signal, handler] of handlers) signals.off(signal, handler);
  options.input.unpipe(child.stdin);
  options.input.off('data', clientTap.onData);
  // Stop reading so a still-open client stdin does not keep this process
  // alive after the server it was talking to has gone.
  options.input.pause();
  clientTap.flush();
  serverTap.flush();

  if (log) {
    await new Promise<void>((resolve) => log.end(resolve));
  }
  if (options.sarifPath) {
    const findings = [...findingsByFingerprint.values()];
    writeFileSync(
      options.sarifPath,
      `${formatSarif({ findings, targetsScanned: 1 }, toolRules)}\n`,
      'utf-8',
    );
  }
  if (findingsByFingerprint.size > 0) {
    options.stderr(
      pc.red(`[guardmcp proxy] ${findingsByFingerprint.size} distinct finding(s) in this session.`),
    );
  }
  return exitCode;
}
