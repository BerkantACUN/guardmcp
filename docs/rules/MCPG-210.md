# MCPG-210 — Resource template lets the caller choose what is read

**Severity:** Critical (unbounded file) / High (traversal, caller-chosen host) · **Confidence:** High · **Category:** Resources · **Requires:** `--live`
**OWASP:** MCP01, MCP02, MCP10

## Why templates need their own rule

A resource points at one URI, so a reviewer can look at it — that is what [MCPG-209](./MCPG-209.md) checks. A resource **template** names a shape the caller fills in, so there is no URI to check until it is expanded, and what it reaches is decided at call time by whatever supplies the variable. In an agent, that is the model.

```json
{ "uriTemplate": "file:///{path}", "name": "any-file", "description": "Reads a project file." }
```

That is arbitrary local file read, advertised as a feature. The description is not lying — it just isn't the constraint.

## The distinction that matters: RFC 6570 expansion operators

| Operator | Behaviour | Consequence |
|---|---|---|
| `{var}` | simple expansion — reserved characters including `/` are **percent-encoded** | a value cannot climb out of its path segment |
| `{+var}` | reserved expansion — `/` and `.` pass through **unencoded** | `../../etc/passwd` survives |
| `{#var}` | fragment expansion — same reserved set | same |

So `file:///srv/docs/{name}.md` is anchored and `file:///srv/docs/{+name}` is not, though they look alike.

## What it detects

| Kind | Severity | Example |
|---|---|---|
| **Unbounded file** | Critical | `file:///{path}`, `file://{path}` |
| **Traversable file** | High | `file:///srv/docs/{+name}`, `{#name}` |
| **Caller-chosen host** | High | `https://{host}/api` — the caller decides where the request goes, which is SSRF by construction |

Not flagged: `file:///srv/docs/{name}.md`, `https://api.example.com/{id}` — anchored, with the variable confined to one segment.

## Remediation

- **Unbounded:** anchor to the directory the server is for — `file:///srv/project/{name}.md`.
- **Traversable:** use `{name}` instead of `{+name}`. Simple expansion encodes `/` and `.`; reserved expansion exists precisely to let them through.
- **Caller-chosen host:** put the hostname in the template, leave only the path variable.

## Limitations

Reads the template, not the server's own validation. A server may reject traversal at expansion time; nothing about that is visible from `resources/templates/list`. Treat this as "the advertised shape permits it", not "the server will do it".
