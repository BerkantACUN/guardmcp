import { describe, expect, it } from 'vitest';
import { isLoopbackHost, isPrivateOrMetadataHost } from '../../../src/detectors/url-risk.js';

describe('isLoopbackHost', () => {
  it.each(['localhost', '127.0.0.1', '127.5.5.5', '::1', 'LOCALHOST'])('%s is loopback', (host) => {
    expect(isLoopbackHost(host)).toBe(true);
  });

  it.each(['example.com', '10.0.0.1', 'api.internal', '192.168.1.1'])(
    '%s is not loopback',
    (host) => {
      expect(isLoopbackHost(host)).toBe(false);
    },
  );
});

describe('isPrivateOrMetadataHost', () => {
  it.each([
    ['169.254.169.254', 'cloud metadata service'],
    ['10.0.0.1', 'RFC1918 10.0.0.0/8'],
    ['10.255.255.255', 'RFC1918 10.0.0.0/8 upper bound'],
    ['172.16.0.1', 'RFC1918 172.16.0.0/12 lower bound'],
    ['172.31.255.255', 'RFC1918 172.16.0.0/12 upper bound'],
    ['192.168.1.1', 'RFC1918 192.168.0.0/16'],
    ['0.0.0.0', 'unspecified address'],
    ['some-host.internal', '.internal TLD'],
  ])('%s is flagged (%s)', (host) => {
    expect(isPrivateOrMetadataHost(host)).toBe(true);
  });

  it.each([
    ['example.com', 'public domain'],
    ['api.github.com', 'public domain'],
    ['172.32.0.1', 'just outside the 172.16/12 range'],
    ['172.15.255.255', 'just below the 172.16/12 range'],
    ['11.0.0.1', 'not in 10.0.0.0/8'],
  ])('%s is not flagged (%s)', (host) => {
    expect(isPrivateOrMetadataHost(host)).toBe(false);
  });
});
