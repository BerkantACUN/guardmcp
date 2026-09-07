import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInitCommand, WORKFLOW_PATH } from '../../../../src/cli/commands/init.js';

let cwd: string;
const out: string[] = [];
const err: string[] = [];
const io = { stdout: (s: string) => out.push(s), stderr: (s: string) => err.push(s) };

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'guardmcp-init-'));
  out.length = 0;
  err.length = 0;
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('guardmcp init', () => {
  it('writes a workflow and exits clean', () => {
    expect(runInitCommand({ cwd, ...io })).toBe(0);
    const yml = readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8');
    expect(yml).toContain('uses: BerkantACUN/guardmcp@v');
    expect(yml).toContain('upload-sarif');
  });

  it('requests the permission SARIF upload actually needs', () => {
    runInitCommand({ cwd, ...io });
    const yml = readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8');
    // Without security-events: write the scan runs and the findings silently
    // never reach the Security tab — the most common way this setup fails.
    expect(yml).toMatch(/security-events:\s*write/);
  });

  it('still uploads the SARIF when the scan fails the build', () => {
    runInitCommand({ cwd, ...io });
    const yml = readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8');
    expect(yml).toMatch(/if:\s*always\(\)/);
  });

  it('does not enable --live, which spawns server processes', () => {
    runInitCommand({ cwd, ...io });
    const yml = readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8');
    expect(yml).not.toMatch(/^\s+live:\s*true/m);
    // ...but tells the user it exists.
    expect(out.join('\n')).toContain('--live');
  });

  it('honours --fail-on', () => {
    runInitCommand({ cwd, failOn: 'critical', ...io });
    expect(readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8')).toContain('fail-on: critical');
  });

  it('refuses to clobber an existing workflow', () => {
    mkdirSync(dirname(join(cwd, WORKFLOW_PATH)), { recursive: true });
    writeFileSync(join(cwd, WORKFLOW_PATH), 'mine', 'utf-8');

    expect(runInitCommand({ cwd, ...io })).not.toBe(0);
    expect(readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8')).toBe('mine');
    expect(err.join('\n')).toMatch(/--force/);
  });

  it('overwrites with --force', () => {
    mkdirSync(dirname(join(cwd, WORKFLOW_PATH)), { recursive: true });
    writeFileSync(join(cwd, WORKFLOW_PATH), 'mine', 'utf-8');

    expect(runInitCommand({ cwd, force: true, ...io })).toBe(0);
    expect(readFileSync(join(cwd, WORKFLOW_PATH), 'utf-8')).toContain('guardmcp');
  });
});
