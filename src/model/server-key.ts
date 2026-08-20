/**
 * Stable composite key identifying one server entry within a scan. A server
 * *name* alone isn't unique — the same name ("filesystem", say) can appear
 * in a project-level `.mcp.json` and in a user's global Claude Desktop
 * config at once. Used to key live-introspection results (src/live) and
 * `.mcpguard-lock.json` entries (src/pin) against the exact same
 * (config file, server name) pair.
 *
 * Normalizes to forward slashes — `relativePath` comes from Node's
 * `path.relative()`, which is backslash-separated on Windows. The
 * documented pin workflow is "pin locally, commit .mcpguard-lock.json, scan
 * in CI" (see README's Rug-pull pinning section); without this, pinning a
 * nested config (e.g. `.vscode/mcp.json`) on Windows and scanning the same
 * lock file on a Linux CI runner produces two different keys for the same
 * server, and the drift rules (MCPG-501/502) silently never fire for it —
 * no error, just quietly-missing coverage. Same fix `sarif.ts`'s
 * `toPosixPath()` already applies to the same underlying `relativePath` for
 * the same reason, centralized here instead of at every call site.
 */
export function serverKey(relativePath: string, serverName: string): string {
  return `${relativePath.replace(/\\/g, '/')}::${serverName}`;
}
