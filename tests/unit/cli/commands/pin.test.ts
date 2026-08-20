import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { runPinCommand } from '../../../../src/cli/commands/pin.js';
import { EXIT_CODES } from '../../../../src/cli/exit-codes.js';

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

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-pin-cmd-'));
});

function writeConfig(env: Record<string, string> = {}): string {
  const path = join(dir, '.mcp.json');
  writeFileSync(
    path,
    JSON.stringify({
      mcpServers: { fixture: { command: process.execPath, args: [FIXTURE_SERVER], env } },
    }),
  );
  return path;
}

describe('runPinCommand', () => {
  it('writes a lock file with a definitionHash for each server, keyed by relativePath::serverName', async () => {
    const config = writeConfig();
    const outputPath = join(dir, '.mcpguard-lock.json');
    const io = capture();

    const exitCode = await runPinCommand({
      paths: [config],
      cwd: dir,
      outputPath,
      now: () => new Date('2026-01-01T00:00:00.000Z'),
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.out.join('\n')).toMatch(/Pinned 1 server/);
    const lock = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(lock.version).toBe('1');
    expect(lock.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    const key = `${relative(dir, config)}::fixture`;
    expect(lock.servers[key].definitionHash).toMatch(/^sha256:/);
    expect(lock.servers[key].toolsHash).toBeUndefined();
  });

  it('--live also records a toolsHash from the real live tool list', async () => {
    const config = writeConfig();
    const outputPath = join(dir, '.mcpguard-lock.json');
    const io = capture();

    const exitCode = await runPinCommand({
      paths: [config],
      cwd: dir,
      outputPath,
      live: true,
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.out.join('\n')).toMatch(/1 with live tool hashes/);
    const lock = JSON.parse(readFileSync(outputPath, 'utf-8'));
    const key = `${relative(dir, config)}::fixture`;
    expect(lock.servers[key].toolsHash).toMatch(/^sha256:/);
  }, 10_000);

  it('--live warns and still pins the rest when one server fails to connect', async () => {
    const path = join(dir, '.mcp.json');
    writeFileSync(
      path,
      JSON.stringify({
        mcpServers: {
          broken: { command: 'guardmcp-nonexistent-binary-xyz' },
          fixture: { command: process.execPath, args: [FIXTURE_SERVER] },
        },
      }),
    );
    const outputPath = join(dir, '.mcpguard-lock.json');
    const io = capture();

    const exitCode = await runPinCommand({
      paths: [path],
      cwd: dir,
      outputPath,
      live: true,
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.err.join('\n')).toMatch(/broken/);
    const lock = JSON.parse(readFileSync(outputPath, 'utf-8'));
    expect(Object.keys(lock.servers)).toHaveLength(2);
  }, 10_000);

  it('exits clean with no lock entries when there is nothing to pin', async () => {
    const io = capture();
    const exitCode = await runPinCommand({
      paths: [],
      cwd: dir,
      outputPath: join(dir, 'lock.json'),
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.clean);
    expect(io.err.join('\n')).toMatch(/no mcp config/i);
  });

  it('exits toolError when an explicit path fails to load', async () => {
    const io = capture();
    const exitCode = await runPinCommand({
      paths: [join(dir, 'does-not-exist.json')],
      cwd: dir,
      outputPath: join(dir, 'lock.json'),
      ...io,
    });

    expect(exitCode).toBe(EXIT_CODES.toolError);
    expect(io.err.join('\n')).toMatch(/does-not-exist\.json/);
  });
});
