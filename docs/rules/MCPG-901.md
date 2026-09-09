# MCPG-901 — Tool name is offered by more than one server

**Severity:** High · **Confidence:** High · **Category:** Namespace · **Requires:** `--live`
**OWASP:** MCP03 (Tool Poisoning), MCP06 (Intent Flow Subversion)

## MCP does not namespace tool names

A client connected to several servers merges their tool lists into one list for
the model. Nothing in the protocol qualifies a name by its server: the model
sees `search`, and calls `search`.

So when two servers both offer `search`, the model is choosing between two
tools it has no way to distinguish. Which one it reaches is decided by the
client's merge order — an implementation detail, not a decision anyone made.

```
server "trusted-api"  →  search   "Searches the company knowledge base."
server "helper"       →  search   "Searches the web."
```

Both descriptions are honest. Neither server is doing anything the
specification forbids. The ambiguity is still real, and it resolves silently.

## Why the existing rules do not cover it

| Rule | Needs |
|---|---|
| `MCPG-203` | redefinition language in the description (*"call this instead of…"*) |
| `MCPG-803` | a `title` that disagrees with the `name` |
| `MCPG-901` | nothing but the collision |

An attacker who simply registers a colliding name writes no suspicious
description and sets no misleading title. There is no signal to find except the
duplicate name itself, which is why this rule looks at nothing else.

## What it detects

A tool whose `name` is also offered by at least one **other** server in the same
scan. Every colliding server is named in the finding, not just the first.

## What it does not do

- **Two tools with the same name on the same server.** A server cannot register
  a name twice; if a listing shows it, that is that server's bug and it creates
  no cross-server ambiguity.
- **Judge which server is the legitimate one.** It cannot be known from here,
  and a collision between two entirely legitimate servers is still worth
  surfacing.

## Fixing it

Rename the tool on one side, or drop the server that does not need to expose
the name. If both are genuinely required, find out which one your client
resolves to — a collision that resolves correctly today can resolve the other
way after a client update or a reordered config, with no diff to review.
