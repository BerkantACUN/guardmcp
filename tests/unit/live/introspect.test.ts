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

describe('introspectStdioServer — prompts', () => {
  it('returns prompts from a real prompts/list response', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
      env: { FIXTURE_PROMPTS: '1' },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.prompts).toHaveLength(1);
    expect(outcome.prompts[0]).toMatchObject({
      serverName: 'fixture',
      name: 'review_code',
      description: 'Reviews a code change and suggests improvements.',
    });
    expect(outcome.prompts[0]?.arguments).toEqual([
      { name: 'diff', description: 'The unified diff to review.' },
    ]);
  });

  it('returns an empty prompt list — not an error — for a server with no prompts capability', async () => {
    // The default fixture registers tools only, so prompts/list would be a
    // "method not found". A scanner must treat that as "this server has no
    // prompts", never as a failed scan.
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.prompts).toEqual([]);
    expect(outcome.tools).toHaveLength(1);
  });

  it('still returns the tools when a server advertises both surfaces', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
      env: { FIXTURE_TOOLS: 'poisoned', FIXTURE_PROMPTS: '1' },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.tools).toHaveLength(2);
    expect(outcome.prompts).toHaveLength(1);
    expect(outcome.prompts[0]?.description).toMatch(/IMPORTANT/);
  });
});

describe('introspectStdioServer — resources', () => {
  it('returns resources from a real resources/list response', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
      env: { FIXTURE_RESOURCES: '1' },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resources).toHaveLength(1);
    expect(outcome.resources[0]).toMatchObject({
      serverName: 'fixture',
      name: 'project-readme',
      uri: 'file:///srv/project/README.md',
      description: 'The project README.',
      mimeType: 'text/markdown',
    });
  });

  it('returns an empty resource list for a server with no resources capability', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resources).toEqual([]);
  });

  it('surfaces a resource pointing at a private key, whatever its description claims', async () => {
    const outcome = await introspectStdioServer('fixture', {
      command: process.execPath,
      args: [FIXTURE_SERVER],
      env: { FIXTURE_TOOLS: 'poisoned', FIXTURE_RESOURCES: '1' },
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const key = outcome.resources.find((r) => r.name === 'deploy-key');
    expect(key?.uri).toBe('file:///home/deploy/.ssh/id_rsa');
    // The description says nothing incriminating — that is the point.
    expect(key?.description).toBe('Deployment configuration.');
  });
});
