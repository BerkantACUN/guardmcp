import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Exercises the BUILT GitHub Action bundle (dist/action/index.js) as a real
// subprocess with the INPUT_*/GITHUB_OUTPUT env var contract the Actions
// runner actually uses — same rationale as tests/integration/cli.test.ts:
// this is the only layer that would catch a bundling-specific bug (see the
// package-info.ts incident from Phase 2, and the cross-spawn/"Dynamic
// require" incident from Phase 3 — noExternal bundling @modelcontextprotocol/
// sdk broke in a way only a real `--live` run against the built bundle
// could catch; a unit test importing runScanCommand in-process never would).

const execFileAsync = promisify(execFile);
const actionPath = fileURLToPath(new URL('../../dist/action/index.js', import.meta.url));
const FIXTURES = fileURLToPath(new URL('../fixtures/configs', import.meta.url));
const FIXTURE_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);

let outputsFile: string;
let sarifFile: string;
let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'guardmcp-action-'));
  outputsFile = join(workDir, 'github-output.txt');
  sarifFile = join(workDir, 'results.sarif');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface RunResult {
  readonly exitCode: number;
  readonly stderr: string;
}

async function runAction(env: Record<string, string>): Promise<RunResult> {
  try {
    const { stderr } = await execFileAsync(process.execPath, [actionPath], {
      env: { ...process.env, GITHUB_OUTPUT: outputsFile, INPUT_SARIF_OUTPUT: sarifFile, ...env },
    });
    return { exitCode: 0, stderr };
  } catch (err) {
    const e = err as { code?: number; stderr?: string };
    return { exitCode: e.code ?? 1, stderr: e.stderr ?? '' };
  }
}

describe('GitHub Action bundle (dist/action/index.js)', () => {
  it('exits 1 and writes a valid SARIF report when a finding is at/above the threshold', async () => {
    const result = await runAction({
      INPUT_PATHS: `${FIXTURES}/malicious/leaked-github-token.json`,
      INPUT_FAIL_ON: 'high',
    });

    expect(result.exitCode).toBe(1);
    const sarif = JSON.parse(readFileSync(sarifFile, 'utf-8'));
    expect(sarif.runs[0].results[0].ruleId).toBe('MCPG-101');

    const outputs = readFileSync(outputsFile, 'utf-8');
    expect(outputs).toContain(`sarif-path=${sarifFile}`);
    expect(outputs).toContain('exit-code=1');
  });

  it('exits 0 on a benign config', async () => {
    const result = await runAction({
      INPUT_PATHS: `${FIXTURES}/benign/no-env.json`,
      INPUT_FAIL_ON: 'high',
    });
    expect(result.exitCode).toBe(0);

    const sarif = JSON.parse(readFileSync(sarifFile, 'utf-8'));
    expect(sarif.runs[0].results).toEqual([]);
  });

  it('respects the ignore-rule input', async () => {
    const result = await runAction({
      INPUT_PATHS: `${FIXTURES}/malicious/leaked-github-token.json`,
      INPUT_FAIL_ON: 'high',
      INPUT_IGNORE_RULE: 'MCPG-101',
    });
    // Only MCPG-105 (unpinned package, medium) remains, below the "high" threshold.
    expect(result.exitCode).toBe(0);
  });

  it('live: <true> actually spawns a real MCP server and scans its live tools (proves the bundle can spawn a child process)', async () => {
    const configPath = join(workDir, '.mcp.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: {
          fixture: {
            command: process.execPath,
            args: [FIXTURE_SERVER],
            env: { FIXTURE_TOOLS: 'poisoned' },
          },
        },
      }),
    );

    const result = await runAction({
      INPUT_PATHS: configPath,
      INPUT_FAIL_ON: 'high',
      INPUT_LIVE: 'true',
    });

    expect(result.exitCode).toBe(1);
    const sarif = JSON.parse(readFileSync(sarifFile, 'utf-8'));
    expect(sarif.runs[0].results.some((r: { ruleId: string }) => r.ruleId === 'MCPG-201')).toBe(
      true,
    );
  }, 15_000);
});
