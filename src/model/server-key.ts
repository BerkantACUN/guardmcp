/**
 * Stable composite key identifying one server entry within a scan. A server
 * *name* alone isn't unique — the same name ("filesystem", say) can appear
 * in a project-level `.mcp.json` and in a user's global Claude Desktop
 * config at once. Used to key live-introspection results (src/live) and
 * `.mcpguard-lock.json` entries (src/pin) against the exact same
 * (config file, server name) pair.
 */
export function serverKey(relativePath: string, serverName: string): string {
  return `${relativePath}::${serverName}`;
}
