# `guardmcp proxy` — client configuration examples

Ready-to-copy configs that run MCP servers behind [`guardmcp proxy`](../../README.md#proxy--watching-a-live-session-guardmcp-proxy). The pattern is always the same: the client launches `guardmcp proxy`, and everything after `--` is the server command you would otherwise have put in the config.

```text
before:  "command": "npx", "args": ["-y", "<server>@<version>", ...]
after:   "command": "guardmcp", "args": ["proxy", "--log", "<file>", "--", "npx", "-y", "<server>@<version>", ...]
```

| Client | File | Where it goes |
|---|---|---|
| Claude Desktop (macOS) | [`claude-desktop/claude_desktop_config.json`](./claude-desktop/claude_desktop_config.json) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Claude Desktop (Windows) | [`claude-desktop/claude_desktop_config.windows.json`](./claude-desktop/claude_desktop_config.windows.json) | `%APPDATA%\Claude\claude_desktop_config.json` |
| Cursor | [`cursor/mcp.json`](./cursor/mcp.json) | `.cursor/mcp.json` in a project, or `~/.cursor/mcp.json` for every project |
| Claude Code | [`claude-code/.mcp.json`](./claude-code/.mcp.json) | `.mcp.json` at the project root (project scope) |

Replace `/Users/you/projects` (and the `C:\Users\you\…` paths on Windows) with real paths. Restart the client after editing its config.

## Installing guardmcp for this

The proxy is launched by your MCP client, so `guardmcp` has to be on the `PATH` the client sees:

```sh
npm install -g guardmcp
```

`guardmcp proxy` is not in a published release yet (it is listed under *Unreleased* in the [changelog](../../CHANGELOG.md)). Until it is, install it from a clone — the built CLI is committed, so no build step is needed:

```sh
git clone --depth 1 https://github.com/BerkantACUN/guardmcp
cd guardmcp
npm pack --ignore-scripts
npm install -g ./guardmcp-*.tgz
```

(`npm install -g github:BerkantACUN/guardmcp` looks shorter but is not recommended: with the npm version this was tested on, a global install from a git URL left a link to a temporary clone that had already been deleted.)

Check with `guardmcp proxy --help`.

A global install is used here rather than `npx -y guardmcp` for two reasons: the client does not have to download guardmcp on every launch, and an unpinned `npx -y guardmcp` in a config is exactly what `guardmcp scan` reports as MCPG-105. If you prefer `npx`, pin a version that includes `proxy`: `"command": "npx", "args": ["-y", "guardmcp@<version>", "proxy", …]`.

### Windows

A global npm install on Windows puts a `.cmd` shim on the `PATH`, and whether a client can start a `.cmd` file directly depends on how it spawns processes. The Windows example sidesteps the question by running the installed CLI with `node` and its full path — find yours with `npm root -g`. Wrapping it in `cmd /c` also works, but a shell in the launch command is what MCPG-104 reports. The server after `--` can stay `npx`: the proxy starts it through `cross-spawn`, which resolves `.cmd` shims.

## Claude Code from the command line

Instead of editing `.mcp.json`, you can let Claude Code write it:

```sh
claude mcp add --scope project memory -- \
  guardmcp proxy --log .guardmcp-memory.jsonl -- \
  npx -y @modelcontextprotocol/server-memory@2026.8.31
```

The first `--` ends `claude mcp add`'s own options; the second ends `guardmcp proxy`'s. Add `.guardmcp-*` to `.gitignore` — the log contains the session's traffic. `--log` and `--sarif` do not create directories: a path whose directory does not exist is refused before the server starts, so the example writes to the project root.

## Where the output goes

- **Findings** (a poisoned tool in a `tools/list` response) are always written to the proxy's stderr, which clients keep in their MCP server logs — e.g. Claude Desktop on macOS writes them under `~/Library/Logs/Claude/` (`mcp*.log`).
- **Traffic** goes to stderr too, unless `--log <file>` is given; then it is appended to that file as JSONL (owner-only, credentials redacted) and stderr carries only findings.
- **`--sarif <file>`** writes the session's distinct findings when the server exits, for upload to GitHub Code Scanning or any SARIF viewer.

Use absolute paths for `--log` and `--sarif` in Claude Desktop and Cursor: the working directory a client starts servers in is not the project directory. The Claude Code example uses relative paths, which resolve against the directory Claude Code was started in — normally the project root. Switch to absolute paths if you start it elsewhere.

## These examples are scanned

`tests/unit/docs/proxy-examples.test.ts` parses every config here and runs guardmcp's own config rules over it, so an example that stops being clean (an unpinned package, a shell in the launch command) fails CI.
