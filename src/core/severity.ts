/**
 * String literal union, not an enum: zero runtime cost, serializes to
 * JSON/SARIF as-is, and TypeScript still catches typos at compile time.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Confidence = 'high' | 'medium' | 'low';

/** Lowest to highest, so `indexOf` doubles as a numeric rank for comparisons. */
export const SEVERITY_ORDER: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

export function severityRank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

/** True when `severity` meets or exceeds `threshold` (e.g. for `--fail-on`). */
export function severityAtLeast(severity: Severity, threshold: Severity): boolean {
  return severityRank(severity) >= severityRank(threshold);
}
