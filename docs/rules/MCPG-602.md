# MCPG-602 — MCP server launched listening on every network interface

**Severity:** Medium · **Confidence:** High (explicit address) / Medium (Docker default bind) · **Category:** Governance
**OWASP:** [MCP09 — Shadow MCP Servers](https://owasp.org/www-project-mcp-top-10/2025/MCP09-2025%E2%80%93Shadow-MCP-Servers)

## What it detects

A stdio server entry whose launch settings make the server listen on every network interface instead of loopback:

- **A listen-address flag set to an all-interfaces address** (high confidence): `--host`, `--hostname`, `--bind`, `--bind-address`, `--listen`, `--listen-address`, `--addr`, `--address` given `0.0.0.0`, `::`, `[::]` or `*`, with or without a `:port` — as `--host 0.0.0.0` or `--host=0.0.0.0`.
- **A listen-address environment variable** (high confidence): `HOST`, any `*_HOST` (`MCP_HOST`, `FASTMCP_HOST`, …), or a name containing `BIND` or `LISTEN`, set to one of those addresses. `HOSTNAME` is ignored — shells set it to the machine's name.
- **A Docker/Podman port published without a host address** (medium confidence): `-p 8080:8080` / `--publish 8080:8080`. Docker binds such a mapping on `0.0.0.0` unless the mapping names an address. `-p 0.0.0.0:8080:8080` is reported at high confidence; `-p 127.0.0.1:8080:8080` is not reported.

Remote (`url`) entries are out of scope here — an all-interfaces address in a URL is a destination, not a bind, and is reported by [MCPG-403](./MCPG-403.md).

## Why it matters

A stdio entry reads as "a process only my client talks to". A server started with `--host 0.0.0.0` is also a network service: anyone who can reach the machine — the office LAN, the café Wi-Fi, a container network — can reach it, and it acts with whatever credentials its `env` was given. Nothing in the client's view of the config says so.

OWASP MCP09 describes "unapproved or unsupervised deployments ... frequently using default credentials, permissive configurations, or unsecured APIs", and its first reference measures hundreds of MCP servers bound to `0.0.0.0` and reachable from outside. Most of MCP09 is about network-side discovery, which a config scanner cannot do. The bind address is the part that is decided in the config, before the endpoint exists.

## Example

```json
{
  "mcpServers": {
    "http-bridge": {
      "command": "uvx",
      "args": ["mcp-proxy@0.8.2", "--host", "0.0.0.0", "--port", "8080"]
    },
    "container": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-p", "3000:3000", "example/mcp-server:1.2.0"]
    }
  }
}
```

## Remediation

Bind to loopback: `--host 127.0.0.1`, `HOST=localhost`, and for containers `-p 127.0.0.1:3000:3000`. If the server really has to be reachable from other hosts, run it as a remote server behind authentication and TLS, registered and monitored like any other service, rather than as a local tool that happens to listen publicly.

## Limitations

- Only the flag and variable names above are recognised. A server with its own spelling (`--interface`, `SERVE_ON`) or one that binds `0.0.0.0` by default with no setting at all is not detected — the config says nothing about it.
- A host firewall may make an all-interfaces bind unreachable in practice; the rule cannot see that.
- The Docker case assumes Docker's default bind address; a daemon configured with a different `ip` default changes the answer, hence medium confidence.
