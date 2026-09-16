import type { McpServerDef } from '../model/mcp-server-def.js';
import { isStdioServerDef } from '../model/mcp-server-def.js';
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
 * The npm package a stdio server definition launches, if any.
 *
 * One function so the rule that reports on a package and the collector that
 * looks it up agree on what "the package" is. If those two ever drifted — one
 * skipping a flag the other counts, say — the registry map would be keyed on
 * names the rule never asks for, and the rule would go quiet without anyone
 * noticing. Sharing the extraction makes that failure impossible rather than
 * unlikely.
 */
export function launchedNpmPackage(def: McpServerDef): LaunchedPackage | null {
  if (!isStdioServerDef(def) || !def.args) return null;
  if (!NPM_RUNNERS.has(def.command)) return null;

  const argIndex = def.args.findIndex((arg) => !arg.startsWith('-'));
  if (argIndex === -1) return null;

  const spec = parsePackageSpec(def.args[argIndex] ?? '');
  return spec ? { ...spec, argIndex } : null;
}
