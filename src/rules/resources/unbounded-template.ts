import { createFinding, type Finding } from '../../core/finding.js';
import type { Severity } from '../../core/severity.js';
import { classifyUriTemplate, type UriTemplateRisk } from '../../detectors/uri-template.js';
import type { ResourceTemplateDefinition } from '../../model/resource-definition.js';
import type { OwaspMcpId } from '../owasp.js';

/**
 * A resource points at one URI, so a reviewer can look at it. A resource
 * TEMPLATE names a shape the caller fills in, so what it reaches is decided at
 * call time by whatever supplies the variable — which, in an agent, is the
 * model. `file:///{path}` is arbitrary local file read, advertised as a
 * feature rather than smuggled in.
 *
 * MCPG-209 covers fixed resource URIs and could not see this: a template has
 * no URI to check until it is expanded.
 */
export interface ResourceTemplateRule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly category: string;
  readonly docsUrl: string;
  readonly owasp: readonly OwaspMcpId[];
  check(template: ResourceTemplateDefinition): readonly Finding[];
}

const SEVERITY_BY_KIND: Record<UriTemplateRisk, Severity> = {
  'unbounded-file': 'critical',
  'traversable-file': 'high',
  'caller-chosen-host': 'high',
};

const REMEDIATION: Record<UriTemplateRisk, string> = {
  'unbounded-file':
    'Anchor the template to the directory the server is actually for — `file:///srv/project/{name}.md` rather than `file:///{path}`. As written, what this exposes is decided by whoever supplies the variable, which in an agent is the model.',
  'traversable-file':
    'Use simple expansion `{name}` instead of `{+name}`/`{#name}`. Simple expansion percent-encodes "/" and ".", so a value cannot climb out of the directory you anchored it to; reserved expansion exists precisely to let it through.',
  'caller-chosen-host':
    'Put the hostname in the template and leave only the path variable — `https://api.example.com/{endpoint}`. With a variable in the host position the caller chooses the destination, which makes this an SSRF primitive by construction.',
};

export const unboundedResourceTemplateRule: ResourceTemplateRule = {
  id: 'MCPG-210',
  title: 'Resource template lets the caller choose what is read',
  severity: 'critical',
  confidence: 'high', // structural: read off the RFC 6570 operators, not inferred from prose
  category: 'resources',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-210.md',
  /** Reach beyond the reviewed scope (MCP02), a credential or file read into
   * the model's context (MCP01/MCP10). */
  owasp: ['MCP01', 'MCP02', 'MCP10'],

  check(template) {
    const match = classifyUriTemplate(template.uriTemplate);
    if (!match) return [];

    const finding: Finding = createFinding({
      ruleId: unboundedResourceTemplateRule.id,
      severity: SEVERITY_BY_KIND[match.kind],
      confidence: unboundedResourceTemplateRule.confidence,
      message: `Resource template "${template.name}" on server "${template.serverName}" is "${template.uriTemplate}" — ${match.label}.`,
      remediation: REMEDIATION[match.kind],
      location: {
        file: `live:${template.serverName}/resourceTemplates/${template.name}`,
        line: 1,
        column: 1,
      },
      logicalPath: `/resourceTemplates/${template.serverName}/${template.name}/uriTemplate`,
      evidence: template.uriTemplate,
    });

    return [finding];
  },
};
