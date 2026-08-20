# MCPG-303 — Destructive-sounding tool with no confirmation annotation

**Severity:** Medium · **Confidence:** Low (name/description matching is a weak signal on its own) · **Category:** Scope

> **Note:** operates on a live-introspected tool definition. Requires `guardmcp scan --live` — connects to the real server and checks its actual advertised tools, not just the config file.

## What it detects

A tool whose name or description implies a destructive/irreversible action (`delete`, `remove`, `drop`, `truncate`, `overwrite`, `format`, `destroy`, `purge`, `wipe`) but either:

- has no `annotations` at all, so a client has no signal to prompt for confirmation before calling it, or
- is annotated `readOnlyHint: true`, which contradicts what it appears to do.

Honestly-annotated tools (`destructiveHint: true`) are never flagged — that's the correct, safe state this rule is pushing toward.

## Remediation

If the tool genuinely performs a destructive/irreversible action, set `annotations.destructiveHint: true` so clients can prompt for confirmation. If it isn't actually destructive, rename it to avoid the ambiguity.
