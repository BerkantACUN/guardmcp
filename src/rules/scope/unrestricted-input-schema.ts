import { createFinding, type Finding } from '../../core/finding.js';
import { type ToolRule, toolLocation } from '../poisoning/types.js';

/** A tool whose name/description implies it executes arbitrary
 * commands/code/shell — the category where an unconstrained string input
 * is most dangerous (it becomes a direct injection point).
 *
 * `s?` covers plural/3rd-person prose ("Executes a command"). The NAME is
 * normalized (underscores/hyphens -> spaces) before testing — `\b` treats
 * `_` as a word character, so "run_command" has no internal boundary
 * between "run" and "_command" and would otherwise never match on name
 * alone (same class of bug MCPG-303 shipped with once already). */
const HIGH_RISK_TOOL = /\b(execs?|executes?|runs?|evals?|shell|commands?|scripts?|spawns?)\b/i;

function normalizeIdentifier(value: string): string {
  return value.replace(/[_-]/g, ' ');
}

export const unrestrictedInputSchemaRule: ToolRule = {
  id: 'MCPG-302',
  title: 'High-risk tool accepts an unconstrained string parameter',
  severity: 'medium',
  confidence: 'medium',
  category: 'scope',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-302.md',

  check(tool, _allTools) {
    const isHighRisk =
      HIGH_RISK_TOOL.test(normalizeIdentifier(tool.name)) || HIGH_RISK_TOOL.test(tool.description);
    if (!isHighRisk) return [];

    const properties = tool.inputSchema?.properties;
    if (!properties) return [];

    const findings: Finding[] = [];
    for (const [paramName, schema] of Object.entries(properties)) {
      if (schema.type !== 'string') continue;
      const isConstrained =
        schema.enum !== undefined || schema.pattern !== undefined || schema.maxLength !== undefined;
      if (isConstrained) continue;

      findings.push(
        createFinding({
          ruleId: unrestrictedInputSchemaRule.id,
          severity: unrestrictedInputSchemaRule.severity,
          confidence: unrestrictedInputSchemaRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" looks like it executes commands/code, and its "${paramName}" parameter accepts any string with no enum, pattern, or length constraint — the parameter itself provides no boundary on what can be injected.`,
          remediation: `Constrain "${paramName}" with an enum of allowed values, a validating pattern, or at minimum a maxLength — an unconstrained string handed to an execution-shaped tool is effectively unrestricted command injection.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/properties/${paramName}`,
        }),
      );
    }

    return findings;
  },
};
