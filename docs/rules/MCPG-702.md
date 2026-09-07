# MCPG-702 — Server can change things but declares no logging capability

**Severity:** Medium · **Confidence:** High · **Category:** Audit · **Requires:** `--live`
**OWASP:** [MCP08 — Lack of Audit and Telemetry](https://owasp.org/www-project-mcp-top-10/2025/MCP08-2025%E2%80%93Lack-of-Audit-and-Telemetry)

## What it detects

Both halves are observed at the protocol, not inferred:

1. the server declared **no `logging` capability** at `initialize`, and
2. its `tools/list` includes at least one tool that **changes something**.

`logging` is the channel through which a server reports what it did. Without it a server can still act — it simply has no way to say so, and a client has nowhere to collect a record from.

## Why it needs both halves

[MCPG-404](./MCPG-404.md) was rewritten because it fired on every remote server and therefore carried no information. This rule was written with that in mind.

Plenty of read-only servers legitimately have nothing to report, and flagging every server without `logging` would repeat exactly that mistake. **The finding is the combination**: this server can change things, and nothing it changes can be reported.

## How "changes something" is decided

| Signal | Reading |
|---|---|
| `annotations.destructiveHint: true` | changes things — taken at its word |
| `annotations.readOnlyHint: true` | does not — also taken at its word |
| neither | falls back to the name/description verb list shared with [MCPG-303](./MCPG-303.md) |

A tool whose `readOnlyHint` contradicts its name is [MCPG-303](./MCPG-303.md)'s business, not this rule's.

## Relationship to MCPG-701

[MCPG-701](./MCPG-701.md) reads the **config**: it catches a telemetry kill switch someone committed. This reads the **protocol**: it catches a server that never had the capability at all. Different evidence, same category — a config can be clean while the server is still unable to report anything.

## Remediation

If you maintain the server, declare the `logging` capability and emit a notification per tool call.

If you do not, treat this server as unauditable: whatever it does will have to be reconstructed from the client side, if at all — which is the position MCP08 exists to warn about.
