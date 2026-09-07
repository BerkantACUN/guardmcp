import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScanTarget } from '../../../../src/discovery/index.js';
import { serverKey } from '../../../../src/model/server-key.js';
import type { ToolDefinition } from '../../../../src/model/tool-definition.js';
import { noLoggingCapabilityRule } from '../../../../src/rules/audit/no-logging-capability.js';

const FIXTURES = fileURLToPath(new URL('../../../fixtures/configs', import.meta.url));
const target = loadScanTarget(`${FIXTURES}/benign/http-remote-server.json`, FIXTURES);
const KEY = serverKey(target.relativePath, 'langfuse');

const tool = (over: Partial<ToolDefinition> = {}): ToolDefinition => ({
  serverName: 'langfuse',
  name: 'read_thing',
  description: 'Reads a thing.',
  ...over,
});

const ctx = (caps: Record<string, unknown> | undefined, tools: readonly ToolDefinition[]) => ({
  cwd: FIXTURES,
  ...(caps === undefined ? {} : { capabilitiesByServerKey: new Map([[KEY, caps]]) }),
  liveTools: new Map([[KEY, tools]]),
});

describe('MCPG-702 no logging capability', () => {
  it('flags a server that can change things and cannot report', () => {
    const findings = noLoggingCapabilityRule.check(
      target,
      ctx({ tools: {} }, [tool({ name: 'delete_record', description: 'Deletes a record.' })]),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-702');
    expect(findings[0]?.message).toContain('delete_record');
  });

  it('stays quiet when the server declares logging', () => {
    expect(
      noLoggingCapabilityRule.check(
        target,
        ctx({ tools: {}, logging: {} }, [tool({ name: 'delete_record' })]),
      ),
    ).toEqual([]);
  });

  it('stays quiet for a read-only server — it has nothing to report', () => {
    // The MCPG-404 lesson: a rule that fires on every server carries no
    // information. The finding is the COMBINATION, not the missing capability.
    expect(noLoggingCapabilityRule.check(target, ctx({ tools: {} }, [tool()]))).toEqual([]);
  });

  it('believes an explicit readOnlyHint', () => {
    expect(
      noLoggingCapabilityRule.check(
        target,
        ctx({ tools: {} }, [tool({ name: 'delete_record', annotations: { readOnlyHint: true } })]),
      ),
    ).toEqual([]);
  });

  it('trusts destructiveHint even when the name reads harmless', () => {
    const findings = noLoggingCapabilityRule.check(
      target,
      ctx({ tools: {} }, [tool({ name: 'apply', annotations: { destructiveHint: true } })]),
    );
    expect(findings).toHaveLength(1);
  });

  it('says nothing without --live, because capabilities are unknown', () => {
    expect(noLoggingCapabilityRule.check(target, { cwd: FIXTURES })).toEqual([]);
  });

  it('says nothing for a server that was never reached', () => {
    expect(
      noLoggingCapabilityRule.check(target, {
        cwd: FIXTURES,
        capabilitiesByServerKey: new Map(),
        liveTools: new Map(),
      }),
    ).toEqual([]);
  });

  it('maps to MCP08', () => {
    expect(noLoggingCapabilityRule.owasp).toEqual(['MCP08']);
  });
});
