# guardmcp

**Security scanner for [MCP](https://modelcontextprotocol.io) (Model Context Protocol) servers and configs** — hardcoded secrets, tool poisoning, insecure transport, unrestricted permissions. Terminal, JSON, or schema-validated [SARIF](https://sarif-sdlc.io/) output for direct GitHub Code Scanning integration.

[![CI](https://github.com/BerkantACUN/guardmcp/actions/workflows/ci.yml/badge.svg)](https://github.com/BerkantACUN/guardmcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/guardmcp.svg)](https://www.npmjs.com/package/guardmcp)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](./LICENSE)

> **Status:** core scanner + 27 rules + live introspection (`--live` covers all three MCP surfaces: tools, prompts, resources) + rug-pull pinning (`pin`) + GitHub Action, all CI-verified — and now on npm, see [Installation](#installation).

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

27 rules across nine categories:

| Category | Rules | Catches |
|---|---|---|
| **Secrets** | MCPG-101, 102, 104, 105 | Hardcoded provider keys (GitHub/Anthropic/AWS/Slack/JWT), high-entropy unknown secrets, `curl \| sh`-style fetch-and-execute, unpinned package versions |
| **Transport** | MCPG-401–404 | Plain `http://`, disabled TLS verification, SSRF-reachable (private/metadata) targets, unauthenticated remote endpoints |
| **Tool poisoning** (`--live`) | MCPG-201–204 | Hidden imperative instructions in tool descriptions, invisible/bidi Unicode, cross-server tool shadowing, covert exfiltration parameters |
| **Prompt poisoning** (`--live`) | MCPG-205–206 | The same two attacks on the *prompt* surface — a prompt is instructions by design, so a smuggled directive is less conspicuous there than in a tool description |
| **Declaration** (`--live`) | MCPG-801–803 | A credential parameter mirrored into an HTTP header (`x-mcp-header`, which the spec warns against by name), a header name carrying a CRLF, and a display `title` that hides what the invoked `name` does |
| **Resources** (`--live`) | MCPG-207–209 | Poisoned resource metadata, and — with no equivalent on the other surfaces — a resource URI that points at credentials (`~/.ssh/id_rsa`), a filesystem root, or cloud metadata. A resource *points* somewhere, so what it points at is checkable regardless of what it claims to be |
| **Scope** | MCPG-301, and (`--live`) 302–303 | Filesystem-root-scoped servers, unconstrained inputs on exec-shaped tools, destructive tools with no confirmation hint |
| **Integrity** (rug-pull) | MCPG-501–502 | A server's launch command or its *real* tool definitions changing since you last pinned it — see [Rug-pull pinning](#rug-pull-pinning) |
| **Governance** | MCPG-601 | A server configured machine-wide that the project never declared — it loads with the same reach as reviewed servers, unreviewed |
| **Audit** | MCPG-701 | Telemetry or logging switched off in a committed config (`OTEL_SDK_DISABLED`, `LOG_LEVEL=silent`, …) — actions leave no record of their own |

Full catalog: [`docs/rules/`](./docs/rules/). Design doc + rule rationale + competitive analysis: [`mcp-guard-plan.md`](https://github.com/BerkantACUN/AgentSpace/blob/master/docs/planning/mcp-guard-plan.md).

## OWASP MCP Top 10 coverage

Findings are mapped to the [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) (v0.1)
so a result means something to a reviewer who has never heard of this tool — and so a
scan can be read against a published standard rather than a private rule numbering.

<!-- OWASP:START -->

**10 of 10** OWASP MCP Top 10 categories have at least one rule.

| | Category | Risk | guardmcp rules |
|---|---|---|---|
| ✅ | [**MCP01**](https://owasp.org/www-project-mcp-top-10/2025/MCP01-2025-Token-Mismanagement-and-Secret-Exposure) | Token Mismanagement & Secret Exposure | `MCPG-101`, `MCPG-102`, `MCPG-209`, `MCPG-401`, `MCPG-402`, `MCPG-801` |
| ✅ | [**MCP02**](https://owasp.org/www-project-mcp-top-10/2025/MCP02-2025%E2%80%93Privilege-Escalation-via-Scope-Creep) | Privilege Escalation via Scope Creep | `MCPG-209`, `MCPG-301`, `MCPG-302`, `MCPG-403` |
| ✅ | [**MCP03**](https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning) | Tool Poisoning | `MCPG-201`, `MCPG-202`, `MCPG-203`, `MCPG-204`, `MCPG-205`, `MCPG-206`, `MCPG-207`, `MCPG-208`, `MCPG-502` |
| ✅ | [**MCP04**](https://owasp.org/www-project-mcp-top-10/2025/MCP04-2025%E2%80%93Software-Supply-Chain-Attacks%26Dependency-Tampering) | Software Supply Chain Attacks & Dependency Tampering | `MCPG-105`, `MCPG-501`, `MCPG-502` |
| ✅ | [**MCP05**](https://owasp.org/www-project-mcp-top-10/2025/MCP05-2025%E2%80%93Command-Injection%26Execution) | Command Injection & Execution | `MCPG-104`, `MCPG-802` |
| ✅ | [**MCP06**](https://owasp.org/www-project-mcp-top-10/2025/MCP06-2025%E2%80%93Intent-Flow-Subversion) | Intent Flow Subversion | `MCPG-203`, `MCPG-205`, `MCPG-303`, `MCPG-803` |
| ✅ | [**MCP07**](https://owasp.org/www-project-mcp-top-10/2025/MCP07-2025%E2%80%93Insufficient-Authentication%26Authorization) | Insufficient Authentication & Authorization | `MCPG-401`, `MCPG-402`, `MCPG-404` |
| ✅ | [**MCP08**](https://owasp.org/www-project-mcp-top-10/2025/MCP08-2025%E2%80%93Lack-of-Audit-and-Telemetry) | Lack of Audit and Telemetry | `MCPG-701` |
| ✅ | [**MCP09**](https://owasp.org/www-project-mcp-top-10/2025/MCP09-2025%E2%80%93Shadow-MCP-Servers) | Shadow MCP Servers | `MCPG-601` |
| ✅ | [**MCP10**](https://owasp.org/www-project-mcp-top-10/2025/MCP10-2025%E2%80%93ContextInjection%26OverSharing) | Context Injection & Over-Sharing | `MCPG-204`, `MCPG-207`, `MCPG-209`, `MCPG-801` |

Mapped against [`165fe0f`](https://github.com/OWASP/www-project-mcp-top-10/tree/165fe0f78ef104459237b4a8e0f6e78db9b02391/2025) of the OWASP list.
The list is a v0.1 beta that moves under its own label, and independent tools have already
ended up with numbering that does not line up — so the SARIF taxonomy pins the exact commit
this mapping was drafted against (`taxonomies[0].properties.specCommit`), which makes a
disagreement about a category settleable by fetching that tree rather than by argument.

Every finding carries its OWASP category in the SARIF output — as a first-class
[`taxonomies`](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html#_Toc34317841)
entry with per-rule `relationships`, plus `properties.tags` so the categories show up as
filter chips in GitHub's Code Scanning UI.

<!-- OWASP:END -->

## Installation

**1. npx (no install):**
```sh
npx guardmcp scan
```

**2. Global install:**
```sh
npm install -g guardmcp
guardmcp scan
```

**3. GitHub Action, via a tagged release:**
```yaml
- uses: BerkantACUN/guardmcp@v0.2.1
  with:
    fail-on: high
- uses: github/codeql-action/upload-sarif@v3
  if: always()
  with:
    sarif_file: guardmcp-results.sarif
```

**4. Run from source** (for contributing, or to try an unreleased change):
```sh
git clone https://github.com/BerkantACUN/guardmcp.git
cd guardmcp && npm install && npm run build
node dist/cli/index.js scan
```

## CLI

```
guardmcp scan [paths...]
  --format human|json|sarif   default: human
  --output <file>             write report to a file instead of stdout
  --fail-on <severity>        info|low|medium|high|critical, default: high
  --rules <ids>               run only these rule IDs (comma-separated)
  --ignore-rule <ids>         skip these rule IDs
  --baseline <file>           suppress findings already accepted (see below)
  --live                      connect to every stdio server and scan its REAL tools (MCPG-2xx/3xx)
  --live-timeout <ms>         per-server timeout for --live, default: 10000
  --lock <file>                enable rug-pull drift checks (MCPG-501/502); defaults to
                               .mcpguard-lock.json in cwd if present (see below)

guardmcp pin [paths...]
  --live                      also connect and pin each server's REAL tool list, not just its config
  --live-timeout <ms>         per-server timeout for --live, default: 10000
  --output <file>              lock file path, default: .mcpguard-lock.json
```

With no `[paths]`, both commands auto-discover project-level (`.mcp.json`, `.vscode/mcp.json`) **and** global (Claude Desktop, Cursor, Windsurf) configs across Windows/macOS/Linux.

### Inventory — what do I actually have?

```
$ guardmcp inventory --live

.mcp.json  (project)
  api  stdio  node dist/server.js
    tools        3  read_file, delete_all_records, search_docs
    prompts      1  review_code
    resources    2  project-readme, deploy-key
  broken  stdio  nope-does-not-exist
    could not connect — MCP error -32000: Connection closed
  remote  http  https://api.example.com/mcp
    not introspected

3 servers across 1 config — 3 tools, 1 prompt, 2 resources
```

`scan` answers "is any of this dangerous". `inventory` answers "what is any of
this" — the question you have before you have a security question, and the one
[MCP09](https://owasp.org/www-project-mcp-top-10/2025/MCP09-2025%E2%80%93Shadow-MCP-Servers)
is really about: you cannot review a server you do not know you have.

It never exits non-zero on content. It reports; it does not judge. Note the
three distinct states above — a server that answered, one that could not be
reached, and one that was never asked. "Advertises no tools" and "we did not
ask" are different facts, and blurring them is what makes an inventory useless.
`--format json` for machine consumption.

### CI in one command

```
$ guardmcp init
Wrote .github/workflows/guardmcp.yml
```

Scans on every push and pull request, uploads findings to the Security tab, and
fails the build at your chosen severity. It requests `security-events: write` —
without that permission the scan runs and the findings silently never arrive,
which is the usual way this setup fails.

It does **not** enable `--live`, because that spawns each server's launch
command and is a decision a repository owner should make knowingly rather than
inherit from a generator.

### Baselining known findings

```sh
guardmcp scan --format json | jq '[.findings[].fingerprint]' > known.txt
# hand-edit known.txt into { "version": "1", "fingerprints": [...] }, then:
guardmcp scan --baseline baseline.json
```

Fingerprints are computed from rule + file + *logical* JSON path, not line/column — a baseline survives an unrelated reformat elsewhere in the file instead of silently re-flagging everything.

### Live introspection (`--live`)

```sh
$ guardmcp scan --live
```

Connects to every stdio-launched server in your config, calls its real `tools/list`, and runs the poisoning/scope rules (MCPG-2xx/3xx) against what the server *actually* advertises — not just what's visible in the config file. A malicious tool description doesn't live in `.mcp.json`; it lives on the server, and a config-only scanner can never see it.

**Security constraints this runs under** (see [`src/live/introspect.ts`](./src/live/introspect.ts)):
- **Opt-in only** — never runs on a default `guardmcp scan`.
- **`tools/list` only, never `tools/call`** — discovering what a tool *claims* to do must never mean actually doing it.
- **Environment is scrubbed** — the spawned server gets an OS-appropriate safelist (`PATH`/`HOME`/etc.) plus only the `env` entries its own config declares, never this process's full environment.
- **Hard timeout, both layers** — the MCP SDK's own per-request timeout, plus an outer timeout here that force-closes the connection (and kills the process) regardless.
- **Remote (HTTP/SSE) servers are skipped with a warning** — not yet supported; stdio only today.

### Rug-pull pinning

The classic MCP supply-chain attack: a server you reviewed once keeps the same name and the same-looking config, but what actually runs changes — an unpinned `npx some-mcp-server` silently fetches a new release with a different tool description, or someone quietly edits the launch command. `guardmcp pin` snapshots the current state; a later `scan` flags any drift.

```sh
guardmcp pin --live                 # snapshot config + real tool list into .mcpguard-lock.json
git add .mcpguard-lock.json && git commit -m "chore: pin MCP servers"

# ...later, in CI or locally...
guardmcp scan --live                # auto-detects .mcpguard-lock.json, flags drift
```

Two independent checks, because they catch different things:

| Rule | Compares | Catches |
|---|---|---|
| **MCPG-501** | `command`/`args`/`url` (config-level) | Someone edited the config itself |
| **MCPG-502** | Real `tools/list` output (`--live` only) | The config is untouched, but a new package version behaves differently |

Env/header **values** are deliberately excluded from the config-level hash — only variable *names* — so routine secret rotation never trips a false "drift" alert.

## GitHub Action reference

| Input | Default | Description |
|---|---|---|
| `paths` | *(auto-discover)* | Space-separated config paths |
| `fail-on` | `high` | Minimum severity that fails the step |
| `rules` / `ignore-rule` | — | Comma-separated rule ID filters |
| `sarif-output` | `guardmcp-results.sarif` | Where to write the report |
| `working-directory` | *(cwd)* | Directory to scan from |
| `live` | `false` | Connect to every stdio server and scan its real tools (spawns locally in the runner) |
| `live-timeout` | `10000` | Per-server timeout (ms) for `live` |
| `lock` | *(auto-detect)* | Path to `.mcpguard-lock.json`; defaults to one in `working-directory` if present |

Outputs: `sarif-path`, `exit-code`.

## Development

```sh
npm install
npm run dev -- --version    # run CLI from source (tsx)
npm test                    # vitest
npm run verify               # typecheck + lint + build + test w/ coverage (what CI runs)
```

300+ tests, coverage enforced at 80% (statements/branches/functions/lines) in `vitest.config.ts`. Every rule has a malicious fixture, a benign false-positive-regression fixture, and — where applicable — a test for the exact line/column it reports. `--live`/`pin` are tested against a real spawned MCP server (built on `@modelcontextprotocol/sdk`, [`tests/fixtures/live-servers/`](./tests/fixtures/live-servers/)), not a mock transport.

## Security

See [SECURITY.md](./SECURITY.md) for reporting a vulnerability in guardmcp itself, and for responsible disclosure guidance if a scan surfaces a real issue in a server you don't own.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
