import { describe, expect, it } from 'vitest';
import { fetchNpmPackageStatus, interpretNpmPackument } from '../../../src/registry/npm.js';

/**
 * Shaped like the real registry response for @modelcontextprotocol/server-postgres
 * on 2026-09-11, trimmed. Two things about that shape drive the implementation:
 * there is no top-level `deprecated` field — it lives on each version — and
 * `repository` can be absent entirely.
 */
function packument(over: Record<string, unknown> = {}) {
  return {
    name: '@modelcontextprotocol/server-postgres',
    'dist-tags': { latest: '0.6.2' },
    versions: {
      '0.6.1': { version: '0.6.1' },
      '0.6.2': { version: '0.6.2' },
    },
    ...over,
  };
}

const NPM_DEFAULT_MESSAGE =
  'Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.';

describe('interpretNpmPackument', () => {
  it('reads deprecation off the latest version, because that is where npm puts it', () => {
    const status = interpretNpmPackument(
      packument({
        versions: {
          '0.6.1': { version: '0.6.1', deprecated: NPM_DEFAULT_MESSAGE },
          '0.6.2': { version: '0.6.2', deprecated: NPM_DEFAULT_MESSAGE },
        },
      }),
    );
    expect(status?.deprecated).toBe(NPM_DEFAULT_MESSAGE);
    expect(status?.latestVersion).toBe('0.6.2');
  });

  it('distinguishes a whole package being deprecated from one old version', () => {
    // `npm deprecate pkg@"*"` marks every version — the package is abandoned.
    // `npm deprecate pkg@1.0.0` marks one — the package is fine, that release is not.
    const whole = interpretNpmPackument(
      packument({
        versions: {
          '0.6.1': { version: '0.6.1', deprecated: 'x' },
          '0.6.2': { version: '0.6.2', deprecated: 'x' },
        },
      }),
    );
    const oneOld = interpretNpmPackument(
      packument({
        versions: {
          '0.6.1': { version: '0.6.1', deprecated: 'use 0.6.2' },
          '0.6.2': { version: '0.6.2' },
        },
      }),
    );
    expect(whole?.allVersionsDeprecated).toBe(true);
    expect(oneOld?.deprecated).toBeNull(); // latest is fine
    expect(oneOld?.allVersionsDeprecated).toBe(false);
  });

  it('flags the npm default text, which points users at npm support rather than a fix', () => {
    const status = interpretNpmPackument(
      packument({ versions: { '0.6.2': { version: '0.6.2', deprecated: NPM_DEFAULT_MESSAGE } } }),
    );
    expect(status?.deprecationIsGeneric).toBe(true);
  });

  it('does not flag a message that actually names a replacement', () => {
    const status = interpretNpmPackument(
      packument({
        versions: { '0.6.2': { version: '0.6.2', deprecated: 'Moved to @acme/new-server' } },
      }),
    );
    expect(status?.deprecationIsGeneric).toBe(false);
  });

  it('reports a healthy package as not deprecated', () => {
    const status = interpretNpmPackument(packument());
    expect(status?.deprecated).toBeNull();
    expect(status?.allVersionsDeprecated).toBe(false);
  });

  it('survives a repository field that is a string, an object, or missing', () => {
    expect(interpretNpmPackument(packument({ repository: 'github:a/b' }))?.repositoryUrl).toBe(
      'github:a/b',
    );
    expect(
      interpretNpmPackument(packument({ repository: { type: 'git', url: 'git+https://x/y.git' } }))
        ?.repositoryUrl,
    ).toBe('git+https://x/y.git');
    expect(interpretNpmPackument(packument())?.repositoryUrl).toBeNull();
  });

  it('returns null for something that is not a packument', () => {
    expect(interpretNpmPackument(null)).toBeNull();
    expect(interpretNpmPackument({ error: 'Not found' })).toBeNull();
    expect(interpretNpmPackument('string')).toBeNull();
  });
});

describe('fetchNpmPackageStatus', () => {
  // The fetch is injectable so this never touches the network. What is
  // tested is the contract around it: encoding, 404s, and failures that must
  // not become exceptions — a registry hiccup can never abort a scan.
  it('percent-encodes a scoped name the way the registry requires', async () => {
    let requested = '';
    await fetchNpmPackageStatus('@scope/name', async (url) => {
      requested = String(url);
      return new Response(JSON.stringify(packument({ name: '@scope/name' })), { status: 200 });
    });
    expect(requested).toBe('https://registry.npmjs.org/@scope%2Fname');
  });

  it('returns null on 404 rather than throwing', async () => {
    const status = await fetchNpmPackageStatus(
      'nope',
      async () => new Response('{"error":"Not found"}', { status: 404 }),
    );
    expect(status).toBeNull();
  });

  it('returns null when the network fails, and never throws', async () => {
    const status = await fetchNpmPackageStatus('x', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(status).toBeNull();
  });
});
