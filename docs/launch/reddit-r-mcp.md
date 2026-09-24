# r/mcp draft

**Title:** I scanned every scannable server in the official MCP registry (34,444 of 35,525) with a config security scanner — what it found, and what it can't see

**Flair:** Resource / Discussion

---

I maintain [guardmcp](https://github.com/BerkantACUN/guardmcp), an open-source security scanner for MCP configs. I wanted to know what its static rules find across the whole official registry, so I wrote a script that pages through `registry.modelcontextprotocol.io`, turns every entry's `packages` / `remotes` into the `mcpServers` config a client would write, and scans those configs. No server was started or contacted.

**Numbers (snapshot 2026-09-24):**

| | |
|---|---:|
| Servers in the registry | 35,525 |
| Turned into a scannable config | 34,444 |
| Findings | 416 on 391 servers |
| Remote endpoints using `https` | 22,164 of 22,164 |

Only two rules fired:

**1. Unpinned package (MCPG-105) — 372 servers, 383 findings.** I pin every package to the version the registry lists, so this only fires where something *else* is unpinned. In 368 cases it's the publisher's `runtimeArguments`: things like `npx -p <pkg> <bin>` or `uvx --from <pkg> <bin>` put a bare package name before the pinned one, and that bare name is what gets installed. 15 packages are published with version `latest`.

If you publish to the registry: check whether your `runtimeArguments` name your package without a version. The registry's `version` field doesn't help if the launch command ignores it.

**2. High-entropy value under a secret-shaped env var (MCPG-102) — 19 servers, 33 findings.** 27 of these are placeholders like `{service_api_key}`, i.e. false positives in guardmcp, fixed in 0.17.0. The other 6 are literal values: four contain "demo" or "readonly", and one is a file path — another false positive, also fixed in 0.17.0.

**What this doesn't tell you:** anything about runtime. Tool poisoning — a tool description with hidden instructions — lives in `tools/list`, not in the registry entry. For that there's `guardmcp scan --live`, and `guardmcp proxy -- <your server command>`, which sits between your client and the server and flags poisoned tools as they arrive.

Script, the exact gzipped snapshot, raw findings and the full report (with a limitations section): https://github.com/BerkantACUN/guardmcp/tree/master/docs/research/registry-2026-09

Anonymised examples are in the report; the raw findings file has real server names because it's derived from public data and it's what makes the numbers checkable. If you find your server in there and think the rendering got it wrong, I'd like to know.
