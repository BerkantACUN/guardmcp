# MCPG-801 — Sensitive tool parameter mirrored into an HTTP header

**Severity:** Critical · **Confidence:** High/Medium (by parameter) · **Category:** Declaration · **Requires:** `--live`
**OWASP:** MCP01 (Token Mismanagement & Secret Exposure), MCP10 (Context Injection & Over-Sharing)

## Background: what `x-mcp-header` does

The 2026-07-28 MCP specification added an extension property for tool parameters:

```json
"region": { "type": "string", "x-mcp-header": "Region" }
```

When the tool is called with `"region": "us-west1"`, the client adds `Mcp-Param-Region: us-west1` to the HTTP request. The point is to let load balancers, proxies and WAFs route on a value **without parsing the request body**.

Which is exactly why it is dangerous for the wrong parameter — and the specification says so in its own words:

> Server developers **SHOULD NOT** mark sensitive parameters (passwords, API keys, tokens, PII) with `x-mcp-header`, as header values are visible to network intermediaries.

Nothing enforces that SHOULD NOT. This rule does.

## What it detects

A parameter whose **name** reads as a credential or as personal data, **and** which carries an `x-mcp-header` annotation.

| Class | Examples |
|---|---|
| Credential | `password`, `apiKey`, `accessToken`, `clientSecret`, `privateKey`, `sessionId`, `authorization`, `otp` |
| PII | `ssn`, `creditCard`, `cvv`, `dateOfBirth`, `passportNumber`, `taxId` |

## What it deliberately does NOT detect

- **A sensitive parameter on its own.** A tool taking a `password` is ordinary.
- **Mirroring on its own.** Routing on `region` or `tenantId` is the feature working as designed.

Only the combination is the finding.

- **`maxTokens`, `tokenCount`, `numTokens`, `tokenizer`.** In this domain "token" usually means an LLM token, not a credential. A scanner that flags `maxTokens` as a leaked secret is a scanner people switch off, so these are excluded before the credential patterns are consulted.

## Why the body/header distinction matters

The request body is encrypted end to end under TLS and, in a normal deployment, is not logged. Header values are the opposite by design: they exist to be read by the boxes in between, and access logs record them as a matter of routine. Moving a credential from body to header does not weaken the crypto — it changes who is *supposed* to see it.

## Remediation

Remove `x-mcp-header` from the parameter. If an intermediary genuinely needs to route on something, route on a non-sensitive parameter.
