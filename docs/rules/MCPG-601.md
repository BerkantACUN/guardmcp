# MCPG-601 — MCP server active outside the project's declared configuration

**Severity:** Low · **Confidence:** Medium · **Category:** Governance
**OWASP:** [MCP09 — Shadow MCP Servers](https://owasp.org/www-project-mcp-top-10/2025/MCP09-2025%E2%80%93Shadow-MCP-Servers)

## What it detects

A server declared in a **machine-wide** MCP config (Claude Desktop, Cursor, Windsurf, VS Code user settings) that the **project's own** config does not declare.

The rule is deliberately quiet:

- It never fires on the project config — that file *is* the reviewed set.
- It never fires on a file passed explicitly on the command line, because that carries no scope to reason from.
- It stays silent entirely when no project config took part in the scan. Otherwise, running guardmcp on a laptop with no project open would label every personal tool a shadow server, which is noise, not a finding.

## Why it matters

OWASP MCP09 defines shadow servers as MCP deployments that "operate outside the organization's formal security governance". The risk is not that the server is malicious — it is that **it is invisible to everyone but its owner** while having the same reach as the servers that were reviewed.

Both load into the same session. Both see the same context. Only one of them was looked at.

## Example

Project `.mcp.json`:

```json
{ "mcpServers": { "team-docs": { "command": "node", "args": ["docs-server.js"] } } }
```

User-level config:

```json
{
  "mcpServers": {
    "team-docs":        { "command": "node", "args": ["docs-server.js"] },
    "personal-scratch": { "command": "npx",  "args": ["-y", "some-tool@1.0.0"] }
  }
}
```

`personal-scratch` is reported. `team-docs` is not — the project declares it.

## Remediation

If the project needs the server, declare it in the project config so it is reviewed, pinned, and scanned like the rest. If it is genuinely personal tooling, that is fine — but know that it sees the same context project servers do, and nobody reviewing the repository can tell it is there.

## Limitations

This is the config-visible slice of MCP09, and it is a narrow one. OWASP's detection guidance for this category is mostly network-side — "discovery of unregistered hosts exposing /mcp or similar routes", "unknown certificates or self-signed certs in network scans", "anomalous outbound traffic from R&D subnets". A config scanner sees none of that. What it can see is the part named by "agents invoking unknown ... MCP endpoints": a server this machine will load that the project never declared.

Treat a clean MCPG-601 as "nothing unexpected in the configs on this machine", **not** as "no shadow MCP servers exist in this organization".
