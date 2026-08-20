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

  it('changes when enum/pattern/maxLength constraints change even though type stays the same (MCPG-302 relevance)', () => {
    const constrained: ToolDefinition = {
      ...readFile,
      inputSchema: { properties: { path: { type: 'string', pattern: '^/safe/', maxLength: 100 } } },
    };
    const unconstrained: ToolDefinition = {
      ...readFile,
      inputSchema: { properties: { path: { type: 'string' } } },
    };
    expect(computeToolsHash([constrained])).not.toBe(computeToolsHash([unconstrained]));
  });

  // Regression test for a real, verified collision in an earlier '\0'-joined
  // implementation: a NUL byte inside attacker-controlled name/description
  // text let two structurally different tool sets serialize to the same
  // byte stream and therefore hash identically, silently defeating MCPG-502.
  it('does NOT collide when a NUL byte in attacker-controlled text could straddle a field boundary', () => {
    const shiftedIntoDescription: ToolDefinition[] = [
      { serverName: 's', name: 'a', description: 'b\0c' },
    ];
    const shiftedIntoName: ToolDefinition[] = [{ serverName: 's', name: 'a\0b', description: 'c' }];
    expect(computeToolsHash(shiftedIntoDescription)).not.toBe(computeToolsHash(shiftedIntoName));
  });

  it('does NOT collide when a crafted property value could straddle the property-list boundary', () => {
    const twoProperties: ToolDefinition = {
      ...readFile,
      inputSchema: { properties: { a: { type: 'b' }, c: { type: 'd' } } },
    };
    const onePropertyMimickingTwo: ToolDefinition = {
      ...readFile,
      inputSchema: { properties: { a: { type: 'b,c:d' } } },
    };
    expect(computeToolsHash([twoProperties])).not.toBe(computeToolsHash([onePropertyMimickingTwo]));
  });
});
