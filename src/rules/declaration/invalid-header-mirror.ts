import { createFinding, type Finding } from '../../core/finding.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

/**
 * The spec's constraints on `x-mcp-header` are MUSTs, and it tells clients to
 * reject any tool definition that breaks them. A server sending a broken one
 * is either buggy or probing for a client that forgot to check — and the
 * CR/LF case is HTTP header injection outright, since the value becomes part
 * of a header name on the wire.
 */

/** RFC 9110 §5.1 `tchar`. Anything outside this cannot be a header name. */
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** The spec permits integer, string and boolean. `number` is called out as
 * not permitted — a float has no unambiguous header encoding. */
const MIRRORABLE_TYPES = new Set(['string', 'integer', 'boolean']);

export const invalidHeaderMirrorRule: ToolRule = {
  id: 'MCPG-802',
  title: 'Invalid x-mcp-header declaration (header injection or malformed mirror)',
  severity: 'critical',
  confidence: 'high', // structural: the value either satisfies the grammar or it does not
  category: 'declaration',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-802.md',
  /** A CR/LF smuggled into a header name is injection into the request the
   * client is about to make. */
  owasp: ['MCP05'],

  check(tool, _allTools) {
    const findings: Finding[] = [];
    const properties = Object.entries(tool.inputSchema?.properties ?? {});
    const seen = new Map<string, string>();

    for (const [paramName, property] of properties) {
      const header = property.xMcpHeader;
      if (header === undefined) continue;

      const problem = describeProblem(header, property.type, seen, paramName);
      if (!problem) {
        seen.set(header.toLowerCase(), paramName);
        continue;
      }

      findings.push(
        createFinding({
          ruleId: invalidHeaderMirrorRule.id,
          severity: invalidHeaderMirrorRule.severity,
          confidence: invalidHeaderMirrorRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" declares an x-mcp-header on "${paramName}" that the MCP specification forbids: ${problem}`,
          remediation:
            'A conforming client must reject this tool definition outright rather than use it. Treat a server sending one as either broken or probing for a client that skipped the check — verify which before trusting anything else it advertises.',
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/${paramName}/x-mcp-header`,
        }),
      );
    }

    return findings;
  },
};

function describeProblem(
  header: string,
  type: string | undefined,
  seen: ReadonlyMap<string, string>,
  paramName: string,
): string | null {
  // Checked first and reported as injection rather than as a grammar
  // violation: a CR or LF here does not merely break the token rule, it ends
  // the header and starts another one in the request the client will send.
  if (/[\r\n]/.test(header)) {
    return 'the header name contains a CR or LF, which would terminate the header and inject a further one into the outgoing request — HTTP header injection.';
  }
  if (header.length === 0) {
    return 'the header name is empty.';
  }
  if (!TOKEN.test(header)) {
    return `the header name "${header}" is not a valid HTTP field-name token (RFC 9110 §5.1).`;
  }
  const duplicate = seen.get(header.toLowerCase());
  if (duplicate !== undefined) {
    return `the header name "${header}" is already used by the "${duplicate}" parameter — x-mcp-header values must be unique, case-insensitively, within one inputSchema.`;
  }
  if (type !== undefined && !MIRRORABLE_TYPES.has(type)) {
    return `"${paramName}" is declared type "${type}"; only integer, string and boolean may be mirrored${type === 'number' ? ' — number is excluded explicitly' : ''}.`;
  }
  return null;
}
