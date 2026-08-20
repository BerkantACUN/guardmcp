import { describe, expect, it } from 'vitest';
import { sanitizeForDisplay } from '../../../src/report/sanitize.js';

describe('sanitizeForDisplay', () => {
  it('leaves ordinary text untouched', () => {
    expect(sanitizeForDisplay('Reads a file.')).toBe('Reads a file.');
  });

  it('strips the ESC byte (0x1b) that starts an ANSI escape sequence, neutralizing it', () => {
    // \x1b[2K is "erase current line" — the exact primitive a malicious
    // live server could use to hide/spoof a CRITICAL finding line. Only the
    // ESC lead-in byte itself is a control character; stripping it is
    // sufficient to neutralize the sequence — the remaining "[2K" etc. are
    // ordinary printable characters with no special meaning to a terminal
    // once the lead-in is gone, so they're left as harmless visible text
    // rather than needing their own removal logic.
    const malicious = 'read_file\x1b[2K\x1b[1A\x1b[2KFAKE: no findings';
    const result = sanitizeForDisplay(malicious);
    expect(result).not.toContain('\x1b');
    expect(result).toBe('read_file[2K[1A[2KFAKE: no findings');
  });

  it('strips other C0 control characters (bell, backspace, carriage return)', () => {
    expect(sanitizeForDisplay('a\x07b\x08c\rd')).toBe('abcd');
  });

  it('strips DEL (0x7f)', () => {
    expect(sanitizeForDisplay('a\x7fb')).toBe('ab');
  });

  it('collapses newlines and tabs to a single space instead of dropping them', () => {
    expect(sanitizeForDisplay('line one\nline two\tindented')).toBe('line one line two indented');
  });

  it('leaves non-ASCII Unicode (including the characters MCPG-202 detects) untouched — this is a display-safety filter, not a poisoning detector', () => {
    const withZeroWidth = `safe${'​'}tool`;
    expect(sanitizeForDisplay(withZeroWidth)).toBe(withZeroWidth);
  });
});
