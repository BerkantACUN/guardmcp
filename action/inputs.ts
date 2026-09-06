/**
 * Input parsing for the GitHub Action entrypoint, kept in its own module so
 * it is unit-testable — action/index.ts calls run() at import time, so a
 * test cannot import from it without executing the whole action.
 */

/**
 * Split a path list input.
 *
 * Newlines and commas only — deliberately NOT arbitrary whitespace. A file
 * path may legitimately contain a space ("C:\Users\a b\...", any Windows
 * "Program Files" layout, a self-hosted runner whose workspace has one), and
 * splitting on whitespace silently tore those in half and reported ENOENT on
 * the fragments. Newline-separated is also the GitHub Actions convention for
 * multi-value inputs, so a YAML block scalar works as written:
 *
 *   with:
 *     paths: |
 *       .mcp.json
 *       .vscode/mcp.json
 */
export function splitPaths(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Split a rule-id list input. Whitespace is a safe separator here in a way
 * it is not for paths: a rule id (`MCPG-101`) never contains one.
 */
export function splitIds(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
