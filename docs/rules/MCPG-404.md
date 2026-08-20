# MCPG-404 — Remote MCP endpoint with no visible authentication

**Severity:** Medium · **Confidence:** Medium (heuristic — auth could legitimately live elsewhere, e.g. mTLS or network policy) · **Category:** Transport

## What it detects

An HTTP-type MCP server with no `Authorization`, `X-Api-Key`, `X-Auth-Token`, `apikey`/`api-key`, or `Cookie` header configured.

## Why it matters

If the endpoint isn't otherwise access-controlled, anyone who can reach it can use it.

## Example

```json
{ "type": "http", "url": "https://api.example.com/mcp" }
```

## Remediation

Add an `Authorization` or API-key header, or confirm the endpoint enforces access control by other means and note that explicitly.
