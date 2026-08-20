# MCPG-302 — High-risk tool accepts an unconstrained string parameter

**Severity:** Medium · **Confidence:** Medium · **Category:** Scope

> **Note:** operates on a live-introspected tool definition. Requires `guardmcp scan --live` — connects to the real server and checks its actual advertised tools, not just the config file.

## What it detects

A tool whose name or description implies it executes commands/code/shell (`exec`, `run`, `eval`, `shell`, `command`, `script`, `spawn`) has a string-typed input parameter with no `enum`, `pattern`, or `maxLength` constraint.

## Example

```json
{
  "name": "run_command",
  "inputSchema": { "properties": { "command": { "type": "string" } } }
}
```

## Why it matters

For an execution-shaped tool, the input schema *is* the security boundary. An unconstrained string handed to it is effectively unrestricted command injection — there's nothing stopping the model (or a prompt-injected instruction) from passing anything at all.

## Remediation

Constrain the parameter with an enum of allowed values, a validating pattern, or at minimum a `maxLength`.
