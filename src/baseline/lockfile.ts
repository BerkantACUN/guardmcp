import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { Finding } from '../core/finding.js';

const BaselineFileSchema = z.object({
  version: z.string(),
  fingerprints: z.array(z.string()),
});

/**
 * A baseline is a snapshot of fingerprints for findings you've already
 * triaged (accepted risk, false positive, tracked elsewhere) — `--baseline`
 * suppresses them from both the report and the --fail-on exit code, so CI
 * only fails on genuinely NEW findings. This is exactly why Finding
 * fingerprints are logical-path-based rather than line/column-based (see
 * core/finding.ts) — a baseline built against one scan must still match
 * after an unrelated line shifts.
 */
export function loadBaseline(filePath: string): ReadonlySet<string> {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const result = BaselineFileSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Malformed baseline file at ${filePath}: ${result.error.message}`);
  }
  return new Set(result.data.fingerprints);
}

export function applyBaseline(
  findings: readonly Finding[],
  baseline: ReadonlySet<string>,
): Finding[] {
  return findings.filter((f) => !baseline.has(f.fingerprint));
}
