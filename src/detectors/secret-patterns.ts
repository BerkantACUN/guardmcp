export interface SecretPattern {
  readonly id: string;
  readonly label: string;
  readonly regex: RegExp;
  /** A literal-ish prefix every match of `regex` starts with. Used only to
   * reject, in one pass, the overwhelming majority of values that contain no
   * provider prefix at all — see QUICK_REJECT. */
  readonly prefix: RegExp;
}

/**
 * Narrow, high-confidence start (per docs/planning/mcp-guard-plan.md §4.1,
 * MCPG-101): known provider prefixes only, near-zero false positive rate.
 * Generic heuristics (high-entropy strings, "password=" patterns — MCPG-102)
 * are a separate, lower-confidence rule; mixing them here would make this
 * rule's "high confidence" claim a lie.
 *
 * Every regex is global (`g`) so `matchAll` can find multiple secrets in one
 * value. They are only ever used through `matchAll`, which copies the regex
 * before iterating — never call `.test`/`.exec` on them directly, since a
 * global regex's `lastIndex` would then carry over between calls.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: 'github-token',
    label: 'GitHub token',
    // ghp_ (PAT), gho_ (OAuth), ghs_ (server-to-server/app), ghu_ (user-to-server)
    regex: /\bgh[opsu]_[A-Za-z0-9]{36,}\b/g,
    prefix: /gh[opsu]_/,
  },
  {
    id: 'anthropic-openai-key',
    label: 'Anthropic/OpenAI API key',
    regex: /\bsk-(ant-(api03-)?)?[A-Za-z0-9_-]{20,}\b/g,
    prefix: /sk-/,
  },
  {
    id: 'aws-access-key-id',
    label: 'AWS access key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    prefix: /AKIA/,
  },
  {
    id: 'slack-token',
    label: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    prefix: /xox[baprs]-/,
  },
  {
    id: 'jwt',
    label: 'JWT (JSON Web Token)',
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    prefix: /eyJ/,
  },
];

/** `${VAR}`, `$VAR`, `%VAR%` — an env-var reference, not a literal value.
 * This is the exact "move it to an env var reference" pattern our own rules
 * recommend as remediation; both MCPG-101 and MCPG-102 skip it.
 *
 * The braced form accepts any name, not only POSIX ones: clients expand more
 * than `${NAME}` — VS Code and Cursor write `${env:NAME}` and
 * `${input:api-key}` — and a name like `${2Captcha_API_KEY}` is still a
 * reference, however unusual. Reading any of them as a literal value made
 * MCPG-102 report the reference itself as a secret. */
const ENV_VAR_REFERENCE = /^(\$\{[^{}\s]+\}|\$[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%)$/;

/** A value that is a fill-me-in slot rather than data: `{service_api_key}`
 * (the MCP registry's own variable syntax), `<YOUR_API_KEY>`, `[api key]`.
 * Measured in the registry study, where 27 of 33 MCPG-102 findings were
 * `{…}` slots — see docs/research/registry-2026-09. */
const TEMPLATE_PLACEHOLDER = /^(\{[^{}]+\}|<[^<>]+>|\[[^[\]]+\])$/;

export function isTemplatePlaceholder(value: string): boolean {
  return TEMPLATE_PLACEHOLDER.test(value.trim());
}

export function isEnvVarReference(value: string): boolean {
  return ENV_VAR_REFERENCE.test(value);
}

export interface SecretMatch {
  readonly pattern: SecretPattern;
  readonly value: string;
}

/**
 * Every pattern's prefix in one alternation. Scanning a large config means
 * calling findSecrets on every env value and argument, and almost none of
 * them contain any provider prefix; one test here settles those without
 * running (or allocating for) five global regexes each. Each prefix is
 * checked against its pattern in tests/unit/detectors/secret-patterns.test.ts.
 */
const QUICK_REJECT = new RegExp(SECRET_PATTERNS.map((p) => p.prefix.source).join('|'));

export function findSecrets(text: string): SecretMatch[] {
  if (!QUICK_REJECT.test(text) || isEnvVarReference(text)) return [];

  const found: SecretMatch[] = [];
  for (const pattern of SECRET_PATTERNS) {
    if (!pattern.prefix.test(text)) continue;
    // matchAll iterates over an internal copy of the regex, so the shared
    // global pattern's lastIndex never moves and needs no per-call clone.
    for (const match of text.matchAll(pattern.regex)) {
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
