# MCP08 and MCP09 — what a scanner can and cannot see

Both categories are, in the OWASP text, mostly about **organisational controls**: centralised logging, SIEM integration, retention, asset registries, network discovery. A config scanner and a live `tools/list` probe see neither the organisation nor the network. This note records, item by item, what guardmcp does check for each category, and why the rest is out of reach — so that "10 of 10 categories covered" is read as "every category has at least one rule", not as "every risk in the category is detected".

Source: the category texts at commit [`165fe0f`](https://github.com/OWASP/www-project-mcp-top-10/tree/165fe0f78ef104459237b4a8e0f6e78db9b02391/2025) of OWASP/www-project-mcp-top-10, which was also the upstream `HEAD` when this note was written (checked with `git ls-remote` on 2026-09-24).

## MCP08 — Lack of Audit and Telemetry

| OWASP checklist item / scenario | Detectable? | How |
|---|---|---|
| Scenario 2: "A developer disables telemetry for a testing session" | **Yes, statically** | [MCPG-701](../rules/MCPG-701.md): telemetry/logging kill switches and silenced log levels, in `env` *and* in launch arguments (`--log-level off`, `--no-telemetry`). |
| "Privacy concerns led to overly broad log suppression" | **Partly, statically** | The same rule, when the suppression is a config setting. Suppression inside the server's code is invisible. |
| "Tool invocations, prompt contents, and system events are not captured" | **Partly, live** | [MCPG-702](../rules/MCPG-702.md): a server that exposes state-changing tools but declares no `logging` capability at `initialize` cannot report what it does through the protocol. It says nothing about logs the server keeps elsewhere. |
| "Agent activity is not logged in a structured, centralized format" | Partly, with `guardmcp proxy` | Not a finding: `guardmcp proxy --log` *produces* a structured JSONL record of every message, which is a remediation rather than a detection. |
| Logs stored locally, deleted, or without integrity protection; retention policy; SIEM/XDR integration; alerting; identity fields in logs | **No** | These are properties of the logging pipeline behind the server. Neither the client config nor the MCP handshake describes them. |
| Behavioural baselines, drift detection (scenario 4) | **No** | Needs observation over time, not a snapshot. |

## MCP09 — Shadow MCP Servers

| OWASP checklist item / signal | Detectable? | How |
|---|---|---|
| "Agents invoking unknown or duplicate MCP endpoints" | **Yes, statically** | [MCPG-601](../rules/MCPG-601.md): a server configured machine-wide that the project's own config does not declare — it loads with the same reach, unreviewed. |
| Servers reachable from the network — the category's first reference measures MCP servers bound to `0.0.0.0` | **Yes, statically** | [MCPG-602](../rules/MCPG-602.md): a stdio entry that starts the server listening on every interface (`--host 0.0.0.0`, `HOST=::`, or a Docker port published without a host address). |
| "Default credentials, permissive configurations, or unsecured APIs" | Partly | Covered by other categories' rules where visible: hardcoded or low-quality credentials (MCPG-101/102), cleartext or unverified transport (MCPG-401/402), and — under `--live` — a remote endpoint that answers an unauthenticated client (MCPG-404). |
| "Unknown certificates or self-signed certs in network scans" | Partly | A config that disables certificate verification to accept one is MCPG-402. The certificate itself is not inspected. |
| No central registry; no discovery scanning across subnets; unauthorized services on unusual ports; anomalous outbound traffic | **No** | These require network discovery or an inventory of an organisation's hosts. A config scanner sees one machine's configs. `guardmcp inventory` lists what *this* machine has configured, which is an input to such a registry, not a replacement for it. |
| Governance workflow, approval, developer education | **No** | Process controls, not artefacts. |

## Why not map more rules to these categories

A mapping that stretches — tagging every transport finding as MCP09 because a shadow server *might* also have one — would make the coverage table look fuller while telling a reader nothing new. The rules above are mapped because the category text names their exact shape; everything else stays in the category where OWASP puts it.
