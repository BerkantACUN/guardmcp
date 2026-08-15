import pc from 'picocolors';
import { applyBaseline, loadBaseline } from '../../baseline/lockfile.js';
import { runScan, type ScanResult } from '../../core/engine.js';
import { filterRules } from '../../core/rule-filter.js';
import { type Severity, severityAtLeast } from '../../core/severity.js';
import { discoverProjectConfigPaths, loadScanTarget } from '../../discovery/index.js';
import type { ScanTarget } from '../../model/scan-target.js';
import { formatHuman } from '../../report/formatters/human.js';
import { formatJson } from '../../report/formatters/json.js';
import { formatSarif } from '../../report/formatters/sarif.js';
import { ALL_RULES } from '../../rules/registry.js';
import { EXIT_CODES } from '../exit-codes.js';

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
  readonly stdout: (report: string) => void;
  readonly stderr: (line: string) => void;
}

export async function runScanCommand(options: ScanCommandOptions): Promise<number> {
  let activeRules: typeof ALL_RULES;
  try {
    activeRules = filterRules(ALL_RULES, {
      only: options.only ?? [],
      ignore: options.ignore ?? [],
    });
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

  const explicitPaths = options.paths.length > 0;
  const candidatePaths = explicitPaths
    ? [...options.paths]
    : discoverProjectConfigPaths(options.cwd);

  if (candidatePaths.length === 0) {
    // Still a valid (empty) report in whatever format was requested — a
    // JSON/SARIF consumer parsing stdout should never receive a plain
    // English sentence instead of the format it asked for.
    options.stdout(formatResult({ targetsScanned: 0, findings: [] }, options.format));
    return EXIT_CODES.clean;
  }

  const targets: ScanTarget[] = [];
  for (const path of candidatePaths) {
    try {
      targets.push(loadScanTarget(path, options.cwd));
    } catch (err) {
      options.stderr(pc.yellow(`⚠ ${describeLoadError(err)}`));
    }
  }

  if (targets.length === 0) {
    options.stderr(pc.red('No MCP config file could be loaded — see warnings above.'));
    return EXIT_CODES.toolError;
  }

  const rawResult = runScan(targets, activeRules, { cwd: options.cwd });
  const result: ScanResult = baseline
    ? {
        targetsScanned: rawResult.targetsScanned,
        findings: applyBaseline(rawResult.findings, baseline),
      }
    : rawResult;

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
      return formatSarif(result, ALL_RULES);
    case 'human':
      return formatHuman(result);
  }
}

function describeLoadError(err: unknown): string {
  // ScanTargetLoadError IS an Error and already formats its own .message in
  // its constructor, so a dedicated branch for it would just be dead code
  // duplicating this one.
  return err instanceof Error ? err.message : String(err);
}
