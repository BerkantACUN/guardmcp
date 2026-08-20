import pc from 'picocolors';
import { resolveScanTargets } from '../../discovery/resolve-targets.js';
import { DEFAULT_LIVE_TIMEOUT_MS } from '../../live/introspect.js';
import { runLiveIntrospection } from '../../live/scan-live.js';
import { buildLockFile } from '../../pin/build-lock.js';
import { writeLockFile } from '../../pin/io.js';
import { EXIT_CODES } from '../exit-codes.js';

export interface PinCommandOptions {
  readonly paths: readonly string[];
  readonly cwd: string;
  /** Where to write the lock file (--output). Defaults to .mcpguard-lock.json handled by the CLI wiring layer. */
  readonly outputPath: string;
  /** Also connect to every stdio server and pin its real tool list — enables MCPG-502 (live tool drift) later, not just MCPG-501 (config drift). */
  readonly live?: boolean;
  readonly liveTimeoutMs?: number;
  /** Same rationale as ScanCommandOptions.globalConfigPaths — see scan.ts. */
  readonly globalConfigPaths?: readonly string[];
  /** Injectable clock, purely for deterministic tests — see tests/unit/cli/commands/pin.test.ts. */
  readonly now?: () => Date;
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export async function runPinCommand(options: PinCommandOptions): Promise<number> {
  const { targets, warnings, hadCandidates } = resolveScanTargets(
    options.paths,
    options.cwd,
    options.globalConfigPaths ?? [],
  );
  for (const warning of warnings) {
    options.stderr(pc.yellow(`⚠ ${warning}`));
  }

  if (!hadCandidates) {
    options.stderr(pc.yellow('No MCP config found to pin.'));
    return EXIT_CODES.clean;
  }
  if (targets.length === 0) {
    options.stderr(pc.red('No MCP config file could be loaded — see warnings above.'));
    return EXIT_CODES.toolError;
  }

  let liveToolsByServerKey:
    | Awaited<ReturnType<typeof runLiveIntrospection>>['toolsByServerKey']
    | undefined;
  if (options.live) {
    const timeoutMs = options.liveTimeoutMs ?? DEFAULT_LIVE_TIMEOUT_MS;
    const live = await runLiveIntrospection(targets, { timeoutMs });
    // Printed unconditionally, success or failure — same transparency
    // guarantee as `scan --live` (see SECURITY.md).
    options.stderr(
      pc.dim(
        `ℹ --live: connected to ${live.toolsByServerKey.size}/${live.serversAttempted} stdio server(s).`,
      ),
    );
    for (const warning of live.warnings) {
      options.stderr(pc.yellow(`⚠ ${warning}`));
    }
    liveToolsByServerKey = live.toolsByServerKey;
  }

  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const lock = buildLockFile(targets, liveToolsByServerKey, generatedAt);
  writeLockFile(options.outputPath, lock);

  const serverCount = Object.keys(lock.servers).length;
  const liveCount = Object.values(lock.servers).filter((s) => s.toolsHash !== undefined).length;
  const liveNote = options.live ? `, ${liveCount} with live tool hashes` : '';
  options.stdout(pc.green(`✔ Pinned ${serverCount} server(s)${liveNote} to ${options.outputPath}`));
  return EXIT_CODES.clean;
}
