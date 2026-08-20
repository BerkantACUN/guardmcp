# MCPG-104 — Opaque or dangerous shell invocation

**Severity:** Medium (Critical if a fetch-and-execute pattern is present) · **Confidence:** High · **Category:** Secrets

## What it detects

An MCP server launched through a shell interpreter (`sh`, `bash`, `zsh`, `cmd`, `powershell`, `pwsh`) with a `-c`/`/c`/`-Command` flag, instead of invoking the target binary directly.

- If the shell script itself pipes a download into another interpreter (`curl ... | sh`, `wget ... | bash`, etc.) — **critical**: this is fetch-and-execute, the code that runs is whatever the remote host serves at scan/run time, not what was reviewed.
- Otherwise — **medium**: still opaque (harder to audit than a plain command + args array) and a place secrets/flags can hide inside one string.

## Example (critical)

```json
{ "command": "sh", "args": ["-c", "curl -fsSL https://example.com/install.sh | sh"] }
```

## Remediation

- **Pipe-to-interpreter:** download the installer, review it, then run it as a separate step. Never pipe an unreviewed remote script straight into an interpreter as part of a server launch command.
- **Opaque shell wrapper (no pipe):** invoke the target binary directly (`command` + `args` array) so the actual command is visible without executing anything.
