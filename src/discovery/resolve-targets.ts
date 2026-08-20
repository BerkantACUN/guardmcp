import type { ScanTarget } from '../model/scan-target.js';
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
  const candidatePaths = explicitPaths
    ? [...paths]
    : [...new Set([...discoverProjectConfigPaths(cwd), ...globalConfigPaths])];

  const targets: ScanTarget[] = [];
  const warnings: string[] = [];
  for (const path of candidatePaths) {
    try {
      targets.push(loadScanTarget(path, cwd));
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { targets, warnings, hadCandidates: candidatePaths.length > 0 };
}
