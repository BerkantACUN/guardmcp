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

  it('throws ScanTargetLoadError when the JSON is well-formed but fails schema validation', () => {
    expect(() => loadScanTarget(`${FIXTURES}/invalid/invalid-schema.json`, FIXTURES)).toThrow(
      ScanTargetLoadError,
    );
  });
});
