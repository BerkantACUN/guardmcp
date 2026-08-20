import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serverKey } from '../../src/model/server-key.js';

// Exercises the BUILT artifact (dist/cli/index.js) end-to-end for `pin` +
// `scan --lock`/`--live`, against a REAL spawned MCP server (tests/fixtures/
// live-servers/fixture-server.mjs) — same discipline as tests/integration/
// cli.test.ts. This is the only place the full rug-pull loop (pin once,
// drift later, scan catches it) is exercised as a whole rather than as
// isolated units.

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
const FIXTURE_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

async function runCli(args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
  }
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-pin-e2e-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(fileName: string, fixtureToolsEnv: string): string {
  const path = join(dir, fileName);
  writeFileSync(
    path,
    JSON.stringify({
      mcpServers: {
        fixture: {
          command: process.execPath,
          args: [FIXTURE_SERVER],
          env: { FIXTURE_TOOLS: fixtureToolsEnv },
        },
      },
    }),
  );
  return path;
}

describe('guardmcp pin + scan --lock (built artifact, config-level drift)', () => {
  it('pins a config, then reports no drift on an unmodified re-scan', async () => {
    const config = writeConfig('.mcp.json', 'basic');
    const lockPath = join(dir, '.mcpguard-lock.json');

    const pinResult = await runCli(['pin', config, '--output', lockPath]);
    expect(pinResult.exitCode).toBe(0);
    expect(pinResult.stdout).toMatch(/Pinned 1 server/);
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
    const key = serverKey(relative(process.cwd(), config), 'fixture');
    expect(lock.servers[key].definitionHash).toMatch(/^sha256:/);

    const scanResult = await runCli(['scan', config, '--lock', lockPath, '--rules', 'MCPG-501']);
    expect(scanResult.exitCode).toBe(0);
    expect(scanResult.stdout).toContain('No findings');
  });

  it('flags MCPG-501 when the pinned server definition changes', async () => {
    const config = writeConfig('.mcp.json', 'basic');
    const lockPath = join(dir, '.mcpguard-lock.json');
    await runCli(['pin', config, '--output', lockPath]);

    // Edit the config's args AFTER pinning — the config-level rug-pull.
    const raw = JSON.parse(readFileSync(config, 'utf-8'));
    raw.mcpServers.fixture.args.push('--extra-flag-nobody-approved');
    writeFileSync(config, JSON.stringify(raw));

    const scanResult = await runCli(['scan', config, '--lock', lockPath, '--rules', 'MCPG-501']);

    expect(scanResult.exitCode).toBe(1);
    expect(scanResult.stdout).toContain('MCPG-501');
    expect(scanResult.stdout).toMatch(/changed since it was last pinned/);
  });
}, 30_000);

describe('guardmcp pin --live + scan --live --lock (built artifact, live tool drift)', () => {
  it("flags MCPG-502 when a server's real tools change but its config does not", async () => {
    // Pin against the server reporting its "basic" tool description.
    const pinConfig = writeConfig('.mcp.json', 'basic');
    const lockPath = join(dir, '.mcpguard-lock.json');
    const pinResult = await runCli(['pin', pinConfig, '--live', '--output', lockPath]);
    expect(pinResult.exitCode).toBe(0);
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
    const key = serverKey(relative(process.cwd(), pinConfig), 'fixture');
    expect(lock.servers[key].toolsHash).toMatch(/^sha256:/);

    // The env VALUE changes (v1 -> v2 description) but the env KEY
    // (FIXTURE_TOOLS) stays the same — definitionHash (key-names only)
    // stays identical, so only MCPG-502 (live tool drift) should fire, not
    // MCPG-501 (config drift). This is exactly the class of rug-pull an
    // unpinned `npx some-mcp-server` represents: the launch command never
    // changes, only what actually runs does.
    const driftedConfig = writeConfig('.mcp.json', 'v2');

    const scanResult = await runCli([
      'scan',
      driftedConfig,
      '--lock',
      lockPath,
      '--live',
      '--rules',
      'MCPG-501,MCPG-502',
    ]);

    expect(scanResult.exitCode).toBe(1);
    expect(scanResult.stdout).toContain('MCPG-502');
    expect(scanResult.stdout).not.toContain('MCPG-501');
    expect(scanResult.stdout).toMatch(/CRITICAL/);
  });
}, 30_000);
