# Security Policy

guardmcp is a security tool. We hold ourselves to the same standard we ask of the ecosystem we scan.

## Reporting a Vulnerability

If you find a security issue in guardmcp itself (not a finding it reports about a *third-party* MCP server), please **do not open a public issue**. Instead:

1. Email the maintainer privately (see the GitHub profile for contact), or use [GitHub Security Advisories](https://github.com/BerkantACUN/guardmcp/security/advisories/new) for this repository.
2. Include: affected version, reproduction steps, and impact.
3. We aim to acknowledge within 72 hours and to ship a fix or mitigation before public disclosure.

## Responsible Disclosure for Findings About Third-Party Servers

guardmcp may surface real vulnerabilities in MCP servers you don't own (e.g. scanning a public repo or a server you depend on). If a scan finds something in a server you don't control:

- Report it to the server's maintainer first, privately, before posting results publicly.
- Give a reasonable remediation window (industry norm: 90 days) before public disclosure.
- guardmcp's own output (SARIF/JSON reports) redacts secret values — never paste unredacted findings into public issues, chats, or bug trackers.

## Scope Notes

- `guardmcp scan` (default) never executes code, never spawns the scanned MCP server, and never makes network requests on your behalf. It only reads config files.
- `guardmcp scan --live` connects to a real MCP server process to read its `tools/list` metadata. This is opt-in, always prints a warning, and never invokes a tool — see the README's threat model section for details on the isolation guarantees it does (and does not) provide.
