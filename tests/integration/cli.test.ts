import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

// Exercises the BUILT artifact (dist/cli/index.js) as a real subprocess, the
// way an actual user (or `npx`) invokes it. Unit tests only import createCli()
// in-process and can't catch bugs in the entrypoint wiring itself — e.g. a
// duplicate shebang from tsup's banner colliding with a source-level shebang,
// or a Windows-broken "is this the main module" check. Both bit us during
// Phase 0; this test exists so they can't come back silently.

const execFileAsync = promisify(execFile);

const cliPath = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));
const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string; name: string };
const FIXTURES = fileURLToPath(new URL('../fixtures/configs', import.meta.url));

interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** execFile rejects on non-zero exit — `scan` legitimately exits 1 when it
 * finds something, so callers need the exit code, not a thrown error. */
async function runCli(args: string[]): Promise<CliResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, ...args]);
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
  }
}

describe('guardmcp CLI (built artifact)', () => {
  it('prints the package version for --version', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, '--version']);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('prints usage for --help, mentioning the package name', async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath, '--help']);
    expect(stdout).toContain(pkg.name);
  });

  it('exits 0 on success', async () => {
    await expect(execFileAsync(process.execPath, [cliPath, '--version'])).resolves.toBeDefined();
  });
});

describe('guardmcp scan (built artifact) — Phase 1 demo scenario', () => {
  it('finds a hardcoded secret, prints it, and exits 1', async () => {
    const result = await runCli(['scan', `${FIXTURES}/malicious/leaked-github-token.json`]);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('MCPG-101');
    expect(result.stdout).toContain('CRITICAL');
    expect(result.stdout).not.toContain('1234567890abcdefghijklmnopqrstuvwxyz12'); // never the raw secret
  });

  it('exits 0 and reports clean on a benign config', async () => {
    const result = await runCli(['scan', `${FIXTURES}/benign/no-env.json`]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No findings');
  });

  it('rejects an invalid --fail-on value with a clear error, non-zero exit', async () => {
    const result = await runCli([
      'scan',
      `${FIXTURES}/benign/no-env.json`,
      '--fail-on',
      'nonsense',
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('Invalid --fail-on value');
  });
});
