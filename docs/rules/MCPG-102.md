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

- Env-var references (`${VAR}`, `$VAR`, `%VAR%`) — the exact remediation this rule itself recommends. The braced form accepts any name, including client-specific ones such as VS Code and Cursor's `${env:NAME}` and `${input:api-key}`.
- Fill-me-in slots whose whole value is a placeholder: `{service_api_key}` (the MCP registry's variable syntax), `<YOUR_API_KEY>`, `[paste token here]`. A slot *inside* a longer value (`Bearer {token}`) is still checked.
- File paths: a key or certificate configured by path (`./certs/server.key`, `~/.ssh/id_ed25519`, `/etc/mcp/keys/signing.pem`, `C:\keys\client.pem`). An absolute path needs a second segment or a file extension to count as one, so a base64 value that merely starts with `/` is still checked.
- Short values, or values under a key name that doesn't look secret-shaped (e.g. `REQUEST_ID`).
- Anything MCPG-101 already caught at higher confidence (no double-reporting the same value).

## Measured false positives

Run over every server in the official MCP registry (see [`docs/research/registry-2026-09`](../research/registry-2026-09/README.md)), this rule fired 33 times; 27 of those values were `{…}` slots and one was a file path. With the exclusions above, the same snapshot produces 5 findings, all literal values supplied by the publisher.

## Remediation

If it's a real secret: move it to an env var reference and rotate it. If it's not a secret, consider a less credential-suggestive name to avoid false alarms.
