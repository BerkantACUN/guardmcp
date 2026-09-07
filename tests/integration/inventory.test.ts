import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Exercises the built CLI as a real subprocess, same rationale as
// tests/integration/cli.test.ts: only a real spawn catches a bundling bug.
const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
const FIXTURE_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-inv-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function writeConfig(servers: Record<string, unknown>) {
  const path = join(dir, '.mcp.json');
  writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8');
  return path;
}

async function run(args: readonly string[]) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
    });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('guardmcp inventory (built CLI)', () => {
  it('lists configured servers and exits clean', async () => {
    const config = writeConfig({
      api: { command: 'node', args: [FIXTURE_SERVER] },
      remote: { type: 'http', url: 'https://api.example.com/mcp' },
    });

    const { code, stdout } = await run(['inventory', config]);

    expect(code).toBe(0);
    expect(stdout).toContain('api');
    expect(stdout).toContain('remote');
    expect(stdout).toMatch(/2 servers/);
  });

  it('exits clean even when a config is full of dangerous servers — it reports, it does not judge', async () => {
    const config = writeConfig({
      danger: {
        command: 'npx',
        args: ['-y', 'whatever'],
        env: { GITHUB_TOKEN: 'ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    });

    const { code } = await run(['inventory', config]);
    expect(code).toBe(0);
  });

  it('lists all three surfaces under --live', async () => {
    const config = writeConfig({
      api: {
        command: 'node',
        args: [FIXTURE_SERVER],
        env: { FIXTURE_PROMPTS: '1', FIXTURE_RESOURCES: '1' },
      },
    });

    const { code, stdout } = await run(['inventory', config, '--live']);

    expect(code).toBe(0);
    expect(stdout).toMatch(/tools\s+1/);
    expect(stdout).toMatch(/prompts\s+1/);
    expect(stdout).toMatch(/resources\s+1/);
    expect(stdout).toContain('review_code');
  });

  it('says a server could not be connected to, rather than showing it as empty', async () => {
    const config = writeConfig({ broken: { command: 'definitely-not-a-real-binary', args: [] } });

    const { stdout } = await run(['inventory', config, '--live']);
    expect(stdout).toMatch(/could not connect/i);
  });

  it('emits machine-readable JSON with totals', async () => {
    const config = writeConfig({ api: { command: 'node', args: [FIXTURE_SERVER] } });

    const { stdout } = await run(['inventory', config, '--format', 'json']);
    const parsed = JSON.parse(stdout);

    expect(parsed.totals.servers).toBe(1);
    expect(parsed.configs[0].servers[0].name).toBe('api');
  });
});
