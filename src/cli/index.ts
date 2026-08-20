import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import type { Severity } from '../core/severity.js';
import { discoverGlobalConfigPaths } from '../discovery/index.js';
import { PACKAGE_DESCRIPTION, PACKAGE_NAME, PACKAGE_VERSION } from '../package-info.js';
import { type OutputFormat, runScanCommand } from './commands/scan.js';

const SEVERITIES: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
const FORMATS: readonly OutputFormat[] = ['human', 'json', 'sarif'];

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
        },
      ) => {
        const failOn = parseChoice('--fail-on', opts.failOn, SEVERITIES);
        const format = parseChoice('--format', opts.format, FORMATS);
        const only = splitIds(opts.rules);
        const ignore = splitIds(opts.ignoreRule);
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
        });
        process.exitCode = exitCode;
      },
    );

  // Subcommands (pin, verify, rules, init) land in later phases.

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
