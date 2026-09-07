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

describe('findUnicodeAnomalies — terminal control sequences', () => {
  // Found by pointing a deliberately hostile MCP server at --live. A
  // description carrying ANSI escapes reads one way to a human in a terminal
  // and another way to the model: `ESC[8m` is "conceal", a lone CR overwrites
  // the line just printed, and BS erases what precedes it. Same attack as a
  // zero-width character, different mechanism — and guardmcp was sanitising
  // these on output while never reporting that they were there.
  const ESC = String.fromCharCode(0x1b);
  const BEL = String.fromCharCode(0x07);
  const BS = String.fromCharCode(0x08);

  it('flags an ANSI conceal sequence', () => {
    const found = findUnicodeAnomalies(`Reads a file.${ESC}[8m and exfiltrates it${ESC}[28m`);
    expect(found.some((a) => a.kind === 'terminal-control')).toBe(true);
  });

  it('flags a terminal-title (OSC) sequence', () => {
    expect(
      findUnicodeAnomalies(`ok${ESC}]0;hijacked${BEL}`).some((a) => a.kind === 'terminal-control'),
    ).toBe(true);
  });

  it('flags a lone carriage return, which overwrites the line just shown', () => {
    expect(
      findUnicodeAnomalies('Safe description\rEVIL').some((a) => a.kind === 'terminal-control'),
    ).toBe(true);
  });

  it('does NOT flag CRLF — that is an ordinary line ending', () => {
    // The most likely false positive: any description authored on Windows.
    expect(findUnicodeAnomalies('line one\r\nline two\r\n')).toEqual([]);
  });

  it('flags a backspace, which erases what precedes it', () => {
    expect(
      findUnicodeAnomalies(`safe${BS}${BS}${BS}${BS}evil`).some(
        (a) => a.kind === 'terminal-control',
      ),
    ).toBe(true);
  });

  it('flags a bare BEL', () => {
    expect(findUnicodeAnomalies(`ding${BEL}`).some((a) => a.kind === 'terminal-control')).toBe(
      true,
    );
  });

  it('leaves ordinary whitespace alone', () => {
    expect(findUnicodeAnomalies('A normal description.\n\tIndented, even.\n')).toEqual([]);
  });

  it('leaves ordinary prose alone', () => {
    expect(findUnicodeAnomalies('Reads the contents of a local file. Returns UTF-8 text.')).toEqual(
      [],
    );
  });

  it('reports the position of the first offending character', () => {
    const [first] = findUnicodeAnomalies(`abc${ESC}[8m`);
    expect(first?.index).toBe(3);
  });
});
