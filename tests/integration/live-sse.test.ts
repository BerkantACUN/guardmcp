import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runInventoryCommand } from '../../src/cli/commands/inventory.js';
import { runScanCommand } from '../../src/cli/commands/scan.js';

// A REAL server on the legacy HTTP+SSE transport, dialled over the network
// stack. It rejects any request without the expected Authorization header,
// so a pass also proves the config's headers reach the event stream and the
// POSTs alike.
const SSE_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/sse-fixture-server.mjs', import.meta.url),
);
const AUTH = 'Bearer sse-fixture-token';

let child: ChildProcess;
let port: number;

beforeAll(async () => {
  child = spawn(process.execPath, [SSE_SERVER], {
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, REQUIRE_AUTH: AUTH },
  });
  port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SSE fixture did not report a port')), 20_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      const match = /PORT=(\d+)/.exec(chunk.toString());
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
    child.on('error', reject);
  });
}, 30_000);

afterAll(() => {
  child?.kill();
});

let cwd: string;
let out: string[];
let err: string[];

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'guardmcp-sse-'));
  out = [];
  err = [];
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function config(type: string): string {
  const path = join(cwd, '.mcp.json');
  const server = { type, url: `http://127.0.0.1:${port}/sse`, headers: { Authorization: AUTH } };
  writeFileSync(path, JSON.stringify({ mcpServers: { legacy: server } }, null, 2), 'utf-8');
  return path;
}

const io = () => ({
  stdout: (t: string) => out.push(t),
  stderr: (l: string) => err.push(l),
});

describe('--live against a legacy HTTP+SSE server', () => {
  it('dials a "type": "sse" entry with the SSE transport and lists its tools', async () => {
    const code = await runInventoryCommand({
      paths: [config('sse')],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 15_000,
      ...io(),
    });

    expect(code).toBe(0);
    expect(out.join('')).toContain('legacy_search');
  }, 30_000);

  it('scans what the SSE server advertises', async () => {
    const code = await runScanCommand({
      paths: [config('sse')],
      failOn: 'high',
      format: 'json',
      cwd,
      globalConfigPaths: [],
      live: true,
      liveTimeoutMs: 15_000,
      ...io(),
    });

    const report = JSON.parse(out.join('')) as { findings: { ruleId: string }[] };
    expect(report.findings.map((f) => f.ruleId)).toContain('MCPG-201');
    expect(code).toBe(1);
    expect(err.join('\n')).toContain('connected to 1/1');
  }, 30_000);

  it('is matched by label case-insensitively', async () => {
    const code = await runInventoryCommand({
      paths: [config('SSE')],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 15_000,
      ...io(),
    });
    expect(code).toBe(0);
    expect(out.join('')).toContain('legacy_search');
  }, 30_000);
});
