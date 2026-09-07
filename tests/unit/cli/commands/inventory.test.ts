import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInventoryCommand } from '../../../../src/cli/commands/inventory.js';

const FIXTURE_SERVER = fileURLToPath(
  new URL('../../../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);

let cwd: string;
let out: string[];
let err: string[];

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'guardmcp-invu-'));
  out = [];
  err = [];
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

const io = () => ({
  stdout: (t: string) => out.push(t),
  stderr: (l: string) => err.push(l),
});

function config(servers: Record<string, unknown>): string {
  const path = join(cwd, '.mcp.json');
  writeFileSync(path, JSON.stringify({ mcpServers: servers }, null, 2), 'utf-8');
  return path;
}

describe('runInventoryCommand', () => {
  it('reports servers from a config without connecting to them', async () => {
    const path = config({ api: { command: 'node', args: ['s.js'] } });

    const code = await runInventoryCommand({ paths: [path], cwd, format: 'human', ...io() });

    expect(code).toBe(0);
    expect(out.join('')).toContain('api');
    expect(out.join('')).toMatch(/--live/); // tells you surfaces are unknown
  });

  it('distinguishes stdio from remote servers', async () => {
    const path = config({
      local: { command: 'node', args: ['s.js'] },
      remote: { type: 'http', url: 'https://api.example.com/mcp' },
    });

    await runInventoryCommand({ paths: [path], cwd, format: 'human', ...io() });

    const text = out.join('');
    expect(text).toContain('stdio');
    expect(text).toContain('http');
    expect(text).toContain('https://api.example.com/mcp');
  });

  it('emits JSON with totals when asked', async () => {
    const path = config({ api: { command: 'node', args: ['s.js'] } });

    await runInventoryCommand({ paths: [path], cwd, format: 'json', ...io() });

    const parsed = JSON.parse(out.join(''));
    expect(parsed.live).toBe(false);
    expect(parsed.totals.servers).toBe(1);
  });

  it('lists all three surfaces from a real server under --live', async () => {
    const path = config({
      api: {
        command: process.execPath,
        args: [FIXTURE_SERVER],
        env: { FIXTURE_PROMPTS: '1', FIXTURE_RESOURCES: '1' },
      },
    });

    const code = await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 15_000,
      ...io(),
    });

    expect(code).toBe(0);
    const text = out.join('');
    expect(text).toContain('read_file');
    expect(text).toContain('review_code');
    expect(text).toContain('project-readme');
  });

  it('records why a server could not be reached instead of showing it as empty', async () => {
    const path = config({ broken: { command: 'definitely-not-a-real-binary', args: [] } });

    await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 5_000,
      ...io(),
    });

    expect(out.join('')).toMatch(/could not connect/i);
  });

  it('marks a remote server as not introspected under --live rather than as broken', async () => {
    const path = config({ remote: { type: 'http', url: 'https://api.example.com/mcp' } });

    await runInventoryCommand({
      paths: [path],
      cwd,
      format: 'human',
      live: true,
      liveTimeoutMs: 5_000,
      ...io(),
    });

    expect(out.join('')).toMatch(/not introspected/i);
  });

  it('fails when every candidate config could not be loaded', async () => {
    const path = join(cwd, 'broken.json');
    // Schema-invalid rather than syntax-invalid: the JSONC parser is lenient
    // by design (comments and trailing commas are legal in real clients'
    // configs), so a truncated brace parses fine. A wrong SHAPE is what
    // actually fails loadScanTarget.
    writeFileSync(path, JSON.stringify({ mcpServers: 'not an object' }), 'utf-8');

    const code = await runInventoryCommand({ paths: [path], cwd, format: 'human', ...io() });

    expect(code).not.toBe(0);
    expect(err.join('')).toMatch(/No MCP config file could be loaded/i);
  });

  it('reports an empty inventory rather than failing when nothing is configured', async () => {
    const code = await runInventoryCommand({ paths: [], cwd, format: 'human', ...io() });

    expect(code).toBe(0);
    expect(out.join('')).toMatch(/no MCP config/i);
  });
});
