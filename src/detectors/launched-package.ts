import type { McpServerDef } from '../model/mcp-server-def.js';
import { isStdioServerDef } from '../model/mcp-server-def.js';
import { launchChain } from './launch-chain.js';
import { type PackageSpec, parsePackageSpec } from './package-spec.js';

/**
 * Runners whose first non-flag argument names a registry package.
 *
 * `uvx` is deliberately not here even though MCPG-105 treats it as a package
 * runner: it installs from PyPI, and PyPI has no package-level deprecation to
 * ask about (releases can be yanked one at a time; a project cannot be marked
 * abandoned). A registry lookup that returned "fine" for a PyPI package would
 * be answering a question that was never asked.
 */
const NPM_RUNNERS = new Set(['npx', 'bunx']);

export interface LaunchedPackage extends PackageSpec {
  /** Index into `args` where the spec sits, for locating the finding. */
  readonly argIndex: number;
}

/**
 * Every npm package a stdio server definition launches, outermost first —
 * more than one when a server runs behind `guardmcp proxy` (see launchChain).
 * `argIndex` is always an index into the entry's own `args`.
 *
 * One function so the rule that reports on a package and the collector that
 * looks it up agree on what "the package" is. If those two ever drifted — one
 * skipping a flag the other counts, say — the registry map would be keyed on
 * names the rule never asks for, and the rule would go quiet without anyone
 * noticing. Sharing the extraction makes that failure impossible rather than
 * unlikely.
 */
export function launchedNpmPackages(def: McpServerDef): LaunchedPackage[] {
  if (!isStdioServerDef(def)) return [];

  const found: LaunchedPackage[] = [];
  for (const launch of launchChain(def)) {
    if (!NPM_RUNNERS.has(launch.command)) continue;
    const index = launch.args.findIndex((arg) => !arg.startsWith('-'));
    if (index === -1) continue;
    const spec = parsePackageSpec(launch.args[index] ?? '');
    if (spec) found.push({ ...spec, argIndex: launch.argOffset + index });
  }
  return found;
}
