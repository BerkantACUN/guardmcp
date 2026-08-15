import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A hardcoded relative path like `require('../package.json')` breaks after
 * bundling: tsup bundles this module INTO dist/cli/index.js, so the literal
 * path is resolved relative to dist/cli/ at runtime, not relative to this
 * source file's original location — the exact bug that shipped once
 * already. Walking up from wherever this code actually runs, looking for
 * package.json, is depth-independent and survives any bundler layout.
 */
function findPackageJson(startDir: string): { name: string; version: string; description: string } {
  const require = createRequire(import.meta.url);
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    try {
      return require(join(dir, 'package.json'));
    } catch {
      const parent = dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  }
  throw new Error(`Could not locate package.json by walking up from ${startDir}`);
}

const pkg = findPackageJson(dirname(fileURLToPath(import.meta.url)));

export const PACKAGE_NAME = pkg.name;
export const PACKAGE_VERSION = pkg.version;
export const PACKAGE_DESCRIPTION = pkg.description;
export const PACKAGE_HOMEPAGE = 'https://github.com/BerkantACUN/guardmcp';
