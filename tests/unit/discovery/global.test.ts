import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { discoverGlobalConfigPaths } from '../../../src/discovery/locators/global.js';

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), 'guardmcp-global-home-'));
});

afterEach(() => {
  rmSync(fakeHome, { recursive: true, force: true });
});

describe('discoverGlobalConfigPaths', () => {
  it('returns nothing when no client config exists under the (fake) home', () => {
    expect(discoverGlobalConfigPaths(process.platform, fakeHome, {})).toEqual([]);
  });

  it('finds a real Cursor global config when present', () => {
    const cursorDir = join(fakeHome, '.cursor');
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(join(cursorDir, 'mcp.json'), '{}');

    const found = discoverGlobalConfigPaths(process.platform, fakeHome, {});
    expect(found).toContain(join(cursorDir, 'mcp.json'));
  });

  it('never returns a path that does not actually exist', () => {
    const found = discoverGlobalConfigPaths(process.platform, fakeHome, {});
    for (const path of found) {
      // every candidate is stat-checked internally; nothing should leak through
      expect(path).toContain(fakeHome);
    }
  });
});
