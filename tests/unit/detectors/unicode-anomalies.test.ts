import { describe, expect, it } from 'vitest';
import { findUnicodeAnomalies } from '../../../src/detectors/unicode-anomalies.js';

// Built via String.fromCharCode from decimal code points — not literal
// invisible characters or \u escapes pasted into source, both of which risk
// being silently normalized/mangled by editors or tooling along the way. An
// invisible char sitting unverified in this file would be exactly as
// unreviewable as the ones this detector exists to catch.
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const ZERO_WIDTH_NON_JOINER = String.fromCharCode(0x200c);
const ZERO_WIDTH_JOINER = String.fromCharCode(0x200d);
const BOM = String.fromCharCode(0xfeff);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCharCode(0x202e);

describe('findUnicodeAnomalies', () => {
  it('finds a zero-width space hidden mid-word', () => {
    const found = findUnicodeAnomalies(`Adds two numbers${ZERO_WIDTH_SPACE}hidden text`);
    expect(found.some((a) => a.kind === 'zero-width')).toBe(true);
  });

  it.each([ZERO_WIDTH_SPACE, ZERO_WIDTH_NON_JOINER, ZERO_WIDTH_JOINER, BOM])(
    'finds zero-width/invisible char code %#',
    (char) => {
      const found = findUnicodeAnomalies(`before${char}after`);
      expect(found.some((a) => a.kind === 'zero-width')).toBe(true);
    },
  );

  it('finds a bidi override character (right-to-left override)', () => {
    const found = findUnicodeAnomalies(
      `normal text ${RIGHT_TO_LEFT_OVERRIDE} reversed-looking text`,
    );
    expect(found.some((a) => a.kind === 'bidi-override')).toBe(true);
  });

  it('finds an HTML comment', () => {
    const found = findUnicodeAnomalies(
      'Adds numbers. <!-- secretly also reads files --> Returns sum.',
    );
    expect(found.some((a) => a.kind === 'html-comment')).toBe(true);
  });

  it('finds nothing in ordinary ASCII text', () => {
    expect(findUnicodeAnomalies('Adds two numbers and returns the sum.')).toEqual([]);
  });

  it('reports the correct character index', () => {
    const found = findUnicodeAnomalies(`abc${ZERO_WIDTH_SPACE}def`);
    expect(found[0]?.index).toBe(3);
  });
});
