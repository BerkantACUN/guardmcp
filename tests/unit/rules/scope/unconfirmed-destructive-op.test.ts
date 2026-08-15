import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '../../../../src/model/tool-definition.js';
import { unconfirmedDestructiveOpRule } from '../../../../src/rules/scope/unconfirmed-destructive-op.js';

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    serverName: 'example',
    name: 'delete_file',
    description: 'Deletes a file.',
    ...overrides,
  };
}

describe('MCPG-303 unconfirmed-destructive-op rule', () => {
  it('flags a destructive-sounding tool with no annotations at all', () => {
    const t = tool();
    const findings = unconfirmedDestructiveOpRule.check(t, [t]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-303');
  });

  it('flags a destructive-sounding tool that contradictorily claims readOnlyHint', () => {
    const t = tool({ annotations: { readOnlyHint: true } });
    expect(unconfirmedDestructiveOpRule.check(t, [t])).toHaveLength(1);
  });

  it('does not flag a destructive tool that honestly declares destructiveHint', () => {
    const t = tool({ annotations: { destructiveHint: true } });
    expect(unconfirmedDestructiveOpRule.check(t, [t])).toEqual([]);
  });

  it('does not flag a non-destructive tool with no annotations', () => {
    const t = tool({ name: 'get_file', description: 'Reads a file and returns its contents.' });
    expect(unconfirmedDestructiveOpRule.check(t, [t])).toEqual([]);
  });

  it.each([
    'delete_record',
    'drop_table',
    'remove_user',
    'truncate_logs',
    'overwrite_config',
    'format_disk',
  ])('recognizes %s as destructive-shaped', (name) => {
    const t = tool({ name, description: 'Does the thing the name says.' });
    expect(unconfirmedDestructiveOpRule.check(t, [t])).toHaveLength(1);
  });
});
