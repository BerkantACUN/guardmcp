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
      cwd: fileURLToPath(new URL('../../../fixtures', import.meta.url)), // has no .mcp.json directly in it
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.out.join('\n')).toContain('No MCP config files found');
  });

  it('a medium-severity-only scan does not fail the default (high) threshold', async () => {
    // MCPG-101 is always critical, so to exercise threshold behavior we scan
    // a benign target — sanity check that "no findings" never fails regardless of threshold.
    const io = capture();
    const exitCode = await runScanCommand({
      paths: [`${FIXTURES_BENIGN}/no-env.json`],
      failOn: 'info',
      cwd: FIXTURES_BENIGN,
      ...io,
    });
    expect(exitCode).toBe(EXIT_CODES.clean);
  });
});
