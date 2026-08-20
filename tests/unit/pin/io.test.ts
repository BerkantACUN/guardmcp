import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultLockFilePath,
  LockFileLoadError,
  loadLockFile,
  writeLockFile,
} from '../../../src/pin/io.js';
import type { LockFile } from '../../../src/pin/lockfile-schema.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'guardmcp-pin-io-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const SAMPLE_LOCK: LockFile = {
  version: '1',
  generatedAt: '2026-01-01T00:00:00.000Z',
  servers: { '.mcp.json::fs': { definitionHash: 'sha256:abc' } },
};

describe('writeLockFile / loadLockFile', () => {
  it('round-trips a lock file exactly', () => {
    const path = join(dir, '.mcpguard-lock.json');
    writeLockFile(path, SAMPLE_LOCK);
    expect(loadLockFile(path)).toEqual(SAMPLE_LOCK);
  });

  it('throws LockFileLoadError for a missing file', () => {
    expect(() => loadLockFile(join(dir, 'nope.json'))).toThrow(LockFileLoadError);
  });

  it('throws LockFileLoadError for invalid JSON', () => {
    const path = join(dir, 'bad.json');
    writeFileSync(path, '{ not json');
    expect(() => loadLockFile(path)).toThrow(LockFileLoadError);
  });

  it('throws LockFileLoadError for JSON that does not match the schema', () => {
    const path = join(dir, 'wrong-shape.json');
    writeFileSync(path, JSON.stringify({ hello: 'world' }));
    expect(() => loadLockFile(path)).toThrow(LockFileLoadError);
  });

  it('throws LockFileLoadError for a shape-valid lock file from an unsupported future version', () => {
    const path = join(dir, 'future-version.json');
    writeFileSync(path, JSON.stringify({ ...SAMPLE_LOCK, version: '99' }));
    expect(() => loadLockFile(path)).toThrow(LockFileLoadError);
    expect(() => loadLockFile(path)).toThrow(/version "99" is not supported/);
  });
});

describe('defaultLockFilePath', () => {
  it('joins cwd with .mcpguard-lock.json', () => {
    expect(defaultLockFilePath('/some/project')).toBe(join('/some/project', '.mcpguard-lock.json'));
  });
});
