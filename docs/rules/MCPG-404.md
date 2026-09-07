# MCPG-404 — Remote MCP endpoint answered an unauthenticated client

**Severity:** Medium · **Confidence:** High · **Category:** Transport · **Requires:** `--live`
**OWASP:** [MCP07 — Insufficient Authentication & Authorization](https://owasp.org/www-project-mcp-top-10/2025/MCP07-2025%E2%80%93Insufficient-Authentication%26Authorization)

## What it detects

guardmcp connected to a remote server, sent **no credentials**, and the server **served its tool list anyway**.

That is an observation, not an inference. Anyone who can reach the URL can use the server.

## Why this rule was rewritten (and why it needs `--live`)

It used to read the config alone: a remote server with no `Authorization` header was reported as unauthenticated.

Measured against the [official MCP registry](https://registry.modelcontextprotocol.io) on 2026-09-07, that was **wrong two times in three**. Six advertised endpoints were probed with an `initialize` and no credentials:

| Endpoint | Result |
|---|---|
| api.inference.sh | **403 — enforces auth** |
| tandem.ac | **403 — enforces auth** |
| propick.ae | **403 — enforces auth** |
| mcp.goji.agency | **403 — enforces auth** |
| app.inside.ad | 200 — genuinely open |
| www.hood.ag | 200 — genuinely open |

Four of the six enforce access control **while carrying no static header**, because MCP's own authorization flow is OAuth: the client obtains a token at runtime and the config holds nothing.

Scanning 80 real registry servers with the old rule produced **40 findings, every one of them about a remote server, most of them wrong**. That is the shape of a rule people switch off.

A config file shows which credentials are *configured*. It cannot show what the far end *enforces*. So the rule no longer asks that question of a config — and under `--live` it does not have to guess.

## Behaviour

| Situation | Result |
|---|---|
| No `--live` | **silent** — no evidence is available |
| `--live`, connection refused (401/403) | **silent** — that is authentication working |
| `--live`, config carries credentials | **silent** — not an unauthenticated client |
| `--live`, connected with no credentials, tools listed | **finding**, high confidence |

## Remediation

If the endpoint is meant to be public, nothing needs fixing — **record that decision** so the next reviewer does not have to rediscover it.

Otherwise put it behind authentication: MCP supports an OAuth flow, or configure a static `Authorization`/API-key header for this server.

## Limitations

Only tells you the endpoint served *this* client. An endpoint may still rate-limit, restrict by IP, or authorise per-tool at call time — none of which is visible from a `tools/list` that succeeded. It also cannot see servers `--live` failed to reach for unrelated reasons; those are silent rather than assumed open.
