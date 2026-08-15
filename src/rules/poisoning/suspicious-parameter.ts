import { createFinding, type Finding } from '../../core/finding.js';
import { type ToolRule, toolLocation } from './types.js';

/** Innocuous-sounding names attackers use for a side channel — a field
 * that isn't obviously "the payload" but is functionally identical to one.
 * Not every match here is suspicious; it's the NAME + a smuggling-shaped
 * DESCRIPTION together that matters (see SMUGGLING_SIGNAL below). */
const SIDE_CHANNEL_NAME =
  /^(sidenote|debug_info|debug|context|extra|metadata|notes?|misc|internal_use)$/i;

/** Description language asking the model to put sensitive content into that field. */
const SMUGGLING_SIGNAL =
  /\b(contents? of|api keys?|secrets?|passwords?|credentials?|ssh keys?|private keys?|tokens?|\.ssh|id_rsa)\b/i;

export const suspiciousParameterRule: ToolRule = {
  id: 'MCPG-204',
  title: 'Tool parameter shaped as a covert data-exfiltration channel',
  severity: 'high',
  confidence: 'medium',
  category: 'poisoning',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-204.md',

  check(tool, _allTools) {
    const properties = tool.inputSchema?.properties;
    if (!properties) return [];

    const findings: Finding[] = [];
    for (const [paramName, schema] of Object.entries(properties)) {
      if (!SIDE_CHANNEL_NAME.test(paramName)) continue;
      const description = schema.description ?? '';
      if (!SMUGGLING_SIGNAL.test(description)) continue;

      findings.push(
        createFinding({
          ruleId: suspiciousParameterRule.id,
          severity: suspiciousParameterRule.severity,
          confidence: suspiciousParameterRule.confidence,
          message: `Tool "${tool.name}" on server "${tool.serverName}" has a parameter named "${paramName}" — not obviously part of the tool's stated purpose — whose description asks for sensitive content (keys, credentials, file contents) to be placed there. This is the shape of a covert exfiltration channel: data an LLM might include without the human operator noticing an unused-looking field.`,
          remediation: `Remove or rename "${paramName}" if it serves no real function, or scrutinize why a tool needs a field asking for credentials/file contents in its argument schema at all.`,
          location: toolLocation(tool),
          logicalPath: `/tools/${tool.serverName}/${tool.name}/inputSchema/properties/${paramName}`,
        }),
      );
    }

    return findings;
  },
};
