import { createHash } from 'node:crypto';
import { isHttpServerDef, isStdioServerDef, type McpServerDef } from '../model/mcp-server-def.js';

/**
 * A stable hash of a server's STATIC launch definition — command/args for
 * stdio, url for remote — used to detect the cheapest rug-pull vector: an
 * MCP config silently edited to launch something different while the
 * server *name* the user recognizes stays the same.
 *
 * Deliberately excludes env/header VALUES: those legitimately vary (a
 * rotated API key, a per-machine path) without the server itself changing,
 * and hashing them would either bake secret material into a committed lock
 * file or flag routine rotation as false-positive drift. Env/header KEY
 * NAMES are included — a wholly new required variable appearing IS a
 * meaningful shape change worth flagging.
 *
 * Hashes a JSON-serialized canonical form rather than delimiter-joining raw
 * field values — see tools-hash.ts's doc comment for why a delimiter-join
 * scheme isn't collision-resistant against content that can contain the
 * delimiter. `command`/`args` are lower-risk here in practice (Node's
 * `spawn()` rejects embedded NUL bytes outright, so a config crafted to
 * exploit a NUL-based collision couldn't launch in the first place) — but
 * using the same robust serialization as tools-hash.ts costs nothing and
 * doesn't leave this function's safety resting on that indirect argument.
 */
export function computeDefinitionHash(def: McpServerDef): string {
  const hash = createHash('sha256');
  if (isStdioServerDef(def)) {
    hash.update(
      JSON.stringify({
        kind: 'stdio',
        command: def.command,
        args: def.args ?? [],
        envKeys: Object.keys(def.env ?? {}).sort(),
      }),
    );
  } else if (isHttpServerDef(def)) {
    hash.update(
      JSON.stringify({
        kind: 'http',
        url: def.url,
        headerKeys: Object.keys(def.headers ?? {}).sort(),
      }),
    );
  }
  return `sha256:${hash.digest('hex')}`;
}
