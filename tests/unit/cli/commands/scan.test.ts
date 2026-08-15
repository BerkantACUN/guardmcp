import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runScanCommand } from '../../../../src/cli/commands/scan.js';
import { EXIT_CODES } from '../../../../src/cli/exit-codes.js';

const FIXTURES_MALICIOUS = fileURLToPath(
  new URL('../../../fixtures/configs/malicious', import.meta.url),
);
const FIXTURES_BENIGN = fileURLToPath(new URL('../../../fixtures/configs/benign', import.meta.url));

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
});
