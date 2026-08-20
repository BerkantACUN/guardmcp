import { appendFileSync, writeFileSync } from 'node:fs';
import { runScanCommand } from '../src/cli/commands/scan.js';
import { EXIT_CODES } from '../src/cli/exit-codes.js';
import type { Severity } from '../src/core/severity.js';
import { SEVERITY_ORDER } from '../src/core/severity.js';
import { discoverGlobalConfigPaths } from '../src/discovery/index.js';

/**
 * GitHub Action entrypoint (`using: node20`, see action.yml). Deliberately
 * hand-rolled input/output handling instead of pulling in @actions/core —
 * reading INPUT_* env vars and appending to $GITHUB_OUTPUT is a handful of
 * lines, and the action bundle stays small. `runScanCommand` is the same
 * function the CLI uses; this file is a thin adapter around it, not a
 * parallel implementation.
 */

function getInput(name: string, defaultValue = ''): string {
  const envKey = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
  return process.env[envKey]?.trim() || defaultValue;
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, `${name}=${value}\n`);
}

function splitList(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseSeverity(value: string): Severity {
  if ((SEVERITY_ORDER as readonly string[]).includes(value)) return value as Severity;
  throw new Error(
    `Invalid fail-on input "${value}". Expected one of: ${SEVERITY_ORDER.join(', ')}`,
  );
}

async function run(): Promise<void> {
  const paths = splitList(getInput('paths'));
  const failOn = parseSeverity(getInput('fail-on', 'high'));
  const sarifPath = getInput('sarif-output', 'guardmcp-results.sarif');
  const only = splitList(getInput('rules'));
  const ignore = splitList(getInput('ignore-rule'));
  const workingDirectory = getInput('working-directory', process.cwd());

  let report = '';
  const exitCode = await runScanCommand({
    paths,
    failOn,
    format: 'sarif',
    cwd: workingDirectory,
    globalConfigPaths: paths.length === 0 ? discoverGlobalConfigPaths() : [],
    stdout: (r) => {
      report = r;
    },
    stderr: (line) => console.error(line),
    ...(only.length > 0 ? { only } : {}),
    ...(ignore.length > 0 ? { ignore } : {}),
  });

  writeFileSync(sarifPath, report, 'utf-8');
  setOutput('sarif-path', sarifPath);
  setOutput('exit-code', String(exitCode));

  if (exitCode === EXIT_CODES.findingsAtOrAboveThreshold) {
    console.log(
      `::error::guardmcp found issues at or above severity "${failOn}" — see ${sarifPath}`,
    );
    process.exitCode = 1;
  } else if (exitCode !== EXIT_CODES.clean) {
    console.log(`::error::guardmcp failed to run (exit code ${exitCode})`);
    process.exitCode = exitCode;
  } else {
    console.log('guardmcp: no findings at or above the configured severity threshold.');
  }
}

run().catch((err: unknown) => {
  console.log(
    `::error::guardmcp action crashed: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
