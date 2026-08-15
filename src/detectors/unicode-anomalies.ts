export type UnicodeAnomalyKind = 'zero-width' | 'bidi-override' | 'html-comment';

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

function isBidiOverrideChar(codePoint: number): boolean {
  return (
    (codePoint >= BIDI_OVERRIDE_RANGE_START && codePoint <= BIDI_OVERRIDE_RANGE_END) ||
    (codePoint >= BIDI_ISOLATE_RANGE_START && codePoint <= BIDI_ISOLATE_RANGE_END)
  );
}

/**
 * Invisible/directionality characters and HTML comments hidden in tool
 * descriptions — a description can look benign to a human skimming it while
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

  return anomalies.sort((a, b) => a.index - b.index);
}
