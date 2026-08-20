# MCPG-102 — High-entropy value under a secret-shaped env var name

**Severity:** Medium · **Confidence:** Medium · **Category:** Secrets

## What it detects

An environment variable whose *name* suggests it holds a credential (ends in `_KEY`, `_TOKEN`, `_SECRET`, `_PASSWORD`, `_CREDENTIAL`, `_APIKEY`) and whose *value* is long (≥12 chars) and high-entropy (Shannon entropy ≥3.5 bits/char), but doesn't match any of MCPG-101's known provider formats.

This is the lower-confidence complement to MCPG-101: it catches credentials for providers we don't have a specific pattern for yet, at the cost of being a heuristic rather than a certainty.

## Example

```json
{ "env": { "CUSTOM_API_KEY": "x7Qz9pLkR2mN8vT4wY6bC1dF3gH5jK0s" } }
```

## What it does NOT flag

- Env-var references (`${VAR}`, `$VAR`, `%VAR%`) — the exact remediation this rule itself recommends.
- Short values, or values under a key name that doesn't look secret-shaped (e.g. `REQUEST_ID`).
- Anything MCPG-101 already caught at higher confidence (no double-reporting the same value).

## Remediation

If it's a real secret: move it to an env var reference and rotate it. If it's not a secret, consider a less credential-suggestive name to avoid false alarms.
