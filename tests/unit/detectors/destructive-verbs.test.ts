import { describe, expect, it } from 'vitest';
import { readsAsDestructive } from '../../../src/detectors/destructive-verbs.js';

describe('readsAsDestructive — real destructive language', () => {
  it.each([
    'Deletes a file from disk.',
    'delete_record',
    'Removes the entry permanently.',
    'purge_cache',
    'Wipes all stored data.',
    'destroy_instance',
    'Truncates the log file.',
    'Overwrites the existing config.',
    'drop_table',
    'Drops the users table.',
    'Formats the disk before installing.',
  ])('flags %s', (text) => {
    expect(readsAsDestructive(text)).toBe(true);
  });
});

describe('readsAsDestructive — the noun-sense false positives', () => {
  // All of these came out of scanning real, widely-used MCP servers. The
  // first one is verbatim from @upstash/context7-mcp (3.9M downloads/month),
  // where "format" is a noun and the tool is annotated readOnlyHint: true.
  // Reporting a docs-lookup tool as destructive is the kind of finding that
  // teaches a user to ignore the tool.
  it.each([
    "provides a library ID in the format '/org/project' in their query",
    'Returns the result in JSON format.',
    'Accepts a date in ISO 8601 format.',
    'Specify the output format: text, json, or yaml.',
    'Reformats the response for display.',
  ])('does NOT flag "format" used as a noun: %s', (text) => {
    expect(readsAsDestructive(text)).toBe(false);
  });

  it.each([
    'Supports drag and drop of files into the editor.',
    'Renders a drop-down menu of available options.',
    'Adds a drop shadow to the element.',
  ])('does NOT flag "drop" in its non-destructive sense: %s', (text) => {
    expect(readsAsDestructive(text)).toBe(false);
  });

  it('still flags a drop that names a database object', () => {
    expect(readsAsDestructive('Drops the specified collection.')).toBe(true);
    expect(readsAsDestructive('drop_index')).toBe(true);
  });

  it('still flags a format that names a storage device', () => {
    expect(readsAsDestructive('Format the drive before use.')).toBe(true);
    expect(readsAsDestructive('formats the volume')).toBe(true);
  });
});

describe('readsAsDestructive — ordinary descriptions', () => {
  it.each([
    'Reads the contents of a local file.',
    'Searches the remote index.',
    'Resolves a package name to a library ID and returns matching libraries.',
    'Retrieves up-to-date documentation and code examples.',
    'Lists the segment filter attributes.',
  ])('leaves %s alone', (text) => {
    expect(readsAsDestructive(text)).toBe(false);
  });

  it('handles empty and odd input', () => {
    for (const t of ['', '   ', '---', '___']) {
      expect(() => readsAsDestructive(t)).not.toThrow();
    }
  });
});
