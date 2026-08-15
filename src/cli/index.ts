import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { name: string; version: string; description: string };

export function createCli(): Command {
  const program = new Command();

  program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version, '-v, --version', 'output the current version');

  // Subcommands (scan, pin, verify, rules, init) land in later phases.

  return program;
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
