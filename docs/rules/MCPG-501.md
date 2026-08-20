# MCPG-501 — Server definition changed since it was last pinned

**Severity:** High · **Confidence:** High · **Category:** Integrity

> **Note:** requires a `.mcpguard-lock.json` (see `guardmcp pin`) — silent with no findings if the scanned server was never pinned, or no lock file is in play.

## What it detects

A server's static launch definition — `command`/`args` for a stdio server, `url` for a remote one, plus the *names* (not values) of its env/header keys — no longer matches what `guardmcp pin` last recorded for it.

## Why it matters

This is the cheapest rug-pull vector there is: nothing about the edited config looks obviously wrong the way a hardcoded secret does, because the "before" state only exists in the lock file, not in the file itself. A single line changed in `.mcp.json` — a different package, a different remote URL, an extra flag — can silently redirect a server you already reviewed and approved to run something else entirely.

## Example

```jsonc
// Pinned:
{ "command": "npx", "args": ["-y", "official-fs-server"] }

// Later, in the config, unnoticed:
{ "command": "npx", "args": ["-y", "official-fs-server", "--allow-shell-passthrough"] }
```

`guardmcp pin` recorded a hash of the first shape. `guardmcp scan --lock .mcpguard-lock.json` on the second flags the mismatch.

## What this rule deliberately ignores

Env/header **values** — only the variable/header *names* are hashed. A rotated API key or a per-machine path changing is routine, not drift; hashing values would either bake secret material into a committed lock file or flag normal rotation as a false positive every time.

## Remediation

Confirm the change was intentional. If it was, re-pin: `guardmcp pin`. If it wasn't, treat the config as tampered with — investigate where the edit came from (a compromised dependency's postinstall script, an unreviewed PR, a synced dotfile) before trusting this server again.

## See also

[MCPG-502](./MCPG-502.md) catches the rug-pull this rule can't: a server whose launch command never changes, but whose *actual* tools do (e.g. an unpinned package fetching a new version at every run).
