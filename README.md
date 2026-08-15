# guardmcp

Security scanner for [MCP](https://modelcontextprotocol.io) (Model Context Protocol) servers and configs.

> ⚠️ **Status: early development (Phase 0/1).** Not yet functional as a scanner. Tracking progress in [Issues](https://github.com/BerkantACUN/guardmcp/issues).

## What it does (planned)

`guardmcp` scans the MCP servers configured on your machine — Claude Desktop, Claude Code, VS Code, Cursor, Windsurf — for known MCP-specific attack classes:

- **Tool poisoning** — hidden instructions smuggled into a tool's `description` field, invisible-character injection, cross-server tool shadowing.
- **Secret leaks** — hardcoded API keys/tokens in server config, over-broad env var passthrough.
- **Rug pulls** — a tool's definition silently changing after you've already approved it (hash-pinned integrity checking).
- **Excessive permissions** — tools that imply unrestricted filesystem/shell/network access without scoping.
- **Insecure transport** — unencrypted HTTP, disabled TLS verification, SSRF-reachable targets.

Output: human-readable terminal report, JSON, or [SARIF](https://sarif-sdlc.io/) for direct GitHub Code Scanning integration.

## Why

Most MCP servers ship with real security gaps (~66-72% per academic scanning studies), and the tool description a server advertises is read by the LLM, not by you. Existing scanners are either closed-source enterprise platforms or small single-maintainer projects with narrow coverage. `guardmcp` aims to be the SARIF-native, CI-friendly one that also takes rug-pull detection seriously — a category the tool that invented it has since deprioritized.

See [`docs/planning/mcp-guard-plan.md`](https://github.com/BerkantACUN/AgentSpace/blob/master/docs/planning/mcp-guard-plan.md) in the companion [AgentSpace](https://github.com/BerkantACUN/AgentSpace) repo for the full design doc, rule catalog, and competitive analysis.

## Installation

Not yet published. Once Phase 4 ships:

```sh
npx guardmcp scan
```

## Development

```sh
npm install
npm run dev -- --version   # run CLI from source
npm test                   # vitest
npm run verify              # typecheck + lint + test w/ coverage
```

## License

Apache-2.0 — see [LICENSE](./LICENSE).
