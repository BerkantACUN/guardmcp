import { describe, expect, it } from 'vitest';
import { isPinnedPackageSpec, parsePackageSpec } from '../../../src/detectors/package-spec.js';

describe('isPinnedPackageSpec', () => {
  it.each([
    ['@modelcontextprotocol/server-filesystem@2025.8.21', true],
    ['some-tool@1.4.0', true],
    ['some-tool@v1.4.0', true],
    ['@modelcontextprotocol/server-filesystem', false], // scoped, no version at all
    ['some-tool', false], // unscoped, no version at all
    ['some-tool@latest', false], // a moving tag is not a pin
    ['some-tool@next', false],
    ['some-tool@canary', false],
    ['some-tool@beta', false],
    ['some-tool@', false], // empty version after @
  ])('%s -> pinned=%s', (spec, expected) => {
    expect(isPinnedPackageSpec(spec)).toBe(expected);
  });
});

describe('parsePackageSpec', () => {
  // The name is what a registry lookup needs, and it is the part a scoped
  // spec makes easy to get wrong: the leading '@' is a scope marker, not a
  // version separator.
  it.each([
    ['@modelcontextprotocol/server-postgres', '@modelcontextprotocol/server-postgres', null],
    [
      '@modelcontextprotocol/server-postgres@0.6.2',
      '@modelcontextprotocol/server-postgres',
      '0.6.2',
    ],
    ['some-tool', 'some-tool', null],
    ['some-tool@1.4.0', 'some-tool', '1.4.0'],
    ['some-tool@latest', 'some-tool', 'latest'],
  ])('%s -> name=%s version=%s', (spec, name, version) => {
    expect(parsePackageSpec(spec)).toEqual({ name, version });
  });

  it('returns null for something that is not a package spec at all', () => {
    expect(parsePackageSpec('')).toBeNull();
    expect(parsePackageSpec('./local/path.js')).toBeNull();
    expect(parsePackageSpec('/abs/path')).toBeNull();
  });
});
