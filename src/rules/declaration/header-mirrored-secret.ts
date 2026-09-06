import { createFinding, type Finding } from '../../core/finding.js';
import { classifySensitiveParamName } from '../../detectors/sensitive-param-name.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

/**
 * The 2026-07-28 spec added `x-mcp-header`: a tool parameter marked with it
 * is mirrored into an outgoing `Mcp-Param-<name>` HTTP header so load
 * balancers, proxies and WAFs can route on it without parsing the body.
 *
 * Which is also the problem, and the spec says so itself:
 *
 *   "Server developers SHOULD NOT mark sensitive parameters (passwords, API
 *    keys, tokens, PII) with x-mcp-header, as header values are visible to
 *    network intermediaries."
 *
 * Nothing enforces that SHOULD NOT. This rule does.
 *
 * Note what is NOT flagged: a password parameter on its own is ordinary, and
 * mirroring an ordinary parameter is a legitimate feature. The finding is
 * only the combination.
 */
export const headerMirroredSecretRule: ToolRule = {
  id: 'MCPG-801',
  title: 'Sensitive tool parameter mirrored into an HTTP header',
  severity: 'critical',
  confidence: 'high',
  category: 'declaration',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-801.md',
  /** The value leaves the encrypted body for a header every intermediary on
   * the path can read and log. */
  owasp: ['MCP01', 'MCP10'],

  check(tool, _allTools) {
    const findings: Finding[] = [];
    const properties = tool.inputSchema?.properties ?? {};

    for (const [paramName, property] of Object.entries(properties)) {
      if (property.xMcpHeader === undefined) continue;
      const match = classifySensitiveParamName(paramName);
      if (!match) continue;

      findings.push(
        createFinding({
          ruleId: headerMirroredSecretRule.id,
          severity: headerMirroredSecretRule.severity,
          confidence: match.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" mirrors its "${paramName}" parameter — ${match.label} — into the HTTP header "Mcp-Param-${property.xMcpHeader}". Header values are visible to every network intermediary on the path (proxies, load balancers, WAFs) and are routinely logged by them, unlike the request body.`,
          remediation: `Remove the "x-mcp-header" annotation from "${paramName}". The MCP specification states directly that sensitive parameters — passwords, API keys, tokens, PII — should not be marked with it. If an intermediary genuinely needs to route on something, route on a non-sensitive parameter.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/${paramName}/x-mcp-header`,
        }),
      );
    }

    return findings;
  },
};
