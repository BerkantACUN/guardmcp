import { createFinding, type Finding } from '../../core/finding.js';
import { shannonEntropy } from '../../detectors/entropy.js';
import { findSecrets, isEnvVarReference, redact } from '../../detectors/secret-patterns.js';
import { isStdioServerDef } from '../../model/mcp-server-def.js';
import type { Rule } from '../types.js';

/** Only gate on env var NAMES that claim to hold a credential — a random
 * high-entropy value under an unrelated key (e.g. a nonce, a hash) is not
 * this rule's business. */
const SECRET_LIKE_KEY = /(_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIAL|_APIKEY)$/i;
const MIN_LENGTH = 12;
const MIN_ENTROPY = 3.5;

export const highEntropyValueRule: Rule = {
  id: 'MCPG-102',
  title: 'High-entropy value under a secret-shaped env var name',
  severity: 'medium',
  confidence: 'medium',
  category: 'secrets',
  docsUrl: 'https://github.com/BerkantACUN/guardmcp/blob/master/docs/rules/MCPG-102.md',

  check(target, _ctx) {
    const findings: Finding[] = [];
    const servers = target.config.mcpServers ?? {};

    for (const [serverName, def] of Object.entries(servers)) {
      if (!isStdioServerDef(def) || !def.env) continue;

      for (const [envKey, envValue] of Object.entries(def.env)) {
        if (!SECRET_LIKE_KEY.test(envKey)) continue;
        if (isEnvVarReference(envValue)) continue;
        if (envValue.length < MIN_LENGTH) continue;
        if (shannonEntropy(envValue) < MIN_ENTROPY) continue;
        // MCPG-101 already reports known-provider shapes at higher confidence.
        if (findSecrets(envValue).length > 0) continue;

        const logicalPath = `/mcpServers/${serverName}/env/${envKey}`;
        const range = target.document.locate(['mcpServers', serverName, 'env', envKey]);
        findings.push(
          createFinding({
            ruleId: highEntropyValueRule.id,
            severity: highEntropyValueRule.severity,
            confidence: highEntropyValueRule.confidence,
            message: `"${envKey}" in "${serverName}" server config looks like a credential (high-entropy value, secret-shaped name) but doesn't match a known provider format.`,
            remediation:
              'If this is a real credential, move it to an environment variable reference and rotate it. If it is not a secret, consider a less credential-suggestive name to avoid false alarms.',
            location: range
              ? {
                  file: target.relativePath,
                  line: range.line,
                  column: range.column,
                  endLine: range.endLine,
                  endColumn: range.endColumn,
                }
              : { file: target.relativePath, line: 1, column: 1 },
            logicalPath,
            evidence: redact(envValue),
          }),
        );
      }
    }

    return findings;
  },
};
