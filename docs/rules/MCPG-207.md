# MCPG-207 — Hidden instruction in resource metadata (prompt injection)

**Severity:** Critical · **Confidence:** Medium · **Category:** Poisoning · **Requires:** `--live`
**OWASP:** MCP03 + MCP10

## What it detects

Imperative, model-directed language in a resource's `name` or `description`.

## Why the resource **name** is checked, not just the description

The name is what a human sees when approving or picking a resource. A bidirectional override can make a name render as something other than what it is, so the entry that passes review is not the entry that gets read. The description is what the model reads when deciding which context to pull in — a directive planted there acts before any content is fetched.

## Remediation

Read the metadata outside any AI context — a plain text viewer for MCPG-207, a hex viewer or "show invisibles" for MCPG-208. A resource description exists to say what the data is. It has no reason to instruct the model, and no reason to contain characters that render differently than they are stored.

## Limitations

Metadata only. `resources/read` is never called, so a resource whose metadata is clean but whose *content* carries a payload is not caught here — see [MCPG-209](./MCPG-209.md) for the URI-side check that does not depend on any text field being honest.
