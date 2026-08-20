import { describe, expect, it } from 'vitest';
import { computeDefinitionHash } from '../../../src/pin/definition-hash.js';

describe('computeDefinitionHash', () => {
  it('is stable for the identical stdio definition', () => {
    const def = { command: 'npx', args: ['-y', 'some-mcp-server'], env: { API_KEY: 'secret-a' } };
    expect(computeDefinitionHash(def)).toBe(computeDefinitionHash({ ...def }));
  });

  it('changes when the command changes', () => {
    const a = computeDefinitionHash({ command: 'npx', args: ['some-mcp-server'] });
    const b = computeDefinitionHash({ command: 'uvx', args: ['some-mcp-server'] });
    expect(a).not.toBe(b);
  });

  it('changes when args change', () => {
    const a = computeDefinitionHash({ command: 'npx', args: ['some-mcp-server'] });
    const b = computeDefinitionHash({ command: 'npx', args: ['some-mcp-server', '--danger'] });
    expect(a).not.toBe(b);
  });

  it('changes when an env VARIABLE NAME is added or removed', () => {
    const a = computeDefinitionHash({ command: 'npx', args: [], env: { A: '1' } });
    const b = computeDefinitionHash({ command: 'npx', args: [], env: { A: '1', B: '2' } });
    expect(a).not.toBe(b);
  });

  it('does NOT change when only an env VALUE changes (rotation is not drift)', () => {
    const a = computeDefinitionHash({ command: 'npx', args: [], env: { API_KEY: 'old-value' } });
    const b = computeDefinitionHash({
      command: 'npx',
      args: [],
      env: { API_KEY: 'new-value-after-rotation' },
    });
    expect(a).toBe(b);
  });

  it('changes when a remote url changes', () => {
    const a = computeDefinitionHash({ url: 'https://a.example.com/mcp' });
    const b = computeDefinitionHash({ url: 'https://b.example.com/mcp' });
    expect(a).not.toBe(b);
  });

  it('distinguishes stdio from remote even with coincidentally similar fields', () => {
    const stdio = computeDefinitionHash({ command: 'same', args: [] });
    const http = computeDefinitionHash({ url: 'same' });
    expect(stdio).not.toBe(http);
  });

  it('is prefixed with "sha256:"', () => {
    expect(computeDefinitionHash({ command: 'npx', args: [] })).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('distinguishes a single arg from two args that could straddle a naive delimiter join', () => {
    const oneArg = computeDefinitionHash({ command: 'npx', args: ['ab'] });
    const twoArgs = computeDefinitionHash({ command: 'npx', args: ['a', 'b'] });
    expect(oneArg).not.toBe(twoArgs);
  });
});
