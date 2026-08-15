import { createHash } from 'node:crypto';
import type { Confidence, Severity } from './severity.js';

export interface SourceLocation {
  readonly file: string;
  /** 1-indexed, matches editor conventions. */
  readonly line: number;
  readonly column: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

export interface Finding {
  readonly ruleId: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly message: string;
  readonly remediation: string;
  readonly location: SourceLocation;
  /**
   * A JSON-pointer-style path to *what* was found (e.g.
   * "/mcpServers/foo/env/GITHUB_TOKEN"), independent of line/column.
   * This is what the fingerprint is built from — see computeFingerprint.
   */
  readonly logicalPath: string;
  /** Already redacted by the rule/detector — never the raw secret. */
  readonly evidence?: string;
  readonly fingerprint: string;
}

export type CreateFindingInput = Omit<Finding, 'fingerprint'>;

/**
 * Fingerprints are built from (ruleId, file, logicalPath, evidence) —
 * deliberately NOT line/column. A reformat or an unrelated edit earlier in
 * the file shifts every line number below it; if the fingerprint depended on
 * position, every existing finding would look "new" on the next scan and
 * `--baseline` suppression would silently stop working. Real tools (Snyk,
 * Semgrep) fingerprint on structure for the same reason.
 */
export function createFinding(input: CreateFindingInput): Finding {
  return {
    ...input,
    fingerprint: computeFingerprint(
      input.ruleId,
      input.location.file,
      input.logicalPath,
      input.evidence,
    ),
  };
}

function computeFingerprint(
  ruleId: string,
  file: string,
  logicalPath: string,
  evidence: string | undefined,
): string {
  const hash = createHash('sha256');
  hash.update(ruleId);
  hash.update('\0');
  hash.update(file);
  hash.update('\0');
  hash.update(logicalPath);
  hash.update('\0');
  hash.update(evidence ?? '');
  // 16 hex chars (64 bits) is plenty of collision resistance for a
  // human-facing dedupe key; the full digest would be unreadable in reports.
  return hash.digest('hex').slice(0, 16);
}
