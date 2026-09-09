import { createFinding, type Finding } from '../../core/finding.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

/**
 * The model picks a tool by its name, and nothing in MCP namespaces that name
 * per server. So when two connected servers both offer `search`, the model is
 * choosing between two tools it cannot tell apart, and which one it gets is a
 * property of the client's merge order rather than of anything the user
 * decided.
 *
 * That is the cheap version of tool shadowing. MCPG-203 catches the loud
 * version — a description that says it intercepts another tool — but an
 * attacker who simply registers the same name says nothing at all and needs
 * no description at any point. There is no signal to find except the
 * collision itself.
 *
 * Deliberately not scoped to "suspicious-looking" servers. A collision
 * between two entirely legitimate servers is still an ambiguity the user
 * should know about before it resolves in a way nobody chose.
 */
export const duplicateToolNameRule: ToolRule = {
  id: 'MCPG-901',
  title: 'Tool name is offered by more than one server',
  severity: 'high',
  confidence: 'high', // an exact string collision is a fact, not an inference
  category: 'namespace',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-901.md',
  /** The call reaches a tool the user did not choose (MCP06), by the same
   * mechanism tool poisoning relies on (MCP03). */
  owasp: ['MCP03', 'MCP06'],

  check(tool, allTools) {
    const collidingServers = [
      ...new Set(
        allTools
          .filter((other) => other.name === tool.name && other.serverName !== tool.serverName)
          .map((other) => other.serverName),
      ),
    ].sort();

    if (collidingServers.length === 0) return [];

    const others = collidingServers.map((name) => `"${name}"`).join(', ');
    const finding: Finding = createFinding({
      ruleId: duplicateToolNameRule.id,
      severity: duplicateToolNameRule.severity,
      confidence: duplicateToolNameRule.confidence,
      message: `Tool "${tool.name}" is offered by server "${tool.serverName}" and also by ${others}. MCP does not namespace tool names, so the model selects between them by name alone and the winner depends on the client's merge order rather than on any choice the user made.`,
      remediation: `Rename the tool on one of the servers, or drop whichever server does not need to expose "${tool.name}". If both are genuinely required, confirm which one your client resolves to — a collision that resolves silently today can resolve the other way after a client update or a config reorder.`,
      location: toolLocation(tool),
      logicalPath: `/tools/${tool.serverName}/${tool.name}/name`,
    });

    return [finding];
  },
};
