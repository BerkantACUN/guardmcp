# MCPG-401 — Unencrypted (http://) MCP server transport

**Severity:** High · **Confidence:** High · **Category:** Transport

## What it detects

An HTTP-type MCP server whose `url` uses plain `http://` to a non-loopback host. Loopback (`localhost`, `127.x.x.x`, `::1`) is excluded — plain HTTP is expected and fine for local development servers.

## Why it matters

Traffic — including any `Authorization` header carrying your credentials — is readable and tamperable by anyone on the network path.

## Example

```json
{ "type": "http", "url": "http://api.example.com/mcp" }
```

## Remediation

Use `https://` for any non-loopback MCP server endpoint.
