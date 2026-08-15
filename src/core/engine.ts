import type { ScanTarget } from '../model/scan-target.js';
import type { Rule, ScanContext } from '../rules/types.js';
import type { Finding } from './finding.js';

export interface ScanResult {
  readonly findings: readonly Finding[];
  readonly targetsScanned: number;
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
