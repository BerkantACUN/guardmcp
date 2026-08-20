# MCPG-301 — MCP server scoped to an entire filesystem root

**Severity:** High · **Confidence:** High · **Category:** Scope

## What it detects

A server argument that is exactly a filesystem root or home-directory shorthand — `/`, `~`, `C:\`, `C:/` — instead of a real project subdirectory.

## Example

```json
{ "command": "npx", "args": ["-y", "some-fs-server", "/"] }
```

## Why it matters

Scoping a filesystem-access server to an entire drive or home directory gives it read/write reach far beyond what an MCP server typically needs for its stated job, turning any vulnerability in that server (or any prompt-injected instruction fed to it) into whole-disk exposure.

## Remediation

Point the server at the narrowest directory that covers its actual job — a specific project folder, not a drive root or home directory.
