import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// npm installs the bin on Linux/macOS as a symlink
// (node_modules/.bin/guardmcp -> ../guardmcp/dist/cli/index.js), so argv[1]
// is the link and import.meta.url is the real file. 0.16.0 compared the two
// without resolving the link and exited 0 silently — `npx guardmcp scan`
// on Linux did nothing and reported clean. This test runs the built CLI
// *through* a symlink the way npm does, so that cannot come back.

const execFileAsync = promisify(execFile);
const cliPath = fileURLToPath(new URL('../../dist/cli/index.js', import.meta.url));

let dir: string;
let link: string;
let canSymlink = true;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-symlink-'));
  link = join(dir, 'guardmcp');
  try {
    symlinkSync(cliPath, link, 'file');
  } catch {
    // Windows without Developer Mode refuses symlinks; npm uses .cmd shims there anyway.
    canSymlink = false;
  }
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('guardmcp invoked through a symlink (npm bin on Linux/macOS)', () => {
  it('still recognises itself as the entrypoint and runs', async () => {
    if (!canSymlink) return;
    const { stdout } = await execFileAsync(process.execPath, [link, '--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
