import { describe, expect, it } from 'vitest';
import { classifySensitiveUri } from '../../../src/detectors/sensitive-uri.js';

describe('classifySensitiveUri', () => {
  it.each([
    ['file:///home/u/.ssh/id_rsa', 'private key'],
    ['file:///Users/u/.aws/credentials', 'cloud credentials'],
    ['file:///home/u/.kube/config', 'cluster credentials'],
    ['file:///srv/app/.env', 'environment file'],
    ['file:///home/u/.git-credentials', 'stored credentials'],
    ['file:///home/u/.npmrc', 'stored credentials'],
    ['file:///etc/shadow', 'system account file'],
  ])('classifies %s as %s', (uri, label) => {
    expect(classifySensitiveUri(uri)?.label).toContain(label);
  });

  it('flags a whole-filesystem resource', () => {
    for (const uri of ['file:///', 'file://C:/', 'file:///home/u']) {
      expect(classifySensitiveUri(uri)?.kind, uri).toBe('broad-scope');
    }
  });

  it('flags a cloud metadata endpoint offered as a resource', () => {
    const hit = classifySensitiveUri('http://169.254.169.254/latest/meta-data/');
    expect(hit?.kind).toBe('internal-endpoint');
  });

  it('flags private-network endpoints', () => {
    expect(classifySensitiveUri('https://10.0.0.5/internal')?.kind).toBe('internal-endpoint');
    expect(classifySensitiveUri('http://192.168.1.1/admin')?.kind).toBe('internal-endpoint');
  });

  it('is case-insensitive about the path', () => {
    expect(classifySensitiveUri('file:///Home/U/.SSH/ID_RSA')).not.toBeNull();
  });

  it('leaves ordinary resources alone', () => {
    for (const uri of [
      'file:///srv/project/README.md',
      'https://api.example.com/docs',
      'db://reports/monthly',
      'file:///srv/project/src/index.ts',
    ]) {
      expect(classifySensitiveUri(uri), uri).toBeNull();
    }
  });

  it('does not throw on a malformed or exotic uri', () => {
    for (const uri of ['', 'not a uri', '::::', 'custom-scheme:opaque']) {
      expect(() => classifySensitiveUri(uri)).not.toThrow();
    }
  });
});
