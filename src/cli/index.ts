import { existsSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import type { Severity } from '../core/severity.js';
import { discoverGlobalConfigPaths } from '../discovery/index.js';
import { PACKAGE_DESCRIPTION, PACKAGE_NAME, PACKAGE_VERSION } from '../package-info.js';
import { defaultLockFilePath } from '../pin/io.js';
import { runInitCommand } from './commands/init.js';
import { type InventoryFormat, runInventoryCommand } from './commands/inventory.js';
import { runPinCommand } from './commands/pin.js';
import { type OutputFormat, runScanCommand } from './commands/scan.js';
import { parsePositiveInt } from './parse-positive-int.js';

const SEVERITIES: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
const FORMATS: readonly OutputFormat[] = ['human', 'json', 'sarif'];
const INVENTORY_FORMATS: readonly InventoryFormat[] = ['human', 'json'];

export function createCli(): Command {
  const program = new Command();

  program
    .name(PACKAGE_NAME)
    .description(PACKAGE_DESCRIPTION)
    .version(PACKAGE_VERSION, '-v, --version', 'output the current version');

  program
    .command('scan')
    .description(
      'Scan MCP server configs for security issues. With no [paths], auto-discovers project-level (.mcp.json, .vscode/mcp.json) and global (Claude Desktop, Cursor, Windsurf) configs.',
    )
    .argument('[paths...]', 'specific config file(s) to scan; omit to auto-discover')
    .option(
      '--fail-on <severity>',
      `minimum severity that causes a non-zero exit (${SEVERITIES.join('|')})`,
      'high',
    )
    .option('--format <format>', `output format (${FORMATS.join('|')})`, 'human')
    .option('-o, --output <file>', 'write the report to a file instead of stdout')
    .option('--rules <ids>', 'comma-separated rule IDs to run exclusively (default: all)')
    .option('--ignore-rule <ids>', 'comma-separated rule IDs to skip')
    .option(
      '--baseline <file>',
      'suppress findings whose fingerprint appears in this baseline file',
    )
    .option(
      '--lock <file>',
      'path to a .mcpguard-lock.json (see `guardmcp pin`) enabling rug-pull drift detection (MCPG-501/502). Defaults to .mcpguard-lock.json in the current directory, if present.',
    )
    .option(
      '--live',
      "connect to every stdio-launched server and scan its real advertised tools (MCPG-2xx/3xx), not just the config file. Opt-in — spawns each server's launch command locally.",
    )
    .option('--live-timeout <ms>', 'per-server timeout for --live introspection', '10000')
    .option(
      '--live-allow-unsafe',
      'dial remote endpoints --live would otherwise refuse: private/cloud-metadata addresses, and cleartext http:// carrying credentials. guardmcp declines these by default so it never performs the request MCPG-401/403 exist to warn about.',
    )
    .action(
      async (
        paths: string[],
        opts: {
          failOn: string;
          format: string;
          output?: string;
          rules?: string;
          ignoreRule?: string;
          baseline?: string;
          lock?: string;
          live?: boolean;
          liveTimeout: string;
          liveAllowUnsafe?: boolean;
        },
      ) => {
        const failOn = parseChoice('--fail-on', opts.failOn, SEVERITIES);
        const format = parseChoice('--format', opts.format, FORMATS);
        const only = splitIds(opts.rules);
        const ignore = splitIds(opts.ignoreRule);
        const liveTimeoutMs = parsePositiveInt('--live-timeout', opts.liveTimeout);
        // No --lock given: silently use .mcpguard-lock.json in cwd IF it
        // exists — same zero-friction philosophy as config auto-discovery.
        // An explicit --lock pointing at a missing file is a real error
        // (surfaced inside runScanCommand); a missing DEFAULT is not.
        const defaultLock = defaultLockFilePath(process.cwd());
        const lockPath = opts.lock ?? (existsSync(defaultLock) ? defaultLock : undefined);
        // exactOptionalPropertyTypes forbids `only: undefined` — the key
        // must be absent entirely when there's no value, not present-with-undefined.
        const exitCode = await runScanCommand({
          paths,
          failOn,
          format,
          cwd: process.cwd(),
          globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
          stdout: (report) => writeReport(report, opts.output),
          stderr: (line) => console.error(line),
          ...(only ? { only } : {}),
          ...(ignore ? { ignore } : {}),
          ...(opts.baseline ? { baselinePath: opts.baseline } : {}),
          ...(lockPath ? { lockPath } : {}),
          ...(opts.live
            ? {
                live: true,
                liveTimeoutMs,
                ...(opts.liveAllowUnsafe ? { allowUnsafeRemote: true } : {}),
              }
            : {}),
        });
        process.exitCode = exitCode;
      },
    );

  program
    .command('inventory')
    .description(
      'List the MCP servers configured on this machine and, with --live, the tools, prompts and resources each one actually advertises. Reports what you have; use `scan` to find what is wrong with it.',
    )
    .argument('[paths...]', 'specific config file(s); omit to auto-discover')
    .option('--format <format>', `output format (${INVENTORY_FORMATS.join('|')})`, 'human')
    .option(
      '--live',
      "connect to every stdio-launched server and list its real tools, prompts and resources. Opt-in — spawns each server's launch command locally.",
    )
    .option('--live-timeout <ms>', 'per-server timeout for --live introspection', '10000')
    .option(
      '--live-allow-unsafe',
      'dial remote endpoints --live would otherwise refuse: private/cloud-metadata addresses, and cleartext http:// carrying credentials. guardmcp declines these by default so it never performs the request MCPG-401/403 exist to warn about.',
    )
    .action(
      async (
        paths: string[],
        opts: { format: string; live?: boolean; liveTimeout: string; liveAllowUnsafe?: boolean },
      ) => {
        const format = parseChoice('--format', opts.format, INVENTORY_FORMATS);
        const liveTimeoutMs = parsePositiveInt('--live-timeout', opts.liveTimeout);
        const code = await runInventoryCommand({
          paths,
          cwd: process.cwd(),
          format,
          ...(opts.live
            ? {
                live: true,
                liveTimeoutMs,
                ...(opts.liveAllowUnsafe ? { allowUnsafeRemote: true } : {}),
              }
            : {}),
          globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
          stdout: (text) => process.stdout.write(text),
          stderr: (line) => console.error(line),
        });
        process.exitCode = code;
      },
    );

  program
    .command('init')
    .description(
      'Write a GitHub Actions workflow that scans this repository on every push and pull request and uploads the results to Code Scanning.',
    )
    .option(
      '--fail-on <severity>',
      `severity that fails the build (${SEVERITIES.join('|')})`,
      'high',
    )
    .option('--force', 'overwrite an existing workflow file')
    .action((opts: { failOn: string; force?: boolean }) => {
      const failOn = parseChoice('--fail-on', opts.failOn, SEVERITIES);
      process.exitCode = runInitCommand({
        cwd: process.cwd(),
        failOn,
        ...(opts.force ? { force: true } : {}),
        stdout: (text) => process.stdout.write(text),
        stderr: (line) => console.error(line),
      });
    });

  program
    .command('pin')
    .description(
      'Snapshot the current MCP server definitions (and, with --live, their real tool list) into .mcpguard-lock.json. A later `scan` flags any drift as a possible rug-pull (MCPG-501/502).',
    )
    .argument('[paths...]', 'specific config file(s) to pin; omit to auto-discover')
    .option(
      '--live',
      'also connect to every stdio server and pin its real tool list, not just the config',
    )
    .option('--live-timeout <ms>', 'per-server timeout for --live introspection', '10000')
    .option(
      '--live-allow-unsafe',
      'dial remote endpoints --live would otherwise refuse: private/cloud-metadata addresses, and cleartext http:// carrying credentials. guardmcp declines these by default so it never performs the request MCPG-401/403 exist to warn about.',
    )
    .option('-o, --output <file>', 'lock file path', '.mcpguard-lock.json')
    .action(
      async (
        paths: string[],
        opts: {
          live?: boolean;
          liveTimeout: string;
          liveAllowUnsafe?: boolean;
          output: string;
        },
      ) => {
        const liveTimeoutMs = parsePositiveInt('--live-timeout', opts.liveTimeout);
        const exitCode = await runPinCommand({
          paths,
          cwd: process.cwd(),
          outputPath: opts.output,
          globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
          stdout: (line) => console.log(line),
          stderr: (line) => console.error(line),
          ...(opts.live
            ? {
                live: true,
                liveTimeoutMs,
                ...(opts.liveAllowUnsafe ? { allowUnsafeRemote: true } : {}),
              }
            : {}),
        });
        process.exitCode = exitCode;
      },
    );

  // Subcommands (verify, rules, init) land in later phases.

  return program;
}

function writeReport(report: string, outputFile: string | undefined): void {
  if (outputFile) {
    writeFileSync(outputFile, `${report}\n`, 'utf-8');
  } else {
    console.log(report);
  }
}

function parseChoice<T extends string>(flag: string, value: string, allowed: readonly T[]): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${flag} value "${value}". Expected one of: ${allowed.join(', ')}`);
}

function splitIds(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

// Windows-safe "is this the entrypoint" check: comparing raw strings against
// `file://${process.argv[1]}` breaks on Windows (backslashes, missing host
// slash). pathToFileURL() normalizes both sides the same way.
/* c8 ignore start -- entrypoint wiring, exercised via integration/e2e, not unit coverage */
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  createCli().parse(process.argv);
}
/* c8 ignore stop */
