import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '../../../../src/model/tool-definition.js';
import { unrestrictedInputSchemaRule } from '../../../../src/rules/scope/unrestricted-input-schema.js';

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    serverName: 'example',
    name: 'run_command',
    description: 'Runs a shell command.',
    ...overrides,
  };
}

describe('MCPG-302 unrestricted-input-schema rule', () => {
  it('flags a high-risk tool (command execution) with an unconstrained string parameter', () => {
    const t = tool({
      inputSchema: {
        properties: { command: { type: 'string', description: 'The command to run.' } },
      },
    });
    const findings = unrestrictedInputSchemaRule.check(t, [t]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-302');
  });

  it('does not flag a high-risk tool whose parameter has an enum constraint', () => {
    const t = tool({
      name: 'run_predefined_script',
      inputSchema: { properties: { script: { type: 'string', enum: ['build', 'test', 'lint'] } } },
    });
    expect(unrestrictedInputSchemaRule.check(t, [t])).toEqual([]);
  });

  it('does not flag a high-risk tool whose parameter has a pattern constraint', () => {
    const t = tool({
      inputSchema: {
        properties: { command: { type: 'string', pattern: '^(start|stop|restart)$' } },
      },
    });
    expect(unrestrictedInputSchemaRule.check(t, [t])).toEqual([]);
  });

  it('does not flag a low-risk tool (not command/exec/eval-shaped) with unconstrained strings', () => {
    const t = tool({
      name: 'get_weather',
      description: 'Returns the current weather for a city.',
      inputSchema: { properties: { city: { type: 'string' } } },
    });
    expect(unrestrictedInputSchemaRule.check(t, [t])).toEqual([]);
  });

  it('recognizes a snake_case tool name as high-risk even with a generic description (regression: \\b treats _ as a word char)', () => {
    const t = tool({
      name: 'run_command',
      description: 'Does the thing.',
      inputSchema: { properties: { arg: { type: 'string' } } },
    });
    expect(unrestrictedInputSchemaRule.check(t, [t])).toHaveLength(1);
  });

  it('does not flag a tool with no inputSchema', () => {
    const t = tool();
    expect(unrestrictedInputSchemaRule.check(t, [t])).toEqual([]);
  });
});
