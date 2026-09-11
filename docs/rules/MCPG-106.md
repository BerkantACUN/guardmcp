# MCPG-106 — MCP server launched from a package the registry marks deprecated

**Severity:** High · **Confidence:** High · **Category:** Secrets & supply chain · **Requires:** `--registry`
**OWASP:** MCP04 (Software Supply Chain Attacks & Dependency Tampering)

## Where this came from

Not from imagining a threat. From measuring one.

Four reference MCP servers — `server-postgres`, `server-github`,
`server-puppeteer`, `server-brave-search` — were pulling about **214,000
installs a week** between them when this rule was written. Every one was
marked deprecated on npm. Their repository had been archived for fifteen
months, and its README said, in capitals:

> NO SECURITY GUARANTEES ARE PROVIDED FOR THESE ARCHIVED SERVERS.

The two with the most installs hold database and source-control credentials.

Nobody installing them was told any of that. npm prints a deprecation message
on every install — the one channel that reaches all 214,000 — and the message
on all four was npm's stock text:

```
Package no longer supported. Contact Support at https://www.npmjs.com/support for more info.
```

That sends the user to npm's help desk, which cannot help with the package,
and names no replacement. A warning that says "ask someone else" is not a
warning. This was reported upstream as
[modelcontextprotocol/servers#4785](https://github.com/modelcontextprotocol/servers/issues/4785);
this rule is the part of the answer that does not depend on anyone else acting.

## What it detects

A stdio server launched through `npx` or `bunx` whose package the npm registry
marks as deprecated. The finding carries:

- the registry's message, verbatim — it is the only guidance the user has;
- whether **every** version is deprecated (the package is abandoned) or only
  the latest (a release was pulled, the package may be fine);
- whether the message is npm's generic default, in which case the finding
  says plainly that it names no replacement, rather than passing the text
  along as though it were advice.

## Why `--registry` is opt-in

The rule needs to ask the registry, and every other rule in guardmcp runs
without touching the network. So the lookup happens at the CLI boundary, once,
under an explicit flag, and the result reaches the rule through `ScanContext`
— the same shape `--live` uses. The rule itself stays a pure function.

Two reasons for the flag rather than always-on:

- It is one request per launched package. A scan that phones home without
  being told to is a scan that is hard to trust.
- Absence must mean "unknown", not "fine". Without `--registry` there is no
  map, and the rule says nothing. With it, a package the registry could not
  answer for (offline, 404, rate-limited) is left out of the map **and named
  on stderr** as unchecked — it never becomes a finding and never becomes a
  silent pass.

## How it relates to MCPG-105

MCPG-105 flags a package with no pinned version: a rug-pull publish reaches
you because you asked for `latest`. This rule covers the case where pinning
would not help — there is no version worth pinning to, because there will
never be another one.

## What it does not do

- **PyPI.** `uvx` servers are skipped. PyPI can yank individual releases but
  has no way to mark a project abandoned, so there is nothing to ask.
- **Check whether the repository is archived.** That would be a second lookup
  against a second service. The registry's own deprecation flag is the
  maintainer's explicit statement; it is enough.
- **Decide what to migrate to.** If the registry message names a successor,
  the finding quotes it. If it does not, the finding says so.

## Fixing it

Move to a maintained server. If the deprecation message names one, start
there. If it does not — and for the four that prompted this rule, it does not
— treat the package as unaudited code: it receives no fixes, so anything found
in it stays open for as long as it is installed. Scope its credentials
accordingly until it is replaced.
