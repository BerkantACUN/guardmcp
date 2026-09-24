# Show HN draft

**Title:** Show HN: guardmcp – a security scanner for MCP configs, run over the official MCP registry

**URL:** https://github.com/BerkantACUN/guardmcp

---

**First comment (submitter):**

I build guardmcp, an open-source scanner for Model Context Protocol configs (`.mcp.json`, Claude Desktop, Cursor, VS Code). It checks for hardcoded secrets, unpinned packages, plain-HTTP or TLS-disabled transports, and — with `--live` — what a server's tools, prompts and resources actually say at runtime. Output is terminal, JSON or SARIF with OWASP MCP Top 10 tags, so it drops into GitHub Code Scanning.

To see what the static rules find in the wild, I pointed them at every server in the official registry (registry.modelcontextprotocol.io) on 2026-09-24. A script turns each registry entry into the config a client would write after installing it, and runs the scanner over those configs without starting or contacting any server.

What came out:

- 35,525 servers; 34,444 could be turned into a config (mcpb bundles and cargo crates have no launch command a config can hold).
- 416 findings on 391 servers, all medium severity. Two rules fired at all.
- All 22,164 remote endpoints are `https`. Not one cleartext URL.
- The most common finding, an unpinned package (372 servers), mostly isn't about the package the registry lists — that one is pinned. In 368 of 383 cases the publisher's own `runtimeArguments` name a package without a version ahead of it, e.g. `npx -p <pkg> <bin> <pkg>@1.2.3`, which installs whatever `<pkg>` is current. 15 packages are published with the version literally `latest`.
- The second rule (a high-entropy value under a secret-shaped env var) fired 33 times, and 27 of those are template placeholders like `{service_api_key}`. Those were my scanner's false positives, found by this study; 0.17.0 no longer reports placeholders or file paths. Of the 6 literal values, one is a file path.

So the honest summary is: the registry's config layer is in decent shape, and a static config scan finds little there. The risk that matters — a tool description telling the model to read `~/.ssh/id_rsa` — only exists at runtime, and no static scan can see it. That's why the tool also has `scan --live` and a `guardmcp proxy -- <server command>` that sits between client and server and flags a poisoned `tools/list` the moment it goes by.

Everything is reproducible: the script, the exact snapshot it scanned (gzipped), raw findings and the generated report are in the repo. The report has a limitations section I'd ask you to read before quoting any number: https://github.com/BerkantACUN/guardmcp/blob/master/docs/research/registry-2026-09/README.md

Happy to hear where the rendering rules (how a registry entry becomes a config) are wrong — that's the assumption most likely to move the numbers.
