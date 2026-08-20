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
 */
export function computeDefinitionHash(def: McpServerDef): string {
  const hash = createHash('sha256');
  if (isStdioServerDef(def)) {
    hash.update('stdio\0');
    hash.update(def.command);
    hash.update('\0');
    hash.update((def.args ?? []).join('\0'));
    hash.update('\0');
    hash.update(
      Object.keys(def.env ?? {})
        .sort()
        .join('\0'),
    );
  } else if (isHttpServerDef(def)) {
    hash.update('http\0');
    hash.update(def.url);
    hash.update('\0');
    hash.update(
      Object.keys(def.headers ?? {})
        .sort()
        .join('\0'),
    );
  }
  return `sha256:${hash.digest('hex')}`;
}
