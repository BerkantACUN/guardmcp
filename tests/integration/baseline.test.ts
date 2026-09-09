import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * The full adoption loop, against the built CLI: a repository with existing
 * findings records them, then scans clean, then still catches a new one.
 *
 * That loop is the whole reason the command exists. `--baseline` could read a
 * file since the first release and nothing could write one — fingerprints are
 * not printed anywhere either — so the flag was documented, wired, and
 * unusable.
 */
const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
  }
}

let dir: string;
let configPath: string;
let baselinePath: string;

const LEAKY = {
  mcpServers: {
    github: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8' },
    },
  },
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-baseline-cmd-'));
  configPath = join(dir, '.mcp.json');
  baselinePath = join(dir, '.mcpguard-baseline.json');
  writeFileSync(configPath, JSON.stringify(LEAKY, null, 2));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('guardmcp baseline', () => {
  it('records the findings a scan currently reports', async () => {
    const scan = await runCli(['scan', configPath, '--format', 'json']);
    const scanned = JSON.parse(scan.stdout).findings as { fingerprint: string }[];
    expect(scanned.length).toBeGreaterThan(0);

    const result = await runCli(['baseline', configPath, '--output', baselinePath]);
    expect(result.exitCode).toBe(0);

    const written = JSON.parse(readFileSync(baselinePath, 'utf-8'));
    expect(written.entries.map((e: { fingerprint: string }) => e.fingerprint).sort()).toEqual(
      scanned.map((f) => f.fingerprint).sort(),
    );
  });

  it('exits clean even though the findings it recorded are critical', async () => {
    // Recording is not failing. A command that exits non-zero here cannot be
    // the first step of adopting the scanner in CI.
    const result = await runCli(['baseline', configPath, '--output', baselinePath]);
    expect(result.exitCode).toBe(0);
  });

  it('says what it recorded rather than printing a report', async () => {
    const result = await runCli(['baseline', configPath, '--output', baselinePath]);
    expect(result.stdout).toMatch(/recorded/i);
    expect(result.stdout).toMatch(/\d+/);
  });

  it('suppresses exactly what it recorded on the next scan', async () => {
    await runCli(['baseline', configPath, '--output', baselinePath]);

    const after = await runCli([
      'scan',
      configPath,
      '--baseline',
      baselinePath,
      '--format',
      'json',
    ]);
    expect(JSON.parse(after.stdout).findings).toEqual([]);
    expect(after.exitCode).toBe(0);
  });

  it('still catches a finding introduced after the baseline was taken', async () => {
    await runCli(['baseline', configPath, '--output', baselinePath]);

    writeFileSync(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            ...LEAKY.mcpServers,
            other: {
              command: 'npx',
              args: ['-y', 'some-server'],
              env: { SLACK_BOT_TOKEN: 'xoxb-111111111111-222222222222-AbCdEfGhIjKlMnOpQrStUvWx' },
            },
          },
        },
        null,
        2,
      ),
    );

    const after = await runCli([
      'scan',
      configPath,
      '--baseline',
      baselinePath,
      '--format',
      'json',
    ]);
    const findings = JSON.parse(after.stdout).findings as { logicalPath: string }[];

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((f) => f.logicalPath.includes('/other/'))).toBe(true);
  });

  it('refuses to overwrite an existing baseline without --force', async () => {
    writeFileSync(baselinePath, JSON.stringify({ version: '1', entries: [] }));

    const result = await runCli(['baseline', configPath, '--output', baselinePath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toMatch(/--force/);
    // The point of refusing: a curated list of accepted risks must not be
    // replaced by accident.
    expect(JSON.parse(readFileSync(baselinePath, 'utf-8')).entries).toEqual([]);
  });

  it('overwrites when --force is given', async () => {
    writeFileSync(baselinePath, JSON.stringify({ version: '1', entries: [] }));

    const result = await runCli(['baseline', configPath, '--output', baselinePath, '--force']);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(readFileSync(baselinePath, 'utf-8')).entries.length).toBeGreaterThan(0);
  });

  it('writes nothing when there is nothing to record', async () => {
    writeFileSync(configPath, JSON.stringify({ mcpServers: {} }));

    const result = await runCli(['baseline', configPath, '--output', baselinePath]);

    expect(result.exitCode).toBe(0);
    // An empty baseline file is noise in a repository, and committing one
    // implies a triage that never happened.
    expect(existsSync(baselinePath)).toBe(false);
    expect(result.stdout).toMatch(/nothing/i);
  });
});
