# guardmcp

**Security scanner for [MCP](https://modelcontextprotocol.io) (Model Context Protocol) servers and configs** — hardcoded secrets, tool poisoning, insecure transport, unrestricted permissions. Terminal, JSON, or schema-validated [SARIF](https://sarif-sdlc.io/) output for direct GitHub Code Scanning integration.

[![CI](https://github.com/BerkantACUN/guardmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/BerkantACUN/guardmcp/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

> **Status:** core scanner + 17 rules + GitHub Action are done and CI-verified. Not yet published to npm — see [Installation](#installation) for what works today. Live introspection (`--live`) and rug-pull pinning are next (Phase 3).

## Why

MCP servers ship with real security gaps — one academic scanning study puts it at 66-72% of servers having at least one issue — and the tool `description` a server advertises is read by the LLM, not by the human who approved installing it. That's the whole attack surface of *tool poisoning*: a sentence you'll never scroll to can carry an instruction the model will follow.

Existing scanners are either closed-source enterprise platforms (Snyk Agent Scan, Cisco AI Defense) or small single-maintainer projects with narrow coverage. Neither Snyk nor Cisco's scanner emits SARIF — the format that plugs straight into GitHub's Code Scanning tab. `guardmcp` does, and validates its own output against the official SARIF 2.1.0 schema in CI so that claim isn't just a README line.

## What it catches

```
$ guardmcp scan .mcp.json

.mcp.json
  CRITICAL  MCPG-101  Hardcoded GitHub token found in "example-server" server config.
    7:25  ghp_…yz12
    Fix: Move this value to an environment variable or secret manager reference,
    then rotate the exposed credential — it must be treated as compromised once committed.

  MEDIUM  MCPG-105  "example-server" server launches "some-mcp-server" without a
  pinned version — every run may fetch a different, unreviewed release.
    5:22
    Fix: Pin to a specific version: "some-mcp-server@<version>". A publish under
    the same "latest" tag can silently change what code runs on your machine.

1 critical, 1 medium — 2 finding(s) across 1 file(s)
```

That's a real run against a real (synthetic) fixture in this repo — [`tests/fixtures/configs/malicious/leaked-github-token.json`](./tests/fixtures/configs/malicious/leaked-github-token.json), not a mockup.

17 rules across four categories:

| Category | Rules | Catches |
|---|---|---|
| **Secrets** | MCPG-101, 102, 104, 105 | Hardcoded provider keys (GitHub/Anthropic/AWS/Slack/JWT), high-entropy unknown secrets, `curl \| sh`-style fetch-and-execute, unpinned package versions |
| **Transport** | MCPG-401–404 | Plain `http://`, disabled TLS verification, SSRF-reachable (private/metadata) targets, unauthenticated remote endpoints |
| **Tool poisoning** | MCPG-201–204 | Hidden imperative instructions in tool descriptions, invisible/bidi Unicode, cross-server tool shadowing, covert exfiltration parameters |
| **Scope** | MCPG-301–303 | Filesystem-root-scoped servers, unconstrained inputs on exec-shaped tools, destructive tools with no confirmation hint |

Full catalog: [`docs/rules/`](./docs/rules/). Design doc + rule rationale + competitive analysis: [`mcp-guard-plan.md`](https://github.com/BerkantACUN/AgentSpace/blob/master/docs/planning/mcp-guard-plan.md).

## Installation

**Not yet published to npm.** Two things work today:

**1. Run from source:**
```sh
git clone https://github.com/BerkantACUN/guardmcp.git
cd guardmcp && npm install && npm run build
node dist/cli/index.js scan
```

**2. GitHub Action, via git ref (works right now, no npm publish needed):**
```yaml
- uses: BerkantACUN/guardmcp@master
  with:
    fail-on: high
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: guardmcp-results.sarif
```

Once published, `npx guardmcp scan` and `uses: BerkantACUN/guardmcp@v1` (a real tagged release) will be the supported paths — tracked in [Issues](https://github.com/BerkantACUN/guardmcp/issues).

## CLI

```
guardmcp scan [paths...]
  --format human|json|sarif   default: human
  --output <file>             write report to a file instead of stdout
  --fail-on <severity>        info|low|medium|high|critical, default: high
  --rules <ids>               run only these rule IDs (comma-separated)
  --ignore-rule <ids>         skip these rule IDs
  --baseline <file>           suppress findings already accepted (see below)
```

With no `[paths]`, `scan` auto-discovers project-level (`.mcp.json`, `.vscode/mcp.json`) **and** global (Claude Desktop, Cursor, Windsurf) configs across Windows/macOS/Linux.

### Baselining known findings

```sh
guardmcp scan --format json | jq '[.findings[].fingerprint]' > known.txt
# hand-edit known.txt into { "version": "1", "fingerprints": [...] }, then:
guardmcp scan --baseline baseline.json
```

Fingerprints are computed from rule + file + *logical* JSON path, not line/column — a baseline survives an unrelated reformat elsewhere in the file instead of silently re-flagging everything.

## GitHub Action reference

| Input | Default | Description |
|---|---|---|
| `paths` | *(auto-discover)* | Space-separated config paths |
| `fail-on` | `high` | Minimum severity that fails the step |
| `rules` / `ignore-rule` | — | Comma-separated rule ID filters |
| `sarif-output` | `guardmcp-results.sarif` | Where to write the report |

Outputs: `sarif-path`, `exit-code`.

## Threat model for `--live` (Phase 3, not yet shipped)

Connecting to a real MCP server to introspect its live tool list is inherently running untrusted code's metadata-reporting path. When it lands: opt-in only, minimal env, hard timeout, and only `tools/list`/`resources/list`/`prompts/list` calls — never a tool invocation. Tracked in the design doc.

## Development

```sh
npm install
npm run dev -- --version    # run CLI from source (tsx)
npm test                    # vitest
npm run verify               # typecheck + lint + build + test w/ coverage (what CI runs)
```

250+ tests, coverage enforced at 80% (statements/branches/functions/lines) in `vitest.config.ts`. Every rule has a malicious fixture, a benign false-positive-regression fixture, and — where applicable — a test for the exact line/column it reports.

## Security

See [SECURITY.md](./SECURITY.md) for reporting a vulnerability in guardmcp itself, and for responsible disclosure guidance if a scan surfaces a real issue in a server you don't own.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
