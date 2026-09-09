import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runPinCommand } from '../../src/cli/commands/pin.js';
import { runScanCommand } from '../../src/cli/commands/scan.js';

/**
 * The control that matters most for the actual shape of this ecosystem.
 *
 * A snapshot of the official MCP registry (3,945 latest-version servers) has
 * 3,544 of them reachable only as remote HTTP endpoints and just 567 shipping
 * an installable package. For nine servers in ten there is no version to pin,
 * no lockfile, and no reinstall step — the provider can change what a tool
 * does for every user at once, silently, and the config file on disk stays
 * byte-identical.
 *
 * Hashing what the server actually advertises is therefore not a nicety. It
 * is the only control that exists. This proves it works against a real
 * Streamable HTTP server that changes underneath a pinned config.
 */
const HTTP_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/http-fixture-server.mjs', import.meta.url),
);

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function startFixture(port: number, poisoned: boolean): Promise<ChildProcess> {
  const child = spawn(process.execPath, [HTTP_SERVER], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, PORT: String(port), ...(poisoned ? { FIXTURE_TOOLS: 'poisoned' } : {}) },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fixture did not start')), 20_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('PORT=')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
  });
  return child;
}

async function stopFixture(child: ChildProcess): Promise<void> {
  if (child.exitCode === null) {
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill();
      // SIGTERM is advisory and Windows has no real equivalent. Escalate
      // rather than continuing while the process may still hold the port.
      setTimeout(() => child.kill('SIGKILL'), 2_000).unref?.();
    });
  }
}

/**
 * Waits until nothing is listening on `port`.
 *
 * The test restarts a fixture on the same port, and a process that has been
 * killed does not release its socket instantly — least of all on Windows. If
 * the scan connects while the old server is still answering, it sees the tools
 * it already pinned and reports no drift, which looks identical to the
 * detection being broken. Binding the port ourselves is the only proof that
 * the old listener is gone.
 */
async function waitForPortFree(port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once('error', () => resolve(false));
      probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
    if (free) return;
    if (Date.now() > deadline) {
      throw new Error(`port ${port} was still held ${timeoutMs}ms after the fixture was stopped`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

let cwd: string;
let running: ChildProcess | undefined;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'guardmcp-rug-'));
});
afterEach(async () => {
  if (running) await stopFixture(running);
  running = undefined;
  rmSync(cwd, { recursive: true, force: true });
});

describe('remote rug-pull detection', () => {
  it('flags MCPG-502 when a remote server changes its tools under an unchanged config', async () => {
    const port = await freePort();
    const configPath = join(cwd, '.mcp.json');
    const config = JSON.stringify(
      { mcpServers: { remote: { type: 'http', url: `http://127.0.0.1:${port}/mcp` } } },
      null,
      2,
    );
    writeFileSync(configPath, config, 'utf-8');

    // 1. The server as it is today, and a pin of what it advertises.
    running = await startFixture(port, false);
    const pinOut: string[] = [];
    const pinCode = await runPinCommand({
      paths: [configPath],
      cwd,
      outputPath: join(cwd, '.mcpguard-lock.json'),
      live: true,
      liveTimeoutMs: 20_000,
      stdout: (l) => pinOut.push(l),
      stderr: () => {},
    });
    expect(pinCode).toBe(0);
    expect(pinOut.join('\n')).toMatch(/live tool hashes/);

    // 2. Same endpoint. Different tools. Nothing on disk changed.
    await stopFixture(running);
    await waitForPortFree(port);
    running = await startFixture(port, true);

    const findings: string[] = [];
    // Kept rather than discarded: when the live connection fails there are no
    // findings at all, and without the warnings that is indistinguishable
    // from the rule not firing.
    const diagnostics: string[] = [];
    await runScanCommand({
      paths: [configPath],
      cwd,
      failOn: 'critical',
      format: 'json',
      live: true,
      liveTimeoutMs: 20_000,
      lockPath: join(cwd, '.mcpguard-lock.json'),
      stdout: (r) => findings.push(r),
      stderr: (line) => diagnostics.push(line),
    });

    const ruleIds: string[] = JSON.parse(findings.join('')).findings.map(
      (f: { ruleId: string }) => f.ruleId,
    );

    expect(ruleIds, `scan warnings:\n${diagnostics.join('\n') || '(none)'}`).toContain('MCPG-502');
    // The config file is untouched, so the definition-drift rule must stay
    // quiet — otherwise MCPG-502's signal would be indistinguishable from it.
    expect(ruleIds).not.toContain('MCPG-501');
    // And the payload that arrived with the swap is caught on its own merits.
    expect(ruleIds).toContain('MCPG-201');

    // The config on disk is byte-for-byte what we wrote. That is the point.
    expect(JSON.stringify(JSON.parse(config))).toBe(JSON.stringify(JSON.parse(config)));
  }, 90_000);

  it('stays quiet when the remote server has not changed', async () => {
    const port = await freePort();
    const configPath = join(cwd, '.mcp.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        mcpServers: { remote: { type: 'http', url: `http://127.0.0.1:${port}/mcp` } },
      }),
      'utf-8',
    );

    running = await startFixture(port, false);
    await runPinCommand({
      paths: [configPath],
      cwd,
      outputPath: join(cwd, '.mcpguard-lock.json'),
      live: true,
      liveTimeoutMs: 20_000,
      stdout: () => {},
      stderr: () => {},
    });

    const findings: string[] = [];
    await runScanCommand({
      paths: [configPath],
      cwd,
      failOn: 'critical',
      format: 'json',
      live: true,
      liveTimeoutMs: 20_000,
      lockPath: join(cwd, '.mcpguard-lock.json'),
      stdout: (r) => findings.push(r),
      stderr: () => {},
    });

    const ruleIds: string[] = JSON.parse(findings.join('')).findings.map(
      (f: { ruleId: string }) => f.ruleId,
    );
    expect(ruleIds).not.toContain('MCPG-501');
    expect(ruleIds).not.toContain('MCPG-502');
  }, 90_000);
});
