import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * A typo in a flag must read like a usage error, not like a crash — and it
 * must not exit 1.
 *
 * Exit 1 means "findings at or above the threshold". A CI pipeline that
 * treats 1 as a security failure would report a mistyped flag as a security
 * failure, which is both wrong and the kind of wrong that erodes trust in
 * every other exit code the tool produces.
 */
const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));

let dir: string;
let config: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-usage-'));
  config = join(dir, '.mcp.json');
  writeFileSync(
    config,
    JSON.stringify({ mcpServers: { a: { command: 'node', args: ['s.js'] } } }),
    'utf-8',
  );
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function run(args: readonly string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
      cwd: dir,
    });
    return { code: 0, output: stdout + stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, output: (e.stdout ?? '') + (e.stderr ?? '') };
  }
}

const STACK = /at Command\.|node:internal|Node\.js v\d/;

describe('CLI usage errors', () => {
  const cases: readonly (readonly [string, readonly string[]])[] = [
    ['scan --fail-on', ['scan', '.mcp.json', '--fail-on', 'bogus']],
    ['scan --format', ['scan', '.mcp.json', '--format', 'bogus']],
    ['scan --live-timeout non-numeric', ['scan', '.mcp.json', '--live-timeout', 'abc']],
    ['scan --live-timeout negative', ['scan', '.mcp.json', '--live-timeout', '-5']],
    ['scan --live-timeout zero', ['scan', '.mcp.json', '--live-timeout', '0']],
    ['inventory --format', ['inventory', '.mcp.json', '--format', 'bogus']],
    ['inventory --live-timeout', ['inventory', '.mcp.json', '--live-timeout', 'xyz']],
    ['pin --live-timeout', ['pin', '.mcp.json', '--live-timeout', 'abc']],
    ['init --fail-on', ['init', '--fail-on', 'bogus']],
  ];

  it.each(cases)('%s exits 2, not 1', async (_label, args) => {
    const { code } = await run(args);
    expect(code).toBe(2);
  });

  it.each(cases)('%s prints a message, not a stack trace', async (_label, args) => {
    const { output } = await run(args);
    expect(output).not.toMatch(STACK);
    expect(output).toMatch(/Invalid|Expected/i);
  });

  it('names the offending flag and the accepted values', async () => {
    const { output } = await run(['scan', '.mcp.json', '--fail-on', 'hgh']);
    expect(output).toContain('--fail-on');
    expect(output).toContain('hgh');
    expect(output).toContain('critical');
  });

  it('still exits 1 for real findings, so the contract is unchanged', async () => {
    writeFileSync(
      config,
      JSON.stringify({
        mcpServers: {
          a: {
            command: 'node',
            args: ['s.js'],
            env: { GITHUB_TOKEN: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          },
        },
      }),
      'utf-8',
    );
    const { code } = await run(['scan', '.mcp.json', '--fail-on', 'critical']);
    expect(code).toBe(1);
  });

  it('rejects an unknown id in --ignore-rule, the way --rules already does', async () => {
    // A silently ineffective suppression is worse than an error: the user
    // believes a rule is muted and it is not. `--rules NOPE` already errors;
    // this made the two consistent.
    const { code, output } = await run(['scan', '.mcp.json', '--ignore-rule', 'MCPG-999']);
    expect(code).toBe(2);
    expect(output).toContain('MCPG-999');
    expect(output).not.toMatch(STACK);
  });

  it('accepts a valid --ignore-rule', async () => {
    const { code } = await run(['scan', '.mcp.json', '--ignore-rule', 'MCPG-101']);
    expect(code).toBe(0);
  });
});
