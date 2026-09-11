import { existsSync, writeFileSync } from 'node:fs';
import pc from 'picocolors';
import { buildBaseline, serializeBaseline } from '../../baseline/build.js';
import { applyBaseline, loadBaseline } from '../../baseline/lockfile.js';
import { runScan, type ScanResult } from '../../core/engine.js';
import type { Finding } from '../../core/finding.js';
import { filterRules } from '../../core/rule-filter.js';
import { type Severity, severityAtLeast } from '../../core/severity.js';
import { resolveScanTargets } from '../../discovery/resolve-targets.js';
import { DEFAULT_LIVE_TIMEOUT_MS } from '../../live/introspect.js';
import {
  runLiveIntrospection,
  runPromptRules,
  runResourceRules,
  runToolRules,
} from '../../live/scan-live.js';
import type { ScanTarget } from '../../model/scan-target.js';
import type { ToolDefinition } from '../../model/tool-definition.js';
import { loadLockFile } from '../../pin/io.js';
import type { LockFile } from '../../pin/lockfile-schema.js';
import { lookupRegistry } from '../../registry/collect.js';
import type { PackageStatus } from '../../registry/npm.js';
import { formatHuman } from '../../report/formatters/human.js';
import { formatJson } from '../../report/formatters/json.js';
import { formatSarif } from '../../report/formatters/sarif.js';
import { ALL_PROMPT_RULES } from '../../rules/prompt-registry.js';
import { ALL_RULES } from '../../rules/registry.js';
import { ALL_RESOURCE_RULES } from '../../rules/resource-registry.js';
import { unboundedResourceTemplateRule } from '../../rules/resources/unbounded-template.js';
import { ALL_TOOL_RULES } from '../../rules/tool-registry.js';
import { EXIT_CODES } from '../exit-codes.js';

const ALL_KNOWN_RULE_IDS = new Set(
  [
    ...ALL_RULES,
    ...ALL_TOOL_RULES,
    ...ALL_PROMPT_RULES,
    ...ALL_RESOURCE_RULES,
    unboundedResourceTemplateRule,
  ].map((r) => r.id),
);

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
   * Record this scan's findings as a baseline at this path instead of
   * reporting them (`guardmcp baseline`). Deliberately a mode of the scan
   * rather than a second implementation: a baseline built from any other
   * code path could suppress a different set of findings than the scan
   * produces, and the failure would be silent.
   */
  readonly writeBaselinePath?: string;
  /** Overwrite an existing baseline file (--force). */
  readonly force?: boolean;
  /**
   * Ask the npm registry about every package the scanned configs launch, so
   * MCPG-106 can report the deprecated ones (--registry). Opt-in because it
   * is a network request per package and reveals which packages you run to
   * the registry — which already knows, since it served them, but the scan
   * should not be the thing that phones home without being told to.
   */
  readonly registry?: boolean;
  /** Injectable for tests, which must never reach the real registry. */
  readonly registryFetch?: typeof fetch;
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
  /** See live/connect-policy.ts — off by default on purpose. */
  readonly allowUnsafeRemote?: boolean;
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
  let activePromptRules: typeof ALL_PROMPT_RULES;
  let activeResourceRules: typeof ALL_RESOURCE_RULES;
  try {
    const filterOptions = {
      only: options.only ?? [],
      ignore: options.ignore ?? [],
      // Validated against the UNION of all three catalogs — a `--rules`
      // value naming a ToolRule (MCPG-2xx/3xx) or a PromptRule (MCPG-205/206)
      // must not be reported "unknown" just because this particular
      // filterRules() call only sees the file-based catalog, and vice versa.
      knownIds: ALL_KNOWN_RULE_IDS,
    };
    activeRules = filterRules(ALL_RULES, filterOptions);
    activeToolRules = filterRules(ALL_TOOL_RULES, filterOptions);
    activePromptRules = filterRules(ALL_PROMPT_RULES, filterOptions);
    activeResourceRules = filterRules(ALL_RESOURCE_RULES, filterOptions);
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
  let liveCapabilities:
    | Awaited<ReturnType<typeof runLiveIntrospection>>['capabilitiesByServerKey']
    | undefined;
  let liveFindings: ReturnType<typeof runToolRules> = [];
  if (options.live) {
    const live = await runLiveScan(
      targets,
      activeToolRules,
      activePromptRules,
      activeResourceRules,
      options.liveTimeoutMs,
      options.allowUnsafeRemote === true,
      options.stderr,
    );
    liveTools = live.toolsByServerKey;
    liveCapabilities = live.capabilitiesByServerKey;
    liveFindings = live.findings;
  }

  let registry: ReadonlyMap<string, PackageStatus> | undefined;
  if (options.registry) {
    const lookup = await lookupRegistry(targets, options.registryFetch);
    registry = lookup.statuses;
    // Unresolved is not silent: a package the registry could not answer for
    // is a package this scan did not check, and the user should know that
    // rather than read "no findings" as "all clear".
    if (lookup.unresolved.length > 0) {
      options.stderr(
        pc.yellow(
          `⚠ --registry: could not look up ${lookup.unresolved.length} package(s), so MCPG-106 did not check them: ${lookup.unresolved.join(', ')}`,
        ),
      );
    }
    options.stderr(pc.dim(`ℹ --registry: checked ${registry.size} package(s) against npm.`));
  }

  // The reviewed set: every server the project's own configs declare. Built
  // here because this is the only layer that sees all targets at once —
  // a rule only ever gets one. MCPG-601 compares machine-wide servers
  // against it and stays silent when it is empty.
  const projectServers = new Set<string>(
    targets
      .filter((target) => target.scope === 'project')
      .flatMap((target) => Object.keys(target.config.mcpServers ?? {})),
  );

  const rawResult = runScan(targets, activeRules, {
    cwd: options.cwd,
    ...(lock ? { lock } : {}),
    ...(liveTools ? { liveTools } : {}),
    ...(liveCapabilities ? { capabilitiesByServerKey: liveCapabilities } : {}),
    ...(projectServers.size > 0 ? { projectServers } : {}),
    ...(registry ? { registry } : {}),
  });

  const combinedFindings = [...rawResult.findings, ...liveFindings];

  if (options.writeBaselinePath) {
    return writeBaselineFile(options.writeBaselinePath, combinedFindings, options);
  }

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

/**
 * Records the findings as accepted, so CI can gate on new ones only.
 *
 * Exits clean whatever it recorded: this is the first step of adopting the
 * scanner on a repository that already has findings, and a non-zero exit
 * would make that first step fail.
 */
function writeBaselineFile(
  path: string,
  findings: readonly Finding[],
  options: Pick<ScanCommandOptions, 'force' | 'stdout' | 'stderr'>,
): number {
  if (findings.length === 0) {
    // An empty baseline in a repository implies a triage that never happened,
    // and it is one more file to keep in sync for no benefit.
    options.stdout('Nothing to record — this scan found no findings.');
    return EXIT_CODES.clean;
  }

  if (existsSync(path) && options.force !== true) {
    options.stderr(
      pc.red(
        `A baseline already exists at ${path}. It is a reviewed list of accepted risks, so it is not replaced by accident — pass --force to overwrite it.`,
      ),
    );
    return EXIT_CODES.toolError;
  }

  const baseline = buildBaseline(findings);
  writeFileSync(path, serializeBaseline(baseline), 'utf-8');

  const bySeverity = new Map<string, number>();
  for (const entry of baseline.entries) {
    bySeverity.set(entry.severity, (bySeverity.get(entry.severity) ?? 0) + 1);
  }
  const breakdown = [...bySeverity.entries()]
    .map(([severity, count]) => `${count} ${severity}`)
    .join(', ');

  options.stdout(
    `Recorded ${baseline.entries.length} finding(s) as accepted in ${path} (${breakdown}).
` +
      `Scan with --baseline ${path} to report only findings added after this point.
` +
      pc.yellow('Review the file before committing it — every entry is a risk being accepted.'),
  );
  return EXIT_CODES.clean;
}

function formatResult(result: ScanResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return formatJson(result);
    case 'sarif':
      return formatSarif(result, [
        ...ALL_RULES,
        ...ALL_TOOL_RULES,
        ...ALL_PROMPT_RULES,
        ...ALL_RESOURCE_RULES,
        unboundedResourceTemplateRule,
      ]);
    case 'human':
      return formatHuman(result);
  }
}

/**
 * Connects to every stdio server across `targets`, runs the tool, prompt and
 * resource rule catalogs against what each one really advertises, and
 * surfaces per-server
 * failures (bad command, timeout, unsupported transport) as warnings rather
 * than aborting the scan — one misbehaving server must never hide findings
 * from every other server that responded fine.
 */
async function runLiveScan(
  targets: readonly ScanTarget[],
  activeToolRules: typeof ALL_TOOL_RULES,
  activePromptRules: typeof ALL_PROMPT_RULES,
  activeResourceRules: typeof ALL_RESOURCE_RULES,
  timeoutMs: number | undefined,
  allowUnsafeRemote: boolean,
  stderr: (line: string) => void,
) {
  const {
    allTools,
    allPrompts,
    allResources,
    allResourceTemplates,
    capabilitiesByServerKey,
    toolsByServerKey,
    warnings,
    serversAttempted,
  } = await runLiveIntrospection(targets, {
    timeoutMs: timeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS,
    ...(allowUnsafeRemote ? { allowUnsafeRemote: true } : {}),
  });
  // Printed unconditionally, success or failure — SECURITY.md promises a
  // user can always see that --live actually connected out to real
  // processes, not just when something went wrong.
  stderr(pc.dim(`ℹ --live: connected to ${toolsByServerKey.size}/${serversAttempted} server(s).`));
  for (const warning of warnings) {
    stderr(pc.yellow(`⚠ ${warning}`));
  }
  return {
    findings: [
      ...runToolRules(allTools, activeToolRules),
      ...runPromptRules(allPrompts, activePromptRules),
      ...runResourceRules(allResources, activeResourceRules),
      ...allResourceTemplates.flatMap((t) => unboundedResourceTemplateRule.check(t)),
    ],
    toolsByServerKey,
    capabilitiesByServerKey,
  };
}
