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
