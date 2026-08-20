import { describe, expect, it } from 'vitest';
import { serverKey } from '../../../src/model/server-key.js';

describe('serverKey', () => {
  it('joins relativePath and serverName with ::', () => {
    expect(serverKey('.mcp.json', 'fs')).toBe('.mcp.json::fs');
  });

  it('normalizes Windows backslash paths to forward slashes', () => {
    expect(serverKey('.vscode\\mcp.json', 'fs')).toBe('.vscode/mcp.json::fs');
  });

  // The actual regression this guards: pin on Windows (relativePath from
  // Node's path.relative() is backslash-separated there), scan later in
  // CI on Linux (forward-slash-separated) — both must produce the exact
  // same key for MCPG-501/502 to find the pinned entry at all.
  it('produces an identical key for a Windows-style and POSIX-style path pointing at the same file', () => {
    const windowsStyle = serverKey('.vscode\\mcp.json', 'fs');
    const posixStyle = serverKey('.vscode/mcp.json', 'fs');
    expect(windowsStyle).toBe(posixStyle);
  });

  it('handles multiple nested path segments', () => {
    expect(serverKey('a\\b\\c.json', 'fs')).toBe('a/b/c.json::fs');
  });
});
