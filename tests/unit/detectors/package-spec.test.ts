import { describe, expect, it } from 'vitest';
import { isPinnedPackageSpec } from '../../../src/detectors/package-spec.js';

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
