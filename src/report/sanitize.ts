/**
 * Strips ASCII control characters (C0 range 0x00-0x1F, plus DEL 0x7F) from
 * text before it reaches a real terminal.
 *
 * `--live` is guardmcp's only code path where a REMOTE, adversarial party
 * (a malicious MCP server) controls text that ends up embedded in our own
 * output — a tool's `name`/`description` flows straight into `Finding.message`
 * (see src/rules/poisoning/*.ts) and a connection error flows straight into
 * a warning string (src/live/scan-live.ts). Without stripping control
 * characters first, a malicious server could put an ANSI escape sequence
 * (ESC = 0x1B) in its tool name and use it to erase or spoof guardmcp's own
 * CRITICAL finding line in a real terminal — undermining the exact thing
 * `--live` exists to warn a human about. JSON/SARIF output doesn't need
 * this: JSON.stringify already \u-escapes control characters, so a
 * downstream JSON/SARIF consumer never sees a raw control byte in the
 * first place.
 *
 * \n/\t become a single space (so a multi-line injection attempt collapses
 * into one legible line instead of silently vanishing); every other
 * control character is dropped outright.
 */
export function sanitizeForDisplay(text: string): string {
  let result = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const isControlChar = code <= 0x1f || code === 0x7f;
    if (!isControlChar) {
      result += ch;
    } else if (ch === '\n' || ch === '\t') {
      result += ' ';
    }
  }
  return result;
}
