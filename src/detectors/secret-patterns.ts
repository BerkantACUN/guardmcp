export interface SecretPattern {
  readonly id: string;
  readonly label: string;
  readonly regex: RegExp;
}

/**
 * Narrow, high-confidence start (per docs/planning/mcp-guard-plan.md §4.1,
 * MCPG-101): known provider prefixes only, near-zero false positive rate.
 * Generic heuristics (high-entropy strings, "password=" patterns — MCPG-102)
 * are a separate, lower-confidence rule; mixing them here would make this
 * rule's "high confidence" claim a lie.
 *
 * Every regex is global (`g`) so `matchAll` can find multiple secrets in one
 * value; each one is cloned per-call in findSecrets() since RegExp with `g`
 * is stateful (.lastIndex) and reuse across calls would cause missed matches.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: 'github-token',
    label: 'GitHub token',
    // ghp_ (PAT), gho_ (OAuth), ghs_ (server-to-server/app), ghu_ (user-to-server)
    regex: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/g,
  },
  {
    id: 'anthropic-openai-key',
    label: 'Anthropic/OpenAI API key',
    regex: /\bsk-(ant-(api03-)?)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: 'aws-access-key-id',
    label: 'AWS access key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'jwt',
    label: 'JWT (JSON Web Token)',
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
];

/** `${VAR}`, `$VAR`, `%VAR%` — an env-var reference, not a literal value.
 * This is the exact "move it to an env var reference" pattern our own rules
 * recommend as remediation; both MCPG-101 and MCPG-102 skip it. */
const ENV_VAR_REFERENCE =
  /^(\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%)$/;

export function isEnvVarReference(value: string): boolean {
  return ENV_VAR_REFERENCE.test(value);
}

export interface SecretMatch {
  readonly pattern: SecretPattern;
  readonly value: string;
}

export function findSecrets(text: string): SecretMatch[] {
  if (isEnvVarReference(text)) return [];

  const found: SecretMatch[] = [];
  for (const pattern of SECRET_PATTERNS) {
    // Clone: a shared `g` regex carries .lastIndex state across calls.
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const match of text.matchAll(re)) {
      found.push({ pattern, value: match[0] });
    }
  }
  return found;
}

/**
 * Never let a raw secret reach a report, a log, or stdout — the scanner
 * itself must not become a leak vector (see SECURITY.md / risk R9 in the
 * plan). Keeps enough of the value that a human can recognize *which*
 * credential it is, without it being usable.
 */
export function redact(value: string): string {
  if (value.length <= 8) return '*'.repeat(value.length);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
