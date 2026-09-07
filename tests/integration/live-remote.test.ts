import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runInventoryCommand } from '../../src/cli/commands/inventory.js';

// Spawns a REAL Streamable HTTP MCP server and dials it over the network
// stack, the same code path a user's remote server takes. Nothing about the
// transport is mocked — that is the only way a bug in transport construction,
// header forwarding or session handling would show up.
const HTTP_SERVER = fileURLToPath(
  new URL('../fixtures/live-servers/http-fixture-server.mjs', import.meta.url),
);

let child: ChildProcess;
let port: number;

beforeAll(async () => {
  child = spawn(process.execPath, [HTTP_SERVER], { stdio: ['ignore', 'pipe', 'ignore'] });
  port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('fixture server did not report a port')),
      20_000,
    );
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
  cwd = mkdtempSync(join(tmpdir(), 'guardmcp-remote-'));
  out = [];
  err = [];
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function config(servers: Record<string, unknown>): string {
  const path = join(cwd, '.mcp.json');
  writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8');
  return path;
}

const io = () => ({
  stdout: (t: string) => out.push(t),
  stderr: (l: string) => err.push(l),
});

describe('--live against a real remote MCP server', () => {
  it('connects over Streamable HTTP and lists what it advertises', async () => {
    const path = config({ remote: { type: 'http', url: `http://127.0.0.1:${port}/mcp` } });

    const code = await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 15_000,
      ...io(),
    });

    expect(code).toBe(0);
    expect(out.join('')).toContain('remote_search');
  }, 30_000);

  it('refuses a cloud-metadata endpoint and says which rule that is', async () => {
    const path = config({
      meta: { type: 'http', url: 'http://169.254.169.254/latest/meta-data/' },
    });

    await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 5_000,
      ...io(),
    });

    const text = out.join('');
    expect(text).toMatch(/refused to connect/i);
    expect(text).toContain('MCPG-403');
  }, 20_000);

  it('refuses cleartext http carrying credentials and says which rule that is', async () => {
    const path = config({
      leaky: {
        type: 'http',
        url: 'http://api.example.com/mcp',
        headers: { Authorization: 'Bearer would-be-sent-in-the-clear' },
      },
    });

    await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 5_000,
      ...io(),
    });

    const text = out.join('');
    expect(text).toMatch(/refused to connect/i);
    expect(text).toContain('MCPG-401');
    // The refusal must never quote the credential it declined to transmit.
    expect(text).not.toContain('would-be-sent-in-the-clear');
  }, 20_000);

  it('never prints the credential headers it forwards on a successful connection', async () => {
    const path = config({
      remote: {
        type: 'http',
        url: `http://127.0.0.1:${port}/mcp`,
        headers: { Authorization: 'Bearer super-secret-value' },
      },
    });

    await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 15_000,
      ...io(),
    });

    expect([...out, ...err].join('')).not.toContain('super-secret-value');
  }, 30_000);
});
