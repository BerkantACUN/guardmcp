import { runProxy } from '../../proxy/run-proxy.js';

export interface ProxyCommandOptions {
  readonly command: string;
  readonly args: readonly string[];
  readonly name?: string;
  readonly logPath?: string;
  readonly sarifPath?: string;
  readonly stderr: (line: string) => void;
}

/** Launchers whose own name says nothing about which server they start. */
const LAUNCHERS = new Set(['npx', 'uvx', 'node', 'python', 'python3', 'bunx', 'pnpx', 'deno']);

/**
 * `npx -y @modelcontextprotocol/server-github` should be reported as
 * "server-github", not "npx": when the command is a generic launcher, the
 * first non-flag argument is the thing actually being run.
 */
export function defaultServerName(command: string, args: readonly string[]): string {
  const base = stem(command);
  if (!LAUNCHERS.has(base.toLowerCase())) return base;
  const target = args.find((arg) => !arg.startsWith('-'));
  if (target === undefined) return base;
  // Strip a version suffix (`pkg@1.2.3`) but keep a scope (`@scope/pkg`).
  const withoutVersion = target.replace(/(?<=.)@[^/]*$/, '');
  return stem(withoutVersion) || base;
}

/** Last path segment without its extension. Splits on both separators so a
 * Windows path in a config is named the same on every host. */
function stem(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? path;
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(0, dot) : last;
}

export function runProxyCommand(options: ProxyCommandOptions): Promise<number> {
  return runProxy({
    command: options.command,
    args: options.args,
    serverName: options.name ?? defaultServerName(options.command, options.args),
    input: process.stdin,
    output: process.stdout,
    stderr: options.stderr,
    ...(options.logPath ? { logPath: options.logPath } : {}),
    ...(options.sarifPath ? { sarifPath: options.sarifPath } : {}),
  });
}
