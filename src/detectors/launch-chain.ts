import type { StdioServerDef } from '../model/mcp-server-def.js';
import { parsePackageSpec } from './package-spec.js';

/** One command in a stdio server's launch: what runs, with which arguments. */
export interface Launch {
  readonly command: string;
  readonly args: readonly string[];
  /** Index in the server's ORIGINAL `args` of this launch's `args[0]`, so a
   * finding on an inner argument still points at the right line. */
  readonly argOffset: number;
}

/** `guardmcp proxy` options that take a value — skipped when the wrapped
 * command is given without a `--` separator. */
const PROXY_VALUE_FLAGS = new Set(['--log', '--sarif', '--name']);
const NPM_RUNNERS = new Set(['npx', 'bunx', 'pnpx']);

function stem(path: string): string {
  const last = path.replace(/\\/g, '/').split('/').pop() ?? path;
  return last.replace(/\.(cmd|exe|ps1)$/i, '').toLowerCase();
}

/** Index of the `proxy` subcommand when `command args` invokes guardmcp's
 * proxy — as a global install, through a package runner, or as the built
 * CLI run by node — or -1. */
function proxyIndex(command: string, args: readonly string[]): number {
  const cmd = stem(command);
  if (cmd === 'guardmcp') return args[0] === 'proxy' ? 0 : -1;

  if (NPM_RUNNERS.has(cmd)) {
    const specIndex = args.findIndex((arg) => !arg.startsWith('-'));
    const spec = specIndex === -1 ? null : parsePackageSpec(args[specIndex] ?? '');
    return spec?.name === 'guardmcp' && args[specIndex + 1] === 'proxy' ? specIndex + 1 : -1;
  }

  if (cmd === 'node') {
    const script = (args[0] ?? '').replace(/\\/g, '/');
    return /(^|\/)guardmcp\/dist\/cli\/index\.js$/.test(script) && args[1] === 'proxy' ? 1 : -1;
  }
  return -1;
}

/** Where the wrapped command starts, after `proxy` and its own options. */
function wrappedCommandIndex(args: readonly string[], proxyAt: number): number {
  const separator = args.indexOf('--', proxyAt + 1);
  if (separator !== -1) return separator + 1;

  let i = proxyAt + 1;
  while (i < args.length) {
    const arg = args[i] ?? '';
    if (PROXY_VALUE_FLAGS.has(arg)) i += 2;
    else if (arg.startsWith('-')) i += 1;
    else return i;
  }
  return -1;
}

/**
 * The commands a stdio entry actually starts, outermost first.
 *
 * Usually that is just `command args`. When the entry runs a server behind
 * `guardmcp proxy`, the config's `command` is guardmcp and the server that
 * holds the credentials and serves the tools is the command after `--`.
 * Rules that look at the launch (a shell with `-c`, an unpinned or deprecated
 * package) must see that inner command too, or wrapping a server in the
 * proxy — which guardmcp itself recommends — would hide it from the scan.
 *
 * The outer launch stays in the chain: `npx -y guardmcp proxy -- ...` runs an
 * unpinned guardmcp, and that is still worth reporting.
 */
export function launchChain(def: StdioServerDef): Launch[] {
  const chain: Launch[] = [{ command: def.command, args: def.args ?? [], argOffset: 0 }];
  const args = def.args ?? [];
  let current = chain[0];

  // Bounded: a proxy wrapping a proxy is legal but pointless, and a config
  // must not be able to make the scan loop.
  for (let depth = 0; depth < 3 && current; depth++) {
    const at = proxyIndex(current.command, current.args);
    if (at === -1) break;
    const start = wrappedCommandIndex(current.args, at);
    if (start === -1 || start >= current.args.length) break;

    const commandIndex = current.argOffset + start;
    const inner: Launch = {
      command: args[commandIndex] ?? '',
      args: args.slice(commandIndex + 1),
      argOffset: commandIndex + 1,
    };
    chain.push(inner);
    current = inner;
  }
  return chain;
}
