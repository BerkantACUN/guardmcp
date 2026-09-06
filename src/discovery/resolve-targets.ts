import type { ScanTarget, ScanTargetScope } from '../model/scan-target.js';
import { discoverProjectConfigPaths, loadScanTarget } from './index.js';

export interface ResolveTargetsResult {
  readonly targets: readonly ScanTarget[];
  /** One human-readable message per config file that failed to load — the
   * caller decides whether/how to surface these (both `scan` and `pin`
   * warn-and-continue rather than aborting on a single bad file). */
  readonly warnings: readonly string[];
  /** Whether there was anything to try loading at all — explicit paths were
   * given, or auto-discovery found at least one candidate. Distinguishes
   * "nothing here to scan" (fine, empty result) from "candidates existed
   * but every one of them failed to load" (a real problem the caller
   * should treat differently). */
  readonly hadCandidates: boolean;
}

/**
 * Shared candidate-path resolution + load-with-warnings loop, used by both
 * `scan` and `pin` (cli/commands) — they discover configs identically and
 * only differ in what they do with the result once loaded.
 */
export function resolveScanTargets(
  paths: readonly string[],
  cwd: string,
  globalConfigPaths: readonly string[] = [],
): ResolveTargetsResult {
  const explicitPaths = paths.length > 0;
  // Keep each candidate's origin: a project config is the reviewed set, a
  // global one is whatever this machine happens to have. MCPG-601 needs the
  // difference, and only this layer still knows it.
  const candidates: (readonly [string, ScanTargetScope])[] = explicitPaths
    ? paths.map((path) => [path, 'explicit'] as const)
    : dedupeByPath([
        ...discoverProjectConfigPaths(cwd).map((path) => [path, 'project'] as const),
        ...globalConfigPaths.map((path) => [path, 'global'] as const),
      ]);
  const candidatePaths = candidates.map(([path]) => path);

  const targets: ScanTarget[] = [];
  const warnings: string[] = [];
  for (const [path, scope] of candidates) {
    try {
      targets.push(loadScanTarget(path, cwd, scope));
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { targets, warnings, hadCandidates: candidatePaths.length > 0 };
}

/** First occurrence wins, so a path discovered as both project and global
 * keeps the project reading — the stricter, reviewed one. */
function dedupeByPath(
  entries: readonly (readonly [string, ScanTargetScope])[],
): (readonly [string, ScanTargetScope])[] {
  const seen = new Set<string>();
  const out: (readonly [string, ScanTargetScope])[] = [];
  for (const entry of entries) {
    if (seen.has(entry[0])) continue;
    seen.add(entry[0]);
    out.push(entry);
  }
  return out;
}
