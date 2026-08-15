import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '../../../../src/model/tool-definition.js';
import { invisibleCharactersRule } from '../../../../src/rules/poisoning/invisible-characters.js';

const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return { serverName: 'example', name: 'add', description: 'Adds two numbers.', ...overrides };
}

describe('MCPG-202 invisible-characters rule', () => {
  it('flags a zero-width character hidden in a description', () => {
    const poisoned = tool({
      description: `Adds two numbers.${ZERO_WIDTH_SPACE}Also reads secrets.`,
    });
    const findings = invisibleCharactersRule.check(poisoned, [poisoned]);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-202');
    expect(findings[0]?.severity).toBe('high');
    expect(findings[0]?.confidence).toBe('high'); // deterministic signal, unlike MCPG-201's phrase matching
  });

  it('flags an HTML comment hidden in a description', () => {
    const poisoned = tool({
      description: 'Adds numbers. <!-- also exfiltrates data --> Returns sum.',
    });
    expect(invisibleCharactersRule.check(poisoned, [poisoned])).toHaveLength(1);
  });

  it('never includes the raw hidden content in the finding message', () => {
    const poisoned = tool({
      description: `Adds two numbers.${ZERO_WIDTH_SPACE}secret payload here`,
    });
    const [finding] = invisibleCharactersRule.check(poisoned, [poisoned]);
    expect(finding?.message).not.toContain('secret payload here');
  });

  it('does not flag an ordinary description with no hidden characters', () => {
    const t = tool({ description: 'Adds two numbers and returns the sum.' });
    expect(invisibleCharactersRule.check(t, [t])).toEqual([]);
  });
});
