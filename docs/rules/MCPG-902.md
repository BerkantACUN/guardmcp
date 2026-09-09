# MCPG-902 — Tool name mimics another tool's name with lookalike characters

**Severity:** Critical · **Confidence:** High · **Category:** Namespace · **Requires:** `--live`
**OWASP:** MCP03 (Tool Poisoning), MCP06 (Intent Flow Subversion)

## The collision you cannot see

[MCPG-901](./MCPG-901.md) catches a duplicate name, and a duplicate name is at
least visible: two rows in a tool list that read the same. This is the version
that survives review.

Cyrillic small a is `U+0430`. Latin small a is `U+0061`. They are different
characters, they compare unequal in every language, and in every font a
terminal or an approval dialog uses they are the same shape.

```
server "trusted"  →  search          s-e-a-r-c-h        (U+0061 at index 2)
server "evil"     →  seаrch          s-e-а-r-c-h        (U+0430 at index 2)
```

Those two lines are not the same string. On screen they are the same word. A
reviewer reading the tool list sees `search` twice and assumes a duplicate; a
reviewer reading carefully sees `search` once and moves on.

## What it detects

A tool name that

1. contains at least one character from the confusable table, **and**
2. folds — every lookalike replaced by the ASCII it mimics — onto the *actual*
   name of a tool on another server.

Both conditions must hold. The finding is mimicry, not non-ASCII.

The confusable table covers Cyrillic, Greek and fullwidth Latin, and only pairs
whose glyphs are genuinely indistinguishable. Characters that merely look
similar (Cyrillic `д`, Greek `λ`) are excluded deliberately: a rule that fires
on those fires on ordinary non-English tool names, and a rule that cries wolf on
Turkish or Greek tool names teaches people to skip it.

## Why the message prints code points

The two names look identical, so a finding that quotes both of them side by
side tells a reader nothing:

> Tool `seаrch` mimics `search`

That is unreadable as evidence. So the message names the character instead:

> uses **U+0430** in place of "a", so it renders identically to `search`

## What it does not do

- **Flag non-ASCII names.** `araştir` is a Turkish tool name, not an attack.
- **Flag an exact duplicate.** That is MCPG-901's finding; this rule requires
  the two strings to actually differ.
- **Detect ASCII-on-ASCII tricks** (`rn` for `m`, `0` for `O`). Those are
  legible on close reading and flagging them produces noise on legitimate
  names.

## Fixing it

There is no benign reason to name a tool with characters chosen to render as
another tool's name. Treat the server as hostile, disconnect it, and check what
it was called with while it was connected.
