import type { JsoncDocument } from '../parsers/jsonc-document.js';
import type { McpConfigFile } from './mcp-server-def.js';

/**
 * One MCP config file, already parsed and validated. Rules operate purely on
 * this — no filesystem/network access inside a rule (see docs/planning
 * §5.3's "kurallar saf fonksiyondur" contract).
 */
/**
 * Where a config came from. Rules that reason about governance need this:
 * a server in the project's own config has been reviewed with the project,
 * one in the user's machine-wide config has not. 'explicit' means the user
 * named the file on the command line, so we cannot say which it is.
 */
export type ScanTargetScope = 'project' | 'global' | 'explicit';

export interface ScanTarget {
  readonly kind: 'config-file';
  readonly scope: ScanTargetScope;
  /** Absolute path — not used for display, only if a rule needs to re-read something. */
  readonly filePath: string;
  /** Path shown in reports; relative to the scan root so output isn't machine-specific. */
  readonly relativePath: string;
  readonly document: JsoncDocument;
  readonly config: McpConfigFile;
}
