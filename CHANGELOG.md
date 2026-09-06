# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] — 2026-09-06

### Added

- **Full OWASP MCP Top 10 coverage — 10 of 10 categories.** The two remaining
  gaps now have rules:
  - **MCPG-701** (MCP08, Lack of Audit and Telemetry) — flags telemetry and
    logging kill switches in a committed server config: `OTEL_SDK_DISABLED`,
    `DO_NOT_TRACK`, `*_TELEMETRY_DISABLED`-shaped names, and `LOG_LEVEL` set
    to `off`/`silent`/`none`. This is OWASP's own second attack scenario for
    the category — "a developer disables telemetry during testing ... leaving
    no accountability trail" — caught at the point the silence is still cheap
    to undo. A switch set to a falsy value is correctly read as telemetry
    being *on* and is not reported.
  - **MCPG-601** (MCP09, Shadow MCP Servers) — flags a server configured
    machine-wide that the project's own config never declared. It loads into
    the same session as reviewed servers with the same reach, and nobody
    reading the repository can tell it is there. Reported at `low`: this is
    an inventory fact, not an exploit. Silent when no project config took
    part in the scan, so scanning a laptop with no project open does not turn
    every personal tool into a finding.
- `ScanTarget` now records its `scope` (`project` / `global` / `explicit`),
  and `ScanContext` carries `projectServers` — the set of servers the project
  actually declares. MCPG-601 is the first rule to need cross-config
  governance context; the CLI boundary builds it, rules stay pure.

### Notes

Both new rules document their limits in `docs/rules/`. MCPG-601 in particular
covers only the config-visible slice of MCP09 — OWASP's detection guidance for
that category is mostly network-side (unregistered hosts, unknown
certificates, anomalous egress), which a config scanner cannot see. A clean
result means "nothing unexpected in the configs on this machine", not "no
shadow servers exist".

## [0.3.0] — 2026-09-06

### Added

- **OWASP MCP Top 10 mapping.** Every rule now declares which
  [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/) categories it detects.
  8 of 10 categories are covered; MCP08 (Lack of Audit and Telemetry) and MCP09
  (Shadow MCP Servers) are reported as uncovered rather than omitted.
- **OWASP categories in SARIF**, three ways so different consumers can each read it:
  a first-class `taxonomies` component carrying all ten taxa, per-rule
  `relationships` (kind `superset`) addressing taxa by index, and
  `properties.tags` — which is what GitHub Code Scanning renders as filter chips.
  Output is still validated against the official SARIF 2.1.0 schema in CI.
- A generated OWASP coverage table in the README, checked by `npm run verify`
  so a rule added without regenerating fails the build.
- **The spec revision the mapping was drafted against is pinned** in the SARIF
  taxonomy (`taxonomies[0].properties.specCommit` / `.specSource`). "v0.1" does
  not identify a reading — the list is in pilot testing and moves under its own
  label, and independent tools have already produced numbering that does not
  line up ([OWASP/www-project-mcp-top-10#52](https://github.com/OWASP/www-project-mcp-top-10/issues/52)).
  A commit sha is immutable, so a reader who disagrees with a mapping can fetch
  the exact ten entry files it was built from.

### Fixed

- **The GitHub Action could not scan a path containing a space.** The `paths`
  input was split on any whitespace, so a workspace like
  `C:\...\Polly Lib\repo` was torn in half and the action exited 2 having
  scanned nothing. Affected self-hosted runners, Windows checkouts, and any
  path under `Program Files`; GitHub-hosted runners have no space in their
  workspace path, which is why CI never caught it. Paths now split on newlines
  and commas only.
- README stated "19 rules" in two places; the registries ship 17. The count is
  now asserted against the code by a test, as is the presence of every shipped
  rule id and every OWASP category in the coverage table.

### Security

- Cleared the outstanding npm advisories reachable from this package:
  `fast-uri` (SSRF, host confusion) and `qs` (DoS, array-limit bypass), both
  transitive through the MCP SDK's `express` dependency. `npm audit` is clean
  at every depth. An `esbuild` override was needed because tsup 8.5.1 still
  pins a version in the advisory range; it was not exploitable here — the
  advisory covers esbuild's dev server, which this project does not run.

## [0.2.1] — 2026-08-23

First published release: core scanner, 17 rules across five categories, live
introspection (`--live`), rug-pull pinning (`pin`), terminal/JSON/SARIF output,
and a GitHub Action.

[0.4.0]: https://github.com/BerkantACUN/guardmcp/releases/tag/v0.4.0
[0.3.0]: https://github.com/BerkantACUN/guardmcp/releases/tag/v0.3.0
[0.2.1]: https://github.com/BerkantACUN/guardmcp/releases/tag/v0.2.1
