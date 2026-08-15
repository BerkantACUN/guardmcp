import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PACKAGE_DESCRIPTION,
  PACKAGE_HOMEPAGE,
  PACKAGE_NAME,
  PACKAGE_VERSION,
} from '../../src/package-info.js';

const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
  name: string;
  version: string;
  description: string;
};

describe('package-info', () => {
  it('matches the real package.json (source-level import — the bundled-artifact case is covered by tests/integration/cli.test.ts)', () => {
    expect(PACKAGE_NAME).toBe(pkg.name);
    expect(PACKAGE_VERSION).toBe(pkg.version);
    expect(PACKAGE_DESCRIPTION).toBe(pkg.description);
  });

  it('exposes a real https homepage URL', () => {
    expect(PACKAGE_HOMEPAGE).toMatch(/^https:\/\/github\.com\//);
  });
});
