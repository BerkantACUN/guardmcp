# MCPG-105 — Unpinned package version in MCP server launch command

**Severity:** Medium · **Confidence:** Medium · **Category:** Secrets

## What it detects

A server launched via `npx`, `bunx`, or `uvx` with a package spec that has no version pin (`some-tool`) or is pinned to a moving tag (`some-tool@latest`, `@next`, `@canary`, `@beta`, `@alpha`, `@rc`) — functionally the same risk as no pin at all.

## Why it matters

Every run may silently fetch a different, unreviewed release. A publish under the same tag — whether from a compromised maintainer account or a routine breaking change — changes what code runs on your machine with no signal to you. This is the supply-chain "rug pull" risk in its most common form.

## Example

```json
{ "command": "npx", "args": ["-y", "some-random-mcp-tool"] }
```

## Remediation

Pin to a specific version: `"some-random-mcp-tool@1.4.0"`.
