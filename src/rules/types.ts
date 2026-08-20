import type { Finding } from '../core/finding.js';
import type { Confidence, Severity } from '../core/severity.js';
import type { ScanTarget } from '../model/scan-target.js';
import type { ToolDefinition } from '../model/tool-definition.js';
import type { LockFile } from '../pin/lockfile-schema.js';

export interface ScanContext {
  readonly cwd: string;
  /** Parsed `.mcpguard-lock.json`, when one is in play — populated by the
   * CLI boundary layer (an I/O read), never by a rule itself. Absent when
   * no lock file was found/given. Read by the rug-pull rules (MCPG-501/502,
   * src/rules/integrity) to detect drift since the last `guardmcp pin`. */
  readonly lock?: LockFile;
  /** Live-introspected tools from `--live`, keyed by
   * serverKey(target.relativePath, serverName) — populated by the CLI
   * boundary layer, which is the only place allowed to actually connect to
   * a server. Absent when `--live` wasn't used. Read by MCPG-502 to compare
   * a server's REAL current tools against what was pinned. */
  readonly liveTools?: ReadonlyMap<string, readonly ToolDefinition[]>;
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
