# MCPG-402 — TLS certificate verification disabled

**Severity:** Critical · **Confidence:** High · **Category:** Transport

## What it detects

A stdio server whose config disables TLS certificate validation, via:

- `env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` (disables validation process-wide for Node.js)
- `env.PYTHONHTTPSVERIFY = "0"` (same, for Python)
- an arg of `--insecure`, `-k`, or `--no-check-certificate`

## Why it matters

Disabling verification makes the server — and any MCP traffic it handles — vulnerable to man-in-the-middle interception. It's almost always a workaround for an unrelated certificate problem, papering over the actual issue instead of fixing it.

## Example

```json
{ "command": "node", "args": ["client.js"], "env": { "NODE_TLS_REJECT_UNAUTHORIZED": "0" } }
```

## Remediation

Remove the setting and fix the underlying certificate problem instead (install the correct CA, use a valid cert) — never disable verification as a workaround.
