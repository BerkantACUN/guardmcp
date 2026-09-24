import type { ScanTarget } from '../model/scan-target.js';
import type { Rule, ScanContext } from '../rules/types.js';
import type { Finding } from './finding.js';

/** What a scan actually checked, so an empty result is not read as a clean bill of health. */
export interface ScanCoverage {
  /** Config rules run against every scanned file. */
  readonly staticRules: number;
  /** Tool, prompt and resource rules run against live servers; 0 without --live. */
  readonly liveRules: number;
  /** Whether --live connected to servers and checked what they advertise at runtime. */
  readonly live: boolean;
}

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly targetsScanned: number;
  readonly coverage?: ScanCoverage;
}

export function runScan(
  targets: readonly ScanTarget[],
  rules: readonly Rule[],
  ctx: ScanContext,
): ScanResult {
  const findings: Finding[] = [];
  for (const target of targets) {
    for (const rule of rules) {
      findings.push(...rule.check(target, ctx));
    }
  }
  return { findings, targetsScanned: targets.length };
}
