import { describe, expect, it } from 'vitest';
import { defaultServerName } from '../../../../src/cli/commands/proxy.js';

describe('defaultServerName', () => {
  it.each([
    ['my-server', [], 'my-server'],
    ['/usr/local/bin/mcp-git', ['--repo', '.'], 'mcp-git'],
    ['C:\\tools\\server.exe', [], 'server'],
    ['npx', ['-y', '@modelcontextprotocol/server-github'], 'server-github'],
    ['npx', ['-y', '@scope/pkg@1.2.3'], 'pkg'],
    ['uvx', ['mcp-server-fetch@0.6.2'], 'mcp-server-fetch'],
    ['node', ['dist/index.js'], 'index'],
    ['npx', ['-y'], 'npx'],
  ])('%s %j → %s', (command, args, expected) => {
    expect(defaultServerName(command, args)).toBe(expected);
  });
});
