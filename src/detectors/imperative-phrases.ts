export interface ImperativePhraseMatch {
  readonly pattern: string;
  readonly index: number;
}

/**
 * Prompt-injection phrasing smuggled into a tool's description field — an
 * LLM reads tool descriptions as part of its context and, without a
 * clear trust boundary, can be steered by imperative language planted there
 * (a classic MCP tool-poisoning technique). These patterns target the
 * handful of phrasings that show up across real disclosed attacks
 * (override-previous-instructions, hide-from-user, act-before-other-tools,
 * pseudo-XML authority tags, read-and-exfiltrate-a-specific-file).
 *
 * Deliberately narrow: broad phrase matching on natural language produces
 * too many false positives against legitimate descriptions (which often
 * contain words like "read", "before", "important"). Each pattern below
 * requires the specific *combination* that makes a phrase instructional
 * rather than descriptive.
 */
const IMPERATIVE_PATTERNS: readonly RegExp[] = [
  /ignore (all |any )?previous instructions/i,
  /do not (tell|mention|inform|disclose)\b.{0,30}(user|human)/i,
  /without (telling|informing|asking)\b.{0,20}(user|human)/i,
  /before (calling|using|invoking) (any )?other tool/i,
  /<\s*important\s*>/i,
  /read (the )?file\s+[~./][^\s"']{2,}/i,
];

export function findImperativePhrases(text: string): ImperativePhraseMatch[] {
  const matches: ImperativePhraseMatch[] = [];
  for (const pattern of IMPERATIVE_PATTERNS) {
    const match = pattern.exec(text);
    if (match && match.index !== undefined) {
      matches.push({ pattern: pattern.source, index: match.index });
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}
