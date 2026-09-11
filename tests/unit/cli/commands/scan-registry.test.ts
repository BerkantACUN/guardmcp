import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runScanCommand } from '../../../../src/cli/commands/scan.js';

/**
 * The --registry wiring, with the registry faked. What is under test is the
 * boundary: the CLI asks about exactly the launched packages, hands the
 * answers to the rule, reports the ones it could not resolve, and never lets
 * a registry failure abort the scan.
 */
let dir: string;
let configPath: string;

const NPM_DEFAULT =
  'Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.';

function packument(name: string, deprecated?: string) {
  return {
    name,
    'dist-tags': { latest: '1.0.0' },
    versions: { '1.0.0': { version: '1.0.0', ...(deprecated ? { deprecated } : {}) } },
  };
}

/** A registry that knows two packages and 404s everything else. */
function fakeRegistry(requests: string[]) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/@scope%2Fdead')) {
      return new Response(JSON.stringify(packument('@scope/dead', NPM_DEFAULT)), { status: 200 });
    }
    if (url.endsWith('/alive')) {
      return new Response(JSON.stringify(packument('alive')), { status: 200 });
    }
    return new Response('{"error":"Not found"}', { status: 404 });
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-registry-'));
  configPath = join(dir, '.mcp.json');
  writeFileSync(
    configPath,
    JSON.stringify({
      mcpServers: {
        dead: { command: 'npx', args: ['-y', '@scope/dead@1.0.0'] },
        alive: { command: 'npx', args: ['-y', 'alive@1.0.0'] },
        unknown: { command: 'npx', args: ['-y', 'nobody-knows@1.0.0'] },
        remote: { type: 'http', url: 'https://example.com/mcp' },
        python: { command: 'uvx', args: ['some-python-server'] },
      },
    }),
  );
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function scan(registry: boolean, requests: string[] = []) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runScanCommand({
    paths: [configPath],
    cwd: dir,
    failOn: 'critical',
    format: 'json',
    stdout: (r) => out.push(r),
    stderr: (l) => err.push(l),
    ...(registry ? { registry: true, registryFetch: fakeRegistry(requests) } : {}),
  });
  const findings = JSON.parse(out.join('')).findings as { ruleId: string; logicalPath: string }[];
  return { code, findings, err: err.join('\n'), requests };
}

describe('scan --registry', () => {
  it('reports the deprecated package and leaves the healthy one alone', async () => {
    const { findings } = await scan(true);
    const deprecated = findings.filter((f) => f.ruleId === 'MCPG-106');
    expect(deprecated.map((f) => f.logicalPath)).toEqual(['/mcpServers/dead/args/1']);
  });

  it('asks the registry only about npm-launched packages', async () => {
    // Not the http server, not the uvx one: neither has an npm package to ask about.
    const { requests } = await scan(true);
    const asked = requests.map((u) => u.split('registry.npmjs.org/')[1]).sort();
    expect(asked).toEqual(['@scope%2Fdead', 'alive', 'nobody-knows']);
  });

  it('names the packages it could not resolve instead of pretending it checked them', async () => {
    const { err } = await scan(true);
    expect(err).toMatch(/could not look up 1 package/);
    expect(err).toContain('nobody-knows');
  });

  it('does not turn an unresolved package into a finding', async () => {
    const { findings } = await scan(true);
    expect(findings.some((f) => f.logicalPath.includes('/unknown/'))).toBe(false);
  });

  it('never touches the registry without the flag', async () => {
    const requests: string[] = [];
    const { findings } = await scan(false, requests);
    expect(requests).toEqual([]);
    expect(findings.some((f) => f.ruleId === 'MCPG-106')).toBe(false);
  });

  it('survives a registry that is completely down', async () => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runScanCommand({
      paths: [configPath],
      cwd: dir,
      failOn: 'critical',
      format: 'json',
      stdout: (r) => out.push(r),
      stderr: (l) => err.push(l),
      registry: true,
      registryFetch: async () => {
        throw new Error('ENOTFOUND registry.npmjs.org');
      },
    });
    // The scan completes, the other rules still run, and the user is told.
    expect(code).not.toBe(2);
    expect(JSON.parse(out.join('')).findings.length).toBeGreaterThan(0);
    expect(err.join('\n')).toMatch(/could not look up 3 package/);
  });
});
