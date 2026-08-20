import { describe, expect, it } from 'vitest';
import type { ScanTarget } from '../../../../src/model/scan-target.js';
import { computeDefinitionHash } from '../../../../src/pin/definition-hash.js';
import type { LockFile } from '../../../../src/pin/lockfile-schema.js';
import { serverDefinitionDriftRule } from '../../../../src/rules/integrity/server-definition-drift.js';

function stubTarget(relativePath: string, mcpServers: Record<string, unknown>): ScanTarget {
  return {
    kind: 'config-file',
    filePath: relativePath,
    relativePath,
    document: { getValue: () => ({ mcpServers }), locate: () => undefined },
    config: { mcpServers } as ScanTarget['config'],
  };
}

const CTX_NO_LOCK = { cwd: '.' };

describe('MCPG-501 server-definition-drift rule', () => {
  it('reports nothing when no lock file is in play', () => {
    const target = stubTarget('.mcp.json', { fs: { command: 'npx', args: ['fs-server'] } });
    expect(serverDefinitionDriftRule.check(target, CTX_NO_LOCK)).toEqual([]);
  });

  it('reports nothing for a server that was never pinned', () => {
    const target = stubTarget('.mcp.json', { fs: { command: 'npx', args: ['fs-server'] } });
    const lock: LockFile = { version: '1', generatedAt: 'now', servers: {} };
    expect(serverDefinitionDriftRule.check(target, { cwd: '.', lock })).toEqual([]);
  });

  it('reports nothing when the current definition matches the pinned hash', () => {
    const def = { command: 'npx', args: ['fs-server'] };
    const target = stubTarget('.mcp.json', { fs: def });
    const lock: LockFile = {
      version: '1',
      generatedAt: 'now',
      servers: { '.mcp.json::fs': { definitionHash: computeDefinitionHash(def) } },
    };
    expect(serverDefinitionDriftRule.check(target, { cwd: '.', lock })).toEqual([]);
  });

  it('flags a server whose command/args changed since it was pinned', () => {
    const target = stubTarget('.mcp.json', {
      fs: { command: 'npx', args: ['fs-server', '--danger'] },
    });
    const lock: LockFile = {
      version: '1',
      generatedAt: 'now',
      servers: {
        '.mcp.json::fs': {
          definitionHash: computeDefinitionHash({ command: 'npx', args: ['fs-server'] }),
        },
      },
    };

    const findings = serverDefinitionDriftRule.check(target, { cwd: '.', lock });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-501');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.message).toMatch(/changed since it was last pinned/);
  });

  it('does not flag a change to only an env value (not drift, per definitionHash design)', () => {
    const target = stubTarget('.mcp.json', {
      fs: { command: 'npx', args: ['fs-server'], env: { KEY: 'rotated-value' } },
    });
    const lock: LockFile = {
      version: '1',
      generatedAt: 'now',
      servers: {
        '.mcp.json::fs': {
          definitionHash: computeDefinitionHash({
            command: 'npx',
            args: ['fs-server'],
            env: { KEY: 'old-value' },
          }),
        },
      },
    };
    expect(serverDefinitionDriftRule.check(target, { cwd: '.', lock })).toEqual([]);
  });
});
