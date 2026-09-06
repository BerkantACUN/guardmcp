/**
 * Tool-parameter names that look like they carry a secret or personal data.
 *
 * Exists for MCPG-801: the 2026-07-28 spec lets a tool mirror a parameter
 * into an HTTP header via `x-mcp-header`, and warns in its own words that
 * server developers "SHOULD NOT mark sensitive parameters (passwords, API
 * keys, tokens, PII) with x-mcp-header, as header values are visible to
 * network intermediaries". Deciding whether a parameter is sensitive is
 * therefore a check the spec itself asks someone to make.
 *
 * Separate from MCPG-102's `SECRET_LIKE_KEY`, which is anchored to env-var
 * convention (`*_TOKEN`, screaming snake case). Tool parameters are camelCase
 * JSON Schema keys and need different normalisation.
 */
import type { Confidence } from '../core/severity.js';

export type SensitiveParamKind = 'credential' | 'pii';

export interface SensitiveParamMatch {
  readonly kind: SensitiveParamKind;
  readonly label: string;
  readonly confidence: Confidence;
}

/**
 * Names that CONTAIN a sensitive-looking word but are routine in this domain.
 *
 * `maxTokens` is the one that matters. Every LLM tool has it, it is not a
 * credential, and a scanner that flags it is a scanner the user disables on
 * the first run. Checked before the credential patterns, not after.
 */
const BENIGN_COMPOUNDS =
  /^(max|min|num|total|count|avg|average)?tokens?(count|limit|used|remaining|budget)?$|^tokeniz(e|er|ation)$/;

const CREDENTIAL_PATTERNS: readonly (readonly [RegExp, string, Confidence])[] = [
  [/^(password|passwd|pwd)$|password$/, 'a password', 'high'],
  [
    /^(api|access|secret|private|encryption|signing)key$|(api|access|secret|private)key$/,
    'an API or private key',
    'high',
  ],
  [/^(access|refresh|bearer|auth|id|session)token$|token$/, 'a token', 'medium'],
  [/^(client|app|shared)?secret$/, 'a secret', 'high'],
  [/^credentials?$/, 'credentials', 'high'],
  [/^authorization$|^authheader$/, 'an authorization value', 'high'],
  [/^(session|sid)id$|^cookie$/, 'a session identifier', 'medium'],
  [/^(otp|mfacode|totp|twofactorcode)$/, 'a one-time code', 'high'],
  [/^privatekey$|^signature$/, 'a key or signature', 'medium'],
];

const PII_PATTERNS: readonly (readonly [RegExp, string, Confidence])[] = [
  [/^ssn$|socialsecurity(number)?$/, 'a social security number', 'high'],
  [/^(credit)?card(number)?$|^pan$/, 'a payment card number', 'high'],
  [/^cvv$|^cvc$|^securitycode$/, 'a card security code', 'high'],
  [/^(date)?of?birth$|^dob$|^birthdate$/, 'a date of birth', 'medium'],
  [/^passport(number)?$/, 'a passport number', 'high'],
  [/^(tax|national|nationalinsurance)id$/, 'a government identifier', 'high'],
];

/** Lowercase and drop separators so `api_key`, `API-KEY` and `apiKey` all
 * normalise to the same token. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[_\-\s.]/g, '');
}

export function classifySensitiveParamName(name: string): SensitiveParamMatch | null {
  if (!name) return null;
  const normalized = normalize(name);

  // Checked first: a benign compound must win over the generic `token$`
  // pattern below, not merely tie with it.
  if (BENIGN_COMPOUNDS.test(normalized)) return null;

  for (const [pattern, label, confidence] of CREDENTIAL_PATTERNS) {
    if (pattern.test(normalized)) return { kind: 'credential', label, confidence };
  }
  for (const [pattern, label, confidence] of PII_PATTERNS) {
    if (pattern.test(normalized)) return { kind: 'pii', label, confidence };
  }
  return null;
}
