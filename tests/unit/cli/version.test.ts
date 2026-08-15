import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createCli } from '../../../src/cli/index.js';

const pkgPath = fileURLToPath(new URL('../../../package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name: string; version: string };

describe('createCli', () => {
  it('exposes the package name', () => {
    expect(createCli().name()).toBe(pkg.name);
  });

  it('exposes the package version', () => {
    expect(createCli().version()).toBe(pkg.version);
  });
});
