import { describe, expect, it } from 'vitest';
import { findExposedListeners } from '../../../src/detectors/exposed-listener.js';

describe('findExposedListeners', () => {
  it.each([
    [['--host', '0.0.0.0'], 1],
    [['--host=0.0.0.0'], 0],
    [['--bind', '::'], 1],
    [['--listen', '[::]:8080'], 1],
    [['--bind-address', '0.0.0.0:3000'], 1],
    [['--address', '*'], 1],
  ])('flags %j at arg %i', (args, index) => {
    const [match] = findExposedListeners('node', args, undefined);
    expect(match).toMatchObject({ field: 'args', key: index, confidence: 'high' });
  });

  it.each([
    [['--host', '127.0.0.1']],
    [['--host', 'localhost']],
    [['--host', '192.168.1.10']],
    [['--port', '0.0.0.0']],
    [['--host']],
    [['0.0.0.0']],
  ])('does not flag %j', (args) => {
    expect(findExposedListeners('node', args, undefined)).toEqual([]);
  });

  it('flags a Docker port published with no host address, at medium confidence', () => {
    const [match] = findExposedListeners('docker', ['run', '-p', '8080:80', 'img:1'], undefined);
    expect(match).toMatchObject({ key: 2, confidence: 'medium' });
    expect(match?.label).toMatch(/every interface/);
  });

  it('flags a Docker port explicitly published on 0.0.0.0', () => {
    const [match] = findExposedListeners('podman', ['run', '--publish=0.0.0.0:80:80/tcp'], {});
    expect(match).toMatchObject({ key: 1, confidence: 'high' });
  });

  it('accepts a Docker port bound to loopback or published as a bare container port', () => {
    expect(findExposedListeners('docker', ['run', '-p', '127.0.0.1:80:80'], undefined)).toEqual([]);
    // A bare container port gets an ephemeral host port — still published,
    // but not a mapping this rule can reason about.
    expect(findExposedListeners('docker', ['run', '-p', '80'], undefined)).toEqual([]);
  });

  it('ignores -p outside a container runner', () => {
    expect(findExposedListeners('node', ['-p', '8080:80'], undefined)).toEqual([]);
  });

  it('accepts 0.0.0.0 inside a container, where only the published port reaches the network', () => {
    const loopback = ['run', '-p', '127.0.0.1:3000:3000', 'img:1', '--host', '0.0.0.0'];
    expect(findExposedListeners('docker', loopback, { HOST: '0.0.0.0' })).toEqual([]);
    const published = ['run', '-p', '3000:3000', 'img:1', '--host', '0.0.0.0'];
    const matches = findExposedListeners('docker', published, undefined);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ key: 2, confidence: 'medium' });
  });

  it.each([
    [['run', '--network', 'host', 'img:1', '--host', '0.0.0.0'], 5],
    [['run', '--net=host', 'img:1', '--bind', '::'], 4],
  ])('flags the inner bind of a host-network container %j', (args, key) => {
    const [match] = findExposedListeners('podman', args, undefined);
    expect(match).toMatchObject({ field: 'args', key, confidence: 'high' });
  });

  it.each(['HOST', 'MCP_HOST', 'FASTMCP_HOST', 'BIND_ADDRESS', 'LISTEN', 'SERVER_LISTEN_ADDR'])(
    'flags env %s=0.0.0.0',
    (name) => {
      const [match] = findExposedListeners('node', [], { [name]: '0.0.0.0' });
      expect(match).toMatchObject({ field: 'env', key: name });
    },
  );

  it('does not flag HOSTNAME, a loopback value, or an unrelated variable', () => {
    expect(
      findExposedListeners('node', [], {
        HOSTNAME: '0.0.0.0',
        HOST: '127.0.0.1',
        DATABASE_URL: '0.0.0.0',
        GHOST_TOKEN: '0.0.0.0',
      }),
    ).toEqual([]);
  });
});
