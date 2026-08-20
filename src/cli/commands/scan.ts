import pc from 'picocolors';
import { applyBaseline, loadBaseline } from '../../baseline/lockfile.js';
import { runScan, type ScanResult } from '../../core/engine.js';
import { filterRules } from '../../core/rule-filter.js';
import { type Severity, severityAtLeast } from '../../core/severity.js';
import { resolveScanTargets } from '../../discovery/resolve-targets.js';
import { DEFAULT_LIVE_TIMEOUT_MS } from '../../live/introspect.js';
import { runLiveIntrospection, runToolRules } from '../../live/scan-live.js';
import type { ScanTarget } from '../../model/scan-target.js';
import type { ToolDefinition } from '../../model/tool-definition.js';
import { loadLockFile } from '../../pin/io.js';
import type { LockFile } from '../../pin/lockfile-schema.js';
import { formatHuman } from '../../report/formatters/human.js';
import { formatJson } from '../../report/formatters/json.js';
import { formatSarif } from '../../report/formatters/sarif.js';
import { ALL_RULES } from '../../rules/registry.js';
import { ALL_TOOL_RULES } from '../../rules/tool-registry.js';
import { EXIT_CODES } from '../exit-codes.js';

const ALL_KNOWN_RULE_IDS = new Set([...ALL_RULES, ...ALL_TOOL_RULES].map((r) => r.id));

export type OutputFormat = 'human' | 'json' | 'sarif';

export interface ScanCommandOptions {
  readonly paths: readonly string[];
  readonly failOn: Severity;
  readonly format: OutputFormat;
  readonly cwd: string;
  /** Rule IDs to run exclusively (--rules). Empty = run everything not ignored. */
  readonly only?: readonly string[];
  /** Rule IDs to skip (--ignore-rule). Wins over `only` on overlap. */
  readonly ignore?: readonly string[];
  /** Path to a baseline file (--baseline) — findings whose fingerprint appears there are suppressed. */
  readonly baselinePath?: string;
  /**
   * Connect to every stdio-launched server found in the scanned configs and
   * run the poisoning/scope ToolRules (MCPG-2xx/3xx) against their REAL
   * advertised tools, not just what's in the config file (--live, Phase 3).
   * Opt-in and off by default — see src/live/introspect.ts for the security
   * constraints this runs under.
   */
  readonly live?: boolean;
  /** Per-server timeout for --live introspection. Defaults to DEFAULT_LIVE_TIMEOUT_MS. */
  readonly liveTimeoutMs?: number;
  /**
   * Path to a `.mcpguard-lock.json` produced by `guardmcp pin` — enables the
   * rug-pull rules (MCPG-501/502). Deliberately NOT auto-read from a default
   * path inside this function, for the same testability reason as
   * `globalConfigPaths` below; the CLI wiring layer decides whether a
   * default `.mcpguard-lock.json` in cwd exists and passes its path in.
   */
  readonly lockPath?: string;
  /**
   * Pre-resolved global (Claude Desktop/Cursor/Windsurf) config paths to
   * fold into auto-discovery, alongside project-level ones. Deliberately
   * NOT resolved inside this function via discoverGlobalConfigPaths()
   * directly — that reaches into the real home directory, which would make
   * "zero-config" test cases non-deterministic depending on what happens to
   * be installed on whatever machine runs the tests. The CLI wiring layer
   * (cli/index.ts) is the real I/O boundary; it calls the real discovery
   * function and passes the result in. Defaults to none.
   */
  readonly globalConfigPaths?: readonly string[];
  readonly stdout: (report: string) => void;
  readonly stderr: (line: string) => void;
}

export async function runScanCommand(options: ScanCommandOptions): Promise<number> {
  let activeRules: typeof ALL_RULES;
  let activeToolRules: typeof ALL_TOOL_RULES;
  try {
    const filterOptions = {
      only: options.only ?? [],
      ignore: options.ignore ?? [],
      // Validated against the UNION of both catalogs — a `--rules` value
      // naming a ToolRule ID (MCPG-2xx/3xx) must not be reported "unknown"
      // just because this particular filterRules() call only sees the
      // file-based catalog, and vice versa.
      knownIds: ALL_KNOWN_RULE_IDS,
    };
    activeRules = filterRules(ALL_RULES, filterOptions);
    activeToolRules = filterRules(ALL_TOOL_RULES, filterOptions);
  } catch (err) {
    options.stderr(pc.red(err instanceof Error ? err.message : String(err)));
    return EXIT_CODES.toolError;
  }

  let baseline: ReadonlySet<string> | undefined;
  if (options.baselinePath) {
    try {
      baseline = loadBaseline(options.baselinePath);
    } catch (err) {
      options.stderr(pc.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }

  let lock: LockFile | undefined;
  if (options.lockPath) {
    try {
      lock = loadLockFile(options.lockPath);
    } catch (err) {
      options.stderr(pc.red(err instanceof Error ? err.message : String(err)));
      return EXIT_CODES.toolError;
    }
  }

  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? [],
  );
  for (const warning of warnings) {
    options.stderr(pc.yellow(`⚠ ${warning}`));
  }

  if (!hadCandidates) {
    // Still a valid (empty) report in whatever format was requested — a
    // JSON/SARIF consumer parsing stdout should never receive a plain
    // English sentence instead of the format it asked for.
    options.stdout(formatResult({ targetsScanned: 0, findings: [] }, options.format));
    return EXIT_CODES.clean;
  }

  if (targets.length === 0) {
    options.stderr(pc.red('No MCP config file could be loaded — see warnings above.'));
    return EXIT_CODES.toolError;
  }

  let liveTools: ReadonlyMap<string, readonly ToolDefinition[]> | undefined;
  let liveFindings: ReturnType<typeof runToolRules> = [];
  if (options.live) {
    const live = await runLiveScan(targets, activeToolRules, options.liveTimeoutMs, options.stderr);
    liveTools = live.toolsByServerKey;
    liveFindings = live.findings;
  }

  const rawResult = runScan(targets, activeRules, {
    cwd: options.cwd,
    ...(lock ? { lock } : {}),
    ...(liveTools ? { liveTools } : {}),
  });

  const combinedFindings = [...rawResult.findings, ...liveFindings];
  const result: ScanResult = baseline
    ? {
        targetsScanned: rawResult.targetsScanned,
        findings: applyBaseline(combinedFindings, baseline),
      }
    : { targetsScanned: rawResult.targetsScanned, findings: combinedFindings };

  options.stdout(formatResult(result, options.format));

  const hasFindingAtThreshold = result.findings.some((f) =>
    severityAtLeast(f.severity, options.failOn),
  );
  return hasFindingAtThreshold ? EXIT_CODES.findingsAtOrAboveThreshold : EXIT_CODES.clean;
}

function formatResult(result: ScanResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'sarif':
      return formatSarif(result, [...ALL_RULES, ...ALL_TOOL_RULES]);
    case 'human':
      return formatHuman(result);
  }
}

/**
 * Connects to every stdio server across `targets`, runs the ToolRule
 * catalog against their real advertised tools, and surfaces per-server
 * failures (bad command, timeout, unsupported transport) as warnings rather
 * than aborting the scan — one misbehaving server must never hide findings
 * from every other server that responded fine.
 */
async function runLiveScan(
  targets: readonly ScanTarget[],
  activeToolRules: typeof ALL_TOOL_RULES,
  timeoutMs: number | undefined,
  stderr: (line: string) => void,
) {
  const { allTools, toolsByServerKey, warnings } = await runLiveIntrospection(targets, {
    timeoutMs: timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS,
  });
  for (const warning of warnings) {
    stderr(pc.yellow(`⚠ ${warning}`));
  }
  return { findings: runToolRules(allTools, activeToolRules), toolsByServerKey };
}
