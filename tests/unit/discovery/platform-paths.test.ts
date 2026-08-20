import { describe, expect, it } from 'vitest';
import { globalConfigCandidatePaths } from '../../../src/discovery/platform-paths.js';

const HOME_WIN = 'C:\\Users\\test';
const HOME_MAC = '/Users/test';
const HOME_LINUX = '/home/test';

describe('globalConfigCandidatePaths', () => {
  it("includes Claude Desktop's Windows path under APPDATA", () => {
    const paths = globalConfigCandidatePaths('win32', HOME_WIN, {
      APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
    });
    expect(paths).toContain(
      'C:\\Users\\test\\AppData\\Roaming\\Claude\\claude_desktop_config.json',
    );
  });

  it("includes Claude Desktop's macOS path under Application Support", () => {
    const paths = globalConfigCandidatePaths('darwin', HOME_MAC, {});
    expect(paths).toContain(
      '/Users/test/Library/Application Support/Claude/claude_desktop_config.json',
    );
  });

  it("includes Claude Desktop's Linux path under ~/.config", () => {
    const paths = globalConfigCandidatePaths('linux', HOME_LINUX, {});
    expect(
      paths.some((p) => p.includes('.config') && p.includes('claude_desktop_config.json')),
    ).toBe(true);
  });

  it("includes Cursor's global mcp.json (same relative path on every OS)", () => {
    for (const [platform, home] of [
      ['win32', HOME_WIN],
      ['darwin', HOME_MAC],
      ['linux', HOME_LINUX],
    ] as const) {
      const paths = globalConfigCandidatePaths(platform, home, {});
      expect(paths.some((p) => p.includes('.cursor') && p.endsWith('mcp.json'))).toBe(true);
    }
  });

  it('includes at least one Windsurf candidate path per OS', () => {
    for (const [platform, home] of [
      ['win32', HOME_WIN],
      ['darwin', HOME_MAC],
      ['linux', HOME_LINUX],
    ] as const) {
      const paths = globalConfigCandidatePaths(platform, home, {
        APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
      });
      expect(paths.some((p) => /windsurf|codeium/i.test(p))).toBe(true);
    }
  });

  it('returns only unique, non-empty paths', () => {
    const paths = globalConfigCandidatePaths('win32', HOME_WIN, {
      APPDATA: 'C:\\Users\\test\\AppData\\Roaming',
    });
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((p) => p.length > 0)).toBe(true);
  });
});
