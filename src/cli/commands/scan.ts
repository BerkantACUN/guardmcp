import pc from 'picocolors';
import { runScan } from '../../core/engine.js';
import { type Severity, severityAtLeast } from '../../core/severity.js';
import { discoverProjectConfigPaths, loadScanTarget } from '../../discovery/index.js';
import type { ScanTarget } from '../../model/scan-target.js';
import { formatHuman } from '../../report/formatters/human.js';
import { ALL_RULES } from '../../rules/registry.js';
import { EXIT_CODES } from '../exit-codes.js';

export interface ScanCommandOptions {
  readonly paths: readonly string[];
  readonly failOn: Severity;
  readonly cwd: string;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export async function runScanCommand(options: ScanCommandOptions): Promise<number> {
  const explicitPaths = options.paths.length > 0;
  const candidatePaths = explicitPaths
    ? [...options.paths]
    : discoverProjectConfigPaths(options.cwd);

  if (candidatePaths.length === 0) {
    options.stdout(`No MCP config files found under ${options.cwd}.`);
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

  const result = runScan(targets, ALL_RULES, { cwd: options.cwd });
  options.stdout(formatHuman(result));

  const hasFindingAtThreshold = result.findings.some((f) =>
    severityAtLeast(f.severity, options.failOn),
  );
  return hasFindingAtThreshold ? EXIT_CODES.findingsAtOrAboveThreshold : EXIT_CODES.clean;
}

function describeLoadError(err: unknown): string {
  // ScanTargetLoadError IS an Error and already formats its own .message in
  // its constructor, so a dedicated branch for it would just be dead code
  // duplicating this one.
  return err instanceof Error ? err.message : String(err);
}
