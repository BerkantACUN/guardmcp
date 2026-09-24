# Launch drafts

Drafts for sharing the [registry study](../research/registry-2026-09/README.md). Nothing here has been posted.

| File | Where | Language |
|---|---|---|
| [`show-hn.md`](./show-hn.md) | Hacker News — title + the submitter's first comment | English |
| [`reddit-r-mcp.md`](./reddit-r-mcp.md) | r/mcp | English |
| [`devto.md`](./devto.md) | dev.to article | English |
| [`medium-tr.md`](./medium-tr.md) | Medium article | Türkçe |

## Numbers used, and where each one comes from

Every figure in the drafts is copied from the study's generated output (snapshot taken 2026-09-24T11:27:09Z, guardmcp 0.16.1). If the study is re-run, update the drafts from the new `summary.json` — do not edit a number by hand.

| Figure | Value | Source (`docs/research/registry-2026-09/summary.json`) |
|---|---:|---|
| Registry pages fetched | 356 | `registry.pages` |
| Servers in the registry (latest version of each) | 35,525 | `registry.servers` |
| Servers turned into a scannable config | 34,444 | `scan.serversWithAConfig` |
| Package / remote entries rendered | 37,368 | `scan.entriesRendered` |
| Entries not representable (mcpb / cargo) | 1,291 / 57 | `scan.entriesSkipped` |
| Findings / servers with a finding | 416 / 391 | `totals` |
| MCPG-105 unpinned package: servers / findings | 372 / 383 | `rules[MCPG-105]` |
| — flagged value from the publisher's `runtimeArguments` | 368 | `rules[MCPG-105].origin` |
| — package published with version `latest` | 15 | `rules[MCPG-105].origin` |
| MCPG-102 high-entropy value: servers / findings | 19 / 33 | `rules[MCPG-102]` |
| — value is a `{…}` template placeholder | 27 | `rules[MCPG-102].shape` |
| — literal values: 4 contain "demo"/"readonly", 1 is a file path | 6 | `findings.json`, MCPG-102 rows with `valueShape: "literal value"` |
| Findings discarded because they hit a value the script generated | 9 | `scan.discardedOnGeneratedValues` |
| Remote endpoint URLs, all `https` | 22,164 | `registry.remoteUrlSchemes` |
| Servers the registry itself marks deprecated | 377 | `registry.byStatus` |

## Before posting

- Merge the study PR first, so every link below resolves on `master`.
- Re-read the "Limitations" section of the study; each draft links to it and should not claim more than it does.
- Do not add "first" or any figure that is not in the table above.
