# Rule Catalog

<!-- CATALOG:START -->

33 rules. Severity is each rule's nominal level; a few (MCPG-104, for one) report some findings lower or higher depending on what they matched.

| ID | Title | Severity | Category | Needs |
|---|---|---|---|---|
| [MCPG-101](./MCPG-101.md) | Hardcoded secret in MCP server config | Critical | Secrets | — |
| [MCPG-102](./MCPG-102.md) | High-entropy value under a secret-shaped env var name | Medium | Secrets | — |
| [MCPG-104](./MCPG-104.md) | MCP server launched via an opaque or dangerous shell invocation | Critical | Secrets | — |
| [MCPG-105](./MCPG-105.md) | Unpinned package version in MCP server launch command | Medium | Secrets | — |
| [MCPG-106](./MCPG-106.md) | MCP server launched from a package the registry marks deprecated | High | Secrets | `--registry` |
| [MCPG-201](./MCPG-201.md) | Hidden instruction in tool description (prompt injection / tool poisoning) | Critical | Poisoning | `--live` |
| [MCPG-202](./MCPG-202.md) | Invisible or obfuscated content in tool description | High | Poisoning | `--live` |
| [MCPG-203](./MCPG-203.md) | Tool description targets another server's tool by name (shadowing) | Critical | Poisoning | `--live` |
| [MCPG-204](./MCPG-204.md) | Tool parameter shaped as a covert data-exfiltration channel | High | Poisoning | `--live` |
| [MCPG-205](./MCPG-205.md) | Hidden instruction in prompt metadata (prompt injection) | Critical | Poisoning | `--live` |
| [MCPG-206](./MCPG-206.md) | Invisible or obfuscated content in prompt metadata | High | Poisoning | `--live` |
| [MCPG-207](./MCPG-207.md) | Hidden instruction in resource metadata (prompt injection) | Critical | Poisoning | `--live` |
| [MCPG-208](./MCPG-208.md) | Invisible or obfuscated content in resource metadata | High | Poisoning | `--live` |
| [MCPG-209](./MCPG-209.md) | Resource URI targets credentials, a filesystem root, or internal infrastructure | High | Resources | `--live` |
| [MCPG-210](./MCPG-210.md) | Resource template lets the caller choose what is read | Critical | Resources | `--live` |
| [MCPG-301](./MCPG-301.md) | MCP server scoped to an entire filesystem root | High | Scope | — |
| [MCPG-302](./MCPG-302.md) | High-risk tool accepts an unconstrained string parameter | Medium | Scope | `--live` |
| [MCPG-303](./MCPG-303.md) | Destructive-sounding tool with no confirmation annotation | Medium | Scope | `--live` |
| [MCPG-401](./MCPG-401.md) | Unencrypted (http://) MCP server transport | High | Transport | — |
| [MCPG-402](./MCPG-402.md) | TLS certificate verification disabled | Critical | Transport | — |
| [MCPG-403](./MCPG-403.md) | MCP server URL points at a private or cloud-metadata address | High | Transport | — |
| [MCPG-404](./MCPG-404.md) | Remote MCP endpoint answered an unauthenticated client | Medium | Transport | `--live` |
| [MCPG-501](./MCPG-501.md) | Server definition changed since it was last pinned | High | Integrity | lock file (`guardmcp pin`) |
| [MCPG-502](./MCPG-502.md) | Server's live tool definitions changed since they were last pinned | Critical | Integrity | lock file + `--live` |
| [MCPG-601](./MCPG-601.md) | MCP server active outside the project’s declared configuration | Low | Governance | auto-discovery (project + machine-wide configs) |
| [MCPG-602](./MCPG-602.md) | MCP server launched listening on every network interface | Medium | Governance | — |
| [MCPG-701](./MCPG-701.md) | Telemetry or logging disabled in MCP server launch configuration | Medium | Audit | — |
| [MCPG-702](./MCPG-702.md) | Server can change things but declares no logging capability | Medium | Audit | `--live` |
| [MCPG-801](./MCPG-801.md) | Sensitive tool parameter mirrored into an HTTP header | Critical | Declaration | `--live` |
| [MCPG-802](./MCPG-802.md) | Invalid x-mcp-header declaration (header injection or malformed mirror) | Critical | Declaration | `--live` |
| [MCPG-803](./MCPG-803.md) | Display title conceals what the tool actually does | High | Declaration | `--live` |
| [MCPG-901](./MCPG-901.md) | Tool name is offered by more than one server | High | Namespace | `--live` |
| [MCPG-902](./MCPG-902.md) | Tool name mimics another tool's name with lookalike characters | Critical | Namespace | `--live` |

"Needs" is what a scan must be given for the rule to run at all; `—` means the config file alone. Generated from the rule registries by `npm run docs:rules` — do not edit this table by hand.

<!-- CATALOG:END -->

Numbering skips MCPG-103 — reserved for a broad env-var-passthrough rule that was deliberately deferred (see `docs/planning/mcp-guard-plan.md`, Faz 2 notes): the heuristic for "this env var is unrelated to what the server does" needs real usage data to calibrate without becoming a false-positive generator.
