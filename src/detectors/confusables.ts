/**
 * Characters that render as ASCII letters but are not ASCII letters.
 *
 * Built from code points rather than written literally, for a sharper version
 * of the reason `unicode-anomalies.ts` does the same. There, the characters
 * are invisible and a reviewer cannot see them. Here they are fully visible
 * and look exactly like the ASCII they mimic — a table written as `'а': 'a'`
 * is unreviewable, because nothing on the page tells you which side is
 * Cyrillic. Code points say it outright.
 *
 * Only mappings where the glyphs are genuinely indistinguishable in the fonts
 * a terminal or an approval dialog actually uses. Pairs that merely look
 * similar (Cyrillic д, Greek λ) are left out: a rule that fires on those
 * would fire on ordinary non-English tool names, which is a good way to teach
 * someone to ignore it.
 */

const CYRILLIC: readonly (readonly [number, string])[] = [
  [0x0430, 'a'],
  [0x0435, 'e'],
  [0x043e, 'o'],
  [0x0440, 'p'],
  [0x0441, 'c'],
  [0x0443, 'y'],
  [0x0445, 'x'],
  [0x0455, 's'],
  [0x0456, 'i'],
  [0x0458, 'j'],
  [0x04bb, 'h'],
];

const GREEK: readonly (readonly [number, string])[] = [
  [0x03b1, 'a'],
  [0x03b5, 'e'],
  [0x03b9, 'i'],
  [0x03ba, 'k'],
  [0x03bd, 'v'],
  [0x03bf, 'o'],
  [0x03c1, 'p'],
  [0x03c5, 'u'],
  [0x03c7, 'x'],
];

/** Fullwidth Latin small letters render as ordinary letters at most sizes. */
const FULLWIDTH: readonly (readonly [number, string])[] = Array.from(
  { length: 26 },
  (_, index) => [0xff41 + index, String.fromCharCode(0x61 + index)] as const,
);

const CONFUSABLES = new Map<string, string>(
  [...CYRILLIC, ...GREEK, ...FULLWIDTH].map(([codePoint, ascii]) => [
    String.fromCodePoint(codePoint),
    ascii,
  ]),
);

export interface ConfusableCharacter {
  readonly char: string;
  /** Formatted as `U+0430`, which is the only way to name it unambiguously. */
  readonly codePoint: string;
  readonly looksLike: string;
  readonly index: number;
}

/**
 * The ASCII skeleton of `value`: every confusable replaced by what it mimics.
 * Two names with the same skeleton are two names a human reads identically.
 */
export function foldConfusables(value: string): string {
  let folded = '';
  for (const char of value) {
    folded += CONFUSABLES.get(char.toLowerCase()) ?? char;
  }
  return folded;
}

/** Every mimicking character in `value`, in order. Empty for plain ASCII. */
export function findConfusables(value: string): ConfusableCharacter[] {
  const found: ConfusableCharacter[] = [];
  let index = 0;

  for (const char of value) {
    const looksLike = CONFUSABLES.get(char.toLowerCase());
    if (looksLike !== undefined) {
      found.push({ char, codePoint: formatCodePoint(char), looksLike, index });
    }
    index += char.length;
  }

  return found;
}

function formatCodePoint(char: string): string {
  const code = char.codePointAt(0) ?? 0;
  return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}
