export type UnicodeAnomalyKind =
  | 'zero-width'
  | 'bidi-override'
  | 'html-comment'
  | 'terminal-control';

export interface UnicodeAnomaly {
  readonly kind: UnicodeAnomalyKind;
  readonly index: number;
}

// Built from code points, not literal characters in this file's source, for
// the same reason the test file avoids them: an invisible/bidi character
// sitting unverified in our own source would be unreviewable.
const ZERO_WIDTH_CHARS = [0x200b, 0x200c, 0x200d, 0xfeff].map((code) => String.fromCharCode(code));
const BIDI_OVERRIDE_RANGE_START = 0x202a;
const BIDI_OVERRIDE_RANGE_END = 0x202e;
const BIDI_ISOLATE_RANGE_START = 0x2066;
const BIDI_ISOLATE_RANGE_END = 0x2069;

const ZERO_WIDTH_PATTERN = new RegExp(`[${ZERO_WIDTH_CHARS.join('')}]`, 'g');
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * C0 control characters that change what a terminal DISPLAYS without changing
 * what the model RECEIVES:
 *
 *   ESC (0x1b)  starts an ANSI/OSC sequence. `ESC[8m` is "conceal", so text
 *               between it and `ESC[28m` is invisible to a human reader;
 *               `ESC]0;...BEL` rewrites the window title.
 *   BS  (0x08)  erases the character before it.
 *   BEL (0x07)  and the remaining C0 codes have no business in prose.
 *
 * Excluded: TAB and LF, ordinary in a description. CR is handled separately —
 * a lone CR overwrites the line just printed, but CRLF is a Windows line
 * ending and flagging that would fire on a large share of honest text.
 *
 * Found by pointing a deliberately hostile MCP server at `--live`: guardmcp
 * was already sanitising these on output, so a reviewer's terminal was safe,
 * but nothing told the reviewer the server had sent them.
 */
const C0_CONTROL_RANGES: readonly (readonly [number, number])[] = [
  [0x00, 0x08], // NUL..BS — BS erases the character before it
  [0x0b, 0x0c], // VT, FF
  [0x0e, 0x1f], // SO..US  — includes ESC (0x1b), which starts ANSI/OSC
  [0x7f, 0x7f], // DEL
];

/** Assembled from code points via String.fromCharCode, exactly as
 * ZERO_WIDTH_CHARS above is and for the same reason: a raw control byte
 * sitting in this file's source would be unreviewable. Building the pattern
 * from a string rather than writing a regex literal also means the lint rule
 * against control characters in regexes is genuinely satisfied here, not
 * suppressed. */
const C0_CONTROL_CHARS = C0_CONTROL_RANGES.flatMap(([lo, hi]) =>
  Array.from({ length: hi - lo + 1 }, (_, offset) => String.fromCharCode(lo + offset)),
);

const C0_CONTROL = new RegExp(`[${C0_CONTROL_CHARS.join('')}]`, 'g');

/** A lone CR overwrites the line just printed. CRLF is a Windows line ending;
 * flagging that would fire on a large share of perfectly honest text. */
const LONE_CARRIAGE_RETURN = new RegExp(
  `${String.fromCharCode(0x0d)}(?!${String.fromCharCode(0x0a)})`,
  'g',
);

function isBidiOverrideChar(codePoint: number): boolean {
  return (
    (codePoint >= BIDI_OVERRIDE_RANGE_START && codePoint <= BIDI_OVERRIDE_RANGE_END) ||
    (codePoint >= BIDI_ISOLATE_RANGE_START && codePoint <= BIDI_ISOLATE_RANGE_END)
  );
}

/**
 * Invisible characters, directionality overrides, HTML comments and terminal
 * control sequences hidden in tool/prompt/resource metadata — a description can look benign to a human skimming it while
 * an LLM (which reads every character, including the invisible ones) sees
 * additional smuggled instructions. See MCPG-202.
 */
export function findUnicodeAnomalies(text: string): UnicodeAnomaly[] {
  const anomalies: UnicodeAnomaly[] = [];

  for (const match of text.matchAll(ZERO_WIDTH_PATTERN)) {
    anomalies.push({ kind: 'zero-width', index: match.index });
  }

  for (let i = 0; i < text.length; i++) {
    if (isBidiOverrideChar(text.charCodeAt(i))) {
      anomalies.push({ kind: 'bidi-override', index: i });
    }
  }

  for (const match of text.matchAll(HTML_COMMENT_PATTERN)) {
    anomalies.push({ kind: 'html-comment', index: match.index });
  }

  for (const match of text.matchAll(C0_CONTROL)) {
    anomalies.push({ kind: 'terminal-control', index: match.index });
  }

  for (const match of text.matchAll(LONE_CARRIAGE_RETURN)) {
    anomalies.push({ kind: 'terminal-control', index: match.index });
  }

  return anomalies.sort((a, b) => a.index - b.index);
}
