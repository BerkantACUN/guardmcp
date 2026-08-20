import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type LockFile, LockFileSchema } from './lockfile-schema.js';

export class LockFileLoadError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(`Failed to load lock file at ${filePath}: ${errorMessage(cause)}`, { cause });
    this.name = 'LockFileLoadError';
  }
}

export function loadLockFile(filePath: string): LockFile {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new LockFileLoadError(filePath, err);
  }
  const result = LockFileSchema.safeParse(raw);
  if (!result.success) {
    throw new LockFileLoadError(filePath, result.error);
  }
  return result.data;
}

export function writeLockFile(filePath: string, lock: LockFile): void {
  writeFileSync(filePath, `${JSON.stringify(lock, null, 2)}\n`, 'utf-8');
}

/**
 * The default lock file location `scan` auto-detects with no `--lock` flag
 * — mirrors the zero-friction philosophy of config auto-discovery (see
 * discovery/locators): once a project has pinned once, rug-pull checks
 * apply on every future scan with no extra flag to remember.
 */
export function defaultLockFilePath(cwd: string): string {
  return join(cwd, '.mcpguard-lock.json');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
