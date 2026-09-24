import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget, ScanTargetLoadError } from '../../../src/discovery/index.js';

const FIXTURES = fileURLToPath(new URL('../../fixtures/configs', import.meta.url));

describe('loadScanTarget', () => {
  it('loads and validates a well-formed config', () => {
    const target = loadScanTarget(`${FIXTURES}/benign/no-env.json`, FIXTURES);
    expect(target.config.mcpServers?.filesystem).toBeDefined();
  });

  it('throws ScanTargetLoadError when the file does not exist', () => {
    expect(() => loadScanTarget(`${FIXTURES}/does-not-exist.json`, FIXTURES)).toThrow(
      ScanTargetLoadError,
    );
  });

  it('skips, with a reason, a server that is neither a launch command nor a URL', () => {
    const target = loadScanTarget(`${FIXTURES}/invalid/invalid-schema.json`, FIXTURES);
    expect(target.config.mcpServers).toEqual({});
    expect(target.skippedServers).toHaveLength(1);
    expect(target.skippedServers?.[0]).toMatch(
      /Skipped server "broken".*neither a "command".*nor a "url"/,
    );
  });

  it('throws ScanTargetLoadError when mcpServers itself is not a map of servers', () => {
    expect(() =>
      loadScanTarget(`${FIXTURES}/invalid/mcpservers-not-an-object.json`, FIXTURES),
    ).toThrow(ScanTargetLoadError);
  });

  it('keeps every readable server when one entry is not, whatever transport label they carry', () => {
    const target = loadScanTarget(`${FIXTURES}/malicious/mixed-transports.json`, FIXTURES);
    expect(Object.keys(target.config.mcpServers ?? {})).toEqual([
      'legacy-sse',
      'streamable',
      'github',
    ]);
    expect(target.skippedServers).toEqual([
      expect.stringMatching(/Skipped server "websocket-someday"/),
    ]);
  });
});
