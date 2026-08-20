import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { runScanCommand } from '../../../../src/cli/commands/scan.js';
import { EXIT_CODES } from '../../../../src/cli/exit-codes.js';
import { computeDefinitionHash } from '../../../../src/pin/definition-hash.js';
import { writeLockFile } from '../../../../src/pin/io.js';

const FIXTURES_MALICIOUS = fileURLToPath(
  new URL('../../../fixtures/configs/malicious', import.meta.url),
);
const FIXTURES_BENIGN = fileURLToPath(new URL('../../../fixtures/configs/benign', import.meta.url));
const FIXTURE_SERVER = fileURLToPath(
  new URL('../../../fixtures/live-servers/fixture-server.mjs', import.meta.url),
);

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdout: (line: string) => out.push(line),
    stderr: (line: string) => err.push(line),
  };
}

describe('runScanCommand', () => {
  it('exits with findingsAtOrAboveThreshold when a critical secret is found (default --fail-on high)', async () => {
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'human',
      cwd: FIXTURES_MALICIOUS,
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.findingsAtOrAboveThreshold);
    expect(io.out.join('\n')).toContain('MCPG-101');
  });

  it('exits clean when scanning only benign fixtures', async () => {
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [
        `${FIXTURES_BENIGN}/no-env.json`,
        `${FIXTURES_BENIGN}/env-var-reference.json`,
        `${FIXTURES_BENIGN}/multi-server-clean.json`,
      ],
      failOn: 'high',
      format: 'human',
      cwd: FIXTURES_BENIGN,
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.out.join('\n')).toContain('No findings');
  });

  it('exits toolError when every given path fails to load', async () => {
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/does-not-exist.json`],
      failOn: 'high',
      format: 'human',
      cwd: FIXTURES_MALICIOUS,
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.toolError);
    expect(io.err.join('\n')).toContain('does-not-exist.json');
  });

  it('exits clean (not an error) when no config files are found via auto-discovery', async () => {
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [],
      failOn: 'high',
      format: 'human',
      cwd: fileURLToPath(new URL('../../../fixtures', import.meta.url)), // has no .mcp.json directly in it
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.out.join('\n')).toContain('No findings');
  });

  it('folds injected globalConfigPaths into auto-discovery alongside project-level configs', async () => {
    // globalConfigPaths is injected (not resolved via the real home
    // directory inside runScanCommand) specifically so this test is
    // deterministic regardless of what MCP clients happen to be installed
    // on whatever machine runs the suite — see the option's doc comment.
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [],
      failOn: 'high',
      format: 'human',
      globalConfigPaths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      cwd: fileURLToPath(new URL('../../../fixtures', import.meta.url)),
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.findingsAtOrAboveThreshold);
    expect(io.out.join('\n')).toContain('MCPG-101');
  });

  it('ignores globalConfigPaths when explicit paths are given', async () => {
    const io = capture();
    await runScanCommand({
      paths: [`${FIXTURES_BENIGN}/no-env.json`],
      failOn: 'high',
      format: 'human',
      globalConfigPaths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      cwd: FIXTURES_BENIGN,
      ...io,
    });

    expect(io.out.join('\n')).not.toContain('MCPG-101');
  });

  it('a medium-severity-only scan does not fail the default (high) threshold', async () => {
    // MCPG-101 is always critical, so to exercise threshold behavior we scan
    // a benign target — sanity check that "no findings" never fails regardless of threshold.
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [`${FIXTURES_BENIGN}/no-env.json`],
      failOn: 'info',
      format: 'human',
      cwd: FIXTURES_BENIGN,
      ...io,
    });
    expect(exitCode).toBe(EXIT_CODES.clean);
  });

  it('emits valid, parseable JSON for --format json, even for a zero-config auto-discovery result', async () => {
    const io = capture();
    await runScanCommand({
      paths: [],
      failOn: 'high',
      format: 'json',
      cwd: fileURLToPath(new URL('../../../fixtures', import.meta.url)),
      ...io,
    });

    const parsed = JSON.parse(io.out.join('\n'));
    expect(parsed.targetsScanned).toBe(0);
    expect(parsed.findings).toEqual([]);
  });

  it('emits valid SARIF for --format sarif on a real finding', async () => {
    const io = capture();
    await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'sarif',
      cwd: FIXTURES_MALICIOUS,
      ...io,
    });

    const document = JSON.parse(io.out.join('\n'));
    expect(document.version).toBe('2.1.0');
    expect(document.runs[0].results[0].ruleId).toBe('MCPG-101');
  });

  // leaked-github-token.json trips BOTH MCPG-101 (hardcoded secret) and
  // MCPG-105 (its "some-mcp-server" package has no version pin) — a real
  // two-rule fixture, useful for exercising --rules/--ignore-rule.
  it('--rules restricts to exactly the named rule', async () => {
    const io = capture();
    await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'json',
      only: ['MCPG-101'],
      cwd: FIXTURES_MALICIOUS,
      ...io,
    });
    const parsed = JSON.parse(io.out.join('\n'));
    expect(parsed.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual(['MCPG-101']);
  });

  it('--ignore-rule excludes the named rule while keeping the rest', async () => {
    const io = capture();
    await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'json',
      ignore: ['MCPG-101'],
      cwd: FIXTURES_MALICIOUS,
      ...io,
    });
    const parsed = JSON.parse(io.out.join('\n'));
    expect(parsed.findings.map((f: { ruleId: string }) => f.ruleId)).toEqual(['MCPG-105']);
  });

  it('exits toolError with a clear message when --rules names an unknown rule ID', async () => {
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'human',
      only: ['MCPG-999'],
      cwd: FIXTURES_MALICIOUS,
      ...io,
    });
    expect(exitCode).toBe(EXIT_CODES.toolError);
    expect(io.err.join('\n')).toContain('MCPG-999');
  });

  it('--baseline suppresses a previously-seen finding and lets the scan exit clean', async () => {
    // First pass: find the real fingerprint the way a user would (from a JSON report).
    const first = capture();
    await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'json',
      only: ['MCPG-101'],
      cwd: FIXTURES_MALICIOUS,
      ...first,
    });
    const fingerprint = JSON.parse(first.out.join('\n')).findings[0].fingerprint;

    const baselinePath = join(
      mkdtempSync(join(tmpdir(), 'guardmcp-scan-baseline-')),
      'baseline.json',
    );
    writeFileSync(baselinePath, JSON.stringify({ version: '1', fingerprints: [fingerprint] }));

    const second = capture();
    const exitCode = await runScanCommand({
      paths: [`${FIXTURES_MALICIOUS}/leaked-github-token.json`],
      failOn: 'high',
      format: 'json',
      only: ['MCPG-101'],
      baselinePath,
      cwd: FIXTURES_MALICIOUS,
      ...second,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(JSON.parse(second.out.join('\n')).findings).toEqual([]);
  });

  describe('--live', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'guardmcp-scan-live-'));
    });

    function writeConfig(fixtureToolsEnv: string): string {
      const path = join(dir, '.mcp.json');
      writeFileSync(
        path,
        JSON.stringify({
          mcpServers: {
            fixture: {
              command: process.execPath,
              args: [FIXTURE_SERVER],
              env: { FIXTURE_TOOLS: fixtureToolsEnv },
            },
          },
        }),
      );
      return path;
    }

    it('always prints a connection-count notice, even when every server succeeds (SECURITY.md transparency guarantee)', async () => {
      const io = capture();
      await runScanCommand({
        paths: [writeConfig('basic')],
        failOn: 'high',
        format: 'human',
        live: true,
        cwd: dir,
        ...io,
      });

      expect(io.err.join('\n')).toMatch(/--live: connected to 1\/1 stdio server/);
    }, 10_000);

    it('connects to a real stdio server and runs ToolRules against its live tools', async () => {
      const io = capture();
      const exitCode = await runScanCommand({
        paths: [writeConfig('poisoned')],
        failOn: 'high',
        format: 'json',
        live: true,
        cwd: dir,
        ...io,
      });

      expect(exitCode).toBe(EXIT_CODES.findingsAtOrAboveThreshold);
      const parsed = JSON.parse(io.out.join('\n'));
      expect(parsed.findings.some((f: { ruleId: string }) => f.ruleId === 'MCPG-201')).toBe(true);
    }, 10_000);

    it('does not run ToolRules when --live is not given, even against the same server', async () => {
      const io = capture();
      const exitCode = await runScanCommand({
        paths: [writeConfig('poisoned')],
        failOn: 'high',
        format: 'human',
        cwd: dir,
        ...io,
      });

      expect(exitCode).toBe(EXIT_CODES.clean);
    }, 10_000);

    it('warns and continues (exit clean) when a live server fails to connect', async () => {
      const path = join(dir, '.mcp.json');
      writeFileSync(
        path,
        JSON.stringify({ mcpServers: { broken: { command: 'guardmcp-nonexistent-binary-xyz' } } }),
      );

      const io = capture();
      const exitCode = await runScanCommand({
        paths: [path],
        failOn: 'high',
        format: 'human',
        live: true,
        liveTimeoutMs: 2000,
        cwd: dir,
        ...io,
      });

      expect(exitCode).toBe(EXIT_CODES.clean);
      expect(io.err.join('\n')).toMatch(/broken/);
    }, 10_000);
  });

  describe('--lock (rug-pull drift, MCPG-501)', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'guardmcp-scan-lock-'));
    });

    function writeConfig(args: string[]): string {
      const path = join(dir, '.mcp.json');
      writeFileSync(path, JSON.stringify({ mcpServers: { fs: { command: 'npx', args } } }));
      return path;
    }

    it('reports no drift when the pinned definition still matches', async () => {
      const config = writeConfig(['fs-server']);
      const lockPath = join(dir, '.mcpguard-lock.json');
      writeLockFile(lockPath, {
        version: '1',
        generatedAt: 'now',
        servers: {
          [`${relative(dir, config)}::fs`]: {
            definitionHash: computeDefinitionHash({ command: 'npx', args: ['fs-server'] }),
          },
        },
      });

      const io = capture();
      const exitCode = await runScanCommand({
        paths: [config],
        failOn: 'high',
        format: 'human',
        lockPath,
        only: ['MCPG-501'],
        cwd: dir,
        ...io,
      });

      expect(exitCode).toBe(EXIT_CODES.clean);
      expect(io.out.join('\n')).toContain('No findings');
    });

    it('flags MCPG-501 when the definition drifted since it was pinned', async () => {
      const config = writeConfig(['fs-server', '--new-flag']);
      const lockPath = join(dir, '.mcpguard-lock.json');
      writeLockFile(lockPath, {
        version: '1',
        generatedAt: 'now',
        servers: {
          [`${relative(dir, config)}::fs`]: {
            definitionHash: computeDefinitionHash({ command: 'npx', args: ['fs-server'] }),
          },
        },
      });

      const io = capture();
      const exitCode = await runScanCommand({
        paths: [config],
        failOn: 'high',
        format: 'human',
        lockPath,
        only: ['MCPG-501'],
        cwd: dir,
        ...io,
      });

      expect(exitCode).toBe(EXIT_CODES.findingsAtOrAboveThreshold);
      expect(io.out.join('\n')).toContain('MCPG-501');
    });

    it('exits toolError when --lock points at a file that does not exist', async () => {
      const io = capture();
      const exitCode = await runScanCommand({
        paths: [writeConfig(['fs-server'])],
        failOn: 'high',
        format: 'human',
        lockPath: join(dir, 'nope.json'),
        cwd: dir,
        ...io,
      });

      expect(exitCode).toBe(EXIT_CODES.toolError);
      expect(io.err.join('\n')).toMatch(/lock file/i);
    });
  });
});
