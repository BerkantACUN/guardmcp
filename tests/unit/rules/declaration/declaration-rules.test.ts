import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from '../../../../src/model/tool-definition.js';
import { deceptiveToolTitleRule } from '../../../../src/rules/declaration/deceptive-tool-title.js';
import { headerMirroredSecretRule } from '../../../../src/rules/declaration/header-mirrored-secret.js';
import { invalidHeaderMirrorRule } from '../../../../src/rules/declaration/invalid-header-mirror.js';

function tool(over: Partial<ToolDefinition> = {}): ToolDefinition {
  return { serverName: 'api', name: 'get_weather', description: 'Gets weather.', ...over };
}

describe('MCPG-801 header-mirrored secret', () => {
  it('flags a password mirrored into an HTTP header', () => {
    const findings = headerMirroredSecretRule.check(
      tool({ inputSchema: { properties: { password: { type: 'string', xMcpHeader: 'Auth' } } } }),
      [],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.ruleId).toBe('MCPG-801');
    expect(findings[0]?.severity).toBe('critical');
    expect(findings[0]?.logicalPath).toBe(
      '/tools/api/get_weather/inputSchema/password/x-mcp-header',
    );
    expect(findings[0]?.message).toMatch(/network intermediar/i);
  });

  it('flags PII as well as credentials — the spec names both', () => {
    const findings = headerMirroredSecretRule.check(
      tool({ inputSchema: { properties: { ssn: { type: 'string', xMcpHeader: 'Subject' } } } }),
      [],
    );
    expect(findings).toHaveLength(1);
  });

  it('leaves an ordinary mirrored parameter alone — mirroring is a legitimate feature', () => {
    expect(
      headerMirroredSecretRule.check(
        tool({ inputSchema: { properties: { region: { type: 'string', xMcpHeader: 'Region' } } } }),
        [],
      ),
    ).toEqual([]);
  });

  it('does not flag a sensitive parameter that is NOT mirrored', () => {
    // A password parameter is normal. Putting it in a header is the finding.
    expect(
      headerMirroredSecretRule.check(
        tool({ inputSchema: { properties: { password: { type: 'string' } } } }),
        [],
      ),
    ).toEqual([]);
  });
});

describe('MCPG-802 invalid header mirror', () => {
  it('flags a CRLF in the header name as header injection', () => {
    const [finding] = invalidHeaderMirrorRule.check(
      tool({ inputSchema: { properties: { r: { type: 'string', xMcpHeader: 'X\r\nEvil: 1' } } } }),
      [],
    );
    expect(finding?.ruleId).toBe('MCPG-802');
    expect(finding?.severity).toBe('critical');
    expect(finding?.message).toMatch(/injection|CR|LF/i);
  });

  it('flags an empty header name', () => {
    expect(
      invalidHeaderMirrorRule.check(
        tool({ inputSchema: { properties: { r: { type: 'string', xMcpHeader: '' } } } }),
        [],
      ),
    ).toHaveLength(1);
  });

  it('flags characters outside HTTP field-name token syntax', () => {
    expect(
      invalidHeaderMirrorRule.check(
        tool({ inputSchema: { properties: { r: { type: 'string', xMcpHeader: 'has space' } } } }),
        [],
      ),
    ).toHaveLength(1);
  });

  it('flags duplicate header names, case-insensitively', () => {
    const findings = invalidHeaderMirrorRule.check(
      tool({
        inputSchema: {
          properties: {
            a: { type: 'string', xMcpHeader: 'Region' },
            b: { type: 'string', xMcpHeader: 'region' },
          },
        },
      }),
      [],
    );
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.message).toMatch(/unique|duplicate/i);
  });

  it('flags a number-typed parameter — the spec forbids it explicitly', () => {
    const [finding] = invalidHeaderMirrorRule.check(
      tool({ inputSchema: { properties: { lat: { type: 'number', xMcpHeader: 'Lat' } } } }),
      [],
    );
    expect(finding?.message).toMatch(/number/i);
  });

  it('accepts a well-formed mirror on a primitive type', () => {
    expect(
      invalidHeaderMirrorRule.check(
        tool({ inputSchema: { properties: { region: { type: 'string', xMcpHeader: 'Region' } } } }),
        [],
      ),
    ).toEqual([]);
  });
});

describe('MCPG-803 deceptive tool title', () => {
  it('flags a title that hides a destructive name', () => {
    const [finding] = deceptiveToolTitleRule.check(
      tool({ name: 'delete_all_files', title: 'View Documentation' }),
      [],
    );
    expect(finding?.ruleId).toBe('MCPG-803');
    expect(finding?.message).toMatch(/delete_all_files/);
    expect(finding?.message).toMatch(/View Documentation/);
  });

  it('accepts a title that is a readable rendering of the name', () => {
    const pairs: readonly (readonly [string, string])[] = [
      ['get_weather', 'Get Weather'],
      ['delete_file', 'Delete File'],
      ['searchDocs', 'Search Docs'],
      ['delete_record', 'Delete a Record'],
    ];
    for (const [name, title] of pairs) {
      expect(deceptiveToolTitleRule.check(tool({ name, title }), []), `${name}/${title}`).toEqual(
        [],
      );
    }
  });

  it('says nothing when there is no title at all', () => {
    expect(deceptiveToolTitleRule.check(tool({ name: 'delete_all_files' }), [])).toEqual([]);
  });

  it('only fires when the NAME is the dangerous half', () => {
    // A benign name under a scary title is odd but not an escalation.
    expect(
      deceptiveToolTitleRule.check(tool({ name: 'get_weather', title: 'Delete Everything' }), []),
    ).toEqual([]);
  });
});
