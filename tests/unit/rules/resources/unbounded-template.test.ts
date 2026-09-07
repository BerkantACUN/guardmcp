import { describe, expect, it } from 'vitest';
import type { ResourceTemplateDefinition } from '../../../../src/model/resource-definition.js';
import { unboundedResourceTemplateRule } from '../../../../src/rules/resources/unbounded-template.js';

const tpl = (uriTemplate: string): ResourceTemplateDefinition => ({
  serverName: 'docs',
  name: 'files',
  uriTemplate,
  description: 'Reads a project file.',
});

describe('MCPG-210 unbounded resource template', () => {
  it('flags arbitrary file read as critical', () => {
    const [f] = unboundedResourceTemplateRule.check(tpl('file:///{path}'));
    expect(f?.ruleId).toBe('MCPG-210');
    expect(f?.severity).toBe('critical');
    expect(f?.message).toContain('file:///{path}');
  });

  it('flags reserved expansion as high — "/" survives it', () => {
    const [f] = unboundedResourceTemplateRule.check(tpl('file:///srv/docs/{+name}'));
    expect(f?.severity).toBe('high');
    expect(f?.message).toMatch(/reserved expansion/i);
  });

  it('flags a caller-chosen host', () => {
    const [f] = unboundedResourceTemplateRule.check(tpl('https://{host}/api'));
    expect(f?.severity).toBe('high');
    expect(f?.remediation).toMatch(/SSRF/i);
  });

  it('stays quiet on a properly anchored template', () => {
    expect(unboundedResourceTemplateRule.check(tpl('file:///srv/docs/{name}.md'))).toEqual([]);
    expect(unboundedResourceTemplateRule.check(tpl('https://api.example.com/{id}'))).toEqual([]);
  });

  it('carries the template as evidence so a reader can check the claim', () => {
    const [f] = unboundedResourceTemplateRule.check(tpl('file:///{path}'));
    expect(f?.evidence).toBe('file:///{path}');
  });
});
