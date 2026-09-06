import type { Finding, SourceLocation } from '../../core/finding.js';
import type { Confidence, Severity } from '../../core/severity.js';
import type { ResourceDefinition } from '../../model/resource-definition.js';
import type { OwaspMcpId } from '../owasp.js';

/** A rule over a live-introspected resource — the third and last MCP
 * surface. Same pure contract as ToolRule and PromptRule. */
export interface ResourceRule {
  readonly id: string;
  readonly title: string;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly category: string;
  readonly docsUrl: string;
  readonly owasp: readonly OwaspMcpId[];
  check(
    resource: ResourceDefinition,
    allResources: readonly ResourceDefinition[],
  ): readonly Finding[];
}

export function resourceLocation(resource: ResourceDefinition): SourceLocation {
  return { file: `live:${resource.serverName}/resources/${resource.name}`, line: 1, column: 1 };
}

/** The model-readable text a resource exposes through `resources/list`. The
 * name is included because it is what a human sees in a picker — hiding
 * content there is how a resource passes review while pointing elsewhere. */
export function resourceTextFields(
  resource: ResourceDefinition,
): readonly { readonly text: string; readonly logicalPath: string; readonly where: string }[] {
  const base = `/resources/${resource.serverName}/${resource.name}`;
  return [
    { text: resource.description, logicalPath: `${base}/description`, where: 'description' },
    { text: resource.name, logicalPath: `${base}/name`, where: 'name' },
  ];
}
