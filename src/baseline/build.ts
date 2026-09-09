import type { Finding } from '../core/finding.js';
import type { Severity } from '../core/severity.js';

export const BASELINE_FILE_VERSION = '1';
export const DEFAULT_BASELINE_PATH = '.mcpguard-baseline.json';

export interface BaselineEntry {
  readonly fingerprint: string;
  readonly ruleId: string;
  readonly severity: Severity;
  readonly logicalPath: string;
  /** What was found, so the file can be reviewed without re-running a scan. */
  readonly message: string;
}

export interface BaselineFile {
  readonly version: string;
  readonly generatedAt: string;
  readonly entries: readonly BaselineEntry[];
}

/**
 * A baseline is a list of accepted risks, and it gets reviewed in a pull
 * request like any other change. That is the whole reason each entry carries
 * its rule, severity, path and message rather than just a fingerprint: a
 * reviewer looking at a diff of opaque hashes cannot tell whether the change
 * accepts a formatting nit or a hardcoded production credential, so they
 * approve it. A baseline nobody can read is how a real finding gets accepted
 * silently.
 *
 * Suppression still keys on the fingerprint alone — the extra fields are for
 * humans and are not consulted when matching.
 */
export function buildBaseline(
  findings: readonly Finding[],
  now: () => Date = () => new Date(),
): BaselineFile {
  const byFingerprint = new Map<string, BaselineEntry>();

  for (const finding of findings) {
    if (byFingerprint.has(finding.fingerprint)) continue;
    byFingerprint.set(finding.fingerprint, {
      fingerprint: finding.fingerprint,
      ruleId: finding.ruleId,
      severity: finding.severity,
      logicalPath: finding.logicalPath,
      message: finding.message,
    });
  }

  return {
    version: BASELINE_FILE_VERSION,
    generatedAt: now().toISOString(),
    // Sorted by fingerprint, which is stable across runs: scan order follows
    // filesystem traversal, and an unstable order would turn every
    // regeneration into a whole-file diff nobody can read.
    entries: [...byFingerprint.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)),
  };
}

/** Trailing newline so the file plays well with diffs and POSIX tooling. */
export function serializeBaseline(baseline: BaselineFile): string {
  return `${JSON.stringify(baseline, null, 2)}\n`;
}
