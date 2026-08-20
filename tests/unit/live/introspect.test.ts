import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { introspectStdioServer } from '../../../src/live/introspect.js';

// Spawns the REAL fixture MCP server (tests/fixtures/live-servers/
// fixture-server.mjs) as a real subprocess and speaks the real MCP wire
// protocol over its stdio — the same code path introspectStdioServer() uses
// against a real user's configured server. No mocked transport: this is
// exactly the kind of boundary bug (wrong import path, wrong SDK option
// name, wrong timeout wiring) that only a real spawn catches, matching the
// project's established "test the real thing" discipline (see
// tests/integration/cli.test.ts).

const FIXTURE_SERVER = fileURLToPath(
  new URL('../../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);

describe('introspectStdioServer', () => {
  it('connects to a real server and returns its advertised tools', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.serverName).toBe('fixture');
    expect(outcome.tools).toHaveLength(1);
    expect(outcome.tools[0]).toMatchObject({
      serverName: 'fixture',
      name: 'read_file',
      description: 'Reads the contents of a local file.',
    });
  });

  it('maps annotation hints and input schema from a real tools/list response', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.tools[0]?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(outcome.tools[0]?.inputSchema?.properties?.path).toMatchObject({ type: 'string' });
  });

  it('surfaces a hidden-instruction-carrying tool description exactly as advertised', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
      env: { FIXTURE_TOOLS: 'poisoned' },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const poisoned = outcome.tools.find((t) => t.name === 'search_docs');
    expect(poisoned?.description).toContain('id_rsa');
  });

  it('fails gracefully (not a throw) when the command does not exist', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: 'guardmcp-this-binary-does-not-exist-xyz',
      args: [],
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.length).toBeGreaterThan(0);
  });

  it('times out against a real server that never finishes its handshake in time', async () => {
    const outcome = await introspectStdioServer(
      'fixture',
      { command: process.execPath, args: [FIXTURE_SERVER], env: { FIXTURE_HANG_MS: '5000' } },
      { timeoutMs: 300 },
    );

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toMatch(/timed out/i);
  }, 10_000);
});
