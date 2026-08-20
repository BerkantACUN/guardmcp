import { describe, expect, it } from 'vitest';
import { toToolDefinition } from '../../../src/live/to-tool-definition.js';

describe('toToolDefinition', () => {
  it('maps name/description/serverName straight through', () => {
    const result = toToolDefinition('fs-server', {
      name: 'read_file',
      description: 'Reads a file.',
    });

    expect(result).toEqual({
      serverName: 'fs-server',
      name: 'read_file',
      description: 'Reads a file.',
    });
  });

  it('defaults description to empty string when the server omits it', () => {
    const result = toToolDefinition('fs-server', { name: 'read_file' });

    expect(result.description).toBe('');
  });

  it('maps known inputSchema property fields and drops unknown JSON Schema keywords', () => {
    const result = toToolDefinition('fs-server', {
      name: 'delete_file',
      description: 'Deletes a file.',
      inputSchema: {
        properties: {
          path: { type: 'string', description: 'Path to delete.', pattern: '^/', maxLength: 200 },
          force: {
            type: 'boolean',
            enum: [true, false],
            $comment: 'unrelated JSON Schema keyword',
          },
        },
      },
    });

    expect(result.inputSchema?.properties?.path).toEqual({
      type: 'string',
      description: 'Path to delete.',
      pattern: '^/',
      maxLength: 200,
    });
    expect(result.inputSchema?.properties?.force).toEqual({ type: 'boolean', enum: [true, false] });
    expect(result.inputSchema?.properties?.force).not.toHaveProperty('$comment');
  });

  it('omits inputSchema entirely when the server did not declare one', () => {
    const result = toToolDefinition('fs-server', { name: 'ping' });

    expect(result).not.toHaveProperty('inputSchema');
  });

  it('maps annotation hints straight through, omitting unset ones', () => {
    const result = toToolDefinition('fs-server', {
      name: 'delete_file',
      annotations: { destructiveHint: true, readOnlyHint: false },
    });

    expect(result.annotations).toEqual({ destructiveHint: true, readOnlyHint: false });
  });

  it('omits annotations entirely when the server did not declare any', () => {
    const result = toToolDefinition('fs-server', { name: 'ping' });

    expect(result).not.toHaveProperty('annotations');
  });

  it('drops a malformed property entry (non-string type) instead of crashing', () => {
    const result = toToolDefinition('fs-server', {
      name: 'weird',
      inputSchema: { properties: { x: { type: 123 as unknown as string } } },
    });

    expect(result.inputSchema?.properties?.x).toEqual({});
  });
});
