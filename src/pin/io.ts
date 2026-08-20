import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCK_FILE_VERSION, type LockFile, LockFileSchema } from './lockfile-schema.js';

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
  // Shape-valid but from an incompatible format version: silently trusting
  // it risks a future version bump changing field semantics (e.g. what a
  // hash is computed over) without guardmcp ever noticing the lock file
  // predates that change — the rug-pull rules would then compare against
  // data that means something different than what they assume today.
  if (result.data.version !== LOCK_FILE_VERSION) {
    throw new LockFileLoadError(
      filePath,
      new Error(
        `Lock file version "${result.data.version}" is not supported (expected "${LOCK_FILE_VERSION}"). Re-run "guardmcp pin" to regenerate it.`,
      ),
    );
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
