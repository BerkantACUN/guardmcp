import type { Confidence } from '../core/severity.js';

/**
 * Launch settings that make a locally started MCP server listen on every
 * network interface rather than on loopback only.
 *
 * OWASP MCP09 (Shadow MCP Servers) is mostly about deployments nobody
 * registered, and most of its detection guidance is network-side. The one
 * concrete, widely measured symptom it cites — MCP servers bound to
 * 0.0.0.0 and reachable from the network — is decided in the launch config,
 * which is where this looks.
 */

export interface ExposedListenerMatch {
  /** Where the setting lives, relative to the server entry. */
  readonly field: 'args' | 'env';
  /** Array index for args, variable name for env. */
  readonly key: number | string;
  /** The setting as written, for the finding's evidence. */
  readonly text: string;
  readonly label: string;
  readonly confidence: Confidence;
}

/** `0.0.0.0`, `::`, `[::]`, `*`, each optionally followed by `:port`. */
const ALL_INTERFACES = /^(0\.0\.0\.0|::|\[::\]|\*)(:\d+)?$/;

/** Flags that name the address a server listens on. */
const LISTEN_FLAG =
  /^--(host|hostname|bind|bind[-_]address|bind[-_]host|listen|listen[-_]address|listen[-_]host|addr|address)$/i;

/** Env names that carry a listen address. `HOSTNAME` is excluded: every
 * shell sets it to the machine's name, never to an address to bind. */
const LISTEN_ENV = /^(HOST|([A-Z0-9]+_)+HOST|([A-Z0-9]+_)*(BIND|LISTEN)(_[A-Z0-9]+)*)$/i;

const CONTAINER_RUNNERS = new Set(['docker', 'podman']);

/** `--network host` / `--net=host`: the container shares the host's network stack. */
function usesHostNetwork(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    if (flag !== '--network' && flag !== '--net') continue;
    const value = eq === -1 ? argv[i + 1] : arg.slice(eq + 1);
    if (value?.trim() === 'host') return true;
  }
  return false;
}

export function findExposedListeners(
  command: string,
  args: readonly string[] | undefined,
  env: Readonly<Record<string, string>> | undefined,
): ExposedListenerMatch[] {
  const matches: ExposedListenerMatch[] = [];
  const argv = args ?? [];
  const isContainer = CONTAINER_RUNNERS.has(command);
  // Inside a container on its own network, binding 0.0.0.0 is what makes a
  // published port work at all; what reaches the network is the host side of
  // `-p`, checked below. Only on the host network is the inner bind the outer
  // one. The entry's env is the runner's, not the container's, so it is
  // skipped the same way.
  const bindIsInternal = isContainer && !usesHostNetwork(argv);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);
    const value = inlineValue ?? argv[i + 1];
    const valueIndex = inlineValue === undefined ? i + 1 : i;
    if (value === undefined) continue;

    if (!bindIsInternal && LISTEN_FLAG.test(flag) && ALL_INTERFACES.test(value.trim())) {
      matches.push({
        field: 'args',
        key: valueIndex,
        text: inlineValue === undefined ? `${flag} ${value}` : arg,
        label: `listens on ${value.trim()}, every network interface`,
        confidence: 'high',
      });
      continue;
    }

    // `docker run -p 8080:8080` publishes on every host interface: Docker's
    // default bind address is 0.0.0.0 unless the mapping names one.
    if (isContainer && (flag === '-p' || flag === '--publish')) {
      const mapping = value.trim();
      const parts = mapping.replace(/\/(tcp|udp|sctp)$/i, '').split(':');
      const publishesEverywhere =
        parts.length === 2 || (parts.length === 3 && ALL_INTERFACES.test(parts[0] ?? ''));
      if (publishesEverywhere) {
        matches.push({
          field: 'args',
          key: valueIndex,
          text: `${flag} ${mapping}`,
          label:
            parts.length === 2
              ? `publishes container port ${mapping} with no host address, which Docker binds on every interface`
              : `publishes container port ${mapping} on every host interface`,
          confidence: parts.length === 2 ? 'medium' : 'high',
        });
      }
    }
  }

  for (const [name, value] of Object.entries(bindIsInternal ? {} : (env ?? {}))) {
    if (!LISTEN_ENV.test(name) || !ALL_INTERFACES.test(value.trim())) continue;
    matches.push({
      field: 'env',
      key: name,
      text: `${name}=${value}`,
      label: `listens on ${value.trim()}, every network interface`,
      confidence: 'high',
    });
  }

  return matches;
}
