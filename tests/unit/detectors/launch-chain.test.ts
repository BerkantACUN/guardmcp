import { describe, expect, it } from 'vitest';
import { launchChain } from '../../../src/detectors/launch-chain.js';

const inner = (command: string, args: string[]) => launchChain({ command, args })[1];

describe('launchChain', () => {
  it('is just the entry itself when nothing is wrapped', () => {
    expect(launchChain({ command: 'npx', args: ['-y', 'pkg@1.0.0'] })).toEqual([
      { command: 'npx', args: ['-y', 'pkg@1.0.0'], argOffset: 0 },
    ]);
  });

  it('unwraps a global guardmcp proxy with --, keeping original indices', () => {
    expect(inner('guardmcp', ['proxy', '--log', 'x', '--', 'npx', '-y', 'pkg'])).toEqual({
      command: 'npx',
      args: ['-y', 'pkg'],
      argOffset: 5,
    });
  });

  it('unwraps guardmcp run through a package runner', () => {
    expect(inner('npx', ['-y', 'guardmcp@0.17.0', 'proxy', '--', 'uvx', 'srv'])).toMatchObject({
      command: 'uvx',
      argOffset: 5,
    });
  });

  it('unwraps the built CLI run by node, on Windows paths too', () => {
    const script = 'C:\\npm\\node_modules\\guardmcp\\dist\\cli\\index.js';
    expect(inner('node.exe', [script, 'proxy', '--', 'python', 'server.py'])).toMatchObject({
      command: 'python',
      args: ['server.py'],
      argOffset: 4,
    });
  });

  it('finds the wrapped command without --, skipping proxy options', () => {
    expect(
      inner('guardmcp.cmd', ['proxy', '--name', 'n', '--sarif=o.sarif', 'uvx', 'srv']),
    ).toEqual({ command: 'uvx', args: ['srv'], argOffset: 5 });
  });

  it.each([
    ['guardmcp', ['scan', '--', 'npx', 'pkg']],
    ['guardmcp', ['proxy', '--log', 'x']],
    ['guardmcp', ['proxy', '--']],
    ['mcp-proxy', ['proxy', '--', 'npx', 'pkg']],
    ['npx', ['-y', 'guardmcp-fork', 'proxy', '--', 'npx', 'pkg']],
    ['node', ['server.js', 'proxy', '--', 'npx', 'pkg']],
  ])('does not unwrap %s %j', (command, args) => {
    expect(launchChain({ command, args })).toHaveLength(1);
  });

  it('unwraps a proxy inside a proxy, but only to a bounded depth', () => {
    const args = ['proxy', '--', 'guardmcp', 'proxy', '--', 'npx', 'pkg'];
    const chain = launchChain({ command: 'guardmcp', args });
    expect(chain.map((l) => l.command)).toEqual(['guardmcp', 'guardmcp', 'npx']);
    expect(chain[2]?.argOffset).toBe(6);

    const deep = ['proxy', '--'];
    for (let i = 0; i < 10; i++) deep.push('guardmcp', 'proxy', '--');
    deep.push('npx', 'pkg');
    expect(launchChain({ command: 'guardmcp', args: deep }).length).toBeLessThanOrEqual(4);
  });
});
