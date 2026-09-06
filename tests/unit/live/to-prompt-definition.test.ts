import { describe, expect, it } from 'vitest';
import { toPromptDefinition } from '../../../src/live/to-prompt-definition.js';

describe('toPromptDefinition', () => {
  it('maps a full prompts/list entry', () => {
    const prompt = toPromptDefinition('docs', {
      name: 'review_code',
      description: 'Reviews a code change.',
      arguments: [{ name: 'diff', description: 'The unified diff.', required: true }],
    });

    expect(prompt).toEqual({
      serverName: 'docs',
      name: 'review_code',
      description: 'Reviews a code change.',
      arguments: [{ name: 'diff', description: 'The unified diff.' }],
    });
  });

  it('defaults a missing description to an empty string, not undefined', () => {
    // Rules scan description text unconditionally; an undefined here would
    // mean every rule needs its own guard.
    expect(toPromptDefinition('s', { name: 'p' }).description).toBe('');
  });

  it('tolerates a prompt with no arguments', () => {
    expect(toPromptDefinition('s', { name: 'p' }).arguments).toEqual([]);
  });

  it('keeps an argument that has no description', () => {
    const prompt = toPromptDefinition('s', { name: 'p', arguments: [{ name: 'x' }] });
    expect(prompt.arguments).toEqual([{ name: 'x' }]);
  });

  it('carries the server name through, so cross-server rules can attribute a finding', () => {
    expect(toPromptDefinition('billing', { name: 'p' }).serverName).toBe('billing');
  });
});
