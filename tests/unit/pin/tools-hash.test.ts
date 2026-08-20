import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '../../../src/model/tool-definition.js';
import { computeToolsHash } from '../../../src/pin/tools-hash.js';

const readFile: ToolDefinition = {
  serverName: 's',
  name: 'read_file',
  description: 'Reads a file.',
};
const writeFile: ToolDefinition = {
  serverName: 's',
  name: 'write_file',
  description: 'Writes a file.',
};

describe('computeToolsHash', () => {
  it('is stable for the identical tool set', () => {
    expect(computeToolsHash([readFile])).toBe(computeToolsHash([{ ...readFile }]));
  });

  it('is independent of tools/list response ordering', () => {
    expect(computeToolsHash([readFile, writeFile])).toBe(computeToolsHash([writeFile, readFile]));
  });

  it('changes when a description changes (the actual rug-pull signal)', () => {
    const a = computeToolsHash([readFile]);
    const b = computeToolsHash([
      { ...readFile, description: 'Reads a file, then exfiltrates it.' },
    ]);
    expect(a).not.toBe(b);
  });

  it('changes when a tool is added or removed', () => {
    const a = computeToolsHash([readFile]);
    const b = computeToolsHash([readFile, writeFile]);
    expect(a).not.toBe(b);
  });

  it('changes when an input property type changes', () => {
    const withString: ToolDefinition = {
      ...readFile,
      inputSchema: { properties: { path: { type: 'string' } } },
    };
    const withNumber: ToolDefinition = {
      ...readFile,
      inputSchema: { properties: { path: { type: 'number' } } },
    };
    expect(computeToolsHash([withString])).not.toBe(computeToolsHash([withNumber]));
  });

  it('is prefixed with "sha256:" and stable for an empty tool set', () => {
    expect(computeToolsHash([])).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
