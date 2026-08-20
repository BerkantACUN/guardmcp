import { describe, expect, it } from 'vitest';
import { McpConfigFileSchema, normalizeRawConfig } from '../../../src/model/mcp-server-def.js';

// normalizeRawConfig() is always piped through McpConfigFileSchema before
// anything touches it as typed data (see discovery/index.ts) — testing it
// the same way exercises the real code path instead of poking at an
// intentionally-`unknown` intermediate shape.
function parse(raw: unknown) {
  const result = McpConfigFileSchema.safeParse(normalizeRawConfig(raw));
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

describe('normalizeRawConfig', () => {
  it('reads the standard "mcpServers" key (Claude Desktop, Claude Code, Cursor, Windsurf)', () => {
    const raw = { mcpServers: { foo: { command: 'npx', args: ['-y', 'pkg'] } } };
    expect(parse(raw).mcpServers?.foo).toBeDefined();
  });

  it('reads VS Code\'s "servers" key and normalizes it to mcpServers (regression: VS Code uses a different root key and was silently scanning zero servers)', () => {
    const raw = { servers: { foo: { type: 'stdio', command: 'npx', args: ['-y', 'pkg'] } } };
    expect(parse(raw).mcpServers?.foo).toBeDefined();
  });

  it('prefers "mcpServers" if both keys are somehow present', () => {
    const raw = {
      mcpServers: { real: { command: 'npx' } },
      servers: { other: { command: 'npx' } },
    };
    const normalized = parse(raw);
    expect(normalized.mcpServers?.real).toBeDefined();
    expect(normalized.mcpServers?.other).toBeUndefined();
  });

  it('produces an empty config (no crash) for a raw value with neither key', () => {
    expect(parse({ somethingElse: true }).mcpServers).toBeUndefined();
  });
});
