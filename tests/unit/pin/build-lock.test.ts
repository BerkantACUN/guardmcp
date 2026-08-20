import { describe, expect, it } from 'vitest';
import type { ScanTarget } from '../../../src/model/scan-target.js';
import type { ToolDefinition } from '../../../src/model/tool-definition.js';
import { buildLockFile } from '../../../src/pin/build-lock.js';
import { computeDefinitionHash } from '../../../src/pin/definition-hash.js';
import { computeToolsHash } from '../../../src/pin/tools-hash.js';

function stubTarget(relativePath: string, mcpServers: Record<string, unknown>): ScanTarget {
  return {
    kind: 'config-file',
    filePath: relativePath,
    relativePath,
    document: { getValue: () => ({ mcpServers }), locate: () => undefined },
    config: { mcpServers } as ScanTarget['config'],
  };
}

describe('buildLockFile', () => {
  it('records a definitionHash for every server, keyed by relativePath::serverName', () => {
    const target = stubTarget('.mcp.json', { fs: { command: 'npx', args: ['fs-server'] } });

    const lock = buildLockFile([target], undefined, '2026-01-01T00:00:00.000Z');

    expect(lock.version).toBe('1');
    expect(lock.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(lock.servers['.mcp.json::fs']).toEqual({
      definitionHash: computeDefinitionHash({ command: 'npx', args: ['fs-server'] }),
    });
  });

  it('adds a toolsHash only for servers with live tools supplied', () => {
    const target = stubTarget('.mcp.json', {
      fs: { command: 'npx', args: ['fs-server'] },
      remote: { url: 'https://example.com/mcp' },
    });
    const tools: ToolDefinition[] = [
      { serverName: 'fs', name: 'read_file', description: 'Reads.' },
    ];
    const liveTools = new Map([['.mcp.json::fs', tools]]);

    const lock = buildLockFile([target], liveTools, '2026-01-01T00:00:00.000Z');

    expect(lock.servers['.mcp.json::fs']?.toolsHash).toBe(computeToolsHash(tools));
    expect(lock.servers['.mcp.json::remote']?.toolsHash).toBeUndefined();
  });

  it('keeps servers with the same name in different files as separate entries', () => {
    const targetA = stubTarget('.mcp.json', { fs: { command: 'npx', args: ['a'] } });
    const targetB = stubTarget('.vscode/mcp.json', { fs: { command: 'npx', args: ['b'] } });

    const lock = buildLockFile([targetA, targetB], undefined, '2026-01-01T00:00:00.000Z');

    expect(Object.keys(lock.servers).sort()).toEqual(['.mcp.json::fs', '.vscode/mcp.json::fs']);
    expect(lock.servers['.mcp.json::fs']?.definitionHash).not.toBe(
      lock.servers['.vscode/mcp.json::fs']?.definitionHash,
    );
  });

  it('produces an empty servers map for a target with no mcpServers', () => {
    const target = stubTarget('.mcp.json', {});
    const lock = buildLockFile([target], undefined, '2026-01-01T00:00:00.000Z');
    expect(lock.servers).toEqual({});
  });
});
