# MCPG-101 — Hardcoded secret in MCP server config

**Severity:** Critical · **Confidence:** High · **Category:** Secrets

## What it detects

A credential — GitHub token, Anthropic/OpenAI API key, AWS access key ID, Slack token, or JWT — written literally into an MCP server's `env` values or `args` list, instead of being referenced from an environment variable or secret manager.

MCP config files (`.mcp.json`, `.vscode/mcp.json`, and their per-client equivalents) are routinely committed to version control or shared between machines. A literal credential there is exposed to anyone with read access to the repo or the file — and once committed, git history keeps it even after the value is later removed.

## Example

```json
{
  "mcpServers": {
    "example": {
      "command": "npx",
      "args": ["-y", "some-mcp-server"],
      "env": {
        "GITHUB_TOKEN": "ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
      }
    }
  }
}
```

## Remediation

1. Move the value out of the config file into a real environment variable (`"env": {"GITHUB_TOKEN": "${GITHUB_TOKEN}"}` for clients that support variable expansion) or a secret manager reference.
2. **Rotate the exposed credential.** Once a secret has appeared in a config file — especially one that was ever committed — it must be treated as compromised, even if you remove it immediately.
3. If the file was committed to git, removing the value in a new commit is not enough; the secret remains in history. Use the credential provider's revocation flow rather than relying on history rewriting.

## What it does NOT catch (yet)

- Secrets referenced indirectly (e.g. read from a file path, or fetched from a remote config) — out of scope for static analysis.
- Secrets with a shape guardmcp doesn't recognize yet. MCPG-101 ships a narrow, high-confidence pattern set by design (see [the design rationale](https://github.com/BerkantACUN/AgentSpace/blob/master/docs/planning/mcp-guard-plan.md#41-mcpg-1xx--secret-ve-config-i%CC%87f%C5%9F%C4%B1) — precision over breadth for v1). A generic high-entropy-string heuristic (MCPG-102) is a separate, lower-confidence rule so this one's "high confidence" claim stays true.

## False positives

None known against the project's benign fixture corpus (`tests/fixtures/configs/benign/`), which is enforced in CI. If you hit one, please [open an issue](https://github.com/BerkantACUN/guardmcp/issues) with the (redacted) value's shape.
