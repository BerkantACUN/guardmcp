import { describe, expect, it } from 'vitest';
import { parseJsoncDocument } from '../../../src/parsers/jsonc-document.js';

const SAMPLE = `{
  "mcpServers": {
    "foo": {
      "command": "npx",
      "env": {
        "GITHUB_TOKEN": "ghp_1234567890abcdefghijklmnopqrstuvwxyz12"
      }
    }
  }
}
`;

/** Independent cross-check: line/column of the Nth char of `needle`, computed
 * without touching the parser under test, so the test can't just mirror a bug
 * in the implementation. */
function expectedPosition(text: string, needle: string): { line: number; column: number } {
  const index = text.indexOf(needle);
  if (index === -1) throw new Error(`fixture bug: "${needle}" not found in sample`);
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - before.lastIndexOf('\n');
  return { line, column };
}

describe('parseJsoncDocument', () => {
  it('parses the value tree', () => {
    const doc = parseJsoncDocument(SAMPLE);
    const value = doc.getValue() as { mcpServers: { foo: { command: string } } };
    expect(value.mcpServers.foo.command).toBe('npx');
  });

  it('locates a nested value at the correct line/column', () => {
    const doc = parseJsoncDocument(SAMPLE);
    const range = doc.locate(['mcpServers', 'foo', 'env', 'GITHUB_TOKEN']);
    const expected = expectedPosition(SAMPLE, '"ghp_1234567890abcdefghijklmnopqrstuvwxyz12"');
    expect(range).toBeDefined();
    expect(range?.line).toBe(expected.line);
    expect(range?.column).toBe(expected.column);
  });

  it('locates a top-level key', () => {
    const doc = parseJsoncDocument(SAMPLE);
    const range = doc.locate(['mcpServers']);
    const expected = expectedPosition(SAMPLE, '{\n    "foo"');
    // the "mcpServers" object value starts at the "{" right before "foo"
    expect(range?.line).toBe(expected.line);
  });

  it('returns undefined for a path that does not exist', () => {
    const doc = parseJsoncDocument(SAMPLE);
    expect(doc.locate(['mcpServers', 'bar'])).toBeUndefined();
  });

  it('returns undefined from locate() when the document has no parseable tree at all', () => {
    const doc = parseJsoncDocument('');
    expect(doc.locate(['anything'])).toBeUndefined();
  });

  it('handles a single-line document (offset 0 stays line 1)', () => {
    const doc = parseJsoncDocument('{"a": "b"}');
    const range = doc.locate(['a']);
    expect(range).toEqual({ line: 1, column: 7, endLine: 1, endColumn: 10 });
  });
});
