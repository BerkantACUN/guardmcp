import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import type { Severity } from '../core/severity.js';
import { runScanCommand } from './commands/scan.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string; description: string };

const SEVERITIES: readonly Severity[] = ['info', 'low', 'medium', 'high', 'critical'];

export function createCli(): Command {
  const program = new Command();

  program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version, '-v, --version', 'output the current version');

  program
    .command('scan')
    .description(
      'Scan MCP server configs for security issues. With no [paths], auto-discovers project-level configs.',
    )
    .argument('[paths...]', 'specific config file(s) to scan; omit to auto-discover')
    .option(
      '--fail-on <severity>',
      `minimum severity that causes a non-zero exit (${SEVERITIES.join('|')})`,
      'high',
    )
    .action(async (paths: string[], opts: { failOn: string }) => {
      const failOn = parseSeverity(opts.failOn);
      const exitCode = await runScanCommand({
        paths,
        failOn,
        cwd: process.cwd(),
        stdout: (line) => console.log(line),
        stderr: (line) => console.error(line),
      });
      process.exitCode = exitCode;
    });

  // Subcommands (pin, verify, rules, init) land in later phases.

  return program;
}

function parseSeverity(value: string): Severity {
  if ((SEVERITIES as readonly string[]).includes(value)) return value as Severity;
  throw new Error(`Invalid --fail-on value "${value}". Expected one of: ${SEVERITIES.join(', ')}`);
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
