import type { Finding } from '../core/finding.js';
import type { Confidence, Severity } from '../core/severity.js';
import type { ScanTarget } from '../model/scan-target.js';

export interface ScanContext {
  readonly cwd: string;
}

/**
 * Contract (docs/planning/mcp-guard-plan.md §5.3): a Rule.check is a PURE
 * function — no file/network I/O, no mutation of `target`. All the data it
 * needs is already on `target`. This is what makes rule tests fast (no
 * mocks, no fixtures on disk needed at the unit level) and what makes the
 * engine safe to run in parallel later without surprises.
 */
export interface Rule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly category: string;
  readonly docsUrl: string;
  check(target: ScanTarget, ctx: ScanContext): readonly Finding[];
}
