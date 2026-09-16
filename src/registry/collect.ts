import { launchedNpmPackage } from '../detectors/launched-package.js';
import type { ScanTarget } from '../model/scan-target.js';
import { fetchNpmPackageStatus, type PackageStatus } from './npm.js';

/**
 * Every distinct npm package the scanned configs launch. Pure.
 *
 * Uses the same extraction the rule does, so the set of names looked up is
 * exactly the set of names the rule will ask for — see launched-package.ts
 * for why that has to be one function and not two that agree by luck.
 */
export function launchedPackageNames(targets: readonly ScanTarget[]): string[] {
  const names = new Set<string>();
  for (const target of targets) {
    for (const def of Object.values(target.config.mcpServers ?? {})) {
      const spec = launchedNpmPackage(def);
      if (spec) names.add(spec.name);
    }
  }
  return [...names].sort();
}

export interface RegistryLookup {
  readonly statuses: ReadonlyMap<string, PackageStatus>;
  /** Packages the registry could not be asked about — offline, 404, rate-limited. */
  readonly unresolved: readonly string[];
}

/**
 * I/O. Asks the registry about every launched package, in parallel.
 *
 * A failed lookup is recorded rather than thrown: one package the registry
 * cannot answer for must not abort the scan, and it must not be silently
 * treated as healthy either. It is absent from the map — the rule reads
 * absence as "unknown" and says nothing — and listed in `unresolved` so the
 * CLI can tell the user which packages went unchecked.
 */
export async function lookupRegistry(
  targets: readonly ScanTarget[],
  fetchImpl: typeof fetch = fetch,
): Promise<RegistryLookup> {
  const names = launchedPackageNames(targets);
  const results = await Promise.all(
    names.map(async (name) => [name, await fetchNpmPackageStatus(name, fetchImpl)] as const),
  );

  const statuses = new Map<string, PackageStatus>();
  const unresolved: string[] = [];
  for (const [name, status] of results) {
    if (status) statuses.set(name, status);
    else unresolved.push(name);
  }
  return { statuses, unresolved };
}
