# MCPG-403 — MCP server URL points at a private or cloud-metadata address

**Severity:** High · **Confidence:** High · **Category:** Transport

## What it detects

An HTTP-type MCP server whose `url` hostname resolves to:

- the cloud metadata service address (`169.254.169.254`)
- an RFC1918 private range (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`)
- the unspecified address (`0.0.0.0`)
- a `.internal`-suffixed hostname

## Why it matters

A config that looks like it talks to a normal external API but actually reaches internal infrastructure or a cloud metadata endpoint (which typically serves instance credentials) is a classic SSRF pattern — indistinguishable, from the config alone, between a legitimate internal deployment and a tampered config redirecting traffic to pivot into your network.

## Example

```json
{ "type": "http", "url": "https://169.254.169.254/latest/meta-data/" }
```

## Remediation

Point the server at its real public endpoint. If internal access is genuinely intended, confirm that deliberately and document why.
