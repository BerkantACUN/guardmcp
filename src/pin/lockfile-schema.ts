import { z } from 'zod';

export const LOCK_FILE_VERSION = '1';

const LockedServerEntrySchema = z.object({
  /** Hash of the server's static launch definition (command/args or url) — see definition-hash.ts. */
  definitionHash: z.string(),
  /** Hash of the server's real advertised tools, present only when this
   * server was pinned with `--live` — see tools-hash.ts. */
  toolsHash: z.string().optional(),
});

/**
 * `.mcpguard-lock.json` — a snapshot of what `guardmcp pin` last saw for
 * each server, keyed by serverKey(relativePath, serverName) (see
 * model/server-key.ts) so the same server name in two different config
 * files pins independently. Compared against on every `scan` by the
 * rug-pull rules (src/rules/integrity) to catch a server silently changing
 * out from under a config that looks untouched.
 */
export const LockFileSchema = z.object({
  version: z.string(),
  generatedAt: z.string(),
  servers: z.record(z.string(), LockedServerEntrySchema),
});

export type LockedServerEntry = z.infer<typeof LockedServerEntrySchema>;
export type LockFile = z.infer<typeof LockFileSchema>;
