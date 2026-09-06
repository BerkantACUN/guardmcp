import { createFinding, type Finding } from '../../core/finding.js';
import type { Severity } from '../../core/severity.js';
import { classifySensitiveUri, type SensitiveUriKind } from '../../detectors/sensitive-uri.js';
import { type ResourceRule, resourceLocation } from './types.js';

/**
 * The one check with no equivalent on the tool or prompt surface.
 *
 * A resource POINTS somewhere, and the model can read what it points at. So
 * the URI is checkable on its own, independently of what the resource claims
 * to be — which matters because the claim is the part an attacker controls
 * most cheaply. A resource named "deploy-key" described as "Deployment
 * configuration" and pointing at `~/.ssh/id_rsa` is not lying in any field a
 * description scanner reads.
 */
const SEVERITY_BY_KIND: Record<SensitiveUriKind, Severity> = {
  // A named secret file is the model being handed a credential outright.
  credential: 'critical',
  // Unbounded, but what it actually exposes depends on what is on disk.
  'broad-scope': 'high',
  'internal-endpoint': 'high',
};

const REMEDIATION: Record<SensitiveUriKind, string> = {
  credential:
    'Remove this resource. A credential file has no business being offered as model-readable context: anything the model reads can end up in a response, a log, or a downstream tool call. If the server needs the credential, it should use it internally and never expose it as a resource.',
  'broad-scope':
    'Point the resource at the specific file or directory it is actually for. A filesystem or home root as a resource means what gets exposed is decided by whatever happens to be on disk, not by the server author.',
  'internal-endpoint':
    'Remove this resource or point it at the external service it claims to represent. A resource that reaches cloud metadata or a private-network address turns a read of "context" into a request against internal infrastructure.',
};

export const sensitiveResourceUriRule: ResourceRule = {
  id: 'MCPG-209',
  title: 'Resource URI targets credentials, a filesystem root, or internal infrastructure',
  severity: 'high',
  confidence: 'high', // the URI is a fact, not an inference from natural language
  category: 'resources',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-209.md',
  /** Depending on the shape: a credential read (MCP01), reach beyond the
   * intended scope (MCP02), and context the model should never have been
   * given (MCP10). */
  owasp: ['MCP01', 'MCP02', 'MCP10'],

  check(resource, _all) {
    const match = classifySensitiveUri(resource.uri);
    if (!match) return [];

    const finding: Finding = createFinding({
      ruleId: sensitiveResourceUriRule.id,
      severity: SEVERITY_BY_KIND[match.kind],
      confidence: sensitiveResourceUriRule.confidence,
      message: `Resource "${resource.name}" on server "${resource.serverName}" points at ${match.label} — the server is offering this to the model as readable context. Its description ("${resource.description || '(none)'}") does not have to mention that.`,
      remediation: REMEDIATION[match.kind],
      location: resourceLocation(resource),
      logicalPath: `/resources/${resource.serverName}/${resource.name}/uri`,
      evidence: resource.uri,
    });

    return [finding];
  },
};
