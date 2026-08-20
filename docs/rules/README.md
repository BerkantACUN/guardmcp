# Rule Catalog

| ID | Title | Severity | Category |
|---|---|---|---|
| [MCPG-101](./MCPG-101.md) | Hardcoded secret in MCP server config | Critical | Secrets |
| [MCPG-102](./MCPG-102.md) | High-entropy value under a secret-shaped env var name | Medium | Secrets |
| [MCPG-104](./MCPG-104.md) | Opaque or dangerous shell invocation | Medium/Critical | Secrets |
| [MCPG-105](./MCPG-105.md) | Unpinned package version in MCP server launch command | Medium | Secrets |
| [MCPG-201](./MCPG-201.md) | Hidden instruction in tool description | Critical | Poisoning* |
| [MCPG-202](./MCPG-202.md) | Invisible or obfuscated content in tool description | High | Poisoning* |
| [MCPG-203](./MCPG-203.md) | Tool shadowing | Critical | Poisoning* |
| [MCPG-204](./MCPG-204.md) | Covert data-exfiltration parameter | High | Poisoning* |
| [MCPG-301](./MCPG-301.md) | Server scoped to an entire filesystem root | High | Scope |
| [MCPG-302](./MCPG-302.md) | High-risk tool, unconstrained input | Medium | Scope* |
| [MCPG-303](./MCPG-303.md) | Destructive tool, no confirmation hint | Medium | Scope* |
| [MCPG-401](./MCPG-401.md) | Unencrypted (http://) transport | High | Transport |
| [MCPG-402](./MCPG-402.md) | TLS certificate verification disabled | Critical | Transport |
| [MCPG-403](./MCPG-403.md) | URL targets a private/metadata address (SSRF) | High | Transport |
| [MCPG-404](./MCPG-404.md) | Remote endpoint with no visible authentication | Medium | Transport |

\* Operates on a live-introspected tool definition, not a static config file — implemented and tested, but not yet wired into `scan` (lands with `--live` in Phase 3). Everything else runs today.

Numbering skips MCPG-103 — reserved for a broad env-var-passthrough rule that was deliberately deferred (see `docs/planning/mcp-guard-plan.md`, Faz 2 notes): the heuristic for "this env var is unrelated to what the server does" needs real usage data to calibrate without becoming a false-positive generator.
